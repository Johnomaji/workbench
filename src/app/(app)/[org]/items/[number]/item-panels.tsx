"use client";

import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { CopyScriptButton } from "@/components/copy-script-button";
import { clearScriptDraft, ScriptEditor } from "@/components/script-editor";
import { ScriptDocView } from "@/components/script-doc-view";
import { TaskStatusBadges } from "@/components/task-status";
import { Button } from "@/components/ui/button";
import { Alert, FormStatus } from "@/components/ui/feedback";
import { Checkbox, FieldError, inputClasses, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/use-action-form";
import { fieldError, type ActionState } from "@/lib/action-state";
import { EMPTY_SCRIPT } from "@/lib/script-doc";
import type { ItemDetail, TaskView } from "@/server/items/queries";
import type { ItemActions, TaskActions } from "@/server/workflow/engine";
import {
  archiveAction,
  reassignAction,
  requestChangesAction,
  resolveChangeRequestAction,
  saveScriptAction,
  sendBackAction,
  taskAction,
  updateDetailsAction,
} from "../actions";

// ── Unsaved-script flag shared between the script box and the task buttons ──

let scriptDirty = false;
const dirtyListeners = new Set<() => void>();
function setScriptDirty(value: boolean) {
  if (scriptDirty === value) return;
  scriptDirty = value;
  dirtyListeners.forEach((l) => l());
}
function useScriptDirty() {
  return useSyncExternalStore(
    (l) => {
      dirtyListeners.add(l);
      return () => dirtyListeners.delete(l);
    },
    () => scriptDirty,
    () => false,
  );
}

function textareaClasses(rows = "min-h-28") {
  return `${inputClasses} ${rows} py-2`;
}

// ── Script ──────────────────────────────────────────────────────────────

export function ScriptPanel({
  itemId,
  script,
  editScript,
}: {
  itemId: string;
  script: ItemDetail["script"];
  editScript: ItemActions["editScript"];
}) {
  const { state, pending, onSubmit } = useActionForm(saveScriptAction);
  const dirty = useScriptDirty();
  const base = script?.version ?? 0;

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => () => setScriptDirty(false), []);
  useOnSuccess(state, () => {
    setScriptDirty(false);
    clearScriptDraft(itemId);
  });

  if (!editScript.ok) {
    return script ? (
      <div className="space-y-3">
        <div className="flex justify-end">
          <CopyScriptButton doc={script.content} />
        </div>
        <ScriptDocView doc={script.content} className="max-h-[36rem] overflow-auto rounded-lg bg-surface-muted p-4" />
        <p className="text-sm text-muted">{editScript.reason}</p>
      </div>
    ) : (
      <p className="text-sm text-muted">No script yet. {editScript.reason}</p>
    );
  }

  return (
    <form key={base} onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="baseVersion" value={base} />
      <FormStatus state={state} />
      <ScriptEditor itemId={itemId} baseVersion={base} initial={script?.content ?? EMPTY_SCRIPT} onDirtyChange={setScriptDirty} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save script
        </SubmitButton>
        <p className="text-sm text-muted" aria-live="polite">
          {dirty ? "You have unsaved changes. They’re kept on this device until you save." : "Every save keeps a version."}
        </p>
      </div>
    </form>
  );
}

// ── Tasks ───────────────────────────────────────────────────────────────

type Panel = "reassign" | "changes" | "sendBack" | null;

type TaskProps = {
  itemId: string;
  task: TaskView;
  actions: TaskActions;
  sendBack: ItemActions["sendBack"];
  candidates: { id: string; name: string }[];
  stageNames: Record<string, string>;
  templateNames: Record<string, string>;
  canEditScript: boolean;
};

function hasAnyAction(actions: TaskActions) {
  return Object.values(actions).some(Boolean);
}

