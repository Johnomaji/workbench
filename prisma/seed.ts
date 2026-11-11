/**
 * Development seed: two fictional customer organizations, each with the Media
 * department and its workflow, people for every role, and sample content items
 * at different stages. One person belongs to both organizations, and there's a
 * platform administrator who belongs to neither.
 * All names and addresses are fictional (example.com is reserved for examples).
 *
 * Safe to re-run: everything is upserted, and each sample item is only created
 * if no item with that title exists. Sample items are walked through the real
 * workflow engine, so their states are ones the app could produce.
 * Refuses to run in production unless SEED_ALLOW_PRODUCTION=true.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { textToDoc } from "../src/lib/script-doc";
import { hashPassword } from "../src/server/auth/password";
import { provisionMediaDepartment } from "../src/server/orgs/provision";
import type { Actor } from "../src/server/permissions/policy";
import { applyCommand, applyScriptSaved, planNewItem } from "../src/server/workflow/engine";
import { loadWorkflowDef } from "../src/server/workflow/load";
import { MEDIA_ROLES, type MediaRoleKey } from "../src/server/workflow/media-template";
import type { CandidateUser, ItemState, WorkflowDef } from "../src/server/workflow/types";

if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "true") {
  console.error("Refusing to seed: NODE_ENV is production. Set SEED_ALLOW_PRODUCTION=true to override.");
  process.exit(1);
}

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DIRECT_URL (or DATABASE_URL) before seeding.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const SEED_PASSWORD = process.env.SEED_PASSWORD || "dev-password-123";

type MemberSeed = { email: string; isAdmin?: boolean; roles: MediaRoleKey[]; state?: "active" | "pending" | "deactivated" };
type OrganizationSeed = { slug: string; name: string; members: MemberSeed[]; samples: SampleItem[] };

/** Accounts. "pending" never chose a password; the platform admin runs the service and sees no customer data. */
const ACCOUNTS: { email: string; name: string; pending?: boolean; isPlatformAdmin?: boolean }[] = [
  { email: "admin@example.com", name: "Jordan Lee" },
  { email: "pm@example.com", name: "Morgan Hale" },
  { email: "writer@example.com", name: "Riley Chen" },
  { email: "writer2@example.com", name: "Sam Okafor" },
  { email: "editor@example.com", name: "Casey Novak" },
  { email: "designer@example.com", name: "Taylor Brooks" },
  { email: "designer2@example.com", name: "Jamie Ortiz" },
  { email: "video@example.com", name: "Drew Patel" },
  { email: "video2@example.com", name: "Quinn Adeyemi" },
  { email: "pending@example.com", name: "Robin Ellis", pending: true },
  { email: "former@example.com", name: "Charlie Ward" },
  { email: "globex-admin@example.com", name: "Avery Stone" },
  { email: "globex-writer@example.com", name: "Parker Diaz" },
  { email: "platform@example.com", name: "Pat Operator", isPlatformAdmin: true },
];

type TaskKey = "SCRIPT" | "EDIT" | "DESIGN" | "VIDEO" | "REVIEW";
type Step = { as: string; do: "save" } | { as: string; do: "start" | "submit"; task: TaskKey };

type SampleItem = {
  title: string;
  brief: string;
  deadlineInDays: number;
  createdBy: string;
  assign: Partial<Record<TaskKey, string>>;
  script: string;
  steps: Step[];
};

const scene = (title: string, visual: string, voiceover: string) =>
  `${title}\n\nVisual: ${visual}\n\nVoiceover: "${voiceover}"`;

