/**
 * @file state.js
 * Estado global compartido de la aplicación LoopBox.
 *
 * Se exporta como un objeto mutable para que todos los módulos ES6
 * lean y escriban sobre la misma referencia en memoria.
 * Como los módulos son singletons, cualquier cambio a `state`
 * es visible inmediatamente en todos los importadores.
 */

/**
 * Objeto de estado global de la aplicación.
 * @type {Object}
 */
export const state = {
  /** @type {import('./Layer.js').default[]} Colección de capas de osciladores activas */
  layers: [],

  /** @type {number} Índice de la capa actualmente seleccionada en la lista */
  selectedLayer: 0,

  /** @type {boolean} Indica si el contexto de audio de Tone.js fue iniciado por el usuario */
  audioStarted: false,

  /** @type {boolean} Indica si el panel flotante del editor está visible */
  editorOpen: false,

  // ── Transport ──────────────────────────────────────────────
  /** @type {number} Tempo global en pulsaciones por minuto (40–240) */
  bpm: 120,

  /** @type {number} Duración del loop en compases: 1 | 2 | 4 | 8 */
  bars: 2,

  /** @type {boolean} Indica si el Transport está actualmente en reproducción */
  playing: false,

  // ── Storage ────────────────────────────────────────────────
  /** @type {string|null} ID del loop actualmente cargado (null = sin guardar) */
  currentLoopId: null,

  /** @type {string} Nombre editable del loop actual */
  currentLoopName: 'Loop',
};

/** Ancho del panel lateral fijo (px) — debe coincidir con el valor CSS del `.panel` */
export const PANEL_W = 280;

/** Alto de la barra de Transport fija (px) — debe coincidir con el valor CSS de `.transport-bar` */
export const TRANSPORT_H = 44;

/** Ancho del editor flotante (px) — usado para ignorar arrastres sobre él */
export const EDITOR_W = 258;
