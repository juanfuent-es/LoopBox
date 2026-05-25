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
};

/** Ancho del panel lateral fijo (px) — debe coincidir con el valor CSS del `.panel` */
export const PANEL_W = 280;

/** Ancho del editor flotante (px) — usado para ignorar arrastres sobre él */
export const EDITOR_W = 258;
