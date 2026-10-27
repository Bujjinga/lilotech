// Citation styles. Each style turns a reference object (see buildReference in lib.js) into
// { text, html } for the reference list, plus an in-text citation.
import { formatAPA, formatInText, escapeHtml } from './lib.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IEEE_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

// Small builder that keeps the plain-text and HTML versions in step.
function builder() {
  const T = [];
  const H = [];
  return {
    add(text, html = escapeHtml(text)) { if (text) { T.push(text); H.push(html); } return this; },
    ital(text) { return this.add(text, `<i>${escapeHtml(text)}</i>`); },
    done() { return { text: T.join('').replace(/\s+/g, ' ').trim(), html: H.join('').replace(/\s+/g, ' ').trim() }; },
  };
}

const end = (s, p = '.') => (/[.?!]$/.test(s) ? s : s + p);
const title = (ref) => (ref.title || 'Untitled').trim();
const isArticle = (ref) => ref.type === 'article' && !!ref.journal;
const link = (ref) => (ref.doi ? `https://doi.org/${ref.doi}` : ref.url || '');
const pageRange = (ref, dash = '–') => (ref.pages || '').replace(/[-–—]+/g, dash);
const firstPage = (ref) => (ref.pages || '').split(/[-–—]/)[0].trim();
const lastPage = (ref) => ((ref.pages || '').split(/[-–—]/)[1] || '').trim();

// Name pieces. Given names are kept as written ("John Andrew") or turned into initials.
const name = {
  family: (a) => a.literal || a.family || '',
  given: (a) => (a.literal ? '' : (a.given || '').trim()),
  initials(a, { dots = true, spaces = true } = {}) {
    const parts = this.given(a).replace(/\./g, ' ').split(/\s+/).filter(Boolean)
      .map((w) => w.split('-').map((p) => p[0].toUpperCase() + (dots ? '.' : '')).join('-'));
    return parts.join(spaces ? ' ' : '');
  },
  // "Smith, John A."
  inverted(a) { const g = this.given(a); return a.literal ? a.literal : g ? `${a.family}, ${g}` : a.family; },
  // "John A. Smith"
  natural(a) { const g = this.given(a); return a.literal ? a.literal : g ? `${g} ${a.family}` : a.family; },
};

function joinAnd(list, { and = 'and', serial = true } = {}) {
  if (list.length <= 1) return list.join('');
  if (list.length === 2) return `${list[0]} ${and} ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}${serial ? ',' : ''} ${and} ${list[list.length - 1]}`;
}

// ------------------------------------------------------------------ MLA 9
function mla(ref) {
  const a = ref.authors || [];
  let who = '';
  if (a.length === 1) who = name.inverted(a[0]);
  else if (a.length === 2) who = `${name.inverted(a[0])}, and ${name.natural(a[1])}`;
  else if (a.length > 2) who = `${name.inverted(a[0])}, et al`;
  const b = builder();
  if (who) b.add(end(who) + ' ');
  if (isArticle(ref) || ref.type === 'chapter') {
    b.add(`“${end(title(ref))}” `);
    if (ref.journal) b.ital(ref.journal).add(', ');
    if (ref.volume) b.add(`vol. ${ref.volume}, `);
    if (ref.issue) b.add(`no. ${ref.issue}, `);
    if (ref.year) b.add(`${ref.year}, `);
    if (ref.pages) b.add(`pp. ${pageRange(ref)}, `);
    else if (ref.articleNumber) b.add(`article ${ref.articleNumber}, `);
  } else if (ref.type === 'book') {
    b.ital(end(title(ref))).add(' ');
    if (ref.publisher) b.add(`${ref.publisher}, `);
    if (ref.year) b.add(`${ref.year}, `);
  } else {
    b.add(`“${end(title(ref))}” `);
    const site = ref.siteName || ref.publisher || ref.journal;
    if (site && site !== who) b.ital(site).add(', ');
    if (ref.year) b.add(`${ref.day ? ref.day + ' ' : ''}${ref.month ? MLA_MONTHS[ref.month - 1] + ' ' : ''}${ref.year}, `);
  }
  const l = link(ref);
  const out = b.done();
  // Replace the trailing comma with the link and a final period.
  const tail = l ? `, ${l}.` : '.';
  return { text: out.text.replace(/,$/, '') + tail, html: out.html.replace(/,$/, '') + escapeHtml(tail) };
}
const mlaInText = (ref) => {
  const a = ref.authors || [];
  if (!a.length) return `(“${title(ref).split(/\s+/).slice(0, 4).join(' ')}”)`;
  if (a.length === 2) return `(${name.family(a[0])} and ${name.family(a[1])})`;
  return `(${name.family(a[0])}${a.length > 2 ? ' et al.' : ''})`;
};

