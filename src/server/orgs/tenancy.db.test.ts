/**
 * Tenant isolation against a real Postgres (set TEST_DATABASE_URL to a
 * separate, migrated database; it is wiped at the start).
 *
 * Two customer organizations, Acme and Globex, and one freelance designer who
 * works for both. Everything one organization does must stay invisible to, and
 * out of reach of, the other, even for its administrators and even when they
 * know the other organization's ids.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import type { EmailMessage } from "@/server/providers/email";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { addPerson, createTestOrg, orgUser, resetDatabase, type TestOrg } from "@/server/testing/db-fixtures";
import { textToDoc } from "@/lib/script-doc";

// Work queued with after() runs straight away, and emails are collected instead of sent.
const queued: Promise<unknown>[] = [];
const sent: EmailMessage[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: unknown) => {
    queued.push(Promise.resolve(typeof task === "function" ? task() : task));
  },
}));
vi.mock("@/server/providers/email", () => ({
  emailProvider: () => ({
    send: async (message: EmailMessage) => {
      sent.push(message);
    },
  }),
}));

async function flushQueued() {
  await Promise.all(queued.splice(0));
}

const url = process.env.TEST_DATABASE_URL;
const IP = "203.0.113.7";
const script = (text: string) => JSON.stringify(textToDoc(text));

type OrgUser = import("@/server/auth/session").OrgUser;

describe.skipIf(!url)("tenant isolation (database)", () => {
  let db: PrismaClient;
  let items: typeof import("@/server/items/commands");
  let queries: typeof import("@/server/items/queries");
  let board: typeof import("@/server/board/queries");
  let people: typeof import("@/server/admin/users");
  let orgs: typeof import("./organizations");
  let signup: typeof import("@/server/auth/signup");
  let acme: TestOrg;
  let globex: TestOrg;
  const a: Record<string, OrgUser> = {};
  const g: Record<string, OrgUser> = {};

  const reload = async () => {
    for (const [key, user] of Object.entries(a)) a[key] = await orgUser(db, user.email, acme.id);
    for (const [key, user] of Object.entries(g)) g[key] = await orgUser(db, user.email, globex.id);
  };

  async function item(org: TestOrg, number: number) {
    return db.contentItem.findFirstOrThrow({
      where: { organizationId: org.id, number },
      include: { tasks: { include: { template: true } }, stage: true },
    });
  }
  const taskOf = async (org: TestOrg, number: number, key: string) =>
    (await item(org, number)).tasks.find((t) => t.template.key === key)!.id;

  beforeAll(async () => {
    if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must point at a separate database");
    process.env.DATABASE_URL = url;
    ({ db } = await import("@/server/db"));
    items = await import("@/server/items/commands");
    queries = await import("@/server/items/queries");
    board = await import("@/server/board/queries");
    people = await import("@/server/admin/users");
    orgs = await import("./organizations");
    signup = await import("@/server/auth/signup");
    await resetDatabase(db);

    acme = await createTestOrg(db, "acme", "Acme Media");
    globex = await createTestOrg(db, "globex", "Globex Studio");
    await addPerson(db, acme, { email: "a-admin@example.com", name: "Ada Admin", isAdmin: true });
    await addPerson(db, acme, { email: "a-pm@example.com", name: "Pat PM", roles: ["PROJECT_MANAGER"] });
    await addPerson(db, acme, { email: "a-writer@example.com", name: "Wren Writer", roles: ["SCRIPT_WRITER"] });
    await addPerson(db, acme, { email: "a-editor@example.com", name: "Eli Editor", roles: ["CONTENT_EDITOR"], passwordHash: "x" });
    await addPerson(db, globex, { email: "g-admin@example.com", name: "Gus Admin", isAdmin: true, roles: ["PROJECT_MANAGER"] });
    await addPerson(db, globex, { email: "g-writer@example.com", name: "Gia Writer", roles: ["SCRIPT_WRITER"] });
    // One account, two organizations.
    await addPerson(db, acme, { email: "designer@example.com", name: "Dee Designer", roles: ["GRAPHIC_DESIGNER"], passwordHash: "x" });
    await addPerson(db, globex, { email: "designer@example.com", name: "Dee Designer", roles: ["GRAPHIC_DESIGNER"] });

    for (const [key, email] of Object.entries({ admin: "a-admin", pm: "a-pm", writer: "a-writer", editor: "a-editor", designer: "designer" })) {
      a[key] = await orgUser(db, email.includes("@") ? email : `${email}@example.com`, acme.id);
    }
    for (const [key, email] of Object.entries({ admin: "g-admin", writer: "g-writer", designer: "designer" })) {
      g[key] = await orgUser(db, `${email}@example.com`, globex.id);
    }
  });

  afterAll(async () => {
    await flushQueued();
    await db?.$disconnect();
  });

  // ── Items ──────────────────────────────────────────────────────────────

  it("numbers items per organization, without gaps or duplicates under load", async () => {
    const first = await items.createItem(a.pm, { departmentId: acme.departmentId, title: "Acme one", deadline: "" }, IP);
    const globexFirst = await items.createItem(g.admin, { departmentId: globex.departmentId, title: "Globex one", deadline: "" }, IP);
    expect(first.number).toBe(1);
    expect(globexFirst.number).toBe(1);

    const burst = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        items.createItem(a.pm, { departmentId: acme.departmentId, title: `Acme burst ${i}`, deadline: "" }, IP),
      ),
    );
    expect(burst.map((r) => r.number).sort((x, y) => x - y)).toEqual(Array.from({ length: 12 }, (_, i) => i + 2));
    expect((await db.organization.findUniqueOrThrow({ where: { id: acme.id } })).itemCounter).toBe(13);
    expect((await db.organization.findUniqueOrThrow({ where: { id: globex.id } })).itemCounter).toBe(1);
  });

  it("shows each organization only its own items, even for the same number", async () => {
    const acmeOne = await queries.getItemDetail(a.admin, "1");
    const globexOne = await queries.getItemDetail(g.admin, "1");
    expect(acmeOne?.title).toBe("Acme one");
    expect(globexOne?.title).toBe("Globex one");
    // Acme has #2; Globex doesn't, so Globex's admin finds nothing.
    expect(await queries.getItemDetail(g.admin, "2")).toBeNull();

    const titles = (rows: { title: string }[]) => rows.map((r) => r.title);
    expect(titles(await queries.listItems(g.admin)).every((t) => t.startsWith("Globex"))).toBe(true);
    expect(titles(await queries.listItems(a.admin)).some((t) => t.startsWith("Globex"))).toBe(false);

    const globexBoard = await board.getBoard(g.admin, {});
    expect(globexBoard.columns.flatMap((c) => c.cards.map((card) => card.title))).toEqual(["Globex one"]);
    expect(globexBoard.people.map((p) => p.name).sort()).toEqual(["Dee Designer", "Gia Writer", "Gus Admin"]);
    // Asking for another organization's department by key just shows your own.
    expect((await board.getBoard(g.admin, { dept: "media" })).department?.key).toBe("media");
  });

  it("keeps the shared designer's work separate per organization", async () => {
    const acmeItem = await items.createItem(
      a.pm,
      {
        departmentId: acme.departmentId,
        title: "Acme with designer",
        deadline: "",
        assignees: { [await templateId(acme, "SCRIPT")]: a.writer.id, [await templateId(acme, "DESIGN")]: a.designer.id },
      },
      IP,
    );
    // Submitted, so it's no longer a private draft.
    const id = (await item(acme, acmeItem.number)).id;
    await items.saveScript(a.writer, { itemId: id, baseVersion: 0, content: script("Scene 1") }, IP);
    await items.runTaskCommand(a.writer, { itemId: id, taskId: await taskOf(acme, acmeItem.number, "SCRIPT"), intent: "submit" }, IP);
    const inAcme = await queries.getMyWork(a.designer);
    const inGlobex = await queries.getMyWork(g.designer);
    expect(inAcme.comingUp.some((c) => c.itemNumber === acmeItem.number)).toBe(true);
    expect([...inGlobex.yourTurn, ...inGlobex.comingUp, ...inGlobex.upForGrabs]).toHaveLength(0);
  });

  it("refuses every item command aimed at another organization's item, changing nothing", async () => {
    const target = await item(acme, 1);
    const script0 = await taskOf(acme, 1, "SCRIPT");
    const commands: Array<() => Promise<unknown>> = [
      () => items.runTaskCommand(g.admin, { itemId: target.id, taskId: script0, intent: "pickUp" }, IP),
      () => items.saveScript(g.admin, { itemId: target.id, baseVersion: 0, content: script("Hijack") }, IP),
      () => items.updateItemDetails(g.admin, { itemId: target.id, title: "Hijacked", brief: "", deadline: "" }, IP),
      () => items.setItemArchived(g.admin, { itemId: target.id, archived: "true" }, IP),
      () => items.requestChanges(g.admin, { itemId: target.id, taskId: script0, comment: "x" }, IP),
      () => items.sendBack(g.admin, { itemId: target.id, comment: "x", targetStageId: target.stageId }, IP),
      () => items.reassignTask(g.admin, { itemId: target.id, taskId: script0, toUserId: g.writer.id }, IP),
    ];
    for (const command of commands) await expect(command()).rejects.toBeInstanceOf(NotFoundError);

    const after = await item(acme, 1);
    expect(after.stateVersion).toBe(target.stateVersion);
    expect(after.title).toBe("Acme one");
    expect(after.archivedAt).toBeNull();
    expect(await db.scriptVersion.count({ where: { itemId: target.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { itemId: target.id, actorId: g.admin.id } })).toBe(0);
  });

  it("can't resolve another organization's change request", async () => {
    const number = (await items.createItem(a.pm, { departmentId: acme.departmentId, title: "Acme change request", deadline: "" }, IP)).number;
    const id = (await item(acme, number)).id;
    await items.requestChanges(a.pm, { itemId: id, taskId: await taskOf(acme, number, "SCRIPT"), comment: "Shorter please." }, IP);
    const request = await db.comment.findFirstOrThrow({ where: { itemId: id, kind: "CHANGE_REQUEST" } });
    await expect(items.resolveChangeRequest(g.admin, { commentId: request.id }, IP)).rejects.toBeInstanceOf(NotFoundError);
    expect((await db.comment.findUniqueOrThrow({ where: { id: request.id } })).resolvedAt).toBeNull();
  });

  it("never assigns work to someone outside the organization, or into another organization's department", async () => {
    await expect(
      items.createItem(a.pm, { departmentId: globex.departmentId, title: "Into Globex", deadline: "" }, IP),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      items.createItem(
        a.pm,
        { departmentId: acme.departmentId, title: "Outsider", deadline: "", assignees: { [await templateId(acme, "SCRIPT")]: g.writer.id } },
        IP,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    const number = (await items.createItem(a.pm, { departmentId: acme.departmentId, title: "Reassign outside", deadline: "" }, IP)).number;
    await expect(
      items.reassignTask(a.pm, { itemId: (await item(acme, number)).id, taskId: await taskOf(acme, number, "SCRIPT"), toUserId: g.writer.id }, IP),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await db.contentItem.count({ where: { organizationId: globex.id, title: "Into Globex" } })).toBe(0);
  });

  it("notifies only people in the item's organization, and labels notifications with it", async () => {
    const number = (await items.createItem(a.writer, { departmentId: acme.departmentId, title: "Acme pool", deadline: "" }, IP)).number;
    const id = (await item(acme, number)).id;
    await items.saveScript(a.writer, { itemId: id, baseVersion: 0, content: script("Scene 1") }, IP);
    await items.runTaskCommand(a.writer, { itemId: id, taskId: await taskOf(acme, number, "SCRIPT"), intent: "submit" }, IP);
    const notes = await db.notification.findMany({ where: { itemId: id } });
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => n.organizationId === acme.id)).toBe(true);
    expect(notes.map((n) => n.userId)).toEqual([a.editor.id]);
    expect(await db.auditLog.count({ where: { itemId: id, organizationId: { not: acme.id } } })).toBe(0);
  });

  it("stops a deactivated member from being given work, without touching their other organization", async () => {
    await people.setUserActive(g.admin, { userId: g.designer.id }, false, IP);
    await reload();
    expect(a.designer.isActive).toBe(true);
    expect(g.designer.isActive).toBe(false);
    await expect(
      items.createItem(
        g.admin,
        { departmentId: globex.departmentId, title: "Needs a designer", deadline: "", assignees: { [await templateId(globex, "DESIGN")]: g.designer.id } },
        IP,
      ),
    ).rejects.toThrow();
    // Still works for Acme.
    const ok = await items.createItem(
      a.pm,
      { departmentId: acme.departmentId, title: "Acme designer still fine", deadline: "", assignees: { [await templateId(acme, "DESIGN")]: a.designer.id } },
      IP,
    );
    expect(ok.number).toBeGreaterThan(0);
    // The shared account wasn't signed out or touched: only its Globex membership changed.
    const account = await db.user.findUniqueOrThrow({ where: { id: a.designer.id } });
    expect(account.sessionVersion).toBe(0);
    await people.setUserActive(g.admin, { userId: g.designer.id }, true, IP);
    await reload();
  });

  // ── People ─────────────────────────────────────────────────────────────

  it("lists and opens only the organization's own people", async () => {
    const globexPeople = await people.listUsers(g.admin, {});
    expect(globexPeople.map((p) => p.email).sort()).toEqual(["designer@example.com", "g-admin@example.com", "g-writer@example.com"]);
    expect(await people.getUserDetail(g.admin, a.pm.id)).toBeNull();
    // Roles shown are this organization's only.
    expect((await people.listDepartmentRoles(g.admin)).every((d) => d.id === globex.departmentId)).toBe(true);
  });

  it("refuses to change people of another organization", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: a.pm.id } });
    await expect(people.updateUser(g.admin, { userId: a.pm.id, isAdmin: "on", roleIds: [] }, IP)).rejects.toBeInstanceOf(NotFoundError);
    await expect(people.setUserActive(g.admin, { userId: a.pm.id }, false, IP)).rejects.toBeInstanceOf(NotFoundError);
    await expect(people.sendSetupLink(g.admin, { userId: a.pm.id }, IP)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      people.setTemporaryPassword(g.admin, { userId: a.pm.id, temporaryPassword: "a-long-temp-pass" }, IP),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(people.signOutEverywhere(g.admin, { userId: a.pm.id }, IP)).rejects.toBeInstanceOf(NotFoundError);
    const after = await db.user.findUniqueOrThrow({ where: { id: a.pm.id } });
    expect(after).toEqual(before);
    expect(await db.organizationMember.count({ where: { userId: a.pm.id } })).toBe(1);
  });

  it("won't hand out another organization's roles", async () => {
    await expect(
      people.updateUser(g.admin, { userId: g.writer.id, roleIds: [acme.roleIds.PROJECT_MANAGER] }, IP),
    ).rejects.toBeInstanceOf(ValidationError);
    // And the database itself refuses such a row, whatever the code does.
    await expect(
      db.membership.create({ data: { organizationId: globex.id, userId: g.writer.id, roleId: acme.roleIds.PROJECT_MANAGER } }),
    ).rejects.toThrow();
    await expect(
      db.membership.create({ data: { organizationId: acme.id, userId: g.writer.id, roleId: acme.roleIds.PROJECT_MANAGER } }),
    ).rejects.toThrow(); // not a member of Acme
    await expect(
      db.contentItem.create({
        data: {
          organizationId: globex.id,
          number: 999,
          departmentId: acme.departmentId,
          workflowId: acme.workflowId,
          stageId: (await item(acme, 1)).stageId,
          title: "Cross-tenant row",
          brief: "",
          createdById: g.admin.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("changes only this organization's roles of a shared account", async () => {
    await people.updateUser(g.admin, { userId: g.designer.id, roleIds: [globex.roleIds.VIDEO_EDITOR] }, IP);
    const roles = await db.membership.findMany({ where: { userId: g.designer.id }, select: { organizationId: true, roleId: true } });
    expect(roles).toEqual(
      expect.arrayContaining([
        { organizationId: acme.id, roleId: acme.roleIds.GRAPHIC_DESIGNER },
        { organizationId: globex.id, roleId: globex.roleIds.VIDEO_EDITOR },
      ]),
    );
    expect(roles).toHaveLength(2);
    await people.updateUser(g.admin, { userId: g.designer.id, roleIds: [globex.roleIds.GRAPHIC_DESIGNER] }, IP);
  });

  it("protects shared accounts: no password, name, email or session changes by another organization's admin", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: g.designer.id } });
    await expect(
      people.setTemporaryPassword(g.admin, { userId: g.designer.id, temporaryPassword: "a-long-temp-pass" }, IP),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      people.updateUser(g.admin, { userId: g.designer.id, email: "attacker@example.com", roleIds: [globex.roleIds.GRAPHIC_DESIGNER] }, IP),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(people.signOutEverywhere(g.admin, { userId: g.designer.id }, IP)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.user.findUniqueOrThrow({ where: { id: g.designer.id } })).toEqual(before);

    // A reset link goes to the owner's own inbox, so that's allowed.
    sent.length = 0;
    const link = await people.sendSetupLink(g.admin, { userId: g.designer.id }, IP);
    expect(link.emailSent).toBe(true);
    expect(sent[0].to).toBe("designer@example.com");

    // Accounts that live only in this organization can still be fully managed.
    await people.updateUser(g.admin, { userId: g.writer.id, name: "Gia W.", email: "gia@example.com", roleIds: [globex.roleIds.SCRIPT_WRITER] }, IP);
    expect((await db.user.findUniqueOrThrow({ where: { id: g.writer.id } })).email).toBe("gia@example.com");
    await people.updateUser(g.admin, { userId: g.writer.id, name: "Gia Writer", email: "g-writer@example.com", roleIds: [globex.roleIds.SCRIPT_WRITER] }, IP);
  });

  it("adds someone who already has an account without touching their password", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { email: "a-editor@example.com" } });
    await expect(
      people.createUser(g.admin, { name: "Whatever", email: "a-editor@example.com", roleIds: [globex.roleIds.CONTENT_EDITOR], setup: "temporary", temporaryPassword: "a-long-temp-pass" }, IP),
    ).rejects.toBeInstanceOf(AppError);

    sent.length = 0;
    const added = await people.createUser(
      g.admin,
      { name: "Renamed By Admin", email: "a-editor@example.com", roleIds: [globex.roleIds.CONTENT_EDITOR], setup: "invite" },
      IP,
    );
    expect(added.userId).toBe(before.id);
    const after = await db.user.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.name).toBe(before.name); // their account, their name
    expect(sent.map((m) => m.subject)).toEqual(["You've been added to Globex Studio on Workbench"]);
    expect((await people.getUserDetail(g.admin, before.id))?.status).toBe("pending");

    await expect(
      people.createUser(g.admin, { name: "Again", email: "a-editor@example.com", roleIds: [globex.roleIds.CONTENT_EDITOR], setup: "invite" }, IP),
    ).rejects.toMatchObject({ fieldErrors: { email: [expect.stringContaining("already in your organization")] } });
  });

  it("keeps at least one administrator per organization, counting only that organization", async () => {
    // Acme has two admins. Globex gets a second one, Gwen...
    await addPerson(db, acme, { email: "a-admin2@example.com", name: "Abe Admin", isAdmin: true });
    await addPerson(db, globex, { email: "g-admin2@example.com", name: "Gwen Admin", isAdmin: true });
    const gwen = await orgUser(db, "g-admin2@example.com", globex.id);
    // ...who Gus then demotes, leaving Gus as Globex's only admin.
    await people.updateUser(g.admin, { userId: gwen.id, roleIds: [globex.roleIds.PROJECT_MANAGER] }, IP);

    // Gwen's page still thinks she's an admin. Acme's admins don't count for Globex,
    // so her demoting or deactivating Gus is refused.
    await expect(people.updateUser(gwen, { userId: g.admin.id, roleIds: [globex.roleIds.PROJECT_MANAGER] }, IP)).rejects.toThrow(
      /at least one active administrator/,
    );
    await expect(people.setUserActive(gwen, { userId: g.admin.id }, false, IP)).rejects.toThrow(/at least one active administrator/);
    expect((await orgUser(db, g.admin.email, globex.id)).isAdmin).toBe(true);
  });

  // ── Sign-up and organizations ─────────────────────────────────────────

  it("signs up in two steps, creating nothing until the email link is used", async () => {
    sent.length = 0;
    await signup.requestSignup(
      { name: "Nia New", email: "Nia@Example.com", organizationName: "Nia's Studio", organizationSlug: "nia-studio", timeZone: "Africa/Lagos" },
      IP,
    );
    await flushQueued();
    expect(await db.user.count({ where: { email: "nia@example.com" } })).toBe(0);
    expect(await db.organization.count({ where: { slug: "nia-studio" } })).toBe(0);
    const token = sent[0].text.match(/\/signup\/([A-Za-z0-9_-]+)/)![1];
    expect(sent[0].to).toBe("nia@example.com");
    expect(await signup.getSignupInfo(token)).toMatchObject({ state: "valid", organizationName: "Nia's Studio" });

    const result = await signup.completeSignup({ token, password: "a long enough password", confirmPassword: "a long enough password" }, IP);
    expect(result).toEqual({ email: "nia@example.com", slug: "nia-studio" });
    const org = await db.organization.findUniqueOrThrow({
      where: { slug: "nia-studio" },
      include: { members: { include: { user: true } }, departments: { include: { roles: true, workflows: true } } },
    });
    expect(org.members).toHaveLength(1);
    expect(org.members[0]).toMatchObject({ isAdmin: true, isActive: true, user: { email: "nia@example.com", name: "Nia New" } });
    expect(org.members[0].joinedAt).not.toBeNull();
    expect(org.departments).toHaveLength(1);
    expect(org.departments[0]).toMatchObject({ key: "media", timezone: "Africa/Lagos" });
    expect(org.departments[0].roles).toHaveLength(5);
    expect(org.departments[0].workflows).toHaveLength(1);

    // The link works once.
    await expect(
      signup.completeSignup({ token, password: "another long password", confirmPassword: "another long password" }, IP),
    ).rejects.toThrow(/expired or has already been used/);
    expect(await signup.getSignupInfo(token)).toEqual({ state: "used" });
  });

  it("answers a sign-up for an existing account the same way, and emails the owner instead", async () => {
    sent.length = 0;
    await signup.requestSignup(
      { name: "Imposter", email: "a-pm@example.com", organizationName: "Fake Co", organizationSlug: "fake-co" },
      IP,
    );
    await flushQueued();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "a-pm@example.com", subject: "You already have a Workbench account" });
    expect(await db.pendingSignup.count({ where: { email: "a-pm@example.com" } })).toBe(0);
    expect(await db.organization.count({ where: { slug: "fake-co" } })).toBe(0);
  });

  it("rejects taken and reserved addresses, and suffixes one taken while the link was in the inbox", async () => {
    await expect(
      signup.requestSignup({ name: "X", email: "x@example.com", organizationName: "Acme again", organizationSlug: "acme" }, IP),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      signup.requestSignup({ name: "X", email: "x@example.com", organizationName: "Login", organizationSlug: "login" }, IP),
    ).rejects.toBeInstanceOf(ValidationError);

    sent.length = 0;
    await signup.requestSignup({ name: "Kai", email: "kai@example.com", organizationName: "Kai Media", organizationSlug: "kai-media" }, IP);
    await flushQueued();
    const token = sent[0].text.match(/\/signup\/([A-Za-z0-9_-]+)/)![1];
    await orgs.createOrganization(a.admin, { name: "Kai Media (taken)", slug: "kai-media" }, IP);
    const result = await signup.completeSignup({ token, password: "a long enough password", confirmPassword: "a long enough password" }, IP);
    expect(result.slug).toBe("kai-media-2");
  });

  it("lets a signed-in person create another organization, and only its admins change its settings", async () => {
    const created = await orgs.createOrganization(g.writer, { name: "Gia Freelance", slug: "gia-freelance", timeZone: "Not/AZone" }, IP);
    const org = await db.organization.findUniqueOrThrow({ where: { slug: created.slug }, include: { departments: true } });
    expect(org.departments[0].timezone).toBe("UTC"); // unknown zones fall back
    const gia = await orgUser(db, g.writer.email, org.id);
    expect(gia.isAdmin).toBe(true);

    await expect(orgs.updateOrganization(g.writer, { name: "Globex renamed", slug: "globex" }, IP)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(orgs.updateOrganization(gia, { name: "Gia", slug: "acme" }, IP)).rejects.toBeInstanceOf(ValidationError);
    expect(await orgs.updateOrganization(gia, { name: "Gia Studio", slug: "gia-studio" }, IP)).toEqual({ slug: "gia-studio" });
    expect(await db.organization.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({ name: "Gia Studio", slug: "gia-studio" });
  });

  it("lets only platform admins list and suspend organizations", async () => {
    await expect(orgs.listOrganizations(a.admin)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(orgs.setOrganizationActive(a.admin, { organizationId: globex.id }, false, IP)).rejects.toBeInstanceOf(ForbiddenError);

    const operator = { ...a.admin, isPlatformAdmin: true };
    const listed = await orgs.listOrganizations(operator);
    expect(listed.find((o) => o.slug === "acme")).toMatchObject({ name: "Acme Media", isActive: true, items: 18 });
    await orgs.setOrganizationActive(operator, { organizationId: globex.id }, false, IP);
    expect(await db.organization.findUniqueOrThrow({ where: { id: globex.id } })).toMatchObject({ isActive: false });
    await orgs.setOrganizationActive(operator, { organizationId: globex.id }, true, IP);
    expect(await db.organization.findUniqueOrThrow({ where: { id: globex.id } })).toMatchObject({ isActive: true, suspendedAt: null });
  });

  async function templateId(org: TestOrg, key: string) {
    return (await db.taskTemplate.findFirstOrThrow({ where: { key, stage: { workflowId: org.workflowId } } })).id;
  }
});
