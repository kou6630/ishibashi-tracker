const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  localImagePath,
  canonicalAssetUrl,
  createImageRewriter,
  BOOTSTRAP_PLACEHOLDER
} = require("../asset-url");

class FakeImage {
  constructor(src = "") {
    this.attributes = new Map(src ? [["src", src]] : []);
    this.dataset = {};
    this.listeners = new Map();
    this.setCount = 0;
  }
  get src() { return this.getAttribute("src") || ""; }
  set src(value) { this.setAttribute("src", value); }
  getAttribute(name) { return this.attributes.get(name) || null; }
  setAttribute(name, value) { this.setCount += name === "src" ? 1 : 0; this.attributes.set(name, String(value)); }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  emit(name) { this.listeners.get(name)?.(); }
}

class FakeNode {
  constructor(images = []) { this.images = images; }
  querySelectorAll(selector) { return selector === "img" ? this.images : []; }
}

function subject() {
  return createImageRewriter({ window: {}, HTMLImageElement: FakeImage });
}

test("normal image paths are converted once and asset URLs are idempotent", () => {
  assert.equal(canonicalAssetUrl("img/agents/KAYO.png", 0), "asset://img/agents/KAYO.png?v=0");
  assert.equal(canonicalAssetUrl("asset://img/agents/KAYO.png?v=0", 1), "asset://img/agents/KAYO.png?v=0");
  assert.equal(canonicalAssetUrl("asset://img/img/agents/KAYO.png?v=0", 1), "asset://img/agents/KAYO.png?v=0");
  assert.equal(canonicalAssetUrl("https://example.test/a.png", 0), "https://example.test/a.png");
  assert.equal(canonicalAssetUrl("data:image/png;base64,x", 0), "data:image/png;base64,x");
  assert.equal(localImagePath("asset://img/img/agents/KAYO.png?v=0"), "img/agents/KAYO.png");
});

test("repeated attribute mutation processing does not rewrite an already converted image", () => {
  const rewriter = subject();
  const image = new FakeImage("img/agents/KAYO.png");
  assert.equal(rewriter.rewriteImage(image), true);
  assert.equal(image.getAttribute("src"), "asset://img/agents/KAYO.png?v=0");
  for (let index = 0; index < 20; index += 1) assert.equal(rewriter.rewriteImage(image), false);
  assert.equal(image.setCount, 1);
  assert.doesNotMatch(image.getAttribute("src"), /asset:\/\/img\/img\//);
});

test("the real MutationObserver callback ignores its own src attribute update", () => {
  const listeners = new Map();
  let observerCallback = null;
  class FakeElement extends FakeNode {
    constructor() { super(); this.style = {}; this.attributes = new Map(); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
  }
  const document = new FakeNode();
  document.documentElement = new FakeNode();
  document.body = new FakeNode();
  document.body.appendChild = () => {};
  document.createElement = () => new FakeElement();
  const window = {
    HTMLImageElement: FakeImage,
    addEventListener: (name, callback) => listeners.set(name, callback),
    dispatchEvent: () => {},
    valorantApi: {}
  };
  const context = {
    window,
    document,
    HTMLImageElement: FakeImage,
    MutationObserver: class { constructor(callback) { observerCallback = callback; } observe() {} },
    CustomEvent: class {},
    URL,
    encodeURI,
    decodeURIComponent
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "asset-url.js"), "utf8"), context);
  listeners.get("DOMContentLoaded")();
  const image = new FakeImage("img/agents/KAYO.png");
  observerCallback([{ type: "childList", addedNodes: [image] }]);
  for (let index = 0; index < 20; index += 1) observerCallback([{ type: "attributes", target: image }]);
  assert.equal(image.setCount, 1);
  assert.equal(image.getAttribute("src"), "asset://img/agents/KAYO.png?v=0");
});

test("dynamically added images are converted without a prototype setter", () => {
  const rewriter = subject();
  const image = new FakeImage("img/agents/KAYO.png");
  const root = new FakeNode([image]);
  assert.equal(rewriter.rewriteImages(root), 1);
  assert.equal(image.getAttribute("src"), "asset://img/agents/KAYO.png?v=0");
  assert.equal(image.setCount, 1);
});

test("a failed image changes to the placeholder once and never retries in a loop", () => {
  const rewriter = subject();
  const image = new FakeImage("img/missing.png");
  rewriter.rewriteImage(image);
  image.emit("error");
  image.emit("error");
  assert.equal(image.getAttribute("src"), BOOTSTRAP_PLACEHOLDER);
  assert.equal(image.setCount, 2);
  assert.equal(rewriter.rewriteImage(image), false);
  assert.equal(image.setCount, 2);
});

test("an asset update retries a prior placeholder once with a new generation", () => {
  const rewriter = subject();
  const image = new FakeImage("img/not-yet-cached.png");
  rewriter.rewriteImage(image);
  image.emit("error");
  rewriter.setGeneration(1);
  assert.equal(rewriter.rewriteImage(image, true), true);
  assert.equal(image.getAttribute("src"), "asset://img/not-yet-cached.png?v=1");
  assert.equal(image.dataset.assetErrorHandled, undefined);
});

test("cache-miss placeholder behavior leaves the rest of the document writable", () => {
  const rewriter = subject();
  const image = new FakeImage("img/not-yet-cached.png");
  const root = new FakeNode([image]);
  rewriter.rewriteImages(root);
  image.emit("error");
  const interactiveState = { clicked: false };
  interactiveState.clicked = true;
  assert.equal(interactiveState.clicked, true);
  assert.equal(image.getAttribute("src"), BOOTSTRAP_PLACEHOLDER);
});
