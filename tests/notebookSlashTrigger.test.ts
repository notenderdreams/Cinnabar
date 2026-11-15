import { expect, test } from 'bun:test';
import { slashTrigger } from '../packages/notebook/src/slashTrigger';

test('slash commands work after existing text without consuming the prefix', () => {
  expect(slashTrigger('/split', 7)).toEqual({ from: 1, to: 7, query: 'split' });
  expect(slashTrigger('Existing notes /split', 22)).toEqual({ from: 16, to: 22, query: 'split' });
  expect(slashTrigger('Existing notes /vertical split', 31)).toEqual({
    from: 16,
    to: 31,
    query: 'vertical split',
  });
  expect(slashTrigger('https://example.com/split', 25)).toBeNull();
  expect(slashTrigger('word/split', 11)).toBeNull();
});
