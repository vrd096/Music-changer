import { BpmAnalyzer, type BpmResult } from '../content/processing/bpm-analyzer';
import { KeyAnalyzer, type KeyResult } from '../content/processing/key-analyzer';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private captureNode: AudioWorkletNode | null = null;
  private bpmAnalyzer: BpmAnalyzer | null = null;
  private keyAnalyzer: KeyAnalyzer | null = null;

  private isRunning = false;
  private mediaStream: MediaStream | null = null;

  private lastBpm: number | null = null;
  private lastKey: string | null = null;

  private static readonly SILENCE_THRESHOLD = 0.0005;
  private static readonly SILENCE_CHUNKS_REQUIRED = 13;

  private silentChunkCount = 0;
  private wasSilent = false;

  async init(streamId: string): Promise<void> {
    if (this.isRunning) {
      await this.destroy();
    }

    this.silentChunkCount = 0;
    this.wasSilent = false;

    try {
      this.ctx = new AudioContext({
        sampleRate: 44100,
        latencyHint: 'interactive',
      });

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
        const pollStart = Date.now();
        while ((this.ctx!.state as string) !== 'running' && Date.now() - pollStart < 1000) {
          await new Promise((r) => setTimeout(r, 50));
          if (this.ctx!.state === 'suspended') {
            await this.ctx!.resume().catch(() => {});
          }
        }
      }

      if (!this.ctx || this.ctx.state !== 'running') {
        console.warn(`[OffscreenAE] AudioContext state: ${this.ctx?.state}`);
      }

      await this.ctx.audioWorklet.addModule('/capture-processor.js');

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // @ts-expect-error Chrome-specific constraints
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId,
          },
        },
        video: false,
      });

      this.sourceNode = this.ctx.createMediaStreamSource(this.mediaStream);

      this.captureNode = new AudioWorkletNode(this.ctx, 'capture-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
      });

      this.sourceNode.connect(this.captureNode);

      this.bpmAnalyzer = new BpmAnalyzer(this.ctx.sampleRate, 1.5);
      this.bpmAnalyzer.setCallback((result) => this.handleBpmResult(result));
      this.bpmAnalyzer.start();

      this.keyAnalyzer = new KeyAnalyzer(this.ctx.sampleRate);
      this.keyAnalyzer.setCallback((result) => this.handleKeyResult(result));
      this.keyAnalyzer.start();

      this.captureNode.port.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'audio' && event.data.samples instanceof Float32Array) {
          this.detectSilence(event.data.samples);
          this.bpmAnalyzer?.addChunk(event.data.samples);
          this.keyAnalyzer?.addChunk(event.data.samples);
        }
      };

      this.isRunning = true;

      this.sendMetricsUpdate({ bpm: null, key: null, isCapturing: true });

      console.log('[OffscreenAE] Audio engine initialized');
    } catch (error) {
      console.error('[OffscreenAE] Init failed:', error);
    }
  }

  private detectSilence(samples: Float32Array): void {
    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / samples.length);

    if (rms < AudioEngine.SILENCE_THRESHOLD) {
      this.silentChunkCount++;
      if (this.silentChunkCount >= AudioEngine.SILENCE_CHUNKS_REQUIRED && !this.wasSilent) {
        this.wasSilent = true;
        this.resetAnalyzers();
      }
    } else {
      this.silentChunkCount = 0;
      this.wasSilent = false;
    }
  }

  private resetAnalyzers(): void {
    this.bpmAnalyzer?.reset();
    this.keyAnalyzer?.reset();
    this.lastBpm = null;
    this.lastKey = null;
    this.sendMetricsUpdate({ bpm: null, key: null, isCapturing: true });
  }

  private handleBpmResult(result: BpmResult): void {
    this.lastBpm = result.bpm;
    this.sendMetricsUpdate({ bpm: this.lastBpm, key: this.lastKey, isCapturing: true });
  }

  private handleKeyResult(result: KeyResult): void {
    this.lastKey = result.key;
    this.sendMetricsUpdate({ bpm: this.lastBpm, key: this.lastKey, isCapturing: true });
  }

  private sendMetricsUpdate(metrics: {
    bpm: number | null;
    key: string | null;
    isCapturing: boolean;
  }): void {
    chrome.runtime
      .sendMessage({
        type: 'METRICS_UPDATE',
        payload: metrics,
      })
      .catch(() => {});
  }

  getState(): {
    isCapturing: boolean;
    bpm: number | null;
    key: string | null;
  } {
    return {
      isCapturing: this.isRunning,
      bpm: this.lastBpm,
      key: this.lastKey,
    };
  }

  async destroy(): Promise<void> {
    this.isRunning = false;

    this.keyAnalyzer?.stop();
    this.keyAnalyzer?.destroy();
    this.keyAnalyzer = null;

    this.bpmAnalyzer?.destroy();
    this.bpmAnalyzer = null;

    this.captureNode?.disconnect();
    this.captureNode = null;

    this.sourceNode?.disconnect();
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.ctx && this.ctx.state !== 'closed') {
      await this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}
