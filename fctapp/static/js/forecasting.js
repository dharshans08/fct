let filterPopupVisible = false;
let selectedProduct = null;
let regionPopupVisible = false;
let selectedRegion = null;
let accountOwnerPopupVisible = false;
let selectedAccountOwner = null;
let productFamilyPopupVisible = false;
let selectedProductFamily = null;

const CACHE_KEYS = {
  CHART_DATA: "CACHE_KEY:CHART_DATA",
  PRODUCT: "CACHE_KEY:PRODUCT_NAMES",
  FROM_DATE: "CACHE_KEY:FROM_DATE",
  REGION: "CACHE_KEY:REGION_NAMES",
  ACCOUNT_OWNER: "CACHE_KEY:ACCOUNT_OWNER_NAMES",
  PRODUCT_FAMILY: "CACHE_KEY:PRODUCT_FAMILY_NAMES",
  TO_DATE: "CACHE_KEY:TO_DATE",
};

const CACHE_CONFIG = {
  EXPIRY: 5 * 60 * 1000 
};

let sessionTimeout;

function startSessionTimer() {
  sessionTimeout = setTimeout(() => {
    alert("Session expired. Redirecting to the login page...");
    clearLocalStorage();
    window.location.href = "/"; 
  }, CACHE_CONFIG.EXPIRY);
}
function resetSessionTimer() {
  clearTimeout(sessionTimeout);
  startSessionTimer();
}
function setupSessionTracking() {
  document.addEventListener("mousemove", resetSessionTimer);
  document.addEventListener("keydown", resetSessionTimer);
  document.addEventListener("click", resetSessionTimer);
}

function toggleAccountOwnerPopup() {
  const popup = document.getElementById("accountOwnerPopup");
  if (!popup) {
    console.error("Account owner popup element not found. Make sure the ID 'accountOwnerPopup' exists in the HTML.");
    return;
  }

  accountOwnerPopupVisible = !accountOwnerPopupVisible;

  if (accountOwnerPopupVisible) {
    popup.style.display = "block";
    setTimeout(() => document.addEventListener("click", handleAccountOwnerClickOutside));
    populateAccountOwnerFilters();
  } else {
    popup.style.display = "none";
    document.removeEventListener("click", handleAccountOwnerClickOutside);
  }
}


function toggleregionPopup() {
  const popup = document.getElementById("regionPopup");
  
  // Add error checking
  if (!popup) {
    console.error("Region popup element not found. Make sure the ID 'regionPopup' exists in the HTML.");
    return;
  }

  regionPopupVisible = !regionPopupVisible;

  if (regionPopupVisible) {
    popup.style.display = "block";
    setTimeout(() => document.addEventListener("click", handleRegionClickOutside));
    populateRegionFilters();
  } else {
    popup.style.display = "none";
    document.removeEventListener("click", handleRegionClickOutside);
  }
}
function toggleProductFamilyPopup() {
  const popup = document.getElementById("productFamilyPopup");

  // Add error checking
  if (!popup) {
    console.error("Product family popup element not found. Make sure the ID 'productFamilyPopup' exists in the HTML.");
    return;
  }

  productFamilyPopupVisible = !productFamilyPopupVisible;

  if (productFamilyPopupVisible) {
    popup.style.display = "block";
    setTimeout(() => document.addEventListener("click", handleProductFamilyClickOutside));
    populateProductFamilyFilters();
  } else {
    popup.style.display = "none";
    document.removeEventListener("click", handleProductFamilyClickOutside);
  }
}
function togglePopup() {
  const popup = document.getElementById("filterPopup");
  filterPopupVisible = !filterPopupVisible;

  if (filterPopupVisible) {
    popup.style.display = "block";
    setTimeout(() => document.addEventListener("click", handleClickOutside));
    populateProductFilters();
  } else {
    popup.style.display = "none";
    document.removeEventListener("click", handleClickOutside);
  }
}
function handleClickOutside(event) {
  const popup = document.getElementById("filterPopup");
  const button = document.getElementById("filterButton");

  if (!popup.contains(event.target) && event.target !== button) {
    togglePopup();
  }
}
function handleAccountOwnerClickOutside(event) {
  const popup = document.getElementById("accountOwnerPopup");
  const button = document.getElementById("accountOwnerButton");

  if (!popup.contains(event.target) && event.target !== button) {
    toggleAccountOwnerPopup();
  }
}
function handleProductFamilyClickOutside(event) {
  const popup = document.getElementById("productFamilyPopup");
  const button = document.getElementById("productFamilyButton");

  if (!popup.contains(event.target) && event.target !== button) {
    toggleProductFamilyPopup();
  }
}

