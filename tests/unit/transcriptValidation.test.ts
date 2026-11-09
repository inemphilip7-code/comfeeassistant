import {
  MIN_TRANSCRIPT_CHARACTERS,
  transcriptLength,
  transcriptMeetsMinimum,
  transcriptMinimumMessage
} from '../../frontend/src/services/transcriptValidation';

describe('transcript submission minimum', () => {
  it('matches the API requirement and counts trimmed text', () => {
    expect(MIN_TRANSCRIPT_CHARACTERS).toBe(40);
    expect(transcriptLength(`  ${'x'.repeat(39)}  `)).toBe(39);
    expect(transcriptMeetsMinimum('x'.repeat(39))).toBe(false);
    expect(transcriptMeetsMinimum('x'.repeat(40))).toBe(true);
  });

  it('explains how to continue when the capture is empty or too short', () => {
    expect(transcriptMinimumMessage('')).toMatch(/no transcript was captured/i);
    expect(transcriptMinimumMessage('short')).toMatch(/at least 40 characters/i);
  });
});
