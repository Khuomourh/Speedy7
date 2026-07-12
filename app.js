let categories = ['All', 'Engine', 'Suspension', 'Brake', 'Bearing', 'Electrical', 'Cooling', 'Body', 'Service'];
let vehicles = [
  { id: 'veh-1', vin: 'AHT53XEC104123456', engine: '1NZ-5087742', label: 'Toyota RunX 1.5 2004', make: 'Toyota', model: 'RunX', year: '2004' },
  { id: 'veh-2', vin: 'AAVZZZ6RZCU042120', engine: 'CLP-884201', label: 'VW Polo 1.4 2012', make: 'Volkswagen', model: 'Polo', year: '2012' },
  { id: 'veh-3', vin: 'ADNUSN1D5U0124550', engine: 'K7M-552010', label: 'Nissan NP200 1.6 2018', make: 'Nissan', model: 'NP200', year: '2018' }
];
let garage = [vehicles[0]];
let selectedVehicleId = garage[0].id;
let activeCategory = 'All';
let cart = [];
let selectedRequest = null;
let orders = [];
let backendAvailable = false;
let authState = { session: null, profile: null };

const authStorageKey = 'speedy7.auth';

let parts = [
  { id: 'p1', name: 'Engine Mount', category: 'Engine', sku: 'EM-1NZ-01', price: 650, stock: 8, condition: 'New', supplier: 'Tlokweng Auto Spares', eta: '15 min', engines: ['1NZ-5087742'], vins: ['AHT53XEC104123456'], quotes: 3, color: '#eb2333' },
  { id: 'p2', name: 'Oil Filter', category: 'Service', sku: 'OF-TOY-90915', price: 85, stock: 26, condition: 'New', supplier: 'Gaborone Parts Hub', eta: '20 min', engines: ['1NZ-5087742'], vins: ['AHT53XEC104123456'], quotes: 2, color: '#159bd7' },
  { id: 'p3', name: 'Front Brake Pads', category: 'Brake', sku: 'BP-RUNX-F', price: 380, stock: 14, condition: 'Aftermarket', supplier: 'Mogoditshane Motors', eta: '25 min', engines: ['1NZ-5087742', 'CLP-884201'], vins: ['AHT53XEC104123456', 'AAVZZZ6RZCU042120'], quotes: 4, color: '#20242a' },
  { id: 'p4', name: 'Shock Absorber', category: 'Suspension', sku: 'SA-POLO-F', price: 720, stock: 5, condition: 'New', supplier: 'Gaborone Parts Hub', eta: '30 min', engines: ['CLP-884201'], vins: ['AAVZZZ6RZCU042120'], quotes: 3, color: '#159bd7' },
  { id: 'p5', name: 'Wheel Bearing', category: 'Bearing', sku: 'WB-RUNX-F', price: 290, stock: 6, condition: 'New', supplier: 'Tlokweng Auto Spares', eta: '18 min', engines: ['1NZ-5087742', 'K7M-552010'], vins: ['AHT53XEC104123456', 'ADNUSN1D5U0124550'], quotes: 5, color: '#eb2333' },
  { id: 'p6', name: 'Radiator', category: 'Cooling', sku: 'RAD-NP200-16', price: 950, stock: 3, condition: 'OEM', supplier: 'Mogoditshane Motors', eta: 'Today', engines: ['K7M-552010'], vins: ['ADNUSN1D5U0124550'], quotes: 2, color: '#159bd7' },
  { id: 'p7', name: 'Alternator', category: 'Electrical', sku: 'ALT-1NZ-90A', price: 1180, stock: 2, condition: 'Used good', supplier: 'Tlokweng Auto Spares', eta: '45 min', engines: ['1NZ-5087742'], vins: ['AHT53XEC104123456'], quotes: 2, color: '#20242a' },
  { id: 'p8', name: 'Control Arm', category: 'Suspension', sku: 'CA-NP200-L', price: 560, stock: 7, condition: 'Aftermarket', supplier: 'Gaborone Parts Hub', eta: 'Today', engines: ['K7M-552010'], vins: ['ADNUSN1D5U0124550'], quotes: 3, color: '#eb2333' },
  { id: 'p9', name: 'Front Bumper Clip Set', category: 'Body', sku: 'BC-RUNX-SET', price: 120, stock: 20, condition: 'New', supplier: 'Mogoditshane Motors', eta: '20 min', engines: ['1NZ-5087742'], vins: ['AHT53XEC104123456'], quotes: 1, color: '#159bd7' }
];

