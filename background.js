// background.js (MV3)

const RECEIPT_STORAGE_KEY = "costcoReceiptsData";
let lastReceipts = [];
let lastOnlineOrders = [];
let lastOnlineOrderDetails = {};
let lastUpdated = null;

function persistReceipts(receipts, onlineOrders, orderDetails) {
  return new Promise((resolve) => {
    const payload = {
      receipts,
      onlineOrders,
      orderDetails,
      updatedAt: Date.now()
    };

    chrome.storage.local.set({ [RECEIPT_STORAGE_KEY]: payload }, () => {
      if (chrome.runtime.lastError) {
        console.warn(
          "Costco Receipts Extension: failed to store receipts",
          chrome.runtime.lastError
        );
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "storeReceipts") {
    lastReceipts = Array.isArray(message.receipts) ? message.receipts : [];
    lastOnlineOrders = Array.isArray(message.onlineOrders)
      ? message.onlineOrders
      : [];
    lastOnlineOrderDetails =
      message.orderDetails && typeof message.orderDetails === "object"
        ? message.orderDetails
        : {};
    lastUpdated = Date.now();

    persistReceipts(
      lastReceipts,
      lastOnlineOrders,
      lastOnlineOrderDetails
    ).then((stored) => {
      if (!stored) {
        sendResponse({ ok: false, error: "Failed to persist receipts" });
        return;
      }

      chrome.tabs.create({
        url: chrome.runtime.getURL("dashboard.html")
      });

      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "getReceipts") {
    chrome.storage.local.get(RECEIPT_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "Costco Receipts Extension: failed loading receipts from storage",
          chrome.runtime.lastError
        );
      }

      const stored = result ? result[RECEIPT_STORAGE_KEY] : null;
      const receipts = Array.isArray(stored?.receipts)
        ? stored.receipts
        : lastReceipts;
      const onlineOrders = Array.isArray(stored?.onlineOrders)
        ? stored.onlineOrders
        : lastOnlineOrders;
      const orderDetails =
        stored?.orderDetails && typeof stored.orderDetails === "object"
          ? stored.orderDetails
          : lastOnlineOrderDetails;
      const updatedAt = stored?.updatedAt || lastUpdated || null;

      sendResponse({
        receipts,
        onlineOrders,
        orderDetails,
        updatedAt
      });
    });
    return true;
  }
});
