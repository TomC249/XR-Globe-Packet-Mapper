// XR legend panel showing the traffic heat scale, positioned to the user's right
import { MeshBuilder, Vector3 } from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  TextBlock,
  Rectangle,
  StackPanel,
  Control,
} from '@babylonjs/gui';

// heat scale entries matching the colours in NetworkArcs
const HEAT_SCALE_ENTRIES = [
  { label: 'Low',      color: '#00e5ff' },
  { label: 'Medium',   color: '#66bb6a' },
  { label: 'High',     color: '#ffd740' },
  { label: 'Very High', color: '#ff8c1a' },
];

export class GlobeLegend {
  #scene;
  #plane       = null;
  #sceneRoot   = null;
  #globeRoot   = null;  // needed to read the current uniform scale
  #globeRadius = 0;
  #worldOffset = new Vector3();  // base offset at scale=1, applied scaled each frame

  constructor(scene) {
    this.#scene = scene;
  }

  init(sceneRoot, globeRoot, globeRadius) {
    this.#sceneRoot   = sceneRoot;
    this.#globeRoot   = globeRoot;
    this.#globeRadius = globeRadius;

    this.#plane = MeshBuilder.CreatePlane('globeLegend', { width: 0.16, height: 0.26 }, this.#scene);
    this.#plane.isPickable = false;
    this.#plane.setEnabled(false);
    // no parent - world position is driven manually each frame so no rotation
    // or scale is inherited from the globe or scene root

    this.#buildGui();
  }

  show() { this.#plane?.setEnabled(true); }
  hide() { this.#plane?.setEnabled(false); }

  // snap panel to the user's right when entering XR, using their forward direction
  reposition(forward) {
    if (!this.#plane || !this.#sceneRoot) return;
    const r = this.#globeRadius;

    // Babylon is left-handed Y-up: right = up x forward = (fz, 0, -fx)
    const right = new Vector3(forward.z, 0, -forward.x);

    // base offset at scale 1 - to the user's right of globe centre, slightly toward user
    this.#worldOffset.x = right.x * r * 0.85 - forward.x * r * 1.4;
    this.#worldOffset.y = -r * 0.75;
    this.#worldOffset.z = right.z * r * 0.85 - forward.z * r * 1.4;

    // place immediately at current globe-centre position
    const scale  = this.#globeRoot?.scaling.x ?? 1;
    const centre = this.#sceneRoot.getAbsolutePosition();
    this.#plane.position.x = centre.x + this.#worldOffset.x * scale;
    this.#plane.position.y = centre.y + this.#worldOffset.y * scale;
    this.#plane.position.z = centre.z + this.#worldOffset.z * scale;

    // CreatePlane front face is -Z, so rotation.y = atan2(forward.x, forward.z)
    // makes the front face toward the user
    this.#plane.rotation.y = Math.atan2(forward.x, forward.z);
  }

  // follow globe centre (with scale) and softly billboard toward the camera each frame
  update(camera) {
    if (!this.#plane?.isEnabled() || !camera || !this.#sceneRoot) return;

    // follow globe centre, scaled with globe zoom
    const scale  = this.#globeRoot?.scaling.x ?? 1;
    const centre = this.#sceneRoot.getAbsolutePosition();
    this.#plane.position.x = centre.x + this.#worldOffset.x * scale;
    this.#plane.position.y = centre.y + this.#worldOffset.y * scale;
    this.#plane.position.z = centre.z + this.#worldOffset.z * scale;

    // soft Y-axis billboard
    const toCam = camera.position.subtract(this.#plane.position);
    toCam.y = 0;
    if (toCam.length() < 0.001) return;
    toCam.normalize();

    // front-face normal in world space is local -Z: panelFront = (-sin(curY), 0, -cos(curY))
    // target: -sin(r) = toCam.x -> r = atan2(-toCam.x, -toCam.z)
    const curY    = this.#plane.rotation.y;
    const targetY = Math.atan2(-toCam.x, -toCam.z);

    const panelFront = new Vector3(-Math.sin(curY), 0, -Math.cos(curY));
    const alignment  = Math.max(0, Vector3.Dot(panelFront, toCam));

    // cubic falloff - barely rotates at the sides, snappy when looked at directly
    const lerpT = 0.005 + (alignment ** 3) * 0.15;

    let diff = targetY - curY;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    this.#plane.rotation.y = curY + diff * lerpT;
  }

  // builds the legend GUI with heat scale rows
  #buildGui() {
    const texture = AdvancedDynamicTexture.CreateForMesh(this.#plane, 320, 520);

    const bg = new Rectangle('bg');
    bg.width        = '100%';
    bg.height       = '100%';
    bg.background   = '#080814cc';
    bg.color        = '#ffffff1a';
    bg.thickness    = 1;
    bg.cornerRadius = 8;
    texture.addControl(bg);

    const stack = new StackPanel('stack');
    stack.width                = '88%';
    stack.verticalAlignment    = Control.VERTICAL_ALIGNMENT_TOP;
    stack.paddingTopInPixels   = 16;
    bg.addControl(stack);

    const header = new TextBlock('header', 'TRAFFIC');
    header.color      = '#ffffff4d';
    header.fontSize   = 17;
    header.fontFamily = 'Courier New';
    header.height     = '28px';
    stack.addControl(header);

    const divider = new Rectangle('divider');
    divider.height     = '1px';
    divider.width      = '100%';
    divider.background = '#ffffff1a';
    divider.thickness  = 0;
    stack.addControl(divider);

    const gap = new Rectangle('gap');
    gap.height    = '8px';
    gap.width     = '100%';
    gap.thickness = 0;
    stack.addControl(gap);

    for (const { label, color } of HEAT_SCALE_ENTRIES) {
      this.#addHeatRow(stack, label, color);
    }

    const alertDiv = new Rectangle('alertDiv');
    alertDiv.height     = '1px';
    alertDiv.width      = '100%';
    alertDiv.background = '#ffffff1a';
    alertDiv.thickness  = 0;
    stack.addControl(alertDiv);

    const alertGap = new Rectangle('alertGap');
    alertGap.height    = '4px';
    alertGap.width     = '100%';
    alertGap.thickness = 0;
    stack.addControl(alertGap);

    this.#addHeatRow(stack, 'Alert', '#ff2222');
  }

  // adds a coloured dot + label row to the stack
  #addHeatRow(parent, label, color) {
    const row = new StackPanel(`row_${label}`);
    row.isVertical = false;
    row.height     = '38px';
    row.width      = '100%';
    parent.addControl(row);

    const dot = new Rectangle(`dot_${label}`);
    dot.width             = '10px';
    dot.height            = '10px';
    dot.cornerRadius      = 5;
    dot.background        = color;
    dot.thickness         = 0;
    dot.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    row.addControl(dot);

    const spacer = new Rectangle(`sp_${label}`);
    spacer.width     = '12px';
    spacer.height    = '10px';
    spacer.thickness = 0;
    row.addControl(spacer);

    const lbl = new TextBlock(`lbl_${label}`, label);
    lbl.color                        = '#ffffff80';
    lbl.fontSize                     = 16;
    lbl.fontFamily                   = 'Courier New';
    lbl.textHorizontalAlignment      = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(lbl);
  }
}
