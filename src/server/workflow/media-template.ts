/**
 * The Media department's default roles and workflow, as data.
 * Used by the seed and by tests. Other departments define their own.
 */

export const MEDIA_ROLES = [
  { key: "PROJECT_MANAGER", name: "Project manager", canCreateItems: true, canManageItems: true },
  { key: "SCRIPT_WRITER", name: "Script writer", canCreateItems: true, canManageItems: false },
  { key: "CONTENT_EDITOR", name: "Content editor", canCreateItems: false, canManageItems: false },
  { key: "GRAPHIC_DESIGNER", name: "Graphic designer", canCreateItems: false, canManageItems: false },
  { key: "VIDEO_EDITOR", name: "Video editor", canCreateItems: false, canManageItems: false },
] as const;

export type MediaRoleKey = (typeof MEDIA_ROLES)[number]["key"];

export type StageTemplate = {
  key: string;
  name: string;
  description: string;
  kind: "WORK" | "QUEUE" | "DONE";
  tasks?: {
    key: string;
    name: string;
    role: MediaRoleKey;
    canEditScript: boolean;
    submitLabel: string;
  }[];
};

export const MEDIA_STAGES: StageTemplate[] = [
  {
    key: "DRAFTING",
    name: "Drafting",
    description: "The script writer is writing the script.",
    kind: "WORK",
    tasks: [{ key: "SCRIPT", name: "Script", role: "SCRIPT_WRITER", canEditScript: true, submitLabel: "Send for editing" }],
  },
  {
    key: "READY_FOR_EDITING",
    name: "Ready for editing",
    description: "Waiting for a content editor to start.",
    kind: "QUEUE",
  },
  {
    key: "IN_EDITING",
    name: "Editing",
    description: "A content editor is reviewing and editing the script.",
    kind: "WORK",
    tasks: [{ key: "EDIT", name: "Edit", role: "CONTENT_EDITOR", canEditScript: true, submitLabel: "Approve script" }],
  },
  {
    key: "APPROVED_SCRIPT",
    name: "Script approved",
    description: "The script is final. Waiting for design and video to start.",
    kind: "QUEUE",
  },
  {
    key: "IN_PRODUCTION",
    name: "Design & video",
    description: "Design and video are done at the same time, from the approved script.",
    kind: "WORK",
    tasks: [
      { key: "DESIGN", name: "Design", role: "GRAPHIC_DESIGNER", canEditScript: false, submitLabel: "Mark design done" },
      { key: "VIDEO", name: "Video", role: "VIDEO_EDITOR", canEditScript: false, submitLabel: "Mark video done" },
    ],
  },
  {
    key: "READY_FOR_REVIEW",
    name: "Final review",
    description: "The project manager checks everything before it's marked complete.",
    kind: "WORK",
    tasks: [{ key: "REVIEW", name: "Final review", role: "PROJECT_MANAGER", canEditScript: false, submitLabel: "Approve & complete" }],
  },
  { key: "COMPLETED", name: "Completed", description: "Finished and approved.", kind: "DONE" },
];
