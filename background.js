// background.js (MV3)

let lastReceipts = [];

// Listen for messages from content scripts / dashboard
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "storeReceipts") {
    // Save the receipts in memory
    lastReceipts = Array.isArray(message.receipts) ? message.receipts : [];

    // Open the dashboard tab
    chrome.tabs.create({
      url: chrome.runtime.getURL("dashboard.html")
    });

    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "getReceipts") {
    // Dashboard page asks for the latest receipts
    sendResponse({ receipts: lastReceipts || [] });
    return true;
  }
});