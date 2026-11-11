import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { AppError } from "@/server/errors";

/**
 * Converts an error thrown inside a server action into form state.
 * Next.js control-flow errors (redirect, notFound) are re-thrown untouched.
 * Unexpected errors are logged and shown as a generic message.
 */
export function toErrorState(error: unknown): ActionState {
  unstable_rethrow(error);
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
  }
  console.error(error);
  return { status: "error", message: "Something went wrong on our side. Please try again." };
}
