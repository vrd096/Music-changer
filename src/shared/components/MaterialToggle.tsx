import React from 'react';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const MaterialToggle: React.FC<ToggleProps> = ({
  label,
  checked,
  onChange,
  disabled = false,
}) => {
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