let quoteRequests = [
  { id: 'qr1', part: 'Front Brake Pads', vehicle: 'Toyota RunX 1.5 2004', channel: 'App search', status: '3 shop replies', created: '1 min ago' },
  { id: 'qr2', part: 'Wheel Bearing', vehicle: 'Toyota RunX 1.5 2004', channel: 'WhatsApp', status: 'Waiting approval', created: '3 min ago' }
];
let quoteReplies = [
  { id: 'q1', requestId: 'qr1', shop: 'Tlokweng Auto Spares', part: 'Front Brake Pads', price: 380, eta: '15 min', condition: 'Aftermarket', note: 'In stock, delivery available.' },
  { id: 'q2', requestId: 'qr1', shop: 'Gaborone Parts Hub', part: 'Front Brake Pads', price: 420, eta: '25 min', condition: 'New', note: 'Premium ceramic option.' },
  { id: 'q3', requestId: 'qr1', shop: 'Mogoditshane Motors', part: 'Front Brake Pads', price: 350, eta: 'Today', condition: 'Used good', note: 'Budget option, checked.' }
];

let schemaTables = [
  ['profiles', 'Customer, assistant, and admin profile records.'],
  ['vehicles', 'Registered customer vehicles with make, model, and year.'],
  ['vehicle_identifiers', 'VIN and engine number lookup records.'],
  ['part_categories', 'Engine, Suspension, Brake, Bearing, and more.'],
  ['parts', 'Catalog parts with images and descriptions.'],
  ['compatibility_links', 'Links parts to VINs, engine numbers, and vehicle models.'],
  ['stock_items', 'Quantity, price, condition, supplier, and SKU.'],
  ['quote_requests', 'Customer quote requests from search or photo.'],
  ['quote_request_photos', 'Uploaded unknown-part images.'],
  ['assistant_profiles', 'Registered shop assistant WhatsApp profiles.'],
  ['assistant_quote_replies', 'Shop offers for owner approval.'],
  ['carts', 'Customer cart state.'],
  ['orders', 'Checkout and fulfilment records.'],
  ['order_items', 'Parts attached to each order.'],
  ['suppliers', 'Shop and supplier data.'],
  ['social_leads', 'Facebook, WhatsApp, and Marketplace lead intake.'],
  ['audit_events', 'Owner/admin activity trail.'],
  ['app_intake_events', 'Secure server-side intake for preview form submissions before full Auth.']
];

let metrics = [
  ['42', 'searches today'], ['9', 'missing parts'], ['1.8 min', 'avg quote reply'], ['BWP 18,450', 'open order value']
];

