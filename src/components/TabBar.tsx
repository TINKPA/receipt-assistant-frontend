import { Link } from '@tanstack/react-router';
import { cn } from '../lib/utils';

export type TabDestination = 'home' | 'ledger' | 'capture' | 'insights' | 'things';

/** The five tabs of the v2 editorial IA (board screens 01–28; tracking
 *  receipt-assistant#149). Glyphs are text, not an icon library, per
 *  DESIGN.md §9 iconography. */
const TABS: Array<{ key: TabDestination; glyph: string; label: string; to: string }> = [
  { key: 'home', glyph: '⌂', label: 'Home', to: '/' },
  { key: 'ledger', glyph: '≡', label: 'Ledger', to: '/transactions' },
  { key: 'capture', glyph: '⊕', label: 'Capture', to: '/add' },
  { key: 'insights', glyph: '✦', label: 'Insights', to: '/insights' },
  { key: 'things', glyph: '▦', label: 'Things', to: '/owned' },
];

/**
 * Full-width bottom tab bar (replaces the Variant B floating pill dock).
 *
 * Per iOS HIG the bar stays visible across push-style detail navigation —
 * /receipt, /merchant, /brand keep the Ledger tab lit; /settings and
 * /batches are the stack behind the Home gear so they keep Home lit. It
 * disappears only for full-bleed modal flows (/add lives outside _shell).
 *
 * Tabs render as real <Link> anchors so middle-click / long-press / hover
 * preview behave like links, same rationale as navLinks.ts.
 */
export default function TabBar({ active }: { active: TabDestination }) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40',
        'border-t-[0.5px] border-[var(--color-rule-soft)]',
        'bg-[color:rgba(248,243,232,0.94)] backdrop-blur-md',
        'pb-[env(safe-area-inset-bottom,0px)]',
      )}
    >
      <div className="mx-auto flex w-full max-w-[480px] sm:max-w-[640px] items-stretch">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              to={tab.to}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5',
                'transition-colors duration-200',
                isActive
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink-soft)]',
              )}
            >
              <span aria-hidden="true" className="text-[17px] leading-none">
                {tab.glyph}
              </span>
              <span className="text-[10px] font-medium tracking-[0.02em]">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
