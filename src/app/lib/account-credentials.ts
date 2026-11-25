import * as argon2 from "argon2";

export interface CredentialChangeInput {
  passwordHash: string | null;
  emailChanged: boolean;
  passwordChanged: boolean;
  currentPassword?: string;
}

async function isCurrentPasswordValid(
  passwordHash: string,
  currentPassword: string | undefined,
): Promise<boolean> {
  if (!currentPassword) return false;
  try {
    return await argon2.verify(passwordHash, currentPassword);
  } catch {
    return false;
  }
}

export async function assertCredentialChangeAllowed(
  input: CredentialChangeInput,
): Promise<void> {
  if (!input.emailChanged && !input.passwordChanged) return;

  if (!input.passwordHash) {
    if (input.emailChanged) {
      throw {
        status: 400,
        message: "Email cannot be changed on an account without a password",
      };
    }
    return;
  }

  if (
    !(await isCurrentPasswordValid(input.passwordHash, input.currentPassword))
  ) {
    throw { status: 403, message: "Current password is incorrect" };
  }
}
