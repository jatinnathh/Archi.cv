"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

// ─── helpers ────────────────────────────────────────────────────────────────
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const fadeRange = (p: number, inS: number, inE: number, outS: number, outE: number): number => {
  if (p <= inS || p >= outE) return 0;
  if (p >= inE && p <= outS) return 1;
  if (p < inE) return (p - inS) / (inE - inS);
  return 1 - (p - outS) / (outE - outS);
};

// ─── types ──────────────────────────────────────────────────────────────────
interface Beat {
  start: number; fadeIn: number; fadeOut: number; end: number;
  align: "left" | "right" | "center";
  tag: string; headline: string; body: string; sub?: string;
  accent: string;
}

const BEATS: Beat[] = [
  {
    start: 0.0, fadeIn: 0.03, fadeOut: 0.10, end: 0.16,
    align: "center",
    tag: "URBAN CANVAS",
    headline: "Design the city\nyou imagine.",
    body: "A challenge platform for architects and visionaries. Place buildings, parks, roads, and landmarks — then let the algorithm judge your city.",
    accent: "#C8A96E",
  },
  {
    start: 0.15, fadeIn: 0.20, fadeOut: 0.32, end: 0.38,
    align: "left",
    tag: "PLACE & PLAN",
    headline: "Every block\na decision.",
    body: "Drag and drop zoning models onto the canvas. Residential towers, green corridors, commercial hubs — every placement shifts your score in real time.",
    sub: "Zoning logic meets creative intuition.",
    accent: "#C8A96E",
  },
  {
    start: 0.38, fadeIn: 0.44, fadeOut: 0.56, end: 0.62,
    align: "right",
    tag: "THE SCORE",
    headline: "Your city,\ngraded.",
    body: "An intelligent scoring engine evaluates density, walkability, green space, and flow. Every layout earns a grade — from D to S tier.",
    sub: "From concept sketch to scored masterplan.",
    accent: "#00D6FF",
  },
  {
    start: 0.62, fadeIn: 0.67, fadeOut: 0.78, end: 0.84,
    align: "left",
    tag: "COMPETE & COMPARE",
    headline: "Beat the\nleaderboard.",
    body: "Submit your design to the global challenge. Architects, students, and urban dreamers compete on the same canvas. Only the best plans rise to the top.",
    sub: "100+ active challenges. New maps every week.",
    accent: "#00D6FF",
  },
  {
    start: 0.84, fadeIn: 0.88, fadeOut: 0.97, end: 1.0,
    align: "center",
    tag: "YOUR BLUEPRINT",
    headline: "Draw it.\nScore it.\nOwn it.",
    body: "Whether you are a seasoned architect or a first-time planner, the canvas is yours. Start building — the city is waiting for your vision.",
    accent: "#C8A96E",
  },
];

