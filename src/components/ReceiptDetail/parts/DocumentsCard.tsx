import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { DocumentEntry } from '../../../lib/documentRoles';
import DeletedBadge from '../../DeletedBadge';
import { DocumentBody } from './DocumentBody';
import { documentPanelStyle } from './documentPanel';

/**
 * Every document on the transaction, most itemized first (#165).
 *
 * Production has 90 transactions carrying 2-4 documents whose extras
 * have never been visible: the screen picked one "primary" document and
 * dropped the rest. Rendered only for two or more — a single-document
 * transaction keeps the original OriginalReceiptCollapsible fold
 * verbatim, so the common case is unchanged.
 *
 * ┌──────────────────────────────────────────────────┐
 * │  Documents (2)                                   │
 * ├──────────────────────────────────────────────────┤
 * │  Invoice  HTML                                 › │
 * ├──────────────────────────────────────────────────┤
 * │  Email  EML                                    › │
 * │  Confirmation of your Zelle® payment             │
 * └──────────────────────────────────────────────────┘
 */
export function DocumentsCard({ entries }: { entries: DocumentEntry[] }) {
  // Open rows live here, not per row, so the set is one piece of state
  // and rows stay independently toggleable — the same shape as
  // LineItemsCard's `openLines`. Every row starts closed: this card sits
  // below the fold on a phone, and auto-mounting a 520px iframe there
  // spends bytes on a reader who has not scrolled to it.
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-rule)]">
        <h3 className="font-display font-medium text-lg leading-none">
          Documents <span className="text-[var(--color-ink-muted)]">({entries.length})</span>
        </h3>
      </div>

      <ul className="divide-y divide-[var(--color-rule-soft)]">
        {entries.map((e) => {
          const { doc, title, format, subtitle } = e;

          // #165 G — a soft-deleted document is LISTED, marked, and not
          // opened. /content and /rendered are not guaranteed to serve a
          // soft-deleted row, and the <img> fallback's onError hides
          // itself, so an expandable tombstone would fail invisibly into
          // an empty panel. Restore lives in the Ledger's "Show deleted"
          // panel.
          if (doc.deleted_at) {
            return (
              <li key={doc.id} className="px-5 py-3 flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-medium truncate line-through text-[var(--color-ink-muted)]">
                      {title}
                    </span>
                    {format && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                        {format}
                      </span>
                    )}
                  </span>
                  {subtitle && (
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--color-ink-faint)]">
                      {subtitle}
                    </span>
                  )}
                </span>
                <span className="shrink-0">
                  <DeletedBadge deletedAt={doc.deleted_at} />
                </span>
              </li>
            );
          }

          const open = openIds.has(doc.id);
          return (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => toggle(doc.id)}
                aria-expanded={open}
                className="w-full px-5 py-3 flex items-start justify-between gap-4 text-left hover:bg-[var(--color-paper-deep)]/30 transition-colors"
              >
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-medium truncate">{title}</span>
                    {format && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
                        {format}
                      </span>
                    )}
                  </span>
                  {subtitle && (
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--color-ink-muted)]">
                      {subtitle}
                    </span>
                  )}
                </span>
                {open ? (
                  <ChevronDown size={15} className="mt-0.5 shrink-0 text-[var(--color-ink-faint)]" />
                ) : (
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-[var(--color-ink-faint)]" />
                )}
              </button>
              {open && (
                <div
                  className="p-4 border-t border-[var(--color-rule-soft)]"
                  style={documentPanelStyle}
                >
                  {/* Each row renders through the branch its OWN
                      mime_type selects (#165 E) — an .eml and an HTML
                      invoice on one transaction both render correctly. */}
                  <DocumentBody
                    documentId={doc.id}
                    kind={doc.kind}
                    mimeType={doc.mime_type ?? null}
                    sourceMeta={doc.source_meta ?? null}
                    label={[title, format, subtitle].filter(Boolean).join(' · ')}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
