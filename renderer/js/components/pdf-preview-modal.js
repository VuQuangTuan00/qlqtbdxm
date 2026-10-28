/* ============================================================
   PDF Preview — dùng trình xem PDF tích hợp của Chromium/Electron
   ============================================================ */
'use strict';

const pdfPreview = (() => {
  async function open({ title, subtitle, base64, fileName, onDelete, onOpenExternal }) {
    let bytes;
    try {
      const raw = atob(base64);
      bytes = new Uint8Array(raw.length);
      for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
    } catch (_) {
      toast.error('Lỗi', 'Dữ liệu PDF không hợp lệ');
      return;
    }

    const blob = new Blob([bytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    const overlay = document.createElement('div');
    overlay.id = 'pdf-viewer-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:#e8eaed;';
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:0 16px;height:52px;flex-shrink:0;background:#fff;border-bottom:1px solid rgba(0,0,0,.09);">
        <div style="flex:1;min-width:0;">
          <div id="pdf-file-name" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
          <div id="pdf-subtitle" style="font-size:11px;color:#6b7280;margin-top:1px;"></div>
        </div>
        <button id="pdf-open-external" class="_pdf-btn">Mở bằng ứng dụng mặc định</button>
        <button id="pdf-download" class="_pdf-btn">Tải xuống</button>
        <button id="pdf-delete" class="_pdf-btn _pdf-danger">Xóa file</button>
        <button id="pdf-close" class="_pdf-btn" title="Đóng (ESC)">✕</button>
      </div>
      <iframe id="pdf-frame" title="Xem trước PDF" style="flex:1;width:100%;border:0;background:#e8eaed;"></iframe>
      <style>
        ._pdf-btn { min-height:32px;padding:0 12px;border:1px solid rgba(0,0,0,.12);border-radius:8px;background:#f3f4f6;color:#374151;cursor:pointer;font-size:12px; }
        ._pdf-btn:hover { background:#e5e7eb; }
        ._pdf-danger { background:#fee2e2;border-color:rgba(185,28,28,.2);color:#b91c1c; }
      </style>`;
    overlay.querySelector('#pdf-file-name').textContent = fileName || title || 'Tài liệu PDF';
    overlay.querySelector('#pdf-subtitle').textContent = subtitle || '';
    overlay.querySelector('#pdf-frame').src = blobUrl;
    if (!onDelete) overlay.querySelector('#pdf-delete').remove();
    if (!onOpenExternal) overlay.querySelector('#pdf-open-external').remove();
    document.body.appendChild(overlay);

    const close = () => {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      URL.revokeObjectURL(blobUrl);
    };
    const onKeydown = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKeydown);
    overlay.querySelector('#pdf-close').addEventListener('click', close);
    overlay.querySelector('#pdf-download').addEventListener('click', () => {
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = fileName || 'document.pdf';
      anchor.click();
    });
    overlay.querySelector('#pdf-open-external')?.addEventListener('click', async () => {
      const result = await onOpenExternal();
      if (!result.success) toast.error('Lỗi mở file', result.error);
    });
    overlay.querySelector('#pdf-delete')?.addEventListener('click', async () => {
      await onDelete();
    });
  }

  return { open };
})();

window.pdfPreview = pdfPreview;
