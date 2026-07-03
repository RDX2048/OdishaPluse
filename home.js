const SESSION_KEY = "odishapulse_session";
const REMEMBER_KEY = "odishapulse_remembered";
const EMAIL_KEY = "odishapulse_email";

if (sessionStorage.getItem(SESSION_KEY) !== "true" && localStorage.getItem(REMEMBER_KEY) !== "true") {
  window.location.href = "login.html";
}

const SEVERITY_COLORS = {
  green: "#22c55e",
  yellow: "#facc15",
  orange: "#f2a93b",
  red: "#e8584f",
};

const DEFAULT_CENTER = [20.95, 85.1];
const DEFAULT_ZOOM = 7;

let map = null;
let markersLayer = null;
let allRecords = []; 
let currentMarkers = []; 
let currentFilteredRecords = []; 
let selectedRecordId = null; 

const HEADER_CANDIDATES = {
  latitude: ["latitude", "lat", "lattitude"], // "lattitude" covers a common misspelling
  longitude: ["longitude", "long", "lng", "lon"],
  name: ["name", "customername", "customer", "clientname", "client"],
  amount: [
    "arrtot", // TPSODL-style "Arr_TOT" (total arrears)
    "arrtotal",
    "pendingamount",
    "pending",
    "amount",
    "outstanding",
    "balance",
    "due",
    "pendingbalance",
  ],
};

function normalizeHeader(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findHeader(fields, candidates) {
  const normalizedFields = fields.map((f) => ({ original: f, norm: normalizeHeader(f) }));
  for (const candidate of candidates) {
    const match = normalizedFields.find((f) => f.norm === candidate);
    if (match) return match.original;
  }
  return null;
}

let dom = {};

document.addEventListener("DOMContentLoaded", () => {
  dom = {
    uploadZone: document.getElementById("upload-zone"),
    uploadZoneInner: document.getElementById("upload-zone-inner"),
    csvInput: document.getElementById("csv-input"),
    browseBtn: document.getElementById("browse-btn"),
    sampleBtn: document.getElementById("sample-btn"),
    fileInfo: document.getElementById("upload-file-info"),
    filename: document.getElementById("upload-filename"),
    uploadNote: document.getElementById("upload-note"),
    clearBtn: document.getElementById("clear-file-btn"),

    regionFilter: document.getElementById("region-filter"),
    customerSearch: document.getElementById("customer-search"),
    searchClearBtn: document.getElementById("search-clear-btn"),
    amountSort: document.getElementById("amount-sort"),

    statsRow: document.getElementById("stats-row"),
    statTotal: document.getElementById("stat-total"),
    statAmountLabel: document.getElementById("stat-amount-label"),
    statAmount: document.getElementById("stat-amount"),
    statClear: document.getElementById("stat-clear-btn"),
    statHigh: document.getElementById("stat-high"),

    mapEmpty: document.getElementById("map-empty"),
    customerList: document.getElementById("customer-list"),
    listEmpty: document.getElementById("list-empty"),

    signoutBtn: document.getElementById("signout-btn"),
    topbarUser: document.getElementById("topbar-user"),
  };

  const rememberedEmail = localStorage.getItem(EMAIL_KEY);
  if (rememberedEmail) {
    dom.topbarUser.textContent = `Signed in as ${rememberedEmail}`;
  }

  initMap();
  setupUploadZone();
  setupSampleDownload();
  dom.regionFilter.addEventListener("change", applyFilter);
  dom.amountSort.addEventListener("change", applyFilter);
  dom.statClear.addEventListener("click", clearSelection);

  let searchDebounceTimer = null;
  dom.customerSearch.addEventListener("input", () => {
    dom.searchClearBtn.hidden = dom.customerSearch.value.trim().length === 0;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(applyFilter, 150);
  });

  dom.searchClearBtn.addEventListener("click", () => {
    dom.customerSearch.value = "";
    dom.searchClearBtn.hidden = true;
    applyFilter();
    dom.customerSearch.focus();
  });

  dom.signoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    localStorage.removeItem(EMAIL_KEY);
    window.location.href = "login.html";
  });
});

