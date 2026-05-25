"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   PLAN.VISION — Landing
   Concept: An architect's working drawing comes alive. Blueprint paper,
   stamps, margin notes, a live "detection viewport", and a real sense
   that a human laid this out. No generic SaaS gradients.
   ────────────────────────────────────────────────────────────────────── */

type Block = {
  id: string;
  x: number;        // % of viewport
  y: number;        // % of viewport
  w: number;        // px
  h: number;        // px
  label: string;
  code: string;
  color: string;
  conf: number;     // 0..1
};

const SEED_BLOCKS: Block[] = [
  { id: "B-01", x: 18, y: 32, w: 78, h: 78, label: "Residential", code: "RES",  color: "#22c55e", conf: 0.96 },
  { id: "B-02", x: 41, y: 26, w: 62, h: 62, label: "Reservoir",   code: "UTL",  color: "#38bdf8", conf: 0.91 },
  { id: "B-03", x: 63, y: 38, w: 90, h: 70, label: "Warehouse",   code: "IND",  color: "#f59e0b", conf: 0.88 },
  { id: "B-04", x: 28, y: 64, w: 56, h: 56, label: "Residential", code: "RES",  color: "#22c55e", conf: 0.94 },
  { id: "B-05", x: 55, y: 70, w: 70, h: 70, label: "Factory",     code: "IND",  color: "#ef4444", conf: 0.83 },
  { id: "B-06", x: 78, y: 58, w: 50, h: 50, label: "Road",        color: "#a3a3a3", code: "INF", conf: 0.79 },
];

