(function attachInboxUtils(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.inboxUtils = api;
})(typeof window !== "undefined" ? window : globalThis, () => {
  function rewardValues(item = {}) {
    return ["kp", "ap", "cookies", "ticket15", "ticket2"].map((key) => Math.max(0, Number(item?.[key]) || 0));
  }

  function hasAttachment(item = {}) {
    return rewardValues(item).some((value) => value > 0);
  }

  function getBody(item = {}) {
    if (item?.body) return String(item.body);
    if (item?.message) return String(item.message);
    if (item?.type === "item") return "管理者からアイテムが届いています。";
    return "";
  }

  return { getBody, hasAttachment, rewardValues };
});