function setupUploadZone() {
  const { uploadZone, csvInput, browseBtn, clearBtn } = dom;

  uploadZone.addEventListener("click", (e) => {
    // Avoid double-triggering when clicking the sample-CSV link inside the zone
    if (e.target.id === "sample-btn") return;
    csvInput.click();
  });

  browseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    csvInput.click();
  });

  csvInput.addEventListener("change", () => {
    if (csvInput.files[0]) handleFile(csvInput.files[0]);
  });

  ["dragenter", "dragover"].forEach((evt) =>
    uploadZone.addEventListener(evt, (e) => {
      e.preventDefault();
      uploadZone.classList.add("dragover");
    })
  );

  ["dragleave", "drop"].forEach((evt) =>
    uploadZone.addEventListener(evt, (e) => {
      e.preventDefault();
      uploadZone.classList.remove("dragover");
    })
  );

  uploadZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    resetDashboard();
  });
}

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    showUploadError("That doesn't look like a CSV file. Please upload a .csv file.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => parseCsvText(reader.result, file.name);
  reader.onerror = () => showUploadError("Couldn't read that file. Please try again.");
  reader.readAsText(file);
}

function parseCsvText(text, filename) {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (!result.meta.fields || result.meta.fields.length === 0) {
    showUploadError("This CSV appears to be empty.");
    return;
  }

  const fields = result.meta.fields;
  const latKey = findHeader(fields, HEADER_CANDIDATES.latitude);
  const lngKey = findHeader(fields, HEADER_CANDIDATES.longitude);

  if (!latKey || !lngKey) {
    showUploadError(
      "Couldn't find latitude/longitude columns. Expected headers like \"Latitude\" and \"Longitude\"."
    );
    return;
  }

  const nameKey = findHeader(fields, HEADER_CANDIDATES.name);
  const amountKey = findHeader(fields, HEADER_CANDIDATES.amount);

  const records = [];
  let skipped = 0;

  result.data.forEach((row, i) => {
    const lat = parseFloat(row[latKey]);
    const lng = parseFloat(row[lngKey]);

    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      skipped++;
      return;
    }

    records.push({
      id: i,
      name: nameKey && row[nameKey] ? row[nameKey].trim() : `Customer ${i + 1}`,
      amount: amountKey ? parseFloat(String(row[amountKey]).replace(/[^0-9.-]/g, "")) : null,
      latitude: lat,
      longitude: lng,
    });
  });

  if (records.length === 0) {
    showUploadError("No valid coordinates were found in this file.");
    return;
  }

  assignRegions(records);
  allRecords = records;
  classifySeverity(allRecords);
  selectedRecordId = null;

  dom.uploadZone.classList.remove("has-error");
  dom.uploadZoneInner.hidden = true;
  dom.fileInfo.hidden = false;
  dom.filename.textContent = filename;

  let note = `Plotted ${records.length} of ${result.data.length} rows.`;
  if (skipped > 0) note += ` ${skipped} row${skipped === 1 ? "" : "s"} skipped (invalid or missing coordinates).`;
  if (!amountKey) note += " No pending-amount column found, so markers aren't severity-colored.";
  dom.uploadNote.textContent = note;
  dom.uploadNote.classList.remove("is-error");

  populateRegionFilter(allRecords);
  dom.regionFilter.value = "all";
  dom.regionFilter.disabled = false;
  dom.customerSearch.disabled = false;
  dom.amountSort.disabled = false;

  dom.statsRow.hidden = false;
  applyFilter();
}

function showUploadError(message) {
  dom.uploadZone.classList.add("has-error");
  dom.uploadZoneInner.hidden = true;
  dom.fileInfo.hidden = false;
  dom.filename.textContent = "Upload failed";
  dom.uploadNote.textContent = message;
  dom.uploadNote.classList.add("is-error");
}

function resetDashboard() {
  allRecords = [];
  currentFilteredRecords = [];
  selectedRecordId = null;
  dom.csvInput.value = "";

  dom.uploadZone.classList.remove("has-error", "dragover");
  dom.uploadZoneInner.hidden = false;
  dom.fileInfo.hidden = true;

  dom.regionFilter.innerHTML = '<option value="all">All regions</option>';
  dom.regionFilter.disabled = true;

  dom.customerSearch.value = "";
  dom.customerSearch.disabled = true;
  dom.searchClearBtn.hidden = true;

  dom.amountSort.value = "none";
  dom.amountSort.disabled = true;

  dom.statsRow.hidden = true;
  dom.statAmountLabel.textContent = "Total pending";
  dom.statClear.hidden = true;

  clearMarkers();
  map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  dom.mapEmpty.hidden = false;

  dom.customerList.innerHTML = '<p class="list-empty" id="list-empty">No data yet — upload a CSV to get started.</p>';
}

