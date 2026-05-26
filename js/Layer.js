/**
 * @file Layer.js
 * Clase Layer — representa una capa de oscilador visual y de audio en LoopBox.
 *
 * Cada capa encapsula:
 *  - Parámetros de onda (frecuencia, amplitud, velocidad, fase, tipo de forma)
 *  - Parámetros de estilo visual (color, opacidad, grosor, intensidad de brillo)
 *  - Parámetros de audio adicionales (detune, paneo, reverb)
 *  - Parámetros específicos por tipo de onda (dutyCycle, modulationIndex, harmonicity, noiseType)
 *  - Nodos internos de Tone.js (oscilador, gain, panner, reverb)
 *
 * Cadena de señal de audio por capa:
 *   Oscillator → Gain → Panner → Reverb → Tone.Destination
 *
 * Todas las capas convergen en el mismo Tone.Destination,
 * formando la mezcla y composición final de audio.
 *
 * Dependencias externas (globals vía CDN, cargadas antes del módulo):
 *  - Tone.js  → Tone.Oscillator, Tone.Reverb, Tone.Gain, Tone.Panner, etc.
 *  - p5.js    → width, height, stroke(), strokeWeight(), noFill(),
 *               beginShape(), vertex(), endShape(), drawingContext
 */
export default class Layer {
  /** Paleta de colores retro/técnica — asignada automáticamente por índice */
  static palette = ["#00ff41", "#ffb700", "#00e5ff", "#ff2d78", "#b800ff", "#ff6b00"];

  /**
   * Blend mode por canal — define cómo cada onda se mezcla sobre las anteriores.
   * 'lighter'    : suma aditiva de luz (efecto fósforo analógico)
   * 'screen'     : versión suavizada de lighter
   * 'overlay'    : contraste relativo al fondo
   * 'difference' : inversión cromática en intersecciones (interferencia)
   */
  static blendModes = ["lighter", "screen", "lighter", "overlay", "difference", "screen"];

  /** Contador estático para generar IDs únicos incrementales */
  static _counter = 0;

