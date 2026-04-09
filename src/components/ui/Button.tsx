import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      leadingIcon,
      trailingIcon,
      disabled,
      className = '',
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    const base = 'inline-flex items-center justify-center rounded-[6px] font-medium transition-colors duration-100 select-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-1 focus-visible:ring-offset-[#09090b] disabled:cursor-not-allowed disabled:opacity-40';

    const variants: Record<ButtonVariant, string> = {
      primary: 'bg-[#f0f0f2] text-[#09090b] hover:bg-[#dadadf] active:bg-[#a0a0a8]',
      secondary: 'bg-[#1a1a1d] text-[#a0a0a8] border border-[#2e2e32] hover:bg-[#222225] hover:text-[#dadadf] active:bg-[#2e2e32]',
      danger: 'bg-[#7f1d1d] text-[#fca5a5] hover:bg-[#991b1b] active:bg-[#6f1b1b]',
      ghost: 'bg-transparent text-[#6e6e76] hover:bg-[#1a1a1d] hover:text-[#a0a0a8] active:bg-[#222225]',
    };

    const sizes: Record<ButtonSize, string> = {
      sm: 'h-7 px-2.5 gap-1.5 text-[12px]',
      md: 'h-8 px-3.5 gap-2 text-[13px]',
      lg: 'h-9 px-4 gap-2 text-[13px]',
    };

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <Loader2 size={14} className="shrink-0 animate-spin" />
        ) : leadingIcon ? (
          <span className="shrink-0 flex items-center [&>svg]:w-3.5 [&>svg]:h-3.5">{leadingIcon}</span>
        ) : null}
        {children}
        {!loading && trailingIcon && (
          <span className="shrink-0 flex items-center [&>svg]:w-3.5 [&>svg]:h-3.5">{trailingIcon}</span>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';
