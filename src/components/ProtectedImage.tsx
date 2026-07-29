import { useQuery } from '@tanstack/react-query';
import { Image as ImageIcon } from 'lucide-react';
import { createSignedFileUrl } from '@/services/storage-service';
import { cn } from '@/lib/utils';

export function ProtectedImage({ bucket, path, alt, className, onClick }: { bucket: string; path: string | null | undefined; alt: string; className?: string; onClick?: (url: string) => void }) {
  const query = useQuery({ queryKey: ['signed-file', bucket, path], queryFn: () => createSignedFileUrl(bucket, String(path), 900), enabled: Boolean(path), staleTime: 12 * 60 * 1000 });
  if (!path || query.isError) return <div className={cn('flex items-center justify-center rounded-lg bg-muted text-muted-foreground', className)} aria-label={alt}><ImageIcon className="size-5" /></div>;
  if (query.isPending) return <div className={cn('animate-pulse rounded-lg bg-muted', className)} aria-label={alt} />;
  const image = <img src={query.data} alt={alt} className={cn('object-cover', className)} loading="lazy" decoding="async" />;
  return onClick ? <button type="button" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onClick(query.data)}>{image}</button> : image;
}
