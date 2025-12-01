/**
 * Parsing utilities for dates and data extraction
 */

/**
 * Parse receipt date from receipt object
 */
export function parseReceiptDate(receipt) {
  if (!receipt) return null;
  const raw =
    receipt.transactionDateTime ||
    (receipt.transactionDate ? `${receipt.transactionDate}T00:00:00` : null);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

/**
 * Parse online order date
 */
export function parseOnlineOrderDate(order) {
  if (!order) return null;
  const raw = order.orderPlacedDate || order.orderedDate || order.orderPlaced;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

/**
 * Get month key from date (YYYY-MM)
 */
export function getMonthKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Check if item is a gas item
 */
export const GAS_KEYWORDS = ["gasoline", "gas ", "gas-", "gas/", "unleaded", "premium", "diesel", "fuel"];

export function isGasItem(item) {
  if (!item) return false;
  const desc = (
    (item.itemDescription01 || "") +
    " " +
    (item.itemDescription02 || "")
  ).toLowerCase();
  return GAS_KEYWORDS.some((keyword) => desc.includes(keyword));
}

/**
 * Get combined date bounds from receipts and orders
 */
export function getCombinedBounds(receipts, onlineOrders) {
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

/**
 * Find earliest date from array
 */
export function earliestDate(dates) {
  const filtered = dates.filter(
    (d) => d instanceof Date && !Number.isNaN(d.valueOf())
  );
  if (!filtered.length) return null;
  return filtered.sort((a, b) => a - b)[0];
}

/**
 * Find latest date from array
 */
export function latestDate(dates) {
  const filtered = dates.filter(
    (d) => d instanceof Date && !Number.isNaN(d.valueOf())
  );
  if (!filtered.length) return null;
  return filtered.sort((a, b) => b - a)[0];
}