function handleRegionClickOutside(event) {
  const popup = document.getElementById("regionPopup");
  const button = document.getElementById("regionButton");

  if (!popup.contains(event.target) && event.target !== button) {
    toggleregionPopup();
  }
}

async function populateRegionFilters() {
  const regionNames = await fetchRegionNames();
  const regionPopup = document.getElementById("regionPopup");

  regionPopup.innerHTML = "";
  regionPopup.style.padding = "15px";
  regionPopup.style.borderRadius = "10px";
  regionPopup.style.background = "#fff";
  regionPopup.style.boxShadow = "0px 4px 8px rgba(0, 0, 0, 0.1)";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search regions...";
  searchInput.className = "filter-search";
  searchInput.style.width = "100%";
  searchInput.style.padding = "8px";
  searchInput.style.marginBottom = "10px";
  searchInput.style.borderRadius = "5px";
  searchInput.style.border = "1px solid #ccc";
  searchInput.addEventListener("input", () =>
    filterRegions(searchInput.value, regionNames)
  );

  // Create the container with the ID that matches the selector in applyRegionFilters
  const container = document.createElement("div");
  container.id = "regionCheckboxContainer"; // This is the key change
  container.className = "region-filters";
  container.style.maxHeight = "200px";
  container.style.overflowY = "auto";

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "filter-buttons";
  buttonContainer.style.display = "flex";
  buttonContainer.style.justifyContent = "space-between";
  buttonContainer.style.marginTop = "10px";

  const cancelButton = document.createElement("button");
  cancelButton.textContent = "Cancel";
  cancelButton.className = "cancel-button";
  cancelButton.style.padding = "8px 12px";
  cancelButton.style.border = "none";
  cancelButton.style.borderRadius = "5px";
  cancelButton.style.background = "#ccc";
  cancelButton.style.cursor = "pointer";
  cancelButton.onclick = () => toggleregionPopup();

  const applyButton = document.createElement("button");
  applyButton.textContent = "Apply";
  applyButton.className = "apply-button";
  applyButton.style.padding = "8px 12px";
  applyButton.style.border = "none";
  applyButton.style.borderRadius = "5px";
  applyButton.style.background = "#007bff";
  applyButton.style.color = "#fff";
  applyButton.style.cursor = "pointer";
  applyButton.onclick = () => applyRegionFilters();

  buttonContainer.appendChild(cancelButton);
  buttonContainer.appendChild(applyButton);

  regionPopup.appendChild(searchInput);
  regionPopup.appendChild(container);
  regionPopup.appendChild(buttonContainer);

  updateRegionList(container, regionNames);
}
async function populateAccountOwnerFilters() {
  const accountOwnerNames = await fetchAccountOwnerNames();
  const accountOwnerPopup = document.getElementById("accountOwnerPopup");

  accountOwnerPopup.innerHTML = "";
  accountOwnerPopup.style.padding = "15px";
  accountOwnerPopup.style.borderRadius = "10px";
  accountOwnerPopup.style.background = "#fff";
  accountOwnerPopup.style.boxShadow = "0px 4px 8px rgba(0, 0, 0, 0.1)";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search account owners...";
  searchInput.className = "filter-search";
  searchInput.style.width = "100%";
  searchInput.style.padding = "8px";
  searchInput.style.marginBottom = "10px";
  searchInput.style.borderRadius = "5px";
  searchInput.style.border = "1px solid #ccc";
  searchInput.addEventListener("input", () =>
    filterAccountOwners(searchInput.value, accountOwnerNames)
  );

  const container = document.createElement("div");
  container.id = "accountOwnerCheckboxContainer";
  container.className = "account-owner-filters";
  container.style.maxHeight = "200px";
  container.style.overflowY = "auto";

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "filter-buttons";
  buttonContainer.style.display = "flex";
  buttonContainer.style.justifyContent = "space-between";
  buttonContainer.style.marginTop = "10px";

  const cancelButton = document.createElement("button");
  cancelButton.textContent = "Cancel";
  cancelButton.className = "cancel-button";
  cancelButton.style.padding = "8px 12px";
  cancelButton.style.border = "none";
  cancelButton.style.borderRadius = "5px";
  cancelButton.style.background = "#ccc";
  cancelButton.style.cursor = "pointer";
  cancelButton.onclick = () => toggleAccountOwnerPopup();

  const applyButton = document.createElement("button");
  applyButton.textContent = "Apply";
  applyButton.className = "apply-button";
  applyButton.style.padding = "8px 12px";
  applyButton.style.border = "none";
  applyButton.style.borderRadius = "5px";
  applyButton.style.background = "#007bff";
  applyButton.style.color = "#fff";
  applyButton.style.cursor = "pointer";
  applyButton.onclick = () => applyAccountOwnerFilters();

  buttonContainer.appendChild(cancelButton);
  buttonContainer.appendChild(applyButton);

  accountOwnerPopup.appendChild(searchInput);
  accountOwnerPopup.appendChild(container);
  accountOwnerPopup.appendChild(buttonContainer);

  updateAccountOwnerList(container, accountOwnerNames);
}

