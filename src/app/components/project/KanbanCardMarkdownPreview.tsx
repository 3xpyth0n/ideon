import React from "react";

type Props = {
  markdown: string;
};

type TaskListItem = {
  checked: boolean;
  text: string;
};

type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "blockquote"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "task-list"; items: TaskListItem[] }
  | { type: "image"; alt: string };

const TASK_ITEM_PATTERN = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/;
const UNORDERED_LIST_PATTERN = /^\s*[-*+]\s+(.*)$/;
const ORDERED_LIST_PATTERN = /^\s*\d+\.\s+(.*)$/;
const HEADING_PATTERN = /^\s*(#{1,6})\s+(.*)$/;
const BLOCKQUOTE_PATTERN = /^\s*>\s?(.*)$/;
const IMAGE_PATTERN = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/;

type InlineTokenMatch =
  | { type: "image"; raw: string; alt: string }
  | { type: "link"; raw: string; label: string; href: string }
  | { type: "code"; raw: string; text: string }
  | { type: "strong"; raw: string; text: string }
  | { type: "strike"; raw: string; text: string }
  | { type: "emphasis"; raw: string; text: string };

type InlinePattern = {
  type: InlineTokenMatch["type"];
  pattern: RegExp;
  build: (match: RegExpMatchArray) => InlineTokenMatch;
};

const INLINE_PATTERNS: InlinePattern[] = [
  {
    type: "image",
    pattern: /^!\[([^\]]*)\]\(([^)]+)\)/,
    build: (match) => ({
      type: "image",
      raw: match[0],
      alt: match[1] ?? "",
    }),
  },
  {
    type: "link",
    pattern: /^\[([^\]]+)\]\(([^)]+)\)/,
    build: (match) => ({
      type: "link",
      raw: match[0],
      label: match[1] ?? "",
      href: match[2] ?? "",
    }),
  },
  {
    type: "code",
    pattern: /^(`+)([\s\S]*?)\1(?!`)/,
    build: (match) => ({
      type: "code",
      raw: match[0],
      text: match[2] ?? "",
    }),
  },
  {
    type: "strong",
    pattern: /^\*\*([^*]+)\*\*/,
    build: (match) => ({
      type: "strong",
      raw: match[0],
      text: match[1] ?? "",
    }),
  },
  {
    type: "strong",
    pattern: /^__([^_]+)__/,
    build: (match) => ({
      type: "strong",
      raw: match[0],
      text: match[1] ?? "",
    }),
  },
  {
    type: "strike",
    pattern: /^~~([^~]+)~~/,
    build: (match) => ({
      type: "strike",
      raw: match[0],
      text: match[1] ?? "",
    }),
  },
  {
    type: "emphasis",
    pattern: /^\*([^*]+)\*/,
    build: (match) => ({
      type: "emphasis",
      raw: match[0],
      text: match[1] ?? "",
    }),
  },
  {
    type: "emphasis",
    pattern: /^_([^_]+)_/,
    build: (match) => ({
      type: "emphasis",
      raw: match[0],
      text: match[1] ?? "",
    }),
  },
];

function sanitizeHref(href: string): string | null {
  const trimmedHref = href.trim();
  if (!trimmedHref) return null;

  if (
    trimmedHref.startsWith("/") ||
    trimmedHref.startsWith("#") ||
    trimmedHref.startsWith("./") ||
    trimmedHref.startsWith("../")
  ) {
    return trimmedHref;
  }

  try {
    const parsed = new URL(trimmedHref, "https://ideon.local");
    if (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
    ) {
      return trimmedHref;
    }
  } catch {
    return null;
  }

  return null;
}

function matchInlineToken(markdown: string): InlineTokenMatch | null {
  for (const inlinePattern of INLINE_PATTERNS) {
    const match = markdown.match(inlinePattern.pattern);
    if (match) {
      return inlinePattern.build(match);
    }
  }

  return null;
}

function findNextInlineToken(markdown: string): {
  index: number;
  token: InlineTokenMatch;
} | null {
  for (let index = 0; index < markdown.length; index += 1) {
    const token = matchInlineToken(markdown.slice(index));
    if (token) {
      return { index, token };
    }
  }

  return null;
}

