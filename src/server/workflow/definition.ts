import type { StageDef, TaskTemplateDef, WorkflowDef } from "./types";

/** Fast lookups over a workflow definition. Stages are ordered by position. */
export class WorkflowIndex {
  readonly stages: StageDef[];
  private stageIndex = new Map<string, number>();
  private templateIndex = new Map<string, { template: TaskTemplateDef; stageIndex: number }>();

  constructor(readonly def: WorkflowDef) {
    this.stages = [...def.stages].sort((a, b) => a.position - b.position);
    this.stages.forEach((stage, i) => {
      this.stageIndex.set(stage.id, i);
      for (const template of stage.tasks) this.templateIndex.set(template.id, { template, stageIndex: i });
    });
  }

  indexOf(stageId: string): number {
    const i = this.stageIndex.get(stageId);
    if (i === undefined) throw new Error(`Stage ${stageId} is not part of workflow ${this.def.id}`);
    return i;
  }

  stage(stageId: string): StageDef {
    return this.stages[this.indexOf(stageId)];
  }

  template(templateId: string): TaskTemplateDef {
    const entry = this.templateIndex.get(templateId);
    if (!entry) throw new Error(`Task template ${templateId} is not part of workflow ${this.def.id}`);
    return entry.template;
  }

  /** Index of the work stage a task template belongs to. */
  templateStageIndex(templateId: string): number {
    const entry = this.templateIndex.get(templateId);
    if (!entry) throw new Error(`Task template ${templateId} is not part of workflow ${this.def.id}`);
    return entry.stageIndex;
  }

  /**
   * While an item sits at stage `i`, whose tasks are "current"?
   * A work stage's own; a queue's are those of the work stage right after it.
   */
  currentWorkIndex(i: number): number | null {
    const stage = this.stages[i];
    if (stage.kind === "WORK") return i;
    if (stage.kind === "QUEUE") return i + 1;
    return null;
  }

  /** Nearest earlier work stage (queues are skipped), or null. */
  previousWorkIndex(i: number): number | null {
    for (let j = i - 1; j >= 0; j--) if (this.stages[j].kind === "WORK") return j;
    return null;
  }

  earlierWorkIndexes(i: number): number[] {
    const out: number[] = [];
    for (let j = 0; j < i; j++) if (this.stages[j].kind === "WORK") out.push(j);
    return out;
  }

  first(): StageDef {
    return this.stages[0];
  }
}

/** Problems that would make a workflow unusable. Empty when it's valid. */
export function validateWorkflow(def: WorkflowDef): string[] {
  const problems: string[] = [];
  const stages = [...def.stages].sort((a, b) => a.position - b.position);

  if (stages.length < 2) problems.push("A workflow needs at least two stages.");
  if (new Set(stages.map((s) => s.position)).size !== stages.length) problems.push("Two stages share a position.");
  if (new Set(stages.map((s) => s.key)).size !== stages.length) problems.push("Two stages share a key.");
  if (stages[0] && stages[0].kind !== "WORK") problems.push("The first stage must be a work stage.");

  const last = stages[stages.length - 1];
  if (last && last.kind !== "DONE") problems.push("The last stage must be the finished stage.");
  if (stages.filter((s) => s.kind === "DONE").length > 1) problems.push("Only one stage can be the finished stage.");

  stages.forEach((stage, i) => {
    if (stage.kind === "WORK" && stage.tasks.length === 0) problems.push(`"${stage.name}" needs at least one task.`);
    if (stage.kind !== "WORK" && stage.tasks.length > 0) problems.push(`"${stage.name}" can't have tasks.`);
    if (stage.kind === "QUEUE" && stages[i + 1]?.kind !== "WORK") {
      problems.push(`"${stage.name}" is a waiting stage, so it must be followed by a work stage.`);
    }
  });

  const templateKeys = stages.flatMap((s) => s.tasks.map((t) => t.key));
  if (new Set(templateKeys).size !== templateKeys.length) problems.push("Two tasks share a key.");

  return problems;
}
