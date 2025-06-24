import { CACHE_CONFIG,PageCache,handleLogout, handleSessionExpiry } from "./cacheutils.js";


function initializePageState() {
  const infoText = document.getElementById("infoText");
  const statsCards = document.getElementById("statsCards");
  const chartsLayout = document.getElementById("chartsLayout");

  // Set initial display states
  if (infoText) {
    // infoText.style.setProperty('display', 'none', 'important');
    // infoText.classList.remove("d-flex", "d-block", "d-inline", "d-inline-block");
    // Force a reflow to ensure the display change takes effect
    void infoText.offsetHeight;
  }

  // Initialize containers as hidden
  if (statsCards) statsCards.style.display = "none";
  if (chartsLayout) chartsLayout.style.display = "none";
}

function renderChart(data) {
  // Add a debug log to track render calls
  console.log("renderChart called with data:", data);

  // Destroy existing chart if it exists
  const existingChart = Chart.getChart("revenueChart");
  if (existingChart) {
    console.log("Destroying existing chart");
    existingChart.destroy();
  }

  // Get the canvas context
  const ctx = document.getElementById("revenueChart");
  if (!ctx) {
    console.error("Cannot find canvas element with id 'revenueChart'");
    return;
  }

  // Clean up the data arrays to remove any Chart.js metadata
  const cleanActualSales = Array.from(data.actual_sales || []);
  const cleanBudgetSales = Array.from(data.budget_sales || []);
  const cleanLabels = Array.from(data.labels || []);

  console.log("Cleaned data:", {
    labels: cleanLabels,
    actual: cleanActualSales,
    budget: cleanBudgetSales,
  });

  try {
    const revenueChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: cleanLabels,
        datasets: [
          {
            label: "Actual Sales",
            data: cleanActualSales,
            fill: true,
            backgroundColor: "rgba(13, 110, 253, 0.1)",
            borderColor: "rgb(13, 110, 253)",
            tension: 0.4,
          },
          {
            label: "Budget",
            data: cleanBudgetSales,
            fill: true,
            backgroundColor: "rgba(255, 99, 132, 0.1)",
            borderColor: "rgb(255, 99, 132)",
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // Changed to false
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: {
              boxWidth: 20,
              boxHeight: 20,
              usePointStyle: false,
              font: {
                weight: "bold",
                size: 14,
              },
            },
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || "";
                if (label) {
                  label += ": ";
                }
                if (context.parsed.y !== null) {
                  label += new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(context.parsed.y);
                }
                return label;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              drawBorder: false,
            },
            ticks: {
              callback: function (value) {
                return new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                }).format(value);
              },
            },
          },
          x: {
            grid: {
              display: false,
            },
            ticks: {
              font: {
                weight: "bold",
              },
            },
          },
        },
      },
    });
    console.log("New chart created successfully");
  } catch (error) {
    console.error("Error creating chart:", error);
  }
}


// Call the session expiry handler
handleSessionExpiry();


function hideInfoText() {
  const infoText = document.getElementById("infoText");
  if (infoText) {
    infoText.style.setProperty("display", "none", "important");
    infoText.classList.remove(
      "d-flex",
      "d-block",
      "d-inline",
      "d-inline-block"
    );
    // Force a reflow to ensure the display change takes effect
    void infoText.offsetHeight;
  }
}

// Function to restore page state from cache
function restorePageState() {
  const cachedData = PageCache.get(CACHE_CONFIG.SALES_HISTORY);
  if (!cachedData) return false;
  // Hide info text and show containers immediately before processing cache
  initializePageState();
  showDataContainers();
  // Restore date inputs
  if (cachedData.pageState) {
    const { fromDate, toDate } = cachedData.pageState;
    if (fromDate) document.getElementById("fromDate").value = fromDate;
    if (toDate) document.getElementById("toDate").value = toDate;
  }

  // Display cached data
  displayData(cachedData.data);
  return true;
}

// Add new helper function to show data containers
function showDataContainers() {
  const statsCards = document.getElementById("statsCards");
  const chartsLayout = document.getElementById("chartsLayout");
  if (statsCards) statsCards.style.display = "flex";
  if (chartsLayout) chartsLayout.style.display = "flex";
}

