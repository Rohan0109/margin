# Margin Reader

Margin is a camera-first reading companion. It recognizes printed English text in a live camera preview, draws word boxes, and looks up the word under the aim reticle.

## Run locally

```sh
npm install
npm run dev
```

Open the local Vite address in a modern browser and allow camera access. Camera access is available on `localhost` or an HTTPS origin. The first scan needs a network connection to download Tesseract's English recognition data. OCR runs in the browser; word definitions are fetched from the public dictionary API.

## Install on a phone

Push source changes to `main`, then run `npm run deploy` to build the `/margin/` site and publish it to the `gh-pages` branch. GitHub Pages must use **Deploy from a branch**, `gh-pages`, and `/(root)`. The project site is served at `https://rohan0109.github.io/margin/`.

On iPhone or iPad, open the HTTPS site in Safari, choose **Share**, then **Add to Home Screen**. The app shell and previously loaded same-origin assets are cached for repeat visits; the first OCR language download and dictionary lookups still require a network connection.

## Current scope

The reticle follows the pointer or touch position over the preview and selects the word beneath it. Tap a word in the preview on a touch screen. The browser camera alone cannot infer eye gaze; calibrated eye tracking is a separate future feature. The app does not capture or upload page photos. A small set of fallback definitions is available if the dictionary request fails.

```sh
npm run build
npm run lint
```
