"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Check, ChevronRight, Folder, Home, X } from "lucide-react";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";

interface FolderItem {
  id: string;
  name: string;
  parentFolderId: string | null;
}

const ROOT_FOLDER_KEY = "__root__";

interface ProjectModalProps {
  project?: {
    id: string;
    name: string;
    description: string | null;
  };
  folderId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ProjectModal({
  project,
  folderId,
  onClose,
  onSuccess,
}: ProjectModalProps) {
  const { dict } = useI18n();
  const isEdit = !!project;
  const [name, setName] = useState(project?.name || "");
  const [description, setDescription] = useState(project?.description || "");
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState(folderId || "");
  const [draftFolderId, setDraftFolderId] = useState(folderId || "");
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    new Set(),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEdit) return;
    fetch("/api/folders?view=my-projects&includeNested=true", {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((items: FolderItem[]) => {
        setFolders(
          [...items].sort((left, right) => left.name.localeCompare(right.name)),
        );
      })
      .catch(() => {});
  }, [isEdit]);

  useEffect(() => {
    setSelectedFolderId(folderId || "");
    setDraftFolderId(folderId || "");
  }, [folderId]);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      const timeout = setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true });
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, []);

  const foldersByParent = folders.reduce<Record<string, FolderItem[]>>(
    (accumulator, currentFolder) => {
      const key = currentFolder.parentFolderId || ROOT_FOLDER_KEY;
      accumulator[key] = accumulator[key]
        ? [...accumulator[key], currentFolder]
        : [currentFolder];
      return accumulator;
    },
    {},
  );

  const getLocationSegments = (targetFolderId: string) => {
    if (!targetFolderId) {
      return [dict.project.rootFolder];
    }

    const segments: string[] = [];
    const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
    const visitedFolderIds = new Set<string>();
    let currentFolder = folderMap.get(targetFolderId) || null;

    while (currentFolder && !visitedFolderIds.has(currentFolder.id)) {
      visitedFolderIds.add(currentFolder.id);
      segments.unshift(currentFolder.name);
      currentFolder = currentFolder.parentFolderId
        ? folderMap.get(currentFolder.parentFolderId) || null
        : null;
    }

    return [dict.project.rootFolder, ...segments];
  };

  const getExpandedFolderPath = (targetFolderId: string) => {
    const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
    const expandedIds = new Set<string>();
    let currentFolder = targetFolderId
      ? folderMap.get(targetFolderId) || null
      : null;

    while (currentFolder?.parentFolderId) {
      expandedIds.add(currentFolder.parentFolderId);
      currentFolder = folderMap.get(currentFolder.parentFolderId) || null;
    }

    return expandedIds;
  };

  const openFolderPicker = () => {
    setDraftFolderId(selectedFolderId);
    setExpandedFolderIds(getExpandedFolderPath(selectedFolderId));
    setShowFolderPicker(true);
  };

  const closeFolderPicker = () => {
    setDraftFolderId(selectedFolderId);
    setShowFolderPicker(false);
  };

  const confirmFolderPicker = () => {
    setSelectedFolderId(draftFolderId);
    setShowFolderPicker(false);
  };

  const toggleFolderExpansion = (folderId: string) => {
    setExpandedFolderIds((previous) => {
      const next = new Set(previous);

      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return next;
    });
  };

  const renderLocationBreadcrumb = (targetFolderId: string) => {
    const segments = getLocationSegments(targetFolderId);

    return segments.map((segment, index) => (
      <Fragment key={`${segment}-${index}`}>
        {index > 0 && <ChevronRight size={12} className="opacity-35" />}
        <span
          className={`flex items-center gap-2 ${
            index === segments.length - 1 ? "text-white" : "text-white/55"
          }`}
        >
          {index === 0 ? <Home size={14} className="shrink-0" /> : null}
          <span>{segment}</span>
        </span>
      </Fragment>
    ));
  };

  const renderFolderBranch = (parentFolderId?: string, depth = 0) => {
    const branch = foldersByParent[parentFolderId || ROOT_FOLDER_KEY] || [];

    return branch.map((folder) => {
      const children = foldersByParent[folder.id] || [];
      const hasChildren = children.length > 0;
      const isExpanded = expandedFolderIds.has(folder.id);
      const isSelected = draftFolderId === folder.id;

      return (
        <div
          key={folder.id}
          className={`${
            depth > 0 ? "ml-4 border-l border-white/8 pl-3" : ""
          } flex flex-col gap-2`}
        >
          <div
            className={`rounded-xl border transition-colors ${
              isSelected
                ? "border-white/24 bg-white/8"
                : "border-white/10 bg-white/3 hover:border-white/18 hover:bg-white/4"
            }`}
          >
            <div className="flex items-center gap-1 px-2 py-1.5">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFolderExpansion(folder.id);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/6 hover:text-white/80"
                  aria-label={folder.name}
                >
                  <ChevronRight
                    size={14}
                    className={`transition-transform ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  />
                </button>
              ) : (
                <span className="block h-8 w-8" />
              )}

              <button
                type="button"
                onClick={() => {
                  setDraftFolderId(folder.id);
                  if (hasChildren && !isExpanded) {
                    toggleFolderExpansion(folder.id);
                  }
                }}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-2 text-left"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Folder size={14} className="shrink-0 text-white/82" />
                  <span
                    className={`truncate ${
                      isSelected ? "text-white" : "text-white/82"
                    }`}
                  >
                    {folder.name}
                  </span>
                </span>
                <span className="shrink-0 text-white/72">
                  {isSelected ? <Check size={14} /> : null}
                </span>
              </button>
            </div>

            {hasChildren && isExpanded ? (
              <div className="border-t border-white/8 px-2 pb-2 pt-2">
                {renderFolderBranch(folder.id, depth + 1)}
              </div>
            ) : null}
          </div>
        </div>
      );
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const url = isEdit ? `/api/projects/${project.id}` : "/api/projects";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          folderId: !isEdit ? selectedFolderId || null : undefined,
        }),
      });

      if (res.ok) {
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      className={isEdit ? "modal-edit-layout" : "modal-sliding-layout"}
    >
      {showDeleteConfirm ? (
        <div className="flex flex-col gap-6 py-12 px-16 text-left">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">
              {dict.modals.deleteProjectTitle}
            </h2>
            <p className="opacity-80">{dict.modals.deleteProjectDescription}</p>
          </div>
          <div className="flex flex-row justify-end gap-3 mt-4">
            <Button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={loading}
              noRipple
              className="btn-secondary min-w-30"
            >
              {dict.common.cancel}
            </Button>
            <Button
              onClick={handleDelete}
              disabled={loading}
              noRipple
              className="btn-danger min-w-30"
            >
              {loading ? dict.common.deleting : dict.common.delete}
            </Button>
          </div>
        </div>
      ) : isEdit ? (
        <div className="flex flex-col p-12 w-full h-full overflow-y-auto text-left">
          <h2 className="text-xl font-bold mb-8 uppercase tracking-widest text-center">
            {dict.project.editProject}
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-8 w-full">
            <div className="flex flex-col gap-6 w-full">
              <div className="form-group w-full">
                <label className="modal-label">
                  {dict.project.projectName}
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  className="zen-input w-full"
                  placeholder={dict.project.projectPlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group w-full">
                <label className="modal-label">
                  {dict.project.projectDescriptionOptional}
                </label>
                <textarea
                  className="zen-textarea min-h-30 w-full"
                  placeholder={dict.project.projectDescription}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-row justify-end gap-3 w-full">
              <Button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading}
                noRipple
                className="btn-danger min-w-30"
              >
                <span>{dict.common.delete}</span>
              </Button>

              <Button
                type="submit"
                disabled={loading || !name.trim()}
                className="btn-primary min-w-30"
              >
                <div className="flex items-center justify-center gap-2">
                  {loading ? (
                    <span className="animate-pulse">{dict.common.saving}</span>
                  ) : (
                    <span>{dict.common.save.toUpperCase()}</span>
                  )}
                </div>
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex flex-col p-12 w-full h-full overflow-y-auto text-left">
          <h2 className="text-xl font-bold mb-8 uppercase tracking-widest text-center">
            {dict.dashboard.newProject}
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-8">
            <div className="flex flex-col gap-6">
              <div className="form-group">
                <label className="modal-label">
                  {dict.project.projectName}
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  className="zen-input"
                  placeholder={dict.project.projectPlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="modal-label">
                  {dict.project.projectDescriptionOptional}
                </label>
                <textarea
                  className="zen-textarea min-h-30"
                  placeholder={dict.project.projectDescription}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="form-group w-full">
                <label className="modal-label">
                  {dict.project.targetFolder}
                </label>
                <div className="w-full rounded-xl border border-white/18 bg-white/6 transition-colors hover:border-white/30 hover:bg-white/10">
                  <button
                    type="button"
                    onClick={openFolderPicker}
                    className="flex w-full items-center justify-between gap-4 rounded-xl px-5 py-4 text-left"
                  >
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                      {renderLocationBreadcrumb(selectedFolderId)}
                    </span>
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-white/45"
                    />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <Button
                type="submit"
                disabled={loading || !name.trim()}
                className="btn-primary w-full"
              >
                <div className="flex items-center justify-center gap-2">
                  {loading ? (
                    <span className="animate-pulse">{dict.common.saving}</span>
                  ) : (
                    <>
                      <span>{dict.auth.submit.toUpperCase()}</span>
                      <ChevronRight size={14} />
                    </>
                  )}
                </div>
              </Button>
            </div>
          </form>

          {showFolderPicker ? (
            <div
              className="fixed inset-0 z-80 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
              onClick={closeFolderPicker}
            >
              <div
                className="flex w-full max-w-3xl flex-col border border-white/10 bg-[#0a0a0a] p-6 text-left shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-xl font-bold uppercase tracking-widest">
                      {dict.project.targetFolder}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/60">
                      {renderLocationBreadcrumb(draftFolderId)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closeFolderPicker}
                    className="text-white/45 transition-colors hover:text-white"
                    aria-label={dict.common.close}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="mb-4 rounded-2xl border border-white/10 bg-white/2 p-2">
                  <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
                    <div
                      className={`rounded-xl border transition-colors ${
                        draftFolderId === ""
                          ? "border-white/24 bg-white/8"
                          : "border-white/10 bg-white/3 hover:border-white/18 hover:bg-white/4"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setDraftFolderId("")}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Home size={14} className="shrink-0 text-white/82" />
                          <span
                            className={
                              draftFolderId === ""
                                ? "text-white"
                                : "text-white/82"
                            }
                          >
                            {dict.project.rootFolder}
                          </span>
                        </span>
                        <span className="shrink-0 text-white/72">
                          {draftFolderId === "" ? <Check size={14} /> : null}
                        </span>
                      </button>
                    </div>

                    {renderFolderBranch()}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-1">
                  <Button
                    type="button"
                    onClick={closeFolderPicker}
                    className="btn-secondary min-w-30"
                  >
                    {dict.common.cancel}
                  </Button>
                  <Button
                    type="button"
                    onClick={confirmFolderPicker}
                    className="btn-primary min-w-30"
                  >
                    {dict.canvas.apply}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
