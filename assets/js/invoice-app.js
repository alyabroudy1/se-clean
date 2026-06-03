// =============================================================================
// Invoice App Logic — S&E Clean Internal Tools
// Handles: UI interactions, API calls, form state management
// =============================================================================

const API_BASE = "https://se-clean-backend.alyabroudy1.workers.dev";

// =============================================================================
// Hidden Tools System
// =============================================================================

function initHiddenTools() {
  const moreLink = document.getElementById("footer-more-link");
  const commandArea = document.getElementById("command-area");
  const commandInput = document.getElementById("command-input");
  const commandSubmit = document.getElementById("command-submit");

  moreLink.addEventListener("click", (e) => {
    e.preventDefault();
    commandArea.classList.toggle("hidden");
    if (!commandArea.classList.contains("hidden")) {
      commandInput.focus();
    }
  });

  const handleCommand = () => {
    const cmd = commandInput.value.trim().toLowerCase();
    if (cmd === "rechnung") {
      document.getElementById("rechnung-section").classList.remove("hidden");
      document.getElementById("rechnung-section").scrollIntoView({ behavior: "smooth" });
      commandInput.value = "";
      commandArea.classList.add("hidden");
    } else if (cmd) {
      commandInput.value = "";
      commandInput.placeholder = "Unbekannter Befehl...";
      setTimeout(() => { commandInput.placeholder = "Befehl eingeben..."; }, 2000);
    }
  };

  commandSubmit.addEventListener("click", handleCommand);
  commandInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleCommand();
  });
}

// =============================================================================
// Invoice Mode Management
// =============================================================================

let currentMode = null; // 'create' or 'edit'
let currentEditVersion = null; // tracks version being edited

function showCreateMode() {
  currentMode = "create";
  currentEditVersion = null;
  document.getElementById("mode-selector").classList.add("hidden");
  document.getElementById("edit-search-area").classList.add("hidden");
  document.getElementById("invoice-form-area").classList.remove("hidden");
  document.getElementById("form-title").textContent = "Neue Rechnung erstellen";
  document.getElementById("create-new-btn").classList.add("hidden");
  resetInvoiceForm();
  fetchNextInvoiceNumber();
}

function showEditMode() {
  currentMode = "edit";
  document.getElementById("mode-selector").classList.add("hidden");
  document.getElementById("edit-search-area").classList.remove("hidden");
  document.getElementById("invoice-form-area").classList.add("hidden");
  document.getElementById("search-input").focus();
}

function backToModeSelector() {
  currentMode = null;
  document.getElementById("mode-selector").classList.remove("hidden");
  document.getElementById("edit-search-area").classList.add("hidden");
  document.getElementById("invoice-form-area").classList.add("hidden");
  document.getElementById("version-list-area").classList.add("hidden");
  document.getElementById("invoice-success").classList.add("hidden");
  clearInvoiceError();
}

// =============================================================================
// API Calls
// =============================================================================

async function fetchNextInvoiceNumber() {
  try {
    const res = await fetch(`${API_BASE}/api/invoices/next-number`);
    const data = await res.json();
    if (data.success) {
      document.getElementById("inv-number").value = data.invoiceNumber;
    }
  } catch (err) {
    console.error("Failed to fetch next invoice number:", err);
    document.getElementById("inv-number").value = "Fehler";
  }
}

async function searchInvoice() {
  const searchInput = document.getElementById("search-input");
  const number = searchInput.value.trim();
  if (!number) {
    showInvoiceError("Bitte geben Sie eine Rechnungsnummer ein.");
    return;
  }

  clearInvoiceError();
  setSearchLoading(true);

  try {
    const res = await fetch(`${API_BASE}/api/invoices/${encodeURIComponent(number)}`);
    const data = await res.json();

    if (!data.success) {
      showInvoiceError(data.error || "Rechnung nicht gefunden.");
      return;
    }

    const invoice = data.invoice;

    if (invoice.versions.length === 1) {
      // Single version — show version list with download option
      showVersionList(invoice);
    } else {
      // Multiple versions — show version list
      showVersionList(invoice);
    }
  } catch (err) {
    showInvoiceError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    console.error("Search error:", err);
  } finally {
    setSearchLoading(false);
  }
}

