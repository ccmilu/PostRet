export interface CardProps {
  readonly title?: string
  readonly children: React.ReactNode
  readonly className?: string
}

export function Card({ title, children, className }: CardProps) {
  const classes = ['card', className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      {title && <h3 className="card-title">{title}</h3>}
      <div className="card-content">{children}</div>
    </div>
  )
}
