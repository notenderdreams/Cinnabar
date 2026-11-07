/**
 * Converts markdown and LaTeX math formatting commonly emitted by LLMs (ChatGPT, Claude, DeepSeek, Codex)
 * into remark-math / KaTeX compatible syntax without corrupting code blocks.
 */
export function normalizeAiResponseMarkdown(markdown: string): string {
  if (!markdown) return '';

  // Normalize line endings
  const cleanMarkdown = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const protectedCode = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

  return cleanMarkdown
    .split(protectedCode)
    .map((part, index) => {
      // Preserve fenced code and inline code blocks exactly as-is
      if (index % 2 === 1) return part;

      let text = part;

      // 1. Unwrap nested \boxed{\boxed{...}} -> \boxed{...} (KaTeX does not support nested \boxed)
      while (/\\boxed\s*\{\s*\\boxed\s*\{/.test(text)) {
        text = text.replace(/\\boxed\s*\{\s*\\boxed\s*\{([\s\S]*?)\}\s*\}/g, (_, inner) => `\\boxed{${inner}}`);
      }

      // 2. Replace ChatGPT ASCII double-underline artifact lines (e.g. `400-3n \n ====== \n ...`) with `=`
      text = text.replace(/(?:^|\n)[ \t]*={3,}[ \t]*(?=\n|$)/g, '\n=\n');

      // 3. Convert standard LaTeX block delimiters \[ ... \] to $$ ... $$
      text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n$$\n${math.trim()}\n$$\n`);

      // 4. Convert ChatGPT-style multiline display brackets:
      //    [
      //    \text{formula}
      //    ]
      //    to $$ \text{formula} $$
      text = text.replace(/(?:^|\n)[ \t]*\[[ \t]*\n([\s\S]*?)\n[ \t]*\][ \t]*(?=\n|$)/g, (_, math) => {
        return `\n$$\n${math.trim()}\n$$\n`;
      });

      // 5. Convert single-line bracket math expressions:
      //    [ formula ] on its own line (e.g. [ 420-400\geq0 ] or [ \mu_Y=3n-400 ])
      text = text.replace(/(?:^|\n)[ \t]*\[[ \t]*([^\n\[\]]+?)[ \t]*\][ \t]*(?=\n|$)/g, (full, math) => {
        const trimmed = math.trim();
        // Ignore markdown checkbox syntax like [ ] or [x]
        if (trimmed === '' || trimmed.toLowerCase() === 'x' || trimmed.toLowerCase() === 'v') {
          return full;
        }
        // If it contains LaTeX commands or mathematical relations, treat as display math
        if (/\\[a-zA-Z]+|[=+\-<>_^\\]|E\[|P\(|Var\(|SD\(|\sim|\approx|\geq|\leq/.test(trimmed)) {
          return `\n$$\n${trimmed}\n$$\n`;
        }
        return full;
      });

      // 6. Convert standard LaTeX inline delimiters \( ... \) to $ ... $
      text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math.trim()}$`);

      // 7. Standalone \boxed{...} lines outside math blocks
      text = text.split(/(\$\$[\s\S]*?\$\$)/g).map((segment, mathIndex) => {
        if (mathIndex % 2 === 1) return segment;
        return segment.replace(/(?:^|\n)[ \t]*(\\boxed\{[\s\S]*?\})[ \t]*(?=\n|$)/g, (_, math) => {
          return `\n$$\n${math.trim()}\n$$\n`;
        });
      }).join('');

      // remark-math requires display fences on their own lines. Otherwise the
      // formula can become fence metadata and the following prose stays in math.
      text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, math: string, offset: number, source: string) => {
        const before = offset > 0 && source[offset - 1] !== '\n' ? '\n' : '';
        const after = source[offset + match.length] === '\n' ? '' : '\n';
        return `${before}$$\n${math.trim()}\n$$${after}`;
      });

      return text;
    })
    .join('');
}
