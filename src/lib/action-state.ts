/** Result of a form's server action, shared by server and client code. */
export type ActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

export const idleState: ActionState = { status: "idle" };

export function fieldError(state: ActionState, field: string): string | undefined {
  return state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;
}
