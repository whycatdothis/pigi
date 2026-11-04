import { IconFolderPlus, IconMessageCirclePlus } from '@tabler/icons-react';
import appIconUrl from '../../assets/appIcon.png';
import type { ShortcutBinding } from '../../../../shared/ipcContract';
import { formatShortcutLabel } from '../../shortcuts/formatShortcutLabel';
import { Button } from '../ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../ui/empty';
import { COMPACT_KBD_CLASS_NAME, Kbd, PRIMARY_BUTTON_KBD_CLASS_NAME } from '../ui/kbd';

interface WelcomeScreenProps {
  hasProjects: boolean;
  shortcutBindings: Map<string, ShortcutBinding> | null;
  onOpenProject: () => void;
  onNewSession: () => void;
}

export function WelcomeScreen({
  hasProjects,
  shortcutBindings,
  onOpenProject,
  onNewSession,
}: WelcomeScreenProps): React.JSX.Element {
  const openProjectBinding = shortcutBindings?.get('sidebar.openProject');
  const newChatBinding = shortcutBindings?.get('sidebar.newChat');

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <img src={appIconUrl} alt="" className="size-20 drop-shadow-md" draggable={false} />
        </EmptyMedia>
        <EmptyTitle className="text-xl">{hasProjects ? 'Welcome back' : 'Hi, I’m pigi'}</EmptyTitle>
        <EmptyDescription>
          {hasProjects
            ? 'Pick up a session from the sidebar, or start a new chat.'
            : 'Open a project folder and start chatting with pi about your code.'}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <Button variant={hasProjects ? 'outline' : 'default'} onClick={onOpenProject}>
          <IconFolderPlus data-icon="inline-start" />
          Open project
          {openProjectBinding && (
            <Kbd className={hasProjects ? COMPACT_KBD_CLASS_NAME : PRIMARY_BUTTON_KBD_CLASS_NAME}>
              {formatShortcutLabel(openProjectBinding)}
            </Kbd>
          )}
        </Button>
        {hasProjects && (
          <Button variant="outline" onClick={onNewSession}>
            <IconMessageCirclePlus data-icon="inline-start" />
            New chat
            {newChatBinding && (
              <Kbd className={COMPACT_KBD_CLASS_NAME}>{formatShortcutLabel(newChatBinding)}</Kbd>
            )}
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
}
