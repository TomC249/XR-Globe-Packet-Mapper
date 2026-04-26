/**
 * NetworkArcs.js — LOD aggregation system
 *
 * Zoomed OUT: one tube per destination, thickness + colour = traffic volume
 * Zoomed IN:  individual lines per flow, spread slightly so they don't overlap
 *
 * LOD switches at camera radius threshold, can mess with threshold
 */
import {
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
} from '@babylonjs/core';

// ── Protocol colours (used in zoomed-in individual mode) ──────────────────
const PROTOCOL_COLORS = {
  TCP:   new Color3(0.00, 0.90, 1.00),
  UDP:   new Color3(1.00, 0.65, 0.15),
  ICMP:  new Color3(0.94, 0.33, 0.31),
  DNS:   new Color3(0.67, 0.28, 0.74),
  HTTP:  new Color3(0.40, 0.73, 0.41),
  HTTPS: new Color3(0.40, 0.73, 0.41),
  OTHER: new Color3(0.33, 0.43, 0.48),
};

// ── Heat scale (used in zoomed-out aggregated mode) ───────────────────────
const HEAT_SCALE = [
  { min: 1,  color: new Color3(0.00, 0.90, 1.00) },  // cyan
  { min: 3,  color: new Color3(0.40, 0.73, 0.41) },  // green
  { min: 6,  color: new Color3(0.95, 0.85, 0.10) },  // yellow
  { min: 12, color: new Color3(1.00, 0.55, 0.10) },  // orange
  { min: 25, color: new Color3(0.80, 0.20, 1.00) },  // purple
  { min: 50, color: new Color3(1.00, 0.60, 0.00) },  // deep amber — extreme
];

// Reserved exclusively for flagged/suspicious traffic
const FLAGGED_COLOR = new Color3(1.00, 0.10, 0.10);
// ── Tuning ─────────────────────────────────────────────────────────────────
const BEZIER_SEGMENTS    = 48;
const ARC_HEIGHT_FACTOR  = 0.55;
const LOD_ZOOM_THRESHOLD = 14;   // camera radius — below = zoomed in (closer than before)
const MAX_FLOW_AGE       = 15.0;  // seconds before a flow is dropped from group
const HOLD_DURATION      = 4.0;
const FADE_DURATION      = 1.5;
const MAX_GROUPS         = 120;

// Individual arc spread — how far apart zoomed-in arcs fan out
const SPREAD_RADIUS_MAX  = 0.32;
const SPREAD_PUSH_SCALE  = 3.2;
const GOLDEN_ANGLE       = 2.399963229728653;

export class NetworkArcs {
  #scene;
  #radius;
  #camera;

  // Map of `srcIp->dstIp` => FlowGroup
  #groups = new Map();

  // Rendered meshes — rebuilt when LOD changes or group updates
  #meshes = [];
  #lastLOD = null;
  #dirtyGroups = new Set();

  constructor(scene, globeRadius, camera) {
    this.#scene  = scene;
    this.#radius = globeRadius;
    this.#camera = camera;
  }

  // ── Public ────────────────────────────────────────────────────────────────

