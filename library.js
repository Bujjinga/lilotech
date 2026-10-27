import { getItems, setItems, saveItem, findExisting, copyRich, toast, escapeHtml, getSettings, setSettings, newSectionId } from './lib.js';
import { capturePdf } from './pdfread.js';
import { STYLES, cite, inTextFor, orderFor } from './styles.js';
import { mountLogo, replayLogo } from './logo.js';
import { chipsHtml } from './chips.js';
import { readLink, ALL_SITES } from './addlink.js';

const $ = (id) => document.getElementById(id);
let items = [];
let settings = { style: 'apa', sections: [] };
let editing = null;
let fresh = null; // id of an item that was just added, to animate it in
let filter = 'all';
try { filter = localStorage.getItem('lilotech.filter') || 'all'; } catch (e) { /* storage blocked */ }

mountLogo($('logo'), { sub: 'library' });
replayLogo($('logo'));

async function load() {
  [items, settings] = await Promise.all([getItems(), getSettings()]);
  if (!['all', 'unsorted'].includes(filter) && !settings.sections.some((s) => s.id === filter)) filter = 'all';
  $('style').value = STYLES[settings.style] ? settings.style : 'apa';
  render();
}

// ---------------------------------------------------------------- sections
const secName = (id) => (settings.sections.find((s) => s.id === id) || {}).name || id;
const sectionsOf = (it) => (it.sections || []).filter((id) => settings.sections.some((s) => s.id === id));
const inScope = (it, f = filter) => (f === 'all' ? true : f === 'unsorted' ? !sectionsOf(it).length : sectionsOf(it).includes(f));
const scopeName = () => (filter === 'all' ? 'All papers' : filter === 'unsorted' ? 'Unsorted' : secName(filter));
const withSections = (it) => ({ ...it, sectionNames: sectionsOf(it).map(secName) });

function setFilter(f) {
  filter = f;
  try { localStorage.setItem('lilotech.filter', f); } catch (e) { /* storage blocked */ }
  render();
}

function renderNav() {
  const count = (f) => items.filter((it) => inScope(it, f)).length;
  const row = (f, name, del) => `<button data-f="${escapeHtml(f)}" class="${filter === f ? 'on' : ''}">
    <span>${escapeHtml(name)}</span><span>${del ? `<span class="del" data-del="${escapeHtml(f)}" title="Delete this section">✕</span>` : ''}<span class="n">${count(f)}</span></span></button>`;
  $('nav').innerHTML = row('all', 'All papers') + settings.sections.map((s) => row(s.id, s.name, true)).join('') + row('unsorted', 'Unsorted');
}

$('nav').onclick = async (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    const id = del.dataset.del;
    if (!confirm(`Delete the section “${secName(id)}”? Papers in it stay in your library.`)) return;
    settings = await setSettings({ sections: settings.sections.filter((s) => s.id !== id) });
    for (const it of items) if (it.sections) it.sections = it.sections.filter((x) => x !== id);
    await setItems(items);
    if (filter === id) setFilter('all');
    return;
  }
  const b = e.target.closest('button[data-f]');
  if (b) setFilter(b.dataset.f);
};

$('newSecForm').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('newSec').value.trim();
  if (!name) return;
  if (settings.sections.some((s) => s.name.toLowerCase() === name.toLowerCase())) return toast('That section already exists');
  const id = newSectionId(name, settings.sections);
  settings = await setSettings({ sections: [...settings.sections, { id, name }] });
  $('newSec').value = '';
  setFilter(id);
};

// ---------------------------------------------------------------- the list
const numbered = () => (STYLES[settings.style] || STYLES.apa).sort === 'number';

// The reference list for some items, in the order the style wants: oldest first for numbered styles.
function refList(list) {
  if (numbered()) return [...list].sort((a, b) => (a.savedAt || '').localeCompare(b.savedAt || ''));
  return orderFor(list, settings.style);
}

function visible() {
  const q = $('q').value.trim().toLowerCase();
  let list = items.filter((it) => inScope(it));
  if (q) list = list.filter((it) => [it.apa, it.ref.title, it.abstract, it.conclusion, it.note, ...sectionsOf(it).map(secName), ...(it.snippets || []).map((s) => s.text)].join(' ').toLowerCase().includes(q));
  if ($('sort').value === 'az') return refList(list);
  return [...list].sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
}