  /**
   * Crea una nueva capa con valores predeterminados basados en el índice.
   * @param {number} index - Posición en el arreglo de capas (determina color y valores iniciales)
   */
  constructor(index = 0) {
    /** Identificador único auto-incremental */
    this.id   = ++Layer._counter;
    /** Nombre visible en la interfaz de usuario */
    this.name = `Layer ${this.id}`;

    // ── Parámetros de onda y oscilación ───────────────────────
    /** Frecuencia en Hz — controla la densidad visual de ciclos Y el tono de audio (20–1200) */
    this.frequency   = 110 + (index % 6) * 55;
    /** Amplitud 0–1 — altura de la onda Y volumen relativo de audio */
    this.amplitude   = 0.28 - (index % 5) * 0.02;
    /** Multiplicador de velocidad de animación horizontal (0.1–6) */
    this.speed       = 1 + (index % 5) * 0.28;
    /** Desplazamiento de fase en radianes (0–2π) — corre la onda horizontalmente */
    this.phase       = 0;
    /**
     * Forma de la onda:
     *  'sine' | 'square' | 'triangle' | 'sawtooth' | 'pulse' | 'fmsine' | 'amsine' | 'noise'
     */
    this.waveType    = "sine";

    // ── Estilo visual ──────────────────────────────────────────
    /** Color de la línea en formato hex — asignado desde la paleta */
    this.color        = Layer.palette[index % Layer.palette.length];
    /** Transparencia de la capa 0–1 */
    this.opacity      = 0.85;
    /** Grosor del trazo en píxeles (0.5–4) */
    this.thickness    = 1.8;
    /** Intensidad del halo de brillo fosforescente 0–1 */
    this.glowIntensity = 0.6;
    /** Silenciado — oculta el visual Y silencia el audio sin destruir los nodos */
    this.muted        = false;

    // ── Parámetros de audio adicionales ───────────────────────
    /** Ajuste fino de tono en centésimas de semitono (–100 a +100) */
    this.detune  = 0;
    /** Posición estéreo: –1 izquierda · 0 centro · +1 derecha */
    this.pan     = 0;
    /** Nivel de mezcla húmeda de reverberación 0–1 */
    this.reverb  = 0;

    // ── Parámetros específicos por tipo de onda ────────────────
    /** [pulse] Ciclo de trabajo 0.01–0.99 (fracción del período mantenida en alto) */
    this.dutyCycle       = 0.5;
    /** [fmsine] Índice de modulación de frecuencia 0.1–20 (profundidad del efecto FM) */
    this.modulationIndex = 5;
    /** [fmsine / amsine] Ratio de armonicidad entre portadora y moduladora 0.1–10 */
    this.harmonicity     = 1;
    /** [noise] Color espectral del ruido: 'white' | 'pink' | 'brown' */
    this.noiseType       = "white";
    /** Modo de mezcla Canvas 2D para esta capa (ver Layer.blendModes) */
    this.blendMode       = Layer.blendModes[index % Layer.blendModes.length];

    // ── Parámetros de secuencia rítmica ───────────────────────
    /**
     * Patrón de 16 pasos binarios (0 = silencio, 1 = disparo).
     * Cada paso equivale a una corchea (16n) dentro de un compás de 4/4.
     */
    this.steps       = Array(16).fill(0);
    /**
     * Modo de paso: false = drone continuo (envelope abierto), true = secuenciado.
     * En modo drone el oscillator suena siempre; en step mode la Sequence
     * gate-a el AmplitudeEnvelope en los pasos activos.
     */
    this.stepMode    = false;
    /** Tiempo de ataque del AmplitudeEnvelope en modo step (segundos) */
    this.attackTime  = 0.005;
    /** Tiempo de release del AmplitudeEnvelope en modo step (segundos) */
    this.releaseTime = 0.08;

    // ── Nodos Tone.js internos ─────────────────────────────────
    /** @type {Tone.Oscillator|Tone.PulseOscillator|Tone.FMOscillator|Tone.AMOscillator|Tone.Noise|null} */
    this.oscillator    = null;
    /** @type {Tone.AmplitudeEnvelope|null} Envelope que gate-a la señal por paso */
    this.envelope      = null;
    /** @type {Tone.Gain|null} */
    this.gain          = null;
    /** @type {Tone.Panner|null} */
    this.panner        = null;
    /** @type {Tone.Reverb|null} */
    this.reverbNode    = null;
    /** @type {Tone.Sequence|null} Sequence rítmica — null en modo drone */
    this.sequence      = null;
    /** Rastrea qué clase de oscilador Tone.js está instanciada actualmente */
    this._currentOscClass = null;
  }

  // ══════════════════════════════════════════════════════════════
  // Helpers de clase de oscilador
  // ══════════════════════════════════════════════════════════════

  /**
   * Retorna un identificador corto de la clase Tone.js requerida para el tipo de onda dado.
   * Se usa para detectar cuándo hay que reconstruir el oscilador al cambiar de tipo.
   * @param {string} waveType
   * @returns {string} 'Pulse' | 'FM' | 'AM' | 'Noise' | 'Oscillator'
   */
  static _oscClass(waveType) {
    if (waveType === "pulse")  return "Pulse";
    if (waveType === "fmsine") return "FM";
    if (waveType === "amsine") return "AM";
    if (waveType === "noise")  return "Noise";
    return "Oscillator"; // sine | square | triangle | sawtooth
  }

