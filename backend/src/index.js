// =============================================================================
// S&E Clean Backend — Cloudflare Worker
// Handles: Contact form submissions + Invoice management (internal)
// =============================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- CORS Preflight ---
    if (request.method === "OPTIONS") {
      return corsResponse(null, 204);
    }

    // --- Route Matching ---
    try {
      // Contact form submission (existing)
      if (request.method === "POST" && (path === "/submit" || path === "/")) {
        return await handleContactSubmit(request, env);
      }

      // Invoice API routes
      if (path.startsWith("/api/invoices")) {
        return await handleInvoiceRoutes(request, env, path);
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("Unhandled error:", error);
      return corsJson({ success: false, error: "Interner Serverfehler. Bitte versuchen Sie es später erneut." }, 500);
    }
  },
};

// =============================================================================
// Invoice Route Handler
// =============================================================================

async function handleInvoiceRoutes(request, env, path) {
  const method = request.method;

  // Ensure KV binding exists
  if (!env.INVOICES) {
    return corsJson({ success: false, error: "Speicher nicht konfiguriert. Bitte KV-Namespace einrichten." }, 500);
  }

  // GET /api/invoices/next-number — Get next auto-increment invoice number
  if (method === "GET" && path === "/api/invoices/next-number") {
    return await getNextInvoiceNumber(env);
  }

  // GET /api/invoices — List all invoices
  if (method === "GET" && path === "/api/invoices") {
    return await listInvoices(env);
  }

  // POST /api/invoices — Create a new invoice
  if (method === "POST" && path === "/api/invoices") {
    return await createInvoice(request, env);
  }

  // GET /api/invoices/:number — Get invoice by number
  const getMatch = path.match(/^\/api\/invoices\/([^/]+)$/);
  if (method === "GET" && getMatch) {
    return await getInvoice(env, decodeURIComponent(getMatch[1]));
  }

  // PUT /api/invoices/:number — Edit invoice (create new version)
  const putMatch = path.match(/^\/api\/invoices\/([^/]+)$/);
  if (method === "PUT" && putMatch) {
    return await editInvoice(request, env, decodeURIComponent(putMatch[1]));
  }

  return corsJson({ success: false, error: "Route nicht gefunden." }, 404);
}

// =============================================================================
// Invoice Handlers
// =============================================================================

/**
 * Get next invoice number in format YYYY-NNN
 */
async function getNextInvoiceNumber(env) {
  const currentYear = new Date().getFullYear().toString();
  const counterKey = `invoice:counter:${currentYear}`;

  let counter = parseInt(await env.INVOICES.get(counterKey) || "0", 10);
  counter += 1;

  const invoiceNumber = `${currentYear}-${String(counter).padStart(3, "0")}`;

  return corsJson({ success: true, invoiceNumber, counter });
}

/**
 * List all invoices (summary only)
 */
async function listInvoices(env) {
  const indexRaw = await env.INVOICES.get("invoice:index");
  const index = indexRaw ? JSON.parse(indexRaw) : [];

  // Fetch summary of each invoice
  const summaries = [];
  for (const invoiceNumber of index) {
    const data = await env.INVOICES.get(`invoice:${invoiceNumber}`);
    if (data) {
      const parsed = JSON.parse(data);
      const latestVersion = parsed.versions[parsed.versions.length - 1];
      summaries.push({
        invoiceNumber: parsed.invoiceNumber,
        customerName: latestVersion.customer.name,
        date: latestVersion.date,
        total: latestVersion.total,
        versionCount: parsed.versions.length,
        createdAt: parsed.versions[0].createdAt,
        lastModified: latestVersion.createdAt,
      });
    }
  }

  return corsJson({ success: true, invoices: summaries });
}

/**
 * Create a new invoice
 */
async function createInvoice(request, env) {
  const data = await parseRequestBody(request);
  if (!data) {
    return corsJson({ success: false, error: "Ungültige Anfrage. Bitte senden Sie gültiges JSON." }, 400);
  }

  // Validate required fields
  const validation = validateInvoiceData(data);
  if (!validation.valid) {
    return corsJson({ success: false, error: validation.error, field: validation.field }, 400);
  }

  // Generate invoice number atomically
  const currentYear = new Date().getFullYear().toString();
  const counterKey = `invoice:counter:${currentYear}`;

  let counter = parseInt(await env.INVOICES.get(counterKey) || "0", 10);
  counter += 1;

  const invoiceNumber = `${currentYear}-${String(counter).padStart(3, "0")}`;

  // Build invoice object
  const invoice = {
    invoiceNumber,
    versions: [
      {
        version: 1,
        createdAt: new Date().toISOString(),
        customer: data.customer,
        company: data.company,
        date: data.date,
        leistungen: data.leistungen,
        hinweise: data.hinweise || "",
        subtotal: data.subtotal,
        total: data.total,
      },
    ],
  };

  // Save invoice
  await env.INVOICES.put(`invoice:${invoiceNumber}`, JSON.stringify(invoice));

  // Update counter
  await env.INVOICES.put(counterKey, counter.toString());

  // Update index
  const indexRaw = await env.INVOICES.get("invoice:index");
  const index = indexRaw ? JSON.parse(indexRaw) : [];
  index.push(invoiceNumber);
  await env.INVOICES.put("invoice:index", JSON.stringify(index));

  return corsJson({
    success: true,
    message: `Rechnung ${invoiceNumber} wurde erfolgreich erstellt.`,
    invoiceNumber,
    invoice: invoice.versions[0],
  }, 201);
}

