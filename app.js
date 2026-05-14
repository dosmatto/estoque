import { USE_FIREBASE, firebaseConfig } from "./firebase-config.js";

(function () {
  const STORAGE_KEY = "estoque-fazendas-prototipo-v1";
  const ADMIN_TOKEN = "ADMIN-TESTE-2026";
  const FIREBASE_DOC_PATH = ["appState", "main"];
  const APP_VERSION = "V.1.1";

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
      products,
      farms: [
        {
          id: farmId,
          name: "Fazenda Modelo",
          token: "ABC123XYZ",
          createdAt: new Date().toISOString(),
          stock,
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
    data.products = (data.products || []).map((product) => ({
      ...product,
      category: product.category === "TS" ? "Tratamento de Semente" : product.category,
      unit: product.unit === "L" ? "L / Kg" : productUnit(product),
      defaultDose: parseDecimal(product.defaultDose) || 0,
      similarProductIds: Array.isArray(product.similarProductIds) ? product.similarProductIds : []
    }));
    data.farms = data.farms || [];
    data.movements = data.movements || [];
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
        if (!state.farms.some((farm) => farm.id === selectedFarmId)) {
          selectedFarmId = state.farms[0]?.id || null;
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

  function route() {
    const params = new URLSearchParams(window.location.search);
    const adminToken = params.get("admin");
    const token = params.get("fazenda");

    if (adminToken === ADMIN_TOKEN) {
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

  function ensureFarmData(farm) {
    if (!farm.stock) farm.stock = {};
    if (!farm.doses) farm.doses = {};
  }

  function getStockQty(farm, productId) {
    ensureFarmData(farm);
    return Number(farm.stock[productId] || 0);
  }

  function setStockQty(farm, productId, quantity) {
    ensureFarmData(farm);
    farm.stock[productId] = quantity;
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

  function hectaresFor(quantity, dose) {
    if (!dose || dose <= 0) return null;
    return quantity / dose;
  }

  function productUnit(product) {
    return units.includes(product.unit) ? product.unit : "L / Kg";
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
    return state.products
      .map((product) => ({
        ...product,
        qty: getStockQty(farm, product.id),
        dose: effectiveDose(farm, product),
        unit: productUnit(product)
      }))
      .filter((product) => product.qty > 0)
      .filter((product) => categorySet.has(product.category))
      .sort((a, b) => a.category.localeCompare(b.category, "pt-BR") || a.name.localeCompare(b.name, "pt-BR"));
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
        return `
          <tr>
            <td>${escapeHtml(product.category)}</td>
            <td>${escapeHtml(product.name)}</td>
            <td>${formatQty(product.qty)} ${escapeHtml(productUnit(product))}</td>
            <td>${product.dose ? `${formatQty(product.dose)} ${escapeHtml(productUnit(product))}/ha` : "-"}</td>
            <td>${hectares === null ? "-" : `${formatQty(hectares)} ha`}</td>
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
              </tr>
            </thead>
            <tbody>${body || `<tr><td colspan="5">Sem produtos em estoque.</td></tr>`}</tbody>
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

  function adminUrl() {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?admin=${ADMIN_TOKEN}`;
  }

  function filteredProducts(farm) {
    return state.products
      .map((product) => ({
        ...product,
        qty: getStockQty(farm, product.id),
        dose: effectiveDose(farm, product),
        farmDose: getDose(farm, product.id),
        defaultDose: productDefaultDose(product),
        unit: productUnit(product)
      }))
      .filter((product) => product.qty > 0)
      .filter((product) => currentFilter === "Todos" || product.category === currentFilter)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  function farmMetrics(farm) {
    const entries = state.products.map((product) => getStockQty(farm, product.id));
    return {
      products: entries.filter((qty) => qty > 0).length,
      total: entries.reduce((sum, qty) => sum + qty, 0),
      movements: state.movements.filter((item) => item.farmId === farm.id).length
    };
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
    if (!selectedFarmId || !state.farms.some((farm) => farm.id === selectedFarmId)) {
      selectedFarmId = state.farms[0]?.id || null;
    }

    renderShell({
      title: "Estoque Fazendas",
      subtitle: "Admin mestre do protótipo local",
      actions: `
        <button class="button button--primary" data-action="new-farm">+ Nova Fazenda</button>
        <button class="button button--ghost" data-action="open-reports-tab">Relatórios</button>
      `,
      content: `
        <nav class="tabs" aria-label="Telas do admin">
          ${tabButton("fazendas", "Fazendas")}
          ${tabButton("estoque", "Estoque da fazenda")}
          ${tabButton("consolidado", "Consolidado")}
          ${tabButton("produtos", "Lista mestre")}
          ${tabButton("relatorios", "Relatórios")}
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
    return renderFarms();
  }

  function renderFarms() {
    return `
      <section class="farm-grid">
        ${state.farms.map(renderFarmCard).join("") || `<div class="empty">Nenhuma fazenda cadastrada.</div>`}
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
    const farm = state.farms.find((item) => item.id === selectedFarmId);
    if (!farm) return `<div class="empty">Crie uma fazenda para visualizar o estoque.</div>`;

    return `
      <section class="panel">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">${farm.name}</h2>
            <p class="panel__hint">A mesma visão do produtor, com acesso pelo admin.</p>
          </div>
          <div class="panel__actions">
            <select data-action="select-farm">
              ${state.farms.map((item) => `<option value="${item.id}" ${item.id === farm.id ? "selected" : ""}>${item.name}</option>`).join("")}
            </select>
            <button class="button button--primary" data-action="add-product-farm" data-farm-id="${farm.id}">+ Adicionar produto</button>
          </div>
        </div>
      </section>
      ${renderFilters()}
      ${renderStockSummary(farm)}
      ${renderProductGrid(farm)}
      ${renderHistory(farm)}
    `;
  }

  function renderConsolidated() {
    const rows = state.products
      .filter((product) => currentFilter === "Todos" || product.category === currentFilter)
      .map((product) => {
        const total = state.farms.reduce((sum, farm) => sum + getStockQty(farm, product.id), 0);
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
          <div class="metric__value">${state.farms.length}</div>
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
            <p class="panel__hint">Somatório do estoque de todas as fazendas cadastradas.</p>
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
              ${state.farms.map((farm) => `
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
        <section class="panel quick-actions">
          <button class="button button--primary" data-action="add-product-farm" data-farm-id="${farm.id}">+ Adicionar produto</button>
          <button class="button button--ghost" data-action="generate-farm-report" data-farm-id="${farm.id}">Relatório</button>
        </section>
        ${renderFilters()}
        ${renderStockSummary(farm)}
        ${renderProductGrid(farm)}
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

  function renderProductGrid(farm) {
    const products = filteredProducts(farm);
    return `
      <section class="product-grid">
        ${products.map((product) => renderProductCard(product, farm)).join("") || `<div class="empty">Nenhum produto neste filtro.</div>`}
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
          <strong>${products.length} produtos</strong>
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

    return `
      <div class="summary-row">
        <div>
          <span>${product.name}</span>
          <div class="summary-row__meta">${doseText}</div>
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
    return `
      <article class="product-card" style="--category-color: ${categoryColor(product.category)}">
        <div class="product-card__header">
          <div>
            <h2 class="product-card__name">${product.name}</h2>
            <div class="product-card__meta"><span class="badge">${product.category}</span> <span class="badge">${unit}</span></div>
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
          <button class="button button--primary" data-action="move" data-type="entrada" data-farm-id="${farm.id}" data-product-id="${product.id}">+ Entrada</button>
          <button class="button button--warning" data-action="move" data-type="saida" data-farm-id="${farm.id}" data-product-id="${product.id}">- Saída</button>
          <button class="button button--ghost" data-action="edit-dose" data-farm-id="${farm.id}" data-product-id="${product.id}">Editar dose</button>
          <button class="button button--ghost" data-action="manual-edit" data-farm-id="${farm.id}" data-product-id="${product.id}">Editar manualmente</button>
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
              : `${item.type === "saida" ? "-" : item.type === "entrada" ? "+" : ""}${formatQty(item.quantity)} ${unit}`;
            return `
              <div class="list-row">
                <div>
                  <div class="list-row__title">${product?.name || "Produto removido"}</div>
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
      onSubmit(data);
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

  function movementFields(type, product, currentQty, currentDose) {
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
          <span>Produto da lista mestre</span>
              <select name="productId" required data-existing-product>
            ${state.products.map((product) => `<option value="${product.id}">${product.name} - ${product.category} - ${productUnit(product)}</option>`).join("")}
          </select>
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
    `;
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
    return product;
  }

  function mergeProductInto({ sourceProductId, targetProductId }) {
    if (!sourceProductId || !targetProductId || sourceProductId === targetProductId) return;

    const sourceProduct = state.products.find((product) => product.id === sourceProductId);
    const targetProduct = state.products.find((product) => product.id === targetProductId);
    if (!sourceProduct || !targetProduct) return;

    state.farms.forEach((farm) => {
      ensureFarmData(farm);
      const sourceQty = getStockQty(farm, sourceProductId);
      const targetQty = getStockQty(farm, targetProductId);
      const sourceDose = getDose(farm, sourceProductId);
      const targetDose = getDose(farm, targetProductId);

      if (sourceQty) setStockQty(farm, targetProductId, targetQty + sourceQty);
      delete farm.stock[sourceProductId];

      if (!targetDose && sourceDose) setDose(farm, targetProductId, sourceDose);
      delete farm.doses[sourceProductId];
    });

    state.movements.forEach((movement) => {
      if (movement.productId === sourceProductId) movement.productId = targetProductId;
    });

    state.products = state.products.filter((product) => product.id !== sourceProductId);
  }

  function updateDose({ farmId, productId, dose }) {
    const farm = state.farms.find((item) => item.id === farmId);
    const parsedDose = parseDecimal(dose);

    setDose(farm, productId, parsedDose);
    state.movements.push({
      id: makeId("mov"),
      farmId,
      productId,
      type: "dose",
      quantity: parsedDose || 0,
      dose: parsedDose || null,
      doseSource: typedDose !== null ? "fazenda" : parsedDose ? "padrao" : "",
      previousQuantity: getStockQty(farm, productId),
      nextQuantity: getStockQty(farm, productId),
      note: "Dose editada",
      createdAt: new Date().toISOString()
    });
  }

  function addMovement({ farmId, productId, type, quantity, dose, note }) {
    const farm = state.farms.find((item) => item.id === farmId);
    const product = state.products.find((item) => item.id === productId);
    const currentQty = getStockQty(farm, productId);
    const parsedQty = parseDecimal(quantity) || 0;
    const typedDose = parseDecimal(dose);
    const parsedDose = typedDose !== null ? typedDose : productDefaultDose(product || {});
    let nextQty = currentQty;

    if (type === "entrada") nextQty += parsedQty;
    if (type === "saida") nextQty = Math.max(0, nextQty - parsedQty);
    if (type === "edicao") nextQty = parsedQty;

    setStockQty(farm, productId, nextQty);
    if (parsedDose) setDose(farm, productId, parsedDose);
    state.movements.push({
      id: makeId("mov"),
      farmId,
      productId,
      type,
      quantity: parsedQty,
      dose: parsedDose,
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
      route();
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
            name: data.name,
            token: Math.random().toString(36).slice(2, 11).toUpperCase(),
            createdAt: new Date().toISOString(),
            stock: {},
            doses: {}
          };
          state.farms.push(farm);
          selectedFarmId = farm.id;
          currentTab = "fazendas";
        }
      });
    }

    if (action === "open-reports-tab") {
      currentTab = "relatorios";
      route();
    }

    if (action === "generate-admin-report") {
      const allFarmCheckbox = document.querySelector('[data-report-all="farms"]');
      const allCategoryCheckbox = document.querySelector('[data-report-all="categories"]');
      const farmIds = allFarmCheckbox?.checked
        ? state.farms.map((farm) => farm.id)
        : Array.from(document.querySelectorAll('input[name="reportFarmId"]:checked')).map((input) => input.value);
      const selectedCategories = allCategoryCheckbox?.checked
        ? categories.map((category) => category.name)
        : Array.from(document.querySelectorAll('input[name="reportCategory"]:checked')).map((input) => input.value);
      const farms = state.farms.filter((farm) => farmIds.includes(farm.id));

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

      if (state.farms.length <= 1) {
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
            return;
          }

          state.farms = state.farms.filter((item) => item.id !== farm.id);
          state.movements = state.movements.filter((item) => item.farmId !== farm.id);
          if (selectedFarmId === farm.id) selectedFarmId = state.farms[0]?.id || null;
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
            return;
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
      const currentDose = getDose(farm, product.id);
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
          updateDose({ farmId: farm.id, productId: product.id, dose: data.dose });
        }
      });
    }

    if (action === "move" || action === "manual-edit") {
      const farm = state.farms.find((item) => item.id === button.dataset.farmId);
      const product = state.products.find((item) => item.id === button.dataset.productId);
      const type = action === "manual-edit" ? "edicao" : button.dataset.type;
      const currentQty = getStockQty(farm, product.id);
      const currentDose = getDose(farm, product.id);
      openModal({
        title: type === "entrada" ? "Registrar entrada" : type === "saida" ? "Registrar saída" : "Editar manualmente",
        submitLabel: "Registrar",
        fields: movementFields(type === "edicao" ? "manual" : type, product, currentQty, currentDose),
        onSubmit(data) {
          addMovement({ farmId: farm.id, productId: product.id, type, quantity: data.quantity, dose: data.dose, note: data.note });
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

          addMovement({ farmId: farm.id, productId, type: "edicao", quantity: data.quantity, dose: data.dose });
        }
      });
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
})();
