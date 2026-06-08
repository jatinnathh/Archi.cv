// app\static\page.tsx
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DetectedObject {
  name: string;
  center: number[];
  box: number[];
}

interface Evaluation {
  violations: Violation[];
  coverage: CoverageResult;
  connectivity: ConnectivityResult;
  density: DensityResult;
  overall: OverallScore;
  suggestions: string[];
}

interface Violation {
  building_a: string;
  building_a_display: string;
  building_b: string;
  building_b_display: string;
  zone_a: string;
  zone_b: string;
  distance_cm: number;
  required_buffer_cm: number;
  severity: "critical" | "warning";
  message: string;
}

interface CoverageResult {
  total_needing_coverage: number;
  covered: number;
  uncovered: string[];
  coverage_pct: number;
}

interface ConnectivityResult {
  total_buildings: number;
  connected_components: number;
  is_fully_connected: boolean;
  connectivity_pct: number;
}

interface DensityResult {
  quadrants: Record<string, number>;
  balance_score: number;
}

interface OverallScore {
  overall: number;
  breakdown: {
    zoning: number;
    coverage: number;
    connectivity: number;
    density: number;
  };
  grade: string;
}

interface AppState {
  objects: DetectedObject[];
  evaluation: Evaluation | null;
  frame_size: { width: number; height: number };
  timestamp: number | null;
  is_running: boolean;
}

