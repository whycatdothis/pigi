import { createContext, memo, useContext, type ReactNode } from 'react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import CodeCopyButton from './codeCopyButton';
import MermaidDiagram from './mermaidDiagram';
import SyntaxHighlightedCode from './syntaxHighlightedCode';
import { isFenceClosed } from '../../lib/markdownFence';

const MERMAID_LANGUAGE = 'mermaid';

interface MarkdownMessageProps {
  text: string;
  /** Whether the message is still arriving, which puts code blocks on a highlight throttle. */
  isStreaming?: boolean;
}

const LANGUAGE_CLASS_PREFIX = 'language-';
const CODE_LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Bash',
  css: 'CSS',
  html: 'HTML',
  javascript: 'JavaScript',
  js: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  markdown: 'Markdown',
  md: 'Markdown',
  mermaid: 'Mermaid',
  python: 'Python',
  py: 'Python',
  sh: 'Shell',
  shell: 'Shell',
  shellscript: 'Shell',
  ts: 'TypeScript',
  tsx: 'TSX',
  typescript: 'TypeScript',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
};

// Only elements needing behavior or structure get an override; all typographic
// styling lives in the `.markdown-body` rules in main.css.
const IsInCodeBlockContext = createContext(false);

// The raw markdown, for the one decision that needs it: whether a fenced block
// has been closed yet (see `isFenceClosed`).
const MarkdownSourceContext = createContext('');

// A message that is still arriving re-renders per chunk, and every one of those
// renders is a new code string. A code block highlights through a throttle when
// it is told so (see `useStreamingThrottledCode`); telling it is what keeps a
// long block from being tokenized again on every chunk. It travels as context
// because the components below are a module-level map: replacing them per render
// would remount every element of the message.
const MarkdownStreamingContext = createContext(false);

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      rel="noreferrer"
      onClick={(e) => {
        e.preventDefault();
        if (href) window.piApi.openExternal(href);
      }}
    >
      {children}
    </a>
  ),
  // Scroll wrapper so wide tables overflow horizontally instead of
  // stretching the message layout.
  table: ({ children }) => (
    <div className="markdown-table-wrapper">
      <table>{children}</table>
    </div>
  ),
  // react-markdown gives the code element no way to tell block code from
  // inline code, so the pre override broadcasts it via context.  The actual
  // <pre> is rendered by MarkdownCode so the header / copy button can sit
  // outside the scrollable area.
  pre: ({ children }) => (
    <IsInCodeBlockContext.Provider value={true}>{children}</IsInCodeBlockContext.Provider>
  ),
  code: MarkdownCode,
};

function MarkdownCode({
  className,
  children,
  node,
}: {
  className?: string;
  children?: ReactNode;
  node?: ExtraProps['node'];
}): React.JSX.Element {
  const isCodeBlock = useContext(IsInCodeBlockContext);
  const source = useContext(MarkdownSourceContext);
  const isStreaming = useContext(MarkdownStreamingContext);
  if (!isCodeBlock) {
    return <code className={className}>{children}</code>;
  }

  const language = getCodeLanguage(className);
  const code = getCodeText(children);
  // A mermaid block is drawn as a diagram, but only once its fence is closed:
  // while it streams it is a code block that is still being written, and there
  // is nothing to draw yet.
  const endLine = node?.position?.end.line;
  if (isMermaidLanguage(language) && endLine !== undefined && isFenceClosed(source, endLine)) {
    return <MermaidDiagram code={code} />;
  }

  if (language) {
    return (
      <div className="markdown-code-block">
        <div className="markdown-code-header" data-search-ignore>
          <span className="markdown-code-label">{getCodeLanguageLabel(language)}</span>
          <CodeCopyButton code={code} />
        </div>
        <pre>
          <SyntaxHighlightedCode code={code} language={language} isStreaming={isStreaming} />
        </pre>
      </div>
    );
  }

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header" data-search-ignore>
        <span className="markdown-code-label">plain text</span>
        <CodeCopyButton code={code} />
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function isMermaidLanguage(language: string | null): boolean {
  return language?.toLowerCase() === MERMAID_LANGUAGE;
}

function getCodeLanguage(className: string | undefined): string | null {
  const languageClass = className
    ?.split(/\s+/)
    .find((item) => item.startsWith(LANGUAGE_CLASS_PREFIX));
  return languageClass?.slice(LANGUAGE_CLASS_PREFIX.length) ?? null;
}

function getCodeText(children: ReactNode): string {
  return String(children).replace(/\n$/, '');
}

function getCodeLanguageLabel(language: string): string {
  const normalizedLanguage = language.toLowerCase();
  return CODE_LANGUAGE_LABELS[normalizedLanguage] ?? language;
}

// Memoized: the remark/rehype pipeline is expensive, and callers (minimal
// view turns, message rows) re-render for unrelated reasons like scroll
// tracking or timer ticks — the text prop is a stable string in those cases.
export default memo(function MarkdownMessage({
  text,
  isStreaming = false,
}: MarkdownMessageProps): React.JSX.Element {
  return (
    <div className="markdown-body">
      <MarkdownStreamingContext.Provider value={isStreaming}>
        <MarkdownSourceContext.Provider value={text}>
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={markdownComponents}
          >
            {text}
          </Markdown>
        </MarkdownSourceContext.Provider>
      </MarkdownStreamingContext.Provider>
    </div>
  );
});
