/* ============================================================
   PDF Preview Modal — pdf.js via CDN (cdnjs.cloudflare.com)
   ============================================================ */
'use strict';

const pdfPreview = (() => {
  const PDF_JS_URL    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  let _loaded  = false;
  let _loading = null;

  function _loadPdfJs() {
    if (_loaded) return Promise.resolve();
    if (_loading) return _loading;
    _loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDF_JS_URL;
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
        _loaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Không tải được pdf.js từ CDN'));
      document.head.appendChild(script);
    });
    return _loading;
  }

  /**
   * Mở modal xem PDF
   * @param {{ title: string, subtitle?: string, base64: string, fileName: string, onDelete?: Function }} opts
   */
  async function open({ title, subtitle, base64, fileName, onDelete }) {
    try {
      await _loadPdfJs();
    } catch (err) {
      toast.error('Lỗi', 'Không thể tải thư viện xem PDF. Kiểm tra kết nối mạng.');
      return;
    }

    // Decode base64 → Uint8Array
    const raw   = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    let pdfDoc   = null;
    let curPage  = 1;
    let scale    = 1.2;
    let rendering = false;

    // Build container
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-3);';

    wrap.innerHTML = `
      ${subtitle ? `<div class="text-sm text-muted" style="margin-bottom:2px;">${subtitle}</div>` : ''}

      <!-- Toolbar -->
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;
                  padding:var(--space-2) var(--space-3);background:var(--bg-table-header);
                  border-radius:var(--border-radius-sm);">
        <div style="display:flex;align-items:center;gap:var(--space-2);">
          <button class="btn btn-sm btn-secondary" id="pdf-prev">◀</button>
          <span id="pdf-page-info" style="font-size:var(--font-size-sm);color:var(--text-secondary);min-width:70px;text-align:center;">
            — / —
          </span>
          <button class="btn btn-sm btn-secondary" id="pdf-next">▶</button>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-2);">
          <button class="btn btn-sm btn-secondary" id="pdf-zoom-out">−</button>
          <span id="pdf-zoom-info" style="font-size:var(--font-size-sm);color:var(--text-secondary);min-width:48px;text-align:center;">120%</span>
          <button class="btn btn-sm btn-secondary" id="pdf-zoom-in">+</button>
        </div>
        <div style="margin-left:auto;display:flex;gap:var(--space-2);">
          <button class="btn btn-sm btn-secondary" id="pdf-download">⬇ Tải xuống</button>
          ${onDelete ? '<button class="btn btn-sm btn-danger" id="pdf-delete">🗑️ Xóa file</button>' : ''}
        </div>
      </div>

      <!-- Canvas area -->
      <div id="pdf-canvas-wrap" style="
        overflow:auto;background:#525659;border-radius:var(--border-radius-sm);
        display:flex;justify-content:center;padding:var(--space-4);
        max-height:65vh;min-height:300px;">
        <div id="pdf-loading" style="display:flex;align-items:center;gap:var(--space-2);color:#ccc;">
          <div class="spinner"></div> Đang tải PDF...
        </div>
        <canvas id="pdf-canvas" style="display:none;box-shadow:0 2px 12px rgba(0,0,0,0.6);"></canvas>
      </div>
    `;

    modal.open({
      title,
      content: wrap,
      size: 'xl',
      buttons: [
        { label: 'Đóng', class: 'btn-secondary', action: (c) => c() },
      ],
    });

    async function renderPage(num) {
      if (rendering || !pdfDoc) return;
      rendering = true;
      try {
        const page     = await pdfDoc.getPage(num);
        const viewport = page.getViewport({ scale });
        const canvas   = wrap.querySelector('#pdf-canvas');
        const ctx      = canvas.getContext('2d');
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        wrap.querySelector('#pdf-page-info').textContent = `${num} / ${pdfDoc.numPages}`;
        wrap.querySelector('#pdf-zoom-info').textContent = `${Math.round(scale * 100)}%`;
        canvas.style.display = '';
        wrap.querySelector('#pdf-loading').style.display = 'none';
      } finally {
        rendering = false;
      }
    }

    // Wire controls
    wrap.querySelector('#pdf-prev').addEventListener('click', async () => {
      if (curPage > 1) { curPage--; await renderPage(curPage); }
    });
    wrap.querySelector('#pdf-next').addEventListener('click', async () => {
      if (pdfDoc && curPage < pdfDoc.numPages) { curPage++; await renderPage(curPage); }
    });
    wrap.querySelector('#pdf-zoom-in').addEventListener('click', async () => {
      scale = Math.min(scale + 0.25, 3.0); await renderPage(curPage);
    });
    wrap.querySelector('#pdf-zoom-out').addEventListener('click', async () => {
      scale = Math.max(scale - 0.25, 0.5); await renderPage(curPage);
    });
    wrap.querySelector('#pdf-download').addEventListener('click', () => {
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    wrap.querySelector('#pdf-delete')?.addEventListener('click', async () => {
      if (onDelete) await onDelete();
    });

    // Load PDF
    try {
      pdfDoc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      await renderPage(curPage);
    } catch (err) {
      wrap.querySelector('#pdf-loading').innerHTML =
        `<span style="color:#f08888;">Lỗi mở PDF: ${err.message}</span>`;
    }
  }

  return { open };
})();

window.pdfPreview = pdfPreview;
