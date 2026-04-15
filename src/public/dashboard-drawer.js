(function initDashboardDrawer() {
  const layout = document.querySelector('.drawer-layout');
  const toggle = document.querySelector('[data-dashboard-drawer-toggle]');
  const drawer = document.querySelector('[data-dashboard-drawer]');
  const backdrop = document.querySelector('[data-dashboard-drawer-backdrop]');

  if (!layout || !toggle || !drawer || !backdrop) {
    return;
  }

  const mobileMedia = window.matchMedia('(max-width: 920px)');

  function isOpen() {
    return layout.classList.contains('is-drawer-open');
  }

  function openDrawer() {
    layout.classList.add('is-drawer-open');
    document.body.classList.add('dashboard-drawer-open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function closeDrawer() {
    layout.classList.remove('is-drawer-open');
    document.body.classList.remove('dashboard-drawer-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', () => {
    if (!mobileMedia.matches) {
      return;
    }

    if (isOpen()) {
      closeDrawer();
      return;
    }

    openDrawer();
  });

  backdrop.addEventListener('click', () => {
    closeDrawer();
  });

  drawer.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (mobileMedia.matches) {
        closeDrawer();
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      closeDrawer();
    }
  });

  const handleMediaChange = (event) => {
    if (!event.matches) {
      closeDrawer();
    }
  };

  if (typeof mobileMedia.addEventListener === 'function') {
    mobileMedia.addEventListener('change', handleMediaChange);
  } else if (typeof mobileMedia.addListener === 'function') {
    mobileMedia.addListener(handleMediaChange);
  }
})();
