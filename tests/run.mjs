// Lilotech test suite.
//
//   npm install && npx playwright install chromium
//   npm test
//
// 1. Citation style and link parsing unit tests (plain Node).
// 2. Web page extraction on saved copies of publisher page layouts (tests/fixtures/web).
// 3. PDF reading on PDFs generated from tests/fixtures/pdf/*.html, run inside the real extension.
// 4. The popup end to end, including reading the conclusion from a page's linked PDF,
//    choosing a citation style and putting the paper in a section.
// 5. The library: sections, citation styles, exports and adding papers by link.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests', 'fixtures');
const only = process.argv[2] || ''; // optional filter, e.g. "npm test -- wiley"

let passed = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) passed++;
  else failures.push(`${name}: ${detail}`);
}
const show = (s) => JSON.stringify((s || '').slice(0, 160));

// Compare one extracted field with its expectation: { starts, includes[], excludes[], empty }.
function checkText(name, actual, exp) {
  if (!exp) return;
  actual = actual || '';
  if (exp.empty) return ok(name, !actual, `expected nothing, got ${show(actual)}`);
  ok(name, actual.length > 0, 'expected text, got nothing');
  if (exp.starts) ok(`${name} starts`, actual.startsWith(exp.starts), `expected to start with ${show(exp.starts)}, got ${show(actual)}`);
  for (const s of exp.includes || []) ok(`${name} includes`, actual.includes(s), `missing ${show(s)} in ${show(actual)}`);
  for (const s of exp.excludes || []) ok(`${name} excludes`, !actual.includes(s), `should not contain ${show(s)}: ${show(actual)}`);
}
function checkPage(file, got, exp) {
  if (exp.doi) ok(`${file} doi`, got.doi === exp.doi, `expected ${exp.doi}, got ${got.doi}`);
  if (exp.title) ok(`${file} title`, got.title === exp.title, `expected ${show(exp.title)}, got ${show(got.title)}`);
  if (exp.year) ok(`${file} year`, (got.date || '').startsWith(exp.year), `expected ${exp.year}, got ${got.date}`);
  checkText(`${file} abstract`, got.abstract, exp.abstract);
  checkText(`${file} conclusion`, got.conclusion, exp.conclusion);
}

// ------------------------------------------------------------------ 1. APA unit tests
async function apaTests() {
  const lib = await import(path.join(ROOT, 'lib.js'));
  const eq = (name, a, b) => ok(`apa ${name}`, a === b, `\n    expected ${b}\n    got      ${a}`);
  const many = Array.from({ length: 25 }, (_, i) => ({ family: `A${i}`, given: 'Zed' }));
  eq('21+ authors', lib.formatAuthors(many), `${many.slice(0, 19).map((a) => `${a.family}, Z.`).join(', ')}, . . . A24, Z.`);
  eq('two authors', lib.formatAuthors([lib.parseName('Smith, John A.'), lib.parseName('Kim Lee')]), 'Smith, J. A., & Lee, K.');
  eq('particles and hyphens', lib.formatAuthors([lib.parseName('Marie-Claire de la Cruz')]), 'de la Cruz, M.-C.');
  eq('group author', lib.formatAuthors([lib.parseName('World Health Organization')]), 'World Health Organization');
  eq('journal article', lib.formatAPA({ type: 'article', authors: [{ family: 'Smith', given: 'John' }], year: '2021', title: 'A title', journal: 'Journal', volume: '12', issue: '3', pages: '45–67', doi: '10.1/x' }).text,
    'Smith, J. (2021). A title. Journal, 12(3), 45–67. https://doi.org/10.1/x');
  eq('article italics', lib.formatAPA({ type: 'article', authors: [{ family: 'Smith', given: 'John' }], year: '2021', title: 'T', journal: 'J', volume: '1', doi: '10.1/x' }).html,
    'Smith, J. (2021). T. <i>J</i>, <i>1</i>. https://doi.org/10.1/x');
  eq('article number', lib.formatAPA({ type: 'article', authors: [{ family: 'Lee', given: 'K' }], year: '2019', title: 'Sound', journal: 'J Music', volume: '4', articleNumber: 'e12' }).text,
    'Lee, K. (2019). Sound. J Music, 4, Article e12.');
  eq('web page, no author', lib.formatAPA({ type: 'webpage', authors: [], year: '2022', month: 3, day: 4, title: 'Climate facts?', siteName: 'NASA', url: 'https://nasa.gov/x' }).text,
    'Climate facts? (2022, March 4). NASA. https://nasa.gov/x');
  eq('no date', lib.formatAPA({ type: 'webpage', authors: [{ literal: 'WHO' }], title: 'Malaria', url: 'https://who.int/m' }).text, 'WHO. (n.d.). Malaria. https://who.int/m');
  eq('in-text 3+', lib.formatInText({ authors: [{ family: 'A' }, { family: 'B' }, { family: 'C' }], year: '2020' }), '(A et al., 2020)');
  eq('in-text 2', lib.formatInText({ authors: [{ family: 'A' }, { family: 'B' }], year: '2020' }), '(A & B, 2020)');
}

