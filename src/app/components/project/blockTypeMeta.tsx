import type { ComponentType } from "react";
import {
  FileText,
  Link,
  File,
  Palette,
  Contact,
  Video,
  Code,
  CheckSquare,
  PenTool,
  Terminal,
  Kanban,
  Folder,
  Square,
  Frame,
  Webhook,
  Timer,
  Sigma,
} from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { VercelIcon } from "../icons/VercelIcon";

export type AddableBlockType =
  | "text"
  | "link"
  | "file"
  | "github"
  | "palette"
  | "contact"
  | "video"
  | "snippet"
  | "checklist"
  | "kanban"
  | "sketch"
  | "shell"
  | "folder"
  | "vercel"
  | "frame"
  | "webhook"
  | "cron"
  | "latex";

export type SearchableBlockType = AddableBlockType | "core";

export type BlockTypeLabelKey =
  | "blockTypeText"
  | "blockTypeLink"
  | "blockTypeFile"
  | "blockTypeGit"
  | "blockTypePalette"
  | "blockTypeContact"
  | "blockTypeVideo"
  | "blockTypeSnippet"
  | "blockTypeChecklist"
  | "blockTypeKanban"
  | "blockTypeSketch"
  | "blockTypeShell"
  | "blockTypeFolder"
  | "blockTypeVercel"
  | "blockTypeFrame"
  | "blockTypeWebhook"
  | "blockTypeCron"
  | "blockTypeLatex"
  | "blockTypeCore";

export type BlockTypeIconComponent = ComponentType<{
  className?: string;
  size?: number;
}>;

type AddBlockEntry = {
  type: AddableBlockType;
  icon: BlockTypeIconComponent;
  labelKey: BlockTypeLabelKey;
  section: "organize" | "block" | "automation";
};

const ADD_BLOCK_ENTRIES: AddBlockEntry[] = [
  {
    type: "folder",
    icon: Folder,
    labelKey: "blockTypeFolder",
    section: "organize",
  },
  { type: "text", icon: FileText, labelKey: "blockTypeText", section: "block" },
  { type: "link", icon: Link, labelKey: "blockTypeLink", section: "block" },
  { type: "file", icon: File, labelKey: "blockTypeFile", section: "block" },
  {
    type: "github",
    icon: FaGithub,
    labelKey: "blockTypeGit",
    section: "block",
  },
  {
    type: "palette",
    icon: Palette,
    labelKey: "blockTypePalette",
    section: "block",
  },
  {
    type: "contact",
    icon: Contact,
    labelKey: "blockTypeContact",
    section: "block",
  },
  { type: "video", icon: Video, labelKey: "blockTypeVideo", section: "block" },
  {
    type: "snippet",
    icon: Code,
    labelKey: "blockTypeSnippet",
    section: "block",
  },
  {
    type: "checklist",
    icon: CheckSquare,
    labelKey: "blockTypeChecklist",
    section: "block",
  },
  {
    type: "kanban",
    icon: Kanban,
    labelKey: "blockTypeKanban",
    section: "block",
  },
  {
    type: "sketch",
    icon: PenTool,
    labelKey: "blockTypeSketch",
    section: "block",
  },
  {
    type: "shell",
    icon: Terminal,
    labelKey: "blockTypeShell",
    section: "block",
  },
  {
    type: "latex",
    icon: Sigma,
    labelKey: "blockTypeLatex",
    section: "block",
  },
  {
    type: "vercel",
    icon: VercelIcon,
    labelKey: "blockTypeVercel",
    section: "block",
  },
  {
    type: "frame",
    icon: Frame,
    labelKey: "blockTypeFrame",
    section: "organize",
  },
  {
    type: "webhook",
    icon: Webhook,
    labelKey: "blockTypeWebhook",
    section: "automation",
  },
  {
    type: "cron",
    icon: Timer,
    labelKey: "blockTypeCron",
    section: "automation",
  },
];

const SEARCH_BLOCK_OVERRIDES: Record<
  "core",
  { icon: BlockTypeIconComponent; labelKey: BlockTypeLabelKey }
> = {
  core: { icon: FileText, labelKey: "blockTypeCore" },
};

const ADD_BLOCK_MAP = new Map<AddableBlockType, AddBlockEntry>(
  ADD_BLOCK_ENTRIES.map((entry) => [entry.type, entry]),
);

export const ORGANIZE_BLOCK_TYPES = ADD_BLOCK_ENTRIES.filter(
  (entry) => entry.section === "organize",
);

export const CANVAS_BLOCK_TYPES = ADD_BLOCK_ENTRIES.filter(
  (entry) => entry.section === "block",
);

export const AUTOMATION_BLOCK_TYPES = ADD_BLOCK_ENTRIES.filter(
  (entry) => entry.section === "automation",
);

export function getBlockTypeMeta(blockType: string | undefined): {
  icon: BlockTypeIconComponent;
  labelKey: BlockTypeLabelKey;
} {
  if (!blockType) {
    return { icon: Square, labelKey: "blockTypeText" };
  }

  if (blockType === "core") {
    return SEARCH_BLOCK_OVERRIDES.core;
  }

  const fromAddModal = ADD_BLOCK_MAP.get(blockType as AddableBlockType);
  if (fromAddModal) {
    return {
      icon: fromAddModal.icon,
      labelKey: fromAddModal.labelKey,
    };
  }

  return { icon: Square, labelKey: "blockTypeText" };
}