const field = (text, empty) => (text ? `<div class="body">${escapeHtml(text)}</div>` : `<div class="body empty-field">${empty}</div>`);

function refHtml(it, n) {
  const out = cite(withSections(it), settings.style, n);
  return STYLES[settings.style] && STYLES[settings.style].code ? `<pre class="code">${escapeHtml(out.text)}</pre>` : `<div class="apa">${out.html}</div>`;
}

function card(it, n) {
  const d = new Date(it.savedAt);
  const snippets = it.snippets || [];
  if (editing === it.id) {
    return `<article class="card edit" data-id="${it.id}">
      <label>APA 7 reference <span class="hint">(editing this removes the italics; other styles are built from the paper's details)</span></label>
      <textarea data-f="apa">${escapeHtml(it.apa)}</textarea>
      <label>Abstract</label><textarea data-f="abstract">${escapeHtml(it.abstract)}</textarea>
      <label>Conclusion</label><textarea data-f="conclusion">${escapeHtml(it.conclusion)}</textarea>
      <label>Highlights <span class="hint">(separate each with a blank line, then ---, then a blank line)</span></label>
      <textarea data-f="snippets">${escapeHtml(snippets.map((s) => s.text).join('\n\n---\n\n'))}</textarea>
      <label>My note</label><textarea data-f="note">${escapeHtml(it.note)}</textarea>
      <div class="row actions"><button class="primary" data-act="saveEdit">Save changes</button><button data-act="cancel">Cancel</button></div>
    </article>`;
  }
  const open = $('q').value ? 'open' : '';
  const inText = inTextFor(it, settings.style, n);
  return `<article class="card${fresh === it.id ? ' new' : ''}" data-id="${it.id}">
    ${refHtml(it, n)}
    <div class="row small muted" style="margin-top:6px">
      ${inText ? `<span>In-text: ${escapeHtml(inText)}</span><span>·</span>` : ''}<span>Saved ${d.toLocaleDateString()}</span>
    </div>
    <div class="chips">${chipsHtml(settings.sections, sectionsOf(it))}</div>
    <details class="f" ${open}><summary>Abstract</summary>${field(it.abstract, 'No abstract saved yet.')}</details>
    <details class="f" ${open}><summary>Conclusion</summary>${field(it.conclusion, 'No conclusion saved yet.')}</details>
    ${snippets.length ? `<details class="f" open><summary>Highlights (${snippets.length})</summary>${snippets.map((s) => `<blockquote>${escapeHtml(s.text)}</blockquote>`).join('')}</details>` : ''}
    ${it.note ? `<details class="f" open><summary>My note</summary>${field(it.note)}</details>` : ''}
    <div class="row actions">
      <button data-act="copyRef">Copy reference</button>
      <button data-act="copyAllOne">Copy with abstract &amp; conclusion</button>
      ${it.ref.doi || it.ref.url ? '<button data-act="open">Open page</button>' : ''}
      <span class="spacer"></span>
      <button data-act="edit">Edit</button>
      <button data-act="del" class="danger">Delete</button>
    </div>
  </article>`;
}

function render() {
  renderNav();
  $('count').textContent = `${items.length} saved`;
  $('secTitle').textContent = scopeName();
  if (!items.length) {
    $('list').innerHTML = `<div class="empty muted">
      <p><b>Your library is empty.</b></p>
      <p>Open any paper or article, then click the Lilotech icon in Chrome's toolbar and press <b>Save to library</b>.<br>
      Or paste a paper's link, DOI or arXiv ID in the box above.<br>
      Have a PDF on your computer? Click <b>Add a PDF</b>.</p></div>`;
    return;
  }
  // Numbers for IEEE and Vancouver follow the reference list of the section you're looking at.
  const numbers = new Map(refList(items.filter((it) => inScope(it))).map((it, i) => [it.id, i + 1]));
  const list = visible();
  const empty = $('q').value ? 'Nothing matches your search.' : filter === 'unsorted' ? 'Every paper is in a section.' : 'No papers in this section yet. Click a section name on a paper to add it here.';
  $('list').innerHTML = list.length ? list.map((it) => card(it, numbers.get(it.id))).join('') : `<div class="empty muted">${empty}</div>`;
  fresh = null;
}

