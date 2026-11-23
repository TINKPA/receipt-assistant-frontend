/** The backend's limit (`UPLOADER_NOTE_MAX_CHARS`, receipt-assistant#289),
 *  counted in characters. The server trims, and treats blank as none. */
export const UPLOADER_NOTE_MAX_CHARS = 2000;

export const UPLOADER_NOTE_PLACEHOLDER =
  'What is this? e.g. reimbursement from my employer, same payment as the PayPal email';

/** A note as the API should receive it: trimmed, and `undefined` when blank,
 *  so an empty field sends no `note` at all. */
export function noteToSend(note: string): string | undefined {
  const t = note.trim();
  return t === '' ? undefined : t;
}

export function noteTooLong(note: string): boolean {
  return [...note.trim()].length > UPLOADER_NOTE_MAX_CHARS;
}
