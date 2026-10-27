# Lilotech

**Version 1.2.0**

A Chrome extension that saves what you read for research:

- the **reference** in the style you need: APA 7, MLA 9, Chicago, Harvard, IEEE, Vancouver, or BibTeX and RIS for LaTeX, Zotero, Mendeley and EndNote (with italics, ready to paste into Word or Google Docs)
- the **abstract**
- the **conclusion**
- any **highlight** you pick

You can sort papers into **sections** of the paper you're writing (Introduction, Related work, Methods, and your own), and save a paper just by pasting its **link, DOI or arXiv ID**.

Everything is kept in your own Chrome on your computer. Nothing is uploaded anywhere. The only outside services used are Crossref and DataCite (both free), to look up the reference details from a paper's DOI. PDFs are read on your computer, not uploaded.

## Versions

| Version | What's new |
|---|---|
| **1.2.0** (current) | More citation styles (MLA, Chicago, Harvard, IEEE, Vancouver, BibTeX, RIS), sections, add a paper by link, a side panel that stays open, and an orange cat |
| **1.1.1** | Finds abstracts and conclusions more reliably on journal sites, ResearchGate, blogs and PDFs |
| **1.1.0** | Save PDFs, both ones open in Chrome and ones on your computer (**Add a PDF**) |
| **1.0.0** | First release: APA 7 references, abstracts, conclusions, highlights, library and exports |

Full details are in [CHANGELOG.md](CHANGELOG.md). Each version is tagged in Git (`v1.0.0`, `v1.1.0`, `v1.1.1`, `v1.2.0`).

## Get the code

Pick **one** of these three ways.

### Option A: Clone with Git (recommended, easy to update)