async function populateProductFamilyFilters() {
  const productFamilyNames = await fetchProductFamilyNames();
  const productFamilyPopup = document.getElementById("productFamilyPopup");

  productFamilyPopup.innerHTML = "";
  productFamilyPopup.style.padding = "15px";
  productFamilyPopup.style.borderRadius = "10px";
  productFamilyPopup.style.background = "#fff";
  productFamilyPopup.style.boxShadow = "0px 4px 8px rgba(0, 0, 0, 0.1)";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search product families...";
  searchInput.className = "filter-search";
  searchInput.style.width = "100%";
  searchInput.style.padding = "8px";
  searchInput.style.marginBottom = "10px";
  searchInput.style.borderRadius = "5px";
  searchInput.style.border = "1px solid #ccc";
  searchInput.addEventListener("input", () =>
    filterProductFamilies(searchInput.value, productFamilyNames)
  );

  // Create the container with the ID that matches the selector in applyProductFamilyFilters
  const container = document.createElement("div");
  container.id = "productFamilyCheckboxContainer"; // Updated key change
  container.className = "product-family-filters";
  container.style.maxHeight = "200px";
  container.style.overflowY = "auto";

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "filter-buttons";
  buttonContainer.style.display = "flex";
  buttonContainer.style.justifyContent = "space-between";
  buttonContainer.style.marginTop = "10px";

  const cancelButton = document.createElement("button");
  cancelButton.textContent = "Cancel";
  cancelButton.className = "cancel-button";
  cancelButton.style.padding = "8px 12px";
  cancelButton.style.border = "none";
  cancelButton.style.borderRadius = "5px";
  cancelButton.style.background = "#ccc";
  cancelButton.style.cursor = "pointer";
  cancelButton.onclick = () => toggleProductFamilyPopup();

  const applyButton = document.createElement("button");
  applyButton.textContent = "Apply";
  applyButton.className = "apply-button";
  applyButton.style.padding = "8px 12px";
  applyButton.style.border = "none";
  applyButton.style.borderRadius = "5px";
  applyButton.style.background = "#007bff";
  applyButton.style.color = "#fff";
  applyButton.style.cursor = "pointer";
  applyButton.onclick = () => applyProductFamilyFilters();

  buttonContainer.appendChild(cancelButton);
  buttonContainer.appendChild(applyButton);

  productFamilyPopup.appendChild(searchInput);
  productFamilyPopup.appendChild(container);
  productFamilyPopup.appendChild(buttonContainer);

  updateProductFamilyList(container, productFamilyNames);
}

async function populateProductFilters() {
  const productNames = await fetchProductNames();
  const filterPopup = document.getElementById("filterPopup");

  filterPopup.innerHTML = "";
  filterPopup.style.padding = "15px";
  filterPopup.style.borderRadius = "10px";
  filterPopup.style.background = "#fff";
  filterPopup.style.boxShadow = "0px 4px 8px rgba(0, 0, 0, 0.1)";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search products...";
  searchInput.className = "filter-search";
  searchInput.style.width = "100%";
  searchInput.style.padding = "8px";
  searchInput.style.marginBottom = "10px";
  searchInput.style.borderRadius = "5px";
  searchInput.style.border = "1px solid #ccc";
  searchInput.addEventListener("input", () =>
    filterProducts(searchInput.value, productNames)
  );

  const container = document.createElement("div");
  container.className = "product-filters";
  container.style.maxHeight = "200px";
  container.style.overflowY = "auto";

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "filter-buttons";
  buttonContainer.style.display = "flex";
  buttonContainer.style.justifyContent = "space-between";
  buttonContainer.style.marginTop = "10px";

  const cancelButton = document.createElement("button");
  cancelButton.textContent = "Cancel";
  cancelButton.className = "cancel-button";
  cancelButton.style.padding = "8px 12px";
  cancelButton.style.border = "none";
  cancelButton.style.borderRadius = "5px";
  cancelButton.style.background = "#ccc";
  cancelButton.style.cursor = "pointer";
  cancelButton.onclick = () => togglePopup();

  const applyButton = document.createElement("button");
  applyButton.textContent = "Apply";
  applyButton.className = "apply-button";
  applyButton.style.padding = "8px 12px";
  applyButton.style.border = "none";
  applyButton.style.borderRadius = "5px";
  applyButton.style.background = "#007bff";
  applyButton.style.color = "#fff";
  applyButton.style.cursor = "pointer";
  applyButton.onclick = () => applyFilters();

  buttonContainer.appendChild(cancelButton);
  buttonContainer.appendChild(applyButton);

  filterPopup.appendChild(searchInput);
  filterPopup.appendChild(container);
  filterPopup.appendChild(buttonContainer);

  updateProductList(container, productNames);
}

