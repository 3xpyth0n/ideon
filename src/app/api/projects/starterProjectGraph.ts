import { ideonSiteConfig } from "@lib/site-config";
import type { blocksTable, linksTable } from "@lib/types/db";
import { Insertable } from "kysely";
import { v4 as uuidv4 } from "uuid";

type Dictionary = Record<string, unknown>;

interface StarterProjectGraphParams {
  dict: Dictionary;
  now: string;
  ownerId: string;
  projectDescription?: string;
  projectId: string;
  projectName: string;
}

const CORE_BLOCK = {
  width: 640,
  height: 480,
};

const STANDARD_BLOCK = {
  width: 550,
  height: 400,
};

const LAYOUT = {
  checklist: { x: -1000, y: -420 },
  link: { x: -1000, y: 20 },
  git: { x: 450, y: -420 },
  note: { x: 450, y: 20 },
};

const readTranslation = (
  dict: Dictionary,
  path: string,
  fallback: string,
): string => {
  const keys = path.split(".");
  let value: unknown = dict;

  for (const key of keys) {
    if (typeof value !== "object" || value === null) {
      return fallback;
    }

    value = (value as Record<string, unknown>)[key];
  }

  return typeof value === "string" ? value : fallback;
};

const createBlockData = (blockType: blocksTable["blockType"], title: string) =>
  JSON.stringify({
    blockType,
    isLocked: false,
    title,
  });

const createLinkRow = (
  now: string,
  projectId: string,
  source: string,
  target: string,
  sourceHandle: "left" | "right",
  targetHandle: "left" | "right",
): Insertable<linksTable> => ({
  id: uuidv4(),
  projectId,
  source,
  target,
  sourceHandle,
  targetHandle,
  type: "connection",
  animated: 0,
  data: JSON.stringify({}),
  label: null,
  createdAt: now,
  updatedAt: now,
});

export function buildStarterProjectGraph({
  dict,
  now,
  ownerId,
  projectDescription,
  projectId,
  projectName,
}: StarterProjectGraphParams): {
  blocks: Insertable<blocksTable>[];
  links: Insertable<linksTable>[];
} {
  const coreId = uuidv4();
  const checklistId = uuidv4();
  const linkId = uuidv4();
  const gitId = uuidv4();
  const noteId = uuidv4();

  const checklistTitle = readTranslation(
    dict,
    "blocks.blockTypeChecklist",
    "Checklist",
  );
  const linkTitle = readTranslation(dict, "blocks.blockTypeLink", "Link");
  const gitTitle = readTranslation(dict, "blocks.blockTypeGit", "Git Repo");
  const noteTitle = readTranslation(dict, "blocks.blockTypeText", "Note");

  const checklistItems = [
    readTranslation(dict, "starterProject.checklistItemOne", "Define the goal"),
    readTranslation(
      dict,
      "starterProject.checklistItemTwo",
      "Collect useful references",
    ),
    readTranslation(
      dict,
      "starterProject.checklistItemThree",
      "Plan the first tasks",
    ),
  ];

  const noteContent = readTranslation(
    dict,
    "starterProject.noteContent",
    "Capture the context, decisions, and next steps here.",
  );

  const blocks: Insertable<blocksTable>[] = [
    {
      id: coreId,
      projectId,
      blockType: "core",
      positionX: 0,
      positionY: 0,
      width: CORE_BLOCK.width,
      height: CORE_BLOCK.height,
      ownerId,
      content: projectName,
      metadata: JSON.stringify({
        description: projectDescription || "",
      }),
      data: createBlockData("core", projectName),
      createdAt: now,
      updatedAt: now,
      selected: 0,
    },
    {
      id: checklistId,
      projectId,
      blockType: "checklist",
      positionX: LAYOUT.checklist.x,
      positionY: LAYOUT.checklist.y,
      width: STANDARD_BLOCK.width,
      height: STANDARD_BLOCK.height,
      ownerId,
      content: "",
      metadata: JSON.stringify({
        items: checklistItems.map((text) => ({
          id: uuidv4(),
          text,
          checked: false,
        })),
      }),
      data: createBlockData("checklist", checklistTitle),
      createdAt: now,
      updatedAt: now,
      selected: 0,
    },
    {
      id: linkId,
      projectId,
      blockType: "link",
      positionX: LAYOUT.link.x,
      positionY: LAYOUT.link.y,
      width: STANDARD_BLOCK.width,
      height: STANDARD_BLOCK.height,
      ownerId,
      content: ideonSiteConfig.links.documentation,
      metadata: JSON.stringify({}),
      data: createBlockData("link", linkTitle),
      createdAt: now,
      updatedAt: now,
      selected: 0,
    },
    {
      id: gitId,
      projectId,
      blockType: "github",
      positionX: LAYOUT.git.x,
      positionY: LAYOUT.git.y,
      width: STANDARD_BLOCK.width,
      height: STANDARD_BLOCK.height,
      ownerId,
      content: ideonSiteConfig.links.repository,
      metadata: JSON.stringify({
        github: {
          url: ideonSiteConfig.links.repository,
          enabledStats: [
            "stars",
            "commit",
            "release",
            "contributors",
            "issues",
            "pulls",
          ],
          lastStats: null,
          lastFetched: now,
        },
      }),
      data: createBlockData("github", gitTitle),
      createdAt: now,
      updatedAt: now,
      selected: 0,
    },
    {
      id: noteId,
      projectId,
      blockType: "text",
      positionX: LAYOUT.note.x,
      positionY: LAYOUT.note.y,
      width: STANDARD_BLOCK.width,
      height: STANDARD_BLOCK.height,
      ownerId,
      content: noteContent,
      metadata: JSON.stringify({}),
      data: createBlockData("text", noteTitle),
      createdAt: now,
      updatedAt: now,
      selected: 0,
    },
  ];

  const links: Insertable<linksTable>[] = [
    createLinkRow(now, projectId, coreId, checklistId, "left", "right"),
    createLinkRow(now, projectId, coreId, linkId, "left", "right"),
    createLinkRow(now, projectId, coreId, gitId, "right", "left"),
    createLinkRow(now, projectId, coreId, noteId, "right", "left"),
  ];

  return { blocks, links };
}
