/**
 * @file Renderer.js
 * Módulo de renderizado — funciones de dibujo p5.js para el canvas de LoopBox.
 *
 * Contiene:
 *  - drawGrid()           : cuadrícula estilo osciloscopio analógico
 *  - drawHUD()            : overlay con info de la capa activa y estado del audio
 *  - drawCompositeWave()  : onda suma de todas las capas (composición final visible)
 *
 * Todas las funciones usan el API global de p5.js (stroke, fill, line, text, etc.)
 * que está disponible porque p5.js se carga como script global antes de los módulos.
 *
 * Dependencias: state.js (para acceder a layers y selectedLayer)
 */

import { state } from './state.js';

// ══════════════════════════════════════════════════════════════
// Cuadrícula de fondo
// ══════════════════════════════════════════════════════════════

/**
 * Dibuja la cuadrícula de fondo estilo osciloscopio analógico.
 *
 * Incluye:
 *  - Líneas verticales y horizontales de la cuadrícula principal
 *  - Eje horizontal central (línea de 0 voltios)
 *  - Etiquetas de tiempo en el borde inferior (ms)
 *  - Marcadores de voltaje sobre el eje vertical (±1V, ±0.5V)
 */
export function drawGrid() {
  const cols = 10;
  const rows = 8;

  // Líneas verticales de la cuadrícula
  stroke("#070f07");
  strokeWeight(1);
  for (let i = 0; i <= cols; i++) {
    const x = (width / cols) * i;
    line(x, 0, x, height);
  }

  // Líneas horizontales de la cuadrícula
  for (let i = 0; i <= rows; i++) {
    const y = (height / rows) * i;
    line(0, y, width, y);
  }

  // Eje horizontal central — representa el nivel de 0 voltios
  stroke("#0f250f");
  strokeWeight(1);
  line(0, height / 2, width, height / 2);

  // Etiquetas de tiempo en el borde inferior del canvas
  noStroke();
  fill("#183518");
  textSize(8);
  for (let i = 0; i <= cols; i++) {
    text(`${i * 10}`, (width / cols) * i + 2, height - 5);
  }
  text("ms", width - 16, height - 5);

  // Marcadores de voltaje sobre el eje vertical izquierdo
  [1, 0.5, -0.5, -1].forEach((v) => {
    const y = height / 2 - v * height * 0.10;
    stroke("#0f250f");
    strokeWeight(0.5);
    line(0, y, 12, y);
    noStroke();
    fill("#183518");
    textSize(8);
    text(`${v > 0 ? "+" : ""}${v}V`, 14, y + 3);
  });
}

// ══════════════════════════════════════════════════════════════
// HUD — información superpuesta
// ══════════════════════════════════════════════════════════════

/**
 * Dibuja el HUD (Head-Up Display) superpuesto sobre el canvas.
 *
 * Muestra en esquina superior derecha:
 *  - Nombre, tipo de onda y frecuencia de la capa activa
 *
 * Muestra en esquina inferior derecha:
 *  - Estado del sistema de audio y cantidad de osciladores activos
 */
export function drawHUD() {
  const capa = state.layers[state.selectedLayer];
  noStroke();
  textSize(9);

  // Información de la capa activa (esquina superior derecha)
  if (capa) {
    fill(capa.color);
    const info = `▶ ${capa.name} · ${capa.waveType.toUpperCase()} · ${Math.round(capa.frequency)} Hz${capa.muted ? " · MUTED" : ""}`;
    text(info, width - 10 - textWidth(info), 12);
  }

  // Estado del sistema de audio (esquina inferior derecha)
  fill("#183518");
  textSize(8);
  const activas = state.layers.filter((l) => !l.muted).length;
  const estado  = state.audioStarted
    ? `♪ ${activas} OSC PLAYING · ${state.layers.length} TOTAL`
    : "AUDIO OFFLINE — click INICIAR";
  text(estado, width - 10 - textWidth(estado), height - 7);
}

// ══════════════════════════════════════════════════════════════
// Onda compuesta — composición final de audio
// ══════════════════════════════════════════════════════════════

/**
 * Dibuja la onda suma de todas las capas activas (no silenciadas).
 *
 * Esta onda blanca representa la composición de audio que el usuario escucha:
 * la superposición de todos los osciladores mezclados en Tone.Destination.
 *
 * Se dibuja con brillo intenso (shadowBlur alto) para destacarla visualmente
 * sobre las ondas individuales de cada capa.
 *
 * @param {number} centerY - Centro vertical del canvas en píxeles
 * @param {number} t       - Tiempo animado (frameCount * 0.02)
 */
export function drawCompositeWave(centerY, t) {
  // Acumular la suma ponderada de todas las capas no silenciadas
  const sumWave = new Float32Array(width);
  state.layers.forEach((capa) => {
    if (!capa.muted) {
      for (let x = 0; x < width; x++) {
        sumWave[x] += capa.sampleWave(x, width, t) * capa.amplitude;
      }
    }
  });

  // Onda compuesta: 1 px blanco semitransparente sobre todo lo demás
  drawingContext.save();
  drawingContext.globalCompositeOperation = "source-over";
  drawingContext.globalAlpha = 0.55;
  stroke("#ffffff");
  strokeWeight(1);
  noFill();
  beginShape();
  for (let x = 0; x < width; x++) {
    vertex(x, centerY + sumWave[x] * height * 0.10);
  }
  endShape();
  drawingContext.restore();
}
