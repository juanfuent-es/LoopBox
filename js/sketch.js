"use strict";

/* ═══════════════════════════════════════════════════════════════════
   LoopBox — Layer Class + p5.js visual + Tone.js audio
   Audio model: ALL layers play simultaneously → final composition
   ═══════════════════════════════════════════════════════════════════ */

// ─── Layer Class ──────────────────────────────────────────────────────────────

class Layer {
  static palette = ["#00ff41", "#ffb700", "#00e5ff", "#ff2d78", "#b800ff", "#ff6b00"];
  static _counter = 0;

  constructor(index = 0) {
    this.id = ++Layer._counter;
    this.name = `Layer ${this.id}`;

    // ── Wave / oscillation params ──────────────────────────────
    /** Frequency in Hz — controls visual cycle density AND audio pitch */
    this.frequency   = 110 + (index % 6) * 55;
    /** Amplitude 0–1 — wave height AND audio volume */
    this.amplitude   = 0.28 - (index % 5) * 0.02;
    /** Animation scroll speed multiplier (0.1–6) */
    this.speed       = 1 + (index % 5) * 0.28;
    /** Phase offset in radians (0–2π) — shifts wave horizontally */
    this.phase       = 0;
    /** Waveform shape: 'sine' | 'square' | 'triangle' | 'sawtooth' */
    this.waveType    = "sine";

    // ── Visual style ───────────────────────────────────────────
    /** Line color (hex) */
    this.color        = Layer.palette[index % Layer.palette.length];
    /** Layer transparency 0–1 */
    this.opacity      = 0.85;
    /** Stroke weight in pixels (0.5–4) */
    this.thickness    = 1.8;
    /** Phosphor glow halo intensity 0–1 */
    this.glowIntensity = 0.6;
    /** Mute toggle — hides visual and silences audio */
    this.muted        = false;

    // ── Audio extras ───────────────────────────────────────────
    /** Fine pitch offset in cents (–100 to +100) */
    this.detune  = 0;
    /** Stereo pan (–1 left … 0 center … +1 right) */
    this.pan     = 0;
    /** Reverb wet mix 0–1 */
    this.reverb  = 0;

    // ── Tone.js nodes (internal) ───────────────────────────────
    this.oscillator = null;
    this.gain       = null;
    this.panner     = null;
    this.reverbNode = null;
  }

  // ── Audio signal chain ─────────────────────────────────────────────────────
  // Oscillator → Gain → Panner → Reverb → Tone.Destination
  buildAudio() {
    if (this.oscillator) return;
    try {
      this.reverbNode = new Tone.Reverb({ decay: 2.5, wet: this.reverb }).toDestination();
      this.panner     = new Tone.Panner(this.pan).connect(this.reverbNode);
      this.gain       = new Tone.Gain(this.muted ? 0 : this.amplitude * 0.15).connect(this.panner);
      this.oscillator = new Tone.Oscillator({
        frequency : this.frequency,
        type      : this.waveType,
        detune    : this.detune,
      }).connect(this.gain).start();
    } catch (err) {
      console.error("[Layer] buildAudio:", err);
    }
  }

  /** Sync all Tone.js nodes to current attribute values (ramped, no clicks) */
  updateAudio() {
    if (!this.oscillator) return;
    this.oscillator.frequency.rampTo(this.frequency, 0.05);
    try { this.oscillator.type = this.waveType; } catch (_) { /* type change may glitch on some browsers */ }
    this.oscillator.detune.rampTo(this.detune, 0.05);
    this.gain.gain.rampTo(this.muted ? 0 : this.amplitude * 0.15, 0.05);
    this.panner.pan.rampTo(this.pan, 0.05);
    this.reverbNode.wet.rampTo(this.reverb, 0.1);
  }

  /** Stop and dispose all Tone.js nodes */
  destroy() {
    if (!this.oscillator) return;
    this.oscillator.stop();
    this.oscillator.dispose();
    this.gain.dispose();
    this.panner.dispose();
    this.reverbNode.dispose();
    this.oscillator = this.gain = this.panner = this.reverbNode = null;
  }

