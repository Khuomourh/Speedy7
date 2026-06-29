require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Add it in Railway variables.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

function createRequestCode() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(100 + Math.random() * 900);
  return `S7-${timestamp}-${random}`;
}

function cleanPhoneNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function extractWhatsAppText(body) {
  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) return null;

    return {
      from: message.from,
      messageId: message.id,
      type: message.type,
      text: message.text?.body || "",
      timestamp: message.timestamp
    };
  } catch {
    return null;
  }
}

function parsePartRequest(text) {
  const clean = String(text || "").trim();

  return {
    part_needed: clean,
    notes: clean,
    urgency: clean.toLowerCase().includes("urgent") ? "URGENT" : "NORMAL"
  };
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      whatsapp_number TEXT UNIQUE,
      name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS part_requests (
      id SERIAL PRIMARY KEY,
      request_code TEXT UNIQUE,
      customer_id INTEGER REFERENCES customers(id),
      whatsapp_number TEXT,
      customer_name TEXT,
      vehicle_make TEXT,
      vehicle_model TEXT,
      vehicle_year TEXT,
      vin TEXT,
      part_needed TEXT,
      location TEXT,
      urgency TEXT,
      notes TEXT,
      status TEXT DEFAULT 'NEW_REQUEST',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id SERIAL PRIMARY KEY,
      request_id INTEGER REFERENCES part_requests(id),
      supplier_name TEXT,
      part_price NUMERIC DEFAULT 0,
      runner_fee NUMERIC DEFAULT 0,
      delivery_fee NUMERIC DEFAULT 0,
      total_price NUMERIC DEFAULT 0,
      warranty TEXT,
      quote_status TEXT DEFAULT 'SENT',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      supplier_name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      location TEXT,
      specialty TEXT,
      reliability_score INTEGER DEFAULT 5,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      whatsapp_number TEXT UNIQUE NOT NULL,
      email TEXT,
      default_delivery_location TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id SERIAL PRIMARY KEY,
      whatsapp_number TEXT NOT NULL,
      nickname TEXT,
      vehicle_make TEXT,
      vehicle_model TEXT,
      vehicle_year TEXT,
      vin TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

app.get("/api", (req, res) => {
  res.json({
    app: "Speedy 7 Parts Runner Backend",
    status: "running",
    database: "postgres",
    message: "WhatsApp-first backend is active"
  });
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      database: "postgres connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      database: "postgres failed",
      error: error.message
    });
  }
});

