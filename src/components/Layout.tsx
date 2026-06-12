import React from 'react';
import TabBar, { type TabDestination } from './TabBar';

interface LayoutProps {
  children: React.ReactNode;
  tab: TabDestination;
  /** When true the tab bar is omitted — full-bleed surfaces like the
   *  Capture route own the whole viewport. */
  tabBarHidden?: boolean;
}

/**
 * Editorial app shell (v2, 2026-06-12).
 *
 * Mobile-first: a single centered column on warm cream paper, with a
 * full-width 5-tab bar at the bottom (TabBar.tsx). On larger viewports the
 * column widens but the IA stays the same — desktop is the scaled-up
 * version of mobile (DESIGN.md §4.4 / §9).
 */
export default function Layout({ children, tab, tabBarHidden = false }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)]">
      <main
        className={[
          'mx-auto w-full max-w-[480px] sm:max-w-[640px] lg:max-w-[960px] xl:max-w-[1100px]',
          'px-4 sm:px-6 lg:px-10',
          'pt-4 sm:pt-6 lg:pt-10',
          tabBarHidden
            ? 'pb-[env(safe-area-inset-bottom,0px)]'
            : 'pb-[calc(env(safe-area-inset-bottom,0px)+5rem)]',
        ].join(' ')}
      >
        {children}
      </main>

      {!tabBarHidden && <TabBar active={tab} />}
    </div>
  );
}
