import { IconArrowLeft } from '@tabler/icons-react';
import { Kbd } from '../ui/kbd';
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../ui/sidebar';
import { TooltipProvider } from '../ui/tooltip';
import {
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from '../../lib/settingsSections';

interface SettingsSidebarProps {
  activeSection: SettingsSectionId;
  onSelectSection: (section: SettingsSectionId) => void;
  onClose: () => void;
}

/**
 * Settings navigation. Occupies the app sidebar slot while the settings page
 * is open; the top bar is the close affordance back to the app.
 */
export default function SettingsSidebar({
  activeSection,
  onSelectSection,
  onClose,
}: SettingsSidebarProps): React.JSX.Element {
  return (
    <TooltipProvider delayDuration={300}>
      <ShadcnSidebar collapsible="none" className="sidebar-surface" data-testid="settings-sidebar">
        {/* WebkitAppRegion is Electron-specific, not in React's CSSProperties */}
        <SidebarHeader style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="h-10" />
          <SidebarMenu style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onClose}
                data-testid="settings-close"
                aria-label="Close settings"
              >
                <IconArrowLeft data-icon="inline-start" />
                <span>Back to app</span>
                <Kbd className="ml-auto hidden shrink-0 group-hover/menu-item:inline-flex">Esc</Kbd>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="overflow-hidden">
          <SidebarGroup className="min-h-0 flex-1">
            <SidebarGroupContent className="no-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              {SETTINGS_GROUPS.map((group) => (
                <div key={group.id} className="flex flex-col gap-1 pb-2">
                  <SidebarGroupLabel className="px-2 pt-3 pb-0 text-sm text-muted-foreground">
                    {group.label}
                  </SidebarGroupLabel>
                  <SidebarMenu>
                    {SETTINGS_SECTIONS.filter((section) => section.group === group.id).map(
                      (section) => {
                        const SectionIcon = section.icon;
                        return (
                          <SidebarMenuItem key={section.id}>
                            <SidebarMenuButton
                              isActive={section.id === activeSection}
                              onClick={() => onSelectSection(section.id)}
                              data-testid={`settings-nav-${section.id}`}
                            >
                              <SectionIcon data-icon="inline-start" />
                              <span>{section.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      },
                    )}
                  </SidebarMenu>
                </div>
              ))}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </ShadcnSidebar>
    </TooltipProvider>
  );
}
