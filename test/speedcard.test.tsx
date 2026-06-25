import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpeedCard } from '../src/popup/components/SpeedCard';

const noop = () => {};

describe('SpeedCard', () => {
  const baseProps = {
    mediaType: 'audio' as const,
    bpm: 128,
    speed: 1,
    masterTempo: false,
    showMT: true,
    detectedBpm: null as number | null,
    onBpmChange: noop,
    onSpeedChange: noop,
    onMasterTempoToggle: noop,
    onReset: noop,
  };

  describe('BPM display when detectedBpm is null', () => {
    it('показывает -- вместо захардкоженного 128', () => {
      render(<SpeedCard {...baseProps} detectedBpm={null} />);
      expect(screen.getByText('--')).toBeTruthy();
    });

    it('не показывает число 128', () => {
      render(<SpeedCard {...baseProps} bpm={128} detectedBpm={null} />);
      expect(screen.queryByText('128')).toBeNull();
    });
  });

  describe('BPM display when BPM detected', () => {
    it('показывает detectedBpm * speed', () => {
      render(<SpeedCard {...baseProps} detectedBpm={140} speed={1} />);
      expect(screen.getByText('140')).toBeTruthy();
    });

    it('корректирует BPM при изменении скорости', () => {
      render(<SpeedCard {...baseProps} detectedBpm={140} speed={1.5} />);
      expect(screen.getByText('210')).toBeTruthy();
    });
  });

  describe('Audio mode', () => {
    it('показывает лейбл BPM', () => {
      render(<SpeedCard {...baseProps} detectedBpm={128} />);
      expect(screen.getAllByText('BPM').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Video mode', () => {
    it('показывает speed multiplier', () => {
      render(<SpeedCard {...baseProps} mediaType="video" speed={1.5} />);
      expect(screen.getByText('1.50')).toBeTruthy();
    });

    it('показывает лейбл x', () => {
      render(<SpeedCard {...baseProps} mediaType="video" />);
      expect(screen.getByText('x')).toBeTruthy();
    });
  });

  describe('Slider', () => {
    it('рендерит range input', () => {
      render(<SpeedCard {...baseProps} />);
      expect(screen.getByLabelText('Скорость')).toBeTruthy();
    });
  });
});
