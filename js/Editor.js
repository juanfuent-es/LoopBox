/**
 * @file Editor.js
 * Módulo del editor flotante — gestión del panel de control por capa.
 *
 * Contiene todas las funciones que leen/escriben el DOM del editor:
 *  - renderLayerList()      : reconstruye la lista de capas en el panel lateral
 *  - openEditor()           : abre el editor flotante para una capa
 *  - closeEditor()          : cierra el editor flotante
 *  - syncEditorFromLayer()  : carga los valores de una capa en los controles del editor
 *  - onEditorChange()       : lee el editor y aplica los cambios a la capa activa
 *  - updateValueDisplays()  : actualiza los textos de valor junto a cada slider
 *  - syncWaveTypeControls() : muestra/oculta controles específicos por tipo de onda
 *
 * Dependencias: state.js
 */

import { state } from './state.js';
import { listarLoops, guardarLoop, cargarLoop, eliminarLoop } from './Storage.js';

// ══════════════════════════════════════════════════════════════
// Grilla de pasos del secuenciador
// ══════════════════════════════════════════════════════════════

/**
 * Renderiza la grilla de 16 pasos para la capa dada en #step-grid.
 * Solo visible cuando capa.stepMode = true.
 * Cada celda es un botón que alterna el paso entre activo (1) y silencio (0).
 * Los pasos en posición 0, 4, 8, 12 son tiempos fuertes (beat) y tienen marca visual.
 *
 * @param {import('./Layer.js').default} capa
 */
export function renderStepGrid(capa) {
  const grid    = document.getElementById('step-grid');
  const modeBtn = document.getElementById('step-mode-btn');
  const envBlock = document.getElementById('envelope-block');
  if (!grid) return;

  // Actualizar botón de modo
  if (modeBtn) {
    modeBtn.textContent = capa.stepMode ? 'STEP: ON' : 'STEP: OFF';
    modeBtn.classList.toggle('active', capa.stepMode);
  }

  // Mostrar/ocultar grilla y envelope según el modo
  grid.style.display    = capa.stepMode ? '' : 'none';
  if (envBlock) envBlock.style.display = capa.stepMode ? '' : 'none';

  if (!capa.stepMode) return;

  // Reconstruir las 16 celdas
  grid.innerHTML = '';
  capa.steps.forEach((activo, i) => {
    const cell = document.createElement('button');
    cell.className = [
      'step-cell',
      activo    ? 'active' : '',
      i % 4 === 0 ? 'beat'   : '',
    ].filter(Boolean).join(' ');
    cell.dataset.step = i;
    cell.title = `Paso ${i + 1}`;

    cell.addEventListener('click', () => {
      // Alternar el paso
      capa.steps[i] = capa.steps[i] ? 0 : 1;
      // Actualizar la Sequence de Tone.js si está corriendo
      if (capa.sequence) capa.sequence.events = [...capa.steps];
      // Re-renderizar solo la celda tocada (evitar reconstruir todo el grid)
      cell.classList.toggle('active', !!capa.steps[i]);
    });

    grid.appendChild(cell);
  });
}

// ══════════════════════════════════════════════════════════════
// Lista de loops guardados
// ══════════════════════════════════════════════════════════════

/**
 * Reconstruye la lista de loops guardados en #loop-list.
 * Cada item muestra: nombre, BPM, número de bars, duración en segundos.
 * Clic en el item carga el loop; clic en ✕ lo elimina.
 *
 * @param {Function} [onCarga] - Callback invocado después de cargar un loop
 */
export function renderLoopList(onCarga) {
  const lista = document.getElementById('loop-list');
  if (!lista) return;

  const loops = listarLoops();
  lista.innerHTML = '';

  if (loops.length === 0) {
    lista.innerHTML = '<div class="loop-empty">No hay loops guardados</div>';
    return;
  }

  loops.slice().reverse().forEach(loop => {
    const dur = (loop.bars * (60 / loop.bpm) * 4).toFixed(1);
    const item = document.createElement('div');
    item.className = [
      'loop-item',
      loop.id === state.currentLoopId ? 'selected' : '',
    ].filter(Boolean).join(' ');

    item.innerHTML = `
      <div class="loop-item-info">
        <span class="loop-item-name">${loop.name}</span>
        <span class="loop-item-meta">${loop.bpm} BPM · ${loop.bars}B · ${dur}s</span>
      </div>
      <button class="loop-del-btn" data-id="${loop.id}" title="Eliminar">✕</button>`;

    // Clic en el item (no en el botón de eliminar) → cargar loop
    item.addEventListener('click', e => {
      if (e.target.classList.contains('loop-del-btn')) return;
      cargarLoop(loop.id, () => {
        if (onCarga) onCarga();
        renderLoopList(onCarga);
      });
    });

    // Clic en ✕ → eliminar loop
    item.querySelector('.loop-del-btn').addEventListener('click', e => {
      e.stopPropagation();
      eliminarLoop(loop.id);
      renderLoopList(onCarga);
    });

    lista.appendChild(item);
  });
}