const ACME_SAMPLES: SampleItem[] = [
  {
    title: "Spring campaign teaser (30-second video)",
    brief:
      "A short, upbeat teaser for the spring campaign. Three scenes, vertical 9:16 for social media. " +
      "End on the campaign hashtag. Keep the voiceover under 25 words.",
    deadlineInDays: 10,
    createdBy: "pm@example.com",
    assign: {
      SCRIPT: "writer@example.com",
      EDIT: "editor@example.com",
      DESIGN: "designer@example.com",
      VIDEO: "video@example.com",
      REVIEW: "pm@example.com",
    },
    script: [
      scene("Scene 1: Morning light", "Sunrise over a rooftop garden in a quiet city.", "Every season starts with a single step."),
      scene("Scene 2: Getting ready", "Quick cuts of people lacing shoes, packing bags, opening windows.", "Fresh air. Fresh plans."),
      scene("Scene 3: Out the door", "A group walks out into a bright street, laughing.", "This spring, go further. #StepIntoSpring"),
    ].join("\n\n"),
    steps: [{ as: "writer@example.com", do: "save" }],
  },
  {
    title: "Customer story: rooftop garden (60-second video)",
    brief: "Interview-style story about a fictional community garden. Warm, documentary tone. Subtitles required.",
    deadlineInDays: 14,
    createdBy: "pm@example.com",
    assign: { SCRIPT: "writer2@example.com", EDIT: "editor@example.com" },
    script: [
      scene("Opening", "Slow pan across planters at golden hour.", "It started with one empty roof."),
      scene("The people", "Neighbours watering plants, sharing tools.", "Now forty families grow food here."),
    ].join("\n\n"),
    steps: [
      { as: "writer2@example.com", do: "save" },
      { as: "writer2@example.com", do: "submit", task: "SCRIPT" },
    ],
  },
  {
    title: "Five quick tips carousel (social post)",
    brief: "Five-slide carousel with one practical tip per slide, plus a 15-second video version.",
    deadlineInDays: 3,
    createdBy: "pm@example.com",
    assign: {
      SCRIPT: "writer@example.com",
      EDIT: "editor@example.com",
      DESIGN: "designer@example.com",
      VIDEO: "video@example.com",
      REVIEW: "pm@example.com",
    },
    script: "Slide 1: Start small.\nSlide 2: Plan the week on Sunday.\nSlide 3: One task at a time.\nSlide 4: Take real breaks.\nSlide 5: Review what worked.",
    steps: [
      { as: "writer@example.com", do: "save" },
      { as: "writer@example.com", do: "submit", task: "SCRIPT" },
      { as: "editor@example.com", do: "start", task: "EDIT" },
      { as: "editor@example.com", do: "submit", task: "EDIT" },
      { as: "designer@example.com", do: "start", task: "DESIGN" },
      { as: "designer@example.com", do: "submit", task: "DESIGN" },
      { as: "video@example.com", do: "start", task: "VIDEO" },
    ],
  },
];

const GLOBEX_SAMPLES: SampleItem[] = [
  {
    title: "Product launch explainer (45-second video)",
    brief: "Explain the new (fictional) product in three beats: the problem, the fix, the call to action. Square 1:1.",
    deadlineInDays: 7,
    createdBy: "globex-admin@example.com",
    assign: { SCRIPT: "globex-writer@example.com", DESIGN: "designer@example.com" },
    script: [
      scene("Beat 1: The problem", "A cluttered desk, sticky notes everywhere.", "Too many tools. Too little time."),
      scene("Beat 2: The fix", "One clean screen.", "Everything in one place."),
    ].join("\n\n"),
    steps: [{ as: "globex-writer@example.com", do: "save" }],
  },
];

const ORGANIZATIONS: OrganizationSeed[] = [
  {
    slug: "acme",
    name: "Acme Media",
    members: [
      { email: "admin@example.com", isAdmin: true, roles: [] },
      { email: "pm@example.com", roles: ["PROJECT_MANAGER"] },
      { email: "writer@example.com", roles: ["SCRIPT_WRITER"] },
      { email: "writer2@example.com", roles: ["SCRIPT_WRITER"] },
      { email: "editor@example.com", roles: ["CONTENT_EDITOR"] },
      { email: "designer@example.com", roles: ["GRAPHIC_DESIGNER"] },
      { email: "designer2@example.com", roles: ["GRAPHIC_DESIGNER"] },
      { email: "video@example.com", roles: ["VIDEO_EDITOR"] },
      { email: "video2@example.com", roles: ["VIDEO_EDITOR"] },
      { email: "pending@example.com", roles: ["CONTENT_EDITOR"], state: "pending" },
      { email: "former@example.com", roles: ["VIDEO_EDITOR"], state: "deactivated" },
    ],
    samples: ACME_SAMPLES,
  },
  {
    slug: "globex",
    name: "Globex Studio",
    members: [
      { email: "globex-admin@example.com", isAdmin: true, roles: ["PROJECT_MANAGER"] },
      { email: "globex-writer@example.com", roles: ["SCRIPT_WRITER"] },
      // Freelances for both: one account, two organizations.
      { email: "designer@example.com", roles: ["GRAPHIC_DESIGNER"] },
    ],
    samples: GLOBEX_SAMPLES,
  },
];

