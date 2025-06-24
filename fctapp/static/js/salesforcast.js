import { CACHE_CONFIG,PageCache,handleLogout, handleSessionExpiry } from "./cacheutils.js";
// Call the session expiry handler
handleSessionExpiry();


async function fetchRevenueAnalytics(fromDate, toDate) {
    try {
      console.log("Fetching revenue analytics data from", fromDate, "to", toDate);
      if (PageCache.isValid(CACHE_CONFIG.FORECAST_SALES)) {
              const cachedData = PageCache.get(CACHE_CONFIG.FORECAST_SALES);
              if (cachedData?.pageState?.fromDate === fromDate && 
                  cachedData?.pageState?.toDate === toDate) {
                console.log("Using cached revenue analytics data");
                if (cachedData.data.historicalValues && cachedData.data.forecastValues) {
                  updateRevenueChart(cachedData.data.labels,cachedData.data.historicalValues,cachedData.data.forecastValues
                  );
                  return cachedData.data;
                }
                if (cachedData.analysis) {
                  console.log("Analysis data:", cachedData.analysis);
                  updateAnalysisInfo(cachedData.analysis);
                }
              }
            }
  
      const response = await fetch("/revenue_analytics/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify({
          from_date: fromDate,
          to_date: toDate
        })
      });
      
      const data = await response.json();
      console.log("Received data in fetchRevenueAnalytics:", data);
  
      if (data.error) {
        console.error("Error fetching revenue analytics:", data.error);
        return;
      }
  
      // Update Total Sales and Sales Change
      const totalSalesElement = document.getElementById("totalSales");
      const salesChangeElement = document.getElementById("salesChange");
      const historicalCagrElement = document.getElementById("historicalcagr");
      const forecastCagrElement = document.getElementById("forecastcagr");
      const netmarginchangeElement = document.getElementById("netmarginchange");
      
      
      
       // Update total sales
       if (totalSalesElement && data.total_sales) {
        totalSalesElement.textContent = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(data.total_sales);
      }
  
      // Update sales change percentage
      if (salesChangeElement && data.sales_change_percentage) {
        const salesChangeText = `${data.sales_change_percentage > 0 ? '↑' : '↓'} ${Math.abs(data.sales_change_percentage)}%`;
        salesChangeElement.textContent = salesChangeText;
        salesChangeElement.classList.toggle("text-success", data.sales_change_percentage > 0);
        salesChangeElement.classList.toggle("text-danger", data.sales_change_percentage < 0);
      }
      
      // Extract historical and forecast data
      const historicalData = Object.entries(data.historical).map(([quarter, value]) => ({
        quarter,
        value
      }));
      console.log("Historical data:", historicalData);
  
      const forecastData = Object.entries(data.forecast).map(([quarter, value]) => ({
        quarter,
        value
      }));
      console.log("Forecast data:", forecastData);
  
      // Combine for labels
      const labels = [
        ...historicalData.map(item => item.quarter),
        ...forecastData.map(item => item.quarter)
      ];
      console.log("Labels:", labels);
  
      // Create datasets with null values for smooth transition
      const historicalValues = [
        ...historicalData.map(item => item.value),
        ...forecastData.map(() => null)
      ];
      console.log("Historical values:", historicalValues);
  
      const forecastValues = [
        ...historicalData.map(() => null),
        ...forecastData.map(item => item.value)
      ];
      console.log("Forecast values:", forecastValues);
  
      // Set the connection point
      const lastHistoricalIndex = historicalData.length - 1;
      forecastValues[lastHistoricalIndex] = historicalValues[lastHistoricalIndex];
      console.log("Forecast values after setting connection point:", forecastValues);
      const cacheTobeData = {
        labels, historicalValues, forecastValues
      }
      PageCache.set(CACHE_CONFIG.FORECAST_SALES, cacheTobeData);
      // Update the chart
      updateRevenueChart(labels, historicalValues, forecastValues);
      // Fetch sales data as well
      await fetchSalesData(fromDate, toDate);
      
      if (data.analysis) {
        console.log("Analysis data:", data.analysis);
        PageCache.set(CACHE_CONFIG.FORECAST_SALES, data.analysis);
        updateAnalysisInfo(data.analysis);
      }
    } catch (error) {
      console.error("Error:", error);
    }
}