function renderInline(markdown: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = markdown;
  let keyIndex = 0;

  while (remaining.length > 0) {
    const nextToken = findNextInlineToken(remaining);

    if (!nextToken) {
      nodes.push(remaining);
      break;
    }

    if (nextToken.index > 0) {
      nodes.push(remaining.slice(0, nextToken.index));
    }

    const { token } = nextToken;

    if (token.type === "image") {
      nodes.push(
        <span key={`image-${keyIndex}`} data-md-image-inline="true">
          {token.alt || "Image"}
        </span>,
      );
    } else if (token.type === "link") {
      const href = sanitizeHref(token.href);
      if (href) {
        const isExternal = /^(https?:|mailto:)/.test(href);
        nodes.push(
          <a
            key={`link-${keyIndex}`}
            href={href}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {token.label}
          </a>,
        );
      } else {
        nodes.push(token.label);
      }
    } else if (token.type === "code") {
      nodes.push(<code key={`code-${keyIndex}`}>{token.text}</code>);
    } else if (token.type === "strong") {
      nodes.push(<strong key={`strong-${keyIndex}`}>{token.text}</strong>);
    } else if (token.type === "strike") {
      nodes.push(<s key={`strike-${keyIndex}`}>{token.text}</s>);
    } else if (token.type === "emphasis") {
      nodes.push(<em key={`em-${keyIndex}`}>{token.text}</em>);
    }

    remaining = remaining.slice(nextToken.index + token.raw.length);
    keyIndex += 1;
  }

  return nodes;
}

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const paragraphLines: string[] = [];
  let currentList:
    | { type: "unordered-list"; items: string[] }
    | { type: "ordered-list"; items: string[] }
    | { type: "task-list"; items: TaskListItem[] }
    | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push({
      type: "paragraph",
      text: paragraphLines.join(" ").replace(/\s+/g, " ").trim(),
    });
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (!currentList) return;
    blocks.push(currentList);
    currentList = null;
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushParagraph();
      flushList();
      continue;
    }

    const taskMatch = line.match(TASK_ITEM_PATTERN);
    if (taskMatch) {
      flushParagraph();
      if (!currentList || currentList.type !== "task-list") {
        flushList();
        currentList = { type: "task-list", items: [] };
      }
      currentList.items.push({
        checked: taskMatch[1].toLowerCase() === "x",
        text: taskMatch[2].trim(),
      });
      continue;
    }

    const unorderedMatch = line.match(UNORDERED_LIST_PATTERN);
    if (unorderedMatch) {
      flushParagraph();
      if (!currentList || currentList.type !== "unordered-list") {
        flushList();
        currentList = { type: "unordered-list", items: [] };
      }
      currentList.items.push(unorderedMatch[1].trim());
      continue;
    }

    const orderedMatch = line.match(ORDERED_LIST_PATTERN);
    if (orderedMatch) {
      flushParagraph();
      if (!currentList || currentList.type !== "ordered-list") {
        flushList();
        currentList = { type: "ordered-list", items: [] };
      }
      currentList.items.push(orderedMatch[1].trim());
      continue;
    }

    flushList();

    const headingMatch = line.match(HEADING_PATTERN);
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const blockquoteMatch = line.match(BLOCKQUOTE_PATTERN);
    if (blockquoteMatch) {
      flushParagraph();
      blocks.push({ type: "blockquote", text: blockquoteMatch[1].trim() });
      continue;
    }

    const imageMatch = line.match(IMAGE_PATTERN);
    if (imageMatch) {
      flushParagraph();
      blocks.push({ type: "image", alt: imageMatch[1].trim() || "Image" });
      continue;
    }

    paragraphLines.push(trimmedLine);
  }

  flushParagraph();
  flushList();

  return blocks;
}

export default function KanbanCardMarkdownPreview({ markdown }: Props) {
  const blocks = parseBlocks(markdown);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="kb-task-desc-content kb-task-md">
      {blocks.map((block, index) => {
        if (block.type === "paragraph") {
          return <p key={`paragraph-${index}`}>{renderInline(block.text)}</p>;
        }

        if (block.type === "heading") {
          return (
            <p
              key={`heading-${index}`}
              data-md-heading="true"
              data-md-heading-level={Math.min(block.level, 3)}
            >
              {renderInline(block.text)}
            </p>
          );
        }

        if (block.type === "blockquote") {
          return (
            <blockquote key={`quote-${index}`}>
              {renderInline(block.text)}
            </blockquote>
          );
        }

        if (block.type === "unordered-list") {
          return (
            <ul key={`unordered-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`unordered-item-${itemIndex}`}>
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === "ordered-list") {
          return (
            <ol key={`ordered-${index}`} data-md-list="ordered">
              {block.items.map((item, itemIndex) => (
                <li key={`ordered-item-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }

        if (block.type === "task-list") {
          return (
            <ul key={`task-${index}`} data-md-list="task">
              {block.items.map((item, itemIndex) => (
                <li key={`task-item-${itemIndex}`}>
                  <label data-md-task-item="true">
                    <input type="checkbox" checked={item.checked} disabled />
                    <span>{renderInline(item.text)}</span>
                  </label>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`image-${index}`} data-md-image-placeholder="true">
            {block.alt}
          </p>
        );
      })}
    </div>
  );
}
