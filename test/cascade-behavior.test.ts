import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDirectStrategy } from '../src/content/interception/strategy-direct';
import { createPreClaimStrategy } from '../src/content/interception/strategy-preclaim';
import { createAudioContextHookStrategy } from '../src/content/interception/strategy-hook';
import { createBufferStrategy } from '../src/content/interception/strategy-buffer';
import { createFallbackStrategy } from '../src/content/interception/strategy-fallback';
import { resetEarlyContext } from '../src/content/interception/context-provider';
import { createMockMediaElement } from './setup';

beforeEach(() => {
  vi.clearAllMocks();
  resetEarlyContext();
  (window as any).location = {
    href: 'https://example.com',
    hostname: 'example.com',
    host: 'example.com',
  };

  (globalThis as any).AudioContext = vi.fn().mockImplementation(() => ({
    state: 'running' as const,
    destination: { connect: vi.fn(), disconnect: vi.fn() },
    sampleRate: 44100,
    currentTime: 0,
    createMediaElementSource: vi.fn().mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createBufferSource: vi.fn().mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      buffer: null,
      playbackRate: { value: 1 },
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    }),
    createGain: vi.fn().mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { value: 1 },
    }),
    createBiquadFilter: vi.fn().mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      type: 'peaking',
      frequency: { value: 1000 },
      gain: { value: 0 },
      Q: { value: 1 },
    }),
    decodeAudioData: vi.fn().mockResolvedValue({
      duration: 60,
      numberOfChannels: 2,
      sampleRate: 44100,
      length: 2646000,
      getChannelData: vi.fn().mockReturnValue(new Float32Array(2646000)),
    }),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    audioWorklet: {
      addModule: vi.fn().mockResolvedValue(undefined),
    },
  }));
});

