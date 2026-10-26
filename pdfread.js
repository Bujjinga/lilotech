// Reading PDFs with pdf.js: pulls out the DOI, title, abstract and conclusion.
// Runs in extension pages (popup, library), not in the service worker.
import * as pdfjsLib from './vendor/pdfjs/pdf.min.mjs';
import { finishCapture } from './lib.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdfjs/pdf.worker.min.mjs');

const MAX_PAGES = 60;
const MAX = 8000;
const cut = (s) => (s.length > MAX ? s.slice(0, MAX).replace(/\s+\S*$/, '') + ' …' : s);
const oneLine = (s) => (s || '').replace(/\s+/g, ' ').trim();

// Turn a page's text items into lines, with a blank line between paragraphs.
function pageLines(content) {
  const lines = [];
  let line = null;
  let last = null;
  for (const it of content.items) {
    if (!('str' in it)) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const h = Math.abs(it.transform[3]) || it.height || 10;
    if (!it.str.trim() && !last) continue;
    if (!line || Math.abs(y - last.y) > Math.max(2, h * 0.5)) {
      // New line. A big vertical gap, or a jump back up (next column), starts a new paragraph.
      if (line) lines.push(line);
      const gap = last ? last.y - y : 0;
      if (last && (gap > last.h * 1.9 || gap < -last.h * 2)) lines.push({ text: '', size: 0 });
      line = { text: it.str, size: h };
    } else {
      const needsSpace = last && x - last.xEnd > h * 0.15 && !/\s$/.test(line.text) && !/^\s/.test(it.str);
      line.text += (needsSpace ? ' ' : '') + it.str;
      line.size = Math.max(line.size, h);
    }
    last = { y, h, xEnd: x + (it.width || 0) };
  }
  if (line) lines.push(line);
  return lines.map((l) => ({ text: l.text.replace(/\s+/g, ' ').trim(), size: l.size }));
}

// Join lines into readable paragraphs and undo end-of-line hyphenation.
function joinLines(lines) {
  return lines
    .map((l) => l.text)
    .join('\n')
    .replace(/([a-z])-\n([a-z])/g, '$1$2')
    .replace(/\n{2,}/g, '\u0000')
    .replace(/\n/g, ' ')
    .replace(/\u0000/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// Text after the first line matching `start`, up to the first line matching `stop`.
function sectionFrom(lines, start, stop, { last = false, inline = false } = {}) {
  const idx = [];
  lines.forEach((l, i) => {
    if (start.test(l.text)) idx.push(i);
  });
  const order = last ? idx.reverse() : idx;
  for (const i of order) {
    const out = [];
    // "Abstract: We studied…" on the same line as the label.
    if (inline) {
      const rest = lines[i].text.replace(start, '').trim();
      if (rest) out.push({ text: rest });
    }
    for (let j = i + 1; j < lines.length && out.length < 400; j++) {
      if (stop.test(lines[j].text)) break;
      out.push(lines[j]);
    }
    const text = joinLines(out);
    if (text.length > 80) return cut(text);
  }
  return '';
}

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>]+)/i;
const tidyDoi = (d) => (d || '').replace(/[.,;)\]]+$/, '');

// Publication year printed on the first page ("© 2021", "Published: 3 May 2021").
// The PDF file's own creation date is not used: it is often just the day it was downloaded or exported.
function printedYear(text) {
  const m = /(©|\(c\)|copyright|published(?: online)?|accepted|available online)\s*:?\s*(?:\d{1,2}\s+[a-z]+\s+|[a-z]+\s+\d{1,2},?\s+)?((?:19|20)\d{2})/i.exec(text);
  return m ? m[2] : '';
}

// Bad "Title" values that PDF writers leave behind.
const junkTitle = (t) => !t || t.length < 8 || /^(untitled|microsoft word|document\d*|slide \d+|\S+\.(docx?|pdf|tex|indd))/i.test(t) || /^[\w-]+\.\w{2,4}$/.test(t);