function fullText(it, n) {
  const parts = [cite(withSections(it), settings.style, n).text];
  if (it.abstract) parts.push('Abstract:\n' + it.abstract);
  if (it.conclusion) parts.push('Conclusion:\n' + it.conclusion);
  for (const s of it.snippets || []) parts.push('Highlight:\n“' + s.text + '”');
  if (it.note) parts.push('Note:\n' + it.note);
  return parts.join('\n\n');
}

$('list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act], button[data-sec]');
  if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id;
  const it = items.find((x) => x.id === id);
  const n = new Map(refList(items.filter((x) => inScope(x))).map((x, i) => [x.id, i + 1])).get(id) || 1;
  if (btn.dataset.sec) {
    const s = btn.dataset.sec;
    const cur = it.sections || [];
    it.sections = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    await setItems(items);
    toast(it.sections.includes(s) ? `Added to ${secName(s)}` : `Removed from ${secName(s)}`);
    return;
  }
  const act = btn.dataset.act;
  if (act === 'copyRef') {
    const out = cite(withSections(it), settings.style, n);
    await copyRich(out.text, STYLES[settings.style].code ? undefined : out.html);
    toast('Reference copied');
  }
  if (act === 'copyAllOne') { await copyRich(fullText(it, n)); toast('Copied'); }
  if (act === 'open') chrome.tabs.create({ url: it.ref.doi ? `https://doi.org/${it.ref.doi}` : it.ref.url });
  if (act === 'edit') { editing = id; render(); }
  if (act === 'cancel') { editing = null; render(); }
  if (act === 'del' && confirm('Delete this item from your library?')) {
    items = items.filter((x) => x.id !== id);
    await setItems(items);
    toast('Deleted');
  }
  if (act === 'saveEdit') {
    const get = (f) => btn.closest('.card').querySelector(`[data-f="${f}"]`).value.trim();
    const apa = get('apa');
    if (apa !== it.apa) { it.apa = apa; it.apaHtml = escapeHtml(apa); it.apaEdited = true; }
    it.abstract = get('abstract');
    it.conclusion = get('conclusion');
    it.note = get('note');
    const old = it.snippets || [];
    it.snippets = get('snippets').split(/\n\s*---\s*\n/).map((t) => t.trim()).filter(Boolean)
      .map((text) => old.find((s) => s.text === text) || { text, savedAt: new Date().toISOString() });
    editing = null;
    await setItems(items);
    toast('Saved');
  }
});

// ---------------------------------------------------------------- citation style
$('style').innerHTML = Object.entries(STYLES).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');
$('style').onchange = async () => {
  settings = await setSettings({ style: $('style').value });
  render();
  toast(`References now in ${STYLES[settings.style].label}`);
};

// ---------------------------------------------------------------- add by link
// Papers added while looking at a section go into that section, keeping any they're already in.
function addToSection(ref) {
  const had = (findExisting(items, ref) || {}).sections || [];
  return ['all', 'unsorted'].includes(filter) ? had : [...new Set([...had, filter])];
}

async function addLink(link) {
  $('addStatus').className = 'small muted';
  $('addStatus').textContent = 'Working…';
  $('addLink').disabled = true;
  try {
    const data = await readLink(link, (msg) => { $('addStatus').textContent = msg; });
    const before = findExisting(items, data.ref);
    // Keep anything already saved for this paper; only fill blanks.
    const fields = { sections: addToSection(data.ref) };
    if (!before || !before.abstract) Object.assign(fields, { abstract: data.abstract, abstractSource: data.abstractSource });
    if (!before || !before.conclusion) fields.conclusion = data.conclusion;
    const it = await saveItem(data.ref, fields);
    if (!before) fresh = it.id;
    const got = [data.abstract && 'abstract', data.conclusion && 'conclusion'].filter(Boolean);
    $('addStatus').textContent = `Saved “${data.ref.title}”${got.length ? ` with its ${got.join(' and ')}` : ''}.`;
    $('link').value = '';
    replayLogo($('logo'));
  } catch (e) {
    console.warn(e);
    $('addStatus').className = 'small err';
    $('addStatus').textContent = e.message || 'Something went wrong. Try again.';
  }
  $('addLink').disabled = false;
}

$('addForm').onsubmit = (e) => {
  e.preventDefault();
  const link = $('link').value.trim();
  if (!link) return $('link').focus();
  // Ask to read websites now, while the click still counts as the user's.
  const asked = chrome.permissions.request({ origins: ALL_SITES }).catch(() => false);
  asked.then(() => addLink(link));
};