/** Someone as they act inside one organization (what the app's session layer builds). */
async function loadActor(email: string, organizationId: string): Promise<Actor> {
  const u = await db.user.findUniqueOrThrow({
    where: { email },
    include: {
      orgMemberships: { where: { organizationId } },
      memberships: { where: { organizationId }, include: { role: { include: { department: true } } } },
    },
  });
  const member = u.orgMemberships[0];
  const departments = await db.department.findMany({ where: { organizationId, isActive: true }, select: { id: true } });
  return {
    id: u.id,
    isAdmin: member?.isAdmin ?? false,
    isActive: u.isActive && (member?.isActive ?? false),
    organizationId,
    orgDepartmentIds: departments.map((d) => d.id),
    memberships: u.memberships.map(({ role }) => ({
      roleId: role.id,
      roleKey: role.key,
      roleName: role.name,
      departmentId: role.departmentId,
      departmentName: role.department.name,
      canCreateItems: role.canCreateItems,
      canManageItems: role.canManageItems,
    })),
  };
}

/** Runs a sample through the engine in memory, then writes the result. */
async function createSample(
  def: WorkflowDef,
  organizationId: string,
  departmentId: string,
  workflowId: string,
  sample: SampleItem,
) {
  if (await db.contentItem.findFirst({ where: { organizationId, title: sample.title }, select: { id: true } })) return null;

  const templateId = (key: TaskKey) => def.stages.flatMap((s) => s.tasks).find((t) => t.key === key)!.id;
  const creator = await loadActor(sample.createdBy, organizationId);
  const assignees: Record<string, CandidateUser> = {};
  for (const [key, email] of Object.entries(sample.assign)) {
    const a = await loadActor(email, organizationId);
    assignees[templateId(key as TaskKey)] = { id: a.id, isActive: a.isActive, roleIds: a.memberships.map((m) => m.roleId) };
  }
  const planned = planNewItem(def, departmentId, creator, assignees);
  if (!planned.ok) throw new Error(`${sample.title}: ${planned.reason}`);

  const now = new Date();
  let state: ItemState = {
    id: "seed",
    departmentId,
    stageId: planned.plan.stageId,
    firstSubmittedAt: null,
    completedAt: null,
    archivedAt: null,
    latestScriptVersion: 0,
    tasks: planned.plan.tasks.map((t) => ({ id: t.templateId, templateId: t.templateId, assigneeId: t.assigneeId, status: t.status, changesRequested: false })),
  };
  const versions: { reason: "SAVE" | "SUBMIT"; authorId: string; stageId: string }[] = [];
  const audits: { actorId: string; action: string; templateId?: string; data: Prisma.InputJsonValue }[] = [
    { actorId: creator.id, action: "item.created", data: { seeded: true } },
  ];

  for (const step of sample.steps) {
    const actor = await loadActor(step.as, organizationId);
    const stageBefore = state.stageId;
    const result =
      step.do === "save"
        ? applyScriptSaved(def, state, actor, state.latestScriptVersion + 1)
        : applyCommand(def, state, actor, { type: step.do, taskId: templateId(step.task) }, now);
    if (!result.ok) throw new Error(`${sample.title}: ${step.do} refused: ${result.reason}`);
    if (step.do === "save") versions.push({ reason: "SAVE", authorId: actor.id, stageId: stageBefore });
    let latest = result.item.latestScriptVersion;
    for (const effect of result.effects) {
      if (effect.kind === "scriptSnapshot") {
        versions.push({ reason: "SUBMIT", authorId: actor.id, stageId: stageBefore });
        latest += 1;
      }
      if (effect.kind === "audit") audits.push({ actorId: actor.id, action: effect.action, templateId: effect.taskId, data: effect.data });
    }
    state = { ...result.item, latestScriptVersion: latest };
  }

  const doc = textToDoc(sample.script) as unknown as Prisma.InputJsonValue;
  const [{ itemCounter: number }] = await db.$queryRaw<{ itemCounter: number }[]>`
    UPDATE "Organization" SET "itemCounter" = "itemCounter" + 1 WHERE "id" = ${organizationId} RETURNING "itemCounter"
  `;
  const item = await db.contentItem.create({
    data: {
      organizationId,
      number,
      departmentId,
      workflowId,
      stageId: state.stageId,
      stageEnteredAt: now,
      title: sample.title,
      brief: sample.brief,
      deadline: new Date(now.getTime() + sample.deadlineInDays * 24 * 60 * 60 * 1000),
      createdById: creator.id,
      firstSubmittedAt: state.firstSubmittedAt,
      latestScriptVersion: state.latestScriptVersion,
      tasks: {
        create: state.tasks.map((t) => ({
          templateId: t.templateId,
          assigneeId: t.assigneeId,
          status: t.status,
          readyAt: t.status === "LOCKED" ? null : now,
          startedAt: t.status === "IN_PROGRESS" || t.status === "DONE" ? now : null,
          completedAt: t.status === "DONE" ? now : null,
        })),
      },
      scriptVersions: {
        create: versions.map((v, i) => ({
          number: i + 1,
          content: doc,
          plainText: sample.script,
          reason: v.reason,
          authorId: v.authorId,
          stageId: v.stageId,
        })),
      },
    },
    include: { tasks: true },
  });

  const taskIdOf = new Map(item.tasks.map((t) => [t.templateId, t.id]));
  await db.taskAssignment.createMany({
    data: item.tasks.filter((t) => t.assigneeId).map((t) => ({ taskId: t.id, userId: t.assigneeId!, assignedById: creator.id })),
  });
  await db.auditLog.createMany({
    data: audits.map((a) => ({
      action: a.action,
      actorId: a.actorId,
      entityType: a.templateId ? "Task" : "ContentItem",
      entityId: a.templateId ? taskIdOf.get(a.templateId)! : item.id,
      itemId: item.id,
      organizationId,
      departmentId,
      data: a.data,
    })),
  });
  return item.number;
}