async function submitInvoice() {
  clearInvoiceError();

  const invoiceData = collectFormData();
  if (!invoiceData) return; // validation failed, error already shown

  setSubmitLoading(true);

  try {
    const invoiceNumber = document.getElementById("inv-number").value;
    const isEdit = currentMode === "edit";
    const url = isEdit
      ? `${API_BASE}/api/invoices/${encodeURIComponent(invoiceNumber)}`
      : `${API_BASE}/api/invoices`;

    const res = await fetch(url, {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invoiceData),
    });

    const data = await res.json();

    if (!data.success) {
      showInvoiceError(data.error || "Fehler beim Speichern.");
      return;
    }

    // Show success state with version info
    const resultNumber = data.invoiceNumber || invoiceNumber;
    const version = data.version || 1;
    const displayName = version > 1 ? `${resultNumber}-v${version}` : resultNumber;
    showInvoiceSuccess(resultNumber, data.message, invoiceData, version, isEdit);
  } catch (err) {
    showInvoiceError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    console.error("Submit error:", err);
  } finally {
    setSubmitLoading(false);
  }
}

/**
 * Create a new invoice while editing — pre-fills form with current data
 */
function createNewFromEdit() {
  // Collect current form data before switching
  const custCompany = document.getElementById("cust-company").value;
  const custName = document.getElementById("cust-name").value;
  const custAddress = document.getElementById("cust-address").value;
  const custPhone = document.getElementById("cust-phone").value;
  const custEmail = document.getElementById("cust-email").value;

  // Switch to create mode
  currentMode = "create";
  currentEditVersion = null;
  document.getElementById("form-title").textContent = "Neue Rechnung erstellen";
  document.getElementById("create-new-btn").classList.add("hidden");

  // Fetch new invoice number
  fetchNextInvoiceNumber();

  // Keep customer data pre-filled
  document.getElementById("cust-company").value = custCompany;
  document.getElementById("cust-name").value = custName;
  document.getElementById("cust-address").value = custAddress;
  document.getElementById("cust-phone").value = custPhone;
  document.getElementById("cust-email").value = custEmail;
  document.getElementById("inv-date").value = new Date().toISOString().slice(0, 10);

  clearInvoiceError();
}

// =============================================================================
// Form Data Collection & Validation
// =============================================================================

