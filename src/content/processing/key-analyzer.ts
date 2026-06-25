const MAJOR_PROFILES: Record<string, number[]> = {
  C: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  'C#': [2.88, 6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29],
  D: [2.29, 2.88, 6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66],
  'D#': [3.66, 2.29, 2.88, 6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39],
  E: [2.39, 3.66, 2.29, 2.88, 6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19],
  F: [5.19, 2.39, 3.66, 2.29, 2.88, 6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52],
  'F#': [2.52, 5.19, 2.39, 3.66, 2.29, 2.88, 6.35, 2.23, 3.48, 2.33, 4.38, 4.09],
  G: [4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88, 6.35, 2.23, 3.48, 2.33, 4.38],
  'G#': [4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88, 6.35, 2.23, 3.48, 2.33],
  A: [2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88, 6.35, 2.23, 3.48],
  'A#': [3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88, 6.35, 2.23],
  B: [2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88, 6.35],
};

const MINOR_PROFILES: Record<string, number[]> = {
  C: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  'C#': [3.17, 6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34],
  D: [3.34, 3.17, 6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69],
  'D#': [2.69, 3.34, 3.17, 6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98],
  E: [3.98, 2.69, 3.34, 3.17, 6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75],
  F: [4.75, 3.98, 2.69, 3.34, 3.17, 6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54],
  'F#': [2.54, 4.75, 3.98, 2.69, 3.34, 3.17, 6.33, 2.68, 3.52, 5.38, 2.6, 3.53],
  G: [3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17, 6.33, 2.68, 3.52, 5.38, 2.6],
  'G#': [2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17, 6.33, 2.68, 3.52, 5.38],
  A: [5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17, 6.33, 2.68, 3.52],
  'A#': [3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17, 6.33, 2.68],
  B: [2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17, 6.33],
};

const CAMELOT_MAJOR: Record<string, string> = {
  C: '8B',
  G: '9B',
  D: '10B',
  A: '11B',
  E: '12B',
  B: '1B',
  'F#': '2B',
  'C#': '3B',
  'G#': '4B',
  'D#': '5B',
  'A#': '6B',
  F: '7B',
};

const CAMELOT_MINOR: Record<string, string> = {
  C: '5A',
  G: '6A',
  D: '7A',
  A: '8A',
  E: '9A',
  B: '10A',
  'F#': '11A',
  'C#': '12A',
  'G#': '1A',
  'D#': '2A',
  'A#': '3A',
  F: '4A',
};

export interface KeyResult {
  key: string;
  confidence: number;
}

class FFT {
  private n: number;
  private cosTables: Float64Array[];
  private sinTables: Float64Array[];

  constructor(n: number) {
    if ((n & (n - 1)) !== 0) throw new Error(`FFT size must be power of 2, got ${n}`);
    this.n = n;

    this.cosTables = [];
    this.sinTables = [];
    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1;
      const cosTbl = new Float64Array(halfLen);
      const sinTbl = new Float64Array(halfLen);
      for (let j = 0; j < halfLen; j++) {
        const angle = (Math.PI * j) / halfLen;
        cosTbl[j] = Math.cos(angle);
        sinTbl[j] = -Math.sin(angle);
      }
      this.cosTables.push(cosTbl);
      this.sinTables.push(sinTbl);
    }
  }

  transform(re: Float32Array, im: Float32Array): void {
    const n = this.n;

    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; (j & bit) !== 0; bit >>= 1) {
        j ^= bit;
      }
      j ^= bit;
      if (i < j) {
        let tmp = re[i];
        re[i] = re[j];
        re[j] = tmp;
        tmp = im[i];
        im[i] = im[j];
        im[j] = tmp;
      }
    }

    for (let stage = 0, len = 2; len <= n; stage++, len <<= 1) {
      const halfLen = len >> 1;
      const cosTbl = this.cosTables[stage];
      const sinTbl = this.sinTables[stage];

      for (let i = 0; i < n; i += len) {
        for (let j = 0; j < halfLen; j++) {
          const wr = cosTbl[j];
          const wi = sinTbl[j];
          const k = i + j;

          const tRe = wr * re[k + halfLen] - wi * im[k + halfLen];
          const tIm = wr * im[k + halfLen] + wi * re[k + halfLen];

          re[k + halfLen] = re[k] - tRe;
          im[k + halfLen] = im[k] - tIm;

          re[k] += tRe;
          im[k] += tIm;
        }
      }
    }
  }

  magnitudeSpectrum(re: Float32Array, im: Float32Array, mag: Float32Array): void {
    const halfN = this.n >> 1;
    for (let i = 0; i < halfN; i++) {
      mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    }
  }
}

class Chromagram {
  private fft: FFT;
  private fftSize: number;
  private sampleRate: number;