function $(id) { return document.getElementById(id); }
function money(value) { return 'BWP ' + Number(value).toLocaleString('en-US'); }
function selectedVehicle() { return garage.find(vehicle => vehicle.id === selectedVehicleId) || garage[0]; }
function toast(message) {
  const box = $('toast');
  box.textContent = message;
  box.classList.add('is-visible');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => box.classList.remove('is-visible'), 2600);
}
function roleLabel(role) {
  const labels = { customer: 'Customer', assistant: 'Shop assistant', admin: 'Admin' };
  return labels[role] || 'Guest';
}
async function apiRequest(path, payload) {
  if (!backendAvailable && path !== '/api/bootstrap') return null;
  try {
    const options = payload === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    };
    const response = await fetch(path, options);
    if (!response.ok) throw new Error('Request failed');
    return await response.json();
  } catch (error) {
    console.warn('Speedy7 local API unavailable:', path, error.message);
    return null;
  }
}
async function authRequest(path, payload) {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (error) {
    toast(error.message || 'Authentication failed.');
    return null;
  }
}
function saveAuth(data) {
  authState = { session: data.session || authState.session, profile: data.profile || null };
  window.localStorage.setItem(authStorageKey, JSON.stringify(authState));
  updateAuthUi();
}
function clearAuth() {
  authState = { session: null, profile: null };
  window.localStorage.removeItem(authStorageKey);
  updateAuthUi();
}
async function restoreAuth() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(authStorageKey) || 'null');
    if (!stored?.session?.accessToken) return;
    authState = stored;
    const data = await authRequest('/api/auth/me', { accessToken: stored.session.accessToken });
    if (data?.profile) saveAuth({ session: stored.session, profile: data.profile });
    else clearAuth();
  } catch (error) {
    clearAuth();
  }
}
function updateAuthControls() {
  const isSignup = $('authModeSelect')?.value === 'signup';
  const role = $('roleSelect')?.value || 'customer';
  if ($('fullNameLabel')) $('fullNameLabel').hidden = !isSignup;
  if ($('phoneLabel')) $('phoneLabel').hidden = !isSignup;
  if ($('adminInviteLabel')) $('adminInviteLabel').hidden = !(isSignup && role === 'admin');
  if ($('authSubmitBtn')) $('authSubmitBtn').textContent = isSignup ? 'Create account' : 'Log in';
}
function updateAuthUi() {
  const profile = authState.profile;
  if ($('logoutBtn')) $('logoutBtn').hidden = !profile;
  if (!profile) {
    if ($('loginStatus')) $('loginStatus').textContent = 'Guest browsing';
    updateAuthControls();
    return;
  }

  if ($('loginStatus')) $('loginStatus').textContent = roleLabel(profile.role) + ' logged in';
  if ($('loginEmail')) $('loginEmail').value = profile.email || $('loginEmail').value;
  if ($('roleSelect')) $('roleSelect').value = profile.role || 'customer';
  updateAuthControls();
}
function canAccessView(viewId) {
  const role = authState.profile?.role;
  if (role === 'admin') return true;
  if (viewId === 'adminView') return false;
  if (viewId === 'assistantView') return role === 'assistant';
  return true;
}
async function loadBackendData() {
  const data = await apiRequest('/api/bootstrap');
  if (!data) return;
  backendAvailable = true;
  categories = data.categories?.length ? data.categories : categories;
  vehicles = data.vehicles?.length ? data.vehicles : vehicles;
  parts = data.parts?.length ? data.parts : parts;
  quoteRequests = data.quoteRequests?.length ? data.quoteRequests : quoteRequests;
  quoteReplies = data.quoteReplies?.length ? data.quoteReplies : quoteReplies;
  schemaTables = data.schemaTables?.length ? data.schemaTables : schemaTables;
  metrics = data.metrics?.length ? data.metrics : metrics;
  garage = data.garage?.length ? data.garage : garage;
  orders = data.orders || [];
  selectedVehicleId = garage[0]?.id || vehicles[0]?.id;
}
async function loadConnectionStatus() {
  const status = await apiRequest('/api/connection');
  const element = $('connectionStatus');
  if (!element) return;

  if (!status) {
    element.textContent = 'Local app mode';
    return;
  }

  if (status.serverWriteReady) {
    element.textContent = 'Supabase connected';
    return;
  }

  if (status.configured) {
    element.textContent = 'Supabase read-ready';
    return;
  }

  element.textContent = 'Local mode - Supabase not connected';
}
function showView(viewId) {
  if (!canAccessView(viewId)) {
    toast(viewId === 'adminView' ? 'Admin login required.' : 'Shop assistant login required.');
    viewId = 'customerView';
  }
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('is-visible', view.id === viewId));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('is-active', item.dataset.view === viewId));
}
function partSvg(part) {
  const label = part.category.slice(0, 2).toUpperCase();
  return '<svg viewBox="0 0 160 150" role="img" aria-label="' + part.name + '"><rect width="160" height="150" rx="12" fill="#eef3f8"/><circle cx="80" cy="72" r="42" fill="' + part.color + '" opacity="0.16"/><path d="M38 92h84l-13 19H51z" fill="#20242a" opacity="0.85"/><path d="M51 52h58l19 35H32z" fill="' + part.color + '"/><circle cx="56" cy="102" r="10" fill="#fff"/><circle cx="104" cy="102" r="10" fill="#fff"/><text x="80" y="79" text-anchor="middle" fill="#fff" font-size="24" font-family="Arial" font-weight="700">' + label + '</text></svg>';
}
function matchesVehicle(part, vehicle) {
  if (!vehicle) return true;
  return part.engines.includes(vehicle.engine) || part.vins.includes(vehicle.vin) || part.name.toLowerCase().includes(($('searchInput').value || '').toLowerCase());
}
function filteredParts() {
  const query = ($('searchInput').value || '').trim().toLowerCase();
  const vehicle = selectedVehicle();
  return parts.filter(part => {
    const categoryOk = activeCategory === 'All' || part.category === activeCategory;
    const vehicleOk = matchesVehicle(part, vehicle);
    const queryOk = !query || [part.name, part.category, part.sku, part.supplier, ...(part.engines || []), ...(part.vins || []), vehicle?.label || '', vehicle?.engine || '', vehicle?.vin || ''].join(' ').toLowerCase().includes(query);
    return categoryOk && vehicleOk && queryOk;
  });
}
function renderCategories() {
  $('categoryTabs').innerHTML = categories.map(category => '<button class="category-tab ' + (category === activeCategory ? 'is-active' : '') + '" type="button" data-category="' + category + '">' + category + '</button>').join('');
}
function renderParts() {
  const list = filteredParts();
  $('linkedPartsCount').textContent = list.length;
  $('quoteCount').textContent = quoteReplies.length;
  $('partsList').innerHTML = list.length ? list.map(part => '<article class="part-card"><div class="part-art">' + partSvg(part) + '</div><div><h3>' + part.name + '</h3><div class="price-row"><strong>' + money(part.price) + '</strong><span>estimate</span></div><div class="part-meta"><span>' + part.category + '</span><span>' + part.condition + '</span><span>' + part.stock + ' in stock</span><span>' + part.quotes + ' quotes</span></div><p class="plain-copy">Fits ' + part.engines.join(', ') + '. Supplier: ' + part.supplier + '. ETA ' + part.eta + '.</p><div class="part-actions"><button class="ghost-btn compact" data-action="quote" data-id="' + part.id + '" type="button">Get quote</button><button class="ghost-btn compact" data-action="cart" data-id="' + part.id + '" type="button">Add to order</button><button class="primary-btn compact" data-action="buy" data-id="' + part.id + '" type="button">Buy now</button></div></div></article>').join('') : '<p class="plain-copy">No matching parts yet. Send a photo quote so the owner can add it to the database.</p>';
  renderAdminPartSelect();
}
function renderGarage() {
  const html = garage.map(vehicle => '<article class="garage-card ' + (vehicle.id === selectedVehicleId ? 'is-active' : '') + '"><div><h3>' + vehicle.label + '</h3><div class="detail-grid"><span>VIN<strong>' + (vehicle.vin || 'Collect later') + '</strong></span><span>Engine<strong>' + vehicle.engine + '</strong></span><span>Make<strong>' + vehicle.make + '</strong></span><span>Year<strong>' + vehicle.year + '</strong></span></div></div><button class="ghost-btn compact" data-select-vehicle="' + vehicle.id + '" type="button">Use car</button></article>').join('');
  $('garageList').innerHTML = html;
  $('photoVehicleSelect').innerHTML = garage.map(vehicle => '<option value="' + vehicle.id + '">' + vehicle.label + ' - ' + vehicle.engine + '</option>').join('');
}
function renderQuotes() {
  $('quoteList').innerHTML = quoteReplies.map(reply => '<article class="quote-card"><div class="quote-top"><div><h3>' + reply.shop + '</h3><p class="plain-copy">' + reply.part + ' - ' + reply.condition + ' - ' + reply.eta + '</p></div><div class="quote-price">' + money(reply.price) + '</div></div><p class="plain-copy">' + reply.note + '</p><div class="part-actions"><button class="primary-btn compact" data-quote-order="' + reply.id + '" type="button">Send to customer</button><button class="ghost-btn compact" data-quote-cart="' + reply.id + '" type="button">Add to order</button></div></article>').join('');
  $('assistantInbox').innerHTML = quoteRequests.map(request => '<article class="inbox-card ' + (selectedRequest === request.id ? 'is-active' : '') + '"><h3>' + request.part + '</h3><p class="plain-copy">' + request.vehicle + ' - ' + request.channel + ' - ' + request.created + '</p><div class="part-meta"><span>' + request.status + '</span><span>Owner review</span></div><button class="ghost-btn compact" data-request="' + request.id + '" type="button">Reply</button></article>').join('');
}
function renderCart() {
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  $('cartList').innerHTML = cart.length ? cart.map(item => '<article class="cart-card"><div><h3>' + item.name + '</h3><p class="plain-copy">' + item.category + ' - ' + item.supplier + '</p></div><strong>' + money(item.price) + '</strong></article>').join('') + '<article class="cart-card"><strong>Total</strong><strong>' + money(total) + '</strong></article>' : '<p class="cart-empty">No parts selected yet. Add parts from Search or Quotes.</p>';
}
function renderAdminPartSelect() {
  $('adminPartSelect').innerHTML = parts.map(part => '<option value="' + part.id + '">' + part.name + ' - ' + part.sku + '</option>').join('');
}
function renderSchema() {
  $('schemaGrid').innerHTML = schemaTables.map(row => '<article class="schema-card"><strong>' + row[0] + '</strong><span>' + row[1] + '</span></article>').join('');
  $('analyticsGrid').innerHTML = metrics.map(row => '<article class="metric-card"><strong>' + row[0] + '</strong><span>' + row[1] + '</span></article>').join('');
  $('assistantProfile').innerHTML = '<h3>Tlokweng Auto Spares</h3><div class="detail-grid"><span>WhatsApp<strong>+267 72 111 000</strong></span><span>Area<strong>Gaborone</strong></span><span>Categories<strong>Brake, Engine</strong></span><span>Status<strong>Available</strong></span></div>';
}
function addToCart(part) {
  cart.push(part);
  renderCart();
  toast(part.name + ' added to order.');
}
function initEvents() {
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => showView(item.dataset.view)));
  $('authModeSelect').addEventListener('change', updateAuthControls);
  $('roleSelect').addEventListener('change', updateAuthControls);
  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const mode = $('authModeSelect').value;
    const role = $('roleSelect').value;
    const data = await authRequest('/api/auth/' + mode, {
      email: $('loginEmail').value.trim(),
      password: $('loginPassword').value,
      fullName: $('fullNameInput').value.trim(),
      phone: $('phoneInput').value.trim(),
      role,
      adminInviteCode: $('adminInviteInput').value
    });
    if (!data?.profile) return;
    saveAuth(data);
    if (data.profile.role === 'assistant') showView('assistantView');
    else if (data.profile.role === 'admin') showView('adminView');
    else showView('customerView');
    toast(data.message || 'Logged in.');
  });
  $('logoutBtn').addEventListener('click', async () => {
    await authRequest('/api/auth/logout', { accessToken: authState.session?.accessToken });
    clearAuth();
    showView('customerView');
    toast('Logged out.');
  });
  $('carForm').addEventListener('submit', event => {
    event.preventDefault();
    const label = $('vehicleInput').value.trim() || 'Vehicle pending details';
    const words = label.split(' ');
    const car = { id: 'veh-' + Date.now(), vin: $('vinInput').value.trim(), engine: $('engineInput').value.trim(), label, make: words[0] || 'Unknown', model: words.slice(1, -1).join(' ') || 'Model', year: words[words.length - 1] || 'Year' };
    garage.unshift(car);
    selectedVehicleId = car.id;
    $('searchInput').value = car.engine;
    renderAll();
    apiRequest('/api/vehicles', car);
    toast('Car registered and linked to engine search.');
  });
  $('searchInput').addEventListener('input', renderParts);
  $('resetFiltersBtn').addEventListener('click', () => { activeCategory = 'All'; $('searchInput').value = selectedVehicle()?.engine || ''; renderAll(); });
  $('categoryTabs').addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    activeCategory = button.dataset.category;
    renderCategories();
    renderParts();
  });
  $('partsList').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const part = parts.find(item => item.id === button.dataset.id);
    if (!part) return;
    if (button.dataset.action === 'quote') {
      const request = { id: 'qr-' + Date.now(), part: part.name, vehicle: selectedVehicle()?.label || 'Selected vehicle', channel: 'App search', status: 'Sent to assistants', created: 'just now' };
      const reply = { id: 'q-' + Date.now(), requestId: request.id, shop: part.supplier, part: part.name, price: part.price, eta: part.eta, condition: part.condition, note: 'Quote created from matching stock.' };
      quoteRequests.unshift(request);
      quoteReplies.unshift(reply);
      apiRequest('/api/quote-requests', request);
      apiRequest('/api/assistant-quote-replies', reply);
      renderQuotes();
      toast('Quote request sent to registered shops.');
    }
    if (button.dataset.action === 'cart' || button.dataset.action === 'buy') {
      addToCart(part);
      if (button.dataset.action === 'buy') showView('ordersView');
    }
  });
  $('garageList').addEventListener('click', event => {
    const button = event.target.closest('[data-select-vehicle]');
    if (!button) return;
    selectedVehicleId = button.dataset.selectVehicle;
    $('searchInput').value = selectedVehicle()?.engine || '';
    renderAll();
    toast('Vehicle selected for matching.');
  });
  $('seedGarageBtn').addEventListener('click', () => { garage = [...vehicles]; selectedVehicleId = garage[0].id; renderAll(); toast('Sample cars added.'); });
  $('photoInput').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { $('photoPreview').innerHTML = '<img src="' + reader.result + '" alt="Uploaded part preview">'; };
    reader.readAsDataURL(file);
  });
  $('photoQuoteForm').addEventListener('submit', event => {
    event.preventDefault();
    const vehicle = garage.find(item => item.id === $('photoVehicleSelect').value) || selectedVehicle();
    const description = $('photoDescription').value.trim() || 'Unknown part from customer photo';
    const request = { id: 'qr-' + Date.now(), part: description, vehicle: vehicle?.label || 'Selected vehicle', channel: 'Photo upload', status: 'Pending admin review', created: 'just now' };
    quoteRequests.unshift(request);
    apiRequest('/api/quote-requests', request);
    selectedRequest = request.id;
    renderQuotes();
    showView('assistantView');
    toast('Photo request sent to assistants and admin review.');
  });
  $('assistantInbox').addEventListener('click', event => {
    const button = event.target.closest('[data-request]');
    if (!button) return;
    selectedRequest = button.dataset.request;
    renderQuotes();
    toast('Request selected for assistant reply.');
  });
  $('assistantReplyForm').addEventListener('submit', event => {
    event.preventDefault();
    const request = quoteRequests.find(item => item.id === selectedRequest) || quoteRequests[0];
    const reply = { id: 'q-' + Date.now(), requestId: request?.id || 'manual', shop: assistantShop.value.trim(), part: request?.part || 'Manual quote', price: Number(assistantPrice.value || 0), eta: assistantEta.value, condition: assistantCondition.value, note: assistantNote.value.trim() };
    quoteReplies.unshift(reply);
    apiRequest('/api/assistant-quote-replies', reply);
    renderQuotes();
    showView('quotesView');
    toast('Assistant quote added for owner approval.');
  });
  $('registerAssistantBtn').addEventListener('click', () => toast('Assistant registration profile saved for WhatsApp quoting.'));
  $('approveBestBtn').addEventListener('click', () => toast('Best quote approved and ready to send to customer.'));
  $('quoteList').addEventListener('click', event => {
    const cartButton = event.target.closest('[data-quote-cart]');
    const orderButton = event.target.closest('[data-quote-order]');
    const id = cartButton?.dataset.quoteCart || orderButton?.dataset.quoteOrder;
    if (!id) return;
    const reply = quoteReplies.find(item => item.id === id);
    if (!reply) return;
    cart.push({ id: 'quote-' + reply.id, name: reply.part, category: 'Quote', supplier: reply.shop, price: reply.price });
    renderCart();
    toast(orderButton ? 'Quote sent to customer and added to order.' : 'Quote added to order.');
    if (orderButton) showView('ordersView');
  });
  $('checkoutBtn').addEventListener('click', () => showView('ordersView'));
  $('checkoutForm').addEventListener('submit', event => {
    event.preventDefault();
    const total = cart.reduce((sum, item) => sum + item.price, 0);
    if (cart.length) {
      const order = { id: 'order-' + Date.now(), customerName: $('customerName').value, phone: $('customerPhone').value, fulfilment: $('fulfilment').value, payment: $('payment').value, total, items: cart };
      orders.unshift(order);
      apiRequest('/api/orders', order);
    }
    $('orderStatus').textContent = cart.length ? 'Order placed for ' + $('customerName').value + '. ' + $('fulfilment').value + ' selected. Total ' + money(total) + '.' : 'Add at least one part before placing an order.';
    toast(cart.length ? 'Order created.' : 'Cart is empty.');
  });
  $('whatsappLeadBtn').addEventListener('click', () => { showView('assistantView'); toast('Mock WhatsApp request sent to registered assistants.'); });
  $('socialLeadBtn').addEventListener('click', () => toast('Facebook Marketplace lead tagged for Speedy7 follow-up.'));
  $('adminCarForm').addEventListener('submit', event => {
    event.preventDefault();
    const part = parts.find(item => item.id === $('adminPartSelect').value);
    if (part) {
      const vin = $('adminVin').value.trim();
      const engine = $('adminEngine').value.trim();
      if (vin && !part.vins.includes(vin)) part.vins.push(vin);
      if (engine && !part.engines.includes(engine)) part.engines.push(engine);
      apiRequest('/api/compatibility-links', { partId: part.id, partName: part.name, vin, engine, vehicle: $('adminVehicle').value.trim() });
    }
    toast('Compatibility saved to VIN and engine lookup.');
    renderParts();
  });
  $('stockForm').addEventListener('submit', event => {
    event.preventDefault();
    const rowsText = $('stockRows').value;
    const rows = rowsText.split('\n').filter(Boolean).length;
    apiRequest('/api/stock-upload', { rows: rowsText });
    toast(rows + ' stock rows staged for upload.');
  });
}
function renderAll() {
  renderCategories();
  renderGarage();
  renderParts();
  renderQuotes();
  renderCart();
  renderSchema();
}
async function startApp() {
  await loadBackendData();
  await restoreAuth();
  await loadConnectionStatus();
  initEvents();
  renderAll();
  updateAuthUi();
}
startApp();
