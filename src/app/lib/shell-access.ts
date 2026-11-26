// The shell runs on the host with the server's privileges, so only system administrators may use it
const SHELL_SYSTEM_ROLES = new Set(["superadmin", "admin"]);

export function canUseShell(systemRole: string | null | undefined): boolean {
  return !!systemRole && SHELL_SYSTEM_ROLES.has(systemRole);
}
