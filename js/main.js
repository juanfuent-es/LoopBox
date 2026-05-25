/**
 * @file main.js
 * Punto de entrada de la aplicación LoopBox.
 *
 * Responsabilidades:
 *  1. Definir las funciones del ciclo de vida de p5.js (setup, draw, mouseDragged,
 *     windowResized) como propiedades de `window` para que p5.js en modo global
 *     las encuentre y las ejecute.
 *  2. Inicializar las 3 capas predeterminadas al arrancar.
 *  3. Cablear todos los event listeners del panel lateral y del editor flotante.
 *
 * Nota sobre p5.js en modo global con módulos ES6:
 *  p5.js en modo global escanea `window.setup`, `window.draw`, etc.
 *  Al usar `type="module"` en el <script>, el scope del módulo es privado.
 *  Por eso se asignan explícitamente a `window.*` en lugar de declararlas
 *  como funciones normales.
 *
 * Dependencias externas (globals vía CDN, cargadas antes del módulo):
 *  - p5.js   → createCanvas, background, frameCount, width, height, etc.
 *  - Tone.js → Tone.start()
 *
 * Dependencias internas (ES6 modules):
 *  - state.js    → estado global mutable compartido
 *  - Layer.js    → clase Layer (oscilador visual + audio)
 *  - Renderer.js → funciones de dibujo del canvas
 *  - Editor.js   → funciones del panel de control por capa
 */

import { state, PANEL_W, EDITOR_W, TRANSPORT_H } from './state.js';
import Layer from './Layer.js';
import { drawGrid, drawHUD, drawCompositeWave } from './Renderer.js';
import {
  renderLayerList,
  renderStepGrid,
  renderLoopList,
  openEditor,
  closeEditor,
  syncEditorFromLayer,
  onEditorChange,
  syncWaveTypeControls,
} from './Editor.js';
import {
  initTransport,
  setBpm,
  setBars,
  transportPlay,
  transportStop,
  actualizarDuracion,
} from './Transport.js';
import {
  guardarLoop,
  nuevoLoop,
  listarLoops,
} from './Storage.js';

// ══════════════════════════════════════════════════════════════
// Ciclo de vida p5.js — asignados a window para modo global
// ══════════════════════════════════════════════════════════════

/**
 * setup() — ejecutado una sola vez al inicializar p5.js.
 *
 * Crea el canvas ajustado al área disponible (descontando el panel lateral),
 * instancia las capas iniciales y registra todos los event listeners.
 */