// ------------------------------------------------------------------ 1b. other styles and links
async function styleTests() {
  const { cite, STYLES, bibKey } = await import(path.join(ROOT, 'styles.js'));
  const { parseLink } = await import(path.join(ROOT, 'lib.js'));
  const eq = (name, a, b) => ok(name, a === b, `\n    expected ${b}\n    got      ${a}`);
  const ref = { type: 'article', authors: [{ family: 'Smith', given: 'John Andrew' }, { family: 'Lee', given: 'Kim' }, { family: 'García', given: 'María' }], year: '2021', month: 3, title: 'Climate change and rice yields', journal: 'Nature Food', volume: '2', issue: '3', pages: '45–67', doi: '10.1038/s43016-021-00001-x' };
  const c = (style, r = ref, n = 1) => cite({ ref: r }, style, n).text;
  eq('mla article', c('mla'), 'Smith, John Andrew, et al. “Climate change and rice yields.” Nature Food, vol. 2, no. 3, 2021, pp. 45–67, https://doi.org/10.1038/s43016-021-00001-x.');
  eq('chicago article', c('chicago'), 'Smith, John Andrew, Kim Lee, and María García. 2021. “Climate change and rice yields.” Nature Food 2 (3): 45–67. https://doi.org/10.1038/s43016-021-00001-x.');
  eq('harvard article', c('harvard'), 'Smith, J.A., Lee, K. and García, M. (2021) ‘Climate change and rice yields’, Nature Food, 2(3), pp. 45–67. Available at: https://doi.org/10.1038/s43016-021-00001-x.');
  eq('ieee article', c('ieee', ref, 3), '[3] J. A. Smith, K. Lee, and M. García, “Climate change and rice yields,” Nature Food, vol. 2, no. 3, pp. 45–67, Mar. 2021, doi: 10.1038/s43016-021-00001-x.');
  eq('vancouver article', c('vancouver', ref, 2), '2. Smith JA, Lee K, García M. Climate change and rice yields. Nature Food. 2021 Mar;2(3):45-67. doi:10.1038/s43016-021-00001-x');
  eq('ieee italics', cite({ ref }, 'ieee').html.includes('<i>Nature Food</i>'), true);
  eq('in-text mla', STYLES.mla.inText(ref), '(Smith et al.)');
  eq('in-text chicago', STYLES.chicago.inText(ref), '(Smith, Lee, and García 2021)');
  eq('in-text ieee', STYLES.ieee.inText(ref, 4), '[4]');
  eq('bibtex key', bibKey(ref), 'smith2021climate');
  const bib = c('bibtex', { ...ref, title: 'Profit & loss in R_D: 50% off' });
  ok('bibtex entry', bib.startsWith('@article{smith2021profit,') && bib.includes('pages     = {45--67}') && bib.includes('author    = {Smith, John Andrew and Lee, Kim and García, María}'), bib);
  ok('bibtex escapes', bib.includes('{{Profit \\& loss in R\\_D: 50\\% off}}'), bib);
  const ris = cite({ ref, abstract: 'An abstract.', sectionNames: ['Related work'] }, 'ris').text.split('\n');
  for (const line of ['TY  - JOUR', 'AU  - Smith, John Andrew', 'JO  - Nature Food', 'SP  - 45', 'EP  - 67', 'AB  - An abstract.', 'KW  - Related work', 'ER  - ']) ok(`ris ${line}`, ris.includes(line), ris.join(' | '));
  const web = { type: 'webpage', authors: [], year: '2022', month: 3, day: 4, title: 'Climate facts?', siteName: 'NASA', url: 'https://nasa.gov/x' };
  eq('mla web, no author', c('mla', web), '“Climate facts?” NASA, 4 Mar. 2022, https://nasa.gov/x.');
  eq('chicago web, no author', c('chicago', web), '“Climate facts?” 2022. NASA. March 4, 2022. https://nasa.gov/x.');
  eq('kept hand-edited APA', cite({ ref, apa: 'My own reference.', apaEdited: true }, 'apa').text, 'My own reference.');

  const link = (s) => JSON.stringify(parseLink(s));
  eq('link doi', link('10.1029/2022WR033456'), JSON.stringify({ kind: 'doi', doi: '10.1029/2022WR033456', url: 'https://doi.org/10.1029/2022WR033456' }));
  eq('link doi.org encoded', parseLink('https://doi.org/10.1007%2Fs10533-022-00956-2').doi, '10.1007/s10533-022-00956-2');
  eq('link doi: prefix, trailing dot', parseLink('doi: 10.1234/abc.').doi, '10.1234/abc');
  eq('link arxiv id', parseLink('arXiv:2401.01234v2').doi, '10.48550/arXiv.2401.01234');
  eq('link arxiv pdf', parseLink('https://arxiv.org/pdf/2401.01234').url, 'https://arxiv.org/abs/2401.01234');
  eq('link old arxiv', parseLink('hep-th/9901001').kind, 'arxiv');
  eq('link publisher doi', parseLink('https://onlinelibrary.wiley.com/doi/full/10.1029/2022WR033456').doi, '10.1029/2022WR033456');
  eq('link pdf', parseLink('https://x.org/a/b.pdf?dl=1').kind, 'pdf');
  eq('link bare domain', parseLink('www.example.com/paper').url, 'https://www.example.com/paper');
  eq('link nonsense', parseLink('hello world'), null);
}

