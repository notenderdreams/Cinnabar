import ReactMarkdown from 'react-markdown';
import { memo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { openExternalUrl } from '../../utils/tauriBridge';
import type { NotebookImageAsset } from '../../lib/types';

/** Paper typography shared by the editor, page measurement, and image/PDF export. */
export const NotebookContent = memo(function NotebookContent({ text, images }: { text: string; images?: Record<string, NotebookImageAsset> }) {
  return <div className="notebook-document">
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]} skipHtml
      components={{
        a: ({ href, children }) => <a href={href} onClick={(event) => {
          event.preventDefault();
          if (href) void openExternalUrl(href);
        }}>{children}</a>,
        img: ({ src, alt }) => {
          const asset = src?.startsWith('notebook-image/') ? images?.[src.slice('notebook-image/'.length)] : undefined;
          return asset && /^data:image\/png;base64,/.test(asset.dataUrl)
            ? <span className="notebook-inline-image"><img src={asset.dataUrl} alt={alt || 'Notebook image'}
              width={asset.width} height={asset.height} />{alt && <span className="notebook-image-caption">{alt}</span>}</span>
            : <span className="notebook-image-caption">{alt || 'Image reference'}</span>;
        },
      }}>{text}</ReactMarkdown>
  </div>;
});