function classifySeverity(records) {
  const amounts = records
    .map((r) => r.amount)
    .filter((a) => typeof a === "number" && !Number.isNaN(a))
    .sort((a, b) => a - b);

  if (amounts.length === 0) {
    records.forEach((r) => (r.severity = "green"));
    return;
  }

  const q1 = amounts[Math.floor(amounts.length * 0.25)];
  const q2 = amounts[Math.floor(amounts.length * 0.5)];
  const q3 = amounts[Math.floor(amounts.length * 0.75)];

  records.forEach((r) => {
    if (typeof r.amount !== "number" || Number.isNaN(r.amount)) {
      r.severity = "green";
    } else if (r.amount <= q1) {
      r.severity = "green";
    } else if (r.amount <= q2) {
      r.severity = "yellow";
    } else if (r.amount <= q3) {
      r.severity = "orange";
    } else {
      r.severity = "red";
    }
  });
}


function assignRegions(records) {
  if (records.length === 0) return;

  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;

  records.forEach((r) => {
    if (r.latitude < minLat) minLat = r.latitude;
    if (r.latitude > maxLat) maxLat = r.latitude;
    if (r.longitude < minLng) minLng = r.longitude;
    if (r.longitude > maxLng) maxLng = r.longitude;
  });

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  records.forEach((r) => {
    const dLat = r.latitude - centerLat;
    const dLng = r.longitude - centerLng;

    if (Math.abs(dLng) >= Math.abs(dLat)) {
      r.region = dLng >= 0 ? "Eastern" : "Western";
    } else {
      r.region = dLat >= 0 ? "Northern" : "Southern";
    }
  });
}

function setupSampleDownload() {
  dom.sampleBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    const rows = [
      ["name", "latitude", "longitude", "pending_amount"],
      ["Asha Patnaik", "19.8135", "85.8312", "4200"],
      ["Ramesh Sahu", "21.4669", "83.9756", "1800"],
      ["Priya Nayak", "20.2961", "85.8245", "950"],
      ["Sourav Behera", "21.4942", "86.9335", "7600"],
      ["Manisha Pradhan", "19.3149", "84.7941", "3100"],
      ["Bikash Jena", "22.2604", "84.8536", "9500"],
      ["Lopamudra Swain", "18.8121", "82.7501", "600"],
      ["Debasis Rout", "20.5004", "86.4218", "5400"],
    ];

    const csvText = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvText], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-customers.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

function initMap() {
  map = L.map("map", { attributionControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Esri, HERE, Garmin &copy; OpenStreetMap contributors",
      maxZoom: 16,
      maxNativeZoom: 16,
    }
  ).addTo(map);

  L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 16,
      maxNativeZoom: 16,
    }
  ).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

function clearMarkers() {
  markersLayer.clearLayers();
  currentMarkers = [];
}

