/**
 * DOCX to PDF Enterprise Converter - 100% Client-Side Javascript
 * Powered by Mammoth.js & html2pdf.js
 */

// Global state variables
let uploadedFilesQueue = []; // Holds queued files for batch processing
let activeQueueIndex = -1; // Index of the file currently being previewed
let zoomLevel = 1.0;
let userPublicIp = "Local IP"; // Holds user's public IP for security watermarking

// Background Korean font pre-loader for jsPDF (to prevent corruption/broken text)
let nanumGothicBase64 = "";
let koreanFontPromise = null;

function loadKoreanFontBackground() {
  const url = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Regular.ttf";
  koreanFontPromise = fetch(url)
    .then(response => {
      if (!response.ok) throw new Error("Font response not OK");
      return response.arrayBuffer();
    })
    .then(arrayBuffer => {
      let binary = "";
      const bytes = new Uint8Array(arrayBuffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      nanumGothicBase64 = btoa(binary);
      console.log("NanumGothic font successfully pre-fetched and prepared for jsPDF.");
    })
    .catch(err => {
      console.warn("Failed to load NanumGothic from CDN, vector text will use Helvetica fallback:", err);
    });
}
loadKoreanFontBackground();

// Fetch user IP address client-side with a 2-second timeout fallback
async function fetchUserIp() {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2000);
    const response = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
    clearTimeout(id);
    const data = await response.json();
    if (data.ip) {
      userPublicIp = data.ip;
      if (activeQueueIndex !== -1) renderDocument();
    }
  } catch (err) {
    console.warn("Failed to fetch public IP, using local network fallback:", err);
    userPublicIp = "Local IP";
  }
}
fetchUserIp();

// DOM Elements
const htmlNode = document.documentElement;
const themeToggleBtn = document.getElementById("theme-toggle");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const selectBtn = document.querySelector(".select-btn");
const downloadBtn = document.getElementById("download-btn");
const downloadBtnText = document.getElementById("download-btn-text");
const batchDownloadBtn = document.getElementById("batch-download-btn");
const previewStatusText = document.getElementById("preview-status-text");

// Batch Queue Elements
const fileQueueWrapper = document.getElementById("file-queue-wrapper");
const queueCountSpan = document.getElementById("queue-count");
const queueList = document.getElementById("queue-list");
const clearQueueBtn = document.getElementById("clear-queue-btn");

// Slider Controls
const fontSizeSlider = document.getElementById("font-size-slider");
const fontSizeVal = document.getElementById("font-size-val");
const marginSlider = document.getElementById("margin-slider");
const marginVal = document.getElementById("margin-val");
const lineHeightSlider = document.getElementById("line-height-slider");
const lineHeightVal = document.getElementById("line-height-val");
const fontFamilySelect = document.getElementById("font-family-select");
const forceWrapToggle = document.getElementById("force-wrap-toggle");

// Advanced Controls togglers
const securityToggle = document.getElementById("security-toggle");
const securityInputContainer = document.getElementById("security-input-container");
const pdfPasswordInput = document.getElementById("pdf-password");

const watermarkToggle = document.getElementById("watermark-toggle");
const watermarkInputContainer = document.getElementById("watermark-input-container");
const watermarkTextInput = document.getElementById("watermark-text");
const watermarkSecurityToggle = document.getElementById("watermark-security-toggle");
const watermarkSizeSlider = document.getElementById("watermark-size");
const watermarkSizeVal = document.getElementById("watermark-size-val");
const watermarkOpacitySlider = document.getElementById("watermark-opacity");
const watermarkOpacityVal = document.getElementById("watermark-opacity-val");

const headerFooterToggle = document.getElementById("header-footer-toggle");
const headerFooterInputContainer = document.getElementById("header-footer-input-container");
const pageNumberToggle = document.getElementById("page-number-toggle");
const headerTextInput = document.getElementById("header-text");
const footerTextInput = document.getElementById("footer-text");

// Zoom controls
const zoomInBtn = document.getElementById("zoom-in");
const zoomOutBtn = document.getElementById("zoom-out");
const zoomValBadge = document.getElementById("zoom-val");

// Container Views
const defaultView = document.getElementById("default-view");
const loadingOverlay = document.getElementById("loading-overlay");
const pagesContainer = document.getElementById("pages-container");
const canvasViewport = document.getElementById("canvas-viewport");

/* ==========================================================================
   1. Theme Management (Light / Dark Mode)
   ========================================================================== */
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  htmlNode.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = htmlNode.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  htmlNode.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const icon = themeToggleBtn.querySelector("i");
  if (theme === "dark") {
    icon.className = "fa-solid fa-sun";
  } else {
    icon.className = "fa-solid fa-moon";
  }
}

