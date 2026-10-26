# Changelog

All notable changes to Lilotech. Versions follow [semantic versioning](https://semver.org): MAJOR.MINOR.PATCH.

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

[1.1.0]: https://github.com/Bujjinga/lilotech/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Bujjinga/lilotech/releases/tag/v1.0.0