async function fetchSalesData(fromDate, toDate) {
  try {
    if (PageCache.isValid(CACHE_CONFIG.SALES_DATA)) {
      const cachedData = PageCache.get(CACHE_CONFIG.SALES_DATA);
      if (cachedData?.pageState?.fromDate === fromDate && 
          cachedData?.pageState?.toDate === toDate) {
        console.log("Using cached sales data");
        updateRevenueMetrics(cachedData.data);
        return cachedData.data;
      }
    }

    const url = `/sales_forecasting/?from_date=${fromDate}&to_date=${toDate}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCsrfToken(),
      }
    });

    if (!response.ok) throw new Error('Network response was not ok');

    const data = await response.json();
    if (data.error) {
      console.error("Error fetching revenue analytics:", data.error);
      return;
    }

    PageCache.set(CACHE_CONFIG.SALES_DATA, data);
    updateRevenueMetrics(data);
    return data;

  } catch (error) {
    console.error("Error:", error);
    const cachedData = PageCache.get(CACHE_CONFIG.SALES_DATA);
    if (cachedData) {
      updateRevenueMetrics(cachedData.data);
      return cachedData.data;
    }
  }
}
  function updateRevenueChart(labels, historicalValues, forecastValues) {
    const ctx = document.getElementById("revenueChart").getContext("2d");
    
    if (window.revenueChart instanceof Chart) {
      window.revenueChart.destroy();
    }
    
    console.log("Creating or updating chart with labels, historical values, and forecast values");
  
    window.revenueChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Historical Revenue",
            data: historicalValues,
            borderColor: "rgb(75, 192, 192)",
            backgroundColor: "rgb(75, 192, 192)",
            tension: 0.4,
            spanGaps: true,
            borderWidth: 2
          },
          {
            label: "Forecast Revenue",
            data: forecastValues,
            borderColor: "rgb(153, 102, 255)",
            backgroundColor: "rgb(153, 102, 255)",
            tension: 0.4,
            spanGaps: true,
            borderWidth: 2
          }
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        elements: {
          point: {
            radius: 0 // Hide all points
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              drawBorder: false,
            },
            ticks: {
              callback: function(value) {
                return new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
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
                weight: 'bold',
              },
            },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 20,
              boxHeight: 20,
              font: {
                weight: 'bold',
                size: 14,
              },
            },
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  label += new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                  }).format(context.parsed.y);
                }
                return label;
              },
            },
          },
        },
      },
    });
  }

  function updateAnalysisInfo(analysis) {
    const analysisContainer = document.getElementById("analysisInfo");
    if (analysisContainer) {
      analysisContainer.innerHTML = `
        <div class="mt-3">
          <p><strong>Average Quarterly Sales:</strong> ${new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(analysis.average_quarterly_sales)}</p>
          <p><strong>Trend:</strong> ${analysis.trend}</p>
          <p><strong>Forecast Confidence:</strong> ${analysis.forecast_confidence}</p>
        </div>
      `;
    }
  }


   // Helper function to format currency
   function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }


  function updateRevenueMetrics(data) {
    const totalSalesElement = document.getElementById("totalSales");
    const salesChangeElement = document.getElementById("salesChange");
    const historicalCagrElement = document.getElementById("historicalcagr");
    const historicalArrowElement = historicalCagrElement.nextElementSibling;  // Target the arrow for Historical CAGR
    const forecastCagrElement = document.getElementById("Forecastcagr");
    const forecastArrowElement = forecastCagrElement.nextElementSibling;
    const netMarginChangeElement = document.getElementById("netmarginchange");  // Target the net margin change element
  
    // Update total sales if the element exists and data is available
    if (totalSalesElement && data.total_sales !== undefined) {
      totalSalesElement.textContent = formatCurrency(data.total_sales);
    }
  
    // Update sales change percentage if the element exists and data is available
    if (salesChangeElement && data.sales_change_percentage !== undefined) {
      updateSalesChange(salesChangeElement, data.sales_change_percentage);
    }
  
    // Update historical CAGR if the element exists and data is available
    if (historicalCagrElement && data.historical_cagr !== undefined) {
      historicalCagrElement.textContent = `${data.historical_cagr}%`; // Display historical CAGR
  
      // Update arrow for historical CAGR based on its value
      if (data.historical_cagr > 0) {
        historicalCagrElement.classList.remove("text-danger");
        historicalCagrElement.classList.add("text-success");
        historicalArrowElement.textContent = "↑"; // Up arrow for positive CAGR
        historicalArrowElement.classList.remove("text-danger");
        historicalArrowElement.classList.add("text-success");
      } else if (data.historical_cagr < 0) {
        historicalCagrElement.classList.remove("text-success");
        historicalCagrElement.classList.add("text-danger");
        historicalArrowElement.textContent = "↓"; // Down arrow for negative CAGR
        historicalArrowElement.classList.remove("text-success");
        historicalArrowElement.classList.add("text-danger");
      } else {
        historicalCagrElement.classList.remove("text-success", "text-danger");
        historicalArrowElement.textContent = ""; // No arrow if the value is 0
        historicalArrowElement.classList.remove("text-success", "text-danger");
      }
    }
  
    // Update forecast CAGR if the element exists and data is available
    if (forecastCagrElement && data.forecast_cagr !== undefined) {
      forecastCagrElement.textContent = `${data.forecast_cagr}%`; // Display forecast CAGR
  
      // Update arrow for forecast CAGR based on its value
      if (data.forecast_cagr > 0) {
        forecastCagrElement.classList.remove("text-danger");
        forecastCagrElement.classList.add("text-success");
        forecastArrowElement.textContent = "↑"; // Up arrow for positive forecast CAGR
        forecastArrowElement.classList.remove("text-danger");
        forecastArrowElement.classList.add("text-success");
      } else if (data.forecast_cagr < 0) {
        forecastCagrElement.classList.remove("text-success");
        forecastCagrElement.classList.add("text-danger");
        forecastArrowElement.textContent = "↓"; // Down arrow for negative forecast CAGR
        forecastArrowElement.classList.remove("text-success");
        forecastArrowElement.classList.add("text-danger");
      } else {
        forecastCagrElement.classList.remove("text-success", "text-danger");
        forecastArrowElement.textContent = ""; // No arrow if the value is 0
        forecastArrowElement.classList.remove("text-success", "text-danger");
      }
    }
  
    // Update net margin change if the element exists and data is available
    if (netMarginChangeElement && data.net_margin_change !== undefined) {
      const netMarginChange = parseFloat(data.net_margin_change); // Parse the value as a float
  
      // Format and display net margin change
      netMarginChangeElement.textContent = `${netMarginChange > 0 ? '+' : ''}${netMarginChange.toFixed(2)}%`;
  
      // Update text color based on net margin change value
      netMarginChangeElement.classList.toggle("text-success", netMarginChange > 0);
      netMarginChangeElement.classList.toggle("text-danger", netMarginChange < 0);
    }
  }


  // Get CSRF token from cookie
function getCsrfToken() {
    const name = 'csrftoken';
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === (name + '=')) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }


   // Helper function to update sales change percentage
   function updateSalesChange(element, percentage) {
    const salesChangeText = `${percentage > 0 ? '↑' : '↓'} ${Math.abs(percentage)}%`;
    element.textContent = salesChangeText;
    element.classList.toggle("text-success", percentage > 0);
    element.classList.toggle("text-danger", percentage < 0);
  }

  function loadCachedData() {
    const cachedData = PageCache.get(CACHE_CONFIG.SALES_DATA);
    const chartCachedData =PageCache.get(CACHE_CONFIG.FORECAST_SALES);
    updateRevenueChart(chartCachedData.data.labels,chartCachedData.data.historicalValues,chartCachedData.data.forecastValues);
      updateRevenueMetrics(cachedData.data);
      updateUIForDataFetch();
    }
  

 // DOM Elements
const elements = {
    sidebar: document.querySelector(".sidebar"),
    sidebarToggle: document.querySelector(".sidebar-toggle"),
    fromDate: document.getElementById("fromDate"),
    toDate: document.getElementById("toDate"),
    generateBtn: document.getElementById("generateBtn"),
    statsCards: document.getElementById("statsCards"),
    revenueCard: document.getElementById("revenueCard"),
    infoText: document.getElementById("infoText"),
    errorMessage: document.getElementById("errorMessage")
  };
  
  // Sidebar Functions
  function showSidebar() {
    elements.sidebar.classList.remove("d-none");
    elements.sidebar.classList.add("show");
    document.body.style.overflow = "hidden";
    elements.sidebarToggle.style.display = "none";
  }
  
  function hideSidebar() {
    elements.sidebar.classList.remove("show");
    document.body.style.overflow = "";
    elements.sidebarToggle.style.display = "block";
    setTimeout(() => {
      elements.sidebar.classList.add("d-none");
    }, 300);
  }

  function checkDateValidity() {
    const fromDate = document.getElementById("fromDate")?.value;
    const toDate = document.getElementById("toDate")?.value;
    const generateBtn = document.getElementById("generateBtn");
    const currentYear = new Date().getFullYear();

    if (fromDate && toDate) {
        const fromYear = new Date(fromDate).getFullYear();
        const toYear = new Date(toDate).getFullYear();
        const fromDateObj = new Date(fromDate);
        const toDateObj = new Date(toDate);

        // Check if any of the entered years is less than the current year
        if (fromYear < currentYear || toYear < currentYear) {
            console.log("Invalid year detected. Dates are in the past.");
            alert("Please select dates from future years for forecasting.");
            generateBtn.disabled = true;
            generateBtn.classList.add("btn-secondary");
            generateBtn.classList.remove("btn-primary");
            return; // Exit the function to prevent enabling the button
        }

        // Check if fromDate is greater than toDate
        if (fromDateObj > toDateObj) {
            console.log("Invalid date range. From date is greater than To date.");
            alert("From Date cannot be greater than To Date.");
            generateBtn.disabled = true;
            generateBtn.classList.add("btn-secondary");
            generateBtn.classList.remove("btn-primary");
            return; // Exit the function to prevent enabling the button
        }

        // Enable the generate button if dates are valid
        generateBtn.disabled = false;
        generateBtn.classList.remove("btn-secondary");
        generateBtn.classList.add("btn-primary");
        generateBtn.style.backgroundColor = "#145E9C";
        generateBtn.style.borderColor = "#145E9C";
    } else {
        generateBtn.disabled = true;
        generateBtn.classList.add("btn-secondary");
        generateBtn.classList.remove("btn-primary");

        // Hide cards only if no previous data exists
        const cachedData = PageCache.get(CACHE_CONFIG.SALES_DATA);
        const statsCards = document.getElementById("statsCards");
        const revenueCard = document.getElementById("revenueCard");

        if (!cachedData && statsCards) {
            statsCards.style.display = "none";
        }
        if (!cachedData && revenueCard) {
            revenueCard.style.display = "none";
        }
    }
}

  function saveDatesToSession() {
    sessionStorage.setItem("fromDate", elements.fromDate.value);
    sessionStorage.setItem("toDate", elements.toDate.value);
  }
  
  // Utility Functions
  function displayError(message) {
    if (elements.errorMessage) {
      elements.errorMessage.textContent = message;
      elements.errorMessage.style.display = "block";
    }
  }
  
  
  function updateUIForDataFetch() {
    const infoText = document.getElementById("infoText");
    const statsCards = document.getElementById("statsCards");
    const revenueCard = document.getElementById("revenueCard");
  
    if (infoText) {
      infoText.style.display = "none";
      infoText.classList.add("d-none");
    }
  
    if (statsCards) statsCards.style.display = "flex";
    if (revenueCard) revenueCard.style.display = "flex";
  }
  function handleGenerateClick(e) {
    e.preventDefault();
    elements.generateBtn.disabled = true;
    
    // Show cards only when generate button is clicked
    if (elements.statsCards) elements.statsCards.style.display = "flex";
    if (elements.revenueCard) elements.revenueCard.style.display = "flex";
    if (elements.infoText) {
      elements.infoText.style.display = "none";
      elements.infoText.classList.add("d-none");
    }
    
    // Fetch data
    fetchRevenueAnalytics(elements.fromDate.value, elements.toDate.value)
      .finally(() => {
        elements.generateBtn.disabled = false;
      });
  }
  
  function handleDateChange() {
    checkDateValidity();
    saveDatesToSession();
  }
  
  function handleOutsideClick(event) {
    if (
      !elements.sidebar.contains(event.target) &&
      !elements.sidebarToggle.contains(event.target) &&
      elements.sidebar.classList.contains("show")
    ) {
      hideSidebar();
    }
  }

  document.querySelector('a[href*="logout"]')?.addEventListener("click", handleLogout);
  
 function initializeEventListeners() {
  // Sidebar toggle
  elements.sidebarToggle?.addEventListener("click", () => {
    console.log("Toggle button clicked");
    elements.sidebar.classList.contains("show") ? hideSidebar() : showSidebar();
  });

  // Outside click handler
  document.addEventListener("click", handleOutsideClick);

  // Generate button click handler
  elements.generateBtn.addEventListener("click", handleGenerateClick);

  // Date input handlers
  elements.fromDate.addEventListener("change", handleDateChange);
  elements.toDate.addEventListener("change", handleDateChange);
}
  
  // Load saved dates from session storage
  function loadSavedDates() {
    const savedFromDate = sessionStorage.getItem("fromDate");
    const savedToDate = sessionStorage.getItem("toDate");
  
    if (savedFromDate) elements.fromDate.value = savedFromDate;
    if (savedToDate) elements.toDate.value = savedToDate;
  
    checkDateValidity();
  }
  
  // Main initialization
  document.addEventListener("DOMContentLoaded", () => {
    initializeEventListeners();
    loadSavedDates();
    loadCachedData();
  });




 