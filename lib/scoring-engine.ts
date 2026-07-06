/**
 * scoring-engine.ts — Shared scoring module for plan.vision
 *
 * All pages (static, camera, simulation) import from here.
 * Scoring is deterministic, client-side, and requires only the
 * detected object list + registry metadata.
 *
 * 10 scoring axes:
 *   1. Zoning Compliance      (15%)
 *   2. Functional Synergy     (12%)
 *   3. Service Coverage       (12%)
 *   4. Road Network Quality   (10%)
 *   5. Diversity Index        (10%)
 *   6. Density Balance        ( 8%)
 *   7. Edge Penalty           ( 8%)
 *   8. Cluster Coherence      ( 8%)
 *   9. Historical Accuracy    (10%)
 *  10. Minimum Pieces         ( 7%)
 */

// ═══════════════════════════════════════════════════════════════════════
// TYPES — shared across all pages
// ═══════════════════════════════════════════════════════════════════════

export interface DetectedObject {
  name: string;
  center: number[];   // [cx, cy] in pixels
  box: number[];      // [x1, y1, x2, y2] in pixels
}

export interface RegistryBuilding {
  display_name: string;
  type: string;
  zone: string;
  color: string;
  traffic_weight: number;
  buffer_zone_cm: number;
  coverage_radius_cm: number;
  needs_water_coverage?: boolean;
  is_road?: boolean;
}

