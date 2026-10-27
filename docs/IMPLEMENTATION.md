# How Lilotech is built

This document explains how Lilotech works inside: the files, the data flow, how each feature is implemented, and how to build, test and extend it. For installing and using the extension, see the [README](../README.md).

## Contents

1. [Overview](#1-overview)
2. [Technology choices](#2-technology-choices)
3. [Project structure](#3-project-structure)
4. [Architecture](#4-architecture)
5. [Reading a web page](#5-reading-a-web-page)
6. [Reading a PDF](#6-reading-a-pdf)
7. [Looking up the reference online](#7-looking-up-the-reference-online)
8. [Building the reference object](#8-building-the-reference-object)
9. [APA 7 formatting](#9-apa-7-formatting)
10. [Saving: storage and data model](#10-saving-storage-and-data-model)
11. [The popup](#11-the-popup)
12. [Right-click menus (background service worker)](#12-right-click-menus-background-service-worker)
13. [The library page](#13-the-library-page)
14. [Permissions and privacy](#14-permissions-and-privacy)
15. [Implementing it from scratch, step by step](#15-implementing-it-from-scratch-step-by-step)
16. [Running and debugging](#16-running-and-debugging)
17. [Testing](#17-testing)
18. [Packaging and releasing](#18-packaging-and-releasing)
19. [Known limitations and ideas](#19-known-limitations-and-ideas)

---

## 1. Overview

Lilotech is a Chrome extension for research reading. On any article, paper or PDF it:

1. reads the page or PDF to find the title, authors, date, journal, DOI, abstract and conclusion;
2. looks the DOI up in Crossref (or DataCite) to get clean bibliographic data;
3. formats an **APA 7** reference and an in-text citation;
4. saves everything, plus highlights and notes, to a local library;
5. lets you search, edit, copy and export that library (Word, Markdown, CSV, JSON backup).

## 2. Technology choices

| Choice | Why |
|---|---|
| **Chrome Manifest V3** | The current, required extension format for Chrome. |
| **Plain JavaScript (ES modules), HTML and CSS** | No build step, no `npm install`. The folder you edit is the folder Chrome loads. |
| **`chrome.storage.local`** with `unlimitedStorage` | Data stays on the user's computer, survives browser restarts, and has no size cap. |
| **`activeTab` + `scripting`** | The extension can read only the tab the user clicks on, so it does not need access to all websites. |
| **Crossref and DataCite REST APIs** | Free, no API key, authoritative metadata for DOIs. |
| **pdf.js 4.10.38** (Mozilla, Apache-2.0) | Reliable PDF text extraction that runs inside the extension. |

## 3. Project structure

```
lilotech/
├── manifest.json        Extension settings: name, permissions, popup, service worker
├── background.js        Service worker: right-click menus and saving from them
├── lib.js               Shared logic: page extraction, lookups, APA 7, storage, settings, links, clipboard
├── styles.js            Citation styles: MLA, Chicago, Harvard, IEEE, Vancouver, BibTeX, RIS
├── pdfread.js           PDF reading with pdf.js (used by popup and library)
├── addlink.js           Saving a paper from a link, DOI or arXiv ID (used by the library)
├── chips.js             Section chips shared by the popup and library
├── logo.js              The animated logo (inline SVG)
├── popup.html / .js     The window that opens when you click the toolbar icon
├── library.html / .js   The full-page library (search, edit, export)
├── style.css            Shared styles, light and dark mode
├── icons/               Toolbar and store icons (16, 32, 48, 128 px)
├── vendor/pdfjs/        pdf.min.mjs, pdf.worker.min.mjs, LICENSE, VERSION
├── docs/                This document
├── tests/               Automated tests and sample pages (not needed by Chrome)
├── package.json         Test setup (npm test)
└── README.md            Install and usage guide
```

## 4. Architecture

```
            ┌──────────────── Web page / PDF tab ────────────────┐
            │   extractPage() injected with chrome.scripting      │
            │   or the PDF bytes fetched for pdf.js               │
            └───────────────▲───────────────────────┬────────────┘
                            │ inject                 │ page data
┌──────────────┐     ┌──────┴───────┐         ┌──────▼─────────┐
│ Right-click  │────▶│ background.js│         │   popup.js     │◀── toolbar click
│ menus        │     │ (service     │         │ (+ pdfread.js) │
└──────────────┘     │  worker)     │         └──────┬─────────┘
                     └──────┬───────┘                │
                            │      lib.js: capture → finishCapture
                            │      → Crossref / DataCite → buildReference
                            │      → formatAPA → saveItem
                            ▼                        ▼
                     ┌─────────────────────────────────────┐
                     │      chrome.storage.local "items"    │
                     └─────────────────▲───────────────────┘
                                       │ read / write / onChanged
                               ┌───────┴────────┐
                               │  library.js    │ search, edit, export, Add a PDF
                               └────────────────┘
```

Everything goes through `lib.js`, so the popup, the right-click menus and the library all behave the same way.

The main pipeline is:

```
capture(tab)
  ├─ web page → extractPage() in the tab → finishCapture(page)
  └─ PDF      → { pdf: true } → popup: fetchTabPdf(tab) → readPdf(bytes) → finishCapture(page)

finishCapture(page)
  → lookupCrossref(doi)           (falls back to DataCite)
  → searchCrossrefByTitle(title)  (only when no DOI was found)
  → buildReference(page, lookup)
  → returns { page, ref, abstract, abstractSource, conclusion, selection }

saveItem(ref, fields) → formatAPA(ref) + formatInText(ref) → chrome.storage.local

readLink(text)                    (library: "Add paper")
  → parseLink(text)               DOI, arXiv, PDF link or web address
  → background tab → extractPage() → finishCapture(page)   or   PDF → capturePdf(bytes)
  → DOI only: finishCapture({ doi })
  → missing conclusion: readPdf(the paper's PDF)

cite(item, style, n) → the reference in any style, built from item.ref when it is shown or exported
```

## 5. Reading a web page

`extractPage()` in `lib.js` is injected into the tab with `chrome.scripting.executeScript({ func: extractPage })`. Because Chrome serialises the function and runs it inside the page, **it must not use anything defined outside itself**. All of its helpers are declared inside it.

The function is `async`. If it finds little and the page is short or still loading, which is typical of journal sites built as single-page apps, it watches the page with a `MutationObserver`. Once the page stops changing for 0.5 s, or after 2.5 s at most, it tries again.

### 5.1 Metadata sources, in priority order

| Field | Sources tried |
|---|---|
| Title | `citation_title`, `dc.title`, `og:title`, `twitter:title`, JSON-LD `headline`/`name`, `document.title` |
| Authors | every `citation_author`, then `dc.creator`, `dc.contributor`, JSON-LD `author`, `author` / `article:author` meta |
| Date | `citation_publication_date`, `citation_date`, `citation_online_date`, `dc.date`, `prism.publicationdate`, `article:published_time`, JSON-LD `datePublished` |
| Journal | `citation_journal_title`, `citation_conference_title`, `prism.publicationname` |
| Volume / issue / pages | `citation_volume`, `citation_issue`, `citation_firstpage`, `citation_lastpage`, `citation_article_number` |
| DOI | `citation_doi`, `dc.identifier`, `prism.doi`, then the URL, then the top of the page text |
| Site name | `og:site_name`, JSON-LD `publisher` |

`citation_*` tags (Highwire Press / Google Scholar format) are used by almost every journal, which is why journal pages give the best results. Meta tags are matched case-insensitively with `meta[name="x" i]`.

**JSON-LD.** The function parses every `<script type="application/ld+json">`, walks arrays and `@graph`, and keeps the first object whose `@type` is an article type (`ScholarlyArticle`, `NewsArticle`, `BlogPosting` and similar). News sites and blogs usually provide this.

**DOI safety.** When the DOI is searched in the page text, only the text **before** a "References" or "Bibliography" heading is used, and only the first 4,000 characters of it. This prevents picking up the DOI of a cited paper.

### 5.2 Finding the abstract

Tried in this order, stopping at the first success:

1. **Meta tags** `citation_abstract`, `dc.description`, `dcterms.abstract`. These are used only if they're longer than 150 characters, and HTML tags are stripped.
2. **An "Abstract" heading**, followed by its section text (see 5.4).
   - This comes before the container search because many sites put other blocks in abstract-like containers first: ScienceDirect's *Highlights* and *Graphical abstract*, Wiley's *Plain Language Summary* and *Key Points*, IEEE's "Published in" details.
   - Collection stops at a "Keywords" or "Index terms" line.
3. **Common abstract containers**, visible ones first.
   - Examples: `[role="doc-abstract"]`, `[itemprop="abstract"]`, `#abstract`, `#Abs1-content`, `.abstract-text`, `div.abstract.author`, `section.abstract`, ResearchGate's `[itemprop="description"]`, arXiv's `.ltx_abstract`, then any `[class*="abstract" i]`.
   - Containers whose class, id or first heading mention *highlights*, *graphical*, *keywords*, *key points* or *plain language* are skipped.
   - Figures and tables inside are removed.
4. A **"Summary"** heading, then JSON-LD `abstract` (or `description` on a `ScholarlyArticle`).
5. As a last resort, the page's `description` / `og:description`, marked as *"page description (not a formal abstract)"*.
   - Social-media wrappers are removed first. ResearchGate's `PDF | <abstract> | Find, read and cite all the research you need on ResearchGate` becomes just the abstract.

The popup then fills in what's still missing from the paper's PDF (see 6.6).

### 5.3 Finding the conclusion

The conclusion is found by heading text, using several patterns in order of confidence:

1. `Conclusion(s)`, `Concluding remarks`, `Final thoughts`, `In conclusion`
2. `Conclusions and future work`, `Summary and …`
3. `Discussion and conclusions`, `Implications`
4. `Summary`, `The bottom line`, `Key takeaways`

Headings may carry numbering (`5.`, `5.1`, `IV.`, `5 |`) and a trailing colon (`Conclusion:`).

- The **last** matching heading on the page is preferred, because conclusions come at the end. On PMC, for example, this picks the body's "Conclusions" over the "Conclusions" sub-heading inside a structured abstract.
- Visible headings win over hidden ones, but hidden ones (closed tabs) are still used when nothing visible matches.
- If no heading is found, a **structured abstract** is checked for a `Conclusions:` part. This is common on PubMed, which shows no full text.

### 5.4 Collecting a section's text

`textAfter(heading)`:

- walks the heading's next siblings and collects their text until it reaches a heading of the same or a higher level, or a "Keywords" line;
- skips `script`, `style`, `nav`, `button`, `figure`, `table` and `aside`, plus figure blocks marked by class (Springer's `c-article-section__figure`, MDPI's `html-fig-wrap`, ResearchGate's figure carousel). Figures nested inside a block are removed from a copy before its text is read;
- if the heading is wrapped in its own `<div>` with no siblings, it moves up one parent and tries again (up to 4 levels), and accepts a whole `<section>` as the container;
- never climbs into `body`, `main`, `article`, `footer`, `nav` or `header`, so it can't return the whole page.

**Pseudo-headings.** Many blogs (Medium, Substack) and some journals (Taylor & Francis) mark headings with a short bold paragraph, `<p><strong>Conclusion</strong></p>`, instead of `<h2>`. These count as headings of the lowest level.

**Ignored areas.** Headings are ignored inside `nav`, `footer`, `aside`, tables of contents, sidebars and widgets, and "similar", "recommended", "related" and "citations" lists. So neither a "Summary" widget in a blog sidebar nor a "Conclusions" link in a table of contents is ever picked up.

Results are capped at 8,000 characters.

### 5.5 Highlighted text

`window.getSelection()` is read at the same time, so a highlight keeps its paragraph breaks (the context-menu `selectionText` loses them).

## 6. Reading a PDF

PDF code lives in `pdfread.js`. It runs only in **extension pages** (popup and library), because pdf.js needs a Web Worker, which a Manifest V3 service worker can't start.

### 6.1 Loading pdf.js

```js
import * as pdfjsLib from './vendor/pdfjs/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdfjs/pdf.worker.min.mjs');
pdfjsLib.getDocument({ data, isEvalSupported: false, disableFontFace: true })
```

`isEvalSupported: false` is required by the extension's Content Security Policy.

### 6.2 Detecting a PDF tab

`extractPage()` also returns `document.contentType`. `capture()` treats the tab as a PDF when that is `application/pdf`, or when the page could not be read and the URL ends in `.pdf`. In that case it returns `{ pdf: true }` instead of a reference.

### 6.3 Getting the PDF bytes (`fetchTabPdf`)

Three ways are tried, in order:

1. **From inside the tab.** A function injected into the tab runs `fetch(url, { credentials: 'include' })`, converts the bytes to base64 and returns them. Because the request comes from the same site, it works for paywalled PDFs the user is signed in to see.
2. **Directly from the popup**, which works when the extension already has access to that site.
3. **Asking for permission.** The popup shows an **Allow** button that calls `chrome.permissions.request({ origins: ['https://site/*'] })` for that one site (declared under `optional_host_permissions`), then tries again.

`fetchTabPdf(tab, url)` fetches the PDF open in the tab by default, or any other PDF URL, such as the paper's PDF linked from the page (see 6.6). Every result is checked for the `%PDF` signature before use. PDFs on the computer (`file://`) are added with **Add a PDF** in the library instead, which reads the file with `File.arrayBuffer()`.

### 6.4 Turning PDF text into lines

pdf.js returns text items with positions. `pageLines()` rebuilds readable lines:

- a new line starts when the vertical position changes by more than half the font height;
- a blank line (paragraph break) is inserted after a vertical gap of more than 1.9 line heights, or when the text jumps back up the page (the start of a new column);
- a space is added between items on the same line when there is a horizontal gap.

`joinLines()` then removes end-of-line hyphenation (`memo-\nry` becomes `memory`) and joins lines inside a paragraph.

**Running headers and footers** are removed by `dropRunningLines()`. A line is removed when it sits in the top or bottom 10% of a page and its text, with numbers ignored, appears on at least two pages. Lone page numbers there are removed too. Without this, a journal header such as "Science of the Total Environment 912 (2024) 169001" ends up in the middle of a conclusion that crosses a page break.

### 6.5 What is extracted

Only the first 60 pages are read.

| Field | Method |
|---|---|
| **DOI** | XMP `prism:doi` / `dc:identifier`, PDF info fields, then the text of pages 1–2 up to any "References" heading, then the URL |
| **Title** | The PDF's `Title` field, unless it looks like junk ("Microsoft Word - final.docx", "untitled", a file name). Otherwise `guessTitle()` takes the largest text on page 1 that isn't the journal masthead. A masthead is text that also appears in a running header, sits next to "journal homepage" or "Contents lists available", or says "Original article" or similar |
| **Authors** | The PDF's `Author` field, split on `;`, `and` and `&`. Usually replaced by Crossref |
| **Year** | A printed year on page 1–3 ("© 2022", "Published: 3 May 2022"). The file's creation date is **not** used, because it is often the download date |
| **Abstract** | Text after an "Abstract" label, including `Abstract—We…` (IEEE), `Abstract We…` (Springer) and letter-spaced `A B S T R A C T` (Elsevier). It stops at Keywords, Index Terms, a stand-alone "Introduction" or "1 Background" heading, ©, "Received …", or a DOI link. "Background:" *inside* a structured abstract does not stop it. Capped at 4,000 characters, cut at a paragraph break |
| **Conclusion** | Text after the **last** "Conclusion(s)" heading, numbered in any style (`5.`, `VI.`, `5 \|`). It stops at References, Acknowledgements, Funding, CRediT, Declarations, Ethics, Appendix, Data availability or similar. Falls back to a `Conclusions:` part of a structured abstract |

### 6.6 Filling gaps from the paper's PDF

Many pages show only the abstract: ResearchGate, arXiv abstract pages, repositories and PubMed-style landing pages. When the page has a `citation_pdf_url`, the popup does this after showing the form:

1. It shows "Looking in the paper's PDF…" and fetches the PDF with `fetchTabPdf(tab, pdfUrl)`. This happens from inside the tab, so the user's login applies.
2. It reads the PDF with `readPdf()`.
3. It fills the conclusion, and the abstract when it was empty or only a page description, but only into boxes that are still empty. Nothing the user typed is replaced.
4. It reports what was found.

There is a 30-second time limit. The right-click menus don't do this, because pdf.js can't run in the service worker.

## 7. Looking up the reference online

`finishCapture(page)` in `lib.js` improves the extracted data:

1. **Crossref** `GET https://api.crossref.org/works/{doi}` gives the title, authors (`given`/`family`), issued date, journal, volume, issue, pages, article number, publisher, type and abstract (JATS XML, stripped to text).
2. **DataCite** `GET https://api.datacite.org/dois/{doi}`, if Crossref doesn't know the DOI. This covers arXiv preprints (`10.48550/arXiv.…`), datasets and some repositories.
3. **Title search** `GET https://api.crossref.org/works?query.bibliographic={title}&rows=3`, only when no DOI was found. A result is accepted only if at least **85% of the title words match**, so the wrong paper is never attached.

All lookups fail silently. If they're offline or blocked, the reference is built from the page data alone. Crossref's abstract replaces the page's abstract when the page had none, when the page only had a description, or when the source is a PDF (Crossref text is cleaner).

## 8. Building the reference object

`buildReference(page, lookup)` returns one normalised object:

```js
{
  type: 'article' | 'webpage' | 'book' | 'chapter',
  authors: [{ family: 'Smith', given: 'John Andrew' } | { literal: 'World Health Organization' }],
  year: '2021', month: 3, day: 15,
  title, journal, volume, issue, pages, articleNumber,
  publisher, siteName, doi, url
}
```

- **Type.** It is `article` when the page has scholarly metadata, a journal or a DOI, and otherwise `webpage`. Crossref's `type` can override it to `book` or `chapter`.
- **Names (`parseName`).**
  - "Smith, John" becomes family "Smith", given "John".
  - "John Smith" splits on the last word, keeping particles: "Marie de la Cruz" becomes family "de la Cruz".
  - Names containing *Organization, Institute, University, Agency* and similar are kept whole as group authors.
- **Dates (`parseDate`)** accept `2021/03/15`, `2021-03`, ISO timestamps and free text.
- **Merging.** Lookup values win over page values. Duplicate authors are removed.

## 9. APA 7 formatting

`formatAPA(ref)` returns `{ text, html }`. The HTML version has `<i>` for italics, which is used when copying into Word or Google Docs.

### 9.1 Authors (`formatAuthors`)

| Count | Format |
|---|---|
| 1 | `Smith, J. A.` |
| 2 | `Smith, J. A., & Lee, K.` |
| 3–20 | `A, B, C, …, & T` (all listed, `&` before the last) |
| 21+ | the first 19, then `. . .`, then the last author |

Initials keep hyphens: "Marie-Claire" becomes "M.-C.". Group authors are written in full.

### 9.2 Patterns

| Type | Pattern |
|---|---|
| Journal article | Author. (Year). Title. *Journal*, *Volume*(Issue), pages. https://doi.org/… |
| Article number | …, *Volume*(Issue), Article e12345. … |
| Preprint or no journal | Author. (Year). Title. Site or publisher. https://doi.org/… |
| Web page | Author. (Year, Month Day). *Title*. Site Name. URL |
| Book | Author. (Year). *Title*. Publisher. |
| No author | Title moves to the author position: Title. (Year). … |
| No date | (n.d.) |

- The site name is left out when it's the same as the author.
- A DOI always replaces the URL.
- Page ranges use an en dash (`45–67`).

### 9.3 In-text citation (`formatInText`)

`(Smith, 2021)`, `(Smith & Lee, 2021)`, `(Smith et al., 2021)`. With no author, the first words of the title in quotes are used.

### 9.4 Other citation styles (`styles.js`)

APA stays in `lib.js`, because the saved `apa` text is used for search and duplicates. Every other style is built on demand from the same reference object, so changing the style never changes what is stored.

`STYLES` maps a key to `{ label, format(ref, n, item), inText(ref, n), sort, code }`:

| Key | Style | Reference list order | Example |
|---|---|---|---|
| `apa` | APA 7 | A–Z | Smith, J. A., Lee, K., & García, M. (2021). Title. *Journal*, *2*(3), 45–67. https://doi.org/… |
| `mla` | MLA 9 | A–Z | Smith, John Andrew, et al. “Title.” *Journal*, vol. 2, no. 3, 2021, pp. 45–67, https://doi.org/…. |
| `chicago` | Chicago author-date | A–Z | Smith, John Andrew, Kim Lee, and María García. 2021. “Title.” *Journal* 2 (3): 45–67. https://doi.org/…. |
| `harvard` | Harvard (Cite Them Right) | A–Z | Smith, J.A., Lee, K. and García, M. (2021) ‘Title’, *Journal*, 2(3), pp. 45–67. Available at: https://doi.org/…. |
| `ieee` | IEEE | numbered | [1] J. A. Smith, K. Lee, and M. García, “Title,” *Journal*, vol. 2, no. 3, pp. 45–67, Mar. 2021, doi: …. |
| `vancouver` | Vancouver | numbered | 1. Smith JA, Lee K, García M. Title. Journal. 2021 Mar;2(3):45-67. doi:… |
| `bibtex` | BibTeX | A–Z | `@article{smith2021title, author = {Smith, John Andrew and …}, …}` |
| `ris` | RIS | A–Z | `TY  - JOUR`, `AU  - …`, …, `ER  - ` |

- A small builder keeps the plain-text and HTML (`<i>`) versions in step, so every style copies with italics.
- With no author, Chicago and Harvard move the title to the front; MLA starts with the title in quotes.
- Numbered styles take `n`, the paper's position in the reference list. The library numbers papers in the order they were saved (oldest first) within the section being viewed.
- BibTeX keys are `familyYEARfirstword` (`smith2021climate`), with accents removed. Special LaTeX characters (`& % $ # _ { } ~ ^ \`) are escaped, and titles are wrapped in double braces to keep their capitals. The `.bib` download adds `a`, `b`, … to repeated keys.
- RIS puts the abstract in `AB`, the conclusion and note in `N1`, and each section name in `KW`, so sections arrive in Zotero, Mendeley and EndNote as tags.
- `cite(item, style, n)` keeps a hand-edited APA reference (`apaEdited`) as written; other styles are always rebuilt from `item.ref`.

## 10. Saving: storage and data model

All items are stored as one array under the key `items` in `chrome.storage.local`:

```js
{
  id: 'uuid',
  savedAt: 'ISO date', updatedAt: 'ISO date',
  ref: { ...reference object... },
  apa: 'plain-text reference', apaHtml: 'reference with <i>', apaEdited: false,
  inText: '(Smith et al., 2021)',
  abstract: '', abstractSource: 'page' | 'page metadata' | 'Crossref' | 'PDF text' | 'your highlight' | …,
  conclusion: '',
  snippets: [{ text: 'highlighted text', savedAt: 'ISO date' }],
  note: '',
  sections: ['related', 'introduction']   // section ids, see below
}
```

Settings live under the key `settings` (`getSettings` / `setSettings` in `lib.js`):

```js
{
  style: 'apa',                 // a key of STYLES
  sections: [{ id: 'introduction', name: 'Introduction' }, { id: 'related', name: 'Related work' }, …]
}
```

- The six default sections are Introduction, Related work, Methods, Results, Discussion and Conclusion. New ones get an id made from their name (`newSectionId`), with `-2`, `-3` added if needed.
- Deleting a section removes its id from every item; the papers stay.
- `saveItem` only changes `sections` when it is given an array, so right-click saves never touch them.

- **Duplicate detection (`findExisting`).** The same DOI, or the same URL (ignoring `#…` and a trailing `/`), or the same title for local PDFs with no DOI or URL. A match updates the existing item instead of adding a new one.
- **Manual edits win.** If the user edited the reference text in the library (`apaEdited: true`), later saves never overwrite it. Right-click saves only fill an abstract or conclusion that is empty.
- **Duplicate highlights** are not added twice.

## 11. The popup

`popup.html` + `popup.js`. When the popup opens it:

1. gets the active tab (`chrome.tabs.query`), which the `activeTab` permission allows when the user clicks the icon;
2. runs `capture(tab)`, or the PDF path when the tab is a PDF;
3. shows the type badge, title, formatted reference, in-text citation, and editable boxes for the abstract, conclusion, highlight and note;
4. if the item already exists, pre-fills the saved values and changes the button to **Update in library**;
5. on **Save**, calls `saveItem(ref, fields)`, including the ticked sections.

The popup is 600 px wide (Chrome allows up to 800 × 600), with the abstract and conclusion side by side.

- **Citation style.** A menu next to the reference lists `STYLES`. Changing it calls `setSettings({ style })` and redraws the reference and in-text citation with `cite()` and `inTextFor()`. For numbered styles the popup uses the number the paper has, or will have, in the library.
- **Sections.** `mountChips()` in `chips.js` draws one toggle per section and a **+ New section** chip that turns into a text box.
- **Add by link.** The button shows a box for a link. On submit, the popup asks for permission to read websites while the click still counts as a user gesture (`chrome.permissions.request` must be called from one), then opens `library.html?add=<link>`. The library does the reading, because the popup closes as soon as a tab opens.
- **Opening animation.** See section 13.3.

**Copy reference** uses `navigator.clipboard.write` with both `text/html` and `text/plain` (`copyRich` in `lib.js`), so the italics survive pasting into Word.

The keyboard shortcut is declared in `manifest.json` under `commands._execute_action`: **Option+Shift+L** on Mac, **Alt+Shift+L** elsewhere.

## 12. Right-click menus (background service worker)

`background.js` is a module service worker. In `chrome.runtime.onInstalled` it creates five menu items:

| Menu item | Shown on | What it does |
|---|---|---|
| Save this page to Lilotech | page, link, image | capture and save |
| Save highlight to Lilotech | selection | save and add the selection as a highlight |
| Save highlight as the Abstract | selection | save, with the selection as the abstract |
| Save highlight as the Conclusion | selection | save, with the selection as the conclusion |
| Open my Lilotech library | toolbar icon, page | opens `library.html` |

On success the toolbar icon briefly shows a green **✓** badge (`chrome.action.setBadgeText`). On error it shows a red **!**. If the tab is a PDF, the worker opens the popup (`chrome.action.openPopup()`), because only the popup can run pdf.js.

## 13. The library page

`library.html` + `library.js`, opened as a normal tab at `chrome-extension://<id>/library.html`.

**Layout**
- Header: the animated logo, the count, and the **Citation style** menu.
- Add bar: a box for a link, DOI or arXiv ID, **Add paper**, and **Add a PDF**.
- Left sidebar: All papers, each section, and Unsorted, each with a count, plus a box to make a new section. The chosen section is remembered in `localStorage`. On narrow windows the sidebar moves above the list.
- Main column: the section's name, search, sort and an **Export** menu (a `<details>` element styled as a drop-down).

**Display**
- Cards show the reference in the chosen style (BibTeX and RIS in a monospace block), the in-text citation, the saved date, the section chips, and collapsible Abstract, Conclusion, Highlights and Note sections. Clicking a chip adds the paper to that section or takes it out.
- **Search** filters across the reference, title, abstract, conclusion, highlights, note and section names.
- **Sort** by newest first, or reference-list order for the chosen style (A–Z, or numbered oldest first).
- The page re-renders automatically when storage changes (`chrome.storage.onChanged`), for example when something is saved from another tab.

**Item actions**
- Copy reference.
- Copy with abstract & conclusion.
- Open page (via `https://doi.org/…` when there's a DOI).
- **Edit**: text boxes for every field. Highlights are separated by a `---` line.
- Delete, with a confirmation.

**Library actions**

Every export covers the section being viewed, in reference-list order for the chosen style, and the file name includes the section's name.

| Button | Output |
|---|---|
| Add paper | Reads a link, DOI or arXiv ID (section 13.2) → `saveItem` |
| Add a PDF | Picks one or more PDFs → `capturePdf` → `saveItem` |
| Copy all references | References in the chosen style, as rich text with hanging indents |
| Download for Word | A `.doc` (HTML that Word opens): Times New Roman 12 pt, double-spaced, 0.5″ hanging indent (none for numbered styles); a "References" page, then "Reading notes", grouped by section when viewing All papers. BibTeX and RIS fall back to APA here |
| Download notes (.md) | Markdown with `*italics*`; reference list plus notes per source, grouped by section like the Word file |
| Download BibTeX (.bib) | One entry per source, with unique keys |
| Download for Zotero, Mendeley, EndNote (.ris) | One record per source; sections become keywords |
| Download spreadsheet (.csv) | One row per source, including a Sections column; UTF-8 with BOM so Excel shows accents correctly |
| Backup library | JSON file of the whole library and the settings (`version: 2`) |
| Restore from backup | Merges a backup file, adding only items whose `id` isn't already present, and any custom sections they use |

Papers added with **Add paper** or **Add a PDF** while a section is selected go into that section.

Files are downloaded with a `Blob`, `URL.createObjectURL` and a temporary `<a download>`.

### 13.1 Sections

The sidebar and the chips both read `settings.sections`. An item belongs to a section when the section's id is in `item.sections`; ids of deleted sections are ignored. "Unsorted" is every item with no current section. When All papers is viewed and at least one paper is in a section, the Word and Markdown notes have one heading per section (in sidebar order) and then Unsorted; a paper in two sections appears under both.

### 13.2 Add by link (`addlink.js`)

`parseLink(text)` in `lib.js` recognises, in this order:

| Input | Result |
|---|---|
| `2401.01234`, `arXiv:2401.01234v2`, `hep-th/9901001`, `arxiv.org/abs/…`, `arxiv.org/pdf/…` | `arxiv`, with DOI `10.48550/arXiv.<id>`, the abstract page and the PDF link |
| `10.xxxx/…`, `doi:10.xxxx/…`, `https://doi.org/…` (also URL-encoded) | `doi` |
| A link ending in `.pdf` | `pdf` |
| Any other `http(s)` link, or `www.…` | `url`; a DOI inside a publisher link (`/doi/10.…`) is kept as a hint |

`readLink(text)`:

1. For a PDF link, downloads it and runs `capturePdf`.
2. For anything else, opens the link in a background tab (`chrome.tabs.create({ active: false })`), waits for it to finish loading (at most 30 seconds), runs `extractPage()` in it, and closes it. A `doi.org` link ends up on the publisher's page, so the abstract and conclusion come from there. If the tab turns out to be a PDF, it is read with pdf.js instead.
3. If that found nothing (no permission, or the page failed) but there is a DOI, `finishCapture({ doi })` still gets the reference from Crossref or DataCite, and often the abstract.
4. If the conclusion is missing and the page links to its PDF (or it's arXiv), reads it from the PDF, as in section 6.6.

Reading another site needs host permission. **Add paper** calls `chrome.permissions.request({ origins: ['https://*/*', 'http://*/*'] })` directly in the click handler, because Chrome only shows the prompt during a user gesture. Chrome asks once; after that it answers straight away. Saving an existing paper again only fills empty fields and keeps its sections.

### 13.3 Logo animation (`logo.js`)

The logo is inline SVG so its parts can move: a blue tile, two page shapes, the text lines and the yellow bookmark. `mountLogo(el)` inserts it (with the word "Lilotech" as one `<span>` per letter), and `replayLogo(el)` adds the `play` class, which starts these CSS animations in `style.css`:

| Part | Animation | Time |
|---|---|---|
| Tile | scales up from 60% with a small overshoot | 0–0.32 s |
| Pages | open from the spine (`scaleX` 0 → 1, `transform-origin` at the spine) | 0.12–0.54 s |
| Text lines | are "written" with `stroke-dashoffset` (the path has `pathLength="1"`) | 0.45–0.8 s |
| Bookmark | drops in from above with a bounce | 0.5–0.95 s |
| Letters | rise and fade in one after another, 45 ms apart | 0.25–0.9 s |

The popup shows a large logo while it reads the page, and the small one in the header. The library plays it on load and again after adding a paper. Under `prefers-reduced-motion: reduce` all of it is switched off.

## 14. Permissions and privacy

| Permission | Why it's needed |
|---|---|
| `activeTab` | Read the tab the user clicked on, and only that tab |
| `scripting` | Inject `extractPage()` and the PDF fetch into that tab |
| `storage`, `unlimitedStorage` | Keep the library locally, with no size limit |
| `contextMenus` | The right-click menu items |
| `host_permissions`: `api.crossref.org`, `api.datacite.org` | Call the two lookup services |
| `optional_host_permissions`: `https://*/*`, `http://*/*` | Asked for **one site at a time** when a PDF from that site can't be read otherwise, or for **all sites** the first time the user adds a paper by link (so Lilotech can open and read the link) |

- No data leaves the computer except the DOI or title sent to Crossref or DataCite.
- PDFs are parsed locally.
- There are no analytics and no accounts.

## 15. Implementing it from scratch, step by step

The order below is how to rebuild Lilotech, testing after every step.

1. **Skeleton.** Create `manifest.json` with `manifest_version: 3`, a name, a version, `action.default_popup: "popup.html"` and the icons. Add an empty `popup.html` that says "Hello". Load it with **Load unpacked** and check that the popup opens.
2. **Read the page.** Add the `activeTab` and `scripting` permissions. In `popup.js`, get the active tab and run `chrome.scripting.executeScript({ target: { tabId }, func })` with a small function that returns `document.title`. Show the result.
3. **Metadata extraction.** Grow that function into `extractPage()`: meta tags, then JSON-LD, then DOI (section 5.1). Print the result as JSON in the popup and try it on several journals.
4. **Abstract and conclusion.** Add the selector list and the heading-based `textAfter()` (sections 5.2–5.4). Test on a journal article, a preprint page and a news article.
5. **APA 7.** Write `parseName`, `formatAuthors` and `formatAPA` (section 9) as pure functions in a separate module. Test them in Node with sample objects before wiring them in.
6. **Online lookup.** Add `host_permissions` for `https://api.crossref.org/*` and write `lookupCrossref(doi)`. Merge its fields over the page data in `buildReference`.
7. **Saving.** Add the `storage` permission and write `getItems`, `setItems`, `findExisting` and `saveItem` (section 10). Add a **Save** button to the popup.
8. **Library page.** Create `library.html`/`library.js`: render cards from storage, add search, then edit and delete, then the export buttons.
9. **Right-click menus.** Add `contextMenus` and a module service worker (`"background": { "service_worker": "background.js", "type": "module" }`). Create the menus in `onInstalled` and handle `onClicked` by reusing `capture()` and `saveItem()`.
10. **Clipboard with italics.** Add `copyRich()` using `ClipboardItem` with `text/html` and `text/plain`.
11. **PDFs.**
    - Download `pdfjs-dist` (`npm pack pdfjs-dist@4.10.38`) and copy `build/pdf.min.mjs` and `build/pdf.worker.min.mjs` into `vendor/pdfjs/`.
    - Write `pageLines`, `joinLines`, `sectionFrom` and `readPdf` (section 6).
    - Detect PDF tabs in `capture()`.
    - Add `fetchTabPdf()`, the **Allow** flow with `optional_host_permissions`, and **Add a PDF** in the library.
12. **Fallbacks.** Add the DataCite lookup and the strict Crossref title search (section 7).
13. **Polish.** Icons (16/32/48/128 px PNG), dark mode in `style.css`, the keyboard shortcut, and empty-state messages.
14. **Citation styles.** Write `styles.js` (section 9.4) as pure functions and test them in Node. Add `getSettings`/`setSettings`, a style menu in the popup and library, and the `.bib` and `.ris` downloads.
15. **Sections.** Add `sections` to items and settings (section 10), the chips (`chips.js`), the library sidebar and the grouped exports (section 13.1).
16. **Add by link.** Write `parseLink` and test it in Node, then `addlink.js` (section 13.2) and the add bar.
17. **Animated logo.** Draw the icon as SVG and add the CSS animations (section 13.3).

## 16. Running and debugging

- **Load:** `chrome://extensions` → Developer mode → **Load unpacked** → choose the folder.
- **After editing:** click the reload arrow on the Lilotech card, then reload the web page you're testing on.
- **Popup console:** right-click the Lilotech icon → **Inspect popup**.
- **Service worker console:** on `chrome://extensions`, click **service worker** on the Lilotech card.
- **Library console:** open the library tab, then Option+Command+I.
- **See stored data:** in any of those consoles, run `chrome.storage.local.get('items').then(console.log)`.
- **Clear all data:** `chrome.storage.local.clear()` (back up first).

## 17. Testing

The automated tests live in `tests/`. Running them needs Node.js 18 or newer.

```bash
npm install                      # installs Playwright (test tool only, not part of the extension)
npx playwright install chromium  # downloads a test copy of Chromium, once
npm test                         # runs everything
npm test -- wiley                # runs only test files whose name contains "wiley"
```

`tests/run.mjs` runs five groups and prints every failure with what was expected and what was found:

1. **Unit tests** in plain Node:
   - APA 7: 2 and 21+ authors, particles and hyphens, group authors, journal articles with italics, article numbers, web pages with full dates, no author, no date, and in-text citations.
   - Other styles: an article in MLA, Chicago, Harvard, IEEE and Vancouver, in-text citations, BibTeX keys and escaping, RIS fields, web pages with no author, and a hand-edited APA reference.
   - Links: DOIs (plain, `doi:`, `doi.org`, URL-encoded), arXiv IDs and links, publisher links with a DOI, PDF links, bare domains and text that isn't a link.
2. **Web pages.**
   - `tests/fixtures/web/*.html` are copies of real publisher page layouts: ScienceDirect, Springer/Nature, Wiley, IEEE Xplore, MDPI, PubMed, PubMed Central, arXiv HTML, Taylor & Francis, ResearchGate (with and without an abstract block), a Medium-style blog, a WordPress blog, a news site, a single-page app that renders late, a page with a hidden "Abstract" tab, and a page with nothing to find.
   - Each page is opened in Chromium and `extractPage()` is run on it.
3. **PDFs.**
   - `tests/fixtures/pdf/*.html` are turned into PDFs with Chromium's print-to-PDF at test time, so no binary files are stored.
   - They copy real layouts: Elsevier (masthead, letter-spaced headings, article info column, running header, conclusion across a page break), IEEE (`Abstract—`, roman numerals), Wiley (structured abstract, `5 | CONCLUSIONS`, repeated footer), Springer (inline `Abstract`), a thesis with no DOI, and a ResearchGate-hosted paper.
   - They're read by `readPdf()` inside the real extension.
4. **The popup, end to end.**
   - The extension is loaded into Chromium and the popup is pointed at a page.
   - The test checks that the abstract comes from the page and the conclusion comes from the page or from its linked PDF (ResearchGate).
   - It also checks the logo, switches the style to IEEE, ticks a section, saves, and checks what was stored.
5. **The library.**
   - Three papers are put in storage. The test checks the section counts, the section filter, IEEE numbering, BibTeX cards and MLA order.
   - It downloads `.bib`, `.ris` and `.md` files and checks their contents, including notes grouped by section.
   - It toggles a section chip, makes a new section, adds a web page and a PDF by link into it, and checks that text that isn't a link shows an error.

**Expectations.** Each `expected.json` lists, per file, the DOI, title and year, and for the abstract and conclusion:
- `starts`: the text it must start with;
- `includes`: text it must contain;
- `excludes`: text that must **not** leak in, such as highlights, figure captions, running headers or the next section;
- `empty: true`: when nothing should be found.

**Adding a case after a bug report:**
1. Save the page (in Chrome, File → Save Page As → "Webpage, HTML only").
2. Trim it to the parts that matter and put it in `tests/fixtures/web/`.
3. Add its expectations to `expected.json` and run `npm test`. It should fail first, then pass after the fix.

Before each release, also try a few live pages by hand: Nature or Springer, ScienceDirect, PLOS, Wiley, MDPI, PubMed, arXiv, ResearchGate, a news site, a blog, and a few journal PDFs.

## 18. Packaging and releasing

1. Bump `version` in `manifest.json` and `package.json`, and add the changes to `CHANGELOG.md`.
2. Run `npm test` and make sure everything passes.
3. Zip the folder without the development files, from the folder that contains it:
   `zip -r Lilotech.zip lilotech -x 'lilotech/.git/*' 'lilotech/node_modules/*' 'lilotech/tests/*' '*.DS_Store'`
4. For personal use, share the zip and load it unpacked (see the README).
5. To publish on the Chrome Web Store:
   - register as a developer (one-time fee);
   - zip the **contents** of the folder, so `manifest.json` is at the root of the zip;
   - upload it, and fill in the description, screenshots and a privacy note explaining each permission (section 14).

## 19. Known limitations and ideas

**Limitations**
- Titles keep the publisher's capitalisation. APA 7 wants sentence case for article titles. Automatic conversion is risky because of proper nouns and acronyms.
- Scanned PDFs (images of text) have no text to read, so OCR would be needed.
- Two-column PDFs with unusual layouts can mix columns in the extracted abstract or conclusion.
- Names with two family names ("Ana García López") are split on the last word unless a lookup provides the correct split.

**Ideas**
- A sentence-case button that lowercases words except acronyms and words after a colon.
- More citation styles through CSL (the format Zotero uses), and a style per section.
- Reading notes per section written as a draft paragraph outline.
- Open-access links through the Unpaywall API, and retraction warnings.
- Sync between computers with `chrome.storage.sync` (it has small size limits, so only the references could be synced).
