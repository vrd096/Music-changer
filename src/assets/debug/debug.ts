// ============================================================
// Diagnostics page for Transpose extension
// ============================================================

import { runtimeLog } from '../../shared/runtime-logger';

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function getOrCreatePre(id: string, label?: string): HTMLPreElement {
  let el = document.getElementById(id) as HTMLPreElement | null;
  if (!el) {
    const container = document.querySelector('.container') || document.body;
    const h3 = document.createElement('h3');
    h3.innerText = label || id;
    el = document.createElement('pre');
    el.id = id;
    container.appendChild(h3);
    container.appendChild(el);
  }
  return el;
}

function getOrCreateButton(id: string, label: string): HTMLButtonElement {
  let el = document.getElementById(id) as HTMLButtonElement | null;
  if (!el) {
    const container = document.querySelector('.container') || document.body;
    el = document.createElement('button');
    el.id = id;
    el.type = 'button';
    el.innerText = label;
    el.style.marginRight = '8px';
    el.style.marginBottom = '8px';
    container.appendChild(el);
  }
  return el;
}

function setPreContent(id: string, content: unknown): void {
  const pre = (document.getElementById(id) as HTMLPreElement | null) || getOrCreatePre(id, id);
  pre.innerText = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
}

function logError(label: string, err: unknown): void {
  const pre =
    (document.getElementById('errors') as HTMLPreElement | null) ||
    getOrCreatePre('errors', 'Errors');
  const msg =
    err && typeof err === 'object' && ('stack' in err || 'message' in err)
      ? String((err as Error).stack || (err as Error).message)
      : String(err);
  const line = `[${new Date().toISOString()}] ${label}: ${msg}\n`;
  pre.innerText = (pre.innerText || '') + line;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RUNTIME_LOG_KEY = 'runtimeLog';

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------
const SENSITIVE_KEY_RE =
  /(token|access|refresh|authorization|auth|jwt|session|cookie|secret|apiKey|apikey|license|licenseKey|patch|accountBinding|enc|key|password|email|uid|customerId|subscription|stsTokenManager)/i;
const JWT_RE = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/;

function redactSensitiveData(value: unknown, path: unknown[] = []): unknown {
  if (value == null) return value;

  if (typeof value === 'string') {
    const lastKey = path.length ? String(path[path.length - 1]) : '';
    if (SENSITIVE_KEY_RE.test(lastKey)) return '***REDACTED***';
    if (JWT_RE.test(value)) return '***REDACTED_JWT***';
    if (value.length > 80 && /^[A-Za-z0-9+/_\-=.]+$/.test(value)) return '***REDACTED_BLOB***';
    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)) return '***REDACTED_EMAIL***';
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.map((v, i) => redactSensitiveData(v, path.concat([i])));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        result[key] = '***REDACTED***';
      } else {
        result[key] = redactSensitiveData(val, path.concat([key]));
      }
    }
    return result;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Runtime log
// ---------------------------------------------------------------------------

async function loadRuntimeLog(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(RUNTIME_LOG_KEY);
    const entries = Array.isArray(data[RUNTIME_LOG_KEY]) ? data[RUNTIME_LOG_KEY] : [];
    setPreContent('runtime-log', redactSensitiveData(entries));
  } catch (err) {
    logError('loadRuntimeLog', err);
    setPreContent('runtime-log', 'Failed to load runtime log.');
  }
}

async function clearRuntimeLog(): Promise<void> {
  try {
    await chrome.storage.local.remove([RUNTIME_LOG_KEY]);
    setPreContent('runtime-log', []);
  } catch (err) {
    logError('clearRuntimeLog', err);
  }
}

async function copyRuntimeLogToClipboard(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(RUNTIME_LOG_KEY);
    const entries = Array.isArray(data[RUNTIME_LOG_KEY]) ? data[RUNTIME_LOG_KEY] : [];
    const payload = {
      generatedAt: new Date().toISOString(),
      key: RUNTIME_LOG_KEY,
      activeTabUrl: await getActiveTabUrl(),
      entries: redactSensitiveData(entries),
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopyStatus('Runtime log copied to clipboard.');
  } catch (err) {
    logError('copyRuntimeLogToClipboard', err);
    setCopyStatus('Failed to copy runtime log.', true);
  }
}

