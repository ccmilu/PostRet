import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toggle } from '@/components/shared/Toggle'

describe('Toggle', () => {
  const defaultProps = {
    label: '启用检测',
    checked: false,
    onChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders label text', () => {
    render(<Toggle {...defaultProps} />)

    expect(screen.getByText('启用检测')).toBeInTheDocument()
  })

  it('renders as unchecked by default', () => {
    render(<Toggle {...defaultProps} checked={false} />)

    const input = screen.getByRole('switch')
    expect(input).not.toBeChecked()
  })

  it('renders as checked when checked prop is true', () => {
    render(<Toggle {...defaultProps} checked />)

    const input = screen.getByRole('switch')
    expect(input).toBeChecked()
  })

  it('calls onChange with true when toggled on', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Toggle {...defaultProps} onChange={onChange} />)

    const input = screen.getByRole('switch')
    await user.click(input)

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onChange with false when toggled off', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Toggle {...defaultProps} checked onChange={onChange} />)

    const input = screen.getByRole('switch')
    await user.click(input)

    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('renders description when provided', () => {
    render(
      <Toggle {...defaultProps} description="启用后将持续监测您的坐姿" />,
    )

    expect(
      screen.getByText('启用后将持续监测您的坐姿'),
    ).toBeInTheDocument()
  })

  it('does not render description when not provided', () => {
    const { container } = render(<Toggle {...defaultProps} />)

    expect(
      container.querySelector('.toggle-description'),
    ).not.toBeInTheDocument()
  })

  it('disables the input when disabled prop is true', () => {
    render(<Toggle {...defaultProps} disabled />)

    const input = screen.getByRole('switch')
    expect(input).toBeDisabled()
  })

  it('applies disabled class when disabled', () => {
    const { container } = render(<Toggle {...defaultProps} disabled />)

    const wrapper = container.querySelector('.toggle-container')
    expect(wrapper).toHaveClass('toggle-disabled')
  })

  it('does not apply disabled class when enabled', () => {
    const { container } = render(<Toggle {...defaultProps} />)

    const wrapper = container.querySelector('.toggle-container')
    expect(wrapper).not.toHaveClass('toggle-disabled')
  })

  it('has correct aria-checked attribute', () => {
    const { rerender } = render(<Toggle {...defaultProps} checked={false} />)

    const input = screen.getByRole('switch')
    expect(input).toHaveAttribute('aria-checked', 'false')

    rerender(<Toggle {...defaultProps} checked />)
    expect(input).toHaveAttribute('aria-checked', 'true')
  })

  it('associates label with input via htmlFor', () => {
    render(<Toggle {...defaultProps} />)

    const input = screen.getByRole('switch')
    const label = screen.getByText('启用检测')
    expect(label).toHaveAttribute('for', input.id)
  })
})
