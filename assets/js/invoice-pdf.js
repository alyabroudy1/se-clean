// =============================================================================
// Invoice PDF Template — S&E Clean
// Uses jsPDF + jsPDF-AutoTable for professional German invoice generation
// Modify this file to change the invoice layout/design
// =============================================================================

const INVOICE_CONFIG = {
  company: {
    name: "S&E Clean",
    address: "Im Siefchen 5",
    city: "51643 Gummersbach",
    steuerNr: "48937160655",
    bankName: "Abdullah Al Refai",
    iban: "DE 86 3845 0000 1000 7557 75",
  },
  // Layout settings
  margin: { top: 20, left: 20, right: 20, bottom: 20 },
  colors: {
    primary: [30, 58, 138],     // blue-900
    secondary: [100, 116, 139], // slate-500
    headerBg: [241, 245, 249],  // slate-100
    black: [0, 0, 0],
    white: [255, 255, 255],
  },
  fonts: {
    titleSize: 22,
    headingSize: 12,
    normalSize: 10,
    smallSize: 8,
  },
  kleinunternehmerHinweis: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.",
};

/**
 * Generate a downloadable PDF invoice
 * @param {Object} invoiceData - The invoice data object
 * @returns {jsPDF} - The generated PDF document
 */
function generateInvoicePDF(invoiceData) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const cfg = INVOICE_CONFIG;
  let y = cfg.margin.top;

  // --- Company Header ---
  doc.setFontSize(cfg.fonts.titleSize);
  doc.setTextColor(...cfg.colors.primary);
  doc.setFont("helvetica", "bold");
  doc.text(cfg.company.name, cfg.margin.left, y);
  y += 7;

  doc.setFontSize(cfg.fonts.smallSize);
  doc.setTextColor(...cfg.colors.secondary);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${cfg.company.address} | ${cfg.company.city} | St.-Nr.: ${cfg.company.steuerNr}`,
    cfg.margin.left, y
  );
  y += 4;

  // Divider line
  doc.setDrawColor(...cfg.colors.primary);
  doc.setLineWidth(0.8);
  doc.line(cfg.margin.left, y, pageWidth - cfg.margin.right, y);
  y += 12;

  // --- Customer Address Block ---
  doc.setFontSize(cfg.fonts.normalSize);
  doc.setTextColor(...cfg.colors.black);
  doc.setFont("helvetica", "normal");

  const customer = invoiceData.customer;
  if (customer.companyName) {
    doc.setFont("helvetica", "bold");
    doc.text(customer.companyName, cfg.margin.left, y);
    y += 5;
    doc.setFont("helvetica", "normal");
  }
  doc.text(customer.name, cfg.margin.left, y);
  y += 5;
  const addressLines = customer.address.split("\n");
  addressLines.forEach((line) => {
    doc.text(line.trim(), cfg.margin.left, y);
    y += 5;
  });

  if (customer.phone) {
    doc.text(`Tel.: ${customer.phone}`, cfg.margin.left, y);
    y += 5;
  }
  if (customer.email) {
    doc.text(`E-Mail: ${customer.email}`, cfg.margin.left, y);
    y += 5;
  }

  // --- Invoice Info (right side) ---
  const infoX = pageWidth - cfg.margin.right;
  let infoY = y - (addressLines.length + 1) * 5 - (customer.phone ? 5 : 0) - (customer.email ? 5 : 0);
  if (infoY < cfg.margin.top + 30) infoY = cfg.margin.top + 30;

  doc.setFontSize(cfg.fonts.normalSize);
  doc.setFont("helvetica", "bold");
  doc.text(`Rechnung Nr.: ${invoiceData.invoiceNumber}`, infoX, infoY, { align: "right" });
  infoY += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Datum: ${formatDateDE(invoiceData.date)}`, infoX, infoY, { align: "right" });

  y += 10;

  // --- Title "RECHNUNG" ---
  doc.setFontSize(16);
  doc.setTextColor(...cfg.colors.primary);
  doc.setFont("helvetica", "bold");
  doc.text("RECHNUNG", cfg.margin.left, y);
  y += 10;

  // --- Leistungen Table ---
  const tableColumns = [
    { header: "Datum", dataKey: "datum" },
    { header: "Arbeitszeit", dataKey: "arbeitszeit" },
    { header: "Leistung", dataKey: "beschreibung" },
    { header: "Stundensatz", dataKey: "einzelpreis" },
    { header: "Gesamt", dataKey: "gesamtpreis" },
  ];

  const tableRows = invoiceData.leistungen.map((l) => ({
    datum: l.datum || "",
    arbeitszeit: l.arbeitszeit || "",
    beschreibung: l.beschreibung || "",
    einzelpreis: formatCurrencyDE(l.einzelpreis),
    gesamtpreis: formatCurrencyDE(l.gesamtpreis),
  }));

  doc.autoTable({
    startY: y,
    columns: tableColumns,
    body: tableRows,
    theme: "grid",
    styles: {
      fontSize: cfg.fonts.normalSize,
      cellPadding: 3,
      textColor: cfg.colors.black,
      lineColor: [200, 200, 200],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: cfg.colors.primary,
      textColor: cfg.colors.white,
      fontStyle: "bold",
      fontSize: cfg.fonts.normalSize,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      datum: { cellWidth: 28 },
      arbeitszeit: { cellWidth: 28 },
      beschreibung: { cellWidth: "auto" },
      einzelpreis: { cellWidth: 30, halign: "right" },
      gesamtpreis: { cellWidth: 28, halign: "right" },
    },
    margin: { left: cfg.margin.left, right: cfg.margin.right },
  });

  y = doc.lastAutoTable.finalY + 8;

  // --- Totals ---
  const totalsX = pageWidth - cfg.margin.right - 60;
  const totalsValueX = pageWidth - cfg.margin.right;

  doc.setFontSize(cfg.fonts.normalSize);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...cfg.colors.black);
  doc.text("Nettobetrag:", totalsX, y);
  doc.text(formatCurrencyDE(invoiceData.total), totalsValueX, y, { align: "right" });
  y += 6;

  doc.setDrawColor(...cfg.colors.primary);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y - 2, totalsValueX, y - 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Gesamtbetrag:", totalsX, y + 4);
  doc.text(formatCurrencyDE(invoiceData.total), totalsValueX, y + 4, { align: "right" });
  y += 14;

  // --- Kleinunternehmer Notice ---
  doc.setFontSize(cfg.fonts.smallSize);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...cfg.colors.secondary);
  doc.text(cfg.kleinunternehmerHinweis, cfg.margin.left, y);
  y += 10;

  // --- Hinweise ---
  if (invoiceData.hinweise && invoiceData.hinweise.trim()) {
    doc.setFontSize(cfg.fonts.normalSize);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...cfg.colors.primary);
    doc.text("Hinweise:", cfg.margin.left, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...cfg.colors.black);
    const hinweisLines = doc.splitTextToSize(
      invoiceData.hinweise,
      pageWidth - cfg.margin.left - cfg.margin.right
    );
    doc.text(hinweisLines, cfg.margin.left, y);
    y += hinweisLines.length * 5 + 8;
  }

  // --- Bank Details (footer area) ---
  // Check if we need a new page
  if (y > 250) {
    doc.addPage();
    y = cfg.margin.top;
  }

  doc.setDrawColor(...cfg.colors.secondary);
  doc.setLineWidth(0.3);
  doc.line(cfg.margin.left, y, pageWidth - cfg.margin.right, y);
  y += 6;

  doc.setFontSize(cfg.fonts.smallSize);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...cfg.colors.primary);
  doc.text("Bankverbindung:", cfg.margin.left, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...cfg.colors.secondary);
  doc.text(`Kontoinhaber: ${cfg.company.bankName}`, cfg.margin.left, y);
  y += 4;
  doc.text(`IBAN: ${cfg.company.iban}`, cfg.margin.left, y);
  y += 4;
  doc.text(`Steuer-Nr.: ${cfg.company.steuerNr}`, cfg.margin.left, y);

  return doc;
}

/**
 * Download invoice as PDF
 */
function downloadInvoicePDF(invoiceData) {
  const doc = generateInvoicePDF(invoiceData);
  doc.save(`Rechnung_${invoiceData.invoiceNumber}.pdf`);
}

// --- Formatting Helpers ---

function formatCurrencyDE(value) {
  const num = parseFloat(value) || 0;
  return num.toFixed(2).replace(".", ",") + " €";
}

function formatDateDE(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}