async function getActiveTabUrl(): Promise<string | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.url || null;
  } catch (err) {
    logError('getActiveTabUrl', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

async function getEffectivePermissions(): Promise<Record<string, unknown>> {
  const perms = await chrome.permissions.getAll();
  const injectionTest = await (async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return { ok: false, reason: 'No active tab' };
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => true });
      return { ok: true, note: 'Injection allowed on active tab' };
    } catch (err: any) {
      return {
        ok: false,
        error: err.message,
        runtimeLastError: chrome.runtime?.lastError?.message || null,
        note: 'Injection blocked. Usually site access, enterprise policy, or another extension.',
      };
    }
  })();

  return {
    extensionPermissions: { permissions: perms.permissions, origins: perms.origins },
    activeTabInjection: injectionTest,
    notes: [
      'If Spotify origin is missing, optional_host_permissions were not granted.',
      'If injection fails, site access or enterprise policy is blocking the extension.',
      'If injection succeeds but audio fails, investigate AudioContext / AudioWorklet / WASM.',
    ],
  };
}

function getHostPattern(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return hostname ? `https://${hostname}/*` : null;
  } catch {
    return null;
  }
}

async function checkSpotifyPermission(tab?: chrome.tabs.Tab): Promise<boolean> {
  try {
    const targetPattern = tab?.url ? getHostPattern(tab.url) : null;
    const hasOpenSpotifyPerm = await chrome.permissions.contains({
      origins: ['https://open.spotify.com/*'],
    });
    const hasWildcardSpotifyPerm = await chrome.permissions.contains({
      origins: ['https://*.spotify.com/*'],
    });
    const hasTargetPerm = targetPattern
      ? await chrome.permissions.contains({ origins: [targetPattern] })
      : false;
    const granted = hasOpenSpotifyPerm || hasWildcardSpotifyPerm || hasTargetPerm;

    setPreContent('spotify-permissions', {
      optionalHostPermissionGranted: granted,
      extensionRuntimeId: chrome?.runtime?.id || null,
      debugPageUrl: location.href,
      targetPattern,
      hasOpenSpotifyPerm,
      hasWildcardSpotifyPerm,
      hasTargetPerm,
      note: 'This only checks host grants. Deep Spotify diagnostics below still require actual page access for this extension instance/tab (site access / active-tab grant / enterprise policy can still block).',
    });

    return granted;
  } catch (err) {
    setPreContent('spotify-permissions', 'FAILED: ' + ((err as Error)?.message || String(err)));
    logError('chrome.permissions.contains(spotify)', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Audio diagnostics
// ---------------------------------------------------------------------------

async function runAudioContextDiag(): Promise<Record<string, unknown>> {
  const errors: string[] = [];
  const result: Record<string, unknown> = {
    href: location.href,
    origin: location.origin,
    userAgent: navigator.userAgent,
    crossOriginIsolated: typeof crossOriginIsolated === 'boolean' ? crossOriginIsolated : null,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as any).deviceMemory,
    webdriver: navigator.webdriver,
    audio: null,
    audioWorklet: null,
    errors,
  };

  const ACtor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!ACtor) {
    errors.push('AudioContext not available in page context');
    return result;
  }

  try {
    const ctx = new ACtor() as AudioContext;
    try {
      await ctx.resume();
    } catch (e) {
      errors.push('AudioContext.resume failed: ' + ((e as Error)?.message || String(e)));
    }
    result.audio = {
      state: ctx.state,
      sampleRate: ctx.sampleRate,
      baseLatency: ctx.baseLatency,
      outputLatency: ctx.outputLatency,
    };
    result.audioWorklet = {
      available: !!ctx.audioWorklet,
      addModuleType: ctx.audioWorklet ? typeof ctx.audioWorklet.addModule : null,
    };
    try {
      await ctx.close();
    } catch (e) {
      errors.push('AudioContext.close failed: ' + ((e as Error)?.message || String(e)));
    }
  } catch (e) {
    errors.push('AudioContext construction failed: ' + ((e as Error)?.message || String(e)));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Spotify diagnostics
// ---------------------------------------------------------------------------

async function runSpotifyDiagnostics(): Promise<void> {
  setPreContent('spotify-diag', 'Running...');
  setPreContent('spotify-diag-raw', '');

  // Find Spotify tab
  const spotifyTab = await findSpotifyTab();
  if (!spotifyTab || !spotifyTab.id) {
    setPreContent(
      'spotify-diag',
      'No Spotify tab found. Open https://open.spotify.com/ and try again.',
    );
    return;
  }

  const hasPermission = await checkSpotifyPermission(spotifyTab);
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isActive = !!activeTab?.id && activeTab.id === spotifyTab.id;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: spotifyTab.id },
      world: 'ISOLATED',
      func: runAudioContextDiag,
    });

    const audioResult = results && results.length ? results[0].result : null;
    if (!audioResult) {
      setPreContent('spotify-diag', 'FAILED: No result returned from executeScript');
      return;
    }

    setPreContent('spotify-diag', audioResult);
    setPreContent('spotify-diag-raw', JSON.stringify(audioResult, null, 2));
  } catch (err: any) {
    const runtimeLastError = chrome.runtime?.lastError?.message;
    const targetPattern = spotifyTab.url ? getHostPattern(spotifyTab.url) : null;
    const errStr = (err?.message || String(err) || '').toLowerCase();
    const isAccessBlocked =
      errStr.includes('cannot access contents of the page') ||
      errStr.includes('must request permission to access the respective host');

    let diagnosis = 'Deep probe could not access the Spotify page.';
    if (isAccessBlocked && !hasPermission) {
      diagnosis = 'Host permission is missing for this Spotify tab/origin.';
    } else if (isAccessBlocked && hasPermission && !isActive) {
      diagnosis =
        'Likely temporary active-tab grant mismatch: diagnostics targeted a non-active Spotify tab. This often works only after connect flow grants access on the active tab.';
    } else if (isAccessBlocked && hasPermission) {
      diagnosis =
        'Host permission exists, but page access is still blocked in this context (site access mode/on-click grant, policy, or extension interference).';
    }

    setPreContent('spotify-diag', {
      failed: true,
      error: err?.message || String(err),
      runtimeLastError: runtimeLastError || null,
      extensionRuntimeId: chrome?.runtime?.id || null,
      debugPageUrl: location.href,
      hasSpotifyPermission: hasPermission,
      targetIsActiveInCurrentWindow: isActive,
      targetTab: {
        id: spotifyTab.id,
        url: spotifyTab.url,
        title: spotifyTab.title,
        active: spotifyTab.active,
        audible: spotifyTab.audible,
        status: spotifyTab.status,
        discarded: spotifyTab.discarded,
        windowId: spotifyTab.windowId,
      },
      targetPattern,
      diagnosis,
      note: 'If this only works after opening sidepanel/connect/playback, that strongly indicates temporary access is being granted during that flow (active-tab style) instead of persistent host access for diagnostics.',
    });
    logError('chrome.scripting.executeScript(spotify)', err);
  }
}

