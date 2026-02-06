// AI Trade Journal - Background Service Worker
// Handles side panel lifecycle and message routing

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
  .catch(() => {});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ onboarding_complete: false });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDE_PANEL') {
    chrome.sidePanel.open({ tabId: sender.tab?.id }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'OPEN_TAB') {
    chrome.tabs.create({ url: message.url }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'GET_EXTENSION_ID') {
    sendResponse({ id: chrome.runtime.id });
    return false;
  }

  return false;
});
