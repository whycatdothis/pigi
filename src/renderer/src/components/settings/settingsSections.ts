import type { Icon } from '@tabler/icons-react';
import {
  IconAdjustmentsHorizontal,
  IconArrowsMinimize,
  IconBox,
  IconCpu,
  IconInfoCircle,
  IconKeyboard,
  IconMessageCircle,
  IconPalette,
  IconRefresh,
  IconSend,
} from '@tabler/icons-react';

/**
 * Settings page navigation registry. Groups are rendered in order; the first
 * section of each group heads its list.
 */
export const SETTINGS_GROUPS = [
  { id: 'pigi', label: 'pigi' },
  { id: 'pi', label: 'pi' },
] as const;

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]['id'];

export interface SettingsSection {
  id: string;
  group: SettingsGroupId;
  label: string;
  icon: Icon;
  /** Pi sections default to `both`; `global` hides the scope switch. */
  piScope?: 'both' | 'global';
}

export const SETTINGS_SECTIONS = [
  { id: 'appearance', group: 'pigi', label: 'Appearance', icon: IconPalette },
  { id: 'chat', group: 'pigi', label: 'Chat', icon: IconMessageCircle },
  { id: 'shortcuts', group: 'pigi', label: 'Shortcuts', icon: IconKeyboard },
  { id: 'about', group: 'pigi', label: 'About', icon: IconInfoCircle },
  { id: 'models', group: 'pi', label: 'Models & Thinking', icon: IconCpu, piScope: 'global' },
  { id: 'delivery', group: 'pi', label: 'Message Delivery', icon: IconSend },
  { id: 'compaction', group: 'pi', label: 'Compaction', icon: IconArrowsMinimize },
  { id: 'retry', group: 'pi', label: 'Retry', icon: IconRefresh },
  { id: 'resources', group: 'pi', label: 'Resources', icon: IconBox },
  { id: 'advanced', group: 'pi', label: 'Advanced', icon: IconAdjustmentsHorizontal },
] as const satisfies readonly SettingsSection[];

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'appearance';

export function findSettingsSection(id: string): SettingsSection | undefined {
  return (SETTINGS_SECTIONS as readonly SettingsSection[]).find((section) => section.id === id);
}

export function isSettingsSectionId(id: string): id is SettingsSectionId {
  return findSettingsSection(id) !== undefined;
}
