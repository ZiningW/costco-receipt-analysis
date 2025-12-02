// =============================
// Dashboard: Global constants & state
// =============================

// Formatting utilities
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric"
});
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric"
});

// DOM references
const statusEl = document.getElementById("status");
const EXTENSION_STORAGE_KEY = "costcoReceiptsData";
const hasChrome = typeof chrome !== "undefined";
const presetSelect = document.getElementById("datePreset");
const customStartInput = document.getElementById("customStart");
const customEndInput = document.getElementById("customEnd");
const monthSelect = document.getElementById("monthSelect");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
const downloadPngBtn = document.getElementById("downloadPngBtn");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const tabButtons = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");
const topItemsSection = document.getElementById("topItemsSection");
const topItemsSecondarySection = document.getElementById("topItemsSecondarySection");
const allVisitsBody = document.getElementById("allVisitsBody");
const warehouseVisitsBody = document.getElementById("warehouseVisitsBody");
const onlineOrdersBody = document.getElementById("onlineOrdersBody");
const gasTripsBody = document.getElementById("gasTripsBody");
const orderDetailsModal = document.getElementById("orderDetailsModal");
const orderDetailsContent = document.getElementById("orderDetailsContent");
const orderDetailsCloseBtn = document.getElementById("orderDetailsClose");
const chartCanvas = document.getElementById("metricsChart");
const chartControls = document.getElementById("chartControls");
const chartSubtitle = document.getElementById("chartSubtitle");
const chartTooltip = document.getElementById("chartTooltip");
const ROTISSERIE_LABEL = "🍗";
const ROTISSERIE_TOOLTIP = "Rotisserie Chicken";
const ROTISSERIE_CARD_CLASS = "rotisserie-card";

// Chart state
const chartState = {
  canvas: chartCanvas,
  ctx: chartCanvas ? chartCanvas.getContext("2d") : null,
  controls: chartControls,
  subtitle: chartSubtitle,
  tooltipEl: chartTooltip,
  data: null,
  hitRegions: [],
  lastDataset: null,
  currentMetric: {
    all: "allSpent",
    warehouse: "warehouseSpent",
    online: "onlineSpent",
    gas: "gasSpent"
  }
};

// In-memory app data
const appState = {
  activeTab: "all",
  receipts: [],
  onlineOrders: [],
  warehouseDetails: {},
  onlineOrderDetails: {},
  latestSummary: null
};

// Active filters
const filterState = {
  preset: presetSelect ? presetSelect.value : "all",
  customStart: null,
  customEnd: null,
  month: monthSelect ? monthSelect.value || "all" : "all"
};

// =============================
// Performance utilities
// =============================