export default function Home() {
  const [time, setTime] = useState("");
  const [scanLine, setScanLine] = useState(0);
  const [activeBlock, setActiveBlock] = useState<string>("B-03");
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [score, setScore] = useState({ zoning: 72, coverage: 88, connect: 64, density: 81 });
  const heroRef = useRef<HTMLDivElement | null>(null);

  // Live clock (gives the page real "session" feel)
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = d.getHours().toString().padStart(2, "0");
      const mm = d.getMinutes().toString().padStart(2, "0");
      const ss = d.getSeconds().toString().padStart(2, "0");
      setTime(`${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Scanning beam across the detection viewport
  useEffect(() => {
    let raf = 0;
    let t = 0;
    const loop = () => {
      t += 0.6;
      setScanLine((Math.sin(t * 0.03) * 0.5 + 0.5) * 100);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Rotate "active detection" so the page never feels static
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % SEED_BLOCKS.length;
      setActiveBlock(SEED_BLOCKS[i].id);
      // wiggle scores a little to feel alive
      setScore((s) => ({
        zoning: clamp(s.zoning + rand(-3, 3), 50, 95),
        coverage: clamp(s.coverage + rand(-2, 2), 60, 98),
        connect: clamp(s.connect + rand(-4, 4), 40, 90),
        density: clamp(s.density + rand(-3, 3), 55, 95),
      }));
    }, 2200);
    return () => clearInterval(id);
  }, []);

  // Track mouse for the survey crosshair
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = heroRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({
        x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10,
        y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10,
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Reveal-on-scroll for sections (subtle, not the same canned thing)
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("is-in");
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll<HTMLElement>("[data-rise]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const composite = Math.round((score.zoning + score.coverage + score.connect + score.density) / 4);

  return (
    <div className="pv-root">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

        :root {
          --paper: #ecead8;          /* warm blueprint paper */
          --paper-2: #e3e0c8;
          --ink: #0e1726;             /* deep ink */
          --ink-soft: #2a3346;
          --rule: #6b7280;
          --rule-soft: rgba(14, 23, 38, 0.16);
          --rule-hair: rgba(14, 23, 38, 0.08);
          --accent: #ff5722;          /* surveyor's orange */
          --accent-2: #1e6feb;        /* drafting blue */
          --good: #1f7a3a;
          --warn: #b45309;
          --bad:  #b91c1c;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { background: var(--paper); color: var(--ink); }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          font-feature-settings: "ss01", "cv11";
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
          background-image:
            radial-gradient(rgba(14,23,38,0.045) 1px, transparent 1px),
            radial-gradient(rgba(14,23,38,0.025) 1px, transparent 1px);
          background-size: 24px 24px, 24px 24px;
          background-position: 0 0, 12px 12px;
        }

        ::selection { background: var(--ink); color: var(--paper); }

        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .serif { font-family: 'Instrument Serif', 'Times New Roman', serif; font-style: italic; }

        /* ── Top marquee tape ── */
        .tape {
          background: var(--ink);
          color: var(--paper);
          border-bottom: 1px solid #000;
          overflow: hidden;
          position: relative;
        }
        .tape-track {
          display: flex;
          gap: 3rem;
          padding: 0.55rem 0;
          white-space: nowrap;
          animation: slide 38s linear infinite;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .tape-track span { opacity: 0.85; }
        .tape-track b { color: var(--accent); font-weight: 700; }
        @keyframes slide {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }

        /* ── Nav ── */
        .nav {
          position: sticky;
          top: 0;
          z-index: 50;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          padding: 1rem 2rem;
          background: rgba(236, 234, 216, 0.85);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid var(--rule-soft);
        }
        .nav-logo {
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-size: 1.6rem;
          letter-spacing: -0.01em;
          color: var(--ink);
          text-decoration: none;
          display: inline-flex;
          align-items: baseline;
          gap: 0.35rem;
        }
        .nav-logo .stamp {
          font-family: 'JetBrains Mono', monospace;
          font-style: normal;
          font-size: 0.6rem;
          letter-spacing: 0.18em;
          background: var(--accent);
          color: #fff;
          padding: 2px 6px;
          border-radius: 2px;
          transform: translateY(-6px);
        }
        .nav-mid {
          display: flex;
          gap: 2rem;
          justify-content: center;
        }
        .nav-mid a {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--ink-soft);
          text-decoration: none;
          position: relative;
          padding: 4px 2px;
        }
        .nav-mid a::after {
          content: '';
          position: absolute; left: 0; bottom: -2px;
          width: 0; height: 1px; background: var(--ink);
          transition: width 0.25s ease;
        }
        .nav-mid a:hover { color: var(--ink); }
        .nav-mid a:hover::after { width: 100%; }
        .nav-right {
          justify-self: end;
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .nav-clock {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          color: var(--ink-soft);
          letter-spacing: 0.1em;
        }
        .nav-clock .dot {
          display: inline-block;
          width: 6px; height: 6px;
          background: var(--accent);
          border-radius: 50%;
          margin-right: 8px;
          animation: pulse 1.6s ease-in-out infinite;
          vertical-align: middle;
        }
        @keyframes pulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.75); }
        }

        .btn {
          display: inline-flex; align-items: center; gap: 0.6rem;
          padding: 0.7rem 1.2rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.74rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          text-decoration: none;
          border-radius: 0;
          cursor: pointer;
          transition: transform 0.15s ease, background 0.2s, color 0.2s;
          border: 1px solid var(--ink);
        }
        .btn-ink   { background: var(--ink); color: var(--paper); }
        .btn-ink:hover { background: var(--accent); border-color: var(--accent); }
        .btn-ghost { background: transparent; color: var(--ink); }
        .btn-ghost:hover { background: var(--ink); color: var(--paper); }
        .btn .arrow { transition: transform 0.2s; }
        .btn:hover .arrow { transform: translateX(3px); }

        /* ── Hero grid ── */
        .hero {
          position: relative;
          padding: 2.5rem 2rem 1rem;
          min-height: 92vh;
          display: grid;
          grid-template-columns: 1.05fr 1fr;
          gap: 2rem;
          align-items: stretch;
          border-bottom: 1px solid var(--rule-soft);
        }

        /* Margin tick rulers on the page */
        .hero::before, .hero::after {
          content: '';
          position: absolute;
          top: 0; bottom: 0;
          width: 14px;
          background-image: repeating-linear-gradient(
            to bottom,
            var(--rule-soft) 0 1px,
            transparent 1px 12px
          );
        }
        .hero::before { left: 0; }
        .hero::after  { right: 0; }

        .hero-left {
          position: relative;
          padding: 1rem 0.5rem 0 1rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .doc-meta {
          display: flex;
          gap: 2.5rem;
          margin-bottom: 2.25rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }
        .doc-meta div b {
          display: block;
          color: var(--ink);
          font-weight: 700;
          margin-top: 2px;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--ink-soft);
          margin-bottom: 1.5rem;
        }
        .eyebrow::before {
          content: '';
          width: 28px; height: 1px; background: var(--ink);
        }

        .h1 {
          font-family: 'Inter', sans-serif;
          font-weight: 800;
          font-size: clamp(2.6rem, 6.2vw, 5.4rem);
          line-height: 0.95;
          letter-spacing: -0.045em;
          color: var(--ink);
          margin-bottom: 1.25rem;
        }
        .h1 .serif {
          font-weight: 400;
          color: var(--accent);
        }
        .h1 .underline {
          position: relative;
          display: inline-block;
        }
        .h1 .underline::after {
          content: '';
          position: absolute;
          left: -2px; right: -2px; bottom: 4px;
          height: 12px;
          background: var(--accent);
          opacity: 0.22;
          z-index: -1;
          transform: skewX(-12deg);
        }

        .lede {
          font-size: 1.05rem;
          line-height: 1.65;
          color: var(--ink-soft);
          max-width: 540px;
          margin-bottom: 2rem;
        }
        .lede b { color: var(--ink); font-weight: 600; }

        .hero-cta {
          display: flex; gap: 0.75rem; flex-wrap: wrap;
          margin-bottom: 2.5rem;
        }

        .key-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
          border-top: 1px solid var(--ink);
          padding-top: 1rem;
          max-width: 600px;
        }
        .key-stats > div {
          padding-right: 1rem;
          border-right: 1px solid var(--rule-soft);
        }
        .key-stats > div:last-child { border-right: none; }
        .key-stats .num {
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-size: 2rem;
          line-height: 1;
          color: var(--ink);
        }
        .key-stats .lbl {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--ink-soft);
          margin-top: 6px;
        }

        /* Margin note (handwritten feel) */
        .margin-note {
          position: absolute;
          right: 14%;
          top: 8%;
          max-width: 200px;
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-size: 1.05rem;
          line-height: 1.35;
          color: var(--accent);
          transform: rotate(-4deg);
          padding-left: 16px;
        }
        .margin-note::before {
          content: '';
          position: absolute;
          left: 0; top: 8px; bottom: 8px;
          width: 2px;
          background: var(--accent);
        }

        /* ── Detection viewport (right side) ── */
        .viewport-wrap {
          position: relative;
          padding: 0.6rem 0.6rem 0;
        }
        .viewport {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 520px;
          background: #0e1726;
          border: 1px solid var(--ink);
          box-shadow: 8px 8px 0 0 var(--ink);
          overflow: hidden;
          color: #d7e3f3;
        }
        .viewport-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 80px 80px, 80px 80px, 16px 16px, 16px 16px;
        }
        .viewport-noise {
          position: absolute; inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
          background-size: 3px 3px;
          mix-blend-mode: overlay;
          opacity: 0.5;
          pointer-events: none;
        }
        .viewport-scan {
          position: absolute; left: 0; right: 0;
          height: 80px;
          background: linear-gradient(to bottom,
            transparent,
            rgba(56,189,248,0.18),
            transparent);
          pointer-events: none;
        }
        .viewport-corner {
          position: absolute;
          width: 18px; height: 18px;
          border: 2px solid var(--accent);
        }
        .vc-tl { top: 10px; left: 10px;     border-right: none; border-bottom: none; }
        .vc-tr { top: 10px; right: 10px;    border-left: none;  border-bottom: none; }
        .vc-bl { bottom: 10px; left: 10px;  border-right: none; border-top: none; }
        .vc-br { bottom: 10px; right: 10px; border-left: none;  border-top: none; }

        .viewport-bar {
          position: absolute;
          top: 0; left: 0; right: 0;
          display: flex;
          justify-content: space-between;
          padding: 10px 16px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(215,227,243,0.65);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.25);
          z-index: 5;
        }
        .viewport-bar .rec {
          color: var(--accent);
          display: inline-flex; align-items: center; gap: 6px;
        }
        .viewport-bar .rec::before {
          content: ''; width: 7px; height: 7px;
          background: var(--accent); border-radius: 50%;
          animation: pulse 1.4s ease-in-out infinite;
        }

        .det {
          position: absolute;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        .det-box {
          width: 100%; height: 100%;
          border: 1.5px solid var(--accent-color, var(--accent));
          background: color-mix(in srgb, var(--accent-color, var(--accent)) 14%, transparent);
          position: relative;
        }
        .det.is-active .det-box {
          border-width: 2px;
          box-shadow: 0 0 0 2px rgba(0,0,0,0.25), 0 0 22px var(--accent-color, var(--accent));
        }
        .det-tag {
          position: absolute;
          top: -22px; left: -1px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.1em;
          background: var(--accent-color, var(--accent));
          color: #0b1320;
          padding: 2px 6px;
          font-weight: 700;
          white-space: nowrap;
        }
        .det-id {
          position: absolute;
          bottom: -16px; right: 0;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.58rem;
          color: rgba(255,255,255,0.55);
          letter-spacing: 0.1em;
        }

        /* Crosshair */
        .xhair { position: absolute; pointer-events: none; z-index: 6; }
        .xhair::before, .xhair::after {
          content: '';
          position: absolute;
          background: rgba(255,87,34,0.45);
        }
        .xhair::before { left: -10px; right: -10px; top: 50%; height: 1px; }
        .xhair::after  { top: -10px; bottom: -10px; left: 50%; width: 1px; }

        .viewport-footer {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          padding: 10px 16px;
          background: rgba(0,0,0,0.35);
          border-top: 1px solid rgba(255,255,255,0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          color: rgba(215,227,243,0.7);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          z-index: 5;
        }
        .viewport-footer .ok { color: #4ade80; }
        .viewport-footer .warn { color: #fbbf24; }

        /* Score readout floating card */
        .readout {
          position: absolute;
          left: -28px;
          bottom: -28px;
          background: var(--paper);
          border: 1px solid var(--ink);
          box-shadow: 6px 6px 0 0 var(--accent);
          padding: 1.1rem 1.25rem;
          width: 280px;
          z-index: 5;
        }
        .readout h4 {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-soft);
          margin-bottom: 0.75rem;
          display: flex;
          justify-content: space-between;
        }
        .readout h4 .grade {
          color: var(--accent);
          font-weight: 700;
        }
        .readout-row {
          display: grid;
          grid-template-columns: 70px 1fr 36px;
          gap: 8px;
          align-items: center;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          margin: 6px 0;
          color: var(--ink-soft);
        }
        .readout-row .bar {
          height: 6px;
          background: var(--rule-soft);
          position: relative;
          overflow: hidden;
        }
        .readout-row .bar > span {
          position: absolute; left: 0; top: 0; bottom: 0;
          background: var(--ink);
          transition: width 0.6s cubic-bezier(0.4,0,0.2,1);
        }
        .readout-row .val { color: var(--ink); font-weight: 700; text-align: right; }
        .readout-total {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px dashed var(--rule-soft);
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }
        .readout-total .num {
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-size: 2.6rem;
          line-height: 1;
          color: var(--ink);
        }
        .readout-total .lbl {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }

        /* ── Section common ── */
        section { position: relative; }
        .container {
          max-width: 1240px;
          margin: 0 auto;
          padding: 6rem 2rem;
        }
        .container.tight { padding: 4rem 2rem; }

        .section-head {
          display: grid;
          grid-template-columns: 1fr 1.4fr;
          gap: 3rem;
          margin-bottom: 4rem;
          align-items: end;
        }
        .sec-num {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          letter-spacing: 0.2em;
          color: var(--accent);
          text-transform: uppercase;
        }
        .sec-h {
          font-family: 'Inter', sans-serif;
          font-weight: 800;
          font-size: clamp(2rem, 4vw, 3.2rem);
          line-height: 1;
          letter-spacing: -0.035em;
          margin-top: 1rem;
        }
        .sec-h .serif {
          color: var(--accent);
        }
        .sec-lede {
          font-size: 1.02rem;
          line-height: 1.7;
          color: var(--ink-soft);
          padding-bottom: 0.3rem;
        }

        /* ── Steps (numbered, big serif numerals) ── */
        .steps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0;
          border-top: 2px solid var(--ink);
          border-bottom: 2px solid var(--ink);
        }
        .step {
          padding: 2.5rem 2rem;
          border-right: 1px solid var(--rule-soft);
          position: relative;
          background: var(--paper);
          transition: background 0.25s ease;
        }
        .step:last-child { border-right: none; }
        .step:hover { background: var(--paper-2); }
        .step-num {
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-size: 4.4rem;
          line-height: 1;
          color: var(--accent);
          margin-bottom: 1.5rem;
          letter-spacing: -0.04em;
        }
        .step-h {
          font-size: 1.4rem;
          font-weight: 700;
          letter-spacing: -0.015em;
          margin-bottom: 0.75rem;
        }
        .step-p {
          color: var(--ink-soft);
          line-height: 1.7;
          font-size: 0.96rem;
        }
        .step-tag {
          position: absolute;
          top: 1rem; right: 1rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.16em;
          color: var(--ink-soft);
          text-transform: uppercase;
        }

        /* ── Capability cards — asymmetric magazine layout ── */
        .caps {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 1rem;
        }
        .cap {
          border: 1px solid var(--ink);
          padding: 2rem 1.75rem;
          background: var(--paper);
          position: relative;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .cap:hover {
          transform: translate(-2px, -4px);
          box-shadow: 6px 8px 0 0 var(--ink);
        }
        .cap-1 { grid-column: span 7; }
        .cap-2 { grid-column: span 5; background: var(--ink); color: var(--paper); }
        .cap-3 { grid-column: span 5; }
        .cap-4 { grid-column: span 7; }

        .cap-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
        }
        .cap-id {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }
        .cap-2 .cap-id { color: rgba(236,234,216,0.55); }
        .cap-badge {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.58rem;
          letter-spacing: 0.18em;
          padding: 3px 8px;
          border: 1px solid var(--ink);
          text-transform: uppercase;
        }
        .cap-2 .cap-badge { border-color: var(--paper); }
        .cap-h {
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-size: 2.25rem;
          line-height: 1;
          letter-spacing: -0.02em;
          margin-bottom: 1rem;
        }
        .cap-p {
          line-height: 1.7;
          color: var(--ink-soft);
          font-size: 0.98rem;
          max-width: 52ch;
        }
        .cap-2 .cap-p { color: rgba(236,234,216,0.75); }
        .cap-vis {
          margin-top: 1.5rem;
          padding-top: 1.25rem;
          border-top: 1px dashed var(--rule-soft);
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          letter-spacing: 0.1em;
          color: var(--ink);
          display: flex;
          gap: 1.2rem;
          flex-wrap: wrap;
        }
        .cap-2 .cap-vis { border-top-color: rgba(236,234,216,0.25); color: var(--paper); }
        .cap-vis .ok::before { content: '◉ '; color: var(--good); }
        .cap-vis .x::before { content: '✕ '; color: var(--bad); }

        /* Mini vis: scoring ring */
        .ring {
          --p: 78;
          width: 110px; height: 110px;
          border-radius: 50%;
          background:
            conic-gradient(var(--accent) calc(var(--p) * 1%), rgba(255,255,255,0.08) 0);
          display: grid; place-items: center;
          margin-top: 1rem;
        }
        .ring > div {
          width: 84px; height: 84px;
          background: var(--ink);
          border-radius: 50%;
          display: grid; place-items: center;
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-size: 1.8rem;
          color: var(--paper);
        }

        /* ── Spec / Workflow Strip ── */
        .strip {
          background: var(--ink);
          color: var(--paper);
          padding: 4rem 2rem;
        }
        .strip-inner {
          max-width: 1240px; margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3rem;
          align-items: center;
        }
        .strip .sec-num { color: var(--accent); }
        .strip h3 {
          font-family: 'Inter', sans-serif;
          font-weight: 800;
          font-size: clamp(2rem, 3.8vw, 3rem);
          line-height: 1;
          letter-spacing: -0.035em;
          margin-top: 0.75rem;
          margin-bottom: 1.5rem;
        }
        .strip h3 .serif { color: var(--accent); }
        .strip p {
          line-height: 1.7;
          color: rgba(236,234,216,0.75);
          font-size: 1rem;
          max-width: 48ch;
        }
        .keycaps {
          display: flex; gap: 0.75rem; align-items: center;
          margin-top: 1.5rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.78rem;
          color: rgba(236,234,216,0.7);
        }
        .kbd {
          display: inline-grid; place-items: center;
          min-width: 32px; height: 32px;
          padding: 0 8px;
          background: #1a2336;
          border: 1px solid rgba(236,234,216,0.18);
          border-bottom-width: 3px;
          font-weight: 700;
          color: var(--paper);
          border-radius: 4px;
        }

        /* Side-by-side compare visual */
        .compare {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(236,234,216,0.18);
          padding: 1.25rem;
        }
        .compare-row {
          display: grid;
          grid-template-columns: 80px 1fr 50px 1fr 50px;
          gap: 10px;
          align-items: center;
          padding: 10px 0;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          color: rgba(236,234,216,0.75);
          border-bottom: 1px dashed rgba(236,234,216,0.12);
        }
        .compare-row:last-child { border-bottom: none; }
        .compare-row .label { text-transform: uppercase; letter-spacing: 0.14em; }
        .compare-row .bar {
          height: 6px;
          background: rgba(236,234,216,0.1);
          position: relative;
          overflow: hidden;
        }
        .compare-row .bar > span {
          position: absolute; left: 0; top: 0; bottom: 0;
          background: var(--paper);
        }
        .compare-row .bar.alt > span { background: var(--accent); }
        .compare-row .v { color: var(--paper); font-weight: 700; text-align: right; }
        .compare-head {
          display: grid;
          grid-template-columns: 80px 1fr 50px 1fr 50px;
          gap: 10px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(236,234,216,0.5);
          margin-bottom: 8px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(236,234,216,0.18);
        }

        /* ── Stack section ── */
        .stack {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3rem;
          align-items: center;
        }
        .stack-list {
          border-top: 1px solid var(--ink);
        }
        .stack-row {
          display: grid;
          grid-template-columns: 40px 1fr auto auto;
          gap: 1.5rem;
          align-items: center;
          padding: 1.1rem 0;
          border-bottom: 1px solid var(--rule-soft);
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85rem;
          cursor: default;
          transition: background 0.2s, padding 0.2s;
        }
        .stack-row:hover {
          background: var(--paper-2);
          padding-left: 12px;
          padding-right: 12px;
        }
        .stack-row .idx {
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-size: 1.2rem;
          color: var(--accent);
        }
        .stack-row .name {
          font-weight: 700;
          color: var(--ink);
          letter-spacing: 0;
          font-family: 'Inter', sans-serif;
          font-size: 1.1rem;
        }
        .stack-row .role {
          color: var(--ink-soft);
          font-size: 0.7rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .stack-row .ver {
          color: var(--ink);
          font-size: 0.72rem;
        }

        /* ── CTA Block ── */
        .cta {
          padding: 6rem 2rem;
          border-top: 2px solid var(--ink);
          border-bottom: 2px solid var(--ink);
          position: relative;
          overflow: hidden;
        }
        .cta::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            repeating-linear-gradient(45deg, transparent 0 14px, rgba(14,23,38,0.04) 14px 16px);
          pointer-events: none;
        }
        .cta-inner {
          max-width: 1240px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 2rem;
          align-items: end;
          position: relative;
        }
        .cta h2 {
          font-family: 'Inter', sans-serif;
          font-weight: 800;
          font-size: clamp(2.4rem, 6vw, 5rem);
          line-height: 0.95;
          letter-spacing: -0.04em;
        }
        .cta h2 .serif { color: var(--accent); }
        .cta p {
          color: var(--ink-soft);
          line-height: 1.7;
          margin-bottom: 1.5rem;
          font-size: 1rem;
        }

        /* ── Footer ── */
        .foot {
          padding: 3rem 2rem 2rem;
          background: var(--paper);
        }
        .foot-inner {
          max-width: 1240px; margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 2rem;
          align-items: center;
        }
        .foot .left { font-family: 'Instrument Serif', serif; font-style: italic; font-size: 1.2rem; }
        .foot .mid {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.66rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-soft);
          text-align: center;
        }
        .foot .right {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.66rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-soft);
          text-align: right;
        }
        .foot .rule {
          max-width: 1240px; margin: 0 auto 1.25rem;
          height: 1px; background: var(--ink);
        }

        /* ── Reveal ── */
        [data-rise] {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.7s ease, transform 0.7s cubic-bezier(0.2,0.7,0.2,1);
        }
        [data-rise].is-in {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── Responsive ── */
        @media (max-width: 1024px) {
          .hero { grid-template-columns: 1fr; }
          .margin-note { display: none; }
          .readout { left: 8px; right: 8px; width: auto; bottom: -20px; }
          .section-head { grid-template-columns: 1fr; gap: 1rem; }
          .steps { grid-template-columns: 1fr; }
          .step { border-right: none; border-bottom: 1px solid var(--rule-soft); }
          .cap-1, .cap-2, .cap-3, .cap-4 { grid-column: span 12; }
          .strip-inner { grid-template-columns: 1fr; }
          .stack { grid-template-columns: 1fr; }
          .cta-inner { grid-template-columns: 1fr; }
          .foot-inner { grid-template-columns: 1fr; text-align: center; }
          .foot .right, .foot .mid { text-align: center; }
        }
        @media (max-width: 640px) {
          .nav { grid-template-columns: 1fr auto; }
          .nav-mid { display: none; }
          .doc-meta { gap: 1.2rem; flex-wrap: wrap; }
          .key-stats { grid-template-columns: repeat(2, 1fr); }
          .key-stats > div { padding: 0.5rem 1rem 0.5rem 0; border-bottom: 1px solid var(--rule-soft); }
        }
      `}</style>

      {/* ── Ticker Tape ── */}
      <div className="tape" aria-hidden>
        <div className="tape-track">
          <span><b>● LIVE</b> &nbsp; YOLO-V8 DETECTION ACTIVE &nbsp; / &nbsp; 6 OBJECTS TRACKED</span>
          <span>FRAMERATE 28 FPS</span>
          <span>ZONING COMPLIANCE — 2 VIOLATIONS</span>
          <span><b>►</b> SNAPSHOT_LOTHAL_03.JSON SAVED</span>
          <span>DRAFTED IN AHMEDABAD — IIT GN</span>
          <span>BUILD 0.4.1 — STABLE</span>
          <span><b>● LIVE</b> &nbsp; YOLO-V8 DETECTION ACTIVE &nbsp; / &nbsp; 6 OBJECTS TRACKED</span>
          <span>FRAMERATE 28 FPS</span>
          <span>ZONING COMPLIANCE — 2 VIOLATIONS</span>
          <span><b>►</b> SNAPSHOT_LOTHAL_03.JSON SAVED</span>
          <span>DRAFTED IN AHMEDABAD — IIT GN</span>
          <span>BUILD 0.4.1 — STABLE</span>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="nav">
        <Link href="/" className="nav-logo">
          plan.vision <span className="stamp">REV-04</span>
        </Link>
        <div className="nav-mid">
          <a href="#process">01 / Process</a>
          <a href="#evaluation">02 / Evaluation</a>
          <a href="#workflow">03 / Workflow</a>
          <a href="#stack">04 / Stack</a>
        </div>
        <div className="nav-right">
          <span className="nav-clock"><span className="dot" />SESSION {time}</span>
          <Link href="/dashboard" className="btn btn-ink">
            Launch <span className="arrow">→</span>
          </Link>
        </div>
      </nav>

      {/* ─────────────────── HERO ─────────────────── */}
      <section className="hero" ref={heroRef}>
        <div className="hero-left">
          <div className="doc-meta">
            <div>Sheet <b>A-01 / 06</b></div>
            <div>Drawn by <b>Computer Vision</b></div>
            <div>Scale <b>1 : LIVE</b></div>
            <div>Date <b>{new Date().getFullYear()}</b></div>
          </div>

          <div className="eyebrow">CV-Based Spatial Planning · Evaluator</div>

          <h1 className="h1">
            Stop drawing cities.<br />
            <span className="serif">Start </span>
            <span className="underline">building</span> them<br />
            with your hands.
          </h1>

          <p className="lede">
            Place physical blocks on any flat surface. A webcam watches.
            Within milliseconds, <b>plan.vision</b> identifies each building
            by colour and form, draws the zoning graph, runs traffic flow,
            measures utility coverage, and tells you — with a number —
            whether your town actually works.
          </p>

          <div className="hero-cta">
            <Link href="/dashboard" className="btn btn-ink">
              Launch Dashboard <span className="arrow">→</span>
            </Link>
            <a href="#process" className="btn btn-ghost">
              Read the spec
            </a>
          </div>

          <div className="key-stats">
            <div>
              <div className="num">6</div>
              <div className="lbl">Block<br/>classes</div>
            </div>
            <div>
              <div className="num">28<span style={{fontSize:'0.9rem'}}>fps</span></div>
              <div className="lbl">Live<br/>detection</div>
            </div>
            <div>
              <div className="num">4</div>
              <div className="lbl">Scoring<br/>axes</div>
            </div>
            <div>
              <div className="num">{composite}</div>
              <div className="lbl">Current<br/>composite</div>
            </div>
          </div>

          <div className="margin-note">
            “The room is the canvas.
            The camera is the pencil.” <br />
            <span style={{ opacity: 0.7, fontSize: "0.85rem" }}>— field note, sheet 02</span>
          </div>
        </div>

        {/* RIGHT: Live detection viewport */}
        <div className="viewport-wrap" data-rise>
          <div className="viewport">
            <div className="viewport-grid" />
            <div className="viewport-noise" />
            <div
              className="viewport-scan"
              style={{ top: `${scanLine}%`, transform: "translateY(-50%)" }}
            />
            <div className="vc-tl viewport-corner" />
            <div className="vc-tr viewport-corner" />
            <div className="vc-bl viewport-corner" />
            <div className="vc-br viewport-corner" />

            <div className="viewport-bar">
              <span className="rec">REC · CAM_01</span>
              <span>1920 × 1080 · YOLOv8s</span>
              <span>{time}</span>
            </div>

            {/* Detected objects */}
            {SEED_BLOCKS.map((b) => (
              <div
                key={b.id}
                className={`det ${activeBlock === b.id ? "is-active" : ""}`}
                style={
                  {
                    left: `${b.x}%`,
                    top: `${b.y}%`,
                    width: `${b.w}px`,
                    height: `${b.h}px`,
                    ["--accent-color" as any]: b.color,
                  } as React.CSSProperties
                }
              >
                <div className="det-box" />
                <div className="det-tag">
                  {b.code} · {b.label} · {(b.conf * 100).toFixed(0)}%
                </div>
                <div className="det-id">{b.id}</div>
              </div>
            ))}

            {/* Live coords */}
            <div className="viewport-footer">
              <span>X {coords.x.toFixed(1)} · Y {coords.y.toFixed(1)}</span>
              <span><span className="ok">●</span> 6 objects</span>
              <span><span className="warn">▲</span> 2 violations</span>
            </div>
          </div>

          {/* Score readout */}
          <div className="readout" data-rise>
            <h4>
              <span>Live Evaluation</span>
              <span className="grade">{gradeLetter(composite)}</span>
            </h4>
            <ReadoutRow label="Zoning"   v={score.zoning} />
            <ReadoutRow label="Coverage" v={score.coverage} />
            <ReadoutRow label="Connect."   v={score.connect} />
            <ReadoutRow label="Density"  v={score.density} />
            <div className="readout-total">
              <span className="lbl">Composite</span>
              <span className="num">{composite}<span style={{fontSize:'0.9rem'}}>/100</span></span>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── PROCESS / 01 ─────────────────── */}
      <section id="process">
        <div className="container">
          <div className="section-head">
            <div data-rise>
              <div className="sec-num">§ 01 — The process</div>
              <h2 className="sec-h">
                Three<br/>
                <span className="serif">moves.</span>
              </h2>
            </div>
            <p className="sec-lede" data-rise>
              No CAD seat. No mouse drag. The whole workflow is short enough
              to fit on a single sheet — because that&apos;s the point. Build
              with your hands, evaluate with the machine, iterate in seconds.
            </p>
          </div>

          <div className="steps">
            <div className="step" data-rise>
              <div className="step-tag">↳ Physical</div>
              <div className="step-num">i.</div>
              <h3 className="step-h">Lay out the blocks</h3>
              <p className="step-p">
                Coloured cubes and tagged cards on a table. Green is residential,
                blue is utility, orange is warehouse, red is industry, grey is road.
                Rearrange as freely as a chessboard.
              </p>
            </div>
            <div className="step" data-rise>
              <div className="step-tag">↳ Vision</div>
              <div className="step-num">ii.</div>
              <h3 className="step-h">Let the camera see</h3>
              <p className="step-p">
                A custom YOLOv8 model — trained on your block set — locks onto
                every object in the frame. Position, class, confidence and a
                stable ID land in the dashboard at 28 fps.
              </p>
            </div>
            <div className="step" data-rise>
              <div className="step-tag">↳ Verdict</div>
              <div className="step-num">iii.</div>
              <h3 className="step-h">Read the score</h3>
              <p className="step-p">
                The engine runs four planning checks against the live frame and
                returns a composite grade. Slide a block one inch — the grade
                changes before your hand is back on the table.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── EVALUATION / 02 ─────────────────── */}
      <section id="evaluation">
        <div className="container">
          <div className="section-head">
            <div data-rise>
              <div className="sec-num">§ 02 — What it actually checks</div>
              <h2 className="sec-h">
                Four <span className="serif">axes</span>,<br/>
                one verdict.
              </h2>
            </div>
            <p className="sec-lede" data-rise>
              Every layout is graded on four independent dimensions —
              the same ones a town planner argues about over coffee, except
              now the argument settles in under a second.
            </p>
          </div>

          <div className="caps">
            {/* Card 1 — Zoning (wide) */}
            <div className="cap cap-1" data-rise>
              <div className="cap-head">
                <span className="cap-id">AXIS · 01 / ZC</span>
                <span className="cap-badge">Hard rule</span>
              </div>
              <h3 className="cap-h">Zoning compliance.</h3>
              <p className="cap-p">
                A warehouse one metre from a house is not a town — it&apos;s a
                lawsuit. The compatibility matrix flags every adjacency
                that breaks zoning, with the exact buffer it&apos;d need to
                stop being a violation.
              </p>
              <div className="cap-vis">
                <span className="x">RES ↔ IND too close · need +4m</span>
                <span className="ok">RES ↔ UTL OK</span>
                <span className="ok">IND ↔ INF OK</span>
              </div>
            </div>

            {/* Card 2 — Coverage (dark) */}
            <div className="cap cap-2" data-rise>
              <div className="cap-head">
                <span className="cap-id">AXIS · 02 / CA</span>
                <span className="cap-badge">Service radius</span>
              </div>
              <h3 className="cap-h">Utility coverage.</h3>
              <p className="cap-p">
                Each reservoir casts a service radius. A residential block
                outside every radius is a household with no water. The map
                flags it and suggests where one new utility would fix the most.
              </p>
              <div className="ring" style={{ ["--p" as any]: 88 } as React.CSSProperties}>
                <div>88<span style={{fontSize:'0.9rem', verticalAlign:'top'}}>%</span></div>
              </div>
            </div>

            {/* Card 3 — Connectivity (narrow) */}
            <div className="cap cap-3" data-rise>
              <div className="cap-head">
                <span className="cap-id">AXIS · 03 / CG</span>
                <span className="cap-badge">Graph</span>
              </div>
              <h3 className="cap-h">Connectivity graph.</h3>
              <p className="cap-p">
                Buildings become nodes, roads become edges. Disconnected
                clusters are surfaced immediately — drop a loading platform
                to bridge them or watch your score drop.
              </p>
            </div>

            {/* Card 4 — Density (wide) */}
            <div className="cap cap-4" data-rise>
              <div className="cap-head">
                <span className="cap-id">AXIS · 04 / DB</span>
                <span className="cap-badge">Distribution</span>
              </div>
              <h3 className="cap-h">Density balance.</h3>
              <p className="cap-p">
                The board is split into quadrants and weighed against itself.
                Pile everything into one corner and the score tells you so.
                A balanced plan reads like a well-set table.
              </p>
              <div className="cap-vis">
                <span>NW · 4 blocks</span>
                <span>NE · 2 blocks</span>
                <span>SW · 1 block</span>
                <span>SE · 3 blocks</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── WORKFLOW / 03 ─────────────────── */}
      <section id="workflow" className="strip">
        <div className="strip-inner">
          <div data-rise>
            <div className="sec-num">§ 03 — Save · Replay · Compare</div>
            <h3>
              Every plan you<br/>like, <span className="serif">kept.</span>
            </h3>
            <p>
              A keystroke captures the current frame — every object,
              every score, every violation, frozen as a JSON snapshot.
              Load any two later and the dashboard puts them side by
              side on the same rubric. Argue with the numbers, not your
              colleague.
            </p>
            <div className="keycaps">
              press
              <span className="kbd">S</span>
              to snapshot ·
              <span className="kbd">C</span>
              to compare ·
              <span className="kbd">R</span>
              to replay
            </div>
          </div>
          <div data-rise>
            <div className="compare">
              <div className="compare-head">
                <span>Axis</span>
                <span>Plan A</span>
                <span>›</span>
                <span>Plan B</span>
                <span>Δ</span>
              </div>
              <CompareRow label="Zoning"    a={68} b={84} />
              <CompareRow label="Coverage"  a={91} b={88} />
              <CompareRow label="Connect."  a={55} b={79} />
              <CompareRow label="Density"   a={72} b={81} />
              <CompareRow label="Composite" a={72} b={83} strong />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── STACK / 04 ─────────────────── */}
      <section id="stack">
        <div className="container">
          <div className="section-head">
            <div data-rise>
              <div className="sec-num">§ 04 — The toolchain</div>
              <h2 className="sec-h">
                What&apos;s under<br/>the <span className="serif">hood.</span>
              </h2>
            </div>
            <p className="sec-lede" data-rise>
              A boring stack is a feature. Vision is owned by YOLO and OpenCV.
              The API is a thin Flask layer. Everything you click sits on
              Next.js, React 19, and TypeScript — so it stays fast and stays
              honest.
            </p>
          </div>

          <div className="stack-list" data-rise>
            <StackRow idx="01" name="YOLOv8" role="Object Detection" ver="ultralytics 8.x" />
            <StackRow idx="02" name="OpenCV" role="Frame Processing" ver="cv2 4.10" />
            <StackRow idx="03" name="Python" role="Vision Pipeline"  ver="3.11" />
            <StackRow idx="04" name="Flask"  role="HTTP API"          ver="3.0" />
            <StackRow idx="05" name="Next.js" role="App Shell"        ver="16.0" />
            <StackRow idx="06" name="React"   role="UI Runtime"       ver="19.0" />
            <StackRow idx="07" name="TypeScript" role="Types & DX"    ver="5.x" />
          </div>
        </div>
      </section>

      {/* ─────────────────── CTA ─────────────────── */}
      <section className="cta">
        <div className="cta-inner">
          <h2 data-rise>
            Plug in the camera.<br/>
            Lay out a town.<br/>
            <span className="serif">See if it works.</span>
          </h2>
          <div data-rise>
            <p>
              The Python backend boots in one command. The dashboard&apos;s a
              second. After that, the next move is yours — and so is the
              first block.
            </p>
            <Link href="/dashboard" className="btn btn-ink" style={{ fontSize: "0.85rem", padding: "1rem 1.6rem" }}>
              Launch the dashboard <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────────────── FOOT ─────────────────── */}
      <footer className="foot">
        <div className="rule" />
        <div className="foot-inner">
          <div className="left">plan.vision</div>
          <div className="mid">Drafted in the spirit of Lothal · IIT Gandhinagar</div>
          <div className="right">© {new Date().getFullYear()} · all sheets reserved</div>
        </div>
      </footer>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*                                helpers                                   */
