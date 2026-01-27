import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Jackson Store
  await db.schema
    .createTable("jackson_store")
    .ifNotExists()
    .addColumn("key", "varchar(1500)", (col) => col.primaryKey())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("iv", "varchar(64)")
    .addColumn("tag", "varchar(64)")
    .addColumn("type", "varchar(255)")
    .addColumn("createdAt", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("modifiedAt", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("namespace", "varchar(255)")
    .execute();

  await db.schema
    .createIndex("jackson_store_type")
    .on("jackson_store")
    .column("type")
    .execute();

  await db.schema
    .createIndex("jackson_store_namespace")
    .on("jackson_store")
    .column("namespace")
    .execute();

  // Jackson Index
  await db.schema
    .createTable("jackson_index")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("key", "varchar(255)", (col) => col.notNull())
    .addColumn("storeKey", "varchar(1500)", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("jackson_index_key")
    .on("jackson_index")
    .column("key")
    .execute();

  await db.schema
    .createIndex("jackson_index_storeKey")
    .on("jackson_index")
    .column("storeKey")
    .execute();

  // Jackson TTL
  await db.schema
    .createTable("jackson_ttl")
    .ifNotExists()
    .addColumn("key", "varchar(1500)", (col) => col.primaryKey())
    .addColumn("expiresAt", "bigint", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("jackson_ttl_expiresAt")
    .on("jackson_ttl")
    .column("expiresAt")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("jackson_ttl").ifExists().execute();
  await db.schema.dropTable("jackson_index").ifExists().execute();
  await db.schema.dropTable("jackson_store").ifExists().execute();
}
