// ============================================================
// Shared AudioControls, MaterialSlider, MaterialToggle
// Используется в sidepanel/App.tsx и popup/App.tsx
// ============================================================

import React, { useRef } from 'react';
import type { MediaState } from './types';

// ============================================================
// i18n helper (duplicated from App.tsx to avoid circular deps)
// ============================================================
const t = (key: string, ...args: string[]): string => {
  const msg = chrome.i18n.getMessage(key, args);
  return msg || key;
};

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
              title={t('common.reset') || 'Reset'}>
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
}) => {
  if (connectionStatus === 'connecting') {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <div className="loading-text">{t('common.connecting') || 'Connecting...'}</div>
      </div>
    );
  }

  if (connectionStatus === 'no-permission') {
    return (
      <div className="no-permission">
        <span className="material-icons">block</span>
        <p>{t('common.noPermission') || 'No permission for this page'}</p>
      </div>
    );
  }

  return (
    <>
      {/* Pitch Section */}
      <div className="app-card">
        <div className="mat-mdc-card-header">
          <span className="mat-mdc-card-title">{t('pitch.title') || 'Pitch'}</span>
          <span className="value">
            {media.semitone > 0 ? '+' : ''}
            {media.semitone}
          </span>
        </div>
        <div className="mat-mdc-card-content">
          <MaterialSlider
            label={t('pitch.semitones') || 'Semitones'}
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
          <span className="mat-mdc-card-title">{t('speed.title') || 'Speed'}</span>
          <span className="value">{media.speed.toFixed(2)}x</span>
        </div>
        <div className="mat-mdc-card-content">
          <MaterialSlider
            label={t('speed.speed') || 'Speed'}
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
          <span className="mat-mdc-card-title">{t('eq.title') || 'Equalizer'}</span>
        </div>
        <div className="mat-mdc-card-content">
          <MaterialToggle
            label={t('eq.enable') || 'Enable EQ'}
            checked={(media as any).eqEnabled}
            onChange={onEqToggle}
          />
        </div>
      </div>
    </>
  );
};
