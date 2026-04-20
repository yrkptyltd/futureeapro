(function initClientDrawer() {
  const toggle = document.getElementById('client-menu-toggle');
  const drawer = document.getElementById('client-drawer');

  if (!toggle || !drawer) {
    return;
  }

  const closeButtons = Array.from(document.querySelectorAll('[data-action="close-drawer"]'));

  const setOpen = (isOpen) => {
    drawer.classList.toggle('open', isOpen);
    drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    document.body.classList.toggle('drawer-open', isOpen);
  };

  toggle.addEventListener('click', () => {
    const next = !drawer.classList.contains('open');
    setOpen(next);
  });

  closeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setOpen(false);
    });
  });

  document.addEventListener('click', (event) => {
    if (!drawer.classList.contains('open')) {
      return;
    }

    if (!drawer.contains(event.target) && !toggle.contains(event.target)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  });
})();

(function initHomeSectionButtons() {
  const quickButtons = Array.from(document.querySelectorAll('[data-go-section]'));
  if (!quickButtons.length) {
    return;
  }

  quickButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const section = String(button.dataset.goSection || '').trim();
      if (!section) {
        return;
      }
      const path = window.location.pathname;
      window.location.assign(`${path}?section=${encodeURIComponent(section)}`);
    });
  });
})();

(function initQuotesSymbolTabs() {
  const tabButtons = Array.from(document.querySelectorAll('[data-symbol-tab-choice]'));
  const tabPanels = Array.from(document.querySelectorAll('[data-symbol-tab-panel]'));
  if (!tabButtons.length || !tabPanels.length) {
    return;
  }

  const STORAGE_KEY = 'futureeapro.client.quotesSymbolTab';

  const safeRead = (key, fallback) => {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (_error) {
      return fallback;
    }
  };

  const safeWrite = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (_error) {
      // Ignore storage write errors.
    }
  };

  const applyTab = (tabValue) => {
    const normalized = tabValue === 'allowed' ? 'allowed' : 'symbols';

    tabButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.symbolTabChoice === normalized);
    });

    tabPanels.forEach((panel) => {
      const isActive = panel.dataset.symbolTabPanel === normalized;
      panel.classList.toggle('active', isActive);
      panel.hidden = !isActive;
    });

    safeWrite(STORAGE_KEY, normalized);
  };

  const saved = safeRead(STORAGE_KEY, 'symbols');
  applyTab(saved);

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      applyTab(button.dataset.symbolTabChoice || 'symbols');
    });
  });
})();

