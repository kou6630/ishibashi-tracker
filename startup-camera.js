(function attachStartupCamera(root) {
  const api = () => root.trackerValorantApi || root.valorantApi || {};
  let attempted = false;

  function takePhoto(video) {
    const width = Math.max(1, Number(video.videoWidth) || 640);
    const height = Math.max(1, Number(video.videoHeight) || 480);
    const scale = Math.min(1, 960 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext("2d", { alpha: false })?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  async function waitForFrame(video) {
    if (video.requestVideoFrameCallback) {
      await new Promise((resolve) => video.requestVideoFrameCallback(() => resolve()));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  async function capture() {
    if (attempted) return { ok: false, skipped: true };
    attempted = true;
    let stream = null;
    let video = null;
    try {
      const session = await api().getGoogleSession?.();
      if (!session?.user?.uid) return { ok: false, skipped: true };
      const scope = await api().setCameraAccessScope?.("startup");
      if (!scope?.ok) return { ok: false, skipped: true };
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px";
      document.body.append(video);
      video.srcObject = stream;
      await video.play();
      await waitForFrame(video);
      const track = stream.getVideoTracks()[0];
      return await api().saveGoogleAvatarPhoto?.(takePhoto(video), track?.label || "カメラ");
    } catch (error) {
      return { ok: false, silent: true };
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      video?.remove();
      await api().setCameraAccessScope?.("none");
    }
  }

  root.startupCamera = { capture };
})(window);
