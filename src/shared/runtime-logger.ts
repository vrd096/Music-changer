// ============================================================
// Runtime logger - logs errors/warnings to chrome.storage.local
// ============================================================

import type { LogEntry } from './types';
import {
  RUNTIME_LOG_KEY,
  RUNTIME_LOG_MAX,
  RUNTIME_LOG_STRING_MAX,
  RUNTIME_LOG_DEPTH_MAX,
} from './helpers';

/** Safely serialize a value for logging */
function safeSerialize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > RUNTIME_LOG_DEPTH_MAX) return '[MaxDepthExceeded]';
  if (value == null) return value;

  const type = typeof value;
  if (type === 'string') {
    return (value as string).length > RUNTIME_LOG_STRING_MAX
      ? (value as string).slice(0, RUNTIME_LOG_STRING_MAX) + '…[truncated]'
      : value;
  }
  if (type === 'number' || type === 'boolean') return value;
  if (type === 'bigint') return (value as bigint).toString();
  if (type === 'function') return '[Function]';
  if (type === 'symbol') return (value as symbol).toString();
  if (type !== 'object') return String(value);

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  const obj = value as object;
  if (seen.has(obj)) return '[Circular]';
  seen.add(obj);

  if (Array.isArray(value)) {
    return value.map((item) => safeSerialize(item, depth + 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    try {
      result[key] = safeSerialize(val, depth + 1, seen);
    } catch {
      result[key] = '[Unserializable]';
    }
  }
  return result;
}

/** Parse log arguments into a structured entry */
function parseLogEntry(level: 'warn' | 'error', args: unknown[]): Omit<LogEntry, 't'> {
  if (args.length >= 2 && typeof args[0] === 'string' && typeof args[1] === 'string') {
    return {
      lvl: level,
      scope: args[0],
      event: args[1],
      msg: typeof args[2] === 'string' ? args[2] : undefined,
      ctx: args.length > 3 ? args[3] : args[2],
    };
  }
  return {
    lvl: level,
    scope: 'app',
    event: level,
    msg:
      args
        .filter((arg) => typeof arg === 'string')
        .join(' ')
        .trim() || undefined,
    ctx: args,
  };
}

/** Runtime logger instance */
export const runtimeLog = {
  /** Read all log entries from storage */
  async readEntries(): Promise<LogEntry[]> {
    if (!chrome?.storage?.local) return [];
    const data = (await chrome.storage.local.get(RUNTIME_LOG_KEY))?.[RUNTIME_LOG_KEY];
    return Array.isArray(data) ? data : [];
  },

  /** Write a single entry to storage (only errors and warnings) */
  async writeEntry(entry: Omit<LogEntry, 't'>): Promise<void> {
    try {
      if (!chrome?.storage?.local || (entry.lvl !== 'error' && entry.lvl !== 'warn')) return;

      const entries = await this.readEntries();
      const newEntry: LogEntry = {
        t: new Date().toISOString(),
        lvl: entry.lvl,
        scope: entry.scope || 'app',
        event: entry.event || entry.lvl,
        msg:
          entry.msg && entry.msg.length > RUNTIME_LOG_STRING_MAX
            ? entry.msg.slice(0, RUNTIME_LOG_STRING_MAX) + '…[truncated]'
            : entry.msg,
        ctx: entry.ctx === undefined ? undefined : safeSerialize(entry.ctx),
      };

      const updated = [...entries, newEntry].slice(-RUNTIME_LOG_MAX);
      await chrome.storage.local.set({ [RUNTIME_LOG_KEY]: updated });
    } catch {
      // Silently fail - logging should never throw
    }
  },

  log(..._args: unknown[]): Promise<void> {
    return Promise.resolve();
  },

  warn(...args: unknown[]): Promise<void> {
    return this.writeEntry(parseLogEntry('warn', args));
  },

  async error(...args: unknown[]): Promise<void> {
    console.error(...args);
    await this.writeEntry(parseLogEntry('error', args));
  },

  async entries(): Promise<LogEntry[]> {
    try {
      return await this.readEntries();
    } catch {
      return [];
    }
  },

  async clear(): Promise<void> {
    try {
      if (!chrome?.storage?.local) return;
      await chrome.storage.local.remove(RUNTIME_LOG_KEY);
    } catch {
      // Silently fail
    }
  },
};
