/* ============================================================
   DataTable - Sortable, filterable table component
   ============================================================ */
'use strict';

class DataTable {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.container
   * @param {Array} opts.columns - [{ key, label, sortable, render(val, row) }]
   * @param {Function} opts.fetchData - async (opts) => { items, total, page, pageSize }
   * @param {Array} [opts.actions] - [{ label, class, action(row) }]
   * @param {number} [opts.pageSize]
   */
  constructor(opts) {
    this.container  = opts.container;
    this.columns    = opts.columns || [];
    this.fetchData  = opts.fetchData;
    this.actions    = opts.actions || [];
    this.pageSize   = opts.pageSize || 20;
    this.page       = 1;
    this.sortKey    = null;
    this.sortDir    = 'asc';
    this.search     = '';
    this.filters    = {};
    this._total     = 0;
    this._data      = [];

    this._build();
  }

  _build() {
    this.container.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead><tr id="dt-head"></tr></thead>
          <tbody id="dt-body"></tbody>
        </table>
      </div>
      <div class="table-footer">
        <div class="table-info" id="dt-info"></div>
        <div class="pagination" id="dt-pagination"></div>
      </div>
    `;
    this._renderHead();
  }

  _renderHead() {
    const tr = this.container.querySelector('#dt-head');
    tr.innerHTML = '';

    for (const col of this.columns) {
      const th = document.createElement('th');
      th.textContent = col.label;
      if (col.sortable) {
        th.className = 'sortable';
        if (this.sortKey === col.key) th.className += ` sort-${this.sortDir}`;
        th.addEventListener('click', () => this._toggleSort(col.key));
      }
      if (col.width) th.style.width = col.width;
      tr.appendChild(th);
    }

    if (this.actions.length) {
      const th = document.createElement('th');
      th.textContent = 'Thao tác';
      th.style.width = '120px';
      tr.appendChild(th);
    }
  }

  _renderBody() {
    const tbody = this.container.querySelector('#dt-body');
    tbody.innerHTML = '';

    if (this._data.length === 0) {
      const cols = this.columns.length + (this.actions.length ? 1 : 0);
      tbody.innerHTML = `
        <tr>
          <td colspan="${cols}">
            <div class="table-empty">
              <div class="table-empty-icon">📭</div>
              <div class="table-empty-text">Không có dữ liệu</div>
            </div>
          </td>
        </tr>`;
      return;
    }

    for (const row of this._data) {
      const tr = document.createElement('tr');
      for (const col of this.columns) {
        const td = document.createElement('td');
        if (col.render) {
          const result = col.render(row[col.key], row);
          if (typeof result === 'string') td.innerHTML = result;
          else if (result instanceof HTMLElement) td.appendChild(result);
        } else {
          td.textContent = row[col.key] !== null && row[col.key] !== undefined ? row[col.key] : '—';
        }
        tr.appendChild(td);
      }

      if (this.actions.length) {
        const td = document.createElement('td');
        td.className = 'table-actions';
        for (const act of this.actions) {
          if (act.show && !act.show(row)) continue;
          const btn = document.createElement('button');
          btn.className = `btn btn-sm ${act.class || 'btn-secondary'}`;
          btn.textContent = act.label;
          btn.title = act.title || act.label;
          btn.addEventListener('click', (e) => { e.stopPropagation(); act.action(row); });
          td.appendChild(btn);
        }
        tr.appendChild(td);
      }

      tr.addEventListener('click', () => this.onRowClick && this.onRowClick(row));
      tbody.appendChild(tr);
    }
  }

  _renderPagination() {
    const info = this.container.querySelector('#dt-info');
    const pag  = this.container.querySelector('#dt-pagination');
    const totalPages = Math.ceil(this._total / this.pageSize);
    const start = (this.page - 1) * this.pageSize + 1;
    const end   = Math.min(this.page * this.pageSize, this._total);

    info.textContent = this._total > 0
      ? `Hiển thị ${start}–${end} / ${this._total} bản ghi`
      : 'Không có dữ liệu';

    pag.innerHTML = '';
    if (totalPages <= 1) return;

    const createBtn = (label, page, disabled = false, active = false) => {
      const btn = document.createElement('button');
      btn.className = `page-btn${active ? ' active' : ''}`;
      btn.textContent = label;
      btn.disabled = disabled;
      btn.addEventListener('click', () => { this.page = page; this.load(); });
      return btn;
    };

    pag.appendChild(createBtn('«', 1, this.page === 1));
    pag.appendChild(createBtn('‹', this.page - 1, this.page === 1));

    const range = _pageRange(this.page, totalPages);
    let prev = null;
    for (const p of range) {
      if (prev !== null && p - prev > 1) {
        const dots = document.createElement('span');
        dots.textContent = '...';
        dots.style.padding = '0 4px';
        pag.appendChild(dots);
      }
      pag.appendChild(createBtn(p, p, false, p === this.page));
      prev = p;
    }

    pag.appendChild(createBtn('›', this.page + 1, this.page === totalPages));
    pag.appendChild(createBtn('»', totalPages, this.page === totalPages));
  }

  _toggleSort(key) {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDir = 'asc';
    }
    this.page = 1;
    this.load();
  }

  /**
   * Tải dữ liệu
   */
  async load() {
    const tbody = this.container.querySelector('#dt-body');
    if (tbody) {
      const cols = this.columns.length + (this.actions.length ? 1 : 0);
      tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;padding:32px;">
        <div class="spinner"></div>
      </td></tr>`;
    }

    const opts = {
      page: this.page,
      pageSize: this.pageSize,
      search: this.search,
      ...this.filters,
    };
    if (this.sortKey) opts.orderBy = `${this.sortKey} ${this.sortDir}`;

    const res = await this.fetchData(opts);

    if (res.success) {
      const d = res.data;
      this._data  = d.items || d || [];
      this._total = d.total !== undefined ? d.total : this._data.length;
      this.page   = d.page  || this.page;
    } else {
      this._data  = [];
      this._total = 0;
      toast.error('Lỗi tải dữ liệu', res.error);
    }

    this._renderHead();
    this._renderBody();
    this._renderPagination();
  }

  /**
   * Đặt lại bộ lọc và tải lại
   */
  setFilters(filters) {
    this.filters = { ...this.filters, ...filters };
    this.page = 1;
    this.load();
  }

  setSearch(search) {
    this.search = search;
    this.page = 1;
    this.load();
  }

  reload() { this.load(); }
}

function _pageRange(current, total) {
  const delta = 2;
  const range = [];
  for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) {
    range.push(i);
  }
  if (range[0] > 1) range.unshift(1);
  if (range[range.length - 1] < total) range.push(total);
  return [...new Set(range)];
}

window.DataTable = DataTable;
