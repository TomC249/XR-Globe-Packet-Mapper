// ControllerInput.js - XR controller input mapped to globe interaction events
//
// Gesture priority (highest to lowest):
//   1. Both triggers pressed -> scale globe
//   2. Single grip           -> grab globe (move + rotate)

import { Quaternion, Vector3 } from '@babylonjs/core';

const ROTATION_SPEED  = 3.0;
const SCALE_SPEED     = 0.05;
const TRANSLATE_SPEED = 0.8;

// ── Controller ───────────────────────────────────────────────────────────────

class Controller {
  constructor(xrController) {
    this.xrController      = xrController;
    this.handedness        = xrController.inputSource.handedness;  // 'left' or 'right'
    this.deviceType        = this.#detectDeviceType(xrController);
    this.previousPosition  = new Vector3();
    this.currentPosition   = new Vector3();
    this.triggerPressed      = false;
    this.triggerJustPressed  = false;
    this.triggerJustReleased = false;
    this.gripPressed         = false;
    this.gripJustPressed     = false;
    this.gripJustReleased    = false;
    this.thumbstickY         = 0;
    console.log(`[Controller] Initialized ${this.handedness} controller for ${this.deviceType}`);
  }

  // detect headset model from the WebXR profile string
  #detectDeviceType(xrController) {
    const profile = xrController.inputSource.profiles?.[0] || '';
    if (profile.includes('quest-pro'))                             return 'Quest Pro';
    if (profile.includes('quest-3') || profile.includes('meta-quest-3')) return 'Quest 3';
    if (profile.includes('quest'))                                 return 'Meta Quest';
    return 'Unknown Headset';
  }

  update() {
    // update grip position
    if (this.xrController.grip) {
      this.previousPosition.copyFrom(this.currentPosition);
      this.currentPosition.copyFrom(this.xrController.grip.position);
    }

    // standard WebXR button mapping:
    //   buttons[0] = trigger (index finger)
    //   buttons[1] = squeeze (grip)
    const gamepad = this.xrController.inputSource.gamepad;
    if (gamepad) {
      const prevTrigger      = this.triggerPressed;
      this.triggerPressed      = gamepad.buttons[0]?.pressed ?? false;
      this.triggerJustPressed  = this.triggerPressed && !prevTrigger;
      this.triggerJustReleased = !this.triggerPressed && prevTrigger;

      const prevGrip         = this.gripPressed;
      this.gripPressed         = gamepad.buttons[1]?.pressed ?? false;
      this.gripJustPressed     = this.gripPressed && !prevGrip;
      this.gripJustReleased    = !this.gripPressed && prevGrip;

      this.thumbstickY = this.#getThumbstickY(gamepad);
    }
  }

  // read thumbstick Y, trying axes[3] first (Quest), then axes[1] as fallback
  #getThumbstickY(gamepad) {
    const axes = gamepad?.axes ?? [];
    if (axes.length >= 4 && Number.isFinite(axes[3])) return axes[3];
    if (axes.length >= 2 && Number.isFinite(axes[1])) return axes[1];
    return 0;
  }

  getPositionDelta() {
    return this.currentPosition.subtract(this.previousPosition);
  }
}

// ── ControllerInput ──────────────────────────────────────────────────────────

export class ControllerInput {
  #xr;
  #controllers           = new Map();  // handedness -> Controller
  #eventHandlers         = {};
  #previousHandSeparation = null;
  #activeGrabHand        = null;

  constructor(xr) {
    this.#xr = xr;

    if (!xr || !xr.input) {
      console.warn('[ControllerInput] XR input not available');
      return;
    }

    // track controller connections and disconnections
    xr.input.onControllerAddedObservable.add((xrController) => {
      const controller = new Controller(xrController);
      this.#controllers.set(controller.handedness, controller);
      console.log(`[ControllerInput] Controller connected: ${controller.handedness} (${controller.deviceType})`);
    });

    xr.input.onControllerRemovedObservable.add((xrController) => {
      const handedness = xrController.inputSource.handedness;
      this.#controllers.delete(handedness);
      console.log(`[ControllerInput] Controller disconnected: ${handedness}`);
    });
  }

  on(event, handler) {
    this.#eventHandlers[event] = this.#eventHandlers[event] ?? [];
    this.#eventHandlers[event].push(handler);
    return this;
  }

  getControllers() {
    return this.#controllers;
  }

