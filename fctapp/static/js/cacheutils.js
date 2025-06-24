// cacheutils.js
const CACHE_CONFIG = {
    FORECAST_HISTORY: "forecastHistoryCache",
    FORECAST_SALES: "forecastSalesCache",
    SALES_DATA: "salesDataCache",
    SALES_HISTORY: "salesHistoryCache",
    SALES_FORECAST: "salesForecastCache",
    PRODUCT_NAMES: "product_names",
    PRODUCT_DATA: "product_data",
    EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  };
  
const PageCache = {
    set: function (pageType, data) {
      const cacheData = {
        timestamp: new Date().getTime(),
        data: data,
        pageState: {
          fromDate: document.getElementById("fromDate")?.value,
          toDate: document.getElementById("toDate")?.value,
        },
      };
      localStorage.setItem(pageType, JSON.stringify(cacheData));
    },
  
    get: function (pageType) {
      try {
        const cached = localStorage.getItem(pageType);
        if (!cached) return null;
  
        const cacheData = JSON.parse(cached);
        const now = new Date().getTime();
  
        if (now - cacheData.timestamp > CACHE_CONFIG.EXPIRY) {
          this.clear(pageType);
          return null;
        }
  
        return cacheData;
      } catch (e) {
        console.error("Error reading from cache:", e);
        return null;
      }
    },
  
    clear: function (pageType) {
      localStorage.removeItem(pageType);
    },
  
    isValid: function (pageType) {
      return this.get(pageType) !== null;
    },
  
    clearAll: function() {
      // Clear all specific cache configurations
      Object.values(CACHE_CONFIG)
        .filter(key => typeof key === 'string')
        .forEach(cacheKey => {
          this.clear(cacheKey);
          localStorage.removeItem(cacheKey);
        });
  
      // Clear entire localStorage
      localStorage.clear();
  
      // Clear entire sessionStorage
      sessionStorage.clear();
  
      // Clear service worker caches
      if ('caches' in window) {
        caches.keys().then((cacheNames) => {
          cacheNames.forEach((cacheName) => {
            caches.delete(cacheName);
          });
        });
    }
  }
}
  
  function handleSessionExpiry() {
    setTimeout(() => {
      PageCache.clearAll();
      
      // Notify the user and redirect to the login page
      alert("Session expired. Redirecting to the login page...");
      window.location.href = "/"; // Redirect to login page
    }, CACHE_CONFIG.EXPIRY);
  }
  
  function handleLogout() {
    PageCache.clearAll();
  }
  
  function handleUploadCacheClear() {
    localStorage.clear();
    sessionStorage.clear();
    PageCache.clearAll();
}


  
  // Export for use in other files if using module system
  export { CACHE_CONFIG, PageCache, handleSessionExpiry, handleLogout , handleUploadCacheClear};