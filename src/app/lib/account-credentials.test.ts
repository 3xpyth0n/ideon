import { describe, it, expect, beforeAll } from "vitest";
import * as argon2 from "argon2";
import { assertCredentialChangeAllowed } from "./account-credentials";

describe("assertCredentialChangeAllowed", () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash("correct-password");
  });

  it("allows profile updates that change neither email nor password", async () => {
    await expect(
      assertCredentialChangeAllowed({
        passwordHash,
        emailChanged: false,
        passwordChanged: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a password change without the current password", async () => {
    await expect(
      assertCredentialChangeAllowed({
        passwordHash,
        emailChanged: false,
        passwordChanged: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects an email change with a wrong current password", async () => {
    await expect(
      assertCredentialChangeAllowed({
        passwordHash,
        emailChanged: true,
        passwordChanged: false,
        currentPassword: "wrong-password",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows email and password changes with the current password", async () => {
    await expect(
      assertCredentialChangeAllowed({
        passwordHash,
        emailChanged: true,
        passwordChanged: true,
        currentPassword: "correct-password",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects an email change on an account without a password", async () => {
    await expect(
      assertCredentialChangeAllowed({
        passwordHash: null,
        emailChanged: true,
        passwordChanged: false,
        currentPassword: "anything",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("allows setting a first password on an account without one", async () => {
    await expect(
      assertCredentialChangeAllowed({
        passwordHash: null,
        emailChanged: false,
        passwordChanged: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("treats a malformed stored hash as an invalid password", async () => {
    await expect(
      assertCredentialChangeAllowed({
        passwordHash: "not-a-hash",
        emailChanged: false,
        passwordChanged: true,
        currentPassword: "correct-password",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
