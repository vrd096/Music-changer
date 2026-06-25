import { describe, it, expect } from 'vitest';

function computeEffectiveBpm(detectedBpm: number | null, speed: number): number | null {
  if (detectedBpm !== null) {
    return Math.round(detectedBpm * speed);
  }
  return null;
}

describe('computeEffectiveBpm', () => {
  it('возвращает null когда BPM не определён', () => {
    expect(computeEffectiveBpm(null, 1)).toBeNull();
    expect(computeEffectiveBpm(null, 1.5)).toBeNull();
  });

  it('возвращает detectedBpm * speed', () => {
    expect(computeEffectiveBpm(140, 1)).toBe(140);
    expect(computeEffectiveBpm(140, 1.5)).toBe(210);
    expect(computeEffectiveBpm(128, 0.5)).toBe(64);
  });

  it('округляет до целого', () => {
    expect(computeEffectiveBpm(140, 1.234)).toBe(173);
  });
});

function computeSpeedFromBpm(bpmValue: number, detectedBpm: number | null): number {
  const baseBpm = detectedBpm ?? 128;
  return parseFloat(Math.max(0.25, Math.min(2, bpmValue / baseBpm)).toFixed(4));
}

describe('handleBpmChange logic', () => {
  it('делит на 128 когда detectedBpm = null', () => {
    expect(computeSpeedFromBpm(140, null)).toBeCloseTo(1.0938);
  });

  it('делит на detectedBpm когда он определён', () => {
    expect(computeSpeedFromBpm(210, 140)).toBeCloseTo(1.5);
  });

  it('не выходит за границы 0.25-2.0', () => {
    expect(computeSpeedFromBpm(10, 128)).toBe(0.25);
    expect(computeSpeedFromBpm(500, 128)).toBe(2);
  });
});
