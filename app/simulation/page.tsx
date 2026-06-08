// app/simulation/page.tsx
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";

/* ═══════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════ */
interface PlacedBlock {
  id: string;
  type: string;
  x: number; y: number;
  w: number; h: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  label?: string;
}
interface BlockTypeDef {
  id: string; name: string; color: string; category: string;
  zone: string;
  bufferCm: number;        // required spacing buffer
  coverageRadiusCm: number;// service radius (0 = none)
  needsCoverage: boolean;  // residential-type buildings that need services
  trafficWeight: number;
}

type DragState =
  | { type: "none" }
  | { type: "palette"; blockType: string; w: number; h: number }
  | { type: "move"; blockId: string; offX: number; offY: number; orig: PlacedBlock }
  | { type: "pan"; startCx: number; startCy: number; startPx: number; startPy: number }
  | { type: "orbit"; startCx: number; startCy: number; startYaw: number; startPitch: number }
  | { type: "resize"; blockId: string; handle: string; orig: PlacedBlock };

interface ViolationR {
  a: string; b: string; distanceCm: number; requiredCm: number;
  severity: "critical" | "warning"; message: string;
}
interface EvalResult {
  violations: ViolationR[];
  coverage: { total: number; covered: number; uncovered: string[]; pct: number };
  connectivity: { totalBuildings: number; components: number; connected: boolean; pct: number };
  density: { quadrants: Record<string, number>; balance: number };
  overall: { score: number; grade: string; breakdown: { zoning: number; coverage: number; connectivity: number; density: number } };
  suggestions: string[];
}

/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════ */
const CELL = 40;
const CM_PER_CELL = 4; // scale: 1 cell = 4cm (tune to match your backend)
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 5;
const MAX_HIST = 60;
const PERSPECTIVE = 1400;
const HANDLE_R = 8;
const STORAGE_KEY = "planvision.sim.v2";

const BLOCK_TYPES: BlockTypeDef[] = [
  { id: "road",        name: "Road",        color: "#64748b", category: "Infrastructure", zone: "infra",       bufferCm: 0,  coverageRadiusCm: 0,  needsCoverage: false, trafficWeight: 1 },
  { id: "bridge",      name: "Bridge",      color: "#8b5cf6", category: "Infrastructure", zone: "infra",       bufferCm: 0,  coverageRadiusCm: 0,  needsCoverage: false, trafficWeight: 1 },
  { id: "station",     name: "Station",     color: "#d97706", category: "Infrastructure", zone: "infra",       bufferCm: 8,  coverageRadiusCm: 60, needsCoverage: false, trafficWeight: 3 },
  { id: "parking",     name: "Parking",     color: "#94a3b8", category: "Infrastructure", zone: "infra",       bufferCm: 4,  coverageRadiusCm: 0,  needsCoverage: false, trafficWeight: 1 },
  { id: "building",    name: "Building",    color: "#3b82f6", category: "Buildings",      zone: "mixed",       bufferCm: 8,  coverageRadiusCm: 0,  needsCoverage: false, trafficWeight: 2 },
  { id: "residential", name: "Residential", color: "#a78bfa", category: "Buildings",      zone: "residential", bufferCm: 12, coverageRadiusCm: 0,  needsCoverage: true,  trafficWeight: 1 },
  { id: "commercial",  name: "Commercial",  color: "#0891b2", category: "Buildings",      zone: "commercial",  bufferCm: 10, coverageRadiusCm: 0,  needsCoverage: false, trafficWeight: 3 },
  { id: "hospital",    name: "Hospital",    color: "#ef4444", category: "Buildings",      zone: "civic",       bufferCm: 16, coverageRadiusCm: 120,needsCoverage: false, trafficWeight: 2 },
  { id: "school",      name: "School",      color: "#f97316", category: "Buildings",      zone: "civic",       bufferCm: 14, coverageRadiusCm: 100,needsCoverage: false, trafficWeight: 2 },
  { id: "temple",      name: "Temple",      color: "#b45309", category: "Buildings",      zone: "civic",       bufferCm: 10, coverageRadiusCm: 0,  needsCoverage: false, trafficWeight: 1 },
  { id: "park",        name: "Park",        color: "#16a34a", category: "Nature",         zone: "green",       bufferCm: 0,  coverageRadiusCm: 80, needsCoverage: false, trafficWeight: 0 },
  { id: "garden",      name: "Garden",      color: "#10b981", category: "Nature",         zone: "green",       bufferCm: 0,  coverageRadiusCm: 50, needsCoverage: false, trafficWeight: 0 },
  { id: "river",       name: "River",       color: "#0284c7", category: "Nature",         zone: "water",       bufferCm: 0,  coverageRadiusCm: 0,  needsCoverage: false, trafficWeight: 0 },
  { id: "plaza",       name: "Plaza",       color: "#db2777", category: "Urban",          zone: "urban",       bufferCm: 6,  coverageRadiusCm: 0,  needsCoverage: false, trafficWeight: 2 },
  { id: "market",      name: "Market",      color: "#65a30d", category: "Urban",          zone: "commercial",  bufferCm: 10, coverageRadiusCm: 0,  needsCoverage: false, trafficWeight: 3 },
  { id: "dockyard",    name: "Dockyard",    color: "#78716c", category: "Urban",          zone: "industrial",  bufferCm: 18, coverageRadiusCm: 0,  needsCoverage: false, trafficWeight: 2 },
];

const TYPE_MAP: Record<string, BlockTypeDef> = Object.fromEntries(BLOCK_TYPES.map(b => [b.id, b]));

// zoning incompatibilities — pairs that should NOT be adjacent/close
const ZONE_CONFLICTS: Record<string, string[]> = {
  residential: ["industrial"],
  civic: ["industrial"],
  green: ["industrial"],
  industrial: ["residential", "civic", "green"],
};

const SIZES = [
  { label: "S", w: 1, h: 1 }, { label: "M", w: 2, h: 2 },
  { label: "L", w: 3, h: 3 }, { label: "XL", w: 4, h: 4 },
];

const CATEGORIES = [...new Set(BLOCK_TYPES.map(b => b.category))];

/* ═══════════════════════════════════════════════════════════════════════
   3D MATH — orbit (yaw + pitch) inverse projection
   We tilt the plane by `pitch` around X then rotate by `yaw` around Z.
   For pointer mapping we approximate using pitch only for the inverse
   perspective and apply a yaw un-rotation in world space.
   ═══════════════════════════════════════════════════════════════════════ */
function clientToPlane(
  clientX: number, clientY: number,
  rect: DOMRect, perspective: number, pitchDeg: number,
): { x: number; y: number } {
  const sx = clientX - rect.left - rect.width / 2;
  const sy = clientY - rect.top - rect.height / 2;
  const rad = (pitchDeg * Math.PI) / 180;
  const cosT = Math.cos(rad), sinT = Math.sin(rad);
  const denom = cosT * perspective - sy * sinT;
  if (Math.abs(denom) < 1) return { x: rect.width / 2, y: rect.height / 2 };
  const pY = (sy * perspective) / denom;
  const pX = (sx * (perspective + pY * sinT)) / perspective;
  return { x: pX + rect.width / 2, y: pY + rect.height / 2 };
}

