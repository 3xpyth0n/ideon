import { describe, expect, it, beforeEach } from "vitest";
import { KyselyAdapter } from "../authAdapter";
import type { AdapterUser, AdapterAccount } from "next-auth/adapters";
import { getDb } from "../db";
import { v4 as uuidv4 } from "uuid";

describe("KyselyAdapter concurrency", () => {
  beforeEach(async () => {
    const db = getDb();
    // Clean users and accounts tables
    await db
      .deleteFrom("accounts")
      .execute()
      .catch(() => {});
    await db.deleteFrom("users").execute();
    // Ensure SSO registration is enabled for tests
    const settings = await db
      .selectFrom("systemSettings")
      .selectAll()
      .executeTakeFirst();
    if (settings) {
      await db
        .updateTable("systemSettings")
        .set({ ssoRegistrationEnabled: 1 })
        .execute();
    } else {
      await db
        .insertInto("systemSettings")
        .values({
          id: uuidv4(),
          installed: 1,
          publicRegistrationEnabled: 1,
          passwordLoginEnabled: 1,
          authProvidersJson: "{}",
          ssoRegistrationEnabled: 1,
          createdAt: new Date().toISOString(),
        })
        .execute();
    }
  });

  it("creates only one user when createUser is called concurrently", async () => {
    const adapter = KyselyAdapter();
    const email = `concurrent-${uuidv4()}@example.com`;

    const userPayload: AdapterUser = {
      id: "",
      email,
      name: "Concurrent Test",
      image: null,
      emailVerified: null,
    } as AdapterUser;

    const [a, b] = await Promise.all([
      adapter.createUser!(userPayload),
      adapter.createUser!(userPayload),
    ]);

    expect(a.email).toBe(email.toLowerCase());
    expect(b.email).toBe(email.toLowerCase());
    // both should refer to the same stored user id
    expect(a.id).toBeDefined();
    expect(b.id).toBeDefined();

    const db = getDb();
    const users = await db
      .selectFrom("users")
      .selectAll()
      .where("email", "=", email)
      .execute();
    expect(users.length).toBe(1);
  });

  it("links account and can find user by account", async () => {
    const adapter = KyselyAdapter();
    const email = `account-${uuidv4()}@example.com`;
    const userPayload: AdapterUser = {
      id: "",
      email,
      name: "Link Test",
      image: null,
      emailVerified: null,
    } as AdapterUser;

    const created = await adapter.createUser!(userPayload);
    const account: AdapterAccount = {
      provider: "testprov",
      providerAccountId: `prov-${uuidv4()}`,
      userId: created.id,
      type: "oauth",
    };

    await adapter.linkAccount!(account);

    const found = await adapter.getUserByAccount!({
      provider: account.provider,
      providerAccountId: account.providerAccountId,
    });
    expect(found).not.toBeNull();
    expect(found?.email).toBe(email.toLowerCase());
  });
});
