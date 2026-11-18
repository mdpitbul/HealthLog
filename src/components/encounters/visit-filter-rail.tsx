"use client";
import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { FilterBar, FilterBarDateRange } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { useFormatters, useTranslations } from "@/lib/i18n/context";
import type { VisitFilters } from "@/lib/encounters/visit-filters";
export function VisitFilterRail({
  value,
  onChange,
  count,
  enabled,
}: {
  value: VisitFilters;
  onChange: (value: VisitFilters) => void;
  count: number;
  enabled: boolean;
}) {
  const { t } = useTranslations();
  const format = useFormatters();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!enabled) return;
    const focus = (event: KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest('input,textarea,[contenteditable="true"]'))
      )
        return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", focus);
    return () => window.removeEventListener("keydown", focus);
  }, [enabled]);
  return (
    <div
      className="flex flex-col gap-3 sm:flex-row sm:items-start"
      data-slot="visit-filter-rail"
    >
      <div className="relative w-full sm:w-56 sm:shrink-0">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          ref={input}
          type="search"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder={t("visitExtraction.search")}
          aria-label={t("visitExtraction.search")}
          aria-keyshortcuts="/"
          className="w-full min-w-0 pr-11 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value.search ? (
          <button
            type="button"
            onClick={() => {
              onChange({ ...value, search: "" });
              input.current?.focus();
            }}
            aria-label={t("labs.filter.clearSearch")}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-0 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] sm:size-10"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : (
          <kbd
            aria-hidden
            className="border-border text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-xs sm:inline-block"
          >
            /
          </kbd>
        )}
      </div>
      <div className="min-w-0 sm:flex-1">
        {/* Dates and search clear in their own controls; no separate reset action. */}
        <FilterBar
          isFiltered={false}
          onReset={() => {}}
          count={t("visitExtraction.count", { count: format.integer(count) })}
        >
          <FilterBarDateRange
            label={t("visitExtraction.fields.date")}
            from={value.from}
            to={value.to}
            onFromChange={(from) => onChange({ ...value, from })}
            onToChange={(to) => onChange({ ...value, to })}
            idPrefix="visits-filter-date"
          />
        </FilterBar>
      </div>
    </div>
  );
}