describe('Strategy Cascade — Behavioral Tests', () => {
  describe('Level 1: Direct', () => {
    it('должен успешно захватить свободный mediaElement', async () => {
      const el = createMockMediaElement();
      const strategy = createDirectStrategy();
      const result = await strategy.detect(el);
      expect(result.success).toBe(true);
      expect(result.strategy).toBe(1);
      expect(result.sourceNode).toBeDefined();
    });

    it('должен вернуть nextLevel: 2 если элемент уже захвачен', async () => {
      (globalThis as any).AudioContext = vi.fn().mockImplementation(() => ({
        state: 'running' as const,
        destination: { connect: vi.fn(), disconnect: vi.fn() },
        sampleRate: 44100,
        currentTime: 0,
        createMediaElementSource: vi.fn().mockImplementation(() => {
          const err = new DOMException('InvalidStateError', 'InvalidStateError');
          throw err;
        }),
        createGain: vi
          .fn()
          .mockReturnValue({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } }),
        resume: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }));

      const el = createMockMediaElement();
      const strategy = createDirectStrategy();
      const result = await strategy.detect(el);
      expect(result.success).toBe(false);
      expect(result.strategy).toBe(1);
      expect(result.nextLevel).toBe(2);
    });
  });

  describe('Level 2: Pre-Claim', () => {
    it('должен упасть по таймауту если play() не вызван', async () => {
      const el = createMockMediaElement();
      const strategy = createPreClaimStrategy();

      vi.useFakeTimers();
      const detectPromise = strategy.detect(el);
      await vi.advanceTimersByTimeAsync(5001);
      const result = await detectPromise;
      vi.useRealTimers();

      expect(result.success).toBe(false);
      expect(result.strategy).toBe(2);
      expect(result.nextLevel).toBe(3);
    }, 10000);

    it('не должен пытаться повторно для уже обработанного элемента', async () => {
      const el = createMockMediaElement();
      const strategy = createPreClaimStrategy();

      vi.useFakeTimers();
      const first = strategy.detect(el);
      await vi.advanceTimersByTimeAsync(5001);
      await first;
      vi.useRealTimers();

      const second = await strategy.detect(el);
      expect(second.success).toBe(false);
      expect(second.nextLevel).toBe(3);
    });
  });

  describe('Level 3: AudioContext Hook', () => {
    it('должен упасть по таймауту если сайт не создаёт AudioContext', async () => {
      const el = createMockMediaElement();
      const strategy = createAudioContextHookStrategy();

      vi.useFakeTimers();
      const detectPromise = strategy.detect(el);
      await vi.advanceTimersByTimeAsync(10001);
      const result = await detectPromise;
      vi.useRealTimers();

      expect(result.success).toBe(false);
      expect(result.strategy).toBe(3);
      expect(result.nextLevel).toBe(4);
    }, 15000);
  });

  describe('Level 4: Buffer Fetch', () => {
    it('должен успешно загрузить аудио по http URL', async () => {
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
      });

      const el = createMockMediaElement({ src: 'https://example.com/track.mp3' });
      const strategy = createBufferStrategy();
      const result = await strategy.detect(el);
      expect(result.success).toBe(true);
      expect(result.strategy).toBe(4);
      expect(result.sourceNode).toBeDefined();
    });

    it('должен пропустить blob URL и уйти на Level 5', async () => {
      const el = createMockMediaElement({ src: 'blob:https://example.com/abc-123' });
      const strategy = createBufferStrategy();
      const result = await strategy.detect(el);
      expect(result.success).toBe(false);
      expect(result.strategy).toBe(4);
      expect(result.nextLevel).toBe(5);
    });

    it('должен упасть при ошибке fetch и уйти на Level 5', async () => {
      (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const el = createMockMediaElement({ src: 'https://example.com/track.mp3' });
      const strategy = createBufferStrategy();
      const result = await strategy.detect(el);
      expect(result.success).toBe(false);
      expect(result.strategy).toBe(4);
      expect(result.nextLevel).toBe(5);
    });
  });

  describe('Level 5: Fallback', () => {
    it('должен всегда возвращать success: true', async () => {
      const el = createMockMediaElement();
      const strategy = createFallbackStrategy();
      const result = await strategy.detect(el);
      expect(result.success).toBe(true);
      expect(result.strategy).toBe(5);
      expect(el.preservesPitch).toBe(false);
    });
  });

  describe('Полный каскад', () => {
    it('все стратегии проваливаются → Fallback успешен', async () => {
      (globalThis as any).AudioContext = vi.fn().mockImplementation(() => ({
        state: 'running' as const,
        destination: { connect: vi.fn(), disconnect: vi.fn() },
        sampleRate: 44100,
        currentTime: 0,
        createMediaElementSource: vi.fn().mockImplementation(() => {
          const err = new DOMException('InvalidStateError', 'InvalidStateError');
          throw err;
        }),
        createBufferSource: vi.fn().mockReturnValue({
          connect: vi.fn(),
          disconnect: vi.fn(),
          buffer: null,
          playbackRate: { value: 1 },
          start: vi.fn(),
          stop: vi.fn(),
          onended: null,
        }),
        createGain: vi
          .fn()
          .mockReturnValue({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } }),
        createBiquadFilter: vi.fn().mockReturnValue({
          connect: vi.fn(),
          disconnect: vi.fn(),
          type: 'peaking',
          frequency: { value: 1000 },
          gain: { value: 0 },
          Q: { value: 1 },
        }),
        decodeAudioData: vi.fn().mockRejectedValue(new Error('fail')),
        resume: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
      }));
      (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('fail'));

      const el = createMockMediaElement({ src: 'https://example.com/track.mp3' });
      const strategies = [
        createDirectStrategy(),
        createPreClaimStrategy(),
        createAudioContextHookStrategy(),
        createBufferStrategy(),
        createFallbackStrategy(),
      ];

      const results: Array<{ level: number; success: boolean }> = [];

      for (const strategy of strategies) {
        const result = await strategy.detect(el);
        results.push({ level: strategy.level, success: result.success });
        if (result.success) break;
      }

      expect(results.length).toBe(5);
      expect(results[0]).toEqual({ level: 1, success: false });
      expect(results[4]).toEqual({ level: 5, success: true });
    });
  });
});
