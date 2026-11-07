import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import { normalizeAiResponseMarkdown } from '../../lib/ai/aiResponseMarkdown';
import { openExternalUrl } from '../../utils/tauriBridge';

interface AiResponseRendererProps {
  response: string;
}

export const AiResponseRenderer: React.FC<AiResponseRendererProps> = React.memo(({ response }) => {
  const normalizedResponse = useMemo(() => normalizeAiResponseMarkdown(response), [response]);

  return (
    <div className="ai-response-markdown select-text text-xs leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
        components={{
          a: ({ children, href, ...props }) => (
            <a
              {...props}
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                if (href) {
                  e.preventDefault();
                  void openExternalUrl(href);
                }
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {normalizedResponse}
      </ReactMarkdown>
    </div>
  );
});
