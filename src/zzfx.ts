/*
ZzFXMicro - Zuper Zmall Zound Zynth v1.3.2 by Frank Force
https://github.com/KilledByAPixel/ZzFX

MIT License — Copyright (c) 2019 Frank Force
*/

/** Master volume scale. */
export const zzfxV = 0.3;

/** Sample rate. */
export const zzfxR = 44100;

/** Shared audio context — resume on a user gesture before playing. */
export const zzfxX = new AudioContext();

/** Play a sound from ZzFX parameters. */
export function zzfx(...p: (number | undefined)[]): AudioBufferSourceNode {
  return zzfxP(zzfxG(...p));
}

/** Play an array of sample channels (mono SFX or stereo song). */
export function zzfxP(...samples: number[][]): AudioBufferSourceNode {
  const buffer = zzfxX.createBuffer(samples.length, samples[0].length, zzfxR);
  const source = zzfxX.createBufferSource();
  samples.map((d, i) => buffer.getChannelData(i).set(d));
  source.buffer = buffer;
  source.connect(zzfxX.destination);
  source.start();
  return source;
}

/**
 * Build an array of samples from ZzFX parameters.
 * 21 params: volume, randomness, frequency, attack, sustain, release, shape,
 * shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise,
 * modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter.
 */
export function zzfxG(...p: (number | undefined)[]): number[] {
  const sampleRate = zzfxR;
  const PI2 = Math.PI * 2;
  const abs = Math.abs;
  const sign = (v: number): number => (v < 0 ? -1 : 1);

  let volume = p[0] ?? 1;
  const randomness = p[1] ?? 0.05;
  let frequency = p[2] ?? 220;
  let attack = p[3] ?? 0;
  let sustain = p[4] ?? 0;
  let release = p[5] ?? 0.1;
  const shape = p[6] ?? 0;
  const shapeCurve = p[7] ?? 1;
  let slide = p[8] ?? 0;
  let deltaSlide = p[9] ?? 0;
  let pitchJump = p[10] ?? 0;
  let pitchJumpTime = p[11] ?? 0;
  let repeatTime = p[12] ?? 0;
  const noise = p[13] ?? 0;
  let modulation = p[14] ?? 0;
  const bitCrush = p[15] ?? 0;
  let delay = p[16] ?? 0;
  const sustainVolume = p[17] ?? 1;
  let decay = p[18] ?? 0;
  const tremolo = p[19] ?? 0;
  const filter = p[20] ?? 0;

  const startSlide = (slide *= (500 * PI2) / sampleRate / sampleRate);
  let startFrequency = (frequency *=
    (1 + randomness * 2 * Math.random() - randomness) * (PI2 / sampleRate));
  let modOffset = 0;
  let repeat = 0;
  let crush = 0;
  let jump = 1;
  const b: number[] = [];
  let t = 0;
  let i = 0;
  let s = 0;
  let f: number;

  const quality = 2;
  const w = (PI2 * abs(filter) * 2) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / 2 / quality;
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const b0 = (1 + sign(filter) * cos) / 2 / a0;
  const b1 = -(sign(filter) + cos) / a0;
  const b2 = b0;
  let x2 = 0;
  let x1 = 0;
  let y2 = 0;
  let y1 = 0;

  const minAttack = 9;
  attack = attack * sampleRate || minAttack;
  decay *= sampleRate;
  sustain *= sampleRate;
  release *= sampleRate;
  delay *= sampleRate;
  deltaSlide *= (500 * PI2) / sampleRate ** 3;
  modulation *= PI2 / sampleRate;
  pitchJump *= PI2 / sampleRate;
  pitchJumpTime *= sampleRate;
  repeatTime = (repeatTime * sampleRate) | 0;
  volume *= zzfxV;

  for (
    let length = (attack + decay + sustain + release + delay) | 0;
    i < length;
    b[i++] = s * volume
  ) {
    if (!(++crush % ((bitCrush * 100) | 0))) {
      s = shape
        ? shape > 1
          ? shape > 2
            ? shape > 3
              ? shape > 4
                ? (t / PI2) % 1 < shapeCurve / 2
                  ? 1
                  : -1
                : Math.sin(t ** 3)
              : Math.max(Math.min(Math.tan(t), 1), -1)
            : 1 - (((((2 * t) / PI2) % 2) + 2) % 2)
          : 1 - 4 * abs(Math.round(t / PI2) - t / PI2)
        : Math.sin(t);

      s =
        (repeatTime ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) : 1) *
        (shape > 4 ? s : sign(s) * abs(s) ** shapeCurve) *
        (i < attack
          ? i / attack
          : i < attack + decay
            ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
            : i < attack + decay + sustain
              ? sustainVolume
              : i < length - delay
                ? ((length - i - delay) / release) * sustainVolume
                : 0);

      s = delay
        ? s / 2 +
          (delay > i
            ? 0
            : (i < length - delay ? 1 : (length - i) / delay) * (b[(i - delay) | 0] / 2 / volume))
        : s;

      if (filter) {
        s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1);
      }
    }

    f = (frequency += slide += deltaSlide) * Math.cos(modulation * modOffset++);
    t += f + f * noise * Math.sin(i ** 5);

    if (jump && ++jump > pitchJumpTime) {
      frequency += pitchJump;
      startFrequency += pitchJump;
      jump = 0;
    }

    if (repeatTime && !(++repeat % repeatTime)) {
      frequency = startFrequency;
      slide = startSlide;
      jump ||= 1;
    }
  }

  return b;
}
