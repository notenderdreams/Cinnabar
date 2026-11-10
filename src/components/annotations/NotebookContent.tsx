import ReactMarkdown from 'react-markdown';
import { memo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { openExternalUrl } from '../../utils/tauriBridge';

/** Paper typography shared by the editor, page measurement, and image/PDF export. */
export const NotebookContent = memo(function NotebookContent({ text }: { text: string }) {
  return <div className="notebook-document">
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]} skipHtml
      components={{
        a: ({ href, children }) => <a href={href} onClick={(event) => {
          event.preventDefault();
          if (href) void openExternalUrl(href);
        }}>{children}</a>,
        img: ({ alt }) => <span className="notebook-image-caption">{alt || 'Image reference'}</span>,
      }}>{text}</ReactMarkdown>
  </div>;
});
