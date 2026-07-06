"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import { useNetwork } from "@/lib/network";
import styles from "./orbit.module.css";

// ── Scene constants ─────────────────────────────────────────────────────────
const MAX_FRAMES = 54;       // most tokens we'll place on the sphere
const MIN_FRAMES = 24;       // cycle tokens to keep the sphere full below this
const SPHERE_RADIUS = 13;    // distance of each frame from the centre
const PLANE_W = 2.7;
const PLANE_H = 3.5;
const BG = 0x07070a;
const ACCENT = "#a855f7";    // sol.new brand purple

type Token = {
  name: string;
  symbol: string;
  description: string | null;
  image_url: string | null;
  mint_address: string;
  network: string | null;
  created_at: string;
};

const COPY =
  "Launched on sol.new — tokens, NFTs and wallets created in seconds on Solana. " +
  "Each frame is a real launch in the field. Drag to orbit; click a frame to open it.";

// Fibonacci sphere point.
function fibSpherePoint(i: number, n: number) {
  const off = 2 / n;
  const inc = Math.PI * (3 - Math.sqrt(5));
  const y = i * off - 1 + off / 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = i * inc;
  return new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r);
}

// Rounded-rectangle shape used for the dark backing plate behind each frame.
function roundedRect(w: number, h: number, rad: number) {
  const x = -w / 2 - 0.06;
  const y = -h / 2 - 0.06;
  const ww = w + 0.12;
  const hh = h + 0.12;
  const s = new THREE.Shape();
  s.moveTo(x + rad, y);
  s.lineTo(x + ww - rad, y);
  s.quadraticCurveTo(x + ww, y, x + ww, y + rad);
  s.lineTo(x + ww, y + hh - rad);
  s.quadraticCurveTo(x + ww, y + hh, x + ww - rad, y + hh);
  s.lineTo(x + rad, y + hh);
  s.quadraticCurveTo(x, y + hh, x, y + hh - rad);
  s.lineTo(x, y + rad);
  s.quadraticCurveTo(x, y, x + rad, y);
  return s;
}

