/* ============================================================
   PDF Preview — full-screen overlay, pdf.js via CDN
   ============================================================ */
'use strict';

const pdfPreview = (() => {
  const PDF_JS_URL     = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  let _loaded  = false;
  let _loading = null;

  function _loadPdfJs() {
    if (_loaded) return Promise.resolve();
    if (_loading) return _loading;
    _loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDF_JS_URL;
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
        _loaded = true;
        resolve();
      };
      s.onerror = () => reject(new Error('Không tải được pdf.js'));
      document.head.appendChild(s);
    });
    return _loading;
  }

  async function open({ title, subtitle, base64, fileName, onDelete }) {
    try {
      await _loadPdfJs();
    } catch {
      toast.error('Lỗi', 'Không thể tải thư viện xem PDF. Kiểm tra kết nối mạng.');
      return;
    }

    const raw   = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    let pdfDoc    = null;
    let curPage   = 1;
    let scale     = 1.2;
    let rendering = false;

    /* ── Overlay shell ── */
    const overlay = document.createElement('div');
    overlay.id = 'pdf-viewer-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'display:flex', 'flex-direction:column', 'background:#e8eaed',
    ].join(';');

    overlay.innerHTML = `
      <div id="pdf-toolbar" style="
        display:flex; align-items:center; gap:10px;
        padding:0 16px; height:52px; flex-shrink:0;
        background:#ffffff; border-bottom:1px solid rgba(0,0,0,0.09);
        box-shadow:0 1px 4px rgba(0,0,0,0.07);
      ">
        <!-- File info -->
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:#1a1a1a;
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${fileName || title}
          </div>
          ${subtitle ? `<div style="font-size:11px;color:#6b7280;margin-top:1px;">${subtitle}</div>` : ''}
        </div>

        <!-- Page nav -->
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <button id="pdf-prev" class="_pdf-btn" title="Trang trước">‹</button>
          <span id="pdf-page-info" style="font-size:13px;color:#374151;min-width:62px;text-align:center;">— / —</span>
          <button id="pdf-next" class="_pdf-btn" title="Trang sau">›</button>
        </div>

        <!-- Zoom -->
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <button id="pdf-zoom-out" class="_pdf-btn" title="Thu nhỏ">−</button>
          <span id="pdf-zoom-info" style="font-size:13px;color:#374151;min-width:44px;text-align:center;">120%</span>
          <button id="pdf-zoom-in"  class="_pdf-btn" title="Phóng to">+</button>
          <button id="pdf-fit"      class="_pdf-btn" title="Vừa trang" style="font-size:11px;width:auto;padding:0 8px;">Vừa khung</button>
        </div>

        <!-- Actions -->
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <button id="pdf-download" class="_pdf-btn" style="width:auto;padding:0 12px;font-size:12px;">⬇ Tải xuống</button>
          ${onDelete ? '<button id="pdf-delete" class="_pdf-btn" style="width:auto;padding:0 12px;font-size:12px;background:#fee2e2;border-color:rgba(185,28,28,.2);color:#b91c1c;">🗑 Xóa file</button>' : ''}
          <button id="pdf-close" class="_pdf-btn" title="Đóng (ESC)" style="font-size:18px;color:#374151;">✕</button>
        </div>
      </div>

      <!-- Canvas area -->
      <div id="pdf-scroll" style="
        flex:1;overflow:auto;display:flex;justify-content:center;
        align-items:flex-start;padding:28px 24px;
      ">
        <div id="pdf-loading" style="
          display:flex;align-items:center;gap:12px;
          color:#374151;align-self:center;margin-top:80px;
        ">
          <div class="spinner"></div><span>Đang tải PDF…</span>
        </div>
        <canvas id="pdf-canvas" style="
          display:none;
          box-shadow:0 4px 24px rgba(0,0,0,0.18);
          border-radius:2px;background:#fff;
        "></canvas>
      </div>

      <style>
        ._pdf-btn {
          width:32px; height:32px; border:1px solid rgba(0,0,0,0.12);
          border-radius:8px; background:#f3f4f6; color:#374151;
          cursor:pointer; font-size:15px;
          display:inline-flex; align-items:center; justify-content:center;
          transition:background .15s;
        }
        ._pdf-btn:hover { background:#e5e7eb; }
        ._pdf-btn:disabled { opacity:.4; cursor:default; }
      </style>
    `;

    document.body.appendChild(overlay);

    /* ── Close ── */
    function close() {
      overlay.remove();
      document.removeEventListener('keydown', _esc);
    }
    function _esc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', _esc);

    /* ── Render ── */
    async function renderPage(num) {
      if (rendering || !pdfDoc) return;
      rendering = true;
      try {
        const page     = await pdfDoc.getPage(num);
        const viewport = page.getViewport({ scale });
        const canvas   = overlay.querySelector('#pdf-canvas');
        const ctx      = canvas.getContext('2d');
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        overlay.querySelector('#pdf-page-info').textContent = `${num} / ${pdfDoc.numPages}`;
        overlay.querySelector('#pdf-zoom-info').textContent = `${Math.round(scale * 100)}%`;
        overlay.querySelector('#pdf-prev').disabled = num <= 1;
        overlay.querySelector('#pdf-next').disabled = num >= pdfDoc.numPages;
        canvas.style.display = '';
        overlay.querySelector('#pdf-loading').style.display = 'none';
        overlay.querySelector('#pdf-scroll').scrollTop = 0;
      } finally {
        rendering = false;
      }
    }

    function _fitScale() {
      if (!pdfDoc) return;
      pdfDoc.getPage(curPage).then((page) => {
        const raw = page.getViewport({ scale: 1 });
        const wrap = overlay.querySelector('#pdf-scroll');
        const avail = wrap.clientWidth - 48;
        scale = Math.max(0.5, Math.min(avail / raw.width, 2.5));
        renderPage(curPage);
      });
    }

    /* ── Controls ── */
    overlay.querySelector('#pdf-prev').addEventListener('click', () => {
      if (curPage > 1) { curPage--; renderPage(curPage); }
    });
    overlay.querySelector('#pdf-next').addEventListener('click', () => {
      if (pdfDoc && curPage < pdfDoc.numPages) { curPage++; renderPage(curPage); }
    });
    overlay.querySelector('#pdf-zoom-in').addEventListener('click', () => {
      scale = Math.min(scale + 0.25, 3.0); renderPage(curPage);
    });
    overlay.querySelector('#pdf-zoom-out').addEventListener('click', () => {
      scale = Math.max(scale - 0.25, 0.25); renderPage(curPage);
    });
    overlay.querySelector('#pdf-fit').addEventListener('click', _fitScale);
    overlay.querySelector('#pdf-close').addEventListener('click', close);
    overlay.querySelector('#pdf-download').addEventListener('click', () => {
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    overlay.querySelector('#pdf-delete')?.addEventListener('click', async () => {
      if (onDelete) await onDelete();
    });

    /* ── Load PDF ── */
    try {
      pdfDoc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      _fitScale();
    } catch (err) {
      overlay.querySelector('#pdf-loading').innerHTML =
        `<span style="color:#b91c1c;">Lỗi mở PDF: ${err.message}</span>`;
    }
  }

  return { open };
})();

window.pdfPreview = pdfPreview;
