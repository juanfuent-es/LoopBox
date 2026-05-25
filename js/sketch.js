const layers = [];
let selectedLayer = 0;
let audioStarted = false;

const palette = ["#72f1ff", "#ff8fb1", "#8cff7f", "#f8f272", "#b199ff", "#ffa77b"];

function buildLayer(index) {
  return {
    id: index + 1,
    frequency: 110 + index * 55,
    amplitude: 0.2 + index * 0.08,
    speed: 1 + index * 0.2,
    phase: 0,
    color: palette[index % palette.length],
    oscillator: null,
    gain: null,
  };
}

function setup() {
  const root = document.getElementById("canvas-root");
  const c = createCanvas(window.innerWidth - 320, window.innerHeight);
  c.parent(root);
  pixelDensity(1);

  layers.push(buildLayer(0), buildLayer(1), buildLayer(2));
  wireControls();
  refreshLayerSelect();
  syncControlsFromLayer();
}

function draw() {
  background("#090b14");
  drawGrid();

  const centerY = height / 2;
  const sumWave = new Float32Array(width);

  layers.forEach((layer, i) => {
    stroke(layer.color);
    strokeWeight(i === selectedLayer ? 2.3 : 1.4);
    noFill();
    beginShape();

    for (let x = 0; x < width; x += 1) {
      const wave = Math.sin((x / width) * TWO_PI * layer.frequency * 0.02 + frameCount * 0.02 * layer.speed + layer.phase);
      const y = centerY + wave * layer.amplitude * height * 0.35;
      sumWave[x] += wave * layer.amplitude;
      vertex(x, y);
    }

    endShape();
  });

  stroke("#ffffff");
  strokeWeight(2.8);
  noFill();
  beginShape();
  for (let x = 0; x < width; x += 1) {
    vertex(x, centerY + sumWave[x] * height * 0.2);
  }
  endShape();
}

function drawGrid() {
  stroke("#1a1f31");
  strokeWeight(1);
  for (let x = 0; x <= width; x += 50) line(x, 0, x, height);
  for (let y = 0; y <= height; y += 50) line(0, y, width, y);
}

function windowResized() {
  resizeCanvas(window.innerWidth - 320, window.innerHeight);
}

function mouseDragged() {
  if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;
  const layer = layers[selectedLayer];
  if (!layer) return;

  layer.phase += movedX * 0.01;
  layer.amplitude = constrain(layer.amplitude + movedY * -0.002, 0, 1);
  syncControlsFromLayer();
  syncAudioLayer(layer);
}

function wireControls() {
  const audioButton = document.getElementById("audio-button");
  const addLayerButton = document.getElementById("add-layer");
  const removeLayerButton = document.getElementById("remove-layer");
  const layerSelect = document.getElementById("layer-select");

  audioButton.addEventListener("click", async () => {
    if (!audioStarted) {
      await Tone.start();
      audioStarted = true;
      layers.forEach(ensureAudioLayer);
      audioButton.textContent = "Audio activo";
      audioButton.disabled = true;
    }
  });

  addLayerButton.addEventListener("click", () => {
    layers.push(buildLayer(layers.length));
    selectedLayer = layers.length - 1;
    refreshLayerSelect();
    syncControlsFromLayer();
    if (audioStarted) ensureAudioLayer(layers[selectedLayer]);
  });

  removeLayerButton.addEventListener("click", () => {
    if (layers.length <= 1) return;
    const [removed] = layers.splice(selectedLayer, 1);
    if (removed) destroyAudioLayer(removed);
    selectedLayer = Math.max(0, selectedLayer - 1);
    refreshLayerSelect();
    syncControlsFromLayer();
  });

  layerSelect.addEventListener("change", (event) => {
    selectedLayer = Number(event.target.value);
    syncControlsFromLayer();
  });

  ["freq", "amp", "speed", "phase"].forEach((id) => {
    document.getElementById(id).addEventListener("input", onControlChange);
  });
}

function onControlChange() {
  const layer = layers[selectedLayer];
  if (!layer) return;

  layer.frequency = Number(document.getElementById("freq").value);
  layer.amplitude = Number(document.getElementById("amp").value);
  layer.speed = Number(document.getElementById("speed").value);
  layer.phase = Number(document.getElementById("phase").value);
  syncAudioLayer(layer);
}

function refreshLayerSelect() {
  const layerSelect = document.getElementById("layer-select");
  layerSelect.innerHTML = "";
  layers.forEach((layer, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = `Layer ${layer.id}`;
    if (index === selectedLayer) option.selected = true;
    layerSelect.appendChild(option);
  });
}

function syncControlsFromLayer() {
  const layer = layers[selectedLayer];
  if (!layer) return;
  document.getElementById("freq").value = layer.frequency;
  document.getElementById("amp").value = layer.amplitude;
  document.getElementById("speed").value = layer.speed;
  document.getElementById("phase").value = layer.phase;
}

function ensureAudioLayer(layer) {
  if (layer.oscillator) return;
  layer.gain = new Tone.Gain(layer.amplitude * 0.2).toDestination();
  layer.oscillator = new Tone.Oscillator(layer.frequency, "sine").connect(layer.gain).start();
}

function syncAudioLayer(layer) {
  if (!audioStarted) return;
  ensureAudioLayer(layer);
  layer.oscillator.frequency.rampTo(layer.frequency, 0.05);
  layer.gain.gain.rampTo(layer.amplitude * 0.2, 0.05);
}

function destroyAudioLayer(layer) {
  if (!layer.oscillator || !layer.gain) return;
  layer.oscillator.stop();
  layer.oscillator.dispose();
  layer.gain.dispose();
  layer.oscillator = null;
  layer.gain = null;
}
