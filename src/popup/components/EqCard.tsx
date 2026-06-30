import React, { useCallback, useRef, useState } from 'react';
import type { EqBand } from '../../shared/types';
import { DEFAULT_EQ_BANDS, EQ_PRESETS } from '../../shared/types';

interface EqCardProps {
  enabled: boolean;
  bands: EqBand[];
  savedPreset: string;
  onToggle: (checked: boolean) => void;
  onBandChange: (index: number, gain: number) => void;
  onReset: () => void;
  onPresetSelect: (presetName: string, gains: number[]) => void;
}

const FREQ_LABELS = ['30', '120', '350', '1.2k', '3.5k', '9k'];
const GAIN_MIN = -12;
const GAIN_MAX = 12;
const GAIN_STEP = 0.5;

function gainToHeightPct(gain: number): number {
  return ((gain - GAIN_MIN) / (GAIN_MAX - GAIN_MIN)) * 100;
}

function heightPctToGain(pct: number): number {
  const raw = GAIN_MIN + (pct / 100) * (GAIN_MAX - GAIN_MIN);
  return Math.round(raw / GAIN_STEP) * GAIN_STEP;
}

interface EqBandSliderProps {
  gain: number;
  freqLabel: string;
  onChange: (gain: number) => void;
}

function EqBandSlider({ gain, freqLabel, onChange }: EqBandSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const heightPct = gainToHeightPct(gain);

  const updateFromPointer = useCallback(
    (clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = 1 - (clientY - rect.top) / rect.height;
      const clamped = Math.max(0, Math.min(1, pct));
      onChange(heightPctToGain(clamped * 100));
    },
    [onChange],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      updateFromPointer(e.clientY);
    },
    [updateFromPointer],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!(e.buttons & 1)) return;
      updateFromPointer(e.clientY);
    },
    [updateFromPointer],
  );

  const handleDoubleClick = useCallback(() => {
    onChange(0);
  }, [onChange]);

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onDoubleClick={handleDoubleClick}
      className="flex-1 relative cursor-ns-resize touch-none"
      role="slider"
      aria-label={`EQ ${freqLabel} Hz`}
      aria-valuemin={GAIN_MIN}
      aria-valuemax={GAIN_MAX}
      aria-valuenow={gain}>
      <div
        className="absolute inset-0 rounded-sm"
        style={{ background: 'var(--border)', opacity: 0.3 }}
      />
      <div
        className="absolute left-0 right-0 border-t"
        style={{
          top: '50%',
          borderColor: 'var(--text-muted)',
          opacity: 0.3,
        }}
      />
      <div
        className="rounded-t-sm w-full absolute bottom-0"
        style={{
          height: `${heightPct}%`,
          background: 'linear-gradient(to top, rgba(110,64,201,0.6), rgba(88,166,255,0.6))',
        }}
      />
      <div
        className="absolute -translate-x-1/2 rounded-full border-2 transition-transform"
        style={{
          bottom: `calc(${heightPct}% - 6px)`,
          left: '50%',
          width: '14px',
          height: '14px',
          background: 'var(--accent-secondary)',
          borderColor: 'var(--bg-primary)',
          boxShadow: '0 0 8px rgba(88,166,255,0.4)',
        }}
      />
    </div>
  );
}

export const EqCard: React.FC<EqCardProps> = ({
  enabled,
  bands,
  savedPreset,
  onToggle,
  onBandChange,
  onReset,
  onPresetSelect,
}) => {
  const displayBands = bands.length === 6 ? bands : DEFAULT_EQ_BANDS;
  const [activePreset, setActivePreset] = useState<string>(savedPreset);

  const handleToggle = useCallback(() => {
    onToggle(!enabled);
  }, [enabled, onToggle]);

  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const name = e.target.value;
      if (!name) return;
      const preset = EQ_PRESETS.find((p) => p.name === name);
      if (preset) {
        setActivePreset(name);
        onPresetSelect(name, preset.bands);
      }
    },
    [onPresetSelect],
  );

  const handleReset = useCallback(() => {
    setActivePreset('');
    onReset();
  }, [onReset]);

  return (
    <div
      className="rounded-lg p-3 mb-2.5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex justify-between items-center mb-2">
        <span
          className="font-medium tracking-wider"
          style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
          Эквалайзер
        </span>
        <div className="flex items-center gap-2">
          {enabled && (
            <button
              onClick={onReset}
              className="w-[24px] h-[24px] rounded-full border-0 cursor-pointer flex items-center justify-center text-[14px] transition-colors"
              style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
              title="Сбросить эквалайзер">
              ↺
            </button>
          )}
          <div
            onClick={handleToggle}
            className="relative cursor-pointer rounded-full"
            style={{
              width: '28px',
              height: '14px',
              background: enabled ? 'var(--toggle-active-bg)' : 'var(--toggle-bg)',
            }}>
            <div
              className="absolute top-0.5 rounded-full transition-all"
              style={{
                width: '10px',
                height: '10px',
                background: 'var(--toggle-knob)',
                left: enabled ? '16px' : '2px',
              }}
            />
          </div>
        </div>
      </div>
      {enabled && (
        <div className="mb-2">
          <select
            value={activePreset}
            onChange={handlePresetChange}
            className="w-full rounded px-2 py-1 text-[10px] border-0 cursor-pointer outline-none"
            style={{
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
            }}>
            {EQ_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {enabled && (
        <>
          <div className="flex justify-between mb-1 px-px">
            {FREQ_LABELS.map((label) => (
              <span
                key={label}
                className="text-[7px] flex-1 text-center"
                style={{ color: 'var(--text-muted)' }}>
                {label}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px] h-[60px]">
            {displayBands.map((band, i) => (
              <EqBandSlider
                key={i}
                gain={band.gain}
                freqLabel={FREQ_LABELS[i] ?? ''}
                onChange={(g) => onBandChange(i, g)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
