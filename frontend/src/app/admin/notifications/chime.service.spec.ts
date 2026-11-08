import { TestBed } from '@angular/core/testing';
import { Chime } from './chime.service';

/** Doble mínimo de `AudioContext`: anota los osciladores y los nodos de volumen que se crean. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'suspended' | 'running' = 'suspended';
  currentTime = 1;
  destination = {};
  readonly oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
  }

  createOscillator() {
    const oscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn(), value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }
}

describe('Chime', () => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('staysSilentBeforeAnyGesture', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);

    TestBed.inject(Chime).play();

    // Los navegadores bloquean el audio sin gesto: ni siquiera se crea el contexto.
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('playsTwoShortTonesAfterUnlock', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const chime = TestBed.inject(Chime);

    chime.unlock();
    await Promise.resolve();
    chime.play();

    const context = FakeAudioContext.instances[0];
    expect(context.resume).toHaveBeenCalled();
    expect(context.oscillators).toHaveLength(2);
    for (const oscillator of context.oscillators) {
      expect(oscillator.start).toHaveBeenCalledTimes(1);
      const end = oscillator.stop.mock.calls[0][0] as number;
      expect(end - context.currentTime).toBeLessThan(0.5);
    }
  });

  it('unlockingTwiceReusesTheContext', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const chime = TestBed.inject(Chime);

    chime.unlock();
    chime.unlock();

    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('staysSilentWithoutWebAudio', () => {
    vi.stubGlobal('AudioContext', undefined);
    const chime = TestBed.inject(Chime);

    expect(() => {
      chime.unlock();
      chime.play();
    }).not.toThrow();
  });

  it('staysSilentWhenTheContextFails', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('NotAllowedError');
        }
      },
    );
    const chime = TestBed.inject(Chime);

    expect(() => {
      chime.unlock();
      chime.play();
    }).not.toThrow();
  });
});
