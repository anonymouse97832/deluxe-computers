// Supabase Configuration
const SUPABASE_URL = 'https://fnxonryudwpusndhuozk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_PbZUnHfywNHdv4xzCsCKOA_CZNGnF0y';

let db = null;
if (typeof supabase !== 'undefined') {
  try {
    db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch(e) {
    console.warn("Supabase init error:", e);
  }
}

/* DeluxePOS Pro Ultimate - Fully Merged Real-Time Engine */

window.state = {
  products: [],
  sales: [],
  salesReturns: [],
  transfers: [],
  suppliers: [],
  supplierPayments: [],
  customers: [],
  expenses: [],
  users: [
    { id: "user-admin", username: "ADMIN", password: "123", role: "ADMIN", name: "ADMINISTRATOR" },
    { id: "user-cashier", username: "CASHIER", password: "1234", role: "CASHIER", name: "CASHIER" }
  ],
  settings: {
    businessName: "DELUXE POS",
    businessSub: "DELUXE COMPUTER SPEAKERS & ACCESSORIES",
    receiptAddress: "NEAR CLOCK TOWER NEAM KE CHARI SHOP NO#38 SUKKUR",
    receiptFooter: "THANK YOU COME AGAIN !",
    shortcuts: {
      sale: "F1", returns: "F2", customerHistory: "F3", transactions: "F4",
      duplicateBill: "F5", focusSearch: "F8", completeSale: "ALT+S", clearCart: "ALT+C"
    }
  }
};

window.currentSession = null;
window.selectedLocation = null;
window.cart = [];
window.selectedCartIndex = null;
window.discountType = "RS";

const $ = id => document.getElementById(id);
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = v => "RS. " + num(v).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s ?? "").toUpperCase().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => {
  let d = new Date(), o = d.getTimezoneOffset();
  return new Date(d.getTime() - o * 60000).toISOString().slice(0, 10);
};

// Universal Caps Lock conversion
document.addEventListener("input", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
    if (e.target.type !== "password" && e.target.type !== "date" && e.target.type !== "file") {
      let start = e.target.selectionStart;
      let end = e.target.selectionEnd;
      e.target.value = e.target.value.toUpperCase();
      if (start !== null && end !== null) e.target.setSelectionRange(start, end);
    }
  }
});

// Toast System
window.toast = function(msg, type = "success") {
  let t = $("toast");
  if (!t) return;
  t.textContent = String(msg).toUpperCase();
  t.classList.add("show");
  t.classList.toggle("error-toast", type === "error");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
};

