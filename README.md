# Lilotech

A Chrome extension that saves what you read for research:

- the **APA 7 reference** (with italics, ready to paste into Word or Google Docs)
- the **abstract**
- the **conclusion**
- any **highlight** you pick, plus your own **note**

Everything is kept in your own Chrome on your computer. Nothing is uploaded anywhere. The only outside services used are Crossref and DataCite (both free), to look up the reference details from a paper's DOI. PDFs are read on your computer, not uploaded.

## Install it on your Mac (about 2 minutes)

1. Double-click `Lilotech.zip` in your Downloads folder. A folder called `lilotech` appears.
2. Move that `lilotech` folder somewhere it can stay, like your Documents folder. (Chrome loads it from there, so don't delete it later.)
3. Open Chrome, type `chrome://extensions` in the address bar, and press Return.
4. Turn on **Developer mode** (the switch in the top-right corner).
5. Click **Load unpacked** (top-left), choose the `lilotech` folder, and click **Select**.
6. Click the puzzle-piece icon in Chrome's toolbar and click the pin next to **Lilotech**, so its blue book icon is always visible.

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
- For news sites and blogs, Lilotech saves them as web pages and uses the article's summary when there's no real abstract.
- PDFs work best when they print a DOI on the first page, as most journal PDFs do. Without one, Lilotech searches Crossref by the title and only uses a result whose title clearly matches. Scanned PDFs (pictures of pages, with no selectable text) can't be read.
- For a PDF on your Mac opened in Chrome (a `file://` address), use **Add a PDF** in the library instead.
- APA 7 wants article titles in sentence case ("Attention is all you need"). Lilotech keeps the title as the publisher wrote it, so check capitalisation before you submit. Click **Edit** in the library to change any reference.
- After you update the extension files, go to `chrome://extensions` and click the circular reload arrow on Lilotech.

## Credits

PDF reading uses [pdf.js](https://github.com/mozilla/pdf.js) by Mozilla (Apache 2.0 licence), included in `vendor/pdfjs`.
