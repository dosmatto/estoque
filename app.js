(function () {
  const STORAGE_KEY = "estoque-fazendas-prototipo-v1";
  const ADMIN_TOKEN = "ADMIN-TESTE-2026";

  const categories = [
    { name: "Adjuvante", color: "#9aa0a6" },
    { name: "Fertilizante", color: "#7bc943" },
    { name: "Fungicida", color: "#d6c900" },
    { name: "Herbicida", color: "#df3d32" },
    { name: "Inseticida", color: "#20a9d8" },
    { name: "Tratamento de Semente", color: "#8b69c6" }
  ];

  const units = ["L", "Kg"];

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

  function createInitialState() {
    const farmId = makeId("farm");
    const products = starterProducts.map(([name, category]) => ({
      id: makeId("prod"),
      name,
      category,
      unit: "L"
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
      category: product.category === "TS" ? "Tratamento de Semente" : product.category
    }));
    data.farms = data.farms || [];
    data.movements = data.movements || [];
    return data;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    return units.includes(product.unit) ? product.unit : "L";
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
        dose: getDose(farm, product.id),
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
        <button class="button button--ghost" data-action="reset-demo">Reiniciar demo</button>
      `,
      content: `
        <nav class="tabs" aria-label="Telas do admin">
          ${tabButton("fazendas", "Fazendas")}
          ${tabButton("estoque", "Estoque da fazenda")}
          ${tabButton("consolidado", "Consolidado")}
          ${tabButton("produtos", "Lista mestre")}
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
          <button class="button button--ghost" data-action="open-farm-admin" data-farm-id="${farm.id}">Ver</button>
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
                <div class="list-row__meta"><span class="badge">${product.category}</span> <span class="badge">${productUnit(product)}</span></div>
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
                <div class="list-row__meta"><span class="badge">${product.category}</span> <span class="badge">${productUnit(product)}</span></div>
              </div>
              <button class="button button--ghost" data-action="edit-product" data-product-id="${product.id}">Editar</button>
            </div>
          `).join("")}
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
      `,
      content: `
        <section class="panel quick-actions">
          <button class="button button--primary" data-action="add-product-farm" data-farm-id="${farm.id}">+ Adicionar produto</button>
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
            const valueText = item.type === "dose"
              ? (item.dose ? `${formatQty(item.dose)} ${unit}/ha` : "Dose removida")
              : `${item.type === "saida" ? "-" : item.type === "entrada" ? "+" : ""}${formatQty(item.quantity)} ${unit}`;
            return `
              <div class="list-row">
                <div>
                  <div class="list-row__title">${product?.name || "Produto removido"}</div>
                  <div class="list-row__meta">${formatDate(item.createdAt)} - ${item.type}</div>
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
      const data = Object.fromEntries(new FormData(event.currentTarget));
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

  function findOrCreateProduct(name, category, unit) {
    const normalizedName = name.trim().toUpperCase();
    const existing = state.products.find(
      (product) => product.name.toUpperCase() === normalizedName && product.category === category
    );

    if (existing) {
      existing.unit = unit || productUnit(existing);
      return existing;
    }

    const product = { id: makeId("prod"), name: normalizedName, category, unit: unit || "L" };
    state.products.push(product);
    return product;
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
      dose: parsedDose,
      previousQuantity: getStockQty(farm, productId),
      nextQuantity: getStockQty(farm, productId),
      note: "Dose editada",
      createdAt: new Date().toISOString()
    });
  }

  function addMovement({ farmId, productId, type, quantity, dose, note }) {
    const farm = state.farms.find((item) => item.id === farmId);
    const currentQty = getStockQty(farm, productId);
    const parsedQty = parseDecimal(quantity) || 0;
    const parsedDose = parseDecimal(dose);
    let nextQty = currentQty;

    if (type === "entrada") nextQty += parsedQty;
    if (type === "saida") nextQty = Math.max(0, nextQty - parsedQty);
    if (type === "edicao") nextQty = parsedQty;

    setStockQty(farm, productId, nextQty);
    if (parsedDose !== null) setDose(farm, productId, parsedDose);
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

    if (action === "open-farm-admin") {
      selectedFarmId = button.dataset.farmId;
      currentTab = "estoque";
      route();
    }

    if (action === "new-product") {
      openModal({
        title: "Adicionar produto mestre",
        submitLabel: "Adicionar",
        fields: fieldsForProduct(),
        onSubmit(data) {
          state.products.push({ id: makeId("prod"), name: data.name.trim().toUpperCase(), category: data.category, unit: data.unit });
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
            const product = findOrCreateProduct(data.newProductName, data.newProductCategory, data.newProductUnit);
            productId = product.id;
          }

          addMovement({ farmId: farm.id, productId, type: "edicao", quantity: data.quantity, dose: data.dose });
        }
      });
    }

    if (action === "reset-demo") {
      state = createInitialState();
      selectedFarmId = state.farms[0].id;
      currentTab = "fazendas";
      currentFilter = "Todos";
      saveState();
      route();
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
  });

  route();
})();
