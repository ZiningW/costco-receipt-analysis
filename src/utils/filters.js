/**
 * Filter utilities for receipts and orders
 */

import { parseReceiptDate, parseOnlineOrderDate, getMonthKey } from "./parsers.js";
import { formatInputDate } from "./formatting.js";

/**
 * Filter receipts based on current filter state
 */
export function filterReceipts(receipts, filterState) {
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

/**
 * Filter online orders based on current filter state
 */
export function filterOnlineOrders(orders, filterState) {
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

/**
 * Update custom date inputs based on bounds
 */
export function updateCustomDateInputs(bounds, customStartInput, customEndInput, filterState) {
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

/**
 * Populate month options dropdown
 */
export function populateMonthOptions(receipts, onlineOrders, monthSelect, filterState) {
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

