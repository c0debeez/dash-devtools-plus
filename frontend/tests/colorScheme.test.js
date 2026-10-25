import assert from "node:assert/strict";
import test from "node:test";
import {COLOR_SCHEME_ATTRIBUTE, COLOR_SCHEME_EVENT, observeColorScheme, resolveColorScheme} from "../src/colorScheme.js";
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
