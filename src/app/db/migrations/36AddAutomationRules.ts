import { Kysely } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  await db.schema
    .createTable("automationRules")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("projectId", "text", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("enabled", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("triggerEvent", "text", (col) => col.notNull())
    .addColumn("conditions", "text")
    .addColumn("targetBlockId", "text")
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("actionParams", "text")
    .addColumn("webhookSecret", "text", (col) => col.notNull())
    .addColumn("stateDecayHours", "integer", (col) =>
      col.notNull().defaultTo(24),
    )
    .addColumn("lastTriggeredAt", "integer")
    .addColumn("createdAt", "integer", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("automationRules_projectId_idx")
    .on("automationRules")
    .column("projectId")
    .execute();

  await db.schema
    .createTable("automationLogs")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("ruleId", "text", (col) =>
      col.notNull().references("automationRules.id").onDelete("cascade"),
    )
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("payload", "text")
    .addColumn("error", "text")
    .addColumn("appliedAt", "integer", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("automationLogs_ruleId_idx")
    .on("automationLogs")
    .column("ruleId")
    .execute();

  await db.schema
    .createTable("blockAutomationStates")
    .ifNotExists()
    .addColumn("blockId", "text", (col) => col.primaryKey())
    .addColumn("ruleId", "text", (col) =>
      col.references("automationRules.id").onDelete("set null"),
    )
    .addColumn("state", "text", (col) => col.notNull().defaultTo("neutral"))
    .addColumn("label", "text")
    .addColumn("lastUpdated", "integer", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<database>): Promise<void> {
  await db.schema.dropTable("blockAutomationStates").ifExists().execute();
  await db.schema.dropIndex("automationLogs_ruleId_idx").ifExists().execute();
  await db.schema.dropTable("automationLogs").ifExists().execute();
  await db.schema
    .dropIndex("automationRules_projectId_idx")
    .ifExists()
    .execute();
  await db.schema.dropTable("automationRules").ifExists().execute();
}
