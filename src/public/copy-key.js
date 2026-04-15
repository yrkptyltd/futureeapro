(function initCopyKeyButtons() {
  const buttons = Array.from(document.querySelectorAll('.copy-key-btn[data-copy-value]'));
  if (!buttons.length) {
    return;
  }

  async function copyText(value) {
    const text = String(value || '');
    if (!text) {
      return false;
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_error) {
        // fallback below
      }
    }

    const helper = document.createElement('input');
    helper.type = 'text';
    helper.value = text;
    helper.setAttribute('readonly', 'readonly');
    helper.style.position = 'absolute';
    helper.style.opacity = '0';
    helper.style.pointerEvents = 'none';
    document.body.appendChild(helper);
    helper.select();
    helper.setSelectionRange(0, helper.value.length);
    const copied = document.execCommand('copy');
    helper.remove();
    return copied;
  }

  buttons.forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.getAttribute('data-copy-value');
      const originalText = button.textContent;
      const copied = await copyText(value);
      button.textContent = copied ? 'Copied' : 'Copy failed';
      setTimeout(() => {
        button.textContent = originalText;
      }, 1200);
    });
  });
})();
