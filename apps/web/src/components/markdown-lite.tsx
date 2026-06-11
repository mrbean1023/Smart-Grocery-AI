import * as React from "react";

import { cn } from "@/lib/utils";

/** Render **bold**, `code`, bullet/numbered lists and line breaks — no dependency. */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on **bold** and `code` spans.
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(pattern);
  parts.forEach((part, i) => {
    if (!part) return;
    if (part.startsWith("**") && part.endsWith("**")) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("`") && part.endsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}-c${i}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<React.Fragment key={`${keyPrefix}-t${i}`}>{part}</React.Fragment>);
    }
  });
  return nodes;
}

export function MarkdownLite({ content, className }: { content: string; className?: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let listItems: { ordered: boolean; text: string }[] = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    const ordered = listItems[0]!.ordered;
    const items = listItems.map((li, i) => (
      <li key={`${key}-li${i}`}>{renderInline(li.text, `${key}-li${i}`)}</li>
    ));
    blocks.push(
      ordered ? (
        <ol key={key} className="ml-5 list-decimal space-y-1">
          {items}
        </ol>
      ) : (
        <ul key={key} className="ml-5 list-disc space-y-1">
          {items}
        </ul>
      ),
    );
    listItems = [];
  };

  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet) {
      listItems.push({ ordered: false, text: bullet[1]! });
      return;
    }
    if (numbered) {
      listItems.push({ ordered: true, text: numbered[1]! });
      return;
    }
    flushList(`l${i}`);
    if (line.trim() === "") return;
    blocks.push(
      <p key={`p${i}`} className="leading-relaxed">
        {renderInline(line, `p${i}`)}
      </p>,
    );
  });
  flushList("tail");

  return <div className={cn("space-y-2 text-sm", className)}>{blocks}</div>;
}
