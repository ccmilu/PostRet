import { render, screen } from '@testing-library/react'
import { Card } from '@/components/shared/Card'

describe('Card', () => {
  it('renders children content', () => {
    render(
      <Card>
        <p>Card content</p>
      </Card>,
    )

    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('renders title when provided', () => {
    render(
      <Card title="通用设置">
        <p>Content</p>
      </Card>,
    )

    expect(screen.getByText('通用设置')).toBeInTheDocument()
  })

  it('does not render title element when title is not provided', () => {
    const { container } = render(
      <Card>
        <p>Content</p>
      </Card>,
    )

    expect(container.querySelector('.card-title')).not.toBeInTheDocument()
  })

  it('applies base card class', () => {
    const { container } = render(
      <Card>
        <p>Content</p>
      </Card>,
    )

    expect(container.querySelector('.card')).toBeInTheDocument()
  })

  it('appends custom className when provided', () => {
    const { container } = render(
      <Card className="my-custom-class">
        <p>Content</p>
      </Card>,
    )

    const card = container.querySelector('.card')
    expect(card).toHaveClass('card')
    expect(card).toHaveClass('my-custom-class')
  })

  it('does not append extra class when className is not provided', () => {
    const { container } = render(
      <Card>
        <p>Content</p>
      </Card>,
    )

    const card = container.querySelector('.card')
    expect(card?.className).toBe('card')
  })

  it('wraps children in card-content div', () => {
    const { container } = render(
      <Card>
        <span data-testid="child">Hello</span>
      </Card>,
    )

    const content = container.querySelector('.card-content')
    expect(content).toBeInTheDocument()
    expect(content?.querySelector('[data-testid="child"]')).toBeInTheDocument()
  })

  it('renders multiple children', () => {
    render(
      <Card>
        <p>First</p>
        <p>Second</p>
        <p>Third</p>
      </Card>,
    )

    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
    expect(screen.getByText('Third')).toBeInTheDocument()
  })
})
