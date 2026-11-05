// Capture the raw store screenshots from the real popup and the real editor.
// Build-time only; not part of the extension.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PASTEPIC_VERIFY_PORT ?? '8931';
const OUT = process.argv[2] ?? 'store/raw';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  // 1) The real popup, at 2x for crisp text.
  const popup = await browser.newPage({ viewport: { width: 320, height: 470 }, deviceScaleFactor: 2 });
  await popup.goto(`http://127.0.0.1:${PORT}/popup-test.html`, { waitUntil: 'load' });
  await popup.screenshot({ path: path.join(OUT, 'popup.png') });

  // 2) The real CodeMirror editor showing a comment with the inserted tag.
  const editor = await browser.newPage({ viewport: { width: 800, height: 320 }, deviceScaleFactor: 2 });
  await editor.goto(`http://127.0.0.1:${PORT}/fixture-cm5.html`, { waitUntil: 'load' });
  await editor.addStyleTag({ content: '.CodeMirror { font-size: 17px; line-height: 1.6; }' });
  await editor.evaluate(() => {
    window.__cm.setValue(
      'Boa, funcionou aqui. Segue o print do erro que eu comentei:\n\n' +
        '<img src="https://litter.catbox.moe/exemplo.png">\n\n' +
        'O problema era o placeholder que ficava preso.'
    );
    // Let the editor size itself to its content so the store shot is not
    // mostly empty white space.
    const wrap = document.querySelector('.CodeMirror');
    wrap.style.height = 'auto';
    const scroll = wrap.querySelector('.CodeMirror-scroll');
    if (scroll) scroll.style.height = 'auto';
    window.__cm.refresh();
  });
  const wrap = await editor.$('.CodeMirror');
  await wrap.screenshot({ path: path.join(OUT, 'editor.png') });
} finally {
  await browser.close();
}
console.log('raw screenshots written to', OUT);
