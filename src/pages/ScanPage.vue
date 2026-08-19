<script setup lang="ts">
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
} from 'lucide-vue-next';
import { computed, nextTick, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from '../components/ui/Button.vue';
import { useApp } from '../composables/useApp';
import { cropImageToCanvas, preprocessImage, runOcr } from '../lib/ocr.ts';
import { applyOcrToReview } from '../lib/scanFlow.ts';

type Phase = 'choose' | 'camera' | 'preview' | 'crop' | 'processing';

const { tr, state, setCurrentBill, createEmptyBill, toast } = useApp();
const router = useRouter();
const route = useRoute();

if (!state.currentBill) setCurrentBill(createEmptyBill());

// Aksi cepat dari BillPage ("kamera" tanpa lewat halaman scan penuh) — buka kamera
// langsung, lompati layar 'choose', dan lompati preview/crop setelah jepret.
const quickCamera = computed(() => route.query.intent === 'camera');

const phase = ref<Phase>('choose');
const imageSrc = ref<string | null>(null);
const rotation = ref(0);
const flashOn = ref(false);
const facingMode = ref<'environment' | 'user'>('environment');
const progress = ref(0);
const statusKey = ref('detecting');
const cropRect = ref({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
const dragging = ref<string | null>(null);

const videoRef = ref<HTMLVideoElement | null>(null);
const streamRef = ref<MediaStream | null>(null);
const imgRef = ref<HTMLImageElement | null>(null);
const cropBoxRef = ref<HTMLDivElement | null>(null);

function stopCamera() {
  streamRef.value?.getTracks().forEach((t) => {
    t.stop();
  });
  streamRef.value = null;
}

async function startCamera() {
  stopCamera();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingMode.value, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    streamRef.value = stream;
    // phase harus diset SEBELUM mengakses videoRef — elemen <video> baru muncul di DOM
    // setelah phase === 'camera' (v-else-if di template), jadi videoRef.value masih null
    // di sini pada percobaan pertama. Set phase dulu, tunggu Vue mount elemennya (nextTick),
    // baru sambungkan srcObject. Tanpa ini kamera tampil hitam sampai dipicu render ulang
    // lain (mis. tombol swap kamera, yang kebetulan videoRef-nya sudah ada).
    phase.value = 'camera';
    await nextTick();
    if (videoRef.value) {
      videoRef.value.srcObject = stream;
      await videoRef.value.play();
    }
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
    if (caps?.torch && flashOn.value) {
      await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
    }
  } catch {
    toast(tr('cameraError'), 'error');
    phase.value = 'choose';
  }
}

onUnmounted(() => stopCamera());

if (quickCamera.value) startCamera();

function capturePhoto() {
  const video = videoRef.value;
  if (!video) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')!.drawImage(video, 0, 0);
  imageSrc.value = canvas.toDataURL('image/jpeg', 0.92);
  stopCamera();
  // Aksi cepat dari BillPage: lompati preview/crop, langsung scan.
  if (quickCamera.value) {
    runScan(imageSrc.value);
    return;
  }
  phase.value = 'preview';
}

function onFile(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    imageSrc.value = reader.result as string;
    phase.value = 'preview';
  };
  reader.readAsDataURL(file);
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function runScan(src: string) {
  phase.value = 'processing';
  progress.value = 0;
  try {
    statusKey.value = 'enhancing';
    const processed = await preprocessImage(src, { rotate: rotation.value });
    statusKey.value = 'readingText';
    const result = await runOcr(processed, (status, p) => {
      progress.value = p;
      if (status === 'recognizing') statusKey.value = 'readingText';
      if (status === 'parsing') statusKey.value = 'parsing';
      if (status === 'done') statusKey.value = 'almostDone';
    });
    applyOcrToReview(result, processed.toDataURL('image/jpeg', 0.85), router);
  } catch (e) {
    console.error(e);
    toast(tr('ocrFailed'), 'error');
    phase.value = 'preview';
  }
}

async function runCroppedScan() {
  if (!imageSrc.value || !imgRef.value) {
    if (imageSrc.value) await runScan(imageSrc.value);
    return;
  }
  phase.value = 'processing';
  try {
    statusKey.value = 'enhancing';
    const img = imgRef.value;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    const crop = {
      x: cropRect.value.x * naturalW,
      y: cropRect.value.y * naturalH,
      w: cropRect.value.w * naturalW,
      h: cropRect.value.h * naturalH,
    };
    const full = await loadHtmlImage(imageSrc.value);
    const cropped = cropImageToCanvas(full, crop);
    const processed = await preprocessImage(cropped, { rotate: rotation.value });
    statusKey.value = 'readingText';
    const result = await runOcr(processed, (status, p) => {
      progress.value = p;
      if (status === 'recognizing') statusKey.value = 'readingText';
      if (status === 'parsing') statusKey.value = 'parsing';
    });
    applyOcrToReview(result, processed.toDataURL('image/jpeg', 0.85), router);
  } catch (e) {
    console.error(e);
    toast(tr('ocrFailed'), 'error');
    phase.value = 'crop';
  }
}

async function toggleFlash() {
  const next = !flashOn.value;
  flashOn.value = next;
  const track = streamRef.value?.getVideoTracks()[0];
  if (!track) return;
  try {
    await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
  } catch {
    /* torch not supported */
  }
}

function onCropPointer(e: PointerEvent, handle: string) {
  e.preventDefault();
  e.stopPropagation();
  dragging.value = handle;
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
}

function onCropMove(e: PointerEvent) {
  if (!dragging.value || !cropBoxRef.value) return;
  const rect = cropBoxRef.value.getBoundingClientRect();
  const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  const c = cropRect.value;
  const next = { ...c };
  if (dragging.value.includes('l')) {
    const right = c.x + c.w;
    next.x = Math.min(nx, right - 0.1);
    next.w = right - next.x;
  }
  if (dragging.value.includes('r')) {
    next.w = Math.max(0.1, nx - c.x);
  }
  if (dragging.value.includes('t')) {
    const bottom = c.y + c.h;
    next.y = Math.min(ny, bottom - 0.1);
    next.h = bottom - next.y;
  }
  if (dragging.value.includes('b')) {
    next.h = Math.max(0.1, ny - c.y);
  }
  cropRect.value = next;
}

function statusLabel() {
  const map: Record<string, string> = {
    detecting: tr('detecting'),
    enhancing: tr('enhancing'),
    readingText: tr('readingText'),
    parsing: tr('parsing'),
    almostDone: tr('almostDone'),
  };
  return map[statusKey.value] || tr('processing');
}

function onBack() {
  stopCamera();
  if (phase.value === 'preview' || phase.value === 'crop') {
    imageSrc.value = null;
    phase.value = 'choose';
    return;
  }
  if (phase.value === 'camera') {
    // Aksi cepat: tidak pernah lewat layar 'choose', jadi batal di sini balik ke BillPage
    // langsung, bukan mendarat di layar choose yang tidak pernah dia lihat.
    if (quickCamera.value) {
      router.push('/bill');
      return;
    }
    phase.value = 'choose';
    return;
  }
  if (phase.value === 'processing') return;
  if (state.currentBill && (state.currentBill.items.length > 0 || state.currentBill.eventName)) {
    router.push('/bill');
  } else {
    router.push('/');
  }
}

function toggleCameraFacing() {
  facingMode.value = facingMode.value === 'environment' ? 'user' : 'environment';
  if (phase.value === 'camera') startCamera();
}
</script>

<template>
  <div class="page-root flex flex-col gap-3 sm:gap-4">
    <div class="flex shrink-0 items-start gap-2 sm:items-center sm:gap-3">
      <button
        type="button"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
        :aria-label="tr('back')"
        @click="onBack"
      >
        <ArrowLeft class="h-4 w-4" />
      </button>
      <div class="min-w-0">
        <h1 class="text-base font-semibold sm:text-lg">{{ tr('scanReceipt') }}</h1>
        <p class="text-[11px] text-neutral-500 sm:text-xs">{{ tr('tipCamera') }}</p>
      </div>
    </div>

    <div
      v-if="phase === 'choose'"
      class="flex w-full flex-col gap-3 sm:gap-4 md:mx-auto md:max-w-3xl lg:max-w-4xl lg:grid lg:grid-cols-5 lg:items-start lg:gap-5"
    >
      <div
        class="rounded-2xl border border-dashed border-neutral-300 bg-white p-5 text-center sm:rounded-3xl sm:p-6 lg:col-span-3 dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div
          class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 sm:h-14 sm:w-14 dark:bg-neutral-800"
        >
          <Camera class="h-5 w-5 text-neutral-600 sm:h-6 sm:w-6 dark:text-neutral-300" />
        </div>
        <p class="mb-1 text-sm font-medium">{{ tr('dragDrop') }}</p>
        <p class="mb-4 text-xs text-neutral-500">{{ tr('or') }}</p>
        <div class="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button class="h-11 w-full text-sm sm:w-auto" @click="startCamera">
            <Camera class="h-4 w-4" />
            {{ tr('openCamera') }}
          </Button>
          <label class="inline-flex w-full sm:w-auto">
            <input
              type="file"
              accept="image/*"
              class="hidden"
              @change="(e) => (e.target as HTMLInputElement).files?.[0] && onFile((e.target as HTMLInputElement).files![0])"
            />
            <span
              class="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-5 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              <ImagePlus class="h-4 w-4" />
              {{ tr('chooseFile') }}
            </span>
          </label>
        </div>
      </div>
      <div class="rounded-2xl border border-neutral-200 bg-white p-4 lg:col-span-2 dark:border-neutral-800 dark:bg-neutral-900">
        <p class="mb-2 text-sm font-medium">{{ tr('tips') }}</p>
        <ul class="space-y-1.5 text-xs text-neutral-500">
          <li>• {{ tr('tip1') }}</li>
          <li>• {{ tr('tip2') }}</li>
          <li>• {{ tr('tip3') }}</li>
        </ul>
      </div>
    </div>

    <div v-else-if="phase === 'camera'" class="camera-stage relative overflow-hidden rounded-2xl bg-black sm:rounded-3xl">
      <video
        ref="videoRef"
        playsinline
        muted
        class="aspect-[3/4] max-h-[min(72dvh,720px)] w-full object-cover landscape:aspect-video landscape:max-h-[min(70dvh,520px)]"
      />
      <div class="pointer-events-none absolute inset-4 rounded-2xl border-2 border-white/40 sm:inset-6" />
      <div
        class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-4 pt-12 landscape:pt-8"
        :style="{ paddingBottom: 'max(1rem, var(--safe-bottom))' }"
      >
        <button
          type="button"
          class="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
          :aria-label="tr('flash')"
          @click="toggleFlash"
        >
          <Flashlight v-if="flashOn" class="h-5 w-5" />
          <FlashlightOff v-else class="h-5 w-5" />
        </button>
        <button
          type="button"
          class="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-white/20 sm:h-16 sm:w-16"
          :aria-label="tr('takePhoto')"
          @click="capturePhoto"
        >
          <span class="h-10 w-10 rounded-full bg-white sm:h-12 sm:w-12" />
        </button>
        <button
          type="button"
          class="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
          aria-label="Switch camera"
          @click="toggleCameraFacing"
        >
          <SwitchCamera class="h-5 w-5" />
        </button>
      </div>
      <button
        type="button"
        class="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white"
        :aria-label="tr('close')"
        @click="onBack"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <div v-else-if="(phase === 'preview' || phase === 'crop') && imageSrc" class="flex flex-col gap-3 sm:gap-4 md:mx-auto md:max-w-2xl">
      <div
        ref="cropBoxRef"
        class="relative overflow-hidden rounded-2xl bg-neutral-100 sm:rounded-3xl dark:bg-neutral-900"
        @pointermove="phase === 'crop' ? onCropMove($event) : undefined"
        @pointerup="dragging = null"
        @pointerleave="dragging = null"
      >
        <img
          ref="imgRef"
          :src="imageSrc"
          alt="receipt"
          class="mx-auto max-h-[min(55dvh,560px)] w-full object-contain landscape:max-h-[min(62dvh,420px)]"
          :style="{ transform: `rotate(${rotation}deg)` }"
        />
        <div
          v-if="phase === 'crop'"
          class="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          :style="{
            left: `${cropRect.x * 100}%`,
            top: `${cropRect.y * 100}%`,
            width: `${cropRect.w * 100}%`,
            height: `${cropRect.h * 100}%`,
          }"
        >
          <span
            v-for="h in ['tl', 'tr', 'bl', 'br']"
            :key="h"
            :class="`absolute h-5 w-5 touch-none rounded-full bg-white shadow sm:h-4 sm:w-4 ${
              h === 'tl'
                ? '-left-2.5 -top-2.5 sm:-left-2 sm:-top-2'
                : h === 'tr'
                  ? '-right-2.5 -top-2.5 sm:-right-2 sm:-top-2'
                  : h === 'bl'
                    ? '-bottom-2.5 -left-2.5 sm:-bottom-2 sm:-left-2'
                    : '-bottom-2.5 -right-2.5 sm:-bottom-2 sm:-right-2'
            }`"
            @pointerdown="onCropPointer($event, h)"
          />
        </div>
      </div>

      <div class="scroll-x-soft flex justify-center gap-2 pb-0.5">
        <Button variant="outline" size="sm" class="shrink-0" @click="rotation = (rotation + 90) % 360">
          <RotateCw class="h-4 w-4" />
          {{ tr('rotate') }}
        </Button>
        <Button variant="outline" size="sm" class="shrink-0" @click="phase = phase === 'crop' ? 'preview' : 'crop'">
          <Crop class="h-4 w-4" />
          {{ tr('crop') }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="shrink-0"
          @click="
            imageSrc = null;
            phase = 'choose';
          "
        >
          {{ tr('retake') }}
        </Button>
      </div>

      <Button size="lg" full-width @click="phase === 'crop' ? runCroppedScan() : runScan(imageSrc)">
        <Check class="h-4 w-4" />
        {{ phase === 'crop' ? tr('apply') : tr('usePhoto') }}
      </Button>
    </div>

    <div v-else-if="phase === 'processing'" class="flex flex-col items-center gap-5 px-2 py-12 sm:gap-6 sm:py-16">
      <div class="relative flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20">
        <Loader2 class="h-10 w-10 animate-spin text-neutral-800 sm:h-12 sm:w-12 dark:text-neutral-200" />
      </div>
      <div class="px-4 text-center">
        <p class="text-sm font-medium sm:text-base">{{ tr('scanning') }}</p>
        <p class="mt-1 text-xs text-neutral-500 sm:text-sm">{{ statusLabel() }}</p>
      </div>
      <div class="h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          class="h-full rounded-full bg-neutral-900 transition-[width] dark:bg-white"
          :style="{ width: `${Math.round(progress * 100)}%` }"
        />
      </div>
      <p class="text-xs tabular-nums text-neutral-400">{{ Math.round(progress * 100) }}%</p>
    </div>
  </div>
</template>
