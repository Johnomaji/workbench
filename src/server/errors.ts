/**
 * Errors that are safe to show to the person who triggered them.
 * Anything else is logged and replaced with a generic message.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "We couldn't find that. It may have been removed.") {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(fieldErrors: Record<string, string[]>, message = "Please check the highlighted fields.") {
    super(message, fieldErrors);
  }
}

export class RateLimitedError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super(
      `Too many attempts. Please wait ${formatWait(retryAfterSeconds)} and try again.`,
    );
  }
}

export function formatWait(seconds: number): string {
  if (seconds < 60) return "a minute";
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
