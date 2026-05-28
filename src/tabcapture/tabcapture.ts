// ============================================================
// Tab capture page - audio processing with WASM/AudioWorklet
// ============================================================

import { runtimeLog } from '../shared/runtime-logger';
import { createEqChain, applyEqBands, type EqBand } from './eq-chain';

const APP_KEY = 3470712367;

interface AudioSettings {
  pro: boolean;
  license?: string;
  licenseCheckSum?: string | null;
  audioProcessorEnabled: boolean;
  appCheckSum: number;
}

interface ProcessorParams {
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

interface TabCaptureCommand {
  command: string;
  tabId?: number;
  pro?: boolean;
  license?: string;
  licenseCheckSum?: string | null;
  audioProcessorEnabled?: boolean;
  appCheckSum?: number;
  pitch?: number;
  semitone?: number;
  formant?: number;
  reducerAmount?: number;
  reducerFocus?: number;
  reducerAggressiveness?: number;
  reducerStereoBias?: number;
  reducerLowHz?: number;
  reducerHighHz?: number;
  eqBands?: EqBand[];
  eqEnabled?: boolean;
  hasConnectionStatusError?: boolean;
  error?: string;
  connectionStatusMessage?: string;
}

/** Custom audio processor node wrapper */
interface ProcessorNodeWrapper {
  input: AudioWorkletNode | null;
  ready: Promise<void>;
  disconnect(): void;
  stop(): void;
  setParams(params: ProcessorParams): void;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let processorNode: ProcessorNodeWrapper | null = null;
let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let eqFilters: BiquadFilterNode[] = [];
let tabId: number | undefined;
let isCapturing = false;
let initPromise: Promise<void> | undefined;
let initError: string | undefined;
let tabUpdateListener: ((tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => void) | undefined;

const settings: AudioSettings = {
  pro: true,
  license: undefined,
  licenseCheckSum: null,
  audioProcessorEnabled: true,
  appCheckSum: 0,
};

// ---------------------------------------------------------------------------
// URL params
// ---------------------------------------------------------------------------
const urlParams = new URLSearchParams(window.location.search);
const requestedTabId = Number(urlParams.get('tabId'));
const requestedWindowId = Number(urlParams.get('windowId'));
const streamId = urlParams.get('streamId') || undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Serialize an error/object safely */
function serializeError(e: unknown): unknown {
  if (e == null) return e;
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: e.stack };
  }
  if (typeof e === 'object') {
    try {
      return JSON.parse(JSON.stringify(e));
    } catch {
      return String(e);
    }
  }
  return String(e);
}

/** Format a user-friendly error message */
function formatErrorMessage(msg: string): string {
  const trimmed = (msg || 'Tab capture failed').trim();
  const lower = trimmed.toLowerCase();
  if (lower.includes('extension has not been invoked for the current page')) {
    return 'Tab capture failed: click Use Tabcapture again from the popup while the target tab is active.';
  }
  if (lower.includes('chrome pages cannot be captured')) {
    return 'Tab capture failed: Chrome internal pages cannot be captured.';
  }
  return trimmed;
}

/** Log error to runtime log and send to service worker */
async function logTabCaptureError(details: unknown, message?: string): Promise<void> {
  runtimeLog.error('tabcapture', 'tabcapture-error', {
    details,
    helperTabUrl: window.location.href,
    requestedTabId: Number.isFinite(requestedTabId) ? requestedTabId : undefined,
    requestedWindowId: Number.isFinite(requestedWindowId) ? requestedWindowId : undefined,
    tabId,
  });
  try {
    chrome.runtime.sendMessage({
      type: 'logger-error',
      entry: {
        lvl: 'error',
        scope: 'tabcapture',
        event: 'tabcapture-error',
        msg: typeof message === 'string' ? message : undefined,
        ctx: details,
      },
      pageUrl: window.location.href,
    });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Error event listeners
// ---------------------------------------------------------------------------
window.addEventListener('error', (evt: ErrorEvent) => {
  const errInfo = {
    message: evt.message,
    filename: evt.filename,
    lineno: evt.lineno,
    colno: evt.colno,
    error: serializeError(evt.error),
  };
  logTabCaptureError(errInfo, evt.message);
});

window.addEventListener('unhandledrejection', (evt: PromiseRejectionEvent) => {
  const errInfo = { reason: serializeError(evt.reason) };
  logTabCaptureError(errInfo, 'Unhandled rejection');
});

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

/** Send a message to the service worker */
function sendToServiceWorker(msg: Record<string, unknown>): void {
  msg.sender = 'tabcapture-tab';
  msg.tabId = tabId;
  chrome.runtime.sendMessage(msg, () => {
    // Suppress lastError if receiver closed
    void chrome.runtime.lastError;
  });
}

// ---------------------------------------------------------------------------
// Audio processing
/** Apply EQ band settings (wrapper using module-level state) */
function applyLocalEqBands(eqBands: EqBand[] | undefined, eqEnabled: boolean | undefined): void {
  if (!settings.pro) return;

  if (!eqFilters.length && audioContext) {
    eqFilters = createEqChain(audioContext);
    if (processorNode?.input && eqFilters.length) {
      try {
        processorNode.input.disconnect(audioContext.destination);
        processorNode.input.connect(eqFilters[0]);
      } catch {
        // ignore
      }
    }
  }

  if (eqFilters.length && eqBands && audioContext) {
    for (let i = 0; i < eqFilters.length && i < eqBands.length; i++) {
      const filter = eqFilters[i];
      const band = eqBands[i];
      if (filter.type !== band.type) filter.type = band.type;
      if (filter.frequency.value !== band.frequency) filter.frequency.value = band.frequency;
      if (filter.Q.value !== band.Q) filter.Q.value = band.Q;

      const isPeakingOrShelving =
        band.type === 'peaking' || band.type === 'lowshelf' || band.type === 'highshelf';
      const gainVal = !isPeakingOrShelving || eqEnabled === false ? 0 : band.gain;
      if (filter.gain.value !== gainVal) filter.gain.value = gainVal;
    }
  }
}

// ---------------------------------------------------------------------------
// Audio processor node (WASM / SoundTouch)
// ---------------------------------------------------------------------------

class TransposeProcessorNode {
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
          // Check if ready parameter is already 1
          const readyParam = node.parameters.get('ready');
          if (readyParam && readyParam.value === 1) {
            this.resolveReady();
          }
          // Listen for ready message
          try {
            node.port.onmessage = (evt: MessageEvent) => {
              if (evt?.data?.type === 'ready') {
                this.resolveReady();
              }
            };
            node.port.start?.();
          } catch {
            // ignore
          }
          // Connect to destination
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
        // SoundTouch processor
        const moduleUrl = this.scriptPath + 'aw-st-processor.js';
        const processorName = 'aw-st-processor';
        await ctx.audioWorklet.addModule(moduleUrl);
        return new AudioWorkletNode(ctx, processorName, {
          processorOptions: {
            key: this.appKey,
            checksum: this.appCheckSum,
          },
        });
      } else {
        // Rubber Band processor (WASM)
        const moduleUrl = this.scriptPath + 'aw-tp-processor.js';
        const processorName = 'aw-tp-processor';
        const wasmUrl = this.scriptPath + 'rb.wasm';
        const wasmBytes = await fetch(wasmUrl).then((r) => r.arrayBuffer());
        // Ensure wasm loaded
        if (!wasmBytes.byteLength) {
          throw new Error('WASM bytes empty');
        }
        await ctx.audioWorklet.addModule(moduleUrl);
        return new AudioWorkletNode(ctx, processorName, {
          processorOptions: {
            wasmBytes,
            license: this.license,
            checksum: this.licenseCheckSum,
          },
        });
      }
    } catch (err) {
      runtimeLog.error('CONTENT', 'Failed to set up the transpose processor node', err);
      return null;
    }
  }