themeToggleBtn.addEventListener("click", toggleTheme);
initTheme();

/* ==========================================================================
   2. Advanced Feature Toggler Handlers (Accordion style)
   ========================================================================== */
securityToggle.addEventListener("change", (e) => {
  securityInputContainer.style.display = e.target.checked ? "block" : "none";
});

watermarkToggle.addEventListener("change", (e) => {
  watermarkInputContainer.style.display = e.target.checked ? "flex" : "none";
  if (activeQueueIndex !== -1) renderDocument();
});

watermarkTextInput.addEventListener("input", () => {
  if (activeQueueIndex !== -1) renderDocument();
});

watermarkSecurityToggle.addEventListener("change", () => {
  if (activeQueueIndex !== -1) renderDocument();
});

watermarkSizeSlider.addEventListener("input", (e) => {
  watermarkSizeVal.textContent = `${e.target.value}px`;
  if (activeQueueIndex !== -1) renderDocument();
});

watermarkOpacitySlider.addEventListener("input", (e) => {
  watermarkOpacityVal.textContent = e.target.value;
  if (activeQueueIndex !== -1) renderDocument();
});

headerFooterToggle.addEventListener("change", (e) => {
  headerFooterInputContainer.style.display = e.target.checked ? "flex" : "none";
});

/* ==========================================================================
   3. Zoom Control Handlers
   ========================================================================== */
function updateZoom() {
  pagesContainer.style.setProperty("--zoom-scale", zoomLevel);
  zoomValBadge.textContent = `${Math.round(zoomLevel * 100)}%`;
}

zoomInBtn.addEventListener("click", () => {
  if (zoomLevel < 1.8) {
    zoomLevel += 0.1;
    updateZoom();
  }
});

zoomOutBtn.addEventListener("click", () => {
  if (zoomLevel > 0.5) {
    zoomLevel -= 0.1;
    updateZoom();
  }
});

/* ==========================================================================
   4. Custom Layout Sliders Real-time Updates
   ========================================================================== */
fontSizeSlider.addEventListener("input", (e) => {
  fontSizeVal.textContent = `${e.target.value}px`;
  if (activeQueueIndex !== -1) renderDocument();
});

marginSlider.addEventListener("input", (e) => {
  marginVal.textContent = `${e.target.value}mm`;
  if (activeQueueIndex !== -1) renderDocument();
});

lineHeightSlider.addEventListener("input", (e) => {
  lineHeightVal.textContent = e.target.value;
  if (activeQueueIndex !== -1) renderDocument();
});

fontFamilySelect.addEventListener("change", () => {
  if (activeQueueIndex !== -1) renderDocument();
});

forceWrapToggle.addEventListener("change", () => {
  if (activeQueueIndex !== -1) renderDocument();
});

/* ==========================================================================
   5. Drag & Drop File & Batch Queue Listeners
   ========================================================================== */
selectBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

dropzone.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleUploadedFiles(Array.from(e.target.files));
  }
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer.files.length > 0) {
    handleUploadedFiles(Array.from(e.dataTransfer.files));
  }
});

clearQueueBtn.addEventListener("click", () => {
  uploadedFilesQueue = [];
  activeQueueIndex = -1;
  renderQueueList();
  
  // Reset UI back to default
  defaultView.style.display = "flex";
  pagesContainer.style.display = "none";
  downloadBtn.setAttribute("disabled", "true");
  batchDownloadBtn.style.display = "none";
  zoomInBtn.setAttribute("disabled", "true");
  zoomOutBtn.setAttribute("disabled", "true");
  previewStatusText.innerHTML = `<span class="dot pulse-dot yellow"></span> 대기 중: DOCX 파일을 등록해 주세요`;
});

/* ==========================================================================
   6. Main DOCX Core Engine (Mammoth Integration & Async Queue Parsing)
   ========================================================================== */