interface RegistryBuilding {
  display_name: string;
  type: string;
  zone: string;
  color: string;
  traffic_weight: number;
  buffer_zone_cm: number;
  coverage_radius_cm: number;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
const API_BASE = "http://localhost:5000";

async function fetchRegistry(): Promise<Record<string, RegistryBuilding> | null> {
  try {
    const res = await fetch(`${API_BASE}/api/registry`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.buildings || null;
  } catch {
    return null;
  }
}

async function detectImage(
  file: File
): Promise<(AppState & { annotated_image?: string }) | null> {
  try {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch(`${API_BASE}/api/detect`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function scoreColor(value: number): string {
  if (value >= 90) return "#1f7a3a";
  if (value >= 75) return "#3f8d2c";
  if (value >= 60) return "#b45309";
  if (value >= 40) return "#c2410c";
  return "#b91c1c";
}

function gradeLetter(n: number) {
  if (n >= 90) return "A";
  if (n >= 80) return "B+";
  if (n >= 70) return "B";
  if (n >= 60) return "C";
  return "D";
}

// ---------------------------------------------------------------------------
// Shared blueprint stylesheet
// ---------------------------------------------------------------------------
function BlueprintStyles() {
  return (
    <style jsx global>{`
      @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

      :root {
        --paper: #ecead8;
        --paper-2: #e3e0c8;
        --ink: #0e1726;
        --ink-soft: #2a3346;
        --rule: #6b7280;
        --rule-soft: rgba(14, 23, 38, 0.16);
        --rule-hair: rgba(14, 23, 38, 0.08);
        --accent: #ff5722;
        --accent-2: #1e6feb;
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
        background-image:
          radial-gradient(rgba(14,23,38,0.045) 1px, transparent 1px),
          radial-gradient(rgba(14,23,38,0.025) 1px, transparent 1px);
        background-size: 24px 24px, 24px 24px;
        background-position: 0 0, 12px 12px;
      }
      ::selection { background: var(--ink); color: var(--paper); }

      .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
      .serif { font-family: 'Instrument Serif', 'Times New Roman', serif; font-style: italic; }

      /* ── Tape ── */
      .tape {
        background: var(--ink);
        color: var(--paper);
        border-bottom: 1px solid #000;
        overflow: hidden;
      }
      .tape-track {
        display: flex; gap: 3rem; padding: 0.55rem 0;
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
        position: sticky; top: 0; z-index: 50;
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        padding: 1rem 2rem;
        background: rgba(236, 234, 216, 0.9);
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
      .nav-crumbs {
        justify-self: center;
        display: flex; gap: 1rem;
        align-items: center;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.72rem;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: var(--ink-soft);
      }
      .nav-crumbs a {
        color: var(--ink-soft);
        text-decoration: none;
      }
      .nav-crumbs a:hover { color: var(--ink); }
      .nav-crumbs .sep { color: var(--rule-soft); }
      .nav-crumbs .cur { color: var(--accent); }
      .nav-right {
        justify-self: end;
        display: flex; align-items: center; gap: 1rem;
      }
      .nav-status {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.72rem;
        color: var(--ink-soft);
        letter-spacing: 0.1em;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .nav-status .dot {
        width: 7px; height: 7px;
        border-radius: 50%;
      }
      .nav-status.ok .dot {
        background: var(--good);
        animation: pulse 1.6s ease-in-out infinite;
      }
      .nav-status.bad .dot { background: var(--bad); }
      @keyframes pulse {
        0%,100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.75); }
      }

      /* ── Buttons ── */
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
        transition: transform 0.15s ease, background 0.2s, color 0.2s, border-color 0.2s;
        border: 1px solid var(--ink);
        background: transparent;
        color: var(--ink);
      }
      .btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .btn-ink   { background: var(--ink); color: var(--paper); }
      .btn-ink:hover:not(:disabled) { background: var(--accent); border-color: var(--accent); }
      .btn-ghost:hover:not(:disabled) { background: var(--ink); color: var(--paper); }
      .btn-accent { background: var(--accent); border-color: var(--accent); color: #fff; }
      .btn-accent:hover:not(:disabled) { background: var(--ink); border-color: var(--ink); }
      .btn .arrow { transition: transform 0.2s; }
      .btn:hover:not(:disabled) .arrow { transform: translateX(3px); }

      /* ── Sheet (page container) ── */
      .sheet {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      .sheet-body {
        flex: 1;
        position: relative;
      }

      /* Margin tick rulers */
      .ruled::before, .ruled::after {
        content: '';
        position: absolute;
        top: 0; bottom: 0;
        width: 14px;
        background-image: repeating-linear-gradient(
          to bottom,
          var(--rule-soft) 0 1px,
          transparent 1px 12px
        );
        pointer-events: none;
      }
      .ruled::before { left: 0; }
      .ruled::after  { right: 0; }

      /* ── Common ── */
      .doc-meta {
        display: flex;
        gap: 2rem;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.66rem;
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
        display: inline-flex; align-items: center; gap: 0.6rem;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.72rem;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--ink-soft);
      }
      .eyebrow::before {
        content: '';
        width: 28px; height: 1px; background: var(--ink);
      }

      .sec-num {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.66rem;
        letter-spacing: 0.2em;
        color: var(--accent);
        text-transform: uppercase;
      }
      .sec-h {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.7rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--ink-soft);
      }

      /* ── Cards (blueprint style) ── */
      .card {
        background: var(--paper);
        border: 1px solid var(--ink);
        padding: 1.5rem;
        position: relative;
      }
      .card-shadow {
        box-shadow: 6px 6px 0 0 var(--ink);
      }
      .card-accent-shadow {
        box-shadow: 6px 6px 0 0 var(--accent);
      }

      /* ── Score Bars ── */
      .score-row {
        display: grid;
        grid-template-columns: 110px 1fr 50px;
        gap: 12px;
        align-items: center;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.72rem;
        margin: 10px 0;
        color: var(--ink-soft);
        letter-spacing: 0.06em;
      }
      .score-row .label { text-transform: uppercase; letter-spacing: 0.12em; }
      .score-row .bar {
        height: 8px;
        background: var(--rule-soft);
        position: relative;
        overflow: hidden;
      }
      .score-row .bar > span {
        position: absolute; left: 0; top: 0; bottom: 0;
        background: var(--ink);
        transition: width 0.6s cubic-bezier(0.4,0,0.2,1);
      }
      .score-row .val {
        color: var(--ink);
        font-weight: 700;
        text-align: right;
        font-family: 'Instrument Serif', serif;
        font-style: italic;
        font-size: 1.1rem;
      }

      /* ── Detected list ── */
      .obj-item {
        display: grid;
        grid-template-columns: 28px 1fr auto;
        gap: 10px;
        align-items: center;
        padding: 10px 0;
        border-bottom: 1px dashed var(--rule-soft);
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.75rem;
      }
      .obj-item:last-child { border-bottom: none; }
      .obj-dot {
        width: 14px; height: 14px;
        border: 1.5px solid var(--ink);
      }
      .obj-name {
        color: var(--ink);
        font-weight: 600;
        font-size: 0.8rem;
      }
      .obj-zone {
        color: var(--ink-soft);
        font-size: 0.62rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        margin-top: 2px;
      }
      .obj-count {
        font-family: 'Instrument Serif', serif;
        font-style: italic;
        font-size: 1.1rem;
        color: var(--accent);
      }

      /* ── Violations ── */
      .violation-item {
        padding: 10px 12px;
        margin-bottom: 8px;
        background: rgba(185, 28, 28, 0.06);
        border-left: 3px solid var(--bad);
        font-size: 0.82rem;
        line-height: 1.5;
        color: var(--ink);
      }
      .violation-item.warning {
        background: rgba(180, 83, 9, 0.07);
        border-left-color: var(--warn);
      }
      .violation-item::before {
        content: '✕ ';
        font-family: 'JetBrains Mono', monospace;
        color: var(--bad);
        font-weight: 700;
      }
      .violation-item.warning::before {
        content: '▲ ';
        color: var(--warn);
      }

      /* ── Suggestions ── */
      .suggestion-item {
        padding: 10px 12px;
        margin-bottom: 8px;
        background: var(--paper-2);
        border-left: 3px solid var(--accent);
        font-size: 0.82rem;
        line-height: 1.5;
        font-family: 'Instrument Serif', serif;
        font-style: italic;
        color: var(--ink);
      }
      .suggestion-item::before {
        content: '✎ ';
        color: var(--accent);
        font-style: normal;
        font-family: 'JetBrains Mono', monospace;
        font-weight: 700;
        margin-right: 4px;
      }

      /* ── Empty state ── */
      .empty {
        text-align: center;
        padding: 3rem 1rem;
        color: var(--ink-soft);
      }
      .empty-icon {
        font-family: 'Instrument Serif', serif;
        font-style: italic;
        font-size: 3rem;
        color: var(--accent);
        margin-bottom: 0.5rem;
      }
      .empty p {
        font-size: 0.85rem;
        line-height: 1.6;
        max-width: 360px;
        margin: 0 auto;
      }

      /* ── Footer ── */
      .foot {
        padding: 2rem;
        background: var(--paper);
        border-top: 1px solid var(--ink);
      }
      .foot-inner {
        max-width: 1400px; margin: 0 auto;
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 1rem;
        align-items: center;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.66rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--ink-soft);
      }
      .foot .left { font-family: 'Instrument Serif', serif; font-style: italic; font-size: 1.1rem; text-transform: none; letter-spacing: 0; color: var(--ink); }
      .foot .mid { text-align: center; }
      .foot .right { text-align: right; }
    `}</style>
  );
}

// ---------------------------------------------------------------------------
// Shared layout pieces
// ---------------------------------------------------------------------------
function Tape() {
  return (
    <div className="tape" aria-hidden>
      <div className="tape-track">
        <span><b>● STATIC</b> &nbsp; IMAGE CAPTURE SYSTEM</span>
        <span>YOLO-V8 · ONE-SHOT</span>
        <span>SHEET S-01 / EVALUATION</span>
        <span><b>►</b> READY FOR ANALYSIS</span>
        <span>DRAFTED IN AHMEDABAD</span>
        <span>BUILD 0.4.1 — STABLE</span>
        <span><b>● STATIC</b> &nbsp; IMAGE CAPTURE SYSTEM</span>
        <span>YOLO-V8 · ONE-SHOT</span>
        <span>SHEET S-01 / EVALUATION</span>
        <span><b>►</b> READY FOR ANALYSIS</span>
        <span>DRAFTED IN AHMEDABAD</span>
        <span>BUILD 0.4.1 — STABLE</span>
      </div>
    </div>
  );
}

function Nav({
  crumb,
  connected,
}: {
  crumb: string;
  connected: boolean;
}) {
  return (
    <nav className="nav">
      <Link href="/" className="nav-logo">
        plan.vision <span className="stamp">REV-04</span>
      </Link>
      <div className="nav-crumbs">
        <Link href="/">Home</Link>
        <span className="sep">/</span>
        <Link href="/dashboard">Dashboard</Link>
        <span className="sep">/</span>
        <span className="cur">{crumb}</span>
      </div>
      <div className="nav-right">
        <span className={`nav-status ${connected ? "ok" : "bad"}`}>
          <span className="dot" />
          {connected ? "Backend online" : "Disconnected"}
        </span>
      </div>
    </nav>
  );
}

function Foot() {
  return (
    <footer className="foot">
      <div className="foot-inner">
        <div className="left">plan.vision</div>
        <div className="mid">Sheet S-01 · Static Image Upload Evaluation</div>
        <div className="right">© {new Date().getFullYear()} · all sheets reserved</div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// ScoreRow / ObjectList / CompositeBlock
// ---------------------------------------------------------------------------
function ScoreRow({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="score-row">
      <span className="label">{label}</span>
      <span className="bar">
        <span style={{ width: `${v}%`, background: scoreColor(v) }} />
      </span>
      <span className="val">{v.toFixed(0)}</span>
    </div>
  );
}

function ObjectList({
  objects,
  registry,
}: {
  objects: DetectedObject[];
  registry: Record<string, RegistryBuilding> | null;
}) {
  const counts: Record<string, number> = {};
  for (const obj of objects) counts[obj.name] = (counts[obj.name] || 0) + 1;
  return (
    <div>
      {Object.entries(counts).map(([name, count]) => {
        const meta = registry?.[name];
        return (
          <div key={name} className="obj-item">
            <div className="obj-dot" style={{ background: meta?.color || "#666" }} />
            <div>
              <div className="obj-name">{meta?.display_name || name}</div>
              <div className="obj-zone">{meta?.zone || "unknown"}</div>
            </div>
            <div className="obj-count">×{count}</div>
          </div>
        );
      })}
    </div>
  );
}

function CompositeBlock({
  overall,
  grade,
  breakdown,
}: {
  overall: number;
  grade: string;
  breakdown: { zoning: number; coverage: number; connectivity: number; density: number };
}) {
  return (
    <div
      className="card card-accent-shadow"
      style={{
        padding: "1.5rem 1.75rem",
        display: "grid",
        gridTemplateColumns: "1fr 1.4fr",
        gap: "2rem",
        alignItems: "center",
      }}
    >
      <div>
        <div className="sec-num" style={{ marginBottom: "0.5rem" }}>
          § Static · Composite
        </div>
        <div
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontStyle: "italic",
            fontSize: "5.5rem",
            lineHeight: 0.95,
            color: scoreColor(overall),
          }}
        >
          {overall.toFixed(0)}
          <span
            style={{
              fontSize: "1.2rem",
              color: "var(--ink-soft)",
              fontStyle: "normal",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.1em",
            }}
          >
            /100
          </span>
        </div>
        <div
          style={{
            marginTop: "0.4rem",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.7rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
          }}
        >
          Grade ·{" "}
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>
            {grade || gradeLetter(overall)}
          </span>
        </div>
      </div>
      <div>
        <div
          className="sec-h"
          style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "space-between" }}
        >
          <span>Breakdown</span>
          <span style={{ color: "var(--accent)" }}>4 axes</span>
        </div>
        <ScoreRow label="Zoning" value={breakdown.zoning ?? 0} />
        <ScoreRow label="Coverage" value={breakdown.coverage ?? 0} />
        <ScoreRow label="Connectivity" value={breakdown.connectivity ?? 0} />
        <ScoreRow label="Density" value={breakdown.density ?? 0} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------
export default function StaticUploadPage() {
  const router = useRouter();
  const [backendConnected, setBackendConnected] = useState(false);
  const [registry, setRegistry] = useState<Record<string, RegistryBuilding> | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<(AppState & { annotated_image?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Health and Registry polling
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`);
        setBackendConnected(res.ok);
      } catch {
        setBackendConnected(false);
      }
    };
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchRegistry().then((r) => { if (r) setRegistry(r); });
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (JPG, PNG, WEBP)");
      return;
    }
    setError(null);
    setProcessing(true);
    setResult(null);
    setPreviewUrl(URL.createObjectURL(file));

    const res = await detectImage(file);
    setProcessing(false);

    if (res) setResult(res);
    else setError("Detection failed. Make sure the backend is running.");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const evaluation = result?.evaluation;
  const objects = result?.objects || [];
  const violations = evaluation?.violations || [];
  const suggestions = evaluation?.suggestions || [];

  return (
    <div className="sheet">
      <BlueprintStyles />
      <Tape />
      <Nav crumb="Image · Static" connected={backendConnected} />

      <main className="sheet-body ruled" style={{ padding: "2.5rem 2rem" }}>
        <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
          {/* Top bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: "2rem",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <div className="sec-num">§ A — Static image evaluation</div>
              <h1
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 800,
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  lineHeight: 1,
                  letterSpacing: "-0.035em",
                  marginTop: "0.5rem",
                }}
              >
                Drop, detect,{" "}
                <span className="serif" style={{ color: "var(--accent)", fontWeight: 400 }}>
                  decide.
                </span>
              </h1>
            </div>
            <button onClick={() => router.push("/dashboard")} className="btn btn-ghost">
              ← Back to dashboard
            </button>
          </div>

          {!result ? (
            <div style={{ maxWidth: "780px", margin: "0 auto" }}>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "var(--accent)" : "var(--ink)"}`,
                  background: dragOver ? "rgba(255,87,34,0.05)" : "var(--paper)",
                  padding: "4.5rem 2rem",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  minHeight: "440px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: dragOver ? "8px 8px 0 0 var(--accent)" : "6px 6px 0 0 var(--ink)",
                }}
              >
                {processing ? (
                  <>
                    <div
                      className="serif"
                      style={{
                        fontSize: "3.5rem",
                        color: "var(--accent)",
                        marginBottom: "0.5rem",
                        animation: "pulse 1.5s ease-in-out infinite",
                      }}
                    >
                      detecting…
                    </div>
                    <p
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "0.72rem",
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--ink-soft)",
                      }}
                    >
                      YOLO running · evaluating zoning · coverage · graph
                    </p>
                    {previewUrl && (
                      <img
                        src={previewUrl}
                        alt="Uploaded"
                        style={{
                          marginTop: "1.5rem",
                          maxWidth: "100%",
                          maxHeight: "220px",
                          border: "1px solid var(--ink)",
                          opacity: 0.7,
                        }}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <div className="sec-num" style={{ marginBottom: "0.75rem" }}>
                      ↳ Drop zone
                    </div>
                    <div
                      className="serif"
                      style={{
                        fontSize: "3rem",
                        lineHeight: 1,
                        color: "var(--ink)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Drop your image.
                    </div>
                    <p
                      style={{
                        color: "var(--ink-soft)",
                        fontSize: "0.9rem",
                        marginBottom: "1.5rem",
                      }}
                    >
                      or click anywhere in this frame to browse · JPG, PNG, WEBP
                    </p>
                    <span className="btn btn-ink">
                      Choose file <span className="arrow">→</span>
                    </span>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleInputChange}
                  style={{ display: "none" }}
                />
              </div>

              {error && (
                <div
                  style={{
                    marginTop: "1.25rem",
                    padding: "0.9rem 1.1rem",
                    background: "rgba(185,28,28,0.08)",
                    border: "1px solid var(--bad)",
                    borderLeft: "4px solid var(--bad)",
                    color: "var(--bad)",
                    fontSize: "0.85rem",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  ✕ {error}
                </div>
              )}
            </div>
          ) : (
            // Results layout
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.6fr) 380px",
                gap: "1.5rem",
                alignItems: "start",
              }}
            >
              {/* LEFT: image + composite + breakdown */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {result.annotated_image && (
                  <div
                    className="card card-shadow"
                    style={{ padding: 0, overflow: "hidden", background: "#0e1726" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "10px 16px",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "0.65rem",
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: "rgba(215,227,243,0.7)",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(0,0,0,0.25)",
                      }}
                    >
                      <span style={{ color: "var(--accent)" }}>● ANNOTATED</span>
                      <span>{objects.length} objects detected</span>
                    </div>
                    <img
                      src={result.annotated_image}
                      alt="Annotated detection result"
                      style={{ width: "100%", display: "block" }}
                    />
                  </div>
                )}

                {evaluation?.overall && (
                  <CompositeBlock
                    overall={evaluation.overall.overall}
                    grade={evaluation.overall.grade}
                    breakdown={evaluation.overall.breakdown}
                  />
                )}

                {/* Detail rows */}
                {evaluation?.coverage && evaluation.coverage.total_needing_coverage > 0 && (
                  <div className="card">
                    <div className="sec-h" style={{ marginBottom: "0.5rem" }}>Coverage detail</div>
                    <p style={{ fontSize: "0.9rem", color: "var(--ink-soft)" }}>
                      {evaluation.coverage.covered} of {evaluation.coverage.total_needing_coverage}{" "}
                      residential buildings covered ({evaluation.coverage.coverage_pct}%)
                    </p>
                    {evaluation.coverage.uncovered.length > 0 && (
                      <div
                        style={{
                          marginTop: "0.5rem",
                          fontSize: "0.82rem",
                          color: "var(--bad)",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        ✕ Uncovered: {evaluation.coverage.uncovered.join(", ")}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <button
                    onClick={() => { setResult(null); setPreviewUrl(null); }}
                    className="btn btn-ink"
                  >
                    Upload another <span className="arrow">→</span>
                  </button>
                  <Link href="/compare" className="btn btn-ghost">
                    Compare layouts
                  </Link>
                </div>
              </div>

              {/* RIGHT: side panel */}
              <aside style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div className="card">
                  <div
                    className="sec-h"
                    style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}
                  >
                    <span>Detected buildings</span>
                    <span style={{ color: "var(--accent)" }}>{objects.length}</span>
                  </div>
                  {objects.length > 0 ? (
                    <ObjectList objects={objects} registry={registry} />
                  ) : (
                    <p style={{ fontSize: "0.82rem", color: "var(--ink-soft)" }}>
                      No buildings detected in this image.
                    </p>
                  )}
                </div>

                <div className="card">
                  <div
                    className="sec-h"
                    style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}
                  >
                    <span>Violations</span>
                    {violations.length > 0 && (
                      <span style={{ color: "var(--bad)" }}>{violations.length}</span>
                    )}
                  </div>
                  {violations.length > 0 ? (
                    violations.map((v, i) => (
                      <div key={i} className={`violation-item ${v.severity}`}>
                        {v.message}
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: "0.82rem", color: "var(--good)" }}>
                      ✓ No violations detected
                    </p>
                  )}
                </div>

                {suggestions.length > 0 && (
                  <div className="card">
                    <div className="sec-h" style={{ marginBottom: "0.75rem" }}>
                      Suggestions
                    </div>
                    {suggestions.map((s, i) => (
                      <div key={i} className="suggestion-item">{s}</div>
                    ))}
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      </main>

      <Foot />
    </div>
  );
}
