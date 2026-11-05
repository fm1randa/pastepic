#!/usr/bin/env node
// Drive provider-format-settings: the REAL built popup (dist/popup) against an
// in-memory chrome.storage stub (injected by /popup-test.html). Controls are
// found by role and accessible name, the way a user or screen reader finds them.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const PORT = arg('port', process.env.PASTEPIC_VERIFY_PORT ?? '8931');
const OUT = arg('out', 'artifacts/provider-format-settings');
const RUN_ID = arg('run-id', 'manual');
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (id, pass, detail) => { checks.push({ id, pass, detail }); if (!pass) console.error(`FAIL ${id}: ${detail}`); else console.log(`ok ${id}`); };

const popupUrl = (stored) =>
  `http://127.0.0.1:${PORT}/popup-test.html${stored ? `?stored=${encodeURIComponent(JSON.stringify(stored))}` : ''}`;

async function openPopup(browser, stored) {
  const page = await browser.newPage({ viewport: { width: 312, height: 640 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(popupUrl(stored), { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Salvar' }).waitFor({ timeout: 5000 });
  const ui = {
    provider: page.getByRole('combobox', { name: 'Servidor de imagens' }),
    html: page.getByRole('radio', { name: /^HTML/ }),
    markdown: page.getByRole('radio', { name: /^Markdown/ }),
    imgurId: page.getByRole('textbox', { name: 'Imgur Client-ID (opcional)' }),
    providerHelp: page.getByRole('button', { name: 'Sobre o modo automático' }),
    advanced: page.getByRole('button', { name: 'Opções avançadas' }),
    imgurHelp: page.getByRole('button', { name: 'Sobre o Imgur Client-ID' }),
    reuse: page.getByRole('checkbox', { name: 'Não reaproveitar uploads de outros provedores' }),
    reuseHelp: page.getByRole('button', { name: 'Sobre o reaproveitamento de uploads' }),
    save: page.getByRole('button', { name: 'Salvar' }),
    status: page.getByRole('status'),
  };
  return { page, ui, errors };
}

const IMGUR_HELP = 'fechou novos registros';
const REUSE_HELP = 'reaproveita o link anterior';
const PROVIDER_HELP = 'catbox → pomf → uguu → litterbox → tmpfiles';
const tooltipShown = (page, text) => page.getByRole('tooltip').filter({ hasText: text }).isVisible();

const settled = (page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

async function readUi(ui) {
  if (await ui.advanced.getAttribute('aria-expanded') !== 'true') await ui.advanced.click();
  return {
    // The accessible value, as a screen reader announces it (textContent also
    // carries the icon's hidden glyph).
    provider: (await ui.provider.ariaSnapshot()).split('": ').pop().trim(),
    html: await ui.html.isChecked(),
    markdown: await ui.markdown.isChecked(),
    imgurClientId: await ui.imgurId.inputValue(),
    sameProviderOnly: await ui.reuse.isChecked(),
  };
}

const browser = await chromium.launch();
try {
  const { page, ui, errors } = await openPopup(browser);
  check('advanced-collapsed-by-default',
    (await ui.advanced.getAttribute('aria-expanded')) === 'false' && !(await ui.imgurId.isVisible()) && !(await ui.reuse.isVisible()),
    'Imgur Client-ID and the reuse option start hidden');
  await page.screenshot({ path: path.join(OUT, 'screenshot-collapsed.png') });
  const defaults = await readUi(ui);
  check('advanced-expands',
    (await ui.advanced.getAttribute('aria-expanded')) === 'true' && (await ui.imgurId.isVisible()) && (await ui.reuse.isVisible()),
    'clicking Opções avançadas shows both options');
  check('defaults-loaded',
    defaults.provider === 'Automático (tenta vários)' && defaults.html && !defaults.markdown && defaults.imgurClientId === '',
    JSON.stringify(defaults));

  check('help-hidden-at-start',
    !(await tooltipShown(page, IMGUR_HELP)) && !(await tooltipShown(page, REUSE_HELP)) && !(await tooltipShown(page, PROVIDER_HELP)),
    'no help tooltip before interaction');
  await ui.providerHelp.hover();
  await page.getByRole('tooltip').filter({ hasText: PROVIDER_HELP }).waitFor({ timeout: 3000 }).catch(() => {});
  check('provider-help-on-hover', await tooltipShown(page, PROVIDER_HELP), 'hovering the info button shows the automatic chain');
  await page.mouse.move(0, 600);
  await page.getByRole('tooltip').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  await ui.imgurHelp.hover();
  await page.getByRole('tooltip').filter({ hasText: IMGUR_HELP }).waitFor({ timeout: 3000 }).catch(() => {});
  check('imgur-help-on-hover', await tooltipShown(page, IMGUR_HELP), 'hovering the info button shows the Imgur help');
  await page.mouse.move(0, 600);
  await page.getByRole('tooltip').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  check('imgur-help-closes', !(await tooltipShown(page, IMGUR_HELP)), 'moving away hides it');

  check('reuse-option-off-by-default', !defaults.sameProviderOnly, JSON.stringify({ checked: defaults.sameProviderOnly }));
  // Tab from the checkbox: tooltips open on keyboard focus, not on focus() after a pointer click.
  await ui.reuse.focus();
  await page.keyboard.press('Tab');
  await page.getByRole('tooltip').filter({ hasText: REUSE_HELP }).waitFor({ timeout: 3000 }).catch(() => {});
  check('reuse-help-on-focus',
    (await tooltipShown(page, REUSE_HELP)) && !(await tooltipShown(page, IMGUR_HELP)),
    JSON.stringify({ reuse: await tooltipShown(page, REUSE_HELP), imgur: await tooltipShown(page, IMGUR_HELP), active: await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) }));
  await page.keyboard.press('Escape');
  await page.getByRole('tooltip').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});

  await ui.provider.click();
  await page.getByRole('option', { name: 'pomf.lain.la (permanente)' }).click();
  await page.getByRole('listbox').waitFor({ state: 'hidden', timeout: 5000 });
  await ui.markdown.click();
  await ui.reuse.click();
  const chosen = await readUi(ui);
  check('choices-shown',
    chosen.provider === 'pomf.lain.la (permanente)' && chosen.markdown && !chosen.html && chosen.sameProviderOnly,
    JSON.stringify(chosen));

  await page.emulateMedia({ colorScheme: 'light' });
  const light = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  await settled(page);
  await page.screenshot({ path: path.join(OUT, 'screenshot-light.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await page.waitForFunction(() => document.documentElement.classList.contains('dark'), null, { timeout: 3000 })
    .then(() => true, () => false);
  await settled(page);
  await page.screenshot({ path: path.join(OUT, 'screenshot-dark.png'), fullPage: true });
  for (const [help, text, name] of [[ui.reuseHelp, REUSE_HELP, 'tooltip-reuse'], [ui.imgurHelp, IMGUR_HELP, 'tooltip-imgur'], [ui.providerHelp, PROVIDER_HELP, 'tooltip-provider']]) {
    await help.hover();
    await page.getByRole('tooltip').filter({ hasText: text }).waitFor({ timeout: 3000 });
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `screenshot-${name}.png`) });
    await page.mouse.move(0, 600);
    await page.getByRole('tooltip').waitFor({ state: 'hidden', timeout: 3000 });
  }
  check('color-scheme-follows-system', light === false && dark === true, JSON.stringify({ light, dark }));

  await ui.save.click();
  await ui.status.filter({ hasText: 'Salvo!' }).waitFor({ timeout: 5000 })
    .then(() => check('saved-feedback', true, '"Salvo!" shown'))
    .catch(() => check('saved-feedback', false, 'no "Salvo!" within 5s'));
  const saved = await page.evaluate(() => window.__pastepicSaved);
  check('settings-persisted',
    isDeepStrictEqual(saved, { provider: 'pomf', format: 'markdown', imgurClientId: '', sameProviderOnly: true }),
    JSON.stringify(saved));
  const closed = await page.waitForFunction(() => window.__pastepicClosed === true, null, { timeout: 3000 }).then(() => true, () => false);
  check('closes-after-save', closed, `window.close called=${closed}`);
  check('no-page-errors', errors.length === 0, JSON.stringify(errors));

  const stored = { provider: 'litterbox', format: 'markdown', imgurClientId: 'abc123', sameProviderOnly: true };
  const roundTrip = await openPopup(browser, stored);
  check('advanced-open-when-set', (await roundTrip.ui.advanced.getAttribute('aria-expanded')) === 'true',
    'stored advanced values open the section');
  const loaded = await readUi(roundTrip.ui);
  check('stored-values-load',
    loaded.provider === 'litterbox (temporário, até 72h)' && loaded.markdown && loaded.imgurClientId === 'abc123' && loaded.sameProviderOnly,
    JSON.stringify(loaded));
  await roundTrip.ui.imgurId.fill('  xyz  ');
  await roundTrip.ui.save.click();
  await roundTrip.ui.status.filter({ hasText: 'Salvo!' }).waitFor({ timeout: 5000 }).catch(() => {});
  const resaved = await roundTrip.page.evaluate(() => window.__pastepicSaved);
  check('round-trip-saves-trimmed',
    isDeepStrictEqual(resaved, { provider: 'litterbox', format: 'markdown', imgurClientId: 'xyz', sameProviderOnly: true }),
    JSON.stringify(resaved));

  const invalid = await openPopup(browser, { provider: 'bogus', format: 'rtf' });
  const fallback = await readUi(invalid.ui);
  check('unknown-stored-values-fall-back', fallback.provider === 'Automático (tenta vários)' && fallback.html, JSON.stringify(fallback));
} finally {
  await browser.close();
}

const result = { feature: 'provider-format-settings', runId: RUN_ID, checks, ok: checks.every((c) => c.pass) };
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(result.ok ? 'RESULT PASS' : 'RESULT FAIL');
process.exit(result.ok ? 0 : 1);
