(() => {
  const providerEl = document.getElementById('provider');
  const imgurEl = document.getElementById('imgurClientId');
  const sameProviderEl = document.getElementById('sameProviderOnly');
  const statusEl = document.getElementById('status');

  function api() {
    return globalThis.chrome ?? globalThis.browser;
  }

  api().storage.sync.get(
    { provider: 'auto', format: 'html', imgurClientId: '', sameProviderOnly: false },
    (items) => {
      providerEl.value = items.provider || 'auto';
      sameProviderEl.checked = items.sameProviderOnly === true;
      imgurEl.value = items.imgurClientId || '';
      const fmt = items.format || 'html';
      const radio = document.querySelector(`input[name="format"][value="${fmt}"]`);
      if (radio) radio.checked = true;
    }
  );

  for (const helpBtn of document.querySelectorAll('button.info[aria-controls]')) {
    const helpText = document.getElementById(helpBtn.getAttribute('aria-controls'));
    if (!helpText) continue;
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
        sameProviderOnly: sameProviderEl.checked,
      },
      () => {
        statusEl.textContent = 'Salvo!';
        setTimeout(() => window.close(), 600);
      }
    );
  });
})();