async function findSpotifyTab(): Promise<chrome.tabs.Tab | null> {
  const spotifyPatterns = ['https://open.spotify.com/*', 'https://*.spotify.com/*'];

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id && typeof activeTab.url === 'string') {
    try {
      const hostname = new URL(activeTab.url).hostname.toLowerCase();
      if (hostname === 'open.spotify.com' || hostname.endsWith('.spotify.com')) {
        return activeTab;
      }
    } catch {
      /* ignore */
    }
  }

  const tabsInWindow = await chrome.tabs.query({ url: spotifyPatterns, currentWindow: true });
  if (tabsInWindow.length > 0) {
    return tabsInWindow.find((t) => t.audible) || tabsInWindow[0];
  }

  const allTabs = await chrome.tabs.query({ url: spotifyPatterns });
  if (allTabs.length > 0) {
    return allTabs.find((t) => t.audible) || allTabs[0];
  }

  return null;
}

async function requestSpotifyPermission(): Promise<void> {
  try {
    const granted = await chrome.permissions.request({
      origins: ['https://open.spotify.com/*', 'https://*.spotify.com/*'],
    });
    await checkSpotifyPermission();
    if (!granted) {
      logError('permissions.request', 'User did not grant Spotify permission.');
    }
  } catch (err) {
    logError('chrome.permissions.request(spotify)', err);
    await checkSpotifyPermission();
  }
}

