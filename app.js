import { USE_FIREBASE, firebaseConfig } from "./firebase-config.js";

(function () {
  const STORAGE_KEY = "estoque-fazendas-prototipo-v1";
  const ADMIN_TOKEN = "ADMIN-TESTE-2026";
  const MASTER_ACCOUNT_ID = "master";
  const FIREBASE_DOC_PATH = ["appState", "main"];
  const APP_VERSION = "V.2";

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
