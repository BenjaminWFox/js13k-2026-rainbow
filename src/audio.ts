import { playSong } from './music';
import { zzfx, zzfxX } from './zzfx';

// Sounds from the ZzFX designer (https://killedbyapixel.github.io/ZzFX/)
// biome-ignore format: keep designer exports on one line
const PIPE = [1.64,,150,,.08,.13,4,2.84,.1,.1,10,,.07,1.7,1,.1,.09,.8,.08];
// biome-ignore format: keep designer exports on one line
const SUCCESS = [.6,,334,.07,1,.16,,.9,,,200,.06,.06,,,,,.64,.24,,297];
// biome-ignore format: keep designer exports on one line
const PICKUP = [.25,,507,,.04,.11,1,,,,250,.04,,,,,,.74,.02,,-1380];
// biome-ignore format: keep designer exports on one line
const EXPLOSION = [.25,,91,.04,.04,.51,5,.1,-2,5,,,,1.9,,.9,,.44,.15];
// biome-ignore format: keep designer exports on one line
const HIT = [.25,,266,.02,.05,.04,,3,-1,,,,,1.2,2.1,,,.88,.07,,1914];
// biome-ignore format: keep designer exports on one line
const HORN = [.1,,172,.01,.04,.16,4,.2,8,,,,,1.5,,.1,,.45,.06];

/** Browsers start AudioContext suspended until a click/key. */
export function unlockAudio(): void {
  if (zzfxX.state !== 'running') {
    void zzfxX.resume();
  }
  playSong();
}

function play(params: (number | undefined)[]): void {
  if (zzfxX.state === 'suspended') {
    void zzfxX.resume().then(() => zzfx(...params));
    return;
  }
  zzfx(...params);
}

/** Pipe laying (cutscene) and pipe-segment destruction. */
export function playPipe(): void {
  play(PIPE);
}

/** Miniboss or final-boss kill. */
export function playSuccess(): void {
  play(SUCCESS);
}

/** Crystal/scrap pickup, and menu move/click. */
export function playPickup(): void {
  play(PICKUP);
}

/** Stomp and magic/nova attacks. */
export function playExplosion(): void {
  play(EXPLOSION);
}

/** An enemy took damage. */
export function playHit(): void {
  play(HIT);
}

/** Horn swing. */
export function playHorn(): void {
  play(HORN);
}
