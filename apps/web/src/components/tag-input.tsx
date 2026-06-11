"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  /** Async suggestion fetcher (debounced). Return suggestion strings. */
  fetchSuggestions?: (q: string) => Promise<string[]>;
  id?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function TagInput({
  value,
  onChange,
  placeholder,
  fetchSuggestions,
  id,
  disabled,
  className,
  ...rest
}: TagInputProps) {
  const [input, setInput] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const add = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setInput("");
      return;
    }
    onChange([...value, tag]);
    setInput("");
    setSuggestions([]);
    setOpen(false);
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  React.useEffect(() => {
    if (!fetchSuggestions) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = input.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await fetchSuggestions(q);
        const filtered = result.filter(
          (s) => !value.some((t) => t.toLowerCase() === s.toLowerCase()),
        );
        setSuggestions(filtered.slice(0, 8));
        setOpen(filtered.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, fetchSuggestions, value]);

  React.useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-1.5 shadow-sm focus-within:ring-2 focus-within:ring-ring">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              disabled={disabled}
              aria-label={`Remove ${tag}`}
              className="rounded-full p-0.5 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input
          id={id}
          value={input}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : undefined}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(input);
            } else if (e.key === "Backspace" && input === "" && value.length > 0) {
              remove(value[value.length - 1]!);
            }
          }}
          onBlur={() => {
            if (input.trim()) add(input);
          }}
          className="h-7 min-w-[120px] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          {...rest}
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s);
                }}
                className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
