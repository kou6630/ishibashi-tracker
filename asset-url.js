(function (root) {
  "use strict";

  const ASSET_PREFIX = "asset://img/";
  const BOOTSTRAP_PLACEHOLDER = "asset://img/bootstrap/image-placeholder.svg";

  function splitSuffix(value) {
    const match = String(value || "").match(/^([^?#]*)([?#][\s\S]*)?$/);
    return { path: match ? match[1] : "", suffix: match?.[2] || "" };
  }

  function localImagePath(value) {
    const raw = String(value || "").trim();
    if (!raw || /^(?:data|blob|https?):/i.test(raw)) return "";
    if (/^asset:/i.test(raw)) {
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== "asset:" || parsed.hostname !== "img") return "";
        let relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
        while (relative.startsWith("img/")) relative = relative.slice(4);
        return relative ? `img/${relative}` : "";
      } catch (error) {
        return "";
      }
    }
    const { path } = splitSuffix(raw.replace(/^\.\//, "").replace(/\\/g, "/"));
    return path.startsWith("img/") ? path : "";
  }

  function canonicalAssetUrl(value, generation) {
    const raw = String(value || "").trim();
    if (!raw) return raw;
    if (/^(?:data|blob|https?):/i.test(raw)) return raw;
    if (/^asset:/i.test(raw)) {
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== "asset:" || parsed.hostname !== "img") return raw;
        let relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
        while (relative.startsWith("img/")) relative = relative.slice(4);
        return relative ? `${ASSET_PREFIX}${encodeURI(relative)}${parsed.search}${parsed.hash}` : raw;
      } catch (error) {
        return raw;
      }
    }
    const relative = localImagePath(raw);
    return relative ? `${ASSET_PREFIX}${encodeURI(relative.slice(4))}?v=${generation}` : raw;
  }

  function createImageRewriter(environment) {
    const win = environment.window;
    const ImageElement = environment.HTMLImageElement;
    const errorBound = new WeakSet();
    let generation = 0;

    function assetUrl(value) {
      return canonicalAssetUrl(value, generation);
    }

    function bindErrorHandler(image) {
      if (errorBound.has(image) || !image?.addEventListener) return;
      errorBound.add(image);
      image.addEventListener("error", () => {
        if (image.dataset.assetErrorHandled === "1") return;
        const current = canonicalAssetUrl(image.getAttribute?.("src") || image.src, generation);
        if (current === BOOTSTRAP_PLACEHOLDER) return;
        image.dataset.assetErrorHandled = "1";
        if ((image.getAttribute?.("src") || "") !== BOOTSTRAP_PLACEHOLDER) image.setAttribute("src", BOOTSTRAP_PLACEHOLDER);
      });
    }

    function rewriteImage(image, force) {
      if (!image || !(image instanceof ImageElement)) return false;
      const attribute = image.getAttribute("src") || "";
      const currentPath = localImagePath(attribute);
      const original = force && /^asset:/i.test(attribute) && image.dataset.assetPath ? image.dataset.assetPath : currentPath;
      bindErrorHandler(image);
      if (!original) return false;
      image.dataset.assetPath = original;
      if (force && original !== "img/bootstrap/image-placeholder.svg") delete image.dataset.assetErrorHandled;
      const next = force ? `${ASSET_PREFIX}${encodeURI(original.slice(4))}?v=${generation}` : assetUrl(attribute || original);
      const current = canonicalAssetUrl(attribute, generation);
      if (current === next && attribute === next) return false;
      if (attribute !== next) image.setAttribute("src", next);
      return true;
    }

    function rewriteImages(node, force) {
      if (!node) return 0;
      let changed = 0;
      if (node instanceof ImageElement && rewriteImage(node, force)) changed += 1;
      node.querySelectorAll?.("img").forEach((image) => { if (rewriteImage(image, force)) changed += 1; });
      return changed;
    }

    function setGeneration(nextGeneration) {
      generation = Number.isSafeInteger(nextGeneration) ? nextGeneration : generation + 1;
    }

    return { assetUrl, rewriteImage, rewriteImages, setGeneration, placeholder: BOOTSTRAP_PLACEHOLDER };
  }

  function installProgressUi(api) {
    const element = document.createElement("div");
    element.id = "assetDownloadStatus";
    element.setAttribute("role", "status");
    element.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;max-width:320px;padding:10px 12px;border-radius:8px;background:#182235;color:#fff;font:13px sans-serif;box-shadow:0 4px 16px #0008;pointer-events:none;display:none";
    document.body.appendChild(element);
    const update = (status) => {
      const total = Number(status?.totalAssets || 0);
      const completed = Number(status?.downloadedAssets || 0);
      if (status?.syncing && total > 0) {
        const percent = Math.min(100, Math.floor((completed / total) * 100));
        element.textContent = `画像素材を取得中: ${completed}/${total} (${percent}%)`;
        element.style.display = "block";
      } else if (status?.error) {
        element.textContent = "画像素材を取得できませんでした。取得済みの素材を使用します。";
        element.style.display = "block";
      } else {
        element.style.display = "none";
      }
    };
    api?.getAssetStatus?.().then(update).catch(() => {});
    api?.onAssetsProgress?.(update);
    api?.onAssetsUpdated?.(update);
  }

  const exported = { localImagePath, canonicalAssetUrl, createImageRewriter, BOOTSTRAP_PLACEHOLDER };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
    return;
  }

  const rewriter = createImageRewriter({ window: root, HTMLImageElement: root.HTMLImageElement });
  root.assetUrl = rewriter.assetUrl;
  root.addEventListener("DOMContentLoaded", () => {
    rewriter.rewriteImages(document);
    new MutationObserver((records) => records.forEach((record) => {
      record.addedNodes?.forEach((node) => rewriter.rewriteImages(node));
      if (record.type === "attributes") rewriter.rewriteImage(record.target);
    })).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    installProgressUi(root.valorantApi);
  });
  root.valorantApi?.onAssetsUpdated?.((status) => {
    rewriter.setGeneration();
    rewriter.rewriteImages(document, true);
    root.dispatchEvent(new CustomEvent("assets-updated", { detail: status }));
  });
})(typeof window !== "undefined" ? window : globalThis);
