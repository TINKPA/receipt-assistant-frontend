import { Link } from '@tanstack/react-router';
import { cn } from '../lib/utils';

const TRACK =
  'flex rounded-[11px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper-deep)] p-[3px]';
const segment = (active: boolean, size: 'md' | 'sm') =>
  cn(
    'flex-1 rounded-[9px] text-center font-mono uppercase transition-colors',
    size === 'md' ? 'py-2 text-[10.5px] tracking-[0.1em]' : 'py-1.5 text-[9.5px] tracking-[0.08em]',
    active
      ? 'bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm'
      : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink-soft)]',
  );

/**
 * Owned | Wanting: the two halves of the Things tab. Both pages render it
 * first, so the other half is always one tap away and the tab bar needs no
 * sixth destination.
 */
export function ThingsSwitch({ active }: { active: 'owned' | 'wanting' }) {
  return (
    <nav aria-label="Things" className={cn(TRACK, 'mt-2')}>
      <Link
        to="/owned"
        aria-current={active === 'owned' ? 'page' : undefined}
        className={segment(active === 'owned', 'md')}
      >
        Owned
      </Link>
      <Link
        to="/wish"
        aria-current={active === 'wanting' ? 'page' : undefined}
        className={segment(active === 'wanting', 'md')}
      >
        Wanting
      </Link>
    </nav>
  );
}

/** A second-level segmented control over a small set of values. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ key: T; label: string }>;
  value: T;
  onChange: (key: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={TRACK}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={segment(value === o.key, 'sm')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