async function handleUploadedFiles(files) {
  const docxFiles = files.filter(file => file.name.toLowerCase().endsWith(".docx"));
  
  if (docxFiles.length === 0) {
    alert("올바른 DOCX 파일을 등록해 주세요. (.docx 확장자만 지원합니다)");
    return;
  }
  
  const originalQueueLength = uploadedFilesQueue.length;
  
  docxFiles.forEach(file => {
    // Check if file already exists in queue to avoid duplicates
    if (!uploadedFilesQueue.some(item => item.file.name === file.name && item.file.size === file.size)) {
      uploadedFilesQueue.push({
        id: Date.now() + Math.random(),
        file: file,
        name: file.name.substring(0, file.name.lastIndexOf(".")),
        size: formatBytes(file.size),
        status: "waiting",
        html: ""
      });
    }
  });

  renderQueueList();
  
  // If it's a new queue, automatically preview the first file
  if (originalQueueLength === 0 && uploadedFilesQueue.length > 0) {
    await previewQueueItem(0);
  }
  
  // Background processing of all queued files
  processQueueBackground();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = 1;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Re-draw Queue list inside Sidebar
function renderQueueList() {
  if (uploadedFilesQueue.length === 0) {
    fileQueueWrapper.style.display = "none";
    batchDownloadBtn.style.display = "none";
    downloadBtnText.textContent = "PDF 다운로드";
    return;
  }
  
  fileQueueWrapper.style.display = "flex";
  queueCountSpan.textContent = uploadedFilesQueue.length;
  queueList.innerHTML = "";
  
  uploadedFilesQueue.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = `queue-item ${index === activeQueueIndex ? 'active' : ''}`;
    
    let statusIcon = '<i class="fa-solid fa-clock"></i>';
    let statusClass = 'waiting';
    if (item.status === 'converting') {
      statusIcon = '<i class="fa-solid fa-spinner fa-spin"></i>';
      statusClass = 'converting';
    } else if (item.status === 'completed') {
      statusIcon = '<i class="fa-solid fa-circle-check"></i>';
      statusClass = 'completed';
    }
    
    li.innerHTML = `
      <div class="queue-item-info">
        ${statusIcon}
        <span class="queue-item-name" title="${item.file.name}">${item.file.name}</span>
      </div>
      <div class="queue-item-actions">
        <span class="queue-item-status ${statusClass}">${item.size}</span>
        <button class="queue-delete-btn" data-index="${index}"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    `;
    
    // Switch preview on item click
    li.addEventListener("click", (e) => {
      // Don't switch if clicking the delete button
      if (e.target.closest(".queue-delete-btn")) return;
      previewQueueItem(index);
    });
    
    // Delete item from queue
    li.querySelector(".queue-delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      removeQueueItem(index);
    });
    
    queueList.appendChild(li);
  });
  
  // Toggle action buttons based on queue length
  if (uploadedFilesQueue.length > 1) {
    batchDownloadBtn.style.display = "block";
    downloadBtnText.textContent = "선택한 문서 다운로드";
  } else {
    batchDownloadBtn.style.display = "none";
    downloadBtnText.textContent = "PDF 다운로드";
  }
}

async function removeQueueItem(index) {
  uploadedFilesQueue.splice(index, 1);
  
  if (uploadedFilesQueue.length === 0) {
    clearQueueBtn.click();
    return;
  }
  
  if (activeQueueIndex === index) {
    // Select new active item
    activeQueueIndex = Math.max(0, index - 1);
    await previewQueueItem(activeQueueIndex);
  } else if (activeQueueIndex > index) {
    activeQueueIndex--;
  }
  
  renderQueueList();
}

// Background sequence parser to keep UI unblocked
async function processQueueBackground() {
  for (let i = 0; i < uploadedFilesQueue.length; i++) {
    const item = uploadedFilesQueue[i];
    
    if (item.status === "waiting") {
      item.status = "converting";
      renderQueueList();
      
      try {
        const arrayBuffer = await item.file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        
        item.html = result.value;
        item.status = "completed";
      } catch (err) {
        console.error("Queue conversion failed:", err);
        item.status = "waiting"; // Reset to retry
        item.html = `<div style="padding:30px;color:red;font-weight:bold;">파일 변환 실패: ${err.message}</div>`;
      }
      
      renderQueueList();
      
      // If this is the active previewed item, refresh render
      if (i === activeQueueIndex) {
        renderDocument();
        hideLoading();
      }
    }
  }
}

// Preview a queued document
async function previewQueueItem(index) {
  if (index < 0 || index >= uploadedFilesQueue.length) return;
  
  activeQueueIndex = index;
  renderQueueList();
  
  const item = uploadedFilesQueue[index];
  loadedFileName = item.name;
  
  defaultView.style.display = "none";
  pagesContainer.style.display = "block";
  downloadBtn.removeAttribute("disabled");
  zoomInBtn.removeAttribute("disabled");
  zoomOutBtn.removeAttribute("disabled");
  
  if (item.status === "completed") {
    renderDocument();
    hideLoading();
    previewStatusText.innerHTML = `<span class="dot pulse-dot green"></span> 변환 완료: ${item.file.name}`;
  } else {
    showLoading(`${item.file.name} 문서 구성 중...`);
    // Wait for the background converter to catch up
    if (item.html) {
      renderDocument();
      hideLoading();
      previewStatusText.innerHTML = `<span class="dot pulse-dot green"></span> 변환 완료: ${item.file.name}`;
    }
  }
}

