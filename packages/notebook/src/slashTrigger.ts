/** Slash commands may follow text, but never consume that text or match a URL. */
export function slashTrigger(before: string, cursor: number) {
  const match = /(?:^|\s)\/([^/\n]*)$/.exec(before);
  return match ? { from: cursor - match[1].length - 1, to: cursor, query: match[1] } : null;
}
