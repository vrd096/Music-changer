import React, { useCallback } from 'react';

interface TonalityCardProps {
  semitone: number;
  onChange: (value: number) => void;
}

export const TonalityCard: React.FC<TonalityCardProps> = ({ semitone, onChange }) => {
  const percentage = ((semitone + 12) / 24) * 100;
  const fmtValue = semitone > 0 ? `+${semitone}` : `${semitone}`;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  return (
    <div
      className="rounded-lg p-3 mb-2.5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex justify-between items-center mb-2">
        <span
          className="font-medium tracking-wider"
          style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
          Тональность
        </span>
        <span
          className="font-bold tracking-tight"
          style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
          {fmtValue}{' '}
          <span
            className="font-normal"
            style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            st
          </span>
        </span>
      </div>

      {/* Custom range slider */}
      <div className="relative mb-1">
        <div className="h-1 rounded-full" style={{ background: 'var(--border)' }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${percentage}%`,
              background: 'var(--accent-gradient)',
            }}
          />
        </div>
        <div
          className="absolute -translate-x-1/2 rounded-full border-2"
          style={{
            top: '-4px',
            left: `${percentage}%`,
            width: '12px',
            height: '12px',
            background: 'var(--accent-secondary)',
            borderColor: 'var(--bg-primary)',
            boxShadow: '0 0 8px rgba(88,166,255,0.4)',
          }}
        />
        <input
          type="range"
          min={-12}
          max={12}
          step={1}
          value={semitone}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Тональность"
        />
      </div>

      <div className="flex justify-between text-[8px]" style={{ color: 'var(--text-muted)' }}>
        <span>−12</span>
        <span>0</span>
        <span>+12</span>
      </div>
    </div>
  );
};