function updateRegionList(container, regionNames) {
  container.innerHTML = "";
  regionNames.forEach((region) => {
    const label = document.createElement("label");
    label.style.display = "block";
    label.style.padding = "5px 0";
    label.style.cursor = "pointer";
    label.innerHTML = `
      <input type="radio" name="region" value="${region}"> ${region}
    `;
    container.appendChild(label);
  });
}

function updateAccountOwnerList(container, accountOwnerNames) {
  container.innerHTML = "";
  accountOwnerNames.forEach((accountOwner) => {
    const label = document.createElement("label");
    label.style.display = "block";
    label.style.padding = "5px 0";
    label.style.cursor = "pointer";
    label.innerHTML = `
      <input type="radio" name="accountOwner" value="${accountOwner}"> ${accountOwner}
    `;
    container.appendChild(label);
  });
}

function updateProductFamilyList(container, productFamilyNames) {
  container.innerHTML = "";
  productFamilyNames.forEach((productFamily) => {
    const label = document.createElement("label");
    label.style.display = "block";
    label.style.padding = "5px 0";
    label.style.cursor = "pointer";
    label.innerHTML = `
      <input type="radio" name="productFamily" value="${productFamily}"> ${productFamily}
    `;
    container.appendChild(label);
  });
}
// Update the list of products shown in the popup
function updateProductList(container, productNames) {
  container.innerHTML = "";
  productNames.forEach((product) => {
    const label = document.createElement("label");
    label.style.display = "block";
    label.style.padding = "5px 0";
    label.style.cursor = "pointer";
    label.innerHTML = `
      <input type="radio" name="product" value="${product}"> ${product}
    `;
    container.appendChild(label);
  });
}

function filterRegions(searchTerm, regionNames) {
  const container = document.getElementById("regionCheckboxContainer");
  const filteredRegions = regionNames.filter((region) =>
    region.toLowerCase().includes(searchTerm.toLowerCase())
  );
  updateRegionList(container, filteredRegions);
}
function filterAccountOwners(searchTerm, accountOwnerNames) {
  const container = document.getElementById("accountOwnerCheckboxContainer");
  const filteredAccountOwners = accountOwnerNames.filter((accountOwner) =>
    accountOwner.toLowerCase().includes(searchTerm.toLowerCase())
  );
  updateAccountOwnerList(container, filteredAccountOwners);
}
function filterProductFamilies(searchTerm, productFamilyNames) {
  const container = document.getElementById("productFamilyCheckboxContainer");
  const filteredProductFamilies = productFamilyNames.filter((productFamily) =>
    productFamily.toLowerCase().includes(searchTerm.toLowerCase())
  );
  updateProductFamilyList(container, filteredProductFamilies);
}

function filterProducts(searchTerm, productNames) {
  const container = document.querySelector(".product-filters");
  const filteredProducts = productNames.filter((product) =>
    product.toLowerCase().includes(searchTerm.toLowerCase())
  );
  updateProductList(container, filteredProducts);
}

