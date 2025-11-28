Grateful thanks to Reddit users [ViKoToMo](https://www.reddit.com/r/Costco/comments/1p4w903/costco_damage_to_wallet_fork/?sort=new) and [ikeee](https://www.reddit.com/r/Costco/comments/1p47dzr/the_damage_costco_has_caused_my_wallet_over_3/) for the original ideas that inspired this project.

# Costcoholic

Costcoholic is a Chrome extension that downloads your Costco warehouse, gas, and online purchase history and renders a dashboard with spending insights. Everything runs locally in your browser; data is stored in `chrome.storage.local` and never sent elsewhere.

## Install (local / developer mode)

1. Clone or download this repo to your machine.
2. Open `chrome://extensions` in Chrome.
3. Enable “Developer mode” (top right).
4. Click “Load unpacked” and select the project folder.
5. Confirm the extension shows up as “Costcoholic”.

## Using the extension

1. Sign in to your Costco account in Chrome and visit any Costco page (Order Status works well).
2. Click the floating “View Spending Summary” button the extension injects.
3. The extension fetches warehouse/gas receipts (2-year window) and online orders, then opens the dashboard.
4. Use the dashboard filters (All/YTD/Last 12 months/Custom/Month) and tabs (All, Warehouse, Online, Gas) to explore.
5. Click “Download JSON” to export the currently filtered data.
6. Click a warehouse visit or online order row to open the detail modal.

## Key functionality

- Unified dashboard with tabs for All, Warehouse, Online, and Gas.
- Date filtering (presets, custom range, month picker) and live-updating charts.
- Top-level summaries: spend (net of returns), taxes, trips, returns, rotisserie tracking, and channel-specific stats.
- Returns handled as negative totals; spend and taxes are net of returns, returns are surfaced in red.
- Activity Overview charts with hover tooltips, stacked locations, and rotisserie counts.
- Item insights (most spent, price increases, most expensive, most purchased) on non-gas tabs.
- Gas tracking: trips, gallons, price/gal, locations.
- Online order details modal with items and charge breakdown; warehouse receipt modal with line items and tenders.
- JSON export of the filtered dataset.

## Data flow and storage

- Auth: uses your existing Costco session tokens from `localStorage` on costco.com; no credentials are stored by the extension.
- API calls: Costco GraphQL endpoints for receipts, online orders, and order details (paginated to fetch all records).
- Storage: results are saved to `chrome.storage.local` under `costcoReceiptsData`; the dashboard reads from there. Nothing is sent to external servers.

## Troubleshooting

- If the button does not appear, ensure you are logged into Costco and refresh the page.
- If fetching fails, check the DevTools console for network/401 errors; you may need to reauthenticate on Costco.com.
- After code changes, reload the extension in `chrome://extensions` to pick up updates.
