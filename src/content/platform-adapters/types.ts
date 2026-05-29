export interface PlatformAdapter {
  readonly platform: string;
  canHandle(url: string): boolean;
  findMedia(): HTMLMediaElement | null;
  containsPlayableMedia(): boolean;
}
