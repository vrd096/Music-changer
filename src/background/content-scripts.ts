export function hasHostPermissions(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: ['*://*/*'] }, (result) => resolve(result));
  });
}

export async function registerContentScripts(): Promise<void> {
  const perms = (await chrome.permissions.getAll()).origins || [];
  const allUrls = perms.includes('<all_urls>') ? ['*://*/*'] : perms;
  const matches = allUrls
    .filter((u) => u.startsWith('*://') || u.startsWith('http://') || u.startsWith('https://'))
    .sort();

  if (matches.length === 0) {
    console.log('[SW] No matching URL patterns found for content scripts, permissions:', perms);
    return;
  }

  const dispatcherId = 'tp_content_dispatcher';
  const contentId = 'tp_content';
  const scripts = [
    {
      id: dispatcherId,
      matches,
      js: ['content-dispatcher.js'],
      runAt: 'document_start' as const,
      world: 'ISOLATED' as const,
      allFrames: true,
      persistAcrossSessions: true,
    },
    {
      id: contentId,
      matches,
      js: ['content.js'],
      runAt: 'document_start' as const,
      world: 'MAIN' as const,
      allFrames: true,
      persistAcrossSessions: true,
      matchOriginAsFallback: true,
    },
  ];

  const scriptIds = new Set([dispatcherId, contentId]);
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const registeredIds = new Set(registered.map((s) => s.id));
  const hasUpdate = !!chrome.scripting.updateContentScripts;

  for (const script of scripts) {
    if (registeredIds.has(script.id)) {
      if (hasUpdate) {
        await chrome.scripting.updateContentScripts([script as any]);
      } else {
        await chrome.scripting.unregisterContentScripts({ ids: [script.id] });
        await chrome.scripting.registerContentScripts([script as any]);
      }
    } else {
      await chrome.scripting.registerContentScripts([script as any]);
    }
  }

  const toRemove = registered.filter((s) => !scriptIds.has(s.id)).map((s) => s.id);
  if (toRemove.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: toRemove });
  }
}
