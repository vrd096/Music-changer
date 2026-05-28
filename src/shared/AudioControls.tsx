import React from 'react';
import type { MediaState, EqBand } from './types';
import { DEFAULT_EQ_BANDS } from './types';
import { translate } from './i18n';
import { MaterialSlider } from './components/MaterialSlider';
import { MaterialToggle } from './components/MaterialToggle';
// ============================================================

export interface AudioControlsProps {
  media: MediaState;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'no-permission';
  onSemitoneChange: (value: number) => void;
  onSpeedChange: (value: number) => void;
  onEqToggle: (checked: boolean) => void;
  eqBands?: EqBand[];
  onEqBandChange?: (index: number, gain: number) => void;
}

// ============================================================
// AudioControls Component
// ============================================================

export const AudioControls: React.FC<AudioControlsProps> = ({
  media,
  connectionStatus,
  onSemitoneChange,
  onSpeedChange,
  onEqToggle,
  eqBands,
  onEqBandChange,
}) => {
  if (connectionStatus === 'connecting') {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <div className="loading-text">{translate('common.connecting') || 'Connecting...'}</div>
      </div>
    );
  }

  if (connectionStatus === 'no-permission') {
    return (
      <div className="no-permission">
        <span className="material-icons">block</span>
        <p>{translate('common.noPermission') || 'No permission for this page'}</p>
      </div>
    );
  }

  return (
    <>
      {/* Pitch Section */}
      <div className="app-card">
        <div className="mat-mdc-card-header">
          <span className="mat-mdc-card-title">{translate('pitch.title') || 'Pitch'}</span>
          <span className="value">
            {media.semitone > 0 ? '+' : ''}
            {media.semitone}
          </span>
        </div>
        <div className="mat-mdc-card-content">
          <MaterialSlider
            label={translate('pitch.semitones') || 'Semitones'}
            value={media.semitone}
            min={-12}
            max={12}
            step={1}
            displayValue={media.semitone > 0 ? `+${media.semitone}` : `${media.semitone}`}
            onChange={onSemitoneChange}
            onReset={() => onSemitoneChange(0)}
          />
        </div>
      </div>

      {/* Speed Section */}
      <div className="app-card">
        <div className="mat-mdc-card-header">
          <span className="mat-mdc-card-title">{translate('speed.title') || 'Speed'}</span>
          <span className="value">{media.speed.toFixed(2)}x</span>
        </div>
        <div className="mat-mdc-card-content">
          <MaterialSlider
            label={translate('speed.speed') || 'Speed'}
            value={media.speed}
            min={0.25}
            max={4}
            step={0.05}
            unit="x"
            displayValue={media.speed.toFixed(2)}
            onChange={onSpeedChange}
            onReset={() => onSpeedChange(1)}
          />
        </div>
      </div>

      {/* EQ Section */}
      <div className="app-card">
        <div className="mat-mdc-card-header">
          <span className="mat-mdc-card-title">{translate('eq.title') || 'Equalizer'}</span>
        </div>
        <div className="mat-mdc-card-content">
          <MaterialToggle
            label={translate('eq.enable') || 'Enable EQ'}
            checked={(media as any).eqEnabled}
            onChange={onEqToggle}
          />
          {(media as any).eqEnabled && (
            <div className="eq-bands">
              {(eqBands || DEFAULT_EQ_BANDS).map((band, i) => (
                <MaterialSlider
                  key={i}
                  label={
                    band.type === 'highpass'
                      ? `↙ ${band.frequency} Hz HP`
                      : band.type === 'highshelf'
                        ? `↗ ${(band.frequency / 1000).toFixed(0)} kHz HS`
                        : band.type === 'lowshelf'
                          ? `↙ ${band.frequency} Hz LS`
                          : `${band.frequency >= 1000 ? (band.frequency / 1000).toFixed(1) + ' kHz' : band.frequency + ' Hz'}`
                  }
                  value={band.gain}
                  min={-12}
                  max={12}
                  step={0.5}
                  unit=" dB"
                  displayValue={band.gain > 0 ? `+${band.gain.toFixed(1)}` : band.gain.toFixed(1)}
                  noCard={false}
                  onChange={(value) => onEqBandChange?.(i, value)}
                  onReset={() => onEqBandChange?.(i, 0)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
