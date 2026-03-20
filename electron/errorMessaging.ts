export type ErrorCategory = 'app_error' | 'environment_error' | 'hardware_error';

export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  explanation: string;
  suggestion: string;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function isGenericMessage(message: string): boolean {
  const normalized = normalize(message).toLowerCase();
  return normalized === ''
    || normalized === 'operation failed'
    || normalized === 'unknown error'
    || normalized === 'error'
    || normalized === 'failed';
}

export function buildUserFacingErrorMessage(classified: ClassifiedError, originalError?: unknown): string {
  const message = normalize(classified.message);
  const explanation = normalize(classified.explanation);
  const original = normalize(originalError instanceof Error ? originalError.message : String(originalError ?? ''));

  if (message && explanation) {
    if (message.toLowerCase() === explanation.toLowerCase()) {
      return explanation;
    }
    if (explanation.toLowerCase().startsWith(message.toLowerCase())) {
      return explanation;
    }
    if (isGenericMessage(message)) {
      return explanation;
    }
    return `${message}: ${explanation}`;
  }

  if (explanation) return explanation;
  if (message) return message;
  if (original) return original;
  return 'Operation failed';
}

export function createClassifiedIpcError(classified: ClassifiedError, originalError?: unknown): Error {
  const wrapped = new Error(buildUserFacingErrorMessage(classified, originalError));
  (wrapped as Error & { classified?: ClassifiedError }).classified = classified;
  return wrapped;
}
