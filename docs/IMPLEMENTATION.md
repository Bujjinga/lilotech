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
├── lib.js               Shared logic: page extraction, lookups, APA 7, storage, clipboard
├── pdfread.js           PDF reading with pdf.js (used by popup and library)
├── popup.html / .js     The window that opens when you click the toolbar icon
├── library.html / .js   The full-page library (search, edit, export)
├── style.css            Shared styles, light and dark mode
├── icons/               Toolbar and store icons (16, 32, 48, 128 px)
├── vendor/pdfjs/        pdf.min.mjs, pdf.worker.min.mjs, LICENSE, VERSION
├── docs/                This document
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
```

## 5. Reading a web page

`extractPage()` in `lib.js` is injected into the tab with `chrome.scripting.executeScript({ func: extractPage })`. Because Chrome serialises the function and runs it inside the page, **it must not use anything defined outside itself**. All of its helpers are declared inside it.

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

1. Meta tags `citation_abstract`, `dc.description`, `dcterms.abstract` (only if longer than 150 characters).
2. Common abstract containers: `[role="doc-abstract"]`, `#abstract`, `#Abs1`, `.abstract`, `section.abstract`, `[class*="abstract" i]` and others. The leading word "Abstract" is stripped.
3. A heading that says "Abstract", "Summary", "Key points" or "Highlights", followed by its section text (see 5.4).
4. JSON-LD `abstract`.
5. As a last resort, the page's `description` / `og:description`, marked as *"page description (not a formal abstract)"* so the user knows.

### 5.3 Finding the conclusion

The conclusion is found by heading text, using several patterns in order of confidence:

1. `Conclusion(s)`, `Concluding remarks`, `Final thoughts` (with optional numbering like `5.` or `IV.`)
2. `Conclusions and future work`, `Summary and …`
3. `Discussion and conclusions`, `Implications`
4. `Summary`, `The bottom line`, `Key takeaways`, `In conclusion`

For conclusions, the **last** matching heading on the page is preferred, because conclusions come at the end.

### 5.4 Collecting a section's text

`textAfter(heading)`:

- walks the heading's next siblings and collects their text until it reaches a heading of the same or a higher level;
- skips `script`, `style`, `nav`, `button`, `figure`, `table` and `aside`;
- if the heading is wrapped in its own `<div>` with no siblings, it moves up one parent and tries again (up to 4 levels), and accepts a whole `<section>` as the container;
- never climbs into `body`, `main`, `article`, `footer`, `nav` or `header`, so it can't return the whole page.

Headings inside `nav`, `footer` and `aside` are ignored, so a "Summary" link in a site footer is never picked up. Results are capped at 8,000 characters.

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

1. **From inside the tab.** A function injected into the tab runs `fetch(location.href, { credentials: 'include' })`, converts the bytes to base64 and returns them. Because the request comes from the same site, it works for paywalled PDFs the user is signed in to see.
2. **Directly from the popup**, which works when the extension already has access to that site.
3. **Asking for permission.** The popup shows an **Allow** button that calls `chrome.permissions.request({ origins: ['https://site/*'] })` for that one site (declared under `optional_host_permissions`), then tries again.

Every result is checked for the `%PDF` signature before use. PDFs on the computer (`file://`) are added with **Add a PDF** in the library instead, which reads the file with `File.arrayBuffer()`.

### 6.4 Turning PDF text into lines

pdf.js returns text items with positions. `pageLines()` rebuilds readable lines:

- a new line starts when the vertical position changes by more than half the font height;
- a blank line (paragraph break) is inserted after a vertical gap of more than 1.9 line heights, or when the text jumps back up the page (the start of a new column);
- a space is added between items on the same line when there is a horizontal gap.

`joinLines()` then removes end-of-line hyphenation (`memo-\nry` becomes `memory`) and joins lines inside a paragraph.

### 6.5 What is extracted

Only the first 60 pages are read.

| Field | Method |
|---|---|
| **DOI** | XMP `prism:doi` / `dc:identifier`, PDF info fields, then the text of pages 1–2 up to any "References" heading, then the URL |
| **Title** | The PDF's `Title` field, unless it looks like junk ("Microsoft Word - final.docx", "untitled", a file name). Otherwise the largest-font text on page 1 |
| **Authors** | The PDF's `Author` field, split on `;`, `and` and `&`. Usually replaced by Crossref |
| **Year** | A printed year on page 1–3 ("© 2022", "Published: 3 May 2022"). The file's creation date is **not** used, because it is often the download date |
| **Abstract** | Text after an "Abstract" label (also "Abstract: We…" on the same line), up to Keywords, Introduction, Background, © or similar |
| **Conclusion** | Text after the **last** "Conclusion(s)" heading, up to References, Acknowledgements, Funding, Appendix, Data availability or similar |

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
  note: ''
}
```

- **Duplicate detection (`findExisting`).** The same DOI, or the same URL (ignoring `#…` and a trailing `/`), or the same title for local PDFs with no DOI or URL. A match updates the existing item instead of adding a new one.
- **Manual edits win.** If the user edited the reference text in the library (`apaEdited: true`), later saves never overwrite it. Right-click saves only fill an abstract or conclusion that is empty.
- **Duplicate highlights** are not added twice.

## 11. The popup

`popup.html` + `popup.js`. When the popup opens it:

