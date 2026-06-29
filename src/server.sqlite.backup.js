require("dotenv").config();

const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

const DB_PATH = process.env.DB_PATH || "./data/speedy7.db";
const DB_DIR = path.dirname(DB_PATH);

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      whatsapp_number TEXT UNIQUE,
      name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS part_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_code TEXT UNIQUE,
      customer_id INTEGER,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER,
      supplier_name TEXT,
      part_price REAL,
      runner_fee REAL,
      delivery_fee REAL,
      total_price REAL,
      warranty TEXT,
      quote_status TEXT DEFAULT 'SENT',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(request_id) REFERENCES part_requests(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      location TEXT,
      specialty TEXT,
      reliability_score INTEGER DEFAULT 5,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function createRequestCode() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(100 + Math.random() * 900);
  return `S7-${timestamp}-${random}`;
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
  } catch (error) {
    return null;
  }
}

function parsePartRequest(text) {
  const clean = text.trim();

  return {
    part_needed: clean,
    notes: clean,
    urgency: clean.toLowerCase().includes("urgent") ? "URGENT" : "NORMAL"
  };
}

app.get("/", (req, res) => {
  res.json({
    app: "Speedy 7 Parts Runner Backend",
    status: "running",
    message: "WhatsApp-first backend is active"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    database: "connected",
    timestamp: new Date().toISOString()
  });
});

/**
 * WhatsApp webhook verification endpoint
 * Meta will call this when connecting the WhatsApp Business API.
 */
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

/**
 * WhatsApp incoming message endpoint
 */
app.post("/webhook/whatsapp", (req, res) => {
  const incoming = extractWhatsAppText(req.body);

  if (!incoming) {
    return res.sendStatus(200);
  }

  const parsed = parsePartRequest(incoming.text);
  const requestCode = createRequestCode();

  db.run(
    `
    INSERT OR IGNORE INTO customers (whatsapp_number, name)
    VALUES (?, ?)
    `,
    [incoming.from, "WhatsApp Customer"],
    function () {
      db.get(
        `SELECT id FROM customers WHERE whatsapp_number = ?`,
        [incoming.from],
        (err, customer) => {
          if (err) {
            console.error(err);
            return;
          }

          db.run(
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
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
              requestCode,
              customer?.id || null,
              incoming.from,
              "WhatsApp Customer",
              parsed.part_needed,
              parsed.urgency,
              parsed.notes
            ],
            function (insertErr) {
              if (insertErr) {
                console.error(insertErr);
                return;
              }

              console.log(`New WhatsApp request created: ${requestCode}`);
            }
          );
        }
      );
    }
  );

  res.sendStatus(200);
});

/**
 * Manual test endpoint to create a part request without WhatsApp API.
 */
app.post("/api/requests", (req, res) => {
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

  if (!whatsapp_number || !part_needed) {
    return res.status(400).json({
      error: "whatsapp_number and part_needed are required"
    });
  }

  const requestCode = createRequestCode();

  db.run(
    `
    INSERT OR IGNORE INTO customers (whatsapp_number, name)
    VALUES (?, ?)
    `,
    [whatsapp_number, customer_name || "Customer"],
    function () {
      db.get(
        `SELECT id FROM customers WHERE whatsapp_number = ?`,
        [whatsapp_number],
        (err, customer) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          db.run(
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              requestCode,
              customer?.id || null,
              whatsapp_number,
              customer_name || "Customer",
              vehicle_make || "",
              vehicle_model || "",
              vehicle_year || "",
              vin || "",
              part_needed,
              location || "",
              urgency || "NORMAL",
              notes || ""
            ],
            function (insertErr) {
              if (insertErr) {
                return res.status(500).json({ error: insertErr.message });
              }

              res.status(201).json({
                message: "Part request created",
                request_id: this.lastID,
                request_code: requestCode
              });
            }
          );
        }
      );
    }
  );
});

app.get("/api/requests", (req, res) => {
  db.all(
    `
    SELECT *
    FROM part_requests
    ORDER BY created_at DESC
    `,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json(rows);
    }
  );
});

app.patch("/api/requests/:id/status", (req, res) => {
  const { status } = req.body;
  const { id } = req.params;

  if (!status) {
    return res.status(400).json({ error: "status is required" });
  }

  db.run(
    `
    UPDATE part_requests
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [status, id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json({
        message: "Request status updated",
        request_id: id,
        status
      });
    }
  );
});

app.post("/api/quotes", (req, res) => {
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

  const total_price =
    Number(part_price || 0) +
    Number(runner_fee || 0) +
    Number(delivery_fee || 0);

  db.run(
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
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      request_id,
      supplier_name,
      part_price,
      runner_fee || 0,
      delivery_fee || 0,
      total_price,
      warranty || ""
    ],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.run(
        `
        UPDATE part_requests
        SET status = 'QUOTE_SENT', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [request_id]
      );

      res.status(201).json({
        message: "Quote created",
        quote_id: this.lastID,
        request_id,
        total_price
      });
    }
  );
});