export interface Violation {
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

export interface CoverageResult {
  total_needing_coverage: number;
  covered: number;
  uncovered: string[];
  coverage_pct: number;
}

export interface ConnectivityResult {
  total_buildings: number;
  connected_components: number;
  is_fully_connected: boolean;
  connectivity_pct: number;
}

export interface DensityResult {
  quadrants: Record<string, number>;
  balance_score: number;
}

export interface AxisScore {
  score: number;       // 0–100
  label: string;       // display label
  weight: number;      // 0–1
  detail: string;      // one-line explanation
  items?: string[];    // optional itemised notes
}

export interface OverallScore {
  overall: number;
  grade: string;
  breakdown: Record<string, number>;   // axis-label → score
  axes: AxisScore[];
}

export interface Evaluation {
  violations: Violation[];
  coverage: CoverageResult;
  connectivity: ConnectivityResult;
  density: DensityResult;
  overall: OverallScore;
  suggestions: string[];
}

export interface AppState {
  objects: DetectedObject[];
  evaluation: Evaluation | null;
  frame_size: { width: number; height: number };
  timestamp: number | null;
  is_running: boolean;
}

export interface Snapshot {
  filename: string;
  name: string;
  timestamp: string;
  object_count: number;
  overall_score: number;
  grade: string;
}

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

export const API_BASE = "http://localhost:5000";

/** Default px/cm ratio — override via config if camera changes */
export const DEFAULT_PIXELS_PER_CM = 20;

/** Zone compatibility matrix (false = incompatible) */
const ZONE_COMPAT: Record<string, Record<string, boolean>> = {
  industrial:  { industrial: true, residential: false, commercial: true,  utility: true  },
  residential: { industrial: false, residential: true,  commercial: true,  utility: true  },
  commercial:  { industrial: true,  residential: true,  commercial: true,  utility: true  },
  utility:     { industrial: true,  residential: true,  commercial: true,  utility: true  },
};

/**
 * Synergy pairs — placing these within range earns a bonus.
 * `maxDistCm`: maximum distance for synergy to count.
 */
const SYNERGY_PAIRS: { a: string; b: string; label: string; maxDistCm: number; bonus: number }[] = [
  { a: "bead_factory",      b: "loading_platform", label: "Production ↔ Transport",   maxDistCm: 30, bonus: 12 },
  { a: "big_house",         b: "reservoir",        label: "Residence ↔ Water",         maxDistCm: 40, bonus: 10 },
  { a: "dockyard",          b: "warehouse",        label: "Port ↔ Storage",            maxDistCm: 25, bonus: 10 },
  { a: "citadel",           b: "big_house",        label: "Admin ↔ Residence",         maxDistCm: 35, bonus: 8  },
  { a: "bead_factory",      b: "dockyard",         label: "Factory ↔ Port (trade)",    maxDistCm: 35, bonus: 8  },
  { a: "bead_factory",      b: "warehouse",        label: "Factory ↔ Storage",         maxDistCm: 30, bonus: 6  },
  { a: "loading_platform",  b: "warehouse",        label: "Transport ↔ Storage",       maxDistCm: 25, bonus: 6  },
];

/**
 * Service requirements — each service type + its providers + radius.
 * Residential buildings should have access to ALL listed services.
 */
const SERVICE_REQUIREMENTS: { service: string; providers: string[]; radiusCm: number }[] = [
  { service: "Water",     providers: ["reservoir"],         radiusCm: 40 },
  { service: "Transport", providers: ["loading_platform"],  radiusCm: 35 },
  { service: "Admin",     providers: ["citadel"],           radiusCm: 50 },
];

/** Required building types (at least one each) */
const REQUIRED_TYPES = ["big_house", "reservoir", "loading_platform"];
const MIN_TOTAL_PIECES = 5;

/** Lothal historical placement rules */
const HISTORICAL_RULES: {
  building: string;
  rule: string;
  check: (obj: DetectedObject, allObjs: DetectedObject[], fw: number, fh: number) => boolean;
  weight: number;
}[] = [
  {
    building: "citadel",
    rule: "Citadel should be in the central/upper area",
    check: (obj, _, fw, fh) => {
      const [cx, cy] = obj.center;
      const inCenterX = cx > fw * 0.2 && cx < fw * 0.8;
      const inUpperHalf = cy < fh * 0.6;
      return inCenterX && inUpperHalf;
    },
    weight: 3,
  },
  {
    building: "dockyard",
    rule: "Dockyard should be near the edge of the layout",
    check: (obj, _, fw, fh) => {
      const [cx, cy] = obj.center;
      const margin = 0.2;
      return cx < fw * margin || cx > fw * (1 - margin) || cy < fh * margin || cy > fh * (1 - margin);
    },
    weight: 2,
  },
  {
    building: "bead_factory",
    rule: "Bead Factory should be in the commercial zone (away from residences)",
    check: (obj, allObjs, _, __) => {
      const residences = allObjs.filter(o => o.name === "big_house");
      if (residences.length === 0) return true;
      const minDist = Math.min(...residences.map(r => distPx(obj, r)));
      return minDist > 80; // at least 80px away from residences
    },
    weight: 2,
  },
  {
    building: "warehouse",
    rule: "Warehouse should be near the dockyard or loading platform",
    check: (obj, allObjs) => {
      const targets = allObjs.filter(o => o.name === "dockyard" || o.name === "loading_platform");
      if (targets.length === 0) return false;
      const minDist = Math.min(...targets.map(t => distPx(obj, t)));
      return minDist < 150; // within reasonable range
    },
    weight: 1.5,
  },
];

// ═══════════════════════════════════════════════════════════════════════
// GEOMETRY HELPERS
// ═══════════════════════════════════════════════════════════════════════

function distPx(a: DetectedObject, b: DetectedObject): number {
  return Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]);
}

function distCm(a: DetectedObject, b: DetectedObject, pxPerCm: number): number {
  return distPx(a, b) / pxPerCm;
}

// ═══════════════════════════════════════════════════════════════════════
// AXIS 1 — ZONING COMPLIANCE (15%)
// ═══════════════════════════════════════════════════════════════════════