  addArc(flow) {
    const { srcLat, srcLon, dstLat, dstLon, protocol, bytes = 0, dstIp = 'unknown' } = flow;

    if (!this.#isValidCoord(srcLat, srcLon) || !this.#isValidCoord(dstLat, dstLon)) return;

    const src = latLonToVec3(srcLat, srcLon, this.#radius);
    const dst = latLonToVec3(dstLat, dstLon, this.#radius);
    if (Vector3.Distance(src, dst) < 0.01) return;

    // Group by destination plus coarse source bucket so flows converge
    // on one endpoint while still appearing from many origins.
    const srcLatBucket = Math.round(srcLat * 4) / 4;
    const srcLonBucket = Math.round(srcLon * 4) / 4;
    const key = `${dstIp}|${srcLatBucket.toFixed(2)},${srcLonBucket.toFixed(2)}`;

    if (!this.#groups.has(key)) {
      if (this.#groups.size >= MAX_GROUPS) {
        // Evict the oldest group
        const oldestKey = this.#groups.keys().next().value;
        this.#destroyGroup(this.#groups.get(oldestKey));
        this.#groups.delete(oldestKey);
      }
      this.#groups.set(key, {
        key,
        srcLat, srcLon, dstLat, dstLon,
        src, dst,
        flows: [],
        age: 0,
        alpha: 0,
        phase: 'FADE_IN',
        timer: 0,
        mesh: null,
        mat:  null,
      });
    }

    const group = this.#groups.get(key);

    // Add this individual flow to the group
    group.flows.push({
      protocol: protocol?.toUpperCase() ?? 'OTHER',
      bytes,
      age: 0,
    });

    this.#dirtyGroups.add(key);
  }

  tick(dt) {
    const cameraRadius = this.#camera.radius;
    const isZoomedIn   = cameraRadius < LOD_ZOOM_THRESHOLD;
    const lodChanged   = isZoomedIn !== this.#lastLOD;

    if (lodChanged) {
      // Force rebuild of all groups when LOD switches
      for (const key of this.#groups.keys()) this.#dirtyGroups.add(key);
      this.#lastLOD = isZoomedIn;
    }

    for (const [key, group] of this.#groups) {
      // Age out old flows within the group
      group.flows = group.flows.filter(f => {
        f.age += dt;
        return f.age < MAX_FLOW_AGE;
      });

      // Remove empty groups
      if (group.flows.length === 0) {
        group.phase = 'FADE_OUT';
      }

      // Lifecycle
      switch (group.phase) {
        case 'FADE_IN': {
          group.timer += dt;
          group.alpha = Math.min(1, group.timer / 0.6);
          if (group.alpha >= 1) { group.phase = 'HOLD'; group.timer = 0; }
          break;
        }
        case 'HOLD': {
          group.timer += dt;
          if (group.timer >= HOLD_DURATION) { group.phase = 'FADE_OUT'; group.timer = 0; }
          break;
        }
        case 'FADE_OUT': {
          group.timer += dt;
          group.alpha = Math.max(0, 1 - group.timer / FADE_DURATION);
          if (group.timer >= FADE_DURATION) {
            this.#destroyGroup(group);
            this.#groups.delete(key);
            continue;
          }
          break;
        }
      }

      // Rebuild mesh if group is dirty
      if (this.#dirtyGroups.has(key)) {
        this.#rebuildGroupMesh(group, isZoomedIn);
        this.#dirtyGroups.delete(key);
      }

      // Apply alpha to all meshes in group
      if (group.meshes) {
        for (const m of group.meshes) m.alpha = group.alpha;
      }
    }
  }

  get activeCount() {
    let total = 0;
    for (const g of this.#groups.values()) total += g.flows.length;
    return total;
  }

  // ── Private: mesh building ────────────────────────────────────────────────

  #rebuildGroupMesh(group, isZoomedIn) {
    // Dispose old meshes
    this.#destroyGroup(group);
    group.meshes = [];

    if (isZoomedIn) {
      this.#buildIndividualMeshes(group);
    } else {
      this.#buildAggregatedMesh(group);
    }
  }

  /** Zoomed OUT — one fat tube, colour = heat scale based on flow count */
  #buildAggregatedMesh(group) {
  const count  = group.flows.length;
  const flagged = group.flows.some(f => f.flagged);
  const color  = flagged ? FLAGGED_COLOR : this.#heatColor(count);
  const weight = Math.min(5, 0.5 + Math.log10(count + 1) * 1.8);

  const mat = new StandardMaterial('aggMat', this.#scene);
  mat.emissiveColor = color;
  mat.disableLighting = true;
  mat.alpha = group.alpha;

  // Flagged arcs pulse — achieved by storing the mat reference
  if (flagged) group._flagged = true;

  const curve = computeBezierCurve(
    group.src, group.dst, this.#radius, ARC_HEIGHT_FACTOR, BEZIER_SEGMENTS
  );

  const mesh = MeshBuilder.CreateTube('aggArc', {
    path: curve,
    radius: 0.015 * weight,
    tessellation: 5,
    updatable: false,
  }, this.#scene);

  mesh.material = mat;
  mesh.isPickable = false;
  mesh.alpha = group.alpha;

  group.meshes = [mesh];
  group._mat = mat;
}

#buildIndividualMeshes(group) {
  group.meshes = [];
  const count = group.flows.length;
  const chordDir = group.dst.subtract(group.src).normalize();

  // Build a stable local 2D basis around the arc path.
  let axisA = Vector3.Cross(chordDir, new Vector3(0, 1, 0));
  if (axisA.lengthSquared() < 1e-6) {
    axisA = Vector3.Cross(chordDir, new Vector3(1, 0, 0));
  }
  axisA = axisA.normalize();
  const axisB = Vector3.Cross(chordDir, axisA).normalize();

  group.flows.forEach((flow, i) => {
    const normalizedRank = count > 1 ? Math.sqrt(i / (count - 1)) : 0;
    const radius = normalizedRank * SPREAD_RADIUS_MAX;
    const angle = i * GOLDEN_ANGLE;

    const offsetVec = axisA.scale(Math.cos(angle) * radius)
      .add(axisB.scale(Math.sin(angle) * radius));

    // Keep shared endpoints and spread only through the control point.
    const source = group.src;
    const destination = group.dst;
    const mid = source.add(destination).scale(0.5);
    const chordLength = Vector3.Distance(source, destination);
    const apexRadius = this.#radius + chordLength * (ARC_HEIGHT_FACTOR + radius * 0.22);
    const control = mid.normalize().scale(apexRadius)
      .add(offsetVec.scale(SPREAD_PUSH_SCALE));

    const curve = [];
    for (let s = 0; s <= BEZIER_SEGMENTS; s++) {
      const t = s / BEZIER_SEGMENTS;
      const inv = 1 - t;
      curve.push(
        source.scale(inv * inv)
          .add(control.scale(2 * inv * t))
          .add(destination.scale(t * t))
      );
    }

    // Flagged flows always red regardless of protocol
    const color = flow.flagged
      ? FLAGGED_COLOR
      : (PROTOCOL_COLORS[flow.protocol] ?? PROTOCOL_COLORS.OTHER);

    const mesh = MeshBuilder.CreateLines('indArc', {
      points: curve,
      updatable: false,
    }, this.#scene);

    mesh.color = color;
    mesh.alpha = group.alpha;
    mesh.isPickable = false;
    group.meshes.push(mesh);
  });
}

  #destroyGroup(group) {
    if (group.meshes) {
      for (const m of group.meshes) m.dispose();
      group.meshes = [];
    }
    if (group._mat) { group._mat.dispose(); group._mat = null; }
  }

  #heatColor(count) {
    let color = HEAT_SCALE[0].color;
    for (const step of HEAT_SCALE) {
      if (count >= step.min) color = step.color;
    }
    return color;
  }

  #isValidCoord(lat, lon) {
    return (
      typeof lat === 'number' && typeof lon === 'number' &&
      isFinite(lat) && isFinite(lon) &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
    );
  }
}

// ── Geometry helpers ──────────────────────────────────────────────────────

export function latLonToVec3(lat, lon, radius) {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new Vector3(
    radius * Math.sin(phi) * Math.cos(theta),  // no negative
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}
export function computeBezierCurve(p0, p2, radius, heightFactor, segments) {
  const mid         = p0.add(p2).scale(0.5);
  const chordLength = Vector3.Distance(p0, p2);
  const apexRadius  = radius + chordLength * heightFactor;
  const p1          = mid.normalize().scale(apexRadius);

  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, inv = 1 - t;
    points.push(
      p0.scale(inv * inv)
        .add(p1.scale(2 * inv * t))
        .add(p2.scale(t * t))
    );
  }
  return points;
}