window.setup = function () {
  // Crear el canvas en el contenedor #canvas-root
  // Se descuenta el panel lateral (ancho) y la barra de Transport (alto)
  const canvas = createCanvas(
    window.innerWidth  - PANEL_W,
    window.innerHeight - TRANSPORT_H,
  );
  canvas.parent("canvas-root");
  pixelDensity(1);       // evitar escalado en pantallas de alta densidad
  textFont("monospace"); // fuente del HUD consistente con el diseño retro

  // Inicializar el Transport con BPM y bars del estado (no requiere audio aún)
  initTransport();
  actualizarDuracion();

  // ── Preset: drone armónico en La menor (raíz A2 = 110 Hz) ──────────────
  // 6 capas afinadas en ratios justos sobre 110 Hz, con paneo complementario
  // para crear anchura estéreo y reverb creciente hacia las capas superiores.

  /** @param {number} i - índice de paleta de color */
  function capaPreset(i, nombre, opciones) {
    const c = new Layer(i);
    c.name = nombre;
    Object.assign(c, opciones);
    return c;
  }

  state.layers.push(capaPreset(0, "Sub", {
    frequency    : 55,          // A1 — sub-bass, fundamento infrasonoro
    waveType     : "sine",
    amplitude    : 0.45,
    speed        : 0.8,
    pan          : 0,
    reverb       : 0.05,
    glowIntensity: 0.9,
    thickness    : 2.5,
  }));

  state.layers.push(capaPreset(1, "Bass", {
    frequency    : 110,         // A2 — raíz con armónicos de sierra
    waveType     : "sawtooth",
    amplitude    : 0.28,
    speed        : 1.0,
    pan          : -0.1,
    reverb       : 0.15,
    glowIntensity: 0.7,
    thickness    : 1.8,
  }));

  state.layers.push(capaPreset(2, "Fifth", {
    frequency    : 165,         // E3 — quinta perfecta (110 × 3/2)
    waveType     : "triangle",
    amplitude    : 0.20,
    speed        : 1.5,
    pan          : 0.35,
    reverb       : 0.25,
    glowIntensity: 0.6,
    thickness    : 1.5,
  }));

  state.layers.push(capaPreset(3, "Octave", {
    frequency    : 220,         // A3 — octava (110 × 2), modulación AM suave
    waveType     : "amsine",
    amplitude    : 0.15,
    speed        : 1.2,
    pan          : -0.4,
    reverb       : 0.35,
    harmonicity  : 2,
    glowIntensity: 0.55,
    thickness    : 1.4,
  }));

  state.layers.push(capaPreset(4, "Third", {
    frequency       : 131,      // C3 — tercera menor (110 × 6/5 ≈ 130.8 Hz → acorde Am)
    waveType        : "fmsine",
    amplitude       : 0.12,
    speed           : 1.1,
    pan             : 0.55,
    reverb          : 0.45,
    modulationIndex : 3,
    harmonicity     : 1.2,
    glowIntensity   : 0.5,
    thickness       : 1.3,
  }));

  state.layers.push(capaPreset(5, "Air", {
    frequency    : 440,         // A4 — ruido rosa: textura aérea, filtrado naturalmente
    waveType     : "noise",
    noiseType    : "pink",
    amplitude    : 0.07,
    speed        : 1.0,
    pan          : 0,
    reverb       : 0.65,
    glowIntensity: 0.4,
    thickness    : 1.0,
  }));

  // Registrar todos los controles del panel y el editor
  _wireControls();

  // Renderizar la lista de capas y loops guardados en el panel lateral
  renderLayerList();
  renderLoopList(() => { renderLayerList(); renderLoopList(); });
};

/**
 * draw() — ejecutado cada frame (~60 fps por defecto).
 *
 * Orden de dibujo:
 *  1. Limpiar fondo
 *  2. Cuadrícula de osciloscopio
 *  3. Ondas individuales de cada capa (con efecto glow fosforescente)
 *  4. Onda compuesta suma (composición final visible en blanco)
 *  5. HUD con información de la capa activa
 */
window.draw = function () {
  background("#030a03"); // fondo negro profundo con tinte verde

  drawGrid(); // cuadrícula de osciloscopio

  const centerY = height / 2;
  const t       = frameCount * 0.02; // tiempo animado incremental

  // Dibujar cada capa con su onda individual
  state.layers.forEach((capa, i) => {
    capa.drawWave(centerY, t, i === state.selectedLayer);
  });

  // Dibujar la onda suma — representa la composición de audio que se escucha
  drawCompositeWave(centerY, t);

  drawHUD(); // overlay de información
};

/**
 * windowResized() — ejecutado al cambiar el tamaño de la ventana del navegador.
 * Redimensiona el canvas manteniendo el panel lateral con su ancho fijo.
 */
window.windowResized = function () {
  resizeCanvas(window.innerWidth - PANEL_W, window.innerHeight - TRANSPORT_H);
};

/**
 * mouseDragged() — ejecutado mientras el usuario arrastra el ratón sobre el canvas.
 *
 * Arrastrar horizontalmente (movedX) modifica la fase de la capa activa.
 * Arrastrar verticalmente (movedY) modifica la amplitud de la capa activa.
 * Los cambios se aplican en tiempo real tanto al visual como al audio.
 */
