import { describe, expect, test } from 'bun:test';
import { paginateNotebookMarkdown } from '../src/lib/ai/notebookMarkdown';

describe('formatted notebook pagination', () => {
  test('uses remaining space below an image before continuing a long list', () => {
    const text = '# Title\n\n![](notebook-image/test)\n\n## Details\n\n' + Array.from({ length: 12 }, (_, index) => `- Item ${index + 1}`).join('\n');
    const pages = paginateNotebookMarkdown(text, (markdown) => markdown.split('\n').length * 20, 240);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]).toContain('Item 1');
    expect(pages.join('\n')).toContain('Item 12');
  });
  test('preserves rich Markdown and keeps headings with their first paragraph', () => {
    const markdown = '# Material notes\n\nA **short overview**.\n\n## Albedo\n\nBase color controls the material.\n\n## Color space\n\nUse *sRGB* for color textures.';
    const measure = (text: string) => text.split('\n').length * 30;
    const pages = paginateNotebookMarkdown(markdown, measure, 240);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join('\n')).toContain('**short overview**');
    expect(pages.join('\n')).toContain('*sRGB*');
    expect(pages.every((page) => !/^#{1,6} .+$/m.test(page.split('\n').at(-1) ?? ''))).toBe(true);
    expect(pages.every((page) => measure(page) <= 240)).toBe(true);
  });

  test('splits long lists with correct numbering and tables with repeated headers', () => {
    const list = Array.from({ length: 20 }, (_, index) => `${index + 1}. Step ${index + 1}`).join('\n');
    const pages = paginateNotebookMarkdown(list, (text) => text.split('\n').length * 30, 180);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join('\n')).toContain('20. Step 20');
    const table = '| Channel | Setting |\n| --- | --- |\n' + Array.from({ length: 15 }, (_, index) => `| Material ${index} | sRGB |`).join('\n');
    const tables = paginateNotebookMarkdown(table, (text) => text.split('\n').length * 25, 200);
    expect(tables.length).toBeGreaterThan(1);
    expect(tables.every((page) => page.includes('Channel') && page.includes('Setting'))).toBe(true);
    for (let index = 0; index < 15; index++) expect(tables.join('\n')).toContain(`Material ${index}`);
  });

  test('keeps code fences and emphasis valid across page breaks', () => {
    const code = '```ts\n' + 'const channel = "albedo";\n'.repeat(80) + '```';
    const pages = paginateNotebookMarkdown(code, (text) => Math.ceil(text.length / 60) * 20, 240);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => (page.match(/^```/gm) ?? []).length === 2)).toBe(true);
    const bold = paginateNotebookMarkdown(`**${'Important concept '.repeat(100).trim()}**`, (text) => Math.ceil(text.length / 60) * 20, 240);
    expect(bold.every((page) => page.startsWith('**') && page.endsWith('**'))).toBe(true);
  });
});