  // ── Wave math ──────────────────────────────────────────────────────────────
  /** Returns waveform sample in range –1…+1 for canvas position x */
  sampleWave(x, w, t) {
    const twoPI = Math.PI * 2;
    const theta = (x / w) * twoPI * this.frequency * 0.02 + t * this.speed + this.phase;
    switch (this.waveType) {
      case "sine":     return Math.sin(theta);
      case "square":   return Math.sign(Math.sin(theta));
      case "triangle": return (2 / Math.PI) * Math.asin(Math.sin(theta));
      case "sawtooth": {
        // Descending sawtooth matching Web Audio / Tone.js convention
        const norm = ((theta / twoPI) % 1 + 1) % 1;
        return 1 - 2 * norm;
      }
      default: return Math.sin(theta);
    }
  }

  // ── Rendering (uses p5.js global-mode functions) ───────────────────────────
  /** Draw this layer's waveform with phosphor glow effect */
  drawWave(centerY, t, isSelected) {
    if (this.muted) return;
    const w = width;
    const scaleY = this.amplitude * height * 0.35;

    // ── Glow halo pass (low-res, large stroke, semi-transparent) ──
    if (this.glowIntensity > 0.05) {
      drawingContext.save();
      drawingContext.globalAlpha = this.opacity * 0.45 * this.glowIntensity;
      drawingContext.shadowBlur   = 18 * this.glowIntensity;
      drawingContext.shadowColor  = this.color;
      stroke(this.color);
      strokeWeight((this.thickness + 4) * this.glowIntensity * 0.7);
      noFill();
      beginShape();
      for (let x = 0; x < w; x += 3) {
        vertex(x, centerY + this.sampleWave(x, w, t) * scaleY);
      }
      endShape();
      drawingContext.restore();
    }

    // ── Main line (full resolution) ────────────────────────────
    drawingContext.save();
    drawingContext.globalAlpha  = this.opacity;
    drawingContext.shadowBlur   = 7 * this.glowIntensity;
    drawingContext.shadowColor  = this.color;
    stroke(this.color);
    strokeWeight(isSelected ? this.thickness + 0.9 : this.thickness);
    noFill();
    beginShape();
    for (let x = 0; x < w; x++) {
      vertex(x, centerY + this.sampleWave(x, w, t) * scaleY);
    }
    endShape();
    drawingContext.restore();
  }
}

// ─── App State ─────────────────────────────────────────────────────────────────

const layers = [];
let selectedLayer = 0;
let audioStarted  = false;
let editorOpen    = false;

const PANEL_W      = 280;
const EDITOR_W     = 258;

// ─── p5.js lifecycle ───────────────────────────────────────────────────────────

function setup() {
  const c = createCanvas(window.innerWidth - PANEL_W, window.innerHeight);
  c.parent("canvas-root");
  pixelDensity(1);
  textFont("monospace");

  for (let i = 0; i < 3; i++) layers.push(new Layer(i));
  wireControls();
  renderLayerList();
}

function draw() {
  background("#030a03");
  drawGrid();

  const centerY = height / 2;
  const t       = frameCount * 0.02;
  const sumWave = new Float32Array(width);

  // Draw each layer and accumulate composite sum
  layers.forEach((layer, i) => {
    layer.drawWave(centerY, t, i === selectedLayer);
    if (!layer.muted) {
      for (let x = 0; x < width; x++) {
        sumWave[x] += layer.sampleWave(x, width, t) * layer.amplitude;
      }
    }
  });

  // ── Composite (sum) wave — the final audio composition ──────
  drawingContext.save();
  drawingContext.shadowBlur  = 22;
  drawingContext.shadowColor = "rgba(255,255,255,0.85)";
  stroke("#ffffff");
  strokeWeight(2.0);
  noFill();
  beginShape();
  for (let x = 0; x < width; x++) {
    vertex(x, centerY + sumWave[x] * height * 0.18);
  }
  endShape();
  drawingContext.restore();

  drawHUD();
}

// ── Grid: oscilloscope-style ──────────────────────────────────────────────────
function drawGrid() {
  const cols = 10, rows = 8;

  stroke("#070f07");
  strokeWeight(1);
  for (let i = 0; i <= cols; i++) {
    const x = (width / cols) * i;
    line(x, 0, x, height);
  }
  for (let i = 0; i <= rows; i++) {
    const y = (height / rows) * i;
    line(0, y, width, y);
  }

  // Center axis
  stroke("#0f250f");
  strokeWeight(1);
  line(0, height / 2, width, height / 2);

  // Time labels
  noStroke();
  fill("#183518");
  textSize(8);
  for (let i = 0; i <= cols; i++) {
    text(`${i * 10}`, (width / cols) * i + 2, height - 5);
  }
  text("ms", width - 16, height - 5);

  // Voltage markers
  [1, 0.5, -0.5, -1].forEach((v) => {
    const y = height / 2 - v * height * 0.18;
    stroke("#0f250f");
    strokeWeight(0.5);
    line(0, y, 12, y);
    noStroke();
    fill("#183518");
    textSize(8);
    text(`${v > 0 ? "+" : ""}${v}V`, 14, y + 3);
  });
}

