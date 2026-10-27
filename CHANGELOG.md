# Changelog

All notable changes to Lilotech. Versions follow [semantic versioning](https://semver.org): MAJOR.MINOR.PATCH.

## [1.1.1] - 2026-10-27

### Fixed
- **ScienceDirect:** the abstract no longer picks up the Highlights or Graphical abstract instead of the real abstract.
- **Wiley:** the abstract no longer picks up the Plain Language Summary or Key Points.
- **IEEE Xplore:** the abstract no longer includes "Published in", page and DOI details.
- **ResearchGate:** the "PDF | … | Find, read and cite all the research you need on ResearchGate" wrapping is removed from the abstract, and the abstract block on the page is found.
- **PubMed:** the conclusion is taken from the "Conclusions:" part of a structured abstract when the page has no full text, and "Keywords" no longer leaks into the abstract.
- **Blogs:** conclusions under a bold paragraph (`Conclusion` in bold), or under a heading with a colon (`Conclusion:`), are now found. Sidebar widgets, footers, tables of contents and "similar articles" lists are ignored.
- Figure captions and "Full size image" links no longer appear inside a conclusion (Springer, MDPI).
- An abstract inside a hidden tab is still found.
- Pages that fill in the article with scripts after loading are read once they have finished.
- **PDFs:**
  - Running headers and footers (journal name, page numbers) no longer end up inside an abstract or conclusion.
  - A structured abstract starting with "Background:" is no longer cut off.
  - `5 | CONCLUSIONS` (Wiley) headings are recognised.
  - Conclusions stop at CRediT, Declarations, Ethics and similar sections.
  - The journal masthead is no longer taken as the title.

### Added
- When a page shows only the abstract but links to the paper's PDF (ResearchGate, arXiv, repositories), the popup reads the missing conclusion, and the abstract if needed, from that PDF. Text you typed is never replaced.
- Automated tests (`npm test`): 200+ checks on 17 test pages copying publisher layouts, 6 PDF layouts, APA 7 formatting and the popup.

## [1.1.0] - 2026-10-26

### Added
- **PDF support.**
  - Click the Lilotech icon on a PDF open in Chrome to save it.
  - Lilotech reads the PDF's DOI, title, year, abstract and conclusion.
- **Add a PDF** button in the library, for PDFs saved on the computer. Several files can be picked at once.
- For sites whose PDFs can't be read directly, an **Allow** prompt asks permission for that one site only.
- DataCite lookup for DOIs that Crossref doesn't have, such as arXiv preprints.
- Crossref title search for PDFs without a DOI. A result is used only when its title clearly matches.
- Right-click **Save this page** on a PDF opens the Lilotech popup.
- Implementation guide in `docs/IMPLEMENTATION.md`.
- Install, clone and update steps in the README.

### Changed
- Crossref's abstract is preferred over text pulled from a PDF, because it is cleaner.
- Saved items without a web address are matched by title, so the same PDF isn't saved twice.

### Libraries
- Bundled pdf.js 4.10.38 (Mozilla, Apache-2.0) in `vendor/pdfjs`.

## [1.0.0] - 2026-10-26

### Added
- One-click save from the toolbar popup, with the APA 7 reference, in-text citation, abstract, conclusion, highlight and note.
- Reads `citation_*`, Dublin Core, Open Graph and JSON-LD metadata, and looks up DOIs on Crossref.
- APA 7 formatting:
  - 1, 2, 3–20 and 21+ authors;
  - group authors;
  - no author or no date;
  - journal articles, web pages, books and chapters.
- Right-click menus:
  - save the page;
  - save a highlight;
  - save a highlight as the abstract or the conclusion.
- Library page:
  - search, sort, edit and delete;
  - copy with italics;
  - download for Word, Markdown or CSV;
  - backup and restore as JSON.
- Light and dark mode, and the Option+Shift+L keyboard shortcut.

[1.1.1]: https://github.com/Bujjinga/lilotech/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/Bujjinga/lilotech/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Bujjinga/lilotech/releases/tag/v1.0.0
