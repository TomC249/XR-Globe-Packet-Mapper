/**
 * GlobeScene.js
 * Core Babylon.js scene: engine, camera, Earth sphere, atmosphere,
 * border lines, and arc management.
 */
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Texture,
  Color3,
  Color4,
  Vector3,
  GlowLayer,
} from '@babylonjs/core';

import { NetworkArcs } from './NetworkArcs.js';
import { BorderLines } from './BorderLines.js';

// ── Constants ──────────────────────────────────────────────────────────────
export const GLOBE_RADIUS = 5;

// Free Earth texture — NASA Blue Marble (public domain).
// Replace with a local asset for production.
const EARTH_DAY_TEX  = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r134/examples/textures/planets/earth_atmos_2048.jpg';
const EARTH_BUMP_TEX = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r134/examples/textures/planets/earth_normal_2048.jpg';
const EARTH_SPEC_TEX = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r134/examples/textures/planets/earth_specular_2048.jpg';

export class GlobeScene {
  /** @type {Engine} */ engine;
  /** @type {Scene}  */ scene;
  /** @type {NetworkArcs} */ arcs;

  #eventHandlers = {};
  #fps = 0;

  constructor(canvas) {
    this.canvas = canvas;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  async init() {
    this.#createEngine();
    this.#createScene();
    this.#createCamera();
    this.#createLights();
    await this.#createGlobe();
    this.#createAtmosphere();
    //this.#createStarfield();
    this.#setupGlow();

    this.arcs = new NetworkArcs(this.scene, GLOBE_RADIUS, this.camera);

    await BorderLines.load(this.scene, GLOBE_RADIUS, this.globe);

    this.#startRenderLoop();
    this.#handleResize();
  }

  /**
   * Add a network flow to the globe.
   * @param {{ srcLat, srcLon, dstLat, dstLon, protocol, bytes, srcIp, dstIp }} flow
   */
  addFlow(flow) {
    this.arcs.addArc(flow);
    this.#emit('flowAdded', flow);
  }

  /** Number of currently visible arcs */
  get activeArcCount() { return this.arcs.activeCount; }

  /** Current FPS */
  get fps() { return this.#fps; }

  /** Simple event emitter — supports 'flowAdded' */
  on(event, handler) {
    this.#eventHandlers[event] = this.#eventHandlers[event] ?? [];
    this.#eventHandlers[event].push(handler);
  }

  // ── Private: scene construction ──────────────────────────────────────────

  #createEngine() {
    this.engine = new Engine(this.canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
    });
    this.engine.setHardwareScalingLevel(1 / window.devicePixelRatio);
  }

  #createScene() {
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 1);
    // Prevent default right-click context menu
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  #createCamera() {
    this.camera = new ArcRotateCamera(
      'cam',
      0,              // alpha=0 faces toward lon=0 — Europe/Africa
      Math.PI / 3,    // beta=60° — looking slightly down from north, Google Earth style
      GLOBE_RADIUS * 2.8,
      Vector3.Zero(),
      this.scene,
    );
  
    this.camera.attachControl(this.canvas, true);
    this.camera.lowerRadiusLimit = GLOBE_RADIUS * 1.15;
    this.camera.upperRadiusLimit = GLOBE_RADIUS * 8;
    this.camera.inertia          = 0.85;
    this.camera.wheelPrecision   = 40;
    this.camera.pinchPrecision   = 60;
    this.camera.lowerBetaLimit   = 0.2;
    this.camera.upperBetaLimit   = Math.PI - 0.2;
  }
  #createLights() {
    // Ambient fill — prevents the dark side from being pitch black
    const ambient = new HemisphericLight(
      'ambient',
      new Vector3(0, 1, 0),
      this.scene,
    );
    ambient.intensity = 0.3;
    ambient.diffuse = new Color3(0.4, 0.6, 1.0);
    ambient.groundColor = new Color3(0.05, 0.05, 0.1);

    // Sun directional light
    const sun = new DirectionalLight(
      'sun',
      new Vector3(-1, -0.5, -1).normalize(),
      this.scene,
    );
    sun.intensity = 1.4;
    sun.diffuse = new Color3(1, 0.95, 0.85);
  }

  async #createGlobe() {
    this.globe = MeshBuilder.CreateSphere(
      'earth',
      { diameter: GLOBE_RADIUS * 2, segments: 64 },
      this.scene,
    );
  
    const mat = new StandardMaterial('earthMat', this.scene);
  
    // Deep navy base colour
    mat.diffuseColor  = new Color3(0.2, 0.06, 0.1);
    mat.emissiveColor = new Color3(0.02, 0.05, 0.18);
    mat.specularColor = new Color3(0.1, 0.2, 0.5);
    mat.specularPower = 32;
    mat.alpha = 1.0;  // fully opaque
  
    this.globe.material = mat;
  }
  #createStarfield() {
    // Simple point-based starfield using a large sphere with inverted normals
    const stars = MeshBuilder.CreateSphere(
      'stars',
      { diameter: GLOBE_RADIUS * 40, segments: 8 },
      this.scene,
    );

    const mat = new StandardMaterial('starsMat', this.scene);
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.backFaceCulling = false;
    mat.disableLighting = true;

    // Use a star texture if you have one; otherwise a subtle noise works
    // mat.emissiveTexture = new Texture('/assets/stars.png', this.scene);
    mat.alpha = 0.6;
    stars.material = mat;
  }

  #createAtmosphere() {
  // Inner glow shell
  const inner = MeshBuilder.CreateSphere(
    'atmoInner',
    { diameter: GLOBE_RADIUS * 2.02, segments: 32 },
    this.scene,
  );
  const innerMat = new StandardMaterial('atmoInnerMat', this.scene);
  innerMat.emissiveColor   = new Color3(0.05, 0.2, 0.8);
  innerMat.alpha           = 0.08;
  innerMat.backFaceCulling = false;
  innerMat.disableLighting = true;
  inner.material = innerMat;

  // Outer glow halo
    const outer = MeshBuilder.CreateSphere(
      'atmoOuter',
      { diameter: GLOBE_RADIUS * 2.12, segments: 32 },
      this.scene,
    );
    const outerMat = new StandardMaterial('atmoOuterMat', this.scene);
    outerMat.emissiveColor   = new Color3(0.02, 0.1, 0.6);
    outerMat.alpha           = 0.05;
    outerMat.backFaceCulling = false;
    outerMat.disableLighting = true;
    outer.material = outerMat;
  }
  #setupGlow() {
    // Glow layer makes arc lines bloom — crucial for the neon effect
    this.glowLayer = new GlowLayer('glow', this.scene);
    this.glowLayer.intensity = 0.6;
    this.glowLayer.blurKernelSize = 32;

    // Only glow the arc meshes, not the globe
    this.glowLayer.addExcludedMesh(this.globe);
  }

  // ── Private: loop & resize ────────────────────────────────────────────────

  #startRenderLoop() {
    let frames = 0;
    let lastTime = performance.now();

    this.engine.runRenderLoop(() => {
      this.scene.render();
      this.arcs.tick(this.engine.getDeltaTime() / 1000);

      frames++;
      const now = performance.now();
      if (now - lastTime >= 500) {
        this.#fps = (frames * 1000) / (now - lastTime);
        frames = 0;
        lastTime = now;
      }
    });
  }

  #handleResize() {
    window.addEventListener('resize', () => this.engine.resize());
  }

  #emit(event, data) {
    this.#eventHandlers[event]?.forEach((h) => h(data));
  }
}
