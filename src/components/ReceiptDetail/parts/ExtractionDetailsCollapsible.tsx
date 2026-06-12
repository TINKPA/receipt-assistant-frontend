import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';

export function ExtractionDetailsCollapsible({
  rawText,
  confidence,
  warnings,
  defaultOpen,
}: {
  rawText: string | undefined;
  confidence: number | undefined;
  warnings: string[] | undefined;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isLow = confidence != null && confidence < 0.6;
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[var(--color-paper-deep)]/30 transition-colors"
      >
        <span className="font-display font-medium text-lg leading-none">
          Extraction details
        </span>
        <span className="flex items-center gap-2">
          {confidence != null && (
            <span
              className={cn(
                'text-[11px] tracking-[0.12em] uppercase',
                isLow ? 'text-[var(--color-stamp)]' : 'text-[var(--color-ink-muted)]',
              )}
            >
              {(confidence * 100).toFixed(0)}% confidence
            </span>
          )}
          {open ? <ChevronDown size={18} className="text-[var(--color-ink-muted)]" /> : <ChevronRight size={18} className="text-[var(--color-ink-muted)]" />}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4">
          {warnings && warnings.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {warnings.map((w, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full bg-[var(--color-stamp)]/10 text-[var(--color-stamp)] text-[10px] tracking-[0.08em] uppercase"
                >
                  {w}
                </span>
              ))}
            </div>
          )}
          {rawText && (
            <pre className="text-xs text-[var(--color-ink-muted)] whitespace-pre-wrap font-mono">
              {rawText}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