function applyRegionFilters() {
  const selectedRadio = document.querySelector(
    "#regionCheckboxContainer input[type='radio']:checked"
  );
  const selectedRegionsText = document.getElementById("selectedregionText");

  if (selectedRadio) {
    selectedRegion = selectedRadio.value;
    selectedRegionsText.textContent = `(${selectedRegion})`;
    localStorage.setItem(CACHE_KEYS.REGION, selectedRegion);
  } else {
    selectedRegion = null;
    selectedRegionsText.textContent = "(SELECT REGION)";
    localStorage.removeItem(CACHE_KEYS.REGION);
    alert("Please select a region.");
  }

  toggleregionPopup();
}
function applyAccountOwnerFilters() {
  const selectedRadio = document.querySelector(
    "#accountOwnerCheckboxContainer input[type='radio']:checked"
  );
  const selectedAccountOwnerText = document.getElementById("selectedAccountOwnerText");

  if (selectedRadio) {
    selectedAccountOwner = selectedRadio.value;
    selectedAccountOwnerText.textContent = `(${selectedAccountOwner})`;
    localStorage.setItem(CACHE_KEYS.ACCOUNT_OWNER, selectedAccountOwner);
  } else {
    selectedAccountOwner = null;
    selectedAccountOwnerText.textContent = "(SELECT ACCOUNT OWNER)";
    localStorage.removeItem(CACHE_KEYS.ACCOUNT_OWNER);
    alert("Please select an account owner.");
  }

  toggleAccountOwnerPopup();
}
function applyProductFamilyFilters() {
  const selectedRadio = document.querySelector(
    "#productFamilyCheckboxContainer input[type='radio']:checked"
  );
  const selectedProductFamilyText = document.getElementById("selectedProductFamilyText");

  if (selectedRadio) {
    selectedProductFamily = selectedRadio.value;
    selectedProductFamilyText.textContent = `(${selectedProductFamily})`;
    localStorage.setItem(CACHE_KEYS.PRODUCT_FAMILY, selectedProductFamily);
  } else {
    selectedProductFamily = null;
    selectedProductFamilyText.textContent = "(SELECT PRODUCT FAMILY)";
    localStorage.removeItem(CACHE_KEYS.PRODUCT_FAMILY);
    alert("Please select a product family.");
  }

  toggleProductFamilyPopup();
}
function applyFilters() {
  const selectedRadio = document.querySelector(
    ".product-filters input[type='radio']:checked"
  );
  const selectedProductsText = document.getElementById("selectedProductsText");

  if (selectedRadio) {
    selectedProduct = selectedRadio.value;
    selectedProductsText.textContent = `(${selectedProduct})`;
    localStorage.setItem(CACHE_KEYS.PRODUCT, selectedProduct);
  } else {
    selectedProduct = null;
    selectedProductsText.textContent = "(No product selected)";
    localStorage.removeItem(CACHE_KEYS.PRODUCT);
    alert("Please select a product.");
  }

  togglePopup();
}

async function fetchProductNames() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(JSON.parse(document.getElementById("productData").textContent));
    }, 1000);
  });
}

async function fetchRegionNames() {
    try {
        let response = await fetch("/forecasting/");
        if (!response.ok) {
            throw new Error("Failed to fetch regions");
        }
        let data = await response.text(); // Get the HTML response

        // Extract JSON embedded in the HTML (since Django sends JSON as context)
        let parser = new DOMParser();
        let doc = parser.parseFromString(data, "text/html");
        let scriptTag = doc.querySelector("#regions-data"); // Add an id to the script tag in your template

        if (!scriptTag) {
            throw new Error("Regions data not found in HTML.");
        }

        let regions = JSON.parse(scriptTag.textContent);
        return regions;
    } catch (error) {
        console.error("Error fetching regions:", error);
        return [];
    }
}
async function fetchAccountOwnerNames() {
  try {
      let response = await fetch("/forecasting/");
      if (!response.ok) {
          throw new Error("Failed to fetch account owners");
      }
      let data = await response.text(); 

      let parser = new DOMParser();
      let doc = parser.parseFromString(data, "text/html");
      let scriptTag = doc.querySelector("#accountowners-data");

      if (!scriptTag) {
          throw new Error("Account owner data not found in HTML.");
      }

      console.log("Extracted Script Tag Content:", scriptTag.textContent); // Log script content

      let accountOwners = JSON.parse(scriptTag.textContent);
      console.log("Parsed Account Owners:", accountOwners);
      return accountOwners;
  } catch (error) {
      console.error("Error fetching account owners:", error);
      return [];
  }
}
fetchAccountOwnerNames();

async function fetchProductFamilyNames() {
  try {
      let response = await fetch("/forecasting/");
      if (!response.ok) {
          throw new Error("Failed to fetch product families");
      }
      let data = await response.text(); // Get the HTML response

      // Extract JSON embedded in the HTML
      let parser = new DOMParser();
      let doc = parser.parseFromString(data, "text/html");
      let scriptTag = doc.querySelector("#productfamilies-data"); // Ensure this id is in your Django template

      if (!scriptTag) {
          throw new Error("Product family data not found in HTML.");
      }

      let productFamilies = JSON.parse(scriptTag.textContent);
      console.log("Fetched Product Families:", productFamilies);
      return productFamilies;
  } catch (error) {
      console.error("Error fetching product families:", error);
      return [];
  }
}

// Call the function correctly
fetchProductFamilyNames();

function hideInfoText() {
  const infoText = document.getElementById("infoText");
  if (infoText) {
    infoText.style.display = "none";
    infoText.classList.add("d-none");
  }
}

