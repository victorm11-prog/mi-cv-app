const express = require("express");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(cors());

// ─── CONFIGURACIÓN ───────────────────────────────────────────────
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const BASE_URL = process.env.BASE_URL || "https://mi-cv-app-production.up.railway.app";

const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });

// Tokens de descarga válidos (en producción usaría una base de datos)
const tokensValidos = new Set();

// ─── CREAR PREFERENCIA DE PAGO ───────────────────────────────────
app.post("/crear-preferencia", async (req, res) => {
  const { plan } = req.body; // 0 = solo CV, 1 = CV + carta

  const items = plan === 1
    ? [{ title: "CV + Carta de presentación", quantity: 1, unit_price: 1500, currency_id: "ARS" }]
    : [{ title: "CV Profesional", quantity: 1, unit_price: 800, currency_id: "ARS" }];

  try {
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items,
        back_urls: {
          success: `${BASE_URL}/pago-exitoso`,
          failure: `${BASE_URL}/pago-fallido`,
          pending: `${BASE_URL}/pago-pendiente`,
        },
        auto_return: "approved",
        notification_url: `${BASE_URL}/webhook`,
      },
    });

    res.json({ init_point: result.init_point, id: result.id });
  } catch (error) {
    console.error("Error creando preferencia:", error);
    res.status(500).json({ error: "No se pudo crear la preferencia de pago" });
  }
});

// ─── WEBHOOK (MercadoPago avisa que se recibió un pago) ───────────
app.post("/webhook", async (req, res) => {
  const { type, data } = req.body;

  if (type === "payment") {
    try {
      const payment = new Payment(client);
      const pagoInfo = await payment.get({ id: data.id });

      if (pagoInfo.status === "approved") {
        // Generar token único de descarga
        const token = crypto.randomBytes(24).toString("hex");
        tokensValidos.add(token);

        // El token expira en 1 hora
        setTimeout(() => tokensValidos.delete(token), 60 * 60 * 1000);

        console.log(`Pago aprobado. Token generado: ${token}`);
      }
    } catch (error) {
      console.error("Error procesando webhook:", error);
    }
  }

  res.sendStatus(200);
});

// ─── VALIDAR TOKEN DE DESCARGA ────────────────────────────────────
app.get("/validar-token", (req, res) => {
  const { token } = req.query;
  if (tokensValidos.has(token)) {
    tokensValidos.delete(token); // Uso único
    res.json({ valido: true });
  } else {
    res.json({ valido: false });
  }
});

// ─── PÁGINAS DE RESULTADO ─────────────────────────────────────────
app.get("/pago-exitoso", (req, res) => {
  res.send(`
    <html><head><meta charset="UTF-8">
    <script>
      // Redirigir al CV app con señal de pago aprobado
      window.location.href = "/?pago=ok&plan=" + (new URLSearchParams(window.location.search).get('plan') || '1');
    </script>
    </head><body>Procesando pago...</body></html>
  `);
});

app.get("/pago-fallido", (req, res) => {
  res.send(`<html><head><meta charset="UTF-8"><script>window.location.href = "/?pago=error";</script></head><body>Redirigiendo...</body></html>`);
});

app.get("/pago-pendiente", (req, res) => {
  res.send(`<html><head><meta charset="UTF-8"><script>window.location.href = "/?pago=pendiente";</script></head><body>Redirigiendo...</body></html>`);
});

// ─── SERVIDOR ─────────────────────────────────────────────────────
const path = require("path");
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "generador_cv_pro.html"));
});
