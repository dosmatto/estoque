import { USE_FIREBASE, firebaseConfig } from "./firebase-config.js";

(function () {
  const STORAGE_KEY = "estoque-fazendas-prototipo-v1";
  const ADMIN_TOKEN = "ADMIN-TESTE-2026";
  const MASTER_ACCOUNT_ID = "master";
  const FIREBASE_DOC_PATH = ["appState", "main"];
  const APP_VERSION = "V.2.3";
  const EXPIRY_WARNING_DAYS = 30;

  const categories = [
    { name: "Adjuvante", color: "#9aa0a6" },
    { name: "Fertilizante", color: "#7bc943" },
    { name: "Fungicida", color: "#d6c900" },
    { name: "Herbicida", color: "#df3d32" },
    { name: "Inseticida", color: "#20a9d8" },
    { name: "Tratamento de Semente", color: "#8b69c6" }
  ];

  const units = ["L / Kg", "L", "Kg"];

  const starterProducts = [
    ["FORSPRAY", "Adjuvante", 9],
    ["PROTAC NORTOX", "Adjuvante", 2],
    ["BANDT MANNI PLEX B MOLY", "Fertilizante", 15],
    ["BRANDT PLANT START", "Fertilizante", 25],
    ["BRANDT SMART TRIO", "Fertilizante", 12.5],
    ["EXPERT GROW", "Fertilizante", 2.5],
    ["YARA VITA BIOTRAC", "Fertilizante", 85],
    ["YARA VITA GRÃOS", "Fertilizante", 145],
    ["YARA VITA MANCOZIN", "Fertilizante", 5],
    ["YARA VITA N RHIZO", "Fertilizante", 2],
    ["ATIVUM", "Fungicida", 5],
    ["AZIMUT", "Fungicida", 1.5],
    ["FOX XPRO", "Fungicida", 8],
    ["FLUAZINAM NORTOX", "Fungicida", 5],
    ["MERTIM", "Fungicida", 7.5],
    ["MIRAVIS", "Fungicida", 17.5],
    ["ODIN", "Fungicida", 7],
    ["PRISMA PLUS", "Fungicida", 4],
    ["PROPICONAZOLE", "Fungicida", 2.5],
    ["ARSENAL", "Herbicida", 2.5],
    ["BASAGRAN", "Herbicida", 4],
    ["CALARIS", "Herbicida", 8],
    ["FUSILADE", "Herbicida", 95],
    ["HELMOQUAT", "Herbicida", 0.8],
    ["NUFURON", "Herbicida", 0.25],
    ["PACTO", "Herbicida", 0.04],
    ["REGLONE", "Herbicida", 15],
    ["SUMYZIN", "Herbicida", 3],
    ["TERRADOR", "Herbicida", 6],
    ["TRIX", "Herbicida", 4],
    ["VERDICT MAX", "Herbicida", 4.5],
    ["VEZIR", "Herbicida", 4],
    ["XEQUE MATE", "Herbicida", 50],
    ["IMUNIT", "Inseticida", 10],
    ["KRATON 100", "Inseticida", 1.5],
    ["METHOMEX", "Inseticida", 10]
  ];

  const app = document.querySelector("#app");
  let state = loadState();
  let currentTab = "fazendas";
  let currentFilter = "Todos";
  let currentSearch = "";
  let activeAccountId = MASTER_ACCOUNT_ID;
  let selectedFarmId = state.farms[0]?.id || null;
  let remoteReady = false;
  let applyingRemoteState = false;
  let remoteDocRef = null;
  let setRemoteDoc = null;
  let remoteServerTimestamp = null;
  let saveTimer = null;

  function createInitialState() {
    const farmId = makeId("farm");
    const products = starterProducts.map(([name, category]) => ({
      id: makeId("prod"),
      name,
      category,
      unit: "L / Kg"
    }));

    const stock = Object.fromEntries(
      starterProducts.map(([name, , qty], index) => [products[index].id, qty])
    );

    return {
      accounts: [
        {
          id: MASTER_ACCOUNT_ID,
          name: "Admin mestre",
          token: ADMIN_TOKEN,
          role: "master",
          createdAt: new Date().toISOString()
        }
      ],
      products,
      farms: [
        {
          id: farmId,
          ownerId: MASTER_ACCOUNT_ID,
          name: "Fazenda Modelo",
          token: "ABC123XYZ",
          createdAt: new Date().toISOString(),
          stock,
          stockLots: Object.entries(stock).map(([productId, quantity]) => ({
            id: makeId("lot"),
            productId,
            quantity,
            dose: 0,
            expiryDate: ""
          })),
          doses: {}
        }
      ],
      movements: []
    };
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return normalizeState(createInitialState());

    try {
      return normalizeState(JSON.parse(saved));
    } catch (error) {
      return normalizeState(createInitialState());
    }
  }

  function normalizeState(data) {
    data.accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const hasMasterAccount = data.accounts.some((account) => account.id === MASTER_ACCOUNT_ID);
    if (!hasMasterAccount) {
      data.accounts.unshift({
        id: MASTER_ACCOUNT_ID,
        name: "Admin mestre",
        token: ADMIN_TOKEN,
        role: "master",
        createdAt: new Date().toISOString()
      });
    }
    data.accounts = data.accounts.map((account) => ({
      ...account,
      id: account.id || makeId("account"),
      name: account.name || "Sub-admin",
      token: account.id === MASTER_ACCOUNT_ID ? ADMIN_TOKEN : account.token,
      role: account.id === MASTER_ACCOUNT_ID ? "master" : "subadmin",
      createdAt: account.createdAt || new Date().toISOString()
    }));
    data.products = (data.products || []).map((product) => ({
      ...product,
      category: product.category === "TS" ? "Tratamento de Semente" : product.category,
      unit: product.unit === "L" ? "L / Kg" : productUnit(product),
      defaultDose: parseDecimal(product.defaultDose) || 0,
      similarProductIds: Array.isArray(product.similarProductIds) ? product.similarProductIds : []
    }));
    data.farms = (data.farms || []).map((farm) => ({
      ...farm,
      ownerId: farm.ownerId || MASTER_ACCOUNT_ID,
      stockLots: normalizeStockLots(farm),
      physicalReviewDate: normalizeDateInput(farm.physicalReviewDate),
      lastUpdatedAt: farm.lastUpdatedAt || ""
    }));
    data.farms.forEach(syncFarmStockFromLots);
    data.movements = (data.movements || []).map((movement) => {
      const farm = data.farms.find((item) => item.id === movement.farmId);
      return {
        ...movement,
        ownerId: movement.ownerId || farm?.ownerId || MASTER_ACCOUNT_ID
      };
    });
    return data;
  }

  function saveState() {
    state = normalizeState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    if (!remoteReady || applyingRemoteState || !remoteDocRef || !setRemoteDoc) return;

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      setRemoteDoc(remoteDocRef, {
        state,
        updatedAt: remoteServerTimestamp()
      }, { merge: true }).catch((error) => {
        console.error("Erro ao salvar no Firebase:", error);
      });
    }, 250);
  }

  async function initFirebaseSync() {
    if (!USE_FIREBASE) return;

    try {
      const [{ initializeApp }, firestore] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
      ]);
      const { getFirestore, doc, setDoc, onSnapshot, serverTimestamp } = firestore;
      const firebaseApp = initializeApp(firebaseConfig);
      const db = getFirestore(firebaseApp);

      setRemoteDoc = setDoc;
      remoteServerTimestamp = serverTimestamp;
      remoteDocRef = doc(db, ...FIREBASE_DOC_PATH);

      onSnapshot(remoteDocRef, async (snapshot) => {
        if (!snapshot.exists()) {
          remoteReady = true;
          await setDoc(remoteDocRef, {
            state: normalizeState(state),
            updatedAt: serverTimestamp()
          }, { merge: true });
          return;
        }

        const remoteState = snapshot.data()?.state;
        if (!remoteState) {
          remoteReady = true;
          return;
        }

        applyingRemoteState = true;
        state = normalizeState(remoteState);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        if (!visibleFarms().some((farm) => farm.id === selectedFarmId)) {
          selectedFarmId = visibleFarms()[0]?.id || null;
        }
        applyingRemoteState = false;
        remoteReady = true;
        route();
      }, (error) => {
        console.error("Erro ao escutar Firebase:", error);
      });
    } catch (error) {
      console.error("Firebase não configurado ou indisponível:", error);
    }
  }

  function makeId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function currentAccount() {
    return state.accounts.find((account) => account.id === activeAccountId) || state.accounts[0];
  }

  function accountByToken(token) {
    return state.accounts.find((account) => account.token === token);
  }

  function isMasterAccount(account = currentAccount()) {
    return account?.id === MASTER_ACCOUNT_ID;
  }

  function visibleFarms(accountId = activeAccountId) {
    return state.farms.filter((farm) => farm.ownerId === accountId);
  }

  function visibleMovements(accountId = activeAccountId) {
    return state.movements.filter((movement) => movement.ownerId === accountId);
  }

  function route() {
    const params = new URLSearchParams(window.location.search);
    const adminToken = params.get("admin");
    const token = params.get("fazenda");

    const account = accountByToken(adminToken);
    if (account) {
      activeAccountId = account.id;
      renderAdmin();
      return;
    }

    const farm = state.farms.find((item) => item.token === token);
    if (farm) {
      renderProducer(farm);
      return;
    }

    renderAccessDenied();
  }

  function categoryColor(category) {
    return categories.find((item) => item.name === category)?.color || "#9aa0a6";
  }

  function formatQty(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function parseDecimal(value) {
    const normalized = String(value || "").trim().replace(",", ".");
    if (!normalized) return null;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeDateInput(value) {
    const text = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
  }

  function parseDateOnly(value) {
    const normalized = normalizeDateInput(value);
    if (!normalized) return null;
    const [year, month, day] = normalized.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function formatDateOnly(value) {
    const date = parseDateOnly(value);
    if (!date) return "-";
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
  }

  function formatOptionalDateTime(value) {
    return value ? formatDate(value) : "Sem alterações registradas";
  }

  function expiryStatus(expiryDate) {
    const date = parseDateOnly(expiryDate);
    if (!date) return { status: "", label: "Sem vencimento" };

    const diffDays = Math.ceil((date - startOfToday()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return { status: "expired", label: `Vencido em ${formatDateOnly(expiryDate)}` };
    if (diffDays <= EXPIRY_WARNING_DAYS) return { status: "warning", label: `Vence em ${formatDateOnly(expiryDate)}` };
    return { status: "ok", label: `Vence em ${formatDateOnly(expiryDate)}` };
  }

  function expiryBadge(expiryDate) {
    const info = expiryStatus(expiryDate);
    if (!info.status) return `<span class="badge badge--muted">Sem vencimento</span>`;
    return `<span class="badge badge--${info.status}">${info.label}</span>`;
  }

  function categorySoftColor(category) {
    const colors = {
      "Adjuvante": "#f0f2f3",
      "Fertilizante": "#edf8e5",
      "Fungicida": "#fffbd1",
      "Herbicida": "#ffe7e5",
      "Inseticida": "#e5f7fc",
      "Tratamento de Semente": "#f0eafa"
    };
    return colors[category] || "#f5f7f4";
  }

  function markFarmUpdated(farm) {
    if (!farm) return;
    farm.lastUpdatedAt = new Date().toISOString();
    state.updatedAt = farm.lastUpdatedAt;
  }

  function markStateUpdated() {
    state.updatedAt = new Date().toISOString();
  }

  function ensureFarmData(farm) {
    if (!farm.stock) farm.stock = {};
    if (!farm.doses) farm.doses = {};
    if (!Array.isArray(farm.stockLots)) farm.stockLots = normalizeStockLots(farm);
    syncFarmStockFromLots(farm);
  }

  function getStockQty(farm, productId) {
    ensureFarmData(farm);
    return stockLotsForProduct(farm, productId).reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
  }

  function setStockQty(farm, productId, quantity) {
    ensureFarmData(farm);
    let lots = stockLotsForProduct(farm, productId);
    if (!lots.length) {
      const lot = createStockLot({ productId, quantity });
      farm.stockLots.push(lot);
      lots = [lot];
    }

    lots.forEach((lot, index) => {
      lot.quantity = index === 0 ? quantity : 0;
    });
    farm.stockLots = farm.stockLots.filter((lot) => Number(lot.quantity || 0) > 0);
    syncFarmStockFromLots(farm);
  }

  function getDose(farm, productId) {
    ensureFarmData(farm);
    return Number(farm.doses[productId] || 0);
  }

  function productDefaultDose(product) {
    return parseDecimal(product.defaultDose) || 0;
  }

  function effectiveDose(farm, product) {
    return getDose(farm, product.id) || productDefaultDose(product);
  }

  function setDose(farm, productId, dose) {
    ensureFarmData(farm);
    if (dose && dose > 0) {
      farm.doses[productId] = dose;
      return;
    }

    delete farm.doses[productId];
  }

  function createStockLot({ productId, quantity = 0, dose = 0, expiryDate = "" }) {
    return {
      id: makeId("lot"),
      productId,
      quantity: Number(quantity || 0),
      dose: parseDecimal(dose) || 0,
      expiryDate: normalizeDateInput(expiryDate)
    };
  }

  function normalizeStockLots(farm) {
    const lots = Array.isArray(farm.stockLots)
      ? farm.stockLots.map((lot) => ({
        id: lot.id || makeId("lot"),
        productId: lot.productId,
        quantity: Number(lot.quantity || 0),
        dose: parseDecimal(lot.dose) || 0,
        expiryDate: normalizeDateInput(lot.expiryDate)
      })).filter((lot) => lot.productId && lot.quantity > 0)
      : [];

    if (lots.length) return lots;

    return Object.entries(farm.stock || {})
      .map(([productId, quantity]) => createStockLot({ productId, quantity }))
      .filter((lot) => lot.quantity > 0);
  }

  function syncFarmStockFromLots(farm) {
    const stock = {};
    (farm.stockLots || []).forEach((lot) => {
      if (Number(lot.quantity || 0) <= 0) return;
      stock[lot.productId] = Number(stock[lot.productId] || 0) + Number(lot.quantity || 0);
    });
    farm.stock = stock;
  }

  function stockLotsForProduct(farm, productId) {
    ensureFarmData(farm);
    return farm.stockLots.filter((lot) => lot.productId === productId && Number(lot.quantity || 0) > 0);
  }

  function getStockLot(farm, lotId) {
    ensureFarmData(farm);
    return farm.stockLots.find((lot) => lot.id === lotId);
  }

  function lotDose(farm, lot, product) {
    return parseDecimal(lot?.dose) || getDose(farm, product.id) || productDefaultDose(product);
  }

  function updateLotDose(farm, lot, dose) {
    const parsedDose = parseDecimal(dose);
    if (parsedDose && parsedDose > 0) lot.dose = parsedDose;
    else lot.dose = 0;
  }

  function updateLotExpiry(farm, lot, expiryDate) {
    lot.expiryDate = normalizeDateInput(expiryDate);
  }

  function hectaresFor(quantity, dose) {
    if (!dose || dose <= 0) return null;
    return quantity / dose;
  }

  function productUnit(product) {
    return units.includes(product.unit) ? product.unit : "L / Kg";
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();
  }

  function getSimilarProducts(productId) {
    const product = state.products.find((item) => item.id === productId);
    const ids = new Set(product?.similarProductIds || []);

    state.products.forEach((candidate) => {
      if ((candidate.similarProductIds || []).includes(productId)) ids.add(candidate.id);
    });

    ids.delete(productId);
    return state.products
      .filter((candidate) => ids.has(candidate.id))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  function farmSimilarProducts(farm, productId) {
    return getSimilarProducts(productId)
      .map((product) => ({
        ...product,
        qty: getStockQty(farm, product.id),
        dose: effectiveDose(farm, product),
        unit: productUnit(product)
      }))
      .filter((product) => product.qty > 0);
  }

  function reportProductsForFarm(farm, selectedCategories = categories.map((category) => category.name)) {
    const categorySet = new Set(selectedCategories);
    ensureFarmData(farm);
    return farm.stockLots
      .map((lot) => {
        const product = state.products.find((item) => item.id === lot.productId);
        if (!product) return null;
        return {
          ...product,
          lotId: lot.id,
          qty: Number(lot.quantity || 0),
          dose: lotDose(farm, lot, product),
          unit: productUnit(product),
          expiryDate: lot.expiryDate
        };
      })
      .filter(Boolean)
      .filter((product) => product.qty > 0)
      .filter((product) => categorySet.has(product.category))
      .sort((a, b) => a.category.localeCompare(b.category, "pt-BR") || a.name.localeCompare(b.name, "pt-BR") || String(a.expiryDate || "").localeCompare(String(b.expiryDate || "")));
  }

  function reportHtml(farms, selectedCategories = categories.map((category) => category.name)) {
    const generatedAt = new Date().toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    });

    const farmSections = farms.map((farm) => {
      const rows = reportProductsForFarm(farm, selectedCategories);
      const body = rows.map((product) => {
        const hectares = hectaresFor(product.qty, product.dose);
        const expiry = expiryStatus(product.expiryDate);
        return `
          <tr style="background: ${categorySoftColor(product.category)}">
            <td>${escapeHtml(product.category)}</td>
            <td>${escapeHtml(product.name)}</td>
            <td>${formatQty(product.qty)} ${escapeHtml(productUnit(product))}</td>
            <td>${product.dose ? `${formatQty(product.dose)} ${escapeHtml(productUnit(product))}/ha` : "-"}</td>
            <td>${hectares === null ? "-" : `${formatQty(hectares)} ha`}</td>
            <td class="${expiry.status === "expired" ? "expired" : expiry.status === "warning" ? "warning" : ""}">${escapeHtml(expiry.label)}</td>
          </tr>
        `;
      }).join("");

      return `
        <section>
          <h2>${escapeHtml(farm.name)}</h2>
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Produto</th>
                <th>Quantidade</th>
                <th>Dose</th>
                <th>Área estimada</th>
                <th>Vencimento</th>
              </tr>
            </thead>
            <tbody>${body || `<tr><td colspan="6">Sem produtos em estoque.</td></tr>`}</tbody>
          </table>
        </section>
      `;
    }).join("");

    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>Relatório de Estoque</title>
          <style>
            body { color: #172018; font-family: Arial, Helvetica, sans-serif; margin: 28px; }
            h1 { margin: 0 0 6px; font-size: 24px; }
            h2 { margin: 24px 0 10px; font-size: 18px; }
            p { color: #657065; margin: 0 0 18px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #dce4da; padding: 8px; text-align: left; }
            th { background: #eef3ed; }
            .expired { color: #b5262f; font-weight: 800; }
            .warning { color: #a76b00; font-weight: 800; }
            .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
            button { min-height: 42px; border: 1px solid #dce4da; border-radius: 8px; background: #fff; color: #172018; padding: 0 14px; font: inherit; font-weight: 700; }
            .primary { background: #1f7a4d; color: #fff; border-color: #1f7a4d; }
            @media print { .actions { display: none; } body { margin: 12mm; } }
          </style>
        </head>
        <body>
          <div class="actions">
            <button onclick="window.close(); if (!window.closed) history.back();">Voltar</button>
            <button class="primary" onclick="window.print()">Imprimir / Salvar PDF</button>
          </div>
          <h1>Relatório de Estoque</h1>
          <p>Gerado em ${escapeHtml(generatedAt)}</p>
          ${farmSections}
        </body>
      </html>
    `;
  }

  function openReport(farms, selectedCategories) {
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      alert("O navegador bloqueou o relatório. Permita pop-ups para este site e tente novamente.");
      return;
    }

    reportWindow.document.open();
    reportWindow.document.write(reportHtml(farms, selectedCategories));
    reportWindow.document.close();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function producerUrl(farm) {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?fazenda=${farm.token}`;
  }

  function adminUrl(account = currentAccount()) {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?admin=${account.token}`;
  }

  function filteredProducts(farm) {
    const search = normalizeText(currentSearch);
    ensureFarmData(farm);
    return farm.stockLots
      .map((lot) => {
        const product = state.products.find((item) => item.id === lot.productId);
        if (!product) return null;
        return {
          ...product,
          lotId: lot.id,
          qty: Number(lot.quantity || 0),
          dose: lotDose(farm, lot, product),
          farmDose: getDose(farm, product.id),
          defaultDose: productDefaultDose(product),
          unit: productUnit(product),
          expiryDate: lot.expiryDate
        };
      })
      .filter(Boolean)
      .filter((item) => item.qty > 0)
      .filter((item) => currentFilter === "Todos" || item.category === currentFilter)
      .filter((item) => {
        if (!search) return true;
        const name = normalizeText(item.name);
        return name.startsWith(search) || name.split(/\s+/).some((part) => part.startsWith(search)) || name.includes(search);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || String(a.expiryDate || "").localeCompare(String(b.expiryDate || "")));
  }

  function farmMetrics(farm) {
    ensureFarmData(farm);
    const entries = farm.stockLots.map((lot) => Number(lot.quantity || 0));
    return {
      products: entries.filter((qty) => qty > 0).length,
      total: entries.reduce((sum, qty) => sum + qty, 0),
      movements: state.movements.filter((item) => item.farmId === farm.id).length
    };
  }

  function latestUpdateForAccount(accountId = activeAccountId) {
    const farms = visibleFarms(accountId);
    const farmIds = new Set(farms.map((farm) => farm.id));
    const dates = [
      state.updatedAt,
      ...farms.map((farm) => farm.lastUpdatedAt),
      ...state.movements.filter((movement) => farmIds.has(movement.farmId)).map((movement) => movement.createdAt)
    ].filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite);

    if (!dates.length) return "";
    return new Date(Math.max(...dates)).toISOString();
  }

  function renderUpdatePanel(farm = null) {
    const lastUpdate = farm?.lastUpdatedAt || latestUpdateForAccount();
    return `
      <section class="status-panel">
        <div class="status-item">
          <span>Última atualização</span>
          <strong>${formatOptionalDateTime(lastUpdate)}</strong>
        </div>
        ${farm ? `
          <div class="status-item">
            <span>Revisão do estoque físico</span>
            <strong>${farm.physicalReviewDate ? formatDateOnly(farm.physicalReviewDate) : "Não informada"}</strong>
          </div>
          <button class="button button--ghost" data-action="edit-physical-review" data-farm-id="${farm.id}">Editar revisão</button>
        ` : ""}
      </section>
    `;
  }

  function renderShell({ title, subtitle, actions, content }) {
    app.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="topbar__inner">
            <div class="brand">
              <span class="app-version">${APP_VERSION}</span>
              <h1 class="brand__title">${title}</h1>
              <span class="brand__subtitle">${subtitle}</span>
            </div>
            <div class="topbar__actions">${actions || ""}</div>
          </div>
        </header>
        <main class="main">${content}</main>
      </div>
    `;
  }

  function renderAccessDenied() {
    renderShell({
      title: "Estoque Fazendas",
      subtitle: "Acesso por link reservado",
      actions: "",
      content: `
        <section class="panel">
          <div class="empty">Use o link da fazenda ou o link mestre do admin para acessar.</div>
        </section>
      `
    });
  }

  function renderAdmin() {
    const account = currentAccount();
    const farms = visibleFarms();
    if (currentTab === "subadmins" && !isMasterAccount(account)) currentTab = "fazendas";
    if (!selectedFarmId || !farms.some((farm) => farm.id === selectedFarmId)) {
      selectedFarmId = farms[0]?.id || null;
    }

    renderShell({
      title: "Estoque Fazendas",
      subtitle: isMasterAccount(account) ? "Admin mestre" : `Sub-admin: ${account.name}`,
      actions: `
        <button class="button button--primary" data-action="new-farm">+ Nova Fazenda</button>
        <button class="button button--ghost" data-action="open-reports-tab">Relatórios</button>
      `,
      content: `
        ${currentTab === "estoque" ? "" : renderUpdatePanel()}
        <nav class="tabs" aria-label="Telas do admin">
          ${tabButton("fazendas", "Fazendas")}
          ${tabButton("estoque", "Estoque da fazenda")}
          ${tabButton("consolidado", "Consolidado")}
          ${tabButton("produtos", "Lista mestre")}
          ${tabButton("relatorios", "Relatórios")}
          ${isMasterAccount(account) ? tabButton("subadmins", "Sub-admins") : ""}
        </nav>
        ${renderAdminTab()}
      `
    });
  }

  function tabButton(id, label) {
    return `<button class="tab ${currentTab === id ? "is-active" : ""}" data-tab="${id}">${label}</button>`;
  }

  function renderAdminTab() {
    if (currentTab === "estoque") return renderFarmStockAdmin();
    if (currentTab === "consolidado") return renderConsolidated();
    if (currentTab === "produtos") return renderMasterProducts();
    if (currentTab === "relatorios") return renderReports();
    if (currentTab === "subadmins" && isMasterAccount()) return renderSubAdmins();
    return renderFarms();
  }

  function renderFarms() {
    const farms = visibleFarms();
    return `
      <section class="farm-grid">
        ${farms.map(renderFarmCard).join("") || `<div class="empty">Nenhuma fazenda cadastrada para este usuário.</div>`}
      </section>
    `;
  }

  function renderSubAdmins() {
    const subAdmins = state.accounts.filter((account) => account.id !== MASTER_ACCOUNT_ID);
    return `
      <section class="panel">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">Sub-admins</h2>
            <p class="panel__hint">Cada sub-admin tem fazendas, estoque e histórico separados. A lista mestre de produtos é global.</p>
          </div>
          <button class="button button--primary" data-action="new-subadmin">+ Sub-admin</button>
        </div>
        <div class="list">
          ${subAdmins.map((account) => {
            const farms = visibleFarms(account.id);
            const movements = visibleMovements(account.id);
            return `
              <div class="list-row">
                <div>
                  <div class="list-row__title">${account.name}</div>
                  <div class="list-row__meta">${farms.length} fazenda(s) | ${movements.length} movimentação(ões)</div>
                  <a class="farm-card__link" href="${adminUrl(account)}">${adminUrl(account)}</a>
                </div>
              </div>
            `;
          }).join("") || `<div class="empty">Nenhum sub-admin cadastrado ainda.</div>`}
        </div>
      </section>
    `;
  }

  function renderFarmCard(farm) {
    const metrics = farmMetrics(farm);
    return `
      <article class="farm-card">
        <div class="farm-card__header">
          <div>
            <h2 class="farm-card__name">${farm.name}</h2>
            <div class="farm-card__meta">Criada em ${formatDate(farm.createdAt)}</div>
          </div>
          <div class="farm-card__actions">
            <button class="button button--ghost" data-action="open-farm-admin" data-farm-id="${farm.id}">Ver</button>
            <button class="button button--ghost" data-action="generate-farm-report" data-farm-id="${farm.id}">Relatório</button>
            <button class="button button--danger" data-action="confirm-delete-farm" data-farm-id="${farm.id}">Remover</button>
          </div>
        </div>
        <a class="farm-card__link" href="${producerUrl(farm)}">${producerUrl(farm)}</a>
        <div class="summary-grid">
          <div class="metric">
            <div class="metric__label">Produtos</div>
            <div class="metric__value">${metrics.products}</div>
          </div>
          <div class="metric">
            <div class="metric__label">Total</div>
            <div class="metric__value">${formatQty(metrics.total)}</div>
          </div>
          <div class="metric">
            <div class="metric__label">Histórico</div>
            <div class="metric__value">${metrics.movements}</div>
          </div>
        </div>
      </article>
    `;
  }

  function renderFarmStockAdmin() {
    const farms = visibleFarms();
    const farm = farms.find((item) => item.id === selectedFarmId);
    if (!farm) return `<div class="empty">Crie uma fazenda para visualizar o estoque.</div>`;

    return `
      ${renderUpdatePanel(farm)}
      <section class="panel">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">${farm.name}</h2>
            <p class="panel__hint">A mesma visão do produtor, com acesso pelo admin.</p>
          </div>
          <div class="panel__actions">
            <select data-action="select-farm">
              ${farms.map((item) => `<option value="${item.id}" ${item.id === farm.id ? "selected" : ""}>${item.name}</option>`).join("")}
            </select>
            <button class="button button--primary" data-action="add-product-farm" data-farm-id="${farm.id}">+ Adicionar produto</button>
          </div>
        </div>
      </section>
      ${renderFilters()}
      ${renderProductSearch()}
      <div data-stock-summary>${renderStockSummary(farm)}</div>
      <div data-product-grid>${renderProductGrid(farm)}</div>
      ${renderHistory(farm)}
    `;
  }

  function renderConsolidated() {
    const farms = visibleFarms();
    const rows = state.products
      .filter((product) => currentFilter === "Todos" || product.category === currentFilter)
      .map((product) => {
        const total = farms.reduce((sum, farm) => sum + getStockQty(farm, product.id), 0);
        return { ...product, total };
      })
      .filter((product) => product.total > 0)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));

    const categoryCount = new Set(rows.map((product) => product.category)).size;

    return `
      ${renderFilters()}
      <section class="summary-grid">
        <div class="metric">
          <div class="metric__label">Fazendas</div>
          <div class="metric__value">${farms.length}</div>
        </div>
        <div class="metric">
          <div class="metric__label">Produtos filtrados</div>
          <div class="metric__value">${rows.length}</div>
        </div>
        <div class="metric">
          <div class="metric__label">Categorias</div>
          <div class="metric__value">${categoryCount}</div>
        </div>
      </section>
      <section class="panel">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">Visão consolidada</h2>
            <p class="panel__hint">Somatório do estoque das fazendas deste usuário.</p>
          </div>
        </div>
        <div class="list">
          ${rows.map((product) => `
            <div class="list-row" style="--category-color: ${categoryColor(product.category)}">
              <div>
                <div class="list-row__title">${product.name}</div>
                <div class="list-row__meta">
                  <span class="badge">${product.category}</span>
                  <span class="badge">${productUnit(product)}</span>
                  ${productDefaultDose(product) ? `<span class="badge">Dose ${formatQty(productDefaultDose(product))} ${productUnit(product)}/ha</span>` : ""}
                </div>
              </div>
              <strong>${formatQty(product.total)} ${productUnit(product)}</strong>
            </div>
          `).join("") || `<div class="empty">Nenhum produto com estoque neste filtro.</div>`}
        </div>
      </section>
    `;
  }

  function renderMasterProducts() {
    const rows = state.products
      .filter((product) => currentFilter === "Todos" || product.category === currentFilter)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return `
      ${renderFilters()}
      <section class="panel">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">Lista mestre de produtos</h2>
            <p class="panel__hint">Produtos disponíveis para as fazendas.</p>
          </div>
          <button class="button button--primary" data-action="new-product">+ Produto</button>
        </div>
        <div class="list">
          ${rows.map((product) => `
            <div class="list-row" style="--category-color: ${categoryColor(product.category)}">
              <div>
                <div class="list-row__title">${product.name}</div>
                <div class="list-row__meta">
                  <span class="badge">${product.category}</span>
                  <span class="badge">${productUnit(product)}</span>
                  ${productDefaultDose(product) ? `<span class="badge">Dose ${formatQty(productDefaultDose(product))} ${productUnit(product)}/ha</span>` : ""}
                  ${getSimilarProducts(product.id).length ? `<span class="badge">${getSimilarProducts(product.id).length} similar(es)</span>` : ""}
                </div>
              </div>
              <div class="list-row__actions">
                <button class="button button--ghost" data-action="edit-product" data-product-id="${product.id}">Editar</button>
                <button class="button button--ghost" data-action="edit-similar-products" data-product-id="${product.id}">Similares</button>
                <button class="button button--warning" data-action="merge-product" data-product-id="${product.id}">Unificar</button>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderReports() {
    const farms = visibleFarms();
    return `
      <section class="panel">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">Relatórios</h2>
            <p class="panel__hint">Escolha uma ou mais fazendas para gerar a relação de produtos em estoque.</p>
          </div>
          <button class="button button--primary" data-action="generate-admin-report">Gerar relatório</button>
        </div>
        <div class="report-options">
          <div>
            <h3 class="section-label">Fazendas</h3>
            <label class="checkbox-row">
              <input type="checkbox" data-report-all="farms" checked>
              <span>Todas as fazendas</span>
            </label>
            <div class="checkbox-list" data-report-farms>
              ${farms.map((farm) => `
                <label class="checkbox-row">
                  <input type="checkbox" name="reportFarmId" value="${farm.id}" checked>
                  <span>${farm.name}</span>
                </label>
              `).join("") || `<div class="empty">Nenhuma fazenda cadastrada.</div>`}
            </div>
          </div>
          <div>
            <h3 class="section-label">Categorias</h3>
            <label class="checkbox-row">
              <input type="checkbox" data-report-all="categories" checked>
              <span>Todas as categorias</span>
            </label>
            <div class="checkbox-list" data-report-categories>
              ${categories.map((category) => `
                <label class="checkbox-row">
                  <input type="checkbox" name="reportCategory" value="${category.name}" checked>
                  <span>${category.name}</span>
                </label>
              `).join("")}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderProducer(farm) {
    renderShell({
      title: farm.name,
      subtitle: "Controle de estoque da fazenda",
      actions: `
        <button class="button button--primary" data-action="add-product-farm" data-farm-id="${farm.id}">+ Adicionar produto</button>
        <button class="button button--ghost" data-action="generate-farm-report" data-farm-id="${farm.id}">Relatório</button>
      `,
      content: `
        ${renderUpdatePanel(farm)}
        <section class="panel quick-actions">
          <button class="button button--primary" data-action="add-product-farm" data-farm-id="${farm.id}">+ Adicionar produto</button>
          <button class="button button--ghost" data-action="generate-farm-report" data-farm-id="${farm.id}">Relatório</button>
        </section>
        ${renderFilters()}
        ${renderProductSearch()}
        <div data-stock-summary>${renderStockSummary(farm)}</div>
        <div data-product-grid>${renderProductGrid(farm)}</div>
        ${renderHistory(farm)}
      `
    });
  }

  function renderFilters() {
    const all = ["Todos", ...categories.map((item) => item.name)];
    return `
      <nav class="filters" aria-label="Filtro por categoria">
        ${all.map((category) => `
          <button class="chip ${currentFilter === category ? "is-active" : ""}" data-filter="${category}">
            ${category !== "Todos" ? `<span class="chip__dot" style="background: ${categoryColor(category)}"></span>` : ""}
            ${category}
          </button>
        `).join("")}
      </nav>
    `;
  }

  function renderProductSearch() {
    return `
      <section class="search-panel">
        <label class="search-field">
          <span>Buscar produto</span>
          <input type="search" data-product-search value="${escapeHtml(currentSearch)}" placeholder="Digite as primeiras letras do produto">
        </label>
      </section>
    `;
  }

  function currentVisibleFarm() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("fazenda");
    return state.farms.find((farm) => farm.token === token) || visibleFarms().find((farm) => farm.id === selectedFarmId);
  }

  function refreshFarmProductView() {
    const farm = currentVisibleFarm();
    if (!farm) return;

    const summary = document.querySelector("[data-stock-summary]");
    const grid = document.querySelector("[data-product-grid]");
    if (summary) summary.innerHTML = renderStockSummary(farm);
    if (grid) grid.innerHTML = renderProductGrid(farm);
  }

  function renderProductGrid(farm) {
    const products = filteredProducts(farm);
    return `
      <section class="product-grid">
        ${products.map((product) => renderProductCard(product, farm)).join("") || `<div class="empty">Nenhum item encontrado.</div>`}
      </section>
    `;
  }

  function renderStockSummary(farm) {
    const products = filteredProducts(farm);
    const visibleCategories = categories
      .filter((category) => currentFilter === "Todos" || category.name === currentFilter)
      .map((category) => ({
        ...category,
        products: products.filter((product) => product.category === category.name)
      }))
      .filter((category) => category.products.length > 0);

    const total = products.reduce((sum, product) => sum + product.qty, 0);

    return `
      <section class="panel stock-summary">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">Resumo do estoque</h2>
            <p class="panel__hint">Lista organizada por categoria para conferência rápida.</p>
          </div>
          <strong>${products.length} itens</strong>
        </div>
        <div class="summary-categories">
          ${visibleCategories.map((category) => {
            const categoryTotal = category.products.reduce((sum, product) => sum + product.qty, 0);
            return `
              <div class="summary-category" style="--category-color: ${category.color}">
                <div class="summary-category__header">
                  <span class="badge">${category.name}</span>
                  <strong>${category.products.length} itens</strong>
                </div>
                <div class="summary-list">
                  ${category.products
                    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
                    .map((product) => renderSummaryRow(product)).join("")}
                </div>
              </div>
            `;
          }).join("") || `<div class="empty">Nenhum produto neste filtro.</div>`}
        </div>
      </section>
    `;
  }

  function renderSummaryRow(product) {
    const hectares = hectaresFor(product.qty, product.dose);
    const unit = productUnit(product);
    const doseText = product.dose ? `Dose: ${formatQty(product.dose)} ${unit}/ha` : "Dose não informada";
    const expiry = expiryStatus(product.expiryDate);

    return `
      <div class="summary-row ${expiry.status === "expired" ? "is-expired" : expiry.status === "warning" ? "is-warning" : ""}">
        <div>
          <span>${product.name}</span>
          <div class="summary-row__meta">${doseText} | ${expiry.label}</div>
        </div>
        <div class="summary-row__numbers">
          <strong>${formatQty(product.qty)} ${unit}</strong>
          ${hectares === null ? `<small>- ha</small>` : `<small>${formatQty(hectares)} ha</small>`}
        </div>
      </div>
    `;
  }

  function renderProductCard(product, farm) {
    const hectares = hectaresFor(product.qty, product.dose);
    const unit = productUnit(product);
    const similarProducts = farmSimilarProducts(farm, product.id);
    const expiry = expiryStatus(product.expiryDate);
    return `
      <article class="product-card ${expiry.status === "expired" ? "is-expired" : expiry.status === "warning" ? "is-warning" : ""}" style="--category-color: ${categoryColor(product.category)}">
        <div class="product-card__header">
          <div>
            <h2 class="product-card__name">${product.name}</h2>
            <div class="product-card__meta"><span class="badge">${product.category}</span> <span class="badge">${unit}</span> ${expiryBadge(product.expiryDate)}</div>
          </div>
        </div>
        <div class="product-card__body">
          <div>
            <div class="metric__label">Quantidade atual</div>
            <div class="quantity">${formatQty(product.qty)} <small>${unit}</small></div>
          </div>
          <div class="dose-info">
            <div>
              <span>Dose</span>
              <strong>${product.dose ? `${formatQty(product.dose)} ${unit}/ha` : "-"}</strong>
            </div>
            <div>
              <span>Área</span>
              <strong>${hectares === null ? "-" : `${formatQty(hectares)} ha`}</strong>
            </div>
            <div>
              <span>Venc.</span>
              <strong>${product.expiryDate ? formatDateOnly(product.expiryDate) : "-"}</strong>
            </div>
          </div>
        </div>
        ${similarProducts.length ? `
          <div class="similar-box">
            <div class="metric__label">Produtos similares no estoque</div>
            <div class="similar-list">
              ${similarProducts.map((similar) => {
                const similarHectares = hectaresFor(similar.qty, similar.dose);
                return `
                  <div class="similar-row">
                    <span>${similar.name}</span>
                    <strong>${formatQty(similar.qty)} ${productUnit(similar)}${similarHectares === null ? "" : ` - ${formatQty(similarHectares)} ha`}</strong>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        ` : ""}
        <div class="product-card__actions">
          <button class="button button--primary" data-action="move" data-type="entrada" data-farm-id="${farm.id}" data-product-id="${product.id}" data-lot-id="${product.lotId}">+ Entrada</button>
          <button class="button button--warning" data-action="move" data-type="saida" data-farm-id="${farm.id}" data-product-id="${product.id}" data-lot-id="${product.lotId}">- Saída</button>
          <button class="button button--ghost" data-action="edit-dose" data-farm-id="${farm.id}" data-product-id="${product.id}" data-lot-id="${product.lotId}">Editar dose</button>
          <button class="button button--ghost" data-action="edit-expiry" data-farm-id="${farm.id}" data-product-id="${product.id}" data-lot-id="${product.lotId}">Editar vencimento</button>
          <button class="button button--ghost" data-action="manual-edit" data-farm-id="${farm.id}" data-product-id="${product.id}" data-lot-id="${product.lotId}">Editar manualmente</button>
        </div>
      </article>
    `;
  }

  function renderHistory(farm) {
    const rows = state.movements
      .filter((item) => item.farmId === farm.id)
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 80);

    return `
      <section class="panel">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">Histórico</h2>
            <p class="panel__hint">Entradas, saídas e ajustes manuais.</p>
          </div>
        </div>
        <div class="list">
          ${rows.map((item) => {
            const product = state.products.find((candidate) => candidate.id === item.productId);
            const unit = product ? productUnit(product) : "";
            const doseSourceText = item.doseSource === "padrao" ? " - dose padrão" : "";
            const valueText = item.type === "dose"
              ? (item.dose ? `${formatQty(item.dose)} ${unit}/ha` : "Dose removida")
              : item.type === "vencimento" || item.type === "revisao"
                ? item.note
                : `${item.type === "saida" ? "-" : item.type === "entrada" ? "+" : ""}${formatQty(item.quantity)} ${unit}`;
            const titleText = item.type === "revisao" ? "Revisão do estoque físico" : product?.name || "Produto removido";
            return `
              <div class="list-row">
                <div>
                  <div class="list-row__title">${titleText}</div>
                  <div class="list-row__meta">${formatDate(item.createdAt)} - ${item.type}${doseSourceText}</div>
                </div>
                <strong>${valueText}</strong>
              </div>
            `;
          }).join("") || `<div class="empty">Nenhuma movimentação registrada ainda.</div>`}
        </div>
      </section>
    `;
  }

  function openModal({ title, submitLabel = "Salvar", fields, onSubmit, afterOpen }) {
    const template = document.querySelector("#modal-template");
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector("[data-modal-title]").textContent = title;
    node.querySelector("[data-modal-submit]").textContent = submitLabel;
    node.querySelector("[data-modal-body]").innerHTML = fields;
    document.body.appendChild(node);

    node.addEventListener("click", (event) => {
      if (event.target.matches("[data-close-modal]")) node.remove();
    });

    node.querySelector("[data-modal-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const data = Object.fromEntries(formData);
      for (const key of formData.keys()) {
        const values = formData.getAll(key);
        if (values.length > 1) data[key] = values;
      }
      const result = onSubmit(data);
      if (result === false) return;
      saveState();
      node.remove();
      route();
    });

    const firstInput = node.querySelector("input, select, textarea");
    if (firstInput) firstInput.focus();
    if (afterOpen) afterOpen(node);
  }

  function fieldsForProduct(product = {}) {
    return `
      <label class="field">
        <span>Nome do produto</span>
        <input name="name" required value="${product.name || ""}">
      </label>
      <label class="field">
        <span>Categoria</span>
        <select name="category" required>
          ${categories.map((item) => `<option value="${item.name}" ${product.category === item.name ? "selected" : ""}>${item.name}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span>Unidade</span>
        <select name="unit" required>
          ${units.map((unit) => `<option value="${unit}" ${productUnit(product) === unit ? "selected" : ""}>${unit}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span>Dose padrão por hectare (opcional)</span>
        <input name="defaultDose" type="text" inputmode="decimal" pattern="[0-9]+([,.][0-9]+)?" value="${productDefaultDose(product) ? formatQty(productDefaultDose(product)) : ""}" placeholder="Ex: 0,5">
      </label>
    `;
  }

  function movementFields(type, product, currentQty, currentDose, currentExpiryDate) {
    const title = type === "manual" ? "Nova quantidade" : "Quantidade";
    const unit = productUnit(product);
    return `
      <div class="field">
        <label>${product.name}</label>
        <div class="panel__hint">Quantidade atual: ${formatQty(currentQty)} ${unit}</div>
      </div>
      <label class="field">
        <span>${title}</span>
        <input name="quantity" type="text" required inputmode="decimal" pattern="[0-9]+([,.][0-9]+)?">
      </label>
      <label class="field">
        <span>Dose por hectare (opcional)</span>
        <input name="dose" type="text" inputmode="decimal" pattern="[0-9]+([,.][0-9]+)?" value="${currentDose ? formatQty(currentDose) : ""}" placeholder="Ex: 0,5 ${unit}/ha">
      </label>
      <label class="field">
        <span>Data de vencimento (opcional)</span>
        <input name="expiryDate" type="date" value="${normalizeDateInput(currentExpiryDate)}">
      </label>
      <label class="field">
        <span>Observação</span>
        <textarea name="note" placeholder="Opcional"></textarea>
      </label>
    `;
  }

  function addProductToFarmFields() {
    return `
      <div class="segmented">
        <label>
          <input type="radio" name="productMode" value="existing" checked data-product-mode>
          <span>Da lista</span>
        </label>
        <label>
          <input type="radio" name="productMode" value="new" data-product-mode>
          <span>Novo produto</span>
        </label>
      </div>
      <div class="mode-panel" data-mode-panel="existing">
        <label class="field">
          <span>Buscar na lista mestre</span>
          <input type="search" data-master-product-search placeholder="Digite as primeiras letras do produto">
        </label>
        <label class="field">
          <span>Produto da lista mestre</span>
          <input type="hidden" name="productId" data-existing-product required value="${state.products[0]?.id || ""}">
          <div class="master-product-list" data-master-product-list>
            ${renderMasterProductOptions()}
          </div>
        </label>
      </div>
      <div class="mode-panel is-hidden" data-mode-panel="new">
        <label class="field">
          <span>Nome do produto</span>
          <input name="newProductName" data-new-product disabled placeholder="Ex: NOVO DEFENSIVO">
        </label>
        <label class="field">
          <span>Tipo do produto</span>
          <select name="newProductCategory" data-new-product disabled>
            ${categories.map((item) => `<option value="${item.name}">${item.name}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>Unidade</span>
          <select name="newProductUnit" data-new-product disabled>
            ${units.map((unit) => `<option value="${unit}">${unit}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>Dose padrão por hectare (opcional)</span>
          <input name="newProductDefaultDose" type="text" inputmode="decimal" pattern="[0-9]+([,.][0-9]+)?" data-new-product disabled placeholder="Ex: 0,5">
        </label>
      </div>
      <label class="field">
        <span>Quantidade inicial</span>
        <input name="quantity" type="text" required inputmode="decimal" pattern="[0-9]+([,.][0-9]+)?" value="0">
      </label>
      <label class="field">
        <span>Dose por hectare (opcional)</span>
        <input name="dose" type="text" inputmode="decimal" pattern="[0-9]+([,.][0-9]+)?" placeholder="Ex: 0,5">
      </label>
      <label class="field">
        <span>Data de vencimento (opcional)</span>
        <input name="expiryDate" type="date">
      </label>
    `;
  }

  function renderMasterProductOptions(search = "") {
    const normalizedSearch = normalizeText(search);
    const products = state.products
      .filter((product) => {
        if (!normalizedSearch) return true;
        const name = normalizeText(product.name);
        return name.startsWith(normalizedSearch) || name.split(/\s+/).some((part) => part.startsWith(normalizedSearch)) || name.includes(normalizedSearch);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return products.map((product, index) => `
      <button class="master-product-option ${index === 0 ? "is-selected" : ""}" type="button" data-action="select-master-product" data-product-id="${product.id}">
        <span>${product.name}</span>
        <small>${product.category} - ${productUnit(product)}</small>
      </button>
    `).join("") || `<div class="empty">Nenhum produto encontrado.</div>`;
  }

  function refreshMasterProductOptions(input) {
    const form = input.closest("form");
    const list = form.querySelector("[data-master-product-list]");
    const hiddenInput = form.querySelector("[data-existing-product]");
    list.innerHTML = renderMasterProductOptions(input.value);
    const firstOption = list.querySelector("[data-product-id]");
    hiddenInput.value = firstOption ? firstOption.dataset.productId : "";
  }

  function syncProductMode(form) {
    const mode = new FormData(form).get("productMode") || "existing";
    form.querySelectorAll("[data-mode-panel]").forEach((panel) => {
      panel.classList.toggle("is-hidden", panel.dataset.modePanel !== mode);
    });
    form.querySelectorAll("[data-existing-product]").forEach((input) => {
      input.disabled = mode !== "existing";
      input.required = mode === "existing";
    });
    form.querySelectorAll("[data-new-product]").forEach((input) => {
      input.disabled = mode !== "new";
      input.required = mode === "new";
    });
  }

  function similarProductsFields(product) {
    const selectedIds = new Set(getSimilarProducts(product.id).map((item) => item.id));
    const candidates = state.products
      .filter((item) => item.id !== product.id)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return `
      <div class="field">
        <label>${product.name}</label>
        <div class="panel__hint">Marque produtos que podem ser usados como alternativa ou são equivalentes no estoque.</div>
      </div>
      <div class="checkbox-list">
        ${candidates.map((candidate) => `
          <label class="checkbox-row">
            <input type="checkbox" name="similarProductIds" value="${candidate.id}" ${selectedIds.has(candidate.id) ? "checked" : ""}>
            <span>${candidate.name} - ${candidate.category} - ${productUnit(candidate)}</span>
          </label>
        `).join("") || `<div class="empty">Nenhum outro produto cadastrado.</div>`}
      </div>
    `;
  }

  function updateSimilarProducts(productId, similarProductIds) {
    const ids = Array.isArray(similarProductIds)
      ? similarProductIds
      : similarProductIds
        ? [similarProductIds]
        : [];
    const selected = new Set(ids.filter((id) => id && id !== productId));

    state.products.forEach((product) => {
      const current = new Set(product.similarProductIds || []);

      if (product.id === productId) {
        product.similarProductIds = Array.from(selected);
        return;
      }

      if (selected.has(product.id)) current.add(productId);
      else current.delete(productId);

      product.similarProductIds = Array.from(current);
    });
    markStateUpdated();
  }

  function findOrCreateProduct(name, category, unit, defaultDose) {
    const normalizedName = name.trim().toUpperCase();
    const parsedDefaultDose = parseDecimal(defaultDose) || 0;
    const existing = state.products.find(
      (product) => product.name.toUpperCase() === normalizedName && product.category === category
    );

    if (existing) {
      existing.unit = unit || productUnit(existing);
      if (parsedDefaultDose) existing.defaultDose = parsedDefaultDose;
      return existing;
    }

    const product = {
      id: makeId("prod"),
      name: normalizedName,
      category,
      unit: unit || "L / Kg",
      defaultDose: parsedDefaultDose
    };
    state.products.push(product);
    markStateUpdated();
    return product;
  }

  function mergeProductInto({ sourceProductId, targetProductId }) {
    if (!sourceProductId || !targetProductId || sourceProductId === targetProductId) return;

    const sourceProduct = state.products.find((product) => product.id === sourceProductId);
    const targetProduct = state.products.find((product) => product.id === targetProductId);
    if (!sourceProduct || !targetProduct) return;

    state.farms.forEach((farm) => {
      ensureFarmData(farm);
      const sourceDose = getDose(farm, sourceProductId);
      const targetDose = getDose(farm, targetProductId);

      farm.stockLots.forEach((lot) => {
        if (lot.productId === sourceProductId) lot.productId = targetProductId;
      });
      syncFarmStockFromLots(farm);
      delete farm.stock[sourceProductId];

      if (!targetDose && sourceDose) setDose(farm, targetProductId, sourceDose);
      delete farm.doses[sourceProductId];
    });

    state.movements.forEach((movement) => {
      if (movement.productId === sourceProductId) movement.productId = targetProductId;
    });

    state.products = state.products.filter((product) => product.id !== sourceProductId);
    markStateUpdated();
  }

  function updateDose({ farmId, productId, lotId, dose }) {
    const farm = state.farms.find((item) => item.id === farmId);
    const parsedDose = parseDecimal(dose);
    const lot = lotId ? getStockLot(farm, lotId) : null;

    if (lot) updateLotDose(farm, lot, parsedDose);
    else setDose(farm, productId, parsedDose);
    markFarmUpdated(farm);
    state.movements.push({
      id: makeId("mov"),
      farmId,
      ownerId: farm.ownerId,
      productId,
      lotId: lot?.id || "",
      type: "dose",
      quantity: parsedDose || 0,
      dose: parsedDose || null,
      doseSource: parsedDose ? "fazenda" : "",
      previousQuantity: getStockQty(farm, productId),
      nextQuantity: getStockQty(farm, productId),
      note: "Dose editada",
      createdAt: new Date().toISOString()
    });
  }

  function updateExpiry({ farmId, productId, lotId, expiryDate }) {
    const farm = state.farms.find((item) => item.id === farmId);
    const lot = getStockLot(farm, lotId);
    if (!lot) return;

    updateLotExpiry(farm, lot, expiryDate);
    markFarmUpdated(farm);
    state.movements.push({
      id: makeId("mov"),
      farmId,
      ownerId: farm.ownerId,
      productId,
      lotId: lot.id,
      type: "vencimento",
      quantity: 0,
      dose: lotDose(farm, lot, state.products.find((item) => item.id === productId) || {}),
      previousQuantity: Number(lot.quantity || 0),
      nextQuantity: Number(lot.quantity || 0),
      note: lot.expiryDate ? `Vencimento: ${formatDateOnly(lot.expiryDate)}` : "Vencimento removido",
      createdAt: new Date().toISOString()
    });
  }

  function updatePhysicalReview({ farmId, physicalReviewDate }) {
    const farm = state.farms.find((item) => item.id === farmId);
    if (!farm) return;
    farm.physicalReviewDate = normalizeDateInput(physicalReviewDate);
    markFarmUpdated(farm);
    state.movements.push({
      id: makeId("mov"),
      farmId,
      ownerId: farm.ownerId,
      productId: "",
      lotId: "",
      type: "revisao",
      quantity: 0,
      dose: null,
      previousQuantity: 0,
      nextQuantity: 0,
      note: farm.physicalReviewDate ? `Estoque físico revisado em ${formatDateOnly(farm.physicalReviewDate)}` : "Revisão física removida",
      createdAt: new Date().toISOString()
    });
  }

  function addMovement({ farmId, productId, lotId, type, quantity, dose, expiryDate, note }) {
    const farm = state.farms.find((item) => item.id === farmId);
    const product = state.products.find((item) => item.id === productId);
    let lot = lotId ? getStockLot(farm, lotId) : null;
    if (!lot) {
      lot = createStockLot({ productId, quantity: 0, dose: productDefaultDose(product || {}), expiryDate });
      farm.stockLots.push(lot);
    }
    const currentQty = Number(lot.quantity || 0);
    const parsedQty = parseDecimal(quantity) || 0;
    const typedDose = parseDecimal(dose);
    const parsedDose = typedDose !== null ? typedDose : lotDose(farm, lot, product || {});
    let nextQty = currentQty;

    if (type === "entrada") nextQty += parsedQty;
    if (type === "saida") nextQty = Math.max(0, nextQty - parsedQty);
    if (type === "edicao") nextQty = parsedQty;

    lot.quantity = nextQty;
    if (parsedDose) updateLotDose(farm, lot, parsedDose);
    if (expiryDate !== undefined) updateLotExpiry(farm, lot, expiryDate);
    farm.stockLots = farm.stockLots.filter((item) => Number(item.quantity || 0) > 0);
    syncFarmStockFromLots(farm);
    markFarmUpdated(farm);
    state.movements.push({
      id: makeId("mov"),
      farmId,
      ownerId: farm.ownerId,
      productId,
      lotId: lot.id,
      type,
      quantity: parsedQty,
      dose: parsedDose,
      expiryDate: lot.expiryDate,
      previousQuantity: currentQty,
      nextQuantity: nextQty,
      note: note || "",
      createdAt: new Date().toISOString()
    });
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button, a");
    if (!button) return;

    const action = button.dataset.action;

    if (button.dataset.tab) {
      currentTab = button.dataset.tab;
      route();
    }

    if (button.dataset.filter) {
      currentFilter = button.dataset.filter;
      if (document.querySelector("[data-product-search]")) refreshFarmProductView();
      else route();
    }

    if (action === "select-master-product") {
      const form = button.closest("form");
      form.querySelector("[data-existing-product]").value = button.dataset.productId;
      form.querySelectorAll(".master-product-option").forEach((option) => {
        option.classList.toggle("is-selected", option === button);
      });
      return;
    }

    if (action === "new-farm") {
      openModal({
        title: "Nova fazenda",
        submitLabel: "Criar fazenda",
        fields: `
          <label class="field">
            <span>Nome da fazenda</span>
            <input name="name" required placeholder="Ex: Fazenda Santa Clara">
          </label>
        `,
        onSubmit(data) {
          const farm = {
            id: makeId("farm"),
            ownerId: activeAccountId,
            name: data.name,
            token: Math.random().toString(36).slice(2, 11).toUpperCase(),
            createdAt: new Date().toISOString(),
            stock: {},
            stockLots: [],
            doses: {}
          };
          markFarmUpdated(farm);
          state.farms.push(farm);
          selectedFarmId = farm.id;
          currentTab = "fazendas";
        }
      });
    }

    if (action === "new-subadmin" && isMasterAccount()) {
      openModal({
        title: "Novo sub-admin",
        submitLabel: "Criar sub-admin",
        fields: `
          <label class="field">
            <span>Nome do sub-admin</span>
            <input name="name" required placeholder="Ex: João - Região Sul">
          </label>
        `,
        onSubmit(data) {
          const account = {
            id: makeId("account"),
            name: data.name.trim(),
            token: `SUB-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
            role: "subadmin",
            createdAt: new Date().toISOString()
          };
          state.accounts.push(account);
          markStateUpdated();
          currentTab = "subadmins";
        }
      });
    }

    if (action === "open-reports-tab") {
      currentTab = "relatorios";
      route();
    }

    if (action === "edit-physical-review") {
      const farm = state.farms.find((item) => item.id === button.dataset.farmId);
      openModal({
        title: "Revisão do estoque físico",
        submitLabel: "Salvar revisão",
        fields: `
          <div class="field">
            <label>${farm.name}</label>
            <div class="panel__hint">Informe o dia em que todo o estoque físico foi conferido na fazenda.</div>
          </div>
          <label class="field">
            <span>Data da revisão</span>
            <input name="physicalReviewDate" type="date" value="${normalizeDateInput(farm.physicalReviewDate)}">
          </label>
        `,
        onSubmit(data) {
          updatePhysicalReview({ farmId: farm.id, physicalReviewDate: data.physicalReviewDate });
        }
      });
    }

    if (action === "generate-admin-report") {
      const farmsForAccount = visibleFarms();
      const allFarmCheckbox = document.querySelector('[data-report-all="farms"]');
      const allCategoryCheckbox = document.querySelector('[data-report-all="categories"]');
      const farmIds = allFarmCheckbox?.checked
        ? farmsForAccount.map((farm) => farm.id)
        : Array.from(document.querySelectorAll('input[name="reportFarmId"]:checked')).map((input) => input.value);
      const selectedCategories = allCategoryCheckbox?.checked
        ? categories.map((category) => category.name)
        : Array.from(document.querySelectorAll('input[name="reportCategory"]:checked')).map((input) => input.value);
      const farms = farmsForAccount.filter((farm) => farmIds.includes(farm.id));

      if (!farms.length) {
        alert("Selecione pelo menos uma fazenda para gerar o relatório.");
        return;
      }

      if (!selectedCategories.length) {
        alert("Selecione pelo menos uma categoria para gerar o relatório.");
        return;
      }

      openReport(farms, selectedCategories);
    }

    if (action === "generate-farm-report") {
      const farm = state.farms.find((item) => item.id === button.dataset.farmId);
      if (farm) openReport([farm], categories.map((category) => category.name));
    }

    if (action === "open-farm-admin") {
      selectedFarmId = button.dataset.farmId;
      currentTab = "estoque";
      route();
    }

    if (action === "confirm-delete-farm") {
      const farm = state.farms.find((item) => item.id === button.dataset.farmId);
      const farmsForAccount = visibleFarms();

      if (farmsForAccount.length <= 1) {
        openModal({
          title: "Não é possível remover",
          submitLabel: "Entendi",
          fields: `
            <div class="empty">Crie outra fazenda antes de remover a última cadastrada.</div>
          `,
          onSubmit() {}
        });
        return;
      }

      openModal({
        title: "Remover fazenda",
        submitLabel: "Remover definitivamente",
        fields: `
          <div class="field">
            <label>${farm.name}</label>
            <div class="panel__hint">Esta ação apaga o estoque e o histórico desta fazenda. Para confirmar, digite REMOVER.</div>
          </div>
          <label class="field">
            <span>Confirmação</span>
            <input name="confirmation" required placeholder="REMOVER">
          </label>
        `,
        onSubmit(data) {
          if (String(data.confirmation || "").trim().toUpperCase() !== "REMOVER") {
            alert("Remoção cancelada. A confirmação precisa ser REMOVER.");
            return false;
          }

          state.farms = state.farms.filter((item) => item.id !== farm.id);
          state.movements = state.movements.filter((item) => item.farmId !== farm.id);
          if (selectedFarmId === farm.id) selectedFarmId = visibleFarms()[0]?.id || null;
          currentTab = "fazendas";
        }
      });
    }

    if (action === "new-product") {
      openModal({
        title: "Adicionar produto mestre",
        submitLabel: "Adicionar",
        fields: fieldsForProduct(),
        onSubmit(data) {
          state.products.push({
            id: makeId("prod"),
            name: data.name.trim().toUpperCase(),
            category: data.category,
            unit: data.unit,
            defaultDose: parseDecimal(data.defaultDose) || 0
          });
          markStateUpdated();
        }
      });
    }

    if (action === "edit-product") {
      const product = state.products.find((item) => item.id === button.dataset.productId);
      openModal({
        title: "Editar produto",
        fields: fieldsForProduct(product),
        onSubmit(data) {
          product.name = data.name.trim().toUpperCase();
          product.category = data.category;
          product.unit = data.unit;
          product.defaultDose = parseDecimal(data.defaultDose) || 0;
          markStateUpdated();
        }
      });
    }

    if (action === "edit-similar-products") {
      const product = state.products.find((item) => item.id === button.dataset.productId);
      openModal({
        title: "Produtos similares",
        submitLabel: "Salvar similares",
        fields: similarProductsFields(product),
        onSubmit(data) {
          updateSimilarProducts(product.id, data.similarProductIds);
        }
      });
    }

    if (action === "merge-product") {
      const sourceProduct = state.products.find((item) => item.id === button.dataset.productId);
      const candidates = state.products
        .filter((item) => item.id !== sourceProduct.id)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

      if (candidates.length === 0) {
        openModal({
          title: "Não há produtos para unificar",
          submitLabel: "Entendi",
          fields: `<div class="empty">Cadastre outro produto antes de unificar.</div>`,
          onSubmit() {}
        });
        return;
      }

      openModal({
        title: "Unificar produto",
        submitLabel: "Unificar definitivamente",
        fields: `
          <div class="field">
            <label>Produto que será removido</label>
            <div class="panel__hint">${sourceProduct.name}</div>
          </div>
          <label class="field">
            <span>Produto padrão que será mantido</span>
            <select name="targetProductId" required>
              ${candidates.map((product) => `<option value="${product.id}">${product.name} - ${product.category} - ${productUnit(product)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Confirmação</span>
            <input name="confirmation" required placeholder="UNIFICAR">
          </label>
          <div class="panel__hint">O estoque, doses e histórico do produto removido serão transferidos para o produto padrão. Para confirmar, digite UNIFICAR.</div>
        `,
        onSubmit(data) {
          if (String(data.confirmation || "").trim().toUpperCase() !== "UNIFICAR") {
            alert("Unificação cancelada. A confirmação precisa ser UNIFICAR.");
            return false;
          }

          mergeProductInto({
            sourceProductId: sourceProduct.id,
            targetProductId: data.targetProductId
          });
        }
      });
    }

    if (action === "edit-dose") {
      const farm = state.farms.find((item) => item.id === button.dataset.farmId);
      const product = state.products.find((item) => item.id === button.dataset.productId);
      const lot = getStockLot(farm, button.dataset.lotId);
      const currentDose = lot ? lotDose(farm, lot, product) : getDose(farm, product.id);
      const unit = productUnit(product);
      openModal({
        title: "Editar dose",
        submitLabel: "Salvar dose",
        fields: `
          <div class="field">
            <label>${product.name}</label>
            <div class="panel__hint">Informe a dose em ${unit}/ha. Deixe vazio para remover.</div>
          </div>
          <label class="field">
            <span>Dose por hectare</span>
            <input name="dose" type="text" inputmode="decimal" pattern="[0-9]+([,.][0-9]+)?" value="${currentDose ? formatQty(currentDose) : ""}" placeholder="Ex: 0,5">
          </label>
        `,
        onSubmit(data) {
          updateDose({ farmId: farm.id, productId: product.id, lotId: lot?.id, dose: data.dose });
        }
      });
    }

    if (action === "edit-expiry") {
      const farm = state.farms.find((item) => item.id === button.dataset.farmId);
      const product = state.products.find((item) => item.id === button.dataset.productId);
      const lot = getStockLot(farm, button.dataset.lotId);
      openModal({
        title: "Editar vencimento",
        submitLabel: "Salvar vencimento",
        fields: `
          <div class="field">
            <label>${product.name}</label>
            <div class="panel__hint">Informe a data de vencimento deste item do estoque. Deixe vazio para remover.</div>
          </div>
          <label class="field">
            <span>Data de vencimento</span>
            <input name="expiryDate" type="date" value="${normalizeDateInput(lot?.expiryDate)}">
          </label>
        `,
        onSubmit(data) {
          updateExpiry({ farmId: farm.id, productId: product.id, lotId: lot.id, expiryDate: data.expiryDate });
        }
      });
    }

    if (action === "move" || action === "manual-edit") {
      const farm = state.farms.find((item) => item.id === button.dataset.farmId);
      const product = state.products.find((item) => item.id === button.dataset.productId);
      const lot = getStockLot(farm, button.dataset.lotId);
      const type = action === "manual-edit" ? "edicao" : button.dataset.type;
      const currentQty = lot ? Number(lot.quantity || 0) : getStockQty(farm, product.id);
      const currentDose = lot ? lotDose(farm, lot, product) : getDose(farm, product.id);
      openModal({
        title: type === "entrada" ? "Registrar entrada" : type === "saida" ? "Registrar saída" : "Editar manualmente",
        submitLabel: "Registrar",
        fields: movementFields(type === "edicao" ? "manual" : type, product, currentQty, currentDose, lot?.expiryDate),
        onSubmit(data) {
          addMovement({ farmId: farm.id, productId: product.id, lotId: lot?.id, type, quantity: data.quantity, dose: data.dose, expiryDate: data.expiryDate, note: data.note });
        }
      });
    }

    if (action === "add-product-farm") {
      const farm = state.farms.find((item) => item.id === button.dataset.farmId);
      openModal({
        title: "Adicionar produto ao estoque",
        submitLabel: "Adicionar",
        fields: addProductToFarmFields(),
        afterOpen(node) {
          syncProductMode(node.querySelector("[data-modal-form]"));
        },
        onSubmit(data) {
          let productId = data.productId;

          if (data.productMode === "new") {
            const product = findOrCreateProduct(
              data.newProductName,
              data.newProductCategory,
              data.newProductUnit,
              data.newProductDefaultDose
            );
            productId = product.id;
          }

          if (!productId) {
            alert("Escolha um produto da lista ou cadastre um novo produto antes de adicionar.");
            return false;
          }

          addMovement({ farmId: farm.id, productId, type: "edicao", quantity: data.quantity, dose: data.dose, expiryDate: data.expiryDate });
        }
      });
    }

  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-product-search]")) {
      currentSearch = event.target.value;
      refreshFarmProductView();
    }

    if (event.target.matches("[data-master-product-search]")) {
      refreshMasterProductOptions(event.target);
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-product-mode]")) {
      syncProductMode(event.target.closest("form"));
    }

    if (event.target.matches('[data-action="select-farm"]')) {
      selectedFarmId = event.target.value;
      route();
    }

    if (event.target.matches('[data-report-all="farms"]')) {
      document.querySelectorAll('input[name="reportFarmId"]').forEach((input) => {
        input.checked = event.target.checked;
      });
    }

    if (event.target.matches('[data-report-all="categories"]')) {
      document.querySelectorAll('input[name="reportCategory"]').forEach((input) => {
        input.checked = event.target.checked;
      });
    }

    if (event.target.matches('input[name="reportFarmId"]')) {
      const farmInputs = Array.from(document.querySelectorAll('input[name="reportFarmId"]'));
      const allCheckbox = document.querySelector('[data-report-all="farms"]');
      if (allCheckbox) allCheckbox.checked = farmInputs.every((input) => input.checked);
    }

    if (event.target.matches('input[name="reportCategory"]')) {
      const categoryInputs = Array.from(document.querySelectorAll('input[name="reportCategory"]'));
      const allCheckbox = document.querySelector('[data-report-all="categories"]');
      if (allCheckbox) allCheckbox.checked = categoryInputs.every((input) => input.checked);
    }
  });

  route();
  initFirebaseSync();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Erro ao registrar service worker:", error);
    });
  }
})();
