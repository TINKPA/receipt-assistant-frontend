import React from 'react';
import { X, Upload, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { uploadReceipt } from '../lib/api';
import { cn } from '../lib/utils';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (job: { jobId: string; receiptId: string }) => void;
}

type UploadState = 'idle' | 'uploading' | 'error';

export default function AddTransactionModal({ isOpen, onClose, onComplete }: AddTransactionModalProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [state, setState] = React.useState<UploadState>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setState('idle');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setState('uploading');
    setError(null);

    try {
      const result = await uploadReceipt(file);
      // Close immediately — processing happens in background
      onComplete?.({ jobId: result.jobId, receiptId: result.receiptId });
      handleClose();
    } catch (err: any) {
      setState('error');
      setError(err.message);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-background/40 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="glass-panel w-full max-w-lg rounded-[2rem] overflow-hidden flex flex-col relative border border-primary/20 shadow-2xl"
          >
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <h2 className="text-xl font-bold tracking-tight text-white font-headline">Upload Receipt</h2>
              <button
                onClick={handleClose}
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-8 pb-8 space-y-6">
              {/* File Drop Zone */}
              <div
                onClick={() => state === 'idle' && fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer",
                  file ? "border-primary/30 bg-primary/5" : "border-outline-variant/20 hover:border-primary/20 hover:bg-surface-container-high/30"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,.jpg,.jpeg"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {file ? (
                  <div className="space-y-2">
                    <Upload className="mx-auto text-primary" size={32} />
                    <p className="text-sm font-bold text-white">{file.name}</p>
                    <p className="text-xs text-on-surface-variant">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="mx-auto text-on-surface-variant" size={32} />
                    <p className="text-sm text-on-surface-variant">Click to select a receipt image</p>
                    <p className="text-xs text-on-surface-variant/50">JPG only, up to 20MB</p>
                  </div>
                )}
              </div>

              {/* Error state */}
              {state === 'error' && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-container-lowest">
                  <AlertCircle className="text-error" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">Error</p>
                    <p className="text-xs text-error mt-1">{error}</p>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2">
                {state === 'idle' && (
                  <button
                    onClick={handleUpload}
                    disabled={!file}
                    className={cn(
                      "w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2",
                      file
                        ? "bg-primary text-on-primary hover:scale-[1.02] active:scale-95 shadow-lg shadow-primary/20"
                        : "bg-surface-container-highest text-on-surface-variant cursor-not-allowed"
                    )}
                  >
                    Process Receipt
                    <ArrowRight size={20} />
                  </button>
                )}
                {state === 'uploading' && (
                  <button
                    disabled
                    className="w-full py-4 rounded-xl bg-primary/50 text-on-primary font-bold text-lg flex items-center justify-center gap-2"
                  >
                    <Loader2 className="animate-spin" size={20} />
                    Uploading...
                  </button>
                )}
                {state === 'error' && (
                  <button
                    onClick={reset}
                    className="w-full py-4 rounded-xl bg-error text-on-error font-bold text-lg hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    Try Again
                  </button>
                )}
              </div>

              <p className="text-[10px] text-center text-on-surface-variant opacity-60 uppercase tracking-[0.1em]">
                Processed via Claude AI • Monitored by Langfuse
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
