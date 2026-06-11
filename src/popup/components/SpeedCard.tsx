import React, { useCallback, useMemo } from 'react';

interface SpeedCardProps {
  mediaType: 'audio' | 'video';
  bpm: number;
  speed: number;
  masterTempo: boolean;
  showMT: boolean;
  onBpmChange: (bpm: number) => void;
  onSpeedChange: (speed: number) => void;
  onMasterTempoToggle: () => void;
  onReset: () => void;
}

const BASE_BPM = 128;
const BPM_MIN = BASE_BPM - 30; // 98
const BPM_MAX = BASE_BPM + 30; // 158
const SPEED_MIN = 0.25;
const SPEED_MAX = 2;

export const SpeedCard: React.FC<SpeedCardProps> = ({
  mediaType,
  bpm,
  speed,
  masterTempo,
  showMT,
  onBpmChange,
  onSpeedChange,
  onMasterTempoToggle,
  onReset,
}) => {
  const isAudio = mediaType === 'audio';

  const min = isAudio ? BPM_MIN : SPEED_MIN;
  const max = isAudio ? BPM_MAX : SPEED_MAX;
  const value = isAudio ? bpm : speed;
  const step = isAudio ? 1 : 0.01;

  const pct = ((value - min) / (max - min)) * 100;

  const atMin = value <= min;
  const atMax = value >= max;

  const handleMinus = useCallback(() => {
    if (isAudio) {
      const newVal = Math.max(BPM_MIN, bpm - 1);
      onBpmChange(newVal);
    } else {
      const newVal = Math.max(SPEED_MIN, +(speed - 0.05).toFixed(2));
      onSpeedChange(newVal);
    }
  }, [isAudio, bpm, speed, onBpmChange, onSpeedChange]);

  const handlePlus = useCallback(() => {
    if (isAudio) {
      const newVal = Math.min(BPM_MAX, bpm + 1);
      onBpmChange(newVal);
    } else {
      const newVal = Math.min(SPEED_MAX, +(speed + 0.05).toFixed(2));
      onSpeedChange(newVal);
    }
  }, [isAudio, bpm, speed, onBpmChange, onSpeedChange]);

  const handleSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (isAudio) onBpmChange(v);
      else onSpeedChange(+v.toFixed(2));
    },
    [isAudio, onBpmChange, onSpeedChange],
  );

  const leftLabel = useMemo(() => {
    if (isAudio) return atMin ? 'min' : String(BPM_MIN);
    return atMin ? 'min' : '0.25x';
  }, [isAudio, atMin]);

  const rightLabel = useMemo(() => {
    if (isAudio) return atMax ? 'max' : String(BPM_MAX);
    return atMax ? 'max' : '2x';
  }, [isAudio, atMax]);

  const btnBase =
    'w-[24px] h-[24px] rounded-full border flex items-center justify-center text-[14px] leading-none flex-shrink-0 select-none transition-opacity cursor-pointer';
  const btnDisabled = 'opacity-30 cursor-not-allowed';

  const btnStyle = {
    background: 'var(--bg-card)',
    borderColor: 'var(--border)',
    color: 'var(--text-primary)',
  };

  return (
    <div
      className="rounded-lg p-3 mb-2.5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex justify-between items-center mb-2">
        <span
          className="font-medium tracking-wider"
          style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
          Скорость
        </span>
        <div className="flex items-center gap-2">
          <span
            className="font-bold tracking-tight"
            style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
            {isAudio ? (
              <>
                {bpm}{' '}
                <span
                  className="font-medium"
                  style={{ fontSize: '10px', color: 'var(--accent-secondary)' }}>
                  BPM
                </span>
              </>
            ) : (
              <>
                {speed.toFixed(2)}
                <span
                  className="font-normal"
                  style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                  x
                </span>
              </>
            )}
          </span>
          {showMT && (
            <button
              onClick={onMasterTempoToggle}
              className="w-[32px] h-[24px] rounded text-[10px] font-bold cursor-pointer transition-colors border-0 flex items-center justify-center"
              style={{
                background: masterTempo ? 'var(--accent-primary)' : 'var(--border)',
                color: masterTempo ? '#fff' : 'var(--text-primary)',
              }}
              title="Master Tempo (Key Lock)">
              MT
            </button>
          )}
          <button
            onClick={onReset}
            className="w-[24px] h-[24px] rounded-full border-0 cursor-pointer flex items-center justify-center text-[14px] transition-colors"
            style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
            title="Сбросить скорость">
            ↺
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <button
          className={`${btnBase} ${atMin ? btnDisabled : ''}`}
          style={btnStyle}
          onClick={handleMinus}
          disabled={atMin}>
          −
        </button>
        <div className="flex-1 relative">
          <div className="h-1 rounded-full" style={{ background: 'var(--border)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: 'var(--accent-gradient)' }}
            />
          </div>
          <div
            className="absolute -translate-x-1/2 rounded-full border-2"
            style={{
              top: '-4px',
              left: `${pct}%`,
              width: '12px',
              height: '12px',
              background: 'var(--accent-secondary)',
              borderColor: 'var(--bg-primary)',
              boxShadow: '0 0 8px rgba(88,166,255,0.4)',
            }}
          />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleSlider}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Скорость"
          />
        </div>
        <button
          className={`${btnBase} ${atMax ? btnDisabled : ''}`}
          style={btnStyle}
          onClick={handlePlus}
          disabled={atMax}>
          +
        </button>
      </div>

      <div
        className="flex justify-between text-[8px] px-0.5"
        style={{ color: 'var(--text-muted)' }}>
        <span>{leftLabel}</span>
        <span>{isAudio ? 'BPM' : 'speed'}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
};