app.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("WhatsApp webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook/whatsapp", async (req, res) => {
  try {
    const incoming = extractWhatsAppText(req.body);

    if (!incoming) {
      return res.sendStatus(200);
    }

    const parsed = parsePartRequest(incoming.text);
    const requestCode = createRequestCode();

    await pool.query(
      `
      INSERT INTO customers (whatsapp_number, name)
      VALUES ($1, $2)
      ON CONFLICT (whatsapp_number)
      DO NOTHING
      `,
      [incoming.from, "WhatsApp Customer"]
    );

    const customerResult = await pool.query(
      `SELECT id FROM customers WHERE whatsapp_number = $1`,
      [incoming.from]
    );

    const customerId = customerResult.rows[0]?.id || null;

    await pool.query(
      `
      INSERT INTO part_requests (
        request_code,
        customer_id,
        whatsapp_number,
        customer_name,
        part_needed,
        urgency,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        requestCode,
        customerId,
        incoming.from,
        "WhatsApp Customer",
        parsed.part_needed,
        parsed.urgency,
        parsed.notes
      ]
    );

    console.log(`New WhatsApp request created: ${requestCode}`);
    return res.sendStatus(200);
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return res.sendStatus(200);
  }
});

app.post("/api/requests", async (req, res) => {
  try {
    const {
      whatsapp_number,
      customer_name,
      vehicle_make,
      vehicle_model,
      vehicle_year,
      vin,
      part_needed,
      location,
      urgency,
      notes
    } = req.body;

    const whatsappNumber = cleanPhoneNumber(whatsapp_number);

    if (!whatsappNumber || !part_needed) {
      return res.status(400).json({
        error: "whatsapp_number and part_needed are required"
      });
    }

    const requestCode = createRequestCode();

    await pool.query(
      `
      INSERT INTO customers (whatsapp_number, name)
      VALUES ($1, $2)
      ON CONFLICT (whatsapp_number)
      DO UPDATE SET name = EXCLUDED.name
      `,
      [whatsappNumber, customer_name || "Customer"]
    );

    const customerResult = await pool.query(
      `SELECT id FROM customers WHERE whatsapp_number = $1`,
      [whatsappNumber]
    );

    const customerId = customerResult.rows[0]?.id || null;

    const result = await pool.query(
      `
      INSERT INTO part_requests (
        request_code,
        customer_id,
        whatsapp_number,
        customer_name,
        vehicle_make,
        vehicle_model,
        vehicle_year,
        vin,
        part_needed,
        location,
        urgency,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, request_code
      `,
      [
        requestCode,
        customerId,
        whatsappNumber,
        customer_name || "Customer",
        vehicle_make || "",
        vehicle_model || "",
        vehicle_year || "",
        vin || "",
        part_needed,
        location || "",
        urgency || "NORMAL",
        notes || ""
      ]
    );

    res.status(201).json({
      message: "Part request created",
      request_id: result.rows[0].id,
      request_code: result.rows[0].request_code
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/requests", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM part_requests
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/requests/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }

    await pool.query(
      `
      UPDATE part_requests
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [status, id]
    );

    res.json({
      message: "Request status updated",
      request_id: id,
      status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/quotes", async (req, res) => {
  try {
    const {
      request_id,
      supplier_name,
      part_price,
      runner_fee,
      delivery_fee,
      warranty
    } = req.body;

    if (!request_id || !supplier_name || part_price === undefined) {
      return res.status(400).json({
        error: "request_id, supplier_name and part_price are required"
      });
    }

    const totalPrice =
      Number(part_price || 0) +
      Number(runner_fee || 0) +
      Number(delivery_fee || 0);

    const result = await pool.query(
      `
      INSERT INTO quotes (
        request_id,
        supplier_name,
        part_price,
        runner_fee,
        delivery_fee,
        total_price,
        warranty
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
      `,
      [
        request_id,
        supplier_name,
        part_price,
        runner_fee || 0,
        delivery_fee || 0,
        totalPrice,
        warranty || ""
      ]
    );

    await pool.query(
      `
      UPDATE part_requests
      SET status = 'QUOTE_SENT', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [request_id]
    );

    res.status(201).json({
      message: "Quote created",
      quote_id: result.rows[0].id,
      request_id,
      total_price: totalPrice
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/quotes/:request_id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM quotes
      WHERE request_id = $1
      ORDER BY created_at DESC
      `,
      [req.params.request_id]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/suppliers", async (req, res) => {
  try {
    const {
      supplier_name,
      contact_person,
      phone,
      location,
      specialty,
      reliability_score,
      notes
    } = req.body;

    if (!supplier_name) {
      return res.status(400).json({ error: "supplier_name is required" });
    }

    const result = await pool.query(
      `
      INSERT INTO suppliers (
        supplier_name,
        contact_person,
        phone,
        location,
        specialty,
        reliability_score,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
      `,
      [
        supplier_name,
        contact_person || "",
        phone || "",
        location || "",
        specialty || "",
        reliability_score || 5,
        notes || ""
      ]
    );

    res.status(201).json({
      message: "Supplier added",
      supplier_id: result.rows[0].id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/suppliers", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM suppliers
      ORDER BY supplier_name ASC
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/app/signup", async (req, res) => {
  try {
    const fullName = String(req.body.full_name || "").trim();
    const whatsappNumber = cleanPhoneNumber(req.body.whatsapp_number);
    const email = String(req.body.email || "").trim();
    const defaultDeliveryLocation = String(req.body.default_delivery_location || "").trim();

    if (!fullName || !whatsappNumber) {
      return res.status(400).json({
        error: "full_name and whatsapp_number are required"
      });
    }

    await pool.query(
      `
      INSERT INTO app_users (
        full_name,
        whatsapp_number,
        email,
        default_delivery_location
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (whatsapp_number)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        default_delivery_location = EXCLUDED.default_delivery_location,
        updated_at = CURRENT_TIMESTAMP
      `,
      [fullName, whatsappNumber, email, defaultDeliveryLocation]
    );

    await pool.query(
      `
      INSERT INTO customers (whatsapp_number, name)
      VALUES ($1, $2)
      ON CONFLICT (whatsapp_number)
      DO UPDATE SET name = EXCLUDED.name
      `,
      [whatsappNumber, fullName]
    );

    res.status(201).json({
      message: "Customer profile saved",
      profile: {
        full_name: fullName,
        whatsapp_number: whatsappNumber,
        email,
        default_delivery_location: defaultDeliveryLocation
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/app/profile/:whatsapp_number", async (req, res) => {
  try {
    const whatsappNumber = cleanPhoneNumber(req.params.whatsapp_number);

    const result = await pool.query(
      `
      SELECT *
      FROM app_users
      WHERE whatsapp_number = $1
      `,
      [whatsappNumber]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/app/vehicles", async (req, res) => {
  try {
    const whatsappNumber = cleanPhoneNumber(req.body.whatsapp_number);
    const nickname = String(req.body.nickname || "").trim();
    const vehicleMake = String(req.body.vehicle_make || "").trim();
    const vehicleModel = String(req.body.vehicle_model || "").trim();
    const vehicleYear = String(req.body.vehicle_year || "").trim();
    const vin = String(req.body.vin || "").trim();

    if (!whatsappNumber || !vehicleMake || !vehicleModel) {
      return res.status(400).json({
        error: "whatsapp_number, vehicle_make and vehicle_model are required"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO vehicles (
        whatsapp_number,
        nickname,
        vehicle_make,
        vehicle_model,
        vehicle_year,
        vin
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
      `,
      [whatsappNumber, nickname, vehicleMake, vehicleModel, vehicleYear, vin]
    );

    res.status(201).json({
      message: "Vehicle saved",
      vehicle_id: result.rows[0].id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/app/vehicles/:whatsapp_number", async (req, res) => {
  try {
    const whatsappNumber = cleanPhoneNumber(req.params.whatsapp_number);

    const result = await pool.query(
      `
      SELECT *
      FROM vehicles
      WHERE whatsapp_number = $1
      ORDER BY created_at DESC
      `,
      [whatsappNumber]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/app/part-request", async (req, res) => {
  try {
    const whatsappNumber = cleanPhoneNumber(req.body.whatsapp_number);
    const customerName = String(req.body.customer_name || "Customer").trim();
    const vehicleMake = String(req.body.vehicle_make || "").trim();
    const vehicleModel = String(req.body.vehicle_model || "").trim();
    const vehicleYear = String(req.body.vehicle_year || "").trim();
    const vin = String(req.body.vin || "").trim();
    const partNeeded = String(req.body.part_needed || "").trim();
    const location = String(req.body.location || "").trim();
    const urgency = String(req.body.urgency || "NORMAL").trim();
    const notes = String(req.body.notes || "").trim();

    if (!whatsappNumber || !partNeeded) {
      return res.status(400).json({
        error: "whatsapp_number and part_needed are required"
      });
    }

    const requestCode = createRequestCode();

    await pool.query(
      `
      INSERT INTO customers (whatsapp_number, name)
      VALUES ($1, $2)
      ON CONFLICT (whatsapp_number)
      DO UPDATE SET name = EXCLUDED.name
      `,
      [whatsappNumber, customerName]
    );

    const customerResult = await pool.query(
      `SELECT id FROM customers WHERE whatsapp_number = $1`,
      [whatsappNumber]
    );

    const customerId = customerResult.rows[0]?.id || null;

    const result = await pool.query(
      `
      INSERT INTO part_requests (
        request_code,
        customer_id,
        whatsapp_number,
        customer_name,
        vehicle_make,
        vehicle_model,
        vehicle_year,
        vin,
        part_needed,
        location,
        urgency,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, request_code
      `,
      [
        requestCode,
        customerId,
        whatsappNumber,
        customerName,
        vehicleMake,
        vehicleModel,
        vehicleYear,
        vin,
        partNeeded,
        location,
        urgency,
        notes
      ]
    );

    res.status(201).json({
      message: "Part request submitted",
      request_id: result.rows[0].id,
      request_code: result.rows[0].request_code
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/app/requests/:whatsapp_number", async (req, res) => {
  try {
    const whatsappNumber = cleanPhoneNumber(req.params.whatsapp_number);

    const result = await pool.query(
      `
      SELECT *
      FROM part_requests
      WHERE whatsapp_number = $1
      ORDER BY created_at DESC
      `,
      [whatsappNumber]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Speedy 7 backend running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
