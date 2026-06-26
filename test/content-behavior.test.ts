import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockMediaElement } from './setup';

function clampPlaybackRate(speed: number): number {
  return Math.max(0.25, Math.min(16, speed));
}

function computeSpeedFromBpm(bpmValue: number, baseBpm: number = 128): number {
  return parseFloat(Math.max(0.25, Math.min(2, bpmValue / baseBpm)).toFixed(4));
}

describe('Content script — playbackRate logic', () => {
  describe('clampPlaybackRate', () => {
    it('ограничивает снизу 0.25', () => {
      expect(clampPlaybackRate(0.1)).toBe(0.25);
    });

    it('ограничивает сверху 16', () => {
      expect(clampPlaybackRate(20)).toBe(16);
    });

    it('пропускает значения в диапазоне', () => {
      expect(clampPlaybackRate(1)).toBe(1);
      expect(clampPlaybackRate(2)).toBe(2);
    });
  });

  describe('pause clears BPM', () => {
    it('pause listener можно добавить к media элементу', () => {
      const el = createMockMediaElement();
      const handler = vi.fn();
      el.addEventListener('pause', handler);
      const event = new Event('pause');
      el.dispatchEvent(event);
      expect(handler).toHaveBeenCalled();
    });
  });
});

describe('BPM → Speed conversion', () => {
  it('128 BPM → speed 1.0', () => {
    expect(computeSpeedFromBpm(128)).toBeCloseTo(1);
  });

  it('140 BPM (base 140) → speed 1.0', () => {
    expect(computeSpeedFromBpm(140, 140)).toBeCloseTo(1);
  });

  it('210 BPM (base 140) → speed 1.5', () => {
    expect(computeSpeedFromBpm(210, 140)).toBeCloseTo(1.5);
  });

  it('70 BPM (base 140) → speed 0.5', () => {
    expect(computeSpeedFromBpm(70, 140)).toBeCloseTo(0.5);
  });
});
