// Lilotech's side panel. It stays open beside your pages until you close it, and reads each
// page you switch to.
import { capturePdf, fetchTabPdf, readPdf } from './pdfread.js';
import { capture, getItems, findExisting, saveItem, copyRich, toast, getSettings, setSettings } from './lib.js';
import { STYLES, cite, inTextFor } from './styles.js';
import { mountLogo, replayLogo } from './logo.js';
import { mountChips } from './chips.js';
import { mountCat } from './cat.js';
import { ALL_SITES, readLink } from './addlink.js';

const $ = (id) => document.getElementById(id);
let data = null;
let existing = null;
let settings = null;
let number = 1; // position in a numbered reference list (IEEE, Vancouver)
let run = 0; // each read gets a number, so a slow read of an old tab can't replace a newer one
let dirty = false; // the user changed something that isn't saved yet
const picked = { sections: [], selected: [] };

mountLogo($('logo'));
mountLogo($('bigLogo'), { word: false });
replayLogo($('logo'));
replayLogo($('bigLogo'));
const cat = mountCat($('cat'));

const openLibrary = () => chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
$('openLib').onclick = () => openLibrary();
const status = (html) => {
  $('statusText').innerHTML = html;
  $('status').hidden = false;
  $('form').hidden = true;
};

// ---------------------------------------------------------------- reading the current tab
async function refresh() {
  const me = ++run;
  dirty = false;
  $('changed').hidden = true;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^(https?|file):/.test(tab.url || '')) {
    status('Open an article or paper, and Lilotech reads it here.<br>Or click <b>Add by link</b> to save a paper from its link, DOI or arXiv ID.');
    return;
  }
  status('Reading this page…');
  replayLogo($('bigLogo'));
  cat.busy(true);
  try {
    let got = await capture(tab);
    if (me !== run) return;
    if (got.page && got.page.limited && /^https?:/.test(tab.url) && !got.pdf && !(await canRead(tab.url))) {
      askToReadPages();
      return;
    }
    if (got.pdf) {
      got = await capturePdfTab(tab);
      if (!got || me !== run) return;
    }
    await show(got, tab, me);
  } finally {
    if (me === run) cat.busy(false);
  }
}

const canRead = (url) => chrome.permissions.contains({ origins: [new URL(url).origin + '/*'] }).catch(() => false);

// Chrome lets Lilotech read the tab you clicked the icon on. To keep reading as you move between
// tabs, it needs your OK once.
function askToReadPages() {
  status(`<p><b>Let Lilotech read the pages you open?</b></p>
    <p class="small">Then it can show the reference and abstract for each paper as you switch tabs. It only reads a page while this panel is open, and nothing is uploaded.</p>
    <p><button id="allowAll" class="primary">Allow</button></p>`);
  $('allowAll').onclick = async () => {
    if (await chrome.permissions.request({ origins: ALL_SITES }).catch(() => false)) refresh();
  };
}

async function show(got, tab, me = run) {
  data = got;
  const items = await getItems();
  if (me !== run) return;
  existing = findExisting(items, data.ref);
  const byAge = [...items].sort((a, b) => (a.savedAt || '').localeCompare(b.savedAt || ''));
  number = existing ? byAge.indexOf(existing) + 1 : items.length + 1;

  const kinds = { article: 'Journal article', webpage: 'Web page', book: 'Book', chapter: 'Book chapter' };
  $('kind').textContent = (kinds[data.ref.type] || 'Source') + (data.page && data.page.isPdf ? ' · PDF' : '');
  $('title').textContent = data.ref.title;
  showReference();

  picked.sections = settings.sections;
  picked.selected = (existing && existing.sections) || [];
  mountChips($('sections'), picked, () => { dirty = true; });

  $('abstract').value = (existing && existing.abstract) || data.abstract;
  $('absSrc').textContent = existing && existing.abstract ? '' : data.abstractSource ? `(from ${data.abstractSource})` : '';
  $('conclusion').value = (existing && existing.conclusion) || data.conclusion;
  $('conSrc').textContent = '';
  $('pdfNote').hidden = true;
  $('snipWrap').hidden = !data.selection;
  $('snippet').value = data.selection || '';
  $('already').textContent = existing ? '· Already in your library' : '';
  $('save').textContent = existing ? 'Update in library' : 'Save to library';
  $('savedMsg').textContent = '';
  if (data.page && data.page.limited) $('already').textContent = '· Chrome blocks reading this page, so only basic details were found';

  $('status').hidden = true;
  $('form').hidden = false;
  $('form').classList.remove('fade-in');
  void $('form').offsetWidth;
  $('form').classList.add('fade-in');

  // Many pages (ResearchGate, arXiv, repositories) show only the abstract. When the page links
  // to the paper's PDF, read the missing parts from there.
  const missing = !$('conclusion').value || !$('abstract').value || /not a formal/.test(data.abstractSource || '');
  if (tab && data.page.pdfUrl && !data.page.isPdf && missing) fillFromLinkedPdf(tab, data.page.pdfUrl, me).catch((e) => console.warn('Linked PDF', e));
}

function showReference() {
  const style = settings.style;
  const item = existing && existing.ref ? { ...existing, ref: data.ref } : { ref: data.ref };
  const out = cite(item, style, number);
  const code = STYLES[style] && STYLES[style].code;
  $('apa').className = code ? 'code' : 'apa';
  $('apa').innerHTML = code ? `<pre class="code">${out.html.replace(/^<pre>|<\/pre>$/g, '')}</pre>` : out.html;
  const it = inTextFor(item, style, number);
  $('inText').textContent = it ? 'In-text: ' + it : '';
  $('copyApa').onclick = async () => { await copyRich(out.text, code ? undefined : out.html); toast('Reference copied'); };
}

