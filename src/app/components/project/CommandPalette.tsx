"use client";

import { Command } from "cmdk";
import { Modal } from "@components/ui/Modal";
import { useI18n } from "@providers/I18nProvider";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  label: string;
  keys: string[];
}

function ShortcutCard({ label, keys }: ShortcutEntry) {
  return (
    <Command.Item value={label}>
      <span className="cmdk-card-keys">
        {keys.map((k, i) => (
          <kbd key={`${k}-${i}`}>{k}</kbd>
        ))}
      </span>
      <span className="cmdk-card-label">{label}</span>
    </Command.Item>
  );
}

export default function CommandPalette({
  isOpen,
  onClose,
}: CommandPaletteProps) {
  const { dict } = useI18n();

  const shortcuts: Record<string, ShortcutEntry[]> = {
    [dict.canvas.cheatGeneral]: [
      { label: dict.canvas.undo, keys: ["Ctrl", "Z"] },
      { label: dict.canvas.redo, keys: ["Ctrl", "Y"] },
      { label: dict.canvas.cheatsheet, keys: ["Ctrl", "P"] },
      { label: dict.canvas.temporalHistory, keys: ["Ctrl", "H"] },
      { label: dict.canvas.cheatUnfocus, keys: ["Esc"] },
    ],
    [dict.canvas.cheatNavigation]: [
      { label: dict.canvas.navigate, keys: ["←", "→", "↑", "↓"] },
      { label: dict.canvas.cheatVimNav, keys: ["H", "J", "K", "L"] },
      { label: dict.canvas.cheatEditBlock, keys: ["Enter"] },
      { label: dict.canvas.cheatChildBlock, keys: ["Tab"] },
    ],
    [dict.canvas.cheatCanvas]: [
      { label: dict.canvas.AddBlock, keys: ["Ctrl", "A"] },
      { label: dict.canvas.zoomIn, keys: ["Ctrl", "+"] },
      { label: dict.canvas.zoomOut, keys: ["Ctrl", "-"] },
      { label: dict.canvas.fitView, keys: ["Ctrl", "0"] },
      { label: dict.canvas.cheatMultiSelect, keys: ["Ctrl", "Click"] },
      { label: dict.canvas.cheatDisableSnap, keys: ["Shift", "(drag)"] },
    ],
    [dict.canvas.cheatMarkdown]: [
      { label: dict.canvas.cheatBold, keys: ["Ctrl", "B"] },
      { label: dict.canvas.cheatItalic, keys: ["Ctrl", "I"] },
      { label: dict.canvas.cheatUnderline, keys: ["Ctrl", "U"] },
      { label: dict.canvas.cheatStrike, keys: ["Ctrl", "⇧", "X"] },
      { label: dict.canvas.cheatLink, keys: ["Ctrl", "K"] },
      { label: dict.canvas.cheatCode, keys: ["Ctrl", "E"] },
    ],
    [dict.canvas.cheatNote]: [
      { label: dict.canvas.cheatSwitchToEditMode, keys: ["Ctrl", "E"] },
      { label: dict.canvas.cheatSwitchToPreviewMode, keys: ["Ctrl", "P"] },
    ],
    [dict.canvas.cheatTasks]: [
      { label: dict.canvas.cheatIndent, keys: ["Tab"] },
      { label: dict.canvas.cheatOutdent, keys: ["⇧", "Tab"] },
    ],
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="command-palette-modal"
      showCloseButton={false}
    >
      <Command label={dict.canvas.cheatsheet}>
        <Command.Input placeholder={dict.canvas.searchPlaceholder} autoFocus />
        <Command.List>
          <Command.Empty>{dict.canvas.noCommandsFound}</Command.Empty>
          {Object.entries(shortcuts).map(([heading, entries]) => (
            <Command.Group key={heading} heading={heading}>
              {entries.map((s, i) => (
                <ShortcutCard key={`${heading}-${i}`} {...s} />
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </Modal>
  );
}
