import type { HTMLAttributes } from 'react';
import styles from './Badge.module.css';

type BadgeVariant = 'default' | 'success' | 'danger';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'default', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={[styles.badge, variant !== 'default' && styles[variant], className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </span>
  );
}
