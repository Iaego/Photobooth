# Photobooth
A web application that allows users to capture images from their camera, applying experiences from a photobooth. Perfect for events, personal use, etc.

## Features
- Capture photos directly from your camera
- Apply filters
  - Black and White
  - Sepia
  - Film
- Download images as PNG
- Works both on desktop and mobile browsers
- Lightweight  

## Run locally

From the project directory, run `python -m http.server 8000`, then open
`http://localhost:8000/templates/index.html`.

The main page is a responsive photobooth workspace inspired by the supplied PDF.
It starts with clearly labeled demo photos extracted from that reference. Choose
**Use my camera** to start a personal strip (camera access requires localhost or
HTTPS). Photos stay in browser memory and are cleared when you reload the page.

Choose three or four photos, a paper color, and a Classic or Midnight style.
Capture each photo with the button or Space, and select a thumbnail to retake it.
Original, Warm, and Mono presets work alongside brightness, contrast, sharpness,
warmth, and grain controls. Hold the comparison button or O to see the originals.
Preview and download the completed strip as a 600 × 1800 PNG; print at 2 × 6 inches.

The main page uses local assets and vanilla HTML, CSS, and JavaScript, with no build
step or external frontend dependencies.
