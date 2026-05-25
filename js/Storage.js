/**
 * @file Storage.js
 * Persistencia de loops en localStorage.
 *
 * Un "loop" es un snapshot JSON del estado musical completo:
 *   { id, name, bpm, bars, createdAt, layers: [{...atributos + steps}] }
 *
 * Todos los loops se almacenan bajo STORAGE_KEY como un array JSON.
 * Al cargar un loop se destruyen las capas actuales y se reconstruyen desde
 * el snapshot, restaurando tanto la configuración visual como los pasos de secuencia.
 *
 * Dependencias internas: state.js, Layer.js
 */

import { state } from './state.js';
import Layer from './Layer.js';

/** Clave bajo la que se persiste el array de loops en localStorage */
const STORAGE_KEY = 'loopbox_v1_loops';

// ══════════════════════════════════════════════════════════════
// CRUD de loops
// ══════════════════════════════════════════════════════════════

/**
 * Lee la lista completa de loops guardados del localStorage.
 * @returns {Array<Object>}
 */
export function listarLoops() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Guarda el estado actual como un loop.
 * Si state.currentLoopId ya existe en el store, actualiza ese loop.
 * Si no, crea uno nuevo.
 *
 * @param {string} [nombre] - Nombre del loop. Usa state.currentLoopName si se omite.
 * @returns {Object} El objeto de loop guardado
 */
export function guardarLoop(nombre) {
  const loops = listarLoops();
  const nombreFinal = nombre || state.currentLoopName || `Loop ${loops.length + 1}`;

  const loop = {
    id        : state.currentLoopId || _generarId(),
    name      : nombreFinal,
    bpm       : state.bpm,
    bars      : state.bars,
    createdAt : Date.now(),
    layers    : state.layers.map(_serializarCapa),
  };

  // Reemplazar si ya existe, agregar al final si es nuevo
  const idx = loops.findIndex(l => l.id === loop.id);
  if (idx >= 0) {
    loops[idx] = loop;
  } else {
    loops.push(loop);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(loops));
  state.currentLoopId   = loop.id;
  state.currentLoopName = loop.name;
  return loop;
}

/**
 * Carga un loop guardado y reemplaza el estado actual.
 * Destruye todas las capas actuales y reconstruye desde el snapshot.
 *
 * @param {string} id - ID del loop a cargar
 * @param {Function} [onCargado] - Callback invocado después de cargar (para re-render UI)
 */
export function cargarLoop(id, onCargado) {
  const loops = listarLoops();
  const loop  = loops.find(l => l.id === id);
  if (!loop) return;

  // Destruir audio y capas actuales
  state.layers.forEach(c => c.destroy());
  state.layers.length    = 0;
  state.selectedLayer    = 0;
  state.currentLoopId   = loop.id;
  state.currentLoopName = loop.name;
  state.bpm              = loop.bpm;
  state.bars             = loop.bars;

  // Reconstruir capas desde el snapshot
  loop.layers.forEach((datos, i) => {
    const capa = new Layer(i);
    _aplicarDatos(capa, datos);
    state.layers.push(capa);
    if (state.audioStarted) capa.buildAudio();
  });

  if (onCargado) onCargado();
}

/**
 * Elimina un loop del store por su ID.
 * @param {string} id
 */
export function eliminarLoop(id) {
  const loops = listarLoops().filter(l => l.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loops));
  if (state.currentLoopId === id) {
    state.currentLoopId   = null;
    state.currentLoopName = 'Loop';
  }
}

/**
 * Resetea el estado a un loop nuevo vacío sin guardar.
 * Destruye el audio y las capas actuales.
 *
 * @param {Function} [onNuevo] - Callback para re-render UI
 */
export function nuevoLoop(onNuevo) {
  state.layers.forEach(c => c.destroy());
  state.layers.length    = 0;
  state.selectedLayer    = 0;
  state.currentLoopId   = null;
  state.currentLoopName = 'Loop';
  state.bpm              = 120;
  state.bars             = 2;
  if (onNuevo) onNuevo();
}

// ══════════════════════════════════════════════════════════════
// Serialización privada
// ══════════════════════════════════════════════════════════════

/**
 * Genera un ID único basado en timestamp + fragmento aleatorio.
 * @returns {string}
 */
function _generarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Convierte una instancia de Layer en un objeto JSON plano serializable.
 * @param {Layer} capa
 * @returns {Object}
 */
function _serializarCapa(capa) {
  return {
    name           : capa.name,
    frequency      : capa.frequency,
    amplitude      : capa.amplitude,
    speed          : capa.speed,
    phase          : capa.phase,
    waveType       : capa.waveType,
    color          : capa.color,
    opacity        : capa.opacity,
    thickness      : capa.thickness,
    glowIntensity  : capa.glowIntensity,
    muted          : capa.muted,
    detune         : capa.detune,
    pan            : capa.pan,
    reverb         : capa.reverb,
    dutyCycle      : capa.dutyCycle,
    modulationIndex: capa.modulationIndex,
    harmonicity    : capa.harmonicity,
    noiseType      : capa.noiseType,
    steps          : [...capa.steps],
    stepMode       : capa.stepMode,
    attackTime     : capa.attackTime,
    releaseTime    : capa.releaseTime,
  };
}

/**
 * Aplica los datos de un snapshot JSON a una instancia de Layer existente.
 * Usa valores por defecto seguros si el snapshot tiene campos faltantes.
 *
 * @param {Layer} capa
 * @param {Object} datos
 */
function _aplicarDatos(capa, datos) {
  Object.assign(capa, {
    name           : datos.name           ?? capa.name,
    frequency      : datos.frequency      ?? capa.frequency,
    amplitude      : datos.amplitude      ?? capa.amplitude,
    speed          : datos.speed          ?? capa.speed,
    phase          : datos.phase          ?? capa.phase,
    waveType       : datos.waveType       ?? capa.waveType,
    color          : datos.color          ?? capa.color,
    opacity        : datos.opacity        ?? capa.opacity,
    thickness      : datos.thickness      ?? capa.thickness,
    glowIntensity  : datos.glowIntensity  ?? capa.glowIntensity,
    muted          : datos.muted          ?? false,
    detune         : datos.detune         ?? 0,
    pan            : datos.pan            ?? 0,
    reverb         : datos.reverb         ?? 0,
    dutyCycle      : datos.dutyCycle      ?? 0.5,
    modulationIndex: datos.modulationIndex ?? 5,
    harmonicity    : datos.harmonicity    ?? 1,
    noiseType      : datos.noiseType      ?? 'white',
    steps          : Array.isArray(datos.steps) ? [...datos.steps] : Array(16).fill(0),
    stepMode       : datos.stepMode       ?? false,
    attackTime     : datos.attackTime     ?? 0.01,
    releaseTime    : datos.releaseTime    ?? 0.08,
  });
}
