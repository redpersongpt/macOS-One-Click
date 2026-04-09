import { Badge } from '../ui/Badge';
import type { KextResult } from '../../bridge/types';

interface KextStatusRowProps {
  kext: KextResult;
}

export function KextStatusRow({ kext }: KextStatusRowProps) {
  const variant =
    kext.status === 'downloaded' || kext.status === 'cached'
      ? 'success'
      : kext.status === 'failed'
        ? 'danger'
        : ('warning' as const);

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="text-[0.8125rem] text-[--text-primary] flex-1 truncate">{kext.name}</span>
      {kext.version && (
        <span className="text-[0.6875rem] text-[--text-tertiary] shrink-0">{kext.version}</span>
      )}
      <Badge variant={variant} size="sm">
        {kext.status}
      </Badge>
    </div>
  );
}
