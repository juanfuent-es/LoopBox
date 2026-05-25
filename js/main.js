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

import { state, PANEL_W, EDITOR_W } from './state.js';
import Layer from './Layer.js';
import { drawGrid, drawHUD, drawCompositeWave } from './Renderer.js';
import {
  renderLayerList,
  openEditor,
  closeEditor,
  syncEditorFromLayer,
  onEditorChange,
  syncWaveTypeControls,
} from './Editor.js';

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
  const canvas = createCanvas(window.innerWidth - PANEL_W, window.innerHeight);
  canvas.parent("canvas-root");
  pixelDensity(1);       // evitar escalado en pantallas de alta densidad
  textFont("monospace"); // fuente del HUD consistente con el diseño retro

  // Crear 3 capas iniciales con valores escalonados
  for (let i = 0; i < 3; i++) {
    state.layers.push(new Layer(i));
  }

  // Registrar todos los controles del panel y el editor
  _wireControls();

  // Renderizar la lista de capas en el panel lateral
  renderLayerList();
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
  resizeCanvas(window.innerWidth - PANEL_W, window.innerHeight);
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

    // Iniciar todos los osciladores simultáneamente → mezcla final en Tone.Destination
    state.layers.forEach((capa) => capa.buildAudio());

    // Actualizar UI del botón
    const btn = document.getElementById("audio-btn");
    btn.textContent = "◉ AUDIO ON";
    btn.classList.add("active");
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
  // Parámetros generales + parámetros específicos por tipo de onda
  [
    "freq", "amp", "speed", "phase",   // onda
    "detune", "pan", "reverb",         // audio
    "opacity", "thickness", "glow",    // visual
    "duty", "mod-index", "harmonicity", // tipo-específicos
  ].forEach((id) => {
    const el = document.getElementById(`e-${id}`);
    if (el) el.addEventListener("input", onEditorChange);
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
