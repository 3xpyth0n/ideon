"use client";

import { useState, useEffect, useRef } from "react";
import { useI18n } from "@providers/I18nProvider";
import { ChevronRight } from "lucide-react";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";

interface ProjectModalProps {
  project?: {
    id: string;
    name: string;
    description: string | null;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export function ProjectModal({
  project,
  onClose,
  onSuccess,
}: ProjectModalProps) {
  const { dict } = useI18n();
  const isEdit = !!project;
  const [name, setName] = useState(project?.name || "");
  const [description, setDescription] = useState(project?.description || "");
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      const timeout = setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true });
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, []);

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
              {dict.common.deleteProjectTitle}
            </h2>
            <p className="opacity-80">{dict.common.deleteProjectDescription}</p>
          </div>
          <div className="flex flex-row justify-end gap-3 mt-4">
            <Button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={loading}
              noRipple
              className="btn-secondary min-w-[120px]"
            >
              {dict.common.cancel}
            </Button>
            <Button
              onClick={handleDelete}
              disabled={loading}
              noRipple
              className="btn-danger min-w-[120px]"
            >
              {loading ? dict.common.deleting : dict.common.delete}
            </Button>
          </div>
        </div>
      ) : isEdit ? (
        <div className="flex flex-col p-12 w-full h-full overflow-y-auto text-left">
          <h2 className="text-xl font-bold mb-8 uppercase tracking-widest text-center">
            {dict.common.editProject}
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-8 w-full">
            <div className="flex flex-col gap-6 w-full">
              <div className="form-group w-full">
                <label className="modal-label">{dict.common.projectName}</label>
                <input
                  ref={inputRef}
                  type="text"
                  className="zen-input w-full"
                  placeholder={dict.common.projectPlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group w-full">
                <label className="modal-label">
                  {dict.common.projectDescriptionOptional}
                </label>
                <textarea
                  className="zen-textarea min-h-[120px] w-full"
                  placeholder={dict.common.projectDescription}
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
                className="btn-danger min-w-[120px]"
              >
                <span>{dict.common.delete}</span>
              </Button>

              <Button
                type="submit"
                disabled={loading || !name.trim()}
                className="btn-primary min-w-[120px]"
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
            {dict.common.newProject}
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-8">
            <div className="flex flex-col gap-6">
              <div className="form-group">
                <label className="modal-label">{dict.common.projectName}</label>
                <input
                  ref={inputRef}
                  type="text"
                  className="zen-input"
                  placeholder={dict.common.projectPlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="modal-label">
                  {dict.common.projectDescriptionOptional}
                </label>
                <textarea
                  className="zen-textarea min-h-[120px]"
                  placeholder={dict.common.projectDescription}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
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
                      <span>{dict.common.submit.toUpperCase()}</span>
                      <ChevronRight size={14} />
                    </>
                  )}
                </div>
              </Button>
            </div>
          </form>
        </div>
      )}
    </Modal>
  );
}
