import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { BackToBoardLink } from "@/components/back-to-board";
import { Alert, Badge } from "@/components/ui/feedback";
import { PageHeader, Section } from "@/components/ui/layout";
import { ItemPageSkeleton } from "@/components/ui/skeletons";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { formatDateTime, formatRelative } from "@/lib/format";
import { orgPath } from "@/lib/org-path";
import { requireOrgUser } from "@/server/auth/session";
import { getItemDetail, type ItemDetail } from "@/server/items/queries";
import { ChangeRequestItem, DetailsPanel, ManagerSendBack, NoticeOnHold, ScriptPanel, TaskCard, TaskRow } from "./item-panels";

export const metadata: Metadata = { title: "Item" };

/** Newest activity shown straight away; the rest is one click away. */
const ACTIVITY_SHOWN = 8;

export default function ItemPage({ params }: PageProps<"/[org]/items/[number]">) {
  return (
    <Suspense fallback={<ItemPageSkeleton />}>
      <ItemView params={params} />
    </Suspense>
  );
}

async function ItemView({ params }: Pick<PageProps<"/[org]/items/[number]">, "params">) {
  const { org, number } = await params;
  const user = await requireOrgUser(org);
  const item = await getItemDetail(user, number);
  if (!item) notFound();

  const now = new Date();
  const onHold = item.tasks.filter((t) => !t.active && ["IN_PROGRESS", "DONE", "SENT_BACK"].includes(t.status) && item.stages.find((s) => s.name === t.stageName)?.state !== "done").length;
  const anyTaskCanSendBack = Object.values(item.actions.tasks).some((t) => t.sendBack);
  const scriptTaskId = item.actions.editScript.ok ? item.actions.editScript.taskId : null;
  const latestSendBack = item.sendBackNotes[0];
  const sentBackActive = item.tasks.some((t) => t.active && t.status === "SENT_BACK");
  const currentTasks = item.tasks.filter((t) => t.active);
  const otherTasks = item.tasks.filter((t) => !t.active);
  const showManagerSendBack = Boolean(item.actions.sendBack?.managerWithoutTask && !anyTaskCanSendBack);
  const hasCurrentStep = currentTasks.length > 0 || showManagerSendBack;

  const taskProps = (task: ItemDetail["tasks"][number]) => ({
    itemId: item.id,
    task,
    actions: item.actions.tasks[task.id],
    sendBack: item.actions.sendBack,
    candidates: item.candidatesByRole[task.roleId] ?? [],
    stageNames: item.stageNames,
    templateNames: item.templateNames,
    canEditScript: task.id === scriptTaskId,
  });

  return (
    <>
      <BackToBoardLink boardPath={orgPath(user.organization.slug, "/board")} />
      <div className="space-y-6">
        <PageHeader
          title={item.title}
          description={`#${item.number} · ${item.departmentName}`}
          meta={
            <>
              <Badge tone={item.completedAt ? "success" : "primary"}>{item.stageName}</Badge>
              {item.isDraft && <Badge>Draft</Badge>}
              {item.archivedAt && <Badge tone="warning">Archived</Badge>}
              {item.deadline && (
                <Badge tone={item.overdue ? "danger" : "neutral"}>
                  {item.overdue ? "Overdue: " : "Due "}
                  {formatDay(item.deadline, item.timeZone)}
                </Badge>
              )}
            </>
          }
        />

        {item.isDraft && (
          <Alert tone="info">This is a draft. Only the writer and project managers can see it until it&apos;s sent for editing.</Alert>
        )}
        {item.archivedAt && <Alert tone="warning">This item is archived. Restore it to make changes.</Alert>}
        {item.completedAt && <Alert tone="success">Completed {formatRelative(item.completedAt, now)}.</Alert>}
        {sentBackActive && latestSendBack && (
          <Alert tone="error" title={`Sent back by ${latestSendBack.authorName}`}>
            <p className="whitespace-pre-wrap">{latestSendBack.body}</p>
          </Alert>
        )}
        <NoticeOnHold count={onHold} />

        <Progress stages={item.stages} />

        {/*
          Phones: current step, then the brief and script, then everything else.
          Wide screens: brief and script on the left; current step on the right, with tasks and activity under it.
        */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr]">
          {hasCurrentStep && (
            <section aria-labelledby="current-step" className="space-y-3 lg:col-start-2 lg:row-start-1">
              <div>
                <h2 id="current-step" className="font-semibold">
                  Current step
                </h2>
                <p className="text-sm text-muted">{item.stageName}</p>
              </div>
              {currentTasks.map((task) => (
                <TaskCard key={task.id} {...taskProps(task)} />
              ))}
              {showManagerSendBack && item.actions.sendBack && (
                <ManagerSendBack itemId={item.id} sendBack={item.actions.sendBack} stageNames={item.stageNames} templateNames={item.templateNames} />
              )}
            </section>
          )}

          <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <Section id="brief" title="Brief" description={`Created by ${item.createdByName} ${formatRelative(item.createdAt, now)}.`}>
              <div className="space-y-4">
                <p className="text-sm whitespace-pre-wrap">{item.brief || <span className="text-muted">No brief yet.</span>}</p>
                {(item.canEditDetails || item.canArchive) && (
                  <DetailsPanel
                    itemId={item.id}
                    title={item.title}
                    brief={item.brief}
                    deadlineInput={item.deadlineInput}
                    canEdit={item.canEditDetails}
                    canArchive={item.canArchive}
                    archived={Boolean(item.archivedAt)}
                  />
                )}
              </div>
            </Section>

            <Section
              id="script"
              title="Script"
              description={
                item.script
                  ? `Version ${item.script.version}, saved by ${item.script.authorName} ${formatRelative(item.script.savedAt, now)}.`
                  : undefined
              }
            >
              <ScriptPanel itemId={item.id} script={item.script} editScript={item.actions.editScript} />
            </Section>

            {item.changeRequests.length > 0 && (
              <section aria-labelledby="changes" className="space-y-2">
                <h2 id="changes" className="font-semibold">
                  Open change requests
                </h2>
                <ul className="space-y-2">
                  {item.changeRequests.map((r) => (
                    <ChangeRequestItem key={r.id} request={{ ...r, when: formatRelative(r.createdAt, now) }} />
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className={cn("min-w-0 space-y-6 lg:col-start-2", hasCurrentStep ? "lg:row-start-2" : "lg:row-span-2 lg:row-start-1")}>
            {otherTasks.length > 0 && (
              <SideCard id="tasks" title={currentTasks.length > 0 ? "Other tasks" : "Tasks"}>
                <ul className="divide-y divide-border">
                  {otherTasks.map((task) => (
                    <TaskRow key={task.id} {...taskProps(task)} />
                  ))}
                </ul>
              </SideCard>
            )}

            {item.sendBackNotes.length > 0 && (
              <SideCard id="sendbacks" title="Why it was sent back">
                <ul className="space-y-3 text-sm">
                  {item.sendBackNotes.map((n) => (
                    <li key={n.id}>
                      <p className="whitespace-pre-wrap">{n.body}</p>
                      <p className="text-muted">
                        {n.authorName}
                        {n.taskName ? ` → ${n.taskName}` : ""} · {formatRelative(n.createdAt, now)}
                      </p>
                    </li>
                  ))}
                </ul>
              </SideCard>
            )}

            <SideCard id="activity" title="Activity">
              {item.activity.length === 0 ? (
                <p className="text-sm text-muted">Nothing yet.</p>
              ) : (
                <>
                  <Timeline entries={item.activity.slice(0, ACTIVITY_SHOWN)} now={now} />
                  {item.activity.length > ACTIVITY_SHOWN && (
                    <details className="group mt-3">
                      <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm font-medium text-primary">
                        <span className="group-open:hidden">Show {item.activity.length - ACTIVITY_SHOWN} older</span>
                        <span className="hidden group-open:inline">Hide older</span>
                      </summary>
                      <Timeline entries={item.activity.slice(ACTIVITY_SHOWN)} now={now} className="mt-3" />
                    </details>
                  )}
                </>
              )}
            </SideCard>
          </div>
        </div>
      </div>
    </>
  );
}

function SideCard({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-surface p-5">
      <h2 id={id} className="mb-3 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Progress({ stages }: { stages: ItemDetail["stages"] }) {
  return (
    <nav aria-label="Progress" className="-mx-4 overflow-x-auto px-4">
      <ol className="flex min-w-max gap-2">
        {stages.map((stage, i) => (
          <li
            key={stage.id}
            aria-current={stage.state === "current" ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
              stage.state === "current" && "border-primary bg-primary-surface font-semibold text-primary",
              stage.state === "done" && "border-border bg-surface text-muted",
              stage.state === "upcoming" && "border-dashed border-border-strong text-muted",
            )}
          >
            <span aria-hidden="true">{stage.state === "done" ? "✓" : i + 1}</span>
            {stage.name}
            <span className="sr-only">
              {stage.state === "done" ? "(done)" : stage.state === "current" ? "(current step)" : "(not reached yet)"}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Timeline({ entries, now, className }: { entries: ItemDetail["activity"]; now: Date; className?: string }) {
  return (
    <ol className={cn("space-y-3 border-l border-border pl-4 text-sm", className)}>
      {entries.map((a) => (
        <li key={a.id} className="relative">
          <span aria-hidden="true" className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full border border-border-strong bg-surface" />
          <p>
            <span className="font-medium">{a.actorName}</span> {a.text}
          </p>
          <p className="text-muted">
            <time dateTime={a.createdAt.toISOString()} title={formatDateTime(a.createdAt)}>
              {formatRelative(a.createdAt, now)}
            </time>
          </p>
        </li>
      ))}
    </ol>
  );
}
