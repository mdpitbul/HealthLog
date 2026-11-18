"use client";
import Link from "next/link";
import type { Encounter } from "@/hooks/use-encounters";
import { useFormatters, useTranslations } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
export function VisitsTable({
  visits,
  onOpen,
}: {
  visits: Encounter[];
  onOpen?: (visit: Encounter) => void;
}) {
  const { t } = useTranslations();
  const format = useFormatters();
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{t("visitExtraction.table")}</caption>
        <thead className="bg-muted">
          <tr>
            {[
              "date",
              "doctor",
              "clinic",
              "diagnoses",
              "treatment",
              "followUp",
              "source",
            ].map((key) => (
              <th scope="col" className="px-3 py-3 font-medium" key={key}>
                {t(`visitExtraction.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visits.map((visit) => (
            <tr
              key={visit.id}
              data-encounter-id={visit.id}
              className="border-border border-t align-top"
            >
              <td className="px-3 py-3 whitespace-nowrap">
                {onOpen ? (
                  <Button
                    variant="link"
                    className="h-auto p-0"
                    onClick={() => onOpen(visit)}
                  >
                    {format.date(visit.occurredAt)}
                  </Button>
                ) : (
                  format.date(visit.occurredAt)
                )}
              </td>
              <td className="min-w-40 px-3 py-3">
                <p>
                  {visit.clinical?.doctor || visit.practitioner?.name || "—"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {visit.clinical?.specialty || visit.practitioner?.specialty}
                </p>
              </td>
              <td className="min-w-32 px-3 py-3">
                {visit.clinical?.clinic || visit.practitioner?.practice || "—"}
              </td>
              <td className="min-w-48 px-3 py-3 whitespace-pre-wrap">
                {visit.clinical?.diagnoses || "—"}
              </td>
              <td className="min-w-64 px-3 py-3 whitespace-pre-wrap">
                {visit.clinical?.treatment || "—"}
              </td>
              <td className="min-w-48 px-3 py-3 whitespace-pre-wrap">
                {visit.clinical?.followUp || "—"}
              </td>
              <td className="min-w-28 px-3 py-3">
                {visit.links?.documents
                  .filter((doc) => !doc.redacted)
                  .map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/documents?doc=${encodeURIComponent(doc.id)}`}
                      className="text-primary mb-2 block underline underline-offset-4"
                    >
                      {doc.label || t("visitExtraction.source")}
                    </Link>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