// Modify loadPageData function
async function loadPageData(startDate, endDate, useCache = true) {
  console.log("inside loadPage Data", startDate, endDate);

  // Validate dates to ensure they fall within the past years (before the current year)
  const today = new Date();
  const currentYear = today.getFullYear();

  const startYear = new Date(startDate).getFullYear();
  const endYear = new Date(endDate).getFullYear();

  if (startYear >= currentYear || endYear >= currentYear) {
    alert("Please select dates only from past years.");
    return;
  }

  // Check if startDate is before endDate
  if (new Date(startDate) > new Date(endDate)) {
    alert("Start date cannot be later than the end date.");
    return;
  }

  // Hide info text
  hideInfoText();

  try {
    const response = await fetch(
      `/sales_history/?start_date=${startDate}&end_date=${endDate}`,
      {
        method: "GET",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Check if cache should be cleared
    if (data.clear_cache) {
      PageCache.clear(CACHE_CONFIG.SALES_HISTORY);
      console.log("Cache cleared after file add");
    }

    // Only show containers and cache data if we have valid results
    if (data && data.total_sales) {
      showDataContainers();
      PageCache.set(CACHE_CONFIG.SALES_HISTORY, data);
      console.log("Saved to cache:", data);
      displayData(data);
    } else {
      // Hide containers and show alert for no results
      hideStatsAndCharts();
      alert("No results found for the selected date range");
    }
  } catch (error) {
    console.error("Error fetching data:", error);
    const cachedData = PageCache.get(CACHE_CONFIG.SALES_HISTORY);
    if (cachedData) {
      console.log("Loading from cache after error");
      showDataContainers();
      displayData(cachedData.data);
    } else {
      hideStatsAndCharts();
      alert("Error fetching data. No results found.");
    }
  } finally {
    hideLoading();
  }
}


// Add separate DOMContentLoaded handlers
document.addEventListener("DOMContentLoaded", function () {
  // Ensure we only initialize page state once
  let initialized = false;

  // Check if cache exists first
  if (PageCache.isValid(CACHE_CONFIG.SALES_HISTORY)) {
    handleCachedPageLoad();
    initialized = true;
  }

  // Only proceed with fresh load if not initialized from cache
  if (!initialized) {
    handleFreshPageLoad();
  }
});

// Handler for when cache exists
function handleCachedPageLoad() {
  console.log("Loading page from cache");
  initializePageState();

  // Try to restore from cache
  if (restorePageState()) {
    console.log("Page restored from cache successfully");
    return;
  }

  // If cache restore fails, fall back_ to fresh load
  handleFreshPageLoad();
}



async function handleFreshPageLoad() {
  console.log("Loading fresh page");
  initializePageState();

  const fromDate = document.getElementById("fromDate").value;
  const toDate = document.getElementById("toDate").value;
  console.log("fromDate toDate",fromDate , toDate)


  // If dates already exist, load data immediately
  if (fromDate && toDate) {
    console.log("inside me ")
    await loadPageData(fromDate, toDate, true);
    return;
  }

  // If no dates are available, show info text
  const infoText = document.getElementById("infoText");
  if (infoText) {
    infoText.style.display = "flex";
    infoText.classList.add("d-flex");
  }
}


document.querySelector('a[href*="logout"]')?.addEventListener("click", handleLogout);


// Update generate button click handler
document
  .getElementById("generateBtn")
  ?.addEventListener("click", async function () {
    const fromDate = document.getElementById("fromDate").value;
    const toDate = document.getElementById("toDate").value;

    // Clear existing cache when generating new data
    PageCache.clear(CACHE_CONFIG.SALES_HISTORY);
    // Get current grouping selection
    const groupingSelect = document.getElementById("groupingSelect");
    const currentGrouping = groupingSelect.value;

    // Load fresh data and update bar chart
    await loadPageData(fromDate, toDate, false);

    // Repopulate filter popup and trigger comparison
    populateFilterPopup(currentGrouping);

    // Trigger comparison after a short delay to ensure DOM is ready
    setTimeout(async () => {
      try {
        await compare(currentGrouping);
      } catch (error) {
        console.error("Error updating comparison:", error);
      }
    }, 100);
  });

// Add background refresh function
async function refreshDataInBackground() {
  console.log("am i getting called ?")
  const fromDate = document.getElementById("fromDate").value;
  const toDate = document.getElementById("toDate").value;

  if (!fromDate || !toDate) return;

  try {
    const response = await fetch(
      `/sales_history/?start_date=${fromDate}&end_date=${toDate}`,
      {
        method: "GET",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    );

    const data = await response.json();

    // Check if cache should be cleared
    if (data.clear_cache) {
      PageCache.clear(CACHE_CONFIG.SALES_HISTORY);
      console.log("Cache cleared during background refresh");
    }

    // Update cache with fresh data
    PageCache.set(CACHE_CONFIG.SALES_HISTORY, data);

    // Update display if needed
    displayData(data);
  } catch (error) {
    console.error("Error refreshing data:", error);
  }
}

// Add visibility change handler to maintain state
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") {
    const fromDate = document.getElementById("fromDate").value;
    const toDate = document.getElementById("toDate").value;

    if (fromDate && toDate) {
      hideInfoText();
      if (!PageCache.isValid(CACHE_CONFIG.SALES_HISTORY)) {
        refreshDataInBackground();
      }
    }
  }
});

