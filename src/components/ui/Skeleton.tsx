import React, { type HTMLAttributes } from 'react';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  className?: string;
  style?: React.CSSProperties;
  key?: React.Key;
}

export function Skeleton({
  width,
  height,
  rounded = false,
  className = '',
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={[
        'oc-skeleton',
        rounded ? 'rounded-full' : 'rounded',
        className,
      ].join(' ')}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  );
}

/** Stack of skeleton lines for text blocks */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  const widths = ['w-full', 'w-4/5', 'w-3/5', 'w-2/3', 'w-11/12'];
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} className={widths[i % widths.length]} />
      ))}
    </div>
  );
}
