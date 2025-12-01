/**
 * Formatting utilities for currency, dates, and numbers
 */

export const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric"
});

export const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric"
});

/**
 * Format a monetary value
 */
export function formatMoney(value) {
  return currencyFormatter.format(value || 0);
}

/**
 * Format gallons value
 */
export function formatGallons(value) {
  const gallons = Number(value) || 0;
  return gallons.toFixed(2);
}

/**
 * Format month label from month key (YYYY-MM)
 */
export function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.valueOf())) return monthKey;
  return monthFormatter.format(date);
}

/**
 * Format receipt date
 */
export function formatReceiptDate(receipt, parseReceiptDateFn) {
  const parsed = parseReceiptDateFn(receipt);
  return parsed ? dateFormatter.format(parsed) : "—";
}

/**
 * Format input date for date inputs
 */
export function formatInputDate(date) {
  return date ? date.toISOString().slice(0, 10) : "";
}

/**
 * Format number with locale
 */
export function formatNumber(value) {
  return (Number(value) || 0).toLocaleString();
}

/**
 * Format decimal with specified precision
 */
export function formatDecimal(value, decimals = 1) {
  const num = Number(value) || 0;
  return num.toFixed(decimals);
}

/**
 * Format return count
 */
export function formatReturnCount(count) {
  return (count || 0).toLocaleString();
}

/**
 * Format return amount (negative)
 */
export function formatReturnAmount(amount) {
  const value = Number(amount) || 0;
  return `-${formatMoney(value)}`;
}

/**
 * Format detail date
 */
export function formatDetailDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  return dateFormatter.format(parsed);
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Format item cell with truncation
 */
export function formatItemCell(name, itemNumber, maxChars) {
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

/**
 * Truncate name to max length
 */
export function truncateName(name, maxLen = 28) {
  if (!name) return "Item";
  return name.length > maxLen ? `${name.slice(0, maxLen - 1)}…` : name;
}

