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
      await audioCtx.audioWorklet.addModule(scriptPath + 'bungee-processor.js');
      return new AudioWorkletNode(audioCtx, 'bungee-processor');
    } catch (err) {
      runtimeLog.error('CONTENT', 'Failed to set up Bungee processor node', err);
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
      // Bungee uses port.postMessage for parameters
      if (params.semitone !== undefined) {
        input.port.postMessage({ type: 'setPitch', value: params.semitone });
      }
      const paramMap = input.parameters;
      const setParam = (name: string, value: number | boolean | undefined) => {
        if (value === undefined) return;
        const param = paramMap.get(name);
        if (param) param.value = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      };
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