// ══════════════════════════════════════════════════════════════
// Lista de capas en el panel lateral
// ══════════════════════════════════════════════════════════════

/**
 * Reconstruye completamente la lista de capas en #layer-list.
 *
 * Cada tarjeta (card) muestra:
 *  - Swatch de color con efecto glow
 *  - Nombre de la capa
 *  - Meta-info: tipo de onda y frecuencia
 *  - Botón de mute/unmute
 *
 * Al hacer clic en una tarjeta se selecciona la capa y abre el editor.
 */
export function renderLayerList() {
  const lista = document.getElementById("layer-list");
  lista.innerHTML = ""; // limpiar lista anterior

  state.layers.forEach((capa, indice) => {
    const card = document.createElement("div");

    // Clases CSS: selected si es la capa activa, muted si está silenciada
    card.className = [
      "layer-card",
      indice === state.selectedLayer ? "selected" : "",
      capa.muted ? "muted" : "",
    ].filter(Boolean).join(" ");

    // Contenido HTML de la tarjeta
    card.innerHTML = `
      <span class="layer-swatch"
            style="background:${capa.color};box-shadow:0 0 5px ${capa.color}66"></span>
      <div class="layer-card-text">
        <span class="layer-card-name">${capa.name}</span>
        <span class="layer-card-meta">${capa.waveType} · ${Math.round(capa.frequency)} Hz</span>
      </div>
      <button class="mute-btn${capa.muted ? " muted" : ""}"
              title="${capa.muted ? "Desmutear" : "Mutear"}">${capa.muted ? "✕" : "◉"}</button>`;

    // Clic en la tarjeta (no en el botón de mute) → seleccionar y abrir editor
    card.addEventListener("click", (e) => {
      if (e.target.classList.contains("mute-btn")) return;
      state.selectedLayer = indice;
      renderLayerList();     // re-renderizar para actualizar .selected
      openEditor(capa);
    });

    // Clic en el botón de mute → alternar silencio de la capa
    card.querySelector(".mute-btn").addEventListener("click", (e) => {
      e.stopPropagation(); // no propagar al clic de la tarjeta
      capa.muted = !capa.muted;
      capa.updateAudio();  // aplicar cambio en el audio (gain → 0 o valor normal)
      renderLayerList();
      // Si el editor está abierto sobre esta capa, actualizar sus controles
      if (state.editorOpen && state.selectedLayer === indice) {
        syncEditorFromLayer(capa);
      }
    });

    lista.appendChild(card);
  });
}

// ══════════════════════════════════════════════════════════════
// Apertura y cierre del editor flotante
// ══════════════════════════════════════════════════════════════

/**
 * Abre el editor flotante (#layer-editor) y lo popula con los valores de la capa.
 * @param {import('./Layer.js').default} capa - Capa cuyos valores se cargarán en el editor
 */
export function openEditor(capa) {
  state.editorOpen = true;
  document.getElementById("layer-editor").classList.add("open");
  syncEditorFromLayer(capa);
}

/**
 * Cierra el editor flotante y marca el estado como cerrado.
 */
export function closeEditor() {
  state.editorOpen = false;
  document.getElementById("layer-editor").classList.remove("open");
}

// ══════════════════════════════════════════════════════════════
// Sincronización de valores capa ↔ editor
// ══════════════════════════════════════════════════════════════

/**
 * Carga todos los atributos de una capa en los controles del editor flotante.
 * Se llama al abrir el editor o al seleccionar una capa diferente.
 *
 * @param {import('./Layer.js').default} capa
 */
export function syncEditorFromLayer(capa) {
  if (!capa) return;

  // Helper: asignar valor a un <input> por su id
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  // Nombre y parámetros de onda
  set("e-name",        capa.name);
  set("e-freq",        capa.frequency);
  set("e-amp",         capa.amplitude);
  set("e-speed",       capa.speed);
  set("e-phase",       capa.phase);

  // Parámetros de audio
  set("e-detune",      capa.detune);
  set("e-pan",         capa.pan);
  set("e-reverb",      capa.reverb);

  // Parámetros visuales
  set("e-opacity",     capa.opacity);
  set("e-thickness",   capa.thickness);
  set("e-glow",        capa.glowIntensity);
  set("e-color",       capa.color);

  // Parámetros específicos por tipo de onda
  set("e-duty",        capa.dutyCycle);
  set("e-mod-index",   capa.modulationIndex);
  set("e-harmonicity", capa.harmonicity);

  // Parámetros de envelope (step mode)
  set("e-attack",      capa.attackTime);
  set("e-release",     capa.releaseTime);

  // Renderizar grilla de pasos y controlar visibilidad del bloque envelope
  renderStepGrid(capa);

  // Marcar el botón de tipo de onda activo
  document.querySelectorAll(".wave-btn").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.wave === capa.waveType)
  );

  // Marcar el botón de color de ruido activo
  document.querySelectorAll(".noise-btn").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.noise === capa.noiseType)
  );

  // Mostrar/ocultar controles específicos del tipo de onda
  syncWaveTypeControls(capa);

  // Actualizar todos los textos de valor junto a los sliders
  updateValueDisplays(capa);
}

