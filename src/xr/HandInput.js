/**
 * HandInput.js
 * WebXR hand-tracking input, mapping gestures to the same events as ControllerInput:
 *
 *  Pinch (index tip + thumb tip ≤ 2.5 cm) → grab globe  (grabStart / grabMove / grabEnd)
 *  Both hands pinching             → scale globe   (scale)
 *  Pinch while finger tip near arc → pick arc      (fingerPick)
 *
 * Uses Babylon 7's WebXRHandTracking feature + WebXRHandJoint enum.
 * Joint meshes are invisible but still position-tracked each frame.
 */

import { Ray, Vector3, Quaternion, WebXRFeatureName, WebXRHandJoint } from '@babylonjs/core';

const PINCH_ENGAGE    = 0.026; // m — enter pinch
const PINCH_RELEASE   = 0.046; // m — leave pinch (hysteresis)
const FINGER_RAY_BACK = 0.05;  // m — start ray this far behind fingertip
const FINGER_RAY_LEN  = 0.10;  // m — total ray length

export class HandInput {
  #xr;
  #scene;
  #feature = null;
  #hands   = new Map(); // handedness → HandState
  #eventHandlers = {};
  #prevSeparation = null;
  #activeGrabHand = null;

  constructor(xr, scene) {
    this.#xr    = xr;
    this.#scene = scene;
    this.#enable();
  }

  on(event, handler) {
    this.#eventHandlers[event] = this.#eventHandlers[event] ?? [];
    this.#eventHandlers[event].push(handler);
    return this;
  }

  /**
   * Call every frame from the render loop.
   * @param {import('@babylonjs/core').Camera} camera - active camera (for finger-pick ray)
   */
  update(camera) {
    if (!this.#feature || this.#hands.size === 0) return;

    for (const state of this.#hands.values()) {
      this.#updatePinchState(state);
    }

    const L = this.#hands.get('left');
    const R = this.#hands.get('right');

    const bothPinching = L?.pinched && R?.pinched;
    if (bothPinching) {
      this.#handleScale(L, R);
    } else {
      this.#prevSeparation = null;
      this.#handleGrab(L, R, camera);
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  #enable() {
    try {
      this.#feature = this.#xr.baseExperience.featuresManager.enableFeature(
        WebXRFeatureName.HAND_TRACKING,
        'latest',
        {
          xrInput: this.#xr.input,
          // Hide the individual joint spheres — the default glTF hand mesh renders instead.
          jointMeshes: { invisible: false },
          // handMeshes left unconfigured → default Babylon glTF hand model is shown.
        },
        true,
        true,
      );
    } catch (e) {
      console.warn('[HandInput] Hand tracking unavailable:', e);
      return;
    }

    this.#feature.onHandAddedObservable.add((hand) => {
      const handedness = hand.xrController.inputSource.handedness;
      this.#hands.set(handedness, {
        hand,
        handedness,
        pinched:            false,
        pinchedJustPressed:  false,
        pinchedJustReleased: false,
        nearMesh: null,
      });
      console.log('[HandInput] Hand tracking started:', handedness);
    });

    this.#feature.onHandRemovedObservable.add((hand) => {
      const handedness = hand.xrController.inputSource.handedness;
      if (this.#activeGrabHand === handedness) {
        this.#emit('grabEnd', { handedness });
        this.#activeGrabHand = null;
      }
      this.#hands.delete(handedness);
      console.log('[HandInput] Hand tracking lost:', handedness);
    });
  }

  #joint(hand, jointName) {
    try { return hand.getJointMesh(jointName); } catch { return null; }
  }

  #updatePinchState(state) {
    const thumb = this.#joint(state.hand, WebXRHandJoint.THUMB_TIP);
    const index = this.#joint(state.hand, WebXRHandJoint.INDEX_FINGER_TIP);
    if (!thumb || !index) return;

    const dist = Vector3.Distance(thumb.position, index.position);
    const prev = state.pinched;

    if (!state.pinched && dist < PINCH_ENGAGE)  state.pinched = true;
    if ( state.pinched && dist > PINCH_RELEASE) state.pinched = false;

    state.pinchedJustPressed  =  state.pinched && !prev;
    state.pinchedJustReleased = !state.pinched &&  prev;
  }

  #getWristPose(state) {
    const wrist = this.#joint(state.hand, WebXRHandJoint.WRIST);
    if (!wrist) return null;
    return {
      position:           wrist.position.clone(),
      rotationQuaternion: wrist.rotationQuaternion?.clone() ?? Quaternion.Identity(),
    };
  }

  #handleScale(L, R) {
    const lIndex = this.#joint(L.hand, WebXRHandJoint.INDEX_FINGER_TIP);
    const rIndex = this.#joint(R.hand, WebXRHandJoint.INDEX_FINGER_TIP);
    if (!lIndex || !rIndex) return;

    const sep = Vector3.Distance(lIndex.position, rIndex.position);
    if (this.#prevSeparation !== null) {
      const factor = sep / this.#prevSeparation;
      if (factor > 0.5 && factor < 2.0) this.#emit('scale', { factor });
    }
    this.#prevSeparation = sep;
  }

  #handleGrab(L, R, camera) {
    // Check for new pinch start on either hand
    for (const state of [R, L]) {
      if (!state?.pinchedJustPressed || this.#activeGrabHand) continue;

      // Try arc selection first: short ray from behind fingertip through tip
      if (camera && this.#tryFingerPick(state, camera)) return;

      // Start globe grab
      this.#activeGrabHand = state.handedness;
      const pose = this.#getWristPose(state);
      if (pose) this.#emit('grabStart', { handedness: state.handedness, ...pose });
      return;
    }

    if (!this.#activeGrabHand) return;

    const active = this.#hands.get(this.#activeGrabHand);
    if (!active) { this.#activeGrabHand = null; return; }

    if (active.pinched) {
      const pose = this.#getWristPose(active);
      if (pose) {
        this.#emit('grabMove',   { handedness: this.#activeGrabHand, ...pose });
        this.#emit('grabAdjust', { handedness: this.#activeGrabHand, axisY: 0, ...pose });
      }
    } else if (active.pinchedJustReleased) {
      this.#emit('grabEnd', { handedness: this.#activeGrabHand });
      this.#activeGrabHand = null;
    }
  }

  /** Cast a short ray from the camera through the fingertip. Hit = arc selection. */
  #tryFingerPick(state, camera) {
    const index = this.#joint(state.hand, WebXRHandJoint.INDEX_FINGER_TIP);
    if (!index) return false;

    const tipPos = index.position;
    const dir    = tipPos.subtract(camera.position).normalize();
    const start  = tipPos.subtract(dir.scale(FINGER_RAY_BACK));
    const ray    = new Ray(start, dir, FINGER_RAY_LEN);

    const pick = this.#scene.pickWithRay(
      ray,
      (mesh) => mesh.isPickable && !!mesh.metadata?.group,
    );

    if (pick?.hit && pick.pickedMesh) {
      this.#emit('fingerPick', { mesh: pick.pickedMesh });
      return true;
    }
    return false;
  }

  #emit(event, data) {
    this.#eventHandlers[event]?.forEach((h) => h(data));
  }
}
