export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
  getResponse(): Response {
    return Response.json(
      {
        error: {
          code: this.code,
          message: this.message,
          ...(this.details === undefined ? {} : { details: this.details }),
        },
      },
      { status: this.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export function fail(code: string, message: string, status = 400): never {
  throw new DomainError(code, message, status);
}
export function found<T>(row: T | undefined): T {
  if (!row) fail("NOT_FOUND", "Resource not found.", 404);
  return row;
}