function showLoading(message) {
  loadingOverlay.querySelector(".loader-text").textContent = message;
  loadingOverlay.style.display = "flex";
}

function hideLoading() {
  loadingOverlay.style.display = "none";
}

/* ==========================================================================
   7. Dynamic Page Layout, Sliders & Watermarks
   ========================================================================== */
function renderDocument() {
  if (activeQueueIndex === -1) return;
  const item = uploadedFilesQueue[activeQueueIndex];
  if (!item || !item.html) return;
  
  // Inject clean HTML directly into the virtual paper sheet
  pagesContainer.innerHTML = item.html;
  
  // Dynamically apply user slider overrides in real-time
  pagesContainer.style.padding = `${marginSlider.value}mm`;
  pagesContainer.style.fontSize = `${fontSizeSlider.value}px`;
  pagesContainer.style.lineHeight = lineHeightSlider.value;
  
  // Apply font family selection
  if (fontFamilySelect.value !== "original") {
    pagesContainer.style.fontFamily = fontFamilySelect.value;
  } else {
    pagesContainer.style.fontFamily = "";
  }
  
  // Apply table autofit wrap
  if (forceWrapToggle.checked) {
    pagesContainer.classList.add("autofit-tables");
  } else {
    pagesContainer.classList.remove("autofit-tables");
  }
  
  // Apply diagonal Watermark overlay if enabled
  if (watermarkToggle.checked && watermarkTextInput.value.trim()) {
    injectWatermarkMarkup();
  }
  
  updateZoom();
}

function injectWatermarkMarkup() {
  let text = watermarkTextInput.value.trim();
  const opacity = watermarkOpacitySlider.value;
  const size = watermarkSizeSlider.value;
  
  // Add print time and IP to watermark if enabled
  if (watermarkSecurityToggle.checked) {
    const now = new Date();
    const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    text = `${text} (${dateString}, IP: ${userPublicIp})`;
  }
  
  const watermarkDiv = document.createElement("div");
  watermarkDiv.className = "watermark-overlay";
  
  // Dynamically adjust grid density and gap to prevent long text overlapping/crowding
  let itemCount = 40;
  let gapValue = "60px";
  
  if (text.length > 25) {
    itemCount = 12;
    gapValue = "140px 90px";
  } else if (text.length > 15) {
    itemCount = 20;
    gapValue = "90px 70px";
  }
  
  watermarkDiv.style.gap = gapValue;
  
  // Fill background grid with rotated watermarks
  for (let i = 0; i < itemCount; i++) {
    const item = document.createElement("div");
    item.className = "watermark-item";
    item.textContent = text;
    item.style.fontSize = `${size}px`;
    item.style.color = `rgba(120, 120, 120, ${opacity})`;
    watermarkDiv.appendChild(item);
  }
  
  pagesContainer.appendChild(watermarkDiv);
}

/* ==========================================================================
   8. PDF Parameter Builder & Native Vector Pagebreaks
   ========================================================================== */
