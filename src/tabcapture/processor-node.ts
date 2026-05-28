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

export interface ProcessorNode {
  input: AudioWorkletNode | null;
  ready: Promise<void>;
  disconnect(): void;
  stop(): void;
  setParams(params: ProcessorParams): void;
}

export function createProcessorNode(
  scriptPath: string,
  ctx: AudioContext,
  algo: 'rb' | 'st',
  license: string | undefined,
  licenseCheckSum: string | null | undefined,
  appCheckSum: number,
  appKey: number,
  destination: AudioNode,
): ProcessorNode {
  let input: AudioWorkletNode | null = null;
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  async function setupProcessorNode(audioCtx: AudioContext): Promise<AudioWorkletNode | null> {
    try {
      if (algo === 'st') {
        await audioCtx.audioWorklet.addModule(scriptPath + 'aw-st-processor.js');
        return new AudioWorkletNode(audioCtx, 'aw-st-processor', {
          processorOptions: { key: appKey, checksum: appCheckSum },
        });
      } else {
        const wasmBytes = await fetch(scriptPath + 'rb.wasm').then((r) => r.arrayBuffer());
        if (!wasmBytes.byteLength) throw new Error('WASM bytes empty');
        await audioCtx.audioWorklet.addModule(scriptPath + 'aw-tp-processor.js');
        return new AudioWorkletNode(audioCtx, 'aw-tp-processor', {
          processorOptions: { wasmBytes, license, checksum: licenseCheckSum },
        });
      }
    } catch (err) {
      runtimeLog.error('CONTENT', 'Failed to set up the transpose processor node', err);
      return null;
    }
  }

  setupProcessorNode(ctx)
    .then((node) => {
      if (node) {
        input = node;
        const readyParam = node.parameters.get('ready');
        if (readyParam && readyParam.value === 1) resolveReady();
        try {
          node.port.onmessage = (evt: MessageEvent) => {
            if (evt?.data?.type === 'ready') resolveReady();
          };
          node.port.start?.();
        } catch {}
        destination ? node.connect(destination) : node.connect(ctx.destination);
      }
    })
    .catch((err) => {
      runtimeLog.error('CONTENT', 'Error setting up transpose processor', err);
    });

  return {
    input,
    ready,
    disconnect() {
      if (input) input.disconnect();
    },
    stop() {
      this.disconnect();
    },
    setParams(params: ProcessorParams) {
      if (!input) return;
      const paramMap = input.parameters;
      const setParam = (name: string, value: number | boolean | undefined) => {
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
    },
  };
}
