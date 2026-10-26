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
  const existing = findExisting(await getItems(), data.ref);
  const apa = existing && existing.apaEdited ? { text: existing.apa, html: existing.apaHtml } : formatAPA(data.ref);

  const kinds = { article: 'Journal article', webpage: 'Web page', book: 'Book', chapter: 'Book chapter' };
  $('kind').textContent = kinds[data.ref.type] || 'Source';
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

init().catch((e) => {
  console.error(e);
  $('status').textContent = 'Sorry, something went wrong reading this page. Try reloading it.';
});
