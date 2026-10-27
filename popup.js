import { capturePdf, fetchTabPdf, readPdf } from './pdfread.js';
import { capture, getItems, findExisting, saveItem, copyRich, toast, getSettings, setSettings } from './lib.js';
import { STYLES, cite, inTextFor } from './styles.js';
import { mountLogo, replayLogo } from './logo.js';
import { mountChips } from './chips.js';
import { ALL_SITES } from './addlink.js';

const $ = (id) => document.getElementById(id);
let data = null;
let existing = null;
let settings = null;
let number = 1; // position in a numbered reference list (IEEE, Vancouver)
const picked = { sections: [], selected: [] };

mountLogo($('logo'));
mountLogo($('bigLogo'), { word: false });
replayLogo($('logo'));
replayLogo($('bigLogo'));

const openLibrary = (query = '') => chrome.tabs.create({ url: chrome.runtime.getURL('library.html') + query });
$('openLib').onclick = () => openLibrary();
const status = (html) => { $('statusText').innerHTML = html; };

// Add by link: ask to read websites while the click still counts, then let the library do the work.
$('byLink').onclick = () => { $('linkRow').hidden = !$('linkRow').hidden; $('link').focus(); };
$('linkRow').onsubmit = async (e) => {
  e.preventDefault();
  const link = $('link').value.trim();
  if (!link) return;
  await chrome.permissions.request({ origins: ALL_SITES }).catch(() => false);
  openLibrary('?add=' + encodeURIComponent(link));
  window.close();
};

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

async function init() {
  settings = await getSettings();
  $('style').innerHTML = Object.entries(STYLES).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');
  $('style').value = STYLES[settings.style] ? settings.style : 'apa';
  $('style').onchange = async () => { settings = await setSettings({ style: $('style').value }); showReference(); };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^(https?|file):/.test(tab.url || '')) {
    status('Open an article or paper in a normal web page, then click Lilotech again.<br>Or click <b>Add by link</b> to save a paper from its link, DOI or arXiv ID.');
    return;
  }
  data = await capture(tab);
  if (data.pdf) {
    data = await capturePdfTab(tab);
    if (!data) return;
  }
  const items = await getItems();
  existing = findExisting(items, data.ref);
  const byAge = [...items].sort((a, b) => (a.savedAt || '').localeCompare(b.savedAt || ''));
  number = existing ? byAge.indexOf(existing) + 1 : items.length + 1;

  const kinds = { article: 'Journal article', webpage: 'Web page', book: 'Book', chapter: 'Book chapter' };
  $('kind').textContent = (kinds[data.ref.type] || 'Source') + (data.page.isPdf ? ' · PDF' : '');
  $('title').textContent = data.ref.title;
  showReference();

  picked.sections = settings.sections;
  picked.selected = (existing && existing.sections) || [];
  mountChips($('sections'), picked, () => {});

  $('abstract').value = (existing && existing.abstract) || data.abstract;
  $('absSrc').textContent = existing && existing.abstract ? '' : data.abstractSource ? `(from ${data.abstractSource})` : '';
  $('conclusion').value = (existing && existing.conclusion) || data.conclusion;
  $('note').value = (existing && existing.note) || '';
  if (data.selection) {
    $('snipWrap').hidden = false;
    $('snippet').value = data.selection;
  }
  if (existing) {
    $('already').textContent = '· Already in your library';
    $('save').textContent = 'Update in library';
  }
  if (data.page.limited) {
    $('already').textContent = '· Chrome blocks reading this page, so only basic details were found';
  }

  $('status').hidden = true;
  $('form').hidden = false;
  $('form').classList.add('fade-in');

  // Many pages (ResearchGate, arXiv, repositories) show only the abstract. When the page links
  // to the paper's PDF, read the missing parts from there.
  const missing = !$('conclusion').value || !$('abstract').value || /not a formal/.test(data.abstractSource);
  if (data.page.pdfUrl && !data.page.isPdf && missing) fillFromLinkedPdf(tab, data.page.pdfUrl).catch((e) => console.warn('Linked PDF', e));
}

async function fillFromLinkedPdf(tab, pdfUrl) {
  const note = $('pdfNote');
  note.hidden = false;
  note.textContent = "Looking in the paper's PDF…";
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 30000));
  const pdf = await Promise.race([fetchTabPdf(tab, pdfUrl).then((b) => (b ? readPdf(b, pdfUrl) : null)), timeout]);
  const found = [];
  // Only fill boxes that are still empty, so nothing the user typed is replaced.
  if (pdf && pdf.conclusion && !$('conclusion').value.trim()) {
    $('conclusion').value = pdf.conclusion;
    data.conclusion = pdf.conclusion;
    $('conSrc').textContent = '(from the PDF)';
    found.push('conclusion');
  }
  if (pdf && pdf.abstract && (!$('abstract').value.trim() || /not a formal/.test(data.abstractSource))) {
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
      if (ok) init().catch(showError);
    };
  }
  $('goLib').onclick = () => openLibrary();
  return null;
}

$('save').onclick = async () => {
  $('save').disabled = true;
  existing = await saveItem(data.ref, {
    abstract: $('abstract').value.trim(),
    abstractSource: data.abstractSource,
    conclusion: $('conclusion').value.trim(),
    note: $('note').value.trim(),
    snippet: $('snipWrap').hidden ? '' : $('snippet').value.trim(),
    sections: picked.selected,
  });
  $('savedMsg').textContent = '✓ Saved';
  $('save').textContent = 'Update in library';
  $('already').textContent = '· In your library';
  $('save').disabled = false;
  replayLogo($('logo'));
};

function showError(e) {
  console.error(e);
  status('Sorry, something went wrong reading this page. Try reloading it.');
}

init().catch(showError);
