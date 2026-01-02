import { getDb } from "../src/app/lib/db";
import * as argon2 from "argon2";

async function main() {
  console.log("Starting password reset process...");

  const db = getDb();

  // Parse identifiers from command line arguments
  const arg = process.argv[2];

  if (!arg) {
    console.error("Error: No identifiers provided.");
    console.log("Usage:");
    console.log(
      "  npx tsx scripts/reset-accounts.ts <user1,email2,...>  (Reset specific users)",
    );
    console.log(
      "  npx tsx scripts/reset-accounts.ts --all              (Reset ALL users - DANGER)",
    );
    process.exit(1);
  }

  const isResetAll = arg === "--all";
  const identifiers = isResetAll ? [] : arg.split(",").map((id) => id.trim());

  // Build query
  let query = db.selectFrom("users").selectAll();

  if (!isResetAll) {
    query = query.where((eb) =>
      eb.or([
        eb("username", "in", identifiers),
        eb("email", "in", identifiers),
      ]),
    );
  }

  // Fetch users
  const users = await query.execute();
  console.log(`Found ${users.length} users.`);

  // Log identifiers not found
  if (identifiers.length > 0) {
    for (const id of identifiers) {
      const found = users.some((u) => u.username === id || u.email === id);
      if (!found) {
        console.warn(`Warning: User or email "${id}" not found.`);
      }
    }
  }

  const results: Array<{ email: string; password: string }> = [];

  for (const user of users) {
    // Generate 8-char random password
    const password = crypto.randomUUID().slice(0, 8);

    // Hash with argon2
    const passwordHash = await argon2.hash(password);

    // Update user
    await db
      .updateTable("users")
      .set({ passwordHash })
      .where("id", "=", user.id)
      .execute();

    results.push({
      email: user.email,
      password: password,
    });

    console.log(`[RESET] ${user.email} -> ${password}`);
  }

  if (results.length > 0) {
    console.log("\n------------------------------------------------");
    console.log("Credentials summary:");
    console.table(results);
    console.log("------------------------------------------------");
  }

  console.log("\nProcess complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error resetting passwords:", err);
  process.exit(1);
});
