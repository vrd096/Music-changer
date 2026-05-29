import React, { useCallback } from 'react';
import type { EqBand } from '../../shared/types';
import { DEFAULT_EQ_BANDS } from '../../shared/types';

interface EqCardProps {
  enabled: boolean;
  bands: EqBand[];
  onToggle: (checked: boolean) => void;
  onBandChange: (index: number, gain: number) => void;
}

const FREQ_LABELS = ['30', '120', '350', '1.2k', '3.5k', '9k'];

export const EqCard: React.FC<EqCardProps> = ({ enabled, bands, onToggle, onBandChange }) => {
  const displayBands = bands.length === 6 ? bands : DEFAULT_EQ_BANDS;

  const handleToggle = useCallback(() => {
    onToggle(!enabled);
  }, [enabled, onToggle]);

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
      {enabled && (
        <>
          <div className="flex justify-between mb-1 px-px">
            {FREQ_LABELS.map((label) => (
              <span key={label} className="text-[7px]" style={{ color: 'var(--text-muted)' }}>
                {label}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px] h-[50px] items-end">
            {displayBands.map((band, i) => {
              const heightPct = ((band.gain + 12) / 24) * 100;
              return (
                <div key={i} className="flex-1 relative">
                  <div
                    className="rounded-t-sm w-full"
                    style={{
                      height: `${heightPct}%`,
                      background: enabled
                        ? 'linear-gradient(to top, rgba(110,64,201,0.6), rgba(88,166,255,0.6))'
                        : 'var(--border)',
                    }}>
                    <div
                      className="absolute rounded-full"
                      style={{
                        top: '-2px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '6px',
                        height: '6px',
                        background: enabled ? 'var(--accent-secondary)' : 'var(--text-muted)',
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.5}
                    value={band.gain}
                    onChange={(e) => onBandChange(i, Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    aria-label={`EQ band ${FREQ_LABELS[i]}`}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
