// content-script.js

console.log("Costco Receipts Extension: content script loaded on", location.href);

(function () {
  // Avoid duplicates if something causes the script to run multiple times
  let existing = document.getElementById("costco-receipts-download-btn");
  if (existing) {
    console.log("Costco Receipts Extension: button already exists, not adding again");
    return;
  }

  console.log("Costco Receipts Extension: injecting button");

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
              console.warn("Costco Receipts Extension: error sending data to background:", chrome.runtime.lastError);
            } else {
              console.log("Costco Receipts Extension: receipts sent to background, dashboard should open.", resp);
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
      console.error("Costco Receipts Extension: error downloading receipts", err);
      alert("Error downloading receipts. Check the console for details.");
      btn.textContent = "View Spending Summary";
      btn.disabled = false;
    }
  });

  document.body.appendChild(btn);

  // -------- API logic ----------

  async function listReceipts(startDate, endDate) {
    console.log("Costco Receipts Extension: listReceipts", { startDate, endDate });

    return await new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.responseType = "json";
      xhr.open(
        "POST",
        "https://ecom-api.costco.com/ebusiness/order/v1/orders/graphql"
      );

      xhr.setRequestHeader("Content-Type", "application/json-patch+json");
      xhr.setRequestHeader("Costco.Env", "ecom");
      xhr.setRequestHeader("Costco.Service", "restOrders");
      xhr.setRequestHeader(
        "Costco-X-Wcs-Clientid",
        localStorage.getItem("clientID")
      );
      xhr.setRequestHeader("Client-Identifier", "481b1aec-aa3b-454b-b81b-48187e28f205");
      xhr.setRequestHeader(
        "Costco-X-Authorization",
        "Bearer " + localStorage.getItem("idToken")
      );

      const listReceiptsQuery = {
        query: `
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
              inWarehouse
              gasStation
              carWash
              gasAndCarWash
              receipts {
                warehouseName
                warehouseShortName
                receiptType
                documentType
                transactionDateTime
                transactionDate
                transactionBarcode
                transactionNumber
                transactionType
                companyNumber
                warehouseNumber
                operatorNumber
                registerNumber
                total
                warehouseAddress1
                warehouseAddress2
                warehouseCity
                warehouseState
                warehouseCountry
                warehousePostalCode
                totalItemCount
                subTotal
                taxes
                instantSavings
                membershipNumber
                itemArray {
                  itemNumber
                  itemDescription01
                  frenchItemDescription1
                  itemDescription02
                  frenchItemDescription2
                itemIdentifier
                unit
                amount
                itemUnitPriceAmount
                fuelUnitQuantity
                taxFlag
                merchantID
                entryMethod
              }
                tenderArray {
                  tenderTypeCode
                  tenderDescription
                  amountTender
                  displayAccountNumber
                  sequenceNumber
                  approvalNumber
                  responseCode
                  transactionID
                  merchantID
                  entryMethod
                }
                couponArray {
                  upcnumberCoupon
                  voidflagCoupon
                  refundflagCoupon
                  taxflagCoupon
                  amountCoupon
                }
                subTaxes {
                  tax1
                  tax2
                  tax3
                  tax4
                  aTaxPercent
                  aTaxLegend
                  aTaxAmount
                  bTaxPercent
                  bTaxLegend
                  bTaxAmount
                  cTaxPercent
                  cTaxLegend
                  cTaxAmount
                  dTaxAmount
                }
              }
            }
          }
        `.replace(/\s+/g, " "),
        variables: {
          startDate,
          endDate,
          documentType: "all",
          documentSubType: "all"
        }
      };

      xhr.onload = function () {
        if (xhr.status === 200 && xhr.response && xhr.response.data) {
          console.log("Costco Receipts Extension: receipts response", xhr.response);
          const result = xhr.response.data.receiptsWithCounts;
          resolve((result && result.receipts) || []);
        } else {
          console.error("Costco Receipts Extension: bad status", xhr.status, xhr.response);
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
        console.error("Costco Receipts Extension: network error");
        reject(new Error("Network error"));
      };

      xhr.send(JSON.stringify(listReceiptsQuery));
    });
  }

  async function listOnlineOrders(startDate, endDate) {
    console.log("Costco Receipts Extension: listOnlineOrders start", { startDate, endDate });
    const dedup = new Map();
    const numbers = ["847"];
    for (const warehouseNumber of numbers) {
      console.log("Costco Receipts Extension: querying online orders", {
        warehouseNumber,
        startDate,
        endDate
      });
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

        const response = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.responseType = "json";
          xhr.open(
            "POST",
            "https://ecom-api.costco.com/ebusiness/order/v1/orders/graphql"
          );
          xhr.setRequestHeader("Content-Type", "application/json-patch+json");
          xhr.setRequestHeader("Costco.Env", "ecom");
          xhr.setRequestHeader("Costco.Service", "restOrders");
          xhr.setRequestHeader(
            "Costco-X-Wcs-Clientid",
            localStorage.getItem("clientID")
          );
          xhr.setRequestHeader("Client-Identifier", "481b1aec-aa3b-454b-b81b-48187e28f205");
          xhr.setRequestHeader(
            "Costco-X-Authorization",
            "Bearer " + localStorage.getItem("idToken")
          );
          xhr.onload = function () {
            if (xhr.status === 200 && xhr.response && xhr.response.data) {
              console.log(
                "Costco Receipts Extension: online orders page result",
                {
                  warehouseNumber,
                  pageNumber,
                  pageSize,
                  totalNumberOfRecords: xhr.response.data.getOnlineOrders?.totalNumberOfRecords,
                  orderCount:
                    xhr.response.data.getOnlineOrders?.bcOrders?.length || 0
                }
              );
              resolve(xhr.response.data.getOnlineOrders);
            } else {
              reject(
                new Error(
                  "Online orders request failed with status " +
                    xhr.status +
                    " and response " +
                    JSON.stringify(xhr.response)
                )
              );
            }
          };
          xhr.onerror = function () {
            reject(new Error("Network error while fetching online orders"));
          };
          xhr.send(JSON.stringify({ query, variables }));
        }).catch((err) => {
          console.warn("Costco Receipts Extension: online orders error", err);
          return null;
        });

        if (!response) break;
        const normalizedResponse = Array.isArray(response) ? response[0] : response;
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
        warehouseNumber
        orderNumber : sourceOrderNumber
        orderPlacedDate : orderedDate
        status
        orderReturnAllowed
        shopCardAppliedAmount
        walletShopCardAppliedAmount
        giftOfMembershipAppliedAmount
        orderCancelAllowed
        orderPaymentFailed : orderPaymentEditAllowed
        merchandiseTotal
        retailDeliveryFee
        shippingAndHandling
        grocerySurcharge
        frozenSurchargeFee
        uSTaxTotal1
        foreignTaxTotal1
        foreignTaxTotal2
        foreignTaxTotal3
        foreignTaxTotal4
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
            itemDescription : sourceItemDescription
            price : unitPrice
            quantity : orderedTotalQuantity
            merchandiseTotalAmount
            lineItemId
            itemId
            programType
            returnStatus
            productSerialNumber
            orderLineItemCancelAllowed
            itemStatus {
              orderPlaced {
                quantity
                transactionDate
              }
              shipped {
                quantity
                transactionDate
              }
              cancelled {
                quantity
                transactionDate
              }
              returned {
                quantity
                transactionDate
              }
            }
          }
        }
      }
    }
  `.replace(/\s+/g, " ");

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
    console.log("Costco Receipts Extension: fetching order details", {
      totalOrders: orderNumbers.length
    });
    const details = {};
    for (let i = 0; i < orderNumbers.length; i += 1) {
      const number = orderNumbers[i];
      if (typeof reportProgress === "function") {
        reportProgress(`Downloading order details ${i + 1}/${orderNumbers.length}`);
      }
      /* eslint-disable no-await-in-loop */
      try {
        const detail = await requestOrderDetailsChunk(number);
        if (detail) {
          const key =
            detail.orderNumber ||
            detail.sourceOrderNumber ||
            detail.orderHeaderId ||
            number;
          details[key] = detail;
        }
      } catch (err) {
        console.warn(
          "Costco Receipts Extension: order detail fetch failed",
          { orderNumber: number },
          err
        );
      }
      /* eslint-enable no-await-in-loop */
    }
    console.log(
      "Costco Receipts Extension: order detail fetch complete",
      {
        requested: orderNumbers.length,
        fetched: Object.keys(details).length
      }
    );
    if (typeof reportProgress === "function") {
      reportProgress("Finishing up...");
    }
    return details;
  }

  function requestOrderDetailsChunk(orderNumber) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.responseType = "json";
      xhr.open(
        "POST",
        "https://ecom-api.costco.com/ebusiness/order/v1/orders/graphql"
      );
      xhr.setRequestHeader("Content-Type", "application/json-patch+json");
      xhr.setRequestHeader("Costco.Env", "ecom");
      xhr.setRequestHeader("Costco.Service", "restOrders");
      xhr.setRequestHeader(
        "Costco-X-Wcs-Clientid",
        localStorage.getItem("clientID")
      );
      xhr.setRequestHeader("Client-Identifier", "481b1aec-aa3b-454b-b81b-48187e28f205");
      xhr.setRequestHeader(
        "Costco-X-Authorization",
        "Bearer " + localStorage.getItem("idToken")
      );
      xhr.onload = function () {
        if (xhr.status === 200 && xhr.response && xhr.response.data) {
          const payload = xhr.response.data.getOrderDetails;
          const detail = Array.isArray(payload)
            ? payload[0]
            : payload || null;
          resolve(detail);
        } else {
          reject(
            new Error(
              "Order details request failed with status " +
                xhr.status +
                " and response " +
                JSON.stringify(xhr.response)
            )
          );
        }
      };
      xhr.onerror = function () {
        reject(new Error("Network error while fetching order details"));
      };
      xhr.send(
        JSON.stringify({
          query: ORDER_DETAILS_QUERY,
          variables: { orderNumbers: [orderNumber] }
        })
      );
    });
  }

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
    console.log({
      message: "Costco Receipts Extension: fetch complete",
      receiptCount: receipts.length,
      onlineOrderCount: onlineOrders.length,
      warehouseDetailCount: Object.keys(warehouseDetails).length,
      orderDetailsCount: Object.keys(orderDetails).length,
      firstOnlineOrder: onlineOrders[0]
    });
    return { receipts, warehouseDetails, onlineOrders, orderDetails };
  }

})();