  disconnect(): void {
    if (this.input) {
      this.input.disconnect();
    }
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
      if (p) {
        p.value = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      }
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

// ---------------------------------------------------------------------------
// Capture initialization
// ---------------------------------------------------------------------------

async function initCapture(): Promise<void> {
  if (initPromise) await initPromise;
  else {
    initPromise = (async () => {
      try {
        // Get media stream
        const stream = await new Promise<MediaStream | null>(async (resolve) => {
          if (streamId) {
            try {
              const s = await navigator.mediaDevices.getUserMedia({
                audio: {
                  mandatory: {
                    chromeMediaSource: 'tab' as any,
                    chromeMediaSourceId: streamId,
                  },
                } as any,
                video: false,
              });
              return resolve(s || null);
            } catch (err: any) {
              const errMsg = formatErrorMessage(err?.message || String(err));
              initError = errMsg;
              logTabCaptureError({ error: errMsg, tabId, details: serializeError(err) }, errMsg);
              return resolve(null);
            }
          }
          const noStreamMsg = formatErrorMessage(
            'Tab capture failed: open popup on the target tab and click Use tab capture again.',
          );
          initError = noStreamMsg;
          logTabCaptureError({ tabId }, noStreamMsg);
          resolve(null);
        });

        if (!stream) {
          const lastErrMsg = chrome.runtime.lastError?.message;
          const errMsg =
            initError || (lastErrMsg ? formatErrorMessage(lastErrMsg) : 'Tab capture failed');
          runtimeLog.error('tabcapture', 'tabCapture error', errMsg);
          await logTabCaptureError({ errorMessage: errMsg, tabId }, errMsg);
          sendToServiceWorker({
            tabId,
            hasConnectionStatusError: true,
            error: errMsg,
            connectionStatusMessage: errMsg,
          } as any);
          return;
        }

        // Listen for stream inactivity
        stream.addEventListener('inactive', () => {
          window.close();
        });

        mediaStream = stream;
        audioContext = new AudioContext();
        sourceNode = audioContext.createMediaStreamSource(stream);

        const scriptPath = chrome.runtime.getURL('');

        // Create EQ chain for pro mode
        if (settings.pro) {
          eqFilters = createEqChain(audioContext);
        }

        const destination = eqFilters.length > 0 ? eqFilters[0] : audioContext.destination;

        processorNode = new TransposeProcessorNode(
          scriptPath,
          audioContext,
          settings.pro ? 'rb' : 'st',
          settings.license,
          settings.licenseCheckSum,
          settings.appCheckSum,
          APP_KEY,
          destination,
        );

        await processorNode.ready;

        if (processorNode.input && sourceNode) {
          sourceNode.connect(processorNode.input);
        }

        isCapturing = true;
      } catch (err) {
        runtimeLog.error('tabcapture', 'error', err);
        const errMsg =
          (err as any)?.message ||
          chrome.runtime.lastError?.message ||
          JSON.stringify(chrome.runtime.lastError || {}) ||
          'Tab capture failed';
        await logTabCaptureError({ errorMessage: errMsg, err: serializeError(err), tabId });
        sendToServiceWorker({
          tabId,
          hasConnectionStatusError: true,
          error: errMsg,
          connectionStatusMessage: errMsg,
        } as any);
        isCapturing = false;
        cleanupCapture();
      }
    })();
    try {
      await initPromise;
    } finally {
      initPromise = undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Command processing
// ---------------------------------------------------------------------------

async function processCommand(msg: TabCaptureCommand): Promise<void> {
  try {
    switch (msg.command) {
      case 'set':
        // Update settings
        settings.pro = msg.pro ?? settings.pro;
        settings.license = msg.license ?? settings.license;
        settings.licenseCheckSum = msg.licenseCheckSum ?? settings.licenseCheckSum;
        settings.audioProcessorEnabled =
          msg.audioProcessorEnabled ?? settings.audioProcessorEnabled;
        settings.appCheckSum = msg.appCheckSum ?? settings.appCheckSum ?? 0;

        if (!settings.license || !settings.licenseCheckSum) {
          settings.pro = false;
        }

        // Start capture if not already running
        if (!isCapturing) {
          await initCapture();
        }

        // Update processor params
        processorNode?.setParams({
          pitch: msg.pitch,
          semitone: msg.semitone,
          formant: msg.formant,
          reducerAmount: msg.reducerAmount,
          reducerFocus: msg.reducerFocus,
          reducerAggressiveness: msg.reducerAggressiveness,
          reducerStereoBias: msg.reducerStereoBias,
          reducerLowHz: msg.reducerLowHz,
          reducerHighHz: msg.reducerHighHz,
          enabled: settings.audioProcessorEnabled,
        });

        // Apply EQ bands
        if (msg.eqBands !== undefined || msg.eqEnabled !== undefined) {
          applyLocalEqBands(msg.eqBands, msg.eqEnabled);
        }
        break;

      case 'exit-tabCapture':
        cleanupCapture();
        window.close();
        break;
    }
  } catch (err) {
    runtimeLog.error('tabcapture', 'error', err);
    await logTabCaptureError({ command: msg?.command, error: serializeError(err), tabId });
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

function cleanupCapture(): void {
  try {
    // Disconnect source
    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }

    // Disconnect processor
    if (processorNode) {
      processorNode.disconnect();
      processorNode = null;
    }

    isCapturing = false;

    // Stop media tracks
    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      mediaStream = null;
    }

    // Close audio context
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg: any, sender: chrome.runtime.MessageSender) => {
  // Ignore messages from ourselves
  if (msg.sender === 'tabcapture-tab') return;
  // Ignore service-worker timeupdate messages
  if (msg.sender === 'service-worker' || msg.command === 'timeupdate') return;

  const msgTabId = msg.tabId ?? sender.tab?.id;

  // Only process messages for our tab
  if (typeof tabId === 'number' && typeof msgTabId === 'number' && msgTabId !== tabId) return;

  processCommand(msg);
});

// ---------------------------------------------------------------------------
// Exit button
// ---------------------------------------------------------------------------

document.querySelector('#exitButton')?.addEventListener('click', () => {
  if (typeof tabId === 'number') {
    processCommand({ command: 'exit-tabCapture' });
  }
  window.close();
});

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

(async function init(): Promise<void> {
  // Determine tab ID
  if (Number.isFinite(requestedTabId) && requestedTabId > 0) {
    tabId = requestedTabId;
    try {
      await chrome.tabs.get(tabId);
    } catch {
      tabId = undefined;
    }
  }

  if (tabId === undefined) {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab || typeof activeTab.id !== 'number') {
      const errMsg = 'Tab connection error: no active tab found';
      await logTabCaptureError({
        requestedTabId: Number.isFinite(requestedTabId) ? requestedTabId : undefined,
        requestedWindowId: Number.isFinite(requestedWindowId) ? requestedWindowId : undefined,
      });
      sendToServiceWorker({
        hasConnectionStatusError: true,
        error: errMsg,
        connectionStatusMessage: errMsg,
      } as any);
      runtimeLog.error('tabcapture', 'no-tab', 'NO TAB!');
      window.close();
      return;
    }
    tabId = activeTab.id;
  }

  // Monitor target tab navigation
  if (typeof tabId === 'number') {
    const targetTabId = tabId;
    tabUpdateListener = (changedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changedTabId === targetTabId && (changeInfo.url || changeInfo.status === 'loading')) {
        try {
          sendToServiceWorker({
            command: 'exit-tabCapture',
            connectionStatusMessage: 'target-tab-navigation',
          });
        } catch {
          // ignore
        }
        cleanupCapture();
        window.close();
      }
    };
    chrome.tabs.onUpdated.addListener(tabUpdateListener);
  }

  // Notify service worker that tab capture is active
  sendToServiceWorker({ command: 'tabCapture' } as any);
})();

// ---------------------------------------------------------------------------
// Before unload
// ---------------------------------------------------------------------------

window.addEventListener('beforeunload', () => {
  try {
    sendToServiceWorker({
      command: 'exit-tabCapture',
      connectionStatusMessage: 'helper-unload',
    } as any);
  } catch {
    // ignore
  }

  if (tabUpdateListener) {
    try {
      chrome.tabs.onUpdated.removeListener(tabUpdateListener);
    } catch {
      // ignore
    }
    tabUpdateListener = undefined;
  }

  cleanupCapture();
});
