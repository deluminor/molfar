/** Whether `text` has anything to read beyond whitespace and punctuation. */
export function hasReadableText(text: string): boolean {
  return /[^\s\p{P}]/u.test(text);
}
