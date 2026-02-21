import { fireEvent, render, screen } from '@testing-library/react'
import { Slider } from '@/components/shared/Slider'

describe('Slider', () => {
  const defaultProps = {
    label: '灵敏度',
    value: 50,
    onChange: vi.fn(),
    min: 0,
    max: 100,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders label and value', () => {
    render(<Slider {...defaultProps} />)

    expect(screen.getByText('灵敏度')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
  })

  it('renders value with unit when provided', () => {
    render(<Slider {...defaultProps} value={5} unit="s" />)

    expect(screen.getByText('5s')).toBeInTheDocument()
  })

  it('renders range input with correct attributes', () => {
    render(<Slider {...defaultProps} step={10} />)

    const input = screen.getByRole('slider')
    expect(input).toHaveAttribute('min', '0')
    expect(input).toHaveAttribute('max', '100')
    expect(input).toHaveAttribute('step', '10')
    expect(input).toHaveValue('50')
  })

  it('uses default step of 1 when not specified', () => {
    render(<Slider {...defaultProps} />)

    const input = screen.getByRole('slider')
    expect(input).toHaveAttribute('step', '1')
  })

  it('calls onChange with numeric value on input change', () => {
    const onChange = vi.fn()
    render(<Slider {...defaultProps} onChange={onChange} />)

    const input = screen.getByRole('slider')
    fireEvent.change(input, { target: { value: '75' } })

    expect(onChange).toHaveBeenCalledWith(75)
  })

  it('disables the input when disabled prop is true', () => {
    render(<Slider {...defaultProps} disabled />)

    const input = screen.getByRole('slider')
    expect(input).toBeDisabled()
  })

  it('applies disabled class when disabled', () => {
    const { container } = render(<Slider {...defaultProps} disabled />)

    const wrapper = container.querySelector('.slider-container')
    expect(wrapper).toHaveClass('slider-disabled')
  })

  it('does not apply disabled class when enabled', () => {
    const { container } = render(<Slider {...defaultProps} />)

    const wrapper = container.querySelector('.slider-container')
    expect(wrapper).not.toHaveClass('slider-disabled')
  })

  it('associates label with input via htmlFor', () => {
    render(<Slider {...defaultProps} />)

    const input = screen.getByRole('slider')
    const label = screen.getByText('灵敏度')
    expect(label).toHaveAttribute('for', input.id)
  })

  it('renders without unit by default', () => {
    render(<Slider {...defaultProps} value={42} />)

    expect(screen.getByText('42')).toBeInTheDocument()
  })
})