function scoreZoning(
  objects: DetectedObject[],
  registry: Record<string, RegistryBuilding>,
  pxPerCm: number,
): { score: number; violations: Violation[]; goodAdjacencies: number; detail: string; items: string[] } {
  const violations: Violation[] = [];
  let goodPairs = 0;
  const items: string[] = [];

  for (let i = 0; i < objects.length; i++) {
    const metaA = registry[objects[i].name];
    if (!metaA) continue;

    for (let j = i + 1; j < objects.length; j++) {
      const metaB = registry[objects[j].name];
      if (!metaB) continue;

      const d = distCm(objects[i], objects[j], pxPerCm);
      const zoneA = metaA.zone;
      const zoneB = metaB.zone;
      const compatible = ZONE_COMPAT[zoneA]?.[zoneB] ?? true;

      if (!compatible) {
        const requiredBuffer = Math.max(metaA.buffer_zone_cm, metaB.buffer_zone_cm);
        if (d < requiredBuffer) {
          const severity: "critical" | "warning" = d < requiredBuffer * 0.5 ? "critical" : "warning";
          violations.push({
            building_a: objects[i].name,
            building_a_display: metaA.display_name,
            building_b: objects[j].name,
            building_b_display: metaB.display_name,
            zone_a: zoneA,
            zone_b: zoneB,
            distance_cm: Math.round(d * 10) / 10,
            required_buffer_cm: requiredBuffer,
            severity,
            message: `${metaA.display_name} (${zoneA}) is ${d.toFixed(1)}cm from ${metaB.display_name} (${zoneB}) — needs ${requiredBuffer}cm buffer`,
          });
          items.push(`✕ ${metaA.display_name} ↔ ${metaB.display_name}: ${d.toFixed(1)}cm (need ${requiredBuffer}cm)`);
        }
      } else if (d < 30) {
        // Compatible and close = good adjacency
        goodPairs++;
      }
    }
  }

  const totalPairs = objects.length * (objects.length - 1) / 2;
  const violationPenalty = totalPairs > 0
    ? Math.min(1, violations.length / Math.max(totalPairs, 1)) * 3
    : 0;
  const goodBonus = totalPairs > 0
    ? Math.min(0.15, (goodPairs / Math.max(totalPairs, 1)) * 0.3)
    : 0;

  const raw = Math.max(0, Math.min(100, 100 * (1 - violationPenalty) + goodBonus * 100));
  const detail = violations.length > 0
    ? `${violations.length} violation${violations.length > 1 ? "s" : ""}, ${goodPairs} good adjacencies`
    : `All zones compatible · ${goodPairs} synergistic adjacencies`;

  return { score: Math.round(raw), violations, goodAdjacencies: goodPairs, detail, items };
}

// ═══════════════════════════════════════════════════════════════════════
// AXIS 2 — FUNCTIONAL SYNERGY (12%)
// ═══════════════════════════════════════════════════════════════════════

