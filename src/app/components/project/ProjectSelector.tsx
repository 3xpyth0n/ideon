"use client";
import { useState, useEffect } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Plus, Hash } from "lucide-react";

type Project = { id: string; name: string };

export function ProjectSelector({
  currentProjectId,
  onSelect,
}: {
  currentProjectId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { dict } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]));
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) {
      const data = await res.json();
      setProjects([...projects, { id: data.id, name: newName }]);
      onSelect(data.id);
    }
    setNewName("");
    setIsCreating(false);
  };

  return (
    <div className="project-selector">
      <button
        onClick={() => onSelect(null)}
        className={`project-btn ${!currentProjectId ? "active" : ""}`}
      >
        {dict.common.overview}
      </button>

      <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />

      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={`project-btn flex items-center gap-1.5 ${
            currentProjectId === p.id ? "active" : ""
          }`}
        >
          <Hash size={12} className="opacity-40" />
          {p.name}
        </button>
      ))}

      {isCreating ? (
        <input
          autoFocus
          className="bg-transparent border-none px-3 py-1 text-xs font-semibold outline-none w-28 text-center"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          onBlur={() => !newName && setIsCreating(false)}
          placeholder={dict.common.projectPlaceholder}
        />
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-none transition-colors opacity-40 hover:opacity-100"
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}
