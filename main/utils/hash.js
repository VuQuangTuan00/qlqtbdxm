'use strict';

const bcrypt = require('bcryptjs');

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

/**
 * Hash mật khẩu
 * @param {string} plainText - Mật khẩu gốc
 * @returns {string} Mật khẩu đã hash
 */
function hashPassword(plainText) {
  const salt = bcrypt.genSaltSync(ROUNDS);
  return bcrypt.hashSync(plainText, salt);
}

/**
 * So sánh mật khẩu
 * @param {string} plainText - Mật khẩu gốc
 * @param {string} hash - Mật khẩu đã hash
 * @returns {boolean}
 */
function comparePassword(plainText, hash) {
  return bcrypt.compareSync(plainText, hash);
}

module.exports = { hashPassword, comparePassword };
