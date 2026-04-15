(function initNavToggle() {
  const toggleButton = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!toggleButton || !nav) {
    return;
  }

  toggleButton.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggleButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggleButton.setAttribute('aria-expanded', 'false');
    });
  });
})();
