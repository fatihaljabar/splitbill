import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  Check,
  Crop,
  Flashlight,
  FlashlightOff,
  ImagePlus,
  Loader2,
  RotateCw,
  SwitchCamera,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { cropImageToCanvas, forceNormalizeQtyPrice, preprocessImage, runOcr } from '../lib/ocr';
import { uid } from '../lib/format';
import type { BillItem, OcrResult } from '../types';

type Phase = 'choose' | 'camera' | 'preview' | 'crop' | 'processing';

export function ScanPage() {
  const { tr, currentBill, updateBill, setCurrentBill, createEmptyBill, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { image?: string; camera?: boolean } | null;

  const [phase, setPhase] = useState<Phase>('choose');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [flashOn, setFlashOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [progress, setProgress] = useState(0);
  const [statusKey, setStatusKey] = useState('detecting');
  const [cropRect, setCropRect] = useState({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
  const [dragging, setDragging] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const cropBoxRef = useRef<HTMLDivElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // Try flash
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
      if (caps?.torch && flashOn) {
        await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
      }
      setPhase('camera');
    } catch {
      toast(tr('cameraError'), 'error');
      setPhase('choose');
    }
  }, [facingMode, flashOn, stopCamera, toast, tr]);

  useEffect(() => {
    if (!currentBill) {
      setCurrentBill(createEmptyBill());
    }
  }, [currentBill, createEmptyBill, setCurrentBill]);

  useEffect(() => {
    if (state?.image) {
      setImageSrc(state.image as string);
      setPhase('preview');
    } else if (state?.camera) {
      startCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'camera') startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const data = canvas.toDataURL('image/jpeg', 0.92);
    setImageSrc(data);
    stopCamera();
    setPhase('preview');
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setPhase('preview');
    };
    reader.readAsDataURL(file);
  };

  const runScan = async (src: string) => {
    setPhase('processing');
    setProgress(0);
    try {
      setStatusKey('enhancing');
      const processed = await preprocessImage(src, { rotate: rotation });
      setStatusKey('readingText');
      const result = await runOcr(processed, (status, p) => {
        setProgress(p);
        if (status === 'recognizing') setStatusKey('readingText');
        if (status === 'parsing') setStatusKey('parsing');
        if (status === 'done') setStatusKey('almostDone');
      });
      applyOcrToReview(result, processed.toDataURL('image/jpeg', 0.85));
    } catch (e) {
      console.error(e);
      toast(tr('ocrFailed'), 'error');
      setPhase('preview');
    }
  };

  const runCroppedScan = async () => {
    if (!imageSrc || !imgRef.current) {
      if (imageSrc) await runScan(imageSrc);
      return;
    }
    setPhase('processing');
    try {
      setStatusKey('enhancing');
      const img = imgRef.current;
      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;
      const crop = {
        x: cropRect.x * naturalW,
        y: cropRect.y * naturalH,
        w: cropRect.w * naturalW,
        h: cropRect.h * naturalH,
      };
      // Load full image for crop
      const full = await loadHtmlImage(imageSrc);
      const cropped = cropImageToCanvas(full, crop);
      const processed = await preprocessImage(cropped, { rotate: rotation });
      setStatusKey('readingText');
      const result = await runOcr(processed, (status, p) => {
        setProgress(p);
        if (status === 'recognizing') setStatusKey('readingText');
        if (status === 'parsing') setStatusKey('parsing');
      });
      applyOcrToReview(result, processed.toDataURL('image/jpeg', 0.85));
    } catch (e) {
      console.error(e);
      toast(tr('ocrFailed'), 'error');
      setPhase('crop');
    }
  };

  const applyOcrToReview = (result: OcrResult, receiptDataUrl: string) => {
    // Keep OCR money values as fixed amounts (accurate for PB1 / ongkir / layanan)
    updateBill({
      storeName: result.storeName || currentBill?.storeName,
      date: result.date || currentBill?.date,
      receiptImage: receiptDataUrl,
      tax: result.tax || 0,
      taxIsPercent: false,
      serviceCharge: result.serviceCharge || 0,
      serviceChargeIsPercent: false,
      discount: result.discount || 0,
      discountIsPercent: false,
      extraFees: result.extraFees || 0,
      totalOverride: result.total || undefined,
    });

    // Stash OCR items — force qty/unit-price normalize one more time before UI
    const reviewItems = result.items.map((it) => {
      const n = forceNormalizeQtyPrice(it);
      return {
        id: uid(),
        name: n.name,
        price: n.price,
        qty: n.qty,
      };
    });
    sessionStorage.setItem(
      'ocr_review',
      JSON.stringify({
        items: reviewItems,
        tax: result.tax || 0,
        serviceCharge: result.serviceCharge || 0,
        discount: result.discount || 0,
        extraFees: result.extraFees || 0,
        subtotal: result.subtotal || 0,
        total: result.total || 0,
        storeName: result.storeName,
        date: result.date,
        rawText: result.rawText,
      })
    );
    navigate('/review');
  };

  const toggleFlash = async () => {
    const next = !flashOn;
    setFlashOn(next);
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
    } catch {
      /* torch not supported */
    }
  };

  // Crop drag handlers (normalized 0-1)
  const onCropPointer = (e: React.PointerEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onCropMove = (e: React.PointerEvent) => {
    if (!dragging || !cropBoxRef.current) return;
    const rect = cropBoxRef.current.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setCropRect((c) => {
      const next = { ...c };
      if (dragging === 'move') {
        // handled separately
        return c;
      }
      if (dragging.includes('l')) {
        const right = c.x + c.w;
        next.x = Math.min(nx, right - 0.1);
        next.w = right - next.x;
      }
      if (dragging.includes('r')) {
        next.w = Math.max(0.1, nx - c.x);
      }
      if (dragging.includes('t')) {
        const bottom = c.y + c.h;
        next.y = Math.min(ny, bottom - 0.1);
        next.h = bottom - next.y;
      }
      if (dragging.includes('b')) {
        next.h = Math.max(0.1, ny - c.y);
      }
      return next;
    });
  };

  const statusLabel = () => {
    const map: Record<string, string> = {
      detecting: tr('detecting'),
      enhancing: tr('enhancing'),
      readingText: tr('readingText'),
      parsing: tr('parsing'),
      almostDone: tr('almostDone'),
    };
    return map[statusKey] || tr('processing');
  };

  return (
    <div className="page-root flex flex-col gap-3 sm:gap-4">
      <div className="flex shrink-0 items-start gap-2 sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={() => {
            stopCamera();
            if (phase === 'preview' || phase === 'crop') {
              setImageSrc(null);
              setPhase('choose');
              return;
            }
            if (phase === 'camera') {
              setPhase('choose');
              return;
            }
            if (phase === 'processing') return;
            // From choose: go home (or bill if editing)
            if (currentBill && (currentBill.items.length > 0 || currentBill.eventName)) {
              navigate('/bill');
            } else {
              navigate('/');
            }
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
          aria-label={tr('back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-semibold sm:text-lg">{tr('scanReceipt')}</h1>
          <p className="text-[11px] text-neutral-500 sm:text-xs">{tr('tipCamera')}</p>
        </div>
      </div>

      {phase === 'choose' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex w-full flex-col gap-3 sm:gap-4 md:mx-auto md:max-w-3xl lg:max-w-4xl lg:grid lg:grid-cols-5 lg:items-start lg:gap-5"
        >
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-5 text-center sm:rounded-3xl sm:p-6 lg:col-span-3 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 sm:h-14 sm:w-14 dark:bg-neutral-800">
              <Camera className="h-5 w-5 text-neutral-600 sm:h-6 sm:w-6 dark:text-neutral-300" />
            </div>
            <p className="mb-1 text-sm font-medium">{tr('dragDrop')}</p>
            <p className="mb-4 text-xs text-neutral-500">{tr('or')}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={startCamera} className="h-11 w-full text-sm sm:w-auto">
                <Camera className="h-4 w-4" />
                {tr('openCamera')}
              </Button>
              <label className="inline-flex w-full sm:w-auto">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                />
                <span className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-5 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800">
                  <ImagePlus className="h-4 w-4" />
                  {tr('chooseFile')}
                </span>
              </label>
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 lg:col-span-2 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="mb-2 text-sm font-medium">{tr('tips')}</p>
            <ul className="space-y-1.5 text-xs text-neutral-500">
              <li>• {tr('tip1')}</li>
              <li>• {tr('tip2')}</li>
              <li>• {tr('tip3')}</li>
            </ul>
          </div>
        </motion.div>
      )}

      {phase === 'camera' && (
        <div className="camera-stage relative overflow-hidden rounded-2xl bg-black sm:rounded-3xl">
          <video
            ref={videoRef}
            playsInline
            muted
            className="aspect-[3/4] max-h-[min(72dvh,720px)] w-full object-cover landscape:aspect-video landscape:max-h-[min(70dvh,520px)]"
          />
          <div className="pointer-events-none absolute inset-4 rounded-2xl border-2 border-white/40 sm:inset-6" />
          <div
            className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-4 pt-12 landscape:pt-8"
            style={{ paddingBottom: 'max(1rem, var(--safe-bottom))' }}
          >
            <button
              type="button"
              onClick={toggleFlash}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
              aria-label={tr('flash')}
            >
              {flashOn ? <Flashlight className="h-5 w-5" /> : <FlashlightOff className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={capturePhoto}
              className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-white/20 sm:h-16 sm:w-16"
              aria-label={tr('takePhoto')}
            >
              <span className="h-10 w-10 rounded-full bg-white sm:h-12 sm:w-12" />
            </button>
            <button
              type="button"
              onClick={() => setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
              aria-label="Switch camera"
            >
              <SwitchCamera className="h-5 w-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setPhase('choose');
            }}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white"
            aria-label={tr('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {(phase === 'preview' || phase === 'crop') && imageSrc && (
        <div className="flex flex-col gap-3 sm:gap-4 md:mx-auto md:max-w-2xl">
          <div
            ref={cropBoxRef}
            className="relative overflow-hidden rounded-2xl bg-neutral-100 sm:rounded-3xl dark:bg-neutral-900"
            onPointerMove={phase === 'crop' ? onCropMove : undefined}
            onPointerUp={() => setDragging(null)}
            onPointerLeave={() => setDragging(null)}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="receipt"
              className="mx-auto max-h-[min(55dvh,560px)] w-full object-contain landscape:max-h-[min(62dvh,420px)]"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
            {phase === 'crop' && (
              <div
                className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                style={{
                  left: `${cropRect.x * 100}%`,
                  top: `${cropRect.y * 100}%`,
                  width: `${cropRect.w * 100}%`,
                  height: `${cropRect.h * 100}%`,
                }}
              >
                {['tl', 'tr', 'bl', 'br'].map((h) => (
                  <span
                    key={h}
                    onPointerDown={(e) => onCropPointer(e, h)}
                    className={`absolute h-5 w-5 touch-none rounded-full bg-white shadow sm:h-4 sm:w-4 ${
                      h === 'tl'
                        ? '-left-2.5 -top-2.5 sm:-left-2 sm:-top-2'
                        : h === 'tr'
                          ? '-right-2.5 -top-2.5 sm:-right-2 sm:-top-2'
                          : h === 'bl'
                            ? '-bottom-2.5 -left-2.5 sm:-bottom-2 sm:-left-2'
                            : '-bottom-2.5 -right-2.5 sm:-bottom-2 sm:-right-2'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="scroll-x-soft flex gap-2 pb-0.5">
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setRotation((r) => (r + 90) % 360)}
            >
              <RotateCw className="h-4 w-4" />
              {tr('rotate')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setPhase(phase === 'crop' ? 'preview' : 'crop')}
            >
              <Crop className="h-4 w-4" />
              {tr('crop')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setImageSrc(null);
                setPhase('choose');
              }}
            >
              {tr('retake')}
            </Button>
          </div>

          <Button
            size="lg"
            fullWidth
            onClick={() => (phase === 'crop' ? runCroppedScan() : runScan(imageSrc))}
          >
            <Check className="h-4 w-4" />
            {phase === 'crop' ? tr('apply') : tr('usePhoto')}
          </Button>
        </div>
      )}

      {phase === 'processing' && (
        <div className="flex flex-col items-center gap-5 px-2 py-12 sm:gap-6 sm:py-16">
          <div className="relative flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20">
            <Loader2 className="h-10 w-10 animate-spin text-neutral-800 sm:h-12 sm:w-12 dark:text-neutral-200" />
          </div>
          <div className="px-4 text-center">
            <p className="text-sm font-medium sm:text-base">{tr('scanning')}</p>
            <p className="mt-1 text-xs text-neutral-500 sm:text-sm">{statusLabel()}</p>
          </div>
          <div className="h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <motion.div
              className="h-full rounded-full bg-neutral-900 dark:bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="text-xs tabular-nums text-neutral-400">{Math.round(progress * 100)}%</p>
        </div>
      )}
    </div>
  );
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// silence unused import if BillItem not used directly
void (0 as unknown as BillItem);
