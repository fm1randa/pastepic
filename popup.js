(() => {
  const providerEl = document.getElementById('provider');
  const imgurEl = document.getElementById('imgurClientId');
  const statusEl = document.getElementById('status');

  function api() {
    return globalThis.chrome ?? globalThis.browser;
  }

  api().storage.sync.get(
    { provider: 'auto', format: 'html', imgurClientId: '' },
    (items) => {
      providerEl.value = items.provider || 'auto';
      imgurEl.value = items.imgurClientId || '';
      const fmt = items.format || 'html';
      const radio = document.querySelector(`input[name="format"][value="${fmt}"]`);
      if (radio) radio.checked = true;
    }
  );

  const helpBtn = document.getElementById('imgurHelp');
  const helpText = document.getElementById('imgurHelpText');
  if (helpBtn && helpText) {
    helpBtn.addEventListener('click', () => {
      const open = helpBtn.getAttribute('aria-expanded') === 'true';
      helpBtn.setAttribute('aria-expanded', String(!open));
      helpText.hidden = open;
    });
  }

  document.getElementById('save').addEventListener('click', () => {
    const checked = document.querySelector('input[name="format"]:checked');
    api().storage.sync.set(
      {
        provider: providerEl.value,
        format: checked ? checked.value : 'html',
        imgurClientId: imgurEl.value.trim(),
      },
      () => {
        statusEl.textContent = 'Salvo!';
        setTimeout(() => window.close(), 600);
      }
    );
  });
})();
