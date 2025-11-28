# Costcoholic Privacy Policy

_Last updated: November 2025_

Costcoholic is a browser extension that helps you understand your Costco spending by turning your existing Costco account history into a local dashboard. This policy explains what data the extension has access to, how it is used, and what is **not** done with your data.

This policy applies only to the Costcoholic extension. It does **not** cover Costco’s own websites, apps, or services, which are governed by Costco’s privacy policy.

---

## 1. What data does Costcoholic access?

When you use the extension on costco.com or costco.ca, Costcoholic can access:

- **Costco order and receipt data**
  - Warehouse and gas receipts (dates, warehouse IDs/names, line items, totals, taxes, payment breakdowns).
  - Online order details (order dates, order totals, item descriptions, quantities, tax and fee lines).
- **Basic Costco identifiers**
  - Internal Costco identifiers that appear in orders/receipts (for example: order numbers, item numbers, and warehouse numbers).
- **Authentication tokens stored by Costco in your browser**
  - The extension uses existing auth tokens (e.g., `clientID`, `idToken`) from `localStorage` on Costco’s website to make the same API calls that Costco’s own pages make.
  - These tokens are read only to talk to Costco’s APIs on your behalf and are not sent anywhere else.
- **Region and settings**
  - A simple region preference (US or Canada).
  - Basic filter settings (date range, month, tab selection) and derived statistics to power the dashboard UI.

Costcoholic does **not** request or access:

- Your name, email address, physical address, or payment card numbers directly.
- Your full browsing history outside of the Costco domains you configure in Chrome permissions.
- Keystrokes or personal communications.

However, some Costco order data may implicitly contain elements that Costco itself classifies as personal or financial information (for example, purchase history and order totals). Costcoholic treats this data as sensitive and keeps it on your device.

---

## 2. How is this data used?

All accessed data is used **only** to provide the extension’s single purpose:

> To download your Costco purchase history and present it as a local, interactive spending dashboard and shareable summary image.

Specifically, the data is used to:

- Fetch receipts and orders from Costco’s APIs when you click “View Spending Summary”.
- Compute statistics such as:
  - Total spend, trips, returns, taxes, and averages.
  - Gas usage (trips, gallons, total cost, average price per gallon).
  - Top items, price changes, and other “Wrapped” style metrics.
- Render:
  - The dashboard tables and charts inside `dashboard.html`.
  - An optional PNG “Wrapped” summary that you can download and share.
- Remember:
  - Your region preference (US vs Canada) for the Costco Order Status redirect.
  - Your filters (date range/month) and last downloaded data, so you don’t need to re-fetch every time.

Costcoholic does **not** use your data for:

- Advertising or tracking across sites.
- Personal profiling, credit decisions, or lending.
- Any purpose unrelated to showing your Costco spending summary.

---

## 3. Where is data stored and where does it go?

### Local storage only

Costcoholic uses Chrome’s extension storage APIs:

- `chrome.storage.local` to store:
  - Downloaded receipts and order details.
  - Derived statistics and timestamps (e.g., last updated).
- `chrome.storage.sync` to store:
  - Region preference (US or Canada).
  - A flag indicating whether you have already answered the Canadian membership prompt.

All of this storage is **local to your browser profile**. It is not automatically uploaded to any server controlled by this extension.

### No external servers

Costcoholic does **not** send your data to:

- Any third-party analytics service.
- Any backend or cloud service controlled by the extension developer.
- Any advertiser or data broker.

The only network calls made by the extension are:

- Directly to Costco’s own APIs (`ecom-api.costco.com`) to fetch your orders and receipts.
- Page navigations to Costco Order Status pages (`costco.com` / `costco.ca`) when you use the toolbar/menu shortcut.

Those requests are equivalent to calls Costco’s own website makes and are governed by Costco’s privacy policy.

---

## 4. Permissions and why they are needed

Costcoholic requests the following Chrome permissions:

- **`tabs`** – To open Costco Order Status and the local dashboard in new tabs, and to know which tab to use when redirecting to the US/Canada order status page.
- **`storage`** – To store downloaded receipts, order details, and simple preferences locally (`chrome.storage.local` / `chrome.storage.sync`).
- **`contextMenus`** – To add a single right-click menu entry on the extension icon (“Open Costco Order Status”) that jumps you directly to the appropriate Costco page.
- **Host permissions**:
  - `https://www.costco.com/*`, `https://www.costco.ca/*` – To inject the “View Spending Summary” button and to ensure you are on the correct Order Status page.
  - `https://ecom-api.costco.com/*` – To call Costco’s GraphQL APIs to fetch your own purchase history.

Costcoholic does **not** request any additional permissions beyond what is needed for this single purpose.

---

## 5. Data sharing and selling

- Costcoholic **does not sell** user data.
- Costcoholic **does not share or transfer** user data to third parties, except to Costco’s own API endpoints (which already have access to your purchase history by virtue of your account).
- Costcoholic **does not**:
  - Use or transfer your data for purposes unrelated to the extension’s core functionality.
  - Use or transfer your data to determine creditworthiness or for lending.

---

## 6. Your choices and data control

Because all data is stored locally in Chrome’s extension storage, you can:

- **Remove your data** by:
  - Removing the extension in `chrome://extensions`, which deletes its storage, or
  - Manually clearing extension data via Chrome’s “Clear browsing data” / site data tools.
- **Stop all access** by:
  - Disabling or uninstalling the extension.
- **Change region preference** (US vs Canada) at any time via the extension’s Options page.

If you do not want Costcoholic to access your Costco purchase history, do not click “View Spending Summary” or uninstall the extension.

---

## 7. Changes to this policy

If this privacy policy changes in a way that affects how your data is used or stored, the extension version and the text of this file will be updated accordingly. You should review the policy whenever you update the extension.

---

## 8. Contact

If you have questions or concerns about this extension or its handling of data, please open an issue in the project’s repository or contact the developer through the Chrome Web Store listing page.