function showInfoText() {
  const infoText = document.getElementById("infoText");
  if (infoText) {
    infoText.style.display = "flex";
    infoText.classList.remove("d-none");
  }
}
async function updateChart(data) {
  console.log("Updating chart with data:", data);

  const labels = data.labels;
  const historicalData = data.historical_data;
  const forecastData = data.forecast_data;
  const productName = data.product_name;

  // Get selected filters from localStorage
  const regionName = localStorage.getItem(CACHE_KEYS.REGION) || "N/A";
  const accountOwner = localStorage.getItem(CACHE_KEYS.ACCOUNT_OWNER) || "N/A";
  const productFamily = localStorage.getItem(CACHE_KEYS.PRODUCT_FAMILY) || "N/A";

  const cachedChartData = {
    labels,
    historicalData,
    forecastData,
    productName,
    regionName,
    accountOwner,
    productFamily
  };

  localStorage.setItem(CACHE_KEYS.CHART_DATA, JSON.stringify(cachedChartData));

  await updateRevenueChart(labels, historicalData, forecastData, productName, regionName, accountOwner, productFamily);
}

async function updateRevenueChart(labels, historicalData, forecastData, productName, regionName, accountOwner, productFamily) {
  const ctx = document.getElementById("volumechart").getContext("2d");

  if (window.revenueChart instanceof Chart) {
    window.revenueChart.destroy();
  }

  const processedHistoricalData = historicalData.map(value => value === null ? NaN : value);
  const processedForecastData = forecastData.map(value => value === null ? NaN : value);

  // Plugin to display Product, Region, Account Owner, and Product Family
  const productDetailsPlugin = {
    id: "productDetailsPlugin",
    beforeDraw(chart) {
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.font = "bold 12px Arial"; // Reduced font size
      ctx.fillStyle = "black";
      ctx.textAlign = "center";

      const titleText = `Product: ${productName || "N/A"}  |  Region: ${regionName || "N/A"}`;
      const subText = `Account Owner: ${accountOwner || "N/A"}  |  Product Family: ${productFamily || "N/A"}`;

      ctx.fillText(titleText, chart.width / 2, chartArea.top - 20);
      ctx.fillText(subText, chart.width / 2, chartArea.top - 5);
      ctx.restore();
    }
  };

  window.revenueChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Historical Quantity",
          data: processedHistoricalData,
          borderColor: "rgb(202, 17, 26)",
          backgroundColor: "rgb(202, 17, 26)",
          tension: 0.4,
          spanGaps: true,
          borderWidth: 2
        },
        {
          label: "Forecast Quantity",
          data: processedForecastData,
          borderColor: "rgb(16, 218, 16)",
          backgroundColor: "rgb(16, 218, 16)",
          tension: 0.4,
          spanGaps: true,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      elements: {
        point: { radius: 3, hoverRadius: 6 }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { drawBorder: false },
          ticks: { callback: (value) => value }
        },
        x: {
          grid: { display: false },
          ticks: { font: { weight: "bold" } }
        }
      },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            boxWidth: 20,
            boxHeight: 20,
            font: { weight: "bold", size: 14 }
          }
        },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: function (context) {
              let label = context.dataset.label || "";
              if (label) {
                label += ": ";
              }
              if (context.parsed.y !== null) {
                label += context.parsed.y;
              }
              return label;
            }
          }
        }
      }
    },
    plugins: [productDetailsPlugin]
  });

  // Bootstrap Styling for the Chart Container
  const chartContainer = document.getElementById("volumechart").parentElement;
  chartContainer.classList.add("border", "p-3", "shadow-sm", "rounded");
}

