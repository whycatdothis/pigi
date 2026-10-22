import React from 'react';
import { IconQuote } from '@tabler/icons-react';
import { useAppStore } from '../../state/appStore';
import { RIGHT_SIDEBAR_TABS, type RightSidebarTab } from '../../lib/rightSidebarTabs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import QuotePanel from '../quotes/QuotePanel';

const TAB_LABELS: Record<RightSidebarTab, string> = {
  [RIGHT_SIDEBAR_TABS.quotes]: 'Quotes',
};

function isRightSidebarTab(value: string): value is RightSidebarTab {
  return Object.hasOwn(TAB_LABELS, value);
}

/** Right-hand panel with one tab per view; quotes is the only view so far. */
export default React.memo(function RightSidebar({
  sessionPath,
  onSendQuotes,
}: {
  sessionPath: string;
  /** Stable callback that sends a message like the chat input does. */
  onSendQuotes: (message: string) => Promise<void>;
}): React.JSX.Element {
  const activeTab = useAppStore((state) => state.rightSidebarTab);
  const quoteCount = useAppStore((state) => state.quotesBySession.get(sessionPath)?.length ?? 0);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        if (isRightSidebarTab(value)) {
          useAppStore.getState().setRightSidebarTab(value);
        }
      }}
      className="h-full w-full gap-0 bg-background"
    >
      <div className="flex h-11 shrink-0 items-center border-b-[0.5px] border-foreground/27 px-2 [-webkit-app-region:drag]">
        <TabsList variant="chip" className="[-webkit-app-region:no-drag]">
          <TabsTrigger
            value={RIGHT_SIDEBAR_TABS.quotes}
            className="h-7 flex-none px-2.5 text-xs font-normal text-muted-foreground"
          >
            <IconQuote size={13} className="opacity-70" />
            {TAB_LABELS[RIGHT_SIDEBAR_TABS.quotes]}
            {quoteCount > 0 && (
              <span className="rounded-full bg-foreground/10 px-1.5 text-[10px] leading-4 tabular-nums">
                {quoteCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value={RIGHT_SIDEBAR_TABS.quotes} className="min-h-0">
        <QuotePanel sessionPath={sessionPath} onSend={onSendQuotes} />
      </TabsContent>
    </Tabs>
  );
});
