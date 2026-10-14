# Margin Reader

Margin is a camera-first reading companion. It recognizes printed English text in a live camera preview, draws word boxes, and looks up the word under the aim reticle.

## Run locally

```sh
npm install
npm run dev
```

Open the local Vite address in a modern browser and allow camera access. Camera access is available on `localhost` or an HTTPS origin. The first scan needs a network connection to download Tesseract's English recognition data. Definitions use a fast CORS-enabled online lookup first, then fall back to the local WordNet 3.1 index. Successful definitions are cached on the device; WordNet letter shards load only if needed and are cached for later offline use. Installation does not download the entire dictionary.

## Install on a phone

Push source changes to `main`, then run `npm run deploy` to build the `/margin/` site and publish it to the `gh-pages` branch. GitHub Pages must use **Deploy from a branch**, `gh-pages`, and `/(root)`. The project site is served at `https://rohan0109.github.io/margin/`.

On Android, open the HTTPS site in Chrome and choose **Install app** from the browser menu or install prompt. On iPhone or iPad, open the site in Safari, choose **Share**, then **Add to Home Screen**. The app shell is cached for repeat visits; the first OCR language download and uncached WordNet shards require a network connection.

## Current scope

The reticle follows the pointer or touch position over the preview and selects a sufficiently confident word from the first OCR pass. Boxes are position-smoothed between scans; lookup has no debounce. Tap a word in the preview on a touch screen. The browser camera alone cannot infer eye gaze; calibrated eye tracking is a separate future feature. The app does not capture or upload page photos. A small set of fallback definitions covers common words outside WordNet.

WordNet 3.1 data is provided by Princeton University under its included license. The build script creates the browser glossary from `wordnet-db`.

```sh
npm run build
npm run lint
```
