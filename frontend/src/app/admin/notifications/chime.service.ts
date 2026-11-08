import { Injectable } from '@angular/core';

/** Volumen moderado: el aviso suena en una oficina o en la cocina, no debe sobresaltar. */
const VOLUME = 0.15;
const ATTACK_SECONDS = 0.02;
const TONE_SECONDS = 0.2;

/** Frecuencia (Hz) y retraso (s) de cada tono; el aviso entero dura menos de 0,5 s. */
const TONES: readonly { frequency: number; delay: number }[] = [
  { frequency: 880, delay: 0 },
  { frequency: 1175, delay: 0.18 },
];

/**
 * Sonido corto del aviso (dos tonos), generado con Web Audio: no hay fichero de audio ni licencia que anotar.
 *
 * Los navegadores bloquean el audio hasta que el usuario hace algo en la página: `unlock()` crea o reanuda el
 * contexto y debe llamarse desde un gesto (clic, tecla). Antes de eso, o si el navegador no tiene Web Audio, `play()`
 * no hace nada y no falla: un aviso sin sonido sigue siendo un aviso.
 */
@Injectable({ providedIn: 'root' })
export class Chime {
  private context: AudioContext | null = null;

  /** Crea el contexto de audio la primera vez y lo reanuda si el navegador lo dejó en pausa. */
  unlock(): void {
    try {
      this.context ??= this.create();
      if (this.context?.state === 'suspended') {
        this.context.resume().catch(() => undefined);
      }
    } catch {
      // Sin audio disponible: el aviso queda en silencio.
    }
  }

  play(): void {
    const context = this.context;
    if (context?.state !== 'running') {
      return;
    }
    try {
      const start = context.currentTime;
      for (const tone of TONES) {
        this.tone(context, tone.frequency, start + tone.delay);
      }
    } catch {
      // Un fallo del audio nunca debe romper la consulta de avisos.
    }
  }

  private create(): AudioContext | null {
    const Context: typeof AudioContext | undefined = globalThis.AudioContext;
    return Context ? new Context() : null;
  }

  /** Un tono que sube en un instante y se apaga, para que no suene a pitido cortado. */
  private tone(context: AudioContext, frequency: number, start: number): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(VOLUME, start + ATTACK_SECONDS);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + TONE_SECONDS);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + TONE_SECONDS);
  }
}
