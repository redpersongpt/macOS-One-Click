import { type HTMLAttributes, type CSSProperties } from 'react';

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  maxHeight?: string | number;
  /** Remove horizontal overflow constraint */
  horizontal?: boolean;
}

export function ScrollArea({
  maxHeight,
  horizontal = false,
  className = '',
  style,
  children,
  ...props
}: ScrollAreaProps) {
  const computedStyle: CSSProperties = {
    maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
    ...style,
  };

  return (
    <div
      className={[
        'oc-scroll',
        horizontal ? 'overflow-x-auto' : 'overflow-x-hidden',
        className,
      ].join(' ')}
      style={computedStyle}
      {...props}
    >
      {children}
    </div>
  );
}
