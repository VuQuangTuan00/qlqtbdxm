/* ============================================================
   Store - Simple reactive state management
   ============================================================ */
'use strict';

const store = (() => {
  const _state = {
    session: null,
    currentRoute: null,
    units: [],
    unitsLoaded: false,
    roles: [],
    rolesLoaded: false,
  };

  const _listeners = {};

  /**
   * Lấy giá trị từ store
   * @param {string} key
   * @returns {*}
   */
  function get(key) {
    return _state[key];
  }

  /**
   * Cập nhật giá trị trong store
   * @param {string} key
   * @param {*} value
   */
  function set(key, value) {
    const old = _state[key];
    _state[key] = value;
    if (old !== value) {
      _emit(key, value, old);
    }
  }

  /**
   * Lắng nghe thay đổi
   * @param {string} key
   * @param {Function} fn
   * @returns {Function} Hàm hủy lắng nghe
   */
  function watch(key, fn) {
    if (!_listeners[key]) _listeners[key] = [];
    _listeners[key].push(fn);
    return () => {
      _listeners[key] = _listeners[key].filter((f) => f !== fn);
    };
  }

  function _emit(key, value, old) {
    if (_listeners[key]) {
      _listeners[key].forEach((fn) => fn(value, old));
    }
  }

  /**
   * Lấy session hiện tại
   */
  function getSession() { return _state.session; }

  /**
   * Cập nhật session
   */
  function setSession(session) { set('session', session); }

  /**
   * Kiểm tra quyền
   * @param {string|string[]} roles
   */
  function hasRole(...roles) {
    const session = _state.session;
    if (!session) return false;
    return roles.includes(session.roleCode);
  }

  return { get, set, watch, getSession, setSession, hasRole };
})();

window.store = store;
