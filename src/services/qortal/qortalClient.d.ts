export function isQortalRequestAvailable(): boolean;

export function requestQortal(
  payload: Record<string, unknown>,
  options?: {
    timeoutMs?: number;
  },
): Promise<any>;
