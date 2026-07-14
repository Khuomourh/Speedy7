const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = __dirname;
const dataDir = path.join(root, "data");
const seedPath = path.join(dataDir, "seed.json");
const statePath = process.env.VERCEL
  ? path.join(os.tmpdir(), "speedy7-local-state.json")
  : path.join(dataDir, "local-state.json");

loadEnvFile(path.join(root, ".env"));

const port = Number(process.env.PORT || 5177);
const host = process.env.HOST || "0.0.0.0";
const supabaseUrl = trimTrailingSlash(process.env.SUPABASE_URL || "");
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const adminInviteCode = process.env.ADMIN_INVITE_CODE || "";
const passwordResetRedirectUrl = process.env.PASSWORD_RESET_REDIRECT_URL || "https://speedy7-rust.vercel.app/";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".sql": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function localNetworkUrls(serverPort) {
  return Object.values(os.networkInterfaces())
    .flatMap(addresses => addresses || [])
    .filter(address => address.family === "IPv4" && !address.internal)
    .map(address => `http://${address.address}:${serverPort}/`);
}

function supabaseConnectionInfo() {
  const hasUrl = Boolean(supabaseUrl);
  const hasAnonKey = Boolean(supabaseAnonKey);
  const hasServiceRoleKey = Boolean(supabaseServiceRoleKey);

  return {
    configured: hasUrl && (hasAnonKey || hasServiceRoleKey),
    serverWriteReady: hasUrl && hasServiceRoleKey,
    mode: hasUrl && (hasAnonKey || hasServiceRoleKey) ? "supabase_configured" : "local_json",
    projectRef: supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co/i)?.[1] || null,
    missing: [
      !hasUrl ? "SUPABASE_URL" : null,
      !hasAnonKey ? "SUPABASE_ANON_KEY" : null,
      !hasServiceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null
    ].filter(Boolean)
  };
}

function publicConnectionInfo() {
  const info = supabaseConnectionInfo();
  return {
    configured: info.configured,
    serverWriteReady: info.serverWriteReady,
    mode: info.mode,
    projectRef: info.projectRef,
    missing: info.missing
  };
}

function supabaseApiKey() {
  return supabaseServiceRoleKey || supabaseAnonKey;
}

function pendingSyncCount(state) {
  return state.syncQueue.filter(item => item.status !== "synced_to_supabase").length;
}

function categoryColor(categoryName) {
  const colors = {
    Engine: "#eb2333",
    Suspension: "#159bd7",
    Brake: "#20242a",
    Bearing: "#eb2333",
    Electrical: "#20242a",
    Cooling: "#159bd7",
    Body: "#159bd7",
    Service: "#159bd7"
  };
  return colors[categoryName] || "#eb2333";
}

function sortCategoryNames(categoryNames) {
  const preferredOrder = ["Engine", "Suspension", "Brake", "Bearing", "Electrical", "Cooling", "Body", "Service"];
  return [...categoryNames].sort((first, second) => {
    const firstIndex = preferredOrder.indexOf(first);
    const secondIndex = preferredOrder.indexOf(second);
    if (firstIndex === -1 && secondIndex === -1) return first.localeCompare(second);
    if (firstIndex === -1) return 1;
    if (secondIndex === -1) return -1;
    return firstIndex - secondIndex;
  });
}

