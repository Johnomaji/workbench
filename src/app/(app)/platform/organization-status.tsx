"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/use-action-form";
import { setOrganizationActiveAction } from "./actions";

export function OrganizationStatus({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const { state, pending, onSubmit } = useActionForm(setOrganizationActiveAction);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-2">
      <FormStatus state={state} />
      {isActive && !confirming ? (
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          Suspend…
        </Button>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="organizationId" value={id} />
          <input type="hidden" name="intent" value={isActive ? "suspend" : "reactivate"} />
          {isActive && <p className="w-full text-sm">Suspend {name}? Nobody in it can open it; nothing is deleted.</p>}
          <SubmitButton pending={pending} pendingLabel="Saving…" variant={isActive ? "danger" : "secondary"} size="sm">
            {isActive ? "Yes, suspend" : "Reactivate"}
          </SubmitButton>
          {isActive && (
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
