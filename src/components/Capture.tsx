import React, { useRef, useState } from 'react';
import { ingestBatch, extractProblemMessage } from '../lib/api';
import { cn } from '../lib/utils';

interface CaptureProps {
  onCancel: () => void;
  /** Same shape as the old AddTransactionModal — App.tsx hooks this to
   *  the ProcessingToast queue, then navigates back to Books. */
  onComplete: (job: { batchId: string; ingestId: string; filename: string }) => void;
}

type CaptureState =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string }
  | { kind: 'error'; message: string };

/**
 * Full-screen capture surface — Variant B fig.04.
 *
 * Replaces the previous AddTransactionModal overlay. The Add pill on the
 * dock now navigates here as a full route (per user lock 2026-05-10).
 *
 * Three entry points, all funnel into the same `ingestBatch` upload:
 *   • Shutter button (center) — `<input capture="environment">` opens the
 *     device camera directly on iOS Safari / mobile Chrome.
 *   • "From photos" (left) — opens the standard file picker (gallery).
 *   • "Type it in" (right) — manual entry form. Not implemented yet;
 *     surfaced as a "coming soon" cue rather than hidden so the layout
 *     reads as designed.
 *
 * Backend: real, via fetchTransactions / openapi-fetch (memory
 * feedback_no_mock_api.md). No mocks.
 */
export default function Capture({ onCancel, onComplete }: CaptureProps) {
  const [state, setState] = useState<CaptureState>({ kind: 'idle' });
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setState({ kind: 'uploading', filename: file.name });
    try {
      const result = await ingestBatch([file]);
      const first = result.items[0];
      if (!first) {
        throw new Error('Upload accepted but server returned no ingest items.');
      }
      onComplete({
        batchId: result.batchId,
        ingestId: first.ingestId,
        filename: first.filename,
      });
      // onComplete handler in App.tsx navigates away; no explicit reset.
    } catch (err: unknown) {
      setState({ kind: 'error', message: extractProblemMessage(err) });
    }
  };

  const handlePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void upload(f);
    // Reset the input value so picking the same file twice still fires.
    e.target.value = '';
  };

  return (
    <div
      className="min-h-[calc(100vh-6rem)] flex flex-col -mx-4 sm:-mx-6 lg:-mx-10 -mt-4 sm:-mt-6 lg:-mt-10"
      style={{
        background:
          'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper-deep) 100%)',
      }}
    >
      {/* Hidden inputs — driven by the shutter / "from photos" buttons. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePicked}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,.jpg,.jpeg"
        className="hidden"
        onChange={handlePicked}
      />

      {/* Top row: dismiss + greeting */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className={cn(
            'h-10 w-10 rounded-full flex items-center justify-center',
            'bg-[var(--color-surface)] border border-[var(--color-rule)]',
            'text-[var(--color-ink)] text-lg leading-none',
            'hover:bg-[var(--color-paper-deep)] transition-colors',
          )}
        >
          ×
        </button>
        <span className="font-hand text-xl text-[var(--color-terracotta)] leading-none">
          say hi to a new entry
        </span>
        <span aria-hidden="true" className="w-10" />
      </div>

      {/* Title */}
      <div className="px-4 sm:px-6 pt-6 pb-4 text-center">
        <p className="font-hand text-xl text-[var(--color-terracotta)] leading-none">
          point and let go
        </p>
        <h1 className="mt-2 font-display italic font-medium text-3xl sm:text-4xl leading-none tracking-tight">
          Snap a receipt
        </h1>
      </div>

      {/* Viewframe */}
      <div className="flex-1 px-4 sm:px-6 pb-4 min-h-[260px] flex">
        <div
          className={cn(
            'relative flex-1 rounded-[28px] bg-[var(--color-surface)]',
            'flex items-center justify-center',
            'shadow-[inset_0_10px_32px_-12px_rgba(201,123,92,0.25)]',
          )}
          style={{
            border: '1px dashed var(--color-terracotta)',
          }}
        >
          {/* Reticle */}
          <div
            aria-hidden="true"
            className="relative h-16 w-16 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(201, 123, 92, 0.08)' }}
          >
            <span className="absolute h-px w-5 bg-[var(--color-terracotta)] opacity-60" />
            <span className="absolute w-px h-5 bg-[var(--color-terracotta)] opacity-60" />
          </div>

          {/* Hint or upload status */}
          <p
            className={cn(
              'absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap',
              'font-hand text-lg',
              state.kind === 'error'
                ? 'text-[var(--color-stamp)]'
                : 'text-[var(--color-terracotta)]',
            )}
          >
            {state.kind === 'uploading'
              ? `uploading ${state.filename}…`
              : state.kind === 'error'
                ? 'oops — try again ↓'
                : 'center it gently'}
          </p>
        </div>
      </div>

      {/* Error banner */}
      {state.kind === 'error' && (
        <div className="px-4 sm:px-6 pb-2">
          <p className="text-xs text-[var(--color-stamp)] text-center">{state.message}</p>
        </div>
      )}

      {/* Shutter row */}
      <div className="px-4 sm:px-6 pb-6 pt-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <OptButton
            label="From photos"
            disabled={state.kind === 'uploading'}
            onClick={() => galleryInputRef.current?.click()}
          />
          <ShutterButton
            uploading={state.kind === 'uploading'}
            onClick={() => cameraInputRef.current?.click()}
          />
          <OptButton
            label="Type it in"
            disabled
            hint="soon"
          />
        </div>
        <p className="mt-4 text-[10px] tracking-[0.18em] uppercase text-center text-[var(--color-ink-muted)]">
          Processed via Claude AI · Monitored by Langfuse
        </p>
      </div>
    </div>
  );
}

function ShutterButton({
  uploading,
  onClick,
}: {
  uploading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={uploading}
      aria-label="Capture receipt"
      className={cn(
        'relative h-[84px] w-[84px] rounded-full',
        'bg-[var(--color-terracotta)]',
        'shadow-[0_0_0_6px_var(--color-surface),0_0_0_7px_var(--color-terracotta)]',
        'transition-transform duration-150',
        uploading ? 'opacity-60 cursor-wait' : 'hover:scale-[0.97] active:scale-[0.94]',
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-3 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.2), transparent 60%), var(--color-terracotta-deep)',
        }}
      />
    </button>
  );
}

function OptButton({
  label,
  hint,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-14 rounded-[18px] px-2',
        'border border-[var(--color-rule)] bg-[var(--color-surface)]',
        'text-[10px] font-medium tracking-[0.18em] uppercase',
        'text-[var(--color-ink-muted)] leading-[1.2]',
        'transition-colors',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:border-[var(--color-terracotta)]/30 hover:text-[var(--color-ink)]',
      )}
    >
      {label}
      {hint && (
        <span className="block font-hand text-[var(--color-terracotta)] text-base tracking-normal normal-case mt-0.5">
          {hint}
        </span>
      )}
    </button>
  );
}
