"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, FormStatus } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/use-action-form";
import { fieldError } from "@/lib/action-state";
import {
  sendSetupLinkAction,
  setTemporaryPasswordAction,
  setUserActiveAction,
  signOutEverywhereAction,
} from "../actions";

/** invite: never chose a password. added: has an account, hasn't come in yet. reset: in, may have forgotten it. */
export type SetupLinkKind = "invite" | "added" | "reset";

const LINK_COPY: Record<SetupLinkKind, { text: (name: string) => string; button: string }> = {
  invite: { text: (name) => `Email ${name} a new invite link.`, button: "Resend invite" },
  added: { text: (name) => `Remind ${name} they've been added, with a link straight here.`, button: "Email them again" },
  reset: { text: (name) => `Forgotten their password? Email ${name} a link to choose a new one.`, button: "Email a reset link" },
};

export function SignInPanel({
  userId,
  name,
  isActive,
  linkKind,
  canSetPassword,
  canSignOut,
}: {
  userId: string;
  name: string;
  isActive: boolean;
  linkKind: SetupLinkKind;
  /** Only for accounts that live in this organization alone. */
  canSetPassword: boolean;
  canSignOut: boolean;
}) {
  const link = useActionForm(sendSetupLinkAction);
  const temp = useActionForm(setTemporaryPasswordAction);
  const signOut = useActionForm(signOutEverywhereAction);
  const [showTemp, setShowTemp] = useState(false);

  if (!isActive) {
    return <p className="text-sm text-muted">Reactivate this account to change how {name} signs in.</p>;
  }

  return (
    <div className="space-y-5">
      <form onSubmit={link.onSubmit} className="space-y-3">
        <input type="hidden" name="userId" value={userId} />
        <FormStatus state={link.state} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">{LINK_COPY[linkKind].text(name)}</p>
          <SubmitButton pending={link.pending} pendingLabel="Sending…" variant="secondary" className="shrink-0">
            {LINK_COPY[linkKind].button}
          </SubmitButton>
        </div>
      </form>

      {canSetPassword && (
        <div className="space-y-3 border-t border-border pt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">No email access? Set a temporary password and share it privately.</p>
            <Button variant="secondary" className="shrink-0" aria-expanded={showTemp} onClick={() => setShowTemp((v) => !v)}>
              {showTemp ? "Cancel" : "Set a temporary password"}
            </Button>
          </div>
          {temp.state.status === "success" && <FormStatus state={temp.state} />}
          {showTemp && temp.state.status !== "success" && (
            <form onSubmit={temp.onSubmit} className="space-y-3 rounded-lg border border-border p-4" noValidate>
              <input type="hidden" name="userId" value={userId} />
              {temp.state.status === "error" && !temp.state.fieldErrors && <FormStatus state={temp.state} />}
              <TextField
                id="temporaryPassword"
                name="temporaryPassword"
                type="text"
                label="Temporary password"
                hint="At least 10 characters. This also signs them out everywhere."
                autoComplete="off"
                spellCheck={false}
                required
                error={fieldError(temp.state, "temporaryPassword")}
              />
              <SubmitButton pending={temp.pending} pendingLabel="Saving…">
                Set temporary password
              </SubmitButton>
            </form>
          )}
        </div>
      )}

      {canSignOut && (
        <form onSubmit={signOut.onSubmit} className="space-y-3 border-t border-border pt-5">
          <input type="hidden" name="userId" value={userId} />
          <FormStatus state={signOut.state} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">Lost phone or shared computer? Sign them out on every device.</p>
            <SubmitButton pending={signOut.pending} pendingLabel="Signing out…" variant="secondary" className="shrink-0">
              Sign out everywhere
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}

export function AccountStatusPanel({
  userId,
  name,
  isActive,
  isSelf,
  openTaskCount,
  organizationName,
}: {
  userId: string;
  name: string;
  isActive: boolean;
  isSelf: boolean;
  openTaskCount: number;
  organizationName: string;
}) {
  const { state, pending, onSubmit } = useActionForm(setUserActiveAction);
  const [confirming, setConfirming] = useState(false);

  if (!isActive) {
    return (
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="intent" value="reactivate" />
        <FormStatus state={state} />
        <SubmitButton pending={pending} pendingLabel="Reactivating…" variant="secondary">
          Reactivate in {organizationName}
        </SubmitButton>
      </form>
    );
  }

  if (isSelf) {
    return <p className="text-sm text-muted">You can&apos;t deactivate yourself. Ask another administrator.</p>;
  }

  return (
    <div className="space-y-3">
      <FormStatus state={state} />
      {!confirming ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Someone left the team? Deactivate them in {organizationName}. Nothing they did is deleted.
          </p>
          <Button variant="secondary" className="shrink-0" onClick={() => setConfirming(true)}>
            Deactivate…
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-danger/40 bg-danger-surface p-4">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="intent" value="deactivate" />
          <p className="font-medium">Deactivate {name}?</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>They&apos;ll lose access to {organizationName} straight away.</li>
            <li>Their comments, files and history stay, and you can reactivate them later.</li>
            <li>If they use Workbench in other organizations, those aren&apos;t affected.</li>
          </ul>
          {openTaskCount > 0 && (
            <Alert tone="warning">
              {name} has {openTaskCount} open {openTaskCount === 1 ? "task" : "tasks"}. Reassign{" "}
              {openTaskCount === 1 ? "it" : "them"} afterwards so work doesn&apos;t get stuck.
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <SubmitButton pending={pending} pendingLabel="Deactivating…" variant="danger">
              Yes, deactivate
            </SubmitButton>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
