import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { documentContentUrl, documentRenderedUrl } from '../../../lib/api';

function formatReceived(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Email message-header strip shown above the rendered email body, so the
 *  fold reads as "the original email" rather than a raw HTML blob (#76). */
function EmailHeaderStrip({
  sender,
  subject,
  receivedAt,
}: {
  sender: string | null;
  subject: string | null;
  receivedAt: string | null;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-3">
      {subject && (
        <p className="font-display italic font-medium text-[15px] leading-snug text-[var(--color-ink)]">
          {subject}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--color-ink-muted)]">
        {sender && <span className="min-w-0 truncate">{sender}</span>}
        {sender && receivedAt && <span aria-hidden="true">·</span>}
        {receivedAt && <span className="tnum">{formatReceived(receivedAt)}</span>}
      </div>
    </div>
  );
}

export function OriginalReceiptCollapsible({
  documentId,
  kind,
  sourceMeta,
}: {
  documentId: string;
  kind?: string | null;
  sourceMeta?: Record<string, unknown> | null;
}) {
  const [open, setOpen] = useState(false);
  const isEmail = kind === 'receipt_email';
  const isPdf = kind === 'receipt_pdf' || kind === 'statement_pdf';
  const sender = (sourceMeta?.sender as string | undefined) ?? null;
  const subject = (sourceMeta?.subject as string | undefined) ?? null;
  const receivedAt = (sourceMeta?.received_at as string | undefined) ?? null;
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[var(--color-paper-deep)]/30 transition-colors"
      >
        <span className="font-display italic font-medium text-lg leading-none">
          {isEmail ? 'Original email' : 'Original receipt'}
        </span>
        {open ? <ChevronDown size={18} className="text-[var(--color-ink-muted)]" /> : <ChevronRight size={18} className="text-[var(--color-ink-muted)]" />}
      </button>
      {open && (
        <div
          className="p-4"
          style={{
            background:
              'linear-gradient(180deg, rgba(245, 230, 195, 0.4) 0%, rgba(201, 123, 92, 0.06) 100%), var(--color-surface)',
          }}
        >
          {isEmail ? (
            <div className="space-y-3">
              {(sender || subject || receivedAt) && (
                <EmailHeaderStrip
                  sender={sender}
                  subject={subject}
                  receivedAt={receivedAt}
                />
              )}
              {/* Faithful render of the sender's HTML, isolated in a
                  sandboxed iframe (no scripts / no same-origin). The
                  backend serves it with a strict CSP; this is the second
                  containment layer. Fixed height + internal scroll since
                  email heights vary wildly. */}
              <iframe
                src={documentRenderedUrl(documentId)}
                title="Original email"
                sandbox=""
                referrerPolicy="no-referrer"
                className="block w-full rounded-[10px] border border-[var(--color-rule)] bg-white"
                style={{ height: 520 }}
              />
            </div>
          ) : isPdf ? (
            <div className="space-y-3">
              {/* PDFs can't render in an <img> tag — embed the browser's
                  built-in PDF viewer via an iframe pointing at the raw
                  /content stream (served as application/pdf). No sandbox:
                  this is our own same-origin file, and a strict sandbox
                  blocks the viewer. The link below is the fallback for
                  mobile browsers (iOS Safari) that won't render PDFs
                  inline. */}
              <iframe
                src={documentContentUrl(documentId)}
                title="Original PDF"
                className="block w-full rounded-[10px] border border-[var(--color-rule)] bg-white"
                style={{ height: 520 }}
              />
              <a
                href={documentContentUrl(documentId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm font-medium text-[var(--color-terracotta)] hover:underline"
              >
                Open PDF in new tab
              </a>
            </div>
          ) : (
            <img
              src={documentContentUrl(documentId)}
              alt="Receipt"
              className="block max-w-full max-h-[500px] object-contain mx-auto rounded-[10px]"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
