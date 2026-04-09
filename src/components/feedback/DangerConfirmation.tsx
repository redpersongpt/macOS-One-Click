import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export interface DangerConfirmationProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /**
   * List of consequences shown below the title.
   * Renders as a bulleted list.
   */
  consequences: string[];
  /**
   * The exact phrase the user must type to unlock the confirm button.
   */
  confirmPhrase?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
}

/** Cooldown in milliseconds after phrase is matched before button enables */
const COOLDOWN_MS = 3000;

export function DangerConfirmation({
  open,
  onClose,
  onConfirm,
  title,
  consequences,
  confirmPhrase,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
}: DangerConfirmationProps) {
  const [inputValue, setInputValue] = useState('');
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [cooldownStarted, setCooldownStarted] = useState(false);

  const requiresPhrase = Boolean(confirmPhrase);
  const phraseMatched = !requiresPhrase || inputValue === confirmPhrase;
  const canConfirm = phraseMatched && cooldownRemaining === 0;

  // Reset state when dialog closes/opens
  useEffect(() => {
    if (!open) {
      setInputValue('');
      setCooldownRemaining(0);
      setCooldownStarted(false);
    }
  }, [open]);

  // Start cooldown when phrase first matches
  useEffect(() => {
    if (phraseMatched && !cooldownStarted) {
      setCooldownStarted(true);
      setCooldownRemaining(Math.ceil(COOLDOWN_MS / 1000));
    }

    if (!phraseMatched) {
      setCooldownStarted(false);
      setCooldownRemaining(0);
    }
  }, [phraseMatched, cooldownStarted]);

  // Tick down the cooldown
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const handleConfirm = useCallback(() => {
    if (canConfirm && !loading) {
      onConfirm();
    }
  }, [canConfirm, loading, onConfirm]);

  const buttonLabel =
    cooldownRemaining > 0
      ? `${confirmLabel} (${cooldownRemaining}s)`
      : confirmLabel;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2 text-[--color-red-6]">
          <AlertOctagon size={15} className="shrink-0" aria-hidden />
          {title}
        </span>
      }
      width="max-w-sm"
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleConfirm}
            disabled={!canConfirm}
            loading={loading}
          >
            {buttonLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Consequences */}
        {consequences.length > 0 && (
          <div className="rounded-md bg-[--color-red-1] border border-[--color-red-3] px-4 py-3">
            <p className="text-[0.75rem] font-semibold text-[--color-red-6] mb-2 uppercase tracking-wide">
              This action will
            </p>
            <ul className="flex flex-col gap-1.5">
              {consequences.map((c, i) => (
                <li
                  key={i}
                  className="text-[0.8125rem] text-[--color-red-7] leading-snug flex items-start gap-2"
                >
                  <span className="text-[--color-red-5] mt-[3px] shrink-0" aria-hidden>
                    &mdash;
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Type-to-confirm */}
        {requiresPhrase && (
          <div className="flex flex-col gap-2">
            <label
              htmlFor="danger-confirm-input"
              className="text-[0.75rem] text-[--text-secondary] leading-snug"
            >
              Type{' '}
              <span className="font-mono text-[--text-primary] font-medium">
                {confirmPhrase}
              </span>{' '}
              to continue
            </label>
            <input
              id="danger-confirm-input"
              type="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
              }}
              placeholder={confirmPhrase}
              className={[
                'w-full h-8 px-3 rounded-md',
                'bg-[--surface-1] border',
                'text-[0.8125rem] font-mono text-[--text-primary]',
                'placeholder:text-[--text-tertiary]',
                'outline-none transition-colors',
                phraseMatched
                  ? 'border-[--color-green-3] ring-1 ring-[--color-green-3]/30'
                  : 'border-[--border] focus:border-[--accent]',
              ].join(' ')}
            />

            {phraseMatched && cooldownRemaining > 0 && (
              <p className="text-[0.75rem] text-[--text-tertiary]">
                Button enables in {cooldownRemaining}s
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
