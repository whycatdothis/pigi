import { createContext } from 'react';

/** What chat needs to open the files it names: where relative paths start, and the Files tab. */
export interface ChatFiles {
  cwd: string;
  onOpenFile: (absolutePath: string) => void;
}

export const ChatFilesContext = createContext<ChatFiles | null>(null);
