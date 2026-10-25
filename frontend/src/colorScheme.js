export const COLOR_SCHEME_ATTRIBUTE = "data-ddp-color-scheme";
export const COLOR_SCHEME_EVENT = "ddp:color-scheme";

const THEME_ATTRIBUTES = ["data-theme", "data-color-scheme", "data-mantine-color-scheme", "data-bs-theme"];
const isScheme = value => value === "dark" || value === "light";

function explicitScheme(root) {
  for (const name of THEME_ATTRIBUTES) {
    const value = root?.getAttribute?.(name);
    if (isScheme(value)) return value;
  }
  if (root?.classList?.contains("dark")) return "dark";
  if (root?.classList?.contains("light")) return "light";
  const value = root?.style?.colorScheme;
  return isScheme(value) ? value : null;
}

export function resolveColorScheme(root, media, options = {}) {
  if (isScheme(options.colorScheme)) return options.colorScheme;
  const nodes = [...new Set([options.host, options.body, root].filter(Boolean))];
  for (const node of nodes) {
    const value = explicitScheme(node);
    if (value) return value;
  }
  for (const node of nodes) {
    const value = options.getComputedStyle?.(node)?.colorScheme;
    if (isScheme(value)) return value;
  }
  return media?.matches ? "dark" : "light";
}

function validateOptions(options, hostDocument) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Theme options must be an object");
  }
  if (options.colorScheme !== undefined && options.colorScheme !== "auto" && !isScheme(options.colorScheme)) {
    throw new TypeError("colorScheme must be 'auto', 'light' or 'dark'");
  }
  if (options.themeSelector !== undefined && options.themeSelector !== null) {
    if (typeof options.themeSelector !== "string" || !options.themeSelector.trim()) {
      throw new TypeError("themeSelector must be a non-empty CSS selector or null");
    }
    hostDocument.querySelector(options.themeSelector);
  }
}

export function createColorSchemeController(hostDocument, media, Observer = globalThis.MutationObserver) {
  const root = hostDocument?.documentElement;
  let options = {colorScheme: "auto", themeSelector: null};
  let host = null;
  let disposed = false;
  const sync = () => {
    if (!root || disposed) return;
    host = options.themeSelector ? hostDocument.querySelector(options.themeSelector) : null;
    const mode = resolveColorScheme(root, media, {
      ...options, host, body: hostDocument.body,
      getComputedStyle: node => hostDocument.defaultView?.getComputedStyle?.(node),
    });
    if (root.getAttribute(COLOR_SCHEME_ATTRIBUTE) === mode) return;
    root.setAttribute(COLOR_SCHEME_ATTRIBUTE, mode);
    const target = hostDocument.defaultView;
    if (target?.CustomEvent) target.dispatchEvent(new target.CustomEvent(COLOR_SCHEME_EVENT, {detail: mode}));
  };
  const observer = root && Observer ? new Observer(records => {
    // Ignore mutations inside the tools and charts; only host/CSS changes matter.
    if (!records || records.some(record =>
      [root, hostDocument.body, host].includes(record.target) ||
      (host && record.target.contains?.(host)) ||
      hostDocument.head?.contains(record.target) ||
      (options.themeSelector &&
        hostDocument.querySelector(options.themeSelector) !== host))) sync();
  }) : null;
  observer?.observe(root, {
    attributes: true, childList: true, characterData: true, subtree: true,
    attributeFilter: ["class", "style", "id", "href", "media", "disabled", ...THEME_ATTRIBUTES],
  });
  // External stylesheets can finish loading after their link node is inserted.
  const onLoad = event => { if (event.target?.tagName === "LINK") sync(); };
  hostDocument?.addEventListener?.("load", onLoad, true);
  media?.addEventListener?.("change", sync);
  sync();
  return {
    configure(next) {
      validateOptions(next, hostDocument);
      options = {...options, ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined))};
      sync();
    },
    refresh: sync,
    dispose() {
      disposed = true;
      observer?.disconnect();
      media?.removeEventListener?.("change", sync);
      hostDocument?.removeEventListener?.("load", onLoad, true);
      root?.removeAttribute(COLOR_SCHEME_ATTRIBUTE);
    },
  };
}

export function observeColorScheme(hostDocument, media, Observer = globalThis.MutationObserver) {
  return createColorSchemeController(hostDocument, media, Observer).dispose;
}
