import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiResponseRenderer } from '../src/components/AiResponseRenderer';
import { normalizeAiResponseMarkdown } from '../src/utils/aiResponseMarkdown';

describe('normalizeAiResponseMarkdown', () => {
  test('keeps prose after a display formula out of the math block', () => {
    const response = String.raw`## Definition: Shallow Work

$$\begin{cases}
\text{Cognitive Demand:} & \text{Low / Logistical} \\
\text{Work State:} & \text{Often performed while distracted}
\end{cases}$$

* **Examples:** Replying to routine emails.

### The Human Network Router Trap

Professionals shuttle information.`;
    const html = renderToStaticMarkup(React.createElement(AiResponseRenderer, { response }));
    expect(html).toContain('class="katex-display"');
    expect(html).toContain('<ul>');
    expect(html).toContain('<h3>The Human Network Router Trap</h3>');
    expect(html).not.toContain('katex-error');
  });

  test('normalizes inline and display LaTeX delimiters', () => {
    const source = String.raw`Mean \(\mu_X\) and density \[f_X(x)=e^{-x}\].`;
    expect(normalizeAiResponseMarkdown(source)).toBe('Mean $\\mu_X$ and density \n$$\nf_X(x)=e^{-x}\n$$\n.');
  });

  test('separates same-line display math from following Markdown', () => {
    const response = String.raw`Formula: $$x^2$$ * **Examples:** Squares.

### Next section`;
    const html = renderToStaticMarkup(React.createElement(AiResponseRenderer, { response }));
    expect(html).toContain('class="katex-display"');
    expect(html).toContain('<ul>');
    expect(html).toContain('<h3>Next section</h3>');
  });

  test('contains invalid LaTeX without swallowing subsequent prose', () => {
    const response = String.raw`$$\frac{
$$

### Still readable

- A normal list.`;
    const html = renderToStaticMarkup(React.createElement(AiResponseRenderer, { response }));
    expect(html).toContain('katex-error');
    expect(html).toContain('<h3>Still readable</h3>');
    expect(html).toContain('<ul>');
  });

  test('preserves dollar delimiters in code and separate formulas', () => {
    const source = 'Use `$$x$$`.\n\n```tex\n$$y$$\n```\n\n$$a$$\n\n$$b$$';
    const normalized = normalizeAiResponseMarkdown(source);
    expect(normalized).toContain('`$$x$$`');
    expect(normalized).toContain('```tex\n$$y$$\n```');
    expect(normalized).toContain('$$\na\n$$');
    expect(normalized).toContain('$$\nb\n$$');
  });

  test('unwraps nested \\boxed{\\boxed{...}} and renders ChatGPT bracket math', () => {
    const source = `# Final answer

[
\\boxed{\\boxed{117\\text{ cars}}}
]`;
    const normalized = normalizeAiResponseMarkdown(source);
    expect(normalized).toContain('$$\n\\boxed{117\\text{ cars}}\n$$');
    expect(normalized).not.toContain('\\boxed{\\boxed');

    const html = renderToStaticMarkup(React.createElement(AiResponseRenderer, { response: source }));
    expect(html).toContain('class="katex-display"');
    expect(html).toContain('117');
    expect(html).toContain('cars');
  });

  test('renders model Markdown as lists and accessible KaTeX markup', () => {
    const response = String.raw`This defines a Gaussian.

\[f_X(x)=\frac{1}{\sqrt{2\pi}}e^{-x^2/2}.\]

- \(\mu_X\) is the mean.
- \(C_X\) is the covariance matrix.`;
    const html = renderToStaticMarkup(React.createElement(AiResponseRenderer, { response }));

    expect(html).toContain('class="katex-display"');
    expect(html).toContain('<math');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
  });

  test('does not rewrite delimiters inside inline or fenced code', () => {
    const source = 'Use \\(x\\), not `\\(code\\)`.\n\n```tex\n\\[code block\\]\n```';
    const normalized = normalizeAiResponseMarkdown(source);
    expect(normalized).toContain('Use $x$');
    expect(normalized).toContain('`\\(code\\)`');
    expect(normalized).toContain(String.raw`\[code block\]`);
  });
});