function collectFormData() {
  const customer = {
    companyName: document.getElementById("cust-company").value.trim(),
    name: document.getElementById("cust-name").value.trim(),
    address: document.getElementById("cust-address").value.trim(),
    phone: document.getElementById("cust-phone").value.trim(),
    email: document.getElementById("cust-email").value.trim(),
  };

  if (!customer.name) { showInvoiceError("Kundenname ist erforderlich."); return null; }
  if (!customer.address) { showInvoiceError("Kundenadresse ist erforderlich."); return null; }

  const date = document.getElementById("inv-date").value;
  if (!date) { showInvoiceError("Rechnungsdatum ist erforderlich."); return null; }

  // Collect Leistungen from table
  const rows = document.querySelectorAll("#leistungen-body tr");
  const leistungen = [];
  let subtotal = 0;

  for (let i = 0; i < rows.length; i++) {
    const datum = rows[i].querySelector("td:nth-child(1) input").value.trim();
    const menge = parseDE(rows[i].querySelector("td:nth-child(2) input").value);
    
    const einheitSelect = rows[i].querySelector(".leistung-einheit");
    const einheitCustom = rows[i].querySelector(".leistung-einheit-custom");
    const einheit = einheitSelect.value === "Sonstige..." ? einheitCustom.value.trim() : einheitSelect.value;

    const beschreibungSelect = rows[i].querySelector(".leistung-beschreibung");
    const beschreibungCustom = rows[i].querySelector(".leistung-beschreibung-custom");
    const beschreibung = beschreibungSelect.value === "Sonstige" ? beschreibungCustom.value.trim() : beschreibungSelect.value;

    const einzelpreis = parseDE(rows[i].querySelector(".leistung-einzelpreis").value);
    const gesamtpreis = parseDE(rows[i].querySelector(".leistung-gesamt").value);

    if (einheitSelect.value === "Sonstige..." && !einheit) {
      showInvoiceError(`Zeile ${i + 1}: Bitte eigene Einheit eingeben.`);
      return null;
    }
    if (!beschreibung) {
      showInvoiceError(`Zeile ${i + 1}: Bitte Leistung auswählen oder eingeben.`);
      return null;
    }
    if (einzelpreis <= 0) {
      showInvoiceError(`Zeile ${i + 1}: Einzelpreis muss größer als 0 sein.`);
      return null;
    }

    leistungen.push({
      datum,
      menge,
      einheit,
      beschreibung,
      einzelpreis,
      gesamtpreis,
      arbeitszeit: menge, // backward compatibility
    });
    subtotal += gesamtpreis;
  }

  if (leistungen.length === 0) {
    showInvoiceError("Mindestens eine Leistung ist erforderlich.");
    return null;
  }

  const hinweise = document.getElementById("inv-hinweise").value.trim();

  return {
    customer,
    company: INVOICE_CONFIG.company,
    date,
    leistungen,
    hinweise,
    subtotal: Math.round(subtotal * 100) / 100,
    total: Math.round(subtotal * 100) / 100, // No MwSt — Kleinunternehmer
  };
}

// =============================================================================
// Leistungen Table Management
// =============================================================================

const LEISTUNG_TYPES = [
  "Fensterreinigung",
  "Treppenhausreinigung",
  "Büroreinigung",
  "Bauendreinigung",
  "Bodenreinigung",
  "PV-Anlagen Reinigung",
  "Grundreinigung",
  "Unterhaltsreinigung",
  "Sonstige",
];

const EINHEIT_TYPES = [
  "Std.",
  "Pauschale",
  "Sonstige...",
];

