interface FolderTreeNode {
  id: string;
  parentFolderId: string | null;
}

export function buildRecursiveProjectCounts(
  folders: FolderTreeNode[],
  directProjectCounts: Map<string, number>,
) {
  const childFolderIdsByParentId = new Map<string, string[]>();

  for (const folder of folders) {
    if (!folder.parentFolderId) {
      continue;
    }

    const childFolderIds = childFolderIdsByParentId.get(folder.parentFolderId);
    if (childFolderIds) {
      childFolderIds.push(folder.id);
      continue;
    }

    childFolderIdsByParentId.set(folder.parentFolderId, [folder.id]);
  }

  const recursiveCounts = new Map<string, number>();
  const visitingFolderIds = new Set<string>();

  const visitFolder = (folderId: string): number => {
    const cachedCount = recursiveCounts.get(folderId);
    if (cachedCount !== undefined) {
      return cachedCount;
    }

    if (visitingFolderIds.has(folderId)) {
      return directProjectCounts.get(folderId) ?? 0;
    }

    visitingFolderIds.add(folderId);

    let totalProjects = directProjectCounts.get(folderId) ?? 0;
    for (const childFolderId of childFolderIdsByParentId.get(folderId) ?? []) {
      totalProjects += visitFolder(childFolderId);
    }

    visitingFolderIds.delete(folderId);
    recursiveCounts.set(folderId, totalProjects);
    return totalProjects;
  };

  for (const folder of folders) {
    visitFolder(folder.id);
  }

  return recursiveCounts;
}
