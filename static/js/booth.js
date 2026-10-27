(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const all = selector => [...document.querySelectorAll(selector)];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const pad = number => String(number).padStart(2, '0');
  const demoPaths = ['pose-1', 'pose-2', 'pose-3', 'studio'].map(name => `../media/demo/${name}.jpg`);
  const state = {
    count: 4, shots: [], demo: [], mode: 'demo', stream: null,
    filter: 'warm', paper: '#fffaf0', mirror: true, flash: false,
    busy: true, retake: null, comparing: false,
    sessionDate: new Date(), exportCanvas: null
  };
  const adjustments = all('[data-adjustment]');
  let renderTimer;

  function status(message) { $('studio-status').textContent = message; }
  function selectGroup(selector, active) {
    all(selector).forEach(button => {
      const selected = button === active;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  function values() {
    return Object.fromEntries(adjustments.map(input => [input.id, Number(input.value)]));
  }
  function updateSliderLabels() {
    adjustments.forEach(input => {
      const n = Number(input.value);
      document.querySelector(`output[for="${input.id}"]`).value = `${n > 0 && input.id !== 'grain' ? '+' : n < 0 ? '−' : ''}${pad(Math.abs(n))}`;
      input.style.setProperty('--fill', `${(n - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
    });
  }
  function setBusy(busy) {
    state.busy = busy;
    all('[data-count], #capture-button, #camera-source, #mirror-button, #preview-button, .moment').forEach(control => control.disabled = busy);
  }
  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The photo could not be loaded.'));
      image.src = source;
    });
  }

  // Process original pixels each time so edits never accumulate or degrade a photo.
  // The same renderer supplies the thumbnail, enlarged demo, and PNG export.
  function renderPhoto(source, width = 900, original = false) {
    const canvas = document.createElement('canvas');
    const sourceWidth = source.naturalWidth || source.width;
    const sourceHeight = source.naturalHeight || source.height;
    canvas.width = Math.min(width, sourceWidth);
    canvas.height = Math.round(canvas.width * sourceHeight / sourceWidth);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (original) return canvas;
    const v = values();
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    const contrast = (100 + v.contrast) / 100;
    const warm = v.warmth * .3 + (state.filter === 'warm' ? 5 : 0);
    for (let i = 0; i < pixels.length; i += 4) {
      // Deterministic noise keeps grain stable when comparing and exporting.
      const noise = (((Math.imul(i + 1, 16807) >>> 0) % 101) / 100 - .5) * v.grain * .6;
      let r = (pixels[i] - 128) * contrast + 128 + v.brightness * 1.1 + warm + noise;
      let g = (pixels[i + 1] - 128) * contrast + 128 + v.brightness * 1.1 + warm * .12 + noise;
      let b = (pixels[i + 2] - 128) * contrast + 128 + v.brightness * 1.1 - warm + noise;
      if (state.filter === 'mono') r = g = b = r * .2126 + g * .7152 + b * .0722;
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
    }
    if (v.sharpness) {
      const copy = new Uint8ClampedArray(pixels);
      const stride = canvas.width * 4;
      const amount = v.sharpness / 400;
      for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < canvas.width - 1; x++) {
          const i = y * stride + x * 4;
          for (let c = 0; c < 3; c++) {
            pixels[i + c] = copy[i + c] * (1 + 4 * amount) - amount * (copy[i - 4 + c] + copy[i + 4 + c] + copy[i - stride + c] + copy[i + stride + c]);
          }
        }
      }
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }
  function cameraFilter() {
    if (state.comparing) return 'none';
    const v = values();
    return `brightness(${1 + v.brightness / 100}) contrast(${1 + v.contrast / 100}) sepia(${Math.max(0, v.warmth / 200) + (state.filter === 'warm' ? .08 : 0)}) ${state.filter === 'mono' ? 'grayscale(1)' : ''}`;
  }
  function renderImages() {
    const compare = state.comparing;
    if (state.demo.length) {
      $('demo-image').src = renderPhoto(state.demo[3], 1000, compare).toDataURL('image/jpeg', .92);
      // Demo poses are already mirrored in the supplied design.
      $('demo-image').style.transform = state.mirror ? '' : 'scaleX(-1)';
    }
    $('camera').style.filter = cameraFilter();
    $('camera').classList.toggle('mirrored', state.mirror);
    all('.moment img').forEach(image => {
      const source = state.shots[Number(image.dataset.index)];
      if (source) image.src = renderPhoto(source, 480, compare).toDataURL('image/jpeg', .9);
    });
    $('feeling-label').textContent = `35 mm feeling / ${compare ? 'Original' : state.filter}`;
  }
  function updateCameraInfo() {
    $('camera-info').textContent = `Mirror ${state.mirror ? 'on' : 'off'} · ${state.mode === 'demo' ? 'Demo' : `${$('camera').videoWidth} × ${$('camera').videoHeight}`}`;
  }
  function updateMoments() {
    const count = state.shots.slice(0, state.count).filter(Boolean).length;
    const next = state.retake ?? state.shots.slice(0, state.count).findIndex(shot => !shot);
    const nextIndex = next === -1 ? count : next;
    const complete = count === state.count;
    $('moment-grid').style.gridTemplateColumns = `repeat(${state.count}, minmax(0, 1fr))`;
    $('moment-grid').replaceChildren();
    for (let index = 0; index < state.count; index++) {
      const shot = state.shots[index];
      const button = document.createElement('button');
      button.className = `moment${shot ? '' : ' empty'}${state.retake === index ? ' selected' : ''}`;
      button.disabled = state.busy;
      button.setAttribute('aria-label', shot ? `Retake photo ${index + 1}` : `Take photo ${index + 1}`);
      if (shot) {
        const image = document.createElement('img');
        image.alt = `Photo ${index + 1}${state.mode === 'demo' ? ' (demo)' : ''}`;
        image.dataset.index = index;
        button.append(image);
        const label = document.createElement('span');
        label.className = 'moment-number micro'; label.textContent = pad(index + 1);
        button.append(label);
      } else {
        button.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-camera"/></svg><span class="micro">${pad(index + 1)} / You’re up</span>`;
      }
      button.addEventListener('click', () => {
        if (state.busy) return;
        state.retake = index;
        updateMoments();
        status(shot ? `Ready to retake photo ${index + 1}. Press the capture button when you’re ready.` : `Ready for photo ${index + 1}.`);
        $('capture-button').focus({ preventScroll: true });
      });
      $('moment-grid').append(button);
    }
    $('moments-label').textContent = `Your moments · ${count} of ${state.count}`;
    $('capture-label').textContent = state.retake !== null ? `Retake photo ${state.retake + 1}` : complete ? 'Start a new strip' : count === state.count - 1 ? 'Take last photo' : 'Take a photo';
    $('camera-message').textContent = state.retake !== null ? 'Let’s make this one yours.' : complete ? 'A little moment, kept forever.' : count === state.count - 1 ? 'One more for the memories.' : 'Get close. Be yourself.';
    $('camera-progress').textContent = complete && state.retake === null ? 'Your strip is ready — Made to keep' : `Photo ${pad(nextIndex + 1)} / ${pad(state.count)} — Make it a good one`;
    $('export-hint').textContent = complete ? 'Your moments are ready. Make them a keepsake.' : `${state.count - count === 1 ? 'One more photo' : `${state.count - count} more photos`}, then it’s ready to download.`;
    renderImages();
  }

  async function capture() {
    if (state.busy) return;
    if (state.mode === 'camera' && (!$('camera').srcObject || $('camera').readyState < 2 || !state.stream?.getVideoTracks().some(track => track.readyState === 'live'))) {
      status('Your camera isn’t ready. Choose “Use my camera” again or try the demo.');
      return;
    }
    if (state.shots.slice(0, state.count).filter(Boolean).length === state.count && state.retake === null) {
      state.shots = []; state.sessionDate = new Date();
    }
    const index = state.retake ?? Array.from({ length: state.count }, (_, i) => i).find(i => !state.shots[i]);
    setBusy(true);
    try {
      for (let remaining = Number($('timer').value); remaining > 0; remaining--) {
        $('countdown').hidden = false;
        $('countdown').textContent = remaining;
        await wait(1000);
      }
      $('countdown').hidden = true;
      let source;
      if (state.mode === 'demo') {
        const original = state.demo[index % state.demo.length];
        const canvas = renderPhoto(original, 1200, true);
        if (!state.mirror) {
          const context = canvas.getContext('2d');
          context.translate(canvas.width, 0); context.scale(-1, 1);
          context.drawImage(original, 0, 0, canvas.width, canvas.height);
        }
        source = canvas;
      } else {
        const video = $('camera');
        if (!video.videoWidth || !state.stream.getVideoTracks().some(track => track.readyState === 'live')) throw new Error('Camera disconnected');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (state.mirror) { context.translate(canvas.width, 0); context.scale(-1, 1); }
        context.drawImage(video, 0, 0);
        source = canvas;
      }
      if (state.flash) {
        $('flash-overlay').classList.remove('flashing');
        void $('flash-overlay').offsetWidth;
        $('flash-overlay').classList.add('flashing');
      }
      state.shots[index] = source;
      state.retake = null;
      status(`${state.mode === 'demo' ? 'Demo photo' : 'Photo'} ${index + 1} captured. ${state.shots.slice(0, state.count).filter(Boolean).length === state.count ? 'Your strip is ready to preview.' : 'Ready when you are for the next one.'}`);
    } catch {
      status('That photo couldn’t be captured. Check your camera connection and try again.');
    } finally {
      $('countdown').hidden = true;
      setBusy(false); updateMoments();
    }
  }

  function stopCamera() {
    if (state.stream) state.stream.getTracks().forEach(track => track.stop());
    state.stream = null;
    $('camera').srcObject = null;
  }
  async function switchSource() {
    if (state.busy) return;
    const requested = $('camera-source').value;
    setBusy(true);
    if (requested === 'demo') {
      stopCamera();
      state.mode = 'demo'; state.shots = state.demo.slice(0, 3);
      $('camera').hidden = true; $('demo-image').hidden = false;
      status('Demo camera selected. These sample photos are from the design reference.');
    } else {
      let pendingStream;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        status('Waiting for camera access. Allow it in your browser to start.');
        pendingStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
        stopCamera();
        state.stream = pendingStream;
        $('camera').srcObject = pendingStream;
        await $('camera').play();
        state.mode = 'camera'; state.shots = []; state.sessionDate = new Date();
        $('camera').hidden = false; $('demo-image').hidden = true;
        pendingStream.getVideoTracks().forEach(track => track.addEventListener('ended', () => status('Camera disconnected. Select “Use my camera” again to reconnect.')));
        status('Your camera is ready. Get comfortable and take your first photo.');
      } catch (error) {
        if (pendingStream) pendingStream.getTracks().forEach(track => track.stop());
        stopCamera();
        state.mode = 'demo';
        $('camera').hidden = true; $('demo-image').hidden = false;
        $('camera-source').value = 'demo';
        status(error.name === 'NotAllowedError' ? 'Camera access was denied. Allow it in your browser settings, then choose “Use my camera” again. The demo is still available.' : 'Camera unavailable. Open this page on localhost or HTTPS, check your camera, and try again. You can still use the demo.');
      }
    }
    state.retake = null;
    $('mode-label').textContent = state.mode === 'demo' ? '/ Demo camera' : '/ Your camera';
    setBusy(false); updateMoments(); updateCameraInfo();
  }

  function drawCover(context, source, x, y, width, height) {
    const scale = Math.max(width / source.width, height / source.height);
    const sw = width / scale, sh = height / scale;
    context.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, x, y, width, height);
  }
  function createStrip() {
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 1800;
    const context = canvas.getContext('2d');
    const dark = state.paper === '#292824';
    context.fillStyle = state.paper; context.fillRect(0, 0, 600, 1800);
    const margin = 32, gap = 18, photoHeight = (1530 - gap * (state.count - 1)) / state.count;
    for (let i = 0; i < state.count; i++) {
      const y = margin + i * (photoHeight + gap);
      if (state.shots[i]) drawCover(context, renderPhoto(state.shots[i], 1200), margin, y, 536, photoHeight);
      else {
        context.fillStyle = dark ? '#3d3c37' : '#e7e1d8'; context.fillRect(margin, y, 536, photoHeight);
        context.fillStyle = dark ? '#ded8cf' : '#89847c'; context.font = '20px Arial'; context.textAlign = 'center';
        context.fillText(`PHOTO ${pad(i + 1)} · STILL TO COME`, 300, y + photoHeight / 2);
      }
    }
    context.fillStyle = dark ? '#fffaf0' : '#292824'; context.textAlign = 'center';
    context.font = '58px Georgia'; context.fillText('gunita', 300, 1648);
    context.font = '14px Arial'; context.fillText('S T U D I O S', 300, 1678);
    const d = state.sessionDate;
    const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;
    context.font = '15px monospace';
    context.fillText(`GOOD TIMES${$('print-date').checked ? ` · ${date}` : ' · MADE TO KEEP'}`, 300, 1730);
    if (state.mode === 'demo') { context.font = '11px monospace'; context.fillText('DEMO STRIP', 300, 1760); }
    return canvas;
  }
  $('preview-button').addEventListener('click', () => {
    try {
      state.exportCanvas = createStrip();
      $('strip-preview').src = state.exportCanvas.toDataURL('image/png');
      const complete = state.shots.slice(0, state.count).filter(Boolean).length === state.count;
      $('download-button').disabled = !complete;
      $('preview-kind').textContent = state.mode === 'demo' ? 'Demo strip / Try it out' : 'Your little keepsake';
      $('preview-note').textContent = complete ? 'Your 600 × 1800 PNG is ready. Print at 2 × 6 inches, or keep it close on your phone.' : 'A little space for more memories. Finish your photos to download this strip.';
      $('preview-dialog').showModal();
    } catch { status('The preview couldn’t be prepared. Please try again.'); }
  });
  $('download-button').addEventListener('click', () => {
    if (!state.exportCanvas) return;
    state.exportCanvas.toBlob(blob => {
      if (!blob) { status('The download couldn’t be prepared. Please try again.'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `gunita-${state.mode === 'demo' ? 'demo-' : ''}photo-strip.png`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status('Your photo strip has been downloaded. A little forever, just for you.');
    }, 'image/png');
  });

  function choosePaper(button) {
    state.paper = button.dataset.color;
    $('paper-name').textContent = button.dataset.name;
    selectGroup('[data-color]', button);
  }
  all('[data-color]').forEach(button => button.addEventListener('click', () => choosePaper(button)));
  all('[data-style]').forEach(button => button.addEventListener('click', () => {
    selectGroup('[data-style]', button);
    const midnight = button.dataset.style === 'midnight';
    choosePaper(document.querySelector(`[data-color="${midnight ? '#292824' : '#fffaf0'}"]`));
    state.filter = midnight ? 'mono' : 'warm';
    selectGroup('[data-filter]', document.querySelector(`[data-filter="${state.filter}"]`));
    renderImages();
  }));
  all('[data-count]').forEach(button => button.addEventListener('click', () => {
    if (state.busy) return;
    state.count = Number(button.dataset.count); state.retake = null;
    selectGroup('[data-count]', button); updateMoments();
  }));
  all('[data-filter]').forEach(button => button.addEventListener('click', () => {
    state.filter = button.dataset.filter; selectGroup('[data-filter]', button); renderImages();
  }));
  adjustments.forEach(input => input.addEventListener('input', () => {
    updateSliderLabels(); clearTimeout(renderTimer); renderTimer = setTimeout(renderImages, 70);
  }));
  $('reset-button').addEventListener('click', () => {
    adjustments.forEach(input => input.value = 0);
    state.filter = 'original'; selectGroup('[data-filter]', document.querySelector('[data-filter="original"]'));
    updateSliderLabels(); renderImages();
  });
  function compare(on) {
    if (state.comparing === on) return;
    state.comparing = on; $('compare-button').classList.toggle('active', on); renderImages();
  }
  $('compare-button').addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    $('compare-button').setPointerCapture(event.pointerId); compare(true);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => $('compare-button').addEventListener(type, () => compare(false)));
  $('compare-button').addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); compare(true); } });
  $('compare-button').addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') compare(false); });
  $('compare-button').addEventListener('blur', () => compare(false));
  window.addEventListener('blur', () => compare(false));
  document.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]') || event.target.closest('button, input, select, textarea, a, [contenteditable]')) return;
    if (event.code === 'Space') { event.preventDefault(); capture(); }
    if (event.key.toLowerCase() === 'o') compare(true);
  });
  document.addEventListener('keyup', event => { if (event.key.toLowerCase() === 'o') compare(false); });
  $('capture-button').addEventListener('click', capture);
  $('camera-source').addEventListener('change', switchSource);
  $('mirror-button').addEventListener('click', () => {
    state.mirror = !state.mirror; $('mirror-button').setAttribute('aria-pressed', String(state.mirror));
    renderImages(); updateCameraInfo();
  });
  $('flash-button').addEventListener('click', () => {
    state.flash = !state.flash; $('flash-button').setAttribute('aria-pressed', String(state.flash));
    $('flash-button').querySelector('span').textContent = `Flash ${state.flash ? 'on' : 'off'}`;
  });
  $('fullscreen-button').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('viewfinder').requestFullscreen();
    } catch { status('Fullscreen isn’t available in this browser. Your camera still works in the booth.'); }
  });
  all('[data-help]').forEach(button => button.addEventListener('click', () => $('help-dialog').showModal()));
  all('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  all('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    const r = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close();
  }));
  window.addEventListener('pagehide', stopCamera);

  setBusy(true); updateSliderLabels();
  Promise.all(demoPaths.map(loadImage)).then(images => {
    state.demo = images; state.shots = images.slice(0, 3);
    setBusy(false); updateMoments(); updateCameraInfo();
  }).catch(() => {
    setBusy(false); state.shots = []; updateMoments();
    status('Demo photos couldn’t load. Choose “Use my camera” to start your own strip.');
  });
})();
