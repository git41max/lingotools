import { APP_TITLE, DEFAULT_ROUTE } from "./config.js";
import { loadCategory, loadManifest } from "./data-loader.js";
import { createStore, getTurnReveal } from "./state.js";
import { renderApp } from "./ui.js";

const root = document.querySelector("#app");
const main = document.querySelector("#main-content");
const statusRegion = document.querySelector("#app-status");
const store = createStore();

let activeController = null;
let requestId = 0;
let shouldFocusMain = false;
let pendingControlFocus = null;

function parseRoute(hash) {
  const cleanHash = (hash || DEFAULT_ROUTE).replace(/^#\/?/, "");
  const segments = cleanHash.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return null;
    }
  });

  if (segments.includes(null)) return { view: "invalid", categoryId: null, dialogueId: null };
  if (segments.length === 1 && segments[0] === "categories") {
    return { view: "categories", categoryId: null, dialogueId: null };
  }
  if (segments.length === 2 && segments[0] === "category") {
    return { view: "category", categoryId: segments[1], dialogueId: null };
  }
  if (segments.length === 4 && segments[0] === "category" && segments[2] === "dialogue") {
    return { view: "dialogue", categoryId: segments[1], dialogueId: segments[3] };
  }
  return { view: "invalid", categoryId: null, dialogueId: null };
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: error.code || "UNEXPECTED_ERROR",
      status: error.status || null,
      url: error.url || null,
      details: error.details || [],
    };
  }
  return { message: "Ocorreu um problema inesperado.", code: "UNEXPECTED_ERROR", details: [] };
}

function setDocumentTitle(state) {
  if (state.status !== "ready") {
    document.title = APP_TITLE;
    return;
  }

  if (state.route.view === "categories") {
    document.title = `Categorias — ${APP_TITLE}`;
  } else if (state.route.view === "category") {
    document.title = `${state.category.title} — ${APP_TITLE}`;
  } else if (state.route.view === "dialogue") {
    const dialogue = state.category.dialogues.find(({ id }) => id === state.route.dialogueId);
    document.title = `${dialogue?.title || "Diálogo"} — ${APP_TITLE}`;
  }
}

function announce(message) {
  statusRegion.textContent = "";
  window.setTimeout(() => {
    statusRegion.textContent = message;
  }, 50);
}

function render(state) {
  renderApp(root, state, actions);
  setDocumentTitle(state);

  if (pendingControlFocus) {
    const control = root.querySelector(pendingControlFocus);
    pendingControlFocus = null;
    control?.focus({ preventScroll: true });
  }

  if (shouldFocusMain && ["ready", "route-error", "error"].includes(state.status)) {
    shouldFocusMain = false;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      main.focus({ preventScroll: true });
    });
  }
}

const actions = {
  navigate(hash) {
    if (window.location.hash === hash) {
      void handleRoute();
    } else {
      window.location.hash = hash;
    }
  },

  openCategory(categoryId) {
    actions.navigate(`#/category/${encodeURIComponent(categoryId)}`);
  },

  openDialogue(categoryId, dialogueId) {
    actions.navigate(`#/category/${encodeURIComponent(categoryId)}/dialogue/${encodeURIComponent(dialogueId)}`);
  },

  setStudyMode(mode) {
    if (!new Set(["practice", "reading"]).has(mode)) return;
    pendingControlFocus = `[data-control="mode-${mode}"]`;
    store.setState({ studyMode: mode });
    announce(mode === "practice" ? "Modo de prática ativado." : "Modo de leitura ativado.");
  },

  toggleTurnDetail(turnId, detail) {
    const allowedDetails = new Set([
      "intentionVisible",
      "translationVisible",
      "answerVisible",
      "alternativesVisible",
      "noteVisible",
    ]);
    if (!allowedDetails.has(detail)) return;

    const state = store.getState();
    const dialogue = state.category?.dialogues.find(({ id }) => id === state.route.dialogueId);
    const turn = dialogue?.turns.find(({ id }) => id === turnId);
    if (!turn?.isLearnerTurn) return;

    const current = getTurnReveal(state.revealsByTurn, turnId);
    if (["alternativesVisible", "noteVisible"].includes(detail) && !current.answerVisible) return;

    const next = { ...current, [detail]: !current[detail] };
    if (detail === "answerVisible" && !next.answerVisible) {
      next.alternativesVisible = false;
      next.noteVisible = false;
    }

    const controlName = detail.replace("Visible", "");
    pendingControlFocus = `[data-turn-id="${turnId}"][data-control="${controlName}"]`;
    store.setState({
      revealsByTurn: {
        ...state.revealsByTurn,
        [turnId]: next,
      },
    });
  },

  resetDialogue() {
    pendingControlFocus = "[data-control=reset-dialogue]";
    store.setState({ revealsByTurn: {} });
    announce("As revelações deste diálogo foram reiniciadas.");
  },

  toggleReusableStructures() {
    const state = store.getState();
    pendingControlFocus = "[data-control=reusable-structures]";
    store.setState({ reusableStructuresVisible: !state.reusableStructuresVisible });
  },

  retry() {
    shouldFocusMain = true;
    void handleRoute({ forceReload: true });
  },
};