// ─── component ──────────────────────────────────────────────────────────────
export default function SacredCityPage() {
  const router = useRouter();
  const containerRef   = useRef<HTMLDivElement>(null);
  const catCanvasRef   = useRef<HTMLCanvasElement>(null);
  const cityCanvasRef  = useRef<HTMLCanvasElement>(null);
  const catWrapRef     = useRef<HTMLDivElement>(null);
  const cityWrapRef    = useRef<HTMLDivElement>(null);
  const overlayRef     = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const navRef         = useRef<HTMLElement>(null);

  const catImages  = useRef<HTMLImageElement[]>([]);
  const cityImages = useRef<HTMLImageElement[]>([]);

  const [loadPct, setLoadPct]       = useState(0);
  const [isLoaded, setIsLoaded]     = useState(false);
  const [fadingOut, setFadingOut]   = useState(false);
  const [navVisible, setNavVisible] = useState(false);

  const targetP  = useRef(0);
  const easedP   = useRef(0);
  const beatRefs = useRef<(HTMLDivElement | null)[]>([]);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const mouse          = useRef({ x: 0, y: 0 });

  // ── mouse tracking ────────────────────────────────────────────────────────
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  // ── preload ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const total = 240;
    let doneC = 0, doneCity = 0;
    const check = () => {
      const pct = Math.round(((doneC + doneCity) / (total * 2)) * 100);
      setLoadPct(pct);
      if (doneC === total && doneCity === total) {
        setFadingOut(true);
        setTimeout(() => setIsLoaded(true), 700);
      }
    };
    for (let i = 1; i <= total; i++) {
      const img = new Image();
      img.src = `/cathedralpng/ezgif-frame-${String(i).padStart(3, "0")}.png`;
      img.onload = () => { catImages.current[i - 1] = img; doneC++; check(); };
      img.onerror = () => { doneC++; check(); };
    }
    for (let i = 1; i <= total; i++) {
      const img = new Image();
      img.src = `/city/ezgif-frame-${String(i).padStart(3, "0")}.jpg`;
      img.onload = () => { cityImages.current[i - 1] = img; doneCity++; check(); };
      img.onerror = () => { doneCity++; check(); };
    }
  }, []);

  // ── scroll ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onScroll = () => {
      const c = containerRef.current;
      if (!c) return;
      const sh = c.scrollHeight - window.innerHeight;
      targetP.current = Math.max(0, Math.min(1, window.scrollY / sh));
      setNavVisible(window.scrollY > 80);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── resize observer — keeps canvas buffer = CSS size × DPR ────────────────
  useEffect(() => {
    if (!isLoaded) return;
    const dpr = window.devicePixelRatio || 1;
    const sync = (cv: HTMLCanvasElement) => {
      const r = cv.getBoundingClientRect();
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    };
    const ro = new ResizeObserver(() => {
      if (catCanvasRef.current)  sync(catCanvasRef.current);
      if (cityCanvasRef.current) sync(cityCanvasRef.current);
    });
    if (catCanvasRef.current)  { sync(catCanvasRef.current);  ro.observe(catCanvasRef.current); }
    if (cityCanvasRef.current) { sync(cityCanvasRef.current); ro.observe(cityCanvasRef.current); }
  }, [isLoaded]);

  // ── Three.js dynamic background ───────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !threeCanvasRef.current) return;

    const canvas = threeCanvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    const scene = new THREE.Scene();

    // Camera setup
    const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    camera.position.set(0, 10, 24);
    camera.lookAt(0, 0, 0);

    // Light setups
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.08);
    scene.add(ambientLight);

    // Gold light (Cathedral Phase)
    const goldLight = new THREE.PointLight(0xC8A96E, 8, 45);
    goldLight.position.set(-12, 6, 8);
    scene.add(goldLight);

    // Cyan light (City Phase)
    const cyanLight = new THREE.PointLight(0x00D6FF, 8, 45);
    cyanLight.position.set(12, -4, 8);
    scene.add(cyanLight);

    // Wavy Blueprint Grid Geometry
    const gridGeometry = new THREE.PlaneGeometry(70, 70, 48, 48);
    const gridMaterial = new THREE.MeshBasicMaterial({
      color: 0x444444,
      wireframe: true,
      transparent: true,
      opacity: 0.1,
    });
    const grid = new THREE.Mesh(gridGeometry, gridMaterial);
    grid.rotation.x = -Math.PI / 2;
    scene.add(grid);

    // Floating Glassmorphic/Wireframe Blocks (Architectural models)
    const blocksGroup = new THREE.Group();
    const blocksCount = 16;
    const blockData: { mesh: THREE.Mesh; initialY: number; speed: number; rotSpeed: { x: number; y: number } }[] = [];

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.06,
      roughness: 0.15,
      metalness: 0.1,
      transmission: 0.75,
      ior: 1.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const edgeMaterialGold = new THREE.LineBasicMaterial({
      color: 0xC8A96E,
      transparent: true,
      opacity: 0.22,
    });

    const edgeMaterialCyan = new THREE.LineBasicMaterial({
      color: 0x00D6FF,
      transparent: true,
      opacity: 0.22,
    });

    for (let i = 0; i < blocksCount; i++) {
      const w = Math.random() * 2 + 1;
      const h = Math.random() * 5 + 2;
      const d = Math.random() * 2 + 1;
      const geometry = new THREE.BoxGeometry(w, h, d);
      
      const mesh = new THREE.Mesh(geometry, glassMaterial);
      
      // Wireframe outline for model architectural edges
      const edges = new THREE.EdgesGeometry(geometry);
      const edgeMat = Math.random() > 0.5 ? edgeMaterialGold : edgeMaterialCyan;
      const line = new THREE.LineSegments(edges, edgeMat);
      mesh.add(line);

      // Distribute randomly across the drafting grid
      const x = (Math.random() - 0.5) * 40;
      const initialY = -h / 2 - 3 - Math.random() * 6; // submerged under grid initially
      const z = (Math.random() - 0.5) * 40;
      mesh.position.set(x, initialY, z);

      blocksGroup.add(mesh);
      blockData.push({
        mesh,
        initialY,
        speed: Math.random() * 0.4 + 0.6,
        rotSpeed: {
          x: (Math.random() - 0.5) * 0.003,
          y: (Math.random() - 0.5) * 0.003,
        }
      });
    }
    scene.add(blocksGroup);

    // Urban Data Particles
    const particlesCount = 250;
    const positions = new Float32Array(particlesCount * 3);
    for (let i = 0; i < particlesCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 60;
      positions[i + 1] = Math.random() * 35 - 10;
      positions[i + 2] = (Math.random() - 0.5) * 60;
    }
    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particlesMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.06,
      transparent: true,
      opacity: 0.2,
    });
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    // Custom resize listener
    const handleResize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    window.addEventListener("resize", handleResize);

    // Frame animation loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      const p = easedP.current;

      // 1. Blueprint Grid waves distortion
      const pos = gridGeometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        // Harmonic waves representing urban acoustic resonance
        const z = Math.sin(x * 0.1 + time * 0.8) * Math.cos(y * 0.1 + time * 0.8) * 0.9;
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;

      // 2. Animate architectural building placements
      blockData.forEach((data) => {
        data.mesh.rotation.y += data.rotSpeed.y;
        data.mesh.rotation.x += data.rotSpeed.x;

        // Rise from the grid as user scrolls deeper into the city canvas
        const targetY = data.initialY + p * 20 * data.speed;
        data.mesh.position.y = lerp(data.mesh.position.y, targetY, 0.04);
      });

      // 3. Update Camera placement with mouse parallax and scroll transition
      const targetCamX = mouse.current.x * 4;
      const targetCamY = 10 - mouse.current.y * 3 + p * 6;
      const targetCamZ = 24 - p * 8; // move closer as city builds

      camera.position.x = lerp(camera.position.x, targetCamX, 0.04);
      camera.position.y = lerp(camera.position.y, targetCamY, 0.04);
      camera.position.z = lerp(camera.position.z, targetCamZ, 0.04);
      camera.lookAt(0, p * 4, 0);

      // 4. Update lights behavior
      goldLight.intensity = (1 - p) * 10 + 1.5;
      cyanLight.intensity = p * 10 + 1.5;

      // 5. Slowly move particles upwards
      const particlePos = particlesGeometry.attributes.position.array as Float32Array;
      for (let i = 1; i < particlesCount * 3; i += 3) {
        particlePos[i] += 0.015;
        if (particlePos[i] > 25) {
          particlePos[i] = -10;
        }
      }
      particlesGeometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);

      // Resource Disposal
      gridGeometry.dispose();
      gridMaterial.dispose();
      glassMaterial.dispose();
      edgeMaterialGold.dispose();
      edgeMaterialCyan.dispose();
      particlesGeometry.dispose();
      particlesMaterial.dispose();

      blockData.forEach((data) => {
        data.mesh.geometry.dispose();
        data.mesh.children.forEach((child) => {
          if (child instanceof THREE.LineSegments) {
            child.geometry.dispose();
          }
        });
      });

      renderer.dispose();
    };
  }, [isLoaded]);

  // ── draw helper (cover mode) ───────────────────────────────────────────────
  const draw = useCallback((cv: HTMLCanvasElement, img: HTMLImageElement | null) => {
    if (!cv || !img) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const cw = cv.width, ch = cv.height;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const cr = cw / ch, ir = iw / ih;
    let dw: number, dh: number, dx: number, dy: number;
    if (cr > ir) { dw = cw; dh = cw / ir; dx = 0; dy = (ch - dh) / 2; }
    else         { dh = ch; dw = ch * ir; dy = 0; dx = (cw - dw) / 2; }
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }, []);

  // ── main RAF loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return;
    let id: number;

    const loop = () => {
      easedP.current = lerp(easedP.current, targetP.current, 0.07);
      const p = easedP.current;

      // ── progress bar
      if (progressBarRef.current)
        progressBarRef.current.style.width = `${p * 100}%`;

      // ── phase split: 0..0.5 = cathedral, 0.5..1.0 = city
      const catPhase  = Math.max(0, Math.min(1, p / 0.5));
      const cityPhase = Math.max(0, Math.min(1, (p - 0.5) / 0.5));

      const catFrame  = Math.max(0, Math.min(239, Math.round(catPhase  * 239)));
      const cityFrame = Math.max(0, Math.min(239, Math.round(cityPhase * 239)));

      const catCv  = catCanvasRef.current;
      const cityCv = cityCanvasRef.current;
      const catW   = catWrapRef.current;
      const cityW  = cityWrapRef.current;

      // ── draw frames
      if (p <= 0.55) draw(catCv!,  catImages.current[catFrame] ?? null);
      if (p >= 0.45) draw(cityCv!, cityImages.current[cityFrame] ?? null);

      // ── ROTATION
      const catRot  = lerp(-1, 12, Math.min(1, p / 0.5));
      const cityRot = lerp(10, 30, Math.max(0, Math.min(1, (p - 0.5) / 0.5)));

      // ── OPACITY + POSITION
      const catOpacity  = p < 0.45 ? 1 : p > 0.58 ? 0 : 1 - (p - 0.45) / 0.13;
      const cityOpacity = p < 0.42 ? 0 : p > 0.55 ? 1 : (p - 0.42) / 0.13;

      const catTop  = lerp(6,  28, Math.min(1, p / 0.5));
      const catLeft = lerp(3,  8,  Math.min(1, p / 0.5));
      const cityBottom = lerp(6, 24, Math.max(0, Math.min(1, (p - 0.5) / 0.5)));
      const cityRight  = lerp(3, 8,  Math.max(0, Math.min(1, (p - 0.5) / 0.5)));

      if (catW) {
        catW.style.transform  = `rotate(${catRot}deg)`;
        catW.style.opacity    = String(catOpacity);
        catW.style.top        = `${catTop}vh`;
        catW.style.left       = `${catLeft}vw`;
      }
      if (cityW) {
        cityW.style.transform  = `rotate(${cityRot}deg)`;
        cityW.style.opacity    = String(cityOpacity);
        cityW.style.bottom     = `${cityBottom}vh`;
        cityW.style.right      = `${cityRight}vw`;
      }

      // ── BEAT TEXT overlays
      beatRefs.current.forEach((el, i) => {
        if (!el) return;
        const b = BEATS[i];
        const op = fadeRange(p, b.start, b.fadeIn, b.fadeOut, b.end);
        const ty = op < 1 && p < b.fadeIn ? lerp(36, 0, (p - b.start) / (b.fadeIn - b.start)) : 0;
        el.style.opacity = String(op);
        el.style.transform = `translateY(${ty}px)`;
      });

      id = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(id);
  }, [isLoaded, draw]);

  // ── nav opacity
  useEffect(() => {
    if (navRef.current) {
      navRef.current.style.opacity    = navVisible ? "1" : "0";
      navRef.current.style.transform  = navVisible ? "translateY(0)" : "translateY(-6px)";
    }
  }, [navVisible]);

  return (
    <div
      ref={containerRef}
      style={{ backgroundColor: "#050505", width: "100%", height: "600vh", position: "relative", fontFamily: "'Cormorant Garamond', Georgia, serif" }}
    >
      {/* ── Google Font import ────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=DM+Mono:wght@300;400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; cursor: default !important; }
        canvas { cursor: default !important; }
        ::selection { background: rgba(200,169,110,0.3); }
        body { overflow-x: hidden; }
        a, button { cursor: pointer !important; }
      `}</style>

      {/* ── LOADER ───────────────────────────────────────────────────────── */}
      {!isLoaded && (
        <div style={{
          position: "fixed", inset: 0, backgroundColor: "#050505", zIndex: 1000,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 20, opacity: fadingOut ? 0 : 1, transition: "opacity 0.7s ease",
          pointerEvents: fadingOut ? "none" : "auto",
        }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div style={{ color: "rgba(200,169,110,0.5)", fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", fontFamily: "'DM Mono', monospace", marginBottom: 12 }}>
              Urban Canvas
            </div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 22, letterSpacing: "0.05em", fontWeight: 300 }}>
              Preparing your canvas
            </div>
          </div>
          {/* thin bar */}
          <div style={{ width: 180, height: 1, background: "rgba(255,255,255,0.08)", position: "relative", overflow: "hidden" }}>
            <div style={{
              position: "absolute", top: 0, left: 0, height: "100%",
              width: `${loadPct}%`, background: "linear-gradient(90deg,#C8A96E,#00D6FF)",
              boxShadow: "0 0 10px #C8A96E", transition: "width 0.3s",
            }} />
          </div>
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: "0.2em" }}>
            {loadPct}%
          </div>
        </div>
      )}

      {/* ── NAVBAR ───────────────────────────────────────────────────────── */}
      <nav
        ref={navRef}
        style={{
          position: "fixed", top: 0, left: 0, right: 0, height: 48, zIndex: 500,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 32px",
          background: "rgba(5,5,5,0.82)", backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          opacity: 0, transform: "translateY(-6px)",
          transition: "opacity 0.5s ease, transform 0.5s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.2em", color: "rgba(255,255,255,0.9)", fontFamily: "'DM Mono', monospace" }}>URBAN</span>
          <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.15)", display: "block" }} />
          <span style={{ fontSize: 10, letterSpacing: "0.15em", color: "rgba(200,169,110,0.7)", fontFamily: "'DM Mono', monospace" }}>CANVAS</span>
        </div>
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          {["Place", "Score", "Compete", "Gallery"].map(t => (
            <a key={t} style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.15em", textDecoration: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace", transition: "color 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.9)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
            >{t.toUpperCase()}</a>
          ))}
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            background: "transparent",
            border: "1px solid rgba(200,169,110,0.35)",
            padding: "8px 20px",
            fontSize: 9,
            letterSpacing: "0.2em",
            color: "rgba(200,169,110,0.85)",
            fontFamily: "'DM Mono', monospace",
            cursor: "pointer !important",
            transition: "all 0.3s ease",
            outline: "none",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(200,169,110,0.12)"; e.currentTarget.style.borderColor = "rgba(200,169,110,0.7)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(200,169,110,0.35)"; }}
        >
          START BUILDING ↗
        </button>
      </nav>

      {/* ── SCROLL PROGRESS BAR ──────────────────────────────────────────── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.05)", zIndex: 400 }}>
        <div ref={progressBarRef} style={{ height: "100%", width: "0%", background: "linear-gradient(90deg,#C8A96E,#00D6FF)", transition: "width 0.05s" }} />
      </div>

      {/* ── STICKY STAGE ─────────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, height: "100vh", width: "100%", overflow: "hidden",
        perspective: "1600px",
      }}>
        {/* Three.js Background WebGL Canvas */}
        <canvas
          ref={threeCanvasRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            zIndex: 1,
            pointerEvents: "none",
          }}
        />

        {/* Ambient radial glow — gold for cathedral phase */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
          background: "radial-gradient(ellipse 60% 50% at 25% 40%, rgba(200,169,110,0.06) 0%, transparent 70%)",
        }} />
        {/* Ambient radial glow — cyan for city phase */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
          background: "radial-gradient(ellipse 60% 50% at 75% 60%, rgba(0,214,255,0.05) 0%, transparent 70%)",
        }} />

        {/* ── CATHEDRAL CANVAS WRAPPER ─────────────────────────────────── */}
        <div
          ref={catWrapRef}
          style={{
            position: "absolute",
            top: "6vh", left: "3vw",
            width: "38vw", height: "52vh",
            willChange: "transform, opacity",
            transformOrigin: "center center",
            transition: "opacity 0.3s ease",
            zIndex: 10,
          }}
        >
          <canvas
            ref={catCanvasRef}
            style={{ display: "block", width: "100%", height: "100%", borderRadius: 2 }}
          />
          {/* subtle gold frame edge */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: 2,
            border: "1px solid rgba(200,169,110,0.15)",
            pointerEvents: "none",
          }} />
        </div>

        {/* ── CITY CANVAS WRAPPER ──────────────────────────────────────── */}
        <div
          ref={cityWrapRef}
          style={{
            position: "absolute",
            bottom: "6vh", right: "3vw",
            width: "38vw", height: "52vh",
            opacity: 0,
            willChange: "transform, opacity",
            transformOrigin: "center center",
            transition: "opacity 0.3s ease",
            zIndex: 10,
          }}
        >
          <canvas
            ref={cityCanvasRef}
            style={{ display: "block", width: "100%", height: "100%", borderRadius: 2 }}
          />
          {/* subtle cyan frame edge */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: 2,
            border: "1px solid rgba(0,214,255,0.12)",
            pointerEvents: "none",
          }} />
        </div>

        {/* ── BEAT TEXT OVERLAYS ───────────────────────────────────────── */}
        {BEATS.map((beat, i) => (
          <div
            key={i}
            ref={el => { beatRefs.current[i] = el; }}
            style={{
              position: "absolute",
              top: "50%", transform: "translateY(0px)",
              ...(beat.align === "left"   ? { left: "48vw", right: "3vw", textAlign: "left"  } : {}),
              ...(beat.align === "right"  ? { right: "48vw", left: "3vw", textAlign: "right" } : {}),
              ...(beat.align === "center" ? { left: "50%",  transform: "translateX(-50%)", textAlign: "center", width: "min(560px, 80vw)" } : {}),
              marginTop: beat.align === "center" ? "-120px" : "-100px",
              opacity: 0,
              pointerEvents: "none",
              zIndex: 200,
              willChange: "opacity, transform",
            }}
          >
            {/* tag line */}
            <div style={{
              fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase",
              color: beat.accent, marginBottom: 14, fontFamily: "'DM Mono', monospace",
              opacity: 0.85,
            }}>
              {beat.tag}
            </div>
            {/* headline */}
            <h2 style={{
              fontSize: "clamp(28px, 4.5vw, 64px)",
              fontWeight: 600,
              lineHeight: 1.05,
              color: "rgba(255,255,255,0.92)",
              marginBottom: 20,
              letterSpacing: "-0.01em",
              whiteSpace: "pre-line",
              fontFamily: "'Cormorant Garamond', Georgia, serif",
            }}>
              {beat.headline}
            </h2>
            {/* body */}
            <p style={{
              fontSize: "clamp(13px, 1.3vw, 17px)",
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.5)",
              maxWidth: 420,
              ...(beat.align === "center" ? { margin: "0 auto" } : {}),
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontWeight: 300,
            }}>
              {beat.body}
            </p>
            {beat.sub && (
              <p style={{
                marginTop: 14,
                fontSize: "clamp(10px, 1vw, 13px)",
                color: beat.accent,
                opacity: 0.6,
                letterSpacing: "0.08em",
                fontFamily: "'DM Mono', monospace",
                fontWeight: 300,
              }}>
                — {beat.sub}
              </p>
            )}
            {/* CTA only on last beat */}
            {i === BEATS.length - 1 && (
              <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
                <button
                  onClick={() => router.push("/dashboard")}
                  style={{
                    padding: "12px 28px",
                    background: "transparent",
                    border: "1px solid rgba(200,169,110,0.6)",
                    color: "rgba(200,169,110,0.9)",
                    fontSize: 10, letterSpacing: "0.2em",
                    fontFamily: "'DM Mono', monospace",
                    cursor: "pointer !important",
                    transition: "all 0.3s",
                    outline: "none",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(200,169,110,0.12)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  START DESIGNING
                </button>
                <button
                  onClick={() => router.push("/dashboard")}
                  style={{
                    padding: "12px 28px",
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.4)",
                    fontSize: 10, letterSpacing: "0.2em",
                    fontFamily: "'DM Mono', monospace",
                    cursor: "pointer !important",
                    transition: "all 0.3s",
                    outline: "none",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
                >
                  VIEW LEADERBOARD
                </button>
              </div>
            )}
          </div>
        ))}

        {/* ── DIVIDER LINE (cathedral → city) ──────────────────────────── */}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: 1, height: "40vh",
          background: "linear-gradient(to bottom, transparent, rgba(200,169,110,0.3), rgba(0,214,255,0.3), transparent)",
          pointerEvents: "none", zIndex: 10,
        }} />

        {/* ── SCROLL HINT (visible at start) ───────────────────────────── */}
        <div style={{
          position: "absolute", bottom: "5vh", left: "50%",
          transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          zIndex: 200, pointerEvents: "none",
        }}>
          <span style={{ fontSize: 8, letterSpacing: "0.25em", color: "rgba(255,255,255,0.2)", fontFamily: "'DM Mono', monospace" }}>SCROLL</span>
          <div style={{
            width: 1, height: 32,
            background: "linear-gradient(to bottom, rgba(200,169,110,0.5), transparent)",
            animation: "scrollPulse 1.8s ease-in-out infinite",
          }} />
        </div>

        <style>{`
          @keyframes scrollPulse {
            0%,100% { opacity: 0.3; transform: scaleY(1); }
            50% { opacity: 1; transform: scaleY(1.2); }
          }
        `}</style>
      </div>
    </div>
  );
}