"use client";

import {
  IntegrationImportCapability,
  IntegrationManifest,
} from "@lib/integrations";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { useI18n } from "@providers/I18nProvider";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface IntegrationImportModalProps {
  integration: IntegrationManifest;
  capability: IntegrationImportCapability;
  onClose: () => void;
}

export default function IntegrationImportModal({
  integration,
  capability,
  onClose,
}: IntegrationImportModalProps) {
  const { dict } = useI18n();
  const router = useRouter();
  const [projectName, setProjectName] = useState("");
  const [source, setSource] = useState(capability.sources[0]);
  const [directoryPath, setDirectoryPath] = useState("");
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const hasMultipleSources = capability.sources.length > 1;

  const requiresArchive = source === "zip";

  const canSubmit = useMemo(() => {
    if (requiresArchive) {
      return Boolean(archiveFile);
    }
    return Boolean(directoryPath.trim());
  }, [requiresArchive, archiveFile, directoryPath]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("source", source);

      if (capability.acceptsProjectName && projectName.trim()) {
        formData.append("projectName", projectName.trim());
      }

      if (source === "zip") {
        if (!archiveFile) {
          return;
        }
        formData.append("file", archiveFile);
      }

      if (source === "directoryPath") {
        formData.append("directoryPath", directoryPath.trim());
      }

      const res = await fetch(`/api/integrations/${integration.id}/import`, {
        method: "POST",
        body: formData,
      });

      const payload = (await res.json()) as {
        error?: string;
        projectId?: string;
      };

      if (!res.ok) {
        throw new Error(payload.error || dict.integrations.importError);
      }

      toast.success(dict.integrations.importSuccess);
      onClose();

      if (payload.projectId) {
        router.push(`/project/${payload.projectId}`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : dict.integrations.importError,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} className="integration-import-modal">
      <div className="integration-import-modal-content">
        <h2 className="integration-import-title">
          {dict.integrations.importModalTitle}
        </h2>

        <form onSubmit={handleSubmit} className="integration-import-form">
          {capability.acceptsProjectName && (
            <div className="integration-import-field">
              <label className="modal-label">
                {dict.integrations.projectName}
              </label>
              <input
                type="text"
                className="zen-input"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={integration.name}
              />
            </div>
          )}

          {hasMultipleSources && (
            <div className="integration-import-field">
              <label className="modal-label">{dict.integrations.source}</label>
              <select
                className="zen-input"
                value={source}
                onChange={(e) =>
                  setSource(e.target.value as "zip" | "directoryPath")
                }
                disabled={loading}
              >
                {capability.sources.includes("zip") && (
                  <option value="zip">{dict.integrations.sourceZip}</option>
                )}
                {capability.sources.includes("directoryPath") && (
                  <option value="directoryPath">
                    {dict.integrations.sourceDirectoryPath}
                  </option>
                )}
              </select>
            </div>
          )}

          {requiresArchive ? (
            <div className="integration-import-field">
              <label className="modal-label">
                {dict.integrations.archiveFile}
              </label>
              <input
                type="file"
                className="zen-input"
                accept=".zip"
                onChange={(e) => setArchiveFile(e.target.files?.[0] || null)}
                disabled={loading}
              />
            </div>
          ) : (
            <div className="integration-import-field">
              <label className="modal-label">
                {dict.integrations.directoryPath}
              </label>
              <input
                type="text"
                className="zen-input"
                value={directoryPath}
                onChange={(e) => setDirectoryPath(e.target.value)}
                placeholder={dict.integrations.directoryPathPlaceholder}
                disabled={loading}
              />
            </div>
          )}

          <div className="integration-import-actions">
            <Button
              type="button"
              noRipple
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              {dict.common.cancel}
            </Button>
            <Button
              type="submit"
              className="btn-primary"
              disabled={!canSubmit || loading}
            >
              {loading
                ? dict.integrations.importing
                : dict.integrations.startImport}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
