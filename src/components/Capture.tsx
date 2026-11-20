import React, { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ingestBatch, extractProblemMessage } from '../lib/api';
import { captureWishItem, isHeic, type CaptureResult } from '../lib/api/things';
import { wishProblemMessage } from '../lib/wishPlaces';
import { cn } from '../lib/utils';

/** What the picture is for. `receipt`: one or more documents, extracted
 *  into the ledger. `want`: one image of something recommended (a
 *  restaurant, mostly), saved to Wanting and read in the background. */
export type CaptureMode = 'receipt' | 'want';

interface CaptureProps {
  onCancel: () => void;
  onComplete: (job: { batchId: string; ingestId: string; filename: string }) => void;
  /** Which mode the screen opens in. The user can switch; the choice is
   *  always theirs, never inferred from the picture. */
  initialMode?: CaptureMode;
  /** Want mode: the image is stored and its wish is being read, or (with
   *  `existing`) the same image was saved before and that wish is back. */
  onWantSaved?: (result: CaptureResult) => void;
  /** The user switched mode; the caller keeps it in the URL so a reload
   *  opens the same mode. */
  onModeChange?: (mode: CaptureMode) => void;
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
const IMAGE_NAME = /\.(jpe?g|png|gif|webp|avif|bmp|heic|heif)$/i;

/** The first file the browser cannot read, or null. */
async function firstUnreadable(files: File[]): Promise<File | null> {
  for (const f of files) {
    try {
      await f.slice(0, 1).arrayBuffer();
    } catch {
      return f;
    }
  }
  return null;
}

/** The sentence for an upload that never got an answer from the server
 *  (fetch rejected: offline, server down), else null. */
function uploadFailure(err: unknown): string | null {
  // Chrome says "Failed to fetch", Safari "Load failed", Firefox
  // "NetworkError when attempting to fetch resource."
  return err instanceof TypeError && /fetch|load failed|network/i.test(err.message)
    ? "Couldn't reach the server. Check the connection and try again."
    : null;
}

export default function Capture({
  onCancel,
  onComplete,
  initialMode = 'receipt',
  onWantSaved,
  onModeChange,
}: CaptureProps) {
  const [mode, setMode] = useState<CaptureMode>(initialMode);
  const want = mode === 'want';
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
        let message = 'Camera unavailable.';
        if (err instanceof Error) {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            message = 'Camera permission denied.';
          } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
            message = 'No camera available on this device.';
          } else {
            message = err.message;
          }
        }
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

  // A blob URL only renders in an <img> when the blob is actually an image.
  // PDFs and saved HTML receipts are valid uploads with no thumbnail, so the
  // confirm stage shows them a document card rather than a broken image.
  // The name is the fallback: some pickers leave `type` empty.
  const isImageFile = (file: File) =>
    file.type.startsWith('image/') ||
    isHeic(file) ||
    (file.type === '' && IMAGE_NAME.test(file.name));
  const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isHtml = (file: File) => file.type === 'text/html' || /\.html?$/i.test(file.name);
  // Neither the browser nor the name says what it is: preview it as an
  // image if it decodes, and let the server decide.
  const isUnknownFile = (file: File) =>
    file.type === '' && !isImageFile(file) && !isPdf(file) && !isHtml(file);
  const documentKind = (file: File) => {
    if (isHeic(file)) return 'HEIC photo · converted on upload';
    if (isImageFile(file)) return 'Image';
    if (isPdf(file)) return 'PDF document';
    if (isHtml(file)) return 'Saved web page';
    if (isUnknownFile(file)) return 'File';
    return 'Not an image or document';
  };
  // Only Safari decodes HEIC; elsewhere its preview fails and the confirm
  // stage shows the file card instead. Keyed by blob URL, so a new shot
  // gets its own try.
  const [unpreviewable, setUnpreviewable] = useState<string | null>(null);

  const addPending = (file: File) => {
    const shot = { file, url: URL.createObjectURL(file) };
    // A want is one image, so a new shot replaces the one before it.
    setPending((p) => {
      if (!want) return [...p, shot];
      p.forEach((x) => URL.revokeObjectURL(x.url));
      return [shot];
    });
    setReviewing(true);
  };
  // The two modes upload to different places, so shots taken for one are
  // not carried into the other.
  const switchMode = (next: CaptureMode) => {
    if (next === mode || upload.kind === 'uploading') return;
    setPending((p) => {
      p.forEach((x) => URL.revokeObjectURL(x.url));
      return [];
    });
    setUpload({ kind: 'idle' });
    setMode(next);
    onModeChange?.(next);
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
    // A file the browser cannot read (moved, deleted, or out of reach since
    // it was picked) would otherwise fail inside fetch as "Failed to fetch".
    const unreadable = await firstUnreadable(want ? files.slice(-1) : files);
    if (unreadable) {
      setUpload({
        kind: 'error',
        message: `${unreadable.name} could not be read. Pick it again.`,
      });
      return;
    }
    if (want) {
      try {
        const result = await captureWishItem(files[files.length - 1]);
        pending.forEach((p) => URL.revokeObjectURL(p.url));
        setPending([]);
        onWantSaved?.(result);
      } catch (err: unknown) {
        setUpload({ kind: 'error', message: uploadFailure(err) ?? wishProblemMessage(err) });
      }
      return;
    }
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
      setUpload({ kind: 'error', message: uploadFailure(err) ?? extractProblemMessage(err) });
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
  // /add hangs off the root route, not `_shell`, so there is no parent
  // padding for a `-mx-4 -mt-4` to cancel: both stages take their 16px
  // gutter from their own padding (see AddManually).
  if (reviewing && pending.length > 0) {
    const last = pending[pending.length - 1];
    const totalKB = Math.round(pending.reduce((s, p) => s + p.file.size, 0) / 1024);
    const uploading = upload.kind === 'uploading';
    // Wanting takes an image and nothing else; say so before the upload.
    const notAnImage = want && !isImageFile(last.file) && !isUnknownFile(last.file);
    return (
      <div className="flex min-h-[100dvh] flex-col bg-[var(--color-paper)] px-4 pt-4 sm:px-6">
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
                {notAnImage
                  ? 'not an image · cannot be saved'
                  : want
                    ? 'one image · ready to read'
                    : `${pending.length} of ${pending.length} · ready to extract`}
              </p>
            </div>
            <span aria-hidden="true" className="w-9" />
          </div>

          <div className="relative mt-4 flex-1 overflow-hidden rounded-[20px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-ink)]">
            {(isImageFile(last.file) || isUnknownFile(last.file)) && unpreviewable !== last.url ? (
              <img
                src={last.url}
                alt={want ? 'Captured image' : 'Captured receipt'}
                onError={() => setUnpreviewable(last.url)}
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
                <span aria-hidden="true" className="text-[34px] leading-none text-[var(--color-paper-fold)]">
                  ▤
                </span>
                <p className="break-all font-display text-[15px] font-medium leading-snug text-[var(--color-paper)]">
                  {last.file.name}
                </p>
                <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-paper-fold)]">
                  {documentKind(last.file)}
                </p>
              </div>
            )}
            <span className="absolute bottom-3 left-3 rounded-full bg-[color:rgba(251,247,238,0.92)] px-2.5 py-1 font-mono text-[8.5px] tracking-[0.04em] text-[var(--color-ink-soft)]">
              {totalKB} KB
              {pending.length > 1
                ? ` · ${pending.length} ${pending.every((p) => isImageFile(p.file)) ? 'shots' : 'files'}`
                : ''}
            </span>
          </div>

          {notAnImage ? (
            <p className="mt-2 text-center text-xs text-[var(--color-stamp)]">
              Only an image can be saved to Wanting. Pick a screenshot or a photo.
            </p>
          ) : (
            upload.kind === 'error' && (
              <p className="mt-2 text-center text-xs text-[var(--color-stamp)]">{upload.message}</p>
            )
          )}

          <div className="space-y-2 pb-6 pt-4">
            <button
              type="button"
              disabled={uploading || notAnImage}
              onClick={() => void sendPending()}
              className="block w-full rounded-[14px] bg-[var(--color-ink)] py-3.5 text-center font-display text-[15px] font-medium text-[var(--color-paper)] transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {(() => {
                if (uploading) return 'Uploading…';
                if (want) return 'Use this · Save to Wanting';
                return pending.length > 1 ? `Process ${pending.length} now` : 'Use this · Process now';
              })()}
              <span className="block font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-paper-fold)]">
                {want
                  ? 'read in the background · matched to the place'
                  : 'extraction starts immediately · live trace follows'}
              </span>
            </button>
            <div className={cn('grid gap-2', want ? 'grid-cols-1' : 'grid-cols-2')}>
              {!want && (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setReviewing(false)}
                  className="rounded-[14px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] py-2.5 font-display text-[13px] font-medium text-[var(--color-ink-soft)] disabled:opacity-60"
                >
                  + Add another
                </button>
              )}
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
      // /add has no dock or shell around it, so the gradient fills the
      // whole viewport (a `-6rem` left for a dock that is not there
      // showed as a lighter band under the last line).
      className="min-h-[100dvh] flex flex-col"
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
      {/* Saved web receipts (Square, Toast, most online-order confirmations) arrive
          as an HTML page, so `text/html` belongs here alongside images and PDFs —
          the backend classifies them as receipt_email and extracts them fine. The
          bare `.html` extension is a deliberate duplicate: iOS Safari and Android
          Chrome apply non-media MIME types in `accept` inconsistently and will grey
          the files out without it. */}
      <input
        ref={galleryInputRef}
        type="file"
        accept={want ? 'image/*,.heic,.heif' : 'image/*,application/pdf,text/html,.html'}
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
        {/* Receipt | Want. Explicit on purpose: the two go to different
            places (the ledger, the wishlist), and a wrong guess from the
            picture would file a restaurant tip as a purchase. */}
        <div
          role="tablist"
          aria-label="What is this picture for"
          className="flex rounded-full border border-[var(--color-rule)] bg-[var(--color-paper-deep)] p-[3px]"
        >
          {(['receipt', 'want'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              disabled={upload.kind === 'uploading'}
              onClick={() => switchMode(m)}
              className={cn(
                'min-w-[84px] rounded-full px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] transition-colors',
                mode === m
                  ? 'bg-[var(--color-ink)] text-[var(--color-paper)]'
                  : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <span aria-hidden="true" className="w-10" />
      </div>

      {/* Title */}
      <div className="px-4 sm:px-6 pt-6 pb-4 text-center">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-accent)] leading-none">
          {want ? 'a screenshot · a menu · a storefront' : 'point · hold steady · let go'}
        </p>
        <h1 className="mt-2 font-display font-medium text-3xl sm:text-4xl leading-none tracking-tight">
          {want ? 'Save a place to go' : 'Snap a receipt'}
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
            {(() => {
              if (upload.kind === 'uploading') return `uploading ${upload.filename}…`;
              if (upload.kind === 'error') return 'oops — try again ↓';
              if (camera.kind === 'requesting') return 'opening the camera…';
              if (showCameraFallbackHint) return 'tap to use system camera or photos';
              return 'center it gently';
            })()}
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
            /* The slot that used to hold a disabled "Type it in · soon"
               placeholder. That promise is kept by the entry below now, and
               a greyed-out twin of a working link reads as broken — so the
               slot is an invisible spacer, which also keeps the shutter
               optically centred in the 1fr_auto_1fr grid. */
            <span aria-hidden="true" className="h-14" />
          )}
        </div>

        {/* No-receipt entry (#150). Below the capture options, not among
            them: this path doesn't produce a document, so it doesn't
            belong in a row of ways to supply one. */}
        <div className="mt-5 border-t-[0.5px] border-[var(--color-rule)] pt-4">
          {want ? (
            <p className="px-2 text-center text-[12px] leading-snug text-[var(--color-ink-muted)]">
              One image at a time. It is saved to Wanting and read for you: a place is matched
              on the map and filed under Places, a thing to buy goes under Things.
            </p>
          ) : (
            <Link
              to="/add-manual"
              className="group flex items-center justify-between rounded-[14px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-3 transition-colors hover:border-[var(--color-accent)]"
            >
              <span className="min-w-0">
                <span className="block font-display text-[14px] font-medium leading-tight">
                  No receipt? Record it manually
                </span>
                {/* Each phrase stays whole: on a narrow phone the line
                    breaks at a dot, never inside "keep it in things". */}
                <span className="mt-0.5 block font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                  {['type the amount', 'add a line item', 'keep it in things'].map((phrase, i) => (
                    <Fragment key={phrase}>
                      {i > 0 && ' · '}
                      <span className="whitespace-nowrap">{phrase}</span>
                    </Fragment>
                  ))}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="ml-3 shrink-0 font-mono text-[13px] text-[var(--color-accent)] transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          )}
        </div>

        <p className="mt-4 text-[10px] tracking-[0.18em] uppercase text-center text-[var(--color-ink-muted)]">
          Processed via Claude AI
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