// ------------------------------------------------------------------ Chicago 17 (author-date)
function chicago(ref) {
  const a = ref.authors || [];
  let list = a.map((x, i) => (i === 0 ? name.inverted(x) : name.natural(x)));
  if (list.length > 10) list = [...list.slice(0, 7), 'et al.'];
  const who = list.length > 7 && list[7] === 'et al.' ? `${list.slice(0, 7).join(', ')}, et al.` : joinAnd(list);
  const b = builder();
  const book = ref.type === 'book';
  if (who) b.add(end(who) + ' ');
  else if (book) b.ital(end(title(ref))).add(' ');
  else b.add(`“${end(title(ref))}” `);
  b.add(`${ref.year || 'n.d.'}. `);
  if (!who) {
    if (ref.journal) b.ital(ref.journal).add(`${ref.volume ? ' ' + ref.volume : ''}${ref.issue ? ` (${ref.issue})` : ''}${ref.pages ? ': ' + pageRange(ref) : ''}. `);
    else if (ref.siteName || ref.publisher) b.add(end(ref.siteName || ref.publisher) + ' ');
    if (!ref.journal && ref.month) b.add(`${MONTHS[ref.month - 1]}${ref.day ? ' ' + ref.day : ''}, ${ref.year}. `);
  } else if (isArticle(ref) || ref.type === 'chapter') {
    b.add(`“${end(title(ref))}” `);
    if (ref.journal) b.ital(ref.journal);
    if (ref.volume) b.add(` ${ref.volume}`);
    if (ref.issue) b.add(` (${ref.issue})`);
    if (ref.pages) b.add(`: ${pageRange(ref)}`);
    else if (ref.articleNumber) b.add(`: ${ref.articleNumber}`);
    b.add('. ');
  } else if (ref.type === 'book') {
    b.ital(end(title(ref))).add(' ');
    if (ref.publisher) b.add(end(ref.publisher) + ' ');
  } else {
    b.add(`“${end(title(ref))}” `);
    const site = ref.siteName || ref.publisher;
    if (site && site !== who) b.add(end(site) + ' ');
    if (ref.month) b.add(`${MONTHS[ref.month - 1]}${ref.day ? ' ' + ref.day : ''}, ${ref.year}. `);
  }
  const l = link(ref);
  if (l) b.add(end(l));
  return b.done();
}
const chicagoInText = (ref) => {
  const a = ref.authors || [];
  const y = ref.year || 'n.d.';
  if (!a.length) return `(“${title(ref).split(/\s+/).slice(0, 4).join(' ')}” ${y})`;
  if (a.length === 2) return `(${name.family(a[0])} and ${name.family(a[1])} ${y})`;
  if (a.length === 3) return `(${name.family(a[0])}, ${name.family(a[1])}, and ${name.family(a[2])} ${y})`;
  return `(${name.family(a[0])}${a.length > 3 ? ' et al.' : ''} ${y})`;
};

// ------------------------------------------------------------------ Harvard (Cite Them Right)
function harvard(ref) {
  const a = ref.authors || [];
  const who = joinAnd(a.map((x) => (x.literal ? x.literal : `${x.family}, ${name.initials(x, { spaces: false })}`.replace(/, $/, ''))), { serial: false });
  const b = builder();
  if (who) b.add(`${who} `);
  else b.ital(title(ref)).add(' ');
  b.add(`(${ref.year || 'no date'}) `);
  if (!who) {
    if (ref.journal) b.ital(ref.journal).add(`${ref.volume ? ', ' + ref.volume : ''}${ref.issue ? `(${ref.issue})` : ''}${ref.pages ? ', pp. ' + pageRange(ref) : ''}. `);
    else if (ref.siteName || ref.publisher) b.add(end(ref.siteName || ref.publisher) + ' ');
  } else if (isArticle(ref) || ref.type === 'chapter') {
    b.add(`‘${title(ref)}’, `);
    if (ref.journal) b.ital(ref.journal);
    if (ref.volume) b.add(`, ${ref.volume}${ref.issue ? `(${ref.issue})` : ''}`);
    if (ref.pages) b.add(`, pp. ${pageRange(ref)}`);
    else if (ref.articleNumber) b.add(`, ${ref.articleNumber}`);
    b.add('. ');
  } else if (ref.type === 'book') {
    b.ital(end(title(ref))).add(' ');
    if (ref.publisher) b.add(end(ref.publisher) + ' ');
  } else {
    b.ital(end(title(ref))).add(' ');
  }
  if (ref.doi) b.add(`Available at: https://doi.org/${ref.doi}.`);
  else if (ref.url) {
    const d = new Date();
    b.add(`Available at: ${ref.url} (Accessed: ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}).`);
  }
  return b.done();
}
const harvardInText = (ref) => {
  const a = ref.authors || [];
  const y = ref.year || 'no date';
  if (!a.length) return `(${title(ref).split(/\s+/).slice(0, 4).join(' ')}, ${y})`;
  if (a.length === 2) return `(${name.family(a[0])} and ${name.family(a[1])}, ${y})`;
  if (a.length === 3) return `(${name.family(a[0])}, ${name.family(a[1])} and ${name.family(a[2])}, ${y})`;
  return `(${name.family(a[0])}${a.length > 3 ? ' et al.' : ''}, ${y})`;
};