// ------------------------------------------------------------------ helpers
function serve(pdfDir) {
  const types = { '.html': 'text/html; charset=utf-8', '.pdf': 'application/pdf', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = url.startsWith('/pdf/') ? path.join(pdfDir, path.basename(url)) : path.join(FIX, url);
    if (!file.startsWith(FIX) && !file.startsWith(pdfDir)) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end('not found');
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function makePdfs(browser, outDir) {
  const page = await browser.newPage();
  for (const f of fs.readdirSync(path.join(FIX, 'pdf')).filter((f) => f.endsWith('.html'))) {
    await page.goto('file://' + path.join(FIX, 'pdf', f));
    await page.pdf({ path: path.join(outDir, f.replace(/\.html$/, '.pdf')), format: 'A4', margin: { top: '18mm', bottom: '18mm', left: '15mm', right: '15mm' } });
  }
  await page.close();
}

// A copy of the extension that may read any site, since tests can't click the toolbar icon to grant activeTab.
function testCopyOfExtension(dir) {
  for (const f of fs.readdirSync(ROOT)) {
    if (['tests', 'node_modules', '.git', 'docs'].includes(f)) continue;
    fs.cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
  }
  const mf = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  mf.host_permissions.push('<all_urls>');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(mf));
}

async function libraryTests(ctx, extId) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`library page error: ${e.message}`));
  await page.goto(`chrome-extension://${extId}/library.html`);
  const mk = (id, title, family, year, savedAt, sections) => ({
    id, savedAt, title, sections, snippets: [], note: '', abstract: `Abstract of ${title}.`, conclusion: '',
    apa: `${family}, A. (${year}). ${title}.`, apaHtml: `${family}, A. (${year}). ${title}.`, inText: `(${family}, ${year})`,
    ref: { type: 'article', authors: [{ family, given: 'Ann' }], year, title, journal: 'Journal', volume: '1', doi: `10.1234/${id}` },
  });
  await page.evaluate((items) => chrome.storage.local.set({ items, settings: { style: 'apa' } }), [
    mk('a', 'Zebra crossings save lives', 'Young', '2020', '2026-01-01T00:00:00Z', ['related']),
    mk('b', 'Apples and oranges', 'Adams', '2019', '2026-02-01T00:00:00Z', ['related', 'introduction']),
    mk('c', 'Middle of the road', 'Moore', '2018', '2026-03-01T00:00:00Z', []),
  ]);
  await page.reload();
  await page.waitForSelector('.card');
  const nav = async () => Object.fromEntries((await page.$$eval('#nav button', (bs) => bs.map((b) => [b.dataset.f, b.querySelector('.n').textContent]))));
  let counts = await nav();
  ok('library section counts', counts.all === '3' && counts.related === '2' && counts.introduction === '1' && counts.unsorted === '1' && counts.methods === '0', JSON.stringify(counts));
  ok('library logo', await page.locator('#logo svg.logo-mark').count() === 1, 'no logo');
  ok('library cat', await page.locator('#cat svg').count() === 1, 'no cat');

  await page.click('#nav button[data-f="related"]');
  ok('library filter', (await page.$$('.card')).length === 2, `${(await page.$$('.card')).length} cards`);

  // Numbered styles count the papers in the section, oldest first.
  await page.selectOption('#style', 'ieee');
  await page.selectOption('#sort', 'az');
  await page.waitForFunction(() => /^\[/.test(document.querySelector('.card .apa').textContent));
  const refs = await page.$$eval('.card .apa', (els) => els.map((e) => e.textContent));
  ok('library ieee order', refs.length === 2 && refs[0].startsWith('[1] A. Young') && refs[1].startsWith('[2] A. Adams'), JSON.stringify(refs));
  await page.selectOption('#style', 'bibtex');
  await page.waitForSelector('.card pre.code');
  const bib = await page.textContent('.card pre.code');
  ok('library bibtex card', bib.startsWith('@article{'), show(bib));
  await page.selectOption('#style', 'mla');
  await page.waitForSelector('.card .apa');
  const mla = await page.$$eval('.card .apa', (els) => els.map((e) => e.textContent));
  ok('library mla a-z', mla[0].startsWith('Adams, Ann.') && mla[1].startsWith('Young, Ann.'), JSON.stringify(mla));

  // Exports: BibTeX for the section, grouped Markdown notes for the whole library.
  const grab = async (id) => {
    await page.click('#exportMenu summary');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(id)]);
    return fs.readFileSync(await dl.path(), 'utf8');
  };
  const bibFile = await grab('#exBib');
  ok('export bib', (bibFile.match(/@article\{/g) || []).length === 2 && bibFile.includes('young2020zebra'), show(bibFile));
  const risFile = await grab('#exRis');
  ok('export ris', (risFile.match(/^TY {2}- JOUR$/gm) || []).length === 2 && risFile.includes('KW  - Related work'), show(risFile));
  await page.click('#nav button[data-f="all"]');
  const md = await grab('#exMd');
  ok('export md grouped', md.includes('## Introduction') && md.includes('## Related work') && md.includes('## Unsorted') && md.indexOf('## Introduction') < md.indexOf('## Related work'), show(md.slice(md.indexOf('# Reading notes'))));

  // Sections: toggle a chip on a card, and make a new section.
  await page.click('.card[data-id="c"] .chip[data-sec="methods"]');
  await page.waitForFunction(() => document.querySelector('#nav button[data-f="methods"] .n').textContent === '1');
  await page.fill('#newSec', 'Background reading');
  await page.press('#newSec', 'Enter');
  await page.waitForSelector('#nav button[data-f="background-reading"].on');
  counts = await nav();
  ok('library new section', counts['background-reading'] === '0' && counts.unsorted === '0', JSON.stringify(counts));

  // Add by link while looking at the new section: a web page, then a PDF link.
  for (const [url, title] of [[`${base}/web/springer.html`, 'Soil carbon'], [`${base}/pdf/elsevier.pdf`, '']]) {
    await page.fill('#link', url);
    await page.click('#addLink');
    await page.waitForFunction(() => /^Saved|Couldn|needs|look/.test(document.querySelector('#addStatus').textContent), null, { timeout: 60000 }).catch(() => {});
    const msg = await page.textContent('#addStatus');
    ok(`add by link ${path.basename(url)}`, msg.startsWith('Saved') && msg.includes(title), msg);
  }
  const all = await page.evaluate(async () => (await chrome.storage.local.get('items')).items);
  const added = all.filter((it) => (it.sections || []).includes('background-reading'));
  ok('add by link into section', added.length === 2, JSON.stringify(added.map((x) => x.ref.title)));
  const spr = all.find((it) => it.ref.doi === '10.1007/s10533-022-00956-2');
  ok('add by link reads the page', spr && spr.abstract.startsWith('Afforestation is promoted') && spr.conclusion.startsWith('Afforestation of croplands'), show(spr && spr.conclusion));
  await page.fill('#link', 'not a link at all');
  await page.click('#addLink');
  await page.waitForFunction(() => document.querySelector('#addStatus').classList.contains('err'));
  await page.close();
}