// ── HUD overlay ───────────────────────────────────────────────────────────────
function drawHUD() {
  const layer = layers[selectedLayer];
  noStroke();
  textSize(9);

  if (layer) {
    fill(layer.color);
    const info = `▶ ${layer.name} · ${layer.waveType.toUpperCase()} · ${Math.round(layer.frequency)} Hz${layer.muted ? " · MUTED" : ""}`;
    text(info, width - 10 - textWidth(info), 12);
  }

  fill("#183518");
  textSize(8);
  const active = layers.filter((l) => !l.muted).length;
  const status = audioStarted ? `♪ ${active} OSC PLAYING · ${layers.length} TOTAL` : "AUDIO OFFLINE — click INICIAR";
  text(status, width - 10 - textWidth(status), height - 7);
}

function windowResized() {
  resizeCanvas(window.innerWidth - PANEL_W, window.innerHeight);
}

// ── Mouse drag → phase (X) / amplitude (Y) of selected layer ─────────────────
function mouseDragged() {
  // Guard: don't react when dragging over the floating editor
  if (editorOpen && mouseX < EDITOR_W) return;
  if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;

  const layer = layers[selectedLayer];
  if (!layer) return;

  const twoPI = Math.PI * 2;
  layer.phase     = ((layer.phase + movedX * 0.01) % twoPI + twoPI) % twoPI;
  layer.amplitude = constrain(layer.amplitude - movedY * 0.002, 0, 1);

  syncEditorFromLayer(layer);
  layer.updateAudio();
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function wireControls() {
  // ── Audio start ──────────────────────────────────────────────
  document.getElementById("audio-btn").addEventListener("click", async () => {
    if (audioStarted) return;
    await Tone.start();
    audioStarted = true;
    layers.forEach((l) => l.buildAudio()); // all layers start simultaneously
    const btn = document.getElementById("audio-btn");
    btn.textContent = "◉ AUDIO ON";
    btn.classList.add("active");
  });

  // ── Add layer ────────────────────────────────────────────────
  document.getElementById("add-layer-btn").addEventListener("click", () => {
    const layer = new Layer(layers.length);
    layers.push(layer);
    if (audioStarted) layer.buildAudio();
    selectedLayer = layers.length - 1;
    renderLayerList();
    openEditor(layer);
  });

  // ── Editor sliders ───────────────────────────────────────────
  ["freq", "amp", "speed", "phase", "detune", "pan", "reverb", "opacity", "thickness", "glow"].forEach((id) => {
    const el = document.getElementById(`e-${id}`);
    if (el) el.addEventListener("input", onEditorChange);
  });

  // ── Wave type buttons ────────────────────────────────────────
  document.querySelectorAll(".wave-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".wave-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const layer = layers[selectedLayer];
      if (layer) {
        layer.waveType = btn.dataset.wave;
        layer.updateAudio();
      }
    });
  });

  // ── Color picker ─────────────────────────────────────────────
  document.getElementById("e-color").addEventListener("input", (e) => {
    const layer = layers[selectedLayer];
    if (layer) { layer.color = e.target.value; renderLayerList(); }
  });

  // ── Layer name ───────────────────────────────────────────────
  document.getElementById("e-name").addEventListener("input", (e) => {
    const layer = layers[selectedLayer];
    if (layer) { layer.name = e.target.value; renderLayerList(); }
  });

  // ── Delete layer ─────────────────────────────────────────────
  document.getElementById("delete-layer-btn").addEventListener("click", () => {
    if (layers.length <= 1) return;
    layers[selectedLayer].destroy();
    layers.splice(selectedLayer, 1);
    selectedLayer = Math.max(0, selectedLayer - 1);
    closeEditor();
    renderLayerList();
  });

  // ── Close editor ─────────────────────────────────────────────
  document.getElementById("close-editor-btn").addEventListener("click", closeEditor);
}

