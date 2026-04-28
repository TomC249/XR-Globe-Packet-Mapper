/**
 * WristHUD.js
 * A small stats panel attached to the user's left wrist (or left controller
 * as a fallback) when in an immersive-VR session.
 *
 * Attach flow:
 *   1. If the device reports hand tracking → attach to the left wrist joint.
 *   2. Otherwise → attach to the left controller grip (or pointer) when added.
 */
import { MeshBuilder, Vector3 } from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  TextBlock,
  Rectangle,
  StackPanel,
  Control,
} from '@babylonjs/gui';

// ── Placement tuning ──────────────────────────────────────────────────────────
// Quest controller grip space — Y up the shaft, Z toward the user's body.
// Panel sits on top of the controller facing the user.
const CTRL_POS = new Vector3(0, 0.04, -0.04);
const CTRL_ROT = new Vector3(Math.PI / 3, 0, 0);
const CTRL_POS_RIGHT = new Vector3(0, 0.04, -0.04);
const CTRL_ROT_RIGHT = new Vector3(Math.PI / 3, 0, 0);

export class WristHUD {
  #scene;
  #plane        = null;
  #texture      = null;
  #valueBlocks  = {};
  #handedness = 'left';

  constructor(scene) {
    this.#scene = scene;
  }

  init(xr, handedness = 'left') {
    this.#handedness = handedness;
    this.#buildMesh();
    this.#setupControllerFallback(xr);
  }

  /** Call once per stats tick to refresh the displayed values. */
  update({ arcs, flows, rate, fps }) {
    if (this.#valueBlocks.arcs)  this.#valueBlocks.arcs.text  = String(arcs);
    if (this.#valueBlocks.flows) this.#valueBlocks.flows.text = String(flows);
    if (this.#valueBlocks.rate)  this.#valueBlocks.rate.text  = rate;
    if (this.#valueBlocks.fps)   this.#valueBlocks.fps.text   = String(fps);
  }

  // ── Mesh & GUI ─────────────────────────────────────────────────────────────

  #buildMesh() {
    // ~business-card size in metres
    this.#plane = MeshBuilder.CreatePlane('wristHUD', { width: 0.2, height: 0.13 }, this.#scene);
    this.#plane.isPickable = false;
    this.#plane.setEnabled(false);

    this.#texture = AdvancedDynamicTexture.CreateForMesh(this.#plane, 400, 260);

    const bg = new Rectangle('bg');
    bg.width = '100%';
    bg.height = '100%';
    bg.background = '#080814';
    bg.color = '#00e5ff33';
    bg.thickness = 1;
    bg.cornerRadius = 8;
    this.#texture.addControl(bg);

    const stack = new StackPanel('stack');
    stack.width = '90%';
    stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    stack.paddingTopInPixels = 14;
    bg.addControl(stack);

    // Header
    const header = new TextBlock('header', 'NET GLOBE');
    header.color = '#00e5ff99';
    header.fontSize = 18;
    header.fontFamily = 'Courier New';
    header.height = '30px';
    stack.addControl(header);

    // Divider
    const divider = new Rectangle('divider');
    divider.height = '1px';
    divider.width = '100%';
    divider.background = '#00e5ff44';
    divider.thickness = 0;
    stack.addControl(divider);

    const gap = new Rectangle('gap');
    gap.height = '6px';
    gap.width = '100%';
    gap.thickness = 0;
    stack.addControl(gap);

    // Stat rows
    for (const [key, label] of [
      ['arcs',  'Active arcs'],
      ['flows', 'Total flows'],
      ['rate',  'Data rate  '],
      ['fps',   'FPS        '],
    ]) {
      this.#valueBlocks[key] = this.#addStatRow(stack, label);
    }
  }

  #addStatRow(parent, label) {
    const row = new StackPanel(`row_${label}`);
    row.isVertical = false;
    row.height = '34px';
    row.width = '100%';
    parent.addControl(row);

    const lbl = new TextBlock(`lbl_${label}`, label);
    lbl.color = '#ffffff55';
    lbl.fontSize = 13;
    lbl.fontFamily = 'Courier New';
    lbl.width = '180px';
    lbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(lbl);

    const val = new TextBlock(`val_${label}`, '—');
    val.color = '#ffffff';
    val.fontSize = 14;
    val.fontFamily = 'Courier New';
    val.fontWeight = 'bold';
    val.width = '170px';
    val.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    row.addControl(val);

    return val;
  }

  // ── XR Attachment ──────────────────────────────────────────────────────────

  #setupControllerFallback(xr) {
    xr.input.onControllerAddedObservable.add((controller) => {
      if (controller.inputSource.handedness !== this.#handedness) return;

      const attach = () => {
        const anchor = controller.grip ?? controller.pointer;
        if (!anchor) return;
        this.#plane.parent = anchor;
        const pos = this.#handedness === 'right' ? CTRL_POS_RIGHT : CTRL_POS;
        const rot = this.#handedness === 'right' ? CTRL_ROT_RIGHT : CTRL_ROT;
        this.#plane.position.copyFrom(pos);
        this.#plane.rotation.copyFrom(rot);
        this.#plane.setEnabled(true);
      };

      // grip is the XR grip-space TransformNode; usually available immediately,
      // but some runtimes set it later via motion controller init.
      if (controller.grip) {
        attach();
      } else {
        controller.onMotionControllerInitObservable.addOnce(attach);
      }
    });

    xr.input.onControllerRemovedObservable.add((controller) => {
      if (controller.inputSource.handedness === this.#handedness) {
        this.#plane.setEnabled(false);
      }
    });
  }
}
