import { forwardRef } from 'react';

const VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  ghost: 'bg-transparent text-primary hover:bg-primary-ghost',
  outline: 'border border-primary text-primary hover:bg-primary-ghost',
  danger: 'bg-danger text-white hover:opacity-90',
  subtle: 'bg-surface-2 text-text hover:bg-border',
};

const SIZES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
  lg: 'h-12 px-5 text-md',
};

const Spinner = () => (
  <svg
    className="animate-spin h-4 w-4"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    as: Tag = 'button',
    href,
    children,
    className = '',
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;

  const base =
    'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
    'transition-colors duration-200 ease-smooth ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed ' +
    'min-h-[40px] md:min-h-0';

  const classes = [base, VARIANTS[variant] ?? VARIANTS.primary, SIZES[size] ?? SIZES.md, className]
    .join(' ')
    .trim();

  const linkProps = Tag === 'a' ? { href } : {};
  const buttonProps = Tag === 'button' ? { type: 'button', disabled: isDisabled } : {};

  return (
    <Tag ref={ref} className={classes} aria-disabled={isDisabled || undefined} {...linkProps} {...buttonProps} {...props}>
      {loading && <Spinner />}
      {children}
    </Tag>
  );
});

export default Button;