/**
 * Lee todos los controles del editor y aplica los cambios a la capa activa.
 * Se invoca en cada evento 'input' de los sliders del editor flotante.
 */
export function onEditorChange() {
  const capa = state.layers[state.selectedLayer];
  if (!capa) return;

  // Helper: leer un <input> numérico de forma segura (usa fallback si el elemento no existe)
  const num = (id, fallback) => {
    const el = document.getElementById(id);
    return el ? Number(el.value) : fallback;
  };

  // Parámetros de onda y oscilación
  capa.frequency       = num("e-freq",        capa.frequency);
  capa.amplitude       = num("e-amp",         capa.amplitude);
  capa.speed           = num("e-speed",        capa.speed);
  capa.phase           = num("e-phase",        capa.phase);

  // Parámetros de audio
  capa.detune          = num("e-detune",       capa.detune);
  capa.pan             = num("e-pan",          capa.pan);
  capa.reverb          = num("e-reverb",       capa.reverb);

  // Parámetros visuales
  capa.opacity         = num("e-opacity",      capa.opacity);
  capa.thickness       = num("e-thickness",    capa.thickness);
  capa.glowIntensity   = num("e-glow",         capa.glowIntensity);

  // Parámetros específicos por tipo de onda
  capa.dutyCycle       = num("e-duty",         capa.dutyCycle);
  capa.modulationIndex = num("e-mod-index",    capa.modulationIndex);
  capa.harmonicity     = num("e-harmonicity",  capa.harmonicity);

  // Parámetros de envelope (step mode)
  capa.attackTime  = num("e-attack",   capa.attackTime);
  capa.releaseTime = num("e-release",  capa.releaseTime);

  updateValueDisplays(capa);
  capa.updateAudio();
}

/**
 * Actualiza los textos de valor legible (ej: "220 Hz", "+5 ¢", "L 0.40")
 * que se muestran junto a cada slider del editor.
 *
 * @param {import('./Layer.js').default} capa
 */
export function updateValueDisplays(capa) {
  // Texto de paneo: muestra dirección y valor, o "C" para centro
  const panStr = capa.pan > 0.01  ? `R ${capa.pan.toFixed(2)}`
               : capa.pan < -0.01 ? `L ${Math.abs(capa.pan).toFixed(2)}`
               : "C";

  // Pares [id-del-slider, texto-de-valor-formateado]
  [
    ["e-freq",        `${Math.round(capa.frequency)} Hz`],
    ["e-amp",         capa.amplitude.toFixed(2)],
    ["e-speed",       `${capa.speed.toFixed(2)}x`],
    ["e-phase",       `${capa.phase.toFixed(2)} rad`],
    ["e-detune",      `${capa.detune >= 0 ? "+" : ""}${Math.round(capa.detune)} ¢`],
    ["e-pan",         panStr],
    ["e-reverb",      `${Math.round(capa.reverb * 100)}%`],
    ["e-opacity",     `${Math.round(capa.opacity * 100)}%`],
    ["e-thickness",   `${capa.thickness.toFixed(1)}px`],
    ["e-glow",        `${Math.round(capa.glowIntensity * 100)}%`],
    ["e-duty",        `${Math.round(capa.dutyCycle * 100)}%`],
    ["e-mod-index",   capa.modulationIndex.toFixed(1)],
    ["e-harmonicity", `${capa.harmonicity.toFixed(1)}x`],
    ["e-attack",      `${Math.round(capa.attackTime * 1000)}ms`],
    ["e-release",     `${Math.round(capa.releaseTime * 1000)}ms`],
  ].forEach(([id, val]) => {
    const el = document.getElementById(`${id}-val`);
    if (el) el.textContent = val;
  });
}

// ══════════════════════════════════════════════════════════════
// Visibilidad de controles específicos por tipo de onda
// ══════════════════════════════════════════════════════════════

/**
 * Muestra u oculta el bloque de parámetros específicos por tipo de onda (#wave-params-block)
 * y sus filas individuales, según el waveType de la capa.
 *
 * Cada fila declara sus tipos compatibles mediante el atributo HTML:
 *   data-show-for="tipo1 tipo2"
 *
 * Ejemplo: la fila de duty cycle tiene data-show-for="pulse"
 *          la fila de harmonicity tiene data-show-for="fmsine amsine"
 *
 * @param {import('./Layer.js').default} capa
 */
export function syncWaveTypeControls(capa) {
  // Tipos de onda que tienen parámetros adicionales configurables
  const tiposConParametros = ["pulse", "fmsine", "amsine", "noise"];

  const bloque = document.getElementById("wave-params-block");
  if (!bloque) return;

  // Mostrar u ocultar el bloque completo según el tipo de onda actual
  bloque.style.display = tiposConParametros.includes(capa.waveType) ? "" : "none";

  // Mostrar/ocultar cada fila individual según data-show-for
  document.querySelectorAll(".wave-param-row").forEach((fila) => {
    const mostrarPara = (fila.dataset.showFor || "").split(" ");
    fila.style.display = mostrarPara.includes(capa.waveType) ? "" : "none";
  });
}