// AUTO BARCODE / QR GENERATION LOGIC
window.nextCompanyBarcode = function(company) {
  let prefix = (String(company || "").trim()[0] || "P").toUpperCase();
  let max = 1000;
  window.state.products.forEach(p => {
    let code = String(p.barcode || "").trim().toUpperCase();
    let m = code.match(new RegExp("^" + prefix + "(\d+)$"));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return prefix + String(max + 1);
};

window.suggestProductBarcode = function() {
  let company = $("productCompany")?.value.trim();
  if (!company) return;
  let box = $("productBarcode");
  if (box && !box.dataset.manual) {
    box.value = window.nextCompanyBarcode(company);
  }
};

// Storage Persistence Functions
window.saveState = async function() {
  try {
    localStorage.setItem("DELUXEPOS_STATE", JSON.stringify(window.state));
    if (db) {
      const { error } = await db.from('pos_data').upsert({ id: 1, state_json: window.state });
      if (error) console.error('Cloud Sync Error:', error);
    }
  } catch (err) {
    console.error("State save error", err);
  }
};

window.loadState = async function() {
  try {
    let cloudLoaded = false;
    if (db) {
      const { data, error } = await db.from('pos_data').select('state_json').eq('id', 1).single();
      if (!error && data && data.state_json) {
        window.state = { ...window.state, ...data.state_json };
        cloudLoaded = true;
      }
    }
    if (!cloudLoaded) {
      const raw = localStorage.getItem("DELUXEPOS_STATE");
      if (raw) {
        const parsed = JSON.parse(raw);
        window.state = { ...window.state, ...parsed };
      }
    }
    if (!window.state.settings) window.state.settings = {};
    if (!window.state.settings.shortcuts) {
      window.state.settings.shortcuts = { sale: "F1", returns: "F2", customerHistory: "F3", transactions: "F4", duplicateBill: "F5", focusSearch: "F8", completeSale: "ALT+S", clearCart: "ALT+C" };
    }
    if (!Array.isArray(window.state.salesReturns)) window.state.salesReturns = [];
    if (!Array.isArray(window.state.transfers)) window.state.transfers = [];
    if (!Array.isArray(window.state.supplierPayments)) window.state.supplierPayments = [];
  } catch (err) {
    console.error("State load error", err);
  }
};

// Backup & Restore
window.exportBackup = function() {
  window.saveState();
  const blob = new Blob([JSON.stringify(window.state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `DeluxePOS_Data_${today()}.json`;
  a.click();
  window.toast("DATA EXPORTED SUCCESSFULLY!");
};

window.restoreBackup = function() {
  const fileInput = $("restoreFile");
  const file = fileInput.files[0];
  if (!file) { window.toast("SELECT A VALID JSON BACKUP FILE.", "error"); return; }
  const reader = new FileReader();
  reader.onload = function() {
    try {
      window.state = JSON.parse(reader.result);
      window.saveState();
      window.refreshAll();
      window.toast("DATA RESTORED SUCCESSFULLY!");
    } catch (err) {
      window.toast("INVALID BACKUP FILE FORMAT.", "error");
    }
  };
  reader.readAsText(file);
};

// Location & Login Logic
window.selectLocation = function(loc) {
  window.selectedLocation = loc;
  $("loginLocation").textContent = loc + " LOGIN";
  $("locationScreen").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
};

window.backToLocation = function() {
  $("loginScreen").classList.add("hidden");
  $("locationScreen").classList.remove("hidden");
};

window.handleLogin = function(e) {
  if (e) e.preventDefault();
  let u = $("loginUsername").value.trim().toUpperCase();
  let p = $("loginPassword").value;
  let r = $("loginRole").value;

  let user = window.state.users.find(x => x.username.toUpperCase() === u && x.password === p && x.role === r);
  if (!user) {
    $("loginError").textContent = "INCORRECT USERNAME OR PASSWORD.";
    return;
  }
  $("loginError").textContent = "";
  window.currentSession = { userId: user.id, username: user.username, name: user.name || user.username, role: user.role, location: window.selectedLocation };
  
  $("locationScreen").classList.add("hidden");
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  
  $("sideUser").textContent = window.currentSession.name;
  $("sideMeta").textContent = window.currentSession.role + " - " + window.currentSession.location;
  $("topLocation").textContent = window.currentSession.location;
  
  window.updateShortcutLabels();
  window.refreshAll();
  window.navigate("sale");
};

window.logout = function() {
  if (!confirm("LOGOUT POS SYSTEM?")) return;
  window.currentSession = null;
  window.selectedLocation = null;
  window.cart = [];
  $("appShell").classList.add("hidden");
  $("locationScreen").classList.remove("hidden");
};

// Page Navigation
const PAGES = {
  overview: "overviewPage", sale: "salePage", returns: "returnsPage", stock: "stockPage",
  inventory: "inventoryPage", receiving: "receivingPage", transfer: "transferPage", khata: "khataPage",
  transactions: "transactionsPage", duplicateBill: "duplicateBillPage", reports: "reportsPage",
  customerHistory: "customerHistoryPage", expenses: "expensesPage", suppliers: "suppliersPage",
  users: "usersPage", backup: "backupPage", settings: "settingsPage", password: "passwordPage"
};

window.navigate = function(pageName) {
  document.querySelectorAll("#page > section").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".nav-link").forEach(btn => btn.classList.remove("active"));
  
  if ($(PAGES[pageName])) {
    $(PAGES[pageName]).classList.remove("hidden");
  }
  const activeBtn = document.querySelector(`.nav-link[data-page="${pageName}"]`);
  if (activeBtn) activeBtn.classList.add("active");
  
  $("pageTitle").textContent = pageName.toUpperCase() + " SECTION";

  if (pageName === "sale") window.populateKhataDropdown();
  if (pageName === "overview") window.renderDashboard();
  if (pageName === "stock") window.renderProducts();
  if (pageName === "receiving") window.renderReceiving();
  if (pageName === "transfer") window.renderTransferOptions();
  if (pageName === "suppliers") window.renderSuppliers();
  if (pageName === "khata") window.renderCustomers();
  if (pageName === "transactions") window.renderTransactions();
  if (pageName === "duplicateBill") window.renderDuplicateBills();
  if (pageName === "returns") window.renderReturnsHistory();
  if (pageName === "customerHistory") window.renderCustomerHistory();
  if (pageName === "expenses") window.renderExpenses();
  if (pageName === "users") window.renderUsers();
  if (pageName === "inventory") window.renderInventory();
  if (pageName === "settings") window.loadShortcutSettingsToForm();
  if (pageName === "reports") window.initReportsDropdown();
};

window.updateShortcutLabels = function() {
  const sc = window.state.settings.shortcuts;
  for (let k in sc) {
    document.querySelectorAll(`.key-lbl-${k}`).forEach(el => el.textContent = sc[k]);
  }
};

window.loadShortcutSettingsToForm = function() {
  const sc = window.state.settings.shortcuts;
  if ($("keySale")) $("keySale").value = sc.sale || "F1";
  if ($("keyReturns")) $("keyReturns").value = sc.returns || "F2";
  if ($("keyCustomerHistory")) $("keyCustomerHistory").value = sc.customerHistory || "F3";
  if ($("keyTransactions")) $("keyTransactions").value = sc.transactions || "F4";
  if ($("keyDuplicateBill")) $("keyDuplicateBill").value = sc.duplicateBill || "F5";
  if ($("keyFocusSearch")) $("keyFocusSearch").value = sc.focusSearch || "F8";
  if ($("keyCompleteSale")) $("keyCompleteSale").value = sc.completeSale || "ALT+S";
  if ($("keyClearCart")) $("keyClearCart").value = sc.clearCart || "ALT+C";
  if ($("settingBusinessName")) $("settingBusinessName").value = window.state.settings.businessName || "DELUXE POS";
  if ($("settingBusinessSub")) $("settingBusinessSub").value = window.state.settings.businessSub || "DELUXE COMPUTER SPEAKERS & ACCESSORIES";
  if ($("settingReceiptAddress")) $("settingReceiptAddress").value = window.state.settings.receiptAddress || "NEAR CLOCK TOWER NEAM KE CHARI SHOP NO#38 SUKKUR";
  if ($("settingReceiptFooter")) $("settingReceiptFooter").value = window.state.settings.receiptFooter || "THANK YOU COME AGAIN !";
};

window.saveBusinessSettings = function() {
  window.state.settings.businessName = $("settingBusinessName").value.trim() || "DELUXE POS";
  window.state.settings.businessSub = $("settingBusinessSub").value.trim() || "DELUXE COMPUTER SPEAKERS & ACCESSORIES";
  window.state.settings.receiptAddress = $("settingReceiptAddress").value.trim() || "NEAR CLOCK TOWER NEAM KE CHARI SHOP NO#38 SUKKUR";
  window.state.settings.receiptFooter = $("settingReceiptFooter").value.trim() || "THANK YOU COME AGAIN !";
  window.saveState();
  window.toast("BUSINESS SETTINGS & RECEIPT ADDRESS SAVED!");
};

function stockInLoc(p, loc) { return (p.batches || []).filter(b => b.location === loc).reduce((s, b) => s + num(b.remaining), 0); }
function totalStock(p) { return stockInLoc(p, "STORE") + stockInLoc(p, "SHOP"); }
function productPrice(p) {
  let b = (p.batches || []).filter(x => num(x.salePrice) > 0).slice(-1)[0];
  return b ? num(b.salePrice) : num(p.salePrice);
}

function calculateTotalMarketBalance() {
  let totalMarketBal = 0;
  (window.state.suppliers || []).forEach(s => {
    let purchases = 0;
    (window.state.products || []).forEach(p => (p.batches || []).forEach(b => {
      if (b.seller && b.seller.toUpperCase() === s.name.toUpperCase()) {
        purchases += (b.received * b.purchaseCost) + num(b.kata) + num(b.transport) - num(b.paidNow);
      }
    }));
    let paid = (window.state.supplierPayments || []).filter(p => p.supplierId === s.id).reduce((n, p) => n + p.amount, 0);
    totalMarketBal += (num(s.openingBalance) + purchases - paid);
  });
  return totalMarketBal;
}

window.calculateSupplierBalance = function(s) {
  let purchases = 0;
  (window.state.products || []).forEach(p => (p.batches || []).forEach(b => {
    if (b.seller && b.seller.toUpperCase() === s.name.toUpperCase()) {
      purchases += (b.received * b.purchaseCost) + num(b.kata) + num(b.transport) - num(b.paidNow);
    }
  }));
  let paid = (window.state.supplierPayments || []).filter(p => p.supplierId === s.id).reduce((n, p) => n + p.amount, 0);
  return num(s.openingBalance) + purchases - paid;
};

function subtotal() { return window.cart.reduce((s, x) => s + (x.quantity * x.unitPrice), 0); }

function calculateDiscountAmount() {
  const raw = num($("saleDiscount")?.value);
  const sub = subtotal();
  return window.discountType === "%" ? (sub * raw) / 100 : raw;
}

function currentBillTotal() { return Math.max(0, subtotal() - calculateDiscountAmount()); }

function getSelectedKhataCustomer() {
  const q = ($("khataCustomerCode")?.value || "").trim().toUpperCase();
  if (!q) return null;
  return window.state.customers.find(c => (c.code || "").toUpperCase() === q || (c.name || "").toUpperCase() === q || (c.phone || "").toUpperCase() === q) || null;
}

function calculateCustomerBalance(cust) {
  if (!cust) return 0;
  let bal = num(cust.balance);
  window.state.sales.filter(s => s.customerId === cust.id).forEach(s => {
    bal += num(s.total) - num(s.paid);
  });
  window.state.salesReturns.filter(r => r.customerId === cust.id).forEach(r => {
    bal -= num(r.totalRefund);
  });
  return bal;
}

window.toggleCustomerType = function() {
  const isKhata = $("customerType").value === "KHATA";
  $("khataCustomerFields")?.classList.toggle("hidden", !isKhata);
  window.updateBillingTotals();
};

window.toggleDiscountType = function() {
  window.discountType = window.discountType === "RS" ? "%" : "RS";
  $("discountTypeToggle").textContent = window.discountType;
  window.updateBillingTotals();
};

window.updateBillingTotals = function() {
  const isKhata = $("customerType")?.value === "KHATA";
  const cust = isKhata ? getSelectedKhataCustomer() : null;
  const prevBal = cust ? calculateCustomerBalance(cust) : 0;
  const includePrev = isKhata && !!$("includePreviousBalance")?.checked;
  
  if ($("khataCustomerMatch")) {
    $("khataCustomerMatch").textContent = cust ? `MATCHED: ${esc(cust.name)} (BALANCE: ${money(prevBal)})` : (isKhata && $("khataCustomerCode")?.value ? "CUSTOMER NOT FOUND." : "");
  }

  const curBillAfterDiscount = currentBillTotal(); 
  const netPayable = curBillAfterDiscount + (includePrev ? prevBal : 0);
  const cashRec = num($("cashReceived")?.value);

  if ($("currentBillAmount")) $("currentBillAmount").textContent = money(curBillAfterDiscount);
  if ($("previousBalanceAmount")) $("previousBalanceAmount").textContent = money(prevBal);
  if ($("netPayableAmount")) $("netPayableAmount").textContent = money(netPayable);
  if ($("remainingDueAmount")) $("remainingDueAmount").textContent = money(Math.max(0, netPayable - cashRec));
  if ($("changeReturnAmount")) $("changeReturnAmount").textContent = money(Math.max(0, cashRec - netPayable));
};

window.populateKhataDropdown = function() {
  window.updateBillingTotals();
};

window.updateProductSearchResults = function() {
  const host = $("productSearchResults");
  const query = $("barcodeSearch")?.value.trim().toUpperCase() || "";
  if (!query) { host.innerHTML = ""; return; }

  const matches = window.state.products.filter(p => stockInLoc(p, window.currentSession?.location) > 0 && [p.barcode, p.name, p.model, p.company].some(v => String(v || "").toUpperCase().includes(query))).slice(0, 10);

  host.innerHTML = matches.length ? matches.map(p => `
    <div class="product-result">
      <span><b>${esc(p.name)}</b> <small>${esc(p.model)} | BARCODE: ${esc(p.barcode || "N/A")}</small></span>
      <div style="display:flex; align-items:center; gap:8px;">
        <strong>${money(productPrice(p))}</strong>
        <button type="button" class="cost-price-btn" onclick="window.toast('PURCHASE COST: ' + money(${p.purchaseCost}))">COST PRICE</button>
        <button type="button" class="button-success btn-add-item" onclick="window.openAddProductModal('${p.id}')">+ ADD</button>
      </div>
    </div>
  `).join("") : '<p class="muted">NO MATCHING PRODUCTS IN STOCK.</p>';
};

window.openAddProductModal = function(productId) {
  let p = window.state.products.find(x => x.id === productId);
  if (!p) return;

  let existingModal = $("editCartModal");
  if (existingModal) existingModal.remove();

  let modal = document.createElement("div");
  modal.id = "editCartModal";
  modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999;";
  
  let pPrice = productPrice(p);
  
  modal.innerHTML = `
    <div class="panel" style="width:360px; background:#202020; border:1px solid var(--red); border-radius:12px; padding:20px; box-shadow:0 10px 30px #000;">
      <h3 style="margin-bottom:12px;">EDIT CART ITEM</h3>
      <p style="color:#ffb8ba; font-weight:bold; margin-bottom:15px;">Add Item: ${esc(p.name)} (${esc(p.model)})</p>
      
      <label>QUANTITY</label>
      <input id="modalItemQty" type="number" min="1" value="1" style="margin-bottom:15px;">
      
      <label>UNIT PRICE (Rs.)</label>
      <input id="modalUnitPrice" type="number" step="0.01" value="${pPrice}" style="margin-bottom:20px;">
      
      <div style="display:flex; gap:10px;">
        <button type="button" class="button-success" style="flex:1;" onclick="window.saveModalCartItem('${p.id}')">SAVE CHANGES</button>
        <button type="button" class="button-muted" style="flex:1;" onclick="document.getElementById('editCartModal').remove()">CANCEL</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  setTimeout(() => $("modalItemQty")?.focus(), 100);
};

window.saveModalCartItem = function(productId) {
  let p = window.state.products.find(x => x.id === productId);
  if (!p) return;

  let qty = num($("modalItemQty").value);
  let customPrice = num($("modalUnitPrice").value);

  if (qty <= 0) { window.toast("ENTER VALID QUANTITY", "error"); return; }

  let avail = stockInLoc(p, window.currentSession.location);
  let existing = window.cart.find(x => x.productId === p.id);
  let qtyInCart = existing ? existing.quantity : 0;

  if (qtyInCart + qty > avail) {
    window.toast("INSUFFICIENT STOCK IN THIS LOCATION!", "error");
    return;
  }

  if (existing) {
    existing.quantity += qty;
    existing.unitPrice = customPrice;
  } else {
    window.cart.push({ productId: p.id, barcode: p.barcode, name: p.name, model: p.model, quantity: qty, unitPrice: customPrice });
  }

  $("barcodeSearch").value = "";
  $("productSearchResults").innerHTML = "";
  let modal = $("editCartModal"); if (modal) modal.remove();
  window.renderCart();
  window.toast("ITEM ADDED TO BILL!");
};

window.addToCart = function(productId) {
  let p = productId ? window.state.products.find(x => x.id === productId) : null;
  const query = $("barcodeSearch")?.value.trim().toUpperCase() || "";
  if (!p && query) {
    let matches = window.state.products.filter(x => stockInLoc(x, window.currentSession.location) > 0 && [x.barcode, x.name, x.model, x.company].some(v => String(v || "").toUpperCase().includes(query)));
    if (matches.length === 1) p = matches[0];
  }
  if (!p) { window.toast("PRODUCT NOT FOUND OR OUT OF STOCK.", "error"); return; }
  window.openAddProductModal(p.id);
};

window.renderCart = function() {
  const b = $("cartTableBody");
  b.innerHTML = window.cart.map((x, i) => `
    <tr class="cart-select-row ${window.selectedCartIndex === i ? "selected" : ""}" onclick="window.selectedCartIndex=${i}; window.renderCart();">
      <td>${esc(x.barcode || "-")}</td>
      <td>${esc(x.name)} <small>${esc(x.model)}</small></td>
      <td>${money(x.unitPrice)}</td>
      <td>${x.quantity}</td>
      <td>${money(x.quantity * x.unitPrice)}</td>
      <td><button type="button" class="button-muted" onclick="window.removeCart(${i})">X</button></td>
    </tr>
  `).join("") || '<tr><td colspan="6" class="empty">BILL IS EMPTY</td></tr>';
  
  $("billItemCount").textContent = window.cart.reduce((n, x) => n + x.quantity, 0) + " ITEMS";
  window.updateBillingTotals();
};

window.removeCart = function(index) {
  window.cart.splice(index, 1);
  window.selectedCartIndex = null;
  window.renderCart();
};

window.removeSelectedCart = function() {
  if (window.selectedCartIndex !== null) {
    window.removeCart(window.selectedCartIndex);
  } else {
    window.toast("SELECT AN ITEM IN BILL FIRST.", "error");
  }
};

window.clearCart = function() {
  window.cart = [];
  window.selectedCartIndex = null;
  window.renderCart();
  window.toast("BILL CLEARED!");
};

window.completeSale = function() {
  if (!window.cart.length) { window.toast("BILL IS EMPTY.", "error"); return; }
  const isKhata = $("customerType").value === "KHATA";
  const cust = isKhata ? getSelectedKhataCustomer() : null;
  if (isKhata && !cust) { window.toast("PLEASE SELECT / ENTER A VALID KHATA CUSTOMER.", "error"); return; }

  const prevBal = cust ? calculateCustomerBalance(cust) : 0;
  const includePrev = isKhata && !!$("includePreviousBalance").checked;
  const curBill = currentBillTotal();
  const netPayable = curBill + (includePrev ? prevBal : 0);
  const cashRec = num($("cashReceived").value);
  const paid = Math.min(cashRec, netPayable);
  const due = Math.max(0, netPayable - paid);

  if (!isKhata && due > 0) {
    window.toast("WALKING CUSTOMER KO UDHAR ALLOWED NAHI HAI!", "error");
    return;
  }

  const sale = {
    id: "INV-" + Date.now(),
    invoiceNumber: "INV-" + String(window.state.sales.length + 1).padStart(6, "0"),
    date: today(),
    time: new Date().toLocaleTimeString(),
    customer: cust ? cust.name : "WALKING CUSTOMER",
    customerId: cust ? cust.id : null,
    customerCode: cust ? cust.code : "",
    customerType: isKhata ? "KHATA" : "WALKING",
    items: [...window.cart],
    subtotal: subtotal(),
    discount: calculateDiscountAmount(),
    total: curBill,
    paid: paid,
    due: due,
    cashier: window.currentSession.username,
    location: window.currentSession.location
  };

  for (let item of window.cart) {
    let p = window.state.products.find(x => x.id === item.productId);
    if (p) {
      let rem = item.quantity;
      for (let b of p.batches.filter(z => z.location === window.currentSession.location && z.remaining > 0)) {
        let deduct = Math.min(rem, b.remaining);
        b.remaining -= deduct;
        rem -= deduct;
        if (rem <= 0) break;
      }
    }
  }

  window.state.sales.push(sale);
  window.saveState();
  window.cart = [];
  window.selectedCartIndex = null;
  $("saleDiscount").value = 0;
  $("cashReceived").value = 0;
  if ($("khataCustomerCode")) $("khataCustomerCode").value = "";
  window.renderCart();
  window.refreshAll();
  window.printThermalReceipt(sale);
  window.toast("SALE SAVED: " + sale.invoiceNumber);
};

window.printThermalReceipt = function(sale) {
  let old = document.getElementById("receiptPrintContainer"); if (old) old.remove();
  let d = document.createElement("div");
  d.id = "receiptPrintContainer";
  const itemsHTML = (sale.items || []).map(x => `
    <tr>
      <td style="text-align:left;">${esc(x.name)} ${esc(x.model)}</td>
      <td style="text-align:center;">${x.quantity}</td>
      <td style="text-align:right;">${num(x.unitPrice).toFixed(2)}</td>
      <td style="text-align:right;">${(x.quantity * x.unitPrice).toFixed(2)}</td>
    </tr>
  `).join("");

  const bName = window.state.settings.businessName || "DELUXE POS";
  const bSub = window.state.settings.businessSub || "DELUXE COMPUTER SPEAKERS & ACCESSORIES";
  const rAddr = window.state.settings.receiptAddress || "NEAR CLOCK TOWER NEAM KE CHARI SHOP NO#38 SUKKUR";
  const rFoot = window.state.settings.receiptFooter || "THANK YOU COME AGAIN !";

  d.innerHTML = `
    <div class="receipt-preview">
      <h2 style="text-align:center; font-size:16px; margin:0; font-weight:900;">${esc(bName)}</h2>
      <p style="text-align:center; font-size:10px; margin:2px 0 6px 0; font-weight:bold; text-transform:uppercase;">${esc(bSub)}</p>
      
      <div class="receipt-divider"></div>
      
      <p>INVOICE #: <b>${esc(sale.invoiceNumber)}</b></p>
      <p>DATE: ${esc(sale.date)} ${esc(sale.time)}</p>
      <p>CASHIER: ${esc(sale.cashier)}</p>
      <p>CUSTOMER: ${esc(sale.customer)}</p>
      
      <div class="receipt-divider"></div>
      
      <table>
        <thead>
          <tr>
            <th style="text-align:left;">ITEM</th>
            <th style="text-align:center;">QTY</th>
            <th style="text-align:right;">PRICE</th>
            <th style="text-align:right;">TOTAL</th>
          </tr>
        </thead>
        <tbody>${itemsHTML}</tbody>
      </table>
      
      <div class="receipt-divider"></div>
      
      <p>SUBTOTAL: <span style="float:right;">${money(sale.subtotal)}</span></p>
      <p>DISCOUNT: <span style="float:right;">${money(sale.discount)}</span></p>
      <p style="font-weight:bold; font-size:11px;">NET PAYABLE: <span style="float:right;">${money(sale.total)}</span></p>
      <p>PAID AMOUNT: <span style="float:right;">${money(sale.paid)}</span></p>
      <p>REMAINING DUE: <span style="float:right;">${money(sale.due)}</span></p>
      
      <div class="receipt-divider"></div>
      
      <p style="text-align:center; margin-top:6px; font-weight:bold; font-size:9px; text-transform:uppercase;">ADDRESS: ${esc(rAddr)}</p>
      <p style="text-align:center; margin-top:4px; font-weight:bold; font-size:10px;">${esc(rFoot)}</p>
    </div>
  `;
  
  document.body.appendChild(d);
  window.print();
  setTimeout(() => d.remove(), 1000);
};

window.printSuppliersListReport = function() {
  let w = window.open("", "_blank");
  if (!w) { window.toast("ALLOW POP-UPS TO PRINT REPORT", "error"); return; }
  
  let totalBal = calculateTotalMarketBalance();
  let rows = window.state.suppliers.map(s => {
    let b = window.calculateSupplierBalance(s);
    return `
      <tr>
        <td style="text-align:left; border:1px solid #000; padding:6px; font-weight:bold;">${esc(s.name)}</td>
        <td style="text-align:center; border:1px solid #000; padding:6px;">${esc(s.phone || "0")}</td>
        <td style="text-align:left; border:1px solid #000; padding:6px;">${esc(s.address || "0")}</td>
        <td style="text-align:right; border:1px solid #000; padding:6px; font-weight:bold;">${num(b).toFixed(2)}</td>
      </tr>
    `;
  }).join("");

  w.document.write(`
    <html>
      <head>
        <title>Suppliers List & Market Balance</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #000; background: #fff; }
          .print-header { text-align: right; font-weight: bold; font-size: 14px; margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { border: 1px solid #000; background-color: #d3d3d3; padding: 8px; font-size: 13px; font-weight: bold; }
          td { font-size: 12px; }
          tfoot td { border: 1px solid #000; background-color: #d3d3d3; font-weight: bold; padding: 8px; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="print-header">Print Date: ${today()}</div>
        <table>
          <thead>
            <tr>
              <th style="width: 25%;">Vendor Name</th>
              <th style="width: 25%;">Phone</th>
              <th style="width: 25%;">Address</th>
              <th style="width: 25%;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="4" style="text-align:center; border:1px solid #000; padding:10px;">NO SUPPLIERS FOUND</td></tr>'}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right;">Total Market Balance:</td>
              <td style="text-align:right;">${num(totalBal).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
};

window.handleSupplierSubmit = function(e) {
  if (e) e.preventDefault();
  let editingId = $("editingSupplierId")?.value;
  let name = $("supplierName").value.trim().toUpperCase();
  let caste = $("supplierCaste").value.trim().toUpperCase();
  let address = $("supplierAddress").value.trim().toUpperCase();
  let company = $("supplierCompany").value.trim().toUpperCase();
  let phone = $("supplierPhone").value.trim();
  let openingBalance = num($("supplierOpeningBalance").value);

  if (editingId) {
    let sup = window.state.suppliers.find(s => s.id === editingId);
    if (sup) {
      sup.name = name; sup.caste = caste; sup.address = address; sup.company = company; sup.phone = phone; sup.openingBalance = openingBalance;
      window.toast("SUPPLIER UPDATED SUCCESSFULLY!");
    }
  } else {
    if (window.state.suppliers.some(s => s.name.toUpperCase() === name)) { window.toast("SUPPLIER ALREADY EXISTS", "error"); return; }
    window.state.suppliers.push({
      id: "SUP-" + Date.now(),
      name, caste, address, company, phone, openingBalance
    });
    window.toast("SUPPLIER ADDED: " + name);
  }

  window.saveState();
  window.cancelEditSupplier();
  window.renderSuppliers();
};

window.editSupplier = function(id) {
  let sup = window.state.suppliers.find(s => s.id === id);
  if (!sup) return;
  $("editingSupplierId").value = sup.id;
  $("supplierName").value = sup.name;
  $("supplierCaste").value = sup.caste || "";
  $("supplierAddress").value = sup.address || "";
  $("supplierCompany").value = sup.company || "";
  $("supplierPhone").value = sup.phone || "";
  $("supplierOpeningBalance").value = sup.openingBalance || 0;
  $("supplierFormTitle").textContent = "EDIT SUPPLIER (" + sup.name + ")";
  $("btnSaveSupplier").textContent = "UPDATE SUPPLIER";
  $("btnCancelEditSupplier").classList.remove("hidden");
  $("supplierName").focus();
};

window.cancelEditSupplier = function() {
  if ($("supplierForm")) $("supplierForm").reset();
  if ($("editingSupplierId")) $("editingSupplierId").value = "";
  if ($("supplierFormTitle")) $("supplierFormTitle").textContent = "ADD NEW SUPPLIER";
  if ($("btnSaveSupplier")) $("btnSaveSupplier").textContent = "SAVE SUPPLIER";
  if ($("btnCancelEditSupplier")) $("btnCancelEditSupplier").classList.add("hidden");
};

window.deleteSupplier = function(id) {
  if (!confirm("DELETE THIS SUPPLIER FROM RECORDS?")) return;
  window.state.suppliers = window.state.suppliers.filter(s => s.id !== id);
  window.saveState();
  window.renderSuppliers();
  window.toast("SUPPLIER DELETED!");
};

window.handleSupplierPaymentSubmit = function(e) {
  if (e) e.preventDefault();
  let supId = $("supplierPaymentSelect").value;
  let amount = num($("supplierPaymentAmount").value);
  let pDate = $("supplierPaymentDate").value || today();
  let pMethod = $("supplierPaymentMethod").value;
  if (!supId || amount <= 0) return;

  let sup = window.state.suppliers.find(s => s.id === supId);
  window.state.supplierPayments.push({
    id: "SPAY-" + Date.now(),
    supplierId: supId,
    supplierName: sup ? sup.name : "SUPPLIER",
    amount,
    method: pMethod,
    date: pDate,
    time: new Date().toLocaleTimeString()
  });
  window.saveState();
  window.refreshAll();
  $("supplierPaymentForm").reset();
  window.toast("SUPPLIER PAYMENT RECORDED!");
};

window.renderSuppliers = function() {
  const b = $("supplierTableBody");
  const sel = $("supplierPaymentSelect");
  const compSel = $("supplierCompanySelect");

  if (b) {
    b.innerHTML = window.state.suppliers.map(s => {
      let bal = window.calculateSupplierBalance(s);
      return `
        <tr>
          <td><b>${esc(s.name)}</b></td>
          <td>${esc(s.caste || "-")}</td>
          <td>${esc(s.address || "-")}</td>
          <td>${esc(s.company || "-")}</td>
          <td>${esc(s.phone || "-")}</td>
          <td class="font-balance-red">${money(bal)}</td>
          <td>
            <div style="display:flex; gap:6px;">
              <button type="button" class="button-success" onclick="window.editSupplier('${s.id}')">EDIT</button>
              <button type="button" class="button-warning" onclick="window.deleteSupplier('${s.id}')">DELETE</button>
            </div>
          </td>
        </tr>
      `;
    }).join("") || '<tr><td colspan="7" class="empty">NO SUPPLIERS FOUND</td></tr>';
  }

  if (sel) {
    sel.innerHTML = '<option value="">-- SELECT SUPPLIER --</option>' + window.state.suppliers.map(s => `<option value="${s.id}">${esc(s.name)} (${esc(s.company || "NO COMPANY")})</option>`).join("");
  }

  let companies = [...new Set(window.state.suppliers.map(s => s.company).filter(Boolean).concat(window.state.products.map(p => p.company).filter(Boolean)))];
  if (compSel) {
    compSel.innerHTML = '<option value="">-- SELECT COMPANY --</option>' + companies.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  }

  const pBody = $("supplierPaymentRecordsBody");
  if (pBody) {
    pBody.innerHTML = (window.state.supplierPayments || []).map(p => `
      <tr>
        <td><b>${esc(p.supplierName || "-")}</b></td>
        <td>${money(p.amount)}</td>
        <td>${esc(p.method)}</td>
        <td>${esc(p.date)} ${esc(p.time || "")}</td>
      </tr>
    `).join("") || '<tr><td colspan="4" class="empty">NO PAYMENT RECORDS YET</td></tr>';
  }

  if ($("supplierMarketBalance")) $("supplierMarketBalance").textContent = "TOTAL MARKET BALANCE: " + money(calculateTotalMarketBalance());
};

window.initReportsDropdown = function() {
  let supSel = $("reportSupplierSelect");
  if (supSel) {
    supSel.innerHTML = '<option value="">-- ALL SUPPLIERS --</option>' + window.state.suppliers.map(s => `<option value="${esc(s.name)}">${esc(s.name)} (${esc(s.company || "NO COMPANY")})</option>`).join("");
  }
};

window.renderReports = function() {
  const host = $("reportOutput");
  if (!host) return;
  const type = $("reportType").value;

  if (type === "sales") {
    let sales = window.state.sales;
    host.innerHTML = `<h4>SALES SUMMARY REPORT (${sales.length} BILLS)</h4><div class="table-wrap"><table><thead><tr><th>INVOICE #</th><th>DATE</th><th>CUSTOMER</th><th>TOTAL</th><th>PAID</th><th>DUE</th></tr></thead><tbody>${sales.map(s => `<tr><td>${esc(s.invoiceNumber)}</td><td>${esc(s.date)}</td><td>${esc(s.customer)}</td><td>${money(s.total)}</td><td>${money(s.paid)}</td><td>${money(s.due)}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">NO SALES RECORDS</td></tr>'}</tbody></table></div>`;
  } else if (type === "stock") {
    let prods = window.state.products;
    host.innerHTML = `<h4>STOCK REPORT (${prods.length} PRODUCTS)</h4><div class="table-wrap"><table><thead><tr><th>PRODUCT</th><th>MODEL</th><th>COMPANY</th><th>STORE</th><th>SHOP</th><th>TOTAL</th></tr></thead><tbody>${prods.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.model)}</td><td>${esc(p.company || "-")}</td><td>${stockInLoc(p, "STORE")}</td><td>${stockInLoc(p, "SHOP")}</td><td><b>${totalStock(p)}</b></td></tr>`).join("") || '<tr><td colspan="6" class="empty">NO PRODUCTS FOUND</td></tr>'}</tbody></table></div>`;
  } else if (type === "supplierDetails") {
    let selSupName = ($("reportSupplierSelect")?.value || "").trim().toUpperCase();
    let selCompName = ($("reportSupplierCompanySelect")?.value || "").trim().toUpperCase();

    let logs = [];
    window.state.products.forEach(p => (p.batches || []).forEach(b => {
      let bSup = (b.seller || "").toUpperCase();
      let pComp = (p.company || "").toUpperCase();
      if ((!selSupName || bSup === selSupName) && (!selCompName || pComp === selCompName)) {
        logs.push({
          type: "STOCK_RECEIVED",
          supplier: b.seller || "-",
          company: p.company || "-",
          model: p.model,
          qty: b.received,
          price: b.purchaseCost,
          total: (b.received * b.purchaseCost) + num(b.kata) + num(b.transport),
          paid: b.paidNow || 0,
          dateTime: (b.date || today()) + " RECEIVING",
          method: "CASH/ENTRY"
        });
      }
    }));

    (window.state.supplierPayments || []).forEach(pay => {
      let sup = window.state.suppliers.find(s => s.id === pay.supplierId);
      let sName = sup ? sup.name.toUpperCase() : (pay.supplierName || "").toUpperCase();
      let sComp = sup ? (sup.company || "").toUpperCase() : "";
      if ((!selSupName || sName === selSupName) && (!selCompName || sComp === selCompName)) {
        logs.push({
          type: "PAYMENT",
          supplier: sName,
          company: sComp,
          model: "PAYMENT OUT",
          qty: "-",
          price: "-",
          total: 0,
          paid: pay.amount,
          dateTime: pay.date + " " + (pay.time || ""),
          method: pay.method || "CASH"
        });
      }
    });

    host.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h4>SUPPLIER INDIVIDUAL HISTORY & PAYMENT LEDGER</h4>
        <button type="button" class="button-success" onclick="window.printSupplierLedgerReport()">PRINT LEDGER REPORT</button>
      </div>
      <div class="table-wrap">
        <table id="supplierLedgerReportTable">
          <thead>
            <tr>
              <th>SUPPLIER NAME</th>
              <th>COMPANY</th>
              <th>PRODUCT MODEL</th>
              <th>QTY</th>
              <th>PRICE</th>
              <th>TOTAL COST</th>
              <th>PAID (HAMNA KITNA DIYA)</th>
              <th>TIME & DATE</th>
              <th>PAYMENT METHOD</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td><b>${esc(l.supplier)}</b></td>
                <td>${esc(l.company)}</td>
                <td>${esc(l.model)}</td>
                <td>${l.qty}</td>
                <td>${l.price === "-" ? "-" : money(l.price)}</td>
                <td>${money(l.total)}</td>
                <td style="color:#8ee0ad; font-weight:bold;">${money(l.paid)}</td>
                <td>${esc(l.dateTime)}</td>
                <td>${esc(l.method)}</td>
              </tr>
            `).join("") || '<tr><td colspan="9" class="empty">NO LOGS FOUND FOR THIS SUPPLIER/COMPANY</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }
};

window.printSupplierLedgerReport = function() {
  let tbl = $("supplierLedgerReportTable");
  if (!tbl) return;
  let w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`
    <html>
      <head>
        <title>Supplier Individual Ledger Report</title>
        <style>
          body{font-family:Arial,sans-serif; padding:20px; color:#000;}
          table{width:100%; border-collapse:collapse;}
          th,td{border:1px solid #000; padding:6px; font-size:11px; text-align:left;}
          th{background:#eee;}
        </style>
      </head>
      <body>
        <h2>${esc(window.state.settings.businessName)} - SUPPLIER LEDGER REPORT</h2>
        <p>DATE: ${today()}</p>
        ${tbl.outerHTML}
      </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
};

window.handleProductSubmit = function(e) {
  if (e) e.preventDefault();
  let name = $("productName").value.trim().toUpperCase();
  let model = $("productModel").value.trim().toUpperCase();
  let company = $("productCompany").value.trim().toUpperCase();
  let barcode = $("productBarcode").value.trim().toUpperCase();
  if (!barcode && company) {
    barcode = window.nextCompanyBarcode(company);
  }
  let category = $("productCategory").value;
  let seller = ($("productSeller")?.value || "").trim().toUpperCase();
  let location = $("productLocation").value;
  let qty = num($("productQuantity").value);
  let cost = num($("purchaseCost").value);
  let saleP = num($("salePrice").value);
  let paidNow = num($("supplierPaidNow").value);
  let kata = num($("productKata").value);
  let transport = num($("productTransport").value);
  let rDate = $("productDate").value || today();

  let p = window.state.products.find(x => x.name === name && x.model === model);
  if (!p) {
    p = { id: "PROD-" + Date.now(), name, model, company, barcode, category, salePrice: saleP, purchaseCost: cost, batches: [] };
    window.state.products.push(p);
  } else {
    if (barcode) p.barcode = barcode;
    if (company) p.company = company;
  }

  let batch = { id: "BATCH-" + Date.now(), date: rDate, location, received: qty, remaining: qty, purchaseCost: cost, salePrice: saleP, seller, paidNow, kata, transport };
  p.batches.push(batch);

  if (seller) {
    let sup = window.state.suppliers.find(s => s.name.toUpperCase() === seller.toUpperCase());
    if (!sup) {
      sup = { id: "SUP-" + Date.now(), name: seller, phone: "", caste: "", address: "", company, openingBalance: 0 };
      window.state.suppliers.push(sup);
    }
    if (paidNow > 0) {
      window.state.supplierPayments.push({ id: "SPAY-" + Date.now(), supplierId: sup.id, supplierName: sup.name, amount: paidNow, method: "CASH", date: rDate, time: new Date().toLocaleTimeString() });
    }
  }

  window.saveState();
  window.refreshAll();
  $("productForm").reset();
  if ($("productBarcode")) $("productBarcode").dataset.manual = "";
  window.toast("PRODUCT & STOCK BATCH SAVED!");
};

window.renderProducts = function() {
  const b = $("productTableBody");
  if (!b) return;
  const q = ($("productSearchInput")?.value || "").trim().toUpperCase();
  const list = window.state.products.filter(p => !q || [p.name, p.model, p.company, p.barcode, p.category].some(v => String(v || "").toUpperCase().includes(q)));
  b.innerHTML = list.map(p => `
    <tr>
      <td>${esc(p.name)}</td>
      <td>${esc(p.model)}</td>
      <td>${esc(p.company || "-")}</td>
      <td>${esc(p.barcode || "-")}</td>
      <td>${esc(p.category)}</td>
      <td>${stockInLoc(p, "STORE")}</td>
      <td>${stockInLoc(p, "SHOP")}</td>
      <td><b>${totalStock(p)}</b></td>
      <td>${money(p.purchaseCost)}</td>
      <td>${money(productPrice(p))}</td>
    </tr>
  `).join("") || '<tr><td colspan="10" class="empty">NO PRODUCTS FOUND</td></tr>';

  let companies = [...new Set(window.state.products.map(p => p.company).filter(Boolean).concat(window.state.suppliers.map(s => s.company).filter(Boolean)))];
  if ($("companySuggestions")) $("companySuggestions").innerHTML = companies.map(c => `<option value="${esc(c)}"></option>`).join("");
  if ($("supplierSuggestions")) $("supplierSuggestions").innerHTML = window.state.suppliers.map(s => `<option value="${esc(s.name)}"></option>`).join("");
  
  const supSel = $("productSupplierSelect");
  if (supSel) {
    supSel.innerHTML = '<option value="">-- SELECT EXISTING SUPPLIER --</option>' + window.state.suppliers.map(s => `<option value="${esc(s.name)}">${esc(s.name)} (${esc(s.company || "NO COMPANY")})</option>`).join("");
  }
};

window.onSupplierSelectChange = function() {
  let val = $("productSupplierSelect")?.value;
  if (val && $("productSeller")) {
    $("productSeller").value = val;
    let sup = window.state.suppliers.find(s => s.name.toUpperCase() === val.toUpperCase());
    if (sup && sup.company && $("productCompany")) {
      $("productCompany").value = sup.company;
      window.suggestProductBarcode();
    }
  }
};

window.renderInventory = function() {
  const host = $("companyInventoryButtons");
  if (!host) return;
  let companies = [...new Set(window.state.products.map(p => (p.company || "UNASSIGNED").trim()).filter(Boolean))].sort();
  host.innerHTML = companies.map(c => `<button type="button" class="button-muted" onclick="window.openCompanyInventory('${esc(c).replace(/'/g, "&#39;")}')">${esc(c)}</button>`).join("") || '<p class="empty">NO COMPANIES / STOCK FOUND</p>';
};

window.openCompanyInventory = function(company) {
  const host = $("companyInventoryDetails");
  if (!host) return;
  let list = window.state.products.filter(p => (p.company || "UNASSIGNED").trim().toUpperCase() === company.toUpperCase());
  host.innerHTML = `<h3>${esc(company)} - MODEL DETAILS</h3><div class="table-wrap"><table><thead><tr><th>PRODUCT</th><th>MODEL</th><th>STORE</th><th>SHOP</th><th>TOTAL</th></tr></thead><tbody>${list.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.model)}</td><td>${stockInLoc(p, "STORE")}</td><td>${stockInLoc(p, "SHOP")}</td><td><b>${totalStock(p)}</b></td></tr>`).join("") || '<tr><td colspan="5">NO MODELS FOUND</td></tr>'}</tbody></table></div>`;
};

window.renderReceiving = function() {
  const b = $("receivingTableBody");
  if (!b) return;
  let batches = [];
  window.state.products.forEach(p => (p.batches || []).forEach(x => batches.push({ ...x, productName: p.name, model: p.model })));
  b.innerHTML = batches.map(x => `
    <tr>
      <td>${esc(x.id)}</td><td>${esc(x.date)}</td><td>${esc(x.productName)} (${esc(x.model)})</td>
      <td>${esc(x.seller || "-")}</td><td>${esc(x.location)}</td><td>${x.received}</td>
      <td>${money(x.purchaseCost)}</td><td>${money(x.received * x.purchaseCost)}</td>
      <td>${money(x.paidNow || 0)}</td><td>${money(x.kata || 0)}</td><td>${money(x.transport || 0)}</td>
    </tr>
  `).join("") || '<tr><td colspan="11" class="empty">NO RECEIVING RECORDS</td></tr>';
};

window.renderTransferOptions = function() {
  const sel = $("transferProductSelect");
  if (!sel) return;
  sel.innerHTML = '<option value="">-- SELECT PRODUCT --</option>' + window.state.products.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.model)}) - Store: ${stockInLoc(p, "STORE")}, Shop: ${stockInLoc(p, "SHOP")}</option>`).join("");
  
  const tb = $("transferTableBody");
  if (tb) {
    tb.innerHTML = (window.state.transfers || []).map(t => `
      <tr>
        <td>${esc(t.date)}</td>
        <td>${esc(t.productName)}</td>
        <td>${esc(t.model)}</td>
        <td><b>${t.qty}</b></td>
        <td>${esc(t.from)}</td>
        <td>${esc(t.to)}</td>
      </tr>
    `).join("") || '<tr><td colspan="6" class="empty">NO STOCK TRANSFERS RECORDED</td></tr>';
  }
};

window.handleTransferSubmit = function(e) {
  if (e) e.preventDefault();
  let prodId = $("transferProductSelect").value;
  let fromLoc = $("transferFrom").value;
  let toLoc = $("transferTo").value;
  let qty = num($("transferQty").value);

  if (!prodId || qty <= 0) { window.toast("SELECT PRODUCT & VALID QTY", "error"); return; }
  if (fromLoc === toLoc) { window.toast("FROM AND TO LOCATIONS CANNOT BE SAME", "error"); return; }

  let p = window.state.products.find(x => x.id === prodId);
  if (!p) return;

  let avail = stockInLoc(p, fromLoc);
  if (qty > avail) { window.toast(`INSUFFICIENT STOCK IN ${fromLoc}! AVAILABLE: ${avail}`, "error"); return; }

  let rem = qty;
  for (let b of p.batches.filter(z => z.location === fromLoc && z.remaining > 0)) {
    let deduct = Math.min(rem, b.remaining);
    b.remaining -= deduct;
    rem -= deduct;
    if (rem <= 0) break;
  }

  let cost = p.batches.length ? p.batches[p.batches.length - 1].purchaseCost : p.purchaseCost;
  let saleP = productPrice(p);
  let newBatch = { id: "TBATCH-" + Date.now(), date: today(), location: toLoc, received: qty, remaining: qty, purchaseCost: cost, salePrice: saleP, seller: "TRANSFER", paidNow: 0, kata: 0, transport: 0 };
  p.batches.push(newBatch);

  window.state.transfers.push({
    id: "TRF-" + Date.now(),
    date: today() + " " + new Date().toLocaleTimeString(),
    productId: p.id,
    productName: p.name,
    model: p.model,
    qty,
    from: fromLoc,
    to: toLoc
  });

  window.saveState();
  window.refreshAll();
  window.navigate("transfer");
  window.toast("STOCK TRANSFERRED SUCCESSFULLY!");
};

window.getNextCustomerCode = function() {
  let max = 1000;
  (window.state.customers || []).forEach(c => {
    let code = String(c.code || "").trim().toUpperCase();
    let m = code.match(/^C(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return "C" + (max + 1);
};

window.handleCustomerSubmit = function(e) {
  if (e) e.preventDefault();
  let editingId = $("editingCustomerId") ? $("editingCustomerId").value : "";
  let name = $("customerName").value.trim().toUpperCase();
  let cast = $("customerCast").value.trim().toUpperCase();
  let address = $("customerAddress").value.trim().toUpperCase();
  let phone = $("customerPhone").value.trim();
  let balance = num($("customerBalance").value);

  if (editingId) {
    let cust = window.state.customers.find(c => c.id === editingId);
    if (cust) {
      cust.name = name; cust.cast = cast; cust.address = address; cust.phone = phone; cust.balance = balance;
      window.toast("CUSTOMER UPDATED SUCCESSFULLY!");
    }
  } else {
    let code = window.getNextCustomerCode();
    window.state.customers.push({ id: "CUST-" + Date.now(), code, name, cast, address, phone, balance });
    window.toast("KHATA CUSTOMER ADDED: " + code);
  }

  window.saveState();
  window.cancelEditCustomer();
  window.renderCustomers();
};

window.editCustomer = function(id) {
  let cust = window.state.customers.find(c => c.id === id);
  if (!cust) return;
  $("editingCustomerId").value = cust.id;
  $("customerBarcode").value = cust.code;
  $("customerName").value = cust.name;
  $("customerCast").value = cust.cast || "";
  $("customerAddress").value = cust.address || "";
  $("customerPhone").value = cust.phone || "";
  $("customerBalance").value = cust.balance || 0;
  $("customerFormTitle").textContent = "EDIT KHATA CUSTOMER (" + cust.code + ")";
  $("btnSaveCustomer").textContent = "UPDATE CUSTOMER";
  $("btnCancelEditCustomer").classList.remove("hidden");
  $("customerName").focus();
};

window.cancelEditCustomer = function() {
  if ($("customerForm")) $("customerForm").reset();
  if ($("editingCustomerId")) $("editingCustomerId").value = "";
  if ($("customerBarcode")) $("customerBarcode").value = window.getNextCustomerCode();
  if ($("customerFormTitle")) $("customerFormTitle").textContent = "ADD NEW KHATA CUSTOMER";
  if ($("btnSaveCustomer")) $("btnSaveCustomer").textContent = "ADD KHATA CUSTOMER";
  if ($("btnCancelEditCustomer")) $("btnCancelEditCustomer").classList.add("hidden");
};

window.renderCustomers = function() {
  const b = $("customerTableBody");
  if (!b) return;
  if ($("customerBarcode") && !$("editingCustomerId")?.value) {
    $("customerBarcode").value = window.getNextCustomerCode();
  }

  b.innerHTML = window.state.customers.map(c => `
    <tr>
      <td><b>${esc(c.code)}</b></td>
      <td>${esc(c.name)}</td>
      <td>${esc(c.cast || "-")}</td>
      <td>${esc(c.address || "-")}</td>
      <td>${esc(c.phone || "-")}</td>
      <td class="font-balance-red">${money(calculateCustomerBalance(c))}</td>
      <td>
        <div style="display:flex; gap:6px;">
          <button type="button" class="button-success" onclick="window.editCustomer('${c.id}')">EDIT</button>
          <button type="button" class="button-warning" onclick="window.deleteCustomer('${c.id}')">DELETE</button>
        </div>
      </td>
    </tr>
  `).join("") || '<tr><td colspan="7" class="empty">NO KHATA CUSTOMERS FOUND</td></tr>';
};

window.deleteCustomer = function(id) {
  if (!confirm("DELETE THIS CUSTOMER FROM KHATA RECORDS?")) return;
  window.state.customers = window.state.customers.filter(c => c.id !== id);
  window.saveState();
  window.renderCustomers();
  window.toast("CUSTOMER DELETED FROM RECORDS!");
};

window.findInvoiceForReturn = function() {
  const invNo = ($("returnInvoiceSearch")?.value || "").trim().toUpperCase();
  const host = $("returnInvoiceDetailsArea");
  if (!host) return;
  if (!invNo) { window.toast("ENTER INVOICE NUMBER", "error"); return; }

  const sale = window.state.sales.find(s => s.invoiceNumber.toUpperCase() === invNo);
  if (!sale) { host.innerHTML = `<p class="empty">INVOICE "${invNo}" NOT FOUND.</p>`; return; }

  host.innerHTML = `
    <div class="panel" style="background:#191b1d; margin-top:15px;">
      <h4>INVOICE: ${esc(sale.invoiceNumber)} (${esc(sale.customer)})</h4>
      <p>DATE: ${esc(sale.date)} | TOTAL: ${money(sale.total)} | PAID: ${money(sale.paid)}</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>PRODUCT</th><th>SOLD QTY</th><th>PRICE</th><th>RETURN QTY</th><th>ACTION</th></tr></thead>
          <tbody>
            ${sale.items.map((x, idx) => `
              <tr>
                <td>${esc(x.name)} (${esc(x.model)})</td>
                <td>${x.quantity}</td>
                <td>${money(x.unitPrice)}</td>
                <td><input type="number" id="returnQty_${idx}" min="0" max="${x.quantity}" value="0" style="width:70px;"></td>
                <td><button type="button" class="button-success" onclick="window.processReturnItem('${sale.id}', ${idx})">RETURN</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
};

window.processReturnItem = function(saleId, itemIdx) {
  let sale = window.state.sales.find(s => s.id === saleId);
  if (!sale) return;
  let qInput = $(`returnQty_${itemIdx}`);
  let qtyToReturn = num(qInput?.value);
  if (qtyToReturn <= 0) { window.toast("ENTER RETURN QUANTITY", "error"); return; }

  let item = sale.items[itemIdx];
  if (qtyToReturn > item.quantity) { window.toast("CANNOT RETURN MORE THAN SOLD QTY", "error"); return; }

  let refundAmount = qtyToReturn * item.unitPrice;

  let p = window.state.products.find(x => x.id === item.productId);
  if (p) {
    let batch = p.batches.find(b => b.location === sale.location);
    if (batch) {
      batch.remaining += qtyToReturn;
    } else {
      p.batches.push({ id: "RBATCH-" + Date.now(), date: today(), location: sale.location, received: qtyToReturn, remaining: qtyToReturn, purchaseCost: p.purchaseCost, salePrice: item.unitPrice, seller: "RETURN", paidNow: 0, kata: 0, transport: 0 });
    }
  }

  let retRecord = {
    id: "RET-" + Date.now(),
    returnNumber: "RET-" + String((window.state.salesReturns || []).length + 1).padStart(6, "0"),
    originalInvoiceNo: sale.invoiceNumber,
    date: today() + " " + new Date().toLocaleTimeString(),
    customer: sale.customer,
    customerId: sale.customerId,
    productName: item.name,
    model: item.model,
    quantity: qtyToReturn,
    totalRefund: refundAmount
  };

  if (!window.state.salesReturns) window.state.salesReturns = [];
  window.state.salesReturns.push(retRecord);
  window.saveState();
  window.refreshAll();
  window.renderReturnsHistory();
  window.toast("SALES RETURN PROCESSED & REFUND RECORDED!");
  window.findInvoiceForReturn();
};

window.renderReturnsHistory = function() {
  const b = $("returnsHistoryTableBody");
  if (!b) return;
  b.innerHTML = (window.state.salesReturns || []).map(r => `
    <tr>
      <td><b>${esc(r.returnNumber)}</b></td>
      <td>${esc(r.originalInvoiceNo)}</td>
      <td>${esc(r.date)}</td>
      <td>${esc(r.customer)}</td>
      <td class="font-balance-red">${money(r.totalRefund)}</td>
    </tr>
  `).join("") || '<tr><td colspan="5" class="empty">NO SALES RETURN HISTORY RECORDS</td></tr>';
};

window.renderDashboard = function() {
  let todaySales = window.state.sales.filter(s => s.date === today()).reduce((n, s) => n + s.total, 0);
  let marketBal = calculateTotalMarketBalance();
  let totalStoreStock = window.state.products.reduce((s, p) => s + stockInLoc(p, "STORE"), 0);
  let totalShopStock = window.state.products.reduce((s, p) => s + stockInLoc(p, "SHOP"), 0);

  if ($("todaySales")) $("todaySales").textContent = money(todaySales);
  if ($("todayTransactions")) $("todayTransactions").textContent = window.state.sales.filter(s => s.date === today()).length;
  if ($("totalProducts")) $("totalProducts").textContent = window.state.products.length;
  if ($("marketBalance")) $("marketBalance").textContent = money(marketBal);
  if ($("storeStock")) $("storeStock").textContent = totalStoreStock + " PIECES";
  if ($("shopStock")) $("shopStock").textContent = totalShopStock + " PIECES";

  const filterType = $("salesOverviewFilter")?.value || "today";
  const isExcelView = !!$("toggleExcelView")?.checked;
  const customBox = $("customDateFilterBox");
  if (customBox) customBox.classList.toggle("hidden", filterType !== "custom");

  let filteredSales = [];
  let dNow = new Date();
  let tStr = today();

  if (filterType === "today") {
    filteredSales = window.state.sales.filter(s => s.date === tStr);
  } else if (filterType === "weekly") {
    let dWeekAgo = new Date(); dWeekAgo.setDate(dNow.getDate() - 7);
    filteredSales = window.state.sales.filter(s => new Date(s.date) >= dWeekAgo);
  } else if (filterType === "monthly") {
    let mStr = tStr.slice(0, 7);
    filteredSales = window.state.sales.filter(s => s.date.startsWith(mStr));
  } else if (filterType === "custom") {
    let fDate = $("overviewFromDate")?.value || tStr;
    let toDate = $("overviewToDate")?.value || tStr;
    filteredSales = window.state.sales.filter(s => s.date >= fDate && s.date <= toDate);
  }

  let totalSalesSum = filteredSales.reduce((n, s) => n + s.total, 0);
  let totalReturnsSum = (window.state.salesReturns || []).filter(r => filteredSales.some(s => s.invoiceNumber === r.originalInvoiceNo)).reduce((n, r) => n + r.totalRefund, 0);
  let netSalesSum = totalSalesSum - totalReturnsSum;

  let totalExpensesSum = window.state.expenses.filter(ex => {
    if (filterType === "today") return ex.date === tStr;
    if (filterType === "weekly") { let d = new Date(); d.setDate(d.getDate() - 7); return new Date(ex.date) >= d; }
    if (filterType === "monthly") return ex.date.startsWith(tStr.slice(0, 7));
    if (filterType === "custom") { let f = $("overviewFromDate")?.value || tStr, t = $("overviewToDate")?.value || tStr; return ex.date >= f && ex.date <= t; }
    return true;
  }).reduce((n, ex) => n + ex.amount, 0);

  let totalPurchasesSum = 0;
  window.state.products.forEach(p => (p.batches || []).forEach(b => {
    let bDate = b.date || tStr;
    let match = false;
    if (filterType === "today") match = (bDate === tStr);
    else if (filterType === "weekly") { let d = new Date(); d.setDate(d.getDate() - 7); match = (new Date(bDate) >= d); }
    else if (filterType === "monthly") match = bDate.startsWith(tStr.slice(0, 7));
    else if (filterType === "custom") { let f = $("overviewFromDate")?.value || tStr, t = $("overviewToDate")?.value || tStr; match = (bDate >= f && bDate <= toDate); }
    else match = true;

    if (match) totalPurchasesSum += (b.received * b.purchaseCost) + num(b.kata) + num(b.transport);
  }));

  const container = $("salesOverviewContainer");
  if (container) {
    if (isExcelView) {
      let rowsHTML = filteredSales.map(s => `
        <tr>
          <td>${esc(s.date)}</td>
          <td>${money(s.total)}</td>
          <td>${money(0)}</td>
          <td>${money(0)}</td>
        </tr>
      `).join("");

      container.innerHTML = `
        <div class="table-wrap" style="max-height:300px; overflow-y:auto; border:1px solid var(--line);">
          <table style="font-family: monospace;">
            <thead>
              <tr>
                <th>DATE</th>
                <th>TOTAL SALE</th>
                <th>TOTAL EXPENSES</th>
                <th>TOTAL PURCHASES</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML || '<tr><td colspan="4" class="empty">NO SALES RECORDED FOR THIS PERIOD</td></tr>'}
            </tbody>
            <tfoot>
              <tr style="background:#292b2e; font-weight:bold;">
                <td>TOTALS:</td>
                <td style="color:#8ee0ad;">${money(totalSalesSum)}</td>
                <td style="color:#ffb4b4;">${money(totalExpensesSum)}</td>
                <td style="color:#ffb4b4;">${money(totalPurchasesSum)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="stats-grid" style="grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom:0;">
          <div class="stat-card"><span>GROSS SALES</span><strong style="color:#8ee0ad;">${money(totalSalesSum)}</strong></div>
          <div class="stat-card"><span>NET SALES (AFTER RETURNS)</span><strong style="color:#8ee0ad;">${money(netSalesSum)}</strong></div>
          <div class="stat-card"><span>TOTAL EXPENSES</span><strong style="color:#ffb4b4;">${money(totalExpensesSum)}</strong></div>
          <div class="stat-card"><span>TOTAL PURCHASES</span><strong style="color:#ffb4b4;">${money(totalPurchasesSum)}</strong></div>
        </div>
      `;
    }
  }

  const recT = $("recentTransactions");
  if (recT) {
    let recent = window.state.sales.slice(-5).reverse();
    recT.innerHTML = recent.map(s => `
      <tr>
        <td><b>${esc(s.invoiceNumber)}</b></td><td>${esc(s.date)}</td><td>${esc(s.cashier)}</td>
        <td>${esc(s.location)}</td><td>${money(s.total)}</td>
        <td><button type="button" class="button-success" onclick="window.printThermalReceipt(${JSON.stringify(s).replace(/"/g, '&quot;')})">PRINT</button></td>
      </tr>
    `).join("") || '<tr><td colspan="6" class="empty">NO RECENT TRANSACTIONS</td></tr>';
  }
};

window.renderTransactions = function() {
  const b = $("transactionsTableBody");
  if (!b) return;
  b.innerHTML = window.state.sales.map(s => `
    <tr>
      <td><b>${esc(s.invoiceNumber)}</b></td><td>${esc(s.date)}</td><td>${esc(s.time)}</td>
      <td>${esc(s.customer)}</td><td>${s.items.length}</td><td>${esc(s.cashier)}</td>
      <td>${esc(s.location)}</td><td>${money(s.total)}</td>
      <td><button type="button" class="button-success" onclick="window.printThermalReceipt(${JSON.stringify(s).replace(/"/g, '&quot;')})">PRINT</button></td>
    </tr>
  `).join("") || '<tr><td colspan="9" class="empty">NO TRANSACTIONS FOUND</td></tr>';
};

window.renderDuplicateBills = function() {
  const b = $("duplicateBillTableBody");
  if (!b) return;
  const qNo = ($("dupBillNo")?.value || "").trim().toUpperCase();
  const qCust = ($("dupCustomer")?.value || "").trim().toUpperCase();

  const matches = window.state.sales.filter(s => (!qNo || s.invoiceNumber.toUpperCase().includes(qNo)) && (!qCust || s.customer.toUpperCase().includes(qCust)));

  b.innerHTML = matches.map(s => `
    <tr>
      <td><b>${esc(s.invoiceNumber)}</b></td><td>${esc(s.customer)}</td>
      <td>${money(s.total)}</td><td>${money(s.paid)}</td><td>${money(s.discount)}</td>
      <td>${esc(s.date)}</td>
      <td><button type="button" class="button-success" onclick="window.printThermalReceipt(${JSON.stringify(s).replace(/"/g, '&quot;')})">PRINT</button></td>
    </tr>
  `).join("") || '<tr><td colspan="7" class="empty">NO BILLS FOUND</td></tr>';
};

window.renderCustomerHistory = function() {
  const host = $("customerHistoryResults");
  const q = ($("historyCustomerCode")?.value || "").trim().toUpperCase();
  if (!q) { host.innerHTML = "<p class='muted'>ENTER CUSTOMER CODE OR NAME TO VIEW HISTORY.</p>"; return; }

  const cust = window.state.customers.find(c => c.code.toUpperCase() === q || c.name.toUpperCase().includes(q));
  const salesMatches = window.state.sales.filter(s => (s.customerCode && s.customerCode.toUpperCase() === q) || s.customer.toUpperCase().includes(q));

  if (!cust && !salesMatches.length) {
    host.innerHTML = `<p class='empty'>NO CUSTOMER OR TRANSACTIONS FOUND FOR "${q}".</p>`;
    return;
  }

  let html = `<div class="panel">`;
  if (cust) {
    html += `<h4>CUSTOMER: ${esc(cust.name)} (${esc(cust.code)})</h4><p>CURRENT BALANCE: <b style="color:#ff6b6b;">${money(calculateCustomerBalance(cust))}</b></p>`;
  }
  html += `<h4>TRANSACTIONS HISTORY</h4><div class="table-wrap"><table><thead><tr><th>INVOICE #</th><th>DATE</th><th>ITEMS</th><th>TOTAL</th><th>PAID</th><th>DUE</th></tr></thead><tbody>`;
  html += salesMatches.map(s => `
    <tr>
      <td><b>${esc(s.invoiceNumber)}</b></td><td>${esc(s.date)} ${esc(s.time)}</td>
      <td>${s.items.map(x => x.name + ' (x' + x.quantity + ')').join(', ')}</td>
      <td>${money(s.total)}</td><td>${money(s.paid)}</td><td>${money(s.due)}</td>
    </tr>
  `).join("") || '<tr><td colspan="6" class="empty">NO SALES RECORDED FOR THIS CUSTOMER</td></tr>';
  html += `</tbody></table></div></div>`;
  host.innerHTML = html;
};

window.handleExpenseSubmit = function(e) {
  if (e) e.preventDefault();
  window.state.expenses.push({
    id: "EXP-" + Date.now(),
    description: $("expenseDescription").value.trim().toUpperCase(),
    amount: num($("expenseAmount").value),
    date: $("expenseDate").value || today()
  });
  window.saveState();
  window.renderExpenses();
  $("expenseForm").reset();
  window.toast("EXPENSE RECORDED!");
};

window.renderExpenses = function() {
  const b = $("expenseTableBody");
  if (!b) return;
  b.innerHTML = window.state.expenses.map(x => `
    <tr><td>${esc(x.date)}</td><td>${esc(x.description)}</td><td>${money(x.amount)}</td></tr>
  `).join("") || '<tr><td colspan="3" class="empty">NO EXPENSES RECORDED</td></tr>';
};

window.handleUserSubmit = function(e) {
  if (e) e.preventDefault();
  let username = $("newUsername").value.trim().toUpperCase();
  if (window.state.users.some(u => u.username === username)) { window.toast("USERNAME ALREADY EXISTS", "error"); return; }
  window.state.users.push({ id: "user-" + Date.now(), username, password: $("newUserPassword").value, role: $("newUserRole").value });
  window.saveState();
  window.renderUsers();
  $("userForm").reset();
  window.toast("USER ACCOUNT CREATED!");
};

window.handlePasswordSubmit = function(e) {
  if (e) e.preventDefault();
  let oldP = $("oldPassword").value;
  let newP = $("newPassword").value;
  let u = window.state.users.find(x => x.id === window.currentSession?.userId);
  if (!u || u.password !== oldP) { window.toast("CURRENT PASSWORD INCORRECT", "error"); return; }
  u.password = newP;
  window.saveState();
  $("passwordForm").reset();
  window.toast("PASSWORD UPDATED!");
};

window.renderUsers = function() {
  const b = $("usersTableBody");
  if (!b) return;
  b.innerHTML = window.state.users.map(u => `<tr><td>${esc(u.username)}</td><td>${esc(u.role)}</td></tr>`).join("");
};

window.refreshAll = function() {
  window.renderDashboard();
  window.renderProducts();
  window.renderReceiving();
  window.renderTransferOptions();
  window.renderSuppliers();
  window.renderCustomers();
  window.renderTransactions();
  window.renderDuplicateBills();
  window.renderReturnsHistory();
  window.renderExpenses();
  window.renderUsers();
  window.populateKhataDropdown();
};

document.addEventListener("DOMContentLoaded", () => {
  window.loadState();
  if ($("productDate")) $("productDate").value = today();
  if ($("supplierPaymentDate")) $("supplierPaymentDate").value = today();
  if ($("expenseDate")) $("expenseDate").value = today();
});
