import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { BlockData } from "../CanvasBlock";
import { useI18n } from "@providers/I18nProvider";

interface UseBlockReactionsProps {
  id: string;
  data: BlockData;
  currentUser?: { id: string; username: string; displayName?: string | null };
  isReadOnly?: boolean;
}

export const useBlockReactions = ({
  id,
  data,
  currentUser,
  isReadOnly,
}: UseBlockReactionsProps) => {
  const { setNodes } = useReactFlow();
  const { dict } = useI18n();

  const handleReact = useCallback(
    (emoji: string) => {
      if (isReadOnly) return;

      const currentReactions = data.reactions || [];
      const existingIndex = currentReactions.findIndex(
        (r) => r.emoji === emoji,
      );
      const userId = currentUser?.id;
      if (!userId) return;

      let newReactions;
      if (existingIndex > -1) {
        const reaction = currentReactions[existingIndex];
        const hasReacted = reaction.users.some((u) =>
          typeof u === "string" ? u === userId : u.id === userId,
        );

        if (hasReacted) return;

        newReactions = [...currentReactions];
        newReactions[existingIndex] = {
          ...reaction,
          count: reaction.count + 1,
          users: [
            ...reaction.users,
            {
              id: userId,
              username:
                currentUser?.username ||
                currentUser?.displayName ||
                dict.project.anonymous,
            },
          ],
        };
      } else {
        newReactions = [
          ...currentReactions,
          {
            emoji,
            count: 1,
            users: [
              {
                id: userId,
                username:
                  currentUser?.username ||
                  currentUser?.displayName ||
                  dict.project.anonymous,
              },
            ],
          },
        ];
      }

      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;

      if (setNodes) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    reactions: newReactions,
                    updatedAt: now,
                    lastEditor: editor,
                  },
                }
              : n,
          ),
        );
      }

      data.onContentChange?.(
        id,
        data.content,
        now,
        editor,
        data.metadata,
        data.title,
        newReactions,
      );
    },
    [id, data, isReadOnly, currentUser, dict.project.anonymous, setNodes],
  );

  const handleRemoveReaction = useCallback(
    (emoji: string) => {
      if (isReadOnly) return;

      const currentReactions = data.reactions || [];
      const existingIndex = currentReactions.findIndex(
        (r) => r.emoji === emoji,
      );
      const userId = currentUser?.id;
      if (!userId || existingIndex === -1) return;

      const reaction = currentReactions[existingIndex];
      const hasReacted = reaction.users.some((u) =>
        typeof u === "string" ? u === userId : u.id === userId,
      );

      if (!hasReacted) return;

      let newReactions = [...currentReactions];
      const newUsers = reaction.users.filter((u) =>
        typeof u === "string" ? u !== userId : u.id !== userId,
      );

      if (newUsers.length === 0) {
        newReactions = newReactions.filter((r) => r.emoji !== emoji);
      } else {
        newReactions[existingIndex] = {
          ...reaction,
          count: reaction.count - 1,
          users: newUsers,
        };
      }

      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;

      if (setNodes) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    reactions: newReactions,
                    updatedAt: now,
                    lastEditor: editor,
                  },
                }
              : n,
          ),
        );
      }

      data.onContentChange?.(
        id,
        data.content,
        now,
        editor,
        data.metadata,
        data.title,
        newReactions,
      );
    },
    [id, data, isReadOnly, currentUser, dict.project.anonymous, setNodes],
  );

  return { handleReact, handleRemoveReaction };
};
