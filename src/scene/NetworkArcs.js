// NetworkArcs.js - groups packet flows and renders them as arcs on the globe
//
// Each group (same src + dst bucket) renders as:
//   Compact:  one heat-coloured tube (source -> dst), used when multiple flows exist
//   Expanded: one line per flow, fanned out with a golden-angle spiral
//
// Arcs fade in -> hold -> fade out unless pinned (selected) or flagged (alert)

import {
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Curve3,
} from '@babylonjs/core';

// ── Colours ──────────────────────────────────────────────────────────────────

// per-protocol colours used in expanded mode (these are unused as of now)
const PROTOCOL_COLORS = {
  TCP:   new Color3(0.00, 0.90, 1.00),
  UDP:   new Color3(1.00, 0.65, 0.15),
  ICMP:  new Color3(0.94, 0.33, 0.31),
  DNS:   new Color3(0.67, 0.28, 0.74),
  HTTP:  new Color3(0.40, 0.73, 0.41),
  HTTPS: new Color3(0.40, 0.73, 0.41),
  OTHER: new Color3(0.33, 0.43, 0.48),
};

// heatmap for compact tubes - cyan = few packets, amber = lots
const HEAT_SCALE = [
  { min: 1,  color: new Color3(0.00, 0.90, 1.00) },  // cyan
  { min: 3,  color: new Color3(0.40, 0.73, 0.41) },  // green
  { min: 6,  color: new Color3(0.95, 0.85, 0.10) },  // yellow
  { min: 12, color: new Color3(1.00, 0.55, 0.10) },  // orange
  { min: 25, color: new Color3(0.80, 0.20, 1.00) },  // purple
  { min: 50, color: new Color3(1.00, 0.60, 0.00) },  // deep amber
];

const FLAGGED_COLOR = new Color3(1.00, 0.10, 0.10);  // red for alert arcs

// ── Constants ────────────────────────────────────────────────────────────────
const BEZIER_SEGMENTS   = 48;
const ARC_HEIGHT_FACTOR = 0.55;
const MAX_FLOW_AGE      = 15.0;  // seconds before a flow is pruned
const HOLD_DURATION     = 4.0;   // seconds to hold at full opacity
const FADE_DURATION     = 1.5;   // seconds to fade out
const MAX_GROUPS        = 80;    // cap to avoid unbounded mesh growth

const SPREAD_RADIUS_MAX    = 0.32;
const SPREAD_PUSH_SCALE    = 3.2;
const GOLDEN_ANGLE         = 2.399963229728653;  // irrational angle for even spiral spread
const NORMAL_STRAND_RADIUS = 0.0016;
const COMPACT_ARC_RADIUS   = NORMAL_STRAND_RADIUS * 1.2;

export class NetworkArcs {
  #scene;
  #radius;
  #parent;

  #groups      = new Map();  // key -> Group
  #pinnedGroup = null;
  #dirtyGroups = new Set();

  constructor(scene, globeRadius, parent = null) {
    this.#scene  = scene;
    this.#radius = globeRadius;
    this.#parent = parent;
  }

  // ── Public ───────────────────────────────────────────────────────────────────

