/**
 * BorderLines.js
 * Land dots via PointsCloudSystem — single draw call, no rotation math.
 * Border lines via TopoJSON — parented to globe.
 * TODO, add alert lines
 */
import {
  MeshBuilder,
  StandardMaterial,
  Color3, Color4,
  Vector3,
  PointsCloudSystem,
} from '@babylonjs/core';
import { latLonToVec3 } from './NetworkArcs.js';

const LAND_MASK_URL  = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-water.png';
const BORDERS_URL    = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';

const SURFACE_OFFSET  = 0.05;
const BORDER_OFFSET   = 0.06;
const LAT_STEP        = 0.8;
const LAND_THRESHOLD  = 100;
const DOT_SIZE        = 4;          // screen-space pixel size of each point
const DOT_COLOR       = new Color4(0.73, 0.69, 0.95, 1.0);  // #BBAFF2
const BORDER_COLOR = new Color4(0.31, 0.36, 0.67, 0.6);  // #5262b9
const BORDER_ALPHA    = 0.5;

export class BorderLines {
  static async load(scene, radius, globeMesh) {

    // ── Fetch both resources in parallel ────────────────────────────────
    const [pixels, topology] = await Promise.all([
      BorderLines.#loadMaskPixels(LAND_MASK_URL),
      fetch(BORDERS_URL).then(r => r.json()).catch(() => null),
    ]);

    if (!pixels) {
      console.warn('[BorderLines] Land mask failed to load.');
      return;
    }

    const { data, width, height } = pixels;

    const isLand = (lat, lon) => {
      const px  = Math.floor(((lon + 180) / 360) * width)  % width;
      const py  = Math.floor(((90 - lat)  / 180) * height) % height;
      const idx = (py * width + px) * 4;
      return data[idx] < LAND_THRESHOLD;  // dark = land in earth-water.png
    };

    // ── 1. Collect all land positions ────────────────────────────────────
    const r = radius + SURFACE_OFFSET;
    const positions = [];

    for (let lat = -90; lat <= 90; lat += LAT_STEP) {
      const cosLat  = Math.max(Math.cos(lat * Math.PI / 180), 0.08);
      const lonStep = LAT_STEP / cosLat;

      for (let lon = -180; lon < 180; lon += lonStep) {
        if (!isLand(lat, lon)) continue;
        positions.push(latLonToVec3(lat, lon, r));
      }
    }

    console.log(`[BorderLines] ${positions.length} land points collected.`);

    // ── 2. Build PointsCloudSystem — ONE draw call for all dots ──────────
    const pcs = new PointsCloudSystem('landDots', DOT_SIZE, scene, {
      updatable: false,
    });

    pcs.addPoints(positions.length, (particle, i) => {
      particle.position = positions[i];
      particle.color    = DOT_COLOR;
    });

    await pcs.buildMeshAsync();

    // Parent the single mesh to globe so it rotates with it
    pcs.mesh.parent     = globeMesh;
    pcs.mesh.isPickable = false;

    console.log(`[BorderLines] Land dot mesh built.`);

    // ── 3. Draw border lines ─────────────────────────────────────────────
    if (topology) {
      BorderLines.#drawBorders(topology, scene, radius, globeMesh);
    }
  }

  // ── Border lines ─────────────────────────────────────────────────────────

  static #drawBorders(topology, scene, radius, globeMesh) {
    const countries = BorderLines.#decodeTopojson(topology);
    const r = radius + BORDER_OFFSET;
    let lineCount = 0;

    for (const rings of countries) {
      for (const ring of rings) {
        if (ring.length < 2) continue;

        const pts = ring.map(([lon, lat]) => latLonToVec3(lat, lon, r));

        const line = MeshBuilder.CreateLines(`border_${lineCount++}`, {
          points: pts,
          updatable: false,
          colors: new Array(pts.length).fill(BORDER_COLOR),  // per-vertex color with alpha
        }, scene);

        line.color      = BORDER_COLOR;
        line.alpha      = BORDER_ALPHA;
        line.isPickable = false;
        line.parent     = globeMesh;
      }
    }

    console.log(`[BorderLines] ${lineCount} border segments drawn.`);
  }

  // ── Land mask loader ─────────────────────────────────────────────────────

  static async #loadMaskPixels(url) {
    try {
      const res    = await fetch(url);
      const blob   = await res.blob();
      const bitmap = await createImageBitmap(blob);

      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx    = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);

      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      console.log(`[BorderLines] Mask: ${bitmap.width}x${bitmap.height}`);

      // Sample a known ocean point (lon=0, lat=50 = Atlantic)
      const testPx  = Math.floor((180 / 360) * bitmap.width);
      const testPy  = Math.floor((40  / 180) * bitmap.height);
      const testIdx = (testPy * bitmap.width + testPx) * 4;
      console.log(`[BorderLines] Ocean sample R (should be high): ${imageData.data[testIdx]}`);

      return { data: imageData.data, width: bitmap.width, height: bitmap.height };
    } catch (err) {
      console.error('[BorderLines] Mask load failed:', err);
      return null;
    }
  }

  // ── TopoJSON decoder ─────────────────────────────────────────────────────

  static #decodeTopojson(topology) {
    const object = topology.objects.countries;
    if (!object) return [];

    const { scale, translate } = topology.transform;
    const arcs = topology.arcs;

    const decodeArc = (arcIdx) => {
      const reversed = arcIdx < 0;
      const idx      = reversed ? ~arcIdx : arcIdx;
      let x = 0, y = 0;
      const pts = arcs[idx].map(([dx, dy]) => {
        x += dx; y += dy;
        return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
      });
      return reversed ? pts.reverse() : pts;
    };

    const decodeRing = (ring) => {
      const coords = ring.flatMap(decodeArc);
      if (coords.length > 0) coords.push(coords[0]);
      return coords;
    };

    const countries = [];
    for (const geom of object.geometries) {
      if (geom.type === 'Polygon') {
        countries.push(geom.arcs.map(decodeRing));
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.arcs) countries.push(poly.map(decodeRing));
      }
    }
    return countries;
  }
}