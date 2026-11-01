import type { GitDiffFileStatus } from '../../../shared/ipcContract';

export const GIT_DIFF_STATUS_LABELS: Record<GitDiffFileStatus, string> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
  copied: 'Copied',
  typechanged: 'Type changed',
  conflicted: 'Conflicted',
  untracked: 'Untracked',
};

export const GIT_DIFF_STATUS_BADGES: Record<GitDiffFileStatus, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  typechanged: 'T',
  conflicted: '!',
  untracked: '?',
};
