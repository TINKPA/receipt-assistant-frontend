import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DocumentBody } from './DocumentBody';
import { documentPanelStyle } from './documentPanel';

/**
 * The single-document "Original receipt" fold. Renders exactly one
 * document; a transaction carrying more than one is rendered by
 * DocumentsCard instead (#165). The four viewer branches live in
 * DocumentBody so both surfaces share one definition.
 */
export function OriginalReceiptCollapsible({
  documentId,
  kind,
  mimeType,
  sourceMeta,
}: {
  documentId: string;
  kind?: string | null;
  mimeType?: string | null;
  sourceMeta?: Record<string, unknown> | null;
}) {
  const [open, setOpen] = useState(false);
  // Only the header title needs this now; the viewer re-derives its own.
  const isEmail = kind === 'receipt_email';

  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[var(--color-paper-deep)]/30 transition-colors"
      >
        <span className="font-display font-medium text-lg leading-none">
          {isEmail ? 'Original email' : 'Original receipt'}
        </span>
        {open ? <ChevronDown size={18} className="text-[var(--color-ink-muted)]" /> : <ChevronRight size={18} className="text-[var(--color-ink-muted)]" />}
      </button>
      {open && (
        <div className="p-4" style={documentPanelStyle}>
          <DocumentBody
            documentId={documentId}
            kind={kind}
            mimeType={mimeType}
            sourceMeta={sourceMeta}
          />
        </div>
      )}
    </div>
  );
}
