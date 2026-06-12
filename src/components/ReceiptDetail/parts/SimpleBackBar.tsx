export function SimpleBackBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center text-[11px] tracking-[0.16em] uppercase text-[var(--color-ink-muted)]">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 hover:text-[var(--color-ink)] transition-colors"
      >
        <span className="font-display text-lg leading-none text-[var(--color-accent)]">←</span>
        Back
      </button>
    </div>
  );
}