function planeToWorld(
  planeX: number, planeY: number,
  rect: DOMRect, yawDeg: number,
  pan: { x: number; y: number }, zoom: number,
): { x: number; y: number } {
  // un-rotate yaw about the plane center
  const cx = rect.width / 2, cy = rect.height / 2;
  const dx = planeX - cx, dy = planeY - cy;
  const rad = (-yawDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const rx = dx * cos - dy * sin + cx;
  const ry = dx * sin + dy * cos + cy;
  return { x: rx / zoom - pan.x, y: ry / zoom - pan.y };
}

function clientToWorld(
  clientX: number, clientY: number,
  rect: DOMRect, perspective: number, pitchDeg: number, yawDeg: number,
  pan: { x: number; y: number }, zoom: number,
) {
  const p = clientToPlane(clientX, clientY, rect, perspective, pitchDeg);
  return planeToWorld(p.x, p.y, rect, yawDeg, pan, zoom);
}

/* ═══════════════════════════════════════════════════════════════════════
   EVALUATION ENGINE (client-side, mirrors static page)
   ═══════════════════════════════════════════════════════════════════════ */
function centerCm(b: PlacedBlock) {
  return {
    x: (b.x + b.w / 2) * CELL * (CM_PER_CELL / CELL),
    y: (b.y + b.h / 2) * CELL * (CM_PER_CELL / CELL),
  };
}
function distCm(a: PlacedBlock, b: PlacedBlock) {
  const ca = centerCm(a), cb = centerCm(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}
function gradeLetter(n: number) {
  if (n >= 90) return "A";
  if (n >= 80) return "B+";
  if (n >= 70) return "B";
  if (n >= 60) return "C";
  return "D";
}

function evaluateLayout(blocks: PlacedBlock[]): EvalResult {
  const live = blocks.filter(b => b.visible);
  const buildings = live.filter(b => {
    const t = TYPE_MAP[b.type];
    return t && t.zone !== "water" && t.zone !== "infra";
  });

  /* ── 1. ZONING — buffer + conflict violations ── */
  const violations: ViolationR[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const A = live[i], B = live[j];
      const ta = TYPE_MAP[A.type], tb = TYPE_MAP[B.type];
      if (!ta || !tb) continue;
      const d = distCm(A, B);
      const required = Math.max(ta.bufferCm, tb.bufferCm);
      const conflict =
        (ZONE_CONFLICTS[ta.zone]?.includes(tb.zone)) ||
        (ZONE_CONFLICTS[tb.zone]?.includes(ta.zone));
      if (conflict && d < required + 8) {
        violations.push({
          a: A.label || ta.name, b: B.label || tb.name,
          distanceCm: +d.toFixed(1), requiredCm: required + 8,
          severity: "critical",
          message: `${ta.name} (${ta.zone}) is ${d.toFixed(1)}cm from ${tb.name} (${tb.zone}) — incompatible zones, needs ${required + 8}cm.`,
        });
      } else if (required > 0 && d < required) {
        violations.push({
          a: A.label || ta.name, b: B.label || tb.name,
          distanceCm: +d.toFixed(1), requiredCm: required,
          severity: "warning",
          message: `${ta.name} is ${d.toFixed(1)}cm from ${tb.name} — needs ${required}cm buffer.`,
        });
      }
    }
  }
  const critical = violations.filter(v => v.severity === "critical").length;
  const warnings = violations.filter(v => v.severity === "warning").length;
  const zoningScore = Math.max(0, 100 - critical * 18 - warnings * 7);

  /* ── 2. COVERAGE — residential within service radius ── */
  const needing = live.filter(b => TYPE_MAP[b.type]?.needsCoverage);
  const providers = live.filter(b => (TYPE_MAP[b.type]?.coverageRadiusCm ?? 0) > 0);
  const uncovered: string[] = [];
  let covered = 0;
  for (const r of needing) {
    const ok = providers.some(p => distCm(r, p) <= (TYPE_MAP[p.type]!.coverageRadiusCm) + 6);
    if (ok) covered++;
    else uncovered.push(r.label || `${TYPE_MAP[r.type]?.name} #${r.id.replace("b", "")}`);
  }
  const coveragePct = needing.length ? Math.round((covered / needing.length) * 100) : 100;
  const coverageScore = coveragePct;

  /* ── 3. CONNECTIVITY — graph by proximity (road-aware) ── */
  // buildings within ~roadReach are linked; roads act as super-connectors
  const roadReach = 80; // cm
  const nodes = buildings;
  const parent = nodes.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  const roads = live.filter(b => TYPE_MAP[b.type]?.zone === "infra");
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      let linked = distCm(nodes[i], nodes[j]) <= roadReach;
      if (!linked) {
        linked = roads.some(r =>
          distCm(nodes[i], r) <= roadReach * 0.8 &&
          distCm(nodes[j], r) <= roadReach * 0.8
        );
      }
      if (linked) union(i, j);
    }
  }
  const roots = new Set(nodes.map((_, i) => find(i)));
  const components = nodes.length ? roots.size : 0;
  const connected = components <= 1;
  const connectivityPct = nodes.length <= 1 ? 100 : Math.round(((nodes.length - components + 1) / nodes.length) * 100);
  const connectivityScore = connectivityPct;

  /* ── 4. DENSITY — quadrant balance ── */
  const quadrants: Record<string, number> = { NW: 0, NE: 0, SW: 0, SE: 0 };
  if (buildings.length) {
    const xs = buildings.map(b => b.x + b.w / 2);
    const ys = buildings.map(b => b.y + b.h / 2);
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const my = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const b of buildings) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const q = (cy < my ? "N" : "S") + (cx < mx ? "W" : "E");
      quadrants[q]++;
    }
  }
  const counts = Object.values(quadrants);
  const total = counts.reduce((s, c) => s + c, 0);
  let balance = 100;
  if (total > 0) {
    const ideal = total / 4;
    const variance = counts.reduce((s, c) => s + Math.abs(c - ideal), 0) / total;
    balance = Math.max(0, Math.round(100 - variance * 60));
  }
  const densityScore = balance;

  /* ── OVERALL ── */
  const breakdown = {
    zoning: zoningScore,
    coverage: coverageScore,
    connectivity: connectivityScore,
    density: densityScore,
  };
  const overall = Math.round(
    breakdown.zoning * 0.35 +
    breakdown.coverage * 0.25 +
    breakdown.connectivity * 0.25 +
    breakdown.density * 0.15
  );

  /* ── SUGGESTIONS ── */
  const suggestions: string[] = [];
  if (critical > 0) suggestions.push("Move industrial buildings away from residential/civic zones — keep at least one block of separation.");
  if (uncovered.length > 0) suggestions.push(`Add a hospital, school or park near: ${uncovered.slice(0, 3).join(", ")}${uncovered.length > 3 ? "…" : ""}.`);
  if (components > 1) suggestions.push("Add roads or bridges to link isolated clusters — the layout has disconnected regions.");
  if (densityScore < 70) suggestions.push("Spread buildings more evenly — one quadrant is overcrowded.");
  if (warnings > 0) suggestions.push("Increase spacing between tightly-packed buildings to satisfy buffer requirements.");
  if (suggestions.length === 0) suggestions.push("Strong layout — zoning, coverage and connectivity all look healthy.");

  return {
    violations,
    coverage: { total: needing.length, covered, uncovered, pct: coveragePct },
    connectivity: { totalBuildings: nodes.length, components, connected, pct: connectivityPct },
    density: { quadrants, balance },
    overall: { score: overall, grade: gradeLetter(overall), breakdown },
    suggestions,
  };
}

function scoreColor(v: number): string {
  if (v >= 90) return "#1f7a3a";
  if (v >= 75) return "#3f8d2c";
  if (v >= 60) return "#b45309";
  if (v >= 40) return "#c2410c";
  return "#b91c1c";
}

/* ═══════════════════════════════════════════════════════════════════════
   SVG ICONS
   ═══════════════════════════════════════════════════════════════════════ */
function BlockIcon({ type, size = 16 }: { type: string; size?: number }) {
  const s = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "road":        return <svg {...s}><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/><path d="M12 6v12" strokeDasharray="2 2"/></svg>;
    case "bridge":      return <svg {...s}><path d="M2 18h20"/><path d="M4 18V14a8 8 0 0 1 16 0v4"/><path d="M8 18v-3"/><path d="M16 18v-3"/></svg>;
    case "station":     return <svg {...s}><rect x="4" y="8" width="16" height="12" rx="1"/><path d="M4 8l8-5 8 5"/><circle cx="12" cy="14" r="2"/></svg>;
    case "parking":     return <svg {...s}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>;
    case "building":    return <svg {...s}><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M9 8h2"/><path d="M13 8h2"/><path d="M9 12h2"/><path d="M13 12h2"/><path d="M10 20v-4h4v4"/></svg>;
    case "residential": return <svg {...s}><path d="M3 12l9-8 9 8"/><rect x="5" y="12" width="14" height="8" rx="1"/><rect x="9" y="15" width="6" height="5"/></svg>;
    case "commercial":  return <svg {...s}><rect x="3" y="6" width="18" height="14" rx="1"/><path d="M3 10h18"/><path d="M8 14h3v6H8z"/><path d="M14 14h3v3h-3z"/></svg>;
    case "hospital":    return <svg {...s}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>;
    case "school":      return <svg {...s}><path d="M2 12l10-6 10 6-10 6-10-6z"/><path d="M22 12v5"/><path d="M6 14.5V19a6 6 0 0 0 12 0v-4.5"/></svg>;
    case "temple":      return <svg {...s}><path d="M12 2v4"/><path d="M6 10a6 6 0 0 1 12 0"/><rect x="5" y="10" width="14" height="10" rx="1"/><path d="M10 20v-5h4v5"/></svg>;
    case "park":        return <svg {...s}><path d="M12 5L7 13h10L12 5z"/><path d="M12 9L6 19h12L12 9z"/><path d="M11 19h2v3h-2z"/></svg>;
    case "garden":      return <svg {...s}><circle cx="12" cy="8" r="4"/><path d="M12 12v8"/><path d="M8 16c2-1 4-1 4 0"/><path d="M16 16c-2-1-4-1-4 0"/></svg>;
    case "river":       return <svg {...s}><path d="M2 6c3 0 4 3 7 3s4-3 7-3 4 3 7 3"/><path d="M2 12c3 0 4 3 7 3s4-3 7-3 4 3 7 3"/><path d="M2 18c3 0 4 3 7 3s4-3 7-3 4 3 7 3"/></svg>;
    case "plaza":       return <svg {...s}><rect x="3" y="3" width="18" height="18" rx="1"/><circle cx="12" cy="12" r="3"/><path d="M12 6v3"/><path d="M12 15v3"/><path d="M6 12h3"/><path d="M15 12h3"/></svg>;
    case "market":      return <svg {...s}><path d="M3 7l2-4h14l2 4"/><path d="M3 7h18v13H3V7z"/><path d="M9 12h6v8H9z"/></svg>;
    case "dockyard":    return <svg {...s}><path d="M12 2v7"/><circle cx="12" cy="11" r="2"/><path d="M12 13v3"/><path d="M8 20a4 4 0 0 0 8 0"/><path d="M5 16h14"/></svg>;
    default:            return <svg {...s}><rect x="4" y="4" width="16" height="16" rx="2"/></svg>;
  }
}