function clearLocalStorage() {
  localStorage.clear();
}
function loadCachedChart() {
  const cachedData = localStorage.getItem(CACHE_KEYS.CHART_DATA);
  const cachedProduct = localStorage.getItem(CACHE_KEYS.PRODUCT);
  const cachedRegion = localStorage.getItem(CACHE_KEYS.REGION);
  const cachedFromDate = localStorage.getItem(CACHE_KEYS.FROM_DATE);
  const cachedToDate = localStorage.getItem(CACHE_KEYS.TO_DATE);
  const cachedAccountOwner = localStorage.getItem(CACHE_KEYS.ACCOUNT_OWNER);
  const cachedProductFamily = localStorage.getItem(CACHE_KEYS.PRODUCT_FAMILY);

  if (
    cachedData &&
    cachedProduct &&
    cachedRegion &&
    cachedFromDate &&
    cachedToDate &&
    cachedAccountOwner &&
    cachedProductFamily
  ) {
    try {
      const parsedData = JSON.parse(cachedData);
      console.log("Loading chart from cache:", parsedData);

      const fromDateElement = document.getElementById("fromDate");
      const toDateElement = document.getElementById("toDate");
      const selectedProductsText = document.getElementById("selectedProductsText");
      const selectedRegionsText = document.getElementById("selectedregionText");
      const selectedAccountOwnerText = document.getElementById("selectedAccountOwnerText");
      const selectedProductFamilyText = document.getElementById("selectedProductFamilyText");

      if (fromDateElement) fromDateElement.value = cachedFromDate;
      if (toDateElement) toDateElement.value = cachedToDate;

      if (selectedProductsText) {
        selectedProductsText.textContent = `(${cachedProduct})`;
      }

      if (selectedRegionsText) {
        selectedRegionsText.textContent = `(${cachedRegion})`;
      }

      if (selectedAccountOwnerText) {
        selectedAccountOwnerText.textContent = `(${cachedAccountOwner})`;
      }

      if (selectedProductFamilyText) {
        selectedProductFamilyText.textContent = `(${cachedProductFamily})`;
      }

      selectedProduct = cachedProduct;
      selectedRegion = cachedRegion;
      selectedAccountOwner = cachedAccountOwner;
      selectedProductFamily = cachedProductFamily;

      // Rest of the existing loadCachedChart logic remains the same
      const generateBtn = document.getElementById("generateBtn");
      if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.classList.remove("btn-secondary");
        generateBtn.classList.add("btn-primary");
        generateBtn.style.backgroundColor = "#1956b3";
      }

      const filterSection = document.getElementById("filterSection");
      if (filterSection) {
        filterSection.style.display = "block";
      }

      hideInfoText();

      updateRevenueChart(
        parsedData.labels,
        parsedData.historicalData,
        parsedData.forecastData,
        parsedData.productName,
        parsedData.regionName,
        parsedData.accountOwner,
        parsedData.productFamily
      );

      document.getElementById("volumechart").parentElement.style.display = "block";

      return true;
    } catch (error) {
      console.error("Error parsing cached chart data:", error);
    }
  }
  return false;
}
document.addEventListener("DOMContentLoaded", function () {
  const fromDate = document.getElementById("fromDate");
  const toDate = document.getElementById("toDate");
  const generateBtn = document.getElementById("generateBtn");
  const infoText = document.getElementById("infoText");
  const filterSection = document.getElementById("filterSection");
  const chartContainer = document.getElementById("volumechart").parentElement;
  const selectedProductsText = document.getElementById("selectedProductsText");
  const selectedRegionsText = document.getElementById("selectedregionText");
  const selectedAccountOwnerText = document.getElementById("selectedAccountOwnerText");
  const selectedProductFamilyText = document.getElementById("selectedProductFamilyText");

  startSessionTimer();
  setupSessionTracking();

  let selectedProduct = localStorage.getItem(CACHE_KEYS.PRODUCT) || null;
  let selectedRegion = localStorage.getItem(CACHE_KEYS.REGION) || null;
  let selectedAccountOwner = localStorage.getItem(CACHE_KEYS.ACCOUNT_OWNER) || null;
  let selectedProductFamily = localStorage.getItem(CACHE_KEYS.PRODUCT_FAMILY) || null;

  chartContainer.style.display = "none";
  generateBtn.disabled = true;

  fromDate.value = localStorage.getItem(CACHE_KEYS.FROM_DATE) || "";
  toDate.value = localStorage.getItem(CACHE_KEYS.TO_DATE) || "";

  function validateDates() {
    const start = new Date(fromDate.value);
    const end = new Date(toDate.value);
    if (!fromDate.value || !toDate.value || isNaN(start) || isNaN(end)) return false;
    if (start.getFullYear() < 2025 || end.getFullYear() < 2025) {
      alert("Please select dates from the year 2025 or later.");
      return false;
    }
    if (start > end) {
      alert("The 'From' date cannot be later than the 'To' date.");
      return false;
    }
    return true;
  }

  function validateProductSelection() {
    return selectedProduct !== null && selectedProduct !== "";
  }

  function updateGenerateButton() {
    const datesValid = validateDates();
    const productValid = validateProductSelection();

    if (datesValid && productValid) {
      generateBtn.disabled = false;
      generateBtn.classList.remove("btn-secondary");
      generateBtn.classList.add("btn-primary");
      generateBtn.style.backgroundColor = "#1956b3";
    } else {
      generateBtn.disabled = true;
      generateBtn.classList.remove("btn-primary");
      generateBtn.classList.add("btn-secondary");
      generateBtn.style.backgroundColor = "";
    }
  }

  function updateUIState(isGenerating) {
    if (isGenerating) {
      hideInfoText();
      filterSection.style.display = "block";
    } else {
      showInfoText();
      filterSection.style.display = "none";
      chartContainer.style.display = "none";
    }
  }

  window.applyFilters = function () {
    const selectedRadio = document.querySelector(".product-filters input[type='radio']:checked");

    if (selectedRadio) {
      selectedProduct = selectedRadio.value;
      localStorage.setItem(CACHE_KEYS.PRODUCT, selectedProduct);
      selectedProductsText.textContent = `(${selectedProduct})`;
      updateGenerateButton();
    } else {
      selectedProduct = null;
      localStorage.removeItem(CACHE_KEYS.PRODUCT);
      selectedProductsText.textContent = "(No product selected)";
      alert("Please select a product.");
    }

    togglePopup();
  };

  window.applyRegionFilters = function () {
    const selectedRadio = document.querySelector("#regionCheckboxContainer input[type='radio']:checked");

    if (selectedRadio) {
      selectedRegion = selectedRadio.value;
      localStorage.setItem(CACHE_KEYS.REGION, selectedRegion);
      selectedRegionsText.textContent = `(${selectedRegion})`;
      updateGenerateButton();
    } else {
      selectedRegion = null;
      localStorage.removeItem(CACHE_KEYS.REGION);
      selectedRegionsText.textContent = "(SELECT REGION)";
      alert("Please select a region.");
    }

    toggleregionPopup();
  };

  window.applyAccountOwnerFilters = function () {
    const selectedRadio = document.querySelector("#accountOwnerCheckboxContainer input[type='radio']:checked");

    if (selectedRadio) {
      selectedAccountOwner = selectedRadio.value;
      localStorage.setItem(CACHE_KEYS.ACCOUNT_OWNER, selectedAccountOwner);
      selectedAccountOwnerText.textContent = `(${selectedAccountOwner})`;
      updateGenerateButton();
    } else {
      selectedAccountOwner = null;
      localStorage.removeItem(CACHE_KEYS.ACCOUNT_OWNER);
      selectedAccountOwnerText.textContent = "(SELECT ACCOUNT OWNER)";
      alert("Please select an account owner.");
    }

    toggleAccountOwnerPopup();
  };

  window.applyProductFamilyFilters = function () {
    const selectedRadio = document.querySelector("#productFamilyCheckboxContainer input[type='radio']:checked");

    if (selectedRadio) {
      selectedProductFamily = selectedRadio.value;
      localStorage.setItem(CACHE_KEYS.PRODUCT_FAMILY, selectedProductFamily);
      selectedProductFamilyText.textContent = `(${selectedProductFamily})`;
      updateGenerateButton();
    } else {
      selectedProductFamily = null;
      localStorage.removeItem(CACHE_KEYS.PRODUCT_FAMILY);
      selectedProductFamilyText.textContent = "(SELECT PRODUCT FAMILY)";
      alert("Please select a product family.");
    }

    toggleProductFamilyPopup();
  };

  fromDate.addEventListener("input", function () {
    localStorage.setItem(CACHE_KEYS.FROM_DATE, fromDate.value);
    updateGenerateButton();
  });

  toDate.addEventListener("input", function () {
    localStorage.setItem(CACHE_KEYS.TO_DATE, toDate.value);
    updateGenerateButton();
  });

  generateBtn.addEventListener("click", function () {
    if (!validateProductSelection()) {
      alert("Please select a product name.");
      return;
    }
    if (!validateDates()) {
      alert("Please select valid dates.");
      return;
    }

    hideInfoText();

    let fetchUrl = `/get_product_data/?product_name=${encodeURIComponent(selectedProduct)}&from_date=${fromDate.value}&to_date=${toDate.value}`;
    
    if (selectedRegion) {
      fetchUrl += `&region=${encodeURIComponent(selectedRegion)}`;
    }
    if (selectedAccountOwner) {
      fetchUrl += `&account_owner=${encodeURIComponent(selectedAccountOwner)}`;
    }
    if (selectedProductFamily) {
      fetchUrl += `&product_family=${encodeURIComponent(selectedProductFamily)}`;
    }

    console.log("Generating forecast for:", {
      product: selectedProduct,
      region: selectedRegion || "Not specified",
      account_owner: selectedAccountOwner || "Not specified",
      product_family: selectedProductFamily || "Not specified",
      from: fromDate.value,
      to: toDate.value,
    });

    fetch(fetchUrl)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          alert(`No data found for ${selectedProduct}`);
          console.error("Error:", data.error);
          chartContainer.style.display = "none";
          showInfoText();
        } else {
          hideInfoText();
          updateChart(data);
          chartContainer.style.display = "block";
        }
      })
      .catch((error) => {
        console.error("Fetch error:", error);
        alert("An error occurred while fetching data.");
        chartContainer.style.display = "none";
        showInfoText();
      });
  });

  if (selectedProduct) {
  selectedProductsText.textContent = `(${selectedProduct})`;
} else {
  selectedProductsText.textContent = "";
}

if (selectedAccountOwner) {
  selectedAccountOwnerText.textContent = `(${selectedAccountOwner})`;
} else {
  selectedAccountOwnerText.textContent = "";
}

if (selectedProductFamily) {
  selectedProductFamilyText.textContent = `(${selectedProductFamily})`;
} else {
  selectedProductFamilyText.textContent = "";
}

updateGenerateButton();


  updateGenerateButton();
});
