/**
 * Service tests against a real Postgres database (set TEST_DATABASE_URL to a
 * separate, migrated database; it is wiped at the start).
 * These cover what pure tests can't: row locking under concurrency, and that
 * history (assignments, comments, versions, audit) is actually stored.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { AppError, NotFoundError } from "@/server/errors";
import { addPerson, createTestOrg, orgUser, resetDatabase, type TestOrg } from "@/server/testing/db-fixtures";
import { textToDoc } from "@/lib/script-doc";

/** What the editor sends: the document as a JSON string. */
const script = (text: string) => JSON.stringify(textToDoc(text));

const url = process.env.TEST_DATABASE_URL;
const IP = "203.0.113.1";

type Services = typeof import("./commands");
type Queries = typeof import("./queries");
type ItemActor = import("./commands").ItemActor;

describe.skipIf(!url)("items service (database)", () => {
  let db: PrismaClient;
  let svc: Services;
  let q: Queries;
  let org: TestOrg;
  let departmentId: string;
  const users: Record<string, ItemActor> = {};

  async function itemState(number: number) {
    return db.contentItem.findFirstOrThrow({
      where: { organizationId: org.id, number },
      include: { tasks: { include: { template: true } }, stage: true },
    });
  }

  async function taskId(number: number, key: string) {
    const item = await itemState(number);
    return item.tasks.find((t) => t.template.key === key)!.id;
  }

  async function itemId(number: number) {
    return (await itemState(number)).id;
  }

  /** Writer creates, writes and submits; editor approves. Returns the item number. */
  async function approvedItem(title: string, preassign = true) {
    const templates = await db.taskTemplate.findMany({ where: { stage: { workflow: { departmentId } } } });
    const byKey = Object.fromEntries(templates.map((t) => [t.key, t.id]));
    const { number } = await svc.createItem(
      users.pm,
      {
        departmentId,
        title,
        brief: "Fictional brief.",
        deadline: "2026-12-01",
        assignees: preassign
          ? {
              [byKey.SCRIPT]: users.writer.id,
              [byKey.EDIT]: users.editor.id,
              [byKey.DESIGN]: users.designer.id,
              [byKey.VIDEO]: users.video.id,
              [byKey.REVIEW]: users.pm.id,
            }
          : {},
      },
      IP,
    );
    const id = await itemId(number);
    if (!preassign) {
      await svc.runTaskCommand(users.writer, { itemId: id, taskId: await taskId(number, "SCRIPT"), intent: "pickUp" }, IP);
    }
    await svc.saveScript(users.writer, { itemId: id, baseVersion: 0, content: script("Scene 1\nVisual: rooftop") }, IP);
    await svc.runTaskCommand(users.writer, { itemId: id, taskId: await taskId(number, "SCRIPT"), intent: "submit" }, IP);
    await svc.runTaskCommand(users.editor, { itemId: id, taskId: await taskId(number, "EDIT"), intent: "start" }, IP);
    await svc.runTaskCommand(users.editor, { itemId: id, taskId: await taskId(number, "EDIT"), intent: "submit" }, IP);
    return number;
  }

  beforeAll(async () => {
    if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must point at a separate database");
    process.env.DATABASE_URL = url;
    ({ db } = await import("@/server/db"));
    svc = await import("./commands");
    q = await import("./queries");

    await resetDatabase(db);

    org = await createTestOrg(db, "media-test", "Media Test");
    departmentId = org.departmentId;
    // A second department in the same organization, with its own writer role.
    const other = await db.department.create({ data: { organizationId: org.id, key: "other", name: "Other" } });
    const otherWriter = await db.role.create({
      data: { organizationId: org.id, departmentId: other.id, key: "SCRIPT_WRITER", name: "Script writer", canCreateItems: true },
    });

    const people = [
      ["pm", "Morgan PM", "PROJECT_MANAGER"],
      ["writer", "Riley Writer", "SCRIPT_WRITER"],
      ["editor", "Casey Editor", "CONTENT_EDITOR"],
      ["editor2", "Robin Editor", "CONTENT_EDITOR"],
      ["designer", "Taylor Designer", "GRAPHIC_DESIGNER"],
      ["video", "Drew Video", "VIDEO_EDITOR"],
      ["video2", "Quinn Video", "VIDEO_EDITOR"],
    ] as const;
    for (const [key, name, role] of people) {
      await addPerson(db, org, { email: `${key}@example.com`, name, roles: [role] });
      users[key] = await orgUser(db, `${key}@example.com`, org.id);
    }
    const outsider = await addPerson(db, org, { email: "outsider@example.com", name: "Alex Outsider" });
    await db.membership.create({ data: { organizationId: org.id, userId: outsider, roleId: otherWriter.id } });
    users.outsider = await orgUser(db, "outsider@example.com", org.id);
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("creates an item with one task per role and records the assignments", async () => {
    const { number } = await svc.createItem(users.writer, { departmentId, title: "Writer's own item", deadline: "" }, IP);
    const item = await itemState(number);
    expect(item.stage.key).toBe("DRAFTING");
    expect(item.tasks).toHaveLength(5);
    const script = item.tasks.find((t) => t.template.key === "SCRIPT")!;
    expect(script).toMatchObject({ assigneeId: users.writer.id, status: "IN_PROGRESS" });
    expect(await db.taskAssignment.count({ where: { taskId: script.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { itemId: item.id, action: "item.created" } })).toBe(1);
  });

  it("an unassigned task notifies everyone with that role, not the person who acted", async () => {
    const { number } = await svc.createItem(users.writer, { departmentId, title: "Pool test", deadline: "" }, IP);
    const id = await itemId(number);
    await svc.saveScript(users.writer, { itemId: id, baseVersion: 0, content: script("Hello") }, IP);
    await svc.runTaskCommand(users.writer, { itemId: id, taskId: await taskId(number, "SCRIPT"), intent: "submit" }, IP);
    const notes = await db.notification.findMany({ where: { itemId: id, type: "TASK_READY" } });
    expect(notes.map((n) => n.userId).sort()).toEqual([users.editor.id, users.editor2.id].sort());
  });

  it("design and video finishing at the same instant move the item to review exactly once", async () => {
    for (let round = 0; round < 3; round++) {
      const number = await approvedItem(`Concurrency ${round}`);
      const id = await itemId(number);
      await svc.runTaskCommand(users.designer, { itemId: id, taskId: await taskId(number, "DESIGN"), intent: "start" }, IP);
      const [design, video] = await Promise.all([
        svc.runTaskCommand(users.designer, { itemId: id, taskId: await taskId(number, "DESIGN"), intent: "submit" }, IP),
        svc.runTaskCommand(users.video, { itemId: id, taskId: await taskId(number, "VIDEO"), intent: "submit" }, IP),
      ]);
      expect([design.stageId, video.stageId]).toContain((await itemState(number)).stageId);

      const item = await itemState(number);
      expect(item.stage.key).toBe("READY_FOR_REVIEW");
      expect(item.tasks.find((t) => t.template.key === "REVIEW")!.status).toBe("READY");
      const toReview = await db.auditLog.findMany({ where: { itemId: id, action: "item.stage_changed" } });
      expect(toReview.filter((a) => (a.data as { to: string }).to === "Final review")).toHaveLength(1);
    }
  });

  it("keeps a version for every save and submit", async () => {
    const number = await approvedItem("Versions");
    const versions = await db.scriptVersion.findMany({ where: { item: { organizationId: org.id, number } }, orderBy: { number: "asc" } });
    expect(versions.map((v) => v.reason)).toEqual(["SAVE", "SUBMIT", "SUBMIT"]);
    expect(versions.map((v) => v.authorId)).toEqual([users.writer.id, users.writer.id, users.editor.id]);
    expect((await itemState(number)).latestScriptVersion).toBe(3);
  });

  it("send-back from design keeps the video lane's progress and the reason", async () => {
    const number = await approvedItem("Send-back");
    const id = await itemId(number);
    await svc.runTaskCommand(users.video, { itemId: id, taskId: await taskId(number, "VIDEO"), intent: "start" }, IP);
    const videoBefore = (await itemState(number)).tasks.find((t) => t.template.key === "VIDEO")!;

    await svc.sendBack(users.designer, { itemId: id, fromTaskId: await taskId(number, "DESIGN"), comment: "Scene 2 contradicts the brief." }, IP);

    let item = await itemState(number);
    expect(item.stage.key).toBe("IN_EDITING");
    const video = item.tasks.find((t) => t.template.key === "VIDEO")!;
    expect(video).toMatchObject({ status: "IN_PROGRESS", assigneeId: users.video.id, startedAt: videoBefore.startedAt });
    const reason = await db.comment.findFirstOrThrow({ where: { itemId: id, kind: "SEND_BACK" } });
    expect(reason).toMatchObject({ body: "Scene 2 contradicts the brief.", taskId: await taskId(number, "EDIT"), authorId: users.designer.id });
    expect(await db.notification.count({ where: { itemId: id, userId: users.video.id, type: "ON_HOLD" } })).toBe(1);

    await svc.runTaskCommand(users.editor, { itemId: id, taskId: await taskId(number, "EDIT"), intent: "submit" }, IP);
    item = await itemState(number);
    expect(item.stage.key).toBe("IN_PRODUCTION"); // video had started, so no waiting stage
    expect(item.tasks.find((t) => t.template.key === "VIDEO")!.status).toBe("IN_PROGRESS");
  });

  it("reassigning mid-task keeps the status and the full history", async () => {
    const number = await approvedItem("Reassign");
    const id = await itemId(number);
    const video = await taskId(number, "VIDEO");
    await svc.runTaskCommand(users.designer, { itemId: id, taskId: await taskId(number, "DESIGN"), intent: "start" }, IP);
    await svc.runTaskCommand(users.video, { itemId: id, taskId: video, intent: "start" }, IP);
    await svc.requestChanges(users.pm, { itemId: id, taskId: video, comment: "Use the vertical cut." }, IP);

    await svc.reassignTask(users.pm, { itemId: id, taskId: video, toUserId: users.video2.id, note: "Drew is off sick." }, IP);

    const task = await db.task.findUniqueOrThrow({ where: { id: video } });
    expect(task).toMatchObject({ assigneeId: users.video2.id, status: "IN_PROGRESS", changesRequested: true });
    const history = await db.taskAssignment.findMany({ where: { taskId: video }, orderBy: { assignedAt: "asc" } });
    expect(history.map((h) => [h.userId, h.endedAt === null, h.note])).toEqual([
      [users.video.id, false, null],
      [users.video2.id, true, "Drew is off sick."],
    ]);
    expect(await db.comment.count({ where: { taskId: video, kind: "CHANGE_REQUEST", resolvedAt: null } })).toBe(1);

    // The previous assignee can't act any more, and nothing changes when they try.
    const before = (await itemState(number)).stateVersion;
    await expect(svc.runTaskCommand(users.video, { itemId: id, taskId: video, intent: "submit" }, IP)).rejects.toBeInstanceOf(AppError);
    expect((await itemState(number)).stateVersion).toBe(before);

    await svc.runTaskCommand(users.video2, { itemId: id, taskId: video, intent: "submit" }, IP);
    expect(await db.comment.count({ where: { taskId: video, kind: "CHANGE_REQUEST", resolvedAt: null } })).toBe(0);

    const detail = await q.getItemDetail(users.pm, String(number));
    expect(detail!.activity.some((a) => a.text === "reassigned Video from Drew Video to Quinn Video")).toBe(true);
  });

  it("refuses commands from the wrong people without changing anything", async () => {
    const number = await approvedItem("Refusals");
    const id = await itemId(number);
    const before = await itemState(number);
    await expect(
      svc.runTaskCommand(users.designer, { itemId: id, taskId: await taskId(number, "VIDEO"), intent: "start" }, IP),
    ).rejects.toThrow(/assigned to someone else/);
    await expect(
      svc.runTaskCommand(users.outsider, { itemId: id, taskId: await taskId(number, "DESIGN"), intent: "start" }, IP),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.setItemArchived(users.designer, { itemId: id, archived: "true" }, IP)).rejects.toThrow(/project manager/);
    expect((await itemState(number)).stateVersion).toBe(before.stateVersion);
    expect(await q.getItemDetail(users.outsider, String(number))).toBeNull();
  });

  it("keeps drafts private until they're first submitted", async () => {
    const { number } = await svc.createItem(users.writer, { departmentId, title: "Secret draft", deadline: "" }, IP);
    const id = await itemId(number);
    expect(await q.getItemDetail(users.editor, String(number))).toBeNull();
    expect(await q.getItemDetail(users.pm, String(number))).not.toBeNull();
    expect((await q.listItems(users.editor)).some((i) => i.number === number)).toBe(false);

    await svc.saveScript(users.writer, { itemId: id, baseVersion: 0, content: script("Draft text") }, IP);
    await svc.runTaskCommand(users.writer, { itemId: id, taskId: await taskId(number, "SCRIPT"), intent: "submit" }, IP);
    expect(await q.getItemDetail(users.editor, String(number))).not.toBeNull();

    await db.department.update({ where: { id: departmentId }, data: { draftsVisibleToAll: true } });
    const { number: other } = await svc.createItem(users.writer, { departmentId, title: "Open draft", deadline: "" }, IP);
    expect(await q.getItemDetail(users.editor, String(other))).not.toBeNull();
    await db.department.update({ where: { id: departmentId }, data: { draftsVisibleToAll: false } });
  });

  it("never overwrites someone else's script save", async () => {
    const { number } = await svc.createItem(users.writer, { departmentId, title: "Conflict", deadline: "" }, IP);
    const id = await itemId(number);
    await svc.saveScript(users.writer, { itemId: id, baseVersion: 0, content: script("First") }, IP);
    await expect(svc.saveScript(users.pm, { itemId: id, baseVersion: 0, content: script("Stale edit") }, IP)).rejects.toThrow(/Someone else saved/);
    expect(await svc.saveScript(users.writer, { itemId: id, baseVersion: 1, content: script("First") }, IP)).toEqual({ version: 1, unchanged: true });
    expect(await db.scriptVersion.count({ where: { itemId: id } })).toBe(1);
  });

  it("checks every saved script against the editor's format, and counts formatting as a change", async () => {
    const { number } = await svc.createItem(users.writer, { departmentId, title: "Formatting", deadline: "" }, IP);
    const id = await itemId(number);
    await svc.saveScript(users.writer, { itemId: id, baseVersion: 0, content: script("Scene 1") }, IP);

    const bold = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Scene 1", marks: [{ type: "bold" }] }] }] });
    expect(await svc.saveScript(users.writer, { itemId: id, baseVersion: 1, content: bold }, IP)).toEqual({ version: 2, unchanged: false });

    const link = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }],
    });
    await expect(svc.saveScript(users.writer, { itemId: id, baseVersion: 2, content: link }, IP)).rejects.toThrow(/can't be saved/);
    await expect(svc.saveScript(users.writer, { itemId: id, baseVersion: 2, content: "{not json" }, IP)).rejects.toThrow(/couldn't be read/);
    expect(await db.scriptVersion.count({ where: { itemId: id } })).toBe(2);
  });

  it("shows people their turn, what's coming, and unassigned work for their role", async () => {
    const number = await approvedItem("Home", false);
    const work = await q.getMyWork(users.designer);
    expect(work.upForGrabs.some((c) => c.itemNumber === number && c.taskName === "Design")).toBe(true);
    const editorWork = await q.getMyWork(users.editor);
    expect(editorWork.yourTurn.some((c) => c.itemNumber === number)).toBe(false); // their part is done
  });

  it("builds the board without private drafts, archived items or old completed items", async () => {
    const { getBoard, BOARD_COMPLETED_DAYS } = await import("@/server/board/queries");
    const cards = (board: Awaited<ReturnType<typeof getBoard>>) =>
      board.columns.flatMap((c) => c.cards.map((card) => ({ column: c.key, ...card })));

    const { number: draft } = await svc.createItem(users.writer, { departmentId, title: "Board: private draft", deadline: "" }, IP);
    const approved = await approvedItem("Board: approved");
    const { number: archived } = await svc.createItem(users.pm, { departmentId, title: "Board: archived", deadline: "" }, IP);
    await svc.setItemArchived(users.pm, { itemId: await itemId(archived), archived: "true" }, IP);
    const completedStage = await db.stage.findFirstOrThrow({ where: { key: "COMPLETED", workflow: { departmentId } } });
    const finish = async (title: string, daysAgo: number) => {
      const { number } = await svc.createItem(users.pm, { departmentId, title, deadline: "" }, IP);
      await db.contentItem.update({
        where: { organizationId_number: { organizationId: org.id, number } },
        data: { stageId: completedStage.id, firstSubmittedAt: new Date(), completedAt: new Date(Date.now() - daysAgo * 86_400_000) },
      });
      return number;
    };
    const recent = await finish("Board: finished recently", 1);
    const old = await finish("Board: finished long ago", BOARD_COMPLETED_DAYS + 1);

    const pmBoard = await getBoard(users.pm, {});
    const pmCards = cards(pmBoard);
    expect(pmBoard.department?.key).toBe("media");
    expect(pmCards.find((c) => c.number === draft)).toMatchObject({ column: "DRAFTING", isDraft: true });
    expect(pmCards.find((c) => c.number === approved)).toMatchObject({
      column: "APPROVED_SCRIPT",
      lanes: [
        { name: "Design", assignee: { id: users.designer.id, name: "Taylor Designer" }, status: "READY", changesRequested: false },
        { name: "Video", assignee: { id: users.video.id, name: "Drew Video" }, status: "READY", changesRequested: false },
      ],
    });
    expect(pmCards.find((c) => c.number === recent)?.column).toBe("COMPLETED");
    expect(pmCards.some((c) => c.number === archived || c.number === old)).toBe(false);
    expect(pmBoard.people.map((p) => p.name)).toContain("Casey Editor");
    expect(pmBoard.people.map((p) => p.name)).not.toContain("Alex Outsider");

    const editorCards = cards(await getBoard(users.editor, {}));
    expect(editorCards.some((c) => c.number === draft)).toBe(false);
    expect(editorCards.some((c) => c.number === approved)).toBe(true);

    const designerMine = cards(await getBoard(users.designer, { person: "me" }));
    expect(designerMine.some((c) => c.number === approved)).toBe(true);
    expect(designerMine.some((c) => c.number === draft)).toBe(false);

    // Someone in another department sees their own department, none of Media's items.
    const outsiderBoard = await getBoard(users.outsider, { dept: "media" });
    expect(outsiderBoard.department?.key).toBe("other");
    expect(outsiderBoard.total).toBe(0);
  });
});