// ------------------------------------------------------------------ main
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lilotech-test-'));
const pdfDir = path.join(tmp, 'pdf');
const extDir = path.join(tmp, 'ext');
fs.mkdirSync(pdfDir);
fs.mkdirSync(extDir);
testCopyOfExtension(extDir);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
ok('opens in the side panel', manifest.side_panel && manifest.side_panel.default_path === 'popup.html' && !manifest.action.default_popup && manifest.permissions.includes('sidePanel'), JSON.stringify(manifest.action));
await apaTests();
await styleTests();
const server = await serve(pdfDir);
const base = `http://127.0.0.1:${server.address().port}`;

const ctx = await chromium.launchPersistentContext(path.join(tmp, 'profile'), {
  headless: true,
  channel: 'chromium',
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});
try {
  const browser = ctx; // persistent context can open pages and print PDFs too
  await makePdfs(browser, pdfDir);

  // ---- 2. web pages
  const { extractPage } = await import(path.join(ROOT, 'lib.js'));
  const webExp = JSON.parse(fs.readFileSync(path.join(FIX, 'web', 'expected.json'), 'utf8'));
  const page = await ctx.newPage();
  for (const [file, exp] of Object.entries(webExp)) {
    if (only && !file.includes(only)) continue;
    await page.goto(`${base}/web/${file}`);
    const got = await page.evaluate(`(${extractPage.toString()})()`);
    checkPage(file, got, exp);
  }

  // ---- 3. PDFs, read inside the extension
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const behavior = await sw.evaluate(() => chrome.sidePanel.getPanelBehavior());
  ok('icon opens the side panel', behavior.openPanelOnActionClick === true, JSON.stringify(behavior));
  const lib = await ctx.newPage();
  lib.on('pageerror', (e) => failures.push(`library page error: ${e.message}`));
  await lib.goto(`chrome-extension://${extId}/library.html`);
  const pdfExp = JSON.parse(fs.readFileSync(path.join(FIX, 'pdf', 'expected.json'), 'utf8'));
  for (const [file, exp] of Object.entries(pdfExp)) {
    if (only && !file.includes(only)) continue;
    const got = await lib.evaluate(async (url) => {
      const { readPdf } = await import('./pdfread.js');
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      return readPdf(bytes, '');
    }, `${base}/pdf/${file}`);
    checkPage(file, got, exp);
  }

  // ---- 4. popup end to end: abstract from the page, conclusion from the linked PDF
  for (const [file, exp] of Object.entries({
    'researchgate.html': { abstract: 'Neonatal intensive care units generate', conclusion: 'Label-free clustering found clinically meaningful' },
    'springer.html': { abstract: 'Afforestation is promoted', conclusion: 'Afforestation of croplands increases topsoil carbon' },
  })) {
    if (only && !file.includes(only)) continue;
    const art = await ctx.newPage();
    await art.goto(`${base}/web/${file}`);
    const pop = await ctx.newPage();
    pop.on('pageerror', (e) => failures.push(`popup error on ${file}: ${e.message}`));
    // The popup asks for the active tab; point it at the article instead.
    await pop.addInitScript((u) => {
      const q = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = () => q({ url: u });
    }, `${base}/web/${file}`);
    await pop.goto(`chrome-extension://${extId}/popup.html`);
    await pop.waitForSelector('#form:not([hidden])', { timeout: 30000 });
    await pop.waitForFunction(() => !document.querySelector('#pdfNote') || !/Looking/.test(document.querySelector('#pdfNote').textContent), null, { timeout: 30000 }).catch(() => {});
    const abstract = await pop.inputValue('#abstract');
    const conclusion = await pop.inputValue('#conclusion');
    ok(`popup ${file} abstract`, abstract.startsWith(exp.abstract), `got ${show(abstract)}`);
    ok(`popup ${file} conclusion`, conclusion.startsWith(exp.conclusion), `got ${show(conclusion)}`);
    if (file === 'springer.html') {
      ok('popup logo', await pop.locator('#logo svg.logo-mark').count() === 1, 'no logo');
      ok('popup has no note box', await pop.locator('#note').count() === 0, 'My note is still there');
      await pop.click('#cat');
      ok('popup cat plays when clicked', await pop.locator('#cat.playing').count() === 1, 'cat is not playing');
      await pop.waitForSelector('#cat:not(.playing)', { timeout: 6000 }).catch(() => failures.push('popup cat never stops playing'));
      await pop.selectOption('#style', 'ieee');
      await pop.waitForFunction(() => /^\[1\]/.test(document.querySelector('#apa').textContent), null, { timeout: 5000 }).catch(() => {});
      const ieee = await pop.textContent('#apa');
      ok('popup ieee', /^\[1\] /.test(ieee) && ieee.includes('vol.'), `got ${show(ieee)}`);
      await pop.click('#sections .chip[data-sec="related"]');
      await pop.click('#save');
      await pop.waitForSelector('#savedMsg:has-text("Saved")');
      const saved = await pop.evaluate(async () => (await chrome.storage.local.get(['items', 'settings'])));
      const it = saved.items.find((x) => x.ref.doi === '10.1007/s10533-022-00956-2');
      ok('popup saves sections', it && JSON.stringify(it.sections) === '["related"]', JSON.stringify(it && it.sections));
      ok('popup remembers style', saved.settings.style === 'ieee', saved.settings.style);
      await pop.evaluate(() => chrome.storage.local.clear());
    }
    await pop.close();
    await art.close();
  }

  // ---- 4b. the side panel follows your tabs
  if (!only || 'panel'.includes(only)) {
    const a = await ctx.newPage();
    await a.goto(`${base}/web/springer.html`);
    const b = await ctx.newPage();
    await b.goto(`${base}/web/wiley.html`);
    const pop = await ctx.newPage();
    pop.on('pageerror', (e) => failures.push(`panel error: ${e.message}`));
    // Pretend to be the side panel: not a tab, reading whichever page the test points at.
    await pop.addInitScript((u) => {
      window.__target = u;
      const q = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = () => q({ url: window.__target });
      chrome.tabs.getCurrent = () => Promise.resolve(undefined);
    }, `${base}/web/springer.html`);
    await pop.goto(`chrome-extension://${extId}/popup.html`);
    await pop.waitForSelector('#form:not([hidden])', { timeout: 30000 });
    ok('panel reads first page', (await pop.textContent('#title')).startsWith('Soil carbon'), await pop.textContent('#title'));
    await pop.evaluate((u) => { window.__target = u; }, `${base}/web/wiley.html`);
    await b.bringToFront();
    const moved = await pop.waitForFunction(() => !/^Soil carbon/.test(document.querySelector('#title').textContent) && !document.querySelector('#form').hidden, null, { timeout: 30000 }).then(() => true, () => false);
    ok('panel follows the new tab', moved, await pop.textContent('#title'));
    await pop.fill('#abstract', 'My own edit');
    await pop.evaluate((u) => { window.__target = u; }, `${base}/web/springer.html`);
    await a.bringToFront();
    const asked = await pop.waitForSelector('#changed:not([hidden])', { timeout: 10000 }).then(() => true, () => false);
    ok('panel keeps unsaved edits when the tab changes', asked && (await pop.inputValue('#abstract')) === 'My own edit', 'edit was replaced');
    await pop.click('#readNew');
    await pop.waitForFunction(() => /^Soil carbon/.test(document.querySelector('#title').textContent) && !document.querySelector('#form').hidden, null, { timeout: 30000 }).catch(() => failures.push('panel: Read this page did not read the page'));
    await pop.close();
    await a.close();
    await b.close();
  }

  // ---- 5. the library
  if (!only || 'library'.includes(only)) await libraryTests(ctx, extId);
} finally {
  await ctx.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

for (const f of failures) console.log('✗ ' + f);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
