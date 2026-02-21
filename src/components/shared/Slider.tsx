import { useCallback, useId } from 'react'

export interface SliderProps {
  readonly label: string
  readonly value: number
  readonly onChange: (value: number) => void
  readonly min: number
  readonly max: number
  readonly step?: number
  readonly unit?: string
  readonly disabled?: boolean
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
}: SliderProps) {
  const id = useId()

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value))
    },
    [onChange],
  )

  const displayValue = unit ? `${value}${unit}` : `${value}`

  return (
    <div className={`slider-container${disabled ? ' slider-disabled' : ''}`}>
      <div className="slider-header">
        <label htmlFor={id} className="slider-label">
          {label}
        </label>
        <span className="slider-value">{displayValue}</span>
      </div>
      <input
        id={id}
        type="range"
        className="slider-input"
        value={value}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  )
}