window.mouseDragged = function () {
  // Ignorar arrastres sobre el editor flotante (zona izquierda cuando está abierto)
  if (state.editorOpen && mouseX < EDITOR_W) return;

  // Ignorar arrastres fuera del área del canvas
  if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;

  const capa = state.layers[state.selectedLayer];
  if (!capa) return;

  const twoPI = Math.PI * 2;

  // Arrastrar hacia la derecha → incrementar fase (desplaza la onda a la derecha)
  capa.phase = ((capa.phase + movedX * 0.01) % twoPI + twoPI) % twoPI;

  // Arrastrar hacia arriba → incrementar amplitud (invertido: subir = más amplitud)
  capa.amplitude = constrain(capa.amplitude - movedY * 0.002, 0, 1);

  // Reflejar los cambios en el editor si está abierto
  syncEditorFromLayer(capa);

  // Aplicar los cambios al audio en tiempo real
  capa.updateAudio();
};

// ══════════════════════════════════════════════════════════════
// Cableado de controles (privado a este módulo)
// ══════════════════════════════════════════════════════════════

/**
 * Registra todos los event listeners del panel lateral y del editor flotante.
 * Se llama una sola vez desde setup().
 *
 * Prefijo con underscore (_wireControls) para indicar que es función privada del módulo.
 */