// ---------------------------------------------------------------- exports
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
const fileName = (kind, ext) => `Lilotech-${kind}${filter === 'all' ? '' : '-' + scopeName().replace(/[^\w]+/g, '-')}-${stamp()}.${ext}`;
const scope = () => refList(items.filter((it) => inScope(it)));
// Word and Markdown need a written style; for BibTeX or RIS they fall back to APA.
const proseStyle = () => (STYLES[settings.style].code ? 'apa' : settings.style);

function exportList(fn) {
  $('exportMenu').open = false;
  const list = scope();
  if (!list.length) return toast(filter === 'all' ? 'Nothing saved yet' : 'No papers in this section');
  fn(list);
}

// Reading notes grouped by section when looking at the whole library.
function grouped(list) {
  if (filter !== 'all' || !list.some((it) => sectionsOf(it).length)) return [{ name: '', list }];
  const groups = settings.sections.map((s) => ({ name: s.name, list: list.filter((it) => sectionsOf(it).includes(s.id)) }));
  groups.push({ name: 'Unsorted', list: list.filter((it) => !sectionsOf(it).length) });
  return groups.filter((g) => g.list.length);
}

$('copyAll').onclick = () => exportList(async (list) => {
  const refs = list.map((it, i) => cite(withSections(it), settings.style, i + 1));
  const code = STYLES[settings.style].code;
  await copyRich(refs.map((r) => r.text).join(code ? '\n\n' : '\n\n'), code ? undefined : refs.map((r) => `<p style="padding-left:0.5in;text-indent:-0.5in">${r.html}</p>`).join(''));
  toast(`${list.length} references copied`);
});

$('exWord').onclick = () => exportList((list) => {
  const style = proseStyle();
  const num = new Map(list.map((it, i) => [it.id, i + 1]));
  const ref = (it) => cite(it, style, num.get(it.id)).html;
  const hang = STYLES[style].sort === 'number' ? '' : 'margin-left:0.5in;text-indent:-0.5in;';
  const p = (html) => `<p style="${hang}line-height:2">${html}</p>`;
  const block = (h, t) => (t ? `<p><b>${h}</b></p><p>${escapeHtml(t).replace(/\n/g, '<br>')}</p>` : '');
  const notes = grouped(list).map((g) => `${g.name ? `<h3>${escapeHtml(g.name)}</h3>` : ''}
${g.list.map((i) => `<hr>${p(ref(i))}${block('Abstract', i.abstract)}${block('Conclusion', i.conclusion)}${(i.snippets || []).map((s) => block('Highlight', '“' + s.text + '”')).join('')}${block('My note', i.note)}`).join('\n')}`).join('\n');
  const html = `<html><head><meta charset="utf-8"><title>References</title></head>
<body style="font-family:'Times New Roman',serif;font-size:12pt">
<h2 style="text-align:center">References</h2>
${list.map((i) => p(ref(i))).join('\n')}
<br style="page-break-before:always">
<h2 style="text-align:center">Reading notes</h2>
${notes}
</body></html>`;
  download(fileName('references', 'doc'), html, 'application/msword');
});

$('exMd').onclick = () => exportList((list) => {
  const style = proseStyle();
  const num = new Map(list.map((it, i) => [it.id, i + 1]));
  const md = (i) => cite(i, style, num.get(i.id)).html.replace(/<\/?i>/g, '*').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const quote = (t) => t.split('\n').map((l) => '> ' + l).join('\n');
  const out = ['# References', '', ...list.map((i) => md(i) + '\n'), '# Reading notes', ''];
  for (const g of grouped(list)) {
    if (g.name) out.push(`## ${g.name}`, '');
    for (const i of g.list) {
      out.push(`${g.name ? '###' : '##'} ${i.ref.title || 'Untitled'}`, '', md(i), '');
      if (i.abstract) out.push('**Abstract**', '', i.abstract, '');
      if (i.conclusion) out.push('**Conclusion**', '', i.conclusion, '');
      for (const s of i.snippets || []) out.push('**Highlight**', '', quote(s.text), '');
      if (i.note) out.push('**My note**', '', i.note, '');
    }
  }
  download(fileName('notes', 'md'), out.join('\n'), 'text/markdown');
});