1. Open **Terminal** (press Command+Space, type `Terminal`, press Return).
2. Copy these two lines, paste them in, and press Return:
   ```bash
   cd ~/Documents
   git clone https://github.com/Bujjinga/lilotech.git
   ```
   You now have a `lilotech` folder in your Documents folder.
   - If your Mac asks to install "command line developer tools", click **Install**, wait, then run the lines again.
   - If the repository is private, Git asks you to sign in. Use your GitHub username and a [personal access token](https://github.com/settings/tokens) as the password. Option B avoids this.
3. To get a specific version instead of the newest:
   ```bash
   cd ~/Documents/lilotech
   git checkout v1.0.0     # the first version
   git checkout main       # back to the newest
   ```

### Option B: GitHub Desktop (no Terminal)

1. Install [GitHub Desktop](https://desktop.github.com) and sign in.
2. Choose **File → Clone Repository**, pick `Bujjinga/lilotech`, set the folder to Documents, and click **Clone**.

### Option C: Download a zip

On the repository page, click the green **Code** button, then **Download ZIP**. Double-click the zip in Downloads, rename the folder to `lilotech`, and move it to Documents.

## Add it to Chrome

1. Open Chrome, type `chrome://extensions` in the address bar, and press Return.
2. Turn on **Developer mode** (the switch in the top-right corner).
3. Click **Load unpacked** (top-left), choose the `lilotech` folder in Documents, and click **Select**.
4. Click the puzzle-piece icon in Chrome's toolbar and click the pin next to **Lilotech**, so its icon (an orange cat with a magnifying glass) is always visible.

Keep the `lilotech` folder where it is. Chrome loads the extension from it, so if you delete or move the folder, Lilotech stops working.

## Update to a new version

1. Get the new files:
   - **Option A:** in Terminal, run:
     ```bash
     cd ~/Documents/lilotech
     git pull
     ```
   - **Option B:** in GitHub Desktop, click **Fetch origin**, then **Pull origin**.
   - **Option C:** download the zip again and replace the old folder.
2. Go to `chrome://extensions` and click the circular reload arrow on the Lilotech card.

Your saved library is kept. It lives inside Chrome, not in the folder.

## Use it

**Save a paper or article**
Click the Lilotech icon (or press Option+Shift+L). Lilotech opens in Chrome's **side panel**, on the right of the window, and stays open until you close it with the ✕ at the top of the panel. Open a paper, check the reference, abstract and conclusion it found, fix anything if needed, tick the sections it belongs to, and click **Save to library**.

When you switch to another tab or open another paper, the panel reads the new page by itself. If you changed something and haven't saved it yet, it asks first with a **Read this page** button, so your edits are never lost. The first time you switch tabs, Lilotech asks you to **Allow** it to read the pages you open; without that, Chrome only lets it read the tab where you clicked the icon.

**The cat**
The little orange cat in the corner plays with its ball of yarn while Lilotech is reading a page or a PDF. Click it any time and it plays for a few seconds.

**Choose your citation style**
Pick a style from the menu next to **Reference**, in the side panel or at the top of the library. Lilotech remembers it, and copying, the in-text citation and downloads all use it. For IEEE and Vancouver, papers are numbered in the order you saved them.

**Sort papers into sections**
Click the section names under a paper (Introduction, Related work, Methods, Results, Discussion, Conclusion) to put it in one or more of them. Click **+ New section** to make your own, such as "Background reading". In the library, the list on the left shows each section with how many papers it has; click one to see only those papers. Downloads then cover just that section, and **Download for Word** and **Download notes** on "All papers" group your reading notes by section.

**Save a paper from its link**
In the library, paste any of these into the box at the top and click **Add paper**:
- a DOI, such as `10.1038/s41586-020-2649-2`, or a `doi.org` link
- an arXiv ID or link, such as `2401.01234`
- a link to a PDF
- the address of any article page

Lilotech opens the page in the background, reads it, and closes it again. The first time, Chrome asks you to let Lilotech read websites; it only reads pages you give it. If you say no, a DOI or arXiv ID still gets you the reference and usually the abstract. You can also click **Add by link** in the side panel; the paper shows up there so you can check it and pick its sections before saving.

**Right-click shortcuts**
- Right-click anywhere on a page: **Save this page to Lilotech**.
- Highlight some text, then right-click:
  - **Save highlight to Lilotech** keeps it as a quote under that paper.
  - **Save highlight as the Abstract** or **as the Conclusion** is handy when Lilotech couldn't find them on its own.

A green ✓ on the icon means it was saved.

**Save a PDF**
- **PDF open in Chrome:** click the Lilotech icon as usual. Lilotech reads the PDF, finds its DOI or title, gets the APA 7 reference from Crossref, and pulls out the abstract and conclusion. The first time on a website, it may ask you to **Allow** it to read PDFs from that site. That permission is only for that one site.
- **PDF on your Mac:** open your library and click **Add a PDF**. You can pick several files at once.

**Your library**
Click **My library** in the side panel (or right-click the Lilotech icon and pick **Open my Lilotech library**). There you can search, copy a reference, edit anything, and use the **Export** menu:
- **Copy all references** in your chosen style.
- **Download for Word**: a reference list in your chosen style, plus your reading notes.
- **Download BibTeX (.bib)** for LaTeX and Overleaf.
- **Download for Zotero, Mendeley, EndNote (.ris)**: import the file in any of these apps. Your sections come along as tags.
- **Download notes (.md)** and **Download spreadsheet (.csv)**.
- **Backup library** and **Restore from backup**: save your whole library (with your sections and style) to a file and load it back.

## Good to know

- Journal pages (Nature, Springer, Elsevier, PLOS, Wiley, MDPI, PubMed Central, arXiv and most others) give the best results, because they include citation details in the page.
- When a page shows only the abstract (ResearchGate, arXiv, many repositories) but links to the paper's PDF, the side panel reads the conclusion from that PDF. You'll see "Looking in the paper's PDF…" under the Conclusion box for a few seconds.
- For news sites and blogs, Lilotech saves them as web pages and uses the article's summary when there's no real abstract.
- PDFs work best when they print a DOI on the first page, as most journal PDFs do. Without one, Lilotech searches Crossref by the title and only uses a result whose title clearly matches. Scanned PDFs (pictures of pages, with no selectable text) can't be read.
- For a PDF on your Mac opened in Chrome (a `file://` address), use **Add a PDF** in the library instead.
- When you edit a reference in the library, you edit the APA 7 version. The other styles are always built from the paper's details.
- APA 7 wants article titles in sentence case ("Attention is all you need"). Lilotech keeps the title as the publisher wrote it, so check capitalisation before you submit. Click **Edit** in the library to change any reference.

## How it's built

See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for the full technical guide: architecture, how each feature works, and how to build, test and release it.

## Credits

PDF reading uses [pdf.js](https://github.com/mozilla/pdf.js) by Mozilla (Apache 2.0 licence), included in `vendor/pdfjs`.
