import React from 'react';

interface BpmKeyCardProps {
  bpm: number | null;
  keyCamelot: string | null;
  isLoading: boolean;
}

export const BpmKeyCard: React.FC<BpmKeyCardProps> = ({ bpm, keyCamelot, isLoading }) => {
  return (
    <div className="flex gap-2">
      {/* BPM */}
      <div
        className="flex-1 rounded-lg p-2 text-center"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div
          className="text-[8px] uppercase tracking-wider mb-1"
          style={{ color: 'var(--text-muted)' }}>
          BPM
        </div>
        {isLoading ? (
          <>
            <div
              className="w-[18px] h-[18px] mx-auto rounded-full border-[2px] animate-spin"
              style={{
                borderColor: 'var(--border)',
                borderTopColor: 'var(--accent-secondary)',
              }}
            />
            <div className="text-[6px] mt-1" style={{ color: 'var(--text-muted)' }}>
              analyzing
            </div>
          </>
        ) : (
          <div className="animate-fade-scale">
            <div
              className="text-xl font-bold tracking-tight"
              style={{ color: 'var(--text-primary)' }}>
              {bpm ?? '--'}
            </div>
            <div className="text-[7px]" style={{ color: 'var(--accent-secondary)' }}>
              Detected
            </div>
          </div>
        )}
      </div>

      {/* KEY */}
      <div
        className="flex-1 rounded-lg p-2 text-center"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div
          className="text-[8px] uppercase tracking-wider mb-1"
          style={{ color: 'var(--text-muted)' }}>
          KEY
        </div>
        {isLoading ? (
          <>
            <div
              className="w-[18px] h-[18px] mx-auto rounded-full border-[2px] animate-spin"
              style={{
                borderColor: 'var(--border)',
                borderTopColor: 'var(--accent-secondary)',
              }}
            />
            <div className="text-[6px] mt-1" style={{ color: 'var(--text-muted)' }}>
              analyzing
            </div>
          </>
        ) : (
          <div className="animate-fade-scale">
            <div
              className="text-xl font-bold tracking-tight"
              style={{ color: 'var(--text-primary)' }}>
              {keyCamelot ?? '--'}
            </div>
            <div className="text-[7px]" style={{ color: 'var(--accent-secondary)' }}>
              Camelot
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
