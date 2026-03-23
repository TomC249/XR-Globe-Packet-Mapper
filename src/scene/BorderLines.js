/**
 * BorderLines.js
 * Fetches the world country borders GeoJSON and draws them as
 * line meshes projected onto the globe surface.
 *
 * GeoJSON source: Natural Earth via unpkg (public domain).
 * Each polygon ring is converted to a series of lat/lon → Vector3
 * points and drawn with CreateLines.
 */
import { MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';
import { latLonToVec3 } from './NetworkArcs.js';

// Free, lightweight 50m borders (~550 KB). Swap for a 10m version for more detail.
const BORDERS_URL =
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';

const BORDER_COLOR     = new Color3(0.3, 0.55, 0.7);
const BORDER_ALPHA     = 0.45;
const SURFACE_OFFSET   = 0.01; // push lines just above the sphere to prevent z-fighting

export class BorderLines {
  /**
   * Fetch borders GeoJSON and create line meshes in the scene.
   * Static factory — call once at init.
   */
  static async load(scene, radius) {
    let topology;
    try {
      const res = await fetch(BORDERS_URL);
      topology  = await res.json();
    } catch (err) {
      console.warn('[BorderLines] Failed to fetch border data:', err);
      return;
    }

    // world-atlas ships as TopoJSON — decode to GeoJSON polygons
    const features = BorderLines.#decodeTopojson(topology);
    const r = radius + SURFACE_OFFSET;

    // Shared material for all border lines
    const mat = new StandardMaterial('bordersMat', scene);
    mat.emissiveColor = BORDER_COLOR;
    mat.disableLighting = true;
    mat.alpha = BORDER_ALPHA;

    let lineCount = 0;

    for (const feature of features) {
      const { type, coordinates } = feature.geometry;
      const rings =
        type === 'Polygon' ? coordinates :
        type === 'MultiPolygon' ? coordinates.flat(1) : [];

      for (const ring of rings) {
        const pts = ring.map(([lon, lat]) => latLonToVec3(lat, lon, r));
        if (pts.length < 2) continue;

        const line = MeshBuilder.CreateLines(
          `border_${lineCount++}`,
          { points: pts, updatable: false },
          scene,
        );
        line.color    = BORDER_COLOR;
        line.alpha    = BORDER_ALPHA;
        line.isPickable = false;
        // Freeze transform since borders never move (perf optimisation)
        line.freezeWorldMatrix();
      }
    }

    console.log(`[BorderLines] Drew ${lineCount} border segments.`);
  }

  // ── TopoJSON decoder (minimal, no external dependency) ──────────────────

  static #decodeTopojson(topology) {
    // Supports only the 'countries' layer from world-atlas
    const object = topology.objects.countries;
    if (!object) return [];

    const { scale, translate } = topology.transform;
    const arcs = topology.arcs;

    // Decode a single arc index list to [lon, lat] coordinates
    const decodeArc = (arcIdx) => {
      const reversed = arcIdx < 0;
      const idx      = reversed ? ~arcIdx : arcIdx;
      const raw      = arcs[idx];

      let x = 0, y = 0;
      const pts = raw.map(([dx, dy]) => {
        x += dx; y += dy;
        return [
          x * scale[0] + translate[0],
          y * scale[1] + translate[1],
        ];
      });

      return reversed ? pts.reverse() : pts;
    };

    const decodeRing = (ring) => {
      const coords = ring.flatMap(decodeArc);
      // Close the ring
      if (coords.length > 0) coords.push(coords[0]);
      return coords;
    };

    const features = [];

    for (const geom of object.geometries) {
      if (geom.type === 'Polygon') {
        features.push({
          geometry: {
            type: 'Polygon',
            coordinates: geom.arcs.map(decodeRing),
          },
        });
      } else if (geom.type === 'MultiPolygon') {
        features.push({
          geometry: {
            type: 'MultiPolygon',
            coordinates: geom.arcs.map((poly) => poly.map(decodeRing)),
          },
        });
      }
    }

    return features;
  }
}
