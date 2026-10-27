# Lilotech

**Version 1.1.1**

A Chrome extension that saves what you read for research:

- the **APA 7 reference** (with italics, ready to paste into Word or Google Docs)
- the **abstract**
- the **conclusion**
- any **highlight** you pick, plus your own **note**

Everything is kept in your own Chrome on your computer. Nothing is uploaded anywhere. The only outside services used are Crossref and DataCite (both free), to look up the reference details from a paper's DOI. PDFs are read on your computer, not uploaded.

## Versions

| Version | What's new |
|---|---|
| **1.1.1** (current) | Finds abstracts and conclusions more reliably on journal sites, ResearchGate, blogs and PDFs |
| **1.1.0** | Save PDFs, both ones open in Chrome and ones on your computer (**Add a PDF**) |
| **1.0.0** | First release: APA 7 references, abstracts, conclusions, highlights, library and exports |

Full details are in [CHANGELOG.md](CHANGELOG.md). Each version is tagged in Git (`v1.0.0`, `v1.1.0`, `v1.1.1`).

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
4. Click the puzzle-piece icon in Chrome's toolbar and click the pin next to **Lilotech**, so its blue book icon is always visible.

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
Open the page, click the blue Lilotech icon (or press Option+Shift+L). Check the reference, abstract and conclusion it found, fix anything if needed, add a note, and click **Save to library**.

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
Click **My library** in the popup (or right-click the Lilotech icon and pick **Open my Lilotech library**). There you can search, copy a reference, edit anything, and download:
- **Download for Word**: a reference list in APA order, plus your reading notes.
- **Download notes (.md)** and **Download spreadsheet (.csv)**.
- **Backup** and **Restore**: save your whole library to a file and load it back.

## Good to know

- Journal pages (Nature, Springer, Elsevier, PLOS, Wiley, MDPI, PubMed Central, arXiv and most others) give the best results, because they include citation details in the page.
- When a page shows only the abstract (ResearchGate, arXiv, many repositories) but links to the paper's PDF, the popup reads the conclusion from that PDF. You'll see "Looking in the paper's PDF…" under the Conclusion box for a few seconds.
- For news sites and blogs, Lilotech saves them as web pages and uses the article's summary when there's no real abstract.
- PDFs work best when they print a DOI on the first page, as most journal PDFs do. Without one, Lilotech searches Crossref by the title and only uses a result whose title clearly matches. Scanned PDFs (pictures of pages, with no selectable text) can't be read.
- For a PDF on your Mac opened in Chrome (a `file://` address), use **Add a PDF** in the library instead.
- APA 7 wants article titles in sentence case ("Attention is all you need"). Lilotech keeps the title as the publisher wrote it, so check capitalisation before you submit. Click **Edit** in the library to change any reference.

## How it's built

See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for the full technical guide: architecture, how each feature works, and how to build, test and release it.

## Credits

PDF reading uses [pdf.js](https://github.com/mozilla/pdf.js) by Mozilla (Apache 2.0 licence), included in `vendor/pdfjs`.