function addLeistungRow(data) {
  const tbody = document.getElementById("leistungen-body");
  const tr = document.createElement("tr");
  tr.className = "border-b border-slate-200 hover:bg-slate-50 transition-colors";

  const datumVal = data ? data.datum || "" : "";
  const mengeVal = data ? (data.menge !== undefined ? data.menge : (data.arbeitszeit || "")) : "";
  
  const einheitVal = data ? (data.einheit || "Std.") : "Std.";
  const isStandardEinheit = EINHEIT_TYPES.includes(einheitVal) && einheitVal !== "Sonstige...";
  const selectEinheitVal = data ? (isStandardEinheit ? einheitVal : "Sonstige...") : "Std.";
  const customEinheitVal = data ? (isStandardEinheit ? "" : einheitVal) : "";

  const beschreibungVal = data ? data.beschreibung || "" : "";
  const isStandardBeschreibung = LEISTUNG_TYPES.includes(beschreibungVal) && beschreibungVal !== "Sonstige";
  const selectBeschreibungVal = data ? (isStandardBeschreibung ? beschreibungVal : "Sonstige") : "";
  const customBeschreibungVal = data ? (isStandardBeschreibung ? "" : beschreibungVal) : "";

  const einzelpreisVal = data ? formatDE(data.einzelpreis) : "";
  const gesamtpreisVal = data ? formatDE(data.gesamtpreis) : "";

  const optionsHtml = LEISTUNG_TYPES.map(
    (t) => `<option value="${t}" ${t === selectBeschreibungVal ? "selected" : ""}>${t}</option>`
  ).join("");

  const einheitOptionsHtml = EINHEIT_TYPES.map(
    (u) => `<option value="${u}" ${u === selectEinheitVal ? "selected" : ""}>${u}</option>`
  ).join("");

  tr.innerHTML = `
    <td class="p-2"><input type="date" value="${datumVal}" class="w-full p-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"></td>
    <td class="p-2"><input type="text" value="${mengeVal}" placeholder="z.B. 1" class="leistung-menge w-full p-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none" inputmode="decimal"></td>
    <td class="p-2">
      <select class="leistung-einheit w-full p-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
        ${einheitOptionsHtml}
      </select>
      <input type="text" value="${customEinheitVal}" placeholder="Einheit..." class="leistung-einheit-custom hidden w-full mt-1 p-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 outline-none">
    </td>
    <td class="p-2">
      <select class="leistung-beschreibung w-full p-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
        <option value="">— Auswählen —</option>
        ${optionsHtml}
      </select>
      <input type="text" value="${customBeschreibungVal}" placeholder="Eigene Leistung..." class="leistung-beschreibung-custom hidden w-full mt-1 p-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 outline-none">
    </td>
    <td class="p-2"><input type="text" value="${einzelpreisVal}" placeholder="35,00" class="leistung-einzelpreis w-full p-2 rounded-lg border border-slate-300 text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none" inputmode="decimal"></td>
    <td class="p-2"><input type="text" value="${gesamtpreisVal}" placeholder="0,00" class="leistung-gesamt w-full p-2 rounded-lg border border-slate-300 text-sm text-right bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" inputmode="decimal"></td>
    <td class="p-2 text-center">
      <button type="button" onclick="removeLeistungRow(this)" class="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg p-1 transition-colors" title="Zeile entfernen">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
      </button>
    </td>
  `;

  // Dynamic input toggles for custom values
  const einheitSelect = tr.querySelector(".leistung-einheit");
  const einheitCustom = tr.querySelector(".leistung-einheit-custom");
  const beschreibungSelect = tr.querySelector(".leistung-beschreibung");
  const beschreibungCustom = tr.querySelector(".leistung-beschreibung-custom");

  const toggleEinheitCustom = () => {
    if (einheitSelect.value === "Sonstige...") {
      einheitCustom.classList.remove("hidden");
    } else {
      einheitCustom.classList.add("hidden");
    }
  };

  const toggleBeschreibungCustom = () => {
    if (beschreibungSelect.value === "Sonstige") {
      beschreibungCustom.classList.remove("hidden");
    } else {
      beschreibungCustom.classList.add("hidden");
    }
  };

  toggleEinheitCustom();
  toggleBeschreibungCustom();

  einheitSelect.addEventListener("change", toggleEinheitCustom);
  beschreibungSelect.addEventListener("change", toggleBeschreibungCustom);

  // Add blur event listeners for auto-calculation
  const mengeInput = tr.querySelector(".leistung-menge");
  const einzelpreisInput = tr.querySelector(".leistung-einzelpreis");
  const gesamtInput = tr.querySelector(".leistung-gesamt");

  mengeInput.addEventListener("blur", () => recalcRowFromTr(tr));
  einzelpreisInput.addEventListener("blur", () => recalcRowFromTr(tr));
  // Also recalc on Enter key
  mengeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); recalcRowFromTr(tr); einzelpreisInput.focus(); } });
  einzelpreisInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); recalcRowFromTr(tr); } });
  // Manual edit of Gesamt updates total
  gesamtInput.addEventListener("blur", () => recalcTotal());

  tbody.appendChild(tr);
  recalcTotal();
}

function removeLeistungRow(btn) {
  const tbody = document.getElementById("leistungen-body");
  if (tbody.rows.length <= 1) {
    showInvoiceError("Mindestens eine Leistung ist erforderlich.");
    setTimeout(clearInvoiceError, 3000);
    return;
  }
  btn.closest("tr").remove();
  recalcTotal();
}

/**
 * Parse a German-format number string: "3,5" → 3.5, "35,00" → 35.0
 */
function parseDE(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  // Remove spaces, replace comma with dot
  return parseFloat(String(value).replace(/\s/g, "").replace(",", ".")) || 0;
}

/**
 * Format a number for German display: 35 → "35,00", 3.5 → "3,50"
 */