async function supabaseRest(resource, options = {}) {
  const key = supabaseApiKey();
  if (!supabaseUrl || !key) throw new Error("Supabase is not configured");

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...options.headers
  };

  if (options.prefer !== false) headers.Prefer = options.prefer || "return=representation";

  const response = await fetch(`${supabaseUrl}/rest/v1/${resource}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Supabase request failed with ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

async function loadSupabaseCatalog() {
  if (!supabaseConnectionInfo().configured) return null;

  try {
    const [categories, suppliers, partsRows, stockItems, links] = await Promise.all([
      supabaseRest("part_categories?select=id,name&order=name.asc", { prefer: false }),
      supabaseRest("suppliers?select=id,name&order=name.asc", { prefer: false }),
      supabaseRest("parts?select=id,name,description,image_url,category_id&order=name.asc", { prefer: false }),
      supabaseRest("stock_items?select=id,part_id,supplier_id,sku,condition,price,quantity&order=created_at.asc", { prefer: false }),
      supabaseRest("compatibility_links?select=part_id,vin,engine_number&order=created_at.asc", { prefer: false })
    ]);

    if (!Array.isArray(partsRows) || !partsRows.length) return null;

    const categoriesById = new Map(categories.map(category => [category.id, category.name]));
    const suppliersById = new Map(suppliers.map(supplier => [supplier.id, supplier.name]));
    const stockByPartId = new Map();
    const linksByPartId = new Map();

    for (const item of stockItems) {
      if (!stockByPartId.has(item.part_id)) stockByPartId.set(item.part_id, item);
    }

    for (const link of links) {
      if (!linksByPartId.has(link.part_id)) linksByPartId.set(link.part_id, []);
      linksByPartId.get(link.part_id).push(link);
    }

    const parts = partsRows.map(part => {
      const category = categoriesById.get(part.category_id) || "Service";
      const stock = stockByPartId.get(part.id) || {};
      const partLinks = linksByPartId.get(part.id) || [];

      return {
        id: part.id,
        name: part.name,
        image: part.image_url || "",
        category,
        stockItemId: stock.id || null,
        sku: stock.sku || "SP7-LIVE",
        price: Number(stock.price || 0),
        stock: Number(stock.quantity || 0),
        condition: stock.condition || "New",
        supplier: suppliersById.get(stock.supplier_id) || "Speedy7 supplier",
        eta: stock.quantity > 0 ? "Today" : "Quote",
        engines: partLinks.map(link => link.engine_number).filter(Boolean),
        vins: partLinks.map(link => link.vin).filter(Boolean),
        quotes: 1,
        color: categoryColor(category)
      };
    });

    return {
      categories: ["All", ...sortCategoryNames(categories.map(category => category.name))],
      parts
    };
  } catch (error) {
    console.warn("Supabase catalog unavailable:", error.message);
    return null;
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function initialState() {
  return {
    garage: [],
    quoteRequests: [],
    quoteReplies: [],
    orders: [],
    compatibilityLinks: [],
    stockUploads: [],
    syncQueue: []
  };
}

function loadState() {
  return { ...initialState(), ...readJson(statePath, initialState()) };
}

function saveState(state) {
  writeJson(statePath, state);
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function jsonError(response, statusCode, message, details) {
  jsonResponse(response, statusCode, {
    error: message,
    ...(details ? { details } : {})
  });
}

function readBody(request) {
  if (request.body !== undefined && request.body !== null) {
    if (typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
      return Promise.resolve(request.body);
    }

    try {
      const body = Buffer.isBuffer(request.body) ? request.body.toString("utf8") : String(request.body);
      return Promise.resolve(body ? JSON.parse(body) : {});
    } catch (error) {
      return Promise.reject(new Error("Invalid JSON request body"));
    }
  }

  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function normalizeRole(role) {
  if (["customer", "assistant", "admin"].includes(role)) return role;
  return "customer";
}

function publicAuthConfig() {
  return {
    supabaseUrl,
    hasPublishableKey: Boolean(supabaseAnonKey),
    authReady: Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey),
    adminInviteRequired: true
  };
}

async function supabaseAuthRequest(resource, options = {}) {
  const key = options.admin ? supabaseServiceRoleKey : supabaseAnonKey;
  if (!supabaseUrl || !key) throw new Error("Supabase Auth is not configured");

  const headers = {
    apikey: key,
    Authorization: `Bearer ${options.accessToken || key}`,
    "Content-Type": "application/json",
    ...options.headers
  };

  const response = await fetch(`${supabaseUrl}/auth/v1/${resource}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.msg || payload?.message || payload?.error_description || payload?.error || "Supabase Auth request failed");
  }
  return payload;
}

async function createAuthUser({ email, password, fullName, phone, role }) {
  const payload = {
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone
    },
    app_metadata: {
      role
    }
  };
  return supabaseAuthRequest("admin/users", {
    method: "POST",
    admin: true,
    body: payload
  });
}

async function signInWithPassword(email, password) {
  return supabaseAuthRequest("token?grant_type=password", {
    method: "POST",
    body: { email, password }
  });
}

async function getAuthUser(accessToken) {
  return supabaseAuthRequest("user", { accessToken });
}

async function signOut(accessToken) {
  return supabaseAuthRequest("logout", {
    method: "POST",
    accessToken,
    body: {}
  });
}

async function upsertProfile({ userId, role, fullName, phone }) {
  const rows = await supabaseRest("profiles?on_conflict=id", {
    method: "POST",
    body: {
      id: userId,
      role,
      full_name: fullName || null,
      phone: phone || null
    },
    prefer: "resolution=merge-duplicates,return=representation"
  });
  return Array.isArray(rows) ? rows[0] : null;
}

async function getProfile(userId) {
  const rows = await supabaseRest(`profiles?select=id,role,full_name,phone,created_at&id=eq.${encodeURIComponent(userId)}&limit=1`, {
    prefer: false
  });
  return Array.isArray(rows) ? rows[0] : null;
}

