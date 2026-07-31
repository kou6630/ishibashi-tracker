(function () {
  let generation = 0;

  function normalize(path) {
    const raw = String(path || "");
    if (raw.startsWith("asset://")) {
      try { return `img/${decodeURIComponent(new URL(raw).hostname + new URL(raw).pathname).replace(/^img\/img\//, "")}`; } catch (error) { return ""; }
    }
    return raw.replace(/^\.\//, "").replace(/\\/g, "/").startsWith("img/") ? raw.replace(/^\.\//, "").replace(/\\/g, "/") : "";
  }

  function assetUrl(relativePath) {
    const normalized = normalize(relativePath);
    return normalized ? `asset://${encodeURI(normalized)}?v=${generation}` : String(relativePath || "");
  }

  function rewriteImage(image, force) {
    const original = image.dataset.assetPath || normalize(image.getAttribute("src") || image.src);
    if (!original) return;
    image.dataset.assetPath = original;
    const next = assetUrl(original);
    if (force || image.src !== next) image.src = next;
  }

  function rewriteImages(root, force = false) {
    if (!root) return;
    if (root instanceof HTMLImageElement) rewriteImage(root, force);
    root.querySelectorAll?.("img").forEach((image) => rewriteImage(image, force));
  }

  const imageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    configurable: true,
    enumerable: imageSrc.enumerable,
    get: imageSrc.get,
    set(value) { imageSrc.set.call(this, assetUrl(value)); }
  });

  window.assetUrl = assetUrl;
  window.addEventListener("DOMContentLoaded", () => {
    rewriteImages(document);
    new MutationObserver((records) => records.forEach((record) => {
      record.addedNodes.forEach((node) => rewriteImages(node));
      if (record.type === "attributes") rewriteImage(record.target);
    })).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  });
  window.valorantApi?.onAssetsUpdated?.(() => {
    generation += 1;
    rewriteImages(document, true);
    window.dispatchEvent(new CustomEvent("assets-updated"));
  });
})();
