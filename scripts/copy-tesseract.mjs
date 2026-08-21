// Self-host OCR assets so scans don't depend on jsdelivr's CDN.
// ocr.ts points createWorker at these paths — see workerPath/corePath below.
import { cp, mkdir } from 'node:fs/promises';

const dest = 'public/tesseract';
await mkdir(dest, { recursive: true });

await cp('node_modules/tesseract.js/dist/worker.min.js', `${dest}/worker.min.js`);
// worker.min.js ends with `//# sourceMappingURL=worker.min.js.map` — without the map
// itself present, the browser's devtools request 404s into the SPA catch-all (HTML
// instead of JSON) and logs a console warning. Harmless either way, but the file is
// cheap to ship and keeps devtools usable if OCR issues ever need debugging in prod.
await cp('node_modules/tesseract.js/dist/worker.min.js.map', `${dest}/worker.min.js.map`);

// runOcr() always calls createWorker with oem=1 (LSTM_ONLY), so the worker only ever
// fetches these three *-lstm.wasm.js bundles (self-contained, wasm inlined as base64)
// picking one at runtime by SIMD support. The plain/non-lstm cores are never requested.
const coreFiles = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];
await Promise.all(
  coreFiles.map((f) => cp(`node_modules/tesseract.js-core/${f}`, `${dest}/${f}`))
);
