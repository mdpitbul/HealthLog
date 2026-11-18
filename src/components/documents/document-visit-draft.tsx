"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field-group";
import { NativeSelect } from "@/components/ui/native-select";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { VisitClinicalFields } from "@/components/encounters/visit-clinical-fields";
import { InlinePreview } from "./detail/original-file";
import { apiGet, apiPost } from "@/lib/api/api-fetch";
import { resolveAiRun } from "@/hooks/use-ai-run";
import { useRecordCapabilities } from "@/hooks/use-record-capabilities";
import { queryKeys } from "@/lib/query-keys";
import { useTranslations, useFormatters } from "@/lib/i18n/context";
import { visitPath } from "@/lib/encounters/visit-links";
import type { AiRunAccepted } from "@/lib/documents/ai-runs/types";
import type { EncounterListDTO, EncounterDTO } from "@/lib/encounters/dto";
import type { VisitDraft } from "@/lib/validations/visit-extraction";

export function DocumentVisitDraft({
  documentId,
  previewSrc,
  mimeType,
}: {
  documentId: string;
  previewSrc: string | null;
  mimeType: string;
}) {
  const { t } = useTranslations();
  const { inSharedRecord } = useRecordCapabilities();
  const [open, setOpen] = useState(false);
  if (inSharedRecord) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4" aria-hidden />
        {t("visitExtraction.action")}
      </Button>
      {open ? (
        <DraftSheet
          documentId={documentId}
          previewSrc={previewSrc}
          mimeType={mimeType}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
function DraftSheet({
  documentId,
  previewSrc,
  mimeType,
  onClose,
}: {
  documentId: string;
  previewSrc: string | null;
  mimeType: string;
  onClose: () => void;
}) {
  const { t } = useTranslations();
  const client = useQueryClient();
  const endpoint = `/api/documents/inbound/${encodeURIComponent(documentId)}/visit-draft`;
  const key = queryKeys.documentVisitDraft(documentId);
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      apiGet<{ draft: VisitDraft | null; runId: string | null }>(endpoint),
    staleTime: 0,
  });
  const read = useMutation({
    mutationFn: async () => {
      const accepted = await apiPost<AiRunAccepted>(endpoint);
      await resolveAiRun(client, accepted);
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const [dirty, setDirty] = useState(false);
  const draft = query.data?.draft;
  return (
    <ResponsiveSheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("visitExtraction.title")}
      description={t("visitExtraction.description")}
      contentWidth="6xl"
      dirty={dirty}
    >
      {query.isPending ? (
        <p role="status">{t("visitExtraction.loading")}</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{t("visitExtraction.loadFailed")}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t("visitExtraction.retry")}
          </Button>
        </div>
      ) : draft?.savedEncounterId ? (
        <div className="space-y-4">
          <p>{t("visitExtraction.saved")}</p>
          <Button asChild>
            <Link href={visitPath(draft.savedEncounterId)}>
              {t("visitExtraction.openVisit")}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {!draft ? (
            <p className="mb-4 text-sm">{t("visitExtraction.beforeRead")}</p>
          ) : null}
          <Button
            variant="outline"
            disabled={read.isPending || dirty}
            onClick={() => read.mutate()}
          >
            {read.isPending
              ? t("visitExtraction.reading")
              : query.data?.runId
                ? t("visitExtraction.resume")
                : draft
                  ? t("visitExtraction.readAgain")
                  : t("visitExtraction.read")}
          </Button>
          {read.isError ? (
            <p role="alert" className="text-destructive mt-3 text-sm">
              {t("visitExtraction.failed")} {read.error.message}
            </p>
          ) : null}
          {draft && !read.isPending ? (
            <ReviewDraft
              key={draft.version}
              draft={draft}
              endpoint={endpoint}
              previewSrc={previewSrc}
              mimeType={mimeType}
              onDirty={setDirty}
            />
          ) : null}
        </>
      )}
    </ResponsiveSheet>
  );
}
function ReviewDraft({
  draft,
  endpoint,
  previewSrc,
  mimeType,
  onDirty,
}: {
  onDirty: (dirty: boolean) => void;
  draft: VisitDraft;
  endpoint: string;
  previewSrc: string | null;
  mimeType: string;
}) {
  const { t } = useTranslations();
  const format = useFormatters();
  const client = useQueryClient();
  const [date, setDate] = useState(draft.extraction.date ?? "");
  const [clinical, setClinical] = useState(draft.extraction.clinical);
  const [target, setTarget] = useState<EncounterDTO | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [targetError, setTargetError] = useState(false);
  const [targetPending, setTargetPending] = useState(false);
  const visits = useQuery({
    queryKey: queryKeys.documentVisitDraftTargets(endpoint),
    queryFn: () => apiGet<EncounterListDTO>("/api/encounters?limit=200"),
  });
  const save = useMutation({
    mutationFn: () =>
      apiPost<{ encounterId: string }>(`${endpoint}/confirm`, {
        version: draft.version,
        date: target ? target.occurredAt.slice(0, 10) : date,
        clinical: {
          ...clinical,
          ...(target?.clinical?.dateOnly ? { dateOnly: true as const } : {}),
        },
        encounterId: target?.id ?? null,
        expectedUpdatedAt: target?.updatedAt ?? null,
      }),
    onSuccess: async () => {
      onDirty(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.encounters() }),
        client.invalidateQueries({ queryKey: queryKeys.documents() }),
        client.invalidateQueries({ queryKey: queryKeys.dayRoot() }),
        client.invalidateQueries({ queryKey: queryKeys.timelineRoot() }),
      ]);
    },
  });
  const chooseTarget = async (id: string) => {
    onDirty(true);
    setReviewed(false);
    setTargetError(false);
    if (!id) {
      setTarget(null);
      return;
    }
    setTargetPending(true);
    try {
      setTarget(
        await apiGet<EncounterDTO>(`/api/encounters/${encodeURIComponent(id)}`),
      );
    } catch {
      setTargetError(true);
    } finally {
      setTargetPending(false);
    }
  };
  if (save.data)
    return (
      <div className="mt-4 space-y-4">
        <p role="status">{t("visitExtraction.saved")}</p>
        <Button asChild>
          <Link href={visitPath(save.data.encounterId)}>
            {t("visitExtraction.openVisit")}
          </Link>
        </Button>
      </div>
    );
  return (
    <form
      className="mt-5 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (reviewed && !targetError) save.mutate();
      }}
    >
      {draft.pagesRead < draft.pageCount ? (
        <p role="alert" className="text-destructive">
          {t("visitExtraction.partial", {
            read: draft.pagesRead,
            total: draft.pageCount,
          })}
        </p>
      ) : null}
      {draft.extraction.uncertainties.length ? (
        <div className="border-border rounded-lg border p-3">
          <p className="font-medium">{t("visitExtraction.uncertain")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {draft.extraction.uncertainties.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid min-w-0 gap-6 md:grid-cols-2">
        <div className="min-w-0 md:sticky md:top-0 md:self-start">
          <InlinePreview
            src={previewSrc}
            failed={!previewSrc}
            mimeType={mimeType}
            title={t("visitExtraction.source")}
          />
          <details className="mt-3 text-sm">
            <summary>{t("visitExtraction.evidence")}</summary>
            <ul className="mt-2 space-y-2">
              {draft.extraction.evidence.map((e, i) => (
                <li key={i}>
                  <span className="text-muted-foreground">
                    {t("visitExtraction.page", { page: e.page })}:{" "}
                  </span>
                  {e.quote}
                </li>
              ))}
            </ul>
          </details>
        </div>
        <div className="min-w-0 space-y-4">
          <FieldGroup
            htmlFor="visit-draft-target"
            label={t("visitExtraction.destination")}
          >
            <NativeSelect
              id="visit-draft-target"
              value={target?.id ?? ""}
              onChange={(e) => void chooseTarget(e.target.value)}
              disabled={save.isPending || targetPending}
            >
              <option value="">{t("visitExtraction.newVisit")}</option>
              {[
                ...(visits.data?.past ?? []),
                ...(visits.data?.upcoming ?? []),
              ].map((visit) => (
                <option key={visit.id} value={visit.id}>
                  {format.date(visit.occurredAt)} —{" "}
                  {visit.clinical?.doctor ||
                    visit.practitioner?.name ||
                    visit.reason ||
                    "…"}
                </option>
              ))}
            </NativeSelect>
          </FieldGroup>
          {target ? (
            <div className="bg-muted rounded-lg p-3 text-sm">
              <p>{t("visitExtraction.existingNote")}</p>
              {target.clinical ? (
                <details className="mt-2">
                  <summary>{t("visitExtraction.existingDetails")}</summary>
                  <pre className="mt-2 font-sans whitespace-pre-wrap">
                    {[
                      target.clinical.doctor,
                      target.clinical.specialty,
                      target.clinical.clinic,
                      target.clinical.complaints,
                      target.clinical.diagnoses,
                      target.clinical.treatment,
                      target.clinical.followUp,
                    ]
                      .filter(Boolean)
                      .join("\n\n")}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}
          {targetError || visits.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {t("visitExtraction.targetFailed")}
            </p>
          ) : null}
          <FieldGroup
            htmlFor="visit-draft-date"
            label={t("visitExtraction.date")}
          >
            <Input
              id="visit-draft-date"
              type="date"
              required
              value={target ? target.occurredAt.slice(0, 10) : date}
              disabled={!!target}
              onChange={(e) => {
                setDate(e.target.value);
                onDirty(true);
                setReviewed(false);
              }}
            />
          </FieldGroup>
          <VisitClinicalFields
            value={clinical}
            onChange={(next) => {
              setClinical(next);
              onDirty(true);
              setReviewed(false);
            }}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            {t("visitExtraction.reviewed")}
          </label>
          {save.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {t("visitExtraction.saveFailed")} {save.error.message}
            </p>
          ) : null}
          <Button
            type="submit"
            className="min-h-11"
            disabled={
              !reviewed ||
              save.isPending ||
              targetPending ||
              targetError ||
              !(target || date)
            }
          >
            {save.isPending
              ? t("visitExtraction.saving")
              : target
                ? t("visitExtraction.updateVisit")
                : t("visitExtraction.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}
