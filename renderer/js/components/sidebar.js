/* ============================================================
   Sidebar - Navigation with active state
   ============================================================ */
'use strict';

const sidebar = (() => {
  const sidebarEl = document.getElementById('sidebar');
  const navItems  = document.querySelectorAll('.nav-item[data-route]');

  function init() {
    // Wire up nav items
    navItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const route = item.getAttribute('data-route');
        if (route) router.navigate(route);
      });
    });
  }

  function setActive(route) {
    navItems.forEach((item) => {
      const itemRoute = item.getAttribute('data-route');
      item.classList.toggle('active', itemRoute === route);
    });
  }

  function setBadge(route, count) {
    const item = document.querySelector(`.nav-item[data-route="${route}"]`);
    if (!item) return;
    let badge = item.querySelector('.nav-item-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-item-badge';
        item.appendChild(badge);
      }
      badge.textContent = count > 99 ? '99+' : count;
    } else if (badge) {
      badge.remove();
    }
  }

  return { init, setActive, setBadge };
})();

window.sidebar = sidebar;
