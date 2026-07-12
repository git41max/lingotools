import { MANIFEST_URL } from "./config.js";
import { validateCategory, validateManifest } from "./validation.js";

export class DataLoadError extends Error {
  constructor(message, { code = "DATA_LOAD_ERROR", url = null, status = null, details = [] } = {}) {
    super(message);
    this.name = "DataLoadError";
    this.code = code;
    this.url = url;
    this.status = status;
    this.details = details;
  }
}

async function fetchJson(url, { signal } = {}) {
  let response;

  try {
    response = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new DataLoadError("Não foi possível acessar o arquivo de dados.", {
      code: "NETWORK_ERROR",
      url,
    });
  }

  if (!response.ok) {
    throw new DataLoadError("O servidor não encontrou ou não conseguiu entregar o arquivo de dados.", {
      code: "HTTP_ERROR",
      url,
      status: response.status,
    });
  }

  try {
    return await response.json();
  } catch {
    throw new DataLoadError("O arquivo recebido não contém um JSON válido.", {
      code: "INVALID_JSON",
      url,
    });
  }
}

function throwOnInvalid(result, message, url) {
  if (result.valid) return;

  throw new DataLoadError(message, {
    code: "INVALID_DATA_STRUCTURE",
    url,
    details: result.errors,
  });
}

export async function loadManifest({ signal } = {}) {
  const manifest = await fetchJson(MANIFEST_URL, { signal });
  throwOnInvalid(
    validateManifest(manifest),
    "O catálogo de categorias possui uma estrutura incompatível.",
    MANIFEST_URL,
  );
  return manifest;
}

export async function loadCategory(entry, manifest, { signal } = {}) {
  const category = await fetchJson(entry.dataFile, { signal });
  throwOnInvalid(
    validateCategory(category, { manifestEntry: entry, manifest }),
    `Os dados da categoria “${entry.title}” possuem uma estrutura incompatível.`,
    entry.dataFile,
  );
  return category;
}
