"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

interface Snapshot {
  filename: string;
  name: string;
  timestamp: string;
  object_count: number;
  overall_score: number;
  grade: string;
}

interface CompareResult {
  snapshot_a: {
    name: string;
    timestamp: string;
    object_count: number;
    scores: {
      overall: number;
      breakdown: Record<string, number>;
      grade: string;
    };
  };
  snapshot_b: {
    name: string;
    timestamp: string;
    object_count: number;
    scores: {
      overall: number;
      breakdown: Record<string, number>;
      grade: string;
    };
  };
  deltas: Record<string, number>;
  winner: string;
}

const API_BASE = "http://localhost:5000";

async function fetchSnapshots(): Promise<Snapshot[]> {
  try {
    const res = await fetch(`${API_BASE}/api/snapshots`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function compareSnapshots(a: string, b: string): Promise<CompareResult | null> {
  try {
    const res = await fetch(`${API_BASE}/api/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a, b }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function scoreColor(value: number): string {
  if (value >= 90) return "var(--success)";
  if (value >= 75) return "#a3e635";
  if (value >= 60) return "var(--warning)";
  if (value >= 40) return "#fb923c";
  return "var(--error)";
}

function deltaDisplay(val: number): { text: string; className: string } {
  if (val > 0) return { text: `+${val.toFixed(1)}`, className: "compare-delta positive" };
  if (val < 0) return { text: val.toFixed(1), className: "compare-delta negative" };
  return { text: "0", className: "compare-delta neutral" };
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

function formatTimestamp(ts: string): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

export default function ComparePage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSnapshots().then(setSnapshots);
  }, []);

  const handleCompare = async () => {
    if (!selectedA || !selectedB) return;
    setLoading(true);
    const res = await compareSnapshots(selectedA, selectedB);
    setResult(res);
    setLoading(false);
  };

  const metrics = ["overall", "zoning", "coverage", "connectivity", "density"];
  const metricLabels: Record<string, string> = {
    overall: "Overall Score",
    zoning: "Zoning Compliance",
    coverage: "Water Coverage",
    connectivity: "Connectivity",
    density: "Density Balance",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
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
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Compare Layouts
          </span>
        </div>
        <Link href="/dashboard" className="btn-secondary" style={{ padding: "0.4rem 1rem", fontSize: "0.8rem" }}>
          ← Back to Dashboard
        </Link>
      </header>
      <div className="section" style={{ maxWidth: "1100px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "2rem", alignItems: "start", marginBottom: "2rem" }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              Layout A
            </div>
            {snapshots.length === 0 ? (
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                No snapshots saved yet. Use the dashboard to save a layout.
              </div>
            ) : (
              snapshots.map((snap) => (
                <div
                  key={snap.filename}
                  className={`snapshot-item ${selectedA === snap.filename ? "selected" : ""}`}
                  onClick={() => setSelectedA(snap.filename)}
                >
                  <div>
                    <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>{snap.name}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      {formatTimestamp(snap.timestamp)} • {snap.object_count} objects
                    </div>
                  </div>
                  <span className={gradeClass(snap.grade)} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1rem" }}>
                    {snap.grade}
                  </span>
                </div>
              ))
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "2rem" }}>
            <button
              className="btn-primary"
              onClick={handleCompare}
              disabled={!selectedA || !selectedB || loading}
              style={{ opacity: !selectedA || !selectedB ? 0.5 : 1, cursor: !selectedA || !selectedB ? "not-allowed" : "pointer" }}
            >
              {loading ? "Comparing..." : "Compare →"}
            </button>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.5rem", fontFamily: "var(--font-mono)" }}>
              vs
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              Layout B
            </div>
            {snapshots.map((snap) => (
              <div
                key={snap.filename}
                className={`snapshot-item ${selectedB === snap.filename ? "selected" : ""}`}
                onClick={() => setSelectedB(snap.filename)}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>{snap.name}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {formatTimestamp(snap.timestamp)} • {snap.object_count} objects
                  </div>
                </div>
                <span className={gradeClass(snap.grade)} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1rem" }}>
                  {snap.grade}
                </span>
              </div>
            ))}
          </div>
        </div>
        {result && (
          <div style={{ marginTop: "2rem" }}>
            <div className="divider" style={{ marginBottom: "2rem" }} />
            <div
              style={{
                textAlign: "center",
                padding: "1.5rem",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                marginBottom: "2rem",
              }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                Result
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                {result.winner === "Tie" ? (
                  "It's a Tie"
                ) : (
                  <>
                    Layout {result.winner} Wins
                    <span style={{ color: "var(--accent)", marginLeft: "0.5rem" }}>
                      {result.winner === "A" ? result.snapshot_a.name : result.snapshot_b.name}
                    </span>
                  </>
                )}
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                Overall delta: {result.deltas.overall > 0 ? "+" : ""}{result.deltas.overall} points
              </div>
            </div>
            <div className="compare-grid">
              <div className="compare-card">
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "1rem" }}>
                  {result.snapshot_a.name}
                </div>
                <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                  <div style={{ fontSize: "3rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: scoreColor(result.snapshot_a.scores.overall) }}>
                    {result.snapshot_a.scores.overall.toFixed(0)}
                  </div>
                  <div className={gradeClass(result.snapshot_a.scores.grade)} style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    Grade {result.snapshot_a.scores.grade}
                  </div>
                </div>
                {Object.entries(result.snapshot_a.scores.breakdown || {}).map(([key, val]) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderTop: "1px solid var(--border)", fontSize: "0.85rem" }}>
                    <span style={{ color: "var(--text-secondary)" }}>{metricLabels[key] || key}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: scoreColor(val as number) }}>
                      {(val as number).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="compare-card">
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "1rem" }}>
                  {result.snapshot_b.name}
                </div>
                <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                  <div style={{ fontSize: "3rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: scoreColor(result.snapshot_b.scores.overall) }}>
                    {result.snapshot_b.scores.overall.toFixed(0)}
                  </div>
                  <div className={gradeClass(result.snapshot_b.scores.grade)} style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    Grade {result.snapshot_b.scores.grade}
                  </div>
                </div>
                {Object.entries(result.snapshot_b.scores.breakdown || {}).map(([key, val]) => {
                  const delta = result.deltas[key] || 0;
                  const d = deltaDisplay(delta);
                  return (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderTop: "1px solid var(--border)", fontSize: "0.85rem" }}>
                      <span style={{ color: "var(--text-secondary)" }}>{metricLabels[key] || key}</span>
                      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: scoreColor(val as number) }}>
                          {(val as number).toFixed(0)}
                        </span>
                        <span className={d.className} style={{ fontSize: "0.75rem" }}>
                          {d.text}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

