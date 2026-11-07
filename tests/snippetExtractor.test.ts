import { describe, expect, test } from 'bun:test';
import type { SnippetEntry } from '../src/lib/types/index';
import { computeStitchLayout, stitchSnippetsToCanvas } from '../src/lib/snippets/snippetExtractor';

describe('computeStitchLayout', () => {
  test('calculates correct dimensions for snippets and dividers', () => {
    const dummyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const mockSnippets: SnippetEntry[] = [
      {
        id: 'snip_1',
        type: 'image',
        pageNumber: 1,
        dataUrl: dummyPng,
        width: 400,
        height: 200,
        aspectRatio: 2.0,
        createdAt: 1000,
        label: 'Page 1',
      },
      {
        id: 'div_1',
        type: 'divider',
        label: 'Section Analysis',
        style: 'solid',
        createdAt: 2000,
      },
      {
        id: 'snip_2',
        type: 'image',
        pageNumber: 2,
        dataUrl: dummyPng,
        width: 500,
        height: 300,
        aspectRatio: 1.66,
        createdAt: 3000,
        label: 'Page 2',
      },
    ];

    const layout = computeStitchLayout(mockSnippets, {
      padding: 20,
      gap: 10,
    });

    expect(layout.canvasWidth).toBeGreaterThanOrEqual(640 + 40);
    expect(layout.canvasHeight).toBeGreaterThan(500);
    expect(layout.items.length).toBe(3);
    expect(layout.items[0].entry.type).toBe('image');
    expect(layout.items[1].entry.type).toBe('divider');
    expect(layout.items[2].entry.type).toBe('image');
  });

  test('returns null gracefully when DOM is unavailable', async () => {
    const canvas = await stitchSnippetsToCanvas([]);
    expect(canvas).toBeNull();
  });
});

describe('Snippet Undo/Redo History Logic', () => {
  class HistoryStack<T> {
    private history: T[][] = [];
    private index: number = -1;
    public state: T[] = [];

    constructor(initial: T[] = []) {
      this.state = initial;
      this.history = [initial];
      this.index = 0;
    }

    get canUndo() {
      return this.index > 0;
    }

    get canRedo() {
      return this.index < this.history.length - 1;
    }

    push(next: T[]) {
      const sliced = this.history.slice(0, this.index + 1);
      this.history = [...sliced, next];
      this.index = this.history.length - 1;
      this.state = next;
    }

    undo() {
      if (this.index > 0) {
        this.index--;
        this.state = this.history[this.index];
      }
    }

    redo() {
      if (this.index < this.history.length - 1) {
        this.index++;
        this.state = this.history[this.index];
      }
    }
  }

  test('tracks additions, undos, redos, and clearing', () => {
    const stack = new HistoryStack<SnippetEntry>([]);
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);

    const snip1: SnippetEntry = {
      id: 'snip_1',
      type: 'image',
      pageNumber: 1,
      dataUrl: 'data:image/png;base64,x',
      width: 100,
      height: 100,
      aspectRatio: 1,
      createdAt: 100,
    };

    stack.push([snip1]);
    expect(stack.canUndo).toBe(true);
    expect(stack.state.length).toBe(1);

    // Add divider
    const div1: SnippetEntry = {
      id: 'div_1',
      type: 'divider',
      label: 'Notes',
      createdAt: 200,
    };
    stack.push([snip1, div1]);
    expect(stack.state.length).toBe(2);

    // Undo divider
    stack.undo();
    expect(stack.state.length).toBe(1);
    expect(stack.state[0].id).toBe('snip_1');
    expect(stack.canRedo).toBe(true);

    // Redo divider
    stack.redo();
    expect(stack.state.length).toBe(2);
    expect(stack.state[1].id).toBe('div_1');

    // Clear all
    stack.push([]);
    expect(stack.state.length).toBe(0);

    // Undo clear
    stack.undo();
    expect(stack.state.length).toBe(2);
  });
});
