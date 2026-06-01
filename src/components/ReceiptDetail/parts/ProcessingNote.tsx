import { cn } from '../../../lib/utils';

export function ProcessingNote() {
  return (
    <div
      className={cn(
        'rounded-[16px] px-4 py-4 flex items-start gap-3',
        'border border-[var(--color-rule)] bg-[var(--color-butter)]/40',
      )}
    >
      <span
        aria-hidden="true"
        className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-terracotta)] animate-pulse"
      />
      <div>
        <p className="font-display italic font-medium">Still reading your receipt</p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Claude is extracting fields — this page will refresh on its own.
        </p>
      </div>
    </div>
  );
}
