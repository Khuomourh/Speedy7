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
let mobileAuthMode = 'signup';
let passwordRecoveryToken = '';
let partsView = window.localStorage.getItem('speedy7.parts-view') === 'grid' ? 'grid' : 'list';

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
    const headers = {};
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    if (authState.session?.accessToken) headers.Authorization = 'Bearer ' + authState.session.accessToken;
    const options = payload === undefined
      ? { headers }
      : { method: 'POST', headers, body: JSON.stringify(payload) };
    const response = await fetch(path, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (error) {
    console.warn('Speedy7 API request failed:', path, error.message);
    if (path !== '/api/bootstrap' && path !== '/api/connection') toast(error.message || 'Speedy7 could not save that change.');
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
  updateAuthUi();
}
function clearAuth() {
  authState = { session: null, profile: null };
  garage = [];
  quoteRequests = [];
  quoteReplies = [];
  orders = [];
  selectedVehicleId = null;
  window.localStorage.removeItem(authStorageKey);
  window.sessionStorage.removeItem(authStorageKey);
  updateAuthUi();
}
function setFormStatus(element, message, type) {
  element.textContent = message || '';
  element.classList.toggle('is-success', type === 'success');
  element.classList.toggle('is-error', type === 'error');
}
function openPasswordReset(mode = 'request') {
  const isUpdate = mode === 'update';
  $('passwordResetRequestForm').hidden = isUpdate;
  $('passwordUpdateForm').hidden = !isUpdate;
  $('passwordResetTitle').textContent = isUpdate ? 'Choose a new password' : 'Reset your password';
  if (!isUpdate) {
    $('passwordResetEmail').value = $('mobileEmail').value.trim() || $('loginEmail').value.trim();
    setFormStatus($('passwordResetRequestStatus'), '', '');
  } else {
    setFormStatus($('passwordUpdateStatus'), '', '');
  }
  $('passwordResetModal').hidden = false;
  document.body.classList.add('password-reset-open');
  window.setTimeout(() => (isUpdate ? $('passwordUpdateValue') : $('passwordResetEmail')).focus(), 0);
}
function closePasswordReset() {
  $('passwordResetModal').hidden = true;
  document.body.classList.remove('password-reset-open');
}
function openRecoveryLink() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (hash.get('type') !== 'recovery' || !hash.get('access_token')) return;
  passwordRecoveryToken = hash.get('access_token');
  document.body.classList.remove('mobile-splash-active');
  openPasswordReset('update');
}
function openMobileAccount() {
  if (!authState.profile) return;
  $('mobileAccountSheet').hidden = false;
  document.body.classList.add('mobile-sheet-open');
}
function closeMobileAccount() {
  if ($('mobileAccountSheet')) $('mobileAccountSheet').hidden = true;
  document.body.classList.remove('mobile-sheet-open');
}
async function logoutCurrentUser() {
  await authRequest('/api/auth/logout', { accessToken: authState.session?.accessToken });
  closeMobileAccount();
  clearAuth();
  showView('customerView');
  renderAll();
  toast('Logged out. Create an account or log in to continue.');
}
async function restoreAuth() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(authStorageKey) || window.sessionStorage.getItem(authStorageKey) || 'null');
    window.localStorage.removeItem(authStorageKey);
    window.sessionStorage.removeItem(authStorageKey);
    if (stored?.session?.accessToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: stored.session.accessToken })
      });
    }
    authState = { session: null, profile: null };
  } catch (error) {
    authState = { session: null, profile: null };
  }
}
function updateAuthControls() {
  const isSignup = $('authModeSelect')?.value === 'signup';
  const role = $('roleSelect')?.value || 'customer';
  if ($('fullNameLabel')) $('fullNameLabel').hidden = !isSignup;
  if ($('phoneLabel')) $('phoneLabel').hidden = !isSignup;
  if ($('adminInviteLabel')) $('adminInviteLabel').hidden = !(isSignup && role === 'admin');
  if ($('authSubmitBtn')) $('authSubmitBtn').textContent = isSignup ? 'Create account' : 'Log in';
  if ($('forgotPasswordBtn')) $('forgotPasswordBtn').hidden = isSignup;
  if ($('loginPassword')) $('loginPassword').autocomplete = isSignup ? 'new-password' : 'current-password';
}
function setMobileAuthMode(mode) {
  mobileAuthMode = mode === 'login' ? 'login' : 'signup';
  const isSignup = mobileAuthMode === 'signup';
  const selectedRole = $('mobileRole')?.value || 'customer';
  if ($('mobileFullNameLabel')) $('mobileFullNameLabel').hidden = !isSignup;
  if ($('mobilePhoneLabel')) $('mobilePhoneLabel').hidden = !isSignup;
  if ($('mobileRoleLabel')) $('mobileRoleLabel').hidden = !isSignup;
  if ($('mobileAdminInviteLabel')) $('mobileAdminInviteLabel').hidden = !(isSignup && selectedRole === 'admin');
  if ($('mobileFullName')) $('mobileFullName').required = isSignup;
  if ($('mobilePhone')) $('mobilePhone').required = isSignup;
  if ($('mobileRole')) $('mobileRole').required = isSignup;
  if ($('mobileAdminInvite')) $('mobileAdminInvite').required = isSignup && selectedRole === 'admin';
  if ($('mobilePassword')) $('mobilePassword').autocomplete = isSignup ? 'new-password' : 'current-password';
  if ($('mobileAuthTitle')) $('mobileAuthTitle').textContent = isSignup ? 'Create your account' : 'Welcome back';
  if ($('mobileAuthSubmit')) $('mobileAuthSubmit').textContent = isSignup ? 'Create account' : 'Log in';
  if ($('mobileForgotPasswordBtn')) $('mobileForgotPasswordBtn').hidden = isSignup;
  if ($('mobileAuthHint')) $('mobileAuthHint').textContent = isSignup
    ? 'Your vehicle details will be saved to your Speedy7 account.'
    : 'Log in to continue with your saved vehicles, quotes, and orders.';
  document.querySelectorAll('[data-mobile-auth-mode]').forEach(button => {
    const isActive = button.dataset.mobileAuthMode === mobileAuthMode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
}
function updateNavigationForRole(role) {
  document.querySelectorAll('.nav-item').forEach(button => {
    const viewId = button.dataset.view;
    const restricted = viewId === 'assistantView' || viewId === 'adminView';
    if (!role || role === 'admin' || !restricted) {
      button.hidden = false;
      return;
    }
    button.hidden = viewId === 'adminView' || (viewId === 'assistantView' && role !== 'assistant');
  });
}
function updateAuthUi() {
  const profile = authState.profile;
  document.body.classList.remove('mobile-auth-pending');
  document.body.classList.toggle('mobile-auth-required', !profile);
  updateNavigationForRole(profile?.role);
  setMobileAuthMode(mobileAuthMode);
  if ($('logoutBtn')) $('logoutBtn').hidden = !profile;
  if (!profile) {
    closeMobileAccount();
    if ($('loginStatus')) $('loginStatus').textContent = 'Guest browsing';
    updateAuthControls();
    return;
  }

  if ($('mobileAccountName')) $('mobileAccountName').textContent = profile.fullName || profile.email || 'Speedy7 customer';
  if ($('mobileAccountMeta')) $('mobileAccountMeta').textContent = roleLabel(profile.role) + (profile.email ? ' - ' + profile.email : '');
  if ($('mobileAssistantBtn')) $('mobileAssistantBtn').hidden = !['assistant', 'admin'].includes(profile.role);
  if ($('mobileAdminBtn')) $('mobileAdminBtn').hidden = profile.role !== 'admin';
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
function showProfileHome(profile) {
  if (profile?.role === 'assistant') showView('assistantView');
  else if (profile?.role === 'admin') showView('adminView');
  else showView('customerView');
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
async function loadAccountData() {
  if (!authState.session?.accessToken) return false;
  const data = await apiRequest('/api/account-data');
  if (!data) return false;
  garage = data.garage || [];
  quoteRequests = data.quoteRequests || [];
  quoteReplies = data.quoteReplies || [];
  orders = data.orders || [];
  if (data.metrics?.length) metrics = data.metrics;
  selectedVehicleId = garage[0]?.id || null;
  renderAll();
  return true;
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
function escapeAttribute(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}
function partVisual(part) {
  if (part.image) {
    return '<img src="' + escapeAttribute(part.image) + '" alt="' + escapeAttribute(part.name) + '" loading="lazy">';
  }
  return partSvg(part);
}
function setPartsView(view) {
  partsView = view === 'grid' ? 'grid' : 'list';
  window.localStorage.setItem('speedy7.parts-view', partsView);
  if ($('partsList')) $('partsList').classList.toggle('is-grid', partsView === 'grid');
  document.querySelectorAll('[data-parts-view]').forEach(button => {
    const isActive = button.dataset.partsView === partsView;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}
function openPartZoom(partId) {
  const part = parts.find(item => item.id === partId);
  if (!part) return;
  $('partZoomTitle').textContent = part.name;
  $('partZoomArtwork').innerHTML = partVisual(part);
  $('partZoomDetails').textContent = part.category + ' - ' + part.condition + ' - ' + money(part.price);
  $('partZoomModal').hidden = false;
  document.body.classList.add('part-zoom-open');
}
function closePartZoom() {
  $('partZoomModal').hidden = true;
  document.body.classList.remove('part-zoom-open');
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
  $('partsList').innerHTML = list.length ? list.map(part => '<article class="part-card"><button class="part-art" data-zoom-part="' + part.id + '" type="button" aria-label="View larger image of ' + escapeAttribute(part.name) + '">' + partVisual(part) + '<span class="part-zoom-hint">View</span></button><div class="part-info"><h3>' + part.name + '</h3><div class="price-row"><strong>' + money(part.price) + '</strong><span>estimate</span></div><div class="part-meta"><span>' + part.category + '</span><span>' + part.condition + '</span><span>' + part.stock + ' in stock</span><span>' + part.quotes + ' quotes</span></div><p class="plain-copy">Fits ' + part.engines.join(', ') + '. Supplier: ' + part.supplier + '. ETA ' + part.eta + '.</p><div class="part-actions"><button class="ghost-btn compact" data-action="quote" data-id="' + part.id + '" type="button">Get quote</button><button class="ghost-btn compact" data-action="cart" data-id="' + part.id + '" type="button">Add to order</button><button class="primary-btn compact" data-action="buy" data-id="' + part.id + '" type="button">Buy now</button></div></div></article>').join('') : '<p class="plain-copy">No matching parts yet. Send a photo quote so the owner can add it to the database.</p>';
  setPartsView(partsView);
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
  $('splashEnterBtn').addEventListener('click', () => {
    document.body.classList.remove('mobile-splash-active');
    $('mobileAuthGate').scrollTop = 0;
  });
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => showView(item.dataset.view)));
  document.querySelectorAll('[data-parts-view]').forEach(button => {
    button.addEventListener('click', () => setPartsView(button.dataset.partsView));
  });
  $('partZoomBackdrop').addEventListener('click', closePartZoom);
  $('partZoomClose').addEventListener('click', closePartZoom);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('partZoomModal').hidden) closePartZoom();
  });
  $('mobileAccountBtn').addEventListener('click', openMobileAccount);
  $('mobileAccountBackdrop').addEventListener('click', closeMobileAccount);
  $('mobileAccountClose').addEventListener('click', closeMobileAccount);
  $('mobileLogoutBtn').addEventListener('click', logoutCurrentUser);
  $('mobileForgotPasswordBtn').addEventListener('click', () => openPasswordReset('request'));
  $('forgotPasswordBtn').addEventListener('click', () => openPasswordReset('request'));
  $('passwordResetBackdrop').addEventListener('click', closePasswordReset);
  $('passwordResetClose').addEventListener('click', closePasswordReset);
  $('passwordResetRequestForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('passwordResetRequestBtn');
    button.disabled = true;
    button.textContent = 'Sending...';
    setFormStatus($('passwordResetRequestStatus'), '', '');
    const data = await authRequest('/api/auth/forgot-password', {
      email: $('passwordResetEmail').value.trim()
    });
    button.disabled = false;
    button.textContent = 'Send reset link';
    if (!data) {
      setFormStatus($('passwordResetRequestStatus'), 'The reset email could not be sent. Please try again.', 'error');
      return;
    }
    setFormStatus($('passwordResetRequestStatus'), data.message, 'success');
  });
  $('passwordUpdateForm').addEventListener('submit', async event => {
    event.preventDefault();
    const password = $('passwordUpdateValue').value;
    const confirmPassword = $('passwordUpdateConfirm').value;
    if (password !== confirmPassword) {
      setFormStatus($('passwordUpdateStatus'), 'The two passwords do not match.', 'error');
      return;
    }
    const button = $('passwordUpdateBtn');
    button.disabled = true;
    button.textContent = 'Saving...';
    const data = await authRequest('/api/auth/reset-password', {
      accessToken: passwordRecoveryToken,
      password
    });
    button.disabled = false;
    button.textContent = 'Save new password';
    if (!data) {
      setFormStatus($('passwordUpdateStatus'), 'The password could not be updated. Request a new reset link.', 'error');
      return;
    }
    passwordRecoveryToken = '';
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    $('passwordUpdateValue').value = '';
    $('passwordUpdateConfirm').value = '';
    setMobileAuthMode('login');
    setFormStatus($('passwordUpdateStatus'), data.message, 'success');
    window.setTimeout(() => {
      closePasswordReset();
      toast('Password updated. Log in with your new password.');
    }, 900);
  });
  $('mobileAssistantBtn').addEventListener('click', () => {
    closeMobileAccount();
    showView('assistantView');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('mobileAdminBtn').addEventListener('click', () => {
    closeMobileAccount();
    showView('adminView');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.querySelectorAll('[data-mobile-auth-mode]').forEach(button => {
    button.addEventListener('click', () => setMobileAuthMode(button.dataset.mobileAuthMode));
  });
  $('mobileRole').addEventListener('change', () => setMobileAuthMode(mobileAuthMode));
  $('mobileAuthForm').addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = $('mobileAuthSubmit');
    submitButton.disabled = true;
    submitButton.textContent = mobileAuthMode === 'signup' ? 'Creating account...' : 'Logging in...';
    const data = await authRequest('/api/auth/' + mobileAuthMode, {
      email: $('mobileEmail').value.trim(),
      password: $('mobilePassword').value,
      fullName: $('mobileFullName').value.trim(),
      phone: $('mobilePhone').value.trim(),
      role: mobileAuthMode === 'signup' ? $('mobileRole').value : 'customer',
      adminInviteCode: $('mobileAdminInvite').value
    });
    submitButton.disabled = false;
    setMobileAuthMode(mobileAuthMode);
    if (!data?.profile) return;
    saveAuth(data);
    await loadAccountData();
    showProfileHome(data.profile);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(data.message || 'Welcome to Speedy7.');
  });
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
    await loadAccountData();
    showProfileHome(data.profile);
    toast(data.message || 'Logged in.');
  });
  $('logoutBtn').addEventListener('click', logoutCurrentUser);
  $('carForm').addEventListener('submit', async event => {
    event.preventDefault();
    const label = $('vehicleInput').value.trim() || 'Vehicle pending details';
    const words = label.split(' ');
    const car = { id: 'veh-' + Date.now(), vin: $('vinInput').value.trim(), engine: $('engineInput').value.trim(), label, make: words[0] || 'Unknown', model: words.slice(1, -1).join(' ') || 'Model', year: words[words.length - 1] || 'Year' };
    const savedCar = await apiRequest('/api/vehicles', car);
    if (!savedCar) return;
    garage.unshift(savedCar);
    selectedVehicleId = savedCar.id;
    $('searchInput').value = savedCar.engine;
    renderAll();
    toast('Car saved and linked to engine search.');
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
  $('partsList').addEventListener('click', async event => {
    const zoomButton = event.target.closest('[data-zoom-part]');
    if (zoomButton) {
      openPartZoom(zoomButton.dataset.zoomPart);
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const part = parts.find(item => item.id === button.dataset.id);
    if (!part) return;
    if (button.dataset.action === 'quote') {
      const vehicle = selectedVehicle();
      const request = await apiRequest('/api/quote-requests', {
        partId: part.id,
        vehicleId: vehicle?.id,
        part: part.name,
        description: part.name,
        vehicle: vehicle?.label || 'Selected vehicle',
        channel: 'App search'
      });
      if (!request) return;
      quoteRequests.unshift(request);
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
  $('photoQuoteForm').addEventListener('submit', async event => {
    event.preventDefault();
    const vehicle = garage.find(item => item.id === $('photoVehicleSelect').value) || selectedVehicle();
    const description = $('photoDescription').value.trim() || 'Unknown part from customer photo';
    const request = await apiRequest('/api/quote-requests', {
      vehicleId: vehicle?.id,
      part: description,
      description,
      vehicle: vehicle?.label || 'Selected vehicle',
      channel: 'Photo upload'
    });
    if (!request) return;
    quoteRequests.unshift(request);
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
  $('assistantReplyForm').addEventListener('submit', async event => {
    event.preventDefault();
    const request = quoteRequests.find(item => item.id === selectedRequest) || quoteRequests[0];
    if (!request) {
      toast('Select a customer quote request first.');
      return;
    }
    const reply = await apiRequest('/api/assistant-quote-replies', { requestId: request.id, shop: assistantShop.value.trim(), part: request.part || 'Manual quote', price: Number(assistantPrice.value || 0), eta: assistantEta.value, condition: assistantCondition.value, note: assistantNote.value.trim() });
    if (!reply) return;
    quoteReplies.unshift(reply);
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
    cart.push({ id: 'quote-' + reply.id, quoteReplyId: reply.id, name: reply.part, category: 'Quote', supplier: reply.shop, price: reply.price });
    renderCart();
    toast(orderButton ? 'Quote sent to customer and added to order.' : 'Quote added to order.');
    if (orderButton) showView('ordersView');
  });
  $('checkoutBtn').addEventListener('click', () => showView('ordersView'));
  $('checkoutForm').addEventListener('submit', async event => {
    event.preventDefault();
    const total = cart.reduce((sum, item) => sum + item.price, 0);
    if (!cart.length) {
      $('orderStatus').textContent = 'Add at least one part before placing an order.';
      toast('Cart is empty.');
      return;
    }
    const order = await apiRequest('/api/orders', { customerName: $('customerName').value, phone: $('customerPhone').value, fulfilment: $('fulfilment').value, payment: $('payment').value, total, items: cart });
    if (!order) return;
    orders.unshift(order);
    cart = [];
    renderCart();
    $('orderStatus').textContent = 'Order placed for ' + order.customerName + '. ' + order.fulfilment + ' selected. Total ' + money(order.total) + '.';
    toast('Order saved to Speedy7.');
  });
  $('whatsappLeadBtn').addEventListener('click', () => { showView('assistantView'); toast('Mock WhatsApp request sent to registered assistants.'); });
  $('socialLeadBtn').addEventListener('click', () => toast('Facebook Marketplace lead tagged for Speedy7 follow-up.'));
  $('adminCarForm').addEventListener('submit', async event => {
    event.preventDefault();
    const part = parts.find(item => item.id === $('adminPartSelect').value);
    if (part) {
      const vin = $('adminVin').value.trim();
      const engine = $('adminEngine').value.trim();
      const savedLink = await apiRequest('/api/compatibility-links', { partId: part.id, partName: part.name, vin, engine, vehicle: $('adminVehicle').value.trim() });
      if (!savedLink) return;
      if (vin && !part.vins.includes(vin)) part.vins.push(vin);
      if (engine && !part.engines.includes(engine)) part.engines.push(engine);
    }
    toast('Compatibility saved to VIN and engine lookup.');
    renderParts();
  });
  $('stockForm').addEventListener('submit', async event => {
    event.preventDefault();
    const rowsText = $('stockRows').value;
    const rows = rowsText.split('\n').filter(Boolean).length;
    const result = await apiRequest('/api/stock-upload', { rows: rowsText });
    if (!result) return;
    toast((result.rowsSaved || rows) + ' stock rows saved to Supabase.');
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
  openRecoveryLink();
}
startApp();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(error => {
      console.warn('Speedy7 offline support is unavailable:', error.message);
    });
  });
}