  private re: Float32Array;
  private im: Float32Array;
  private mag: Float32Array;

  constructor(fftSize: number, sampleRate: number) {
    this.fftSize = fftSize;
    this.sampleRate = sampleRate;
    this.fft = new FFT(fftSize);

    this.re = new Float32Array(fftSize);
    this.im = new Float32Array(fftSize);
    this.mag = new Float32Array(fftSize >> 1);
  }

  compute(data: Float32Array): Float32Array {
    const fftSize = this.fftSize;

    const start = Math.max(0, Math.floor((data.length - fftSize) / 2));
    for (let i = 0; i < fftSize; i++) {
      const windowVal = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
      this.re[i] = data[start + i] * windowVal;
      this.im[i] = 0;
    }

    this.fft.transform(this.re, this.im);
    this.fft.magnitudeSpectrum(this.re, this.im, this.mag);

    const chroma = new Float32Array(12);
    const halfN = fftSize >> 1;

    for (let bin = 1; bin < halfN; bin++) {
      const freq = (bin * this.sampleRate) / fftSize;
      if (freq < 65 || freq > 4000) continue;

      const midiNote = 12 * Math.log2(freq / 440) + 69;
      const pitchClass = Math.round(midiNote) % 12;

      if (pitchClass >= 0 && pitchClass < 12) {
        chroma[pitchClass] += this.mag[bin];
      }
    }

    let maxVal = 0;
    for (let i = 0; i < 12; i++) {
      if (chroma[i] > maxVal) maxVal = chroma[i];
    }
    if (maxVal > 0.001) {
      for (let i = 0; i < 12; i++) {
        chroma[i] /= maxVal;
      }
    }

    return chroma;
  }

  destroy(): void {
    this.re = null!;
    this.im = null!;
    this.mag = null!;
  }
}

function correlate(chroma: Float32Array, profile: number[]): number {
  const n = 12;
  let meanC = 0,
    meanP = 0;
  for (let i = 0; i < n; i++) {
    meanC += chroma[i];
    meanP += profile[i];
  }
  meanC /= n;
  meanP /= n;

  let cov = 0,
    varC = 0,
    varP = 0;
  for (let i = 0; i < n; i++) {
    const dc = chroma[i] - meanC;
    const dp = profile[i] - meanP;
    cov += dc * dp;
    varC += dc * dc;
    varP += dp * dp;
  }

  const denom = Math.sqrt(varC * varP);
  return denom === 0 ? 0 : cov / denom;
}

class KeyDetector {
  private chromagram: Chromagram;

  constructor(fftSize: number, sampleRate: number) {
    this.chromagram = new Chromagram(fftSize, sampleRate);
  }

  detect(data: Float32Array): KeyResult | null {
    const chroma = this.chromagram.compute(data);

    let bestKey = '';
    let bestCorr = -Infinity;
    let bestType: 'major' | 'minor' = 'major';

    for (const [key, profile] of Object.entries(MAJOR_PROFILES)) {
      const corr = correlate(chroma, profile);
      if (corr > bestCorr) {
        bestCorr = corr;
        bestKey = key;
        bestType = 'major';
      }
    }

    for (const [key, profile] of Object.entries(MINOR_PROFILES)) {
      const corr = correlate(chroma, profile);
      if (corr > bestCorr) {
        bestCorr = corr;
        bestKey = key;
        bestType = 'minor';
      }
    }

    if (!bestKey || bestCorr < 0.1) return null;

    const camelot = bestType === 'major' ? CAMELOT_MAJOR[bestKey] : CAMELOT_MINOR[bestKey];
    const keyStr = bestType === 'major' ? `${bestKey} (${camelot})` : `${bestKey}m (${camelot})`;

    return {
      key: keyStr,
      confidence: Math.min(bestCorr / 10, 1),
    };
  }

  destroy(): void {
    this.chromagram.destroy();
  }
}

export type KeyCallback = (result: KeyResult) => void;

export class KeyAnalyzer {
  private detector: KeyDetector;

  private buffer: Float32Array;
  private writeOffset = 0;
  private totalSamples = 0;

  private readonly ANALYSIS_WINDOW: number;
  private readonly ANALYSIS_INTERVAL_MS = 2000;

  private timerId: ReturnType<typeof setTimeout> | null = null;

  private callback: KeyCallback | null = null;

  private readonly CHROMAGRAM_WINDOW_SIZE = 5;
  private chromagramWindow: Float32Array[] = [];

  private displayedKey: string | null = null;

  private addChunkCount = 0;