async function main() {
  console.info("Seeding…");

  const passwordHash = await hashPassword(SEED_PASSWORD);
  for (const account of ACCOUNTS) {
    const data = {
      name: account.name,
      isActive: true,
      deactivatedAt: null,
      isPlatformAdmin: account.isPlatformAdmin ?? false,
      passwordHash: account.pending ? null : passwordHash,
      mustChangePassword: false,
    };
    await db.user.upsert({ where: { email: account.email }, update: data, create: { email: account.email, ...data } });
  }

  for (const org of ORGANIZATIONS) {
    const organization = await db.organization.upsert({
      where: { slug: org.slug },
      update: { name: org.name, isActive: true, suspendedAt: null },
      create: { slug: org.slug, name: org.name },
    });
    const { departmentId, workflowId, roleIds } = await provisionMediaDepartment(db, organization.id);

    for (const m of org.members) {
      const state = m.state ?? "active";
      const user = await db.user.findUniqueOrThrow({ where: { email: m.email }, select: { id: true } });
      const member = {
        isAdmin: m.isAdmin ?? false,
        isActive: state !== "deactivated",
        deactivatedAt: state === "deactivated" ? new Date() : null,
        joinedAt: state === "pending" ? null : new Date(),
      };
      await db.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
        update: member,
        create: { organizationId: organization.id, userId: user.id, ...member },
      });
      const wanted = m.roles.map((key) => roleIds[key]);
      await db.membership.deleteMany({ where: { organizationId: organization.id, userId: user.id, roleId: { notIn: wanted } } });
      await db.membership.createMany({
        data: wanted.map((roleId) => ({ organizationId: organization.id, userId: user.id, roleId })),
        skipDuplicates: true,
      });
    }

    const def = await loadWorkflowDef(db, workflowId);
    for (const sample of org.samples) {
      const number = await createSample(def, organization.id, departmentId, workflowId, sample);
      if (number) console.info(`${org.name}: created sample item #${number}: ${sample.title}`);
    }
  }

  console.info("\nSeeded accounts (password for all active accounts: SEED_PASSWORD):");
  console.table(
    ACCOUNTS.map((a) => ({
      email: a.email,
      name: a.name,
      where: a.isPlatformAdmin
        ? "Platform administrator"
        : ORGANIZATIONS.flatMap((o) => {
            const m = o.members.find((x) => x.email === a.email);
            if (!m) return [];
            const role = m.isAdmin ? "Administrator" : MEDIA_ROLES.find((r) => r.key === m.roles[0])?.name;
            return [`${o.name}: ${role}${m.state && m.state !== "active" ? ` (${m.state})` : ""}`];
          }).join("; "),
    })),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
