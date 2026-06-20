import { RealTimeBpmAnalyzer } from 'realtime-bpm-analyzer';
import type { BpmCandidates } from 'realtime-bpm-analyzer';

export interface BpmResult {
  bpm: number;
  confidence: number;
}

export type BpmCallback = (result: BpmResult) => void;

export class BpmAnalyzer {
  private analyzer: RealTimeBpmAnalyzer;
  private sampleRate: number;

  private buffer: Float32Array;
  private readonly BUFFER_SIZE = 4096;
  private bufferOffset = 0;

  private analysisChain: Promise<void> = Promise.resolve();

  private callback: BpmCallback | null = null;

  private readonly WINDOW_SIZE = 50;
  private readonly MIN_VALUES_FOR_SHOW = 35;
  private readonly MAX_STDDEV: number;

  private valueWindow: number[] = [];
  private displayedBpm: number | null = null;

  private addChunkCount = 0;
  private analyzeChunkCount = 0;

  constructor(sampleRate: number, maxStddev?: number) {
    this.sampleRate = sampleRate;
    this.MAX_STDDEV = maxStddev ?? 6.0;
    this.buffer = new Float32Array(this.BUFFER_SIZE);

    console.log(
      '[BpmAnalyzer] constructor: sampleRate=' + sampleRate + ', BUFFER_SIZE=' + this.BUFFER_SIZE,
    );

    this.analyzer = new RealTimeBpmAnalyzer({
      continuousAnalysis: true,
      stabilizationTime: 60000,
      muteTimeInIndexes: 5000,
      debug: false,
    });
    console.log('[BpmAnalyzer] RealTimeBpmAnalyzer created');
  }

  setCallback(cb: BpmCallback): void {
    this.callback = cb;
  }

  addChunk(samples: Float32Array): void {
    this.addChunkCount++;
    if (this.addChunkCount <= 3 || this.addChunkCount % 50 === 0) {
      console.log(
        '[BpmAnalyzer] addChunk #' + this.addChunkCount,
        'len=' + samples.length + ' bufOffset=' + this.bufferOffset,
      );
    }
    let offset = 0;
    while (offset < samples.length) {
      const remaining = this.BUFFER_SIZE - this.bufferOffset;
      const toCopy = Math.min(remaining, samples.length - offset);
      this.buffer.set(samples.subarray(offset, offset + toCopy), this.bufferOffset);
      this.bufferOffset += toCopy;
      offset += toCopy;

      if (this.bufferOffset >= this.BUFFER_SIZE) {
        const data = new Float32Array(this.buffer);
        this.bufferOffset = 0;
        this.analysisChain = this.analysisChain.then(() => this.analyzeChunk(data));
      }
    }
  }

  start(): void {
    // nothing to do
  }

  stop(): void {
    // nothing to do
  }

  reset(): void {
    this.analyzer.reset();
    this.buffer.fill(0);
    this.bufferOffset = 0;
    this.displayedBpm = null;
    this.valueWindow = [];
    this.analysisChain = Promise.resolve();
  }

  resetSoft(): void {
    this.analyzer.reset();
    this.buffer.fill(0);
    this.bufferOffset = 0;
    this.valueWindow = [];
    this.analysisChain = Promise.resolve();
  }

  isLocked(): boolean {
    return this.displayedBpm !== null;
  }

  destroy(): void {
    this.callback = null;
    this.reset();
  }

  private async analyzeChunk(data: Float32Array): Promise<void> {
    this.analyzeChunkCount++;
    if (this.analyzeChunkCount <= 3 || this.analyzeChunkCount % 20 === 0) {
      console.log(
        '[BpmAnalyzer] analyzeChunk #' + this.analyzeChunkCount + ' sampleRate=' + this.sampleRate,
      );
    }
    try {
      await this.analyzer.analyzeChunk({
        audioSampleRate: this.sampleRate,
        channelData: data,
        bufferSize: this.BUFFER_SIZE,
        postMessage: (msg) => {
          if (msg.type === 'bpm' || msg.type === 'bpmStable') {
            this.handleResult(msg.data);
          }
        },
      });
    } catch (err) {
      console.warn('[BpmAnalyzer] analyzeChunk error:', err);
    }
  }

  private pickBestBpm(candidates: BpmCandidates): number | null {
    if (!candidates.bpm || candidates.bpm.length === 0) return null;

    const valid = candidates.bpm.filter(
      (c) => c.tempo >= 30 && c.tempo <= 300 && (c.count ?? 0) >= 1,
    );

    if (valid.length === 0) return null;

    const top = valid[0];
    const topCount = top.count ?? 0;

    for (let i = 1; i < valid.length; i++) {
      const cand = valid[i];
      const candCount = cand.count ?? 0;

      if (candCount < topCount * 0.5) break;

      const ratio = cand.tempo / top.tempo;

      if (ratio > 1.4 && ratio < 1.56) {
        return cand.tempo;
      }

      if (ratio > 1.9 && ratio < 2.1) {
        return top.tempo;
      }
    }

    return top.tempo;
  }

  private handleResult(candidates: BpmCandidates): void {
    console.log(
      '[BpmAnalyzer] handleResult called, displayedBpm=' +
        this.displayedBpm +
        ' windowLen=' +
        this.valueWindow.length +
        ' candidates=' +
        (candidates.bpm ? candidates.bpm.length : 0),
    );

    if (this.displayedBpm !== null) return;

    const rawBpm = this.pickBestBpm(candidates);
    console.log('[BpmAnalyzer] pickBestBpm returned:', rawBpm);
    if (rawBpm === null) return;

    this.valueWindow.push(rawBpm);
    if (this.valueWindow.length > this.WINDOW_SIZE) {
      this.valueWindow.shift();
    }

    console.log(
      '[BpmAnalyzer] window=' +
        this.valueWindow.length +
        '/' +
        this.MIN_VALUES_FOR_SHOW +
        ' raw=' +
        rawBpm,
    );

    if (this.valueWindow.length < this.MIN_VALUES_FOR_SHOW) return;

    const sorted = [...this.valueWindow].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length;
    const stddev = Math.sqrt(variance);

    console.log(
      '[BpmAnalyzer] median=' +
        median +
        ' stddev=' +
        stddev.toFixed(2) +
        ' threshold=' +
        this.MAX_STDDEV,
    );

    if (stddev >= this.MAX_STDDEV) return;

    this.displayedBpm = Math.round(median * 10) / 10;

    console.log('[BpmAnalyzer] LOCKED at ' + this.displayedBpm + ' BPM, calling callback');

    this.callback?.({
      bpm: this.displayedBpm,
      confidence: 1,
    });
  }
}
