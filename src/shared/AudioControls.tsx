// ============================================================
// Shared AudioControls, MaterialSlider, MaterialToggle
// Используется в sidepanel/App.tsx и popup/App.tsx
// ============================================================

import React, { useRef } from 'react';
import type { MediaState, EqBand } from './types';
import { DEFAULT_EQ_BANDS } from './types';
import { translate } from './i18n';

// ============================================================
// Slider
// ============================================================

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  displayValue?: string;
  disabled?: boolean;
  noCard?: boolean;
  onChange: (value: number) => void;
  onReset?: () => void;
}

const MaterialSlider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  displayValue,
  disabled = false,
  noCard = false,
  onChange,
  onReset,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const percentage = ((value - min) / (max - min)) * 100;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  const fmtValue = displayValue ?? (value > 0 ? `+${value}` : `${value}`);

  const slider = (
    <div className="card-content">
      <div className="mdc-slider" ref={trackRef}>
        <div className="mdc-slider__track">
          <div className="mdc-slider__track--inactive" />
          <div className="mdc-slider__track--active" style={{ width: `${percentage}%` }} />
        </div>
        <input
          type="range"
          className="mdc-slider__input"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={handleChange}
          aria-label={label}
        />
        <div className="mdc-slider__thumb" style={{ left: `${percentage}%` }}>
          <div className="mdc-slider__thumb-knob" />
        </div>
      </div>
    </div>
  );

  if (noCard) {
    return slider;
  }

  return (
    <div className={`app-collapsible-card ${disabled ? 'disabled' : ''}`}>
      <div className="card-header">
        <span className="card-title">{label}</span>
        <span className="display-value">
          {fmtValue}
          {unit}
        </span>
        <div className="right-buttons">
          {onReset && value !== 0 && (
            <button
              className="icon-button icon-button-xs show-on-hover"
              onClick={onReset}
              title={translate('common.reset') || 'Reset'}>
              <span className="material-icons">undo</span>
            </button>
          )}
        </div>
      </div>
      {slider}
    </div>
  );
};

// ============================================================
// Toggle Switch
// ============================================================

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

const MaterialToggle: React.FC<ToggleProps> = ({ label, checked, onChange, disabled = false }) => {
  return (
    <div className={`toggle-row ${disabled ? 'disabled' : ''}`}>
      <span className="toggle-label">{label}</span>
      <label className="mdc-switch">
        <input
          type="checkbox"
          className="mdc-switch__native-control"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="mdc-switch__track">
          <div className="mdc-switch__handle-track">
            <div className="mdc-switch__handle">
              <div className="mdc-switch__shadow" />
              <div className="mdc-switch__ripple" />
            </div>
          </div>
        </div>
      </label>
    </div>
  );
};

// ============================================================
// AudioControls Props
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
