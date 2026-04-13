"use client";

import { Command } from "cmdk";
import { Modal } from "@components/ui/Modal";
import { useI18n } from "@providers/I18nProvider";
import {
  CANVAS_BLOCK_TYPES,
  FOLDER_BLOCK_TYPES,
  type AddableBlockType,
} from "./blockTypeMeta";

interface AddBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBlock: (blockType: AddableBlockType) => void;
}

export default function AddBlockModal({
  isOpen,
  onClose,
  onAddBlock,
}: AddBlockModalProps) {
  const { dict } = useI18n();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="add-block-modal"
      showCloseButton={false}
    >
      <Command label={dict.canvas.addBlock}>
        <Command.Input
          placeholder={dict.canvas.addBlockPlaceholder}
          autoFocus
        />
        <Command.List>
          <Command.Empty>{dict.canvas.noBlocksFound}</Command.Empty>
          <Command.Group heading={dict.canvas.folderSection || "Folder"}>
            {FOLDER_BLOCK_TYPES.map(({ type, icon: Icon, labelKey }) => (
              <Command.Item
                key={type}
                value={
                  dict.blocks[labelKey as keyof typeof dict.blocks] as string
                }
                onSelect={() => onAddBlock(type)}
              >
                <Icon className="add-block-icon" />
                <span className="add-block-label">
                  {dict.blocks[labelKey as keyof typeof dict.blocks]}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading={dict.canvas.addBlock}>
            {CANVAS_BLOCK_TYPES.map(({ type, icon: Icon, labelKey }) => (
              <Command.Item
                key={type}
                value={
                  dict.blocks[labelKey as keyof typeof dict.blocks] as string
                }
                onSelect={() => onAddBlock(type)}
              >
                <Icon className="add-block-icon" />
                <span className="add-block-label">
                  {dict.blocks[labelKey as keyof typeof dict.blocks]}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </Modal>
  );
}