async function fillFromLinkedPdf(tab, pdfUrl, me) {
  const note = $('pdfNote');
  note.hidden = false;
  note.textContent = "Looking in the paper's PDF…";
  cat.busy(true);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 30000));
  const pdf = await Promise.race([fetchTabPdf(tab, pdfUrl).then((b) => (b ? readPdf(b, pdfUrl) : null)), timeout]);
  if (me !== run) return;
  cat.busy(false);
  const found = [];
  // Only fill boxes that are still empty, so nothing the user typed is replaced.
  if (pdf && pdf.conclusion && !$('conclusion').value.trim()) {
    $('conclusion').value = pdf.conclusion;
    data.conclusion = pdf.conclusion;
    $('conSrc').textContent = '(from the PDF)';
    found.push('conclusion');
  }
  if (pdf && pdf.abstract && (!$('abstract').value.trim() || /not a formal/.test(data.abstractSource || ''))) {
    $('abstract').value = pdf.abstract;
    data.abstract = pdf.abstract;
    data.abstractSource = 'PDF text';
    $('absSrc').textContent = '(from the PDF)';
    found.push('abstract');
  }
  if (found.length) note.textContent = `Found the ${found.join(' and ')} in the paper's PDF.`;
  else note.textContent = pdf ? "The paper's PDF didn't have a clear conclusion section." : "Couldn't open the paper's PDF from here.";
}

// PDFs: download the file and read it with pdf.js.
async function capturePdfTab(tab) {
  status('Reading this PDF…');
  const bytes = await fetchTabPdf(tab);
  if (bytes) return capturePdf(bytes, tab.url.startsWith('file:') ? '' : tab.url);

  const libLink = '<button id="goLib">Open my library</button>';
  if (tab.url.startsWith('file:')) {
    status(`<p><b>This PDF is on your computer.</b></p>
      <p>Open your library and click <b>Add a PDF</b> to choose it.</p><p>${libLink}</p>`);
  } else {
    // Ask for permission to read files from this one website, then try again.
    const origin = new URL(tab.url).origin;
    status(`<p><b>Lilotech needs your OK to read PDFs from ${new URL(tab.url).hostname}.</b></p>
      <p><button id="allow" class="primary">Allow</button></p>
      <p class="small">Or download the PDF, then open your library and click <b>Add a PDF</b>.</p><p>${libLink}</p>`);
    $('allow').onclick = async () => {
      const ok = await chrome.permissions.request({ origins: [origin + '/*'] });
      if (ok) refresh().catch(showError);
    };
  }
  $('goLib').onclick = () => openLibrary();
  return null;
}

// ---------------------------------------------------------------- add by link
$('byLink').onclick = () => { $('linkRow').hidden = !$('linkRow').hidden; $('link').focus(); };
$('linkRow').onsubmit = async (e) => {
  e.preventDefault();
  const link = $('link').value.trim();
  if (!link) return;
  // Ask to read websites while the click still counts as the user's.
  await chrome.permissions.request({ origins: ALL_SITES }).catch(() => false);
  const me = ++run;
  status('Working…');
  cat.busy(true);
  try {
    const got = await readLink(link, (msg) => { if (me === run) status(msg); });
    if (me !== run) return;
    $('link').value = '';
    $('linkRow').hidden = true;
    await show(got, null, me);
    dirty = true; // keep it on screen when tabs change, until it's saved
  } catch (err) {
    if (me === run) status(err.message || 'Something went wrong. Try again.');
  } finally {
    if (me === run) cat.busy(false);
  }
};

// ---------------------------------------------------------------- saving
$('form').addEventListener('input', () => { dirty = true; });
$('save').onclick = async () => {
  $('save').disabled = true;
  existing = await saveItem(data.ref, {
    abstract: $('abstract').value.trim(),
    abstractSource: data.abstractSource,
    conclusion: $('conclusion').value.trim(),
    snippet: $('snipWrap').hidden ? '' : $('snippet').value.trim(),
    sections: picked.selected,
  });
  dirty = false;
  $('savedMsg').textContent = '✓ Saved';
  $('save').textContent = 'Update in library';
  $('already').textContent = '· In your library';
  $('save').disabled = false;
  replayLogo($('logo'));
  cat.play(2000);
};

// ---------------------------------------------------------------- following your tabs
// Read the new page when you switch tabs or a page finishes loading. If you have unsaved
// changes, ask first instead of replacing them.
function tabChanged() {
  if (dirty) $('changed').hidden = false;
  else refresh().catch(showError);
}
function followTabs() {
  chrome.tabs.onActivated.addListener(tabChanged);
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status !== 'complete' || !tab.active) return;
    chrome.windows.getCurrent().then((w) => { if (tab.windowId === w.id) tabChanged(); }).catch(() => {});
  });
}
// Opened as a normal tab (for example while testing), there are no other tabs to follow.
chrome.tabs.getCurrent().then((me) => { if (!me) followTabs(); });
$('readNew').onclick = () => refresh().catch(showError);

function showError(e) {
  console.error(e);
  cat.busy(false);
  status('Sorry, something went wrong reading this page. Try reloading it.');
}

async function init() {
  settings = await getSettings();
  $('style').innerHTML = Object.entries(STYLES).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');
  $('style').value = STYLES[settings.style] ? settings.style : 'apa';
  $('style').onchange = async () => { settings = await setSettings({ style: $('style').value }); if (data) showReference(); };
  await refresh();
}

init().catch(showError);