function renderMarkers(records) {
  clearMarkers();

  records.forEach((r) => {
    const color = SEVERITY_COLORS[r.severity] || SEVERITY_COLORS.green;
    const isSelected = r.id === selectedRecordId;

    const marker = L.circleMarker([r.latitude, r.longitude], {
      radius: isSelected ? 10 : 7,
      color: isSelected ? "#ffffff" : color,
      weight: isSelected ? 2.5 : 1.5,
      fillColor: color,
      fillOpacity: 0.85,
    });

    const amountText =
      typeof r.amount === "number" && !Number.isNaN(r.amount)
        ? `₹${r.amount.toLocaleString("en-IN")}`
        : "Not provided";

    marker.bindPopup(
      `<strong>${escapeHtml(r.name)}</strong><br/>` +
        `Region: ${escapeHtml(r.region)}<br/>` +
        `Pending: ${amountText}<br/>` +
        `<span style="color:var(--mist-dim)">${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}</span>`
    );

    marker.on("click", () => selectRecord(r.id));

    marker.addTo(markersLayer);
    currentMarkers.push(marker);
  });

  if (records.length > 0) {
    const bounds = L.latLngBounds(records.map((r) => [r.latitude, r.longitude]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
    dom.mapEmpty.hidden = true;
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    dom.mapEmpty.hidden = false;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function populateRegionFilter(records) {
  const regions = Array.from(new Set(records.map((r) => r.region))).sort((a, b) =>
    a.localeCompare(b)
  );

  dom.regionFilter.innerHTML = '<option value="all">All regions</option>';
  regions.forEach((region) => {
    const opt = document.createElement("option");
    opt.value = region;
    opt.textContent = region;
    dom.regionFilter.appendChild(opt);
  });
}

function applyFilter() {
  const regionValue = dom.regionFilter.value;
  const searchTerm = dom.customerSearch.value.trim().toLowerCase();
  const sortOrder = dom.amountSort.value; // "none" | "asc" | "desc"

  let filtered =
    regionValue === "all" ? allRecords.slice() : allRecords.filter((r) => r.region === regionValue);

  if (searchTerm) {
    filtered = filtered.filter((r) => r.name.toLowerCase().includes(searchTerm));
  }

  if (sortOrder === "asc" || sortOrder === "desc") {
    filtered = filtered.slice().sort((a, b) => {
      const av = typeof a.amount === "number" && !Number.isNaN(a.amount) ? a.amount : null;
      const bv = typeof b.amount === "number" && !Number.isNaN(b.amount) ? b.amount : null;
      // Records with no amount always sink to the bottom, regardless of direction.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortOrder === "asc" ? av - bv : bv - av;
    });
  }

  currentFilteredRecords = filtered;

  renderMarkers(filtered);
  renderList(filtered, searchTerm);
  updateStats(filtered);
}

function updateStats(records) {
  const total = records.length;
  const highCount = records.filter((r) => r.severity === "red").length;

  dom.statTotal.textContent = total.toLocaleString("en-IN");
  dom.statHigh.textContent = highCount.toLocaleString("en-IN");

  const selected =
    selectedRecordId !== null ? records.find((r) => r.id === selectedRecordId) : null;

  if (selected) {
    dom.statAmountLabel.textContent = `Pending — ${selected.name}`;
    dom.statAmount.textContent =
      typeof selected.amount === "number" && !Number.isNaN(selected.amount)
        ? `₹${selected.amount.toLocaleString("en-IN")}`
        : "—";
    dom.statClear.hidden = false;
    return;
  }

  selectedRecordId = null;
  dom.statAmountLabel.textContent = "Total pending";
  const hasAmounts = records.some((r) => typeof r.amount === "number" && !Number.isNaN(r.amount));
  const totalAmount = records.reduce(
    (sum, r) => sum + (typeof r.amount === "number" && !Number.isNaN(r.amount) ? r.amount : 0),
    0
  );
  dom.statAmount.textContent = hasAmounts ? `₹${totalAmount.toLocaleString("en-IN")}` : "—";
  dom.statClear.hidden = true;
}

function selectRecord(id) {
  selectedRecordId = id;
  restyleMarkers();
  highlightSelectedRow();
  updateStats(currentFilteredRecords);
}

function clearSelection() {
  selectedRecordId = null;
  restyleMarkers();
  highlightSelectedRow();
  updateStats(currentFilteredRecords);
}

function restyleMarkers() {
  currentFilteredRecords.forEach((r, idx) => {
    const marker = currentMarkers[idx];
    if (!marker) return;

    const color = SEVERITY_COLORS[r.severity] || SEVERITY_COLORS.green;
    const isSelected = r.id === selectedRecordId;

    marker.setStyle({
      radius: isSelected ? 10 : 7,
      color: isSelected ? "#ffffff" : color,
      weight: isSelected ? 2.5 : 1.5,
      fillColor: color,
      fillOpacity: 0.85,
    });

    if (isSelected) marker.bringToFront();
  });
}

function highlightSelectedRow() {
  dom.customerList.querySelectorAll(".list-row").forEach((row) => {
    const isSelected = Number(row.dataset.recordId) === selectedRecordId;
    row.classList.toggle("list-row--selected", isSelected);
  });
}

function renderList(records, searchTerm) {
  dom.customerList.innerHTML = "";

  if (records.length === 0) {
    const message = searchTerm
      ? `No customers match "${escapeHtml(searchTerm)}".`
      : "No customers match the current filters.";
    dom.customerList.innerHTML = `<p class="list-empty">${message}</p>`;
    return;
  }

  records.forEach((r, index) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.tabIndex = 0;
    row.dataset.recordId = r.id;
    if (r.id === selectedRecordId) row.classList.add("list-row--selected");

    const amountText =
      typeof r.amount === "number" && !Number.isNaN(r.amount)
        ? `₹${r.amount.toLocaleString("en-IN")}`
        : "—";

    row.innerHTML = `
      <span class="dot dot--${r.severity}"></span>
      <span class="list-row-text">
        <div class="list-row-name">${escapeHtml(r.name)}</div>
        <div class="list-row-region">${escapeHtml(r.region)}</div>
      </span>
      <span class="list-row-amount">${amountText}</span>
    `;

    const activateRow = () => {
      selectRecord(r.id);
      const marker = currentMarkers[index];
      if (!marker) return;
      map.flyTo([r.latitude, r.longitude], Math.max(map.getZoom(), 11), { duration: 0.6 });
      marker.openPopup();
    };

    row.addEventListener("click", activateRow);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activateRow();
      }
    });

    dom.customerList.appendChild(row);
  });
}