function _wireControls() {

  // ── Botón de inicio de audio ────────────────────────────────
  // Tone.js requiere que el contexto de audio sea iniciado por un gesto del usuario
  document.getElementById("audio-btn").addEventListener("click", async () => {
    if (state.audioStarted) return;
    await Tone.start(); // solicitar permiso de audio al navegador
    state.audioStarted = true;
    initTransport();  // configurar Transport tras obtener el contexto

    // Iniciar todos los osciladores simultáneamente → mezcla final en Tone.Destination
    state.layers.forEach((capa) => capa.buildAudio());

    // Actualizar UI del botón
    const btn = document.getElementById("audio-btn");
    btn.textContent = "◉ AUDIO ON";
    btn.classList.add("active");
  });

  // ── Transport: PLAY ──────────────────────────────────────────
  document.getElementById("play-btn").addEventListener("click", async () => {
    // Inicializar audio si aún no se hizo (compatible con PLAY como primer gesto)
    if (!state.audioStarted) {
      await Tone.start();
      state.audioStarted = true;
      initTransport();
      state.layers.forEach(c => c.buildAudio());
      const audioBtn = document.getElementById("audio-btn");
      if (audioBtn) { audioBtn.textContent = "◉ AUDIO ON"; audioBtn.classList.add("active"); }
    }
    transportPlay();
  });

  // ── Transport: STOP ──────────────────────────────────────────
  document.getElementById("stop-btn").addEventListener("click", () => {
    transportStop();
  });

  // ── Transport: BPM slider ──────────────────────────────────
  document.getElementById("t-bpm").addEventListener("input", (e) => {
    setBpm(Number(e.target.value));
    const valEl = document.getElementById("t-bpm-val");
    if (valEl) valEl.textContent = state.bpm;
  });

  // ── Transport: botones BARS ────────────────────────────────
  document.querySelectorAll(".bars-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".bars-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      setBars(Number(btn.dataset.bars));
    });
  });

  // ── Guardar loop ──────────────────────────────────────────
  document.getElementById("save-loop-btn").addEventListener("click", () => {
    const nombreInput = document.getElementById("loop-name-input");
    guardarLoop(nombreInput ? nombreInput.value.trim() || undefined : undefined);
    renderLoopList(() => { renderLayerList(); renderLoopList(); });
    // Feedback visual breve en el botón
    const btn = document.getElementById("save-loop-btn");
    btn.textContent = "SAVED!";
    setTimeout(() => { btn.textContent = "SAVE"; }, 1200);
  });

  // ── Nuevo loop ────────────────────────────────────────────
  document.getElementById("new-loop-btn").addEventListener("click", () => {
    if (!confirm("Crear un loop nuevo perderá los cambios sin guardar. ¿Continuar?")) return;
    nuevoLoop(() => {
      closeEditor();
      renderLayerList();
      renderLoopList(() => { renderLayerList(); renderLoopList(); });
      // Actualizar sliders de Transport con los valores reseteados
      const bpmEl = document.getElementById("t-bpm");
      const bpmVal = document.getElementById("t-bpm-val");
      if (bpmEl) bpmEl.value = state.bpm;
      if (bpmVal) bpmVal.textContent = state.bpm;
      document.querySelectorAll(".bars-btn").forEach(b =>
        b.classList.toggle("active", Number(b.dataset.bars) === state.bars)
      );
      actualizarDuracion();
    });
  });

  // ── Botón de agregar capa ───────────────────────────────────
  document.getElementById("add-layer-btn").addEventListener("click", () => {
    const nuevaCapa = new Layer(state.layers.length);
    state.layers.push(nuevaCapa);

    // Si el audio ya está corriendo, iniciar el oscilador de la nueva capa
    if (state.audioStarted) nuevaCapa.buildAudio();

    state.selectedLayer = state.layers.length - 1;
    renderLayerList();
    openEditor(nuevaCapa);
  });

  // ── Sliders del editor ──────────────────────────────────────
  // Parámetros generales + parámetros específicos por tipo de onda + envelope
  [
    "freq", "amp", "speed", "phase",   // onda
    "detune", "pan", "reverb",         // audio
    "opacity", "thickness", "glow",    // visual
    "duty", "mod-index", "harmonicity", // tipo-específicos
    "attack", "release",               // envelope
  ].forEach((id) => {
    const el = document.getElementById(`e-${id}`);
    if (el) el.addEventListener("input", onEditorChange);
  });
  // ── Botón de modo step (toggle drone/secuenciado) ──────────────────
  document.getElementById("step-mode-btn").addEventListener("click", () => {
    const capa = state.layers[state.selectedLayer];
    if (!capa) return;
    capa.setStepMode(!capa.stepMode);
    renderStepGrid(capa);
  });
  // ── Botones de tipo de onda ─────────────────────────────────
  document.querySelectorAll(".wave-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Desactivar todos los botones, activar el presionado
      document.querySelectorAll(".wave-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const capa = state.layers[state.selectedLayer];
      if (capa) {
        capa.waveType = btn.dataset.wave;
        capa.updateAudio();             // reconstruir oscilador si cambia la clase Tone.js
        syncWaveTypeControls(capa);     // mostrar/ocultar parámetros específicos
        renderLayerList();              // actualizar meta-info en la tarjeta de la lista
      }
    });
  });

  // ── Botones de color espectral de ruido ─────────────────────
  document.querySelectorAll(".noise-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".noise-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const capa = state.layers[state.selectedLayer];
      if (capa) {
        capa.noiseType = btn.dataset.noise;
        capa.updateAudio(); // cambiar tipo de ruido en el nodo Tone.Noise
      }
    });
  });

  // ── Selector de color ───────────────────────────────────────
  document.getElementById("e-color").addEventListener("input", (e) => {
    const capa = state.layers[state.selectedLayer];
    if (capa) {
      capa.color = e.target.value;
      renderLayerList(); // actualizar el swatch en la tarjeta
    }
  });

  // ── Campo de nombre de la capa ──────────────────────────────
  document.getElementById("e-name").addEventListener("input", (e) => {
    const capa = state.layers[state.selectedLayer];
    if (capa) {
      capa.name = e.target.value;
      renderLayerList(); // actualizar el nombre en la tarjeta
    }
  });

  // ── Botón de eliminar capa ──────────────────────────────────
  document.getElementById("delete-layer-btn").addEventListener("click", () => {
    if (state.layers.length <= 1) return; // mantener mínimo una capa

    // Destruir nodos de audio de la capa eliminada
    state.layers[state.selectedLayer].destroy();
    state.layers.splice(state.selectedLayer, 1);

    // Ajustar índice seleccionado para que no quede fuera de rango
    state.selectedLayer = Math.max(0, state.selectedLayer - 1);

    closeEditor();
    renderLayerList();
  });

  // ── Botón de cerrar el editor ───────────────────────────────
  document.getElementById("close-editor-btn").addEventListener("click", closeEditor);
}
