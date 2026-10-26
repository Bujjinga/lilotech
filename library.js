import { getItems, setItems, copyRich, toast, escapeHtml } from './lib.js';

const $ = (id) => document.getElementById(id);
let items = [];
let editing = null;

async function load() {
  items = await getItems();
  render();
}

function sorted(list) {
  const out = [...list];
  if ($('sort').value === 'az') out.sort((a, b) => a.apa.localeCompare(b.apa, undefined, { sensitivity: 'base' }));
  else out.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  return out;
}

function visible() {
  const q = $('q').value.trim().toLowerCase();
  const list = q
    ? items.filter((it) => [it.apa, it.abstract, it.conclusion, it.note, ...(it.snippets || []).map((s) => s.text)].join(' ').toLowerCase().includes(q))
    : items;
  return sorted(list);
}

const field = (text, empty) => (text ? `<div class="body">${escapeHtml(text)}</div>` : `<div class="body empty-field">${empty}</div>`);

function card(it) {
  const d = new Date(it.savedAt);
  const snippets = it.snippets || [];
  if (editing === it.id) {
    return `<article class="card edit" data-id="${it.id}">
      <label>APA 7 reference <span class="hint">(editing this removes the italics)</span></label>
      <textarea data-f="apa">${escapeHtml(it.apa)}</textarea>
      <label>Abstract</label><textarea data-f="abstract">${escapeHtml(it.abstract)}</textarea>
      <label>Conclusion</label><textarea data-f="conclusion">${escapeHtml(it.conclusion)}</textarea>
      <label>Highlights <span class="hint">(separate each with a blank line, then ---, then a blank line)</span></label>
      <textarea data-f="snippets">${escapeHtml(snippets.map((s) => s.text).join('\n\n---\n\n'))}</textarea>
      <label>My note</label><textarea data-f="note">${escapeHtml(it.note)}</textarea>
      <div class="row actions"><button class="primary" data-act="saveEdit">Save changes</button><button data-act="cancel">Cancel</button></div>
    </article>`;
  }
  return `<article class="card" data-id="${it.id}">
    <div class="apa">${it.apaHtml || escapeHtml(it.apa)}</div>
    <div class="row small muted" style="margin-top:6px">
      <span>In-text: ${escapeHtml(it.inText || '')}</span><span>·</span><span>Saved ${d.toLocaleDateString()}</span>
    </div>
    <details ${$('q').value ? 'open' : ''}><summary>Abstract</summary>${field(it.abstract, 'No abstract saved yet.')}</details>
    <details ${$('q').value ? 'open' : ''}><summary>Conclusion</summary>${field(it.conclusion, 'No conclusion saved yet.')}</details>
    ${snippets.length ? `<details open><summary>Highlights (${snippets.length})</summary>${snippets.map((s) => `<blockquote>${escapeHtml(s.text)}</blockquote>`).join('')}</details>` : ''}
    ${it.note ? `<details open><summary>My note</summary>${field(it.note)}</details>` : ''}
    <div class="row actions">
      <button data-act="copyRef">Copy reference</button>
      <button data-act="copyAllOne">Copy with abstract &amp; conclusion</button>
      <button data-act="open">Open page</button>
      <span class="spacer"></span>
      <button data-act="edit">Edit</button>
      <button data-act="del" class="danger">Delete</button>
    </div>
  </article>`;
}

function render() {
  const list = visible();
  $('count').textContent = `${items.length} saved`;
  if (!items.length) {
    $('list').innerHTML = `<div class="empty muted">
      <p><b>Your library is empty.</b></p>
      <p>Open any paper or article, then click the Lilotech icon in Chrome's toolbar and press <b>Save to library</b>.<br>
      You can also right-click a page, or highlight text and right-click, to save it.</p></div>`;
    return;
  }
  $('list').innerHTML = list.length ? list.map(card).join('') : '<div class="empty muted">Nothing matches your search.</div>';
}

function fullText(it) {
  const parts = [it.apa];
  if (it.abstract) parts.push('Abstract:\n' + it.abstract);
  if (it.conclusion) parts.push('Conclusion:\n' + it.conclusion);
  for (const s of it.snippets || []) parts.push('Highlight:\n“' + s.text + '”');
  if (it.note) parts.push('Note:\n' + it.note);
  return parts.join('\n\n');
}

