import React from 'react';
import FloatingDock, { type DockDestination } from './FloatingDock';

interface LayoutProps {
  children: React.ReactNode;
  dockActive: DockDestination;
  onDockNavigate: (dest: 'books' | 'review') => void;
  onAddTransaction: () => void;
}

/**
 * Variant B (Soft / Organic) app shell.
 *
 * Mobile-first: a single centered column on a cream paper background, with a
 * floating ink-dark dock at the bottom. On larger viewports the column widens
 * (max-w via Tailwind utility) but the dock geometry stays the same — desktop
 * is the scaled-up version of mobile, not a separate layout (DESIGN.md §4.4).
 *
 * Page chrome (greeting, page title, filters) lives inside the page components
 * themselves, not in a global TopBar.
 */
export default function Layout({
  children,
  dockActive,
  onDockNavigate,
  onAddTransaction,
}: LayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)]">
      <main
        className={[
          'mx-auto w-full max-w-[480px] sm:max-w-[640px] lg:max-w-[960px] xl:max-w-[1100px]',
          'px-4 sm:px-6 lg:px-10',
          'pt-4 sm:pt-6 lg:pt-10',
          // Reserve room for the floating dock so content never sits under it.
          'pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)]',
        ].join(' ')}
      >
        {children}
      </main>

      <FloatingDock
        active={dockActive}
        onNavigate={onDockNavigate}
        onAdd={onAddTransaction}
      />
    </div>
  );
}