function formatDE(value) {
  const num = parseFloat(value) || 0;
  if (num === 0 && !value) return "";
  return num.toFixed(2).replace(".", ",");
}

/**
 * Recalculate a single row's Gesamt from Menge × Einzelpreis
 */
function recalcRowFromTr(tr) {
  const mengeInput = tr.querySelector(".leistung-menge");
  const einzelpreisInput = tr.querySelector(".leistung-einzelpreis");
  const gesamtInput = tr.querySelector(".leistung-gesamt");

  const menge = parseDE(mengeInput.value);
  const einzelpreis = parseDE(einzelpreisInput.value);

  if (menge > 0 && einzelpreis > 0) {
    const gesamt = menge * einzelpreis;
    gesamtInput.value = formatDE(gesamt);
  }
  recalcTotal();
}

function recalcTotal() {
  const rows = document.querySelectorAll("#leistungen-body tr");
  let total = 0;
  rows.forEach((row) => {
    const gesamtInput = row.querySelector(".leistung-gesamt");
    if (gesamtInput) {
      total += parseDE(gesamtInput.value);
    }
  });
  document.getElementById("inv-total").textContent = formatDE(total) + " €";
}

// =============================================================================
// Version List (for Edit mode with multiple versions)
// =============================================================================

function showVersionList(invoice) {
  const area = document.getElementById("version-list-area");
  const list = document.getElementById("version-list");
  list.innerHTML = "";

  document.getElementById("version-list-title").textContent =
    `Rechnung ${invoice.invoiceNumber} — ${invoice.versions.length} Version(en)`;

  invoice.versions.forEach((v, idx) => {
    const div = document.createElement("div");
    div.className = "flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all";
    const createdStr = new Date(v.createdAt).toLocaleString("de-DE");
    const versionSuffix = v.version > 1 ? `-v${v.version}` : "";
    div.innerHTML = `
      <div>
        <span class="font-bold text-blue-900">Version ${v.version}</span>
        <span class="text-slate-500 text-sm ml-2">vom ${createdStr}</span>
        <span class="text-slate-600 text-sm ml-2">| ${v.customer.name} | ${v.total.toFixed(2).replace(".", ",")} €</span>
      </div>
      <div class="flex gap-2">
        <button onclick='downloadVersionFromList("${invoice.invoiceNumber}${versionSuffix}", ${idx})'
          class="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          PDF
        </button>
        <button onclick='loadVersionFromList("${invoice.invoiceNumber}", ${idx})'
          class="bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors">
          Bearbeiten
        </button>
      </div>
    `;
    list.appendChild(div);
  });

  area.classList.remove("hidden");

  // Store invoice data for version loading
  window._loadedInvoice = invoice;
}

function downloadVersionFromList(invoiceNumberWithVersion, versionIndex) {
  const invoice = window._loadedInvoice;
  if (!invoice) return;
  const v = invoice.versions[versionIndex];
  downloadInvoicePDF({
    ...v,
    invoiceNumber: invoiceNumberWithVersion,
  });
}

function loadVersionFromList(invoiceNumber, versionIndex) {
  const invoice = window._loadedInvoice;
  if (!invoice) return;
  loadInvoiceIntoForm(invoiceNumber, invoice.versions[versionIndex]);
}

