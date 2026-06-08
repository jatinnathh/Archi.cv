"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
const API_BASE = "http://localhost:5000";

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
      .card-dark {
        background: var(--ink);
        color: var(--paper);
        border-color: var(--ink);
      }
      .card-dark:disabled { opacity: 0.4; cursor: not-allowed; }
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
        <span><b>● LIVE</b> &nbsp; DASHBOARD ACTIVE</span>
        <span>YOLO-V8 · 28 FPS</span>
        <span>SHEET D-01 / EVALUATION</span>
        <span><b>►</b> READY FOR INPUT</span>
        <span>DRAFTED IN AHMEDABAD</span>
        <span>BUILD 0.4.1 — STABLE</span>
        <span><b>● LIVE</b> &nbsp; DASHBOARD ACTIVE</span>
        <span>YOLO-V8 · 28 FPS</span>
        <span>SHEET D-01 / EVALUATION</span>
        <span><b>►</b> READY FOR INPUT</span>
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
        <div className="mid">Sheet D-01 · Evaluation Dashboard</div>
        <div className="right">© {new Date().getFullYear()} · all sheets reserved</div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Mode Selector
// ---------------------------------------------------------------------------
function ModeSelector({
  backendConnected,
}: {
  backendConnected: boolean;
}) {
  const router = useRouter();

  return (
    <div className="sheet">
      <BlueprintStyles />
      <Tape />
      <Nav crumb="Select Input" connected={backendConnected} />

      <main className="sheet-body ruled" style={{ padding: "3rem 2rem" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          {/* Header strip */}
          <div className="doc-meta" style={{ marginBottom: "1.5rem" }}>
            <div>Sheet <b>D-01 / 03</b></div>
            <div>Mode <b>Selection</b></div>
            <div>Scale <b>1 : LIVE</b></div>
            <div>Status <b>{backendConnected ? "READY" : "OFFLINE"}</b></div>
          </div>

          <div className="eyebrow" style={{ marginBottom: "1.25rem" }}>
            § 00 — Choose input source
          </div>

          <h1
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(2.2rem, 5vw, 4rem)",
              lineHeight: 0.95,
              letterSpacing: "-0.04em",
              marginBottom: "1rem",
              maxWidth: "800px",
            }}
          >
            How should we{" "}
            <span
              className="serif"
              style={{ color: "var(--accent)", fontWeight: 400 }}
            >
              see
            </span>{" "}
            your town?
          </h1>

          <p
            style={{
              fontSize: "1.05rem",
              lineHeight: 1.65,
              color: "var(--ink-soft)",
              maxWidth: "560px",
              marginBottom: "3rem",
            }}
          >
            Upload a single photograph for a one-shot evaluation, or open a
            live camera feed and watch the score change with every block you
            move.
          </p>

          {/* Mode cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "1.5rem",
              marginBottom: "1.5rem"
            }}
          >
            {/* UPLOAD */}
            <button
              onClick={() => router.push("/static")}
              disabled={!backendConnected}
              className="card card-shadow"
              style={{
                textAlign: "left",
                cursor: backendConnected ? "pointer" : "not-allowed",
                opacity: backendConnected ? 1 : 0.45,
                padding: "2rem 1.75rem",
                color: "inherit",
                font: "inherit",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (backendConnected) {
                  e.currentTarget.style.transform = "translate(-3px, -4px)";
                  e.currentTarget.style.boxShadow = "9px 10px 0 0 var(--accent)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translate(0, 0)";
                e.currentTarget.style.boxShadow = "6px 6px 0 0 var(--ink)";
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "1.5rem",
                }}
              >
                <span className="sec-num">MODE · A / STATIC</span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.58rem",
                    letterSpacing: "0.18em",
                    padding: "3px 8px",
                    border: "1px solid var(--ink)",
                    textTransform: "uppercase",
                  }}
                >
                  One-shot
                </span>
              </div>

              <h3
                className="serif"
                style={{
                  fontSize: "2.4rem",
                  lineHeight: 1,
                  marginBottom: "0.75rem",
                  color: "var(--ink)",
                }}
              >
                Upload image.
              </h3>

              <p
                style={{
                  color: "var(--ink-soft)",
                  lineHeight: 1.65,
                  fontSize: "0.95rem",
                  marginBottom: "1.5rem",
                }}
              >
                Drop a photo of your block layout. The model runs full
                detection, the engine grades it on four axes, and the
                annotated result lands on this page.
              </p>

              <div
                style={{
                  paddingTop: "1rem",
                  borderTop: "1px dashed var(--rule-soft)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.7rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--ink-soft)",
                }}
              >
                <span>JPG · PNG · WEBP</span>
                <span style={{ color: "var(--accent)" }}>Open →</span>
              </div>
            </button>

            {/* CAMERA */}
            <button
              onClick={() => router.push("/camera")}
              disabled={!backendConnected}
              className="card card-dark"
              style={{
                textAlign: "left",
                cursor: backendConnected ? "pointer" : "not-allowed",
                opacity: backendConnected ? 1 : 0.45,
                padding: "2rem 1.75rem",
                color: "var(--paper)",
                font: "inherit",
                boxShadow: "6px 6px 0 0 var(--accent)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (backendConnected) {
                  e.currentTarget.style.transform = "translate(-3px, -4px)";
                  e.currentTarget.style.boxShadow = "9px 10px 0 0 var(--accent)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translate(0, 0)";
                e.currentTarget.style.boxShadow = "6px 6px 0 0 var(--accent)";
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "1.5rem",
                }}
              >
                <span
                  className="sec-num"
                  style={{ color: "var(--accent)" }}
                >
                  MODE · B / LIVE
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.58rem",
                    letterSpacing: "0.18em",
                    padding: "3px 8px",
                    border: "1px solid var(--paper)",
                    textTransform: "uppercase",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "var(--accent)",
                      animation: "pulse 1.6s ease-in-out infinite",
                    }}
                  />
                  Real-time
                </span>
              </div>

              <h3
                className="serif"
                style={{
                  fontSize: "2.4rem",
                  lineHeight: 1,
                  marginBottom: "0.75rem",
                  color: "var(--paper)",
                }}
              >
                Open camera.
              </h3>

              <p
                style={{
                  color: "rgba(236,234,216,0.75)",
                  lineHeight: 1.65,
                  fontSize: "0.95rem",
                  marginBottom: "1.5rem",
                }}
              >
                Point a webcam at your table. Move blocks with your hands —
                the dashboard updates at 28 fps. Snapshot any layout you
                like and compare it later.
              </p>

              <div
                style={{
                  paddingTop: "1rem",
                  borderTop: "1px dashed rgba(236,234,216,0.25)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.7rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(236,234,216,0.65)",
                }}
              >
                <span>28 fps · YOLOv8</span>
                <span style={{ color: "var(--accent)" }}>Open →</span>
              </div>
            </button>
          </div>

          {/* SIMULATION */}
          <button
            onClick={() => router.push("/simulation")}
            disabled={!backendConnected}
            className="card card-dark"
            style={{
              textAlign: "left",
              cursor: backendConnected ? "pointer" : "not-allowed",
              opacity: backendConnected ? 1 : 0.45,
              padding: "2rem 1.75rem",
              color: "var(--paper)",
              font: "inherit",
              boxShadow: "6px 6px 0 0 var(--accent)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
              width: "100%",
            }}
            onMouseEnter={(e) => {
              if (backendConnected) {
                e.currentTarget.style.transform = "translate(-3px, -4px)";
                e.currentTarget.style.boxShadow = "9px 10px 0 0 var(--accent)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translate(0, 0)";
              e.currentTarget.style.boxShadow = "6px 6px 0 0 var(--accent)";
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "1.5rem",
              }}
            >
              <span
                className="sec-num"
                style={{ color: "var(--accent)" }}
              >
                MODE · C / Design on canvas
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.58rem",
                  letterSpacing: "0.18em",
                  padding: "3px 8px",
                  border: "1px solid var(--paper)",
                  textTransform: "uppercase",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "var(--accent)",
                    animation: "pulse 1.6s ease-in-out infinite",
                  }}
                />
                Real-time
              </span>
            </div>

            <h3
              className="serif"
              style={{
                fontSize: "2.4rem",
                lineHeight: 1,
                marginBottom: "0.75rem",
                color: "var(--paper)",
              }}
            >
              Open canvas.
            </h3>

            <p
              style={{
                color: "rgba(236,234,216,0.75)",
                lineHeight: 1.65,
                fontSize: "0.95rem",
                marginBottom: "1.5rem",
              }}
            >
              Drag and drop elements on a canvas which will be further evaluated
            </p>

            <div
              style={{
                paddingTop: "1rem",
                borderTop: "1px dashed rgba(236,234,216,0.25)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.7rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(236,234,216,0.65)",
              }}
            >
              <span>simulation· YOLOv8</span>
              <span style={{ color: "var(--accent)" }}>Open →</span>
            </div>
          </button>

          {!backendConnected && (
            <div
              style={{
                marginTop: "2.5rem",
                padding: "1.25rem 1.5rem",
                background: "var(--paper-2)",
                border: "1px solid var(--ink)",
                borderLeft: "4px solid var(--accent)",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.78rem",
                lineHeight: 1.6,
                color: "var(--ink-soft)",
                maxWidth: "700px",
              }}
            >
              <div
                style={{
                  color: "var(--accent)",
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  marginBottom: "0.5rem",
                  fontSize: "0.65rem",
                }}
              >
                ▲ Backend offline
              </div>
              The dashboard is waiting for the Flask service at{" "}
              <code style={{ color: "var(--ink)", fontWeight: 700 }}>
                {API_BASE}
              </code>
              . Start it and this card will turn green.
            </div>
          )}
        </div>
      </main>

      <Foot />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page (root)
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const [backendConnected, setBackendConnected] = useState(false);

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

  return <ModeSelector backendConnected={backendConnected} />;
}
