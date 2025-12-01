/**
 * Content script for Costco.com
 * Injects button and handles receipt downloading
 */

console.log("Costcoholic Extension: content script loaded on", location.href);

(function () {
  /**
   * Handle one-time region prompt for Canadian membership
   */
  (function maybePromptForCanadianMembership() {
    if (typeof chrome === "undefined" || !chrome.storage?.sync) return;
    let parsed;
    try {
      parsed = new URL(window.location.href);
    } catch (e) {
      return;
    }
    if (!/OrderStatusCmd/i.test(parsed.pathname)) return;
    if (parsed.searchParams.get("cd_region_prompt") !== "1") return;

    // Clean query param for any non-redirect case
    parsed.searchParams.delete("cd_region_prompt");
    const cleanedUrl = parsed.toString();

    chrome.storage.sync.get(
      { regionPreference: "US", regionPromptDone: false },
      (res) => {
        if (res.regionPromptDone) {
          window.history.replaceState(null, "", cleanedUrl);
          return;
        }

        const msg =
          "Do you have a Canadian Costco membership?\n\n" +
          "If yes, we can redirect you to the Canadian Order Status page " +
          "and use that as your default.";

        const hasCanadian = window.confirm(msg);
        const updates = { regionPromptDone: true };

        if (hasCanadian) {
          updates.regionPreference = "CA";
          chrome.storage.sync.set(updates, () => {
            window.location.href = "https://www.costco.ca/OrderStatusCmd";
          });
        } else {
          updates.regionPreference = "US";
          chrome.storage.sync.set(updates, () => {
            window.history.replaceState(null, "", cleanedUrl);
          });
        }
      }
    );
  })();

  // Avoid duplicates if something causes the script to run multiple times
  let existing = document.getElementById("costco-receipts-download-btn");
  if (existing) {
    console.log("Costcoholic Extension: button already exists, not adding again");
    return;
  }

  console.log("Costcoholic Extension: injecting button");

  // Create a floating button
  const btn = document.createElement("button");
  btn.id = "costco-receipts-download-btn";
  btn.textContent = "View Spending Summary";

  Object.assign(btn.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "999999",
    padding: "10px 16px",
    backgroundColor: "#0071c5",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    fontSize: "14px",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.25)"
  });

  function formatDateISO(date) {
    if (!(date instanceof Date)) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  btn.addEventListener("mouseenter", () => {
    btn.style.backgroundColor = "#005da0";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.backgroundColor = "#0071c5";
  });

  btn.addEventListener("click", async () => {
    try {
      // Require Costco auth tokens
      const clientID = localStorage.getItem("clientID");
      const idToken = localStorage.getItem("idToken");

      if (!clientID || !idToken) {
        alert(
          "Could not find Costco auth tokens in localStorage.\n\n" +
          "Make sure you are logged in to your Costco account " +
          "and on the Order Status page."
        );
        return;
      }

      btn.disabled = true;
      const reportProgress = (text) => {
        btn.textContent = text;
      };
      reportProgress("Fetching warehouse receipts...");

      const {
        receipts,
        warehouseDetails,
        onlineOrders,
        orderDetails
      } = await downloadReceipts(reportProgress);

      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(
          {
            type: "storeReceipts",
            receipts,
            warehouseDetails,
            onlineOrders,
            orderDetails
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              console.warn("Costcoholic Extension: error sending data to background:", chrome.runtime.lastError);
            } else {
              console.log("Costcoholic Extension: receipts sent to background, dashboard should open.", resp);
            }
          }
        );
      }

      reportProgress("Opening dashboard...");

      alert(
        `Fetched ${receipts.length} warehouse/gas receipts, ${onlineOrders.length} online orders, ${Object.keys(warehouseDetails).length} warehouse receipt details, and ${Object.keys(orderDetails).length} online order details. Opening dashboard...`
      );

      btn.textContent = "View Spending Summary";
      btn.disabled = false;
    } catch (err) {
      console.error("Costcoholic Extension: error downloading receipts", err);
      alert(
        "Error downloading receipts.\n\n" +
        "1) Refresh this page and make sure you're logged in to your Costco account.\n" +
        "2) If you still see errors, Costco may require that you verify your membership.\n" +
        "   Go to the Costco Order Status page, click the \"Warehouse\" tab, and follow any verification instructions there.\n"
      );
      btn.textContent = "View Spending Summary";
      btn.disabled = false;
    }
  });

  document.body.appendChild(btn);

  // -------- API logic ----------

  const API_BASE_URL = "https://ecom-api.costco.com/ebusiness/order/v1/orders/graphql";
  const CLIENT_IDENTIFIER = "481b1aec-aa3b-454b-b81b-48187e28f205";

  /**
   * Make authenticated GraphQL request
   */
  function makeGraphQLRequest(query, variables) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.responseType = "json";
      xhr.open("POST", API_BASE_URL);

      xhr.setRequestHeader("Content-Type", "application/json-patch+json");
      xhr.setRequestHeader("Costco.Env", "ecom");
      xhr.setRequestHeader("Costco.Service", "restOrders");
      xhr.setRequestHeader("Costco-X-Wcs-Clientid", localStorage.getItem("clientID"));
      xhr.setRequestHeader("Client-Identifier", CLIENT_IDENTIFIER);
      xhr.setRequestHeader(
        "Costco-X-Authorization",
        "Bearer " + localStorage.getItem("idToken")
      );

      xhr.onload = function () {
        if (xhr.status === 200 && xhr.response && xhr.response.data) {
          resolve(xhr.response.data);
        } else {
          console.error("Costcoholic Extension: bad status", xhr.status, xhr.response);
          reject(
            new Error(
              "Request failed with status " +
                xhr.status +
                " and response " +
                JSON.stringify(xhr.response)
            )
          );
        }
      };

      xhr.onerror = function () {
        console.error("Costcoholic Extension: network error");
        reject(new Error("Network error"));
      };

      xhr.send(JSON.stringify({ query, variables }));
    });
  }

  /**
   * List warehouse receipts
   */
  async function listReceipts(startDate, endDate) {
    console.log("Costcoholic Extension: listReceipts", { startDate, endDate });

    const query = `
      query receiptsWithCounts(
        $startDate: String!
        $endDate: String!
        $documentType: String!
        $documentSubType: String!
      ) {
        receiptsWithCounts(
          startDate: $startDate
          endDate: $endDate
          documentType: $documentType
          documentSubType: $documentSubType
        ) {
          receipts {
            warehouseName
            warehouseShortName
            warehouseCity
            warehouseNumber
            transactionDateTime
            transactionDate
            transactionBarcode
            transactionNumber
            registerNumber
            operatorNumber
            total
            subTotal
            taxes
            itemArray {
              itemNumber
              itemDescription01
              itemDescription02
              unit
              amount
              itemUnitPriceAmount
              fuelUnitQuantity
            }
            tenderArray {
              tenderDescription
              tenderTypeName
              amountTender
            }
          }
        }
      }
    `.replace(/\s+/g, " ");

    const data = await makeGraphQLRequest(query, {
      startDate,
      endDate,
      documentType: "all",
      documentSubType: "all"
    });

    const result = data.receiptsWithCounts;
    return (result && result.receipts) || [];
  }

  /**
   * List online orders
   */
  async function listOnlineOrders(startDate, endDate) {
    console.log("Costcoholic Extension: listOnlineOrders start", { startDate, endDate });
    const dedup = new Map();
    const numbers = ["847"];
    for (const warehouseNumber of numbers) {
      let pageNumber = 1;
      const pageSize = 100;
      let totalRecords = Infinity;
      while ((pageNumber - 1) * pageSize < totalRecords) {
        const query = `
          query getOnlineOrders(
            $startDate:String!,
            $endDate:String!,
            $pageNumber:Int,
            $pageSize:Int,
            $warehouseNumber:String!
          ){
            getOnlineOrders(
              startDate:$startDate,
              endDate:$endDate,
              pageNumber:$pageNumber,
              pageSize:$pageSize,
              warehouseNumber:$warehouseNumber
            ) {
              pageNumber
              pageSize
              totalNumberOfRecords
              bcOrders {
                orderHeaderId
                orderPlacedDate: orderedDate
                orderNumber: sourceOrderNumber
                orderTotal
                warehouseNumber
                status
                orderLineItems {
                  itemId
                  itemNumber
                  itemDescription
                }
              }
            }
          }
        `.replace(/\s+/g, " ");

        const variables = {
          startDate,
          endDate,
          pageNumber,
          pageSize,
          warehouseNumber
        };

        const response = await makeGraphQLRequest(query, variables).catch((err) => {
          console.warn("Costcoholic Extension: online orders error", err);
          return null;
        });

        if (!response) break;
        const normalizedResponse = Array.isArray(response.getOnlineOrders) ? response.getOnlineOrders[0] : response.getOnlineOrders;
        totalRecords = Number(normalizedResponse?.totalNumberOfRecords) || 0;
        const orders = Array.isArray(normalizedResponse?.bcOrders)
          ? normalizedResponse.bcOrders
          : [];
        orders.forEach((order) => {
          const key =
            order.orderHeaderId ||
            order.orderNumber ||
            `${warehouseNumber}-${order.orderPlacedDate}-${order.orderTotal}`;
          if (!dedup.has(key)) {
            dedup.set(key, order);
          }
        });
        if (orders.length < pageSize) break;
        pageNumber += 1;
      }
    }

    return Array.from(dedup.values());
  }

  const ORDER_DETAILS_QUERY = `
    query getOrderDetails($orderNumbers: [String]) {
      getOrderDetails(orderNumbers:$orderNumbers) {
        orderNumber : sourceOrderNumber
        orderPlacedDate : orderedDate
        status
        merchandiseTotal
        retailDeliveryFee
        shippingAndHandling
        grocerySurcharge
        uSTaxTotal1
        orderTotal
        orderPayment {
          paymentType
          totalCharged
          nameOnCard
          cardNumber
        }
        shipToAddress : orderShipTos {
          referenceNumber
          orderLineItems {
            orderStatus
            itemNumber
            itemId
            itemDescription : sourceItemDescription
            price : unitPrice
            quantity : orderedTotalQuantity
            merchandiseTotalAmount
            programType
            returnStatus
          }
        }
      }
    }
  `.replace(/\s+/g, " ");

  /**
   * Retry a request with exponential backoff for 503 errors
   */
  async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const is503 = err.message && err.message.includes("503");
        const isLastAttempt = attempt === maxRetries - 1;
        
        if (!is503 || isLastAttempt) {
          throw err;
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(
          `Costcoholic Extension: 503 error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Process order details with concurrency limit for parallel requests
   * Note: Costco API requires exactly one order per getOrderDetails request
   */
  async function processOrderDetailsWithConcurrency(orderNumbers, concurrency, reportProgress) {
    const details = {};
    const errors = {};
    let completed = 0;
    
    // Process orders in parallel with concurrency limit
    const processOrder = async (orderNumber) => {
      try {
        const data = await retryWithBackoff(() => 
          makeGraphQLRequest(ORDER_DETAILS_QUERY, { orderNumbers: [orderNumber] })
        );
        const payload = data.getOrderDetails;
        const detail = Array.isArray(payload)
          ? payload[0]
          : payload || null;
        if (detail) {
          const key =
            detail.orderNumber ||
            detail.sourceOrderNumber ||
            detail.orderHeaderId ||
            orderNumber;
          details[key] = detail;
        }
        completed++;
        if (typeof reportProgress === "function") {
          reportProgress(`Downloading order details ${completed}/${orderNumbers.length}`);
        }
      } catch (err) {
        const is503 = err.message && err.message.includes("503");
        const is400 = err.message && err.message.includes("400");
        const errorInfo = {
          error: true,
          statusCode: is503 ? 503 : (is400 ? 400 : null),
          message: is503 
            ? "Service temporarily unavailable (503). Costco's servers may be experiencing high load."
            : is400
            ? "Invalid request (400). Order may not exist or be accessible."
            : "Failed to fetch order details",
          timestamp: Date.now()
        };
        
        errors[orderNumber] = errorInfo;
        completed++;
        if (typeof reportProgress === "function") {
          reportProgress(`Downloading order details ${completed}/${orderNumbers.length}`);
        }
        
        console.warn(
          "Costcoholic Extension: order detail fetch failed",
          { orderNumber, is503, is400 },
          err
        );
      }
    };
    
    // Process orders in batches with concurrency limit
    for (let i = 0; i < orderNumbers.length; i += concurrency) {
      const batch = orderNumbers.slice(i, i + concurrency);
      await Promise.all(batch.map(processOrder));
    }
    
    return { details, errors };
  }

  /**
   * Fetch online order details with retry logic for 503 errors
   * Uses parallel processing with concurrency limit (Costco API requires one order per request)
   */
  async function fetchOnlineOrderDetails(onlineOrders, reportProgress) {
    const orderNumbers = Array.from(
      new Set(
        (onlineOrders || [])
          .map(
            (order) =>
              order.orderNumber ||
              order.sourceOrderNumber ||
              order.orderHeaderId
          )
          .filter(Boolean)
      )
    );
    if (!orderNumbers.length) {
      if (typeof reportProgress === "function") {
        reportProgress("No online orders to detail.");
      }
      return {};
    }
    console.log("Costcoholic Extension: fetching order details", {
      totalOrders: orderNumbers.length
    });
    
    // Process with concurrency limit (5 parallel requests at a time)
    // This speeds up fetching while avoiding overwhelming the API
    const CONCURRENCY = 5;
    const { details, errors } = await processOrderDetailsWithConcurrency(
      orderNumbers,
      CONCURRENCY,
      reportProgress
    );
    
    console.log("Costcoholic Extension: order detail fetch complete", {
      requested: orderNumbers.length,
      fetched: Object.keys(details).length,
      failed: Object.keys(errors).length
    });
    
    if (typeof reportProgress === "function") {
      reportProgress("Finishing up...");
    }
    
    // Merge errors into details object so dashboard can show appropriate messages
    return { ...details, __errors: errors };
  }

  /**
   * Build warehouse detail map from receipts
   */
  function buildWarehouseDetailMap(receipts) {
    const details = {};
    (receipts || []).forEach((receipt) => {
      if (!receipt) return;
      const key = String(
        receipt.transactionBarcode || receipt.transactionNumber || ""
      ).trim();
      if (!key) return;
      if (!details[key]) {
        details[key] = receipt;
      }
    });
    return details;
  }

  /**
   * Download all receipts and orders
   */
  async function downloadReceipts(reportProgress) {
    if (typeof reportProgress === "function") {
      reportProgress("Fetching warehouse receipts...");
    }
    const endDate = new Date();
    const endDateStr = formatDateISO(endDate);
    const startDate = new Date(endDate);
    startDate.setFullYear(startDate.getFullYear() - 2);
    const startDateStr = formatDateISO(startDate);

    const receipts = await listReceipts(startDateStr, endDateStr);
    const warehouseDetails = buildWarehouseDetailMap(receipts);
    if (typeof reportProgress === "function") {
      reportProgress("Fetching online orders...");
    }
    const onlineOrders = await listOnlineOrders(startDateStr, endDateStr);
    const orderDetails = await fetchOnlineOrderDetails(onlineOrders, reportProgress);
    const errors = orderDetails.__errors || {};
    const orderDetailsCount = Object.keys(orderDetails).filter(key => key !== "__errors").length;
    console.log({
      message: "Costcoholic Extension: fetch complete",
      receiptCount: receipts.length,
      onlineOrderCount: onlineOrders.length,
      warehouseDetailCount: Object.keys(warehouseDetails).length,
      orderDetailsCount: orderDetailsCount,
      failedOrderDetailsCount: Object.keys(errors).length,
      firstOnlineOrder: onlineOrders[0]
    });
    return { receipts, warehouseDetails, onlineOrders, orderDetails };
  }

})();