$('list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id;
  const it = items.find((x) => x.id === id);
  const act = btn.dataset.act;
  if (act === 'copyRef') { await copyRich(it.apa, it.apaHtml); toast('Reference copied'); }
  if (act === 'copyAllOne') { await copyRich(fullText(it)); toast('Copied'); }
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

// ---------------------------------------------------------------- exports
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
const byApa = () => [...items].sort((a, b) => a.apa.localeCompare(b.apa, undefined, { sensitivity: 'base' }));

$('copyAll').onclick = async () => {
  if (!items.length) return toast('Nothing saved yet');
  const list = byApa();
  await copyRich(list.map((i) => i.apa).join('\n\n'), list.map((i) => `<p style="padding-left:0.5in;text-indent:-0.5in">${i.apaHtml || escapeHtml(i.apa)}</p>`).join(''));
  toast(`${list.length} references copied`);
};

$('exWord').onclick = () => {
  if (!items.length) return toast('Nothing saved yet');
  const list = byApa();
  const p = (html) => `<p style="margin-left:0.5in;text-indent:-0.5in;line-height:2">${html}</p>`;
  const block = (h, t) => (t ? `<p><b>${h}</b></p><p>${escapeHtml(t).replace(/\n/g, '<br>')}</p>` : '');
  const html = `<html><head><meta charset="utf-8"><title>References</title></head>
<body style="font-family:'Times New Roman',serif;font-size:12pt">
<h2 style="text-align:center">References</h2>
${list.map((i) => p(i.apaHtml || escapeHtml(i.apa))).join('\n')}
<br style="page-break-before:always">
<h2 style="text-align:center">Reading notes</h2>
${list.map((i) => `<hr>${p(i.apaHtml || escapeHtml(i.apa))}${block('Abstract', i.abstract)}${block('Conclusion', i.conclusion)}${(i.snippets || []).map((s) => block('Highlight', '“' + s.text + '”')).join('')}${block('My note', i.note)}`).join('\n')}
</body></html>`;
  download(`Lilotech-references-${stamp()}.doc`, html, 'application/msword');
};

$('exMd').onclick = () => {
  if (!items.length) return toast('Nothing saved yet');
  const md = (i) => (i.apaHtml || escapeHtml(i.apa)).replace(/<\/?i>/g, '*').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const quote = (t) => t.split('\n').map((l) => '> ' + l).join('\n');
  const list = byApa();
  const out = ['# References', '', ...list.map((i) => md(i) + '\n'), '# Reading notes', ''];
  for (const i of list) {
    out.push(`## ${i.ref.title || 'Untitled'}`, '', md(i), '');
    if (i.abstract) out.push('**Abstract**', '', i.abstract, '');
    if (i.conclusion) out.push('**Conclusion**', '', i.conclusion, '');
    for (const s of i.snippets || []) out.push('**Highlight**', '', quote(s.text), '');
    if (i.note) out.push('**My note**', '', i.note, '');
  }
  download(`Lilotech-notes-${stamp()}.md`, out.join('\n'), 'text/markdown');
};

$('exCsv').onclick = () => {
  if (!items.length) return toast('Nothing saved yet');
  const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
  const head = ['APA 7 reference', 'In-text citation', 'Title', 'Authors', 'Year', 'Journal / Site', 'DOI', 'URL', 'Abstract', 'Conclusion', 'Highlights', 'Note', 'Saved'];
  const rows = byApa().map((i) => [
    i.apa, i.inText, i.ref.title,
    (i.ref.authors || []).map((a) => a.literal || `${a.family}, ${a.given}`).join('; '),
    i.ref.year, i.ref.journal || i.ref.siteName, i.ref.doi, i.ref.url,
    i.abstract, i.conclusion, (i.snippets || []).map((s) => s.text).join('\n---\n'), i.note, i.savedAt,
  ]);
  // The BOM makes Excel open the file as UTF-8.
  download(`Lilotech-${stamp()}.csv`, '﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n'), 'text/csv');
};

$('exJson').onclick = () => download(`Lilotech-backup-${stamp()}.json`, JSON.stringify({ app: 'Lilotech', version: 1, items }, null, 2), 'application/json');
$('imJson').onclick = () => $('file').click();
$('file').onchange = async () => {
  const f = $('file').files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const incoming = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(incoming)) throw new Error('not a Lilotech backup');
    const ids = new Set(items.map((i) => i.id));
    const added = incoming.filter((i) => i && i.id && i.apa && !ids.has(i.id));
    items = [...items, ...added];
    await setItems(items);
    toast(`Restored ${added.length} item${added.length === 1 ? '' : 's'}`);
  } catch (e) {
    toast('That file is not a Lilotech backup');
  }
  $('file').value = '';
};

$('q').addEventListener('input', render);
$('sort').addEventListener('change', render);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.items && !editing) load();
});
load();