// ------------------------------------------------------------------ IEEE
function ieee(ref, n = 1) {
  const a = ref.authors || [];
  const short = (x) => (x.literal ? x.literal : `${name.initials(x)} ${x.family}`.trim());
  const who = a.length > 6 ? `${short(a[0])} et al.` : joinAnd(a.map(short));
  const b = builder();
  b.add(`[${n}] `);
  if (who) b.add(`${who}, `);
  if (isArticle(ref) || ref.type === 'chapter') {
    b.add(`“${title(ref)},” `);
    if (ref.journal) b.ital(ref.journal).add(', ');
    if (ref.volume) b.add(`vol. ${ref.volume}, `);
    if (ref.issue) b.add(`no. ${ref.issue}, `);
    if (ref.pages) b.add(`${/[-–]/.test(ref.pages) ? 'pp.' : 'p.'} ${pageRange(ref)}, `);
    else if (ref.articleNumber) b.add(`Art. no. ${ref.articleNumber}, `);
    b.add(`${ref.month ? IEEE_MONTHS[ref.month - 1] + ' ' : ''}${ref.year || ''}`);
    if (ref.doi) b.add(`, doi: ${ref.doi}.`);
    else b.add('.');
  } else if (ref.type === 'book') {
    b.ital(title(ref)).add('. ');
    if (ref.publisher) b.add(`${ref.publisher}, `);
    b.add(`${ref.year || ''}.`);
    if (ref.doi) b.add(` doi: ${ref.doi}.`);
  } else {
    b.add(`“${end(title(ref))}” `);
    const site = ref.siteName || ref.publisher;
    if (site) b.add(`${site}. `);
    if (ref.url) {
      const d = new Date();
      b.add(`Accessed: ${IEEE_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}. [Online]. Available: ${ref.url}`);
    } else if (ref.doi) b.add(`doi: ${ref.doi}.`);
  }
  return b.done();
}

// ------------------------------------------------------------------ Vancouver
function vancouver(ref, n = 1) {
  const a = ref.authors || [];
  const short = (x) => (x.literal ? x.literal : `${x.family} ${name.initials(x, { dots: false, spaces: false }).replace(/-/g, '')}`.trim());
  let who = a.slice(0, 6).map(short).join(', ');
  if (a.length > 6) who += ', et al';
  const b = builder();
  b.add(`${n}. `);
  if (who) b.add(end(who) + ' ');
  b.add(end(title(ref)) + ' ');
  if (isArticle(ref) || ref.type === 'chapter') {
    if (ref.journal) b.add(end(ref.journal) + ' ');
    b.add(`${ref.year || ''}${ref.month ? ' ' + SHORT_MONTHS[ref.month - 1] : ''}`);
    if (ref.volume) b.add(`;${ref.volume}`);
    if (ref.issue) b.add(`(${ref.issue})`);
    if (ref.pages) b.add(`:${pageRange(ref, '-')}`);
    else if (ref.articleNumber) b.add(`:${ref.articleNumber}`);
    b.add('.');
    if (ref.doi) b.add(` doi:${ref.doi}`);
  } else if (ref.type === 'book') {
    if (ref.publisher) b.add(`${ref.publisher}; `);
    b.add(`${ref.year || ''}.`);
  } else {
    const site = ref.siteName || ref.publisher;
    const d = new Date();
    b.add(`[Internet]. ${site ? site + '; ' : ''}${ref.year || ''} [cited ${d.getFullYear()} ${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}].`);
    if (link(ref)) b.add(` Available from: ${link(ref)}`);
  }
  return b.done();
}

