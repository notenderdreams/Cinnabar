export interface BlockDropCandidate {
  from: number;
  to: number;
  top: number;
  bottom: number;
  left: number;
  width: number;
  before: boolean;
  after: boolean;
}

/** Choose a structural boundary by height, including whitespace and the gutter. */
export function chooseDropSlot(
  candidates: BlockDropCandidate[],
  y: number,
  from: number,
  to: number,
) {
  const slots = candidates.flatMap((block) => [
    ...(block.before
      ? [{ pos: block.from, top: block.top, left: block.left, width: block.width }]
      : []),
    ...(block.after
      ? [{ pos: block.to, top: block.bottom, left: block.left, width: block.width }]
      : []),
  ]);
  const closest = slots.reduce<(typeof slots)[number] | null>(
    (nearest, slot) =>
      !nearest || Math.abs(slot.top - y) < Math.abs(nearest.top - y) ? slot : nearest,
    null,
  );
  return closest && (closest.pos < from || closest.pos > to) ? closest : null;
}