const I = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const IconSelect = () => <I d="M4 4l7.07 17 2.51-7.39L21 11.07z" />;
const IconTrash = () => <I d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />;
const IconUndo = () => <I d="M3 10h13a4 4 0 0 1 0 8H7M3 10l5-5M3 10l5 5" />;
const IconRedo = () => <I d="M21 10H8a4 4 0 0 0 0 8h10M21 10l-5-5M21 10l-5 5" />;
const IconClear = () => <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>;
const IconFit = () => <I d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />;
const IconEval = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>;
const IconCopy = () => <I d="M9 9h10v10H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />;
const IconLock = ({ open = false }: { open?: boolean }) => open
  ? <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
  : <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IconSnap = () => <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5 3v6a4 4 0 0 0 4 4h6"/><path d="M19 3v6a4 4 0 0 1-4 4H9"/><circle cx="12" cy="19" r="2"/></svg>;
const Icon3D = () => <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>;
const IconOrbit = () => <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M20.2 8a9 9 0 1 0 .8 6" /><path d="M3.5 7l1.5 3 3-1" /></svg>;
const IconSave = () => <I d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8" />;
const IconLoad = () => <I d="M3 7v13h18V7M3 7l2-4h14l2 4M3 7h18M12 11v6M9 14l3 3 3-3" />;
const IconExport = () => <I d="M12 3v12M8 11l4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />;
const IconEye = ({ off = false }: { off?: boolean }) => off
  ? <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M1 1l22 22"/></svg>
  : <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>;

