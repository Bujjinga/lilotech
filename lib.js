// Shared logic for Lilotech: page extraction, Crossref lookup, APA 7 formatting, storage.

// ---------------------------------------------------------------------------
// Page extraction. This function is injected into the page with
// chrome.scripting.executeScript, so it must not use anything outside itself.
// ---------------------------------------------------------------------------
export async function extractPage() {
  const MAX = 8000;
  const oneLine = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const para = (s) => (s || '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const cut = (s) => (s.length > MAX ? s.slice(0, MAX).replace(/\s+\S*$/, '') + ' …' : s);

  const metaAll = (name) =>
    Array.from(document.querySelectorAll(`meta[name="${name}" i], meta[property="${name}" i]`))
      .map((m) => oneLine(m.getAttribute('content')))
      .filter(Boolean);
  const meta = (...names) => {
    for (const n of names) {
      const v = metaAll(n);
      if (v.length) return v[0];
    }
    return '';
  };

  // JSON-LD (schema.org) article data, used by many news sites, blogs and some journals.
  let ld = null;
  const ldTypes = /^(ScholarlyArticle|Article|NewsArticle|BlogPosting|Report|Thesis|TechArticle|MedicalScholarlyArticle|WebPage|Book|Chapter)$/;
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent);
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length && !ld) {
        const o = stack.shift();
        if (!o || typeof o !== 'object') continue;
        if (o['@graph']) stack.push(...o['@graph']);
        const t = [].concat(o['@type'] || []);
        if (t.some((x) => ldTypes.test(x)) && (o.headline || o.name)) ld = o;
      }
    } catch (e) { /* ignore bad JSON-LD */ }
    if (ld) break;
  }
  const ldName = (v) => (v == null ? '' : typeof v === 'string' ? v : v.name || '');
  const ldAuthors = ld ? [].concat(ld.author || []).map((a) => {
    if (typeof a === 'string') return a;
    if (a.familyName) return `${a.familyName}, ${a.givenName || ''}`;
    return a.name || '';
  }).filter(Boolean) : [];

  // Authors: Highwire/Google Scholar tags first, then Dublin Core, then JSON-LD, then generic.
  let authors = metaAll('citation_author');
  if (!authors.length) authors = metaAll('dc.creator');
  if (!authors.length) authors = metaAll('dc.contributor');
  if (!authors.length) authors = ldAuthors;
  if (!authors.length) authors = metaAll('author').concat(metaAll('article:author')).filter((a) => !/^https?:/.test(a));
  authors = authors.flatMap((a) => (/;/.test(a) ? a.split(/\s*;\s*/) : [a])).filter(Boolean);

  const doiRe = /\b(10\.\d{4,9}\/[^\s"'<>?#&]+)/i;
  const tidyDoi = (d) => (d || '').replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[.,;)\]]+$/, '');
  let doi = tidyDoi(meta('citation_doi', 'dc.identifier', 'prism.doi', 'bepress_citation_doi', 'dc.identifier.doi'));
  if (doi && !doiRe.test(doi)) doi = '';
  if (!doi) {
    const m = decodeURIComponent(location.href).match(doiRe);
    if (m) doi = tidyDoi(m[1]);
  }
  if (!doi) {
    // Look near the top of the article only, so we don't pick up a DOI from the reference list.
    let top = document.body ? document.body.innerText : '';
    const refs = top.search(/\n\s*(references|bibliography|works cited|literature cited)\s*\n/i);
    if (refs >= 0) top = top.slice(0, refs);
    top = top.slice(0, 4000);
    const m = top.match(/doi(?:\.org\/|:\s*)(10\.\d{4,9}\/[^\s"'<>]+)/i);
    if (m) doi = tidyDoi(m[1]);
  }

  const info = {
    url: location.href,
    pageTitle: oneLine(document.title),
    contentType: document.contentType,
    title: meta('citation_title', 'dc.title', 'og:title', 'twitter:title') || oneLine(ld && (ld.headline || ld.name)) || oneLine(document.title),
    authors,
    date: meta('citation_publication_date', 'citation_date', 'citation_online_date', 'citation_cover_date', 'dc.date', 'prism.publicationdate', 'article:published_time', 'date', 'pubdate') || (ld && (ld.datePublished || ld.dateCreated)) || '',
    journal: meta('citation_journal_title', 'citation_conference_title', 'prism.publicationname', 'citation_inbook_title'),
    volume: meta('citation_volume', 'prism.volume'),
    issue: meta('citation_issue', 'prism.number'),
    firstPage: meta('citation_firstpage', 'prism.startingpage'),
    lastPage: meta('citation_lastpage', 'prism.endingpage'),
    articleNumber: meta('citation_article_number'),
    publisher: meta('citation_publisher', 'dc.publisher') || ldName(ld && ld.publisher),
    siteName: meta('og:site_name', 'application-name') || ldName(ld && ld.publisher),
    isScholarly: !!(meta('citation_title', 'citation_journal_title', 'citation_doi') || (ld && /Scholarly/.test([].concat(ld['@type']).join(' ')))),
    pdfUrl: (() => { try { const u = meta('citation_pdf_url'); return u ? new URL(u, location.href).href : ''; } catch (e) { return ''; } })(),
    doi,
    selection: para(String(window.getSelection ? window.getSelection() : '')),
    abstract: '',
    abstractSource: '',
    conclusion: '',
  };

  // --- Headings. Real headings (h1–h6, role=heading) plus "pseudo headings": a short bold
  // paragraph such as <p><strong>Conclusion</strong></p>, which many blogs and journals use.
  const headingSel = 'h1,h2,h3,h4,h5,h6,[role="heading"],.section-title,.title';
  const isPseudoHeading = (el) => {
    if (!/^(P|DIV)$/.test(el.tagName) || el.children.length !== 1 || !/^(STRONG|B)$/.test(el.children[0].tagName)) return false;
    const t = oneLine(el.innerText);
    return t.length > 0 && t.length < 60 && t === oneLine(el.children[0].innerText);
  };
  const isHeading = (el) => !!el.matches && (el.matches(headingSel) || isPseudoHeading(el));
  const levelOf = (el) => (/^H[1-6]$/.test(el.tagName) ? +el.tagName[1] : el.getAttribute('aria-level') ? +el.getAttribute('aria-level') : isPseudoHeading(el) ? 8 : 7);
  // Parts of a page that are never the article itself.
  const offArticle = 'nav, footer, aside, [role="navigation"], [role="contentinfo"], [role="complementary"], [class*="toc" i], [id*="toc" i], [class*="similar" i], [id*="similar" i], [class*="recommend" i], [class*="related" i], [class*="sidebar" i], [class*="widget" i], [class*="citations" i]';
  const skipBlock = (el) =>
    /^(SCRIPT|STYLE|NAV|BUTTON|FIGURE|TABLE|ASIDE|NOSCRIPT|SVG|FORM|IMG)$/.test(el.tagName) ||
    el.getAttribute('role') === 'figure' ||
    /(^|[\s_-])(fig|figure|figures|graphic|table-wrap|html-fig|html-table|html-fig-wrap|html-fig_wrap|figure-caption|carousel|c-article-section__figure)([\s_-]|$)/i.test(el.className && typeof el.className === 'string' ? el.className : '');
  const stopText = /^(keywords?|key ?words|index terms|jel classification)\b/i;
  const headText = (h) => oneLine(h.innerText).replace(/[\s:.]+$/, '');

  // Text that follows a heading, until the next heading of the same or a higher level.
  function textAfter(h) {
    const level = levelOf(h);
    let node = h;
    for (let up = 0; up < 4 && node; up++) {
      const parts = [];
      let el = node.nextElementSibling;
      while (el && parts.join('\n').length < MAX) {
        if (isHeading(el) && levelOf(el) <= level) break;
        const inner = el.querySelector && el.querySelector('h1,h2,h3,h4');
        if (inner && levelOf(inner) <= level && /^(SECTION|DIV)$/.test(el.tagName) && el.innerText.trim().indexOf(inner.innerText.trim()) === 0) break;
        if (stopText.test(oneLine(el.innerText))) break;
        if (!skipBlock(el)) parts.push(blockText(el));
        el = el.nextElementSibling;
      }
      const text = para(parts.join('\n\n')).replace(/^[:.\-–—\s]+/, '');
      if (text.length > 60) return text;
      // Heading may be wrapped (e.g. <div class="header"><h2>…</h2></div>); try the wrapper.
      node = node.parentElement;
      if (!node || node === document.body || /^(ARTICLE|MAIN|FOOTER|NAV|ASIDE|HEADER|FORM)$/.test(node.tagName)) return '';
      if (node.tagName === 'SECTION') {
        const t = para(blockText(node)).replace(oneLine(h.innerText), '').replace(/^[:.\-–—\s]+/, '').trim();
        return t.length > 60 && t.length < 20000 ? t : '';
      }
    }
    return '';
  }
  // innerText of a block without figures and tables inside it.
  function blockText(el) {
    if (!el.querySelector || !el.querySelector('figure, table, [role="figure"], [class*="fig" i], [class*="table-wrap" i]')) return el.innerText || '';
    const copy = el.cloneNode(true);
    copy.querySelectorAll('figure, table, [role="figure"], [class*="figure" i], [class*="fig_" i], [class*="fig-" i], [class*="table-wrap" i]').forEach((x) => x.remove());
    // innerText needs a rendered element; textContent is the fallback for a detached copy.
    return copy.textContent.replace(/[ \t]*\n[ \t]*/g, '\n');
  }
  const visible = (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
  function headings() {
    return Array.from(document.querySelectorAll(headingSel + ',p,div'))
      .filter((h) => (h.matches(headingSel) || isPseudoHeading(h)) && !h.closest(offArticle))
      .filter((h) => { const t = headText(h); return t && t.length < 80; });
  }
  // Find a section by its heading. Visible headings win over hidden ones (e.g. in closed tabs).
  function findSection(regexes, { last = false } = {}) {
    const heads = headings();
    for (const re of regexes) {
      let matches = heads.filter((h) => re.test(headText(h)));
      if (last) matches.reverse();
      matches = [...matches.filter(visible), ...matches.filter((h) => !visible(h))];
      for (const h of matches) {
        const t = textAfter(h);
        if (t) return t;
      }
    }
    return '';
  }

  const stripLabel = (s) => s.replace(/^\s*(abstract|summary)\s*[:.\-–—]?\s*/i, '').replace(/^[:.\-–—\s]+/, '');
  const stripTags = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  // Social descriptions often wrap the abstract, e.g. ResearchGate:
  // "PDF | <abstract> | Find, read and cite all the research you need on ResearchGate"
  function cleanDescription(d) {
    let parts = d.split(/\s+\|\s+/);
    if (parts.length > 1) {
      parts = parts.filter((x) => !/^(pdf|download citation|request pdf|full[- ]text available)$/i.test(x.trim()))
        .filter((x) => !/^on .{3,40}, .+ published /i.test(x.trim()))
        .filter((x) => !/find, read and cite|researchgate|academia\.edu|semantic scholar/i.test(x));
      d = parts.sort((a, b) => b.length - a.length)[0] || '';
    }
    return d.trim();
  }
  // Abstract containers that are not the abstract itself.
  const notAbstract = /highlight|graphical|keyword|key ?points|plain ?language|lay ?summary|abstract-?link|nav|tab-?(list|button)|toggle|preview/i;

  function findAbstract() {
    let t = stripLabel(stripTags(meta('citation_abstract', 'dc.description', 'dcterms.abstract', 'eprints.abstract', 'prism.teaser')));
    if (t.length > 150 && !/\|/.test(t)) return { text: t, source: 'page metadata' };

    t = findSection([/^(\d+\.?\s*)?abstract$/i, /^(a\s?b\s?s\s?t\s?r\s?a\s?c\s?t)$/i]);
    if (t.length > 100) return { text: stripLabel(t), source: 'page' };

    const sels = ['[role="doc-abstract"]', '[itemprop="abstract"]', 'section#abstract', '#abstract', '#Abs1-content', '.abstract-text', '.abstract-content', 'div.abstract.author', 'section.abstract', 'div.abstract', '.c-article-section__content[id^="Abs"]', '.article-abstract', '.research-detail-middle-section__abstract', '[itemprop="description"]', '.ltx_abstract', '[class*="abstract" i]', '[id*="abstract" i]'];
    const tried = new Set();
    for (const sel of sels) {
      const els = Array.from(document.querySelectorAll(sel)).filter((el) => !tried.has(el));
      // Visible first, so an open abstract beats one in a hidden tab.
      for (const el of [...els.filter(visible), ...els.filter((x) => !visible(x))]) {
        tried.add(el);
        if (/^(A|BUTTON|META|SCRIPT|LI|INPUT|LINK|IMG|SPAN)$/.test(el.tagName) && sel.includes('*')) continue;
        if (el.closest(offArticle)) continue;
        if (notAbstract.test(`${el.id} ${typeof el.className === 'string' ? el.className : ''}`)) continue;
        const firstHead = el.querySelector(headingSel);
        if (firstHead && notAbstract.test(headText(firstHead))) continue;
        t = stripLabel(para(blockText(el)));
        t = t.split(/\n\s*(keywords?|key ?words|index terms)\b/i)[0].trim();
        if (t.length > 150 && t.length < 12000) return { text: t, source: 'page' };
      }
    }

    t = findSection([/^(summary|executive summary)$/i]);
    if (t.length > 100) return { text: t, source: 'page' };
    if (ld && typeof ld.abstract === 'string' && ld.abstract.length > 100) return { text: para(stripTags(ld.abstract)), source: 'page metadata' };
    if (ld && /Scholarly/.test([].concat(ld['@type']).join(' ')) && typeof ld.description === 'string' && ld.description.length > 150) return { text: para(stripTags(ld.description)), source: 'page metadata' };

    const d = cleanDescription(meta('description', 'og:description', 'twitter:description') || (ld && typeof ld.description === 'string' ? ld.description : ''));
    if (d && d.length > 60) return { text: d, source: 'page description (not a formal abstract)' };
    return { text: '', source: '' };
  }

  const n = '^([0-9IVX]+(\\.\\d+)*\\s*[.)|]?\\s*)*';
  function findConclusion(abstract) {
    const t = findSection([
      new RegExp(n + '(conclusions?|concluding remarks|concluding thoughts|final remarks|final thoughts|in conclusion)$', 'i'),
      new RegExp(n + '(conclusions?|summary)\\s*(and|&)\\s*.{0,40}$', 'i'),
      new RegExp(n + '(discussion\\s*(and|&)\\s*conclusions?|summary and discussion|implications)$', 'i'),
      new RegExp(n + '(summary|the bottom line|bottom line|key takeaways|takeaways|wrapping up)$', 'i'),
    ], { last: true });
    if (t) return t;
    // Structured abstract ("Background: … Conclusions: …"), common on PubMed.
    const m = /(?:^|\n|\.\s)\s*conclusions?\s*:\s*([\s\S]+?)(?=\n\s*[A-Z][A-Za-z ]{2,30}:\s|$)/i.exec(abstract || '');
    return m ? para(m[1]) : '';
  }

  function run() {
    const a = findAbstract();
    return { abstract: cut(a.text), abstractSource: a.source, conclusion: cut(findConclusion(a.text)) };
  }

  // Pages built by scripts may still be filling in the article. If little was found and the
  // page is still changing or nearly empty, wait for it to settle (at most 2.5 s) and try again.
  let found = run();
  const bodyLen = () => (document.body ? document.body.innerText.length : 0);
  if ((!found.conclusion && !/^page/.test(found.abstractSource) || !found.abstract) && (bodyLen() < 2000 || document.readyState !== 'complete')) {
    await new Promise((resolve) => {
      let timer = setTimeout(done, 700);
      const stop = setTimeout(done, 2500);
      const obs = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(done, 500); });
      obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      function done() { obs.disconnect(); clearTimeout(timer); clearTimeout(stop); resolve(); }
    });
    const again = run();
    if ((again.abstract && !found.abstract) || (again.conclusion && !found.conclusion) || again.abstractSource === 'page') found = again;
    info.title = meta('citation_title', 'dc.title', 'og:title', 'twitter:title') || oneLine(document.title) || info.title;
  }
  Object.assign(info, found);
  return info;
}

// ---------------------------------------------------------------------------
// Crossref lookup (free, no key). Fills in missing reference details.
// ---------------------------------------------------------------------------
export async function lookupCrossref(doi) {
  if (!doi) return null;
  return (await crossrefWork(doi)) || (await lookupDataCite(doi));
}

async function crossrefWork(doi) {
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=lilotech@example.com`);
    if (!res.ok) return null;
    const m = (await res.json()).message;
    const strip = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const dp = ((m.issued || m.published || m['published-print'] || m['published-online'] || {})['date-parts'] || [[]])[0] || [];
    return {
      title: strip((m.title || [])[0]),
      authors: (m.author || []).map((a) => (a.family ? { family: a.family, given: a.given || '' } : { literal: a.name || '' })).filter((a) => a.family || a.literal),
      year: dp[0] ? String(dp[0]) : '',
      month: dp[1] || '',
      day: dp[2] || '',
      journal: strip((m['container-title'] || [])[0]),
      volume: m.volume || '',
      issue: m.issue || '',
      pages: (m.page || '').replace(/-/g, '–'),
      articleNumber: m['article-number'] || '',
      publisher: m.publisher || '',
      type: m.type || '',
      doi: m.DOI || doi,
      abstract: strip((m.abstract || '').replace(/<jats:title>[^<]*<\/jats:title>/gi, '')),
    };
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Turning raw page data into a reference object.
// ---------------------------------------------------------------------------
export function parseName(s) {
  s = (s || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.includes(',')) {
    const [family, ...rest] = s.split(',');
    return { family: family.trim(), given: rest.join(' ').trim() };
  }
  // Organisations ("World Health Organization") stay whole.
  if (/\b(organi[sz]ation|association|institute|university|council|agency|department|society|group|team|staff|news|press|foundation|committee|ministry|office)\b/i.test(s)) return { literal: s };
  const parts = s.split(' ');
  if (parts.length === 1) return { literal: s };
  let i = parts.length - 1;
  // Keep particles with the surname: "van der Berg", "de la Cruz".
  while (i > 1 && /^(van|von|der|den|de|del|della|da|di|la|le|du|dos|das|bin|al|el|ten|ter)$/i.test(parts[i - 1])) i--;
  return { family: parts.slice(i).join(' '), given: parts.slice(0, i).join(' ') };
}

function parseDate(s) {
  if (!s) return {};
  s = String(s).trim();
  let m = s.match(/^(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?/);
  if (m) return { year: m[1], month: m[2] ? +m[2] : '', day: m[3] ? +m[3] : '' };
  const d = new Date(s);
  if (!isNaN(d)) return { year: String(d.getFullYear()), month: d.getMonth() + 1, day: d.getDate() };
  m = s.match(/\b(19|20)\d{2}\b/);
  return m ? { year: m[0] } : {};
}

export function buildReference(page, cr) {
  const date = parseDate(page.date);
  const pages = page.firstPage ? (page.lastPage && page.lastPage !== page.firstPage ? `${page.firstPage}–${page.lastPage}` : page.firstPage) : '';
  const ref = {
    type: page.isScholarly || page.journal || page.doi ? 'article' : 'webpage',
    authors: (page.authors || []).map(parseName).filter(Boolean),
    year: date.year || '',
    month: date.month || '',
    day: date.day || '',
    title: page.title || page.pageTitle || '',
    journal: page.journal || '',
    volume: page.volume || '',
    issue: page.issue || '',
    pages,
    articleNumber: page.articleNumber || '',
    publisher: page.publisher || '',
    siteName: page.siteName || '',
    doi: page.doi || '',
    url: page.url || '',
  };
  if (cr) {
    // Crossref is the more reliable source for bibliographic fields.
    for (const k of ['title', 'year', 'journal', 'volume', 'issue', 'pages', 'articleNumber', 'publisher', 'doi']) if (cr[k]) ref[k] = cr[k];
    if (cr.year) { ref.month = cr.month || ''; ref.day = cr.day || ''; }
    if (cr.authors && cr.authors.length) ref.authors = cr.authors;
    if (/book-chapter|book|monograph|edited-book/.test(cr.type)) ref.type = cr.type === 'book-chapter' ? 'chapter' : 'book';
    else if (/journal-article|proceedings-article|posted-content|report/.test(cr.type) || ref.journal) ref.type = 'article';
  }
  ref.authors = dedupeAuthors(ref.authors);
  return ref;
}

function dedupeAuthors(list) {
  const seen = new Set();
  return list.filter((a) => {
    const k = (a.literal || `${a.family}|${a.given}`).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------
// APA 7 formatting. Returns { text, html } (html has the italics).
// ---------------------------------------------------------------------------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const escapeHtml = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function initials(given) {
  return given
    .replace(/\./g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.split('-').map((p) => (p ? p[0].toUpperCase() + '.' : '')).join('-'))
    .join(' ');
}

function formatAuthor(a) {
  if (a.literal) return a.literal;
  const i = initials(a.given || '');
  return i ? `${a.family}, ${i}` : a.family;
}

export function formatAuthors(authors) {
  const list = authors.map(formatAuthor);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]}, & ${list[1]}`;
  if (list.length <= 20) return `${list.slice(0, -1).join(', ')}, & ${list[list.length - 1]}`;
  return `${list.slice(0, 19).join(', ')}, . . . ${list[list.length - 1]}`;
}

const endWithPeriod = (s) => (/[.?!]$/.test(s) ? s : s + '.');

export function formatAPA(ref) {
  const T = [];
  const H = [];
  const add = (text, html = escapeHtml(text)) => { T.push(text); H.push(html); };
  const ital = (s) => `<i>${escapeHtml(s)}</i>`;

  const authors = formatAuthors(ref.authors || []);
  let date = ref.year || 'n.d.';
  if (ref.year && ref.type === 'webpage' && ref.month) date += `, ${MONTHS[ref.month - 1]}${ref.day ? ' ' + ref.day : ''}`;
  const title = (ref.title || 'Untitled').trim();
  const italicTitle = ref.type !== 'article' && ref.type !== 'chapter';

  // Author part (APA: with no author, the title moves to the author position).
  if (authors) {
    add(endWithPeriod(authors));
    add(` (${date}).`);
    add(' ' + endWithPeriod(title), ' ' + (italicTitle ? ital(endWithPeriod(title)) : escapeHtml(endWithPeriod(title))));
  } else {
    add(endWithPeriod(title), italicTitle ? ital(endWithPeriod(title)) : escapeHtml(endWithPeriod(title)));
    add(` (${date}).`);
  }

  if (ref.type === 'article' && ref.journal) {
    add(' ' + ref.journal, ' ' + ital(ref.journal));
    if (ref.volume) {
      add(', ' + ref.volume, ', ' + ital(ref.volume));
      if (ref.issue) add(`(${ref.issue})`);
    }
    const loc = ref.pages || (ref.articleNumber ? `Article ${ref.articleNumber}` : '');
    if (loc) add(', ' + loc);
    add('.');
  } else if (ref.type === 'book' || ref.type === 'chapter') {
    if (ref.type === 'chapter' && ref.journal) add(' In ' + ref.journal + (ref.pages ? ` (pp. ${ref.pages})` : '') + '.', ' In ' + ital(ref.journal) + (ref.pages ? ` (pp. ${escapeHtml(ref.pages)})` : '') + '.');
    if (ref.publisher) add(' ' + endWithPeriod(ref.publisher));
  } else {
    // Web page: site name, unless it's the same as the author.
    const site = ref.siteName || ref.publisher;
    if (site && site !== authors && site !== title) add(' ' + endWithPeriod(site));
  }

  if (ref.doi) add(` https://doi.org/${ref.doi}`, ` https://doi.org/${escapeHtml(ref.doi)}`);
  else if (ref.url) add(' ' + ref.url, ' ' + escapeHtml(ref.url));

  return { text: T.join(''), html: H.join('') };
}

// In-text citation, e.g. (Smith & Jones, 2020) or (Smith et al., 2020).
export function formatInText(ref) {
  const a = ref.authors || [];
  const name = (x) => x.literal || x.family;
  let who;
  if (!a.length) who = `"${(ref.title || 'Untitled').split(/\s+/).slice(0, 4).join(' ')}"`;
  else if (a.length === 1) who = name(a[0]);
  else if (a.length === 2) who = `${name(a[0])} & ${name(a[1])}`;
  else who = `${name(a[0])} et al.`;
  return `(${who}, ${ref.year || 'n.d.'})`;
}

// ---------------------------------------------------------------------------
// Grab everything for a tab: run the extractor, then look up Crossref.
// ---------------------------------------------------------------------------
export async function capture(tab) {
  let page;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage });
    page = res && res.result;
  } catch (e) {
    page = null;
  }
  if (!page) {
    // Pages Chrome won't let extensions read (PDF viewer, chrome:// pages, Web Store).
    const m = decodeURIComponent(tab.url || '').match(/\b(10\.\d{4,9}\/[^\s"'<>?#&]+?)(\.pdf)?$/i);
    page = { url: tab.url, pageTitle: tab.title, title: tab.title, authors: [], doi: m ? m[1] : '', abstract: '', conclusion: '', selection: '', limited: true };
  }
  // PDFs are read separately with pdf.js (see pdfread.js), which only runs in the popup or library.
  const pdf = page.contentType === 'application/pdf' || (page.limited && /\.pdf($|[?#])/i.test(tab.url || ''));
  if (pdf) return { pdf: true, page };
  return finishCapture(page);
}

// Look the source up online and build the reference from the page data.
export async function finishCapture(page) {
  let cr = await lookupCrossref(page.doi);
  if (!cr && !page.doi && page.title) {
    cr = await searchCrossrefByTitle(page.title, page.authors && page.authors[0]);
    if (cr) page.doi = cr.doi;
  }
  const ref = buildReference(page, cr);
  let abstract = page.abstract;
  let abstractSource = page.abstractSource;
  // Crossref's abstract is cleaner than one pulled from PDF text.
  if (cr && cr.abstract && (!abstract || page.isPdf || /not a formal/.test(abstractSource || ''))) {
    abstract = cr.abstract;
    abstractSource = 'Crossref';
  }
  return { page, ref, abstract: abstract || '', abstractSource: abstractSource || '', conclusion: page.conclusion || '', selection: page.selection || '' };
}

// ---------------------------------------------------------------------------
// Storage. Each saved item lives in chrome.storage.local under "items".
// ---------------------------------------------------------------------------
export async function getItems() {
  const { items } = await chrome.storage.local.get('items');
  return items || [];
}

export async function setItems(items) {
  await chrome.storage.local.set({ items });
}

const normUrl = (u) => (u || '').replace(/#.*$/, '').replace(/\/$/, '');

export function findExisting(items, ref) {
  const title = (ref.title || '').toLowerCase();
  return items.find((it) =>
    (ref.doi && it.ref.doi && it.ref.doi.toLowerCase() === ref.doi.toLowerCase()) ||
    (ref.url && normUrl(it.ref.url) === normUrl(ref.url)) ||
    // Local PDFs have no web address, so match those by title.
    (!ref.url && !ref.doi && !it.ref.url && title && (it.ref.title || '').toLowerCase() === title));
}

// Save or update an item. `fields` can hold abstract, conclusion, note, snippet.
export async function saveItem(ref, fields = {}) {
  const items = await getItems();
  let item = findExisting(items, ref);
  const apa = formatAPA(ref);
  if (!item) {
    item = { id: crypto.randomUUID(), savedAt: new Date().toISOString(), snippets: [], note: '', abstract: '', conclusion: '' };
    items.unshift(item);
  }
  item.ref = ref;
  item.apa = item.apaEdited ? item.apa : apa.text;
  item.apaHtml = item.apaEdited ? item.apaHtml : apa.html;
  item.inText = formatInText(ref);
  item.updatedAt = new Date().toISOString();
  for (const k of ['abstract', 'abstractSource', 'conclusion', 'note']) if (fields[k] !== undefined) item[k] = fields[k];
  if (fields.snippet && !item.snippets.some((s) => s.text === fields.snippet)) item.snippets.push({ text: fields.snippet, savedAt: new Date().toISOString() });
  await setItems(items);
  return item;
}

// ---------------------------------------------------------------------------
// Clipboard: copy with italics (for Word/Google Docs) plus a plain-text fallback.
// ---------------------------------------------------------------------------
export async function copyRich(text, html) {
  try {
    if (html && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })]);
      return true;
    }
  } catch (e) { /* fall through */ }
  await navigator.clipboard.writeText(text);
  return true;
}

export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), Math.max(1800, msg.length * 45));
}

