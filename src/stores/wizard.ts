import { create } from 'zustand';

export type Step =
  | 'welcome'
  | 'scan'
  | 'compatibility'
  | 'prerequisites'
  | 'bios'
  | 'build'
  | 'review'
  | 'deploy'
  | 'complete';

const STEP_ORDER: Step[] = [
  'welcome',
  'scan',
  'compatibility',
  'prerequisites',
  'bios',
  'build',
  'review',
  'deploy',
  'complete',
];

interface WizardStore {
  step: Step;
  history: Step[];
  completedSteps: Set<Step>;

  goTo: (step: Step) => void;
  goBack: () => void;
  goNext: () => void;
  markCompleted: (step: Step) => void;
  reset: () => void;

  canGoBack: () => boolean;
  canGoNext: () => boolean;
  stepIndex: () => number;
  totalSteps: () => number;
}

export const useWizard = create<WizardStore>((set, get) => ({
  step: 'welcome',
  history: [],
  completedSteps: new Set(),

  goTo: (step) =>
    set((state) => ({
      step,
      history: [...state.history, state.step],
    })),

  goBack: () =>
    set((state) => {
      const prev = state.history.at(-1);
      if (!prev) return state;
      return {
        step: prev,
        history: state.history.slice(0, -1),
      };
    }),

  goNext: () => {
    const { step } = get();
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) {
      get().goTo(STEP_ORDER[idx + 1]);
    }
  },

  markCompleted: (step) =>
    set((state) => {
      const next = new Set(state.completedSteps);
      next.add(step);
      return { completedSteps: next };
    }),

  reset: () =>
    set({
      step: 'welcome',
      history: [],
      completedSteps: new Set(),
    }),

  canGoBack: () => get().history.length > 0,
  canGoNext: () => {
    const idx = STEP_ORDER.indexOf(get().step);
    return idx < STEP_ORDER.length - 1;
  },
  stepIndex: () => STEP_ORDER.indexOf(get().step),
  totalSteps: () => STEP_ORDER.length,
}));

export { STEP_ORDER };
