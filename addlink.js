// Save a paper from a link: a DOI, a doi.org link, an arXiv ID or link, a PDF link, or any web address.
// Runs in the library page, which has the PDF reader.
import { extractPage, finishCapture, parseLink } from './lib.js';
import { capturePdf, readPdf } from './pdfread.js';

export const ALL_SITES = ['https://*/*', 'http://*/*'];

const isPdfBytes = (b) => b && b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

async function fetchPdf(url) {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return isPdfBytes(bytes) ? bytes : null;
  } catch (e) {
    return null;
  }
}

const canRead = (url) => chrome.permissions.contains({ origins: [new URL(url).origin + '/*'] }).catch(() => false);

// Open the link in a background tab, read it like the toolbar button does, then close the tab.
async function readInTab(url, hint) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await new Promise((resolve) => {
      const done = () => { chrome.tabs.onUpdated.removeListener(listen); clearTimeout(timer); resolve(); };
      const listen = (id, info) => { if (id === tab.id && info.status === 'complete') done(); };
      const timer = setTimeout(done, 30000);
      chrome.tabs.onUpdated.addListener(listen);
    });
    const now = await chrome.tabs.get(tab.id);
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage });
    const page = res && res.result;
    if (!page) return null;
    if (page.contentType === 'application/pdf') {
      const bytes = await fetchPdf(now.url);
      return bytes ? capturePdf(bytes, now.url) : null;
    }
    if (!page.doi && hint.doi) page.doi = hint.doi;
    return finishCapture(page);
  } catch (e) {
    console.warn('Lilotech could not read', url, e);
    return null;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// Returns the same shape as capture() in lib.js, or throws an Error with a message for the user.
export async function readLink(input, status = () => {}) {
  const link = parseLink(input);
  if (!link) throw new Error("That doesn't look like a link, DOI or arXiv ID.");
  const allowed = await canRead(link.url);
  let data = null;

  if (link.kind === 'pdf') {
    status('Downloading the PDF…');
    const bytes = allowed ? await fetchPdf(link.url) : null;
    if (bytes) data = await capturePdf(bytes, link.url);
  } else if (allowed) {
    status('Reading the page…');
    data = await readInTab(link.url, link);
  }
  // Without the page, a DOI is still enough for the reference and often the abstract.
  if ((!data || !data.ref.title) && link.doi) {
    status('Looking up the DOI…');
    data = await finishCapture({ doi: link.doi, url: link.kind === 'url' || link.kind === 'pdf' ? link.url : '', authors: [], abstract: '', conclusion: '', selection: '' });
  }
  if (!data || !data.ref.title) {
    throw new Error(allowed ? "Couldn't read that link. Open it in Chrome and use the Lilotech button instead."
      : 'Lilotech needs your OK to read websites before it can save from a link.');
  }
  if (!data.ref.url && link.kind !== 'doi') data.ref.url = link.url;

  // Fill a missing conclusion (and a description-only abstract) from the paper's PDF.
  const pdfUrl = (data.page && data.page.pdfUrl) || link.pdfUrl;
  const needs = !data.conclusion || !data.abstract || /not a formal/.test(data.abstractSource || '');
  if (pdfUrl && needs && !(data.page && data.page.isPdf) && (await canRead(pdfUrl))) {
    status("Reading the paper's PDF…");
    const bytes = await fetchPdf(pdfUrl);
    const pdf = bytes ? await readPdf(bytes, pdfUrl).catch(() => null) : null;
    if (pdf && pdf.conclusion && !data.conclusion) data.conclusion = pdf.conclusion;
    if (pdf && pdf.abstract && (!data.abstract || /not a formal/.test(data.abstractSource || ''))) {
      data.abstract = pdf.abstract;
      data.abstractSource = 'PDF text';
    }
  }
  return data;
}
