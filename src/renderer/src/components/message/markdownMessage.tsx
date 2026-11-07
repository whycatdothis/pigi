import { createContext, memo, useContext, type ReactNode } from 'react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import CodeCopyButton from './codeCopyButton';
import MermaidDiagram from './mermaidDiagram';
import SyntaxHighlightedCode from './syntaxHighlightedCode';
import { localFileUrl } from '../../lib/chatAttachments';
import { ZoomableImage } from '../zoomableImage';
import { isFenceClosed } from '../../lib/markdownFence';
import { resolveProjectFileReference } from '../../lib/projectFileLinks';
import { filePathFromHref } from '../../lib/filePathCandidates';
import { useExistingFile } from '../../lib/existingPaths';
import rehypeFilePaths, { FILE_PATH_PROPERTY } from '../../lib/rehypeFilePaths';
import { ChatFilesContext } from './chatFiles';
import { FileLink, FileLinkIcon, OpenFileAnchor } from './fileLink';

const MERMAID_LANGUAGE = 'mermaid';

interface MarkdownProjectFile {
  projectPath: string;
  /** Path of the markdown file, relative to the project root. */
  filePath: string;
  onOpenFile: (path: string) => void;
}

interface MarkdownMessageProps {
  text: string;
  /** Whether the message is still arriving, which puts code blocks on a highlight throttle. */
  isStreaming?: boolean;
  /** Resolve relative links and images when rendering a project file. */
  projectFile?: MarkdownProjectFile;
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

const MarkdownProjectFileContext = createContext<MarkdownProjectFile | null>(null);

// An image inside a link (a README badge) is the link: zooming it would open the
// overlay and the link with one click.
const IsInLinkContext = createContext(false);

function MarkdownLink({ href, children }: React.ComponentProps<'a'>): React.JSX.Element {
  const projectFile = useContext(MarkdownProjectFileContext);
  const chatFiles = useContext(ChatFilesContext);
  const target =
    projectFile && href
      ? resolveProjectFileReference(projectFile.projectPath, projectFile.filePath, href)
      : null;
  const chatPath = !projectFile && chatFiles && href ? filePathFromHref(href) : null;
  const chatFile = useExistingFile(chatFiles?.cwd ?? '', chatPath);

  if (chatFile && chatFiles) {
    return (
      <OpenFileAnchor absolutePath={chatFile} onOpenFile={chatFiles.onOpenFile}>
        <FileLinkIcon path={chatFile} />
        <IsInLinkContext.Provider value>{children}</IsInLinkContext.Provider>
      </OpenFileAnchor>
    );
  }

  return (
    <a
      href={href}
      rel="noreferrer"
      onClick={(e) => {
        if (!href) {
          e.preventDefault();
          return;
        }
        if (href.startsWith('#')) return;
        e.preventDefault();
        if (target && projectFile) {
          projectFile.onOpenFile(target.path);
          return;
        }
        window.piApi.openExternal(href);
      }}
    >
      <IsInLinkContext.Provider value>{children}</IsInLinkContext.Provider>
    </a>
  );
}

function MarkdownImage({
  src,
  alt,
  title,
  width,
  height,
}: React.ComponentProps<'img'> & ExtraProps): React.JSX.Element {
  const projectFile = useContext(MarkdownProjectFileContext);
  const isInLink = useContext(IsInLinkContext);
  const target =
    projectFile && src
      ? resolveProjectFileReference(projectFile.projectPath, projectFile.filePath, src)
      : null;
  const Image = isInLink ? 'img' : ZoomableImage;

  return (
    <Image
      src={target ? localFileUrl(target.absolutePath) : src}
      alt={alt ?? ''}
      title={title}
      width={width}
      height={height}
    />
  );
}

/** The path `rehypeFilePaths` marked on this element, if any. */
function markedFilePath(node: ExtraProps['node']): string | null {
  const path = node?.properties[FILE_PATH_PROPERTY];
  return typeof path === 'string' ? path : null;
}

function MarkdownSpan({
  children,
  node,
  ...props
}: React.ComponentProps<'span'> & ExtraProps): React.JSX.Element {
  const path = markedFilePath(node);
  return path ? <FileLink path={path}>{children}</FileLink> : <span {...props}>{children}</span>;
}

const markdownComponents: Components = {
  a: MarkdownLink,
  img: MarkdownImage,
  span: MarkdownSpan,
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
    const path = markedFilePath(node);
    if (!path) return <code className={className}>{children}</code>;
    return (
      <FileLink path={path} inlineCode>
        {children}
      </FileLink>
    );
  }

  const language = getCodeLanguage(className);
  const code = getCodeText(children);
  // A mermaid block is drawn as a diagram, but only once its fence is closed:
  // while it streams it is a code block that is still being written, and there
  // is nothing to draw yet.
  const startLine = node?.position?.start.line;
  const endLine = node?.position?.end.line;
  if (
    isMermaidLanguage(language) &&
    startLine !== undefined &&
    endLine !== undefined &&
    isFenceClosed(source, startLine, endLine)
  ) {
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
        <span className="markdown-code-label">Text</span>
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
  return (
    CODE_LANGUAGE_LABELS[normalizedLanguage] ??
    `${language.charAt(0).toUpperCase()}${language.slice(1)}`
  );
}

const REHYPE_PLUGINS = [rehypeSanitize];
// After sanitizing, so the path marks cannot be forged by the markdown itself.
const CHAT_REHYPE_PLUGINS = [rehypeSanitize, rehypeFilePaths];

// Memoized: the remark/rehype pipeline is expensive, and callers (minimal
// view turns, message rows) re-render for unrelated reasons like scroll
// tracking or timer ticks — the text prop is a stable string in those cases.
export default memo(function MarkdownMessage({
  text,
  isStreaming = false,
  projectFile,
}: MarkdownMessageProps): React.JSX.Element {
  const chatFiles = useContext(ChatFilesContext);
  // Paths in a message that is still arriving are half-written; they are
  // looked up once the text settles.
  const linksFilePaths = chatFiles !== null && !projectFile && !isStreaming;
  return (
    <div className="markdown-body text-body">
      <MarkdownStreamingContext.Provider value={isStreaming}>
        <MarkdownSourceContext.Provider value={text}>
          <MarkdownProjectFileContext.Provider value={projectFile ?? null}>
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={linksFilePaths ? CHAT_REHYPE_PLUGINS : REHYPE_PLUGINS}
              components={markdownComponents}
            >
              {text}
            </Markdown>
          </MarkdownProjectFileContext.Provider>
        </MarkdownSourceContext.Provider>
      </MarkdownStreamingContext.Provider>
    </div>
  );
});