/* ──────────────────────────────────────────────────────────────────────── */

function ReadoutRow({ label, v }: { label: string; v: number }) {
  return (
    <div className="readout-row">
      <span>{label}</span>
      <span className="bar"><span style={{ width: `${v}%` }} /></span>
      <span className="val">{v}</span>
    </div>
  );
}

function CompareRow({ label, a, b, strong = false }: { label: string; a: number; b: number; strong?: boolean }) {
  const delta = b - a;
  return (
    <div className="compare-row" style={strong ? { borderTop: "1px solid rgba(236,234,216,0.25)", marginTop: 6, paddingTop: 12, fontWeight: 700 } : undefined}>
      <span className="label">{label}</span>
      <span className="bar"><span style={{ width: `${a}%` }} /></span>
      <span className="v">{a}</span>
      <span className="bar alt"><span style={{ width: `${b}%` }} /></span>
      <span className="v" style={{ color: delta >= 0 ? "#86efac" : "#fca5a5" }}>
        {delta >= 0 ? "+" : ""}{delta}
      </span>
    </div>
  );
}

function StackRow({ idx, name, role, ver }: { idx: string; name: string; role: string; ver: string }) {
  return (
    <div className="stack-row">
      <span className="idx">{idx}</span>
      <span className="name">{name}</span>
      <span className="role">{role}</span>
      <span className="ver">{ver}</span>
    </div>
  );
}

function gradeLetter(n: number) {
  if (n >= 90) return "A";
  if (n >= 80) return "B+";
  if (n >= 70) return "B";
  if (n >= 60) return "C";
  return "D";
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function rand(min: number, max: number) {
  return Math.round(Math.random() * (max - min) + min);
}
