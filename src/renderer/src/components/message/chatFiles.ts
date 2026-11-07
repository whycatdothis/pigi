import { createContext } from 'react';
import type { LineRange } from '../../lib/filePathCandidates';

/** What chat needs to open the files it names: where relative paths start, and the Files tab. */
export interface ChatFiles {
  cwd: string;
  onOpenFile: (absolutePath: string, lines?: LineRange | null) => void;
}

export const ChatFilesContext = createContext<ChatFiles | null>(null);