function getHtml2PdfOptions() {
  const qualitySelect = document.getElementById("pdf-quality-select").value;
  let scale = 1.5;
  let imgQuality = 0.8;
  
  if (qualitySelect === "high") {
    scale = 2.0;
    imgQuality = 0.98;
  } else if (qualitySelect === "compressed") {
    // Safe high-DPI scaling + strong capacity compression
    scale = 1.5;
    imgQuality = 0.4;
  }
  
  const opt = {
    margin:       0, // Zero margins since pagesContainer's padding represents document margins perfectly
    image:        { type: "jpeg", quality: imgQuality },
    html2canvas:  { 
      scale: scale,
      useCORS: true, 
      logging: false, 
      letterRendering: true,
      scrollX: 0,
      scrollY: 0
    },
    jsPDF:        { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak:    { mode: ["avoid-all", "css", "legacy"] }
  };
  
  // Handle security encryption natively inside jsPDF
  if (securityToggle.checked && pdfPasswordInput.value) {
    const pw = pdfPasswordInput.value;
    opt.jsPDF.encryption = {
      userPassword: pw,
      ownerPassword: "owner-" + pw,
      userPermissions: ["print", "copy"]
    };
  }
  
  return opt;
}

/* ==========================================================================
   9. Custom Header/Footer & Page Number Vector Overlay Draw
   ========================================================================== */
function applyVectorOverlays(pdfInstance) {
  if (!headerFooterToggle.checked) return;
  
  // Register custom Unicode font if loaded in memory to prevent broken Korean text
  if (nanumGothicBase64) {
    pdfInstance.addFileToVFS("NanumGothic-Regular.ttf", nanumGothicBase64);
    pdfInstance.addFont("NanumGothic-Regular.ttf", "NanumGothic", "normal");
    pdfInstance.setFont("NanumGothic");
  }
  
  const isPageNum = pageNumberToggle.checked;
  const headerText = headerTextInput.value.trim();
  const footerText = footerTextInput.value.trim();
  
  const totalPages = pdfInstance.internal.getNumberOfPages();
  
  for (let i = 1; i <= totalPages; i++) {
    pdfInstance.setPage(i);
    pdfInstance.setFontSize(8.5);
    pdfInstance.setTextColor(140, 140, 140);
    
    // Draw Header (Left Top: x=15mm, y=10mm)
    if (headerText) {
      pdfInstance.text(headerText, 15, 10);
    }
    
    // Draw Footer (Left Bottom: x=15mm, y=285mm)
    if (footerText) {
      pdfInstance.text(footerText, 15, 285);
    }
    
    // Draw Page Number (Right Bottom: x=195mm, y=285mm, align right)
    if (isPageNum) {
      const numStr = `${i} / ${totalPages}`;
      pdfInstance.text(numStr, 195, 285, { align: "right" });
    }
  }
}

/* ==========================================================================
   10. PDF Generation Triggers (Single & Batch Download Queue)
   ========================================================================== */
async function generateAndDownloadSinglePDF() {
  if (activeQueueIndex === -1) return;
  const item = uploadedFilesQueue[activeQueueIndex];
  if (!item || !item.html) return;
  
  // Wait for the Korean font to finish downloading if header/footer is active
  if (headerFooterToggle.checked && koreanFontPromise) {
    showLoading("한국어 글꼴 로딩 중...");
    await koreanFontPromise;
  }
  
  showLoading("고화질 PDF 변환 및 생성 중...");
  
  // Temporarily disable shadows during rendering
  pagesContainer.style.boxShadow = "none";
  
  const opt = getHtml2PdfOptions();
  opt.filename = `${item.name}.pdf`;
  
  try {
    // Intercept standard worker pipeline to inject vector overlays natively
    await html2pdf()
      .set(opt)
      .from(pagesContainer)
      .toPdf()
      .get('pdf')
      .then(function(pdf) {
        applyVectorOverlays(pdf);
      })
      .save();
      
    pagesContainer.style.boxShadow = "";
    hideLoading();
  } catch (error) {
    console.error("Single PDF Generation Error:", error);
    pagesContainer.style.boxShadow = "";
    hideLoading();
    alert(`PDF 다운로드 생성 실패: ${error.message}`);
  }
}

// Download queued items sequentially with non-blocking delays
async function generateAndDownloadBatchPDFs() {
  const completedItems = uploadedFilesQueue.filter(item => item.status === "completed");
  
  if (completedItems.length === 0) {
    alert("변환이 완료된 문서가 없습니다. 잠시 후 다시 시도해 주세요.");
    return;
  }
  
  showLoading(`일괄 다운로드 시작: 총 ${completedItems.length}개 문서...`);
  
  // Wait for the Korean font to finish downloading if header/footer is active
  if (headerFooterToggle.checked && koreanFontPromise) {
    showLoading("한국어 글꼴 로딩 중...");
    await koreanFontPromise;
  }
  
  for (let i = 0; i < completedItems.length; i++) {
    const item = completedItems[i];
    
    showLoading(`[${i+1}/${completedItems.length}] ${item.name} PDF 출력 중...`);
    
    // Temporarily switch preview element so the DOM displays the correct document target
    await previewQueueItem(uploadedFilesQueue.indexOf(item));
    
    pagesContainer.style.boxShadow = "none";
    const opt = getHtml2PdfOptions();
    opt.filename = `${item.name}.pdf`;
    
    try {
      await html2pdf()
        .set(opt)
        .from(pagesContainer)
        .toPdf()
        .get('pdf')
        .then(function(pdf) {
          applyVectorOverlays(pdf);
        })
        .save();
        
      pagesContainer.style.boxShadow = "";
      
      // Artificial delay (1 second) to prevent browsers from throttling batch file streams
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`Batch print failed for ${item.name}:`, err);
    }
  }
  
  hideLoading();
  previewStatusText.innerHTML = `<span class="dot pulse-dot green"></span> 일괄 다운로드 완료!`;
}

// Event Bindings
downloadBtn.addEventListener("click", generateAndDownloadSinglePDF);
batchDownloadBtn.addEventListener("click", generateAndDownloadBatchPDFs);
