import { create } from 'zustand';
import type { TaskUpdate } from '../bridge/types';

interface TaskStore {
  tasks: Map<string, TaskUpdate>;
  activeTask: TaskUpdate | null;

  handleUpdate: (update: TaskUpdate) => void;
  clear: () => void;
}

export const useTasks = create<TaskStore>((set, get) => ({
  tasks: new Map(),
  activeTask: null,

  handleUpdate: (update) =>
    set((state) => {
      const next = new Map(state.tasks);
      next.set(update.taskId, update);

      // Active task = most recent running task
      const running = Array.from(next.values()).filter(
        (t) => t.status === 'running'
      );
      const activeTask = running.at(-1) ?? null;

      return { tasks: next, activeTask };
    }),

  clear: () => set({ tasks: new Map(), activeTask: null }),
}));