function requestAccessToken(request) {
  const authorization = String(request.headers?.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function requireAuthenticatedUser(request, response, allowedRoles) {
  const accessToken = requestAccessToken(request);
  if (!accessToken) {
    jsonError(response, 401, "Log in to continue.");
    return null;
  }

  try {
    const authResult = await getAuthUser(accessToken);
    const user = authResult.user || authResult;
    const profile = await getProfile(user.id);
    const role = profile?.role || user.app_metadata?.role || "customer";

    if (allowedRoles?.length && !allowedRoles.includes(role)) {
      jsonError(response, 403, "This action is not available for your account role.");
      return null;
    }

    return { accessToken, user, profile, role };
  } catch (error) {
    jsonError(response, 401, "Your login session has expired. Please log in again.");
    return null;
  }
}

async function ensureAssistantProfile(profile) {
  if (profile?.role !== "assistant") return null;
  const rows = await supabaseRest("assistant_profiles?on_conflict=id", {
    method: "POST",
    body: {
      id: profile.id,
      shop_name: profile.full_name || "Speedy7 Shop Assistant",
      whatsapp_number: profile.phone || "Not supplied",
      categories: [],
      available: true
    },
    prefer: "resolution=merge-duplicates,return=representation"
  });
  return Array.isArray(rows) ? rows[0] : null;
}

function quoteStatusLabel(status) {
  const labels = {
    draft: "Draft",
    sent_to_assistants: "Sent to assistants",
    assistant_replied: "Shop replied",
    owner_approved: "Owner approved",
    sent_to_customer: "Sent to customer",
    ordered: "Ordered",
    closed: "Closed"
  };
  return labels[status] || status || "Pending";
}

function orderStatusLabel(status) {
  return String(status || "placed").replaceAll("_", " ").replace(/^./, value => value.toUpperCase());
}

function inFilter(rows) {
  return `(${rows.map(row => row.id).join(",")})`;
}

async function loadPermanentAccountData(context) {
  const isStaff = ["assistant", "admin"].includes(context.role);
  const isAdmin = context.role === "admin";
  const userId = context.user.id;
  const vehicleFilter = isStaff ? "" : `&user_id=eq.${encodeURIComponent(userId)}`;
  const quoteFilter = isStaff ? "" : `&user_id=eq.${encodeURIComponent(userId)}`;
  const orderFilter = isAdmin ? "" : `&user_id=eq.${encodeURIComponent(userId)}`;

  const [vehicleRows, quoteRows, orderRows, partRows, supplierRows, stockRows, profileRows, inventoryRows] = await Promise.all([
    supabaseRest(`vehicles?select=id,user_id,make,model,year,created_at${vehicleFilter}&order=created_at.desc&limit=200`, { prefer: false }),
    supabaseRest(`quote_requests?select=id,user_id,vehicle_id,part_id,description,status,source,created_at${quoteFilter}&order=created_at.desc&limit=200`, { prefer: false }),
    supabaseRest(`orders?select=id,user_id,status,fulfilment_method,total,customer_name,customer_phone,payment_method,created_at${orderFilter}&order=created_at.desc&limit=200`, { prefer: false }),
    supabaseRest("parts?select=id,name&order=name.asc", { prefer: false }),
    supabaseRest("suppliers?select=id,name&order=name.asc", { prefer: false }),
    supabaseRest("stock_items?select=id,part_id,sku,quantity,price", { prefer: false }),
    isAdmin ? supabaseRest("profiles?select=id,role,full_name,phone,created_at&order=created_at.desc&limit=500", { prefer: false }) : Promise.resolve([]),
    isAdmin ? supabaseRest("inventory_transactions?select=id,stock_item_id,transaction_type,quantity_change,quantity_after,order_id,actor_id,note,created_at&order=created_at.desc&limit=200", { prefer: false }) : Promise.resolve([])
  ]);

  const identifiersPromise = vehicleRows.length
    ? supabaseRest(`vehicle_identifiers?select=id,vehicle_id,vin,engine_number&vehicle_id=in.${inFilter(vehicleRows)}`, { prefer: false })
    : Promise.resolve([]);
  const repliesPromise = quoteRows.length
    ? supabaseRest(`assistant_quote_replies?select=id,quote_request_id,assistant_id,supplier_id,price,quantity,condition,eta,note,approved_by_owner,created_at&quote_request_id=in.${inFilter(quoteRows)}&order=created_at.desc`, { prefer: false })
    : Promise.resolve([]);
  const orderItemsPromise = orderRows.length
    ? supabaseRest(`order_items?select=id,order_id,stock_item_id,assistant_quote_reply_id,quantity,unit_price&order_id=in.${inFilter(orderRows)}`, { prefer: false })
    : Promise.resolve([]);
  const paymentsPromise = orderRows.length
    ? supabaseRest(`payments?select=id,order_id,amount,method,status,reference,paid_at,created_at&order_id=in.${inFilter(orderRows)}`, { prefer: false })
    : Promise.resolve([]);
  const [identifierRows, replyRows, orderItemRows, paymentRows] = await Promise.all([
    identifiersPromise,
    repliesPromise,
    orderItemsPromise,
    paymentsPromise
  ]);

  const identifiersByVehicle = new Map();
  for (const identifier of identifierRows) {
    if (!identifiersByVehicle.has(identifier.vehicle_id)) identifiersByVehicle.set(identifier.vehicle_id, []);
    identifiersByVehicle.get(identifier.vehicle_id).push(identifier);
  }

  const garage = vehicleRows.map(vehicle => {
    const identifier = identifiersByVehicle.get(vehicle.id)?.[0] || {};
    return {
      id: vehicle.id,
      vin: identifier.vin || "",
      engine: identifier.engine_number || "",
      label: [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" "),
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year ? String(vehicle.year) : ""
    };
  });

  const partsById = new Map(partRows.map(part => [part.id, part.name]));
  const suppliersById = new Map(supplierRows.map(supplier => [supplier.id, supplier.name]));
  const stockById = new Map(stockRows.map(stock => [stock.id, stock]));
  const vehiclesById = new Map(garage.map(vehicle => [vehicle.id, vehicle]));
  const requestsById = new Map(quoteRows.map(request => [request.id, request]));

  const quoteRequests = quoteRows.map(request => ({
    id: request.id,
    part: partsById.get(request.part_id) || request.description || "Part quote",
    vehicle: vehiclesById.get(request.vehicle_id)?.label || "Vehicle not selected",
    channel: request.source === "photo" ? "Photo upload" : "App search",
    status: quoteStatusLabel(request.status),
    created: request.created_at
  }));

  const quoteReplies = replyRows.map(reply => {
    const request = requestsById.get(reply.quote_request_id);
    return {
      id: reply.id,
      requestId: reply.quote_request_id,
      shop: suppliersById.get(reply.supplier_id) || "Registered Speedy7 shop",
      part: partsById.get(request?.part_id) || request?.description || "Part quote",
      price: Number(reply.price || 0),
      eta: reply.eta || "Quote",
      condition: reply.condition || "Not specified",
      note: reply.note || ""
    };
  });

  const itemsByOrder = new Map();
  for (const item of orderItemRows) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    const stock = stockById.get(item.stock_item_id);
    itemsByOrder.get(item.order_id).push({
      id: item.id,
      stockItemId: item.stock_item_id,
      quoteReplyId: item.assistant_quote_reply_id,
      name: partsById.get(stock?.part_id) || "Quoted part",
      quantity: Number(item.quantity || 1),
      price: Number(item.unit_price || 0)
    });
  }

  const paymentsByOrder = new Map(paymentRows.map(payment => [payment.order_id, payment]));
  const orders = orderRows.map(order => ({
    id: order.id,
    customerName: order.customer_name || context.profile?.full_name || "Speedy7 customer",
    phone: order.customer_phone || context.profile?.phone || "",
    fulfilment: order.fulfilment_method,
    payment: order.payment_method,
    paymentStatus: paymentsByOrder.get(order.id)?.status || "pending",
    status: orderStatusLabel(order.status),
    total: Number(order.total || 0),
    items: itemsByOrder.get(order.id) || [],
    createdAt: order.created_at
  }));

  const customerCount = profileRows.filter(profile => profile.role === "customer").length;
  const openQuoteCount = quoteRows.filter(request => !["closed", "ordered"].includes(request.status)).length;
  const stockUnits = stockRows.reduce((total, stock) => total + Number(stock.quantity || 0), 0);
  const salesTotal = orderRows.reduce((total, order) => total + Number(order.total || 0), 0);

  return {
    garage,
    quoteRequests,
    quoteReplies,
    orders,
    customers: isAdmin ? profileRows.map(profile => ({
      id: profile.id,
      role: profile.role,
      fullName: profile.full_name || "",
      phone: profile.phone || "",
      createdAt: profile.created_at
    })) : [],
    inventoryTransactions: isAdmin ? inventoryRows : [],
    metrics: isAdmin ? [
      [String(customerCount), "registered customers"],
      [String(openQuoteCount), "open quote requests"],
      [String(stockUnits), "units in stock"],
      [`BWP ${salesTotal.toLocaleString("en-BW")}`, "recorded sales"]
    ] : []
  };
}

function cleanAuthProfile(profile, authUser) {
  return {
    id: profile?.id || authUser?.id || null,
    role: profile?.role || authUser?.app_metadata?.role || "customer",
    fullName: profile?.full_name || authUser?.user_metadata?.full_name || "",
    phone: profile?.phone || authUser?.user_metadata?.phone || "",
    email: authUser?.email || ""
  };
}

function upsertById(items, item) {
  const index = items.findIndex(existing => existing.id === item.id);
  if (index >= 0) items[index] = { ...items[index], ...item };
  else items.unshift(item);
  return item;
}

function queueSync(state, type, payload) {
  const item = {
    id: `sync-${Date.now()}-${state.syncQueue.length}`,
    type,
    payload,
    status: supabaseConnectionInfo().serverWriteReady ? "queued_for_supabase" : "waiting_for_supabase_credentials",
    createdAt: new Date().toISOString()
  };
  state.syncQueue.unshift(item);
  return item;
}

async function mirrorToSupabase(type, payload) {
  if (!supabaseConnectionInfo().serverWriteReady) {
    return { ok: false, status: "waiting_for_supabase_credentials" };
  }

  try {
    const rows = await supabaseRest("app_intake_events", {
      method: "POST",
      body: { event_type: type, payload },
      prefer: "return=representation"
    });
    return {
      ok: true,
      status: "synced_to_supabase",
      remoteId: Array.isArray(rows) ? rows[0]?.id : null,
      syncedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      status: "supabase_sync_failed",
      error: String(error.message || "Supabase sync failed").slice(0, 240)
    };
  }
}

async function syncQueuedItem(item) {
  const result = await mirrorToSupabase(item.type, item.payload);
  item.status = result.status;
  if (result.remoteId) item.remoteId = result.remoteId;
  if (result.syncedAt) item.syncedAt = result.syncedAt;
  if (result.error) item.error = result.error;
  return item;
}

function parseStockRows(csvText) {
  return String(csvText || "")
    .split(/\r?\n/)
    .map(row => row.trim())
    .filter(Boolean)
    .map((row, index) => {
      const [name, category, sku, price, quantity, vin, engine] = row.split(",").map(value => value.trim());
      return {
        id: `stock-${Date.now()}-${index}`,
        name,
        category,
        sku,
        price: Number(price || 0),
        quantity: Number(quantity || 0),
        vin,
        engine,
        uploadedAt: new Date().toISOString()
      };
    });
}

function safeFilePath(requestUrl) {
  const cleanUrl = decodeURIComponent(requestUrl.split("?")[0]);
  const route = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const filePath = path.normalize(path.join(root, route));
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

async function handleApi(request, response, pathname) {
  const seed = readJson(seedPath, {});
  const state = loadState();

  if (request.method === "GET" && pathname === "/api/health") {
    jsonResponse(response, 200, {
      ok: true,
      app: "Speedy7",
      persistence: publicConnectionInfo(),
      time: new Date().toISOString()
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/connection") {
    jsonResponse(response, 200, {
      ...publicConnectionInfo(),
      pendingSyncItems: pendingSyncCount(state)
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/auth/config") {
    jsonResponse(response, 200, publicAuthConfig());
    return true;
  }

  if (request.method === "GET" && pathname === "/api/bootstrap") {
    const catalog = await loadSupabaseCatalog();
    const catalogParts = catalog?.parts || seed.parts || [];

    jsonResponse(response, 200, {
      ...seed,
      ...(catalog || {}),
      parts: catalogParts.map(part => ({
        ...part,
        image: part.image || part.image_url || ""
      })),
      garage: state.garage.length ? state.garage : [seed.vehicles?.[0]].filter(Boolean),
      quoteRequests: [...state.quoteRequests, ...(seed.quoteRequests || [])],
      quoteReplies: [...state.quoteReplies, ...(seed.quoteReplies || [])],
      orders: state.orders,
      compatibilityLinks: state.compatibilityLinks,
      stockUploads: state.stockUploads,
      connection: {
        ...publicConnectionInfo(),
        pendingSyncItems: pendingSyncCount(state),
        catalogSource: catalog ? "supabase" : "seed"
      }
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/account-data") {
    const context = await requireAuthenticatedUser(request, response);
    if (!context) return true;

    try {
      jsonResponse(response, 200, await loadPermanentAccountData(context));
    } catch (error) {
      console.error("Speedy7 account data error:", error);
      jsonError(response, 500, "Your saved Speedy7 records could not be loaded.");
    }
    return true;
  }

  if (request.method !== "POST") return false;

  const payload = await readBody(request);

  if (pathname === "/api/auth/signup") {
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const fullName = String(payload.fullName || "").trim();
    const phone = String(payload.phone || "").trim();
    const role = normalizeRole(payload.role);

    if (!publicAuthConfig().authReady) {
      jsonError(response, 503, "Supabase Auth is not fully configured on the server.");
      return true;
    }

    if (!email || !password) {
      jsonError(response, 400, "Email and password are required.");
      return true;
    }

    if (password.length < 6) {
      jsonError(response, 400, "Use a password with at least 6 characters.");
      return true;
    }

    if (role === "admin" && (!adminInviteCode || payload.adminInviteCode !== adminInviteCode)) {
      jsonError(response, 403, "Admin signup needs the private owner invite code.");
      return true;
    }

    try {
      const created = await createAuthUser({ email, password, fullName, phone, role });
      const user = created.user || created;
      const profile = await upsertProfile({ userId: user.id, role, fullName, phone });
      await ensureAssistantProfile(profile);
      const session = await signInWithPassword(email, password);
      jsonResponse(response, 201, {
        session: {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresIn: session.expires_in
        },
        profile: cleanAuthProfile(profile, session.user || user),
        message: `${role} account created.`
      });
    } catch (error) {
      const message = /already/i.test(error.message) ? "Account already exists. Use Log in instead." : error.message;
      jsonError(response, /already/i.test(error.message) ? 409 : 400, message);
    }
    return true;
  }

  if (pathname === "/api/auth/login") {
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");

    if (!email || !password) {
      jsonError(response, 400, "Email and password are required.");
      return true;
    }

    try {
      const session = await signInWithPassword(email, password);
      const user = session.user;
      let profile = await getProfile(user.id);
      if (!profile) {
        profile = await upsertProfile({
          userId: user.id,
          role: user.app_metadata?.role || "customer",
          fullName: user.user_metadata?.full_name || "",
          phone: user.user_metadata?.phone || ""
        });
      }
      await ensureAssistantProfile(profile);
      jsonResponse(response, 200, {
        session: {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresIn: session.expires_in
        },
        profile: cleanAuthProfile(profile, user),
        message: "Logged in."
      });
    } catch (error) {
      jsonError(response, 401, "Login failed. Check the email and password.");
    }
    return true;
  }

  if (pathname === "/api/auth/refresh") {
    const refreshToken = String(payload.refreshToken || "").trim();
    if (!refreshToken) {
      jsonError(response, 401, "Missing session refresh token.");
      return true;
    }

    try {
      const session = await supabaseAuthRequest("token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: refreshToken }
      });
      const user = session.user;
      let profile = await getProfile(user.id);
      if (!profile) {
        profile = await upsertProfile({
          userId: user.id,
          role: user.app_metadata?.role || "customer",
          fullName: user.user_metadata?.full_name || "",
          phone: user.user_metadata?.phone || ""
        });
      }
      await ensureAssistantProfile(profile);
      jsonResponse(response, 200, {
        session: {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresIn: session.expires_in
        },
        profile: cleanAuthProfile(profile, user),
        message: "Session refreshed."
      });
    } catch (error) {
      jsonError(response, 401, "Your saved login has expired. Please log in again.");
    }
    return true;
  }

  if (pathname === "/api/auth/forgot-password") {
    const email = String(payload.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      jsonError(response, 400, "Enter the email address used for your Speedy7 account.");
      return true;
    }

    try {
      await supabaseAuthRequest(`recover?redirect_to=${encodeURIComponent(passwordResetRedirectUrl)}`, {
        method: "POST",
        body: { email }
      });
      jsonResponse(response, 200, {
        ok: true,
        message: "If that email is registered, a secure password reset link is on the way."
      });
    } catch (error) {
      const rateLimited = /rate|seconds|minute|hour/i.test(error.message);
      jsonError(response, rateLimited ? 429 : 400, rateLimited
        ? "Please wait before requesting another password reset email."
        : "The reset email could not be sent. Please check the address and try again.");
    }
    return true;
  }

  if (pathname === "/api/auth/reset-password") {
    const accessToken = String(payload.accessToken || "").trim();
    const password = String(payload.password || "");
    if (!accessToken) {
      jsonError(response, 401, "This password reset link is missing or has expired.");
      return true;
    }
    if (password.length < 8) {
      jsonError(response, 400, "Use a new password with at least 8 characters.");
      return true;
    }

    try {
      await supabaseAuthRequest("user", {
        method: "PUT",
        accessToken,
        body: { password }
      });
      jsonResponse(response, 200, {
        ok: true,
        message: "Password updated. You can now log in to Speedy7."
      });
    } catch (error) {
      jsonError(response, 401, "This password reset link has expired. Request a new one.");
    }
    return true;
  }

  if (pathname === "/api/auth/me") {
    const accessToken = String(payload.accessToken || "");
    if (!accessToken) {
      jsonError(response, 401, "Missing login session.");
      return true;
    }

    try {
      const authUser = await getAuthUser(accessToken);
      const user = authUser.user || authUser;
      const profile = await getProfile(user.id);
      jsonResponse(response, 200, {
        profile: cleanAuthProfile(profile, user)
      });
    } catch (error) {
      jsonError(response, 401, "Session expired. Please log in again.");
    }
    return true;
  }

  if (pathname === "/api/auth/logout") {
    const accessToken = String(payload.accessToken || "");
    if (accessToken) {
      try {
        await signOut(accessToken);
      } catch (error) {
        console.warn("Supabase logout warning:", error.message);
      }
    }
    jsonResponse(response, 200, { ok: true });
    return true;
  }

  if (pathname === "/api/vehicles") {
    const context = await requireAuthenticatedUser(request, response);
    if (!context) return true;
    const make = String(payload.make || "Unknown").trim() || "Unknown";
    const model = String(payload.model || "Model").trim() || "Model";
    const parsedYear = Number.parseInt(payload.year, 10);
    const year = Number.isInteger(parsedYear) && parsedYear > 1900 && parsedYear < 2200 ? parsedYear : null;
    const vin = String(payload.vin || "").trim() || null;
    const engine = String(payload.engine || "").trim();

    if (!engine) {
      jsonError(response, 400, "Engine number is required to register a vehicle.");
      return true;
    }

    let vehicleRow;
    try {
      const vehicleRows = await supabaseRest("vehicles", {
        method: "POST",
        body: { user_id: context.user.id, make, model, year },
        prefer: "return=representation"
      });
      vehicleRow = vehicleRows[0];
      await supabaseRest("vehicle_identifiers", {
        method: "POST",
        body: { vehicle_id: vehicleRow.id, vin, engine_number: engine },
        prefer: "return=representation"
      });
      const label = [make, model, year].filter(Boolean).join(" ");
      jsonResponse(response, 201, {
        id: vehicleRow.id,
        vin: vin || "",
        engine,
        label,
        make,
        model,
        year: year ? String(year) : "",
        syncStatus: "saved_to_supabase"
      });
    } catch (error) {
      if (vehicleRow?.id) {
        await supabaseRest(`vehicles?id=eq.${vehicleRow.id}`, { method: "DELETE", prefer: false }).catch(() => null);
      }
      jsonError(response, 400, error.message || "Vehicle could not be saved.");
    }
    return true;
  }

  if (pathname === "/api/quote-requests") {
    const context = await requireAuthenticatedUser(request, response);
    if (!context) return true;
    const vehicleId = String(payload.vehicleId || "").trim() || null;
    const partId = String(payload.partId || "").trim() || null;
    const description = String(payload.description || payload.part || "Part quote request").trim();
    const source = /photo/i.test(String(payload.channel || payload.source || "")) ? "photo" : "app";

    try {
      if (vehicleId && context.role === "customer") {
        const ownedVehicles = await supabaseRest(`vehicles?select=id&id=eq.${encodeURIComponent(vehicleId)}&user_id=eq.${encodeURIComponent(context.user.id)}&limit=1`, { prefer: false });
        if (!ownedVehicles.length) {
          jsonError(response, 403, "Choose a vehicle registered to your account.");
          return true;
        }
      }

      const rows = await supabaseRest("quote_requests", {
        method: "POST",
        body: {
          user_id: context.user.id,
          vehicle_id: vehicleId,
          part_id: partId,
          description,
          status: "sent_to_assistants",
          source
        },
        prefer: "return=representation"
      });
      const quote = rows[0];
      jsonResponse(response, 201, {
        id: quote.id,
        part: String(payload.part || description),
        vehicle: String(payload.vehicle || "Selected vehicle"),
        channel: source === "photo" ? "Photo upload" : "App search",
        status: quoteStatusLabel(quote.status),
        created: quote.created_at,
        syncStatus: "saved_to_supabase"
      });
    } catch (error) {
      jsonError(response, 400, error.message || "Quote request could not be saved.");
    }
    return true;
  }

  if (pathname === "/api/assistant-quote-replies") {
    const context = await requireAuthenticatedUser(request, response, ["assistant", "admin"]);
    if (!context) return true;
    const requestId = String(payload.requestId || "").trim();
    const shopName = String(payload.shop || context.profile?.full_name || "Speedy7 Shop").trim();

    try {
      const requests = await supabaseRest(`quote_requests?select=id,part_id,description&id=eq.${encodeURIComponent(requestId)}&limit=1`, { prefer: false });
      if (!requests.length) {
        jsonError(response, 404, "The selected quote request no longer exists.");
        return true;
      }

      const suppliers = await supabaseRest("suppliers?select=id,name", { prefer: false });
      let supplier = suppliers.find(item => item.name.toLowerCase() === shopName.toLowerCase());
      if (!supplier) {
        const createdSuppliers = await supabaseRest("suppliers", {
          method: "POST",
          body: { name: shopName, whatsapp_number: context.profile?.phone || null },
          prefer: "return=representation"
        });
        supplier = createdSuppliers[0];
      }

      if (context.role === "assistant") {
        await supabaseRest("assistant_profiles?on_conflict=id", {
          method: "POST",
          body: {
            id: context.user.id,
            supplier_id: supplier.id,
            shop_name: shopName,
            whatsapp_number: context.profile?.phone || "Not supplied",
            categories: [],
            available: true
          },
          prefer: "resolution=merge-duplicates,return=minimal"
        });
      }

      const rows = await supabaseRest("assistant_quote_replies", {
        method: "POST",
        body: {
          quote_request_id: requestId,
          assistant_id: context.role === "assistant" ? context.user.id : null,
          supplier_id: supplier.id,
          price: Number(payload.price || 0),
          quantity: 1,
          condition: String(payload.condition || "Not specified"),
          eta: String(payload.eta || "Quote"),
          note: String(payload.note || "")
        },
        prefer: "return=representation"
      });
      await supabaseRest(`quote_requests?id=eq.${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        body: { status: "assistant_replied" },
        prefer: "return=minimal"
      });
      const reply = rows[0];
      jsonResponse(response, 201, {
        id: reply.id,
        requestId,
        shop: supplier.name,
        part: String(payload.part || requests[0].description || "Part quote"),
        price: Number(reply.price),
        eta: reply.eta,
        condition: reply.condition,
        note: reply.note || "",
        syncStatus: "saved_to_supabase"
      });
    } catch (error) {
      jsonError(response, 400, error.message || "Assistant quote could not be saved.");
    }
    return true;
  }

  if (pathname === "/api/orders") {
    const context = await requireAuthenticatedUser(request, response);
    if (!context) return true;
    const items = Array.isArray(payload.items) ? payload.items.map(item => ({
      stock_item_id: item.stockItemId || item.stock_item_id || null,
      quote_reply_id: item.quoteReplyId || item.quote_reply_id || null,
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.price || item.unit_price || 0)
    })).filter(item => item.stock_item_id || item.quote_reply_id) : [];

    try {
      const result = await supabaseRest("rpc/speedy7_create_order", {
        method: "POST",
        body: {
          p_user_id: context.user.id,
          p_customer_name: String(payload.customerName || context.profile?.full_name || ""),
          p_customer_phone: String(payload.phone || context.profile?.phone || ""),
          p_fulfilment_method: String(payload.fulfilment || "delivery"),
          p_payment_method: String(payload.payment || "pay_on_delivery"),
          p_items: items
        },
        prefer: false
      });
      jsonResponse(response, 201, {
        id: result.order_id,
        customerName: String(payload.customerName || context.profile?.full_name || "Speedy7 customer"),
        phone: String(payload.phone || context.profile?.phone || ""),
        fulfilment: String(payload.fulfilment || "delivery"),
        payment: String(payload.payment || "pay_on_delivery"),
        paymentStatus: "pending",
        status: "Placed",
        total: Number(result.total || 0),
        items: payload.items || [],
        syncStatus: "saved_to_supabase"
      });
    } catch (error) {
      jsonError(response, 400, error.message || "Order could not be created.");
    }
    return true;
  }

  if (pathname === "/api/compatibility-links") {
    const context = await requireAuthenticatedUser(request, response, ["admin"]);
    if (!context) return true;
    const partId = String(payload.partId || "").trim();
    const vin = String(payload.vin || "").trim() || null;
    const engine = String(payload.engine || "").trim() || null;

    if (!partId || (!vin && !engine)) {
      jsonError(response, 400, "Choose a part and provide a VIN or engine number.");
      return true;
    }

    try {
      const existingRows = await supabaseRest(`compatibility_links?select=id,part_id,vin,engine_number&part_id=eq.${encodeURIComponent(partId)}`, { prefer: false });
      const existing = existingRows.find(link => (link.vin || null) === vin && (link.engine_number || null) === engine);
      let link = existing;
      if (!link) {
        const rows = await supabaseRest("compatibility_links", {
          method: "POST",
          body: { part_id: partId, vin, engine_number: engine, notes: String(payload.vehicle || "Admin compatibility link") },
          prefer: "return=representation"
        });
        link = rows[0];
      }
      await supabaseRest("audit_events", {
        method: "POST",
        body: { actor_id: context.user.id, action: "compatibility_link_saved", entity_table: "compatibility_links", entity_id: link.id },
        prefer: "return=minimal"
      });
      jsonResponse(response, 201, {
        id: link.id,
        partId,
        vin: vin || "",
        engine: engine || "",
        vehicle: String(payload.vehicle || ""),
        syncStatus: "saved_to_supabase"
      });
    } catch (error) {
      jsonError(response, 400, error.message || "Compatibility link could not be saved.");
    }
    return true;
  }

  if (pathname === "/api/stock-upload") {
    const context = await requireAuthenticatedUser(request, response, ["admin"]);
    if (!context) return true;
    const rows = parseStockRows(payload.rows);
    try {
      const result = await supabaseRest("rpc/speedy7_upsert_stock", {
        method: "POST",
        body: {
          p_actor_id: context.user.id,
          p_rows: rows.map(row => ({ ...row, condition: "New" }))
        },
        prefer: false
      });
      jsonResponse(response, 201, {
        rowsSaved: Number(result.rows_saved || rows.length),
        rows,
        syncStatus: "saved_to_supabase"
      });
    } catch (error) {
      jsonError(response, 400, error.message || "Stock upload could not be saved.");
    }
    return true;
  }

  return false;
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || "/", `http://${host}:${port}`).pathname;
      if (pathname.startsWith("/api/")) {
        const handled = await handleApi(request, response, pathname);
        if (!handled) jsonResponse(response, 404, { error: "API route not found" });
        return;
      }

      const filePath = safeFilePath(request.url || "/");
      if (!filePath) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
        return;
      }

      fs.readFile(filePath, (error, content) => {
        if (error) {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Not found");
          return;
        }

        const extension = path.extname(filePath).toLowerCase();
        response.writeHead(200, {
          "Content-Type": mimeTypes[extension] || "application/octet-stream",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        });
        response.end(content);
      });
    } catch (error) {
      jsonResponse(response, 500, { error: error.message || "Server error" });
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(port, host, () => {
    const computerHost = host === "0.0.0.0" ? "127.0.0.1" : host;
    console.log(`Speedy7 is running at http://${computerHost}:${port}/`);
    if (host === "0.0.0.0") {
      for (const url of localNetworkUrls(port)) {
        console.log(`Android phone (same Wi-Fi): ${url}`);
      }
    }
    console.log("Local API is ready at /api/bootstrap and /api/health.");
    console.log("Press Ctrl+C to stop the app.");
  });
}

module.exports = {
  handleApi,
  jsonResponse
};
