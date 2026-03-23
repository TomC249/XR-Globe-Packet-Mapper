/**
 * BorderLines.js
 * Uses a land mask texture (white=land, black=ocean) to place dots.
 * Cost per dot = one array lookup. No polygon math at all.
 */
import { MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';
import { latLonToVec3 } from './NetworkArcs.js';

// 2048x1024 land mask — white pixels = land, black = ocean
// Natural Earth public domain
const LAND_MASK_URL  = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geotiff/ne_110m_land.png';

// Fallback — simpler 1024x512 mask from unpkg
const LAND_MASK_FALLBACK = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-water.png';

const SURFACE_OFFSET = 0.015;
const DOT_RADIUS     = 0.012;
const DOT_SEGMENTS   = 4;
const DOT_COLOR      = new Color3(0.25, 0.5, 1.0);
const DOT_EMISSIVE   = new Color3(0.1, 0.25, 0.6);
const LAT_STEP       = 0.8;
const LAND_THRESHOLD = 100;  // 0-255 — pixels brighter than this = land


export class BorderLines {
  static async load(scene, radius, globeMesh) {
    // ── 1. Fetch and decode the mask into a pixel array ─────────────────
    const pixels = await BorderLines.#loadMaskPixels(LAND_MASK_FALLBACK);
    if (!pixels) {
      console.warn('[BorderLines] Could not load land mask.');
      return;
    }

    const { data, width, height } = pixels;

    // ── 2. Helper: is this lat/lon on land? ─────────────────────────────
    const isLand = (lat, lon) => {
      // Map lat/lon to pixel coordinates
      const px = Math.floor(((lon + 180) / 360) * width)  % width;
      const py = Math.floor(((90 - lat)  / 180) * height) % height;
      const idx = (py * width + px) * 4;  // RGBA

      // earth-water.png: dark = land, bright = water — so we invert
      // If using a true land mask (white=land), remove the inversion
      const r = data[idx];
      return r < LAND_THRESHOLD;  // dark pixel = land in this texture
    };

    // ── 3. Shared dot material ───────────────────────────────────────────
    const mat = new StandardMaterial('dotMat', scene);
    mat.diffuseColor    = DOT_COLOR;
    mat.emissiveColor   = DOT_EMISSIVE;
    mat.specularColor   = new Color3(0, 0, 0);
    mat.freeze();  // static material — lock it for GPU perf

    const r = radius + SURFACE_OFFSET;
    let dotCount = 0;

    // ── 4. Walk the grid and place dots ──────────────────────────────────
    for (let lat = -90; lat <= 90; lat += LAT_STEP) {
      const cosLat  = Math.max(Math.cos(lat * Math.PI / 180), 0.08);
      const lonStep = LAT_STEP / cosLat;  // widen spacing near poles

      for (let lon = -180; lon < 180; lon += lonStep) {
        if (!isLand(lat, lon)) continue;

        const pos = latLonToVec3(lat, lon, r);

        const dot = MeshBuilder.CreateSphere(`dot_${dotCount++}`, {
          diameter:  DOT_RADIUS * 2,
          segments:  DOT_SEGMENTS,
          updatable: false,
        }, scene);

        dot.position   = pos;
        dot.material   = mat;
        dot.isPickable = false;
        dot.parent     = globeMesh;
      }
    }

    console.log(`[BorderLines] Placed ${dotCount} land dots.`);
  }

  // ── Fetch image and extract pixel data via OffscreenCanvas ───────────────

  static async #loadMaskPixels(url) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);

      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx    = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);

      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      return {
        data:   imageData.data,
        width:  bitmap.width,
        height: bitmap.height,
      };
    } catch (err) {
      console.error('[BorderLines] Mask load failed:', err);
      return null;
    }
  }
}