/** The buttons for one task, and the forms they open. */
function TaskControls({ itemId, task, actions, sendBack, candidates, stageNames, templateNames, canEditScript }: TaskProps) {
  const quick = useActionForm(taskAction);
  const [panel, setPanel] = useState<Panel>(null);
  const dirty = useScriptDirty();
  const blockSubmit = canEditScript && dirty;
  const toggle = (p: Panel) => setPanel((current) => (current === p ? null : p));
  const hasQuick = actions.start || actions.submit || actions.reopen || (actions.pickUp && !actions.start);
  const hasMore = actions.reassign || actions.requestChanges || actions.sendBack;

  return (
    <div className="space-y-3">
      {hasQuick && (
        <form onSubmit={quick.onSubmit} className="space-y-2">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="taskId" value={task.id} />
          <FormStatus state={quick.state} />
          {blockSubmit && actions.submit && (
            <p className="text-sm font-medium text-warning">Save your script changes before sending it on.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {actions.submit && (
              <SubmitButton name="intent" value="submit" pending={quick.pending} disabled={blockSubmit} pendingLabel="Saving…">
                {task.submitLabel}
              </SubmitButton>
            )}
            {actions.start && (
              <SubmitButton name="intent" value="start" pending={quick.pending} variant={actions.submit ? "secondary" : "primary"} pendingLabel="Starting…">
                {task.assignee ? "Start" : "Pick up and start"}
              </SubmitButton>
            )}
            {actions.pickUp && !actions.start && (
              <SubmitButton name="intent" value="pickUp" pending={quick.pending} variant="secondary" pendingLabel="Picking up…">
                Pick up
              </SubmitButton>
            )}
            {actions.reopen && (
              <SubmitButton name="intent" value="reopen" pending={quick.pending} variant="secondary" pendingLabel="Reopening…">
                Reopen
              </SubmitButton>
            )}
          </div>
        </form>
      )}

      {hasMore && (
        <div className={`flex flex-wrap gap-1 ${hasQuick ? "border-t border-border pt-3" : ""}`}>
          {actions.reassign && (
            <Button size="sm" variant="ghost" aria-expanded={panel === "reassign"} onClick={() => toggle("reassign")}>
              {task.assignee ? "Reassign" : "Assign"}
            </Button>
          )}
          {actions.requestChanges && (
            <Button size="sm" variant="ghost" aria-expanded={panel === "changes"} onClick={() => toggle("changes")}>
              Request changes
            </Button>
          )}
          {actions.sendBack && (
            <Button size="sm" variant="ghost" aria-expanded={panel === "sendBack"} onClick={() => toggle("sendBack")}>
              Send back
            </Button>
          )}
        </div>
      )}

      {panel === "reassign" && <ReassignForm itemId={itemId} task={task} candidates={candidates} onDone={() => setPanel(null)} />}
      {panel === "changes" && <RequestChangesForm itemId={itemId} taskId={task.id} onDone={() => setPanel(null)} />}
      {panel === "sendBack" && sendBack && (
        <SendBackForm
          itemId={itemId}
          fromTaskId={task.id}
          sendBack={sendBack}
          stageNames={stageNames}
          templateNames={templateNames}
          onDone={() => setPanel(null)}
        />
      )}
    </div>
  );
}

/** A task at the item's current step: who's on it, its status and every button. */
export function TaskCard(props: TaskProps) {
  const { task, actions } = props;
  return (
    <article aria-labelledby={`task-${task.id}`} className="space-y-3 rounded-xl border border-primary/40 bg-surface p-4">
      <header className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 id={`task-${task.id}`} className="font-semibold">
            {task.name}
          </h3>
          <span className="text-xs text-muted">{task.roleName}</span>
        </div>
        <p className="text-sm">{task.assignee ? task.assignee.name : <span className="text-muted">Nobody yet</span>}</p>
        <div className="flex flex-wrap gap-1.5">
          <TaskStatusBadges status={task.status} active={task.active} changesRequested={task.changesRequested} />
        </div>
      </header>
      {hasAnyAction(actions) && <TaskControls {...props} />}
    </article>
  );
}

/** A task that isn't at the current step: one line, with its buttons behind "Options". */
export function TaskRow(props: TaskProps) {
  const { task, actions } = props;
  const [open, setOpen] = useState(false);
  const panelId = `task-options-${task.id}`;
  return (
    <li className="space-y-3 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {task.name} <span className="font-normal text-muted">· {task.stageName}</span>
          </p>
          <p className="truncate text-sm text-muted">{task.assignee ? task.assignee.name : "Nobody yet"}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <TaskStatusBadges status={task.status} active={task.active} changesRequested={task.changesRequested} />
        </div>
      </div>
      {hasAnyAction(actions) && (
        <>
          <Button size="sm" variant="ghost" className="-ml-3" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
            {open ? "Hide options" : "Options"}
          </Button>
          <div id={panelId} hidden={!open}>
            {open && <TaskControls {...props} />}
          </div>
        </>
      )}
    </li>
  );
}

/** Runs once each time an action succeeds (not on every render). */
function useOnSuccess(state: ActionState, callback: () => void) {
  const onSuccess = useEffectEvent(callback);
  useEffect(() => {
    if (state.status === "success") onSuccess();
  }, [state]);
}

function ReassignForm({
  itemId,
  task,
  candidates,
  onDone,
}: {
  itemId: string;
  task: TaskView;
  candidates: { id: string; name: string }[];
  onDone: () => void;
}) {
  const { state, pending, onSubmit } = useActionForm(reassignAction);
  useOnSuccess(state, onDone);
  const options = candidates.filter((c) => c.id !== task.assignee?.id);
  const selectId = `reassign-${task.id}`;

  if (options.length === 0) {
    return <p className="text-sm text-muted">There&apos;s nobody else with the {task.roleName.toLowerCase()} role.</p>;
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg bg-surface-muted p-3" noValidate>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="taskId" value={task.id} />
      {state.status === "error" && !state.fieldErrors && <FormStatus state={state} />}
      <div className="space-y-1.5">
        <label htmlFor={selectId} className="block text-sm font-medium">
          Give it to
        </label>
        <select id={selectId} name="toUserId" className={inputClasses} required defaultValue="">
          <option value="" disabled>
            Choose a {task.roleName.toLowerCase()}
          </option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <FieldError message={fieldError(state, "toUserId")} />
      </div>
      <TextField id={`note-${task.id}`} name="note" label="Note (optional)" placeholder="e.g. Covering while Drew is away" error={fieldError(state, "note")} />
      <SubmitButton pending={pending} pendingLabel="Reassigning…" size="sm">
        {task.assignee ? "Reassign" : "Assign"}
      </SubmitButton>
    </form>
  );
}

function RequestChangesForm({ itemId, taskId, onDone }: { itemId: string; taskId: string; onDone: () => void }) {
  const { state, pending, onSubmit } = useActionForm(requestChangesAction);
  useOnSuccess(state, onDone);
  const id = `changes-${taskId}`;
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg bg-surface-muted p-3" noValidate>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="taskId" value={taskId} />
      {state.status === "error" && !state.fieldErrors && <FormStatus state={state} />}
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-sm font-medium">
          What needs to change?
        </label>
        <textarea id={id} name="comment" rows={3} className={textareaClasses()} required aria-invalid={fieldError(state, "comment") ? true : undefined} />
        <FieldError message={fieldError(state, "comment")} />
      </div>
      <SubmitButton pending={pending} pendingLabel="Sending…" size="sm">
        Send request
      </SubmitButton>
    </form>
  );
}

export function SendBackForm({
  itemId,
  fromTaskId,
  sendBack,
  stageNames,
  templateNames,
  onDone,
}: {
  itemId: string;
  fromTaskId: string | null;
  sendBack: NonNullable<ItemActions["sendBack"]>;
  stageNames: Record<string, string>;
  templateNames: Record<string, string>;
  onDone?: () => void;
}) {
  const { state, pending, onSubmit } = useActionForm(sendBackAction);
  useOnSuccess(state, () => onDone?.());
  const [target, setTarget] = useState("");
  const id = `sendback-${fromTaskId ?? "manager"}`;
  // Lane choice only applies to the default (one step back) target.
  const lanes = target === "" ? sendBack.laneTemplateIds : [];

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg bg-surface-muted p-3" noValidate>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="fromTaskId" value={fromTaskId ?? ""} />
      {state.status === "error" && !state.fieldErrors && <FormStatus state={state} />}

      {sendBack.managerStageIds.length > 0 ? (
        <div className="space-y-1.5">
          <label htmlFor={`${id}-target`} className="block text-sm font-medium">
            Send it back to
          </label>
          <select id={`${id}-target`} name="targetStageId" value={target} onChange={(e) => setTarget(e.target.value)} className={inputClasses}>
            <option value="">{stageNames[sendBack.defaultStageId]} (one step back)</option>
            {sendBack.managerStageIds.map((stageId) => (
              <option key={stageId} value={stageId}>
                {stageNames[stageId]} (everything after it is redone)
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-sm">
          It goes back to <strong>{stageNames[sendBack.defaultStageId]}</strong>.
        </p>
      )}

      {lanes.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Which part needs changes?</legend>
          {lanes.map((templateId) => (
            <Checkbox key={templateId} id={`${id}-${templateId}`} name="targetTemplateIds" value={templateId} label={templateNames[templateId]} />
          ))}
          <p className="text-sm text-muted">Parts you don&apos;t tick stay done.</p>
        </fieldset>
      )}

      <div className="space-y-1.5">
        <label htmlFor={`${id}-comment`} className="block text-sm font-medium">
          Why? (they&apos;ll see this)
        </label>
        <textarea id={`${id}-comment`} name="comment" rows={3} className={textareaClasses()} required aria-invalid={fieldError(state, "comment") ? true : undefined} />
        <FieldError message={fieldError(state, "comment")} />
      </div>
      <SubmitButton pending={pending} pendingLabel="Sending back…" size="sm" variant="danger">
        Send back
      </SubmitButton>
    </form>
  );
}

/** For managers who don't hold a task at the current stage. */
export function ManagerSendBack(props: {
  itemId: string;
  sendBack: NonNullable<ItemActions["sendBack"]>;
  stageNames: Record<string, string>;
  templateNames: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <Button variant="secondary" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "Cancel" : "Send back (as project manager)"}
      </Button>
      {open && <SendBackForm {...props} fromTaskId={null} onDone={() => setOpen(false)} />}
    </div>
  );
}

// ── Change requests ─────────────────────────────────────────────────────

export function ChangeRequestItem({
  request,
}: {
  request: ItemDetail["changeRequests"][number] & { when: string };
}) {
  const { state, pending, onSubmit } = useActionForm(resolveChangeRequestAction);
  return (
    <li className="space-y-2 rounded-lg border border-warning/30 bg-warning-surface p-3 text-sm">
      <p>
        <span className="font-medium">{request.authorName}</span> on <span className="font-medium">{request.taskName}</span>
        <span className="text-muted"> · {request.when}</span>
      </p>
      <p className="whitespace-pre-wrap">{request.body}</p>
      {request.canResolve && (
        <form onSubmit={onSubmit}>
          <input type="hidden" name="commentId" value={request.id} />
          {state.status === "error" && <FormStatus state={state} />}
          <SubmitButton pending={pending} pendingLabel="Saving…" size="sm" variant="secondary">
            Mark as done
          </SubmitButton>
        </form>
      )}
    </li>
  );
}

// ── Details (title, brief, deadline) and archive ────────────────────────

export function DetailsPanel({
  itemId,
  title,
  brief,
  deadlineInput,
  canEdit,
  canArchive,
  archived,
}: {
  itemId: string;
  title: string;
  brief: string;
  deadlineInput: string;
  canEdit: boolean;
  canArchive: boolean;
  archived: boolean;
}) {
  const details = useActionForm(updateDetailsAction);
  const archive = useActionForm(archiveAction);
  const [editing, setEditing] = useState(false);
  useOnSuccess(details.state, () => setEditing(false));

  return (
    <div className="space-y-3">
      {details.state.status === "success" && !editing && <FormStatus state={details.state} />}
      <FormStatus state={archive.state} />
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Button variant="secondary" size="sm" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Edit details"}
          </Button>
        )}
        {canArchive && (
          <form onSubmit={archive.onSubmit}>
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="archived" value={archived ? "false" : "true"} />
            <SubmitButton pending={archive.pending} size="sm" variant="ghost" pendingLabel="Saving…">
              {archived ? "Restore" : "Archive"}
            </SubmitButton>
          </form>
        )}
      </div>
      {editing && (
        <form onSubmit={details.onSubmit} className="space-y-4 rounded-lg bg-surface-muted p-4" noValidate>
          <input type="hidden" name="itemId" value={itemId} />
          {details.state.status === "error" && !details.state.fieldErrors && <FormStatus state={details.state} />}
          <TextField id="edit-title" name="title" label="Title" defaultValue={title} required error={fieldError(details.state, "title")} />
          <div className="space-y-1.5">
            <label htmlFor="edit-brief" className="block text-sm font-medium">
              Brief
            </label>
            <textarea id="edit-brief" name="brief" rows={5} defaultValue={brief} className={textareaClasses("min-h-32")} />
            <FieldError message={fieldError(details.state, "brief")} />
          </div>
          <TextField id="edit-deadline" name="deadline" type="date" label="Deadline" defaultValue={deadlineInput} className="sm:max-w-xs" error={fieldError(details.state, "deadline")} />
          <SubmitButton pending={details.pending} pendingLabel="Saving…" size="sm">
            Save details
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

export function NoticeOnHold({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Alert tone="warning">
      {count === 1 ? "One task is" : `${count} tasks are`} on hold while this is back at an earlier step. Their work is kept.
    </Alert>
  );
}
