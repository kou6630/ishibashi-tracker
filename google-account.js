(function () {
  "use strict";

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDIiwhzuEXucBro2-PpFYNh9-BB37imLMI",
    authDomain: "ishibashi-tracker.firebaseapp.com",
    projectId: "ishibashi-tracker",
    storageBucket: "ishibashi-tracker.firebasestorage.app",
    messagingSenderId: "472088950213",
    appId: "1:472088950213:web:7c511bb46c1710464107ac"
  };

  const SDK_VERSION = "10.12.5";
  let currentUser = null;
  let currentPuuids = [];
  let auth = null;
  let db = null;
  let firestoreFns = null;

  function getEl(id) {
    return document.getElementById(id);
  }

  function getOriginText(origin = "") {
    return origin || window.location.origin || window.location.href || "unknown";
  }

  function setStatus(message) {
    const status = getEl("googleAccountStatus");
    if (status) status.textContent = message || "";
  }

  function setPuuidList(puuids = currentPuuids) {
    const list = getEl("googlePuuidList");
    if (!list) return;
    list.textContent = puuids.length
      ? `連携済みPUUID: ${puuids.join(", ")}`
      : "連携済みPUUIDはありません。";
  }

  function applyUser(user, puuids = currentPuuids) {
    currentUser = user || null;
    currentPuuids = Array.isArray(puuids) ? puuids : [];
    render();
  }

  async function loadSdk() {
    if (auth && db) return true;
    const appMod = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`);
    const authMod = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`);
    const fireMod = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`);
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    auth = authMod.getAuth(app);
    db = fireMod.getFirestore(app);
    firestoreFns = fireMod;
    authMod.onAuthStateChanged(auth, async (user) => {
      if (!window.trackerValorantApi?.startGoogleLogin) {
        currentUser = user || null;
        render();
      }
    });
    return true;
  }

  async function fallbackPopupSignIn() {
    const authMod = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`);
    await loadSdk();
    const provider = new authMod.GoogleAuthProvider();
    await authMod.signInWithPopup(auth, provider);
  }

  async function signIn() {
    try {
      const electronLogin = window.trackerValorantApi?.startGoogleLogin;
      if (electronLogin) {
        const originResult = await window.trackerValorantApi?.getGoogleSession?.();
        setStatus(`現在の実行元: ${getOriginText(originResult?.origin)} / ブラウザでGoogleログインを開いています...`);
        const result = await electronLogin();
        if (!result?.ok) throw new Error(result?.message || "Googleログインに失敗しました。");
        applyUser(result.user, result.user?.puuids || []);
        setStatus(`ログイン中: ${currentUser.displayName || "-"} / ${currentUser.email || "-"}`);
        return;
      }

      setStatus(`現在の実行元: ${getOriginText()} / Googleログインを開いています...`);
      await fallbackPopupSignIn();
    } catch (error) {
      const message = error?.code === "auth/unauthorized-domain"
        ? `Googleログイン失敗: auth/unauthorized-domain。現在の実行元は ${getOriginText()} です。Electronではブラウザログイン方式が必要です。`
        : `Googleログイン失敗: ${error.message || error}`;
      setStatus(message);
    }
  }

  async function signOut() {
    try {
      if (window.trackerValorantApi?.signOutGoogle) {
        await window.trackerValorantApi.signOutGoogle();
      } else {
        const authMod = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`);
        if (auth) await authMod.signOut(auth);
      }
      window.collectionGame?.deactivateGoogleAccount?.();
      applyUser(null, []);
      setStatus("ログアウトしました。");
    } catch (error) {
      setStatus(`ログアウト失敗: ${error.message || error}`);
    }
  }

  async function linkCurrentPuuid() {
    try {
      if (!currentUser) {
        setStatus("Googleログインが必要です。");
        return;
      }
      if (!window.trackerValorantApi?.linkGoogleCurrentPuuid) {
        setStatus("この環境ではPUUID連携を使えません。");
        return;
      }
      const result = await window.trackerValorantApi.linkGoogleCurrentPuuid();
      if (!result?.ok) throw new Error(result?.message || "PUUID連携に失敗しました。");
      currentPuuids = Array.isArray(result.puuids) ? result.puuids : result.user?.puuids || currentPuuids;
      setStatus("現在のVALORANTアカウントを連携しました。");
      setPuuidList(currentPuuids);
      render();
    } catch (error) {
      setStatus(`PUUID連携失敗: ${error.message || error}`);
    }
  }

  function render() {
    const loginButton = getEl("googleLoginButton");
    const logoutButton = getEl("googleLogoutButton");
    const linkButton = getEl("googleLinkPuuidButton");
    if (!loginButton || !logoutButton || !linkButton) return;

    loginButton.style.display = currentUser ? "none" : "";
    logoutButton.style.display = currentUser ? "" : "none";
    linkButton.style.display = currentUser ? "" : "none";

    if (!currentUser) {
      setPuuidList([]);
      setStatus("Googleログインは必須です。進捗保存、PUUID連携、ショップ、ログインボーナスの同期に使用します。");
      return;
    }

    setStatus(`ログイン中: ${currentUser.displayName || "-"} / ${currentUser.email || "-"}`);
    setPuuidList(currentPuuids);
  }

  async function restoreSession() {
    try {
      const result = await window.trackerValorantApi?.getGoogleSession?.();
      if (result?.user) applyUser(result.user, result.user.puuids || []);
      else render();
    } catch (error) {
      render();
    }
  }

  async function init() {
    getEl("googleLoginButton")?.addEventListener("click", signIn);
    getEl("googleLogoutButton")?.addEventListener("click", signOut);
    getEl("googleLinkPuuidButton")?.addEventListener("click", linkCurrentPuuid);
    if (window.trackerValorantApi?.startGoogleLogin) {
      await restoreSession();
      return;
    }
    try {
      await loadSdk();
      render();
    } catch (error) {
      setStatus(`Google連携SDK読み込み失敗: ${error.message || error}`);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.googleAccount = {
    isSignedIn: () => Boolean(currentUser),
    getUser: () => currentUser ? {
      uid: currentUser.uid,
      email: currentUser.email,
      displayName: currentUser.displayName,
      photoURL: currentUser.photoURL
    } : null
  };
})();
