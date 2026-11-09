import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const PDF_CONTENT_TYPE = 'application/pdf';
const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type JsonRecord = Record<string, unknown>;

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set to run the full-flow check.`);
  return value;
}

function positiveIntegerEnvironmentVariable(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return fallback;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive whole number.`);
  }
  return parsed;
}

function endpointUrl(path: string, baseUrl: URL): URL {
  const base = baseUrl.href.endsWith('/') ? baseUrl : new URL(`${baseUrl.href}/`);
  return new URL(path.replace(/^\/+/, ''), base);
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return { error: 'The server returned invalid JSON.' };
    }
  }

  const text = await response.text();
  return text ? text.slice(0, 1_000) : {};
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

async function requestJson(
  path: string,
  baseUrl: URL,
  init: RequestInit = {},
  expectedStatus?: number
): Promise<{ response: Response; body: JsonRecord }> {
  const response = await fetch(endpointUrl(path, baseUrl), {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000)
  });
  const body = asRecord(await readResponseBody(response));

  if (!response.ok || (expectedStatus !== undefined && response.status !== expectedStatus)) {
    throw new Error(`${init.method ?? 'GET'} ${path} failed (${response.status}): ${JSON.stringify(body)}`);
  }

  return { response, body };
}

function jsonRequest(method: string, body: JsonRecord, token?: string): RequestInit {
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  };
}