// Branded placeholder texture: ticker on a dark card with a purple glow.
// Shown immediately so the sphere is always full, then replaced by the real
// token image once it loads (real images need CORS; this never fails).
function placeholderTexture(token: Token): THREE.CanvasTexture {
  const cw = 512;
  const ch = 640;
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0c0c12";
  ctx.fillRect(0, 0, cw, ch);
  const glow = ctx.createRadialGradient(cw / 2, ch * 0.42, 20, cw / 2, ch * 0.42, cw * 0.7);
  glow.addColorStop(0, "rgba(168,85,247,0.32)");
  glow.addColorStop(1, "rgba(168,85,247,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = "rgba(168,85,247,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, cw - 36, ch - 36);
  const sym = (token.symbol || token.name || "·").slice(0, 6).toUpperCase();
  ctx.fillStyle = "#f4f1ea";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${sym.length > 4 ? 96 : 132}px Inter, system-ui, sans-serif`;
  ctx.fillText(sym, cw / 2, ch * 0.42);
  ctx.fillStyle = "rgba(168,85,247,0.9)";
  ctx.font = "600 30px Inter, system-ui, sans-serif";
  ctx.fillText("sol.new", cw / 2, ch * 0.78);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type FrameData = {
  index: number;
  basePos: THREE.Vector3;
  token: Token;
  frame: THREE.Mesh;
};

export function OrbitGallery() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { network } = useNetwork();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let disposed = false;
    let cleanup = () => {};

    (async () => {
      let tokens: Token[] = [];
      try {
        const res = await fetch(`/api/tokens/recent?limit=${MAX_FRAMES}&network=${network}`);
        const data = (await res.json()) as { tokens?: Token[] };
        tokens = Array.isArray(data?.tokens) ? data.tokens : [];
      } catch {
        tokens = [];
      }
      if (disposed) return;

      const emptyEl = root.querySelector<HTMLDivElement>(".empty")!;
      const loaderEl = root.querySelector<HTMLDivElement>(".loader")!;
      if (tokens.length === 0) {
        loaderEl.style.display = "none";
        emptyEl.style.display = "flex";
        return;
      }

      cleanup = buildScene(root, tokens);
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  return (
    <div ref={rootRef} className={styles.root}>
      <canvas className="scene" />

      <div className="grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

      <div className="loader" id="loader">
        <div className="loader__inner">
          <div className="loader__count">
            <span id="loaderPct">0</span>
            <i>%</i>
          </div>
          <div className="loader__bar">
            <span id="loaderBar" />
          </div>
          <div className="loader__label">GATHERING LAUNCHES</div>
        </div>
      </div>

      <div className="empty" style={{ display: "none" }}>
        <div className="empty__inner">
          <div className="empty__title">No tokens yet</div>
          <p className="empty__copy">Be the first launch in the field.</p>
          <a className="empty__cta" href="/token">Launch a token →</a>
        </div>
      </div>

      <header className="hud hud--top">
        <div className="hud__brand">
          sol<span>.new</span>
        </div>
        <nav className="hud__nav">
          <a href="/">HOME</a>
          <a href="/token">LAUNCH</a>
          <span className="hud__dot">●</span>
        </nav>
      </header>

      <footer className="hud hud--bottom">
        <div className="hud__hint">
          <span className="hud__drag">drag to orbit</span>
          <span className="hud__sep">/</span>
          <span>click a token to open</span>
        </div>
        <div className="hud__meta">
          <span id="frameCount">—</span> tokens · launched on sol.new
        </div>
      </footer>

      <div className="cursor" id="cursor">
        <span className="cursor__label" id="cursorLabel">open</span>
      </div>

      <section className="detail" id="detail" aria-hidden="true">
        <div className="detail__bg" id="detailBg" />
        <div className="detail__scrim" />
        <button className="detail__close" id="detailClose" aria-label="Close">
          <span />
          <span />
          <em>close</em>
        </button>
        <div className="detail__content">
          <div className="detail__index" id="detailIndex">$SOL</div>
          <h1 className="detail__title" id="detailTitle">Untitled</h1>
          <div className="detail__divider" />
          <p className="detail__copy" id="detailCopy" />
          <div className="detail__tags" id="detailTags" />
          <a className="detail__cta" id="detailCta" href="#">View token →</a>
        </div>
        <div className="detail__plate">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img id="detailImg" alt="" />
        </div>
      </section>
    </div>
  );

  // ── Scene builder ─────────────────────────────────────────────────────────
  function buildScene(root: HTMLDivElement, tokens: Token[]): () => void {
    const canvas = root.querySelector<HTMLCanvasElement>(".scene")!;
    const loaderEl = root.querySelector<HTMLDivElement>(".loader")!;
    const loaderPct = root.querySelector<HTMLSpanElement>("#loaderPct")!;
    const loaderBar = root.querySelector<HTMLSpanElement>("#loaderBar")!;
    const cursorEl = root.querySelector<HTMLDivElement>(".cursor")!;
    const cursorLabel = root.querySelector<HTMLSpanElement>("#cursorLabel")!;
    const frameCountEl = root.querySelector<HTMLSpanElement>("#frameCount")!;

    const detail = root.querySelector<HTMLElement>(".detail")!;
    const detailBg = root.querySelector<HTMLDivElement>("#detailBg")!;
    const detailImg = root.querySelector<HTMLImageElement>("#detailImg")!;
    const detailTitle = root.querySelector<HTMLElement>("#detailTitle")!;
    const detailIndex = root.querySelector<HTMLElement>("#detailIndex")!;
    const detailCopy = root.querySelector<HTMLElement>("#detailCopy")!;
    const detailTags = root.querySelector<HTMLElement>("#detailTags")!;
    const detailCta = root.querySelector<HTMLAnchorElement>("#detailCta")!;
    const detailClose = root.querySelector<HTMLButtonElement>("#detailClose")!;

    // How many frames: one per token, cycled up to MIN_FRAMES so the sphere
    // never looks sparse, capped at MAX_FRAMES.
    const count = Math.min(Math.max(tokens.length, MIN_FRAMES), MAX_FRAMES);

    // ── Renderer / scene / camera ─────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.FogExp2(BG, 0.028);

    const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 0.001);

    // ── Star field (faint purple) ─────────────────────────────────────────
    const stars = (() => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(800 * 3);
      for (let i = 0; i < 800; i++) {
        const r = 5 + Math.random() * 9;
        const a = Math.random() * Math.PI * 2;
        const o = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(o) * Math.cos(a);
        pos[i * 3 + 1] = r * Math.sin(o) * Math.sin(a);
        pos[i * 3 + 2] = r * Math.cos(o);
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: new THREE.Color(ACCENT), size: 0.03, transparent: true, opacity: 0.3, depthWrite: false,
      });
      return new THREE.Points(geo, mat);
    })();
    scene.add(stars);

    // ── Frames on the sphere ──────────────────────────────────────────────
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    const frames: THREE.Mesh[] = [];
    const group = new THREE.Group();
    scene.add(group);

    let revealed = false;
    let settled = 0;
    function onAssetDone() {
      settled++;
      const pct = Math.round((settled / count) * 100);
      loaderPct.textContent = String(pct);
      loaderBar.style.width = pct + "%";
      if (settled >= count) reveal();
    }

    const plateShape = roundedRect(PLANE_W, PLANE_H, 0.12);

    for (let i = 0; i < count; i++) {
      const token = tokens[i % tokens.length];
      const pos = fibSpherePoint(i, count).multiplyScalar(SPHERE_RADIUS);

      const planeGeo = new THREE.PlaneGeometry(PLANE_W, PLANE_H, 1, 1);
      const planeMat = new THREE.MeshBasicMaterial({
        map: placeholderTexture(token), side: THREE.DoubleSide, transparent: true, opacity: 0, toneMapped: false,
      });
      const mesh = new THREE.Mesh(planeGeo, planeMat);
      mesh.position.copy(pos);
      mesh.lookAt(0, 0, 0);

      const plateGeo = new THREE.ShapeGeometry(plateShape);
      const plateMat = new THREE.MeshBasicMaterial({
        color: 0x14101c, transparent: true, opacity: 0, side: THREE.DoubleSide,
      });
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.copy(pos).multiplyScalar(1.012);
      plate.lookAt(0, 0, 0);
      group.add(plate);

      // Swap in the real token image when it loads; placeholder stays on failure.
      if (token.image_url) {
        loader.load(
          token.image_url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.generateMipmaps = true;
            planeMat.map?.dispose();
            planeMat.map = tex;
            planeMat.needsUpdate = true;
            onAssetDone();
          },
          undefined,
          () => onAssetDone(),
        );
      } else {
        onAssetDone();
      }

      (mesh.userData as FrameData) = { index: i, basePos: pos.clone(), token, frame: plate };
      group.add(mesh);
      frames.push(mesh);
    }
    frameCountEl.textContent = String(tokens.length).padStart(3, "0");

    // ── Interaction state ─────────────────────────────────────────────────
    let azimuth = 30, pitch = -4, smAz = 0, smPit = 0, velAz = 0, velPit = 0;
    let dragging = false, moved = false, detailOpen = false;
    let downX = 0, downY = 0, lastX = 0, lastY = 0;

    const lookTarget = new THREE.Vector3();
    const mouse = new THREE.Vector2(-2, -2);
    const raycaster = new THREE.Raycaster();
    let hovered: THREE.Mesh | null = null;
    let openMesh: THREE.Mesh | null = null;

    function pick(): THREE.Mesh | null {
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(frames, false);
      return hits.length ? (hits[0].object as THREE.Mesh) : null;
    }

    function onPointerDown(e: PointerEvent) {
      if (detailOpen) return;
      dragging = true;
      moved = false;
      downX = lastX = e.clientX;
      downY = lastY = e.clientY;
      velAz = velPit = 0;
      cursorEl.classList.add("is-drag");
    }

    function onPointerMove(e: PointerEvent) {
      cursorEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%,-50%)`;
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      if (!dragging || detailOpen) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) moved = true;
      azimuth -= dx * 0.11;
      pitch += dy * 0.11;
      pitch = THREE.MathUtils.clamp(pitch, -78, 78);
      velAz = -dx * 0.11;
      velPit = dy * 0.11;
      lastX = e.clientX;
      lastY = e.clientY;
    }

    function onPointerUp(e: PointerEvent) {
      if (!dragging) return;
      dragging = false;
      cursorEl.classList.remove("is-drag");
      if (!moved && !detailOpen) {
        const m = pick();
        if (m) openDetail(m, e.clientX, e.clientY);
      }
    }

    // ── Detail page ───────────────────────────────────────────────────────
    function openDetail(mesh: THREE.Mesh, x: number, y: number) {
      detailOpen = true;
      const data = mesh.userData as FrameData;
      const t = data.token;
      const dir = data.basePos.clone().normalize();
      const targetPitch = THREE.MathUtils.radToDeg(Math.asin(dir.y));
      const targetAz = THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.x));

      gsap.to({ a: azimuth, b: pitch }, {
        a: targetAz, b: targetPitch, duration: 0.7, ease: "power3.inOut",
        onUpdate() {
          azimuth = (this.targets()[0] as { a: number; b: number }).a;
          pitch = (this.targets()[0] as { a: number; b: number }).b;
        },
      });
      gsap.to(mesh.position, {
        x: data.basePos.x * 0.42, y: data.basePos.y * 0.42, z: data.basePos.z * 0.42,
        duration: 0.7, ease: "power3.inOut",
      });
      gsap.to(mesh.scale, { x: 1.6, y: 1.6, duration: 0.7, ease: "power3.inOut" });

      if (t.image_url) {
        detailImg.src = t.image_url;
        detailBg.style.backgroundImage = `url(${t.image_url})`;
      } else {
        detailImg.removeAttribute("src");
        detailBg.style.backgroundImage = "none";
      }
      detailTitle.textContent = t.name;
      detailIndex.textContent = `$${(t.symbol || "").toUpperCase()} · #${String(data.index + 1).padStart(3, "0")}`;
      detailCopy.textContent = t.description || COPY;
      const net = t.network === "devnet" ? "Devnet" : "Mainnet";
      const tags = [net, "Solana", fmtDate(t.created_at)].filter(Boolean) as string[];
      detailTags.innerHTML = tags.map((tg) => `<span>${tg}</span>`).join("");
      detailCta.href = `/token/${t.mint_address}`;

      detail.style.setProperty("--cx", (x / window.innerWidth) * 100 + "%");
      detail.style.setProperty("--cy", (y / window.innerHeight) * 100 + "%");
      detail.setAttribute("aria-hidden", "false");
      detail.classList.add("is-open");
      openMesh = mesh;

      gsap.timeline()
        .to(detail, { clipPath: "circle(150% at var(--cx) var(--cy))", duration: 0.85, ease: "power3.inOut" }, 0.25)
        .from(root.querySelector(".detail__index"), { y: 24, opacity: 0, duration: 0.6, ease: "power2.out" }, "-=0.4")
        .from(root.querySelector(".detail__title"), { y: 40, opacity: 0, duration: 0.7, ease: "power3.out" }, "<0.05")
        .from(root.querySelector(".detail__divider"), { scaleX: 0, transformOrigin: "left", duration: 0.5 }, "<0.1")
        .from(root.querySelector(".detail__copy"), { y: 20, opacity: 0, duration: 0.6 }, "<")
        .from(root.querySelectorAll(".detail__tags span"), { y: 16, opacity: 0, stagger: 0.06, duration: 0.4 }, "<0.05")
        .from(root.querySelector(".detail__cta"), { y: 16, opacity: 0, duration: 0.5 }, "<0.05")
        .from(root.querySelector(".detail__plate img"), { scale: 1.08, opacity: 0, duration: 0.9, ease: "power2.out" }, "-=0.7")
        .from(root.querySelector(".detail__close"), { opacity: 0, duration: 0.4 }, "<");
    }

    function closeDetail() {
      gsap.to(detail, {
        clipPath: "circle(0% at var(--cx) var(--cy))", duration: 0.7, ease: "power3.inOut",
        onComplete() {
          detail.classList.remove("is-open");
          detail.setAttribute("aria-hidden", "true");
          detailOpen = false;
        },
      });
      if (openMesh) {
        const data = openMesh.userData as FrameData;
        gsap.to(openMesh.position, { x: data.basePos.x, y: data.basePos.y, z: data.basePos.z, duration: 0.8, ease: "power3.inOut" });
        gsap.to(openMesh.scale, { x: 1, y: 1, duration: 0.8, ease: "power3.inOut" });
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && detailOpen) closeDetail();
    }

    // ── Reveal ────────────────────────────────────────────────────────────
    function reveal() {
      if (revealed) return;
      revealed = true;
      gsap.to(loaderEl, { opacity: 0, duration: 0.8, ease: "power2.inOut", onComplete: () => { loaderEl.style.display = "none"; } });
      frames.forEach((mesh, i) => {
        const data = mesh.userData as FrameData;
        mesh.position.copy(data.basePos.clone().multiplyScalar(1.4));
        const delay = 0.3 + i * 0.012;
        gsap.to(mesh.material as THREE.Material, { opacity: 1, duration: 1.2, delay, ease: "power2.out" });
        gsap.to(data.frame.material as THREE.Material, { opacity: 1, duration: 1.2, delay });
        gsap.to(mesh.position, { x: data.basePos.x, y: data.basePos.y, z: data.basePos.z, duration: 1.6, delay, ease: "power3.out" });
      });
      azimuth = 30;
      gsap.delayedCall(0.2, () => { azimuth = 0; });
    }
    const fallback = window.setTimeout(reveal, 6000);

    // ── Render loop ───────────────────────────────────────────────────────
    let raf = 0;
    function tick() {
      raf = requestAnimationFrame(tick);

      if (!dragging && !detailOpen) {
        azimuth += velAz;
        pitch += velPit;
        pitch = THREE.MathUtils.clamp(pitch, -78, 78);
        velAz *= 0.94;
        velPit *= 0.94;
        if (Math.abs(velAz) < 0.002 && Math.abs(velPit) < 0.002) azimuth += 0.018;
      }

      smAz += (azimuth - smAz) * 0.075;
      smPit += (pitch - smPit) * 0.075;

      const phi = THREE.MathUtils.degToRad(90 - smPit);
      const theta = THREE.MathUtils.degToRad(smAz);
      lookTarget.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      camera.lookAt(lookTarget);

      if (!detailOpen && !dragging) {
        const m = pick();
        if (m !== hovered) {
          hovered = m;
          cursorEl.classList.toggle("is-hover", !!m);
          if (m) {
            const t = (m.userData as FrameData).token;
            cursorLabel.textContent = `$${(t.symbol || t.name || "open").toUpperCase()}`;
          }
        }
      }

      for (const mesh of frames) {
        if (detailOpen) continue;
        const target = mesh === hovered ? 1.14 : 1;
        const cur = mesh.scale.x;
        const next = cur + (target - cur) * 0.12;
        mesh.scale.setScalar(next);
        (mesh.userData as FrameData).frame.scale.setScalar(next);
      }

      stars.rotation.y += 0.0004;
      renderer.render(scene, camera);
    }
    tick();

    // ── Events ────────────────────────────────────────────────────────────
    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
    const preventTouch = (e: TouchEvent) => e.preventDefault();

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("touchmove", preventTouch, { passive: false });
    detailClose.addEventListener("click", closeDetail);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
      gsap.killTweensOf("*");
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("touchmove", preventTouch);
      detailClose.removeEventListener("click", closeDetail);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      frames.forEach((m) => {
        m.geometry.dispose();
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
        const data = m.userData as FrameData;
        data.frame.geometry.dispose();
        (data.frame.material as THREE.Material).dispose();
      });
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
