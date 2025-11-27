// background.js (MV3)

const RECEIPT_STORAGE_KEY = "costcoReceiptsData";
const ORDER_STATUS_URL = "https://www.costco.com/OrderStatusCmd";
let lastReceipts = [];
let lastWarehouseDetails = {};
let lastOnlineOrders = [];
let lastOnlineOrderDetails = {};
let lastUpdated = null;

function persistReceipts(receipts, warehouseDetails, onlineOrders, orderDetails) {
  return new Promise((resolve) => {
    const payload = {
      receipts,
      warehouseDetails,
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
    lastWarehouseDetails =
      message.warehouseDetails && typeof message.warehouseDetails === "object"
        ? message.warehouseDetails
        : {};
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
      lastWarehouseDetails,
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
      const warehouseDetails =
        stored?.warehouseDetails && typeof stored.warehouseDetails === "object"
          ? stored.warehouseDetails
          : lastWarehouseDetails;
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
        warehouseDetails,
        onlineOrders,
        orderDetails,
        updatedAt
      });
    });
    return true;
  }
});

if (chrome.contextMenus) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      try {
        chrome.contextMenus.create({
          id: "open-costco-order-status",
          title: "Open Costco Order Status",
          contexts: ["action"]
        });
      } catch (err) {
        console.warn("Costco Receipts Extension: could not create context menu", err);
      }
    });
  });

  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === "open-costco-order-status") {
      openOrderStatusTab();
    }
  });
}

if (chrome.action?.onClicked) {
  chrome.action.onClicked.addListener(() => {
    openOrderStatusTab();
  });
}

function openOrderStatusTab() {
  chrome.tabs.create({ url: ORDER_STATUS_URL });
}
