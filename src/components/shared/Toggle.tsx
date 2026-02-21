import { useCallback, useId } from 'react'

export interface ToggleProps {
  readonly label: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
  readonly description?: string
  readonly disabled?: boolean
}

export function Toggle({
  label,
  checked,
  onChange,
  description,
  disabled = false,
}: ToggleProps) {
  const id = useId()

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.checked)
    },
    [onChange],
  )

  return (
    <div className={`toggle-container${disabled ? ' toggle-disabled' : ''}`}>
      <div className="toggle-content">
        <label htmlFor={id} className="toggle-label">
          {label}
        </label>
        {description && <p className="toggle-description">{description}</p>}
      </div>
      <label className="toggle-switch" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="toggle-input"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          role="switch"
          aria-checked={checked}
          aria-label={label}
        />
        <span className="toggle-track" />
      </label>
    </div>
  )
}
