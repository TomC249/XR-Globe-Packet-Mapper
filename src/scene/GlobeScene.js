// GlobeScene.js - owns the Babylon scene, globe mesh, hex layers, XR session and render loop
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  GlowLayer,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  PointerEventTypes,
  Quaternion,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexData,
  WebXRFeatureName,
  WebXRState,
} from '@babylonjs/core';
import { polygonToCells, cellToLatLng, cellToBoundary } from 'h3-js';

import { NetworkArcs, latLonToVec3 } from './NetworkArcs.js';
import { GlobeLegend } from './GlobeLegend.js';
import { ArcInfoPanel } from './ArcInfoPanel.js';
import { ControllerInput } from '../xr/ControllerInput.js';
import { HandInput } from '../xr/HandInput.js';

// ── Config ───────────────────────────────────────────────────────────────────
const GLOBE_RADIUS = 0.35;
const EARTH_DAY_TEX  = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r134/examples/textures/planets/earth_atmos_2048.jpg';
const EARTH_BUMP_TEX = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r134/examples/textures/planets/earth_normal_2048.jpg';
const EARTH_SPEC_TEX = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r134/examples/textures/planets/earth_specular_2048.jpg';

const COUNTRIES_URL  = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';
const HEX_RESOLUTION = 4;
const HEX_OFFSET     = 0.001;
const BORDER_OFFSET  = 0.001;

const HEX_COLOR        = new Color3(0.73, 0.69, 0.95);
const HEX_EMISSIVE     = new Color3(0.18, 0.16, 0.28);
const BORDER_COLOR     = new Color3(0.31, 0.36, 0.67);
const EARTH_COLOR      = new Color3(0.086, 0.110, 0.259);
const SCENE_CLEAR_COLOR = new Color4(0.02, 0.03, 0.05, 1.0);

// ── Controller input tuning ──────────────────────────────────────────────────
const CONTROLLER_ROTATION_SPEED  = 1.2;
const CONTROLLER_SCALE_MIN       = 0.5;
const CONTROLLER_SCALE_MAX       = 3.0;
const CONTROLLER_TRANSLATE_SPEED = 2.0;
const GRAB_DISTANCE_SPEED        = 0.02;
const GRAB_DISTANCE_DEADZONE     = 0.15;

export class GlobeScene {
  #canvas;
  #eventHandlers   = {};
  #lastFrameTime   = 0;
  #controllerInput = null;
  #handInput       = null;
  #backgroundRemover = null;
  #legend          = null;
  #arcPanel        = null;
  #arSessionActive = false;
  #grabActive      = false;
  #grabHandedness  = null;
  #grabOffsetLocal = null;
  #grabRotationOffset = null;

  constructor(canvas) {
    this.#canvas = canvas;
    this.fps  = 0;
    this.xr   = null;
    this.landHexMesh    = null;
    this.borderLineMesh = null;
  }

  // ── Public ───────────────────────────────────────────────────────────────────

