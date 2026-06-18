// ══════════════════════════════════════════
// মাঙ্গা বাংলা অনুবাদক — app.js
// Canvas overlay pipeline + upload handling
// ══════════════════════════════════════════

(() => {
  'use strict';

  const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const FUNCTION_ENDPOINT = '/.netlify/functions/translate';

  // ── DOM refs ──
  const uploadZone     = document.getElementById('uploadZone');
  const fileInput      = document.getElementById('fileInput');
  const previewArea    = document.getElementById('previewArea');
  const previewImg     = document.getElementById('previewImg');
  const uploadSection  = document.getElementById('uploadSection');
  const loadingSection = document.getElementById('loadingSection');
  const resultSection  = document.getElementById('resultSection');
  const translateBtn   = document.getElementById('translateBtn');
  const changeFileBtn  = document.getElementById('changeFileBtn');
  const resetBtn       = document.getElementById('resetBtn');
  const downloadBtn    = document.getElementById('downloadBtn');
  const copyAllBtn     = document.getElementById('copyAllBtn');
  const toggleOriginalBtn = document.getElementById('toggleOriginalBtn');
  const canvas          = document.getElementById('mangaCanvas');
  const ctx              = canvas.getContext('2d');
  const tlItems         = document.getElementById('tlItems');
  const bubbleCount     = document.getElementById('bubbleCount');
  const genreTag        = document.getElementById('genreTag');
  const errorBanner     = document.getElementById('errorBanner');
  const errorMsg        = document.getElementById('errorMsg');
  const errorClose      = document.getElementById('errorClose');
  const loadingStatus   = document.getElementById('loadingStatus');

  let currentFile = null;
  let currentImage = null;
  let showOriginal = false;
  let lastParsedData = null;

  // ══════════════════════════════════════════
  // Upload handling
  // ══════════════════════════════════════════

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  changeFileBtn.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  function handleFile(file) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      showError('শুধুমাত্র JPG, PNG বা WEBP ফাইল আপলোড করা যাবে।');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showError('ফাইলের সাইজ ৮MB এর বেশি হতে পারবে না।');
      return;
    }

    currentFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      uploadZone.hidden = true;
      previewArea.hidden = false;
    };
    reader.onerror = () => showError('ফাইল পড়তে সমস্যা হয়েছে।');
    reader.readAsDataURL(file);
  }

  // ══════════════════════════════════════════
  // Translate request
  // ══════════════════════════════════════════

  translateBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    uploadSection.hidden = true;
    loadingSection.hidden = false;
    resultSection.hidden = true;

    animateLoadingSteps();

    try {
      const base64 = await fileToBase64(currentFile);

      setLoadingStatus('Gemini AI পেজ বিশ্লেষণ করছে', 2);

      const response = await fetch(FUNCTION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: base64,
          mimeType: currentFile.type,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'অজানা সমস্যা হয়েছে।');
      }

      setLoadingStatus('পেজ রেন্ডার করা হচ্ছে', 4);
      lastParsedData = result.data;

      await renderMangaPage(result.data);

      loadingSection.hidden = true;
      resultSection.hidden = false;

    } catch (err) {
      console.error(err);
      loadingSection.hidden = true;
      uploadSection.hidden = false;
      showError(err.message || 'অনুবাদ করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    }
  });

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('ফাইল এনকোড করতে সমস্যা হয়েছে।'));
      reader.readAsDataURL(file);
    });
  }

  function setLoadingStatus(text, stepNum) {
    loadingStatus.textContent = text;
    for (let i = 1; i <= 4; i++) {
      const step = document.getElementById(`step${i}`);
      step.classList.remove('active', 'done');
      if (i < stepNum) step.classList.add('done');
      if (i === stepNum) step.classList.add('active');
    }
  }

  let loadingInterval = null;
  function animateLoadingSteps() {
    setLoadingStatus('ছবি প্রক্রিয়া করা হচ্ছে', 1);
    let step = 1;
    clearInterval(loadingInterval);
    loadingInterval = setInterval(() => {
      step++;
      if (step > 3) { clearInterval(loadingInterval); return; }
      const texts = {
        2: 'বাবল চিহ্নিত করা হচ্ছে',
        3: 'বাংলায় অনুবাদ করা হচ্ছে',
      };
      if (texts[step]) setLoadingStatus(texts[step], step);
    }, 1800);
  }

  // ══════════════════════════════════════════
  // Canvas rendering pipeline
  // ══════════════════════════════════════════

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('ছবি লোড করতে সমস্যা হয়েছে।'));
      img.src = src;
    });
  }

  async function renderMangaPage(data) {
    const img = await loadImage(previewImg.src);
    currentImage = img;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const elements = (data.elements || []).slice().sort((a, b) => (a.reading_order || a.id) - (b.reading_order || b.id));

    // Wait for font to be ready before measuring/drawing text
    await document.fonts.load('600 16px "Baloo Da 2"');
    await document.fonts.ready;

    for (const el of elements) {
      drawElement(el);
    }

    populateTranslationList(elements);
    bubbleCount.textContent = `${elements.length}টি বাবল`;
    genreTag.textContent = data.page_info?.genre || '';
    genreTag.hidden = !data.page_info?.genre;
  }

  function drawElement(el) {
    const bbox = el.bbox || {};
    const x = (bbox.x / 100) * canvas.width;
    const y = (bbox.y / 100) * canvas.height;
    const w = (bbox.width / 100) * canvas.width;
    const h = (bbox.height / 100) * canvas.height;

    const shape = el.shape || 'ellipse';

    // Mask the original Japanese text area
    if (shape !== 'none') {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      if (shape === 'ellipse' || shape === 'cloud') {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 4), Math.max(h / 2, 4), 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // rect — soft padding so it doesn't look like a hard sticker
        roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 4);
        ctx.fill();
      }
      ctx.restore();
    }

    // Render Bengali text
    const baseFontSize = el.font_size_px || 14;
    const fontWeight = el.font_weight || '600';
    const textAlign = el.text_align || 'center';
    const text = el.bengali || '';

    if (!text.trim()) return;

    const padding = Math.max(w * 0.08, 4);
    const maxWidth = Math.max(w - padding * 2, 20);

    const fittedSize = fitTextToBox(ctx, text, maxWidth, h - padding, baseFontSize, fontWeight);

    ctx.save();
    ctx.font = `${fontWeight} ${fittedSize}px "Baloo Da 2", "Noto Sans Bengali", sans-serif`;
    ctx.fillStyle = shape === 'none' ? '#1a1a1a' : '#0a0a0a';
    ctx.textAlign = textAlign;
    ctx.textBaseline = 'middle';

    if (shape === 'none') {
      // SFX-style: slight stroke for pop
      ctx.lineWidth = fittedSize * 0.08;
      ctx.strokeStyle = '#ffffff';
    }

    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = fittedSize * 1.3;
    const totalHeight = lines.length * lineHeight;
    const startY = y + h / 2 - totalHeight / 2 + lineHeight / 2;
    const drawX = textAlign === 'center' ? x + w / 2 : textAlign === 'right' ? x + w - padding : x + padding;

    lines.forEach((line, i) => {
      const lineY = startY + i * lineHeight;
      if (shape === 'none') ctx.strokeText(line, drawX, lineY);
      ctx.fillText(line, drawX, lineY);
    });

    ctx.restore();
  }

  function roundRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function wrapText(context, text, maxWidth) {
    // Bengali-aware: split on spaces; fall back to char-split for unbroken long words
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';

    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (context.measureText(test).width <= maxWidth || !current) {
        current = test;
        if (context.measureText(current).width > maxWidth && current.length > 1) {
          // word itself too long — char-wrap it
          const chars = current.split('');
          let chunk = '';
          for (const ch of chars) {
            const testChunk = chunk + ch;
            if (context.measureText(testChunk).width > maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk = testChunk;
            }
          }
          current = chunk;
        }
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [text];
  }

  function fitTextToBox(context, text, maxWidth, maxHeight, startSize, weight) {
    let size = startSize;
    const minSize = 8;

    while (size > minSize) {
      context.font = `${weight} ${size}px "Baloo Da 2", "Noto Sans Bengali", sans-serif`;
      const lines = wrapText(context, text, maxWidth);
      const totalHeight = lines.length * size * 1.3;
      if (totalHeight <= maxHeight || maxHeight <= 0) break;
      size -= 1;
    }
    return size;
  }

  // ══════════════════════════════════════════
  // Translation list sidebar
  // ══════════════════════════════════════════

  function populateTranslationList(elements) {
    tlItems.innerHTML = '';
    elements.forEach((el, idx) => {
      const item = document.createElement('div');
      item.className = `tl-item type-${el.type || 'speech'}`;
      item.style.animationDelay = `${idx * 0.04}s`;

      item.innerHTML = `
        <div class="tl-item-meta">
          <span class="tl-num">#${el.id ?? idx + 1}</span>
          <span class="tl-type">${typeLabel(el.type)}</span>
          ${el.speaker && el.speaker !== 'unknown' ? `<span class="tl-speaker">${escapeHtml(el.speaker)}</span>` : ''}
        </div>
        <div class="tl-bengali">${escapeHtml(el.bengali || '')}</div>
        <div class="tl-original">${escapeHtml(el.original || '')}</div>
      `;
      tlItems.appendChild(item);
    });
  }

  function typeLabel(type) {
    const map = { speech: 'কথা', thought: 'মনের ভাব', narration: 'বর্ণনা', sfx: 'শব্দ' };
    return map[type] || 'কথা';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  toggleOriginalBtn.addEventListener('click', () => {
    showOriginal = !showOriginal;
    document.querySelectorAll('.tl-original').forEach((el) => {
      el.classList.toggle('visible', showOriginal);
    });
    toggleOriginalBtn.textContent = showOriginal ? 'জাপানি লুকাও' : 'জাপানি দেখাও';
  });

  // ══════════════════════════════════════════
  // Download / Copy / Reset
  // ══════════════════════════════════════════

  downloadBtn.addEventListener('click', () => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `manga_bengali_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  });

  copyAllBtn.addEventListener('click', async () => {
    if (!lastParsedData?.elements) return;
    const text = lastParsedData.elements
      .map((el, i) => `${i + 1}. ${el.bengali}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      copyAllBtn.textContent = 'কপি হয়েছে ✓';
      copyAllBtn.classList.add('copied');
      setTimeout(() => {
        copyAllBtn.textContent = 'সব অনুবাদ কপি করুন';
        copyAllBtn.classList.remove('copied');
      }, 2000);
    } catch {
      showError('কপি করতে সমস্যা হয়েছে।');
    }
  });

  resetBtn.addEventListener('click', resetApp);

  function resetApp() {
    currentFile = null;
    currentImage = null;
    lastParsedData = null;
    fileInput.value = '';
    previewImg.src = '';
    uploadZone.hidden = false;
    previewArea.hidden = true;
    resultSection.hidden = true;
    loadingSection.hidden = true;
    uploadSection.hidden = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    tlItems.innerHTML = '';
  }

  // ══════════════════════════════════════════
  // Error handling
  // ══════════════════════════════════════════

  let errorTimeout = null;
  function showError(message) {
    errorMsg.textContent = message;
    errorBanner.hidden = false;
    clearTimeout(errorTimeout);
    errorTimeout = setTimeout(() => { errorBanner.hidden = true; }, 6000);
  }

  errorClose.addEventListener('click', () => { errorBanner.hidden = true; });

})();