app.get("/api/quotes/:request_id", (req, res) => {
  db.all(
    `
    SELECT *
    FROM quotes
    WHERE request_id = ?
    ORDER BY created_at DESC
    `,
    [req.params.request_id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json(rows);
    }
  );
});

app.post("/api/suppliers", (req, res) => {
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

  db.run(
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
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      supplier_name,
      contact_person || "",
      phone || "",
      location || "",
      specialty || "",
      reliability_score || 5,
      notes || ""
    ],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.status(201).json({
        message: "Supplier added",
        supplier_id: this.lastID
      });
    }
  );
});

app.get("/api/suppliers", (req, res) => {
  db.all(
    `
    SELECT *
    FROM suppliers
    ORDER BY supplier_name ASC
    `,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json(rows);
    }
  );
});


// CUSTOMER_APP_ENDPOINTS_START

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      whatsapp_number TEXT UNIQUE NOT NULL,
      email TEXT,
      default_delivery_location TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      whatsapp_number TEXT NOT NULL,
      nickname TEXT,
      vehicle_make TEXT,
      vehicle_model TEXT,
      vehicle_year TEXT,
      vin TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function cleanPhoneNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

app.post("/api/app/signup", (req, res) => {
  const fullName = String(req.body.full_name || "").trim();
  const whatsappNumber = cleanPhoneNumber(req.body.whatsapp_number);
  const email = String(req.body.email || "").trim();
  const defaultDeliveryLocation = String(req.body.default_delivery_location || "").trim();

  if (!fullName || !whatsappNumber) {
    return res.status(400).json({
      error: "full_name and whatsapp_number are required"
    });
  }

  db.run(
    `
    INSERT INTO app_users (
      full_name,
      whatsapp_number,
      email,
      default_delivery_location
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(whatsapp_number)
    DO UPDATE SET
      full_name = excluded.full_name,
      email = excluded.email,
      default_delivery_location = excluded.default_delivery_location,
      updated_at = CURRENT_TIMESTAMP
    `,
    [fullName, whatsappNumber, email, defaultDeliveryLocation],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.run(
        `
        INSERT OR IGNORE INTO customers (whatsapp_number, name)
        VALUES (?, ?)
        `,
        [whatsappNumber, fullName],
        function () {
          db.run(
            `
            UPDATE customers
            SET name = ?
            WHERE whatsapp_number = ?
            `,
            [fullName, whatsappNumber]
          );
        }
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
    }
  );
});

app.get("/api/app/profile/:whatsapp_number", (req, res) => {
  const whatsappNumber = cleanPhoneNumber(req.params.whatsapp_number);

  db.get(
    `
    SELECT *
    FROM app_users
    WHERE whatsapp_number = ?
    `,
    [whatsappNumber],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!row) {
        return res.status(404).json({ error: "Customer profile not found" });
      }

      res.json(row);
    }
  );
});

app.post("/api/app/vehicles", (req, res) => {
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

  db.run(
    `
    INSERT INTO vehicles (
      whatsapp_number,
      nickname,
      vehicle_make,
      vehicle_model,
      vehicle_year,
      vin
    )
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [whatsappNumber, nickname, vehicleMake, vehicleModel, vehicleYear, vin],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.status(201).json({
        message: "Vehicle saved",
        vehicle_id: this.lastID
      });
    }
  );
});

app.get("/api/app/vehicles/:whatsapp_number", (req, res) => {
  const whatsappNumber = cleanPhoneNumber(req.params.whatsapp_number);

  db.all(
    `
    SELECT *
    FROM vehicles
    WHERE whatsapp_number = ?
    ORDER BY created_at DESC
    `,
    [whatsappNumber],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json(rows);
    }
  );
});

app.post("/api/app/part-request", (req, res) => {
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

  db.run(
    `
    INSERT OR IGNORE INTO customers (whatsapp_number, name)
    VALUES (?, ?)
    `,
    [whatsappNumber, customerName],
    function () {
      db.get(
        `
        SELECT id
        FROM customers
        WHERE whatsapp_number = ?
        `,
        [whatsappNumber],
        (err, customer) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          db.run(
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              requestCode,
              customer?.id || null,
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
            ],
            function (insertErr) {
              if (insertErr) {
                return res.status(500).json({ error: insertErr.message });
              }

              res.status(201).json({
                message: "Part request submitted",
                request_id: this.lastID,
                request_code: requestCode
              });
            }
          );
        }
      );
    }
  );
});

app.get("/api/app/requests/:whatsapp_number", (req, res) => {
  const whatsappNumber = cleanPhoneNumber(req.params.whatsapp_number);

  db.all(
    `
    SELECT *
    FROM part_requests
    WHERE whatsapp_number = ?
    ORDER BY created_at DESC
    `,
    [whatsappNumber],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json(rows);
    }
  );
});

// CUSTOMER_APP_ENDPOINTS_END

app.listen(PORT, () => {
  console.log(`Speedy 7 backend running on http://localhost:${PORT}`);
});



