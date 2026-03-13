type BlockLike = {
  id: string;
  type?: string;
  data?: {
    blockType?: string;
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

export type FolderLinkRuleErrorCode =
  | "folder_to_core"
  | "folder_reverse_link"
  | "folder_multiple_parents";

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