// ------------------------------------------------------------------ BibTeX
const latin = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function bibKey(ref) {
  const fam = latin(ref.authors && ref.authors[0] ? name.family(ref.authors[0]) : 'anon').split(/\s+/).pop().toLowerCase().replace(/[^a-z]/g, '') || 'anon';
  const word = latin(title(ref)).toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, '')).find((w) => w.length > 3 && !/^(the|and|with|from|that|this|into|over|under|their|using)$/.test(w)) || 'untitled';
  return `${fam}${ref.year || 'nd'}${word}`;
}
const tex = (s) => String(s || '').replace(/\\/g, '\\textbackslash{}').replace(/([&%$#_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
function bibtex(ref) {
  const kind = isArticle(ref) ? 'article' : ref.type === 'book' ? 'book' : ref.type === 'chapter' ? 'incollection' : 'misc';
  const authors = (ref.authors || []).map((a) => (a.literal ? `{${tex(a.literal)}}` : tex(name.inverted(a)))).join(' and ');
  const f = [];
  const put = (k, v) => { if (v) f.push(`  ${k.padEnd(9)} = {${v}}`); };
  put('author', authors);
  put('title', `{${tex(title(ref))}}`);
  if (kind === 'article') put('journal', tex(ref.journal));
  if (kind === 'incollection') put('booktitle', tex(ref.journal));
  put('year', ref.year);
  if (ref.month) put('month', SHORT_MONTHS[ref.month - 1].toLowerCase());
  put('volume', tex(ref.volume));
  put('number', tex(ref.issue));
  put('pages', ref.pages ? pageRange(ref, '--') : tex(ref.articleNumber));
  if (kind !== 'article') put('publisher', tex(ref.publisher || (kind === 'misc' ? ref.siteName : '')));
  put('doi', tex(ref.doi));
  if (ref.url && !ref.doi) put('url', ref.url);
  if (kind === 'misc' && ref.url) put('note', `Accessed: ${new Date().toISOString().slice(0, 10)}`);
  const text = `@${kind}{${bibKey(ref)},\n${f.join(',\n')}\n}`;
  return { text, html: `<pre>${escapeHtml(text)}</pre>` };
}

// ------------------------------------------------------------------ RIS (Zotero, Mendeley, EndNote)
function ris(ref, n, item = {}) {
  const ty = isArticle(ref) ? 'JOUR' : ref.type === 'book' ? 'BOOK' : ref.type === 'chapter' ? 'CHAP' : 'ELEC';
  const L = [`TY  - ${ty}`];
  const put = (k, v) => { if (v) L.push(`${k}  - ${String(v).replace(/\s+/g, ' ').trim()}`); };
  for (const a of ref.authors || []) put('AU', a.literal || name.inverted(a));
  put('TI', title(ref));
  put(ty === 'JOUR' ? 'JO' : 'T2', ref.journal || (ty === 'ELEC' ? ref.siteName : ''));
  put('PY', ref.year);
  if (ref.year && ref.month) put('DA', `${ref.year}/${String(ref.month).padStart(2, '0')}/${ref.day ? String(ref.day).padStart(2, '0') : ''}`);
  put('VL', ref.volume);
  put('IS', ref.issue);
  put('SP', firstPage(ref) || ref.articleNumber);
  put('EP', lastPage(ref));
  put('PB', ref.publisher);
  put('DO', ref.doi);
  put('UR', link(ref));
  put('AB', item.abstract);
  if (item.conclusion) put('N1', `Conclusion: ${item.conclusion}`);
  if (item.note) put('N1', item.note);
  for (const s of item.sectionNames || []) put('KW', s);
  L.push('ER  - ');
  const text = L.join('\n');
  return { text, html: `<pre>${escapeHtml(text)}</pre>` };
}

// ------------------------------------------------------------------ registry
export const STYLES = {
  apa: { label: 'APA 7', format: (ref) => formatAPA(ref), inText: formatInText, sort: 'author' },
  mla: { label: 'MLA 9', format: mla, inText: mlaInText, sort: 'author' },
  chicago: { label: 'Chicago (author-date)', format: chicago, inText: chicagoInText, sort: 'author' },
  harvard: { label: 'Harvard', format: harvard, inText: harvardInText, sort: 'author' },
  ieee: { label: 'IEEE', format: ieee, inText: (ref, n = 1) => `[${n}]`, sort: 'number' },
  vancouver: { label: 'Vancouver', format: vancouver, inText: (ref, n = 1) => `(${n})`, sort: 'number' },
  bibtex: { label: 'BibTeX', format: bibtex, inText: (ref) => `\\cite{${bibKey(ref)}}`, sort: 'author', code: true },
  ris: { label: 'RIS (Zotero, Mendeley, EndNote)', format: ris, inText: () => '', sort: 'author', code: true },
};

// The reference for a saved item in a style. A hand-edited APA reference is kept as written.
export function cite(item, style = 'apa', n = 1) {
  if (style === 'apa' && item.apaEdited) return { text: item.apa, html: item.apaHtml || escapeHtml(item.apa) };
  return (STYLES[style] || STYLES.apa).format(item.ref, n, item);
}

export function inTextFor(item, style = 'apa', n = 1) {
  return (STYLES[style] || STYLES.apa).inText(item.ref, n);
}

// Order items for a reference list: alphabetical for author-date styles, as given for numbered ones.
export function orderFor(items, style = 'apa') {
  if ((STYLES[style] || STYLES.apa).sort === 'number') return [...items];
  return [...items].sort((a, b) => cite(a, 'apa').text.localeCompare(cite(b, 'apa').text, undefined, { sensitivity: 'base' }));
}
