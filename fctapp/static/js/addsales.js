import { CACHE_CONFIG,PageCache,handleLogout, handleSessionExpiry, handleUploadCacheClear } from "./cacheutils.js";


document.addEventListener("DOMContentLoaded", function () {
  const uploadArea = document.getElementById("upload-area");
  const fileInput = document.getElementById("file-input");
  const filePreview = document.getElementById("file-preview");
  const removeFileBtn = document.getElementById("remove-file");
  const submitBtn = document.getElementById("submit-btn");
  let currentFile = null;

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    uploadArea.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ["dragenter", "dragover"].forEach((eventName) => {
    uploadArea.addEventListener(eventName, () => {
      uploadArea.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadArea.addEventListener(eventName, () => {
      uploadArea.classList.remove("dragover");
    });
  });
  // Handle file drop
  uploadArea.addEventListener("drop", handleDrop);
  uploadArea.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileSelect);
  removeFileBtn.addEventListener("click", removeFile);

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    handleFile(file);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    handleFile(file);
   
  }

  function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please upload a CSV file");
      return;
    }

    // Validate file size (200MB)
    if (file.size > 100 * 1024 * 1024) {
      alert("File size exceeds 200MB limit");
      return;
    }

    // Calculate approximate number of rows (assuming average of 100 bytes per row)
    const approximateRows = Math.floor(file.size / 100);

    currentFile = file;
    currentFile.approximateRows = approximateRows; // Store for later use
    updateFilePreview(file);
    submitBtn.disabled = false;
    submitBtn.style.width = "150px";
    submitBtn.style.height = "55px";
  }

  function updateFilePreview(file) {
    const fileName = document.querySelector(".file-name");
    const fileSize = document.querySelector(".file-size");
    const uploadText = document.querySelector("#upload-area p");
    const uploadAreaContainer = document.getElementById("upload-area");
    const uploadIcon = document.getElementById("upload-icon");
    const maxSize = document.getElementById("max-size");

    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    filePreview.style.display = "block";

    // Hide upload icon and max size text immediately
    if (uploadIcon && maxSize) {
      uploadIcon.style.display = "none";
      maxSize.style.display = "none";
    }
    // Show "File Added" temporarily
    uploadText.textContent = "File Added !";
    uploadText.style.color = "#145E9C";
    uploadText.style.fontSize = "30px";
    uploadText.style.fontWeight = "bold";
    uploadAreaContainer.style.backgroundColor = "#B7B7B7";
  }
  function removeFile() {
    currentFile = null;
    fileInput.value = "";
    filePreview.style.display = "none";
    submitBtn.disabled = true;
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  async function pollProgress() {
    const progressBar = document.getElementById("uploadProgress");
    const progressText = document.getElementById("uploadProgressText");
    const loadingSpinner = document.getElementById("loadingSpinner");
    let lastProgress = 0;

    return new Promise((resolve, reject) => {
      const checkProgressInterval = setInterval(async () => {
        try {
          const response = await fetch("/get_progress/");
          const data = await response.json();
          const progress = data.progress;

          // Only update if progress has changed and is not less than previous progress
          if (progress > lastProgress) {
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `Uploading: ${progress.toFixed(2)}%`;
            lastProgress = progress;
          }

          // Check if progress is complete
          if (progress >= 100) {
            clearInterval(checkProgressInterval);
            progressText.textContent = "Upload Complete!";
            progressBar.style.width = "100%";
            resolve();
          }
        } catch (error) {
          console.error("Error fetching progress:", error);
          clearInterval(checkProgressInterval);
          loadingSpinner.style.display = "none";
          reject(error);
        }
      }, 500); // Reduced interval to 500ms for more frequent updates
    });
  }

  // Single submit button event listener
  submitBtn.addEventListener("click", async (e) => {
    handleUploadCacheClear(); 
    e.preventDefault();
    const loadingSpinner = document.getElementById("loadingSpinner");
    const progressBar = document.getElementById("uploadProgress");
    const progressText = document.getElementById("uploadProgressText");
    // const spinner = document.querySelector(".spinner");
    const spinner = document.getElementById('spinner');
    const spinnerText = document.getElementById("pleaseWait");
    const progressContainer = document.getElementById("progressContainer")

    // Show appropriate loading indicator based on file size
    if (currentFile?.approximateRows < 5000) {
      // For small files, show spinner with "Please wait" text
      loadingSpinner.style.display = "flex";
      progressBar.style.display = "none";
      progressText.style.display = "none";
      progressContainer.style.display = "none"
      progressBar.style.width = "0%";
      progressText.textContent = "0%";
      spinner.style.display = "block";  // Show spinner
      spinnerText.style.display = "block";  // Show "Please wait..." text
    } else {
      // For larger files, show progress bar
      progressContainer.style.display = "flex";
      loadingSpinner.style.display = "flex";
      progressBar.style.display = "block";  // Show progress bar
      progressText.style.display = "block";  // Show progress text
      progressBar.style.width = "0%";
      progressText.textContent = "0%";
      spinner.style.display = "none";  // Hide spinner
      spinnerText.style.display = "none";  // Hide "Please wait..." text
    }

    if (currentFile) {
      try {
        const formData = new FormData();
        formData.append("csv_file", currentFile);
        const csrfToken = document.cookie
          .split("; ")
          .find((row) => row.startsWith("csrftoken="))
          ?.split("=")[1];

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/add_sales/", true);
        xhr.setRequestHeader("X-CSRFToken", csrfToken);

        // Start progress polling and wait for completion
        const progressPromise = pollProgress();
        const checkStatus = () => {
          return new Promise((resolve, reject) => {
            const statusInterval = setInterval(() => {
              if (xhr.readyState === XMLHttpRequest.DONE) {
                clearInterval(statusInterval);
        
                console.log("XHR status:", xhr.status);
                console.log("XHR response:", xhr.responseText);
        
                if (xhr.status === 200) {
                  const modalElement = document.getElementById("uploadSummaryModal");
                  const modal = new bootstrap.Modal(modalElement);
                  const data = JSON.parse(xhr.responseText);
                  modalElement.querySelector('[data-records="added"]').textContent =
                    data.added_records_count || 0;
                  loadingSpinner.style.display = "none";
                  modal.show();
                  resolve();
                } else if (xhr.status === 400) {
                  const response = JSON.parse(xhr.responseText);
        
                  console.log("Error response:", response);
        
                  if (response.status === "error" && response.missing_columns) {
                    const missingColumns = response.missing_columns.join(", ");
                    const errorMessage = ` Missing required columns: ${missingColumns}`;
                    alert(errorMessage); // Show error message in an alert
                  } else if (response.error) {
                    alert(`Upload failed. Error: ${response.error}`);
                  } else {
                    alert("Upload failed. Please check your input.");
                  }
                  reject(new Error("Upload failed"));
                } else {
                  console.error("Unexpected upload failure");
                  reject(new Error("Upload failed with unexpected status"));
                }
              }
            }, 100);
          });
        };
        

        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            checkStatus().catch((error) => {
              console.error("Upload error:", error);
              loadingSpinner.style.display = "none";
              alert(error.message);
            });
          }
        };

        xhr.onerror = () => {
          loadingSpinner.style.display = "none";
          alert("Upload failed: Network error");
        };
        // Send the request
        xhr.send(formData);
      } catch (error) {
        loadingSpinner.style.display = "none";
        console.error("Upload error:", error);
        alert("Upload failed: " + error.message);
      }
    } else {
      loadingSpinner.style.display = "none";
      const modalElement = document.getElementById("uploadSummaryModal");
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
    }
  });

  // Remove all other submit button event listeners that were previously defined
});

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


document.querySelector('a[href*="logout"]')?.addEventListener("click", handleLogout);