function onEditorChange() {
  const layer = layers[selectedLayer];
  if (!layer) return;

  layer.frequency    = Number(document.getElementById("e-freq").value);
  layer.amplitude    = Number(document.getElementById("e-amp").value);
  layer.speed        = Number(document.getElementById("e-speed").value);
  layer.phase        = Number(document.getElementById("e-phase").value);
  layer.detune       = Number(document.getElementById("e-detune").value);
  layer.pan          = Number(document.getElementById("e-pan").value);
  layer.reverb       = Number(document.getElementById("e-reverb").value);
  layer.opacity      = Number(document.getElementById("e-opacity").value);
  layer.thickness    = Number(document.getElementById("e-thickness").value);
  layer.glowIntensity = Number(document.getElementById("e-glow").value);

  updateValueDisplays(layer);
  layer.updateAudio();
}

function updateValueDisplays(layer) {
  const panStr = layer.pan > 0.01  ? `R ${layer.pan.toFixed(2)}`
               : layer.pan < -0.01 ? `L ${Math.abs(layer.pan).toFixed(2)}`
               : "C";

  [
    ["e-freq",      `${Math.round(layer.frequency)} Hz`],
    ["e-amp",       layer.amplitude.toFixed(2)],
    ["e-speed",     `${layer.speed.toFixed(2)}x`],
    ["e-phase",     `${layer.phase.toFixed(2)} rad`],
    ["e-detune",    `${layer.detune >= 0 ? "+" : ""}${Math.round(layer.detune)} ¢`],
    ["e-pan",       panStr],
    ["e-reverb",    `${Math.round(layer.reverb * 100)}%`],
    ["e-opacity",   `${Math.round(layer.opacity * 100)}%`],
    ["e-thickness", `${layer.thickness.toFixed(1)}px`],
    ["e-glow",      `${Math.round(layer.glowIntensity * 100)}%`],
  ].forEach(([id, val]) => {
    const el = document.getElementById(`${id}-val`);
    if (el) el.textContent = val;
  });
}

// ─── Layer List ────────────────────────────────────────────────────────────────

function renderLayerList() {
  const list = document.getElementById("layer-list");
  list.innerHTML = "";

  layers.forEach((layer, index) => {
    const card = document.createElement("div");
    card.className = [
      "layer-card",
      index === selectedLayer ? "selected" : "",
      layer.muted ? "muted" : "",
    ].join(" ").trim();

    card.innerHTML = `
      <span class="layer-swatch"
            style="background:${layer.color};box-shadow:0 0 5px ${layer.color}66"></span>
      <div class="layer-card-text">
        <span class="layer-card-name">${layer.name}</span>
        <span class="layer-card-meta">${layer.waveType} · ${Math.round(layer.frequency)} Hz</span>
      </div>
      <button class="mute-btn${layer.muted ? " muted" : ""}"
              title="${layer.muted ? "Unmute" : "Mute"}">${layer.muted ? "✕" : "◉"}</button>`;

    card.addEventListener("click", (e) => {
      if (e.target.classList.contains("mute-btn")) return;
      selectedLayer = index;
      renderLayerList();
      openEditor(layer);
    });

    card.querySelector(".mute-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      layer.muted = !layer.muted;
      layer.updateAudio();
      renderLayerList();
      if (editorOpen && selectedLayer === index) syncEditorFromLayer(layer);
    });

    list.appendChild(card);
  });
}

// ─── Editor open / close / sync ────────────────────────────────────────────────

function openEditor(layer) {
  editorOpen = true;
  document.getElementById("layer-editor").classList.add("open");
  syncEditorFromLayer(layer);
}

function closeEditor() {
  editorOpen = false;
  document.getElementById("layer-editor").classList.remove("open");
}

function syncEditorFromLayer(layer) {
  if (!layer) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set("e-name",      layer.name);
  set("e-freq",      layer.frequency);
  set("e-amp",       layer.amplitude);
  set("e-speed",     layer.speed);
  set("e-phase",     layer.phase);
  set("e-detune",    layer.detune);
  set("e-pan",       layer.pan);
  set("e-reverb",    layer.reverb);
  set("e-opacity",   layer.opacity);
  set("e-thickness", layer.thickness);
  set("e-glow",      layer.glowIntensity);
  set("e-color",     layer.color);

  document.querySelectorAll(".wave-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.wave === layer.waveType)
  );
  updateValueDisplays(layer);
}