  #emit(event, data) {
    this.#eventHandlers[event]?.forEach((handler) => handler(data));
  }

  update() {
    if (this.#controllers.size === 0) return;

    const controllers      = Array.from(this.#controllers.values());
    controllers.forEach((c) => c.update());

    const leftController  = this.#controllers.get('left');
    const rightController = this.#controllers.get('right');

    const bothTriggersPressed = leftController?.triggerPressed && rightController?.triggerPressed;

    // gesture priority: scaling takes precedence over grabbing
    if (bothTriggersPressed) {
      this.#handleScaling(leftController, rightController);
    } else if (this.#shouldHandleGrab(leftController, rightController)) {
      this.#handleGrab(leftController, rightController);
    }
  }

  #shouldHandleGrab(leftController, rightController) {
    return (
      this.#activeGrabHand ||
      leftController?.gripPressed      ||
      rightController?.gripPressed     ||
      leftController?.gripJustPressed  ||
      rightController?.gripJustPressed ||
      leftController?.gripJustReleased ||
      rightController?.gripJustReleased
    );
  }

  // extract position and rotation quaternion from a controller's grip node
  #getControllerPose(controller) {
    const grip = controller?.xrController?.grip;
    if (!grip) return null;

    const position = grip.position.clone();
    let rotationQuaternion = grip.rotationQuaternion?.clone();

    if (!rotationQuaternion && grip.rotation) {
      rotationQuaternion = Quaternion.FromEulerAngles(
        grip.rotation.x,
        grip.rotation.y,
        grip.rotation.z,
      );
    }

    rotationQuaternion = rotationQuaternion ?? Quaternion.Identity();
    return { position, rotationQuaternion };
  }

  // handle grab start, move, adjust, and release events
  #handleGrab(leftController, rightController) {
    if (leftController?.gripJustPressed || rightController?.gripJustPressed) {
      // right hand takes priority if both grip at the same time
      this.#activeGrabHand = rightController?.gripJustPressed ? 'right' : 'left';
      const controller = this.#controllers.get(this.#activeGrabHand);
      const pose = this.#getControllerPose(controller);
      if (pose) {
        this.#emit('grabStart', { handedness: this.#activeGrabHand, ...pose });
      }
    }

    if (!this.#activeGrabHand) {
      if (rightController?.gripPressed)      this.#activeGrabHand = 'right';
      else if (leftController?.gripPressed)  this.#activeGrabHand = 'left';
    }

    if (!this.#activeGrabHand) return;

    const activeController = this.#controllers.get(this.#activeGrabHand);
    if (!activeController) {
      this.#activeGrabHand = null;
      return;
    }

    if (activeController.gripPressed) {
      const pose = this.#getControllerPose(activeController);
      if (pose) {
        this.#emit('grabMove',   { handedness: this.#activeGrabHand, ...pose });
        this.#emit('grabAdjust', {
          handedness: this.#activeGrabHand,
          axisY: activeController.thumbstickY,
          ...pose,
        });
      }
    } else if (activeController.gripJustReleased) {
      this.#emit('grabEnd', { handedness: this.#activeGrabHand });
      this.#activeGrabHand = null;
    }
  }

  #handleRotation(leftController, rightController) {
    const controller = leftController?.gripPressed ? leftController : rightController;
    if (!controller) return;

    const delta = controller.getPositionDelta();
    if (Math.abs(delta.y) > 0.0001) this.#emit('rotateX', { delta: delta.y * ROTATION_SPEED });
    if (Math.abs(delta.x) > 0.0001) this.#emit('rotateY', { delta: delta.x * ROTATION_SPEED });
    if (Math.abs(delta.z) > 0.0001) this.#emit('rotateZ', { delta: delta.z * ROTATION_SPEED });
  }

  // scale factor is the ratio of current to previous hand separation
  #handleScaling(leftController, rightController) {
    if (!leftController || !rightController) return;

    const currentSeparation = Vector3.Distance(
      leftController.currentPosition,
      rightController.currentPosition,
    );

    if (this.#previousHandSeparation === null) {
      this.#previousHandSeparation = currentSeparation;
      return;
    }

    const scaleFactor = currentSeparation / this.#previousHandSeparation;
    this.#emit('scale', { factor: scaleFactor });
    this.#previousHandSeparation = currentSeparation;
  }

  #handleTranslation(leftController, rightController) {
    if (leftController?.triggerPressed) {
      const delta = leftController.getPositionDelta();
      if (delta.length() > 0.0001) {
        delta.scaleInPlace(TRANSLATE_SPEED);
        this.#emit('translateLeft', { delta });
      }
    }
    if (rightController?.triggerPressed) {
      const delta = rightController.getPositionDelta();
      if (delta.length() > 0.0001) {
        delta.scaleInPlace(TRANSLATE_SPEED);
        this.#emit('translateRight', { delta });
      }
    }
  }

  // average both controllers' deltas for smooth two-handed movement
  #handleMovement(leftController, rightController) {
    if (!leftController || !rightController) return;

    const movementDelta = leftController.getPositionDelta()
      .add(rightController.getPositionDelta())
      .scale(0.5);

    if (movementDelta.length() > 0.0001) {
      movementDelta.scaleInPlace(TRANSLATE_SPEED);
      this.#emit('move', { delta: movementDelta });
    }
  }
}
