// floating info panel that appears above a selected arc, tethered by a line to the arc apex
import { MeshBuilder, Vector3, Color3 } from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  TextBlock,
  Rectangle,
  StackPanel,
  Control,
} from '@babylonjs/gui';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export class ArcInfoPanel {
  #scene;
  #globeRoot;
  #plane = null;
  #lineMesh = null;
  #apexLocal = null;  // arc apex in globe-local space, re-transformed each frame

  // live-update text refs
  #srcIpVal;
  #dstIpVal;
  #hostVal;
  #fromVal;
  #protoVal;
  #packetsVal;
  #bytesVal;
  #rawDataText;
  #rawHeaderLabel;
  #rawDataExpanded = false;
  #dismissBtn;
  #onDismiss = null;

  constructor(scene, globeRoot) {
    this.#scene     = scene;
    this.#globeRoot = globeRoot;
    this.#buildPanel();
  }

  // ── Public ──────────────────────────────────────────────────────────────────

  // populate all fields and make the panel visible
  show(info, apexLocal, onDismiss = null) {
    this.#apexLocal  = apexLocal.clone();
    this.#onDismiss  = onDismiss;
    this.#dismissBtn.isVisible = !!info.flagged;

    this.#srcIpVal.text = info.srcIp   ?? '?';
    this.#dstIpVal.text = info.dstIp   ?? '?';
    // best available hostname: SNI -> HTTP host -> reverse DNS -> nothing
    const bestHost = info.flows?.findLast(f => f.tlsSni)?.tlsSni
      ?? info.flows?.findLast(f => f.httpHost)?.httpHost
      ?? info.dstHostname
      ?? info.srcHostname
      ?? '—';
    this.#hostVal.text  = bestHost;
    this.#fromVal.text  = info.srcCity  ?? '—';
    this.#protoVal.text = info.protocol ?? '?';
    this.#packetsVal.text = String(info.flowCount ?? 0);
    this.#bytesVal.text = formatBytes(info.totalBytes ?? 0);

    // start raw data section collapsed
    this.#rawDataText.text = this.#formatRawData(info);
    this.#rawDataExpanded = false;
    this.#rawHeaderLabel.text = '▶ RAW DATA';
    this.#rawDataText.height = '0px';
    this.#rawDataText.isVisible = false;

    this.#plane.setEnabled(true);
  }

  // hide the panel and remove the tether line
  hide() {
    this.#plane?.setEnabled(false);
    if (this.#lineMesh) {
      this.#lineMesh.dispose();
      this.#lineMesh = null;
    }
    this.#apexLocal = null;
  }

  // billboard the panel toward the camera and update the tether line each frame
  update(camera) {
    if (!this.#plane?.isEnabled() || !camera || !this.#globeRoot || !this.#apexLocal) return;

    // re-transform apex from globe-local -> world each frame so it follows globe rotation
    const apexWorld = Vector3.TransformCoordinates(
      this.#apexLocal,
      this.#globeRoot.getWorldMatrix(),
    );

    // push panel slightly toward camera from the apex, with a small upward offset
    const toCam = camera.position.subtract(apexWorld);
    if (toCam.length() < 0.001) return;
    toCam.normalize();

    const panelPos = apexWorld
      .add(toCam.scale(0.11))
      .add(new Vector3(0, 0.055, 0));
    this.#plane.position.copyFrom(panelPos);

    // Y-axis billboard (-Z front face convention, same as GlobeLegend)
    const flat = new Vector3(toCam.x, 0, toCam.z);
    if (flat.length() > 0.001) {
      flat.normalize();
      this.#plane.rotation.y = Math.atan2(-flat.x, -flat.z);
    }

    this.#updateLine(panelPos, apexWorld);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  // formats the last 6 flows as readable lines for the raw data section
  #formatRawData(info) {
    const flows = info.flows;
    if (!flows?.length) return '(no packet data)';
    const shown = flows.slice(-6);  // most recent 6
    const lines = shown.map(f => {
      const ts    = f.ts ? new Date(f.ts * 1000).toTimeString().slice(0, 8) : '--:--:--';
      const proto = (f.protocol ?? 'OTHER').padEnd(5);
      const bytes = formatBytes(f.bytes ?? 0).padStart(7);
      const flag  = f.flagged ? ' [!]' : '';
      const ports = (f.srcPort != null && f.dstPort != null)
        ? ` :${f.srcPort}→:${f.dstPort}` : '';

      // protocol-specific detail line - URI path for HTTP, query for DNS
      let detail = '';
      if (f.httpUri) {
        const method = f.httpMethod ? `${f.httpMethod} ` : '';
        let uri = f.httpUri;
        // strip scheme and host, keep just the path
        try { uri = new URL(uri).pathname; } catch { /* leave as-is */ }
        if (uri.length > 36) uri = uri.slice(0, 33) + '…';
        detail = `\n  ${method}${uri}`;
        if (f.httpStatus) detail += ` [${f.httpStatus}]`;
      } else if (f.dnsQuery) {
        const qt = f.dnsType ? ` (${f.dnsType})` : '';
        detail = `\n  DNS: ${f.dnsQuery}${qt}`;
      }

      return `${ts} [${proto}]${ports} ${bytes}${flag}${detail}`;
    });
    if (flows.length > 6) lines.unshift(`+${flows.length - 6} older…`);
    return lines.join('\n');
  }

  // builds the panel mesh and all GUI text elements
  #buildPanel() {
    this.#plane = MeshBuilder.CreatePlane(
      'arcInfoPanel',
      { width: 0.22, height: 0.26 },
      this.#scene,
    );
    this.#plane.isPickable = true;
    this.#plane.metadata   = { isPanel: true };
    this.#plane.setEnabled(false);

    const tex = AdvancedDynamicTexture.CreateForMesh(this.#plane, 440, 520);

    const bg = new Rectangle('bg');
    bg.width        = '100%';
    bg.height       = '100%';
    bg.background   = '#080814ee';
    bg.color        = '#00e5ff33';
    bg.thickness    = 1;
    bg.cornerRadius = 8;
    tex.addControl(bg);

    const stack = new StackPanel('stack');
    stack.width                  = '88%';
    stack.verticalAlignment      = Control.VERTICAL_ALIGNMENT_TOP;
    stack.paddingTopInPixels     = 14;
    bg.addControl(stack);

    // header
    const header = new TextBlock('hdr', 'PACKET DETAILS');
    header.color      = '#ffffff4d';
    header.fontSize   = 15;
    header.fontFamily = 'Courier New';
    header.height     = '24px';
    stack.addControl(header);

    const div = new Rectangle('div');
    div.height     = '1px';
    div.width      = '100%';
    div.background = '#ffffff1a';
    div.thickness  = 0;
    stack.addControl(div);

    const gap = new Rectangle('gap');
    gap.height    = '8px';
    gap.width     = '100%';
    gap.thickness = 0;
    stack.addControl(gap);

    this.#srcIpVal   = this.#addRow(stack, 'SRC IP');
    this.#dstIpVal   = this.#addRow(stack, 'DST IP');
    this.#hostVal    = this.#addRow(stack, 'HOST');
    this.#fromVal    = this.#addRow(stack, 'FROM');
    this.#protoVal   = this.#addRow(stack, 'PROTO');
    this.#packetsVal = this.#addRow(stack, 'PACKETS');
    this.#bytesVal   = this.#addRow(stack, 'BYTES');

    // dismiss button - only visible for flagged alert arcs
    const dismissGap = new Rectangle('dismissGap');
    dismissGap.height    = '6px';
    dismissGap.width     = '100%';
    dismissGap.thickness = 0;
    stack.addControl(dismissGap);

    this.#dismissBtn = new Rectangle('dismissBtn');
    this.#dismissBtn.height       = '28px';
    this.#dismissBtn.width        = '100%';
    this.#dismissBtn.background   = '#ff000022';
    this.#dismissBtn.color        = '#ff4444';
    this.#dismissBtn.thickness    = 1;
    this.#dismissBtn.cornerRadius = 4;
    this.#dismissBtn.isVisible    = false;
    stack.addControl(this.#dismissBtn);

    const dismissLabel = new TextBlock('dismissLabel', '✕  DISMISS ALERT');
    dismissLabel.color      = '#ff6666';
    dismissLabel.fontSize   = 12;
    dismissLabel.fontFamily = 'Courier New';
    this.#dismissBtn.addControl(dismissLabel);

    this.#dismissBtn.onPointerClickObservable.add(() => {
      this.#onDismiss?.();
    });

    // collapsible raw packet data section
    const rawGap = new Rectangle('rawGap');
    rawGap.height    = '6px';
    rawGap.width     = '100%';
    rawGap.thickness = 0;
    stack.addControl(rawGap);

    const rawDiv = new Rectangle('rawDiv');
    rawDiv.height     = '1px';
    rawDiv.width      = '100%';
    rawDiv.background = '#ffffff1a';
    rawDiv.thickness  = 0;
    stack.addControl(rawDiv);

    const rawGap2 = new Rectangle('rawGap2');
    rawGap2.height    = '6px';
    rawGap2.width     = '100%';
    rawGap2.thickness = 0;
    stack.addControl(rawGap2);

    const rawHeaderBg = new Rectangle('rawHdrBg');
    rawHeaderBg.height        = '24px';
    rawHeaderBg.width         = '100%';
    rawHeaderBg.thickness     = 0;
    rawHeaderBg.background    = '#ffffff0a';
    rawHeaderBg.cornerRadius  = 3;
    stack.addControl(rawHeaderBg);

    this.#rawHeaderLabel = new TextBlock('rawHdr', '▶ RAW DATA');
    this.#rawHeaderLabel.color      = '#ffffff66';
    this.#rawHeaderLabel.fontSize   = 12;
    this.#rawHeaderLabel.fontFamily = 'Courier New';
    this.#rawHeaderLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.#rawHeaderLabel.paddingLeftInPixels = 6;
    rawHeaderBg.addControl(this.#rawHeaderLabel);

    // toggle raw data visibility on click
    rawHeaderBg.onPointerClickObservable.add(() => {
      this.#rawDataExpanded = !this.#rawDataExpanded;
      this.#rawHeaderLabel.text   = this.#rawDataExpanded ? '▼ RAW DATA' : '▶ RAW DATA';
      this.#rawDataText.height    = this.#rawDataExpanded ? '150px' : '0px';
      this.#rawDataText.isVisible = this.#rawDataExpanded;
    });

    this.#rawDataText = new TextBlock('rawData', '');
    this.#rawDataText.color      = '#00e5ff';
    this.#rawDataText.fontSize   = 11;
    this.#rawDataText.fontFamily = 'Courier New';
    this.#rawDataText.textWrapping = true;
    this.#rawDataText.height     = '0px';
    this.#rawDataText.isVisible  = false;
    this.#rawDataText.textHorizontalAlignment  = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.#rawDataText.verticalAlignment        = Control.VERTICAL_ALIGNMENT_TOP;
    this.#rawDataText.paddingTopInPixels       = 4;
    stack.addControl(this.#rawDataText);
  }

  // adds a label/value row to the stack, returns the value TextBlock for live updates
  #addRow(parent, label) {
    const row         = new StackPanel(`row_${label}`);
    row.isVertical    = false;
    row.height        = '36px';
    row.width         = '100%';
    parent.addControl(row);

    const lbl               = new TextBlock(`lbl_${label}`, label);
    lbl.color               = '#ffffff4d';
    lbl.fontSize            = 13;
    lbl.fontFamily          = 'Courier New';
    lbl.width               = '90px';
    lbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(lbl);

    const val               = new TextBlock(`val_${label}`, '—');
    val.color               = '#00e5ff';
    val.fontSize            = 13;
    val.fontFamily          = 'Courier New';
    val.width               = '260px';
    val.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(val);

    return val;
  }

  // draws/updates the line from the panel down to the arc apex
  #updateLine(panelPos, apexWorld) {
    const points = [panelPos, apexWorld];
    if (this.#lineMesh) {
      MeshBuilder.CreateLines('arcLine', { points, instance: this.#lineMesh });
    } else {
      this.#lineMesh             = MeshBuilder.CreateLines('arcLine', { points, updatable: true }, this.#scene);
      this.#lineMesh.color       = new Color3(0.0, 0.9, 1.0);
      this.#lineMesh.alpha       = 0.45;
      this.#lineMesh.isPickable  = false;
    }
  }
}
