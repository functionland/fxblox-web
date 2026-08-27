export type FulaWebErrorCode =
  | 'NOT_AUTHORIZED'
  | 'HTTP_ERROR'
  | 'BAD_RESPONSE'
  | 'NO_CANDIDATES'
  | 'NO_CERTHASH'
  | 'DIAL_TIMEOUT'
  | 'NO_RESERVATION'
  | 'RELAY_LIMIT'
  | 'CIRCUIT_DATA_CAP'
  | 'TIMEOUT'
  | 'CLIENT_CLOSED'
  | 'UNSUPPORTED_PROTOCOL';

export class FulaWebError extends Error {
  readonly code: FulaWebErrorCode;
  readonly status?: number;
  readonly action?: string;
  override readonly cause?: unknown;

  constructor(
    code: FulaWebErrorCode,
    message: string,
    opts: { status?: number; action?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'FulaWebError';
    this.code = code;
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.action !== undefined) this.action = opts.action;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}