  async init() {
    this.#createEngine();
    this.#createScene();
    this.sceneRoot = new TransformNode('sceneRoot', this.scene);
    this.globeRoot = new TransformNode('globeRoot', this.scene);
    this.globeRoot.parent = this.sceneRoot;

    this.#createCamera();
    this.#createLights();
    this.#createGlobe();
    this.#createAtmosphere();
    this.#setupGlow();
    this.#startRenderLoop();

    void this.#createSurfaceLayers().catch((error) => {
      console.warn('[GlobeScene] Surface layers disabled:', error);
    });

    this.arcs = new NetworkArcs(this.scene, GLOBE_RADIUS, this.globeRoot);
    this.#legend   = new GlobeLegend(this.scene);
    this.#legend.init(this.sceneRoot, this.globeRoot, GLOBE_RADIUS);
    this.#arcPanel = new ArcInfoPanel(this.scene, this.globeRoot);

    this.#handleResize();
    await this.#initXR();
    this.#setupPicking();
  }

  // add a flow from the data feed and notify listeners
  addFlow(flow) {
    this.arcs?.addArc(flow);
    this.#emit('flowAdded', flow);
  }

  get activeArcCount() {
    return this.arcs?.activeCount ?? 0;
  }

  onXRStateChange(handler) {
    this.#eventHandlers.xrStateChange = this.#eventHandlers.xrStateChange ?? [];
    this.#eventHandlers.xrStateChange.push(handler);
  }

  on(event, handler) {
    this.#eventHandlers[event] = this.#eventHandlers[event] ?? [];
    this.#eventHandlers[event].push(handler);
  }

  // ── Private: scene setup ─────────────────────────────────────────────────────

  #createEngine() {
    this.engine = new Engine(this.#canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      alpha:   true,
    });
  }

  #createScene() {
    this.scene = new Scene(this.engine);
    this.scene.clearColor = SCENE_CLEAR_COLOR;
  }

  #createCamera() {
    this.camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 2.35,
      GLOBE_RADIUS * 2.2,
      Vector3.Zero(),
      this.scene,
    );
    this.camera.attachControl(this.#canvas, true);
    this.camera.lowerRadiusLimit     = GLOBE_RADIUS * 0.4;
    this.camera.upperRadiusLimit     = GLOBE_RADIUS * 6.0;
    this.camera.wheelDeltaPercentage = 0.01;
    this.camera.panningSensibility   = 0;
    this.camera.minZ = 0.01;
    this.camera.maxZ = 1000;
  }

  #createLights() {
    const hemi = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), this.scene);
    hemi.intensity   = 1.05;
    hemi.diffuse     = new Color3(0.50, 0.62, 0.85);
    hemi.groundColor = new Color3(0.07, 0.08, 0.22);

    const dir = new DirectionalLight('dirLight', new Vector3(-0.35, -0.75, -0.45), this.scene);
    dir.intensity = 1.05;
    dir.diffuse   = new Color3(0.90, 0.94, 1.0);
  }

  #createGlobe() {
    this.globe = MeshBuilder.CreateSphere(
      'earth',
      { diameter: GLOBE_RADIUS * 2, segments: 64 },
      this.scene,
    );

    const mat = new StandardMaterial('earthMat', this.scene);
    mat.diffuseColor   = EARTH_COLOR;
    mat.emissiveColor  = new Color3(0.01, 0.01, 0.04);
    mat.specularColor  = new Color3(0.01, 0.01, 0.03);
    mat.backFaceCulling = false;
    mat.alpha = 1.0;

    this.globe.material = mat;
    this.globe.parent   = this.globeRoot;
  }

  // loads country topology and builds hex + border meshes
  async #createSurfaceLayers() {
    const topology = await fetch(COUNTRIES_URL)
      .then((response) => response.json())
      .catch((error) => {
        console.error('[GlobeScene] Failed to load country topology:', error);
        return null;
      });

    if (!topology) return;

    try {
      const countries = this.#decodeTopojson(topology);
      this.landHexMesh = this.#buildHexMesh(countries);
      if (this.landHexMesh) this.landHexMesh.parent = this.globeRoot;

      this.borderLineMesh = this.#buildBorderLineSystem(countries);
      if (this.borderLineMesh) this.borderLineMesh.parent = this.globeRoot;

      if (this.glowLayer) {
        if (this.landHexMesh)    this.glowLayer.addExcludedMesh(this.landHexMesh);
        if (this.borderLineMesh) this.glowLayer.addExcludedMesh(this.borderLineMesh);
      }
    } catch (error) {
      console.warn('[GlobeScene] Surface layer generation failed:', error);
    }
  }

  // two thin atmosphere spheres (inner more opaque, outer barely visible)
  #createAtmosphere() {
    const inner = MeshBuilder.CreateSphere(
      'atmoInner',
      { diameter: GLOBE_RADIUS * 2.02, segments: 64 },
      this.scene,
    );
    const innerMat = new StandardMaterial('atmoInnerMat', this.scene);
    innerMat.diffuseColor   = new Color3(0.15, 0.35, 0.90);
    innerMat.emissiveColor  = new Color3(0.02, 0.05, 0.12);
    innerMat.alpha          = 0.07;
    innerMat.backFaceCulling = false;
    innerMat.disableLighting = true;
    inner.material = innerMat;
    inner.parent   = this.globeRoot;

    const outer = MeshBuilder.CreateSphere(
      'atmoOuter',
      { diameter: GLOBE_RADIUS * 2.12, segments: 64 },
      this.scene,
    );
    const outerMat = new StandardMaterial('atmoOuterMat', this.scene);
    outerMat.diffuseColor   = new Color3(0.15, 0.35, 0.90);
    outerMat.emissiveColor  = new Color3(0.02, 0.05, 0.12);
    outerMat.alpha          = 0.03;
    outerMat.backFaceCulling = false;
    outerMat.disableLighting = true;
    outer.material = outerMat;
    outer.parent   = this.globeRoot;
  }

  #setupGlow() {
    this.glowLayer = new GlowLayer('glowLayer', this.scene, {
      blurKernelSize: 32,
    });
    this.glowLayer.intensity     = 0.6;
    this.glowLayer.blurKernelSize = 32;
    // exclude static geometry so only arc lines glow
    // todo: eventually fix glowing so it doesnt render through globe (albiet minor)
    this.glowLayer.addExcludedMesh(this.globe);
    if (this.landHexMesh)    this.glowLayer.addExcludedMesh(this.landHexMesh);
    if (this.borderLineMesh) this.glowLayer.addExcludedMesh(this.borderLineMesh);
  }

  #startRenderLoop() {
    this.#lastFrameTime = performance.now();

    this.engine.runRenderLoop(() => {
      const now = performance.now();
      const dt  = Math.max((now - this.#lastFrameTime) / 1000, 1 / 240);
      this.#lastFrameTime = now;

      this.arcs?.tick(dt);
      this.#controllerInput?.update();
      const xrCam = this.#arSessionActive ? this.xr?.baseExperience?.camera : null;
      if (xrCam) {
        this.#legend?.update(xrCam);
        this.#handInput?.update(xrCam);
      }
      this.#arcPanel?.update(xrCam ?? this.camera);
      this.scene.render();

      // smoothed FPS using exponential moving average
      const instantaneousFps = 1 / dt;
      this.fps = this.fps ? (this.fps * 0.9 + instantaneousFps * 0.1) : instantaneousFps;
    });
  }

  #handleResize() {
    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  // ── Private: XR ─────────────────────────────────────────────────────────────

  async #initXR() {
    try {
      this.xr = await this.scene.createDefaultXRExperienceAsync({
        uiOptions: {
          sessionMode:        'immersive-ar',
          referenceSpaceType: 'local-floor',
          optionalFeatures:   true,
        },
        optionalFeatures: true,
      });
    } catch (error) {
      console.warn('[GlobeScene] WebXR is unavailable:', error);
      return;
    }

    this.#setupControllerInput();
    this.#loadControllerModels();
    await this.#setupPassthrough();

    this.xr.baseExperience.onStateChangedObservable.add((state) => {
      const inXR = state === WebXRState.IN_XR;
      if (inXR) {
        this.#syncPassthroughWithSession(this.xr.baseExperience.sessionManager.session);
        this.#legend.show();
        // defer one frame so the XR camera has a valid tracked pose before we read it
        this.scene.onBeforeRenderObservable.addOnce(() => this.#placeGlobeInFrontOfUser());
      } else {
        this.sceneRoot.position.copyFromFloats(0, 0, 0);
        this.#applyPassthrough(false);
        this.#legend.hide();
        this.arcs?.unpinGroup();
        this.#arcPanel?.hide();
      }
      this.#emit('xrStateChange', inXR);
    });
  }

  #emit(event, data) {
    this.#eventHandlers[event]?.forEach((handler) => handler(data));
  }

  #setupControllerInput() {
    if (!this.xr) return;

    this.#controllerInput = new ControllerInput(this.xr);

    let currentScale = 1.0;

    // both grip buttons -> scale globe
    this.#controllerInput.on('scale', ({ factor }) => {
      currentScale *= factor;
      currentScale = Math.max(CONTROLLER_SCALE_MIN, Math.min(CONTROLLER_SCALE_MAX, currentScale));
      this.globeRoot.scaling.scaleInPlace(factor);
    });

    // single grip -> rotate globe
    this.#controllerInput.on('rotateX', ({ delta }) => {
      this.globeRoot.rotation.x += delta * CONTROLLER_ROTATION_SPEED;
    });
    this.#controllerInput.on('rotateY', ({ delta }) => {
      this.globeRoot.rotation.y -= delta * CONTROLLER_ROTATION_SPEED;
    });
    this.#controllerInput.on('rotateZ', ({ delta }) => {
      this.globeRoot.rotation.z += delta * CONTROLLER_ROTATION_SPEED;
    });

    // trigger -> grab/move globe
    this.#controllerInput.on('grabStart',  (data) => this.#startGrab(data));
    this.#controllerInput.on('grabMove',   (data) => this.#updateGrab(data));
    this.#controllerInput.on('grabAdjust', (data) => this.#adjustGrabDistance(data));
    this.#controllerInput.on('grabEnd',    (data) => this.#endGrab(data));

    // left trigger -> translate scene
    this.#controllerInput.on('translateLeft', ({ delta }) => {
      this.sceneRoot.position.addInPlace(delta.scale(CONTROLLER_TRANSLATE_SPEED));
    });

    // right trigger -> translate scene
    this.#controllerInput.on('translateRight', ({ delta }) => {
      this.sceneRoot.position.addInPlace(delta.scale(CONTROLLER_TRANSLATE_SPEED));
    });

    // both triggers -> move scene
    this.#controllerInput.on('move', ({ delta }) => {
      this.sceneRoot.position.addInPlace(delta.scale(CONTROLLER_TRANSLATE_SPEED));
    });

    console.log('[GlobeScene] Controller input initialized');

    // hand tracking shares the same grab/scale/pick events as controllers
    this.#handInput = new HandInput(this.xr, this.scene);
    this.#handInput.on('scale', ({ factor }) => {
      currentScale = Math.max(CONTROLLER_SCALE_MIN, Math.min(CONTROLLER_SCALE_MAX, currentScale * factor));
      this.globeRoot.scaling.scaleInPlace(factor);
    });
    this.#handInput.on('grabStart',   (data) => this.#startGrab(data));
    this.#handInput.on('grabMove',    (data) => this.#updateGrab(data));
    this.#handInput.on('grabAdjust',  (data) => this.#adjustGrabDistance(data));
    this.#handInput.on('grabEnd',     (data) => this.#endGrab(data));
    this.#handInput.on('fingerPick',  ({ mesh }) => this.#selectArcMesh(mesh));
    console.log('[GlobeScene] Hand input initialized');
  }

  // record grab state so grabMove can track relative movement
  #startGrab({ handedness, position, rotationQuaternion }) {
    if (!position || !rotationQuaternion) return;

    if (!this.globeRoot.rotationQuaternion) {
      this.globeRoot.rotationQuaternion = Quaternion.FromEulerAngles(
        this.globeRoot.rotation.x,
        this.globeRoot.rotation.y,
        this.globeRoot.rotation.z,
      );
    }

    const controllerRotation = rotationQuaternion.clone().normalize();
    const globeRotation      = this.globeRoot.rotationQuaternion.clone();

    // store scene offset in controller-local space so it stays fixed during rotation
    const offsetWorld       = this.sceneRoot.position.subtract(position);
    const inverseController = controllerRotation.clone().invert();
    const inverseMatrix     = new Matrix();
    inverseController.toRotationMatrix(inverseMatrix);
    const offsetLocal       = Vector3.TransformCoordinates(offsetWorld, inverseMatrix);

    const rotationOffset = inverseController.multiply(globeRotation);

    this.#grabActive         = true;
    this.#grabHandedness     = handedness;
    this.#grabOffsetLocal    = offsetLocal;
    this.#grabRotationOffset = rotationOffset;
  }

  // apply controller movement to the globe position and rotation
  #updateGrab({ handedness, position, rotationQuaternion }) {
    if (!this.#grabActive || this.#grabHandedness !== handedness) return;
    if (!position || !rotationQuaternion) return;

    const controllerRotation = rotationQuaternion.clone().normalize();
    const rotationMatrix     = new Matrix();
    controllerRotation.toRotationMatrix(rotationMatrix);

    const offsetWorld = Vector3.TransformCoordinates(this.#grabOffsetLocal, rotationMatrix);
    this.sceneRoot.position.copyFrom(position.add(offsetWorld));

    const newRotation = controllerRotation.multiply(this.#grabRotationOffset);
    if (!this.globeRoot.rotationQuaternion) {
      this.globeRoot.rotationQuaternion = newRotation.clone();
    } else {
      this.globeRoot.rotationQuaternion.copyFrom(newRotation);
    }
  }

  #endGrab({ handedness }) {
    if (this.#grabHandedness !== handedness) return;
    this.#grabActive         = false;
    this.#grabHandedness     = null;
    this.#grabOffsetLocal    = null;
    this.#grabRotationOffset = null;
  }

  // thumbstick Y adjusts the grab distance while holding
  #adjustGrabDistance({ handedness, axisY, position, rotationQuaternion }) {
    if (!this.#grabActive || this.#grabHandedness !== handedness) return;
    if (!this.#grabOffsetLocal) return;
    if (Math.abs(axisY) < GRAB_DISTANCE_DEADZONE) return;
    if (!position || !rotationQuaternion) return;

    const direction       = this.sceneRoot.position.subtract(position);
    const currentDistance = direction.length();
    if (currentDistance < 0.001) return;

    direction.normalize();
    const distanceDelta = -axisY * GRAB_DISTANCE_SPEED;
    const newDistance   = Math.max(0.05, currentDistance + distanceDelta);

    const offsetWorld       = direction.scale(newDistance);
    const inverseController = rotationQuaternion.clone().normalize().invert();
    const inverseMatrix     = new Matrix();
    inverseController.toRotationMatrix(inverseMatrix);
    this.#grabOffsetLocal = Vector3.TransformCoordinates(offsetWorld, inverseMatrix);
    this.sceneRoot.position.copyFrom(position.add(offsetWorld));
  }

  // spawn the globe straight ahead of the user at a comfortable distance
  #placeGlobeInFrontOfUser() {
    const camera = this.xr.baseExperience.camera;
    if (!camera) return;

    const headPos = camera.position.clone();

    // flatten forward to horizontal so globe spawns level regardless of head tilt
    const forward = camera.getForwardRay(1).direction.clone();
    forward.y = 0;
    if (forward.length() < 0.001) forward.z = 1;
    forward.normalize();

    const distance = GLOBE_RADIUS * 3.5;  // ~1.2 m - comfortable AR viewing distance
    this.sceneRoot.position.x = headPos.x + forward.x * distance;
    this.sceneRoot.position.y = headPos.y - 0.2;  // slightly below eye level
    this.sceneRoot.position.z = headPos.z + forward.z * distance;

    this.#legend?.reposition(forward);
  }

  // ── Private: passthrough ─────────────────────────────────────────────────────

  async #setupPassthrough() {
    if (!this.xr) return;

    this.#backgroundRemover = this.xr.baseExperience.featuresManager.enableFeature(
      WebXRFeatureName.BACKGROUND_REMOVER,
      'latest',
    );
    this.#backgroundRemover.detach();

    this.xr.baseExperience.sessionManager.onXRSessionInit.add((session) => {
      this.#syncPassthroughWithSession(session);
    });

    this.xr.baseExperience.sessionManager.onXRSessionEnded.add(() => {
      this.#arSessionActive = false;
      this.#applyPassthrough(false);
    });
  }

  // check the blend mode to determine if we're in AR passthrough
  #syncPassthroughWithSession(session) {
    if (!session) return;
    const blendMode = session.environmentBlendMode;
    this.#arSessionActive = blendMode === 'alpha-blend' || blendMode === 'additive';
    this.#applyPassthrough(this.#arSessionActive);
  }

  // toggle transparent background and background remover feature for AR
  #applyPassthrough(enabled) {
    this.scene.clearColor = enabled ? new Color4(0, 0, 0, 0) : SCENE_CLEAR_COLOR;
    if (this.#backgroundRemover) {
      if (enabled) {
        this.#backgroundRemover.attach();
      } else {
        this.#backgroundRemover.detach();
      }
    }
  }

  #loadControllerModels() {
    if (!this.#controllerInput) return;
    // motion controller models are loaded automatically by Babylon's XR experience
    const controllers = this.#controllerInput.getControllers();
    controllers.forEach((controller) => {
      try {
        if (controller.xrController.motionController) {
          console.log(`[GlobeScene] Loaded ${controller.deviceType} controller model (${controller.handedness})`);
        }
      } catch (error) {
        console.warn(`[GlobeScene] Failed to load ${controller.deviceType} model:`, error);
      }
    });
  }

  // ── Private: geometry ────────────────────────────────────────────────────────

  // builds a single merged mesh of H3 hexagonal cells covering all land polygons
  #buildHexMesh(countries) {
    const radius    = GLOBE_RADIUS + HEX_OFFSET;
    const positions = [];
    const normals   = [];
    const indices   = [];
    const seenCells = new Set();
    let skippedPolygons = 0;

    for (const polygon of countries) {
      const normalizedPolygon = this.#normalizePolygonForH3(polygon);
      if (!normalizedPolygon) {
        skippedPolygons += 1;
        continue;
      }

      let cells = [];
      try {
        cells = polygonToCells(normalizedPolygon, HEX_RESOLUTION, true);
      } catch {
        skippedPolygons += 1;
        continue;
      }

      for (const h3Idx of cells) {
        if (seenCells.has(h3Idx)) continue;
        seenCells.add(h3Idx);

        const [centerLat, centerLng] = cellToLatLng(h3Idx);
        const centerPos    = latLonToVec3(centerLat, centerLng, radius);
        const centerNormal = centerPos.clone().normalize();
        const boundary = cellToBoundary(h3Idx, true).slice(0, -1).reverse().map(([lng, lat]) => {
          // fix antimeridian-crossing cells by adjusting longitude
          if (Math.abs(centerLng - lng) > 170) {
            lng += centerLng > lng ? 360 : -360;
          }
          return [lng, lat];
        });

        const base = positions.length / 3;
        positions.push(centerPos.x, centerPos.y, centerPos.z);
        normals.push(centerNormal.x, centerNormal.y, centerNormal.z);

        for (const [lng, lat] of boundary) {
          const point       = latLonToVec3(lat, lng, radius);
          const pointNormal = point.clone().normalize();
          positions.push(point.x, point.y, point.z);
          normals.push(pointNormal.x, pointNormal.y, pointNormal.z);
        }

        for (let i = 0; i < boundary.length; i++) {
          indices.push(base, base + 1 + i, base + 1 + ((i + 1) % boundary.length));
        }
      }
    }

    const mesh = new Mesh('landHexagons', this.scene);
    const data = new VertexData();
    data.positions = new Float32Array(positions);
    data.indices   = new Uint32Array(indices);
    data.normals   = new Float32Array(normals);
    data.applyToMesh(mesh, false);

    const material = new StandardMaterial('landHexMat', this.scene);
    material.diffuseColor   = HEX_COLOR;
    material.emissiveColor  = HEX_EMISSIVE;
    material.alpha          = 0.88;
    material.disableLighting = true;
    material.backFaceCulling = false;
    mesh.material   = material;
    mesh.isPickable = false;

    console.log(`[GlobeScene] Built ${seenCells.size} hex cells from country polygons (${skippedPolygons} skipped polygons)`);
    return mesh;
  }

  // cleans and closes polygon rings into the format H3 expects
  #normalizePolygonForH3(polygon) {
    const rings = [];

    for (const ring of polygon) {
      const filtered = [];
      for (const point of ring) {
        if (!Array.isArray(point) || point.length < 2) continue;
        const rawLng = Number(point[0]);
        const lat    = Number(point[1]);
        if (!Number.isFinite(rawLng) || !Number.isFinite(lat)) continue;
        if (lat < -90 || lat > 90) continue;

        let lng = rawLng;
        while (lng >  180) lng -= 360;
        while (lng < -180) lng += 360;
        filtered.push([lng, lat]);
      }

      if (filtered.length < 3) continue;

      // ensure ring is closed
      const first   = filtered[0];
      const last    = filtered[filtered.length - 1];
      const isClosed = first[0] === last[0] && first[1] === last[1];
      if (!isClosed) filtered.push([first[0], first[1]]);

      if (filtered.length >= 4) rings.push(filtered);
    }

    if (rings.length === 0) return null;
    return rings;
  }

  // builds the country border line system from polygon rings
  #buildBorderLineSystem(countries) {
    const lines  = [];
    const radius = GLOBE_RADIUS + BORDER_OFFSET;

    for (const polygon of countries) {
      for (const ring of polygon) {
        if (ring.length < 2) continue;
        lines.push(ring.map(([lng, lat]) => latLonToVec3(lat, lng, radius)));
      }
    }

    if (lines.length === 0) return null;

    const mesh = MeshBuilder.CreateLineSystem('borders', {
      lines,
      updatable: false,
    }, this.scene);

    mesh.color      = BORDER_COLOR;
    mesh.alpha      = 0.52;
    mesh.isPickable = false;

    console.log(`[GlobeScene] Built ${lines.length} border rings`);
    return mesh;
  }

  // ── Private: picking ─────────────────────────────────────────────────────────

  // show the arc info panel for a picked mesh, or hide if nothing was hit
  #selectArcMesh(mesh) {
    const info = this.arcs?.getGroupInfo(mesh);
    if (info) {
      this.arcs?.pinGroup(info._group);
      const onDismiss = info.flagged ? () => {
        this.arcs?.dismissAlert(info._group);
        this.#arcPanel?.hide();
      } : null;
      this.#arcPanel?.show(info, info.apexLocal, onDismiss);
    } else {
      // clicking empty space closes normal panels but leaves alert panels open
      this.arcs?.unpinGroup();
      if (!this.arcs?.hasActiveAlert) this.#arcPanel?.hide();
    }
  }

  #setupPicking() {
    let downX = 0;
    let downY = 0;

    // only match arc hitboxes - bypasses the default isVisible predicate
    const arcPred = (mesh) => !!(mesh.isPickable && mesh.metadata?.group);

    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        downX = pointerInfo.event?.clientX ?? 0;
        downY = pointerInfo.event?.clientY ?? 0;
        return;
      }

      if (pointerInfo.type !== PointerEventTypes.POINTERUP) return;

      // ignore drag gestures (ArcRotateCamera orbit) - 5px threshold
      const cx = pointerInfo.event?.clientX;
      const cy = pointerInfo.event?.clientY;
      if (cx !== undefined) {
        if ((cx - downX) ** 2 + (cy - downY) ** 2 > 25) return;
      }

      // if the pick landed on the info panel, let the GUI handle it
      if (pointerInfo.pickInfo?.pickedMesh?.metadata?.isPanel) return;

      // explicit arc-only pick using our custom predicate (finds invisible hitboxes)
      let arcPick = null;
      if (cx !== undefined) {
        arcPick = this.scene.pick(cx, cy, arcPred);
      }
      if (!arcPick?.hit && pointerInfo.pickInfo?.ray) {
        arcPick = this.scene.pickWithRay(pointerInfo.pickInfo.ray, arcPred);
      }

      this.#selectArcMesh(arcPick?.hit ? arcPick.pickedMesh : null);
    });
  }

  #loadMaskPixels() {
    return null;
  }

  // decodes a topojson topology into an array of polygon ring arrays
  #decodeTopojson(topology) {
    const object = topology.objects.countries;
    if (!object) return [];

    const { scale, translate } = topology.transform;
    const arcs = topology.arcs;

    // decode a single arc index (negative = reversed arc)
    const decodeArc = (arcIdx) => {
      const reversed = arcIdx < 0;
      const idx      = reversed ? ~arcIdx : arcIdx;
      let x = 0;
      let y = 0;

      const points = arcs[idx].map(([dx, dy]) => {
        x += dx;
        y += dy;
        return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
      });

      return reversed ? points.reverse() : points;
    };

    const decodeRing = (ring) => {
      const coords = ring.flatMap(decodeArc);
      if (coords.length > 0) coords.push(coords[0]);  // close the ring
      return coords;
    };

    const countries = [];
    for (const geometry of object.geometries) {
      if (geometry.type === 'Polygon') {
        countries.push(geometry.arcs.map(decodeRing));
      } else if (geometry.type === 'MultiPolygon') {
        for (const polygon of geometry.arcs) {
          countries.push(polygon.map(decodeRing));
        }
      }
    }

    return countries;
  }
}