1. gets the active tab (`chrome.tabs.query`), which the `activeTab` permission allows when the user clicks the icon;
2. runs `capture(tab)`, or the PDF path when the tab is a PDF;
3. shows the type badge, title, formatted reference, in-text citation, and editable boxes for the abstract, conclusion, highlight and note;
4. if the item already exists, pre-fills the saved values and changes the button to **Update in library**;
5. on **Save**, calls `saveItem(ref, fields)`.

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

**Display**
- Cards show the reference with a hanging indent, the in-text citation, the saved date, and collapsible Abstract, Conclusion, Highlights and Note sections.
- **Search** filters across the reference, abstract, conclusion, highlights and note.
- **Sort** by newest first, or A–Z (APA reference-list order).
- The page re-renders automatically when storage changes (`chrome.storage.onChanged`), for example when something is saved from another tab.

**Item actions**
- Copy reference.
- Copy with abstract & conclusion.
- Open page (via `https://doi.org/…` when there's a DOI).
- **Edit**: text boxes for every field. Highlights are separated by a `---` line.
- Delete, with a confirmation.

**Library actions**

| Button | Output |
|---|---|
| Add a PDF | Picks one or more PDFs → `capturePdf` → `saveItem` |
| Copy all references | All references A–Z, as rich text with hanging indents |
| Download for Word | A `.doc` (HTML that Word opens): Times New Roman 12 pt, double-spaced, 0.5″ hanging indent; a "References" page, then "Reading notes" |
| Download notes (.md) | Markdown with `*italics*`; reference list plus notes per source |
| Download spreadsheet (.csv) | One row per source; UTF-8 with BOM so Excel shows accents correctly |
| Backup | JSON file of the whole library |
| Restore | Merges a backup file, adding only items whose `id` isn't already present |

Files are downloaded with a `Blob`, `URL.createObjectURL` and a temporary `<a download>`.

## 14. Permissions and privacy

| Permission | Why it's needed |
|---|---|
| `activeTab` | Read the tab the user clicked on, and only that tab |
| `scripting` | Inject `extractPage()` and the PDF fetch into that tab |
| `storage`, `unlimitedStorage` | Keep the library locally, with no size limit |
| `contextMenus` | The right-click menu items |
| `host_permissions`: `api.crossref.org`, `api.datacite.org` | Call the two lookup services |
| `optional_host_permissions`: `https://*/*`, `http://*/*` | Asked for **one site at a time**, only when a PDF from that site can't be read otherwise |

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

## 16. Running and debugging

- **Load:** `chrome://extensions` → Developer mode → **Load unpacked** → choose the folder.
- **After editing:** click the reload arrow on the Lilotech card, then reload the web page you're testing on.
- **Popup console:** right-click the Lilotech icon → **Inspect popup**.
- **Service worker console:** on `chrome://extensions`, click **service worker** on the Lilotech card.
- **Library console:** open the library tab, then Option+Command+I.
- **See stored data:** in any of those consoles, run `chrome.storage.local.get('items').then(console.log)`.
- **Clear all data:** `chrome.storage.local.clear()` (back up first).

## 17. Testing

There is no build system, so the logic is tested in three ways.

1. **Pure functions in Node.**
   - `formatAPA`, `formatAuthors`, `parseName` and `formatInText` have no browser dependencies.
   - Import `lib.js` from a `.mjs` test file, and check edge cases: 1, 2, 20 and 21+ authors, group authors, name particles, no author, no date, web pages with a full date, and article numbers.
2. **Extraction in a real browser.**
   - Use Playwright with Chromium: open a page and run `page.evaluate('(' + extractPage.toString() + ')()')`.
   - Test pages to keep:
     - a journal article with `citation_*` tags and numbered sections;
     - a news article with JSON-LD, a "The bottom line" heading and a site footer containing "Summary";
     - a page whose conclusion heading is wrapped in its own `<div>`;
     - a small page whose reference list contains a DOI, which must **not** be picked up.
3. **The whole extension.**
   - Launch Chromium with `--disable-extensions-except=<folder>` and `--load-extension=<folder>`, using full headless mode (`channel: 'chromium'`).
   - Open `chrome-extension://<id>/popup.html` and `library.html` as pages, and click through save, edit and every export.
   - For PDFs, generate sample PDFs from HTML with `page.pdf()`: one with a DOI, a © year and two columns, and one with no DOI. Check the title, DOI, year, abstract and conclusion, plus the **Allow** screen when site access is missing.

Before each release, also try real pages by hand: Nature or Springer, Elsevier (ScienceDirect), PLOS, Wiley, MDPI, PubMed Central, arXiv, a news site, a blog, and a few journal PDFs.

## 18. Packaging and releasing

1. Bump `version` in `manifest.json`.
2. Zip the folder without `.git`, from the folder that contains it:
   `zip -r Lilotech.zip lilotech -x 'lilotech/.git/*' '*.DS_Store'`
3. For personal use, share the zip and load it unpacked (see the README).
4. To publish on the Chrome Web Store:
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
- More citation styles (MLA, Chicago, Harvard) and BibTeX/RIS export for Zotero, Mendeley and EndNote.
- Tags or folders per project.
- Open-access links through the Unpaywall API, and retraction warnings.
- Sync between computers with `chrome.storage.sync` (it has small size limits, so only the references could be synced).
