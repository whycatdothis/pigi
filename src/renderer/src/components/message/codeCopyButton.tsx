import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback';

/** Copy button for a code block header, shared by code and diagrams. */
export default function CodeCopyButton({ code }: { code: string }): React.JSX.Element {
  const { copied, copy } = useCopyFeedback(code);

  return (
    <button type="button" className="markdown-code-copy-button" onClick={copy} title="Copy code">
      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
    </button>
  );
}
