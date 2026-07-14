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
    const vehicle = { ...payload, savedAt: new Date().toISOString() };
    upsertById(state.garage, vehicle);
    const syncItem = queueSync(state, "vehicle_registered", vehicle);
    await syncQueuedItem(syncItem);
    saveState(state);
    jsonResponse(response, 201, { ...vehicle, syncStatus: syncItem.status });
    return true;
  }

  if (pathname === "/api/quote-requests") {
    const quoteRequest = { ...payload, savedAt: new Date().toISOString() };
    upsertById(state.quoteRequests, quoteRequest);
    const syncItem = queueSync(state, "quote_request_created", quoteRequest);
    await syncQueuedItem(syncItem);
    saveState(state);
    jsonResponse(response, 201, { ...quoteRequest, syncStatus: syncItem.status });
    return true;
  }

  if (pathname === "/api/assistant-quote-replies") {
    const reply = { ...payload, savedAt: new Date().toISOString() };
    upsertById(state.quoteReplies, reply);
    const syncItem = queueSync(state, "assistant_quote_reply_created", reply);
    await syncQueuedItem(syncItem);
    saveState(state);
    jsonResponse(response, 201, { ...reply, syncStatus: syncItem.status });
    return true;
  }

  if (pathname === "/api/orders") {
    const order = { ...payload, id: payload.id || `order-${Date.now()}`, savedAt: new Date().toISOString() };
    upsertById(state.orders, order);
    const syncItem = queueSync(state, "order_created", order);
    await syncQueuedItem(syncItem);
    saveState(state);
    jsonResponse(response, 201, { ...order, syncStatus: syncItem.status });
    return true;
  }

  if (pathname === "/api/compatibility-links") {
    const link = { ...payload, id: payload.id || `link-${Date.now()}`, savedAt: new Date().toISOString() };
    upsertById(state.compatibilityLinks, link);
    const syncItem = queueSync(state, "compatibility_link_created", link);
    await syncQueuedItem(syncItem);
    saveState(state);
    jsonResponse(response, 201, { ...link, syncStatus: syncItem.status });
    return true;
  }

  if (pathname === "/api/stock-upload") {
    const rows = parseStockRows(payload.rows);
    const upload = { id: `upload-${Date.now()}`, rows, savedAt: new Date().toISOString() };
    state.stockUploads.unshift(upload);
    const syncItem = queueSync(state, "stock_upload_created", upload);
    await syncQueuedItem(syncItem);
    saveState(state);
    jsonResponse(response, 201, { rowsSaved: rows.length, rows, syncStatus: syncItem.status });
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
