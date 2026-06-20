import { AudioEngine } from './audio-engine';

let engine: AudioEngine | null = null;

async function handleMessage(message: any): Promise<void> {
  switch (message.type) {
    case 'STREAM_ID': {
      const { streamId } = message.payload as { streamId: string };

      if (engine) {
        await engine.destroy();
        engine = null;
      }
      engine = new AudioEngine();
      await engine.init(streamId);
      break;
    }

    case 'KILL_AUDIO': {
      if (engine) {
        await engine.destroy();
        engine = null;
      }
      break;
    }

    case 'GET_STATE': {
      const state = engine?.getState() ?? { isCapturing: false, bpm: null, key: null };
      chrome.runtime
        .sendMessage({
          type: 'STATE_UPDATE',
          payload: {
            isCapturing: state.isCapturing,
            metrics: { bpm: state.bpm, key: state.key },
          },
        })
        .catch(() => {});
      break;
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).catch(console.error);
  sendResponse({ received: true });
  return true;
});

window.addEventListener('beforeunload', () => {
  if (engine) {
    engine.destroy().catch(console.error);
    engine = null;
  }
});

console.log('[Offscreen] Document loaded and ready');
