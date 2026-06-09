export interface AudioEngineState {
  speed: number;
  semitone: number;
  pitch: number;
  formant: number;
  loopMode: 'off' | 'loop' | 'loop-one';
  varispeed: boolean;
  eqEnabled: boolean;
}

export interface InterceptionResult {
  success: boolean;
  strategy: 0 | 1 | 2 | 3 | 4 | 5;
  sourceNode?: AudioNode;
  reason?: string;
  nextLevel?: number;
}

export interface InterceptionStrategy {
  readonly level: number;
  readonly name: string;
  detect(el: HTMLMediaElement): Promise<InterceptionResult>;
}

export type MediaElementCallback = (el: HTMLMediaElement) => void;

export interface MediaDetector {
  start(): void;
  stop(): void;
  onElement(cb: MediaElementCallback): void;
}
