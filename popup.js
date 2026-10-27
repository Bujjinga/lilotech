import { capturePdf, fetchTabPdf, readPdf } from './pdfread.js';
import { capture, getItems, findExisting, saveItem, formatAPA, formatInText, copyRich, toast } from './lib.js';

const $ = (id) => document.getElementById(id);
let data = null;

$('openLib').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^(https?|file):/.test(tab.url || '')) {
    $('status').textContent = 'Open an article or paper in a normal web page, then click Lilotech again.';
    return;
  }
  data = await capture(tab);
  if (data.pdf) {
    data = await capturePdfTab(tab);
    if (!data) return;
  }
  const existing = findExisting(await getItems(), data.ref);
  const apa = existing && existing.apaEdited ? { text: existing.apa, html: existing.apaHtml } : formatAPA(data.ref);

  const kinds = { article: 'Journal article', webpage: 'Web page', book: 'Book', chapter: 'Book chapter' };
  $('kind').textContent = (kinds[data.ref.type] || 'Source') + (data.page.isPdf ? ' · PDF' : '');
  $('title').textContent = data.ref.title;
  $('apa').innerHTML = apa.html;
  $('inText').textContent = 'In-text: ' + formatInText(data.ref);
  $('copyApa').onclick = async () => { await copyRich(apa.text, apa.html); toast('Reference copied'); };

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
  $('status').textContent = 'Reading this PDF…';
  const bytes = await fetchTabPdf(tab);
  if (bytes) return capturePdf(bytes, tab.url.startsWith('file:') ? '' : tab.url);

  const libLink = '<button id="goLib">Open my library</button>';
  if (tab.url.startsWith('file:')) {
    $('status').innerHTML = `<p><b>This PDF is on your computer.</b></p>
      <p>Open your library and click <b>Add a PDF</b> to choose it.</p><p>${libLink}</p>`;
  } else {
    // Ask for permission to read files from this one website, then try again.
    const origin = new URL(tab.url).origin;
    $('status').innerHTML = `<p><b>Lilotech needs your OK to read PDFs from ${new URL(tab.url).hostname}.</b></p>
      <p><button id="allow" class="primary">Allow</button></p>
      <p class="small">Or download the PDF, then open your library and click <b>Add a PDF</b>.</p><p>${libLink}</p>`;
    $('allow').onclick = async () => {
      const ok = await chrome.permissions.request({ origins: [origin + '/*'] });
      if (ok) init().catch(showError);
    };
  }
  $('goLib').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
  return null;
}

$('save').onclick = async () => {
  $('save').disabled = true;
  await saveItem(data.ref, {
    abstract: $('abstract').value.trim(),
    abstractSource: data.abstractSource,
    conclusion: $('conclusion').value.trim(),
    note: $('note').value.trim(),
    snippet: $('snipWrap').hidden ? '' : $('snippet').value.trim(),
  });
  $('savedMsg').textContent = '✓ Saved';
  $('save').textContent = 'Update in library';
  $('already').textContent = '· In your library';
  $('save').disabled = false;
};

function showError(e) {
  console.error(e);
  $('status').textContent = 'Sorry, something went wrong reading this page. Try reloading it.';
}

init().catch(showError);
