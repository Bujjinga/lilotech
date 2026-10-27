// Lilotech test suite.
//
//   npm install && npx playwright install chromium
//   npm test
//
// 1. APA 7 formatting unit tests (plain Node).
// 2. Web page extraction on saved copies of publisher page layouts (tests/fixtures/web).
// 3. PDF reading on PDFs generated from tests/fixtures/pdf/*.html, run inside the real extension.
// 4. The popup end to end, including reading the conclusion from a page's linked PDF.
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

// ------------------------------------------------------------------ main
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lilotech-test-'));
const pdfDir = path.join(tmp, 'pdf');
const extDir = path.join(tmp, 'ext');
fs.mkdirSync(pdfDir);
fs.mkdirSync(extDir);
testCopyOfExtension(extDir);

await apaTests();
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
    await pop.close();
    await art.close();
  }
} finally {
  await ctx.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

for (const f of failures) console.log('✗ ' + f);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
