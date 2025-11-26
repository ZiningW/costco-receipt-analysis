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
  btn.textContent = "Download Costco Receipts";

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

  btn.addEventListener("mouseenter", () => {
    btn.style.backgroundColor = "#005da0";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.backgroundColor = "#0071c5";
  });

  btn.addEventListener("click", async () => {
    try {
      const defaultStart = "09/16/2023";
      const startDateStr = window.prompt(
        "Enter start date (MM/DD/YYYY) for receipts:",
        defaultStart
      );

      if (!startDateStr) {
        return; // user cancelled
      }

      // Basic format validation
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(startDateStr)) {
        alert("Please use the format MM/DD/YYYY, e.g. 09/16/2023");
        return;
      }

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
      btn.textContent = "Fetching receipts...";

      const receipts = await downloadReceipts(startDateStr);

      alert(`Got ${receipts.length} receipts.\n\nA JSON file has been downloaded and a dashboard tab should open.`);

      btn.textContent = "Download Costco Receipts";
      btn.disabled = false;
    } catch (err) {
      console.error("Costco Receipts Extension: error downloading receipts", err);
      alert("Error downloading receipts. Check the console for details.");
      btn.textContent = "Download Costco Receipts";
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
          query receipts($startDate: String!, $endDate: String!) {
            receipts(startDate: $startDate, endDate: $endDate) {
              warehouseName
              documentType
              transactionDateTime
              transactionDate
              companyNumber
              warehouseNumber
              operatorNumber
              warehouseName
              warehouseShortName
              registerNumber
              transactionNumber
              transactionType
              transactionBarcode
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
              total
              itemArray {
                itemNumber
                itemDescription01
                frenchItemDescription1
                itemDescription02
                frenchItemDescription2
                itemIdentifier
                unit
                amount
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
              instantSavings
              membershipNumber
            }
          }
        `.replace(/\s+/g, " "),
        variables: {
          startDate,
          endDate
        }
      };

      xhr.onload = function () {
        if (xhr.status === 200 && xhr.response && xhr.response.data) {
          console.log("Costco Receipts Extension: receipts response", xhr.response);
          resolve(xhr.response.data.receipts || []);
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

  async function downloadReceipts(startDateStr) {
    // End date = today, formatted as MM/DD/YYYY
    const endDate = new Date();
    const endDateStr = endDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    const receipts = await listReceipts(startDateStr, endDateStr);

    console.log(`Costco Receipts Extension: got ${receipts.length} receipts, sending to background and saving.`);

    // 1) Send receipts to background so it can open dashboard.html
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        { type: "storeReceipts", receipts },
        (resp) => {
          if (chrome.runtime.lastError) {
            console.warn("Costco Receipts Extension: error sending receipts to background:", chrome.runtime.lastError);
          } else {
            console.log("Costco Receipts Extension: receipts sent to background, dashboard should open.", resp);
          }
        }
      );
    }

    // 2) Still download the JSON file locally as before
    const blob = new Blob([JSON.stringify(receipts, null, 2)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.download = `costco-${endDate.toISOString()}.json`;
    a.href = url;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 0);

    return receipts;
  }
})();