  // add a flow to the appropriate group, creating the group if needed
  addArc(flow) {
    const {
      srcLat, srcLon, dstLat, dstLon,
      protocol, bytes = 0,
      dstIp = '?', srcIp = '?',
      srcCity = '', dstCity = '',
      ts = null,
      flagged = false,
      srcPort = null, dstPort = null,
      srcHostname = null, dstHostname = null,
      httpHost = null, httpUri = null, httpMethod = null, httpStatus = null,
      dnsQuery = null, dnsType = null,
      tlsSni = null,
    } = flow;

    if (!this.#isValidCoord(srcLat, srcLon) || !this.#isValidCoord(dstLat, dstLon)) return;

    const src = latLonToVec3(srcLat, srcLon, this.#radius);
    const dst = latLonToVec3(dstLat, dstLon, this.#radius);
    if (Vector3.Distance(src, dst) < 0.01) return;

    // snap to 0.25-degree grid so nearby flows share a group
    // most packets have localhost as one endpoint so this bucket approach is needed
    const srcLatB = Math.round(srcLat * 4) / 4;
    const srcLonB = Math.round(srcLon * 4) / 4;
    const dstLatB = Math.round(dstLat * 4) / 4;
    const dstLonB = Math.round(dstLon * 4) / 4;
    const key = `${srcIp}|${dstIp}|${srcLatB.toFixed(2)},${srcLonB.toFixed(2)}|${dstLatB.toFixed(2)},${dstLonB.toFixed(2)}`;

    if (!this.#groups.has(key)) {
      if (this.#groups.size >= MAX_GROUPS) {
        // evict oldest non-flagged group; never evict an alert
        const evictKey = [...this.#groups.entries()].find(([, g]) => !g.flagged)?.[0]
          ?? this.#groups.keys().next().value;
        this.#destroyGroup(this.#groups.get(evictKey));
        this.#groups.delete(evictKey);
      }
      this.#groups.set(key, {
        key,
        flagged:   false,
        dstIp, dstCity, dstHostname, dst,
        sources:   new Map(),
        pinned:    false,
        apexLocal: null,
        meshes:    [],
        _mats:     [],
        alpha:     0,
        phase:     'FADE_IN',
        timer:     0,
        _lastMode: null,
      });
    }

    // any flagged flow promotes the whole group to alert status
    const group = this.#groups.get(key);
    if (flagged && !group.flagged) {
      group.flagged = true;
      group.pinned  = true;
    }

    const srcBucket = `${srcLatB.toFixed(2)},${srcLonB.toFixed(2)}`;

    if (!group.sources.has(srcBucket)) {
      group.sources.set(srcBucket, { srcIp, srcHostname, srcCity, srcLat, srcLon, src, flows: [] });
    }

    group.sources.get(srcBucket).flows.push({
      protocol: protocol?.toUpperCase() ?? 'OTHER',
      bytes,
      ts,
      age: 0,
      flagged,
      srcPort, dstPort,
      httpHost, httpUri, httpMethod, httpStatus,
      dnsQuery, dnsType,
      tlsSni,
    });

    this.#dirtyGroups.add(key);
  }

  // age flows, drive the fade lifecycle, and rebuild meshes when dirty
  tick(dt) {
    for (const [key, group] of this.#groups) {
      // age flows; alert group flows are frozen so the arc stays visible until dismissed
      for (const [bucket, source] of group.sources) {
        if (!group.flagged)
          source.flows = source.flows.filter(f => { f.age += dt; return f.age < MAX_FLOW_AGE; });
        if (source.flows.length === 0) group.sources.delete(bucket);
      }

      if (group.sources.size === 0 && !group.pinned) group.phase = 'FADE_OUT';

      if (group.pinned) {
        group.alpha = 1;
        if (group.phase === 'FADE_OUT') { group.phase = 'HOLD'; group.timer = 0; }
      } else {
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
      }

      // single-flow groups use expanded (per-flow lines); multi-flow groups use compact tube
      const packetCount = group.sources.values().next().value?.flows.length ?? 0;
      const mode = packetCount > 1 ? 'compact' : 'expanded';

      if (this.#dirtyGroups.has(key) || mode !== group._lastMode) {
        this.#rebuildGroupMesh(group, mode);
        group._lastMode = mode;
        this.#dirtyGroups.delete(key);
      }

      for (const m of group.meshes) m.alpha = group.alpha;
    }
  }

  // returns true when the currently selected group is a live alert
  get hasActiveAlert() {
    return this.#pinnedGroup?.flagged ?? false;
  }

  // total number of live flows across all groups
  get activeCount() {
    let total = 0;
    for (const g of this.#groups.values())
      for (const s of g.sources.values()) total += s.flows.length;
    return total;
  }

  // returns display info for a picked mesh (per-source or aggregate), or null
  getGroupInfo(mesh) {
    const meta = mesh?.metadata;
    if (!meta?.group) return null;

    const group  = meta.group;
    const source = meta.source;  // only set on expanded-mode hitboxes

    if (source) {
      const totalBytes  = source.flows.reduce((s, f) => s + (f.bytes ?? 0), 0);
      const protoCounts = {};
      for (const f of source.flows) protoCounts[f.protocol] = (protoCounts[f.protocol] ?? 0) + 1;
      const protocol = Object.entries(protoCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'OTHER';
      return {
        _group:      group,
        flagged:     group.flagged,
        srcIp:       source.srcIp,
        dstIp:       group.dstIp,
        srcHostname: source.srcHostname ?? null,
        dstHostname: group.dstHostname  ?? null,
        srcCity:     source.srcCity,
        dstCity:     group.dstCity,
        protocol,
        flowCount:   source.flows.length,
        totalBytes,
        flows:       source.flows,
        apexLocal:   group.apexLocal ?? group.dst,
      };
    }

    // compact tube was picked - aggregate across all sources
    let totalFlows = 0, totalBytes = 0;
    const protoCounts = {};
    const allFlows = [];
    for (const s of group.sources.values()) {
      totalFlows += s.flows.length;
      for (const f of s.flows) {
        totalBytes += f.bytes ?? 0;
        protoCounts[f.protocol] = (protoCounts[f.protocol] ?? 0) + 1;
        allFlows.push(f);
      }
    }
    const protocol = Object.entries(protoCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'OTHER';
    const srcCount = group.sources.size;
    const firstSrc = group.sources.values().next().value;
    return {
      _group:      group,
      flagged:     group.flagged,
      srcIp:       srcCount === 1 ? firstSrc?.srcIp       : `${srcCount} sources`,
      dstIp:       group.dstIp,
      srcHostname: srcCount === 1 ? firstSrc?.srcHostname : null,
      dstHostname: group.dstHostname ?? null,
      srcCity:     srcCount === 1 ? firstSrc?.srcCity     : `${srcCount} origins`,
      dstCity:     group.dstCity,
      protocol,
      flowCount:   totalFlows,
      totalBytes,
      flows:       allFlows,
      apexLocal:   group.apexLocal ?? group.dst,
    };
  }

  // select a group - keeps it alive at full opacity and marks it dirty
  pinGroup(group) {
    if (!group) return;
    // deselect previous group; alert groups stay pinned, normal groups fade naturally
    if (this.#pinnedGroup && this.#pinnedGroup !== group) {
      if (!this.#pinnedGroup.flagged) this.#pinnedGroup.pinned = false;
      this.#dirtyGroups.add(this.#pinnedGroup.key);
    }
    this.#pinnedGroup = group;
    group.pinned      = true;
    group.alpha       = 1;
    if (group.phase === 'FADE_OUT') { group.phase = 'HOLD'; group.timer = 0; }
    this.#dirtyGroups.add(group.key);
  }

  // deselect - normal groups resume fading, alert groups stay alive
  unpinGroup() {
    if (this.#pinnedGroup) {
      if (!this.#pinnedGroup.flagged) this.#pinnedGroup.pinned = false;
      this.#dirtyGroups.add(this.#pinnedGroup.key);
      this.#pinnedGroup = null;
    }
  }

  // dismiss an alert - strips flagged/pinned status and lets the arc fade out
  dismissAlert(group) {
    if (!group) return;
    group.flagged = false;
    group.pinned  = false;
    group.phase   = 'FADE_OUT';
    group.timer   = 0;
    this.#dirtyGroups.add(group.key);
    if (this.#pinnedGroup === group) this.#pinnedGroup = null;
  }

  // ── Private: mesh building ───────────────────────────────────────────────────

  #rebuildGroupMesh(group, mode) {
    this.#destroyGroup(group);
    group.meshes = [];
    group._mats  = [];
    if (mode === 'expanded') {
      this.#buildExpandedMeshes(group);
    } else {
      this.#buildCompactedMesh(group);
    }
  }

  // compact: one heat-coloured tube from source -> dst with an invisible hitbox
  #buildCompactedMesh(group) {
    const source = group.sources.values().next().value;
    if (!source) return;

    const flowCount = source.flows.length;
    const centroid  = source.src;

    const hasFlag = source.flows.some(f => f.flagged);
    const color   = hasFlag ? FLAGGED_COLOR : this.#heatColor(flowCount);
    const radius  = COMPACT_ARC_RADIUS;

    const mid   = centroid.add(group.dst).scale(0.5);
    const chord = Vector3.Distance(centroid, group.dst);
    group.apexLocal = mid.normalize().scale(this.#radius + 0.005 + chord * ARC_HEIGHT_FACTOR);

    const mat = new StandardMaterial('cmpMat_' + group.key, this.#scene);
    mat.emissiveColor   = color;
    mat.disableLighting = true;
    group._mats.push(mat);

    const curve = computeBezierCurve(centroid, group.dst, this.#radius + 0.005, ARC_HEIGHT_FACTOR, BEZIER_SEGMENTS);
    const mesh  = MeshBuilder.CreateTube('cmpArc', {
      path:         curve,
      radius:       radius,
      tessellation: 5,
      updatable:    false,
    }, this.#scene);

    mesh.material   = mat;
    mesh.isPickable = false;  // visual only - hitbox below handles picking
    mesh.alpha      = group.alpha;
    if (this.#parent) mesh.parent = this.#parent;
    group.meshes.push(mesh);

    // invisible fat hitbox so XR controller rays can reliably hit this arc
    const hitbox = MeshBuilder.CreateTube('cmpHit', {
      path:         curve,
      radius:       0.022,
      tessellation: 4,
      updatable:    false,
    }, this.#scene);
    hitbox.isPickable = true;
    hitbox.metadata   = { group };
    hitbox.isVisible  = false;
    if (this.#parent) hitbox.parent = this.#parent;
    group.meshes.push(hitbox);
  }

  // expanded: one coloured line per flow, fanned out using a golden-angle spiral
  #buildExpandedMeshes(group) {
    const source = group.sources.values().next().value;
    if (!source || source.flows.length === 0) return;

    const src   = source.src;
    const dst   = group.dst;
    const count = source.flows.length;

    const mid   = src.add(dst).scale(0.5);
    const chord = Vector3.Distance(src, dst);
    group.apexLocal = mid.normalize().scale(this.#radius + 0.005 + chord * ARC_HEIGHT_FACTOR);

    // build orthonormal basis perpendicular to the chord for spreading the arcs
    const chordDir = dst.subtract(src).normalize();
    let axisA = Vector3.Cross(chordDir, Vector3.Up());
    if (axisA.lengthSquared() < 1e-6) axisA = Vector3.Cross(chordDir, Vector3.Right());
    axisA = axisA.normalize();
    const axisB = Vector3.Cross(chordDir, axisA).normalize();

    source.flows.forEach((flow, i) => {
      // spread arcs outward using a golden-angle spiral so they don't overlap
      const rank    = count > 1 ? Math.sqrt(i / (count - 1)) : 0;
      const spreadR = rank * SPREAD_RADIUS_MAX;
      const angle   = i * GOLDEN_ANGLE;

      const offsetVec = axisA.scale(Math.cos(angle) * spreadR)
        .add(axisB.scale(Math.sin(angle) * spreadR));

      const apexR   = this.#radius + 0.005 + chord * (ARC_HEIGHT_FACTOR + spreadR * 0.22);
      const control = mid.normalize().scale(apexR).add(offsetVec.scale(SPREAD_PUSH_SCALE));

      const curve = Curve3.CreateQuadraticBezier(src, control, dst, BEZIER_SEGMENTS).getPoints();

      const color = flow.flagged
        ? FLAGGED_COLOR
        : (PROTOCOL_COLORS[flow.protocol] ?? PROTOCOL_COLORS.OTHER);

      const line = MeshBuilder.CreateLines('expArc', { points: curve, updatable: false }, this.#scene);
      line.color      = color;
      line.alpha      = group.alpha;
      line.isPickable = false;
      if (this.#parent) line.parent = this.#parent;
      group.meshes.push(line);

      // per-flow invisible hitbox for picking
      const hitbox = MeshBuilder.CreateTube('expHit', {
        path:         curve,
        radius:       0.020,
        tessellation: 4,
        updatable:    false,
      }, this.#scene);
      hitbox.isPickable = true;
      hitbox.metadata   = { group, source };
      hitbox.isVisible  = false;
      if (this.#parent) hitbox.parent = this.#parent;
      group.meshes.push(hitbox);
    });
  }

  // dispose all meshes and materials belonging to a group
  #destroyGroup(group) {
    for (const m of (group.meshes ?? [])) m.dispose();
    group.meshes = [];
    for (const mat of (group._mats ?? [])) mat.dispose();
    group._mats = [];
    // legacy field cleanup
    if (group.hitbox) { group.hitbox.dispose(); group.hitbox = null; }
    if (group._mat)   { group._mat.dispose();   group._mat   = null; }
  }

  // pick a colour from the heat scale by flow count
  #heatColor(count) {
    let color = HEAT_SCALE[0].color;
    for (const step of HEAT_SCALE) { if (count >= step.min) color = step.color; }
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

// ── Geometry helpers ─────────────────────────────────────────────────────────

// converts geographic coordinates to a point on the globe surface
export function latLonToVec3(lat, lon, radius) {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

// computes a quadratic bezier arc between two globe-surface points
// the control point is pushed radially outward from the chord midpoint
export function computeBezierCurve(p0, p2, radius, heightFactor, segments) {
  const mid         = p0.add(p2).scale(0.5);
  const chordLength = Vector3.Distance(p0, p2);
  const apexRadius  = radius + chordLength * heightFactor;
  const p1          = mid.normalize().scale(apexRadius);
  return Curve3.CreateQuadraticBezier(p0, p1, p2, segments).getPoints();
}
