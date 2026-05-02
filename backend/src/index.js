export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method === "POST") {
      try {
        const url = new URL(request.url);
        
        // Only accept requests to /submit or the root
        if (url.pathname !== "/submit" && url.pathname !== "/") {
          return new Response("Not Found", { status: 404 });
        }

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
            return new Response(JSON.stringify({ success: false, error: "Email error: " + errText }), {
              headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
              status: 500
            });
          }

          // 2. Send confirmation to customer (if email provided)
          if (data.email) {
            const customerEmailResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.RESEND_API_KEY}`
              },
              body: JSON.stringify({
                from: 'S&E Clean <info@se-clean.de>',
                to: data.email,
                subject: `Eingangsbestätigung Ihrer Anfrage bei S&E Clean`,
                html: `
                  <h2>Vielen Dank für Ihre Anfrage!</h2>
                  <p>Hallo ${data.name || ''},</p>
                  <p>wir haben Ihre Kontaktanfrage erfolgreich erhalten und werden uns schnellstmöglich bei Ihnen melden.</p>
                  <p><strong>Ihre übermittelten Daten:</strong></p>
                  <p>Telefon: ${data.phone || 'Nicht angegeben'}</p>
                  <p>Nachricht:<br>${(data.message || '').replace(/\n/g, '<br>')}</p>
                  <br>
                  <p>Mit freundlichen Grüßen<br>Ihr S&E Clean Team</p>
                  <p><a href="https://www.se-clean.de">www.se-clean.de</a></p>
                `
              })
            });
            
            if (!customerEmailResponse.ok) {
               console.error("Failed to send customer confirmation:", await customerEmailResponse.text());
            }
          }

          console.log("Emails processed successfully!");
        } else {
          console.warn("RESEND_API_KEY is not set. Email not sent. Received data:", data);
        }

        // Return a successful response
        return new Response(JSON.stringify({ 
          success: true, 
          message: "Vielen Dank für Ihre Anfrage! Wir werden uns in Kürze bei Ihnen melden." 
        }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          status: 200,
        });

      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: "Bad Request" }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          status: 400,
        });
      }
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