function loadInvoiceIntoForm(invoiceNumber, versionData) {
  currentEditVersion = versionData.version || null;
  document.getElementById("version-list-area").classList.add("hidden");
  document.getElementById("edit-search-area").classList.add("hidden");
  document.getElementById("invoice-form-area").classList.remove("hidden");

  // Show version info in title
  const versionLabel = currentEditVersion ? ` (Version ${currentEditVersion})` : "";
  document.getElementById("form-title").textContent = `Rechnung ${invoiceNumber} bearbeiten${versionLabel}`;

  // Show "Create New" button when editing
  document.getElementById("create-new-btn").classList.remove("hidden");

  // Fill form
  document.getElementById("inv-number").value = invoiceNumber;
  document.getElementById("inv-date").value = versionData.date || "";
  document.getElementById("cust-company").value = versionData.customer?.companyName || "";
  document.getElementById("cust-name").value = versionData.customer?.name || "";
  document.getElementById("cust-address").value = versionData.customer?.address || "";
  document.getElementById("cust-phone").value = versionData.customer?.phone || "";
  document.getElementById("cust-email").value = versionData.customer?.email || "";
  document.getElementById("inv-hinweise").value = versionData.hinweise || "";

  // Clear and refill Leistungen
  document.getElementById("leistungen-body").innerHTML = "";
  if (versionData.leistungen && versionData.leistungen.length > 0) {
    versionData.leistungen.forEach((l) => addLeistungRow(l));
  } else {
    addLeistungRow();
  }
}

// =============================================================================
// UI Helpers
// =============================================================================

function resetInvoiceForm() {
  document.getElementById("inv-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("cust-company").value = "";
  document.getElementById("cust-name").value = "";
  document.getElementById("cust-address").value = "";
  document.getElementById("cust-phone").value = "";
  document.getElementById("cust-email").value = "";
  document.getElementById("inv-hinweise").value = "Zahlbar innerhalb von 7 Tagen nach Rechnungseingang.";
  document.getElementById("leistungen-body").innerHTML = "";
  addLeistungRow();
  clearInvoiceError();
  document.getElementById("invoice-success").classList.add("hidden");
}

function showInvoiceError(msg) {
  const el = document.getElementById("invoice-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearInvoiceError() {
  const el = document.getElementById("invoice-error");
  el.textContent = "";
  el.classList.add("hidden");
}

function showInvoiceSuccess(invoiceNumber, message, invoiceData, version, wasEdit) {
  document.getElementById("invoice-form-area").classList.add("hidden");
  const successEl = document.getElementById("invoice-success");
  successEl.classList.remove("hidden");

  // Show version info in success message
  const versionSuffix = version && version > 1 ? `-v${version}` : "";
  document.getElementById("success-message").textContent = message;
  document.getElementById("success-version-info").textContent =
    versionSuffix ? `Gespeichert als ${invoiceNumber}${versionSuffix}` : "";

  // Show "Create New" button in success if it was an edit
  const createNewSuccessBtn = document.getElementById("success-create-new-btn");
  if (createNewSuccessBtn) {
    createNewSuccessBtn.classList.toggle("hidden", !wasEdit);
  }

  // Store for download (include version suffix in filename)
  window._lastSavedInvoice = { ...invoiceData, invoiceNumber: invoiceNumber + versionSuffix };
  // Keep original number for re-edit
  window._lastSavedInvoiceOrigNumber = invoiceNumber;
}

function downloadLastInvoice() {
  if (window._lastSavedInvoice) {
    downloadInvoicePDF(window._lastSavedInvoice);
  }
}

function editLastInvoice() {
  const inv = window._lastSavedInvoice;
  if (!inv) return;
  currentMode = "edit";
  document.getElementById("invoice-success").classList.add("hidden");
  const origNumber = window._lastSavedInvoiceOrigNumber || inv.invoiceNumber;
  loadInvoiceIntoForm(origNumber, inv);
}

function createNewFromSuccess() {
  document.getElementById("invoice-success").classList.add("hidden");
  showCreateMode();
}

function setSearchLoading(loading) {
  const btn = document.getElementById("search-btn");
  const spinner = document.getElementById("search-spinner");
  btn.disabled = loading;
  spinner.classList.toggle("hidden", !loading);
}

function setSubmitLoading(loading) {
  const btn = document.getElementById("invoice-submit-btn");
  const spinner = document.getElementById("invoice-spinner");
  btn.disabled = loading;
  spinner.classList.toggle("hidden", !loading);
}

function formatDateDE(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return dateStr;
}

// =============================================================================
// Init on DOM ready
// =============================================================================

document.addEventListener("DOMContentLoaded", () => {
  initHiddenTools();
});
