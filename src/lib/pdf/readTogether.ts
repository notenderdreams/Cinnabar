export function getReadTogetherPageRows(
  primaryPageCount: number,
  companionPageCount: number
): number[] {
  const rowCount = Math.max(0, Math.floor(primaryPageCount), Math.floor(companionPageCount));
  return Array.from({ length: rowCount }, (_, index) => index + 1);
}
