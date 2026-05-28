import { runtimeLog } from '../shared/runtime-logger';

export interface ProcessorParams {
  pitch?: number;
  semitone?: number;
  formant?: number;
  reducerAmount?: number;
  reducerFocus?: number;
  reducerAggressiveness?: number;
  reducerStereoBias?: number;
  reducerLowHz?: number;
  reducerHighHz?: number;
  enabled?: boolean;
}

export class TransposeProcessorNode {
  input: AudioWorkletNode | null = null;
  context: AudioContext;
  ready: Promise<void>;
  private resolveReady!: () => void;
  private algo: 'rb' | 'st';
  private scriptPath: string;
  private license?: string;
  private licenseCheckSum?: string | null;
  private appCheckSum: number;
  private appKey: number;

  constructor(
    scriptPath: string,
    ctx: AudioContext,
    algo: 'rb' | 'st',
    license: string | undefined,
    licenseCheckSum: string | null | undefined,
    appCheckSum: number,
    appKey: number,
    destination: AudioNode,
  ) {
    this.scriptPath = scriptPath;
    this.context = ctx;
    this.algo = algo;
    this.license = license;
    this.licenseCheckSum = licenseCheckSum;
    this.appCheckSum = appCheckSum;
    this.appKey = appKey;
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.setupProcessorNode(ctx)
      .then((node) => {
        if (node) {
          this.input = node;
          const readyParam = node.parameters.get('ready');
          if (readyParam && readyParam.value === 1) this.resolveReady();
          try {
            node.port.onmessage = (evt: MessageEvent) => {
              if (evt?.data?.type === 'ready') this.resolveReady();
            };
            node.port.start?.();
          } catch {}
          destination ? node.connect(destination) : node.connect(ctx.destination);
        }
      })
      .catch((err) => {
        runtimeLog.error('CONTENT', 'Error setting up transpose processor', err);
      });
  }

  private async setupProcessorNode(ctx: AudioContext): Promise<AudioWorkletNode | null> {
    try {
      if (this.algo === 'st') {
        await ctx.audioWorklet.addModule(this.scriptPath + 'aw-st-processor.js');
        return new AudioWorkletNode(ctx, 'aw-st-processor', {
          processorOptions: { key: this.appKey, checksum: this.appCheckSum },
        });
      } else {
        const wasmBytes = await fetch(this.scriptPath + 'rb.wasm').then((r) => r.arrayBuffer());
        if (!wasmBytes.byteLength) throw new Error('WASM bytes empty');
        await ctx.audioWorklet.addModule(this.scriptPath + 'aw-tp-processor.js');
        return new AudioWorkletNode(ctx, 'aw-tp-processor', {
          processorOptions: { wasmBytes, license: this.license, checksum: this.licenseCheckSum },
        });
      }
    } catch (err) {
      runtimeLog.error('CONTENT', 'Failed to set up the transpose processor node', err);
      return null;
    }
  }

  disconnect(): void {
    if (this.input) this.input.disconnect();
  }
  stop(): void {
    this.disconnect();
  }

  setParams(params: ProcessorParams): void {
    if (!this.input) return;
    const paramMap = this.input.parameters;
    const setParam = (name: string, value: number | boolean | undefined): void => {
      if (value === undefined) return;
      const p = paramMap.get(name);
      if (p) p.value = typeof value === 'boolean' ? (value ? 1 : 0) : value;
    };
    setParam('pitch', params.pitch);
    setParam('semitone', params.semitone);
    setParam('formant', (params.formant ?? 0) + 1);
    setParam('vr_amount', params.reducerAmount);
    setParam('vr_focus', params.reducerFocus);
    setParam('vr_aggressiveness', params.reducerAggressiveness);
    setParam('vr_stereoBias', params.reducerStereoBias);
    setParam('vr_lowHz', params.reducerLowHz);
    setParam('vr_highHz', params.reducerHighHz);
    setParam('enabled', params.enabled);
  }
}
