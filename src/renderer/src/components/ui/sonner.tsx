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
          '--border-radius': 'var(--radius-md)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