(function initRobotFloatingLauncher() {
  const launcher = document.getElementById('robot-floating-launcher');
  const panel = document.getElementById('robot-floating-panel');
  const closeButton = document.getElementById('robot-floating-close');
  const statusPill = document.getElementById('robot-status-pill');
  const mainActionButton = document.querySelector('[data-main-robot-action]');
  const mainActionIcon = document.querySelector('[data-main-robot-icon]');
  const mainActionLabel = document.querySelector('[data-main-robot-label]');
  const runningCopyNodes = Array.from(document.querySelectorAll('[data-robot-running-copy]'));
  const runningStatusRows = Array.from(
    document.querySelectorAll('.home-list-sub[data-robot-running-copy]')
  );

  if (!launcher || !panel || !statusPill) {
    return;
  }

  const VISIBILITY_KEY = 'futureeapro.client.robotLauncherVisible';
  const STATUS_KEY = 'futureeapro.client.robotStatus';
  const currentSection = new URLSearchParams(window.location.search).get('section') || 'home';
  const allowFloating = currentSection === 'home' || currentSection === 'trade';
  const startButtons = Array.from(document.querySelectorAll('[data-action="start-robot"]')).filter(
    (button) => button !== mainActionButton
  );
  const pauseButtons = Array.from(document.querySelectorAll('[data-action="pause-robot"]')).filter(
    (button) => button !== mainActionButton
  );
  const removeButtons = Array.from(document.querySelectorAll('[data-action="remove-robot"]'));

  const safeRead = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value || fallback;
    } catch (_error) {
      return fallback;
    }
  };

  const safeWrite = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (_error) {
      // Ignore storage write errors.
    }
  };

  const setVisible = (isVisible) => {
    const effectiveVisible = allowFloating ? isVisible : false;
    launcher.classList.toggle('is-hidden', !effectiveVisible);
    if (!effectiveVisible) {
      panel.classList.add('is-hidden');
    }
    safeWrite(VISIBILITY_KEY, isVisible ? '1' : '0');
  };

  const setMainActionMode = (statusValue) => {
    if (!mainActionButton) {
      return;
    }
    const isActive = statusValue === 'active';
    mainActionButton.dataset.action = isActive ? 'pause-robot' : 'start-robot';
    if (mainActionLabel) {
      mainActionLabel.textContent = isActive ? 'Stop' : 'Start';
    }
    if (mainActionIcon) {
      mainActionIcon.textContent = isActive ? '■' : '▶';
    }
  };

  const setRunningCopy = (statusValue) => {
    const isActive = statusValue === 'active';
    const nextText = isActive ? 'Running' : 'Paused';
    const profileText = isActive ? 'Active' : 'Paused';

    runningCopyNodes.forEach((node, index) => {
      if (!node) {
        return;
      }
      node.textContent = index === 0 ? profileText : nextText;
    });

    runningStatusRows.forEach((row) => {
      row.classList.toggle('running', isActive);
    });
  };

  const setStatus = (statusValue) => {
    const normalized = statusValue === 'paused' ? 'paused' : 'active';
    statusPill.textContent = normalized === 'active' ? 'Active' : 'Paused';
    statusPill.classList.remove('active', 'paused');
    statusPill.classList.add(normalized);
    setMainActionMode(normalized);
    setRunningCopy(normalized);
    safeWrite(STATUS_KEY, normalized);
  };

  const startRobot = () => {
    setVisible(true);
    setStatus('active');
    panel.classList.remove('is-hidden');
  };

  const pauseRobot = () => {
    setVisible(true);
    setStatus('paused');
    panel.classList.remove('is-hidden');
  };

  setVisible(safeRead(VISIBILITY_KEY, '0') === '1');
  setStatus(safeRead(STATUS_KEY, 'active'));

  for (const button of startButtons) {
    button.addEventListener('click', () => {
      startRobot();
    });
  }

  for (const button of pauseButtons) {
    button.addEventListener('click', () => {
      pauseRobot();
    });
  }

  if (mainActionButton) {
    mainActionButton.addEventListener('click', () => {
      const action = String(mainActionButton.dataset.action || '').trim();
      if (action === 'start-robot') {
        startRobot();
        return;
      }
      pauseRobot();
    });
  }

  for (const button of removeButtons) {
    button.addEventListener('click', () => {
      setVisible(false);
      setStatus('paused');
    });
  }

  launcher.addEventListener('click', (event) => {
    event.stopPropagation();
    panel.classList.toggle('is-hidden');
  });

  if (closeButton) {
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      panel.classList.add('is-hidden');
    });
  }

  document.addEventListener('click', (event) => {
    if (panel.classList.contains('is-hidden')) {
      return;
    }

    if (!panel.contains(event.target) && !launcher.contains(event.target)) {
      panel.classList.add('is-hidden');
    }
  });
})();

(function initMetraderTabs() {
  const tabButtons = Array.from(document.querySelectorAll('[data-platform-choice]'));
  const platformInput = document.querySelector('[data-platform-input]');
  const statusLabel = document.querySelector('[data-platform-status-label]');
  const statusDot = document.querySelector('.status-dot');
  const loginTitle = document.querySelector('[data-platform-login-title]');
  const mt4BrokersCard = document.querySelector('[data-mt4-brokers-card]');

  if (!tabButtons.length || !platformInput) {
    return;
  }

  const applyPlatform = (platformValue) => {
    const normalized = platformValue === 'MT4' ? 'MT4' : 'MT5';
    platformInput.value = normalized;

    tabButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.platformChoice === normalized);
    });

    if (statusLabel) {
      statusLabel.textContent = normalized === 'MT4' ? 'MT4 DISCONNECTED' : 'MT5 CONNECTED';
    }

    if (loginTitle) {
      loginTitle.textContent = normalized === 'MT4' ? 'MT4 LOGIN DETAILS' : 'MT5 LOGIN DETAILS';
    }

    if (statusDot) {
      statusDot.classList.toggle('off', normalized === 'MT4');
    }

    if (mt4BrokersCard) {
      mt4BrokersCard.hidden = normalized !== 'MT4';
    }
  };

  applyPlatform(platformInput.value);

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      applyPlatform(button.dataset.platformChoice || 'MT5');
    });
  });
})();

(function initTinyActions() {
  const spin = (button) => {
    button.classList.add('is-spinning');
    window.setTimeout(() => {
      button.classList.remove('is-spinning');
    }, 450);
  };

  document.querySelectorAll('[data-action="quotes-refresh"]').forEach((button) => {
    button.addEventListener('click', () => {
      spin(button);
      window.location.reload();
    });
  });

  document.querySelectorAll('[data-action="refresh-mt4"]').forEach((button) => {
    button.addEventListener('click', () => {
      spin(button);
    });
  });
})();