export async function readPdf(data, url = '') {
  const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
  const meta = await doc.getMetadata().catch(() => ({}));
  const info = meta.info || {};
  const xmp = meta.metadata;
  const xget = (k) => { try { return xmp ? oneLine(String(xmp.get(k) || '')) : ''; } catch (e) { return ''; } };

  const pages = [];
  const n = Math.min(doc.numPages, MAX_PAGES);
  for (let p = 1; p <= n; p++) {
    const page = await doc.getPage(p);
    pages.push(pageLines(await page.getTextContent()));
  }
  const firstLines = pages.slice(0, 3).flat();
  const allLines = pages.flat();
  const firstText = firstLines.map((l) => l.text).join('\n');
  // Page 1 and 2 only, and stop at a reference list, so a cited paper's DOI is never picked up.
  const doiText = pages.slice(0, 2).flat().map((l) => l.text).join('\n').split(/\n\s*(references|bibliography)\s*\n/i)[0];

  // DOI: metadata first, then the first pages (not the reference list at the end).
  let doi = '';
  for (const c of [xget('prism:doi'), xget('dc:identifier'), info.doi, info.Subject, info.Keywords, doiText, decodeURIComponent(url || '')]) {
    const m = DOI_RE.exec(c || '');
    if (m) { doi = tidyDoi(m[1]); break; }
  }

  // Title: biggest text on page 1, unless the PDF's own title looks good.
  let title = oneLine(info.Title || xget('dc:title'));
  if (junkTitle(title)) {
    const p1 = (pages[0] || []).filter((l) => l.text.length > 3);
    const big = Math.max(0, ...p1.map((l) => l.size));
    const t = oneLine(p1.filter((l) => l.size >= big * 0.92).map((l) => l.text).join(' '));
    title = t.length >= 8 && t.length < 300 ? t : '';
  }

  const authorMeta = oneLine(info.Author || xget('dc:creator'));
  const authors = authorMeta && !/^(user|admin|author|unknown|owner)$/i.test(authorMeta)
    ? authorMeta.split(/\s*(?:;|\band\b|&)\s*/).flatMap((a) => (/,.*,/.test(a) ? a.split(/\s*,\s*/) : [a])).filter((a) => a.length > 1)
    : [];

  // Abstract: after an "Abstract" label, up to keywords / introduction.
  const absStop = /^(keywords?|key ?words|index terms|jel|(1|i)\.?\s*introduction|introduction|background|©|copyright|received\b|article history|highlights)\b/i;
  let abstract = sectionFrom(firstLines, /^\s*(a\s?b\s?s\s?t\s?r\s?a\s?c\s?t|summary)\s*[:.\-–—]?\s*/i, absStop, { inline: true });

  // Conclusion: the last "Conclusion(s)" heading, up to references / acknowledgements.
  const num = '^\\s*((\\d+(\\.\\d+)*|[IVX]+)[.)]?\\s*)?';
  const conclStop = /^\s*((\d+(\.\d+)*|[IVX]+)[.)]?\s*)?(references|bibliography|literature cited|works cited|acknowledge?ments?|funding|declarations?|appendix|author contributions|data availability|conflicts? of interest|competing interests|supplementary|abbreviations)\b/i;
  const conclusion =
    sectionFrom(allLines, new RegExp(num + '(conclusions?|concluding remarks|summary and conclusions?|conclusions? and .{0,40}|discussion and conclusions?)\\s*\\.?\\s*$', 'i'), conclStop, { last: true }) ||
    sectionFrom(allLines, new RegExp(num + '(conclusions?|concluding remarks)\\s*[:.\\-–—]\\s*', 'i'), conclStop, { last: true, inline: true });

  return {
    url,
    pageTitle: title,
    title,
    authors,
    date: printedYear(firstText),
    doi,
    isScholarly: !!(doi || abstract),
    isPdf: true,
    numPages: doc.numPages,
    abstract,
    abstractSource: abstract ? 'PDF text' : '',
    conclusion,
    selection: '',
  };
}

// Fetch the PDF that's open in a tab. Tries, in order:
// 1. from inside the tab (same site, so it works for PDFs you're signed in to see),
// 2. straight from the extension (works when Lilotech has access to that site or to file URLs).
export async function fetchTabPdf(tab) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const r = await fetch(location.href, { credentials: 'include' });
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf.length > 60e6) return { error: 'too big' };
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        return { b64: btoa(bin) };
      },
    });
    const b64 = res && res.result && res.result.b64;
    if (b64) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      if (isPdf(bytes)) return bytes;
    }
  } catch (e) { /* fall through */ }
  try {
    const r = await fetch(tab.url, { credentials: 'include' });
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (isPdf(bytes)) return bytes;
  } catch (e) { /* fall through */ }
  return null;
}

const isPdf = (b) => b && b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // "%PDF"

export function looksLikePdfUrl(url) {
  return /\.pdf($|[?#])/i.test(url || '') || /\/pdf\//i.test(url || '');
}

// Read a PDF and look it up online: the PDF version of capture() in lib.js.
export async function capturePdf(bytes, url = '') {
  return finishCapture(await readPdf(bytes, url));
}