// Function to display data
function displayData(data) {
  if (!data) {
    console.error("No data provided to displayData");
    return;
  }

  // Always ensure info text is hidden first
  hideInfoText();

  // Show stats cards and charts layout
  showDataContainers();

  console.log("Displaying data:", data);

  // Update charts only if chart_data exists and is different from current data
  if (
    data.chart_data &&
    !isChartDataEqual(data.chart_data, getCurrentChartData())
  ) {
    renderChart(data.chart_data);
  }

  // Update total sales
  if (data.total_sales !== undefined) {
    const totalSalesElement = document.getElementById("totalSales");
    if (totalSalesElement) {
      totalSalesElement.textContent = `$${parseFloat(
        data.total_sales
      ).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
  }

  // Update sales increase percentage
  if (data.sales_percentage_increase !== undefined) {
    const salesIncreaseElement = document.getElementById("salesIncrease");
    if (salesIncreaseElement) {
      const increase = parseFloat(data.sales_percentage_increase);
      const arrow = increase >= 0 ? "↑" : "↓";
      salesIncreaseElement.textContent = `${arrow} ${Math.abs(increase).toFixed(
        1
      )}%`;
      salesIncreaseElement.className = `fw-bold fs-5 ${
        increase >= 0 ? "text-success" : "text-danger"
      }`;
    }
  }

  // Update net margin with proper parsing
  if (data.net_margin_percentage !== undefined) {
    const netMarginElement = document.getElementById("netMargin");
    if (netMarginElement) {
      const formattedMargin = parseFloat(data.net_margin_percentage).toFixed(2);
      netMarginElement.textContent = `${formattedMargin}%`;
      // Ensure the net margin is properly stored in the data object
      data.net_margin_percentage = formattedMargin;
    }
  }

  if (data.recent_sales_data) {
    populateTable(data.recent_sales_data);
  }

  if (data.pieChartDataFeed) {
    populatePieChart(data.pieChartDataFeed);
  }
}

const sidebarToggle = document.querySelector(".sidebar-toggle");
const sidebar = document.querySelector(".sidebar");

sidebarToggle?.addEventListener("click", function () {
  console.log("Toggle button clicked");
  if (sidebar.classList.contains("show")) {
    hideSidebar();
  } else {
    showSidebar();
  }
});

document.addEventListener("click", function (event) {
  if (
    !sidebar.contains(event.target) &&
    !sidebarToggle.contains(event.target) &&
    sidebar.classList.contains("show")
  ) {
    hideSidebar();
  }
});

function showSidebar() {
  sidebar.classList.remove("d-none");
  sidebar.classList.add("show");
  document.body.style.overflow = "hidden";
  sidebarToggle.style.display = "none";
}

function hideSidebar() {
  sidebar.classList.remove("show");
  document.body.style.overflow = "";
  sidebarToggle.style.display = "block";
  setTimeout(() => {
    sidebar.classList.add("d-none");
  }, 300);
}

window.togglePopup = function() {
  const popup = document.getElementById("filterPopup");
  const filterBtn = document.querySelector(".filter-btn");

  if (popup.style.display !== "block") {
    // Position the popup relative to the filter button
    const buttonRect = filterBtn.getBoundingClientRect();

    popup.style.display = "block";
    popup.style.position = "absolute";
    popup.style.zIndex = "1000";
    // Position popup just below the filter button
    popup.style.top = `${buttonRect.bottom + window.scrollY + 10}px`;
    popup.style.left = `${buttonRect.left + window.scrollX - 150}px`;

    // Add event listener to close popup when clicking outside
    setTimeout(() => {
      document.addEventListener("click", closePopupOutside);
    }, 0);
  } else {
    popup.style.display = "none";
    // Remove the event listener when popup is closed
    document.removeEventListener("click", closePopupOutside);
  }
}

function closePopupOutside(event) {
  const popup = document.getElementById("filterPopup");
  const filterBtn = document.querySelector(".filter-btn");

  // Check if the click is outside the popup and filter button
  if (!popup.contains(event.target) && !filterBtn.contains(event.target)) {
    popup.style.display = "none";
    document.removeEventListener("click", closePopupOutside);
  }
}

function applyFilters() {
  const checkboxes = document.querySelectorAll(
    '#filterPopup input[type="checkbox"]:checked'
  );
  const selectedItems = Array.from(checkboxes).map((cb) => cb.value);
  const groupingSelect = document.getElementById("groupingSelect");
  const selectedGrouping = groupingSelect.value;

  // Call compare function with selected grouping
  compare(selectedGrouping);

  // Close the popup after applying filters
  togglePopup();
}

function toggleFilterPopup() {
  const popup = document.querySelector(".filter-popup2");
  const button = document.querySelector(".filter-btn-2");

  if (popup.style.display !== "block") {
    const buttonRect = button.getBoundingClientRect();

    popup.style.display = "block";
    popup.style.position = "absolute";
    popup.style.zIndex = "1000";

    // Adjust the position of the popup to ensure it appears below the button
    popup.style.top = `${buttonRect.bottom + window.scrollY + 10}px`; // Add some margin below the button
    popup.style.left = `${
      buttonRect.left +
      window.scrollX +
      buttonRect.width / 2 -
      popup.offsetWidth / 2
    }px`; // Center the popup under the button

    // Add event listener to close popup when clicking outside
    setTimeout(() => {
      document.addEventListener("click", closeSecondPopupOutside);
    }, 0);
  } else {
    popup.style.display = "none";
    // Remove the event listener when popup is closed
    document.removeEventListener("click", closeSecondPopupOutside);
  }
}

function closeSecondPopupOutside(event) {
  const popup = document.querySelector(".filter-popup2");
  const filterBtn = document.querySelector(".btn-light");

  // Check if the click is outside the popup and filter button
  if (!popup.contains(event.target) && !filterBtn.contains(event.target)) {
    popup.style.display = "none";
    document.removeEventListener("click", closeSecondPopupOutside);
  }
}

// Close popup when clicking outside
document.addEventListener("click", (e) => {
  const popup = document.querySelector(".filter-popup");
  const filterBtn = document.querySelector(".btn-light");

  // Add null checks to prevent TypeError
  if (
    popup &&
    filterBtn &&
    !popup.contains(e.target) &&
    e.target !== filterBtn
  ) {
    popup.style.display = "none";
  }
});

document.addEventListener("DOMContentLoaded", function () {
  const fromDateInput = document.getElementById("fromDate");
  const toDateInput = document.getElementById("toDate");
  const generateBtn = document.getElementById("generateBtn");
  const statsCards = document.getElementById("statsCards");
  const chartsLayout = document.getElementById("chartsLayout");
  const infoText = document.getElementById("infoText");
  const applyBtn = document.getElementById("applyFiltersBtn");


  // Ensure button starts disabled
  generateBtn.disabled = true;
  generateBtn.classList.add("btn-secondary");

  // Add change event listeners for date inputs
  fromDateInput.addEventListener("change", checkDateValidity);
  toDateInput.addEventListener("change", checkDateValidity);
  applyBtn.addEventListener("click", applyFilters)

  

  function checkDateValidity() {
    const fromDate = new Date(fromDateInput.value);
    const toDate = new Date(toDateInput.value);
    const generateBtn = document.getElementById("generateBtn");

    // Only enable button if both dates are selected and valid
    if (fromDate && toDate && !isNaN(fromDate) && !isNaN(toDate)) {
      // Check if fromDate is greater than toDate
      if (fromDate > toDate) {
        alert("Start date cannot be greater than end date");
        generateBtn.disabled = true;
        generateBtn.classList.remove("btn-primary");
        generateBtn.classList.add("btn-secondary");
        generateBtn.style.backgroundColor = "";
        generateBtn.style.borderColor = "";
        return;
      }

      // Calculate the difference in months
      const monthsDiff =
        (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
        (toDate.getMonth() - fromDate.getMonth());
      if (monthsDiff >= 3) {
        generateBtn.disabled = false;
        generateBtn.classList.remove("btn-secondary");
        generateBtn.classList.add("btn-primary");
        generateBtn.style.backgroundColor = "#145E9C";
        generateBtn.style.borderColor = "#145E9C";
        return;
      } else {
        alert(
          "Please select a date range of at least 3 months to generate revenue analytics chart."
        );
      }
    }

    // If any condition fails, disable the button
    generateBtn.disabled = true;
    generateBtn.classList.remove("btn-primary");
    generateBtn.classList.add("btn-secondary");
    generateBtn.style.backgroundColor = "";
    generateBtn.style.borderColor = "";
  }

  // Event listener for the "Generate" button
  generateBtn.addEventListener("click", async function () {
    const fromDate = fromDateInput.value.trim();
    const toDate = toDateInput.value.trim();
    const infoText = document.getElementById("infoText");

    // Hide info text immediately when generate button is clicked
    if (infoText) infoText.style.display = "none";
    console.log("Fetching data for date range:", fromDate, "to", toDate);

    // Fetch data and update display
    fetch(`/sales_history/?start_date=${fromDate}&end_date=${toDate}`, {
      method: "GET",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Received data:", data); // Debug log
        // Update all visualizations with the new data
        displayAggregatedData(data);
      })
      .catch((error) => {
        console.error("Error:", error);
        // Reset sales increase element on error

        alert("Error fetching data. No Results Found");
      });
  });

  // Display the aggregated sales data
  function displayAggregatedData(data) {
    console.log("Displaying aggregated data:", data);
    if (data && data.total_sales !== undefined && data.total_sales !== null) {
      // Update sales increase
      const salesIncreaseElement = document.getElementById("salesIncrease");
      if (salesIncreaseElement) {
        let increase = null;
        if (
          data.sales_percentage_increase !== undefined &&
          data.sales_percentage_increase !== null
        ) {
          increase =
            typeof data.sales_percentage_increase === "string"
              ? parseFloat(data.sales_percentage_increase)
              : data.sales_percentage_increase;
        }
      }

      // Only format and display total sales if it's a valid number
      const totalSales = parseFloat(data.total_sales);
      const totalSalesElement = document.getElementById("totalSales");
      if (totalSalesElement) {
        if (!isNaN(totalSales)) {
          const formattedTotalSales = totalSales.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          totalSalesElement.textContent = `$${formattedTotalSales}`;
        } else {
          totalSalesElement.textContent = "N/A";
        }
      }

      // Update net margin if available and valid
      if (data.net_margin_percentage !== undefined) {
        const netMarginElement = document.getElementById("netMargin");
        if (netMarginElement) {
          const margin = parseFloat(data.net_margin_percentage);
          netMarginElement.textContent = !isNaN(margin)
            ? `${margin.toFixed(2)}%`
            : "N/A";
        }
      }

      const infoText = document.getElementById("infoText");
      if (infoText) {
        infoText.style.display = "none";
        infoText.classList.remove("d-flex");
      }
    } else {
      // Handle case when no data is found
      const statsCards = document.getElementById("statsCards");
      const chartsLayout = document.getElementById("chartsLayout");
      if (statsCards) statsCards.style.display = "none";
      if (chartsLayout) chartsLayout.style.display = "none";
    }
  }

  // Handle date input validation and initial visibility checks
  checkDateValidity();

  // Get the grouping select element by its new id
  const groupingSelect = document.getElementById("groupingSelect");

  // Verify the element exists
  if (!groupingSelect) {
    console.error("Grouping select element not found!");
    return;
  }
});

function updateStats(data) {
  // Update total sales
  document.getElementById(
    "totalSales"
  ).textContent = `$${data.total_sales.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  // Update net margin
  document.getElementById(
    "netMargin"
  ).textContent = `${data.net_margin_percentage}%`;

  // Update sales increase percentage
  const salesIncreaseElement = document.getElementById("salesIncrease");
  const salesIncrease = data.sales_percentage_increase;
  salesIncreaseElement.textContent = `${
    salesIncrease >= 0 ? "+" : ""
  }${salesIncrease.toFixed(1)}%`;
  salesIncreaseElement.className = `fw-bold fs-5 ${
    salesIncrease >= 0 ? "text-success" : "text-danger"
  }`;

  // Show stats cards and charts
  document.getElementById("statsCards").style.display = "flex";
  document.getElementById("chartsLayout").style.display = "block";
  // Hide info text
  document.getElementById("infoText").style.display = "none";
}

function populateTable(salesData) {
  console.log("Populating table with data:", salesData);
  const tableBody = document.querySelector("#RecentData tbody");
  if (!tableBody) {
    console.error("Table body not found");
    return;
  }

  // Sort the data by posting_date in ascending order (oldest first)
  const sortedData = [...salesData].sort((a, b) => {
    return new Date(a.posting_date) - new Date(b.posting_date);
  });

  tableBody.innerHTML = ""; // Clear the table body

  // Get the from date for comparison
  const fromDate = new Date(document.getElementById("fromDate").value);

  // Filter data for dates >= fromDate
  const filteredData = sortedData.filter(
    (row) => new Date(row.posting_date) >= fromDate
  );

  // Take only the first 5 records
  const displayData = filteredData.slice(0, 5);

  // Process the first 5 rows
  displayData.forEach((row) => {
    const tr = document.createElement("tr");

    // Format sales amount
    const formattedSalesAmount = parseFloat(row.sales_amount).toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    );

    tr.innerHTML = `
            <td class="text-center align-middle">${row.region || "-"}</td>
            <td class="text-center align-middle">${row.product_name || "-"}</td>
            <td class="text-center align-middle">${
              row.product_family || "-"
            }</td>
            <td class="text-center align-middle">$${formattedSalesAmount}</td>
            <td class="text-center align-middle">${row.posting_date}</td>
        `;

    tableBody.appendChild(tr);
  });
}

// Fetch data on page load

function populatePieChart(pieChartDataFeed) {
  // Ensure we have data before proceeding
  if (!pieChartDataFeed || !Array.isArray(pieChartDataFeed)) {
    console.error("Invalid pieChartDataFeed data:", pieChartDataFeed);
    return;
  }

  const ctx = document.getElementById("pieChart");
  if (!ctx) {
    console.error("Pie chart canvas not found");
    return;
  }

  // Destroy existing chart if it exists
  const existingChart = Chart.getChart("pieChart");
  if (existingChart) {
    existingChart.destroy();
  }

  console.log("pieChartDataFeed for pie chart:", pieChartDataFeed);

  // Create new pie chart with updated data
  const pieChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: pieChartDataFeed.map((product) => product.name),
      datasets: [
        {
          data: pieChartDataFeed.map((product) => product.percentage),
          backgroundColor: pieChartDataFeed.map((product) => product.color),
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "40%",
      plugins: {
        legend: {
          display: false, // Hide the default legend as we're using custom table
        },
        datalabels: {
          color: "white",
          formatter: (value) => `${value}%`,
          font: {
            weight: "bold",
          },
        },
      },
      animation: {
        animateRotate: true,
        animateScale: true,
      },
    },
    plugins: [ChartDataLabels],
  });

  // Update the dynamic products table
  updateDynamicProductsTable(pieChartDataFeed);
}

// Function to update all visualizations
function updateVisualizations(data) {
  // Update stats cards
  if (data.total_sales !== undefined) {
    document.getElementById("totalSales").textContent = parseFloat(
      data.total_sales
    ).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (data.net_margin_percentage !== undefined) {
    document.getElementById("netMargin").textContent = `${parseFloat(
      data.net_margin_percentage
    ).toFixed(2)}%`;
  }
}

function updateDynamicProductsTable(products) {
  const tbody = document.getElementById("dynamicProductsTable");
  if (!tbody) {
    console.error("Dynamic products table not found");
    return;
  }

  // Clear existing content
  tbody.innerHTML = "";

  // Add new rows
  products.forEach((product) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td class="text-start" style="min-width: 150px">
                <div class="d-flex align-items-center">
                    <div class="color-square me-3" style="
                        background-color: ${product.color};
                        width: 12px;
                        height: 12px;
                        flex-shrink: 0;
                    "></div>
                    <span>${product.name}</span>
                </div>
            </td>
            <td class="text-center">${product.orders}</td>
            <td class="text-center">$${parseFloat(
              product.amount
            ).toLocaleString("en-US", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}</td>
        `;
    tbody.appendChild(tr);
  });
}

function populateFilterPopup(grouping) {
  const filterPopup = document.getElementById("filterPopup");
  const fromDate = document.getElementById("fromDate").value;
  const toDate = document.getElementById("toDate").value;

  // Clear existing checkboxes (except buttons)
  const checkboxContainer = filterPopup;
  const existingCheckboxes = checkboxContainer.querySelectorAll(
    ".checkbox-item:not(.buttons)"
  );
  existingCheckboxes.forEach((checkbox) => checkbox.remove());

  const endpointConfig = {
    Division: {
      url: `/get_divisions/?start_date=${fromDate}&end_date=${toDate}`,
      key: "divisions",
    },
    Region: {
      url: `/get_regions/?start_date=${fromDate}&end_date=${toDate}`,
      key: "regions",
    },
    "Product Family": {
      url: `/get_product_families/?start_date=${fromDate}&end_date=${toDate}`,
      key: "product_families",
    },
    "Account Owner": {
    url: `/get_account_owners/?start_date=${fromDate}&end_date=${toDate}`,
    key: "account_owners", 
  },
  };

  const config = endpointConfig[grouping];
  if (!config) {
    console.error("Invalid grouping:", grouping);
    return;
  }

  // Fetch data from the server
  fetch(config.url)
    .then((response) => response.json())
    .then((data) => {
      if (data.status === "success" && data[config.key]?.length > 0) {
        const items = data[config.key];
        // Clear existing checkboxes before adding new ones
        const checkboxContainer = filterPopup;
        const existingCheckboxes = checkboxContainer.querySelectorAll(
          ".checkbox-item:not(.buttons)"
        );
        existingCheckboxes.forEach((checkbox) => checkbox.remove());

        // Create checkboxes for each unique item
        items.forEach((item, index) => {
          const checkboxDiv = document.createElement("div");
          checkboxDiv.className = "checkbox-item";

          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.id = `${grouping.toLowerCase().replace(" ", "")}${index}`;
          checkbox.value = item;

          checkbox.addEventListener("change", function () {
            const checkedBoxes = filterPopup.querySelectorAll(
              'input[type="checkbox"]:checked'
            );

            if (checkedBoxes.length > 2) {
              this.checked = false;
              return;
            }

            const applyButton = filterPopup.querySelector(".btn-apply");
            if (applyButton) {
              applyButton.disabled = checkedBoxes.length !== 2;
              applyButton.classList.toggle(
                "disabled",
                checkedBoxes.length !== 2
              );
            }
          });

          // Auto-check the first two items for any grouping type
          if (index < 2 && items.length >= 2) {
            checkbox.checked = true;
          }

          const label = document.createElement("label");
          label.htmlFor = checkbox.id;
          label.textContent = item;

          checkboxDiv.appendChild(checkbox);
          checkboxDiv.appendChild(label);

          const buttonsContainer = filterPopup.querySelector(".buttons");
          filterPopup.insertBefore(checkboxDiv, buttonsContainer);
        });

        // If we have at least 2 items, trigger the comparison
        if (items.length >= 2) {
          const checkedBoxes = filterPopup.querySelectorAll(
            'input[type="checkbox"]:checked'
          );
          if (checkedBoxes.length === 2) {
            compare(grouping).catch((error) => {
              console.error(`Error in ${grouping} comparison:`, error);
              // Clear the chart if comparison fails
              const canvas = document.getElementById("barChart");
              const existingChart = Chart.getChart(canvas);
              if (existingChart) {
                existingChart.destroy();
              }
            });
          }
        }
        // Initialize Apply button state
        const applyButton = filterPopup.querySelector(".btn-apply");
        const checkedBoxes = filterPopup.querySelectorAll(
          'input[type="checkbox"]:checked'
        );
        if (applyButton) {
          applyButton.disabled = checkedBoxes.length !== 2;
          applyButton.classList.toggle("disabled", checkedBoxes.length !== 2);
        }
      } else {
        console.log(`No ${grouping} data found for the selected date range`);
        const canvas = document.getElementById("barChart");
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
          existingChart.destroy();
        }
      }
    })
    .catch((error) => {
      console.error(`Error fetching ${grouping}:`, error);
      const canvas = document.getElementById("barChart");
      const existingChart = Chart.getChart(canvas);
      if (existingChart) {
        existingChart.destroy();
      }
    });
}

// Update the compare function to return a Promise
function compare(grouping) {
  return new Promise((resolve, reject) => {
    const filterPopup = document.getElementById("filterPopup");
    const checkedBoxes = filterPopup.querySelectorAll(
      'input[type="checkbox"]:checked'
    );
    const fromDate = document.getElementById("fromDate").value;
    const toDate = document.getElementById("toDate").value;

    if (checkedBoxes.length !== 2) {
      console.warn("Need exactly two items selected for comparison");
      return resolve(); // Don't reject, just resolve without doing anything
    }

    const selectedValues = Array.from(checkedBoxes).map((cb) => cb.value);
    const endpoint = `/compare_${grouping
      .toLowerCase()
      .replace(
        " ",
        "_"
      )}/?start_date=${fromDate}&end_date=${toDate}&items=${selectedValues.join(
      ","
    )}`;

    fetch(endpoint)
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "success" && data.years && data.values) {
          const colors = [
            { bg: "rgba(54, 162, 235, 0.8)", border: "rgb(54, 162, 235)" },
            { bg: "rgba(153, 102, 255, 0.8)", border: "rgb(153, 102, 255)" },
          ];

          const chartData = {
            labels: data.years,
            datasets: selectedValues.map((value, index) => ({
              label: value,
              data: data.values[value],
              backgroundColor: colors[index].bg,
              borderColor: colors[index].border,
              borderWidth: 1,
            })),
          };

          updateBarChart(chartData);
          resolve();
        } else {
          console.warn("Invalid comparison data received:", data);
          resolve(); // Don't reject, just resolve without updating
        }
      })
      .catch((error) => {
        console.error("Error in comparison:", error);
        resolve(); // Don't reject, just resolve without updating
      });
  });
}

function updateBarChart(chartData) {
  const canvas = document.getElementById("barChart");
  if (!canvas) {
    console.error("Bar chart canvas not found");
    return;
  }
  try {
    // Destroy existing chart if it exists
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
      existingChart.destroy();
    }

    // Create new chart
    new Chart(canvas, {
      type: "bar",
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: {
              font: {
                weight: "bold",
                size: 14,
              },
              boxWidth: 20,
              boxHeight: 20,
              usePointStyle: false,
              padding: 10,
            },
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || "";
                if (label) {
                  label += ": ";
                }
                const value = context.parsed.y || 0;
                label += "$" + value.toLocaleString();
                return label;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              drawBorder: false,
              color: "rgba(0, 0, 0, 0.1)",
            },
            ticks: {
              font: { size: 12 },
              callback: function (value) {
                return "$" + value.toLocaleString();
              },
            },
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 12 },
            },
          },
        },
      },
    });

    console.log("Bar chart updated successfully");
  } catch (error) {
    console.error("Error updating bar chart:", error);
  }
}

document.addEventListener("DOMContentLoaded", function () {
  const filterPopup = document.getElementById("filterPopup");
  const existingProductCheckboxes = filterPopup.querySelectorAll(
    ".checkbox-item:not(.buttons)"
  );
  existingProductCheckboxes.forEach((checkbox) => checkbox.remove());

  // Populate filter popup with Division checkboxes by default
  populateFilterPopup("Division");

  const groupingSelect = document.getElementById("groupingSelect");

  groupingSelect.addEventListener("change", function (event) {
    // Prevent default behavior just in case
    event.preventDefault();
    // Get the selected value
    const selectedGrouping = this.value;
    // Populate filter popup with grouping-specific checkboxes
    populateFilterPopup(selectedGrouping);
  });
});

// Utility function to get CSRF token
function getCsrfToken() {
  return document.querySelector("[name=csrfmiddlewaretoken]").value;
}

function hideLoading() {
  const loadingOverlay = document.getElementById("loadingOverlay");
  if (loadingOverlay) {
    loadingOverlay.remove();
  }
}

// Helper function to get current chart data
function getCurrentChartData() {
  const existingChart = Chart.getChart("revenueChart");
  if (!existingChart) return null;

  return {
    labels: existingChart.data.labels,
    actual_sales: existingChart.data.datasets[0].data,
    budget_sales: existingChart.data.datasets[1].data,
  };
}

// Helper function to compare chart data
function isChartDataEqual(newData, currentData) {
  if (!currentData) return false;
  return JSON.stringify(newData) === JSON.stringify(currentData);
}

document.addEventListener("DOMContentLoaded", function () {
  const fromDateInput = document.getElementById("fromDate");
  const toDateInput = document.getElementById("toDate");
  const generateBtn = document.getElementById("generateBtn");

  // Add date change handlers
  fromDateInput.addEventListener("change", handleDateChange);
  toDateInput.addEventListener("change", handleDateChange);

  // Function to handle date changes
  async function handleDateChange() {
    checkDateValidity();

    // Only proceed if both dates are valid and differ by at least 3 months
    if (!generateBtn.disabled) {
      const groupingSelect = document.getElementById("groupingSelect");
      const currentGrouping = groupingSelect.value;

      // Repopulate the filter popup with new date range
      populateFilterPopup(currentGrouping);

      // If Division is selected, trigger comparison automatically
      if (currentGrouping === "Division") {
        try {
          await compare("Division");
        } catch (error) {
          console.error("Error updating division comparison:", error);
        }
      }
    }
  }
});

// Update the display style handling
function hideStatsAndCharts() {
  const statsCards = document.getElementById("statsCards");
  const chartsLayout = document.getElementById("chartsLayout");
  if (statsCards) {
    statsCards.style.setProperty("display", "none", "important");
    statsCards.classList.remove(
      "d-flex",
      "d-block",
      "d-inline",
      "d-inline-block"
    );
  }

  if (chartsLayout) {
    chartsLayout.style.setProperty("display", "none", "important");
    chartsLayout.classList.remove(
      "d-flex",
      "d-block",
      "d-inline",
      "d-inline-block"
    );
  }
}