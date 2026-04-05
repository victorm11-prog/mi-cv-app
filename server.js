const express = require("express");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const BASE_URL = process.env.BASE_URL || "https://mi-cv-app-production.up.railway.app";
const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });
const tokensValidos = new Set();

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "generador_cv_pro.html"));
});

app.post("/crear-preferencia", async (req, res) => {
  const { plan } = req.body;
  const items = plan === 1
    ? [{ title: "CV + Carta de presentación", quantity: 1, unit_price: 1500, currency_id: "ARS" }]
    : [{ title: "CV Profesional", quantity: 1, unit_price: 800, currency_id: "ARS" }];
  try {
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items,
        back_urls: {
          success: `${BASE_URL}/?pago=ok`,
          failure: `${BASE_URL}/?pago=error`,
          pending: `${BASE_URL}/?pago=pendiente`,
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

app.post("/webhook", async (req, res) => {
  const { type, data } = req.body;
  if (type === "payment") {
    try {
      const payment = new Payment(client);
      const pagoInfo = await payment.get({ id: data.id });
      if (pagoInfo.status === "approved") {
        const token = crypto.randomBytes(24).toString("hex");
        tokensValidos.add(token);
        setTimeout(() => tokensValidos.delete(token), 60 * 60 * 1000);
      }
    } catch (error) {
      console.error("Error en webhook:", error);
    }
  }
  res.sendStatus(200);
});

app.get("/validar-token", (req, res) => {
  const { token } = req.query;
  if (tokensValidos.has(token)) {
    tokensValidos.delete(token);
    res.json({ valido: true });
  } else {
    res.json({ valido: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
