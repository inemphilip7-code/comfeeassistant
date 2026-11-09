export const MIN_TRANSCRIPT_CHARACTERS = 40;

export function transcriptLength(text: string): number {
  return text.trim().length;
}

export function transcriptMeetsMinimum(text: string): boolean {
  return transcriptLength(text) >= MIN_TRANSCRIPT_CHARACTERS;
}

export function transcriptMinimumMessage(text: string): string {
  const length = transcriptLength(text);
  if (length === 0) {
    return 'No transcript was captured. Continue listening, enter consultation notes, or load the demo sample.';
  }
  return `Only ${length} characters were captured. At least ${MIN_TRANSCRIPT_CHARACTERS} characters are needed. Continue listening or add more consultation notes.`;
}
