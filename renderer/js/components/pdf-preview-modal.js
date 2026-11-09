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

  async function open({ title, subtitle, base64, fileName, onDelete, onOpenExternal }) {
    try {
      await _loadPdfJs();
    } catch {
      if (onOpenExternal) {
        try {
          const result = await onOpenExternal();
          if (result.success) {
            toast.info('Đã mở bằng ứng dụng mặc định', 'Không tải được thư viện preview PDF khi máy ngoại tuyến.');
          } else {
            toast.error('Lỗi mở file', result.error);
          }
        } catch (err) {
          toast.error('Lỗi mở file', err.message);
        }
        return;
      }
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
    let closed    = false;

    /* ── Overlay shell ── */
    const overlay = document.createElement('div');
    overlay.id = 'pdf-viewer-overlay';
    overlay.className = 'pdf-viewer-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title || fileName || 'Xem PDF');

    const icon = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
    const chevronLeft = icon('<path d="m15 18-6-6 6-6"/>');
    const chevronRight = icon('<path d="m9 18 6-6-6-6"/>');
    const minus = icon('<path d="M5 12h14"/>');
    const plus = icon('<path d="M12 5v14M5 12h14"/>');
    const download = icon('<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/>');
    const trash = icon('<path d="M3 6h18M8 6V4h8v2m-9 0 1 15h8l1-15M10 10v7m4-7v7"/>');
    const thumbnails = icon('<path d="M4 4h5v7H4zM4 15h5v5H4zM13 4h7v2h-7zM13 9h7v2h-7zM13 15h7v2h-7zM13 19h7v1h-7z"/>');
    const closeIcon = icon('<path d="m6 6 12 12M18 6 6 18"/>');

    overlay.innerHTML = `
      <div id="pdf-toolbar" class="pdf-toolbar">
        <div class="pdf-file-info">
          <div class="pdf-file-name" style="font-size:13px;font-weight:600;">${title}</div>
         
        </div>

        <div class="pdf-toolbar-group">
          <button id="pdf-toggle-thumbnails" class="_pdf-btn" type="button"
            title="Ẩn/hiện danh sách trang" aria-label="Ẩn/hiện danh sách trang"
            aria-controls="pdf-thumbnail-panel" aria-expanded="true">${thumbnails}</button>
          <button id="pdf-prev" class="_pdf-btn" type="button" title="Trang trước" aria-label="Trang trước">${chevronLeft}</button>
          <span id="pdf-page-info" class="pdf-page-info" style="font-size:13px;">— / —</span>
          <button id="pdf-next" class="_pdf-btn" type="button" title="Trang sau" aria-label="Trang sau">${chevronRight}</button>
        </div>

        <div class="pdf-toolbar-group">
          <button id="pdf-zoom-out" class="_pdf-btn" type="button" title="Thu nhỏ" aria-label="Thu nhỏ">${minus}</button>
          <span id="pdf-zoom-info" class="pdf-zoom-info" style="font-size:13px;">120%</span>
          <button id="pdf-zoom-in" class="_pdf-btn" type="button" title="Phóng to" aria-label="Phóng to">${plus}</button>
          <button id="pdf-fit" class="_pdf-btn _pdf-btn-wide" type="button" title="Vừa trang" style="font-size:11px;">Vừa khung</button>
        </div>

        <div class="pdf-toolbar-group pdf-toolbar-actions">
          <button id="pdf-download" class="_pdf-btn _pdf-btn-wide" type="button" style="font-size:12px;">${download}<span>Tải xuống</span></button>
          ${onDelete ? `<button id="pdf-delete" class="_pdf-btn _pdf-btn-wide _pdf-btn-danger" type="button" style="font-size:12px;">${trash}<span>Xóa file</span></button>` : ''}
          <button id="pdf-close" class="_pdf-btn" type="button" title="Đóng (ESC)" aria-label="Đóng">${closeIcon}</button>
        </div>
      </div>

      <div class="pdf-viewer-body">
        <aside id="pdf-thumbnail-panel" class="pdf-thumbnail-panel is-open" aria-label="Danh sách trang PDF">
          <div class="pdf-thumbnail-heading">Trang</div>
          <div id="pdf-thumbnail-list" class="pdf-thumbnail-list"></div>
        </aside>
        <div id="pdf-scroll" class="pdf-viewer-scroll">
          <div id="pdf-loading" class="pdf-loading">
            <div class="spinner"></div>
            <span>Đang tải PDF…</span>
          </div>
          <canvas id="pdf-canvas" class="pdf-canvas"></canvas>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('pdf-preview-open');

    /* ── Close ── */
    function close() {
      if (closed) return;
      closed = true;
      overlay.remove();
      document.body.classList.remove('pdf-preview-open');
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
        canvas.classList.add('is-visible');
        overlay.querySelector('#pdf-loading').classList.add('is-hidden');
        overlay.querySelector('#pdf-scroll').scrollTop = 0;
        updateActiveThumbnail();
      } finally {
        rendering = false;
      }
    }

    function updateActiveThumbnail() {
      const items = overlay.querySelectorAll('.pdf-thumbnail-item');
      for (const item of items) {
        const active = Number(item.dataset.page) === curPage;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-current', active ? 'page' : 'false');
        if (active) item.scrollIntoView({ block: 'nearest' });
      }
    }

    async function renderThumbnails() {
      const list = overlay.querySelector('#pdf-thumbnail-list');
      list.innerHTML = '';

      for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
        if (closed) return;

        const thumbnail = document.createElement('button');
        thumbnail.type = 'button';
        thumbnail.className = 'pdf-thumbnail-item';
        thumbnail.dataset.page = String(pageNumber);
        thumbnail.setAttribute('aria-label', `Mở trang ${pageNumber}`);

        const thumbnailCanvas = document.createElement('canvas');
        thumbnailCanvas.className = 'pdf-thumbnail-canvas';
        const label = document.createElement('span');
        label.className = 'pdf-thumbnail-label';
        label.textContent = `Trang ${pageNumber}`;
        thumbnail.append(thumbnailCanvas, label);
        list.appendChild(thumbnail);

        thumbnail.addEventListener('click', () => {
          if (rendering || curPage === pageNumber) return;
          curPage = pageNumber;
          renderPage(curPage);
        });

        try {
          const page = await pdfDoc.getPage(pageNumber);
          const naturalViewport = page.getViewport({ scale: 1 });
          const thumbnailScale = Math.min(136 / naturalViewport.width, 0.3);
          const viewport = page.getViewport({ scale: thumbnailScale });
          const context = thumbnailCanvas.getContext('2d');
          thumbnailCanvas.width = Math.ceil(viewport.width);
          thumbnailCanvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: context, viewport }).promise;
        } catch {
          thumbnail.classList.add('has-error');
          label.textContent = `Không tải được trang ${pageNumber}`;
        }
      }

      updateActiveThumbnail();
    }

    async function _fitScale() {
      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(curPage);
      const raw = page.getViewport({ scale: 1 });
      const wrap = overlay.querySelector('#pdf-scroll');
      const avail = wrap.clientWidth - 48;
      scale = Math.max(0.5, Math.min(avail / raw.width, 2.5));
      await renderPage(curPage);
    }

    /* ── Controls ── */
    overlay.querySelector('#pdf-toggle-thumbnails').addEventListener('click', () => {
      const panel = overlay.querySelector('#pdf-thumbnail-panel');
      const isOpen = panel.classList.toggle('is-open');
      overlay.querySelector('#pdf-toggle-thumbnails').setAttribute('aria-expanded', String(isOpen));
    });
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
    const deleteButton = overlay.querySelector('#pdf-delete');
    deleteButton?.addEventListener('click', async () => {
      if (!onDelete || deleteButton.disabled) return;

      const deleteLabel = deleteButton.querySelector('span');
      const originalLabel = deleteLabel?.textContent;
      deleteButton.disabled = true;
      deleteButton.setAttribute('aria-busy', 'true');
      if (deleteLabel) deleteLabel.textContent = 'Đang xóa…';

      try {
        const deleted = await onDelete();
        if (deleted) {
          close();
          return;
        }
      } catch (error) {
        toast.error('Lỗi xóa file', error.message || 'Không thể xóa file');
      } finally {
        if (!closed) {
          deleteButton.disabled = false;
          deleteButton.removeAttribute('aria-busy');
          if (deleteLabel) deleteLabel.textContent = originalLabel;
        }
      }
    });

    /* ── Load PDF ── */
    try {
      pdfDoc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      await _fitScale();
      renderThumbnails();
    } catch (err) {
      overlay.querySelector('#pdf-loading').innerHTML =
        `<span class="pdf-loading-error">Lỗi mở PDF: ${err.message}</span>`;
    }
  }

  return { open };
})();

window.pdfPreview = pdfPreview;
