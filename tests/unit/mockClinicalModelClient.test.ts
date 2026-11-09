import { ClinicalExtractionEngine } from '../../src/clinical/extractionEngine';
import { buildNarrative } from '../../src/clinical/narrative';
import { env } from '../../src/config/env';
import { MockClinicalModelClient } from '../../src/providers/llm/MockClinicalModelClient';
import { getClinicalModelClient, setClinicalModelClient } from '../../src/providers/llm/modelClient';

describe('MockClinicalModelClient', () => {
  it('is selected for development mock mode and rejected in production', () => {
    const originalProvider = env.LLM_PROVIDER;
    const originalNodeEnv = env.NODE_ENV;
    try {
      env.LLM_PROVIDER = 'mock';
      env.NODE_ENV = 'test';
      setClinicalModelClient(null);
      expect(getClinicalModelClient().name).toBe('rule-based-mock');

      setClinicalModelClient(null);
      env.NODE_ENV = 'production';
      expect(() => getClinicalModelClient()).toThrow(/cannot use the mock provider in production/i);
    } finally {
      setClinicalModelClient(null);
      env.LLM_PROVIDER = originalProvider;
      env.NODE_ENV = originalNodeEnv;
    }
  });

  it('generates a reviewable, grounded draft without an external model key', async () => {
    const transcript =
      'The client reports lower back pain after sitting. Seat width measured at 44 centimetres. ' +
      'The clinician recommends a contoured cushion.';
    const engine = new ClinicalExtractionEngine(new MockClinicalModelClient());

    const result = await engine.extract(transcript);
    const narrative = buildNarrative(result.extraction);
    const entries = narrative.sections.flatMap((section) => section.entries);

    expect(result.extraction.facts).toHaveLength(3);
    expect(result.extraction.facts.map((fact) => fact.source_quote)).toEqual([
      'The client reports lower back pain after sitting.',
      'Seat width measured at 44 centimetres.',
      'The clinician recommends a contoured cushion.'
    ]);
    expect(result.extraction.facts.every((fact) => fact.source_type === 'UNKNOWN')).toBe(true);
    expect(result.extraction.facts.every((fact) => fact.requires_review)).toBe(true);
    expect(result.extraction.review_flags[0].description).toMatch(/not an AI model/i);
    for (const quote of result.extraction.facts.map((fact) => fact.source_quote)) {
      expect(entries.some((entry) => entry.text.startsWith(quote))).toBe(true);
    }
  });
});
