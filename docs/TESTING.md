# Vabatim Testing & Verification Architecture

## Test Suite Execution
```bash
# 1. Typecheck
npm run typecheck

# 2. Unit & Integration Tests (Jest)
npm run test

# 3. AI Evaluation Benchmark Harness
npm run eval
```

## Full API Flow Check

`npm run test:full-flow` exercises login, session creation, consent, transcript submission,
job polling, draft review, clinician approval, and PDF/DOCX export against a running API.
It uses a synthetic client reference and defaults to `http://localhost:3000`; it never
targets a hosted service unless `TEST_BASE_URL` is explicitly set.

Create a local root `.env` file (ignored by Git) with a dedicated synthetic test account:

```env
TEST_BASE_URL=https://your-render-service.onrender.com
TEST_CLINICIAN_EMAIL=your-test-account@example.com
TEST_CLINICIAN_PASSWORD=your-local-test-password
```

Do not use a real clinician account or patient data. The check creates and approves a
synthetic note in the target database, then downloads its PDF and DOCX. The API must have a
working clinical language model configured, because the check expects a reviewable note.
Optional `FULL_FLOW_TIMEOUT_MS` and `FULL_FLOW_POLL_INTERVAL_MS` settings control job
polling.

## Coverage Summary
- **Unit Tests**: Meeting state machine transitions, Deterministic Grounding Validator edge cases.
- **Integration Tests**: Health endpoints, Authentication, RBAC, Meeting creation, Tenant isolation.
- **AI Evaluation Suite**: Multi-speaker synthetic fixtures measuring evidence grounding precision and unsupported claim rates.
