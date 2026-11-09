import { ModelClient } from '../../clinical/extractionEngine';
import { TRANSCRIPT_CLOSE, TRANSCRIPT_OPEN } from '../../clinical/extractionPrompt';
import { SECTION_IDS, StructuredExtraction } from '../../clinical/provenance';

/**
 * Deterministic, development-only adapter for the clinical extraction pipeline.
 *
 * It does not summarise, infer a speaker, or make clinical decisions. Each sentence is
 * copied verbatim into a broadly matched section, marked uncertain, and surfaced for review.
 * Production must use a configured clinical model instead.
 */
export class MockClinicalModelClient implements ModelClient {
  readonly name = 'rule-based-mock';

  async generate(_systemInstruction: string, userContent: string): Promise<string> {
    const transcriptStart = userContent.indexOf(TRANSCRIPT_OPEN);
    const transcriptEnd = userContent.indexOf(TRANSCRIPT_CLOSE, transcriptStart + TRANSCRIPT_OPEN.length);
    if (transcriptStart < 0 || transcriptEnd < 0) {
      throw new Error('Mock clinical extraction could not find the delimited transcript.');
    }

    const transcript = userContent
      .slice(transcriptStart + TRANSCRIPT_OPEN.length, transcriptEnd)
      .trim();
    const sentences = transcript
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    const usedSections = new Set<string>();

    const facts = sentences.map((sentence, index) => {
      const sectionId = this.sectionFor(sentence);
      usedSections.add(sectionId);

      return {
        section_id: sectionId,
        field_id: `mock_statement_${index + 1}`,
        value: sentence,
        source_type: 'UNKNOWN' as const,
        certainty: 'UNCERTAIN' as const,
        laterality: 'UNSPECIFIED' as const,
        source_quote: sentence,
        assessment_status: 'REQUIRES_CLARIFICATION' as const,
        requires_review: true,
        review_reason: 'Deterministic mock output. Verify the wording and section against the transcript.',
        clinician_approved: false
      };
    });

    const extraction: StructuredExtraction = {
      facts,
      review_flags: [
        {
          flag_type: 'OTHER',
          description: 'This draft was produced by the deterministic mock provider, not an AI model. Verify every statement before use.',
          section_id: null,
          source_quotes: [],
          resolved: false
        }
      ],
      sections_not_discussed: SECTION_IDS.filter((sectionId) => !usedSections.has(sectionId))
    };

    return JSON.stringify(extraction);
  }

  private sectionFor(sentence: string): string {
    if (/\b(pain|ache|sore|hurts?|pressure|discomfort)\b/i.test(sentence)) return 'pain';
    if (/\b(skin|pressure sore|pressure injury|ulcer|wound|redness)\b/i.test(sentence)) return 'skin_pressure';
    if (/\b(seat width|seat depth|measurement|centimet(?:re|er)s?|\d+(?:\.\d+)?\s*(?:cm|mm|inches|degrees))\b/i.test(sentence)) {
      return 'wheelchair_measurements';
    }
    if (/\b(transfer|hoist|sling|upper[- ]limb)\b/i.test(sentence)) return 'transfers_upper_limb';
    if (/\b(fall|walking|walks?|mobility|fatigue|tired)\b/i.test(sentence)) return 'mobility_walking_falls';
    if (/\b(goal|would like|wants? to|hopes? to|priority)\b/i.test(sentence)) return 'goals_intended_use';
    if (/\b(wheelchair|cushion|backrest|seat|footplate)\b/i.test(sentence)) return 'current_equipment_routine';
    if (/\b(home|doorway|ramp|steps?|transport|taxi|car|bus)\b/i.test(sentence)) return 'home_environment';
    return 'additional_notes';
  }
}
