import React, { useEffect, useRef, useState } from 'react';
import { ingestBatch, extractProblemMessage } from '../lib/api';
import { cn } from '../lib/utils';

interface CaptureProps {
  onCancel: () => void;
  onComplete: (job: { batchId: string; ingestId: string; filename: string }) => void;
}

type CameraState =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'streaming' }
  | { kind: 'denied'; message: string }
  | { kind: 'unsupported' };

type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string }
  | { kind: 'error'; message: string };

/**
 * Full-screen capture surface — Variant B fig.04, live-camera edition.
 *
 * On mount we request the rear camera via `getUserMedia({ video:
 * { facingMode: 'environment' } })` and stream it into the viewfinder.
 * Tapping the shutter draws the current frame to an offscreen canvas
 * and posts it through the existing `ingestBatch` upload path. If the
 * browser refuses (older Safari, permission denied, non-secure
 * context, no camera) we gracefully fall back to the system file
 * picker behind the same shutter button.
 *
 * Backend: real, via openapi-fetch (memory feedback_no_mock_api.md).
 */
export default function Capture({ onCancel, onComplete }: CaptureProps) {
  const [camera, setCamera] = useState<CameraState>({ kind: 'idle' });
  const [upload, setUpload] = useState<UploadState>({ kind: 'idle' });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Acquire / release the camera stream alongside the component lifecycle.
  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCamera({ kind: 'unsupported' });
        return;
      }
      setCamera({ kind: 'requesting' });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Older WebKit versions ignore the autoplay attribute on
          // freshly-bound srcObject; calling play() defensively is safe
          // because the user gesture that opened this route still counts.
          videoRef.current.play().catch(() => {/* swallow — UI shows fallback */});
        }
        setCamera({ kind: 'streaming' });
      } catch (err: unknown) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
              ? 'Camera permission denied.'
              : err.name === 'NotFoundError' || err.name === 'OverconstrainedError'
                ? 'No camera available on this device.'
                : err.message
            : 'Camera unavailable.';
        setCamera({ kind: 'denied', message });
      }
    };

    void start();

    return () => {
      cancelled = true;
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Board screens 14-15: the shutter no longer uploads immediately. Each
  // shot (or picked file) lands in `pending` and the confirm stage offers
  // Retake / + Add another / Process — multi-shot batches ride the same
  // ingestBatch call the single-shot path always used.
  const [pending, setPending] = useState<Array<{ file: File; url: string }>>([]);
  // `reviewing` flips to the confirm stage after each shot; "+ Add another"
  // drops back to the camera with the batch intact (count badge on shutter).
  const [reviewing, setReviewing] = useState(false);

  const addPending = (file: File) => {
    setPending((p) => [...p, { file, url: URL.createObjectURL(file) }]);
    setReviewing(true);
  };
  const dropLastPending = () => {
    setPending((p) => {
      const last = p[p.length - 1];
      if (last) URL.revokeObjectURL(last.url);
      return p.slice(0, -1);
    });
    setReviewing(false);
  };
  useEffect(
    () => () => {
      // Revoke preview URLs on unmount.
      setPending((p) => {
        p.forEach((x) => URL.revokeObjectURL(x.url));
        return [];
      });
    },
    [],
  );
  // The confirm stage unmounts the <video>; re-attach the live stream when
  // the user returns to the camera ("+ Add another" / "Retake").
  useEffect(() => {
    if (!reviewing && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [reviewing]);

  const sendPending = async () => {
    const files = pending.map((p) => p.file);
    if (files.length === 0) return;
    setUpload({ kind: 'uploading', filename: files[0].name });
    try {
      const result = await ingestBatch(files);
      const first = result.items[0];
      if (!first) {
        throw new Error('Upload accepted but server returned no ingest items.');
      }
      pending.forEach((p) => URL.revokeObjectURL(p.url));
      setPending([]);
      onComplete({
        batchId: result.batchId,
        ingestId: first.ingestId,
        filename: first.filename,
      });
    } catch (err: unknown) {
      setUpload({ kind: 'error', message: extractProblemMessage(err) });
    }
  };

  const handleShutter = async () => {
    if (upload.kind === 'uploading') return;

    // If the live stream is up, snapshot a frame from <video>.
    if (camera.kind === 'streaming' && videoRef.current) {
      const video = videoRef.current;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w === 0 || h === 0) {
        // Stream hasn't produced a frame yet — fall through to the file picker.
        cameraInputRef.current?.click();
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        cameraInputRef.current?.click();
        return;
      }
      ctx.drawImage(video, 0, 0, w, h);
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92),
      );
      if (!blob) {
        setUpload({ kind: 'error', message: 'Could not encode snapshot.' });
        return;
      }
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      addPending(file);
      return;
    }

    // No live stream — fall back to the system camera picker.
    cameraInputRef.current?.click();
  };

  const handlePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) addPending(f);
    e.target.value = '';
  };

  const isStreaming = camera.kind === 'streaming';
  const showCameraFallbackHint = camera.kind === 'denied' || camera.kind === 'unsupported';

  // ── Confirm stage (board screen 15) ───────────────────────────
  if (reviewing && pending.length > 0) {
    const last = pending[pending.length - 1];
    const totalKB = Math.round(pending.reduce((s, p) => s + p.file.size, 0) / 1024);
    const uploading = upload.kind === 'uploading';
    return (
      <div className="-mx-4 -mt-4 flex min-h-[100dvh] flex-col bg-[var(--color-paper)] px-4 pt-4 sm:-mx-6 sm:-mt-6 sm:px-6 lg:-mx-10 lg:-mt-10">
        <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col">
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={dropLastPending}
              aria-label="Retake"
              className="flex h-9 w-9 items-center justify-center rounded-full border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] text-[15px]"
            >
              ←
            </button>
            <div className="text-center">
              <p className="font-display text-[17px] font-medium leading-tight">Captured</p>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                {pending.length} of {pending.length} · ready to extract
              </p>
            </div>
            <span aria-hidden="true" className="w-9" />
          </div>

          <div className="relative mt-4 flex-1 overflow-hidden rounded-[20px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-ink)]">
            <img src={last.url} alt="Captured receipt" className="absolute inset-0 h-full w-full object-contain" />
            <span className="absolute bottom-3 left-3 rounded-full bg-[color:rgba(251,247,238,0.92)] px-2.5 py-1 font-mono text-[8.5px] tracking-[0.04em] text-[var(--color-ink-soft)]">
              {totalKB} KB{pending.length > 1 ? ` · ${pending.length} shots` : ''}
            </span>
          </div>

          {upload.kind === 'error' && (
            <p className="mt-2 text-center text-xs text-[var(--color-stamp)]">{upload.message}</p>
          )}

          <div className="space-y-2 pb-6 pt-4">
            <button
              type="button"
              disabled={uploading}
              onClick={() => void sendPending()}
              className="block w-full rounded-[14px] bg-[var(--color-ink)] py-3.5 text-center font-display text-[15px] font-medium text-[var(--color-paper)] transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : pending.length > 1 ? `Process ${pending.length} now` : 'Use this · Process now'}
              <span className="block font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-paper-fold)]">
                extraction starts immediately · live trace follows
              </span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => setReviewing(false)}
                className="rounded-[14px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] py-2.5 font-display text-[13px] font-medium text-[var(--color-ink-soft)] disabled:opacity-60"
              >
                + Add another
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={dropLastPending}
                className="rounded-[14px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] py-2.5 font-display text-[13px] font-medium text-[var(--color-ink-soft)] disabled:opacity-60"
              >
                Retake
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[calc(100vh-6rem)] flex flex-col -mx-4 sm:-mx-6 lg:-mx-10 -mt-4 sm:-mt-6 lg:-mt-10"
      style={{
        background:
          'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper-deep) 100%)',
      }}
    >
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
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handlePicked}
      />

      {/* Top row */}
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
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)] leading-none">
          new entry
        </span>
        <span aria-hidden="true" className="w-10" />
      </div>

      {/* Title */}
      <div className="px-4 sm:px-6 pt-6 pb-4 text-center">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-accent)] leading-none">
          point · hold steady · let go
        </p>
        <h1 className="mt-2 font-display font-medium text-3xl sm:text-4xl leading-none tracking-tight">
          Snap a receipt
        </h1>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 px-4 sm:px-6 pb-4 min-h-[260px] flex">
        <div
          className={cn(
            'relative flex-1 rounded-[28px] overflow-hidden',
            'flex items-center justify-center',
            isStreaming ? 'bg-[var(--color-ink)]' : 'bg-[var(--color-surface)]',
            !isStreaming &&
              'shadow-[inset_0_10px_32px_-12px_rgba(201,123,92,0.25)]',
          )}
          style={{
            border: isStreaming
              ? '1px solid var(--color-terracotta)'
              : '1px dashed var(--color-terracotta)',
          }}
        >
          {/* The live preview — hidden until streaming so the cream
              placeholder can show through. */}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={cn(
              'absolute inset-0 h-full w-full object-cover',
              isStreaming ? 'opacity-100' : 'opacity-0',
              'transition-opacity duration-300',
            )}
          />

          {/* Corner ticks — only when streaming, to suggest the framing. */}
          {isStreaming && (
            <>
              <CornerTick className="top-3 left-3" corner="tl" />
              <CornerTick className="top-3 right-3" corner="tr" />
              <CornerTick className="bottom-3 left-3" corner="bl" />
              <CornerTick className="bottom-3 right-3" corner="br" />
            </>
          )}

          {/* Idle reticle — only when there is nothing to look at. */}
          {!isStreaming && (
            <div
              aria-hidden="true"
              className="relative h-16 w-16 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(201, 123, 92, 0.08)' }}
            >
              <span className="absolute h-px w-5 bg-[var(--color-terracotta)] opacity-60" />
              <span className="absolute w-px h-5 bg-[var(--color-terracotta)] opacity-60" />
            </div>
          )}

          {/* Hint line at the bottom of the viewfinder */}
          <p
            className={cn(
              'absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap',
              'font-mono text-[10px] tracking-[0.04em] px-3 py-1.5 rounded-full',
              upload.kind === 'error' ? 'text-[var(--color-stamp)]' :
                isStreaming ? 'text-[var(--color-paper)] bg-[var(--color-ink)]/55' :
                  'text-[var(--color-terracotta)]',
            )}
          >
            {upload.kind === 'uploading'
              ? `uploading ${upload.filename}…`
              : upload.kind === 'error'
                ? 'oops — try again ↓'
                : camera.kind === 'requesting'
                  ? 'opening the camera…'
                  : showCameraFallbackHint
                    ? 'tap to use system camera or photos'
                    : isStreaming
                      ? 'center it gently'
                      : 'center it gently'}
          </p>
        </div>
      </div>

      {/* Diagnostic banner — only on real errors / hard failures */}
      {(upload.kind === 'error' || camera.kind === 'denied') && (
        <div className="px-4 sm:px-6 pb-2">
          <p className="text-xs text-[var(--color-stamp)] text-center">
            {upload.kind === 'error' ? upload.message : ''}
            {camera.kind === 'denied' && upload.kind !== 'error' && camera.message}
          </p>
        </div>
      )}

      {/* Shutter row */}
      <div className="px-4 sm:px-6 pb-6 pt-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <OptButton
            label="From photos"
            disabled={upload.kind === 'uploading'}
            onClick={() => galleryInputRef.current?.click()}
          />
          <ShutterButton
            uploading={upload.kind === 'uploading'}
            streaming={isStreaming}
            onClick={handleShutter}
          />
          {pending.length > 0 ? (
            <OptButton
              label={`Batch · ${pending.length}`}
              hint="review →"
              onClick={() => setReviewing(true)}
            />
          ) : (
            <OptButton label="Type it in" disabled hint="soon" />
          )}
        </div>
        <p className="mt-4 text-[10px] tracking-[0.18em] uppercase text-center text-[var(--color-ink-muted)]">
          Processed via Claude AI · Monitored by Langfuse
        </p>
      </div>
    </div>
  );
}

