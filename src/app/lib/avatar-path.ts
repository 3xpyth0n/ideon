import { join, resolve, sep } from "path";

const AVATAR_URL_PATTERN =
  /^\/api\/avatar\/([A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|gif))$/;

export function resolveAvatarFilePath(avatarUrl: string): string | null {
  const fileName = AVATAR_URL_PATTERN.exec(avatarUrl)?.[1];
  if (!fileName) return null;

  const avatarDir = resolve(join(process.cwd(), "storage", "avatars"));
  const filePath = resolve(avatarDir, fileName);
  return filePath.startsWith(avatarDir + sep) ? filePath : null;
}
