/**
 * @file Transport.js
 * Reloj global de Tone.js — controla BPM, duración del loop y reproducción.
 *
 * Tone.Transport actúa como el "tempo master" de la aplicación:
 *  - Todos los Tone.Sequence de cada Layer se sincronizan automáticamente.
 *  - Transport.loop = true → el loop se repite cada `bars` compases.
 *  - Al cambiar BPM o bars, Tone.js ajusta el timing sin reiniciar las sequences.
 *
 * Fórmula de duración: duración_s = bars × (60 / bpm) × 4
 *   Ej: 120 BPM, 2 bars → 4.0 s por loop
 *
 * Dependencias externas: Tone.js (global vía CDN)
 * Dependencias internas: state.js
 */

import { state } from './state.js';

// ══════════════════════════════════════════════════════════════
// Inicialización
// ══════════════════════════════════════════════════════════════

/**
 * Configura el Transport con los valores actuales del estado global.
 * Llamar UNA VEZ después de Tone.start().
 */
export function initTransport() {
  Tone.Transport.bpm.value = state.bpm;
  Tone.Transport.loop      = true;
  Tone.Transport.loopStart = 0;
  Tone.Transport.loopEnd   = `${state.bars}m`;
  actualizarDuracion();
}

// ══════════════════════════════════════════════════════════════
// Control de parámetros
// ══════════════════════════════════════════════════════════════

/**
 * Cambia el BPM global. Tone.js reescala automáticamente todas las Sequences.
 * @param {number} bpm - Nuevo valor de BPM (40–240)
 */
export function setBpm(bpm) {
  state.bpm = Math.round(bpm);
  Tone.Transport.bpm.value = state.bpm;
  actualizarDuracion();
}

/**
 * Cambia la duración del loop en compases y actualiza el punto de loop del Transport.
 * @param {number} bars - Número de compases: 1 | 2 | 4 | 8
 */
export function setBars(bars) {
  state.bars = bars;
  Tone.Transport.loopEnd = `${bars}m`;
  actualizarDuracion();
}

// ══════════════════════════════════════════════════════════════
// Reproducción
// ══════════════════════════════════════════════════════════════

/**
 * Inicia la reproducción del Transport.
 * Los Tone.Sequence de capas en stepMode empiezan a disparar.
 */
export function transportPlay() {
  state.playing = true;
  Tone.Transport.start();
  sincronizarBotonesPlay();
}

/**
 * Detiene la reproducción y regresa al inicio del loop (posición 0).
 */
export function transportStop() {
  state.playing = false;
  Tone.Transport.stop();
  sincronizarBotonesPlay();
}

// ══════════════════════════════════════════════════════════════
// Helpers de UI
// ══════════════════════════════════════════════════════════════

/**
 * Actualiza el display de duración (#t-duration) con el valor calculado.
 */
export function actualizarDuracion() {
  const dur = state.bars * (60 / state.bpm) * 4;
  const el = document.getElementById('t-duration');
  if (el) el.textContent = `${dur.toFixed(1)}s`;
}

/**
 * Sincroniza el estado visual de los botones play/stop con state.playing.
 */
export function sincronizarBotonesPlay() {
  const playBtn = document.getElementById('play-btn');
  const stopBtn = document.getElementById('stop-btn');
  if (playBtn) playBtn.classList.toggle('active', state.playing);
  if (stopBtn) stopBtn.classList.toggle('active', !state.playing && state.audioStarted);
}