function CornerTick({
  corner,
  className,
}: {
  corner: 'tl' | 'tr' | 'bl' | 'br';
  className?: string;
}) {
  const border = {
    tl: 'border-l-2 border-t-2',
    tr: 'border-r-2 border-t-2',
    bl: 'border-l-2 border-b-2',
    br: 'border-r-2 border-b-2',
  }[corner];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute h-6 w-6 border-[var(--color-terracotta)]',
        border,
        className,
      )}
    />
  );
}

function ShutterButton({
  uploading,
  streaming,
  onClick,
}: {
  uploading: boolean;
  streaming: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={uploading}
      aria-label={streaming ? 'Capture frame' : 'Capture receipt'}
      className={cn(
        'relative h-[84px] w-[84px] rounded-full',
        'bg-[var(--color-terracotta)]',
        'shadow-[0_0_0_6px_var(--color-surface),0_0_0_7px_var(--color-terracotta)]',
        'transition-transform duration-150',
        uploading
          ? 'opacity-60 cursor-wait'
          : 'hover:scale-[0.97] active:scale-[0.94]',
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
        <span className="block font-mono text-[var(--color-accent)] text-[9px] tracking-[0.06em] normal-case mt-0.5">
          {hint}
        </span>
      )}
    </button>
  );
}