/**
 * Debounce function to limit how often a function can be called
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Debounced version of applyFilterAndRender for better performance
const debouncedApplyFilterAndRender = debounce(applyFilterAndRender, 150);

// =============================
// Event wiring
// =============================

if (presetSelect) {
  presetSelect.addEventListener("change", (e) => {
    filterState.preset = e.target.value || "all";
    updateCustomInputsDisabled();
    applyFilterAndRender(); // Immediate for preset changes
  });
}

if (customStartInput) {
  customStartInput.addEventListener("change", (e) => {
    filterState.customStart = e.target.value || null;
    if (filterState.preset === "custom") {
      debouncedApplyFilterAndRender();
    }
  });
}

if (customEndInput) {
  customEndInput.addEventListener("change", (e) => {
    filterState.customEnd = e.target.value || null;
    if (filterState.preset === "custom") {
      debouncedApplyFilterAndRender();
    }
  });
}

if (monthSelect) {
  monthSelect.addEventListener("change", (e) => {
    filterState.month = e.target.value || "all";
    applyFilterAndRender(); // Immediate for month changes
  });
}

// Download buttons
if (downloadJsonBtn) {
  downloadJsonBtn.addEventListener("click", () => {
    const filteredReceipts = filterReceipts(appState.receipts);
    const filteredOnline = filterOnlineOrders(appState.onlineOrders);
    const blob = new Blob(
      [JSON.stringify({ receipts: filteredReceipts, onlineOrders: filteredOnline }, null, 2)],
      {
      type: "application/json"
    });
    const link = document.createElement("a");
    const suffixParts = [filterState.preset];
    if (filterState.preset === "custom") {
      suffixParts.push(`${filterState.customStart || "start"}-${filterState.customEnd || "end"}`);
    }
    if (filterState.month && filterState.month !== "all") {
      suffixParts.push(`month-${filterState.month}`);
    }
    const suffix = suffixParts.filter(Boolean).join("_");
    link.download = `costco-receipts-${suffix || "all"}.json`;
    link.href = URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      document.body.removeChild(link);
    }, 0);
  });
}
updateCustomInputsDisabled();
initChartInteractions();

if (downloadPngBtn) {
  downloadPngBtn.addEventListener("click", () => {
    downloadSummaryPng();
  });
}

if (downloadCsvBtn) {
  downloadCsvBtn.addEventListener("click", () => {
    downloadAllDataCsv();
  });
}

const tabModeMap = {
  allTab: "all",
  warehouseTab: "warehouse",
  onlineTab: "online",
  gasTab: "gas"
};

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.getAttribute("data-tab");
    tabButtons.forEach((btn) => btn.classList.toggle("active", btn === button));
    tabContents.forEach((content) => {
      content.classList.toggle("active", content.id === targetId);
    });
    appState.activeTab = tabModeMap[targetId] || "all";
    if (appState.latestSummary) {
      renderSummary(
        appState.latestSummary.summary,
        appState.latestSummary.onlineData,
        appState.latestSummary.gasStats,
        appState.latestSummary.warehouseVisits
      );
      renderTopItemSections(
        appState.latestSummary.itemStats,
        appState.latestSummary.onlineData,
        appState.latestSummary.onlineOrders || []
      );
      renderAllVisits(
        appState.latestSummary.warehouseVisits,
        appState.latestSummary.onlineData.rows,
        appState.latestSummary.gasStats.trips
      );
    }
    updateChartControls();
  });
});

if (onlineOrdersBody) {
  onlineOrdersBody.addEventListener("click", handleVisitRowInteraction);
}

if (allVisitsBody) {
  allVisitsBody.addEventListener("click", handleVisitRowInteraction);
}

if (warehouseVisitsBody) {
  warehouseVisitsBody.addEventListener("click", handleVisitRowInteraction);
}

if (orderDetailsCloseBtn) {
  orderDetailsCloseBtn.addEventListener("click", closeOrderDetailsModal);
}

if (orderDetailsModal) {
  orderDetailsModal.addEventListener("click", (event) => {
    if (event.target === orderDetailsModal || event.target.classList.contains("order-modal__backdrop")) {
      closeOrderDetailsModal();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && orderDetailsModal?.classList.contains("open")) {
    closeOrderDetailsModal();
  }
});

const downloadChartCsvBtn = document.getElementById("downloadChartCsvBtn");
const downloadTripsCsvBtn = document.getElementById("downloadTripsCsvBtn");

if (downloadChartCsvBtn) {
  downloadChartCsvBtn.addEventListener("click", () => {
    downloadCurrentChartCsv();
  });
}

if (downloadTripsCsvBtn) {
  downloadTripsCsvBtn.addEventListener("click", () => {
    downloadTripsCsv();
  });
}

// =============================
// Formatting & parsing helpers
// =============================

function formatMoney(value) {
  return currencyFormatter.format(value || 0);
}

function formatGallons(value) {
  const gallons = Number(value) || 0;
  return gallons.toFixed(2);
}

const GAS_KEYWORDS = ["gasoline", "gas ", "gas-", "gas/", "unleaded", "premium", "diesel", "fuel"];

function isGasItem(item) {
  if (!item) return false;
  const desc = (
    (item.itemDescription01 || "") +
    " " +
    (item.itemDescription02 || "")
  ).toLowerCase();
  return GAS_KEYWORDS.some((keyword) => desc.includes(keyword));
}

function parseReceiptDate(receipt) {
  if (!receipt) return null;
  const raw =
    receipt.transactionDateTime ||
    (receipt.transactionDate ? `${receipt.transactionDate}T00:00:00` : null);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function getMonthKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.valueOf())) return monthKey;
  return monthFormatter.format(date);
}

function formatReceiptDate(receipt) {
  const parsed = parseReceiptDate(receipt);
  return parsed ? dateFormatter.format(parsed) : "—";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatItemCell(name, itemNumber, maxChars) {
  const displayName = name || "Unnamed Item";
  const visibleText =
    maxChars && displayName.length > maxChars
      ? `${displayName.slice(0, maxChars).trim()}…`
      : displayName;
  const truncated = `<strong class="truncate" title="${escapeHtml(displayName)}">${escapeHtml(
    visibleText
  )}</strong>`;
  const code = itemNumber ? `#${escapeHtml(itemNumber)}` : "#–";
  return `${truncated}<br/><span class="status">${code}</span>`;
}

function clearTableBody(bodyId) {
  const el = document.getElementById(bodyId);
  if (el) {
    el.innerHTML = "";
  }
}

function formatReturnCount(count) {
  return (count || 0).toLocaleString();
}

function formatReturnAmount(amount) {
  const value = Number(amount) || 0;
  return `-${formatMoney(value)}`;
}

function buildLocationMapFromVisits(visits) {
  const map = new Map();
  if (!Array.isArray(visits)) return map;
  visits.forEach((visit) => {
    const key = visit.location || "Unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

function parseOnlineOrderDate(order) {
  if (!order) return null;
  const raw = order.orderPlacedDate || order.orderedDate || order.orderPlaced;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function formatInputDate(date) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function getCombinedBounds(receipts, onlineOrders) {
  let start = null;
  let end = null;
  const consider = (date) => {
    if (!date) return;
    if (!start || date < start) start = date;
    if (!end || date > end) end = date;
  };
  if (Array.isArray(receipts)) {
    receipts.forEach((receipt) => consider(parseReceiptDate(receipt)));
  }
  if (Array.isArray(onlineOrders)) {
    onlineOrders.forEach((order) => consider(parseOnlineOrderDate(order)));
  }
  return { start, end };
}

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsvContent(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function downloadCsvFile(filename, rows) {
  if (!rows || !rows.length) return;
  const content = buildCsvContent(rows);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
    document.body.removeChild(link);
  }, 0);
}

// =============================
// Filter helpers
// =============================

function updateCustomInputsDisabled() {
  const isCustom = filterState.preset === "custom";
  if (customStartInput) customStartInput.disabled = !isCustom;
  if (customEndInput) customEndInput.disabled = !isCustom;
}

function updateCustomDateInputs(bounds) {
  if (!customStartInput || !customEndInput) return;
  if (bounds) {
    if (bounds.start) {
      filterState.customStart = filterState.customStart || formatInputDate(bounds.start);
    }
    if (bounds.end) {
      filterState.customEnd = filterState.customEnd || formatInputDate(bounds.end);
    }
  }
  customStartInput.value = filterState.customStart || "";
  customEndInput.value = filterState.customEnd || "";
}

function populateMonthOptions(receipts, onlineOrders) {
  if (!monthSelect) return;
  const previous = filterState.month;
  const monthMap = new Map();
  const addMonth = (date) => {
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap.has(key)) {
      monthMap.set(
        key,
        date.toLocaleString("default", { month: "long", year: "numeric" })
      );
    }
  };
  if (Array.isArray(receipts)) {
    receipts.forEach((receipt) => addMonth(parseReceiptDate(receipt)));
  }
  if (Array.isArray(onlineOrders)) {
    onlineOrders.forEach((order) => addMonth(parseOnlineOrderDate(order)));
  }
  const sortedKeys = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a));
  monthSelect.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "all";
  defaultOption.textContent = "All Months";
  monthSelect.appendChild(defaultOption);
  sortedKeys.forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = monthMap.get(key);
    monthSelect.appendChild(option);
  });
  if (sortedKeys.includes(previous)) {
    monthSelect.value = previous;
    filterState.month = previous;
  } else {
    monthSelect.value = "all";
    filterState.month = "all";
  }
}

function filterReceipts(receipts) {
  if (!Array.isArray(receipts)) return [];
  let filtered = receipts.slice();
  const now = new Date();

  if (filterState.preset === "ytd") {
    const start = new Date(now.getFullYear(), 0, 1);
    filtered = filtered.filter((receipt) => {
      const date = parseReceiptDate(receipt);
      if (!date) return true;
      return date >= start;
    });
  } else if (filterState.preset === "last12") {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    filtered = filtered.filter((receipt) => {
      const date = parseReceiptDate(receipt);
      if (!date) return true;
      return date >= start;
    });
  } else if (filterState.preset === "custom") {
    let startValue = filterState.customStart ? new Date(filterState.customStart) : null;
    let endValue = filterState.customEnd ? new Date(filterState.customEnd) : null;
    if (startValue && Number.isNaN(startValue.valueOf())) startValue = null;
    if (endValue && Number.isNaN(endValue.valueOf())) endValue = null;
    filtered = filtered.filter((receipt) => {
      const date = parseReceiptDate(receipt);
      if (!date) return true;
      if (startValue && date < startValue) return false;
      if (endValue) {
        const endDay = new Date(endValue);
        endDay.setHours(23, 59, 59, 999);
        if (date > endDay) return false;
      }
      return true;
    });
  }

  if (filterState.month && filterState.month !== "all") {
    const [yearStr, monthStr] = filterState.month.split("-");
    const targetYear = Number(yearStr);
    const targetMonth = Number(monthStr) - 1;
    filtered = filtered.filter((receipt) => {
      const date = parseReceiptDate(receipt);
      if (!date || Number.isNaN(targetYear) || Number.isNaN(targetMonth)) return false;
      return date.getFullYear() === targetYear && date.getMonth() === targetMonth;
    });
  }

  return filtered;
}

function filterOnlineOrders(orders) {
  if (!Array.isArray(orders)) return [];
  let filtered = orders.slice();
  const now = new Date();

  if (filterState.preset === "ytd") {
    const start = new Date(now.getFullYear(), 0, 1);
    filtered = filtered.filter((order) => {
      const date = parseOnlineOrderDate(order);
      if (!date) return true;
      return date >= start;
    });
  } else if (filterState.preset === "last12") {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    filtered = filtered.filter((order) => {
      const date = parseOnlineOrderDate(order);
      if (!date) return true;
      return date >= start;
    });
  } else if (filterState.preset === "custom") {
    let startValue = filterState.customStart ? new Date(filterState.customStart) : null;
    let endValue = filterState.customEnd ? new Date(filterState.customEnd) : null;
    if (startValue && Number.isNaN(startValue.valueOf())) startValue = null;
    if (endValue && Number.isNaN(endValue.valueOf())) endValue = null;
    filtered = filtered.filter((order) => {
      const date = parseOnlineOrderDate(order);
      if (!date) return true;
      if (startValue && date < startValue) return false;
      if (endValue) {
        const endDay = new Date(endValue);
        endDay.setHours(23, 59, 59, 999);
        if (date > endDay) return false;
      }
      return true;
    });
  }

  if (filterState.month && filterState.month !== "all") {
    const [yearStr, monthStr] = filterState.month.split("-");
    const targetYear = Number(yearStr);
    const targetMonth = Number(monthStr) - 1;
    filtered = filtered.filter((order) => {
      const date = parseOnlineOrderDate(order);
      if (!date || Number.isNaN(targetYear) || Number.isNaN(targetMonth)) return false;
      return date.getFullYear() === targetYear && date.getMonth() === targetMonth;
    });
  }

  return filtered;
}

// =============================
// Top-level data flow
// =============================

function applyFilterAndRender() {
  const filteredReceipts = filterReceipts(appState.receipts);
  const filteredOnlineOrders = filterOnlineOrders(appState.onlineOrders);
  handleData(filteredReceipts, filteredOnlineOrders);
}

function setData(newReceipts, newWarehouseDetails, newOnlineOrders, newOnlineOrderDetails) {
  appState.receipts = Array.isArray(newReceipts) ? newReceipts : [];
  appState.warehouseDetails =
    newWarehouseDetails && typeof newWarehouseDetails === "object"
      ? newWarehouseDetails
      : {};
  appState.onlineOrders = Array.isArray(newOnlineOrders) ? newOnlineOrders : [];
  appState.onlineOrderDetails =
    newOnlineOrderDetails && typeof newOnlineOrderDetails === "object"
      ? newOnlineOrderDetails
      : {};
  const bounds = getCombinedBounds(appState.receipts, appState.onlineOrders);
  filterState.customStart = bounds.start ? formatInputDate(bounds.start) : null;
  filterState.customEnd = bounds.end ? formatInputDate(bounds.end) : null;
  updateCustomDateInputs(bounds);
  populateMonthOptions(appState.receipts, appState.onlineOrders);
  applyFilterAndRender();
}

function handleData(receipts, onlineOrders) {
  const { itemStats, monthlyWarehouse, summary, gasStats, warehouseVisits } =
    processReceipts(receipts);
  const onlineData = processOnlineOrders(onlineOrders);
  summary.onlineOrderCount = onlineData.totalOrders;
  summary.onlineOrderTotal = onlineData.totalSpent;

  const monthlyData = buildMonthlyDataset(
    monthlyWarehouse,
    onlineData.monthly,
    gasStats.monthly
  );
  setMetricsChartData(monthlyData);

  renderSummary(summary, onlineData, gasStats, warehouseVisits);
  if (appState.latestSummary) {
    appState.latestSummary.itemStats = itemStats;
    appState.latestSummary.onlineOrders = onlineOrders;
    appState.latestSummary.monthlyData = monthlyData;
  } else {
    appState.latestSummary = {
      summary,
      onlineData,
      gasStats,
      warehouseVisits,
      itemStats,
      onlineOrders,
      monthlyData
    };
  }
  renderAllVisits(warehouseVisits, onlineData.rows, gasStats.trips);
  renderWarehouseVisits(warehouseVisits);
  renderTopItemSections(itemStats, onlineData, onlineOrders);
  renderOnlineOrders(onlineData.rows);
  renderGasTrips(gasStats);
}

function buildAllDataCsvRows() {
  const receipts = filterReceipts(appState.receipts);
  const onlineOrders = filterOnlineOrders(appState.onlineOrders);
  const header = [
    "Date",
    "Channel",
    "Location",
    "Number",
    "Item Description",
    "Item Number",
    "Quantity",
    "Unit Price",
    "Total Price",
    "Payment Type"
  ];
  const rows = [header];

  receipts.forEach((receipt) => {
    const date = parseReceiptDate(receipt);
    const dateStr = date ? formatInputDate(date) : "";
    const receiptNumber =
      receipt.transactionBarcode || receipt.transactionNumber || "";
    const location =
      receipt.warehouseName ||
      receipt.warehouseShortName ||
      receipt.warehouseCity ||
      (receipt.warehouseNumber ? `Warehouse #${receipt.warehouseNumber}` : "");
    const tenders = Array.isArray(receipt.tenderArray)
      ? receipt.tenderArray
      : [];
    const paymentType =
      tenders.length > 0
        ? tenders[0].tenderTypeName || tenders[0].tenderDescription || ""
        : "";

    const items = Array.isArray(receipt.itemArray)
      ? receipt.itemArray
      : [];
    items.forEach((item) => {
      const isGas = isGasItem(item);
      const channel = isGas ? "Gas" : "Warehouse";
      const desc = `${item.itemDescription01 || ""} ${
        item.itemDescription02 || ""
      }`.trim();
      const rawUnit = Number(item.unit) || 0;
      let quantity = rawUnit;
      if (isGas) {
        quantity =
          Number(
            item.fuelUnitQuantity != null ? item.fuelUnitQuantity : rawUnit
          ) || 0;
      }
      const total = Number(item.amount) || 0;
      let unitPrice = Number(item.itemUnitPriceAmount);
      if (!unitPrice && quantity) {
        unitPrice = total / quantity;
      }
      rows.push([
        dateStr,
        channel,
        location,
        receiptNumber,
        desc,
        item.itemNumber || "",
        quantity,
        unitPrice,
        total,
        paymentType
      ]);
    });
  });

  onlineOrders.forEach((order) => {
    const date = parseOnlineOrderDate(order);
    const dateStr = date ? formatInputDate(date) : "";
    const orderNumber =
      order.orderNumber ||
      order.sourceOrderNumber ||
      order.orderHeaderId ||
      "";
    const detailKey =
      order.orderNumber ||
      order.sourceOrderNumber ||
      order.orderHeaderId ||
      orderNumber;
    const detail =
      detailKey && appState.onlineOrderDetails
        ? appState.onlineOrderDetails[detailKey]
        : null;

    const shipTos = detail
      ? Array.isArray(detail.shipToAddress)
        ? detail.shipToAddress
        : Array.isArray(detail.orderShipTos)
        ? detail.orderShipTos
        : []
      : [];

    if (shipTos.length) {
      shipTos.forEach((shipTo) => {
        const lineItems = Array.isArray(shipTo.orderLineItems)
          ? shipTo.orderLineItems
          : [];
        lineItems.forEach((item) => {
          const qty = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          const total =
            Number(item.merchandiseTotalAmount) || qty * price || 0;
          const desc =
            item.itemDescription ||
            item.itemDescription01 ||
            item.sourceItemDescription ||
            "";
          rows.push([
            dateStr,
            "Online",
            "",
            orderNumber,
            desc,
            item.itemNumber || item.itemId || "",
            qty,
            price,
            total,
            "" // payment type not per-line
          ]);
        });
      });
    } else {
      const items = Array.isArray(order.orderLineItems)
        ? order.orderLineItems
        : [];
      if (items.length) {
        items.forEach((item) => {
          const desc = item.itemDescription || "";
          const qty = 1;
          rows.push([
            dateStr,
            "Online",
            "",
            orderNumber,
            desc,
            item.itemNumber || item.itemId || "",
            qty,
            null,
            null,
            ""
          ]);
        });
      } else {
        const total = Number(order.orderTotal) || 0;
        rows.push([
          dateStr,
          "Online",
          "",
          orderNumber,
          "Order total",
          "",
          "",
          1,
          total,
          total,
          ""
        ]);
      }
    }
  });

  return rows;
}

function downloadAllDataCsv() {
  const rows = buildAllDataCsvRows();
  if (!rows || rows.length <= 1) return;
  const suffixParts = [filterState.preset];
  if (filterState.preset === "custom") {
    suffixParts.push(
      `${filterState.customStart || "start"}-${
        filterState.customEnd || "end"
      }`
    );
  }
  if (filterState.month && filterState.month !== "all") {
    suffixParts.push(`month-${filterState.month}`);
  }
  const suffix = suffixParts.filter(Boolean).join("_") || "all";
  downloadCsvFile(`costco-receipts-${suffix}.csv`, rows);
}

// =============================
// Aggregation & statistics
// =============================

function monthsBetween(d1, d2) {
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375;
  return Math.abs(d2 - d1) / msPerMonth;
}

function processReceipts(receipts) {
  const itemStats = new Map();
  const gasStats = {
    trips: [],
    totalTrips: 0,
    totalGallons: 0,
    totalCost: 0,
    locationCounts: new Map(),
    dateRange: { start: null, end: null },
    monthly: new Map()
  };
  const dateRange = { start: null, end: null };
  const warehouseVisits = [];
  const monthlyWarehouse = new Map();
  let totalSpent = 0;
  let sumItemAmounts = 0;
  let totalUnits = 0;
  let shoppingReceipts = 0;
  let gasOnlyReceipts = 0;
  let returnCount = 0;
  let returnAmount = 0;
  let totalTax = 0;
  let rotisserieSpent = 0;
  let rotisserieCount = 0;

  receipts.forEach((receipt) => {
    const total = Number(receipt.total) || 0;
    const parsedDate = parseReceiptDate(receipt);
    if (parsedDate) {
      if (!dateRange.start || parsedDate < dateRange.start) {
        dateRange.start = parsedDate;
      }
      if (!dateRange.end || parsedDate > dateRange.end) {
        dateRange.end = parsedDate;
      }
    }

    const items = Array.isArray(receipt.itemArray) ? receipt.itemArray : [];
    const gasItems = [];
    const dateStr =
      receipt.transactionDateTime ||
      (receipt.transactionDate ? `${receipt.transactionDate}T00:00:00` : null);
    const trxDate = dateStr ? new Date(dateStr) : new Date();
    let receiptUnits = 0;
    let receiptRotisserieUnits = 0;

    items.forEach((item) => {
      const unit = Number(item.unit) || 0;
      const amount = Number(item.amount) || 0;

      if (!item.itemNumber || unit <= 0 || amount <= 0) return;

      const isGas = isGasItem(item);
      if (!isGas) {
        const key = `${item.itemNumber}|${(item.itemDescription01 || "").trim()}`;
        const name = (item.itemDescription01 || "").trim();
        let perUnitPrice = Number(item.itemUnitPriceAmount);
        if (!perUnitPrice && unit > 0) {
          perUnitPrice = amount / unit;
        }
        if (!perUnitPrice && unit === 0) {
          perUnitPrice = amount;
        }

        let stat = itemStats.get(key);
        if (!stat) {
          stat = {
            itemNumber: item.itemNumber,
            name,
            totalSpent: 0,
            totalUnits: 0,
            purchases: 0,
            prices: []
          };
          itemStats.set(key, stat);
        }

        stat.totalSpent += amount;
        stat.totalUnits += unit;
        stat.purchases += unit;
        stat.prices.push({ date: trxDate, price: perUnitPrice });
        sumItemAmounts += amount;
        totalUnits += unit;
        receiptUnits += unit;
        if (String(item.itemNumber || "").trim() === "87745") {
          rotisserieSpent += amount;
          rotisserieCount += unit;
          receiptRotisserieUnits += unit;
        }
      }

      if (isGas) {
        gasItems.push(item);
        const location =
          receipt.warehouseName ||
          receipt.warehouseShortName ||
          "Costco Gas";
        const tripDate = parseReceiptDate(receipt);
        const gallons = Number(
          item.fuelUnitQuantity != null ? item.fuelUnitQuantity : unit
        ) || 0;
        const totalPrice = Number(amount) || 0;
        let pricePerGallon = Number(item.itemUnitPriceAmount);
        if (!pricePerGallon && gallons > 0) {
          pricePerGallon = totalPrice / gallons;
        }
        if (gallons > 0 && totalPrice > 0) {
          gasStats.trips.push({
            date: tripDate,
            location,
            gallons,
            totalPrice,
            pricePerGallon,
            transactionNumber: receipt.transactionNumber || receipt.transactionBarcode || ""
          });
          gasStats.totalTrips += 1;
          gasStats.totalGallons += gallons;
          gasStats.totalCost += totalPrice;
          gasStats.locationCounts.set(
            location,
            (gasStats.locationCounts.get(location) || 0) + 1
          );
          if (tripDate) {
            if (!gasStats.dateRange.start || tripDate < gasStats.dateRange.start) {
              gasStats.dateRange.start = tripDate;
            }
            if (!gasStats.dateRange.end || tripDate > gasStats.dateRange.end) {
              gasStats.dateRange.end = tripDate;
            }
          }
          const monthKey = tripDate ? getMonthKey(tripDate) : null;
          if (monthKey) {
            let entry = gasStats.monthly.get(monthKey);
            if (!entry) {
              entry = { spent: 0, trips: 0, totalGallons: 0, locations: new Map() };
              gasStats.monthly.set(monthKey, entry);
            }
            entry.spent += totalPrice;
            entry.trips += 1;
            entry.totalGallons += gallons;
            entry.locations.set(location, (entry.locations.get(location) || 0) + 1);
          }
        }
      }
    });

    if (gasItems.length && gasItems.length === items.length) {
      gasOnlyReceipts += 1;
    } else {
      const location =
        receipt.warehouseName ||
        receipt.warehouseShortName ||
        receipt.warehouseCity ||
        `Warehouse #${receipt.warehouseNumber || "–"}`;
      const isReturn = total < 0;
      const receiptTax = Number(receipt.taxes) || 0;

      warehouseVisits.push({
        date: parsedDate,
        location,
        total,
        barcode: receipt.transactionBarcode || receipt.transactionNumber || "",
        isReturn,
        items: receiptUnits,
        tax: receiptTax
      });

      if (isReturn) {
        returnCount += 1;
        returnAmount += Math.abs(total);
        totalTax -= receiptTax;
      } else {
        shoppingReceipts += 1;
        totalSpent += total;
        totalTax += receiptTax;
        items.forEach((item) => {
          if (isGasItem(item)) return;
          sumItemAmounts += Number(item.amount) || 0;
          totalUnits += Number(item.unit) || 0;
        });

        const monthKey = (receipt.transactionDate || "").slice(0, 7);
        if (monthKey) {
          let entry = monthlyWarehouse.get(monthKey);
          if (!entry) {
            entry = { spent: 0, trips: 0, items: 0, rotisserie: 0, locations: new Map() };
            monthlyWarehouse.set(monthKey, entry);
          }
          entry.spent += total;
          entry.trips += 1;
          entry.items += receiptUnits;
          entry.rotisserie = (entry.rotisserie || 0) + receiptRotisserieUnits;
          entry.locations.set(location, (entry.locations.get(location) || 0) + 1);
        }
      }
    }
  });

  const receiptsCount = receipts.length;
  const uniqueItems = itemStats.size;
  const avgItemPrice = totalUnits > 0 ? sumItemAmounts / totalUnits : 0;
  const avgPerReceipt = shoppingReceipts > 0 ? totalSpent / shoppingReceipts : 0;

  return {
    itemStats,
    monthlyWarehouse,
    gasStats,
    warehouseVisits,
    summary: {
      totalSpent,
      totalUnits,
      receiptsCount,
      shoppingReceipts,
      gasOnlyReceipts,
      uniqueItems,
      avgItemPrice,
      avgPerReceipt,
      returnCount,
      returnAmount,
      gasStatsTotal: gasStats.totalCost,
      totalTax,
      rotisserieSpent,
      rotisserieCount,
      dateRange: {
        start: dateRange.start ? dateFormatter.format(dateRange.start) : null,
        end: dateRange.end ? dateFormatter.format(dateRange.end) : null
      }
    }
  };
}

function processOnlineOrders(orders) {
  const rows = [];
  let totalSpent = 0;
  let totalItems = 0;
  const uniqueItems = new Set();
  const locationCounts = new Map();
  let returnCount = 0;
  let returnAmount = 0;
  let purchaseCount = 0;
  const monthlyTotals = new Map();
  let totalTax = 0;

  if (Array.isArray(orders)) {
    orders.forEach((order) => {
      const total = Number(order.orderTotal) || 0;
      const isReturn = total < 0;

      const detailKey =
        order.orderNumber ||
        order.sourceOrderNumber ||
        order.orderHeaderId ||
        "";
      const detail =
        detailKey && appState.onlineOrderDetails
          ? appState.onlineOrderDetails[detailKey]
          : null;

      let orderTax = 0;
      if (detail && detail.uSTaxTotal1 != null) {
        orderTax = Number(detail.uSTaxTotal1) || 0;
      } else if (order.uSTaxTotal1 != null) {
        orderTax = Number(order.uSTaxTotal1) || 0;
      }

      if (isReturn) {
        returnCount += 1;
        returnAmount += Math.abs(total);
        totalTax -= orderTax;
      } else {
        totalSpent += total;
        purchaseCount += 1;
        totalTax += orderTax;
      }
      const location = "Online";
      if (!isReturn) {
        locationCounts.set(location, (locationCounts.get(location) || 0) + 1);
      }

      const itemList = Array.isArray(order.orderLineItems)
        ? order.orderLineItems
        : [];
      if (!isReturn) {
        totalItems += itemList.length;
        itemList.forEach((item) => {
          if (item.itemNumber) {
            uniqueItems.add(item.itemNumber);
          } else if (item.itemId) {
            uniqueItems.add(item.itemId);
          }
        });
        const date = parseOnlineOrderDate(order);
        const monthKey = date ? getMonthKey(date) : null;
        if (monthKey) {
          let entry = monthlyTotals.get(monthKey);
          if (!entry) {
            entry = { spent: 0, orders: 0, items: 0 };
            monthlyTotals.set(monthKey, entry);
          }
          entry.spent += total;
          entry.orders += 1;
          entry.items += itemList.length;
        }
      }

      rows.push({
        date: parseOnlineOrderDate(order),
        orderNumber:
          order.orderNumber ||
          order.sourceOrderNumber ||
          order.orderHeaderId ||
          "—",
        status: order.status || "",
        total,
        location,
        isReturn,
        items: itemList.length,
        tax: orderTax
      });
    });
  }

  const dateStart = earliestDate(rows.map((r) => r.date));
  const dateEnd = latestDate(rows.map((r) => r.date));

  return {
    totalOrders: purchaseCount,
    totalSpent,
    totalItems,
    uniqueItems: uniqueItems.size,
    locationCounts,
    returnCount,
    returnAmount,
    monthly: monthlyTotals,
    totalTax,
    dateRangeText: {
      start: dateStart ? dateFormatter.format(dateStart) : null,
      end: dateEnd ? dateFormatter.format(dateEnd) : null
    },
    rows
  };
}

function renderSummary(summary, onlineData, gasStats, warehouseVisits) {
  appState.latestSummary = {
    summary,
    onlineData,
    gasStats,
    warehouseVisits,
    itemStats: appState.latestSummary?.itemStats,
    onlineOrders: appState.latestSummary?.onlineOrders,
    monthlyData: appState.latestSummary?.monthlyData
  };
  const summaryGrid = document.getElementById("summaryGrid");
  const topLocationsEl = document.getElementById("globalTopLocations");
  const coverageEl = document.getElementById("dataCoverage");
  if (!summaryGrid || !topLocationsEl) {
    return;
  }

  summaryGrid.innerHTML = "";

  const warehouseLocationMap = buildLocationMapFromVisits(warehouseVisits);
  const onlineLocationMap = onlineData.locationCounts || new Map();
  const gasLocationMap = gasStats?.locationCounts || new Map();

  const { cards, locations, coverage } = buildSummaryCards(
    appState.activeTab,
    summary,
    onlineData,
    gasStats,
    warehouseLocationMap,
    onlineLocationMap,
    gasLocationMap
  );

  cards.forEach(({ label, value, sub, negative, className, title }) => {
    const card = document.createElement("div");
    card.className = className ? `summary-card ${className}` : "summary-card";
    const labelEl = document.createElement("div");
    labelEl.className = "label";
    labelEl.textContent = label;
    if (title) {
      labelEl.title = title;
      card.title = title;
    }
    const valueEl = document.createElement("div");
    valueEl.className = negative ? "value negative" : "value";
    valueEl.textContent = value;
    card.appendChild(labelEl);
    card.appendChild(valueEl);
    if (sub) {
      const subEl = document.createElement("div");
      subEl.className = "sub";
      subEl.textContent = sub;
      card.appendChild(subEl);
    }
    summaryGrid.appendChild(card);
  });

  renderTopLocationsPills(locations, appState.activeTab === "online");
  if (coverageEl) {
    coverageEl.textContent = coverage || "";
  }

}

function buildSummaryCards(
  tab,
  summary,
  onlineData,
  gasStats,
  warehouseLocations,
  onlineLocations,
  gasLocations
) {
  let cards = [];
  let locations = new Map();
  let coverage = "";

  const netWarehouseSpent =
    summary.totalSpent - (summary.returnAmount || 0);
  const netOnlineSpent =
    onlineData.totalSpent - (onlineData.returnAmount || 0);

  if (tab === "warehouse") {
    cards = [
      { label: "Trips", value: summary.shoppingReceipts.toLocaleString() },
      {
        label: "Total Spent (incl. tax)",
        value: `${formatMoney(netWarehouseSpent)}`,
        sub: `Tax: ${formatMoney(summary.totalTax || 0)}`
      },
      {
        label: "Items",
        value: summary.totalUnits.toLocaleString(),
        sub: `${summary.uniqueItems.toLocaleString()} unique`
      },
      { label: "Avg Item Price", value: formatMoney(summary.avgItemPrice) },
      { label: "Avg Per Receipt", value: formatMoney(summary.avgPerReceipt) },
      {
        label: "Returns",
        value: formatReturnAmount(summary.returnAmount),
        sub: `${formatReturnCount(summary.returnCount)} returns`,
        negative: true
      },
      {
        label: ROTISSERIE_LABEL,
        value: formatMoney(summary.rotisserieSpent || 0),
        sub: `${(summary.rotisserieCount || 0).toLocaleString()} purchased`,
        title: ROTISSERIE_TOOLTIP,
        className: ROTISSERIE_CARD_CLASS
      }
    ];
    locations = warehouseLocations;
    coverage = buildCoverageText(
      summary.dateRange?.start,
      summary.dateRange?.end
    );
  } else if (tab === "online") {
    const totalItems = onlineData.totalItems || 0;
    const uniqueItems = onlineData.uniqueItems || 0;
    const avgItemPrice =
      totalItems > 0 ? formatMoney(netOnlineSpent / totalItems) : formatMoney(0);
    const avgPerOrder =
      onlineData.totalOrders > 0
        ? formatMoney(netOnlineSpent / onlineData.totalOrders)
        : formatMoney(0);
    cards = [
      { label: "Orders", value: onlineData.totalOrders.toLocaleString() },
      {
        label: "Total Spent (incl. tax)",
        value: `${formatMoney(netOnlineSpent)}`,
        sub: `Tax: ${formatMoney(onlineData.totalTax || 0)}`
      },
      {
        label: "Items",
        value: totalItems.toLocaleString(),
        sub: `${uniqueItems.toLocaleString()} unique`
      },
      { label: "Avg Item Price", value: avgItemPrice },
      { label: "Avg Per Receipt", value: avgPerOrder },
      {
        label: "Returns",
        value: formatReturnAmount(onlineData.returnAmount),
        sub: `${formatReturnCount(onlineData.returnCount)} returns`,
        negative: true
      }
    ];
    locations = onlineLocations;
    coverage = buildCoverageText(
      onlineData.dateRangeText?.start,
      onlineData.dateRangeText?.end
    );
  } else if (tab === "gas") {
    const avgPrice =
      gasStats.totalGallons > 0 ? gasStats.totalCost / gasStats.totalGallons : 0;
    cards = [
      { label: "Fill-ups", value: gasStats.totalTrips.toLocaleString() },
      { label: "Total Gallons", value: formatGallons(gasStats.totalGallons) },
      { label: "Total Cost", value: formatMoney(gasStats.totalCost) },
      { label: "Avg Price / Gallon", value: formatMoney(avgPrice) }
    ];
    locations = gasLocations;
    coverage = buildCoverageText(
      gasStats?.dateRange?.start ? dateFormatter.format(gasStats.dateRange.start) : null,
      gasStats?.dateRange?.end ? dateFormatter.format(gasStats.dateRange.end) : null
    );
  } else {
    const totalTrips =
      summary.shoppingReceipts + gasStats.totalTrips + onlineData.totalOrders;
    const totalSpentAll =
      netWarehouseSpent + gasStats.totalCost + netOnlineSpent;
    const avgPerTrip = totalTrips > 0 ? totalSpentAll / totalTrips : 0;
    const totalTax =
      (summary.totalTax || 0) + (onlineData.totalTax || 0);
    cards = [
      { label: "Trips", value: totalTrips.toLocaleString() },
      {
        label: "Total Spent (incl. tax)",
        value: `${formatMoney(totalSpentAll)}`,
        sub: `Tax: ${formatMoney(totalTax)}`
      },
      { label: "Average per Trip", value: formatMoney(avgPerTrip) },
      {
        label: "Returns",
        value: formatReturnAmount((summary.returnAmount || 0) + (onlineData.returnAmount || 0)),
        sub: `${formatReturnCount((summary.returnCount || 0) + (onlineData.returnCount || 0))} returns`,
        negative: true
      },
      {
        label: ROTISSERIE_LABEL,
        value: formatMoney(summary.rotisserieSpent || 0),
        sub: `${(summary.rotisserieCount || 0).toLocaleString()} purchased`,
        title: ROTISSERIE_TOOLTIP,
        className: ROTISSERIE_CARD_CLASS
      }
    ];
    locations = mergeLocationMaps([
      warehouseLocations,
      onlineLocations,
      gasLocations
    ]);
    const allStart = earliestDate([
      summary.dateRange?.start ? new Date(summary.dateRange.start) : null,
      onlineData.dateRange?.start,
      gasStats?.dateRange?.start
    ]);
    const allEnd = latestDate([
      summary.dateRange?.end ? new Date(summary.dateRange.end) : null,
      onlineData.dateRange?.end,
      gasStats?.dateRange?.end
    ]);
    coverage = buildCoverageText(
      allStart ? dateFormatter.format(allStart) : null,
      allEnd ? dateFormatter.format(allEnd) : null
    );
  }

  return { cards, locations, coverage };
}

function mergeLocationMaps(maps) {
  const combined = new Map();
  maps.forEach((map) => {
    if (!map) return;
    Array.from(map.entries()).forEach(([key, value]) => {
      combined.set(key, (combined.get(key) || 0) + value);
    });
  });
  return combined;
}

function renderTopLocationsPills(map, hidden) {
  const container = document.getElementById("globalTopLocations");
  if (!container) return;
  container.innerHTML = "";
  container.parentElement.style.display = hidden ? "none" : "block";
  if (hidden) return;
  const entries = map ? Array.from(map.entries()) : [];
  if (!entries.length) {
    const li = document.createElement("li");
    li.textContent = "No locations yet.";
    container.appendChild(li);
    return;
  }
  entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .forEach(([name, count]) => {
      const li = document.createElement("li");
      li.innerHTML = `${name}<span>${count}×</span>`;
      container.appendChild(li);
    });
}

function earliestDate(dates) {
  const filtered = dates.filter(
    (d) => d instanceof Date && !Number.isNaN(d.valueOf())
  );
  if (!filtered.length) return null;
  return filtered.sort((a, b) => a - b)[0];
}

function latestDate(dates) {
  const filtered = dates.filter(
    (d) => d instanceof Date && !Number.isNaN(d.valueOf())
  );
  if (!filtered.length) return null;
  return filtered.sort((a, b) => b - a)[0];
}

function buildCoverageText(start, end) {
  if (!start || !end) return "Date coverage unavailable.";
  return `Showing data from ${start} → ${end}`;
}

function renderMostTotalSpent(itemStats, nameCharLimit) {
  const tbody = document.getElementById("mostTotalSpentBody");
  tbody.innerHTML = "";

  const rows = Array.from(itemStats.values())
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 10);

  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");

    const rankTd = document.createElement("td");
    rankTd.textContent = idx + 1;
    tr.appendChild(rankTd);

    const itemTd = document.createElement("td");
    itemTd.innerHTML = formatItemCell(row.name, row.itemNumber, nameCharLimit);
    tr.appendChild(itemTd);

    const totalTd = document.createElement("td");
    totalTd.className = "money";
    totalTd.textContent = formatMoney(row.totalSpent);
    tr.appendChild(totalTd);

    const timesTd = document.createElement("td");
    timesTd.textContent = `${row.purchases}×`;
    tr.appendChild(timesTd);

    const avgTd = document.createElement("td");
    avgTd.className = "money";
    avgTd.textContent = formatMoney(row.totalSpent / row.purchases);
    tr.appendChild(avgTd);

    tbody.appendChild(tr);
  });
}

function renderMostPurchased(itemStats, nameCharLimit) {
  const tbody = document.getElementById("mostPurchasedBody");
  tbody.innerHTML = "";

  const rows = Array.from(itemStats.values())
    .sort((a, b) => b.purchases - a.purchases)
    .slice(0, 10);

  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");

    const rankTd = document.createElement("td");
    rankTd.textContent = idx + 1;
    tr.appendChild(rankTd);

    const itemTd = document.createElement("td");
    itemTd.innerHTML = formatItemCell(row.name, row.itemNumber, nameCharLimit);
    tr.appendChild(itemTd);

    const timesTd = document.createElement("td");
    timesTd.textContent = `${row.purchases}×`;
    tr.appendChild(timesTd);

    const avgTd = document.createElement("td");
    avgTd.className = "money";
    avgTd.textContent = formatMoney(row.totalSpent / row.purchases);
    tr.appendChild(avgTd);

    let min = Infinity;
    let max = -Infinity;
    row.prices.forEach((p) => {
      if (p.price < min) min = p.price;
      if (p.price > max) max = p.price;
    });

    const minMaxTd = document.createElement("td");
    minMaxTd.className = "money";
    minMaxTd.innerHTML = `${formatMoney(min)} → ${formatMoney(max)}`;
    tr.appendChild(minMaxTd);

    const incPct = min > 0 ? ((max - min) / min) * 100 : 0;
    const pctTd = document.createElement("td");
    pctTd.className = incPct > 0 ? "pos" : "status";
    pctTd.textContent = incPct > 0 ? `+${incPct.toFixed(1)}%` : "0%";
    tr.appendChild(pctTd);

    tbody.appendChild(tr);
  });
}

function renderMostExpensive(itemStats, nameCharLimit) {
  const tbody = document.getElementById("mostExpensiveBody");
  tbody.innerHTML = "";

  const rows = Array.from(itemStats.values())
    .filter((s) => s.purchases >= 3)
    .map((s) => {
      const avg = s.totalSpent / s.purchases;
      const max = s.prices.reduce((m, p) => Math.max(m, p.price), 0);
      return { ...s, avgPrice: avg, maxPrice: max };
    })
    .sort((a, b) => b.avgPrice - a.avgPrice)
    .slice(0, 10);

  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");

    const rankTd = document.createElement("td");
    rankTd.textContent = idx + 1;
    tr.appendChild(rankTd);

    const itemTd = document.createElement("td");
    itemTd.innerHTML = formatItemCell(row.name, row.itemNumber, nameCharLimit);
    tr.appendChild(itemTd);

    const avgTd = document.createElement("td");
    avgTd.className = "money";
    avgTd.textContent = formatMoney(row.avgPrice);
    tr.appendChild(avgTd);

    const maxTd = document.createElement("td");
    maxTd.className = "money";
    maxTd.textContent = formatMoney(row.maxPrice);
    tr.appendChild(maxTd);

    const purchasesTd = document.createElement("td");
    purchasesTd.textContent = `${row.purchases}×`;
    tr.appendChild(purchasesTd);

    tbody.appendChild(tr);
  });
}

function renderPriceIncreases(itemStats, nameCharLimit) {
  const tbody = document.getElementById("priceIncreaseBody");
  tbody.innerHTML = "";

  const rows = [];

  itemStats.forEach((s) => {
    if (s.prices.length < 2) return;

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let minDate = null;
    let maxDate = null;

    s.prices.forEach((p) => {
      if (p.price < minPrice) {
        minPrice = p.price;
        minDate = p.date;
      }
      if (p.price > maxPrice) {
        maxPrice = p.price;
        maxDate = p.date;
      }
    });

    const increase = maxPrice - minPrice;
    if (increase <= 0.01 || !minDate || !maxDate) return;

    const months = monthsBetween(minDate, maxDate);
    if (months < 0.01) return;
    if (["155", "712309"].includes(String(s.itemNumber))) return;

    rows.push({
      name: s.name,
      itemNumber: s.itemNumber,
      minPrice,
      maxPrice,
      increase,
      months,
      ratePerMonth: increase / months
    });
  });

  rows
    .sort((a, b) => b.increase - a.increase)
    .slice(0, 10)
    .forEach((row, idx) => {
      const tr = document.createElement("tr");

      const rankTd = document.createElement("td");
      rankTd.textContent = idx + 1;
      tr.appendChild(rankTd);

    const itemTd = document.createElement("td");
    itemTd.innerHTML = formatItemCell(row.name, row.itemNumber, nameCharLimit);
    tr.appendChild(itemTd);

      const minMaxTd = document.createElement("td");
      minMaxTd.className = "money";
      minMaxTd.innerHTML =
        `${formatMoney(row.minPrice)} → ${formatMoney(row.maxPrice)}`;
      tr.appendChild(minMaxTd);

      const incTd = document.createElement("td");
      incTd.className = "money pos";
      incTd.textContent = `+${formatMoney(row.increase)}`;
      tr.appendChild(incTd);

      const periodTd = document.createElement("td");
      periodTd.textContent = `${row.months.toFixed(1)} months`;
      tr.appendChild(periodTd);

      const rateTd = document.createElement("td");
      rateTd.className = "money pos";
      rateTd.textContent = `+${formatMoney(row.ratePerMonth)}/mo`;
      tr.appendChild(rateTd);

      tbody.appendChild(tr);
    });
}

function renderGasSummary(gasStats) {
  const trips = gasStats?.totalTrips || 0;
  const gallons = gasStats?.totalGallons || 0;
  const cost = gasStats?.totalCost || 0;
  const avg = gallons > 0 ? cost / gallons : 0;

  // No longer rendering dedicated gas summary card; gas stats displayed via
  // summary cards based on the active tab.
}

function renderGasTrips(gasStats) {
  if (!gasTripsBody) return;
  gasTripsBody.innerHTML = "";

  const trips = gasStats?.trips || [];
  if (!trips.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "status";
    td.textContent = "No gas trips yet.";
    tr.appendChild(td);
    gasTripsBody.appendChild(tr);
    return;
  }

  trips
    .slice()
    .sort((a, b) => {
      const dateA = a.date || new Date(0);
      const dateB = b.date || new Date(0);
      return dateB - dateA;
    })
    .forEach((trip, idx) => {
      const tr = document.createElement("tr");

      const rankTd = document.createElement("td");
      rankTd.textContent = idx + 1;
      tr.appendChild(rankTd);

      const dateTd = document.createElement("td");
      dateTd.textContent = trip.date
        ? dateFormatter.format(trip.date)
        : "—";
      tr.appendChild(dateTd);

      const locationTd = document.createElement("td");
      locationTd.innerHTML = `<strong>${trip.location || "Gas Station"}</strong>${
        trip.transactionNumber
          ? `<br/><span class="status">#${trip.transactionNumber}</span>`
          : ""
      }`;
      tr.appendChild(locationTd);

      const gallonsTd = document.createElement("td");
      gallonsTd.textContent = formatGallons(trip.gallons);
      tr.appendChild(gallonsTd);

      const priceTd = document.createElement("td");
      priceTd.className = "money";
      priceTd.textContent = formatMoney(trip.pricePerGallon);
      tr.appendChild(priceTd);

      const totalTd = document.createElement("td");
      totalTd.className = "money";
      totalTd.textContent = formatMoney(trip.totalPrice);
      tr.appendChild(totalTd);

      gasTripsBody.appendChild(tr);
    });
}

function renderWarehouseVisits(rows) {
  if (!warehouseVisitsBody) return;
  warehouseVisitsBody.innerHTML = "";

  if (!rows || !rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "status";
    td.textContent = "No warehouse trips in this range.";
    tr.appendChild(td);
    warehouseVisitsBody.appendChild(tr);
    return;
  }

  rows
    .slice()
    .sort((a, b) => {
      const dateA = a.date || new Date(0);
      const dateB = b.date || new Date(0);
      return dateB - dateA;
    })
    .forEach((visit) => {
      const tr = document.createElement("tr");
      if (visit.barcode) {
        tr.dataset.receiptBarcode = visit.barcode;
        tr.classList.add("clickable-row");
        tr.title = "Click to view receipt details";
      }

      const dateTd = document.createElement("td");
      dateTd.textContent = visit.date ? dateFormatter.format(visit.date) : "—";
      tr.appendChild(dateTd);

      const locationTd = document.createElement("td");
      locationTd.textContent = visit.location || "—";
      tr.appendChild(locationTd);

      const itemsTd = document.createElement("td");
      itemsTd.textContent =
        typeof visit.items === "number"
          ? visit.items.toLocaleString()
          : "—";
      tr.appendChild(itemsTd);

      const taxTd = document.createElement("td");
      taxTd.className = "money";
      taxTd.textContent =
        typeof visit.tax === "number" ? formatMoney(visit.tax) : formatMoney(0);
      tr.appendChild(taxTd);

      const totalTd = document.createElement("td");
      totalTd.className = "money";
      totalTd.textContent = formatMoney(visit.total);
      tr.appendChild(totalTd);

      warehouseVisitsBody.appendChild(tr);
    });
}

function renderOnlineOrders(rows) {
  if (!onlineOrdersBody) return;
  onlineOrdersBody.innerHTML = "";

  if (!rows || !rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "status";
    td.textContent = "No online orders in this range.";
    tr.appendChild(td);
    onlineOrdersBody.appendChild(tr);
    return;
  }

  rows
    .slice()
    .sort((a, b) => {
      const dateA = a.date || new Date(0);
      const dateB = b.date || new Date(0);
      return dateB - dateA;
    })
    .forEach((order) => {
      const tr = document.createElement("tr");
      if (order.orderNumber) {
        tr.dataset.orderNumber = order.orderNumber;
        tr.classList.add("clickable-row");
        tr.title = "Click to view order details";
      }

      const dateTd = document.createElement("td");
      dateTd.textContent = order.date ? dateFormatter.format(order.date) : "—";
      tr.appendChild(dateTd);

      const numberTd = document.createElement("td");
      numberTd.textContent = order.orderNumber;
      tr.appendChild(numberTd);

      const statusTd = document.createElement("td");
      statusTd.textContent = order.status || "—";
      tr.appendChild(statusTd);

      const itemsTd = document.createElement("td");
      itemsTd.textContent =
        typeof order.items === "number"
          ? order.items.toLocaleString()
          : "—";
      tr.appendChild(itemsTd);

      const taxTd = document.createElement("td");
      taxTd.className = "money";
      taxTd.textContent =
        typeof order.tax === "number" ? formatMoney(order.tax) : formatMoney(0);
      tr.appendChild(taxTd);

      const totalTd = document.createElement("td");
      totalTd.className = "money";
      totalTd.textContent = formatMoney(order.total);
      tr.appendChild(totalTd);

      onlineOrdersBody.appendChild(tr);
    });
}

function renderAllVisits(warehouseVisits, onlineOrders, gasTrips) {
  if (!allVisitsBody) return;
  allVisitsBody.innerHTML = "";

  const entries = [];

  (warehouseVisits || []).forEach((visit) => {
    entries.push({
      date: visit.date,
      channel: "Warehouse",
      location: visit.location || "—",
      items: typeof visit.items === "number" ? visit.items : null,
      gallons: null,
      tax: typeof visit.tax === "number" ? visit.tax : null,
      pricePerGal: null,
      total: visit.total,
      receiptBarcode: visit.barcode
    });
  });

  (onlineOrders || []).forEach((order) => {
    entries.push({
      date: order.date,
      channel: "Online",
      location: order.location || `Order #${order.orderNumber}`,
      items: typeof order.items === "number" ? order.items : null,
      gallons: null,
      tax: typeof order.tax === "number" ? order.tax : null,
      pricePerGal: null,
      total: order.total,
      orderNumber: order.orderNumber
    });
  });

  (gasTrips || []).forEach((trip) => {
    entries.push({
      date: trip.date,
      channel: "Gas",
      location: trip.location || "Gas Station",
      items: null,
      gallons: typeof trip.gallons === "number" ? trip.gallons : null,
      tax: null,
      pricePerGal:
        typeof trip.pricePerGallon === "number" ? trip.pricePerGallon : null,
      total: trip.totalPrice
    });
  });

  if (!entries.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "status";
    td.textContent = "No trips found in this range.";
    tr.appendChild(td);
    allVisitsBody.appendChild(tr);
    return;
  }

  entries
    .sort((a, b) => {
      const dateA = a.date || new Date(0);
      const dateB = b.date || new Date(0);
      return dateB - dateA;
    })
    .forEach((entry) => {
      const tr = document.createElement("tr");
      if (entry.orderNumber) {
        tr.dataset.orderNumber = entry.orderNumber;
        tr.classList.add("clickable-row");
        tr.title = "Click to view order details";
      } else if (entry.receiptBarcode) {
        tr.dataset.receiptBarcode = entry.receiptBarcode;
        tr.classList.add("clickable-row");
        tr.title = "Click to view receipt details";
      }

      const dateTd = document.createElement("td");
      dateTd.textContent = entry.date ? dateFormatter.format(entry.date) : "—";
      tr.appendChild(dateTd);

      const channelTd = document.createElement("td");
      channelTd.textContent = entry.channel;
      tr.appendChild(channelTd);

      const locationTd = document.createElement("td");
      locationTd.textContent = entry.location || "—";
      tr.appendChild(locationTd);

      const itemsTd = document.createElement("td");
      itemsTd.textContent =
        typeof entry.items === "number"
          ? entry.items.toLocaleString()
          : "—";
      tr.appendChild(itemsTd);

      const gallonsTd = document.createElement("td");
      gallonsTd.textContent =
        typeof entry.gallons === "number"
          ? formatGallons(entry.gallons)
          : "—";
      tr.appendChild(gallonsTd);

      const taxTd = document.createElement("td");
      taxTd.className = "money";
      taxTd.textContent =
        typeof entry.tax === "number"
          ? formatMoney(entry.tax)
          : formatMoney(0);
      tr.appendChild(taxTd);

      const priceGalTd = document.createElement("td");
      priceGalTd.className = "money";
      priceGalTd.textContent =
        typeof entry.pricePerGal === "number"
          ? formatMoney(entry.pricePerGal)
          : "—";
      tr.appendChild(priceGalTd);

      const totalTd = document.createElement("td");
      totalTd.className = "money";
      totalTd.textContent = formatMoney(entry.total);
      tr.appendChild(totalTd);

      allVisitsBody.appendChild(tr);
    });
}

function buildTripsCsvRows() {
  const rows = [
    [
      "Date",
      "Channel",
      "Location",
      "Number",
      "Items/Gallons",
      "Tax",
      "Price / Gal",
      "Total"
    ]
  ];

  const { latestSummary } = appState;
  if (!latestSummary) return rows;

  const { warehouseVisits, onlineData, gasStats } = latestSummary;

  if (appState.activeTab === "warehouse" || appState.activeTab === "all") {
    (warehouseVisits || []).forEach((visit) => {
      rows.push([
        visit.date ? formatInputDate(visit.date) : "",
        "Warehouse",
        visit.location || "",
        visit.barcode || "",
        visit.items != null ? visit.items : "",
        visit.tax != null ? visit.tax : "",
        "",
        visit.total != null ? visit.total : ""
      ]);
    });
  }

  if (appState.activeTab === "online" || appState.activeTab === "all") {
    (onlineData?.rows || []).forEach((order) => {
      rows.push([
        order.date ? formatInputDate(order.date) : "",
        "Online",
        order.location || "",
        order.orderNumber || "",
        order.items != null ? order.items : "",
        order.tax != null ? order.tax : "",
        "",
        order.total != null ? order.total : ""
      ]);
    });
  }

  if (appState.activeTab === "gas" || appState.activeTab === "all") {
    (gasStats?.trips || []).forEach((trip) => {
      const gallons =
        typeof trip.gallons === "number" ? trip.gallons : null;
      const total =
        typeof trip.totalPrice === "number" ? trip.totalPrice : null;
      const pricePerGal =
        typeof trip.pricePerGallon === "number"
          ? trip.pricePerGallon
          : gallons && total
          ? total / gallons
          : null;
      rows.push([
        trip.date ? formatInputDate(trip.date) : "",
        "Gas",
        trip.location || "",
        trip.transactionNumber || "",
        gallons != null ? gallons : "",
        "",
        pricePerGal != null ? pricePerGal : "",
        total != null ? total : ""
      ]);
    });
  }

  return rows;
}

function downloadTripsCsv() {
  const rows = buildTripsCsvRows();
  if (!rows || rows.length <= 1) return;
  downloadCsvFile(`costco-trips-${appState.activeTab || "all"}.csv`, rows);
}

const STACK_COLORS = ["#2563eb", "#0ea5e9", "#a855f7", "#f97316", "#f43f5e"];
const CHART_SUBTITLES = {
  all: "All spending channels combined.",
  warehouse: "Warehouse purchases only.",
  online: "Online orders only.",
  gas: "Gas station activity."
};
const CHART_METRICS = {
  all: [
    { id: "allSpent", label: "Monthly Spend", builder: (data) => buildSimpleSeries(data.all, (entry) => entry.spent, formatMoney) },
    {
      id: "allTrips",
      label: "Trips per Month",
      builder: (data) =>
        buildSimpleSeries(data.all, (entry) => entry.trips, formatNumber, { integerTicks: true })
    },
    {
      id: "allItems",
      label: "Items per Month",
      builder: (data) =>
        buildSimpleSeries(data.all, (entry) => entry.items, formatNumber, { integerTicks: true })
    },
    { id: "allWarehouses", label: "Warehouses Visited", builder: (data) => buildWarehouseStackedSeries(data.warehouse) },
    {
      id: "allAvg",
      label: "Avg Spend per Trip",
      builder: (data) => buildAverageSeries(data.all, (entry) => entry.spent, (entry) => entry.trips, formatMoney)
    },
    {
      id: "allRotisserie",
      label: ROTISSERIE_LABEL,
      tooltip: ROTISSERIE_TOOLTIP,
      isRotisserie: true,
      builder: (data) =>
        buildSimpleSeries(data.all, (entry) => entry.rotisserie || 0, formatNumber, {
          integerTicks: true
        })
    }
  ],
  warehouse: [
    { id: "warehouseSpent", label: "Monthly Spend", builder: (data) => buildSimpleSeries(data.warehouse, (entry) => entry.spent, formatMoney) },
    {
      id: "warehouseTrips",
      label: "Trips per Month",
      builder: (data) =>
        buildSimpleSeries(data.warehouse, (entry) => entry.trips, formatNumber, { integerTicks: true })
    },
    {
      id: "warehouseItems",
      label: "Items per Month",
      builder: (data) =>
        buildSimpleSeries(data.warehouse, (entry) => entry.items, formatNumber, { integerTicks: true })
    },
    { id: "warehouseWarehouses", label: "Warehouses Visited", builder: (data) => buildWarehouseStackedSeries(data.warehouse) },
    {
      id: "warehouseAvg",
      label: "Avg Spend per Trip",
      builder: (data) => buildAverageSeries(data.warehouse, (entry) => entry.spent, (entry) => entry.trips, formatMoney)
    },
    {
      id: "warehouseRotisserie",
      label: ROTISSERIE_LABEL,
      tooltip: ROTISSERIE_TOOLTIP,
      isRotisserie: true,
      builder: (data) =>
        buildSimpleSeries(data.warehouse, (entry) => entry.rotisserie || 0, formatNumber, {
          integerTicks: true
        })
    }
  ],
  online: [
    { id: "onlineSpent", label: "Monthly Spend", builder: (data) => buildSimpleSeries(data.online, (entry) => entry.spent, formatMoney) },
    {
      id: "onlineOrders",
      label: "Orders per Month",
      builder: (data) =>
        buildSimpleSeries(data.online, (entry) => entry.orders, formatNumber, { integerTicks: true })
    },
    {
      id: "onlineItems",
      label: "Items per Month",
      builder: (data) =>
        buildSimpleSeries(data.online, (entry) => entry.items, formatNumber, { integerTicks: true })
    },
    {
      id: "onlineAvg",
      label: "Avg Spend per Order",
      builder: (data) => buildAverageSeries(data.online, (entry) => entry.spent, (entry) => entry.orders, formatMoney)
    }
  ],
  gas: [
    { id: "gasSpent", label: "Monthly Spend", builder: (data) => buildSimpleSeries(data.gas, (entry) => entry.spent, formatMoney) },
    {
      id: "gasTrips",
      label: "Refuels per Month",
      builder: (data) =>
        buildSimpleSeries(data.gas, (entry) => entry.trips, formatNumber, { integerTicks: true })
    },
    {
      id: "gasAvgPrice",
      label: "Avg Price / Gallon",
      builder: (data) =>
        buildAverageSeries(
          data.gas,
          (entry) => entry.spent,
          (entry) => entry.totalGallons,
          formatMoney
        )
    },
    { id: "gasGallons", label: "Gallons per Month", builder: (data) => buildSimpleSeries(data.gas, (entry) => entry.totalGallons, formatNumber) },
    {
      id: "gasAvgGallons",
      label: "Avg Gallons / Trip",
      builder: (data) =>
        buildAverageSeries(
          data.gas,
          (entry) => entry.totalGallons,
          (entry) => entry.trips,
          (value) => formatDecimal(value, 1)
        )
    },
    { id: "gasLocations", label: "Locations Visited", builder: (data) => buildWarehouseStackedSeries(data.gas) }
  ]
};

function setMetricsChartData(data) {
  chartState.data = data;
  if (!chartState.canvas || !chartState.ctx || !chartState.controls) return;
  updateChartControls();
}

function updateChartControls() {
  if (!chartState.canvas || !chartState.ctx || !chartState.controls) return;
  const options = CHART_METRICS[appState.activeTab] || [];
  if (!chartState.data || !options.length) {
    if (chartState.controls) {
      chartState.controls.innerHTML = "";
    }
    drawNoChartData("No chart data available.");
    return;
  }

  chartState.controls.innerHTML = "";
  options.forEach((option) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = option.label;
    btn.className = "chart-control-button";
    if (option.isRotisserie) {
      btn.classList.add("rotisserie-option");
      btn.title = option.tooltip || ROTISSERIE_TOOLTIP;
    } else if (option.tooltip) {
      btn.title = option.tooltip;
    } else {
      btn.title = option.label;
    }
    if (chartState.currentMetric[appState.activeTab] === option.id) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      if (chartState.currentMetric[appState.activeTab] !== option.id) {
        chartState.currentMetric[appState.activeTab] = option.id;
        updateChartControls();
      }
    });
    chartState.controls.appendChild(btn);
  });

  if (chartState.subtitle) {
    chartState.subtitle.textContent =
      CHART_SUBTITLES[appState.activeTab] || "Metrics reflect the current filters.";
  }

  renderMetricsChart();
}

function renderMetricsChart() {
  if (!chartState.canvas || !chartState.ctx || !chartState.data) return;
  hideChartTooltip();
  chartState.hitRegions = [];
  const options = CHART_METRICS[appState.activeTab] || [];
  if (!options.length) {
    drawNoChartData("No chart data available.");
    return;
  }
  const currentId = chartState.currentMetric[appState.activeTab] || options[0].id;
  let selected = options.find((opt) => opt.id === currentId);
  if (!selected) {
    selected = options[0];
    chartState.currentMetric[appState.activeTab] = selected.id;
  }
  const dataset = selected.builder(chartState.data);
  if (!dataset || !dataset.labels || !dataset.labels.length) {
    drawNoChartData("Not enough data for this view.");
    return;
  }
  chartState.lastDataset = { dataset, option: selected, tab: appState.activeTab };
  drawChartDataset(dataset);
}

function buildMonthlyDataset(monthlyWarehouseMap, monthlyOnlineMap, monthlyGasMap) {
  const warehouse = normalizeWarehouseMonthly(monthlyWarehouseMap);
  const online = normalizeOnlineMonthly(monthlyOnlineMap);
  const gas = normalizeGasMonthly(monthlyGasMap);
  const all = buildAllMonthly(warehouse, online, gas);
  return { warehouse, online, gas, all };
}

function normalizeWarehouseMonthly(map) {
  if (!map) return [];
  return Array.from(map.entries())
    .map(([month, data]) => ({
      month,
      label: formatMonthLabel(month),
      spent: data.spent || 0,
      trips: data.trips || 0,
      items: data.items || 0,
      rotisserie: data.rotisserie || 0,
      locations: data.locations ? new Map(data.locations) : new Map()
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function normalizeOnlineMonthly(map) {
  if (!map) return [];
  return Array.from(map.entries())
    .map(([month, data]) => ({
      month,
      label: formatMonthLabel(month),
      spent: data.spent || 0,
      orders: data.orders || 0,
      items: data.items || 0
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function normalizeGasMonthly(map) {
  if (!map) return [];
  return Array.from(map.entries())
    .map(([month, data]) => ({
      month,
      label: formatMonthLabel(month),
      spent: data.spent || 0,
      trips: data.trips || 0,
      totalGallons: data.totalGallons || 0,
      locations: data.locations ? new Map(data.locations) : new Map()
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function buildAllMonthly(warehouseEntries, onlineEntries, gasEntries) {
  const combined = new Map();
  const ensureEntry = (month, label) => {
    let entry = combined.get(month);
    if (!entry) {
      entry = {
        month,
        label,
        spent: 0,
        trips: 0,
        items: 0,
        rotisserie: 0,
        locations: new Map()
      };
      combined.set(month, entry);
    }
    return entry;
  };

  warehouseEntries.forEach((entry) => {
    const combinedEntry = ensureEntry(entry.month, entry.label);
    combinedEntry.spent += entry.spent || 0;
    combinedEntry.trips += entry.trips || 0;
    combinedEntry.items += entry.items || 0;
    combinedEntry.rotisserie += entry.rotisserie || 0;
    entry.locations?.forEach((count, loc) => {
      combinedEntry.locations.set(loc, (combinedEntry.locations.get(loc) || 0) + count);
    });
  });

  onlineEntries.forEach((entry) => {
    const combinedEntry = ensureEntry(entry.month, entry.label);
    combinedEntry.spent += entry.spent || 0;
    combinedEntry.trips += entry.orders || 0;
    combinedEntry.items += entry.items || 0;
  });

  gasEntries.forEach((entry) => {
    const combinedEntry = ensureEntry(entry.month, entry.label);
    combinedEntry.spent += entry.spent || 0;
    combinedEntry.trips += entry.trips || 0;
    combinedEntry.items += 0;
    combinedEntry.gasGallons = (combinedEntry.gasGallons || 0) + (entry.totalGallons || 0);
  });

  return Array.from(combined.values()).sort((a, b) => a.month.localeCompare(b.month));
}

function buildSimpleSeries(entries, valueFn, formatter, options = {}) {
  if (!entries || !entries.length) return null;
  return {
    labels: entries.map((entry) => entry.label),
    values: entries.map((entry) => valueFn(entry) || 0),
    formatValue: formatter || formatNumber,
    integerTicks: Boolean(options.integerTicks)
  };
}

function buildAverageSeries(entries, numeratorFn, denominatorFn, formatter) {
  if (!entries || !entries.length) return null;
  return {
    labels: entries.map((entry) => entry.label),
    values: entries.map((entry) => {
      const numerator = numeratorFn(entry) || 0;
      const denominator = denominatorFn(entry) || 0;
      return denominator > 0 ? numerator / denominator : 0;
    }),
    formatValue: formatter || formatDecimal
  };
}

function buildWarehouseStackedSeries(entries) {
  if (!entries || !entries.length) return null;
  const totals = new Map();
  entries.forEach((entry) => {
    entry.locations?.forEach((count, loc) => {
      totals.set(loc, (totals.get(loc) || 0) + count);
    });
  });
  if (!totals.size) return null;
  const topLocations = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([loc]) => loc);
  const includeOther = totals.size > topLocations.length;
  const labels = entries.map((entry) => entry.label);
  const series = [];
  topLocations.forEach((loc, idx) => {
    series.push({
      label: loc,
      color: STACK_COLORS[idx % STACK_COLORS.length],
      values: entries.map((entry) => (entry.locations?.get(loc) || 0))
    });
  });
  if (includeOther) {
    series.push({
      label: "Other",
      color: STACK_COLORS[topLocations.length % STACK_COLORS.length],
      values: entries.map((entry) => {
        const total = Array.from(entry.locations?.values() || []).reduce((sum, val) => sum + val, 0);
        const topSum = topLocations.reduce(
          (sum, loc) => sum + (entry.locations?.get(loc) || 0),
          0
        );
        return Math.max(total - topSum, 0);
      })
    });
  }
  if (!series.length) return null;
  return {
    labels,
    series,
    stacked: true,
    formatValue: formatNumber,
    integerTicks: true
  };
}

// =============================
// Chart rendering
// =============================

function drawChartDataset(dataset) {
  if (dataset.stacked) {
    drawStackedChart(dataset);
  } else {
    drawBarChart(dataset);
  }
}

function drawBarChart(dataset) {
  const canvas = chartState.canvas;
  const ctx = chartState.ctx;
  if (!canvas || !ctx) return;
  const labels = dataset.labels || [];
  const values = dataset.values || [];
  const formatValue = dataset.formatValue || formatNumber;
  const integerTicks = Boolean(dataset.integerTicks);
  const width = canvas.clientWidth || 800;
  const height = canvas.clientHeight || 320;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  if (!values.length) {
    drawNoChartData("Not enough data for this view.");
    return;
  }

  const padding = { top: 20, right: 20, bottom: 50, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const rawMax = Math.max(...values, 1);
  const tickCount = 4;
  const tickStep = integerTicks
    ? Math.max(1, Math.ceil(rawMax / tickCount))
    : rawMax / tickCount;
  const maxValue = integerTicks ? tickStep * tickCount : rawMax;
  const slot = chartWidth / values.length;
  const barWidth = Math.max(slot * 0.6, 14);

  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  ctx.fillStyle = "#6b7280";
  ctx.font = "11px 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= tickCount; i++) {
    const value = tickStep * i;
    const y = height - padding.bottom - (value / maxValue) * chartHeight;
    ctx.fillText(formatValue(value), padding.left - 6, y);
    ctx.strokeStyle = "rgba(209,213,219,0.5)";
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  labels.forEach((label, idx) => {
    const value = values[idx] || 0;
    const barHeight = (value / maxValue) * chartHeight;
    const x = padding.left + idx * slot + (slot - barWidth) / 2;
    const y = height - padding.bottom - barHeight;
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(x, y, barWidth, barHeight);
    if (barHeight > 0) {
      chartState.hitRegions.push({
        x,
        y,
        width: barWidth,
        height: barHeight,
        label,
        formattedValue: formatValue(value)
      });
    }
    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "11px 'Segoe UI', sans-serif";
    const showLabel = labels.length <= 12 || idx % 2 === 0;
    if (showLabel) {
      ctx.fillText(label, x + barWidth / 2, height - padding.bottom + 6);
    }
  });
}

function drawStackedChart(dataset) {
  const canvas = chartState.canvas;
  const ctx = chartState.ctx;
  if (!canvas || !ctx) return;
  const labels = dataset.labels || [];
  const series = dataset.series || [];
  const formatValue = dataset.formatValue || formatNumber;
  const integerTicks = Boolean(dataset.integerTicks);
  const width = canvas.clientWidth || 800;
  const height = canvas.clientHeight || 320;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  if (!labels.length || !series.length) {
    drawNoChartData("Not enough data for this view.");
    return;
  }

  const totals = labels.map((_, idx) =>
    series.reduce((sum, serie) => sum + (serie.values[idx] || 0), 0)
  );
  const rawMax = Math.max(...totals, 1);
  const tickCount = 4;
  const tickStep = integerTicks
    ? Math.max(1, Math.ceil(rawMax / tickCount))
    : rawMax / tickCount;
  const maxValue = integerTicks ? tickStep * tickCount : rawMax;

  const padding = { top: 20, right: 20, bottom: 60, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const slot = chartWidth / labels.length;
  const barWidth = Math.max(slot * 0.6, 14);

  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  ctx.fillStyle = "#6b7280";
  ctx.font = "11px 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= tickCount; i++) {
    const value = tickStep * i;
    const y = height - padding.bottom - (value / maxValue) * chartHeight;
    ctx.fillText(formatValue(value), padding.left - 8, y);
    ctx.strokeStyle = "rgba(209,213,219,0.4)";
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  labels.forEach((label, idx) => {
    let currentY = height - padding.bottom;
    series.forEach((serie) => {
      const value = serie.values[idx] || 0;
      if (value <= 0) return;
      const barHeight = (value / maxValue) * chartHeight;
      ctx.fillStyle = serie.color;
      const x = padding.left + idx * slot + (slot - barWidth) / 2;
      const y = currentY - barHeight;
      ctx.fillRect(x, y, barWidth, barHeight);
      chartState.hitRegions.push({
        x,
        y,
        width: barWidth,
        height: barHeight,
        label,
        seriesLabel: serie.label,
        formattedValue: formatValue(value)
      });
      currentY = y;
    });
    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "11px 'Segoe UI', sans-serif";
    const showLabel = labels.length <= 12 || idx % 2 === 0;
    if (showLabel) {
      ctx.fillText(label, padding.left + idx * slot + barWidth / 2, height - padding.bottom + 8);
    }
  });

  drawLegend(series);
}

function drawLegend(series) {
  const canvas = chartState.canvas;
  const ctx = chartState.ctx;
  if (!canvas || !ctx || !series.length) return;
  ctx.font = "11px 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let x = canvas.clientWidth - 140;
  let y = 16;
  series.forEach((serie) => {
    ctx.fillStyle = serie.color;
    ctx.fillRect(x, y - 5, 10, 10);
    ctx.fillStyle = "#111827";
    ctx.fillText(serie.label, x + 14, y);
    y += 16;
  });
}

function drawNoChartData(message) {
  const canvas = chartState.canvas;
  const ctx = chartState.ctx;
  if (!canvas || !ctx) return;
  const width = canvas.clientWidth || 800;
  const height = canvas.clientHeight || 320;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "14px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, width / 2, height / 2);
  chartState.hitRegions = [];
  hideChartTooltip();
}

function initChartInteractions() {
  if (!chartState.canvas) return;
  chartState.canvas.addEventListener("mousemove", handleChartPointerMove);
  chartState.canvas.addEventListener("mouseleave", () => {
    hideChartTooltip();
  });
}

function handleChartPointerMove(event) {
  if (!chartState.canvas || !chartState.hitRegions.length) {
    hideChartTooltip();
    return;
  }
  const rect = chartState.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const target = findHitRegion(x, y);
  if (!target) {
    hideChartTooltip();
    return;
  }
  const lines = [
    target.seriesLabel
      ? `${target.label} • ${target.seriesLabel}`
      : target.label,
    target.formattedValue || formatNumber(target.value || 0)
  ];
  showChartTooltip(event.clientX, event.clientY, lines);
}

function findHitRegion(x, y) {
  for (let i = chartState.hitRegions.length - 1; i >= 0; i -= 1) {
    const region = chartState.hitRegions[i];
    if (
      x >= region.x &&
      x <= region.x + region.width &&
      y >= region.y &&
      y <= region.y + region.height
    ) {
      return region;
      }
  }
  return null;
}

function showChartTooltip(clientX, clientY, lines) {
  const tooltip = chartState.tooltipEl;
  const canvas = chartState.canvas;
  if (!tooltip || !canvas) return;
  tooltip.innerHTML = lines.map((line) => escapeHtml(line)).join("<br/>");
  const wrapperRect = canvas.parentElement.getBoundingClientRect();
  let left = clientX - wrapperRect.left + 12;
  let top = clientY - wrapperRect.top - 12;
  const tooltipRect = tooltip.getBoundingClientRect();
  if (left + tooltipRect.width > wrapperRect.width) {
    left = wrapperRect.width - tooltipRect.width - 8;
  }
  if (top < 0) {
    top = 0;
  }
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.classList.add("show");
}

function hideChartTooltip() {
  const tooltip = chartState.tooltipEl;
  if (!tooltip) return;
  tooltip.classList.remove("show");
}

function buildCoverageForTab(tab, summary, onlineData, gasStats, warehouseLocations, onlineLocations, gasLocations) {
  const { coverage } = buildSummaryCards(
    tab,
    summary,
    onlineData,
    gasStats,
    warehouseLocations,
    onlineLocations,
    gasLocations
  );
  return coverage;
}

function buildCombinedItemStatsForTab(tab, itemStats, onlineOrders, onlineDetails) {
  if (tab === "online") {
    return buildOnlineItemStats(onlineOrders, onlineDetails);
  }
  if (tab === "warehouse") {
    return itemStats || new Map();
  }
  return mergeItemStats(
    itemStats,
    buildOnlineItemStats(onlineOrders, onlineDetails)
  );
}

function getTopPurchasedItems(statsMap, limit = 3) {
  if (!statsMap || !statsMap.size) return [];
  return Array.from(statsMap.values())
    .sort((a, b) => (b.purchases || 0) - (a.purchases || 0))
    .slice(0, limit);
}

function getTopExpensiveItems(statsMap, limit = 3) {
  if (!statsMap || !statsMap.size) return [];
  return Array.from(statsMap.values())
    .filter((s) => s.purchases >= 1)
    .map((s) => ({
      ...s,
      avgPrice: s.totalSpent && s.purchases ? s.totalSpent / s.purchases : 0
    }))
    .sort((a, b) => b.avgPrice - a.avgPrice)
    .slice(0, limit);
}

function getTopPriceIncreases(statsMap, limit = 3) {
  if (!statsMap || !statsMap.size) return [];
  const rows = [];
  statsMap.forEach((s) => {
    if (!s.prices || s.prices.length < 2) return;
    let min = Infinity;
    let max = -Infinity;
    s.prices.forEach((p) => {
      if (p.price < min) min = p.price;
      if (p.price > max) max = p.price;
    });
    if (min <= 0 || max <= min) return;
    rows.push({
      ...s,
      min,
      max,
      increase: max - min
    });
  });
  return rows.sort((a, b) => b.increase - a.increase).slice(0, limit);
}

function getTopSpentItems(statsMap, limit = 3) {
  if (!statsMap || !statsMap.size) return [];
  return Array.from(statsMap.values())
    .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
    .slice(0, limit);
}

function getTopWarehouseLocation(visits) {
  const map = buildLocationMapFromVisits(visits);
  if (!map.size) return null;
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0];
}

function getBiggestTrip(warehouseVisits, onlineRows, gasTrips) {
  let max = { label: "None", total: 0 };
  const consider = (label, total) => {
    if (total > max.total) max = { label, total };
  };
  (warehouseVisits || []).forEach((visit) => {
    const total = Number(visit.total) || 0;
    if (total > 0) consider(visit.location || "Warehouse", total);
  });
  (onlineRows || []).forEach((order) => {
    const total = Number(order.total) || 0;
    if (total > 0) consider(order.location || "Online", total);
  });
  (gasTrips || []).forEach((trip) => {
    const total = Number(trip.totalPrice) || 0;
    if (total > 0) consider(trip.location || "Gas", total);
  });
  return max;
}

function getBiggestMonth(monthlyData) {
  if (!monthlyData || !monthlyData.all) return null;
  const best = monthlyData.all.slice().sort((a, b) => (b.spent || 0) - (a.spent || 0))[0];
  if (!best || !best.spent) return null;
  return { label: best.label, total: best.spent };
}

function truncateName(name, maxLen = 28) {
  if (!name) return "Item";
  return name.length > maxLen ? `${name.slice(0, maxLen - 1)}…` : name;
}

function downloadSummaryPng() {
  if (!appState.latestSummary) return;
  const { summary, onlineData, gasStats, warehouseVisits, itemStats, onlineOrders } = appState.latestSummary;
  const warehouseLocations = buildLocationMapFromVisits(warehouseVisits);
  const onlineLocations = onlineData.locationCounts || new Map();
  const gasLocations = gasStats?.locationCounts || new Map();
  const coverage = buildCoverageForTab(
    appState.activeTab,
    summary,
    onlineData,
    gasStats,
    warehouseLocations,
    onlineLocations,
    gasLocations
  );

  const netWarehouseSpent = (summary.totalSpent || 0) - (summary.returnAmount || 0);
  const netOnlineSpent = (onlineData.totalSpent || 0) - (onlineData.returnAmount || 0);
  let totalTrips = summary.shoppingReceipts + onlineData.totalOrders + gasStats.totalTrips;
  let totalSpent = netWarehouseSpent + netOnlineSpent + (gasStats.totalCost || 0);
  if (appState.activeTab === "warehouse") {
    totalTrips = summary.shoppingReceipts;
    totalSpent = netWarehouseSpent;
  } else if (appState.activeTab === "online") {
    totalTrips = onlineData.totalOrders;
    totalSpent = netOnlineSpent;
  } else if (appState.activeTab === "gas") {
    totalTrips = gasStats.totalTrips;
    totalSpent = gasStats.totalCost || 0;
  }

  const combinedStats = buildCombinedItemStatsForTab(
    appState.activeTab,
    itemStats,
    onlineOrders,
    appState.onlineOrderDetails
  );
  const topPurchased = getTopPurchasedItems(combinedStats, 3);
  const topExpensive = getTopExpensiveItems(combinedStats, 3);
  const priceIncreaseItems = getTopPriceIncreases(combinedStats, 3);
  const mostSpentItems = getTopSpentItems(combinedStats, 3);
  const topWarehouse = getTopWarehouseLocation(warehouseVisits);
  const biggestTrip = getBiggestTrip(warehouseVisits, onlineData.rows, gasStats.trips);
  const biggestMonth = getBiggestMonth(appState.latestSummary.monthlyData || {});

  const canvas = document.createElement("canvas");
  const width = 1080;
  const minHeight = 1200;
  canvas.width = width;
  canvas.height = minHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const drawBackground = (h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0b1224");
    grad.addColorStop(1, "#16284d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, h);

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.ellipse(width * 0.2, h * 0.2, 220, 140, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(width * 0.8, h * 0.4, 260, 180, -0.3, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawHeader = () => {
    const titleText = "Costcoholic Wrapped";
    ctx.fillStyle = "#f8fafc";
    ctx.font = "52px 'Segoe UI Semibold', 'Segoe UI', sans-serif";
    ctx.fillText(titleText, 80, 120);
    ctx.font = "22px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#cbd5e1";
  const tabLabel = appState.activeTab.charAt(0).toUpperCase() + appState.activeTab.slice(1);
    ctx.fillText(`Tab: ${tabLabel} • ${coverage || "Date range unavailable"}`, 80, 160);

    const pillText = "Spending Highlights";
    const pillWidth = ctx.measureText(pillText).width + 32;
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.roundRect(80, 182, pillWidth, 34, 17);
    ctx.fill();
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "15px 'Segoe UI Semibold', 'Segoe UI', sans-serif";
    ctx.fillText(pillText, 98, 206);
  };

  const cardBaseY = 240;
  const cardW = 300;
  const cardH = 130;
  const gap = 24;

  const drawCard = (title, value, subtitle, x, y, accent) => {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.strokeStyle = accent || "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 16);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "14px 'Segoe UI', sans-serif";
    ctx.fillText(title, x + 18, y + 28);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "26px 'Segoe UI Semibold', 'Segoe UI', sans-serif";
    ctx.fillText(value, x + 18, y + 60);
    if (subtitle) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px 'Segoe UI', sans-serif";
      ctx.fillText(subtitle, x + 18, y + 86);
    }
  };

  let cx = 80;
  let cy = cardBaseY;
  drawCard("💰 Total Spent", formatMoney(totalSpent), "Net of returns", cx, cy, "#22d3ee");
  cx += cardW + gap;
  drawCard("🛒 Total Trips", totalTrips.toLocaleString(), "All channels", cx, cy, "#a855f7");
  cx += cardW + gap;
  const avgPerTrip = totalTrips > 0 ? totalSpent / totalTrips : 0;
  drawCard("📊 Avg per Trip", formatMoney(avgPerTrip), null, cx, cy, "#f97316");

  cx = 80;
  cy += cardH + gap;
  drawCard("⛽ Total Gas Trips", (gasStats.totalTrips || 0).toLocaleString(), null, cx, cy, "#22c55e");
  cx += cardW + gap;
  drawCard("🛢️ Total Gallons", formatGallons(gasStats.totalGallons || 0), null, cx, cy, "#22c55e");
  cx += cardW + gap;
  drawCard("🍗 Rotisserie", `${(summary.rotisserieCount || 0).toLocaleString()}×`, formatMoney(summary.rotisserieSpent || 0), cx, cy, "#d6a66a");

  cx = 80;
  cy += cardH + gap;
  drawCard("📍 Top Warehouse", topWarehouse ? `${truncateName(topWarehouse[0], 24)} • ${topWarehouse[1]}×` : "—", null, cx, cy, "#c084fc");
  cx += cardW + gap;
  drawCard("🧾 Biggest Trip", biggestTrip.total ? `${formatMoney(biggestTrip.total)} • ${truncateName(biggestTrip.label, 22)}` : "No trips", null, cx, cy, "#fbbf24");
  cx += cardW + gap;
  drawCard("📅 Biggest Month", biggestMonth ? `${biggestMonth.label} • ${formatMoney(biggestMonth.total)}` : "No data", null, cx, cy, "#38bdf8");

  const drawList = (label, items, x, y, w, h, formatter) => {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 16);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "16px 'Segoe UI Semibold', 'Segoe UI', sans-serif";
    ctx.fillText(label, x + 18, y + 28);
    let offsetY = y + 60;
    if (!items.length) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px 'Segoe UI', sans-serif";
      ctx.fillText("No data", x + 18, offsetY);
      return;
    }
    items.forEach((item, idx) => {
      const name = item.name || "Item";
      ctx.fillStyle = "#f8fafc";
      ctx.font = "17px 'Segoe UI Semibold', 'Segoe UI', sans-serif";
      const truncated = name.length > 36 ? `${name.slice(0, 33)}…` : name;
      ctx.fillText(`${idx + 1}. ${truncated}`, x + 18, offsetY);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "14px 'Segoe UI', sans-serif";
      const detail = formatter ? formatter(item) : `${(item.purchases || 0).toLocaleString()}× @ ${formatMoney((item.totalSpent || 0) / Math.max(item.purchases || 1, 1))}`;
      ctx.fillText(detail, x + 18, offsetY + 18);
      offsetY += 44;
    });
  };

  const listY = cy + cardH + 60;
  drawList(
    "🛍️ Top 3 Purchased Items",
    topPurchased,
    80,
    listY,
    440,
    240,
    (item) => `${(item.purchases || 0).toLocaleString()}× • ${formatMoney((item.totalSpent || 0) / Math.max(item.purchases || 1, 1))} avg`
  );
  drawList(
    "💰 Most Total Spent Items",
    mostSpentItems,
    560,
    listY,
    440,
    240,
    (item) => `${formatMoney(item.totalSpent || 0)} • ${(item.purchases || 0).toLocaleString()}×`
  );
  const listY2 = listY + 270;
  drawList(
    "💎 Most Expensive Items",
    topExpensive,
    80,
    listY2,
    440,
    240,
    (item) => `Avg ${formatMoney(item.avgPrice || 0)} • ${(item.purchases || 0).toLocaleString()}×`
  );
  drawList(
    "📈 Biggest Price Increases",
    priceIncreaseItems,
    560,
    listY2,
    440,
    240,
    (item) => `${formatMoney(item.min)} → ${formatMoney(item.max)}`
  );

  // dynamic height trim and redraw once we know bottom
  const bottomContent = listY2 + 240 + 100;
  const finalHeight = Math.max(minHeight, Math.ceil(bottomContent));
  if (finalHeight !== canvas.height) {
    canvas.height = finalHeight;
    drawBackground(finalHeight);
    drawHeader();
    // re-draw cards
    cx = 80;
    cy = cardBaseY;
    drawCard("💰 Total Spent", formatMoney(totalSpent), "Net of returns", cx, cy, "#22d3ee");
    cx += cardW + gap;
    drawCard("🛒 Total Trips", totalTrips.toLocaleString(), "All channels", cx, cy, "#a855f7");
    cx += cardW + gap;
    drawCard("📊 Avg per Trip", formatMoney(avgPerTrip), null, cx, cy, "#f97316");

    cx = 80;
    cy += cardH + gap;
    drawCard("⛽ Total Gas Trips", (gasStats.totalTrips || 0).toLocaleString(), null, cx, cy, "#22c55e");
    cx += cardW + gap;
    drawCard("🛢️ Total Gallons", formatGallons(gasStats.totalGallons || 0), null, cx, cy, "#22c55e");
    cx += cardW + gap;
    drawCard("🍗 Rotisserie", `${(summary.rotisserieCount || 0).toLocaleString()}×`, formatMoney(summary.rotisserieSpent || 0), cx, cy, "#d6a66a");

    cx = 80;
    cy += cardH + gap;
    drawCard("📍 Top Warehouse", topWarehouse ? `${truncateName(topWarehouse[0], 24)} • ${topWarehouse[1]}×` : "—", null, cx, cy, "#c084fc");
    cx += cardW + gap;
    drawCard("🧾 Biggest Trip", biggestTrip.total ? `${formatMoney(biggestTrip.total)} • ${truncateName(biggestTrip.label, 22)}` : "No trips", null, cx, cy, "#fbbf24");
    cx += cardW + gap;
    drawCard("📅 Biggest Month", biggestMonth ? `${biggestMonth.label} • ${formatMoney(biggestMonth.total)}` : "No data", null, cx, cy, "#38bdf8");

    const listYv = cy + cardH + 60;
    drawList(
      "🛍️ Top 3 Purchased Items",
      topPurchased,
      80,
      listYv,
      440,
      240,
      (item) => `${(item.purchases || 0).toLocaleString()}× • ${formatMoney((item.totalSpent || 0) / Math.max(item.purchases || 1, 1))} avg`
    );
    drawList(
      "💰 Most Total Spent Items",
      mostSpentItems,
      560,
      listYv,
      440,
      240,
      (item) => `${formatMoney(item.totalSpent || 0)} • ${(item.purchases || 0).toLocaleString()}×`
    );
    const listYv2 = listYv + 270;
    drawList(
      "💎 Most Expensive Items",
      topExpensive,
      80,
      listYv2,
      440,
      240,
      (item) => `Avg ${formatMoney(item.avgPrice || 0)} • ${(item.purchases || 0).toLocaleString()}×`
    );
    drawList(
      "📈 Biggest Price Increases",
      priceIncreaseItems,
      560,
      listYv2,
      440,
      240,
      (item) => `${formatMoney(item.min)} → ${formatMoney(item.max)}`
    );
  }

  // Watermark
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "16px 'Segoe UI', sans-serif";
  const watermark = "Generated by Costcoholic";
  const wmWidth = ctx.measureText(watermark).width;
  ctx.fillText(watermark, width - wmWidth - 40, canvas.height - 40);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    link.download = "costco-damages-summary.png";
    link.href = URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      document.body.removeChild(link);
    }, 0);
  });
}

function formatNumber(value) {
  return (Number(value) || 0).toLocaleString();
}

function formatDecimal(value, decimals = 1) {
  const num = Number(value) || 0;
  return num.toFixed(decimals);
}

// File upload removed; receipts now flow directly from the extension.

function displayExtensionReceipts(
  receipts,
  warehouseDetails,
  onlineOrders,
  onlineOrderDetails,
  updatedAt
) {
  if (!Array.isArray(receipts) || receipts.length === 0) {
    setData([], warehouseDetails || {}, onlineOrders || [], onlineOrderDetails || {});
    statusEl.textContent = "No receipts loaded from extension.";
    statusEl.classList.add("error");
    const rangeEl = document.getElementById("dateRange");
    if (rangeEl) {
      rangeEl.classList.add("error");
      rangeEl.textContent = "No receipts loaded.";
    }
    return false;
  }
  const timestamp = updatedAt
    ? ` (Updated ${new Date(updatedAt).toLocaleString()})`
    : "";
  statusEl.textContent = `Loaded ${receipts.length.toLocaleString()} receipts from extension${timestamp}.`;
  statusEl.classList.remove("error");
  setData(receipts, warehouseDetails || {}, onlineOrders || [], onlineOrderDetails || {});
  return true;
}

function loadReceiptsFromStorage() {
  if (!hasChrome || !chrome.storage || !chrome.storage.local) return;
  chrome.storage.local.get(EXTENSION_STORAGE_KEY, (result) => {
    if (chrome.runtime?.lastError) {
      console.warn(
        "Costcoholic Spending Dashboard: could not read storage",
        chrome.runtime.lastError
      );
      return;
    }
    const stored = result ? result[EXTENSION_STORAGE_KEY] : null;
    if (!stored) return;
    displayExtensionReceipts(
      stored.receipts,
      stored.warehouseDetails,
      stored.onlineOrders,
      stored.orderDetails,
      stored.updatedAt
    );
  });
}

if (hasChrome) {
  if (chrome.storage?.local) {
    loadReceiptsFromStorage();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[EXTENSION_STORAGE_KEY]) return;
      const newValue = changes[EXTENSION_STORAGE_KEY].newValue;
      if (!newValue) return;
      displayExtensionReceipts(
        newValue.receipts,
        newValue.warehouseDetails,
        newValue.onlineOrders,
        newValue.orderDetails,
        newValue.updatedAt
      );
    });
  }

  if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: "getReceipts" }, (resp) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "No receipts from extension:",
          chrome.runtime.lastError
        );
        return;
      }
      if (resp) {
        displayExtensionReceipts(
          resp.receipts,
          resp.warehouseDetails,
          resp.onlineOrders,
          resp.orderDetails,
          resp.updatedAt
        );
      }
    });
  }
}

function downloadCurrentChartCsv() {
  const info = chartState.lastDataset;
  if (!info || !info.dataset) return;
  const { dataset, option, tab } = info;
  const rows = [];

  if (dataset.stacked && Array.isArray(dataset.series)) {
    const header = ["Label"].concat(
      dataset.series.map((s) => s.label || "")
    );
    rows.push(header);
    const labelCount = dataset.labels.length;
    for (let i = 0; i < labelCount; i += 1) {
      const row = [dataset.labels[i]];
      dataset.series.forEach((s) => {
        row.push(s.values[i] || 0);
      });
      rows.push(row);
    }
  } else {
    rows.push(["Label", option.label]);
    const labels = dataset.labels || [];
    const values = dataset.values || [];
    labels.forEach((label, idx) => {
      rows.push([label, values[idx] || 0]);
    });
  }

  const filename = `costco-chart-${tab || "all"}-${
    option && option.id ? option.id : "metric"
  }.csv`;
  downloadCsvFile(filename, rows);
}
function renderTopItemSections(itemStats, onlineData, filteredOnlineOrders) {
  if (!topItemsSection) return;
  const isGasTab = appState.activeTab === "gas";
  topItemsSection.style.display = isGasTab ? "none" : "grid";
  if (topItemsSecondarySection) {
    topItemsSecondarySection.style.display = isGasTab ? "none" : "grid";
  }
  if (isGasTab) {
    clearTableBody("mostTotalSpentBody");
    clearTableBody("priceIncreaseBody");
    clearTableBody("mostExpensiveBody");
    clearTableBody("mostPurchasedBody");
    return;
  }

  const nameCharLimit = appState.activeTab === "online" ? 15 : null;
  let combinedStats = new Map();
  if (appState.activeTab === "online") {
    combinedStats = buildOnlineItemStats(filteredOnlineOrders, appState.onlineOrderDetails);
  } else if (appState.activeTab === "warehouse") {
    combinedStats = itemStats;
  } else {
    combinedStats = mergeItemStats(
      itemStats,
      buildOnlineItemStats(filteredOnlineOrders, appState.onlineOrderDetails)
    );
  }

  renderMostTotalSpent(combinedStats, nameCharLimit);
  renderPriceIncreases(combinedStats, nameCharLimit);
  renderMostExpensive(combinedStats, nameCharLimit);
  renderMostPurchased(combinedStats, nameCharLimit);
}
function buildOnlineItemStats(orders, detailsMap) {
  const stats = new Map();
  if (!Array.isArray(orders)) return stats;
  const map =
    detailsMap && typeof detailsMap === "object" ? detailsMap : Object.create(null);

  orders.forEach((order) => {
    const orderTotal = Number(order.orderTotal ?? order.total ?? 0);
    if (orderTotal < 0) {
      return;
    }
    const orderKey = String(
      order.orderNumber || order.sourceOrderNumber || order.orderHeaderId || ""
    ).trim();
    const detail = orderKey ? map[orderKey] : null;
    const items = detail
      ? flattenOrderLineItems(detail)
      : Array.isArray(order.orderLineItems)
      ? order.orderLineItems.map((line) => ({
          itemNumber: line.itemNumber || line.itemId || orderKey,
          description: line.itemDescription || `Order ${orderKey}`,
          quantity: 1,
          price: Number(line.unitPrice || line.amount || 0),
          total: Number(line.amount || 0)
        }))
      : [];

    items.forEach((item) => {
      const quantity = Number(item.quantity) || 1;
      const total = Number(item.total) || Number(item.price || 0) * quantity;
      const perUnit = quantity ? total / quantity : 0;
      const key = `${item.itemNumber || item.description || orderKey}|online`;
      let stat = stats.get(key);
      if (!stat) {
        stat = {
          itemNumber: item.itemNumber || item.description || orderKey,
          name: `${item.description || "Online Item"} (Online)`,
          totalSpent: 0,
          totalUnits: 0,
          purchases: 0,
          prices: []
        };
        stats.set(key, stat);
      }
      stat.totalSpent += total;
      stat.totalUnits += quantity;
      stat.purchases += quantity;
      stat.prices.push({
        date: parseOnlineOrderDate(order) || new Date(),
        price: perUnit
      });
    });
  });

  return stats;
}

function mergeItemStats(warehouseStats, onlineStats) {
  const combined = new Map();
  const addStat = (map) => {
    Array.from(map.entries()).forEach(([key, value]) => {
      const existing = combined.get(key);
      if (existing) {
        existing.totalSpent += value.totalSpent;
        existing.totalUnits += value.totalUnits;
        existing.purchases += value.purchases;
        existing.prices.push(...value.prices);
      } else {
        combined.set(key, { ...value });
      }
    });
  };

  addStat(warehouseStats || new Map());
  addStat(onlineStats || new Map());

  return combined;
}

function handleVisitRowInteraction(event) {
  const row = event.target.closest("tr[data-order-number], tr[data-receipt-barcode]");
  if (!row) return;
  const orderNumber = row.dataset.orderNumber;
  const receiptBarcode = row.dataset.receiptBarcode;
  if (orderNumber) {
    fetchAndDisplayOrderDetails(orderNumber);
    return;
  }
  if (receiptBarcode) {
    fetchAndDisplayWarehouseDetails(receiptBarcode);
  }
}

function openOrderDetailsModal(message) {
  if (!orderDetailsModal) return;
  orderDetailsModal.classList.add("open");
  orderDetailsModal.setAttribute("aria-hidden", "false");
  if (orderDetailsContent && message) {
    orderDetailsContent.innerHTML = `<p class="status">${message}</p>`;
  }
}

function closeOrderDetailsModal() {
  if (!orderDetailsModal) return;
  orderDetailsModal.classList.remove("open");
  orderDetailsModal.setAttribute("aria-hidden", "true");
}

function fetchAndDisplayOrderDetails(orderNumber) {
  openOrderDetailsModal(`Loading details for order #${orderNumber}...`);
  const orderDetails = appState.onlineOrderDetails || {};
  
  // Check for error information first
  const errors = orderDetails.__errors || {};
  if (errors[orderNumber]) {
    const errorInfo = errors[orderNumber];
    if (orderDetailsContent) {
      let errorMessage = `
        <div style="padding: 20px;">
          <h3 style="margin-top: 0; color: var(--danger);">⚠️ Unable to Load Order Details</h3>
          <p class="status" style="margin: 12px 0;">
            <strong>Order #${escapeHtml(orderNumber)}</strong>
          </p>
          <p class="status error" style="margin: 12px 0;">
            ${escapeHtml(errorInfo.message || "Failed to fetch order details")}
          </p>`;
      
      if (errorInfo.statusCode === 503) {
        errorMessage += `
          <div style="margin-top: 20px; padding: 16px; background: var(--accent-soft); border-radius: 8px;">
            <p style="margin: 0 0 8px 0; font-weight: 600;">What you can do:</p>
            <ul style="margin: 8px 0; padding-left: 20px;">
              <li>Wait a few minutes and try downloading receipts again from Costco.com</li>
              <li>The order may be too old or Costco's servers may be temporarily unavailable</li>
              <li>You can still see the order summary in the table above</li>
            </ul>
          </div>`;
      } else {
        errorMessage += `
          <p class="status" style="margin-top: 16px;">
            Try rerunning the download from Costco.com to fetch this order's details.
          </p>`;
      }
      
      errorMessage += `</div>`;
      orderDetailsContent.innerHTML = errorMessage;
    }
    return;
  }
  
  const detail = orderDetails[orderNumber];
  if (!detail) {
    if (orderDetailsContent) {
      orderDetailsContent.innerHTML =
        "<p class=\"status error\">No order details were saved for this order. Try rerunning the download from Costco.com.</p>";
    }
    return;
  }
  renderOrderDetailsView(detail, orderNumber);
}

function renderOrderDetailsView(detail, fallbackOrderNumber) {
  if (!orderDetailsContent) return;
  const order = Array.isArray(detail) ? detail[0] : detail;
  if (!order) {
    orderDetailsContent.innerHTML =
      "<p class=\"status error\">No order information returned for that selection.</p>";
    return;
  }

  const placedDate = formatDetailDate(order.orderPlacedDate);
  const totalFormatted = formatMoney(Number(order.orderTotal) || 0);
  const meta = [
    { label: "Order #", value: order.orderNumber || fallbackOrderNumber || "—" },
    { label: "Placed", value: placedDate },
    { label: "Status", value: order.status || "—" },
    { label: "Warehouse", value: order.warehouseNumber || "Online" },
    { label: "Total", value: totalFormatted }
  ];

  const metaHtml = meta
    .map(
      (entry) => `
        <div>
          <span class="label">${entry.label}</span>
          <span class="value">${entry.value}</span>
        </div>
      `
    )
    .join("");

  const chargesHtml = buildChargesList(order);
  const itemsHtml = buildItemsTable(order);

  orderDetailsContent.innerHTML = `
    <h3>Order #${order.orderNumber || fallbackOrderNumber || "—"}</h3>
    <div class="order-details-meta">
      ${metaHtml}
    </div>
    <div class="order-details-section">
      <h4>Charges</h4>
      ${chargesHtml}
    </div>
    <div class="order-details-section order-details-items">
      <h4>Items</h4>
      ${itemsHtml}
    </div>
  `;
}

function fetchAndDisplayWarehouseDetails(barcode) {
  openOrderDetailsModal(`Loading receipt ${barcode}...`);
  const detail = appState.warehouseDetails
    ? appState.warehouseDetails[barcode]
    : null;
  if (!detail) {
    if (orderDetailsContent) {
      orderDetailsContent.innerHTML =
        "<p class=\"status error\">No receipt details were saved for this visit. Try downloading again.</p>";
    }
    return;
  }
  renderWarehouseReceiptView(detail, barcode);
}

function renderWarehouseReceiptView(receipt, fallbackBarcode) {
  if (!orderDetailsContent) return;
  if (!receipt) {
    orderDetailsContent.innerHTML =
      "<p class=\"status error\">Receipt details are unavailable.</p>";
    return;
  }
  const title = receipt.transactionBarcode || fallbackBarcode || "Warehouse Receipt";
  const receiptDate = receipt.transactionDateTime
    ? dateFormatter.format(new Date(receipt.transactionDateTime))
    : receipt.transactionDate || "—";
  const location = receipt.warehouseName || receipt.warehouseShortName || "Warehouse";
  const meta = [
    { label: "Receipt #", value: title },
    { label: "Warehouse", value: location },
    { label: "Date", value: receiptDate },
    { label: "Register", value: receipt.registerNumber || "—" },
    { label: "Operator", value: receipt.operatorNumber || "—" },
    { label: "Total", value: formatMoney(Number(receipt.total) || 0) },
    { label: "Subtotal", value: formatMoney(Number(receipt.subTotal) || 0) },
    { label: "Taxes", value: formatMoney(Number(receipt.taxes) || 0) }
  ];

  const metaHtml = meta
    .map(
      (entry) => `
        <div>
          <span class="label">${entry.label}</span>
          <span class="value">${entry.value}</span>
        </div>
      `
    )
    .join("");

  const items = Array.isArray(receipt.itemArray) ? receipt.itemArray : [];
  const itemsRows = items
    .map(
      (item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <strong>${item.itemDescription01 || item.itemDescription02 || "Item"}</strong><br/>
            <span class="status">#${item.itemNumber || "–"}</span>
          </td>
          <td>${Number(item.unit || item.fuelUnitQuantity || 0).toLocaleString()}</td>
          <td class="money">${formatMoney(item.itemUnitPriceAmount || (item.amount || 0))}</td>
          <td class="money">${formatMoney(item.amount || 0)}</td>
        </tr>
      `
    )
    .join("");

  const tenders = Array.isArray(receipt.tenderArray) ? receipt.tenderArray : [];
  const tenderHtml = tenders.length
    ? tenders
        .map(
          (tender) => `
            <li>
              <span>${tender.tenderDescription || tender.tenderTypeName || "Payment"}</span>
              <span>${formatMoney(Number(tender.amountTender) || 0)}</span>
            </li>
          `
        )
        .join("")
    : '<li><span>No tenders recorded.</span></li>';

  orderDetailsContent.innerHTML = `
    <h3>Warehouse Receipt</h3>
    <div class="order-details-meta">
      ${metaHtml}
    </div>
    <div class="order-details-section order-details-items">
      <h4>Items</h4>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows || '<tr><td colspan="5" class="status">No items recorded.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    <div class="order-details-section">
      <h4>Payments</h4>
      <ul class="charges-list">
        ${tenderHtml}
      </ul>
    </div>
  `;
}

function formatDetailDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  return dateFormatter.format(parsed);
}

function buildChargesList(order) {
  const entries = [
    { label: "Merchandise", value: order.merchandiseTotal },
    { label: "Shipping & Handling", value: order.shippingAndHandling },
    { label: "Grocery Surcharge", value: order.grocerySurcharge },
    { label: "Retail Delivery Fee", value: order.retailDeliveryFee },
    { label: "Taxes", value: order.uSTaxTotal1 },
    { label: "Order Total", value: order.orderTotal }
  ].filter((entry) => entry.value != null);

  if (!entries.length) {
    return '<p class="status">No charge breakdown available.</p>';
  }

  return `
    <ul class="charges-list">
      ${entries
        .map(
          (entry) => `
            <li>
              <span>${entry.label}</span>
              <span>${formatMoney(Number(entry.value) || 0)}</span>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function buildItemsTable(order) {
  const items = flattenOrderLineItems(order);
  if (!items.length) {
    return '<p class="status">No line items were returned.</p>';
  }

  const rows = items
    .map(
      (item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <strong>${item.description}</strong><br/>
            <span class="status">${item.status || "—"}</span>
          </td>
          <td>${item.quantity.toLocaleString()}</td>
          <td class="money">${formatMoney(item.price)}</td>
          <td class="money">${formatMoney(item.total)}</td>
        </tr>
      `
    )
    .join("");

  return `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function flattenOrderLineItems(order) {
  const items = [];
  const addresses = Array.isArray(order.shipToAddress) ? order.shipToAddress : [];
  addresses.forEach((ship) => {
    const lines = Array.isArray(ship.orderLineItems) ? ship.orderLineItems : [];
    lines.forEach((line) => {
      const quantity = Number(line.quantity != null ? line.quantity : line.orderedTotalQuantity) || 0;
      const price = Number(line.price != null ? line.price : line.unitPrice) || 0;
      const total =
        Number(line.merchandiseTotalAmount) ||
        (quantity && price ? quantity * price : 0);
      items.push({
        itemNumber: line.itemNumber || line.itemId || line.sourceLineItemId || "",
        description:
          line.itemDescription ||
          line.sourceItemDescription ||
          `Item #${line.itemNumber || line.itemId || line.lineNumber || ""}`,
        quantity,
        price,
        total,
        status: line.orderStatus || line.shipToWarehousePackageStatus || line.status || ""
      });
    });
  });
  return items;
}
