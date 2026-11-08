export class SeededNoise {
  private p: Uint8Array = new Uint8Array(512);

  constructor(seed = 1337) {
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    let s = seed >>> 0;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      const tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.p[i] = perm[i & 255];
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad2(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) !== 0 ? -u : u) + ((h & 2) !== 0 ? -2.0 * v : 2.0 * v);
  }

  public noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const A = this.p[X] + Y;
    const B = this.p[X + 1] + Y;

    const res = this.lerp(
      v,
      this.lerp(u, this.grad2(this.p[A], x, y), this.grad2(this.p[B], x - 1, y)),
      this.lerp(u, this.grad2(this.p[A + 1], x, y - 1), this.grad2(this.p[B + 1], x - 1, y - 1))
    );
    return res * 0.45; // normalized roughly to [-1, 1]
  }

  public fbm2D(x: number, y: number, octaves = 3): number {
    let total = 0;
    let freq = 1;
    let amp = 1;
    let maxVal = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * freq, y * freq) * amp;
      maxVal += amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    return total / maxVal;
  }

  public hash3(x: number, y: number, z: number): number {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647) ^ 0x5bf03635;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
}
