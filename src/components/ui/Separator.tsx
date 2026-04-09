import { type HTMLAttributes } from 'react';

export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

export function Separator({
  orientation = 'horizontal',
  className = '',
  ...props
}: SeparatorProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={[
        'shrink-0 bg-[--border-subtle]',
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch',
        className,
      ].join(' ')}
      {...props}
    />
  );
}