/* ═══════════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════════ */
function SimStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

      :root {
        --paper: #ecead8; --paper-2: #e3e0c8; --ink: #0e1726; --ink-soft: #2a3346;
        --rule: #6b7280; --rule-soft: rgba(14,23,38,0.16); --rule-hair: rgba(14,23,38,0.08);
        --accent: #ff5722; --accent-2: #1e6feb; --good: #1f7a3a; --warn: #b45309; --bad: #b91c1c;
        --bg-deep: var(--paper); --bg-panel: var(--paper-2); --bg-card: var(--paper);
        --bg-hover: rgba(14,23,38,0.05); --bg-active: rgba(14,23,38,0.1);
        --text: var(--ink); --text-dim: var(--ink-soft); --text-muted: var(--rule);
        --cyan: var(--accent); --cyan-dim: rgba(255,87,34,0.12); --cyan-glow: rgba(255,87,34,0.25);
        --orange: var(--accent); --orange-dim: rgba(255,87,34,0.15);
        --blue: var(--accent-2); --green: var(--good); --red: var(--bad);
        --border: var(--rule-soft); --border-light: var(--rule-hair); --border-cyan: rgba(255,87,34,0.25);
      }
      * { margin:0; padding:0; box-sizing:border-box; }
      html, body { background:var(--bg-deep); color:var(--text); height:100%; overflow:hidden; }
      body {
        font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;
        font-feature-settings:"ss01","cv11"; -webkit-font-smoothing:antialiased;
        background-image:radial-gradient(rgba(14,23,38,0.03) 1px,transparent 1px),radial-gradient(rgba(14,23,38,0.015) 1px,transparent 1px);
        background-size:24px 24px,24px 24px; background-position:0 0,12px 12px;
      }
      ::selection { background:var(--ink); color:var(--paper); }
      .mono { font-family:'JetBrains Mono',monospace; }
      .serif { font-family:'Instrument Serif',serif; font-style:italic; }

      .s-tape { background:var(--ink); color:var(--paper); border-bottom:1px solid #000; overflow:hidden; flex-shrink:0; }
      .s-tape-t { display:flex; gap:3rem; padding:0.55rem 0; white-space:nowrap; animation:s-slide 38s linear infinite; font-family:'JetBrains Mono',monospace; font-size:0.72rem; letter-spacing:0.18em; text-transform:uppercase; }
      .s-tape-t span { opacity:0.85; }
      .s-tape-t b { color:var(--accent); font-weight:700; }
      @keyframes s-slide { from{transform:translateX(0)} to{transform:translateX(-50%)} }

      .s-nav { display:flex; align-items:center; justify-content:space-between; padding:0.85rem 2rem; background:rgba(236,234,216,0.9); backdrop-filter:blur(8px); border-bottom:1px solid var(--rule-soft); flex-shrink:0; z-index:50; }
      .s-nav-brand { font-family:'Instrument Serif',serif; font-style:italic; font-size:1.6rem; letter-spacing:-0.01em; color:var(--ink); text-decoration:none; display:inline-flex; align-items:baseline; gap:0.35rem; }
      .s-nav-brand .dot { display:none; }
      .s-nav-brand .tag { font-family:'JetBrains Mono',monospace; font-style:normal; font-size:0.6rem; letter-spacing:0.18em; background:var(--accent); color:#fff; padding:2px 6px; border-radius:2px; transform:translateY(-6px); }
      .s-nav-links { display:flex; gap:1.5rem; align-items:center; font-family:'JetBrains Mono',monospace; font-size:0.72rem; letter-spacing:0.15em; text-transform:uppercase; }
      .s-nav-links a { color:var(--ink-soft); text-decoration:none; transition:color 0.15s; }
      .s-nav-links a:hover { color:var(--ink); }
      .s-nav-links .active { color:var(--accent); font-weight:600; }

      .s-page { display:flex; flex-direction:column; height:100vh; overflow:hidden; }
      .s-body { display:flex; flex:1; overflow:hidden; }

      .s-pal { width:240px; flex-shrink:0; background:var(--bg-panel); border-right:1px solid var(--border); display:flex; flex-direction:column; overflow-y:auto; }
      .s-pal-head { padding:0.85rem 1rem; font-family:'JetBrains Mono',monospace; font-size:0.65rem; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink); border-bottom:1px solid var(--border); display:flex; align-items:center; gap:0.5rem; font-weight:700; }
      .s-pal-head::before { content:''; width:16px; height:2px; background:var(--accent); }
      .s-sizes { display:flex; padding:0.5rem 0.75rem; gap:0; border-bottom:1px solid var(--border); }
      .s-sz { flex:1; padding:0.35rem 0; text-align:center; font-family:'JetBrains Mono',monospace; font-size:0.7rem; font-weight:600; background:transparent; border:1px solid var(--border); color:var(--text-dim); cursor:pointer; transition:all 0.12s; letter-spacing:0.05em; }
      .s-sz + .s-sz { border-left:none; }
      .s-sz.act { background:var(--ink); color:var(--paper); border-color:var(--ink); }
      .s-sz:hover:not(.act) { background:var(--bg-hover); color:var(--text); }
      .s-sz small { display:block; font-size:0.45rem; font-weight:400; opacity:0.75; margin-top:1px; }
      .s-cat { padding:0.6rem 0.75rem 0.25rem; font-family:'JetBrains Mono',monospace; font-size:0.55rem; letter-spacing:0.22em; text-transform:uppercase; color:var(--text-muted); }
      .s-item { display:flex; align-items:center; gap:0.5rem; margin:0.15rem 0.5rem; padding:0.45rem 0.5rem; background:transparent; border:1px solid transparent; cursor:grab; color:var(--text-dim); font-size:0.78rem; font-weight:500; user-select:none; transition:all 0.1s; }
      .s-item:hover { background:var(--bg-hover); border-color:var(--border); color:var(--text); }
      .s-item:active { cursor:grabbing; background:var(--bg-active); }
      .s-item-dot { width:8px; height:8px; border-radius:2px; flex-shrink:0; box-shadow:0 0 4px currentColor; }
      .s-item-zone { margin-left:auto; font-family:'JetBrains Mono',monospace; font-size:0.5rem; letter-spacing:0.1em; color:var(--text-muted); text-transform:uppercase; }
      .s-count { padding:0.65rem 0.75rem; font-family:'JetBrains Mono',monospace; font-size:0.6rem; color:var(--text-muted); letter-spacing:0.1em; text-transform:uppercase; border-top:1px solid var(--border); margin-top:auto; }

      .s-center { flex:1; display:flex; flex-direction:column; overflow:hidden; }

      .s-tb { display:flex; align-items:center; gap:2px; padding:0 0.75rem; height:44px; background:var(--bg-panel); border-bottom:1px solid var(--border); flex-shrink:0; overflow-x:auto; }
      .s-tb-g { display:flex; align-items:center; gap:2px; padding:0 0.35rem; }
      .s-tb-g + .s-tb-g { border-left:1px solid var(--border); padding-left:0.55rem; }
      .s-tb-b { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; background:transparent; border:none; cursor:pointer; color:var(--text-dim); transition:all 0.1s; position:relative; }
      .s-tb-b:hover { background:var(--bg-hover); color:var(--text); }
      .s-tb-b.act { background:var(--bg-active); color:var(--cyan); }
      .s-tb-b:disabled { opacity:0.25; cursor:default; }
      .s-tb-sp { flex:1; }
      .s-tb-lbl { font-family:'JetBrains Mono',monospace; font-size:0.6rem; color:var(--text-muted); letter-spacing:0.1em; padding:0 0.4rem; text-transform:uppercase; white-space:nowrap; }
      .s-tb-tilt { width:64px; height:3px; -webkit-appearance:none; appearance:none; background:rgba(14,23,38,0.1); border-radius:2px; border:none; outline:none; cursor:pointer; }
      .s-tb-tilt::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:var(--cyan); cursor:pointer; border:2px solid var(--bg-deep); }
      .s-tb-eval { display:inline-flex; align-items:center; gap:0.4rem; padding:0.45rem 1rem; background:var(--ink); color:var(--paper); border:1px solid var(--ink); cursor:pointer; font-family:'JetBrains Mono',monospace; font-size:0.65rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; text-decoration:none; transition:all 0.15s; white-space:nowrap; }
      .s-tb-eval:hover { background:var(--accent); border-color:var(--accent); color:#fff; transform:translateY(-1px); }

      .s-canvas-outer { flex:1; position:relative; overflow:hidden; background:radial-gradient(ellipse at 50% 60%,var(--paper),var(--paper-2)); }
      .s-canvas-outer::before { content:''; position:absolute; inset:-200px; background-image:linear-gradient(rgba(14,23,38,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(14,23,38,0.035) 1px,transparent 1px); background-size:80px 80px; pointer-events:none; z-index:0; }
      .s-perspective { position:absolute; inset:0; perspective-origin:50% 50%; z-index:1; }
      .s-plane { position:absolute; inset:0; transform-origin:center center; transform-style:preserve-3d; pointer-events:none; }
      .s-plane-surface { position:absolute; inset:0; }
      .s-inner { position:absolute; top:0; left:0; width:1px; height:1px; transform-origin:0 0; }
      .s-grid-plane { position:absolute; width:200000px; height:200000px; transform:translate(-100000px,-100000px); pointer-events:none; background-image:linear-gradient(rgba(14,23,38,0.1) 1px,transparent 1px),linear-gradient(90deg,rgba(14,23,38,0.1) 1px,transparent 1px),linear-gradient(rgba(14,23,38,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(14,23,38,0.035) 1px,transparent 1px); background-size:200px 200px,200px 200px,40px 40px,40px 40px; }
      .s-origin { position:absolute; left:0; top:0; width:1px; height:1px; pointer-events:none; }
      .s-origin::before { content:''; position:absolute; left:-30px; top:0; width:60px; height:1px; background:linear-gradient(90deg,transparent,var(--cyan),transparent); opacity:0.35; }
      .s-origin::after { content:''; position:absolute; left:0; top:-30px; width:1px; height:60px; background:linear-gradient(transparent,var(--cyan),transparent); opacity:0.35; }

      .s-block { position:absolute; border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; border:1.5px solid; backdrop-filter:blur(1px); transition:box-shadow 0.12s; box-shadow:0 2px 6px rgba(14,23,38,0.1),inset 0 1px 0 rgba(255,255,255,0.25); overflow:hidden; }
      .s-block.sel { border-color:var(--accent) !important; box-shadow:4px 4px 0 0 var(--ink),0 4px 12px rgba(14,23,38,0.15) !important; }
      .s-block.locked { opacity:0.65; }
      .s-block-lbl { font-family:'JetBrains Mono',monospace; font-size:0.48rem; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:var(--ink); pointer-events:none; text-align:center; line-height:1.2; }
      .s-block-icon { pointer-events:none; }
      .s-coverage { position:absolute; border-radius:50%; border:1px dashed rgba(31,122,58,0.4); background:rgba(31,122,58,0.05); pointer-events:none; }
      .s-handle { position:absolute; width:10px; height:10px; background:var(--cyan); border:2px solid var(--paper); border-radius:50%; z-index:10; pointer-events:none; box-shadow:0 2px 6px rgba(14,23,38,0.15); }
      .s-ghost { position:absolute; border:2px dashed var(--cyan); border-radius:4px; background:rgba(255,87,34,0.06); pointer-events:none; z-index:8999; }

      .s-overlay { position:absolute; inset:0; z-index:5; cursor:crosshair; }
      .s-overlay.pan { cursor:grab; }
      .s-overlay.pan:active { cursor:grabbing; }
      .s-overlay.orbit { cursor:move; }
      .s-overlay.move { cursor:move; }
      .s-overlay.del { cursor:not-allowed; }
      .s-overlay.rsz-nw,.s-overlay.rsz-se { cursor:nwse-resize; }
      .s-overlay.rsz-ne,.s-overlay.rsz-sw { cursor:nesw-resize; }

      .s-badge { position:absolute; z-index:20; padding:0.22rem 0.55rem; background:rgba(236,234,216,0.85); border:1px solid var(--border); font-family:'JetBrains Mono',monospace; font-size:0.58rem; color:var(--text-dim); letter-spacing:0.06em; pointer-events:none; backdrop-filter:blur(8px); box-shadow:2px 2px 0 0 rgba(14,23,38,0.06); }

      /* minimap */
      .s-minimap { position:absolute; bottom:42px; right:10px; width:150px; height:110px; background:rgba(227,224,200,0.92); border:1px solid var(--border); z-index:21; box-shadow:2px 2px 0 0 rgba(14,23,38,0.08); overflow:hidden; }
      .s-minimap-h { position:absolute; top:0; left:0; right:0; padding:2px 5px; font-family:'JetBrains Mono',monospace; font-size:0.5rem; letter-spacing:0.1em; color:var(--text-muted); text-transform:uppercase; z-index:2; }

      .s-rpanel { width:270px; flex-shrink:0; background:var(--bg-panel); border-left:1px solid var(--border); display:flex; flex-direction:column; overflow-y:auto; }
      .s-rp-head { padding:0.85rem 1rem; font-family:'JetBrains Mono',monospace; font-size:0.65rem; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink); border-bottom:1px solid var(--border); display:flex; align-items:center; gap:0.5rem; font-weight:700; }
      .s-rp-head::before { content:''; width:16px; height:2px; background:var(--accent); }
      .s-rp-empty { padding:1.5rem 0.85rem; text-align:center; font-family:'JetBrains Mono',monospace; font-size:0.65rem; color:var(--text-muted); line-height:1.7; }
      .s-pr { display:flex; align-items:center; gap:0.4rem; padding:0.3rem 0.85rem; }
      .s-pr-l { width:44px; flex-shrink:0; text-align:right; font-family:'JetBrains Mono',monospace; font-size:0.58rem; letter-spacing:0.06em; text-transform:uppercase; color:var(--text-muted); }
      .s-pr-i { flex:1; padding:0.3rem 0.5rem; font-family:'JetBrains Mono',monospace; font-size:0.72rem; background:var(--paper); border:1px solid var(--border); color:var(--text); outline:none; transition:border-color 0.12s; }
      .s-pr-i:focus { border-color:var(--cyan); }
      .s-pr-i[type="range"] { padding:0; height:3px; -webkit-appearance:none; appearance:none; background:rgba(14,23,38,0.1); border:none; }
      .s-pr-i[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:var(--cyan); cursor:pointer; border:2px solid var(--bg-deep); }
      .s-pr-div { height:1px; background:var(--border); margin:0.35rem 0.85rem; }
      .s-pr-acts { display:flex; gap:0.3rem; padding:0.4rem 0.85rem; flex-wrap:wrap; }
      .s-pr-btn { flex:1; min-width:70px; display:inline-flex; align-items:center; justify-content:center; gap:0.25rem; padding:0.45rem; font-family:'JetBrains Mono',monospace; font-size:0.6rem; letter-spacing:0.08em; text-transform:uppercase; background:transparent; border:1px solid var(--border); color:var(--text-dim); cursor:pointer; transition:all 0.1s; }
      .s-pr-btn:hover { background:var(--bg-hover); border-color:var(--text); color:var(--text); }
      .s-pr-btn.del:hover { background:rgba(185,28,28,0.08); border-color:var(--red); color:var(--red); }

      .s-ly { display:flex; align-items:center; gap:0.4rem; padding:0.45rem 0.65rem 0.45rem 0.85rem; cursor:pointer; transition:background 0.1s; font-size:0.72rem; border-left:3px solid transparent; border-bottom:1px solid var(--border-light); color:var(--text); }
      .s-ly:hover { background:var(--bg-hover); }
      .s-ly.act { background:var(--bg-active); border-left-color:var(--cyan); }
      .s-ly-d { width:7px; height:7px; border-radius:2px; flex-shrink:0; box-shadow:0 0 4px currentColor; }
      .s-ly-n { flex:1; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .s-ly-t { font-family:'JetBrains Mono',monospace; font-size:0.55rem; color:var(--text-muted); letter-spacing:0.06em; }
      .s-ly-v { background:none; border:none; cursor:pointer; color:var(--text-muted); padding:2px; display:inline-flex; transition:color 0.1s; }
      .s-ly-v:hover { color:var(--text); }
      .s-ly-v.off { opacity:0.3; }

      .s-pal::-webkit-scrollbar,.s-rpanel::-webkit-scrollbar,.s-eval-body::-webkit-scrollbar { width:4px; }
      .s-pal::-webkit-scrollbar-thumb,.s-rpanel::-webkit-scrollbar-thumb,.s-eval-body::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }

      /* ── Evaluation drawer ── */
      .s-eval-scrim { position:fixed; inset:0; background:rgba(14,23,38,0.35); z-index:200; opacity:0; pointer-events:none; transition:opacity 0.25s; }
      .s-eval-scrim.open { opacity:1; pointer-events:auto; }
      .s-eval { position:fixed; top:0; right:0; bottom:0; width:480px; max-width:92vw; background:var(--paper); border-left:1px solid var(--ink); box-shadow:-8px 0 0 0 rgba(14,23,38,0.06); z-index:201; transform:translateX(100%); transition:transform 0.3s cubic-bezier(0.4,0,0.2,1); display:flex; flex-direction:column; }
      .s-eval.open { transform:translateX(0); }
      .s-eval-head { display:flex; align-items:center; justify-content:space-between; padding:1.1rem 1.5rem; border-bottom:1px solid var(--ink); flex-shrink:0; }
      .s-eval-head .t { font-family:'JetBrains Mono',monospace; font-size:0.66rem; letter-spacing:0.2em; text-transform:uppercase; color:var(--accent); }
      .s-eval-head .x { background:none; border:1px solid var(--ink); width:30px; height:30px; cursor:pointer; color:var(--ink); display:inline-flex; align-items:center; justify-content:center; }
      .s-eval-head .x:hover { background:var(--ink); color:var(--paper); }
      .s-eval-body { flex:1; overflow-y:auto; padding:1.5rem; }
      .s-card { background:var(--paper); border:1px solid var(--ink); padding:1.25rem; margin-bottom:1.25rem; }
      .s-card.shadow { box-shadow:6px 6px 0 0 var(--ink); }
      .s-card.accent { box-shadow:6px 6px 0 0 var(--accent); }
      .s-sec-num { font-family:'JetBrains Mono',monospace; font-size:0.62rem; letter-spacing:0.2em; color:var(--accent); text-transform:uppercase; }
      .s-sec-h { font-family:'JetBrains Mono',monospace; font-size:0.66rem; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink-soft); display:flex; justify-content:space-between; }
      .s-score-big { font-family:'Instrument Serif',serif; font-style:italic; font-size:4.5rem; line-height:0.95; }
      .s-score-big small { font-size:1.1rem; color:var(--ink-soft); font-style:normal; font-family:'JetBrains Mono',monospace; letter-spacing:0.1em; }
      .s-grade { margin-top:0.3rem; font-family:'JetBrains Mono',monospace; font-size:0.66rem; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink-soft); }
      .s-grade b { color:var(--accent); }
      .s-srow { display:grid; grid-template-columns:96px 1fr 40px; gap:10px; align-items:center; font-family:'JetBrains Mono',monospace; font-size:0.68rem; margin:9px 0; color:var(--ink-soft); }
      .s-srow .lab { text-transform:uppercase; letter-spacing:0.1em; }
      .s-srow .bar { height:8px; background:var(--rule-soft); position:relative; overflow:hidden; }
      .s-srow .bar>span { position:absolute; left:0; top:0; bottom:0; transition:width 0.6s cubic-bezier(0.4,0,0.2,1); }
      .s-srow .v { text-align:right; font-family:'Instrument Serif',serif; font-style:italic; font-size:1rem; color:var(--ink); }
      .s-viol { padding:9px 11px; margin-bottom:7px; background:rgba(185,28,28,0.06); border-left:3px solid var(--bad); font-size:0.8rem; line-height:1.45; color:var(--ink); }
      .s-viol.warning { background:rgba(180,83,9,0.07); border-left-color:var(--warn); }
      .s-viol::before { content:'✕ '; font-family:'JetBrains Mono',monospace; color:var(--bad); font-weight:700; }
      .s-viol.warning::before { content:'▲ '; color:var(--warn); }
      .s-sugg { padding:9px 11px; margin-bottom:7px; background:var(--paper-2); border-left:3px solid var(--accent); font-size:0.82rem; line-height:1.45; font-family:'Instrument Serif',serif; font-style:italic; color:var(--ink); }
      .s-sugg::before { content:'✎ '; color:var(--accent); font-style:normal; font-family:'JetBrains Mono',monospace; font-weight:700; margin-right:4px; }
      .s-ok { font-size:0.82rem; color:var(--good); font-family:'JetBrains Mono',monospace; }
      .s-stat-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
      .s-stat { border:1px solid var(--border); padding:0.65rem 0.75rem; }
      .s-stat .n { font-family:'Instrument Serif',serif; font-style:italic; font-size:1.6rem; color:var(--ink); }
      .s-stat .l { font-family:'JetBrains Mono',monospace; font-size:0.55rem; letter-spacing:0.14em; text-transform:uppercase; color:var(--text-muted); }
    `}</style>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   EVAL DRAWER COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
function ScoreRow({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="s-srow">
      <span className="lab">{label}</span>
      <span className="bar"><span style={{ width: `${v}%`, background: scoreColor(v) }} /></span>
      <span className="v">{v.toFixed(0)}</span>
    </div>
  );
}

function EvalDrawer({ open, onClose, result, blockCount }: { open: boolean; onClose: () => void; result: EvalResult | null; blockCount: number }) {
  return (
    <>
      <div className={`s-eval-scrim${open ? " open" : ""}`} onClick={onClose} />
      <div className={`s-eval${open ? " open" : ""}`}>
        <div className="s-eval-head">
          <div>
            <div className="t">§ Layout Evaluation</div>
            <div className="serif" style={{ fontSize: "1.3rem", marginTop: 2 }}>Drafted assessment.</div>
          </div>
          <button className="x" onClick={onClose}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div className="s-eval-body">
          {!result || blockCount === 0 ? (
            <div className="s-rp-empty" style={{ paddingTop: "3rem" }}>
              Place blocks on the canvas,<br />then evaluate the layout.
            </div>
          ) : (
            <>
              {/* Composite */}
              <div className="s-card accent">
                <div className="s-sec-num" style={{ marginBottom: "0.4rem" }}>§ Composite Score</div>
                <div className="s-score-big" style={{ color: scoreColor(result.overall.score) }}>
                  {result.overall.score}<small>/100</small>
                </div>
                <div className="s-grade">Grade · <b>{result.overall.grade}</b></div>
                <div style={{ height: 1, background: "var(--rule-soft)", margin: "1rem 0" }} />
                <ScoreRow label="Zoning" value={result.overall.breakdown.zoning} />
                <ScoreRow label="Coverage" value={result.overall.breakdown.coverage} />
                <ScoreRow label="Connect." value={result.overall.breakdown.connectivity} />
                <ScoreRow label="Density" value={result.overall.breakdown.density} />
              </div>

              {/* Quick stats */}
              <div className="s-card">
                <div className="s-sec-h" style={{ marginBottom: "0.75rem" }}><span>Metrics</span><span style={{ color: "var(--accent)" }}>summary</span></div>
                <div className="s-stat-grid">
                  <div className="s-stat"><div className="n">{result.connectivity.totalBuildings}</div><div className="l">Buildings</div></div>
                  <div className="s-stat"><div className="n">{result.connectivity.components}</div><div className="l">Clusters</div></div>
                  <div className="s-stat"><div className="n">{result.coverage.pct}%</div><div className="l">Coverage</div></div>
                  <div className="s-stat"><div className="n">{result.violations.length}</div><div className="l">Violations</div></div>
                </div>
              </div>

              {/* Violations */}
              <div className="s-card">
                <div className="s-sec-h" style={{ marginBottom: "0.75rem" }}>
                  <span>Violations</span>
                  {result.violations.length > 0 && <span style={{ color: "var(--bad)" }}>{result.violations.length}</span>}
                </div>
                {result.violations.length > 0
                  ? result.violations.slice(0, 12).map((v, i) => <div key={i} className={`s-viol ${v.severity}`}>{v.message}</div>)
                  : <div className="s-ok">✓ No zoning violations detected</div>}
              </div>

              {/* Coverage detail */}
              {result.coverage.total > 0 && (
                <div className="s-card">
                  <div className="s-sec-h" style={{ marginBottom: "0.5rem" }}><span>Coverage Detail</span></div>
                  <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                    {result.coverage.covered} of {result.coverage.total} residential buildings served ({result.coverage.pct}%).
                  </p>
                  {result.coverage.uncovered.length > 0 && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.78rem", color: "var(--bad)", fontFamily: "'JetBrains Mono',monospace" }}>
                      ✕ Uncovered: {result.coverage.uncovered.join(", ")}
                    </div>
                  )}
                </div>
              )}

              {/* Suggestions */}
              <div className="s-card">
                <div className="s-sec-h" style={{ marginBottom: "0.75rem" }}><span>Suggestions</span></div>
                {result.suggestions.map((s, i) => <div key={i} className="s-sugg">{s}</div>)}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
export default function SimulationPage() {
  const [blocks, setBlocks] = useState<PlacedBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sizeIdx, setSizeIdx] = useState(1);
  const [tool, setTool] = useState<"select" | "delete">("select");
  const [pan, setPan] = useState({ x: 200, y: 150 });
  const [zoom, setZoom] = useState(1);
  const [pitch, setPitch] = useState(45);
  const [yaw, setYaw] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [showCoverage, setShowCoverage] = useState(false);
  const [snap, setSnap] = useState(true);
  const [history, setHistory] = useState<PlacedBlock[][]>([[]]);
  const [histIdx, setHistIdx] = useState(0);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [mouseWorld, setMouseWorld] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [orbitMode, setOrbitMode] = useState(false);
  const [cursorClass, setCursorClass] = useState("");
  const [evalOpen, setEvalOpen] = useState(false);
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>({ type: "none" });
  const nextId = useRef(1);
  const bRef = useRef(blocks); bRef.current = blocks;
  const panRef = useRef(pan); panRef.current = pan;
  const yawRef = useRef(yaw); yawRef.current = yaw;
  const pitchRef = useRef(pitch); pitchRef.current = pitch;

  const sel = blocks.find(b => b.id === selectedId) ?? null;

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  }, []);

  /* ── history ── */
  const pushH = useCallback((nb: PlacedBlock[]) => {
    setHistory(h => {
      const next = [...h.slice(0, histIdx + 1), nb].slice(-MAX_HIST);
      setHistIdx(next.length - 1);
      return next;
    });
  }, [histIdx]);

  const undo = useCallback(() => {
    if (histIdx <= 0) return;
    setHistIdx(histIdx - 1); setBlocks(history[histIdx - 1]); setSelectedId(null);
  }, [histIdx, history]);

  const redo = useCallback(() => {
    if (histIdx >= history.length - 1) return;
    setHistIdx(histIdx + 1); setBlocks(history[histIdx + 1]); setSelectedId(null);
  }, [histIdx, history]);

  /* ── helpers ── */
  const getRect = () => canvasRef.current?.getBoundingClientRect() ?? new DOMRect();
  const toWorld = useCallback((cx: number, cy: number) =>
    clientToWorld(cx, cy, getRect(), PERSPECTIVE, pitchRef.current, yawRef.current, panRef.current, zoom),
  [zoom]);
  const toCell = (wx: number, wy: number) => ({ x: Math.floor(wx / CELL), y: Math.floor(wy / CELL) });

  /* ── block ops ── */
  const addBlock = useCallback((type: string, cx: number, cy: number, w: number, h: number) => {
    const b: PlacedBlock = {
      id: `b${nextId.current++}`, type, x: cx, y: cy, w, h,
      rotation: 0, opacity: 1, visible: true, locked: false, zIndex: bRef.current.length,
    };
    const nb = [...bRef.current, b];
    setBlocks(nb); pushH(nb); setSelectedId(b.id); setTool("select");
  }, [pushH]);

  const delBlock = useCallback((id: string) => {
    const b = bRef.current.find(x => x.id === id);
    if (b?.locked) { showToast("Block is locked"); return; }
    const nb = bRef.current.filter(b => b.id !== id);
    setBlocks(nb); pushH(nb);
    if (selectedId === id) setSelectedId(null);
  }, [pushH, selectedId, showToast]);

  const updBlock = useCallback((id: string, u: Partial<PlacedBlock>) => {
    const nb = bRef.current.map(b => b.id === id ? { ...b, ...u } : b);
    setBlocks(nb); pushH(nb);
  }, [pushH]);

  const duplicateBlock = useCallback((id: string) => {
    const b = bRef.current.find(x => x.id === id);
    if (!b) return;
    const nb2: PlacedBlock = { ...b, id: `b${nextId.current++}`, x: b.x + 1, y: b.y + 1, locked: false, zIndex: bRef.current.length };
    const nb = [...bRef.current, nb2];
    setBlocks(nb); pushH(nb); setSelectedId(nb2.id);
  }, [pushH]);

  const clearAll = useCallback(() => {
    if (!bRef.current.length) return;
    setBlocks([]); pushH([]); setSelectedId(null);
  }, [pushH]);

  /* ── persistence ── */
  const saveLayout = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ blocks: bRef.current, nextId: nextId.current }));
      showToast("Layout saved");
    } catch { showToast("Save failed"); }
  }, [showToast]);

  const loadLayout = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { showToast("No saved layout"); return; }
      const data = JSON.parse(raw);
      if (Array.isArray(data.blocks)) {
        setBlocks(data.blocks); pushH(data.blocks);
        nextId.current = data.nextId || data.blocks.length + 1;
        setSelectedId(null); showToast("Layout loaded");
      }
    } catch { showToast("Load failed"); }
  }, [pushH, showToast]);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify({ blocks: bRef.current, evaluation: evaluateLayout(bRef.current) }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `planvision-layout-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url); showToast("Exported JSON");
  }, []);

  /* ── evaluation ── */
  const runEval = useCallback(() => {
    const r = evaluateLayout(bRef.current);
    setEvalResult(r); setEvalOpen(true);
  }, []);

  /* ── hit tests ── */
  const hitTest = useCallback((wx: number, wy: number) => {
    for (let i = bRef.current.length - 1; i >= 0; i--) {
      const b = bRef.current[i];
      if (!b.visible) continue;
      if (wx >= b.x * CELL && wx < (b.x + b.w) * CELL && wy >= b.y * CELL && wy < (b.y + b.h) * CELL) return b;
    }
    return null;
  }, []);

  const hitHandle = useCallback((wx: number, wy: number): string | null => {
    if (!sel || sel.locked) return null;
    const corners: Record<string, { x: number; y: number }> = {
      nw: { x: sel.x * CELL, y: sel.y * CELL },
      ne: { x: (sel.x + sel.w) * CELL, y: sel.y * CELL },
      sw: { x: sel.x * CELL, y: (sel.y + sel.h) * CELL },
      se: { x: (sel.x + sel.w) * CELL, y: (sel.y + sel.h) * CELL },
    };
    for (const [n, p] of Object.entries(corners)) {
      if (Math.abs(wx - p.x) < HANDLE_R / zoom + 5 && Math.abs(wy - p.y) < HANDLE_R / zoom + 5) return n;
    }
    return null;
  }, [sel, zoom]);

  const updateCursor = useCallback((wx: number, wy: number) => {
    if (orbitMode) { setCursorClass("orbit"); return; }
    if (spaceHeld) { setCursorClass("pan"); return; }
    if (tool === "delete") { setCursorClass("del"); return; }
    const h = hitHandle(wx, wy);
    if (h) { setCursorClass(`rsz-${h}`); return; }
    if (hitTest(wx, wy)) { setCursorClass("move"); return; }
    setCursorClass("");
  }, [orbitMode, spaceHeld, tool, hitHandle, hitTest]);

  /* ── mouse ── */
  const onDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    // orbit (right-drag, or orbit mode, or shift+drag)
    if (e.button === 2 || orbitMode || (e.shiftKey && e.button === 0)) {
      dragRef.current = { type: "orbit", startCx: e.clientX, startCy: e.clientY, startYaw: yawRef.current, startPitch: pitchRef.current };
      return;
    }
    // pan
    if (e.button === 1 || spaceHeld) {
      dragRef.current = { type: "pan", startCx: e.clientX, startCy: e.clientY, startPx: panRef.current.x, startPy: panRef.current.y };
      return;
    }
    if (dragRef.current.type === "palette") return;

    const w = toWorld(e.clientX, e.clientY);
    const h = hitHandle(w.x, w.y);
    if (h && sel) {
      dragRef.current = { type: "resize", blockId: sel.id, handle: h, orig: { ...sel } };
      return;
    }
    const hit = hitTest(w.x, w.y);
    if (hit) {
      if (tool === "delete") { delBlock(hit.id); return; }
      setSelectedId(hit.id);
      if (!hit.locked)
        dragRef.current = { type: "move", blockId: hit.id, offX: w.x - hit.x * CELL, offY: w.y - hit.y * CELL, orig: { ...hit } };
      return;
    }
    setSelectedId(null);
  }, [toWorld, orbitMode, spaceHeld, hitHandle, sel, hitTest, tool, delBlock]);

  const onMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;

    if (d.type === "orbit") {
      const dx = e.clientX - d.startCx;
      const dy = e.clientY - d.startCy;
      setYaw(((d.startYaw + dx * 0.4) % 360 + 360) % 360);
      setPitch(Math.max(0, Math.min(75, d.startPitch + dy * 0.3)));
      return;
    }

    const w = toWorld(e.clientX, e.clientY);
    const cell = toCell(w.x, w.y);
    setMouseWorld(cell);
    updateCursor(w.x, w.y);

    if (d.type === "pan") {
      const rect = getRect();
      const ws = clientToWorld(d.startCx, d.startCy, rect, PERSPECTIVE, pitchRef.current, yawRef.current, { x: d.startPx, y: d.startPy }, zoom);
      const wc = clientToWorld(e.clientX, e.clientY, rect, PERSPECTIVE, pitchRef.current, yawRef.current, { x: d.startPx, y: d.startPy }, zoom);
      setPan({ x: d.startPx + (wc.x - ws.x), y: d.startPy + (wc.y - ws.y) });
      return;
    }
    if (d.type === "palette") { setGhostPos({ x: cell.x, y: cell.y, w: d.w, h: d.h }); return; }
    if (d.type === "move") {
      const cx = snap ? Math.round((w.x - d.offX) / CELL) : Math.round((w.x - d.offX) / CELL);
      const cy = snap ? Math.round((w.y - d.offY) / CELL) : Math.round((w.y - d.offY) / CELL);
      setBlocks(prev => prev.map(b => b.id === d.blockId ? { ...b, x: cx, y: cy } : b));
      return;
    }
    if (d.type === "resize") {
      const o = d.orig; let nx = o.x, ny = o.y, nw = o.w, nh = o.h; const mc = cell;
      if (d.handle === "se") { nw = Math.max(1, mc.x - o.x + 1); nh = Math.max(1, mc.y - o.y + 1); }
      else if (d.handle === "sw") { nx = Math.min(mc.x, o.x + o.w - 1); nw = Math.max(1, o.x + o.w - nx); nh = Math.max(1, mc.y - o.y + 1); }
      else if (d.handle === "ne") { ny = Math.min(mc.y, o.y + o.h - 1); nw = Math.max(1, mc.x - o.x + 1); nh = Math.max(1, o.y + o.h - ny); }
      else if (d.handle === "nw") { nx = Math.min(mc.x, o.x + o.w - 1); ny = Math.min(mc.y, o.y + o.h - 1); nw = Math.max(1, o.x + o.w - nx); nh = Math.max(1, o.y + o.h - ny); }
      setBlocks(prev => prev.map(b => b.id === d.blockId ? { ...b, x: nx, y: ny, w: nw, h: nh } : b));
      return;
    }
  }, [toWorld, updateCursor, zoom, snap]);

  const onUp = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;
    if (d.type === "palette") {
      const w = toWorld(e.clientX, e.clientY);
      const cell = toCell(w.x, w.y);
      addBlock(d.blockType, cell.x, cell.y, d.w, d.h);
      setGhostPos(null);
    }
    if (d.type === "move" || d.type === "resize") pushH([...bRef.current]);
    dragRef.current = { type: "none" };
  }, [toWorld, addBlock, pushH]);

  /* ── wheel zoom ── */
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = getRect();
    const plane = clientToPlane(e.clientX, e.clientY, rect, PERSPECTIVE, pitchRef.current);
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    const npx = plane.x * (1 / nz - 1 / zoom) + pan.x;
    const npy = plane.y * (1 / nz - 1 / zoom) + pan.y;
    setZoom(nz); setPan({ x: npx, y: npy });
  }, [zoom, pan]);

  /* ── fit view ── */
  const fitView = useCallback(() => {
    if (!blocks.length) { setPan({ x: 200, y: 150 }); setZoom(1); return; }
    const rect = getRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of blocks) {
      x0 = Math.min(x0, b.x * CELL); y0 = Math.min(y0, b.y * CELL);
      x1 = Math.max(x1, (b.x + b.w) * CELL); y1 = Math.max(y1, (b.y + b.h) * CELL);
    }
    const bw = x1 - x0, bh = y1 - y0, pad = 0.2;
    const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(rect.width * (1 - 2 * pad) / bw, rect.height * (1 - 2 * pad) / bh)));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    setPan({ x: rect.width / (2 * nz) - cx, y: rect.height / (2 * nz) - cy }); setZoom(nz);
  }, [blocks]);

  const resetView = useCallback(() => { setPitch(45); setYaw(0); setPan({ x: 200, y: 150 }); setZoom(1); }, []);

  /* ── palette drag ── */
  const palDown = useCallback((typeId: string) => {
    dragRef.current = { type: "palette", blockType: typeId, w: SIZES[sizeIdx].w, h: SIZES[sizeIdx].h };
  }, [sizeIdx]);

  /* ── keyboard ── */
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === "Space") { e.preventDefault(); setSpaceHeld(true); }
      if ((e.code === "Delete" || e.code === "Backspace") && selectedId) delBlock(selectedId);
      if (e.ctrlKey && e.code === "KeyZ") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (e.ctrlKey && e.code === "KeyD" && selectedId) { e.preventDefault(); duplicateBlock(selectedId); }
      if (e.ctrlKey && e.code === "KeyS") { e.preventDefault(); saveLayout(); }
      // arrow nudge
      if (selectedId && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
        const b = bRef.current.find(x => x.id === selectedId);
        if (b && !b.locked) {
          const dx = e.code === "ArrowLeft" ? -1 : e.code === "ArrowRight" ? 1 : 0;
          const dy = e.code === "ArrowUp" ? -1 : e.code === "ArrowDown" ? 1 : 0;
          updBlock(selectedId, { x: b.x + dx, y: b.y + dy });
        }
      }
    };
    const ku = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceHeld(false); };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [selectedId, delBlock, undo, redo, duplicateBlock, saveLayout, updBlock]);

  /* ── global mouseup ── */
  useEffect(() => {
    const up = () => {
      const d = dragRef.current;
      if (d.type === "move" || d.type === "resize") pushH([...bRef.current]);
      dragRef.current = { type: "none" }; setGhostPos(null);
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [pushH]);

  /* ── live mini-stats ── */
  const liveStats = useMemo(() => {
    const buildings = blocks.filter(b => { const t = TYPE_MAP[b.type]; return t && t.zone !== "water" && t.zone !== "infra"; });
    const area = blocks.reduce((s, b) => s + b.w * b.h, 0);
    return { buildings: buildings.length, area };
  }, [blocks]);

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className="s-page">
      <SimStyles />

      {/* Tape */}
      <div className="s-tape" aria-hidden>
        <div className="s-tape-t">
          <span><b>● ACTIVE</b> &nbsp; SIMULATION CANVAS</span>
          <span>DRAG · DROP · ORBIT · EVALUATE</span>
          <span>SHEET S-02 / LAYOUT</span>
          <span><b>►</b> DESIGN MODE</span>
          <span>INFINITE 3D CANVAS</span>
          <span><b>● ACTIVE</b> &nbsp; SIMULATION CANVAS</span>
          <span>DRAG · DROP · ORBIT · EVALUATE</span>
          <span>SHEET S-02 / LAYOUT</span>
          <span><b>►</b> DESIGN MODE</span>
          <span>INFINITE 3D CANVAS</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="s-nav">
        <Link href="/" className="s-nav-brand">plan<span className="dot">.</span>vision <span className="tag">SIM</span></Link>
        <div className="s-nav-links">
          <Link href="/">Home</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/static">Static</Link>
          <span className="active">Canvas</span>
        </div>
      </nav>

      <div className="s-body">
        {/* ── LEFT PALETTE ── */}
        <aside className="s-pal">
          <div className="s-pal-head">Block Palette</div>
          <div className="s-sizes">
            {SIZES.map((s, i) => (
              <button key={s.label} className={`s-sz${i === sizeIdx ? " act" : ""}`} onClick={() => setSizeIdx(i)}>
                {s.label}<small>{s.w}×{s.h}</small>
              </button>
            ))}
          </div>
          {CATEGORIES.map(cat => (
            <div key={cat}>
              <div className="s-cat">{cat}</div>
              {BLOCK_TYPES.filter(b => b.category === cat).map(bt => (
                <div key={bt.id} className="s-item" onMouseDown={() => palDown(bt.id)} title={`Zone: ${bt.zone} · Buffer: ${bt.bufferCm}cm`}>
                  <span className="s-item-dot" style={{ background: bt.color, color: bt.color }} />
                  <BlockIcon type={bt.id} size={15} />
                  <span>{bt.name}</span>
                  <span className="s-item-zone">{bt.zone}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="s-count">{blocks.length} block{blocks.length !== 1 ? "s" : ""} · {liveStats.buildings} bldg · {liveStats.area} cells</div>
        </aside>

        {/* ── CENTER ── */}
        <div className="s-center">
          {/* Toolbar */}
          <div className="s-tb">
            <div className="s-tb-g">
              <button className={`s-tb-b${tool === "select" ? " act" : ""}`} onClick={() => setTool("select")} title="Select (V)"><IconSelect /></button>
              <button className={`s-tb-b${tool === "delete" ? " act" : ""}`} onClick={() => setTool("delete")} title="Delete tool"><IconTrash /></button>
            </div>
            <div className="s-tb-g">
              <button className={`s-tb-b${showGrid ? " act" : ""}`} onClick={() => setShowGrid(!showGrid)} title="Grid">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              </button>
              <button className={`s-tb-b${snap ? " act" : ""}`} onClick={() => setSnap(!snap)} title="Snap to grid"><IconSnap /></button>
              <button className={`s-tb-b${showCoverage ? " act" : ""}`} onClick={() => setShowCoverage(!showCoverage)} title="Show service coverage">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" strokeDasharray="3 3"/><circle cx="12" cy="12" r="2"/></svg>
              </button>
            </div>
            <div className="s-tb-g">
              <button className="s-tb-b" onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.25))} title="Zoom in">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h6"/><path d="M11 8v6"/></svg>
              </button>
              <button className="s-tb-b" onClick={() => setZoom(z => Math.max(MIN_ZOOM, z / 1.25))} title="Zoom out">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h6"/></svg>
              </button>
              <button className="s-tb-b" onClick={fitView} title="Fit to content"><IconFit /></button>
            </div>
            <div className="s-tb-g">
              <button className="s-tb-b" onClick={undo} disabled={histIdx <= 0} title="Undo (Ctrl+Z)"><IconUndo /></button>
              <button className="s-tb-b" onClick={redo} disabled={histIdx >= history.length - 1} title="Redo (Ctrl+Shift+Z)"><IconRedo /></button>
              <button className="s-tb-b" onClick={clearAll} title="Clear all"><IconClear /></button>
            </div>
            <div className="s-tb-g">
              <button className={`s-tb-b${orbitMode ? " act" : ""}`} onClick={() => setOrbitMode(!orbitMode)} title="Orbit mode (or right-drag / shift-drag)"><IconOrbit /></button>
              <Icon3D />
              <input type="range" className="s-tb-tilt" min={0} max={75} value={pitch} onChange={e => setPitch(+e.target.value)} title={`Pitch: ${pitch}°`} />
              <span className="s-tb-lbl">P{pitch}°</span>
              <input type="range" className="s-tb-tilt" min={0} max={359} value={yaw} onChange={e => setYaw(+e.target.value)} title={`Yaw: ${yaw}°`} />
              <span className="s-tb-lbl">Y{yaw}°</span>
              <button className="s-tb-b" onClick={resetView} title="Reset view">
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
              </button>
            </div>
            <div className="s-tb-g">
              <button className="s-tb-b" onClick={saveLayout} title="Save (Ctrl+S)"><IconSave /></button>
              <button className="s-tb-b" onClick={loadLayout} title="Load"><IconLoad /></button>
              <button className="s-tb-b" onClick={exportJSON} title="Export JSON"><IconExport /></button>
            </div>
            <div className="s-tb-sp" />
            <button className="s-tb-eval" onClick={runEval}><IconEval /> Evaluate</button>
          </div>

          {/* Canvas */}
          <div className="s-canvas-outer" ref={canvasRef}>
            <div className="s-perspective" style={{ perspective: `${PERSPECTIVE}px` }}>
              <div className="s-plane" style={{ transform: `rotateX(${pitch}deg) rotateZ(${yaw}deg)` }}>
                <div className="s-plane-surface">
                  <div className="s-inner" style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)` }}>
                    {showGrid && <div className="s-grid-plane" />}
                    <div className="s-origin" />

                    {/* coverage rings */}
                    {showCoverage && blocks.filter(b => b.visible && (TYPE_MAP[b.type]?.coverageRadiusCm ?? 0) > 0).map(b => {
                      const rCm = TYPE_MAP[b.type]!.coverageRadiusCm;
                      const rPx = (rCm / CM_PER_CELL) * CELL;
                      const ccx = (b.x + b.w / 2) * CELL, ccy = (b.y + b.h / 2) * CELL;
                      return <div key={`cov-${b.id}`} className="s-coverage" style={{ left: ccx - rPx, top: ccy - rPx, width: rPx * 2, height: rPx * 2 }} />;
                    })}

                    {/* blocks */}
                    {blocks.filter(b => b.visible).map(block => {
                      const bt = TYPE_MAP[block.type];
                      const c = bt?.color ?? "#888";
                      const isSel = selectedId === block.id;
                      return (
                        <div key={block.id}>
                          <div
                            className={`s-block${isSel ? " sel" : ""}${block.locked ? " locked" : ""}`}
                            style={{
                              left: block.x * CELL, top: block.y * CELL,
                              width: block.w * CELL, height: block.h * CELL,
                              background: `${c}22`, borderColor: `${c}aa`,
                              opacity: block.opacity, zIndex: block.zIndex,
                              transform: `rotate(${block.rotation}deg)`,
                            }}
                          >
                            <div className="s-block-icon" style={{ color: c }}>
                              <BlockIcon type={block.type} size={block.w * CELL > 50 ? 22 : 14} />
                            </div>
                            {block.w * CELL >= 55 && <span className="s-block-lbl">{block.label || bt?.name}</span>}
                          </div>
                          {isSel && !block.locked && (
                            <>
                              <div className="s-handle" style={{ left: block.x * CELL - 5, top: block.y * CELL - 5 }} />
                              <div className="s-handle" style={{ left: (block.x + block.w) * CELL - 5, top: block.y * CELL - 5 }} />
                              <div className="s-handle" style={{ left: block.x * CELL - 5, top: (block.y + block.h) * CELL - 5 }} />
                              <div className="s-handle" style={{ left: (block.x + block.w) * CELL - 5, top: (block.y + block.h) * CELL - 5 }} />
                            </>
                          )}
                        </div>
                      );
                    })}

                    {ghostPos && (
                      <div className="s-ghost" style={{ left: ghostPos.x * CELL, top: ghostPos.y * CELL, width: ghostPos.w * CELL, height: ghostPos.h * CELL }} />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`s-overlay ${cursorClass}`}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onWheel={onWheel}
              onContextMenu={e => e.preventDefault()}
            />

            {/* badges */}
            <div className="s-badge" style={{ bottom: 10, right: 10 }}>{Math.round(zoom * 100)}%</div>
            <div className="s-badge" style={{ bottom: 10, left: 10 }}>X: {mouseWorld.x} &ensp; Y: {mouseWorld.y}</div>
            <div className="s-badge" style={{ top: 10, right: 10 }}>Pitch {pitch}° · Yaw {yaw}°</div>
            <div className="s-badge" style={{ top: 10, left: 10 }}>{orbitMode ? "ORBIT MODE — drag to rotate" : "Right-drag or Shift-drag to orbit"}</div>

            {/* minimap */}
            <div className="s-minimap">
              <div className="s-minimap-h">Minimap</div>
              <svg width="150" height="110" style={{ display: "block" }}>
                {(() => {
                  if (!blocks.length) return null;
                  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
                  for (const b of blocks) {
                    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
                    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
                  }
                  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
                  const sc = Math.min(140 / bw, 95 / bh);
                  const ox = (150 - bw * sc) / 2, oy = (110 - bh * sc) / 2 + 6;
                  return blocks.filter(b => b.visible).map(b => {
                    const c = TYPE_MAP[b.type]?.color ?? "#888";
                    return <rect key={b.id} x={ox + (b.x - x0) * sc} y={oy + (b.y - y0) * sc} width={b.w * sc} height={b.h * sc} fill={c} opacity={selectedId === b.id ? 1 : 0.6} stroke={selectedId === b.id ? "#0e1726" : "none"} strokeWidth={selectedId === b.id ? 1 : 0} />;
                  });
                })()}
              </svg>
            </div>

            {/* toast */}
            {toast && (
              <div style={{ position: "absolute", bottom: 60, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", color: "var(--paper)", padding: "0.5rem 1.1rem", fontFamily: "'JetBrains Mono',monospace", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", zIndex: 30, boxShadow: "3px 3px 0 0 rgba(255,87,34,0.4)" }}>
                {toast}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <aside className="s-rpanel">
          <div className="s-rp-head">Properties</div>
          {sel ? (
            <div>
              <div className="s-pr" style={{ paddingTop: "0.5rem" }}>
                <span className="s-pr-l">Type</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, color: TYPE_MAP[sel.type]?.color }}>
                  <BlockIcon type={sel.type} size={14} />
                  {TYPE_MAP[sel.type]?.name}
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.5rem", color: "var(--text-muted)", letterSpacing: "0.1em" }}>{TYPE_MAP[sel.type]?.zone}</span>
                </div>
              </div>
              <div className="s-pr">
                <span className="s-pr-l">Name</span>
                <input className="s-pr-i" placeholder={TYPE_MAP[sel.type]?.name} value={sel.label || ""} onChange={e => updBlock(sel.id, { label: e.target.value })} />
              </div>
              <div className="s-pr-div" />
              <div className="s-pr"><span className="s-pr-l">X</span><input type="number" className="s-pr-i mono" value={sel.x} onChange={e => updBlock(sel.id, { x: +e.target.value || 0 })} /></div>
              <div className="s-pr"><span className="s-pr-l">Y</span><input type="number" className="s-pr-i mono" value={sel.y} onChange={e => updBlock(sel.id, { y: +e.target.value || 0 })} /></div>
              <div className="s-pr-div" />
              <div className="s-pr"><span className="s-pr-l">W</span><input type="number" className="s-pr-i mono" min={1} max={20} value={sel.w} onChange={e => updBlock(sel.id, { w: Math.max(1, +e.target.value || 1) })} /></div>
              <div className="s-pr"><span className="s-pr-l">H</span><input type="number" className="s-pr-i mono" min={1} max={20} value={sel.h} onChange={e => updBlock(sel.id, { h: Math.max(1, +e.target.value || 1) })} /></div>
              <div className="s-pr-div" />
              <div className="s-pr">
                <span className="s-pr-l">Rot</span>
                <select className="s-pr-i mono" value={sel.rotation} onChange={e => updBlock(sel.id, { rotation: +e.target.value })}>
                  <option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option>
                </select>
              </div>
              <div className="s-pr">
                <span className="s-pr-l">Alpha</span>
                <input type="range" className="s-pr-i" min={0.1} max={1} step={0.05} value={sel.opacity} onChange={e => updBlock(sel.id, { opacity: +e.target.value })} />
                <span className="mono" style={{ fontSize: "0.6rem", color: "var(--text-muted)", width: 28 }}>{Math.round(sel.opacity * 100)}%</span>
              </div>
              <div className="s-pr-div" />
              <div className="s-pr-acts">
                <button className="s-pr-btn" onClick={() => updBlock(sel.id, { rotation: (sel.rotation + 90) % 360 })}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/></svg> Rotate
                </button>
                <button className="s-pr-btn" onClick={() => duplicateBlock(sel.id)}><IconCopy /> Dupe</button>
                <button className="s-pr-btn" onClick={() => updBlock(sel.id, { locked: !sel.locked })}>
                  <IconLock open={!sel.locked} /> {sel.locked ? "Unlock" : "Lock"}
                </button>
                <button className="s-pr-btn del" onClick={() => delBlock(sel.id)}><IconTrash /> Delete</button>
              </div>
            </div>
          ) : (
            <div className="s-rp-empty">Select a block to inspect</div>
          )}

          <div className="s-rp-head" style={{ marginTop: "auto" }}>Layers ({blocks.length})</div>
          {blocks.length === 0 ? (
            <div className="s-rp-empty" style={{ paddingBottom: "2rem" }}>No blocks placed yet.<br />Drag from palette to begin.</div>
          ) : (
            <div style={{ maxHeight: "38vh", overflowY: "auto" }}>
              {[...blocks].reverse().map(block => {
                const bt = TYPE_MAP[block.type];
                return (
                  <div key={block.id} className={`s-ly${selectedId === block.id ? " act" : ""}`} onClick={() => setSelectedId(block.id)}>
                    <span className="s-ly-d" style={{ background: bt?.color, color: bt?.color }} />
                    <span className="s-ly-n">{block.label || bt?.name}</span>
                    <span className="s-ly-t">{block.w}×{block.h}</span>
                    {block.locked && <span className="s-ly-v"><IconLock /></span>}
                    <button className={`s-ly-v${!block.visible ? " off" : ""}`} onClick={e => { e.stopPropagation(); updBlock(block.id, { visible: !block.visible }); }}>
                      <IconEye off={!block.visible} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {/* Evaluation Drawer */}
      <EvalDrawer open={evalOpen} onClose={() => setEvalOpen(false)} result={evalResult} blockCount={blocks.length} />
    </div>
  );
}
