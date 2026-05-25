"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

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

interface Snapshot {
  filename: string;
  name: string;
  timestamp: string;
  object_count: number;
  overall_score: number;
  grade: string;
}

type DashboardMode = "select" | "camera" | "upload";

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
const API_BASE = "http://localhost:5000";

async function fetchState(): Promise<AppState | null> {
  try {
    const res = await fetch(`${API_BASE}/api/state`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

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

async function fetchSnapshots(): Promise<Snapshot[]> {
  try {
    const res = await fetch(`${API_BASE}/api/snapshots`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function saveSnapshot(name?: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.filename;
  } catch {
    return null;
  }
}

async function detectImage(file: File): Promise<AppState & { annotated_image?: string } | null> {
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
  if (value >= 90) return "var(--success)";
  if (value >= 75) return "#a3e635";
  if (value >= 60) return "var(--warning)";
  if (value >= 40) return "#fb923c";
  return "var(--error)";
}

function gradeClass(grade: string): string {
  switch (grade) {
    case "A": return "score-excellent";
    case "B": return "score-good";
    case "C": return "score-fair";
    case "D": return "score-poor";
    default: return "score-bad";
  }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function ScoreCard({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="score-card">
      <div className="score-card-label">{label}</div>
      <div className="score-card-value" style={{ color: scoreColor(value) }}>
        {value.toFixed(0)}
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 400 }}>/{max}</span>
      </div>
      <div className="score-card-bar">
        <div className="score-card-fill" style={{ width: `${pct}%`, background: scoreColor(value) }} />
      </div>
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
  for (const obj of objects) {
    counts[obj.name] = (counts[obj.name] || 0) + 1;
  }
  return (
    <div>
      {Object.entries(counts).map(([name, count]) => {
        const meta = registry?.[name];
        return (
          <div key={name} className="object-item">
            <div
              className="object-color-dot"
              style={{ background: meta?.color || "#666" }}
            />
            <div>
              <div className="object-name">
                {meta?.display_name || name}
                {count > 1 && (
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> ×{count}</span>
                )}
              </div>
              <div className="object-zone">{meta?.zone || "unknown"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode Selector
// ---------------------------------------------------------------------------
function ModeSelector({
  onSelect,
  backendConnected,
}: {
  onSelect: (mode: DashboardMode) => void;
  backendConnected: boolean;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "1rem 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-secondary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "var(--text-primary)",
              textDecoration: "none",
              letterSpacing: "0.05em",
            }}
          >
            plan<span style={{ color: "var(--accent)" }}>.</span>vision
          </Link>
          <span style={{ color: "var(--border-light)" }}>│</span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Dashboard
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: "0.8rem" }}>
            <span className={`status-dot ${backendConnected ? "connected" : "disconnected"}`} />
            <span style={{ color: backendConnected ? "var(--success)" : "var(--error)" }}>
              {backendConnected ? "Backend Connected" : "Disconnected"}
            </span>
          </div>
        </div>
      </header>

      {/* Mode selection cards */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem 2rem",
          gap: "2rem",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1rem" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--accent)",
              marginBottom: "0.75rem",
            }}
          >
            Select Input Mode
          </div>
          <h1
            style={{
              fontSize: "clamp(1.8rem, 4vw, 2.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              marginBottom: "0.5rem",
            }}
          >
            How should we <span style={{ color: "var(--accent)" }}>detect</span>?
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", maxWidth: "500px" }}>
            Choose to upload a static image or open a live camera feed for real-time detection.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 340px))",
            gap: "1.5rem",
            width: "100%",
            maxWidth: "720px",
          }}
        >
          {/* Upload Image Card */}
          <button
            onClick={() => onSelect("upload")}
            disabled={!backendConnected}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: "2.5rem 2rem",
              cursor: backendConnected ? "pointer" : "not-allowed",
              opacity: backendConnected ? 1 : 0.5,
              transition: "all 0.3s var(--ease)",
              textAlign: "left",
              position: "relative",
              overflow: "hidden",
              color: "inherit",
            }}
            onMouseEnter={(e) => {
              if (backendConnected) {
                e.currentTarget.style.borderColor = "var(--accent-dim)";
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "var(--shadow-md)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "2px",
                background: "linear-gradient(90deg, transparent, var(--accent-dim), transparent)",
                opacity: 0,
                transition: "opacity 0.3s",
              }}
            />
            <div
              style={{
                width: "56px",
                height: "56px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius)",
                background: "rgba(212, 165, 116, 0.1)",
                color: "var(--accent)",
                fontSize: "1.75rem",
                marginBottom: "1.25rem",
              }}
            >
              📷
            </div>
            <div style={{ fontWeight: 600, fontSize: "1.15rem", marginBottom: "0.5rem" }}>
              Upload Image
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
              Upload a photo of your block layout. The system will detect all objects and run the full
              evaluation — zoning, coverage, connectivity, and density.
            </p>
            <div
              style={{
                marginTop: "1.25rem",
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              JPG / PNG / WEBP
            </div>
          </button>

          {/* Open Camera Card */}
          <button
            onClick={() => onSelect("camera")}
            disabled={!backendConnected}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: "2.5rem 2rem",
              cursor: backendConnected ? "pointer" : "not-allowed",
              opacity: backendConnected ? 1 : 0.5,
              transition: "all 0.3s var(--ease)",
              textAlign: "left",
              position: "relative",
              overflow: "hidden",
              color: "inherit",
            }}
            onMouseEnter={(e) => {
              if (backendConnected) {
                e.currentTarget.style.borderColor = "var(--accent-dim)";
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "var(--shadow-md)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius)",
                background: "rgba(74, 222, 128, 0.1)",
                color: "var(--success)",
                fontSize: "1.75rem",
                marginBottom: "1.25rem",
              }}
            >
              🎥
            </div>
            <div style={{ fontWeight: 600, fontSize: "1.15rem", marginBottom: "0.5rem" }}>
              Open Camera
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
              Use a live webcam feed for real-time detection. Move blocks on the table and watch
              the scores update instantly at 28 fps.
            </p>
            <div
              style={{
                marginTop: "1.25rem",
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
                letterSpacing: "0.1em",
                color: "var(--success)",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "var(--success)",
                  animation: "pulse-glow 2s ease-in-out infinite",
                }}
              />
              Live · Real-time
            </div>
          </button>
        </div>

        {!backendConnected && (
          <div
            style={{
              marginTop: "1rem",
              textAlign: "center",
              fontSize: "0.85rem",
              color: "var(--text-muted)",
            }}
          >
            <p style={{ marginBottom: "0.5rem" }}>Start the backend first:</p>
            <code
              style={{
                display: "inline-block",
                padding: "0.5rem 1.25rem",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                fontSize: "0.8rem",
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
              }}
            >
              npm run dev
            </code>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload View
// ---------------------------------------------------------------------------
function UploadView({
  onBack,
  registry,
}: {
  onBack: () => void;
  registry: Record<string, RegistryBuilding> | null;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<(AppState & { annotated_image?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    if (res) {
      setResult(res);
    } else {
      setError("Detection failed. Make sure the backend is running.");
    }
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
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Header */}
      <header className="dashboard-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 2rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "var(--text-primary)",
              textDecoration: "none",
              letterSpacing: "0.05em",
            }}
          >
            plan<span style={{ color: "var(--accent)" }}>.</span>vision
          </Link>
          <span style={{ color: "var(--border-light)" }}>│</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Image Detection
          </span>
        </div>
        <button
          onClick={onBack}
          className="btn-secondary"
          style={{ padding: "0.4rem 1rem", fontSize: "0.8rem" }}
        >
          ← Back
        </button>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: result ? "1fr 380px" : "1fr", minHeight: "calc(100vh - 57px)", gap: "1px", background: "var(--border)" }}>
        {/* Main content */}
        <div style={{ background: "var(--bg-primary)", padding: "2rem", overflowY: "auto" }}>
          {!result ? (
            /* Upload area */
            <div style={{ maxWidth: "700px", margin: "0 auto" }}>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border-light)"}`,
                  borderRadius: "var(--radius-lg)",
                  padding: "4rem 2rem",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.3s var(--ease)",
                  background: dragOver ? "rgba(212, 165, 116, 0.05)" : "var(--bg-card)",
                  minHeight: "400px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {processing ? (
                  <>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem", animation: "pulse-glow 1.5s ease-in-out infinite" }}>🔍</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                      Running YOLO detection...
                    </div>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                      Analyzing building layout, computing spatial evaluations
                    </p>
                    {previewUrl && (
                      <img
                        src={previewUrl}
                        alt="Uploaded"
                        style={{
                          marginTop: "1.5rem",
                          maxWidth: "100%",
                          maxHeight: "200px",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border)",
                          opacity: 0.6,
                        }}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📷</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                      Drop your image here
                    </div>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
                      or click to browse · JPG, PNG, WEBP supported
                    </p>
                    <div className="btn-primary" style={{ padding: "0.65rem 1.5rem", fontSize: "0.85rem" }}>
                      Choose File
                    </div>
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
                    marginTop: "1rem",
                    padding: "0.75rem 1rem",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid var(--error)",
                    borderRadius: "var(--radius)",
                    color: "var(--error)",
                    fontSize: "0.85rem",
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          ) : (
            /* Results view */
            <div>
              {/* Annotated image */}
              {result.annotated_image && (
                <div
                  style={{
                    marginBottom: "1.5rem",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    overflow: "hidden",
                    background: "#000",
                  }}
                >
                  <img
                    src={result.annotated_image}
                    alt="Annotated detection result"
                    style={{ width: "100%", display: "block" }}
                  />
                </div>
              )}

              {/* Overall score */}
              {evaluation?.overall && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    marginBottom: "1.5rem",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                  }}
                >
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                    Layout Score
                  </div>
                  <div
                    style={{
                      fontSize: "4rem",
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      color: scoreColor(evaluation.overall.overall),
                      lineHeight: 1,
                    }}
                  >
                    {evaluation.overall.overall.toFixed(0)}
                  </div>
                  <div
                    className={gradeClass(evaluation.overall.grade)}
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      marginTop: "0.25rem",
                    }}
                  >
                    Grade {evaluation.overall.grade}
                  </div>
                </div>
              )}

              {/* Score breakdown */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                <ScoreCard label="Zoning Compliance" value={evaluation?.overall?.breakdown?.zoning ?? 0} />
                <ScoreCard label="Water Coverage" value={evaluation?.overall?.breakdown?.coverage ?? 0} />
                <ScoreCard label="Connectivity" value={evaluation?.overall?.breakdown?.connectivity ?? 0} />
                <ScoreCard label="Density Balance" value={evaluation?.overall?.breakdown?.density ?? 0} />
              </div>

              {/* Try another */}
              <div style={{ marginTop: "2rem", textAlign: "center" }}>
                <button
                  onClick={() => {
                    setResult(null);
                    setPreviewUrl(null);
                  }}
                  className="btn-secondary"
                  style={{ padding: "0.65rem 1.5rem", fontSize: "0.85rem" }}
                >
                  Upload Another Image
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Side panel — only show when we have results */}
        {result && (
          <div style={{ background: "var(--bg-secondary)", padding: "1.5rem", overflowY: "auto" }}>
            {/* Detected objects */}
            <div style={{ marginBottom: "2rem" }}>
              <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "1rem" }}>
                Detected Buildings
                <span style={{ marginLeft: "0.5rem", background: "var(--accent-dim)", color: "#fff", borderRadius: "10px", padding: "0.1rem 0.5rem", fontSize: "0.65rem", fontWeight: 700 }}>
                  {objects.length}
                </span>
              </h3>
              {objects.length > 0 ? (
                <ObjectList objects={objects} registry={registry} />
              ) : (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "1rem 0" }}>
                  No buildings detected in this image.
                </div>
              )}
            </div>

            {/* Violations */}
            <div style={{ marginBottom: "2rem" }}>
              <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                Violations
                {violations.length > 0 && (
                  <span style={{ background: "var(--error)", color: "#fff", borderRadius: "10px", padding: "0.1rem 0.5rem", fontSize: "0.65rem", fontWeight: 700 }}>
                    {violations.length}
                  </span>
                )}
              </h3>
              {violations.length > 0 ? (
                violations.map((v, i) => (
                  <div key={i} className={`violation-item ${v.severity}`}>
                    {v.message}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  ✓ No violations detected
                </div>
              )}
            </div>

            {/* Suggestions */}
            <div>
              <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "1rem" }}>
                Suggestions
              </h3>
              {suggestions.map((s, i) => (
                <div key={i} className="suggestion-item">{s}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Camera View (Original dashboard layout)
// ---------------------------------------------------------------------------
function CameraView({
  onBack,
  registry,
}: {
  onBack: () => void;
  registry: Record<string, RegistryBuilding> | null;
}) {
  const [state, setState] = useState<AppState | null>(null);
  const [connected, setConnected] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll state
  useEffect(() => {
    const poll = async () => {
      const s = await fetchState();
      if (s) {
        setState(s);
        setConnected(true);
      } else {
        setConnected(false);
      }
    };
    poll();
    intervalRef.current = setInterval(poll, 500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    fetchSnapshots().then(setSnapshots);
  }, []);

  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    const name = prompt("Snapshot name (optional):");
    const filename = await saveSnapshot(name || undefined);
    if (filename) {
      setSaveStatus("saved");
      const updated = await fetchSnapshots();
      setSnapshots(updated);
      setTimeout(() => setSaveStatus(null), 2000);
    } else {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 2000);
    }
  }, []);

  const evaluation = state?.evaluation;
  const objects = state?.objects || [];
  const violations = evaluation?.violations || [];
  const suggestions = evaluation?.suggestions || [];

  return (
    <div className="dashboard">
      {/* ── Header ── */}
      <header className="dashboard-header">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius)",
              color: "var(--text-secondary)",
              padding: "0.3rem 0.75rem",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-dim)"; e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-light)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            ← Back
          </button>
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "var(--text-primary)",
              textDecoration: "none",
              letterSpacing: "0.05em",
            }}
          >
            plan<span style={{ color: "var(--accent)" }}>.</span>vision
          </Link>
          <span style={{ color: "var(--border-light)" }}>│</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Live Camera
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: "0.8rem" }}>
            <span className={`status-dot ${connected ? "connected" : "disconnected"}`} />
            <span style={{ color: connected ? "var(--success)" : "var(--error)" }}>
              {connected ? "Backend Connected" : "Disconnected"}
            </span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {objects.length} objects detected
          </span>
        </div>
      </header>

      {/* ── Sidebar ── */}
      <aside className="dashboard-sidebar">
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "1rem" }}>
            Detected Buildings
          </h3>
          {objects.length > 0 ? (
            <ObjectList objects={objects} registry={registry} />
          ) : (
            <div className="empty-state" style={{ padding: "2rem 1rem" }}>
              <div className="empty-state-icon">🏗️</div>
              <p style={{ fontSize: "0.8rem" }}>
                {connected ? "No blocks detected. Place objects in camera view." : "Waiting for camera feed..."}
              </p>
            </div>
          )}
        </div>

        {/* Density quadrants */}
        {evaluation?.density && (
          <div style={{ marginTop: "1rem" }}>
            <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              Density Map
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
              {(["NW", "NE", "SW", "SE"] as const).map((q) => {
                const count = evaluation.density.quadrants[q] || 0;
                const max = Math.max(...Object.values(evaluation.density.quadrants), 1);
                const intensity = count / max;
                return (
                  <div
                    key={q}
                    style={{
                      background: `rgba(212, 165, 116, ${0.05 + intensity * 0.2})`,
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      padding: "0.75rem",
                      textAlign: "center",
                      fontSize: "0.75rem",
                    }}
                  >
                    <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: "0.6rem" }}>{q}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1.1rem", color: "var(--accent)" }}>
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </aside>

      {/* ── Main ── */}
      <main className="dashboard-main">
        {!connected ? (
          <div className="empty-state" style={{ minHeight: "60vh" }}>
            <div className="empty-state-icon">📡</div>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem", color: "var(--text-secondary)" }}>
              Waiting for Camera Feed
            </h3>
            <p style={{ fontSize: "0.85rem", maxWidth: "400px", lineHeight: 1.6 }}>
              The camera is starting up. Detection results will appear here once the feed is active.
            </p>
          </div>
        ) : (
          <>
            {evaluation?.overall && (
              <div
                style={{
                  textAlign: "center",
                  padding: "2rem",
                  marginBottom: "1.5rem",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                }}
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                  Layout Score
                </div>
                <div
                  style={{
                    fontSize: "4rem",
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    color: scoreColor(evaluation.overall.overall),
                    lineHeight: 1,
                  }}
                >
                  {evaluation.overall.overall.toFixed(0)}
                </div>
                <div
                  className={gradeClass(evaluation.overall.grade)}
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    marginTop: "0.25rem",
                  }}
                >
                  Grade {evaluation.overall.grade}
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
              <ScoreCard label="Zoning Compliance" value={evaluation?.overall?.breakdown?.zoning ?? 0} />
              <ScoreCard label="Water Coverage" value={evaluation?.overall?.breakdown?.coverage ?? 0} />
              <ScoreCard label="Connectivity" value={evaluation?.overall?.breakdown?.connectivity ?? 0} />
              <ScoreCard label="Density Balance" value={evaluation?.overall?.breakdown?.density ?? 0} />
            </div>

            {evaluation?.coverage && evaluation.coverage.total_needing_coverage > 0 && (
              <div style={{ marginTop: "1.5rem" }}>
                <div className="score-card">
                  <div className="score-card-label">Water Coverage Detail</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                    {evaluation.coverage.covered} of {evaluation.coverage.total_needing_coverage} residential
                    buildings covered ({evaluation.coverage.coverage_pct}%)
                  </div>
                  {evaluation.coverage.uncovered.length > 0 && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--error)" }}>
                      ⚠ Uncovered: {evaluation.coverage.uncovered.join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}

            {evaluation?.connectivity && (
              <div style={{ marginTop: "1rem" }}>
                <div className="score-card">
                  <div className="score-card-label">Connectivity Detail</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                    {evaluation.connectivity.connected_components} cluster{evaluation.connectivity.connected_components !== 1 ? "s" : ""}
                    {" "} — {evaluation.connectivity.is_fully_connected ? (
                      <span style={{ color: "var(--success)" }}>Fully connected ✓</span>
                    ) : (
                      <span style={{ color: "var(--warning)" }}>Disconnected clusters detected</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Right Panel ── */}
      <aside className="dashboard-panel">
        <div style={{ marginBottom: "2rem" }}>
          <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            Violations
            {violations.length > 0 && (
              <span style={{ background: "var(--error)", color: "#fff", borderRadius: "10px", padding: "0.1rem 0.5rem", fontSize: "0.65rem", fontWeight: 700 }}>
                {violations.length}
              </span>
            )}
          </h3>
          {violations.length > 0 ? (
            violations.map((v, i) => (
              <div key={i} className={`violation-item ${v.severity}`}>
                {v.message}
              </div>
            ))
          ) : (
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "1rem 0" }}>
              {connected ? "✓ No violations detected" : "—"}
            </div>
          )}
        </div>

        <div>
          <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "1rem" }}>
            Suggestions
          </h3>
          {suggestions.length > 0 ? (
            suggestions.map((s, i) => (
              <div key={i} className="suggestion-item">{s}</div>
            ))
          ) : (
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "1rem 0" }}>
              {connected ? "No suggestions" : "—"}
            </div>
          )}
        </div>
      </aside>

      {/* ── Footer ── */}
      <footer className="dashboard-footer">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button className="btn-primary" onClick={handleSave} style={{ padding: "0.5rem 1.25rem", fontSize: "0.8rem" }}>
            {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "✓ Saved" : "Save Snapshot"}
          </button>
          <Link href="/compare" className="btn-secondary" style={{ padding: "0.5rem 1.25rem", fontSize: "0.8rem" }}>
            Compare Layouts
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {snapshots.slice(0, 4).map((snap) => (
            <div key={snap.filename} className="snapshot-item" style={{ marginBottom: 0, cursor: "default" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{snap.name}</span>
              <span
                className={gradeClass(snap.grade)}
                style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 700, marginLeft: "0.5rem" }}
              >
                {snap.grade}
              </span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page (root)
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const [mode, setMode] = useState<DashboardMode>("select");
  const [backendConnected, setBackendConnected] = useState(false);
  const [registry, setRegistry] = useState<Record<string, RegistryBuilding> | null>(null);

  // Check backend connectivity
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

  // Fetch registry once
  useEffect(() => {
    fetchRegistry().then((r) => {
      if (r) setRegistry(r);
    });
  }, []);

  if (mode === "upload") {
    return <UploadView onBack={() => setMode("select")} registry={registry} />;
  }

  if (mode === "camera") {
    return <CameraView onBack={() => setMode("select")} registry={registry} />;
  }

  return <ModeSelector onSelect={setMode} backendConnected={backendConnected} />;
}