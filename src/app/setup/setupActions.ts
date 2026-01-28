"use server";
import { getDb } from "@lib/db";
import { runMigrations } from "@lib/migrations";
import { stringToColor } from "@lib/utils";
import * as argon2 from "argon2";
import * as crypto from "crypto";

type Input = {
  email: string;
  username: string;
  password: string;
};

export async function setupAction(input: Input): Promise<boolean> {
  await runMigrations();
  const db = getDb();
  const createdId = crypto.randomUUID();
  const hash = await argon2.hash(input.password);
  const existing = await db
    .selectFrom("users")
    .select(({ fn }) => fn.count<number>("id").as("c"))
    .where("role", "=", "superadmin")
    .executeTakeFirst();
  if ((existing?.c || 0) === 0) {
    await db
      .insertInto("users")
      .values({
        id: createdId,
        email: input.email,
        username: input.username,
        passwordHash: hash,
        role: "superadmin" as const,
        color: stringToColor(input.username),
      })
      .execute();
  }
  const settingsId = crypto.randomUUID();
  await db
    .insertInto("systemSettings")
    .values({
      id: settingsId,
      installed: 1,
      publicRegistrationEnabled: 0,
      ssoRegistrationEnabled: 1,
      passwordLoginEnabled: 1,
      authProvidersJson: "{}",
      createdAt: new Date().toISOString(),
    })
    .execute();
  return true;
}