store.subscribe(render);

async function ensureManifest(signal, forceReload) {
  const current = store.getState();
  if (current.manifest && !forceReload) return current.manifest;
  return loadManifest({ signal });
}

async function ensureCategory(entry, manifest, signal, forceReload) {
  const current = store.getState();
  if (current.category?.id === entry.id && !forceReload) return current.category;
  return loadCategory(entry, manifest, { signal });
}

async function handleRoute({ forceReload = false } = {}) {
  const route = parseRoute(window.location.hash);
  const previousState = store.getState();
  const dialogueChanged = route.view !== "dialogue"
    || previousState.route.view !== "dialogue"
    || previousState.route.categoryId !== route.categoryId
    || previousState.route.dialogueId !== route.dialogueId;
  const thisRequest = ++requestId;

  activeController?.abort();
  activeController = new AbortController();

  store.setState({ status: "loading", route, error: null });

  try {
    const manifest = await ensureManifest(activeController.signal, forceReload);
    if (thisRequest !== requestId) return;

    if (route.view === "invalid") {
      store.setState({
        status: "route-error",
        manifest,
        error: { message: "Verifique o endereço ou retorne à lista de categorias." },
      });
      announce("Endereço não encontrado.");
      return;
    }

    if (route.view === "categories") {
      store.setState({ status: "ready", manifest, route, error: null });
      announce("Categorias carregadas.");
      return;
    }

    const entry = manifest.categories.find(({ id }) => id === route.categoryId);
    if (!entry) {
      store.setState({
        status: "route-error",
        manifest,
        error: { message: "A categoria indicada não está disponível." },
      });
      announce("Categoria não encontrada.");
      return;
    }

    const category = await ensureCategory(entry, manifest, activeController.signal, forceReload);
    if (thisRequest !== requestId) return;

    if (route.view === "dialogue" && !category.dialogues.some(({ id }) => id === route.dialogueId)) {
      store.setState({
        status: "route-error",
        manifest,
        category,
        categoryEntry: entry,
        error: { message: "O diálogo indicado não existe nesta categoria." },
      });
      announce("Diálogo não encontrado.");
      return;
    }

    store.setState({
      status: "ready",
      manifest,
      category,
      categoryEntry: entry,
      route,
      revealsByTurn: dialogueChanged ? {} : previousState.revealsByTurn,
      reusableStructuresVisible: dialogueChanged ? false : previousState.reusableStructuresVisible,
      error: null,
    });
    announce(route.view === "dialogue" ? "Diálogo carregado." : "Lista de diálogos carregada.");
  } catch (error) {
    if (error.name === "AbortError" || thisRequest !== requestId) return;
    console.error("Falha ao carregar a aplicação:", error);
    store.setState({ status: "error", error: normalizeError(error) });
    announce("O carregamento falhou.");
  }
}

window.addEventListener("hashchange", () => {
  shouldFocusMain = true;
  void handleRoute();
});

window.addEventListener("DOMContentLoaded", () => {
  if (!window.location.hash) {
    window.history.replaceState(null, "", DEFAULT_ROUTE);
  }
  void handleRoute();
});
