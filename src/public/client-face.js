(function initClientAppearance() {
  const STORAGE_KEYS = {
    face: 'futureeapro.client.faceStyle',
    theme: 'futureeapro.client.theme',
    glass: 'futureeapro.client.glassStyle',
    font: 'futureeapro.client.fontStyle',
    textCase: 'futureeapro.client.textCase',
    background: 'futureeapro.client.backgroundMode',
    bottomShade: 'futureeapro.client.bottomShade',
    customShadeHue: 'futureeapro.client.customShadeHue',
    customShadeSat: 'futureeapro.client.customShadeSat',
    customShadeVal: 'futureeapro.client.customShadeVal',
    robotBg: 'futureeapro.client.robotBackgroundImage',
    bgMediaId: 'futureeapro.client.backgroundMediaId',
    bgMediaUrl: 'futureeapro.client.backgroundMediaUrl',
    bgMediaType: 'futureeapro.client.backgroundMediaType',
  };

  const root = document.documentElement;
  const appRoot = document.querySelector('.client-app-root');
  const defaultRobotBg = String(appRoot?.dataset.defaultRobotBg || '/assets/robots/robot-aurora.jpg');
  const defaultMediaId = String(appRoot?.dataset.defaultMediaId || '').trim();
  const faceSelectors = Array.from(document.querySelectorAll('[data-face-style-select]'));
  const faceStyleButtons = Array.from(document.querySelectorAll('[data-face-style-choice]'));
  const mediaLibraryScript = document.getElementById('client-media-library');
  const bgMediaButtons = Array.from(document.querySelectorAll('[data-bg-media-choice]'));
  const bgVideo = document.querySelector('[data-client-bg-video]');
  const bgImage = document.querySelector('[data-client-bg-image]');
  const bgMediaUrlInput = document.querySelector('[data-bg-media-url-input]');
  const applyBgMediaUrlButton = document.querySelector('[data-action="apply-background-media-url"]');
  const resetBgMediaButton = document.querySelector('[data-action="reset-background-media"]');

  const SETTINGS = [
    {
      attribute: 'data-face-style',
      key: STORAGE_KEYS.face,
      fallback: 'square',
      valid: new Set(['square', 'rounded', 'pill', 'super-pill', 'capsule', 'frame']),
      selectElements: faceSelectors,
      buttonElements: faceStyleButtons,
    },
    {
      attribute: 'data-client-theme',
      key: STORAGE_KEYS.theme,
      fallback: 'red',
      valid: new Set(['red', 'pink', 'blue', 'green', 'purple', 'orange', 'cyan']),
      buttonElements: Array.from(document.querySelectorAll('[data-client-theme-choice]')),
    },
    {
      attribute: 'data-glass-style',
      key: STORAGE_KEYS.glass,
      fallback: 'neon',
      valid: new Set(['neon', 'minimal', 'liquid', 'commander', 'mech']),
      buttonElements: Array.from(document.querySelectorAll('[data-glass-style-choice]')),
    },
    {
      attribute: 'data-font-style',
      key: STORAGE_KEYS.font,
      fallback: 'system',
      valid: new Set(['system', 'mono', 'rounded', 'condensed', 'serif', 'grotesk']),
      buttonElements: Array.from(document.querySelectorAll('[data-font-style-choice]')),
    },
    {
      attribute: 'data-text-case',
      key: STORAGE_KEYS.textCase,
      fallback: 'normal',
      valid: new Set(['normal', 'upper', 'lower', 'capitalize']),
      buttonElements: Array.from(document.querySelectorAll('[data-text-case-choice]')),
    },
    {
      attribute: 'data-bg-style',
      key: STORAGE_KEYS.background,
      fallback: 'robot',
      valid: new Set(['robot', 'v1', 'v2', 'v3', 'v4', 'off']),
      buttonElements: Array.from(document.querySelectorAll('[data-bg-style-choice]')),
    },
    {
      attribute: 'data-bottom-shade',
      key: STORAGE_KEYS.bottomShade,
      fallback: 'red',
      valid: new Set(['red', 'pink', 'orange', 'amber', 'purple', 'blue', 'teal', 'green', 'custom']),
      buttonElements: Array.from(document.querySelectorAll('[data-bottom-shade-choice]')),
    },
  ];

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

  const safeRemove = (key) => {
    try {
      localStorage.removeItem(key);
    } catch (_error) {
      // Ignore storage write errors.
    }
  };

  const readMediaLibrary = () => {
    if (!mediaLibraryScript) {
      return [];
    }

    try {
      const parsed = JSON.parse(mediaLibraryScript.textContent || '[]');
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed;
    } catch (_error) {
      return [];
    }
  };

  const isVideoSource = (value) => /\.(mp4|webm|ogg|m4v)(\?|#|$)/i.test(String(value || '').trim());

  const normalizeMediaType = (typeValue, srcValue) => {
    const normalized = String(typeValue || '').trim().toLowerCase();
    if (normalized === 'video' || normalized === 'image') {
      return normalized;
    }
    return isVideoSource(srcValue) ? 'video' : 'image';
  };

  const normalizeMediaItem = (item, fallbackId = '') => {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const src = String(item.src || '').trim();
    if (!src) {
      return null;
    }

    return {
      id: String(item.id || fallbackId || '').trim() || `media-${Date.now()}`,
      label: String(item.label || item.name || 'Background').trim() || 'Background',
      type: normalizeMediaType(item.type, src),
      src,
      poster: String(item.poster || '').trim() || src,
    };
  };

  const getButtonValue = (button) =>
    button.dataset.clientThemeChoice ||
    button.dataset.faceStyleChoice ||
    button.dataset.glassStyleChoice ||
    button.dataset.fontStyleChoice ||
    button.dataset.textCaseChoice ||
    button.dataset.bgStyleChoice ||
    button.dataset.bottomShadeChoice ||
    '';

  const applySetting = (config, value, options = {}) => {
    const { persist = true } = options;
    const normalized = config.valid.has(value) ? value : config.fallback;
    root.setAttribute(config.attribute, normalized);

    (config.selectElements || []).forEach((select) => {
      select.value = normalized;
    });

    (config.buttonElements || []).forEach((button) => {
      button.classList.toggle('active', getButtonValue(button) === normalized);
    });

    if (config.attribute === 'data-bottom-shade' && normalized !== 'custom') {
      root.style.removeProperty('--client-bottom-shade');
      root.style.removeProperty('--client-bottom-shade-soft');
      root.style.removeProperty('--client-accent');
      root.style.removeProperty('--client-accent-soft');
      root.style.removeProperty('--client-accent-glow');
      root.style.removeProperty('--client-border');
    }

    if (persist) {
      safeWrite(config.key, normalized);
    }

    return normalized;
  };

  const settingByAttribute = Object.fromEntries(SETTINGS.map((config) => [config.attribute, config]));

  SETTINGS.forEach((config) => {
    const savedValue = safeRead(config.key, config.fallback);
    applySetting(config, savedValue);

    (config.selectElements || []).forEach((select) => {
      select.addEventListener('change', () => {
        applySetting(config, select.value);
      });
    });

    (config.buttonElements || []).forEach((button) => {
      button.addEventListener('click', () => {
        const nextValue = getButtonValue(button) || config.fallback;

        if (config.attribute === 'data-bottom-shade' && nextValue === 'custom') {
          applyCustomShade(true);
          return;
        }

        applySetting(config, nextValue);
      });
    });
  });

  const bgInput = document.querySelector('[data-robot-bg-input]');
  const bgFileInput = document.querySelector('[data-robot-bg-file]');
  const applyBgButton = document.querySelector('[data-action="apply-robot-bg-url"]');
  const resetBgButton = document.querySelector('[data-action="reset-robot-bg"]');
  const mediaLibrary = readMediaLibrary()
    .map((item, index) => normalizeMediaItem(item, `library-${index + 1}`))
    .filter(Boolean);
  const mediaLibraryById = new Map(mediaLibrary.map((item) => [item.id, item]));
  const defaultMedia =
    mediaLibraryById.get(defaultMediaId) ||
    mediaLibrary[0] ||
    normalizeMediaItem({
      id: 'robot-default',
      label: 'Robot Default',
      type: 'image',
      src: defaultRobotBg,
      poster: defaultRobotBg,
    });

  const toCssUrl = (value) => `url("${String(value).replace(/"/g, '\\\"')}")`;

  const setActiveBackgroundChoice = (mediaId) => {
    bgMediaButtons.forEach((button) => {
      button.classList.toggle('active', String(button.dataset.bgMediaChoice || '') === String(mediaId || ''));
    });
  };

  const applyBackgroundMedia = (mediaInput, options = {}) => {
    const { persist = true } = options;
    const normalized = normalizeMediaItem(mediaInput);
    if (!normalized) {
      return;
    }

    root.setAttribute('data-bg-media-type', normalized.type);
    root.style.setProperty('--client-screen-bg-image', toCssUrl(normalized.poster || normalized.src));

    if (bgImage) {
      bgImage.src = normalized.poster || normalized.src;
    }

    if (bgVideo) {
      if (normalized.type === 'video') {
        bgVideo.hidden = false;

        if (bgVideo.getAttribute('src') !== normalized.src) {
          bgVideo.src = normalized.src;
          bgVideo.load();
        }

        if (normalized.poster) {
          bgVideo.poster = normalized.poster;
        } else {
          bgVideo.removeAttribute('poster');
        }

        bgVideo.play().catch(() => {
          // Ignore autoplay restrictions.
        });
      } else {
        bgVideo.pause();
        bgVideo.hidden = true;
        bgVideo.removeAttribute('src');
        bgVideo.load();
      }
    }

    if (bgMediaUrlInput) {
      bgMediaUrlInput.value = normalized.id === 'custom-url' ? normalized.src : '';
    }

    setActiveBackgroundChoice(normalized.id);

    if (!persist) {
      return;
    }

    if (mediaLibraryById.has(normalized.id)) {
      safeWrite(STORAGE_KEYS.bgMediaId, normalized.id);
      safeRemove(STORAGE_KEYS.bgMediaUrl);
      safeRemove(STORAGE_KEYS.bgMediaType);
      return;
    }

    safeWrite(STORAGE_KEYS.bgMediaId, 'custom-url');
    safeWrite(STORAGE_KEYS.bgMediaUrl, normalized.src);
    safeWrite(STORAGE_KEYS.bgMediaType, normalized.type);
  };

  const applyRobotBackgroundImage = (imageValue, options = {}) => {
    const { persist = true, syncMedia = true } = options;
    const normalized = String(imageValue || '').trim() || defaultRobotBg;
    root.style.setProperty('--client-screen-bg-image', toCssUrl(normalized));

    if (bgInput) {
      bgInput.value = normalized === defaultRobotBg ? '' : normalized;
    }

    if (persist) {
      if (normalized === defaultRobotBg) {
        safeRemove(STORAGE_KEYS.robotBg);
      } else {
        safeWrite(STORAGE_KEYS.robotBg, normalized);
      }
    }

    if (syncMedia) {
      applyBackgroundMedia(
        {
          id: 'custom-url',
          label: 'Robot Image',
          type: 'image',
          src: normalized,
          poster: normalized,
        },
        { persist }
      );
    }
  };

  const savedRobotBg = safeRead(STORAGE_KEYS.robotBg, '');
  applyRobotBackgroundImage(savedRobotBg || defaultRobotBg, { persist: false, syncMedia: false });

  const savedMediaId = safeRead(STORAGE_KEYS.bgMediaId, '');
  const savedCustomMediaUrl = String(safeRead(STORAGE_KEYS.bgMediaUrl, '')).trim();
  const savedCustomMediaType = safeRead(STORAGE_KEYS.bgMediaType, '');

  if (savedMediaId === 'custom-url' && savedCustomMediaUrl) {
    applyBackgroundMedia(
      {
        id: 'custom-url',
        label: 'Custom URL',
        type: savedCustomMediaType || normalizeMediaType('', savedCustomMediaUrl),
        src: savedCustomMediaUrl,
        poster: savedCustomMediaUrl,
      },
      { persist: false }
    );
  } else if (savedMediaId && mediaLibraryById.has(savedMediaId)) {
    applyBackgroundMedia(mediaLibraryById.get(savedMediaId), { persist: false });
  } else if (defaultMedia) {
    applyBackgroundMedia(defaultMedia, { persist: false });
  }

  bgMediaButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const id = String(button.dataset.bgMediaChoice || '').trim();
      const media = mediaLibraryById.get(id);
      if (!media) {
        return;
      }
      applyBackgroundMedia(media, { persist: true });
    });
  });

  if (applyBgMediaUrlButton && bgMediaUrlInput) {
    applyBgMediaUrlButton.addEventListener('click', () => {
      const value = String(bgMediaUrlInput.value || '').trim();
      if (!value) {
        return;
      }
      applyBackgroundMedia(
        {
          id: 'custom-url',
          label: 'Custom URL',
          type: normalizeMediaType('', value),
          src: value,
          poster: value,
        },
        { persist: true }
      );
    });
  }

  if (resetBgMediaButton) {
    resetBgMediaButton.addEventListener('click', () => {
      const baseMedia = defaultMedia || {
        id: 'custom-url',
        label: 'Robot Default',
        type: 'image',
        src: defaultRobotBg,
        poster: defaultRobotBg,
      };
      applyBackgroundMedia(baseMedia, { persist: true });
    });
  }

  if (applyBgButton && bgInput) {
    applyBgButton.addEventListener('click', () => {
      applyRobotBackgroundImage(bgInput.value, { persist: true });
    });
  }

  if (resetBgButton) {
    resetBgButton.addEventListener('click', () => {
      applyRobotBackgroundImage(defaultRobotBg, { persist: true });
    });
  }

  if (bgFileInput) {
    bgFileInput.addEventListener('change', () => {
      const file = bgFileInput.files && bgFileInput.files[0];
      if (!file || !file.type.startsWith('image/')) {
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result) {
          return;
        }
        applyRobotBackgroundImage(result, { persist: true });
      };
      reader.readAsDataURL(file);
    });
  }

  const shadePad = document.querySelector('[data-shade-pad]');
  const shadeDot = document.querySelector('[data-shade-dot]');
  const shadeHue = document.querySelector('[data-shade-hue]');
  const shadeValueLabel = document.querySelector('[data-custom-shade-value]');
  const applyCustomShadeButton = document.querySelector('[data-action="apply-custom-shade"]');

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const hsvToRgb = (h, s, v) => {
    const hue = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = v - c;
    let r = 0;
    let g = 0;
    let b = 0;

    if (hue < 60) {
      r = c;
      g = x;
    } else if (hue < 120) {
      r = x;
      g = c;
    } else if (hue < 180) {
      g = c;
      b = x;
    } else if (hue < 240) {
      g = x;
      b = c;
    } else if (hue < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  };

  const rgbToHex = ({ r, g, b }) =>
    `#${[r, g, b]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')}`;

  const hexToRgba = (hex, alpha) => {
    const clean = hex.replace('#', '').trim();
    if (clean.length !== 6) {
      return `rgba(239, 47, 55, ${alpha})`;
    }
    const r = Number.parseInt(clean.slice(0, 2), 16);
    const g = Number.parseInt(clean.slice(2, 4), 16);
    const b = Number.parseInt(clean.slice(4, 6), 16);
    if ([r, g, b].some((value) => Number.isNaN(value))) {
      return `rgba(239, 47, 55, ${alpha})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const customShadeState = {
    h: clamp(Number.parseFloat(safeRead(STORAGE_KEYS.customShadeHue, '0')) || 0, 0, 360),
    s: clamp(Number.parseFloat(safeRead(STORAGE_KEYS.customShadeSat, '0.72')) || 0.72, 0, 1),
    v: clamp(Number.parseFloat(safeRead(STORAGE_KEYS.customShadeVal, '0.95')) || 0.95, 0, 1),
  };

  const getCustomHex = () => rgbToHex(hsvToRgb(customShadeState.h, customShadeState.s, customShadeState.v));

  const renderShadePicker = () => {
    if (!shadePad || !shadeDot || !shadeHue) {
      return;
    }

    const hueColor = `hsl(${customShadeState.h}, 100%, 50%)`;
    shadePad.style.background =
      `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`;
    shadeHue.value = String(customShadeState.h);

    shadeDot.style.left = `${customShadeState.s * 100}%`;
    shadeDot.style.top = `${(1 - customShadeState.v) * 100}%`;

    if (shadeValueLabel) {
      shadeValueLabel.textContent = getCustomHex();
    }
  };

  const applyCustomShade = (persist = false) => {
    const accentHex = getCustomHex();
    const accentSoftHex = rgbToHex(
      hsvToRgb(
        customShadeState.h,
        clamp(customShadeState.s * 0.72, 0, 1),
        clamp(customShadeState.v + 0.08, 0, 1)
      )
    );
    const accentGlowHex = rgbToHex(
      hsvToRgb(customShadeState.h, clamp(customShadeState.s * 0.44, 0, 1), 1)
    );

    root.style.setProperty('--client-accent', accentHex);
    root.style.setProperty('--client-accent-soft', accentSoftHex);
    root.style.setProperty('--client-accent-glow', accentGlowHex);
    root.style.setProperty('--client-border', hexToRgba(accentHex, 0.55));
    root.style.setProperty('--client-bottom-shade-soft', hexToRgba(accentHex, 0.32));
    root.style.setProperty('--client-bottom-shade', hexToRgba(accentHex, 0.72));

    const bottomShadeConfig = settingByAttribute['data-bottom-shade'];
    if (bottomShadeConfig) {
      applySetting(bottomShadeConfig, 'custom', { persist });
    }

    if (persist) {
      safeWrite(STORAGE_KEYS.customShadeHue, String(customShadeState.h));
      safeWrite(STORAGE_KEYS.customShadeSat, String(customShadeState.s));
      safeWrite(STORAGE_KEYS.customShadeVal, String(customShadeState.v));
    }
  };

  renderShadePicker();

  if (root.getAttribute('data-bottom-shade') === 'custom') {
    applyCustomShade(false);
  }

  if (shadeHue) {
    shadeHue.addEventListener('input', () => {
      customShadeState.h = clamp(Number.parseFloat(shadeHue.value) || 0, 0, 360);
      renderShadePicker();
      if (root.getAttribute('data-bottom-shade') === 'custom') {
        applyCustomShade(false);
      }
    });
  }

  if (shadePad && shadeDot) {
    const updateFromEvent = (event) => {
      const rect = shadePad.getBoundingClientRect();
      const pointX = event.touches ? event.touches[0].clientX : event.clientX;
      const pointY = event.touches ? event.touches[0].clientY : event.clientY;
      const x = clamp((pointX - rect.left) / rect.width, 0, 1);
      const y = clamp((pointY - rect.top) / rect.height, 0, 1);
      customShadeState.s = x;
      customShadeState.v = 1 - y;
      renderShadePicker();
      if (root.getAttribute('data-bottom-shade') === 'custom') {
        applyCustomShade(false);
      }
    };

    let dragging = false;

    const startDrag = (event) => {
      dragging = true;
      updateFromEvent(event);
      event.preventDefault();
    };

    const onDrag = (event) => {
      if (!dragging) {
        return;
      }
      updateFromEvent(event);
      event.preventDefault();
    };

    const stopDrag = () => {
      dragging = false;
    };

    shadePad.addEventListener('mousedown', startDrag);
    shadePad.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('touchmove', onDrag, { passive: false });
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchend', stopDrag);
  }

  if (applyCustomShadeButton) {
    applyCustomShadeButton.addEventListener('click', () => {
      applyCustomShade(true);
    });
  }
})();
