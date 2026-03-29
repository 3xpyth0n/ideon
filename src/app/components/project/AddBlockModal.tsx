"use client";

import { Command } from "cmdk";
import { Modal } from "@components/ui/Modal";
import { useI18n } from "@providers/I18nProvider";
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
} from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { VercelIcon } from "../icons/VercelIcon";

type AddableBlockType =
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
  | "vercel";

interface AddBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBlock: (blockType: AddableBlockType) => void;
}

const FOLDER_TYPES = [
  { type: "folder", icon: Folder, labelKey: "blockTypeFolder" },
] as const;

const BLOCK_TYPES = [
  { type: "text", icon: FileText, labelKey: "blockTypeText" },
  { type: "link", icon: Link, labelKey: "blockTypeLink" },
  { type: "file", icon: File, labelKey: "blockTypeFile" },
  { type: "github", icon: FaGithub, labelKey: "blockTypeGit" },
  { type: "palette", icon: Palette, labelKey: "blockTypePalette" },
  { type: "contact", icon: Contact, labelKey: "blockTypeContact" },
  { type: "video", icon: Video, labelKey: "blockTypeVideo" },
  { type: "snippet", icon: Code, labelKey: "blockTypeSnippet" },
  { type: "checklist", icon: CheckSquare, labelKey: "blockTypeChecklist" },
  { type: "kanban", icon: Kanban, labelKey: "blockTypeKanban" },
  { type: "sketch", icon: PenTool, labelKey: "blockTypeSketch" },
  { type: "shell", icon: Terminal, labelKey: "blockTypeShell" },
  { type: "vercel", icon: VercelIcon, labelKey: "blockTypeVercel" },
] as const;

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
            {FOLDER_TYPES.map(({ type, icon: Icon, labelKey }) => (
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
            {BLOCK_TYPES.map(({ type, icon: Icon, labelKey }) => (
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