// ---------------------------------------------------------------------------
// DataCite holds DOIs that Crossref doesn't, such as arXiv preprints and datasets.
// ---------------------------------------------------------------------------
async function lookupDataCite(doi) {
  try {
    const res = await fetch(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`);
    if (!res.ok) return null;
    const a = (await res.json()).data.attributes;
    const abs = (a.descriptions || []).find((d) => d.descriptionType === 'Abstract');
    const container = a.container && a.container.title;
    return {
      title: ((a.titles || [])[0] || {}).title || '',
      authors: (a.creators || []).map((c) => (c.familyName ? { family: c.familyName, given: c.givenName || '' } : { literal: c.name || '' })).filter((x) => x.family || x.literal),
      year: a.publicationYear ? String(a.publicationYear) : '',
      month: '',
      day: '',
      journal: container || '',
      volume: '',
      issue: '',
      pages: '',
      articleNumber: '',
      publisher: typeof a.publisher === 'string' ? a.publisher : (a.publisher && a.publisher.name) || '',
      type: /Text|Preprint|JournalArticle/i.test((a.types || {}).resourceTypeGeneral || '') ? 'posted-content' : (a.types || {}).resourceTypeGeneral || '',
      doi: a.doi || doi,
      abstract: abs ? abs.description.replace(/\s+/g, ' ').trim() : '',
    };
  } catch (e) {
    return null;
  }
}

// Find a paper on Crossref from its title, for PDFs that don't print their DOI.
// Only accepts a result whose title clearly matches, so we never attach the wrong paper.
export async function searchCrossrefByTitle(title, author) {
  const words = (s) => (s || '').toLowerCase().replace(/<[^>]+>/g, ' ').match(/[a-z0-9]+/g) || [];
  const want = words(title);
  if (want.length < 3) return null;
  try {
    const q = encodeURIComponent(title + (author ? ' ' + author : ''));
    const res = await fetch(`https://api.crossref.org/works?query.bibliographic=${q}&rows=3&select=DOI,title&mailto=lilotech@example.com`);
    if (!res.ok) return null;
    for (const w of (await res.json()).message.items || []) {
      const got = words((w.title || [])[0]);
      const a = new Set(want);
      const b = new Set(got);
      const shared = [...a].filter((x) => b.has(x)).length;
      if (shared / Math.max(a.size, b.size) >= 0.85) return crossrefWork(w.DOI);
    }
  } catch (e) { /* offline or blocked */ }
  return null;
}
