# Margin Reader

- This is a React 19, TypeScript, and Vite app. Keep the reader as the first screen.
- Stop camera tracks and terminate the Tesseract worker when a session ends or the component unmounts.
- Tesseract.js 7 returns words nested in blocks, paragraphs, and lines. Bounding boxes are in OCR-canvas coordinates and must stay aligned with the `object-fit: cover` preview.
- Request Tesseract structured block output explicitly when reading word boxes. The offline service worker caches the app shell, not the first OCR language download or dictionary API.
- Word selection currently uses the pointer or touch aim reticle. Do not describe it as eye tracking; gaze selection needs calibrated tracking support.
- Preserve the installable PWA metadata, safe-area spacing, and mobile touch targets.
- Run `npm run build` and `npm run lint` after app changes.