function requireString(record: JsonRecord, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${context} response did not include ${key}.`);
  }
  return value;
}

async function testFullFlow(): Promise<void> {
  const rawBaseUrl = process.env.TEST_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const baseUrl = new URL(rawBaseUrl);
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('TEST_BASE_URL must use HTTP or HTTPS.');
  }

  const email = requiredEnvironmentVariable('TEST_CLINICIAN_EMAIL');
  const password = requiredEnvironmentVariable('TEST_CLINICIAN_PASSWORD');
  const pollIntervalMs = positiveIntegerEnvironmentVariable('FULL_FLOW_POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS);
  const timeoutMs = positiveIntegerEnvironmentVariable('FULL_FLOW_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  const clientReference = `E2E-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

  console.log(`[Full-flow check] Target: ${baseUrl.origin}`);

  console.log('\n--- STEP 1: API health check ---');
  const { body: health } = await requestJson('health', baseUrl);
  if (health.status !== 'HEALTHY') {
    throw new Error(`API health check did not report HEALTHY: ${JSON.stringify(health)}`);
  }

  console.log('\n--- STEP 2: Clinician login ---');
  const { body: login } = await requestJson(
    'api/auth/login',
    baseUrl,
    jsonRequest('POST', { email, password })
  );
  const token = requireString(login, 'token', 'Login');
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
  console.log('Login successful.');

  console.log('\n--- STEP 3: Create synthetic assessment session ---');
  const { body: meetingResult } = await requestJson(
    'api/meetings',
    baseUrl,
    jsonRequest('POST', {
      clientReference,
      templateType: 'INITIAL_ASSESSMENT',
      sessionFormat: 'FACE_TO_FACE'
    }, token),
    201
  );
  const meeting = asRecord(meetingResult.meeting);
  const meetingId = requireString(meeting, 'id', 'Meeting creation');
  console.log(`Session created: ${clientReference}`);

  console.log('\n--- STEP 4: Record consent ---');
  const { body: consent } = await requestJson(
    'api/consent',
    baseUrl,
    jsonRequest('POST', {
      meetingId,
      consentGranted: true,
      consentVersion: 'full-flow-test-v1',
      policyVersion: 'full-flow-test-v1',
      participantRef: clientReference
    }, token),
    200
  );
  if (consent.consentGranted !== true || consent.consentStatus !== 'GRANTED') {
    throw new Error(`Consent was not recorded as granted: ${JSON.stringify(consent)}`);
  }

  console.log('\n--- STEP 5: Submit synthetic transcript ---');
  const transcriptText =
    'The client reports sitting in a standard wheelchair for six hours daily. ' +
    'They report bilateral lower back pain and pressure at the ischial tuberosities. ' +
    'Seat width measured at 44 centimetres and seat depth at 42 centimetres. ' +
    'The clinician recommends a high-density contoured foam cushion and pelvic support belt.';
  const { body: processResult } = await requestJson(
    'api/transcripts/process',
    baseUrl,
    jsonRequest('POST', {
      meetingId,
      transcriptText,
      clientRef: clientReference,
      templateType: 'INITIAL_ASSESSMENT',
      sessionFormat: 'FACE_TO_FACE'
    }, token),
    202
  );
  const jobId = requireString(processResult, 'jobId', 'Transcript submission');
  const pollPath = typeof processResult.pollUrl === 'string'
    ? processResult.pollUrl
    : `api/transcripts/job/${encodeURIComponent(jobId)}`;
  console.log(`Processing job started: ${jobId}`);

  console.log('\n--- STEP 6: Wait for documentation job ---');
  const deadline = Date.now() + timeoutMs;
  let job: JsonRecord | null = null;
  while (Date.now() < deadline) {
    const result = await requestJson(pollPath, baseUrl, { headers: authHeaders }, 200);
    job = result.body;
    const state = job.state;
    console.log(`Job state: ${String(state ?? 'missing')}; stage: ${String(job.stage ?? 'unknown')}`);

    if (state === 'SUCCEEDED' || state === 'FAILED' || state === 'CANCELLED') break;
    if (typeof state !== 'string') {
      throw new Error(`Job status response did not include a state: ${JSON.stringify(job)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, Math.max(0, deadline - Date.now()))));
  }

  if (!job || job.state !== 'SUCCEEDED') {
    const detail = job?.error ?? job?.lastError ?? (job ? `Job ended in state ${String(job.state)}.` : 'Timed out waiting for the job.');
    throw new Error(`Documentation job did not succeed: ${String(detail)}`);
  }
  const noteId = requireString(job, 'clinicalNoteId', 'Successful job');

  console.log('\n--- STEP 7: Load draft for clinician review ---');
  const { body: review } = await requestJson(
    `api/reviews/${encodeURIComponent(meetingId)}`,
    baseUrl,
    { headers: authHeaders }
  );
  const reviewNoteId = requireString(review, 'noteId', 'Review draft');
  if (reviewNoteId !== noteId) {
    throw new Error(`Review returned note ${reviewNoteId}, but the job created ${noteId}.`);
  }
  const narrative = asRecord(review.narrative);
  const sections = Array.isArray(narrative.sections) ? narrative.sections : [];
  console.log(`Draft loaded: ${sections.length} narrative sections; status ${String(review.status ?? 'unknown')}.`);

  console.log('\n--- STEP 8: Approve the synthetic review draft ---');
  const { body: approval } = await requestJson(
    'api/reviews/approve',
    baseUrl,
    jsonRequest('POST', { meetingId, approvedBy: email, attested: true }, token)
  );
  if (approval.status !== 'APPROVED') {
    throw new Error(`Approval did not return APPROVED: ${JSON.stringify(approval)}`);
  }

  console.log('\n--- STEP 9: Export PDF ---');
  const pdfResponse = await fetch(endpointUrl(`api/documents/${encodeURIComponent(noteId)}/pdf`, baseUrl), {
    headers: authHeaders,
    signal: AbortSignal.timeout(30_000)
  });
  if (!pdfResponse.ok) {
    throw new Error(`PDF export failed (${pdfResponse.status}): ${String(await readResponseBody(pdfResponse))}`);
  }
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  if (!pdfResponse.headers.get('content-type')?.includes(PDF_CONTENT_TYPE) || pdf.length === 0 || pdf.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('PDF export returned an invalid content type or file signature.');
  }
  console.log(`PDF export succeeded (${pdf.length} bytes).`);

  console.log('\n--- STEP 10: Export DOCX ---');
  const docxResponse = await fetch(endpointUrl(`api/documents/${encodeURIComponent(noteId)}/docx`, baseUrl), {
    headers: authHeaders,
    signal: AbortSignal.timeout(30_000)
  });
  if (!docxResponse.ok) {
    throw new Error(`DOCX export failed (${docxResponse.status}): ${String(await readResponseBody(docxResponse))}`);
  }
  const docx = Buffer.from(await docxResponse.arrayBuffer());
  if (!docxResponse.headers.get('content-type')?.includes(DOCX_CONTENT_TYPE) || docx.length === 0 || docx[0] !== 0x50 || docx[1] !== 0x4b) {
    throw new Error('DOCX export returned an invalid content type or file signature.');
  }
  console.log(`DOCX export succeeded (${docx.length} bytes).`);

  console.log('\nAll 10 full-flow steps passed.');
}

testFullFlow().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\nFULL-FLOW CHECK FAILED:', message);
  process.exitCode = 1;
});
