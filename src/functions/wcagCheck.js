// wcagCheck.js
// Diese Datei stellt zwei Endpunkte zur Verfügung:
// 1. "wcagCheck": Lädt die angegebene Webseite mit Playwright, führt mit axe-core eine WCAG-Prüfung durch
//    und liefert die Ergebnisse (Violations, Passes, etc.) als JSON zurück.
// 2. "generateAltTexts": Sucht in den axe-Ergebnissen nach "image-alt"-Verstößen, extrahiert die <img>-Elemente,
//    verarbeitet die zugehörigen Bilder (Resize, Konvertierung) und ruft ein Captioning-Modell (Blip) auf, um Alt‑Texte zu generieren.

const { app } = require('@azure/functions');
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const axios = require('axios');
const { JSDOM } = require('jsdom');
const sharp = require('sharp');

// Wir verwenden hier ein alternatives Captioning-Modell, das bessere Ergebnisse liefert und kleiner ist als manche Varianten.
const MODEL_URL = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";

// Hilfsfunktion zur Ergänzung des Protokolls, falls nötig
function ensureUrlProtocol(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

// Endpoint "wcagCheck": Führt die Accessibility-Prüfung der angegebenen URL durch.
app.http('wcagCheck', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    // Preflight-Handling (CORS)
    if (request.method === 'OPTIONS') {
      return {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: ''
      };
    }
    context.log(`Processing request: ${request.url}`);
    // URL aus Query oder Body extrahieren
    let url = request.query.get('url') ||
              (request.body && (typeof request.body === 'object' ? request.body.url : request.body));
    if (!url) {
      return {
        status: 400,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
        body: 'Bitte gib eine URL an.'
      };
    }
    // Protokoll hinzufügen, falls nicht vorhanden
    url = ensureUrlProtocol(url);
    let browser;
    try {
      browser = await chromium.launch();
      const page = await (await browser.newContext()).newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      // Führe die axe-core-Prüfung durch und sammle Ergebnisse (Violations, Passes, etc.)
      const results = await new AxeBuilder({ page })
        .options({
          reporter: "v2",
          performanceTimer: true,
          resultTypes: ["violations", "inapplicable", "passes"]
        })
        .analyze();
      context.log("WCAG-Ergebnisse:", results);
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(results)
      };
    } catch (error) {
      context.log("Fehler bei der WCAG-Prüfung:", error);
      return {
        status: 500,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
        body: error.message
      };
    } finally {
      if (browser) await browser.close();
    }
  }
});

// Endpoint "generateAltTexts": Generiert automatisch Alt-Texte für Bilder mit fehlendem Alt-Attribut.
app.http('generateAltTexts', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    // Extrahiere die URL
    let url = request.query.get('url') ||
              (request.body && (typeof request.body === 'object' ? request.body.url : request.body));
    if (!url) {
      return {
        status: 400,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
        body: 'Bitte gib eine URL an.'
      };
    }
    // Protokoll hinzufügen, falls nicht vorhanden
    url = ensureUrlProtocol(url);
    let browser;
    try {
      browser = await chromium.launch();
      const page = await (await browser.newContext()).newPage();
      await page.goto(url, { waitUntil: 'networkidle' });

      // Erhalte ausschließlich "image-alt"-Verstöße aus den axe-Ergebnissen.
      const results = await new AxeBuilder({ page })
        .options({ reporter: "v2", resultTypes: ["violations"] })
        .analyze();
      const imageAltViolation = results.violations.find(v => v.id === 'image-alt');
      let altTextResults = [];

      if (imageAltViolation) {
        // Für jeden Knoten, der einen image-alt-Verstoß aufweist:
        for (const node of imageAltViolation.nodes) {
          context.log("Extrahiertes Node HTML:", node.html);
          const dom = new JSDOM(node.html);
          const img = dom.window.document.querySelector('img');
          if (img) {
            context.log("Gefundenes img-Element:", img.outerHTML);
            let imageUrl = img.getAttribute('src');
            context.log("Initial extrahierte URL:", imageUrl);
            if (imageUrl && !imageUrl.startsWith('http')) {
              imageUrl = new URL(imageUrl, url).href;
              context.log("Absolutierte URL:", imageUrl);
            }
            if (imageUrl) {
              const altText = await generateAltText(imageUrl, context);
              altTextResults.push({
                imageUrl,
                altText,
                failureSummary: node.failureSummary
              });
            } else {
              context.log("Kein gültiger Bild-URL gefunden.");
            }
          } else {
            context.log("Kein img-Element im Node HTML gefunden.");
          }
        }
      }
      context.log("Finale Alt-Text-Ergebnisse:", JSON.stringify(altTextResults, null, 2));
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(altTextResults)
      };
    } catch (error) {
      context.log("Fehler bei der Alt-Text Generierung:", error);
      return {
        status: 500,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
        body: error.message
      };
    } finally {
      if (browser) await browser.close();
    }
  }
});

// Funktion generateAltText: Lädt ein Bild, verarbeitet es (Resize und JPEG-Konvertierung) und ruft das Captioning-Modell auf.
// Überspringt animierte GIFs (mehr als 1 Frame).
async function generateAltText(imageUrl, context, retries = 3, delayMs = 5000) {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  try {
    // Bild herunterladen als Arraybuffer
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      validateStatus: status => status >= 200 && status < 400
    });
    let contentType = (imageResponse.headers['content-type'] || '').split(';')[0];
    let imageBuffer = Buffer.from(imageResponse.data, 'binary');

    // Prüfe, ob es ein GIF ist und ob es animiert ist (mehr als ein Frame)
    if (contentType === 'image/gif' || imageUrl.toLowerCase().endsWith('.gif')) {
      const hexString = imageBuffer.toString('hex');
      const frameCount = (hexString.match(/21f904/gi) || []).length;
      if (frameCount >= 2) {
        context.log(`Animiertes GIF erkannt (Frames: ${frameCount}), Bild wird übersprungen: ${imageUrl}`);
        return null;
      } else {
        context.log(`Einzelnes GIF erkannt (Frames: ${frameCount}), Bild wird weiterverarbeitet: ${imageUrl}`);
      }
    }

    // Resize auf mindestens 224x224 und Konvertierung zu JPEG
    imageBuffer = await sharp(imageBuffer)
      .resize({ width: 224, height: 224, fit: 'inside' })
      .jpeg()
      .toBuffer();
    contentType = 'image/jpeg';

    // Logge einen gekürzten Base64-DataURI zur Diagnose
    const base64Image = imageBuffer.toString('base64');
    const dataURI = `data:${contentType};base64,${base64Image}`;
    context.log("Bild DataURI (gekürzt):", dataURI.substring(0, 100) + "...");

    // Sende das verarbeitete Bild an das Captioning-Modell
    const response = await axios.post(
      MODEL_URL,
      imageBuffer,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': contentType
        }
      }
    );
    if (response.status === 200 && Array.isArray(response.data)) {
      const altText = response.data[0]?.generated_text || "Kein Alt-Text generiert";
      context.log(`Erhaltener Alt-Text für ${imageUrl}: "${altText}"`);
      return altText;
    } else {
      return "Fehler bei der Generierung";
    }
  } catch (error) {
    if (error.response && error.response.status === 503 && retries > 0) {
      context.log(`503 erhalten – retry in ${delayMs} ms (Verbleibende Versuche: ${retries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return generateAltText(imageUrl, context, retries - 1, delayMs * 2);
    } else {
      context.log("Fehler bei der Huggingface API:", error);
      return "API Fehler";
    }
  }
}
