'use strict';

/**
 * Tạo response thành công
 * @param {*} data - Dữ liệu trả về
 * @param {string} [message] - Thông điệp tùy chọn
 * @returns {{ success: true, data: *, message?: string }}
 */
function ok(data, message) {
  const res = { success: true, data };
  if (message) res.message = message;
  return res;
}

/**
 * Tạo response lỗi
 * @param {string} error - Mô tả lỗi
 * @param {string} [code] - Mã lỗi tùy chọn
 * @returns {{ success: false, error: string, code?: string }}
 */
function fail(error, code) {
  const res = { success: false, error };
  if (code) res.code = code;
  return res;
}

/**
 * Tạo response phân trang
 * @param {Array} items - Danh sách dữ liệu
 * @param {number} total - Tổng số bản ghi
 * @param {number} page - Trang hiện tại
 * @param {number} pageSize - Số bản ghi mỗi trang
 * @returns {{ success: true, data: { items, total, page, pageSize, totalPages } }}
 */
function paginated(items, total, page, pageSize) {
  return {
    success: true,
    data: {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

module.exports = { ok, fail, paginated };
