import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
export function Progress({ value = 0, className, ...props }: HTMLAttributes<HTMLDivElement> & { value?: number }) {
  const normalized = Math.max(0, Math.min(100, value));
  return <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)} {...props}><div className="h-full bg-primary transition-all" style={{ width: `${normalized}%` }} /></div>;
}
