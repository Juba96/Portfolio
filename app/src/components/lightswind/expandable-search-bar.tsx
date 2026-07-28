import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

// Lightswind UI "Expandable Search Bar"
// (lightswind.com — registry/expandable-search-bar), vendored per their
// copy-paste model and adapted: motion/react, controlled value, inline
// SVG icons, palette matched to the dashboard (gray pill → white field),
// Escape clears + collapses, no ⌘K hint (no global shortcut wired).

export function ExpandableSearchBar({
  value,
  onChange,
  placeholder = "Search…",
  expandedWidth = "18rem",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  expandedWidth?: string | number;
  className?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(Boolean(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isExpanded) inputRef.current?.focus();
  }, [isExpanded]);

  // Collapse on outside click when empty.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) && value === "") {
        setIsExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  const clear = () => {
    onChange("");
    setIsExpanded(false);
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative flex items-center", className)}
      style={{ width: isExpanded ? expandedWidth : "2.25rem" }}
    >
      <motion.form
        initial={false}
        animate={{ width: isExpanded ? expandedWidth : "2.25rem" }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onSubmit={(e) => e.preventDefault()}
        onClick={() => !isExpanded && setIsExpanded(true)}
        className={cn(
          "relative flex h-9 items-center overflow-hidden rounded-full transition-colors",
          isExpanded
            ? "border border-black/10 bg-white shadow-sm"
            : "border border-transparent bg-gray-100 hover:bg-gray-200/70 cursor-pointer",
        )}
      >
        <button
          type="button"
          aria-label="Search"
          disabled={isExpanded && value !== ""}
          onClick={() => {
            if (isExpanded && value === "") setIsExpanded(false);
            else if (!isExpanded) setIsExpanded(true);
          }}
          className="absolute left-0 z-10 flex h-full w-9 items-center justify-center text-gray-500 transition-colors hover:text-black focus:outline-none cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>

        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") clear();
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          tabIndex={isExpanded ? 0 : -1}
          className="h-full w-full border-none bg-transparent pl-9 pr-9 text-[13px] outline-none placeholder:text-gray-400 focus:ring-0"
          style={{ pointerEvents: isExpanded ? "auto" : "none", opacity: isExpanded ? 1 : 0 }}
        />

        {isExpanded && value !== "" && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-0 flex h-full w-9 items-center justify-center text-gray-400 hover:text-black focus:outline-none cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </motion.button>
        )}
      </motion.form>
    </div>
  );
}