function scoreSynergy(
  objects: DetectedObject[],
  registry: Record<string, RegistryBuilding>,
  pxPerCm: number,
): AxisScore {
  let totalBonus = 0;
  const maxBonus = SYNERGY_PAIRS.reduce((s, p) => s + p.bonus, 0);
  const foundPairs: string[] = [];

  for (const pair of SYNERGY_PAIRS) {
    const groupA = objects.filter(o => o.name === pair.a);
    const groupB = objects.filter(o => o.name === pair.b);

    let found = false;
    for (const a of groupA) {
      for (const b of groupB) {
        if (distCm(a, b, pxPerCm) <= pair.maxDistCm) {
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (found) {
      totalBonus += pair.bonus;
      foundPairs.push(`✓ ${pair.label}`);
    } else if (groupA.length > 0 && groupB.length > 0) {
      foundPairs.push(`✕ ${pair.label} — too far apart`);
    }
  }

  const score = maxBonus > 0 ? Math.round((totalBonus / maxBonus) * 100) : 0;

  return {
    score,
    label: "Synergy",
    weight: 0.12,
    detail: `${foundPairs.filter(p => p.startsWith("✓")).length} of ${SYNERGY_PAIRS.length} synergistic pairs active`,
    items: foundPairs,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// AXIS 3 — SERVICE COVERAGE (12%)
// ═══════════════════════════════════════════════════════════════════════

function scoreServiceCoverage(
  objects: DetectedObject[],
  registry: Record<string, RegistryBuilding>,
  pxPerCm: number,
): { axis: AxisScore; coverage: CoverageResult } {
  // Residential buildings that need services
  const residentials = objects.filter(o => {
    const meta = registry[o.name];
    return meta && (meta.needs_water_coverage || meta.zone === "residential");
  });

  if (residentials.length === 0) {
    return {
      axis: {
        score: 100,
        label: "Coverage",
        weight: 0.12,
        detail: "No residential buildings requiring coverage",
      },
      coverage: { total_needing_coverage: 0, covered: 0, uncovered: [], coverage_pct: 100 },
    };
  }

  let totalServiceHits = 0;
  const totalServiceChecks = residentials.length * SERVICE_REQUIREMENTS.length;
  const uncoveredNames: string[] = [];
  const items: string[] = [];

  for (const res of residentials) {
    const resMeta = registry[res.name];
    let servicesHit = 0;
    const missing: string[] = [];

    for (const svc of SERVICE_REQUIREMENTS) {
      const providers = objects.filter(o => svc.providers.includes(o.name));
      const covered = providers.some(p => distCm(res, p, pxPerCm) <= svc.radiusCm);
      if (covered) {
        servicesHit++;
      } else {
        missing.push(svc.service);
      }
    }

    totalServiceHits += servicesHit;

    if (missing.length > 0) {
      const displayName = resMeta?.display_name || res.name;
      uncoveredNames.push(displayName);
      items.push(`✕ ${displayName} lacks: ${missing.join(", ")}`);
    }
  }

  const pct = totalServiceChecks > 0
    ? Math.round((totalServiceHits / totalServiceChecks) * 100)
    : 100;

  // Also compute simple water coverage for backward compat
  const waterProviders = objects.filter(o => {
    const m = registry[o.name];
    return m && (m.coverage_radius_cm || 0) > 0;
  });
  const waterCovered = residentials.filter(r =>
    waterProviders.some(p => {
      const pm = registry[p.name];
      return pm && distCm(r, p, pxPerCm) <= pm.coverage_radius_cm;
    })
  ).length;

  return {
    axis: {
      score: pct,
      label: "Coverage",
      weight: 0.12,
      detail: `${totalServiceHits}/${totalServiceChecks} service checks passed`,
      items,
    },
    coverage: {
      total_needing_coverage: residentials.length,
      covered: waterCovered,
      uncovered: uncoveredNames,
      coverage_pct: residentials.length > 0
        ? Math.round((waterCovered / residentials.length) * 100)
        : 100,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// AXIS 4 — ROAD NETWORK QUALITY (10%)
// ═══════════════════════════════════════════════════════════════════════

function scoreRoadNetwork(
  objects: DetectedObject[],
  registry: Record<string, RegistryBuilding>,
  pxPerCm: number,
): { axis: AxisScore; connectivity: ConnectivityResult } {
  if (objects.length === 0) {
    return {
      axis: { score: 100, label: "Network", weight: 0.10, detail: "No objects to evaluate" },
      connectivity: { total_buildings: 0, connected_components: 0, is_fully_connected: true, connectivity_pct: 100 },
    };
  }

  const n = objects.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };

  const maxConnectionCm = 30;
  const roadIndices = objects
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => registry[o.name]?.is_road);

  const items: string[] = [];

  for (let i = 0; i < n; i++) {
    const metaI = registry[objects[i].name];
    for (let j = i + 1; j < n; j++) {
      const metaJ = registry[objects[j].name];
      const d = distCm(objects[i], objects[j], pxPerCm);

      const isRoadI = metaI?.is_road ?? false;
      const isRoadJ = metaJ?.is_road ?? false;
      const effectiveRadius = (isRoadI || isRoadJ)
        ? maxConnectionCm * 1.5
        : maxConnectionCm;

      if (d <= effectiveRadius) {
        union(i, j);
      }
    }
  }

  // Also connect via road bridge: A—road—B
  for (const { i: ri } of roadIndices) {
    const connectedToRoad: number[] = [];
    for (let k = 0; k < n; k++) {
      if (k === ri) continue;
      if (distCm(objects[k], objects[ri], pxPerCm) <= maxConnectionCm * 1.2) {
        connectedToRoad.push(k);
      }
    }
    for (let a = 0; a < connectedToRoad.length; a++) {
      for (let b = a + 1; b < connectedToRoad.length; b++) {
        union(connectedToRoad[a], connectedToRoad[b]);
      }
    }
  }

  const roots = new Set(Array.from({ length: n }, (_, i) => find(i)));
  const components = roots.size;
  const largest = Math.max(
    ...Array.from(roots).map(r =>
      Array.from({ length: n }, (_, i) => i).filter(i => find(i) === r).length
    )
  );

  const connPct = n > 0 ? Math.round((largest / n) * 100) : 100;

  // Bonus if roads connect the whole graph
  const roadBonus = roadIndices.length > 0 && components === 1 ? 5 : 0;
  // Penalty for isolated buildings
  const isolatedCount = n - largest;
  const isolatedPenalty = isolatedCount * 8;

  const raw = Math.max(0, Math.min(100, connPct + roadBonus - isolatedPenalty));

  if (components > 1) {
    items.push(`${components} disconnected clusters — add roads/loading platforms to bridge them`);
  }
  if (roadIndices.length === 0 && n > 2) {
    items.push("No roads/loading platforms detected — add transport infrastructure");
  }

  return {
    axis: {
      score: Math.round(raw),
      label: "Network",
      weight: 0.10,
      detail: components === 1
        ? `Fully connected · ${roadIndices.length} road nodes`
        : `${components} clusters · ${isolatedCount} isolated buildings`,
      items,
    },
    connectivity: {
      total_buildings: n,
      connected_components: components,
      is_fully_connected: components <= 1,
      connectivity_pct: connPct,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// AXIS 5 — DIVERSITY INDEX (10%)
// ═══════════════════════════════════════════════════════════════════════

function scoreDiversity(objects: DetectedObject[]): AxisScore {
  if (objects.length === 0) {
    return { score: 0, label: "Diversity", weight: 0.10, detail: "No objects placed" };
  }

  const counts: Record<string, number> = {};
  for (const obj of objects) {
    counts[obj.name] = (counts[obj.name] || 0) + 1;
  }

  const types = Object.keys(counts);
  const total = objects.length;

  // Shannon entropy
  let entropy = 0;
  for (const count of Object.values(counts)) {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  // Normalise against max possible entropy (all types equally distributed)
  const maxEntropy = types.length > 1 ? Math.log2(types.length) : 1;
  const normalised = maxEntropy > 0 ? entropy / maxEntropy : 0;

  // Also reward having more unique types (out of 7 possible)
  const typeBonus = Math.min(1, types.length / 5) * 0.3;

  const raw = Math.min(100, Math.round((normalised * 0.7 + typeBonus) * 100));

  const items = types.map(t => `${t}: ×${counts[t]}`);

  return {
    score: raw,
    label: "Diversity",
    weight: 0.10,
    detail: `${types.length} unique types · entropy ${entropy.toFixed(2)}`,
    items,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// AXIS 6 — DENSITY BALANCE (8%)
// ═══════════════════════════════════════════════════════════════════════

function scoreDensity(
  objects: DetectedObject[],
  registry: Record<string, RegistryBuilding>,
  frameW: number,
  frameH: number,
): { axis: AxisScore; density: DensityResult } {
  const midX = frameW / 2;
  const midY = frameH / 2;
  const quads: Record<string, number> = { NW: 0, NE: 0, SW: 0, SE: 0 };
  let weightedTotal = 0;

  for (const obj of objects) {
    const [cx, cy] = obj.center;
    const meta = registry[obj.name];
    const w = meta?.traffic_weight ?? 1;
    const q = (cy < midY ? "N" : "S") + (cx < midX ? "W" : "E");
    quads[q] += w;
    weightedTotal += w;
  }

  if (weightedTotal === 0) {
    return {
      axis: { score: 100, label: "Density", weight: 0.08, detail: "No objects to measure" },
      density: { quadrants: quads, balance_score: 100 },
    };
  }

  const ideal = weightedTotal / 4;
  const deviation = Object.values(quads).reduce((s, c) => s + Math.abs(c - ideal), 0);
  const maxDev = weightedTotal * 1.5;
  const balance = Math.max(0, Math.round(100 * (1 - deviation / maxDev)));

  const items = Object.entries(quads).map(([q, c]) => `${q}: ${c.toFixed(1)} weight`);

  return {
    axis: {
      score: balance,
      label: "Density",
      weight: 0.08,
      detail: `Balance ${balance}% · weighted by traffic importance`,
      items,
    },
    density: { quadrants: quads, balance_score: balance },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// AXIS 7 — EDGE PENALTY (8%)
// ═══════════════════════════════════════════════════════════════════════

function scoreEdge(
  objects: DetectedObject[],
  frameW: number,
  frameH: number,
): AxisScore {
  if (objects.length === 0) {
    return { score: 100, label: "Placement", weight: 0.08, detail: "No objects" };
  }

  const marginPx = Math.min(frameW, frameH) * 0.06; // ~6% margin
  let edgeCount = 0;
  const items: string[] = [];

  for (const obj of objects) {
    const [cx, cy] = obj.center;
    const tooClose = cx < marginPx || cx > frameW - marginPx ||
                     cy < marginPx || cy > frameH - marginPx;
    if (tooClose) {
      edgeCount++;
      items.push(`${obj.name} is too close to the frame edge`);
    }
  }

  const ratio = edgeCount / objects.length;
  const score = Math.max(0, Math.round(100 * (1 - ratio * 1.5)));

  return {
    score,
    label: "Placement",
    weight: 0.08,
    detail: edgeCount === 0
      ? "All pieces well within frame"
      : `${edgeCount} piece${edgeCount > 1 ? "s" : ""} too close to edge`,
    items,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// AXIS 8 — CLUSTER COHERENCE (8%)
// ═══════════════════════════════════════════════════════════════════════

function scoreClusterCoherence(
  objects: DetectedObject[],
  registry: Record<string, RegistryBuilding>,
  pxPerCm: number,
): AxisScore {
  // Industrial should cluster with industrial, residential with residential
  const zones: Record<string, DetectedObject[]> = {};
  for (const obj of objects) {
    const meta = registry[obj.name];
    if (!meta) continue;
    const z = meta.zone;
    if (!zones[z]) zones[z] = [];
    zones[z].push(obj);
  }

  let totalCompactness = 0;
  let zoneCount = 0;
  const items: string[] = [];

  for (const [zone, group] of Object.entries(zones)) {
    if (group.length < 2) continue;

    // Compute average intra-zone distance
    let totalDist = 0;
    let pairs = 0;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        totalDist += distCm(group[i], group[j], pxPerCm);
        pairs++;
      }
    }
    const avgDist = pairs > 0 ? totalDist / pairs : 0;

    // Score: closer = more compact = better
    // 0–15cm → excellent, 15–30 → good, 30+ → sprawl
    const compact = avgDist <= 15 ? 100 : avgDist <= 30 ? 80 : Math.max(0, 100 - avgDist * 2);
    totalCompactness += compact;
    zoneCount++;
    items.push(`${zone}: avg ${avgDist.toFixed(1)}cm between ${group.length} buildings`);
  }

  const score = zoneCount > 0 ? Math.round(totalCompactness / zoneCount) : 100;

  return {
    score,
    label: "Clustering",
    weight: 0.08,
    detail: zoneCount > 0
      ? `${zoneCount} zone clusters evaluated`
      : "Insufficient buildings for clustering analysis",
    items,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// AXIS 9 — HISTORICAL ACCURACY (10%)
// ═══════════════════════════════════════════════════════════════════════

function scoreHistorical(
  objects: DetectedObject[],
  frameW: number,
  frameH: number,
): AxisScore {
  let totalWeight = 0;
  let earnedWeight = 0;
  const items: string[] = [];

  for (const rule of HISTORICAL_RULES) {
    const matching = objects.filter(o => o.name === rule.building);
    if (matching.length === 0) continue;

    totalWeight += rule.weight;
    const passes = matching.some(o => rule.check(o, objects, frameW, frameH));
    if (passes) {
      earnedWeight += rule.weight;
      items.push(`✓ ${rule.rule}`);
    } else {
      items.push(`✕ ${rule.rule}`);
    }
  }

  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 50;

  return {
    score,
    label: "Historical",
    weight: 0.10,
    detail: totalWeight > 0
      ? `${items.filter(i => i.startsWith("✓")).length}/${items.length} Lothal rules satisfied`
      : "No historically-relevant pieces detected",
    items,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// AXIS 10 — MINIMUM PIECE REQUIREMENT (7%)
// ═══════════════════════════════════════════════════════════════════════

function scoreMinPieces(
  objects: DetectedObject[],
): AxisScore {
  const items: string[] = [];

  // Check minimum total
  const totalOk = objects.length >= MIN_TOTAL_PIECES;
  if (!totalOk) {
    items.push(`Need at least ${MIN_TOTAL_PIECES} pieces (have ${objects.length})`);
  }

  // Check required types
  const types = new Set(objects.map(o => o.name));
  let requiredMet = 0;
  for (const req of REQUIRED_TYPES) {
    if (types.has(req)) {
      requiredMet++;
    } else {
      items.push(`Missing required: ${req}`);
    }
  }

  const totalScore = totalOk ? 50 : Math.round((objects.length / MIN_TOTAL_PIECES) * 50);
  const typeScore = Math.round((requiredMet / REQUIRED_TYPES.length) * 50);
  const score = Math.min(100, totalScore + typeScore);

  return {
    score,
    label: "Completeness",
    weight: 0.07,
    detail: totalOk && requiredMet === REQUIRED_TYPES.length
      ? `${objects.length} pieces · all required types present`
      : `${objects.length}/${MIN_TOTAL_PIECES} pieces · ${requiredMet}/${REQUIRED_TYPES.length} required types`,
    items,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// SUGGESTIONS ENGINE
// ═══════════════════════════════════════════════════════════════════════

function generateSuggestions(axes: AxisScore[], violations: Violation[]): string[] {
  const suggestions: string[] = [];

  // Sort axes by score (worst first) and suggest improvements
  const weakAxes = axes.filter(a => a.score < 70).sort((a, b) => a.score - b.score);

  for (const axis of weakAxes.slice(0, 4)) {
    switch (axis.label) {
      case "Zoning":
        if (violations.length > 0) {
          const zones = new Set(violations.map(v => `${v.zone_a}↔${v.zone_b}`));
          suggestions.push(`Move incompatible zone pairs apart: ${[...zones].slice(0, 2).join(", ")}. Buffer zones need more separation.`);
        }
        break;
      case "Synergy":
        suggestions.push("Place logically related buildings closer together — factory near loading platform, residence near reservoir.");
        break;
      case "Coverage":
        suggestions.push("Add a reservoir or loading platform near uncovered residences. Each home needs water + transport + admin access.");
        break;
      case "Network":
        suggestions.push("Add loading platforms (roads) to connect isolated building clusters into a unified city.");
        break;
      case "Diversity":
        suggestions.push("Add more building types — a good city needs variety: residential, commercial, utilities, and infrastructure.");
        break;
      case "Density":
        suggestions.push("Spread buildings more evenly across the layout — avoid clustering everything in one corner.");
        break;
      case "Placement":
        suggestions.push("Move pieces away from the frame edges — buildings at the border feel unrealistic.");
        break;
      case "Clustering":
        suggestions.push("Group similar-zone buildings together — keep industrial near industrial, residential near residential.");
        break;
      case "Historical":
        suggestions.push("For Lothal accuracy: place the citadel centrally, dockyard at the edge, factory away from homes.");
        break;
      case "Completeness":
        suggestions.push(`Your city needs more pieces. Try adding: ${REQUIRED_TYPES.filter(r => !axes.find(a => a.items?.includes(r))).join(", ")}.`);
        break;
    }
  }

  if (suggestions.length === 0) {
    suggestions.push("Excellent layout — your city scores well across all evaluation axes. Minor tweaks could push it to perfection.");
  }

  return suggestions;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN EVALUATION — combines all 10 axes
// ═══════════════════════════════════════════════════════════════════════

export interface EvaluateOptions {
  pixelsPerCm?: number;
  frameWidth?: number;
  frameHeight?: number;
}

export function evaluateLayout(
  objects: DetectedObject[],
  registry: Record<string, RegistryBuilding>,
  options: EvaluateOptions = {},
): Evaluation {
  const pxPerCm = options.pixelsPerCm ?? DEFAULT_PIXELS_PER_CM;
  const frameW = options.frameWidth ?? 1280;
  const frameH = options.frameHeight ?? 720;

  // Run all axes
  const zoning = scoreZoning(objects, registry, pxPerCm);
  const synergy = scoreSynergy(objects, registry, pxPerCm);
  const { axis: coverageAxis, coverage } = scoreServiceCoverage(objects, registry, pxPerCm);
  const { axis: networkAxis, connectivity } = scoreRoadNetwork(objects, registry, pxPerCm);
  const diversity = scoreDiversity(objects);
  const { axis: densityAxis, density } = scoreDensity(objects, registry, frameW, frameH);
  const edge = scoreEdge(objects, frameW, frameH);
  const cluster = scoreClusterCoherence(objects, registry, pxPerCm);
  const historical = scoreHistorical(objects, frameW, frameH);
  const minPieces = scoreMinPieces(objects);

  const zoningAxis: AxisScore = {
    score: zoning.score,
    label: "Zoning",
    weight: 0.15,
    detail: zoning.detail,
    items: zoning.items,
  };

  const axes: AxisScore[] = [
    zoningAxis,    // 15%
    synergy,       // 12%
    coverageAxis,  // 12%
    networkAxis,   // 10%
    diversity,     // 10%
    densityAxis,   //  8%
    edge,          //  8%
    cluster,       //  8%
    historical,    // 10%
    minPieces,     //  7%
  ];

  // Weighted overall
  const overall = Math.round(
    axes.reduce((sum, a) => sum + a.score * a.weight, 0)
  );
  const clampedOverall = Math.max(0, Math.min(100, overall));

  // Grade
  let grade: string;
  if (clampedOverall >= 90) grade = "A";
  else if (clampedOverall >= 80) grade = "B+";
  else if (clampedOverall >= 70) grade = "B";
  else if (clampedOverall >= 60) grade = "C";
  else if (clampedOverall >= 40) grade = "D";
  else grade = "F";

  // Breakdown as flat record
  const breakdown: Record<string, number> = {};
  for (const a of axes) {
    breakdown[a.label.toLowerCase()] = a.score;
  }

  // Legacy breakdown for backward compat
  breakdown.zoning = zoning.score;
  breakdown.coverage = coverageAxis.score;
  breakdown.connectivity = networkAxis.score;
  breakdown.density = densityAxis.score;

  const suggestions = generateSuggestions(axes, zoning.violations);

  return {
    violations: zoning.violations,
    coverage,
    connectivity,
    density,
    overall: {
      overall: clampedOverall,
      grade,
      breakdown,
      axes,
    },
    suggestions,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// UI HELPERS — shared across all pages
// ═══════════════════════════════════════════════════════════════════════

export function scoreColor(value: number): string {
  if (value >= 90) return "#1f7a3a";
  if (value >= 75) return "#3f8d2c";
  if (value >= 60) return "#b45309";
  if (value >= 40) return "#c2410c";
  return "#b91c1c";
}

export function gradeLetter(n: number): string {
  if (n >= 90) return "A";
  if (n >= 80) return "B+";
  if (n >= 70) return "B";
  if (n >= 60) return "C";
  return "D";
}

// ═══════════════════════════════════════════════════════════════════════
// API HELPERS — shared fetchers
// ═══════════════════════════════════════════════════════════════════════

export async function fetchRegistry(): Promise<Record<string, RegistryBuilding> | null> {
  try {
    const res = await fetch(`${API_BASE}/api/registry`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.buildings || null;
  } catch {
    return null;
  }
}

export async function fetchState(): Promise<AppState | null> {
  try {
    const res = await fetch(`${API_BASE}/api/state`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchSnapshots(): Promise<Snapshot[]> {
  try {
    const res = await fetch(`${API_BASE}/api/snapshots`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function saveSnapshot(name?: string): Promise<string | null> {
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

export async function detectImage(
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
