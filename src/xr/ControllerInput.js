/**
 * ControllerInput.js
 * Handles XR controller input for globe interaction:
 * - Trigger buttons (both): scale globe
 * - Single grip: grab globe (movement + rotation)
 */

import { Quaternion, Vector3 } from '@babylonjs/core';

const ROTATION_SPEED = 3.0;
const SCALE_SPEED = 0.05;
const TRANSLATE_SPEED = 0.8;

class Controller {
  constructor(xrController) {
    this.xrController = xrController;
    this.handedness = xrController.inputSource.handedness; // 'left' or 'right'
    this.deviceType = this.#detectDeviceType(xrController);
    this.previousPosition = new Vector3();
    this.currentPosition = new Vector3();
    this.triggerPressed = false;
    this.triggerJustPressed = false;
    this.triggerJustReleased = false;
    this.gripPressed = false;
    this.gripJustPressed = false;
    this.gripJustReleased = false;
    this.thumbstickY = 0;
    console.log(`[Controller] Initialized ${this.handedness} controller for ${this.deviceType}`);
  }

  #detectDeviceType(xrController) {
    const inputSource = xrController.inputSource;
    const profile = inputSource.profiles?.[0] || '';
    
    if (profile.includes('quest-pro')) {
      return 'Quest Pro';
    } else if (profile.includes('quest-3') || profile.includes('meta-quest-3')) {
      return 'Quest 3';
    } else if (profile.includes('quest')) {
      return 'Meta Quest';
    }
    return 'Unknown Headset';
  }

  update() {
    // Update position
    if (this.xrController.grip) {
      this.previousPosition.copyFrom(this.currentPosition);
      this.currentPosition.copyFrom(this.xrController.grip.position);
    }

    // Update button states (xr-standard mapping)
    const gamepad = this.xrController.inputSource.gamepad;
    if (gamepad) {
      // Standard WebXR mapping:
      // buttons[0] = xr-standard-trigger (index finger)
      // buttons[1] = xr-standard-squeeze (grip)
      // buttons[3] = xr-standard-buttonY (top button on left controller)
      const previousTriggerPressed = this.triggerPressed;
      this.triggerPressed = gamepad.buttons[0]?.pressed ?? false;
      this.triggerJustPressed = this.triggerPressed && !previousTriggerPressed;
      this.triggerJustReleased = !this.triggerPressed && previousTriggerPressed;
      const previousGripPressed = this.gripPressed;
      this.gripPressed = gamepad.buttons[1]?.pressed ?? false;
      this.gripJustPressed = this.gripPressed && !previousGripPressed;
      this.gripJustReleased = !this.gripPressed && previousGripPressed;
      this.thumbstickY = this.#getThumbstickY(gamepad);
    }
  }

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

export class ControllerInput {
  #xr;
  #controllers = new Map(); // handedness -> Controller
  #eventHandlers = {};
  #previousHandSeparation = null;
  #activeGrabHand = null;

  constructor(xr) {
    this.#xr = xr;

    if (!xr || !xr.input) {
      console.warn('[ControllerInput] XR input not available');
      return;
    }

    // Track controller connections
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

    // Update all controllers
    const controllers = Array.from(this.#controllers.values());
    controllers.forEach((c) => c.update());

    // Get controller states
    const leftController = this.#controllers.get('left');
    const rightController = this.#controllers.get('right');

    // Detect multi-hand button states
    const bothTriggersPressed = leftController?.triggerPressed && rightController?.triggerPressed;

    // Gesture priority (highest to lowest):
    // 1. Both triggers → Scale
    if (bothTriggersPressed) {
      this.#handleScaling(leftController, rightController);
    }
    // 2. Single grip → Grab (move/rotate globe)
    else if (this.#shouldHandleGrab(leftController, rightController)) {
      this.#handleGrab(leftController, rightController);
    }
  }

  #shouldHandleGrab(leftController, rightController) {
    return (
      this.#activeGrabHand ||
      leftController?.gripPressed ||
      rightController?.gripPressed ||
      leftController?.gripJustPressed ||
      rightController?.gripJustPressed ||
      leftController?.gripJustReleased ||
      rightController?.gripJustReleased
    );
  }

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

  #handleGrab(leftController, rightController) {
    if (leftController?.gripJustPressed || rightController?.gripJustPressed) {
      this.#activeGrabHand = rightController?.gripJustPressed ? 'right' : 'left';
      const controller = this.#controllers.get(this.#activeGrabHand);
      const pose = this.#getControllerPose(controller);
      if (pose) {
        this.#emit('grabStart', { handedness: this.#activeGrabHand, ...pose });
      }
    }

    if (!this.#activeGrabHand) {
      if (rightController?.gripPressed) {
        this.#activeGrabHand = 'right';
      } else if (leftController?.gripPressed) {
        this.#activeGrabHand = 'left';
      }
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
        this.#emit('grabMove', { handedness: this.#activeGrabHand, ...pose });
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
    if (Math.abs(delta.y) > 0.0001) {
      const rotationDelta = delta.y * ROTATION_SPEED;
      this.#emit('rotateX', { delta: rotationDelta });
    }
    if (Math.abs(delta.x) > 0.0001) {
      const rotationDelta = delta.x * ROTATION_SPEED;
      this.#emit('rotateY', { delta: rotationDelta });
    }
    if (Math.abs(delta.z) > 0.0001) {
      const rotationDelta = delta.z * ROTATION_SPEED;
      this.#emit('rotateZ', { delta: rotationDelta });
    }
  }

  #handleScaling(leftController, rightController) {
    if (!leftController || !rightController) return;

    const leftPos = leftController.currentPosition;
    const rightPos = rightController.currentPosition;
    const currentSeparation = Vector3.Distance(leftPos, rightPos);

    if (this.#previousHandSeparation === null) {
      this.#previousHandSeparation = currentSeparation;
      return;
    }

    // Scale factor: ratio of current to previous separation
    const scaleFactor = currentSeparation / this.#previousHandSeparation;
    this.#emit('scale', { factor: scaleFactor });

    this.#previousHandSeparation = currentSeparation;
  }

  #handleTranslation(leftController, rightController) {
    // Handle each controller's trigger independently for hand-specific movement
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

  #handleMovement(leftController, rightController) {
    if (!leftController || !rightController) return;

    // Use both controllers' positions to compute movement delta
    const leftDelta = leftController.getPositionDelta();
    const rightDelta = rightController.getPositionDelta();

    // Average the deltas from both hands for smoother movement
    const movementDelta = leftDelta.add(rightDelta).scale(0.5);

    if (movementDelta.length() > 0.0001) {
      // Scale movement by speed factor
      movementDelta.scaleInPlace(TRANSLATE_SPEED);
      this.#emit('move', { delta: movementDelta });
    }
  }
}
