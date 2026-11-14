import { expect, test } from 'bun:test';
import {
  chooseDropSlot,
  type BlockDropCandidate,
} from '../packages/notebook/src/blockDragGeometry';

const block = (from: number, to: number, top: number, bottom: number): BlockDropCandidate => ({
  from,
  to,
  top,
  bottom,
  left: 80,
  width: 500,
  before: true,
  after: true,
});

test('gutter drop boundaries respect variable block heights and gaps', () => {
  const blocks = [block(0, 8, 20, 40), block(18, 28, 130, 430), block(28, 38, 450, 480)];
  expect(chooseDropSlot(blocks, 21, 8, 18)?.pos).toBe(0);
  expect(chooseDropSlot(blocks, 420, 8, 18)?.pos).toBe(28);
  expect(chooseDropSlot(blocks, 900, 8, 18)?.pos).toBe(38);
  expect(chooseDropSlot(blocks, -30, 8, 18)?.pos).toBe(0);
});

test('dropping at the existing position is a no-op, rather than jumping past a neighbor', () => {
  const blocks = [block(0, 8, 20, 40), block(18, 28, 130, 430)];
  expect(chooseDropSlot(blocks, 45, 8, 18)).toBeNull();
  expect(chooseDropSlot(blocks, 120, 8, 18)).toBeNull();
  expect(chooseDropSlot([], 50, 0, 8)).toBeNull();
});

test('restricted container boundaries cannot receive invalid block types', () => {
  const candidate = { ...block(2, 10, 10, 50), before: false, after: false };
  expect(chooseDropSlot([candidate], 10, 20, 30)).toBeNull();
});