  /**
   * Instancia el oscilador Tone.js correcto según el tipo de onda actual.
   * @returns {Tone.Oscillator|Tone.PulseOscillator|Tone.FMOscillator|Tone.AMOscillator|Tone.Noise}
   */
  _createOscillator() {
    switch (this.waveType) {
      case "pulse":
        // Onda cuadrada asimétrica con ciclo de trabajo configurable
        return new Tone.PulseOscillator({
          frequency : this.frequency,
          width     : this.dutyCycle,
          detune    : this.detune,
        });

      case "fmsine":
        // Modulación de frecuencia: portadora senoidal modulada por otra senoidal
        return new Tone.FMOscillator({
          frequency       : this.frequency,
          type            : "sine",
          modulationIndex : this.modulationIndex,
          harmonicity     : this.harmonicity,
          detune          : this.detune,
        });

      case "amsine":
        // Modulación de amplitud: envolvente senoidal sobre portadora senoidal
        return new Tone.AMOscillator({
          frequency   : this.frequency,
          type        : "sine",
          harmonicity : this.harmonicity,
          detune      : this.detune,
        });

      case "noise":
        // Generador de ruido estocástico — sin frecuencia definida
        return new Tone.Noise({ type: this.noiseType });

      default:
        // Oscilador estándar: sine | square | triangle | sawtooth
        return new Tone.Oscillator({
          frequency : this.frequency,
          type      : this.waveType,
          detune    : this.detune,
        });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Cadena de señal de audio
  // ══════════════════════════════════════════════════════════════

  /**
   * Construye la cadena de audio de esta capa y la inicia.
   *
   * Cadena: Oscillator → AmplitudeEnvelope → Gain → Panner → Reverb → Tone.Destination
   *
   * El AmplitudeEnvelope actúa como gate:
   *  - En modo drone (stepMode=false): se abre permanentemente vía triggerAttack().
   *  - En modo step  (stepMode=true):  una Tone.Sequence lo dispara por paso activo.
   *
   * Todas las capas envían su señal al mismo Tone.Destination (mezcla final).
   */
  buildAudio() {
    if (this.oscillator) return; // ya iniciado, no duplicar

    try {
      // Construir cadena de atrás hacia adelante (Destination → fuente)
      this.reverbNode = new Tone.Reverb({ decay: 2.5, wet: this.reverb }).toDestination();
      this.panner     = new Tone.Panner(this.pan).connect(this.reverbNode);
      this.gain       = new Tone.Gain(this.muted ? 0 : this.amplitude * 0.15).connect(this.panner);

      // AmplitudeEnvelope: gate de la señal entre oscilador y gain
      this.envelope = new Tone.AmplitudeEnvelope({
        attack  : this.attackTime,
        decay   : 0.01,
        sustain : 1,
        release : this.releaseTime,
      }).connect(this.gain);

      // Crear e iniciar el oscilador adecuado para el tipo de onda actual
      this._currentOscClass = Layer._oscClass(this.waveType);
      this.oscillator = this._createOscillator();
      this.oscillator.connect(this.envelope).start();

      // Abrir el envelope según el modo
      if (!this.stepMode) {
        // Drone: envelope abierto permanentemente
        this.envelope.triggerAttack(Tone.now());
      } else {
        // Step mode: crear la Sequence que dispara el envelope por paso activo
        this._buildSequence();
      }
    } catch (err) {
      console.error("[Layer] buildAudio:", err);
    }
  }

  /**
   * Construye y arranca la Tone.Sequence interna para el modo step.
   * La Sequence itera los 16 pasos en subdivisión de 16ava nota ("16n").
   * Los pasos con valor 1 disparan el envelope; los 0 se ignoran.
   * @private
   */
  _buildSequence() {
    if (this.sequence) {
      this.sequence.stop();
      this.sequence.dispose();
    }
    this.sequence = new Tone.Sequence(
      (time, value) => {
        if (value === 1 && !this.muted) {
          // Duración del trigger: 85% de la subdivisión para dejar pequeño silencio entre pasos
          const dur = Tone.Time("16n").toSeconds() * 0.85;
          this.envelope.triggerAttackRelease(dur, time);
        }
      },
      [...this.steps],
      "16n"
    );
    this.sequence.start(0); // sincronizar al inicio del Transport
  }

  /**
   * Sincroniza todos los nodos Tone.js con los valores actuales de los atributos.
   *
   * Si el tipo de onda requiere una clase Tone.js diferente a la instanciada
   * (p. ej. cambiar de 'sine' a 'noise'), reconstruye el oscilador en caliente
   * sin interrumpir los demás nodos de la cadena.
   */
  updateAudio() {
    if (!this.oscillator) return;

    // Actualizar siempre: gain (volumen), panner y reverb
    this.gain.gain.rampTo(this.muted ? 0 : this.amplitude * 0.15, 0.05);
    this.panner.pan.rampTo(this.pan, 0.05);
    this.reverbNode.wet.rampTo(this.reverb, 0.1);

    // Actualizar parámetros del envelope
    this.envelope.attack  = this.attackTime;
    this.envelope.release = this.releaseTime;

    // Actualizar pasos de la Sequence si está en modo step
    if (this.stepMode && this.sequence) {
      this.sequence.events = [...this.steps];
    }

    // Reconstruir el oscilador si la clase Tone.js necesaria cambió
    const claseNecesaria = Layer._oscClass(this.waveType);
    if (this._currentOscClass !== claseNecesaria) {
      this.oscillator.stop();
      this.oscillator.dispose();
      this._currentOscClass = claseNecesaria;
      this.oscillator = this._createOscillator();
      this.oscillator.connect(this.envelope).start();
      return; // el oscilador nuevo ya tiene los parámetros correctos
    }

    // Ruido: sin frecuencia ni detune, solo cambiar color espectral
    if (this.waveType === "noise") {
      this.oscillator.type = this.noiseType;
      return;
    }

    // Osciladores con frecuencia: actualizar pitch y detune suavemente
    this.oscillator.frequency.rampTo(this.frequency, 0.05);
    this.oscillator.detune.rampTo(this.detune, 0.05);

    if (this.waveType === "pulse") {
      // Actualizar ciclo de trabajo
      this.oscillator.width.rampTo(this.dutyCycle, 0.05);
    } else if (this.waveType === "fmsine") {
      // Actualizar índice de modulación y armonicidad
      this.oscillator.modulationIndex.rampTo(this.modulationIndex, 0.05);
      this.oscillator.harmonicity.rampTo(this.harmonicity, 0.05);
    } else if (this.waveType === "amsine") {
      // Actualizar armonicidad de la portadora AM
      this.oscillator.harmonicity.rampTo(this.harmonicity, 0.05);
    } else {
      // sine | square | triangle | sawtooth — cambiar tipo en el oscilador existente
      try { this.oscillator.type = this.waveType; } catch (_) {}
    }
  }

  /**
   * Alterna entre modo drone (continuo) y modo step (secuenciado).
   *
   * - Drone → Step: cierra el envelope permanente, inicia la Sequence.
   * - Step → Drone: para la Sequence, abre el envelope permanentemente.
   *
   * Si el audio no está iniciado aún, solo actualiza el flag `stepMode`
   * y `buildAudio()` leerá el valor correcto cuando se llame.
   *
   * @param {boolean} on - true = activar modo step, false = modo drone
   */
  setStepMode(on) {
    this.stepMode = on;
    if (!this.oscillator) return; // audio no iniciado aún

    if (on) {
      // Drone → Step: cerrar envelope permanente y arrancar Sequence
      this.envelope.triggerRelease(Tone.now());
      this._buildSequence();
    } else {
      // Step → Drone: parar Sequence y abrir envelope permanentemente
      if (this.sequence) {
        this.sequence.stop();
        this.sequence.dispose();
        this.sequence = null;
      }
      this.envelope.triggerAttack(Tone.now());
    }
  }

  /**
   * Detiene y libera todos los nodos Tone.js de esta capa, liberando memoria de audio.
   * Llamar al eliminar la capa.
   */
  destroy() {
    if (!this.oscillator) return;
    // Parar la Sequence antes de disponer nodos dependientes
    if (this.sequence) {
      this.sequence.stop();
      this.sequence.dispose();
      this.sequence = null;
    }
    this.oscillator.stop();
    this.oscillator.dispose();
    this.envelope.dispose();
    this.gain.dispose();
    this.panner.dispose();
    this.reverbNode.dispose();
    this.oscillator = this.envelope = this.gain = this.panner = this.reverbNode = null;
  }

  // ══════════════════════════════════════════════════════════════
  // Matemáticas de onda
  // ══════════════════════════════════════════════════════════════

  /**
   * Calcula la muestra de la onda en el rango –1 … +1 para la posición x del canvas.
   * Implementa matemáticamente cada tipo de onda para el renderizado visual.
   *
   * @param {number} x - Posición horizontal en píxeles (0 … ancho del canvas)
   * @param {number} w - Ancho total del canvas en píxeles
   * @param {number} t - Tiempo animado (frameCount * 0.02)
   * @returns {number} Valor de la muestra entre –1 y +1
   */
  sampleWave(x, w, t) {
    const twoPI = Math.PI * 2;
    // Ciclos visibles: la frecuencia real (audio) se mapea a un rango visual acotado.
    // Mínimo 1 ciclo (ondas graves), máximo 3 ciclos (frecuencias altas).
    // Esto evita que capas de alta frecuencia (hi-hats, claps) saturen la pantalla de picos.
    const visualCycles = Math.max(1, Math.min(this.frequency * 0.02, 3));
    const theta = (x / w) * twoPI * visualCycles + t * this.speed + this.phase;

    switch (this.waveType) {

      case "sine":
        // Senoidal pura — base de toda síntesis aditiva
        return Math.sin(theta);

      case "square":
        // Onda cuadrada perfecta vía signo de la senoidal
        return Math.sign(Math.sin(theta));

      case "triangle":
        // Onda triangular vía arcoseno de la senoidal (serie de Fourier impar)
        return (2 / Math.PI) * Math.asin(Math.sin(theta));

      case "sawtooth": {
        // Diente de sierra descendente — convención de Web Audio API / Tone.js
        const norm = ((theta / twoPI) % 1 + 1) % 1;
        return 1 - 2 * norm;
      }

      case "pulse": {
        // Onda cuadrada asimétrica: alta durante dutyCycle, baja el resto
        const norm = ((theta / twoPI) % 1 + 1) % 1;
        return norm < this.dutyCycle ? 1 : -1;
      }

      case "fmsine":
        // Síntesis FM: portadora senoidal modulada en frecuencia por otra senoidal
        // Formula: sin(θ + modulationIndex * sin(harmonicity * θ))
        return Math.sin(theta + this.modulationIndex * Math.sin(this.harmonicity * theta));

      case "amsine":
        // Síntesis AM: amplitud de la portadora senoidal moldeada por una moduladora lenta
        // El factor 0.5 + 0.5 * sin(...) mantiene la amplitud en rango 0–1 antes de multiplicar
        return Math.sin(theta) * (0.5 + 0.5 * Math.sin(this.harmonicity * theta));

      case "noise": {
        // Pseudo-ruido basado en función hash — determinístico por (x, bucket de frame)
        // Esto garantiza que el patrón sea consistente en cada frame (sin parpadeo pixel-a-pixel)
        // updateRate controla la velocidad de cambio: white (rápido) → pink → brown (lento)
        const updateRate = this.noiseType === "white" ? 2 : this.noiseType === "pink" ? 6 : 15;
        const frameQ = Math.floor(t * 50 / updateRate);
        const xq     = Math.floor(x / 3);
        const n = Math.sin(xq * 127.1 + frameQ * 311.7) * 43758.5453;
        return (n - Math.floor(n)) * 2 - 1;
      }

      default:
        return Math.sin(theta);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Renderizado (usa funciones globales de p5.js)
  // ══════════════════════════════════════════════════════════════

  /**
   * Dibuja la forma de onda de esta capa sobre el canvas con efecto de brillo fosforescente.
   *
   * Se realizan dos pasadas de dibujo:
   *  1. Halo difuso: trazo grueso y semitransparente con sombra (efecto glow)
   *  2. Línea principal: trazo nítido a resolución completa
   *
   * Usa las funciones globales de p5.js (stroke, beginShape, vertex, etc.)
   * que están disponibles porque p5.js se carga como script global antes de los módulos.
   *
   * @param {number}  centerY    - Centro vertical del canvas en píxeles
   * @param {number}  t          - Tiempo animado (frameCount * 0.02)
   * @param {boolean} isSelected - Si esta capa está seleccionada (trazo ligeramente más grueso)
   */
  drawWave(centerY, t, isSelected) {
    if (this.muted) return; // capa silenciada → no dibujar

    const w      = width;
    const scaleY = this.amplitude * height * 0.10;
    const alpha  = isSelected ? Math.min(this.opacity + 0.15, 1) : this.opacity;

    drawingContext.save();
    drawingContext.globalCompositeOperation = this.blendMode;
    drawingContext.globalAlpha = alpha;
    stroke(this.color);
    strokeWeight(1);
    noFill();
    beginShape();
    for (let x = 0; x < w; x++) {
      vertex(x, centerY + this.sampleWave(x, w, t) * scaleY);
    }
    endShape();
    drawingContext.restore();
  }
}
