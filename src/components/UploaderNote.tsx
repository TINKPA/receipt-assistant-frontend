import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { extractProblemMessage, retryIngest, type BackendIngest } from '../lib/api';
import { batchLink } from '../lib/navLinks';
import { qk } from '../lib/queryKeys';
import { cn } from '../lib/utils';
import {
  UPLOADER_NOTE_MAX_CHARS,
  UPLOADER_NOTE_PLACEHOLDER,
  noteToSend,
  noteTooLong,
} from '../lib/uploaderNote';

/**
 * The optional uploader note (#179): collapsed behind "Add a note" until
 * asked for. The note is context for the extractor (what the money was), not
 * evidence: amounts, dates and payee still come from the document.
 */
export function UploaderNoteField({
  value,
  onChange,
  disabled,
  defaultOpen = false,
  label = 'Add a note',
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  defaultOpen?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(defaultOpen || value !== '');
  const id = useId();
  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-ink-soft)] underline-offset-2 hover:underline disabled:opacity-50"
      >
        + {label} <span className="normal-case tracking-normal text-[var(--color-ink-muted)]">(optional)</span>
      </button>
    );
  }
  const count = [...value].length;
  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-center justify-between font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]"
      >
        <span>Note for the extractor · optional</span>
        <span className={cn(count > UPLOADER_NOTE_MAX_CHARS && 'text-[var(--color-stamp)]')}>
          {count}/{UPLOADER_NOTE_MAX_CHARS}
        </span>
      </label>
      <textarea
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={UPLOADER_NOTE_PLACEHOLDER}
        className="mt-1 block w-full resize-y rounded-[10px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] px-3 py-2 text-[13px] leading-snug text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] disabled:opacity-60"
      />
      <p className="mt-1 text-[10px] leading-snug text-[var(--color-ink-muted)]">
        Used to tell what the money was. Amounts, dates and payee still come from the document.
      </p>
    </div>
  );
}


/** The stored note, read-only and labelled as the uploader's. A long note
 *  (up to 2000 characters) is clamped to a few lines until opened, so it
 *  cannot push the rest of a list off the screen. */
export function UploaderNoteDisplay({ note, className }: { note: string | null | undefined; className?: string }) {
  const [full, setFull] = useState(false);
  if (!note) return null;
  const long = note.length > 240 || note.split('\n').length > 4;
  return (
    <div
      className={cn(
        'rounded-[9px] border-l-[2px] border-[var(--color-rule)] bg-[color:rgba(63,85,99,0.06)] px-2.5 py-1.5',
        className,
      )}
      data-testid="uploader-note"
    >
      <p className="font-mono text-[7.5px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
        Uploader's note
      </p>
      <p
        className={cn(
          'mt-0.5 whitespace-pre-wrap wrap-break-word text-[11.5px] leading-snug text-[var(--color-ink-soft)]',
          long && !full && 'line-clamp-4',
        )}
      >
        {note}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setFull((f) => !f)}
          className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)]"
        >
          {full ? 'show less ↑' : 'show all ›'}
        </button>
      )}
    </div>
  );
}

/**
 * "Retry with a note" (#179) on a failed or `unsupported` ingest: the user
 * says what the document is, and the stored bytes go through extraction
 * again with that note. Shown only where the API says a note makes the
 * ingest retryable (`retryable_with_note`). The new attempt is its own
 * ingest in a new batch, linked once it is accepted.
 */
export function RetryWithNote({ ingest }: { ingest: BackendIngest }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(ingest.uploader_note ?? '');
  const retry = useMutation({
    mutationFn: (n: string) => retryIngest(ingest.id, n),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.ingestProblems });
      void queryClient.invalidateQueries({ queryKey: qk.batches.all });
    },
  });
  if (!ingest.retryable_with_note) return null;

  if (retry.isSuccess) {
    const next = retry.data;
    return (
      <p className="mt-2 text-[10.5px] leading-snug text-[var(--color-ink-soft)]" data-testid="retry-with-note-done">
        Retrying with your note.{' '}
        {next.batch_id && (
          <Link {...batchLink(next.batch_id)} className="text-[var(--color-accent)] underline-offset-2 hover:underline">
            Follow the new attempt ›
          </Link>
        )}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border-[0.5px] border-[var(--color-rule)] px-3 py-1 font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--color-ink-soft)]"
      >
        retry with a note ✎
      </button>
    );
  }

  const send = noteToSend(note);
  return (
    <div className="mt-2 w-full space-y-2">
      <UploaderNoteField value={note} onChange={setNote} disabled={retry.isPending} defaultOpen />
      {retry.isError && (
        <p className="text-[10px] leading-snug text-[var(--color-stamp)]">{extractProblemMessage(retry.error)}</p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!send || noteTooLong(note) || retry.isPending}
          onClick={() => send && retry.mutate(send)}
          className="rounded-full bg-[var(--color-ink)] px-3 py-1 font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--color-paper)] disabled:opacity-50"
        >
          {retry.isPending ? 'retrying…' : 'retry with this note ↻'}
        </button>
        <button
          type="button"
          disabled={retry.isPending}
          onClick={() => setOpen(false)}
          className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--color-ink-muted)]"
        >
          cancel
        </button>
      </div>
    </div>
  );
}
