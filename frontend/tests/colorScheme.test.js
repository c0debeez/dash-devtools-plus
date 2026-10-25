import assert from "node:assert/strict";
import test from "node:test";
import {COLOR_SCHEME_ATTRIBUTE, COLOR_SCHEME_EVENT, createColorSchemeController, observeColorScheme, resolveColorScheme} from "../src/colorScheme.js";
import {createDevtoolsTheme} from "../src/theme.js";

function fixture() {
  const attributes = new Map();
  const classes = new Set();
  const events = [];
  const root = {classList: {contains: value => classes.has(value)}, style: {},
    getAttribute: key => attributes.get(key), setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key)};
  const media = {matches: true, addEventListener: (name, fn) => { media.listener = fn; },
    removeEventListener: (name, fn) => { assert.equal(media.listener, fn); media.listener = null; }};
  const document = {documentElement: root, defaultView: {
    CustomEvent: class {constructor(type, options) {this.type = type; this.detail = options.detail;}},
    dispatchEvent: event => events.push(event),
  }};
  let observer;
  class Observer {
    constructor(sync) {this.sync = sync; observer = this;}
    observe(node, options) {assert.equal(node, root); this.options = options;}
    disconnect() {this.disconnected = true;}
  }
  return {attributes, classes, root, media, document, events, Observer, observer: () => observer};
}

test("explicit host theme wins over system preference", () => {
  const f = fixture();
  assert.equal(resolveColorScheme(f.root, f.media), "dark");
  f.classes.add("light");
  assert.equal(resolveColorScheme(f.root, f.media), "light");
  f.classes.clear();
  f.attributes.set("data-theme", "light");
  assert.equal(resolveColorScheme(f.root, f.media), "light");
  f.attributes.clear();
  f.root.style.colorScheme = "light";
  assert.equal(resolveColorScheme(f.root, f.media), "light");
});

test("live theme changes are deduplicated and preserve the selected skin", () => {
  const f = fixture();
  f.attributes.set("data-ddp-native-toolbar-theme", "mint-circuit");
  const stop = observeColorScheme(f.document, f.media, f.Observer);
  assert.equal(f.attributes.get(COLOR_SCHEME_ATTRIBUTE), "dark");
  f.observer().sync();
  assert.equal(f.events.length, 1);
  f.classes.add("light");
  f.observer().sync();
  assert.equal(f.events.at(-1).type, COLOR_SCHEME_EVENT);
  assert.equal(f.events.at(-1).detail, "light");
  f.classes.clear();
  f.media.matches = false;
  f.media.listener();
  assert.equal(f.events.length, 2);
  f.media.matches = true;
  f.media.listener();
  assert.equal(f.events.at(-1).detail, "dark");
  assert.equal(f.attributes.get("data-ddp-native-toolbar-theme"), "mint-circuit");
  assert.ok(!f.observer().options.attributeFilter.includes(COLOR_SCHEME_ATTRIBUTE));
  stop();
  assert.equal(f.observer().disconnected, true);
  assert.equal(f.media.listener, null);
  assert.equal(f.attributes.has(COLOR_SCHEME_ATTRIBUTE), false);
});

test("dark controls and portal tokens do not mutate the light palette", () => {
  const light = createDevtoolsTheme("#119dff");
  const dark = createDevtoolsTheme("#119dff", "dark");
  assert.equal(light.token.colorBgContainer, "#ffffff");
  assert.equal(dark.token.colorBgContainer, "#161b22");
  assert.equal(dark.components.Select.optionSelectedBg, "#172940");
  assert.equal(dark.components.Drawer.colorBgElevated, "#161b22");
  assert.equal(dark.components.Table.headerBg, "#0d1117");
  assert.deepEqual(createDevtoolsTheme("#119dff"), light);
});

for (const attribute of ["data-theme", "data-color-scheme", "data-mantine-color-scheme", "data-bs-theme"]) {
  test(`${attribute} follows the host instead of the system`, () => {
    const f = fixture();
    f.media.matches = false;
    f.attributes.set(attribute, "dark");
    assert.equal(resolveColorScheme(f.root, f.media), "dark");
    f.media.matches = true;
    f.attributes.set(attribute, "light");
    assert.equal(resolveColorScheme(f.root, f.media), "light");
  });
}