  constructor(sampleRate: number) {
    this.ANALYSIS_WINDOW = sampleRate;
    this.buffer = new Float32Array(sampleRate * 2);
    this.detector = new KeyDetector(2048, sampleRate);
    console.log(
      '[KeyAnalyzer] constructor: sampleRate=' +
        sampleRate +
        ' ANALYSIS_WINDOW=' +
        this.ANALYSIS_WINDOW,
    );
  }

  setCallback(cb: KeyCallback): void {
    this.callback = cb;
  }

  addChunk(samples: Float32Array): void {
    this.addChunkCount++;
    if (this.addChunkCount <= 3 || this.addChunkCount % 50 === 0) {
      console.log(
        '[KeyAnalyzer] addChunk #' +
          this.addChunkCount +
          ' len=' +
          samples.length +
          ' totalSamples=' +
          this.totalSamples,
      );
    }
    const bufLen = this.buffer.length;

    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writeOffset] = samples[i];
      this.writeOffset = (this.writeOffset + 1) % bufLen;
    }

    this.totalSamples += samples.length;
  }

  start(): void {
    if (this.timerId !== null) return;
    this.tick();
  }

  stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  reset(): void {
    this.buffer.fill(0);
    this.writeOffset = 0;
    this.totalSamples = 0;
    this.displayedKey = null;
    this.chromagramWindow = [];
  }

  private analyzeCount = 0;

  analyzeNow(): void {
    this.analyzeCount++;
    if (this.displayedKey !== null) return;

    if (this.totalSamples < this.ANALYSIS_WINDOW) {
      if (this.analyzeCount <= 5) {
        console.log(
          '[KeyAnalyzer] analyzeNow #' +
            this.analyzeCount +
            ' waiting: totalSamples=' +
            this.totalSamples +
            ' need=' +
            this.ANALYSIS_WINDOW,
        );
      }
      return;
    }
    console.log(
      '[KeyAnalyzer] analyzeNow #' +
        this.analyzeCount +
        ' RUNNING totalSamples=' +
        this.totalSamples +
        ' chromaWindow=' +
        this.chromagramWindow.length,
    );

    const windowData = new Float32Array(this.ANALYSIS_WINDOW);
    const bufLen = this.buffer.length;
    const startOffset = (this.writeOffset - this.ANALYSIS_WINDOW + bufLen) % bufLen;

    for (let i = 0; i < this.ANALYSIS_WINDOW; i++) {
      windowData[i] = this.buffer[(startOffset + i) % bufLen];
    }

    const chroma = this.detector['chromagram'].compute(windowData);

    this.chromagramWindow.push(chroma);
    if (this.chromagramWindow.length > this.CHROMAGRAM_WINDOW_SIZE) {
      this.chromagramWindow.shift();
    }

    if (this.chromagramWindow.length < this.CHROMAGRAM_WINDOW_SIZE) return;

    const meanChroma = new Float32Array(12);
    for (let i = 0; i < 12; i++) {
      let sum = 0;
      for (let j = 0; j < this.chromagramWindow.length; j++) {
        sum += this.chromagramWindow[j][i];
      }
      meanChroma[i] = sum / this.chromagramWindow.length;
    }

    let bestKey = '';
    let bestCorr = -Infinity;
    let bestType: 'major' | 'minor' = 'major';

    for (const [key, profile] of Object.entries(MAJOR_PROFILES)) {
      const corr = correlate(meanChroma, profile);
      if (corr > bestCorr) {
        bestCorr = corr;
        bestKey = key;
        bestType = 'major';
      }
    }
    for (const [key, profile] of Object.entries(MINOR_PROFILES)) {
      const corr = correlate(meanChroma, profile);
      if (corr > bestCorr) {
        bestCorr = corr;
        bestKey = key;
        bestType = 'minor';
      }
    }

    if (!bestKey || bestCorr < 0.1) {
      console.log(
        '[KeyAnalyzer] correlation too low: bestKey=' +
          bestKey +
          ' bestCorr=' +
          bestCorr.toFixed(4),
      );
      return;
    }

    const camelot = bestType === 'major' ? CAMELOT_MAJOR[bestKey] : CAMELOT_MINOR[bestKey];
    const keyStr = bestType === 'major' ? `${bestKey} (${camelot})` : `${bestKey}m (${camelot})`;
    const confidence = Math.min(bestCorr / 10, 1);

    console.log('[KeyAnalyzer] LOCKED at ' + keyStr + ' corr=' + bestCorr.toFixed(4));

    this.displayedKey = keyStr;
    this.callback?.({ key: keyStr, confidence });
  }

  destroy(): void {
    this.stop();
    this.detector.destroy();
    this.callback = null;
    this.chromagramWindow = [];
    this.displayedKey = null;
  }

  private tick(): void {
    this.analyzeNow();
    this.timerId = setTimeout(() => this.tick(), this.ANALYSIS_INTERVAL_MS);
  }
}
