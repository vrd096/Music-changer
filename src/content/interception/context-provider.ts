let earlyContext: AudioContext | null = null;

export function getOrCreateEarlyContext(): AudioContext {
  if (!earlyContext) {
    try {
      earlyContext = new AudioContext();
    } catch {
      earlyContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    (window as any).___tp_earlyContext = earlyContext;
  }
  return earlyContext;
}

export function getEarlyContext(): AudioContext | null {
  return earlyContext;
}

export function hasEarlyContext(): boolean {
  return earlyContext !== null;
}

export function resetEarlyContext(): void {
  earlyContext = null;
  delete (window as any).___tp_earlyContext;
}
