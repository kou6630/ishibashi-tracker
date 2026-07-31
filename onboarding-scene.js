import * as THREE from "./node_modules/three/build/three.module.js";

const RED = new THREE.Color(0xff3347);
const WHITE = new THREE.Color(0xeaf2ff);
const BLACK = new THREE.Color(0x030407);

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export class OnboardingScene {
  constructor(canvas, { onModeChange } = {}) {
    this.canvas = canvas;
    this.onModeChange = onModeChange;
    this.mode = "full";
    this.running = false;
    this.disposed = false;
    this.step = 0;
    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this.frameSamples = [];
    this.sampleStartedAt = 0;
    this.raf = 0;
    this.resizeObserver = null;
    this.boundPointer = (event) => this.handlePointer(event);
    this.boundVisibility = () => document.hidden ? this.pause() : this.resume();
    this.boundContextLost = (event) => {
      event.preventDefault();
      this.setMode("static");
      this.pause();
    };
  }

  init() {
    if (!this.canvas || this.disposed) return false;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      this.setMode("static");
      return false;
    }

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance"
      });
    } catch {
      this.setMode("static");
      return false;
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(BLACK, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.038);
    this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
    this.camera.position.set(0, 0, 13);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.createCore();
    this.createParticles();
    this.createFragments();
    this.createLights();
    this.resize();

    window.addEventListener("pointermove", this.boundPointer, { passive: true });
    document.addEventListener("visibilitychange", this.boundVisibility);
    this.canvas.addEventListener("webglcontextlost", this.boundContextLost);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.sampleStartedAt = performance.now();
    this.resume();
    return true;
  }

  createCore() {
    this.core = new THREE.Group();
    this.world.add(this.core);

    const cage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.35, 1),
      new THREE.MeshBasicMaterial({
        color: RED,
        wireframe: true,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending
      })
    );
    const inner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.18, 2),
      new THREE.MeshStandardMaterial({
        color: 0x151922,
        emissive: 0x4c0710,
        emissiveIntensity: 1.8,
        metalness: 0.76,
        roughness: 0.22,
        flatShading: true
      })
    );
    this.core.add(cage, inner);
    this.cage = cage;
    this.inner = inner;

    this.rings = new THREE.Group();
    [
      [3.15, 0.012, 0],
      [3.55, 0.008, Math.PI / 2.45],
      [4.05, 0.006, -Math.PI / 3.2]
    ].forEach(([radius, opacity, rotation], index) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.012 + index * 0.004, 5, 160),
        new THREE.MeshBasicMaterial({
          color: index === 1 ? WHITE : RED,
          transparent: true,
          opacity: Math.max(0.14, opacity * 20),
          blending: THREE.AdditiveBlending
        })
      );
      ring.rotation.x = rotation;
      ring.rotation.y = rotation * 0.65;
      this.rings.add(ring);
    });
    this.core.add(this.rings);
  }

  createParticles() {
    const random = seededRandom(6630);
    const positions = [];
    const colors = [];
    for (let index = 0; index < 1100; index += 1) {
      const radius = 5 + random() * 22;
      const angle = random() * Math.PI * 2;
      positions.push(
        Math.cos(angle) * radius,
        (random() - 0.5) * 17,
        Math.sin(angle) * radius - 5
      );
      const color = random() > 0.88 ? RED : WHITE;
      colors.push(color.r, color.g, color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.particles = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.035,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.world.add(this.particles);
  }

  createFragments() {
    const random = seededRandom(14010);
    this.fragments = new THREE.Group();
    const geometry = new THREE.TetrahedronGeometry(0.22, 0);
    for (let index = 0; index < 28; index += 1) {
      const material = new THREE.MeshStandardMaterial({
        color: index % 5 === 0 ? 0x3e0a11 : 0x11141b,
        emissive: index % 5 === 0 ? 0x2a0308 : 0x000000,
        metalness: 0.85,
        roughness: 0.35
      });
      const fragment = new THREE.Mesh(geometry, material);
      const angle = random() * Math.PI * 2;
      const radius = 4.5 + random() * 7;
      fragment.position.set(Math.cos(angle) * radius, (random() - 0.5) * 9, Math.sin(angle) * 4 - 2);
      fragment.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
      fragment.scale.setScalar(0.55 + random() * 1.8);
      fragment.userData.speed = 0.16 + random() * 0.36;
      this.fragments.add(fragment);
    }
    this.world.add(this.fragments);
  }

  createLights() {
    this.scene.add(new THREE.AmbientLight(0x667088, 0.72));
    const redLight = new THREE.PointLight(0xff2740, 34, 25);
    redLight.position.set(3, 2, 5);
    const rimLight = new THREE.DirectionalLight(0xdce9ff, 2.5);
    rimLight.position.set(-4, 5, 6);
    this.scene.add(redLight, rimLight);
  }

  setStep(step) {
    this.step = Math.max(0, Math.min(5, Number(step) || 0));
    if (!this.core) return;
    const direction = this.step % 2 === 0 ? 1 : -1;
    this.core.position.x = direction * (2.7 + this.step * 0.08);
    this.core.position.y = (this.step - 2.5) * 0.16;
    this.inner.material.emissiveIntensity = 1.6 + this.step * 0.15;
  }

  handlePointer(event) {
    this.pointerTarget.x = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    this.pointerTarget.y = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * -2;
  }

  resize() {
    if (!this.renderer || !this.camera || !this.canvas) return;
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.canvas?.closest(".onboarding-experience")?.setAttribute("data-render-mode", mode);
    if (this.particles) {
      this.particles.material.opacity = mode === "lite" ? 0.28 : 0.7;
      this.particles.material.size = mode === "lite" ? 0.025 : 0.035;
    }
    this.onModeChange?.(mode);
  }

  samplePerformance(now) {
    if (this.mode !== "full" || !this.sampleStartedAt) return;
    const delta = this.clock.getDelta();
    if (delta > 0) this.frameSamples.push(1 / delta);
    if (now - this.sampleStartedAt < 2500) return;
    const average = this.frameSamples.reduce((sum, fps) => sum + Math.min(fps, 120), 0) / Math.max(1, this.frameSamples.length);
    if (average < 45) this.setMode("lite");
    this.sampleStartedAt = 0;
    this.frameSamples.length = 0;
  }

  render = (now) => {
    if (!this.running || this.disposed || !this.renderer) return;
    this.raf = requestAnimationFrame(this.render);
    const elapsed = now * 0.001;
    this.pointer.lerp(this.pointerTarget, this.mode === "lite" ? 0.025 : 0.045);

    this.world.rotation.y += (this.pointer.x * 0.06 - this.world.rotation.y) * 0.035;
    this.world.rotation.x += (this.pointer.y * 0.035 - this.world.rotation.x) * 0.035;
    this.camera.position.x += (this.pointer.x * 0.24 - this.camera.position.x) * 0.025;
    this.camera.position.y += (this.pointer.y * 0.16 - this.camera.position.y) * 0.025;
    this.camera.lookAt(0, 0, 0);

    this.core.rotation.y = elapsed * 0.12 + this.step * 0.25;
    this.core.rotation.x = Math.sin(elapsed * 0.35) * 0.1;
    this.cage.rotation.z = -elapsed * 0.08;
    this.inner.rotation.y = elapsed * 0.18;
    this.rings.children.forEach((ring, index) => {
      ring.rotation.z += 0.0008 * (index + 1);
    });
    this.particles.rotation.y = elapsed * 0.008;
    if (this.mode === "full") {
      this.fragments.children.forEach((fragment, index) => {
        fragment.rotation.x += 0.0007 * fragment.userData.speed;
        fragment.rotation.y += 0.0012 * fragment.userData.speed;
        fragment.position.y += Math.sin(elapsed * fragment.userData.speed + index) * 0.0008;
      });
    }

    this.renderer.render(this.scene, this.camera);
    this.samplePerformance(now);
  };

  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.clock.stop();
  }

  resume() {
    if (this.disposed || this.running || !this.renderer || document.hidden) return;
    this.running = true;
    this.clock.start();
    this.raf = requestAnimationFrame(this.render);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    window.removeEventListener("pointermove", this.boundPointer);
    document.removeEventListener("visibilitychange", this.boundVisibility);
    this.canvas?.removeEventListener("webglcontextlost", this.boundContextLost);
    this.resizeObserver?.disconnect();
    this.scene?.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
  }
}
