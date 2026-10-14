"use client";

import { useState } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Loader2 } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";

interface ApplyConfirmModalProps {
  isOpen: boolean;
  onSaveAndApply: () => Promise<void>;
  onDiscardAndApply: () => void;
  onCancel: () => void;
}

export function ApplyConfirmModal({
  isOpen,
  onSaveAndApply,
  onDiscardAndApply,
  onCancel,
}: ApplyConfirmModalProps) {
  const { dict } = useI18n();
  const [saving, setSaving] = useState(false);

  const handleSaveAndApply = async () => {
    setSaving(true);
    try {
      await onSaveAndApply();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={dict.modals.applyConfirmTitle}
      subtitle={dict.modals.applyConfirmDescription}
      className="max-w-md w-full"
    >
      <p className="text-xs opacity-60 text-left mb-6">
        {dict.modals.applyConfirmWarning}
      </p>
      <div className="modal-actions">
        <Button
          variant="primary"
          onClick={handleSaveAndApply}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            dict.modals.applyConfirmSaveAndApply
          )}
        </Button>
        <Button variant="ghost" onClick={onDiscardAndApply} disabled={saving}>
          {dict.modals.applyConfirmDiscardAndApply}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          {dict.modals.applyConfirmCancel}
        </Button>
      </div>
    </Modal>
  );
}
