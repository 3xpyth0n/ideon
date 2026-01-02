"use client";

import { useState, useEffect, useRef } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Search, Zap } from "lucide-react";

export interface Command {
  id: string;
  label: string;
  icon: React.ReactNode;
  keywords: string[];
  action: () => void;
  category: "create" | "navigate" | "edit";
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export function CommandPalette({
  isOpen,
  onClose,
  commands,
}: CommandPaletteProps) {
  const { dict } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.keywords.some((kw) => kw.toLowerCase().includes(query.toLowerCase())),
  );

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredCommands.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (i) => (i - 1 + filteredCommands.length) % filteredCommands.length,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  const categories = {
    create: dict.common.invite,
    navigate: dict.common.return,
    edit: dict.common.edit,
  };

  const groupedCommands = filteredCommands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) acc[cmd.category] = [];
      acc[cmd.category].push(cmd);
      return acc;
    },
    {} as Record<string, Command[]>,
  );

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-search">
          <Search size={18} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={dict.common.commandPalettePlaceholder}
            className="command-input"
          />
        </div>

        <div className="command-results">
          {filteredCommands.length === 0 ? (
            <div className="no-results">
              <Zap size={24} className="opacity-20" />
              <p className="text-sm opacity-40 mt-2">
                {dict.common.noCommandsFound}
              </p>
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category} className="command-group">
                <div className="command-group-label">
                  {categories[category as keyof typeof categories]}
                </div>
                {cmds.map((cmd) => {
                  const globalIndex = filteredCommands.indexOf(cmd);
                  return (
                    <button
                      key={cmd.id}
                      className={`command-item ${
                        globalIndex === selectedIndex ? "selected" : ""
                      }`}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                    >
                      <div className="command-icon">{cmd.icon}</div>
                      <span className="command-label">{cmd.label}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="command-footer">
          <div className="command-hint">
            <kbd>↑↓</kbd> {dict.common.navigate}
            <kbd>↵</kbd> {dict.common.select}
            <kbd>Esc</kbd> {dict.common.close}
          </div>
        </div>
      </div>
    </div>
  );
}
