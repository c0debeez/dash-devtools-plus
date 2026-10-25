export const COLOR_SCHEME_ATTRIBUTE = "data-ddp-color-scheme";
export const COLOR_SCHEME_EVENT = "ddp:color-scheme";

export function resolveColorScheme(root, media) {
  if (root?.classList?.contains("dark")) return "dark";
  if (root?.classList?.contains("light")) return "light";
  for (const name of ["data-theme", "data-color-scheme", "data-mantine-color-scheme"]) {
    const value = root?.getAttribute?.(name);
    if (value === "dark" || value === "light") return value;
  }
  const value = root?.style?.colorScheme;
  if (value === "dark" || value === "light") return value;
  return media?.matches ? "dark" : "light";
}

export function observeColorScheme(hostDocument, media, Observer = globalThis.MutationObserver) {
  const root = hostDocument?.documentElement;
  if (!root) return () => {};
  const sync = () => {
    const mode = resolveColorScheme(root, media);
    if (root.getAttribute(COLOR_SCHEME_ATTRIBUTE) === mode) return;
    root.setAttribute(COLOR_SCHEME_ATTRIBUTE, mode);
    const target = hostDocument.defaultView;
    if (target?.CustomEvent) target.dispatchEvent(new target.CustomEvent(COLOR_SCHEME_EVENT, {detail: mode}));
  };
  const observer = Observer ? new Observer(sync) : null;
  observer?.observe(root, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme", "data-color-scheme", "data-mantine-color-scheme"],
  });
  media?.addEventListener?.("change", sync);
  sync();
  return () => {
    observer?.disconnect();
    media?.removeEventListener?.("change", sync);
    root.removeAttribute(COLOR_SCHEME_ATTRIBUTE);
  };
}
