(function initPreviewGallery() {
  const toolbars = document.querySelectorAll('[data-preview-toolbar]');
  if (!toolbars.length) {
    return;
  }

  toolbars.forEach((toolbar) => {
    const section = toolbar.closest('.panel');
    if (!section) {
      return;
    }

    const filterButtons = toolbar.querySelectorAll('[data-preview-filter]');
    const searchInput = toolbar.querySelector('[data-preview-search]');
    const cards = section.querySelectorAll('[data-preview-card]');
    const emptyState = section.querySelector('[data-preview-empty]');
    let activeFilter = 'all';

    const applyFilters = () => {
      const query = String(searchInput && searchInput.value ? searchInput.value : '')
        .trim()
        .toLowerCase();
      let visibleCount = 0;

      cards.forEach((card) => {
        const platform = String(card.getAttribute('data-platform') || '').toLowerCase();
        const id = String(card.getAttribute('data-preview-id') || '').toLowerCase();
        const title = String(card.getAttribute('data-preview-title') || '').toLowerCase();
        const passesPlatform = activeFilter === 'all' || platform === activeFilter;
        const passesSearch = !query || id.includes(query) || title.includes(query);
        const shouldShow = passesPlatform && passesSearch;
        card.hidden = !shouldShow;
        if (shouldShow) {
          visibleCount += 1;
        }
      });

      if (emptyState) {
        emptyState.hidden = visibleCount > 0;
      }
    };

    filterButtons.forEach((button) => {
      button.addEventListener('click', () => {
        activeFilter = String(button.getAttribute('data-preview-filter') || 'all').toLowerCase();
        filterButtons.forEach((item) => {
          item.classList.toggle('active', item === button);
        });
        applyFilters();
      });
    });

    if (searchInput) {
      searchInput.addEventListener('input', applyFilters);
    }

    applyFilters();
  });
})();