// BibTeX keys must be unique in a file, so repeats get a letter: smith2020climate, smith2020climatea…
$('exBib').onclick = () => exportList((list) => {
  const seen = new Map();
  const entries = list.map((it) => {
    const text = cite(withSections(it), 'bibtex').text;
    const key = text.match(/^@\w+\{([^,]+),/)[1];
    const k = seen.get(key) || 0;
    seen.set(key, k + 1);
    return k ? text.replace(`{${key},`, `{${key}${String.fromCharCode(96 + k)},`) : text;
  });
  download(fileName('references', 'bib'), entries.join('\n\n') + '\n', 'application/x-bibtex');
});

$('exRis').onclick = () => exportList((list) => {
  download(fileName('references', 'ris'), list.map((it) => cite(withSections(it), 'ris').text).join('\n') + '\n', 'application/x-research-info-systems');
});

$('exCsv').onclick = () => exportList((list) => {
  const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
  const style = proseStyle();
  const head = [`${STYLES[style].label} reference`, 'In-text citation', 'Title', 'Authors', 'Year', 'Journal / Site', 'DOI', 'URL', 'Sections', 'Abstract', 'Conclusion', 'Highlights', 'Note', 'Saved'];
  const rows = list.map((i, n) => [
    cite(i, style, n + 1).text, inTextFor(i, style, n + 1), i.ref.title,
    (i.ref.authors || []).map((a) => a.literal || `${a.family}, ${a.given}`).join('; '),
    i.ref.year, i.ref.journal || i.ref.siteName, i.ref.doi, i.ref.url, sectionsOf(i).map(secName).join('; '),
    i.abstract, i.conclusion, (i.snippets || []).map((s) => s.text).join('\n---\n'), i.note, i.savedAt,
  ]);
  // The BOM makes Excel open the file as UTF-8.
  download(fileName('library', 'csv'), '﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n'), 'text/csv');
});

$('exJson').onclick = () => {
  $('exportMenu').open = false;
  download(`Lilotech-backup-${stamp()}.json`, JSON.stringify({ app: 'Lilotech', version: 2, items, settings }, null, 2), 'application/json');
};
$('imJson').onclick = () => { $('exportMenu').open = false; $('file').click(); };
$('file').onchange = async () => {
  const f = $('file').files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const incoming = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(incoming)) throw new Error('not a Lilotech backup');
    const ids = new Set(items.map((i) => i.id));
    const added = incoming.filter((i) => i && i.id && i.apa && !ids.has(i.id));
    // Bring back custom sections the restored papers use.
    const extra = ((data.settings && data.settings.sections) || []).filter((s) => !settings.sections.some((x) => x.id === s.id));
    if (extra.length) settings = await setSettings({ sections: [...settings.sections, ...extra] });
    items = [...items, ...added];
    await setItems(items);
    toast(`Restored ${added.length} item${added.length === 1 ? '' : 's'}`);
  } catch (e) {
    toast('That file is not a Lilotech backup');
  }
  $('file').value = '';
};
document.addEventListener('click', (e) => { if (!e.target.closest('#exportMenu')) $('exportMenu').open = false; });

// ---------------------------------------------------------------- PDFs from the computer
$('addPdf').onclick = () => $('pdfFile').click();
$('pdfFile').onchange = async () => {
  const files = [...$('pdfFile').files];
  $('pdfFile').value = '';
  let added = 0;
  for (const f of files) {
    toast(`Reading ${f.name}…`);
    try {
      const data = await capturePdf(new Uint8Array(await f.arrayBuffer()));
      if (!data.ref.title) data.ref.title = f.name.replace(/\.pdf$/i, '');
      data.ref.fileName = f.name;
      const it = await saveItem(data.ref, { abstract: data.abstract, abstractSource: data.abstractSource, conclusion: data.conclusion, sections: addToSection(data.ref) });
      fresh = it.id;
      added++;
    } catch (e) {
      console.error(e);
      toast(`Couldn't read ${f.name}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (added) toast(`Added ${added} PDF${added === 1 ? '' : 's'}. Check the reference, and click Edit to fix anything.`);
};

$('q').addEventListener('input', render);
$('sort').addEventListener('change', render);
chrome.storage.onChanged.addListener((changes) => {
  if ((changes.items || changes.settings) && !editing) load();
});

await load();
// The popup's "Add by link" opens the library with ?add=<link>.
const pending = new URLSearchParams(location.search).get('add');
if (pending) {
  history.replaceState(null, '', location.pathname);
  $('link').value = pending;
  addLink(pending);
}
