import { capture, saveItem, getItems, findExisting } from './lib.js';

const MENU = [
  { id: 'save-page', title: 'Save this page to Lilotech', contexts: ['page', 'link', 'image'] },
  { id: 'save-snippet', title: 'Save highlight to Lilotech', contexts: ['selection'] },
  { id: 'save-abstract', title: 'Save highlight as the Abstract', contexts: ['selection'] },
  { id: 'save-conclusion', title: 'Save highlight as the Conclusion', contexts: ['selection'] },
  { id: 'open-library', title: 'Open my Lilotech library', contexts: ['action', 'page'] },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const m of MENU) chrome.contextMenus.create(m);
  });
});

function flash(tabId, text, color) {
  chrome.action.setBadgeBackgroundColor({ color, tabId });
  chrome.action.setBadgeText({ text, tabId });
  setTimeout(() => chrome.action.setBadgeText({ text: '', tabId }), 2500);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open-library') {
    chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
    return;
  }
  try {
    const data = await capture(tab);
    const items = await getItems();
    const existing = findExisting(items, data.ref);
    const selection = (data.selection || info.selectionText || '').trim();
    const fields = {};
    // Keep anything the user already saved or edited; only fill blanks.
    if (!existing || !existing.abstract) { fields.abstract = data.abstract; fields.abstractSource = data.abstractSource; }
    if (!existing || !existing.conclusion) fields.conclusion = data.conclusion;
    if (info.menuItemId === 'save-snippet') fields.snippet = selection;
    if (info.menuItemId === 'save-abstract') { fields.abstract = selection; fields.abstractSource = 'your highlight'; }
    if (info.menuItemId === 'save-conclusion') fields.conclusion = selection;
    await saveItem(data.ref, fields);
    flash(tab.id, '✓', '#2e7d32');
  } catch (e) {
    console.error('Lilotech save failed', e);
    flash(tab.id, '!', '#c62828');
  }
});
