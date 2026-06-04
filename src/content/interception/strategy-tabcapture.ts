import type { InterceptionStrategy, InterceptionResult } from './types';

export function createTabCaptureStrategy(): InterceptionStrategy {
  return {
    level: 0,
    name: 'TabCapture',

    async detect(_el: HTMLMediaElement): Promise<InterceptionResult> {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        if (!tabId) {
          return {
            success: false,
            strategy: 0,
            reason: 'No active tab found',
            nextLevel: 5,
          };
        }

        const response = await chrome.runtime.sendMessage({
          type: 'request-tabcapture',
          tabId,
        });

        if (response?.status === 'success') {
          return {
            success: true,
            strategy: 0,
          };
        }

        return {
          success: false,
          strategy: 0,
          reason: response?.message || 'TabCapture failed',
          nextLevel: 5,
        };
      } catch {
        return {
          success: false,
          strategy: 0,
          reason: 'TabCapture not available',
          nextLevel: 5,
        };
      }
    },
  };
}
