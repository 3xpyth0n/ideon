type BlockLike = {
  id: string;
  type?: string;
  data?: {
    blockType?: string;
    metadata?: string | Record<string, unknown>;
  };
};

type LinkLike = {
  source: string;
  target: string;
};

const getBlockType = (block?: BlockLike) => {
  if (!block) return "";
  return block.data?.blockType || block.type || "";
};

const isFolder = (block?: BlockLike) => getBlockType(block) === "folder";
const isCore = (block?: BlockLike) => getBlockType(block) === "core";

const isCollapsed = (block?: BlockLike) => {
  const metadata = block?.data?.metadata;
  if (!metadata) return false;

  if (typeof metadata === "string") {
    try {
      const meta = JSON.parse(metadata);
      return !!meta.isCollapsed;
    } catch {
      return false;
    }
  }

  return !!(metadata as { isCollapsed?: boolean }).isCollapsed;
};

export type FolderLinkRuleErrorCode =
  | "folder_to_core"
  | "folder_reverse_link"
  | "folder_multiple_parents"
  | "folder_collapsed_source";

export type FolderLinkRuleError = {
  code: FolderLinkRuleErrorCode;
  source: string;
  target: string;
};

export const validateFolderLinkRules = (
  blocks: BlockLike[],
  links: LinkLike[],
): FolderLinkRuleError | null => {
  const blockMap = new Map(blocks.map((block) => [block.id, block]));
  const edgeSet = new Set(
    links.map((link) => `${link.source}->${link.target}`),
  );
  const folderParentsByTarget = new Map<string, Set<string>>();

  // Check the NEWEST link first (it's the last one in the links array in useProjectCanvasGraph)
  const lastLink = links[links.length - 1];
  if (lastLink) {
    const sourceBlock = blockMap.get(lastLink.source);
    if (isFolder(sourceBlock) && isCollapsed(sourceBlock)) {
      return {
        code: "folder_collapsed_source",
        source: lastLink.source,
        target: lastLink.target,
      };
    }
  }

  for (const link of links) {
    const sourceBlock = blockMap.get(link.source);
    const targetBlock = blockMap.get(link.target);

    if (isFolder(sourceBlock) && isCore(targetBlock)) {
      return {
        code: "folder_to_core",
        source: link.source,
        target: link.target,
      };
    }

    if (
      (isFolder(sourceBlock) || isFolder(targetBlock)) &&
      edgeSet.has(`${link.target}->${link.source}`)
    ) {
      return {
        code: "folder_reverse_link",
        source: link.source,
        target: link.target,
      };
    }

    if (!isFolder(sourceBlock)) continue;

    const currentFolderParents =
      folderParentsByTarget.get(link.target) || new Set<string>();
    currentFolderParents.add(link.source);
    folderParentsByTarget.set(link.target, currentFolderParents);

    if (currentFolderParents.size > 1) {
      return {
        code: "folder_multiple_parents",
        source: link.source,
        target: link.target,
      };
    }
  }

  return null;
};
