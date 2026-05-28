import React, { useRef } from 'react';
import { translate } from '../i18n';

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

export const MaterialSlider: React.FC<SliderProps> = ({
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

  if (noCard) return slider;

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