/**
 * Get invoice by number (all versions)
 */
async function getInvoice(env, invoiceNumber) {
  const data = await env.INVOICES.get(`invoice:${invoiceNumber}`);
  if (!data) {
    return corsJson({ success: false, error: `Rechnung ${invoiceNumber} wurde nicht gefunden.` }, 404);
  }

  return corsJson({ success: true, invoice: JSON.parse(data) });
}

/**
 * Edit invoice — creates a new version, never overwrites
 */
async function editInvoice(request, env, invoiceNumber) {
  const data = await parseRequestBody(request);
  if (!data) {
    return corsJson({ success: false, error: "Ungültige Anfrage. Bitte senden Sie gültiges JSON." }, 400);
  }

  // Validate required fields
  const validation = validateInvoiceData(data);
  if (!validation.valid) {
    return corsJson({ success: false, error: validation.error, field: validation.field }, 400);
  }

  // Fetch existing invoice
  const existingRaw = await env.INVOICES.get(`invoice:${invoiceNumber}`);
  if (!existingRaw) {
    return corsJson({ success: false, error: `Rechnung ${invoiceNumber} wurde nicht gefunden.` }, 404);
  }

  const existing = JSON.parse(existingRaw);
  const newVersion = existing.versions.length + 1;

  // Add new version
  existing.versions.push({
    version: newVersion,
    createdAt: new Date().toISOString(),
    customer: data.customer,
    company: data.company,
    date: data.date,
    leistungen: data.leistungen,
    hinweise: data.hinweise || "",
    subtotal: data.subtotal,
    total: data.total,
  });

  // Save updated invoice
  await env.INVOICES.put(`invoice:${invoiceNumber}`, JSON.stringify(existing));

  return corsJson({
    success: true,
    message: `Rechnung ${invoiceNumber} wurde aktualisiert (Version ${newVersion}).`,
    invoiceNumber,
    version: newVersion,
    invoice: existing.versions[newVersion - 1],
  });
}

// =============================================================================
// Contact Form Handler (existing, preserved)
// =============================================================================

async function handleContactSubmit(request, env) {
  // Try to parse the body as JSON or Form Data
  let data = {};
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    data = await request.json();
  } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }
  } else {
    return new Response("Unsupported content type", { status: 415 });
  }

  // Send email using Resend API
  if (env.RESEND_API_KEY) {
    // 1. Send notification to owner
    const ownerEmailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'S&E Clean Kontakt <info@se-clean.de>',
        to: 'info@se-clean.de',
        reply_to: data.email || 'info@se-clean.de',
        subject: `Neue Kontaktanfrage von ${data.name || 'Unbekannt'}`,
        html: `
          <h2>Neue Kontaktanfrage von der Webseite</h2>
          <p><strong>Name:</strong> ${data.name || 'Nicht angegeben'}</p>
          <p><strong>Telefonnummer:</strong> ${data.phone || 'Nicht angegeben'}</p>
          <p><strong>E-Mail:</strong> ${data.email || 'Nicht angegeben'}</p>
          <p><strong>Nachricht:</strong><br>${(data.message || '').replace(/\n/g, '<br>')}</p>
        `
      })
    });

    if (!ownerEmailResponse.ok) {
      const errText = await ownerEmailResponse.text();
      console.error("Failed to send owner email:", errText);
      return corsJson({ success: false, error: "Email error: " + errText }, 500);
    }

    console.log("Emails processed successfully!");
  } else {
    console.warn("RESEND_API_KEY is not set. Email not sent. Received data:", data);
  }

  return corsJson({
    success: true,
    message: "Vielen Dank für Ihre Anfrage! Wir werden uns in Kürze bei Ihnen melden."
  });
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Parse request body (JSON or form data)
 */
async function parseRequestBody(request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await request.json();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate invoice data
 */
function validateInvoiceData(data) {
  if (!data.customer || typeof data.customer !== "object") {
    return { valid: false, error: "Kundendaten sind erforderlich.", field: "customer" };
  }
  if (!data.customer.name || !data.customer.name.trim()) {
    return { valid: false, error: "Kundenname ist erforderlich.", field: "customer.name" };
  }
  if (!data.customer.address || !data.customer.address.trim()) {
    return { valid: false, error: "Kundenadresse ist erforderlich.", field: "customer.address" };
  }
  if (!data.date) {
    return { valid: false, error: "Rechnungsdatum ist erforderlich.", field: "date" };
  }
  if (!data.leistungen || !Array.isArray(data.leistungen) || data.leistungen.length === 0) {
    return { valid: false, error: "Mindestens eine Leistung ist erforderlich.", field: "leistungen" };
  }

  for (let i = 0; i < data.leistungen.length; i++) {
    const l = data.leistungen[i];
    if (!l.beschreibung || !l.beschreibung.trim()) {
      return { valid: false, error: `Leistung ${i + 1}: Beschreibung ist erforderlich.`, field: `leistungen[${i}].beschreibung` };
    }
    if (l.einzelpreis === undefined || l.einzelpreis === null || isNaN(parseFloat(l.einzelpreis))) {
      return { valid: false, error: `Leistung ${i + 1}: Stundensatz ist erforderlich.`, field: `leistungen[${i}].einzelpreis` };
    }
  }

  if (data.total === undefined || data.total === null) {
    return { valid: false, error: "Gesamtbetrag ist erforderlich.", field: "total" };
  }

  return { valid: true };
}

/**
 * CORS-enabled JSON response
 */
function corsJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/**
 * CORS-enabled empty response (for preflight)
 */
function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
