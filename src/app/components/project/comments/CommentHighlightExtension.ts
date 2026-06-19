import { Mark, mergeAttributes } from "@tiptap/core";
import { hexToRgba } from "./colorUtils";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    commentHighlight: {
      setCommentHighlight: (attrs: {
        threadId: string;
        color: string;
      }) => ReturnType;
      unsetCommentHighlight: (threadId: string) => ReturnType;
    };
  }
}

export const CommentHighlight = Mark.create({
  name: "commentHighlight",

  inclusive: false,

  spanning: true,

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-thread-id"),
        renderHTML: (attributes) => ({
          "data-thread-id": attributes.threadId,
        }),
      },
      color: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-color"),
        renderHTML: (attributes) => ({
          "data-color": attributes.color,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-thread-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes, mark }) {
    const color = mark.attrs.color as string | null;
    let backgroundColor: string;

    if (color && color.startsWith("hsl")) {
      // HSL color — apply with opacity via hsla
      const hslMatch = color.match(/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
      if (hslMatch) {
        backgroundColor = `hsla(${hslMatch[1]}, ${hslMatch[2]}%, ${hslMatch[3]}%, 0.25)`;
      } else {
        backgroundColor = hexToRgba(null, 0.25);
      }
    } else {
      backgroundColor = hexToRgba(color, 0.25);
    }

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        style: `background-color: ${backgroundColor}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCommentHighlight:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs);
        },

      unsetCommentHighlight:
        (threadId) =>
        ({ tr, state }) => {
          const { doc } = state;
          const markType = state.schema.marks[this.name];

          doc.descendants((node, pos) => {
            if (!node.isInline) return true;

            const mark = node.marks.find(
              (m) => m.type === markType && m.attrs.threadId === threadId,
            );

            if (mark) {
              tr.removeMark(pos, pos + node.nodeSize, mark);
            }

            return true;
          });

          return true;
        },
    };
  },
});
