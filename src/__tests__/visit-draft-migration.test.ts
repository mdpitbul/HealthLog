import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
describe("visit draft migration", () => {
  it("addresses the PostgreSQL enum by its mapped schema name", () => {
    const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
    const enumBody = /enum DocumentAiRunKind\s*\{([\s\S]*?)\n\}/u.exec(
      schema,
    )?.[1];
    expect(enumBody).toBeDefined();
    const databaseType =
      /@@map\("([^"]+)"\)/u.exec(enumBody ?? "")?.[1] ?? "DocumentAiRunKind";
    const sql = readFileSync(
      resolve("prisma/migrations/0499_document_visit_drafts/migration.sql"),
      "utf8",
    );
    const alteredType =
      /ALTER TYPE "([^"]+)" ADD VALUE IF NOT EXISTS 'DOCUMENT_VISIT_DRAFT'/u.exec(
        sql,
      )?.[1];
    expect(alteredType).toBe(databaseType);
  });
});
