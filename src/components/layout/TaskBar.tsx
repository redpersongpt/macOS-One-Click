import { useTasks } from '../../stores/tasks';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

export default function TaskBar() {
  const activeTask = useTasks((s) => s.activeTask);

  if (!activeTask) return null;

  const progress = activeTask.progress ?? 0;
  const isComplete = activeTask.status === 'completed';
  const isFailed = activeTask.status === 'failed';

  return (
    <div className="border-t border-[#222225] bg-[#09090b] px-4 py-2">
      <div className="flex items-center gap-3">
        {isComplete ? (
          <CheckCircle2 size={14} className="text-[#22c55e] flex-shrink-0" />
        ) : isFailed ? (
          <XCircle size={14} className="text-[#ef4444] flex-shrink-0" />
        ) : (
          <Loader2 size={14} className="animate-spin text-[#3b82f6] flex-shrink-0" />
        )}

        <span className="text-[12px] text-[#a0a0a8] truncate flex-1">
          {activeTask.message ?? activeTask.kind}
        </span>

        {!isComplete && !isFailed && (
          <span className="text-[11px] text-[#6e6e76] tabular-nums">
            {Math.round(progress * 100)}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      {!isComplete && !isFailed && (
        <div className="mt-1.5 h-[2px] w-full rounded-full bg-[#1a1a1d] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#3b82f6] transition-[width] duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
