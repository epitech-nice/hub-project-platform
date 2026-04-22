import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

const PADDING = {
  default: 'p-5.5',
  compact: 'p-4.5',
  none: '',
};

const Card = forwardRef(function Card(
  { padding = 'default', interactive = false, as: Tag = 'div', children, className = '', ...props },
  ref
) {
  return (
    <Tag
      ref={ref}
      className={cn(
        'bg-surface border border-border rounded-lg shadow-sm',
        PADDING[padding] ?? PADDING.default,
        interactive && 'hover:shadow-md transition-shadow duration-200 ease-smooth cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
});

function CardHeader({ children, className = '' }) {
  return (
    <div className={cn('pb-4 border-b border-border', className)}>
      {children}
    </div>
  );
}

function CardBody({ children, className = '' }) {
  return (
    <div className={cn('py-4', className)}>
      {children}
    </div>
  );
}

function CardFooter({ children, className = '' }) {
  return (
    <div className={cn('pt-4 border-t border-border', className)}>
      {children}
    </div>
  );
}

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export default Card;