test("explicit mode, selected container, body, root, computed CSS, then system precedence", () => {
  const f = fixture();
  const host = fixture();
  const body = fixture();
  const options = {host: host.root, body: body.root, getComputedStyle: () => ({colorScheme: "dark"})};
  f.attributes.set("data-theme", "light");
  assert.equal(resolveColorScheme(f.root, f.media, options), "light");
  body.attributes.set("data-bs-theme", "dark");
  assert.equal(resolveColorScheme(f.root, f.media, options), "dark");
  host.attributes.set("data-mantine-color-scheme", "light");
  host.classes.add("dark");
  assert.equal(resolveColorScheme(f.root, f.media, options), "light");
  assert.equal(resolveColorScheme(f.root, f.media, {...options, colorScheme: "dark"}), "dark");
  host.attributes.clear(); host.classes.clear(); body.attributes.clear(); f.attributes.clear();
  f.media.matches = false;
  assert.equal(resolveColorScheme(f.root, f.media, options), "dark");
  assert.equal(resolveColorScheme(f.root, f.media, {...options, getComputedStyle: () => ({colorScheme: "light dark"})}), "light");
});

test("controller supports explicit callbacks, late/replaced containers, CSS changes and cleanup", () => {
  const f = fixture();
  let host = null;
  let computed = "light";
  const loads = new Map();
  f.document.querySelector = selector => {
    if (selector === "[") throw new SyntaxError("Invalid selector");
    return host;
  };
  f.document.addEventListener = (name, fn) => loads.set(name, fn);
  f.document.removeEventListener = name => loads.delete(name);
  f.document.defaultView.getComputedStyle = () => ({colorScheme: computed});
  f.document.head = {contains: node => node?.isStyle === true};
  const controller = createColorSchemeController(f.document, f.media, f.Observer);
  controller.configure({themeSelector: "#theme"});
  assert.equal(f.attributes.get(COLOR_SCHEME_ATTRIBUTE), "light");
  host = fixture().root;
  host.setAttribute("data-bs-theme", "dark");
  f.observer().sync([{type: "childList", target: {}}]);
  assert.equal(f.attributes.get(COLOR_SCHEME_ATTRIBUTE), "dark");
  controller.configure({colorScheme: "light"});
  assert.equal(f.attributes.get(COLOR_SCHEME_ATTRIBUTE), "light");
  assert.throws(() => controller.configure({colorScheme: "invalid"}), TypeError);
  assert.throws(() => controller.configure({themeSelector: "["}), SyntaxError);
  assert.throws(() => controller.configure({themeSelector: " "}), TypeError);
  assert.throws(() => controller.configure(null), TypeError);
  controller.refresh();
  assert.equal(f.attributes.get(COLOR_SCHEME_ATTRIBUTE), "light");
  controller.configure({colorScheme: "auto"});
  assert.equal(f.attributes.get(COLOR_SCHEME_ATTRIBUTE), "dark");
  host = fixture().root;
  host.setAttribute("data-bs-theme", "light");
  f.observer().sync([{type: "attributes", target: {}}]);
  assert.equal(f.attributes.get(COLOR_SCHEME_ATTRIBUTE), "light");
  controller.configure({themeSelector: null});
  computed = "dark";
  f.observer().sync([{type: "characterData", target: {isStyle: true}}]);
  assert.equal(f.attributes.get(COLOR_SCHEME_ATTRIBUTE), "dark");
  computed = "light";
  loads.get("load")({target: {tagName: "LINK"}});
  assert.equal(f.attributes.get(COLOR_SCHEME_ATTRIBUTE), "light");
  computed = "dark";
  f.observer().sync([{type: "attributes", target: {}}]);
  assert.equal(f.attributes.get(COLOR_SCHEME_ATTRIBUTE), "light", "unrelated chart changes are ignored");
  controller.dispose();
  assert.equal(loads.size, 0);
  controller.refresh();
  assert.equal(f.attributes.has(COLOR_SCHEME_ATTRIBUTE), false);
  assert.equal(f.observer().disconnected, true);
  assert.equal(f.media.listener, null);
});
