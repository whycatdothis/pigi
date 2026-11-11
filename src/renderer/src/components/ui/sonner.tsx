import type React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import {
  IconCircleCheck,
  IconInfoCircle,
  IconAlertTriangle,
  IconAlertOctagon,
  IconLoader,
} from '@tabler/icons-react';
import { SpinningIcon } from './spinningIcon';

function Toaster({ ...props }: ToasterProps): React.JSX.Element {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      position="bottom-right"
      gap={8}
      toastOptions={{
        // !important: sonner pins an expanded toast to the height it measured at mount (unlayered CSS).
        classNames: {
          toast: 'group/toast hover:h-auto!',
          content: 'group-hover/toast:max-h-[60vh] group-hover/toast:overflow-y-auto',
          title: 'line-clamp-3 group-hover/toast:line-clamp-none',
          description: 'line-clamp-3 group-hover/toast:line-clamp-none',
        },
      }}
      icons={{
        success: <IconCircleCheck className="size-4" />,
        info: <IconInfoCircle className="size-4" />,
        warning: <IconAlertTriangle className="size-4" />,
        error: <IconAlertOctagon className="size-4" />,
        loading: (
          <SpinningIcon>
            <IconLoader className="size-4" />
          </SpinningIcon>
        ),
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'transparent',
          '--success-bg': 'var(--success-bg)',
          '--success-text': 'var(--success-fg)',
          '--success-border': 'var(--success-border)',
          '--error-bg': 'var(--danger-bg)',
          '--error-text': 'var(--danger-fg)',
          '--error-border': 'var(--danger-border)',
          '--border-radius': 'var(--radius-surface)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