// ---------------------------------------------------------------------------
// Copy support diagnostics
// ---------------------------------------------------------------------------

async function copySupportDiagnostics(): Promise<void> {
  const container = document.querySelector('.diagnostics') || document.body;
  const text = (container as HTMLElement).innerText.trim();
  if (text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Diagnostics copied to clipboard.');
    } catch (err) {
      setCopyStatus('Failed to copy diagnostics to clipboard.', true);
    }
  } else {
    setCopyStatus('No diagnostics available to copy.', true);
  }
}

function setCopyStatus(msg: string, isError = false): void {
  const el = document.getElementById('copy-status')!;
  el.textContent = msg;
  el.style.color = isError ? '#b00020' : '#2e7d32';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async function main(): Promise<void> {
  // Create UI elements
  getOrCreatePre('user-agent', 'User agent');
  getOrCreatePre('env', 'Environment');
  getOrCreatePre('managed', 'Managed / enterprise hints');
  getOrCreatePre('wasm-basic', 'WASM basic compile');
  getOrCreatePre('audio-context', 'AudioContext');
  getOrCreatePre('audio-worklet', 'AudioWorklet');
  getOrCreatePre('extension-context', 'Extension context');
  getOrCreatePre('spotify-permissions', 'Spotify permissions');
  getOrCreatePre('spotify-diag', 'Spotify diagnostics');
  getOrCreatePre('spotify-diag-raw', 'Spotify diagnostics (raw copy)');
  getOrCreatePre('storage-sync', 'chrome.storage.sync (redacted)');
  getOrCreatePre('storage-local', 'chrome.storage.local (redacted)');
  getOrCreatePre('errors', 'Diagnostics log');
  getOrCreatePre('runtime-log', 'Runtime log');

  getOrCreateButton('btn-run-spotify', 'Run Spotify diagnostics');
  getOrCreateButton('btn-request-spotify', 'Request Spotify permission');
  getOrCreateButton('btn-refresh-runtime-log', 'Refresh runtime log');
  getOrCreateButton('btn-copy-runtime-log', 'Copy runtime log');
  getOrCreateButton('btn-clear-runtime-log', 'Clear runtime log');

  logError('Starting diagnostics', 'OK');

  // Basic info
  setPreContent('user-agent', navigator.userAgent);
  setPreContent('env', {
    crossOriginIsolated:
      typeof window.crossOriginIsolated === 'boolean' ? window.crossOriginIsolated : null,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as any).deviceMemory,
    platform: (navigator as any).platform,
    language: navigator.language,
    languages: navigator.languages,
    webdriver: navigator.webdriver,
  });

  setPreContent('managed', {
    hasEnterpriseAPI: typeof chrome !== 'undefined' && !!chrome.enterprise,
    runtimeId: chrome?.runtime?.id || null,
    note: 'Ask user to open chrome://policy and share screenshot/text if needed.',
  });

  setPreContent('extension-context', {
    locationHref: location.href,
    protocol: location.protocol,
    isExtensionOrigin: location.protocol === 'chrome-extension:',
    hasChromeRuntime: typeof chrome !== 'undefined' && !!chrome.runtime,
    manifestVersion: chrome?.runtime?.getManifest()?.manifest_version ?? null,
    extensionVersion: chrome?.runtime?.getManifest()?.version ?? null,
  });

  // Permissions
  setPreContent('permissions-effective', await getEffectivePermissions());

  // WASM test
  await (async () => {
    try {
      const wasmBytes = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
      await WebAssembly.compile(wasmBytes);
      setPreContent('wasm-basic', 'OK');
    } catch (err) {
      setPreContent('wasm-basic', 'FAILED: ' + ((err as Error)?.message || String(err)));
      logError('WebAssembly.compile(basic)', err);
    }
  })();

  // AudioContext test
  await (async () => {
    try {
      const ACtor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!ACtor) {
        setPreContent('audio-context', 'FAILED: AudioContext not available');
        return;
      }
      const ctx = new ACtor() as AudioContext;
      try {
        await ctx.resume();
      } catch (e) {
        logError('AudioContext.resume', e);
      }
      setPreContent('audio-context', {
        state: ctx.state,
        sampleRate: ctx.sampleRate,
        baseLatency: ctx.baseLatency,
        outputLatency: ctx.outputLatency,
      });
      try {
        await ctx.close();
      } catch (e) {
        logError('AudioContext.close', e);
      }
    } catch (err) {
      setPreContent('audio-context', 'FAILED: ' + ((err as Error)?.message || String(err)));
      logError('AudioContext', err);
    }
  })();

  // AudioWorklet test
  await (async () => {
    try {
      const ACtor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!ACtor) {
        setPreContent('audio-worklet', 'FAILED: AudioContext not available');
        return;
      }
      const ctx = new ACtor() as AudioContext;
      if (!ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== 'function') {
        setPreContent('audio-worklet', 'FAILED: audioWorklet.addModule not available');
        try {
          await ctx.close();
        } catch {
          /* ignore */
        }
        return;
      }
      const moduleUrl = chrome.runtime.getURL('assets/debug/audio-worklet-test.js');
      await ctx.audioWorklet.addModule(moduleUrl);
      new AudioWorkletNode(ctx, 'transpose_debug_test').disconnect();
      setPreContent('audio-worklet', 'OK');
      try {
        await ctx.close();
      } catch (e) {
        logError('AudioWorklet AudioContext.close', e);
      }
    } catch (err) {
      setPreContent('audio-worklet', 'FAILED: ' + ((err as Error)?.message || String(err)));
      logError('audioWorklet.addModule', err);
    }
  })();

  // Storage
  (() => {
    try {
      chrome.storage.sync.get((data) => {
        setPreContent('storage-sync', redactSensitiveData(data));
      });
    } catch (err) {
      setPreContent('storage-sync', 'FAILED: ' + ((err as Error)?.message || String(err)));
      logError('storage.sync.get', err);
    }
    try {
      chrome.storage.local.get((data) => {
        setPreContent('storage-local', redactSensitiveData(data));
      });
    } catch (err) {
      setPreContent('storage-local', 'FAILED: ' + ((err as Error)?.message || String(err)));
      logError('storage.local.get', err);
    }
  })();

  // Spotify permission check
  await checkSpotifyPermission();

  // Runtime log
  await loadRuntimeLog();

  logError('Finished diagnostics', 'OK');

  // Button handlers
  document.getElementById('btn-run-spotify')!.addEventListener('click', async () => {
    try {
      await runSpotifyDiagnostics();
    } catch (err) {
      logError('btn-run-spotify click', err);
    }
  });

  document.getElementById('btn-request-spotify')!.addEventListener('click', async () => {
    try {
      await requestSpotifyPermission();
    } catch (err) {
      logError('btn-request-spotify click', err);
    }
  });

  document.getElementById('btn-refresh-runtime-log')!.addEventListener('click', async () => {
    await loadRuntimeLog();
  });

  document.getElementById('btn-clear-runtime-log')!.addEventListener('click', async () => {
    await clearRuntimeLog();
  });

  document.getElementById('btn-copy-runtime-log')!.addEventListener('click', async () => {
    await copyRuntimeLogToClipboard();
  });

  document.getElementById('btn-copy-support')!.addEventListener('click', copySupportDiagnostics);
})().catch((err) => logError('main()', err));

// Clear all data button
document.getElementById('clear')!.onclick = function () {
  if (
    confirm(
      'Are you sure you want to clear all extension data? This will reset all setting, history data and may log you out.',
    )
  ) {
    chrome.storage.sync.clear();
    chrome.storage.local.clear();
  }
};
