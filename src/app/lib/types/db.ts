import {
  ColumnType,
  Generated,
  Selectable,
  Insertable,
  Updateable,
} from "kysely";

export type User = Selectable<usersTable>;
export type NewUser = Insertable<usersTable>;
export type UserUpdate = Updateable<usersTable>;

export type Project = Selectable<projectsTable>;
export type NewProject = Insertable<projectsTable>;
export type ProjectUpdate = Updateable<projectsTable>;

export type Folder = Selectable<foldersTable>;
export type NewFolder = Insertable<foldersTable>;
export type FolderUpdate = Updateable<foldersTable>;

export type FolderCollaborator = Selectable<folderCollaboratorsTable>;
export type NewFolderCollaborator = Insertable<folderCollaboratorsTable>;

export type ProjectStar = Selectable<projectStarsTable>;
export type NewProjectStar = Insertable<projectStarsTable>;

export type Block = Selectable<blocksTable>;
export type NewBlock = Insertable<blocksTable>;
export type BlockUpdate = Updateable<blocksTable>;

export type BlockReaction = Selectable<blockReactionsTable>;
export type NewBlockReaction = Insertable<blockReactionsTable>;

export type Link = Selectable<linksTable>;
export type NewLink = Insertable<linksTable>;

export type LinkPreview = Selectable<linkPreviewsTable>;
export type NewLinkPreview = Insertable<linkPreviewsTable>;
export type LinkPreviewUpdate = Updateable<linkPreviewsTable>;

export type ProjectCollaborator = Selectable<projectCollaboratorsTable>;
export type NewProjectCollaborator = Insertable<projectCollaboratorsTable>;

export interface usersTable {
  id: Generated<string>;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  color: string | null;
  passwordHash: string | null;
  role: "superadmin" | "admin" | "member";
  lastOnline: ColumnType<Date, Date | string | undefined, Date | string>;
  invitedByUserId: string | null;
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface foldersTable {
  id: Generated<string>;
  name: string;
  ownerId: string;
  isStarred: ColumnType<number, number | undefined, number>;
  deletedAt: ColumnType<
    Date | null,
    Date | string | null | undefined,
    Date | string | null
  >;
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
  updatedAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface folderCollaboratorsTable {
  folderId: string;
  userId: string;
  role: "owner" | "admin" | "editor" | "viewer";
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface projectsTable {
  id: Generated<string>;
  name: string;
  description: string | null;
  ownerId: string;
  folderId: string | null;
  currentStateId: string | null;
  shareToken: string | null;
  shareEnabled: number | null; // 0 or 1
  shareCreatedAt: ColumnType<
    Date,
    Date | string | undefined,
    Date | string
  > | null;
  deletedAt: ColumnType<Date, Date | string | undefined, Date | string> | null;
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
  updatedAt: ColumnType<Date, Date | string | undefined, Date | string>;
  acceptedAt: ColumnType<Date, Date | string | undefined, Date | string> | null;
  lastOpenedAt: ColumnType<
    Date,
    Date | string | undefined,
    Date | string
  > | null;
}

export interface projectStarsTable {
  projectId: string;
  userId: string;
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface projectCollaboratorsTable {
  projectId: string;
  userId: string;
  role: "owner" | "admin" | "editor" | "viewer";
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface blocksTable {
  id: Generated<string>;
  projectId: string;
  blockType:
    | "text"
    | "link"
    | "file"
    | "core"
    | "github"
    | "palette"
    | "contact"
    | "video"
    | "snippet"
    | "checklist"
    | "sketch";
  metadata: string; // JSON string
  parentBlockId: string | null;
  positionX: number;
  positionY: number;
  ownerId: string;
  content: string | null;
  data: string; // JSON string
  width: number | null;
  height: number | null;
  selected: number; // 0 or 1
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
  updatedAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface linksTable {
  id: Generated<string>;
  projectId: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  type: string | null;
  animated: number; // 0 or 1
  sourceX: number | null;
  sourceY: number | null;
  targetX: number | null;
  targetY: number | null;
  sourceOrientation: string | null;
  targetOrientation: string | null;
  data: string | null; // JSON string
  label: string | null;
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
  updatedAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface blockReactionsTable {
  id: Generated<string>;
  blockId: string;
  userId: string;
  emoji: string;
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface linkPreviewsTable {
  id: Generated<string>;
  blockId: string;
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  fetchedAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface blockSnapshotsTable {
  id: Generated<string>;
  blockId: string;
  content: string | null;
  data: string; // JSON string
  metadata: string; // JSON string
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface invitationsTable {
  id: Generated<string>;
  email: string;
  token: string;
  role: "admin" | "member";
  invitedBy: string;
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
  expiresAt: ColumnType<Date, Date | string | undefined, Date | string>;
  acceptedAt: ColumnType<Date, Date | string | undefined, Date | string> | null;
}

export interface temporalStatesTable {
  id: Generated<string>;
  projectId: string;
  parentId: string | null;
  authorId: string;
  intent: string;
  diff: string; // JSON patch or similar
  isSnapshot: number; // 0 or 1
  timestamp: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface systemSettingsTable {
  id: string;
  installed: number;
  publicRegistrationEnabled: number;
  ssoRegistrationEnabled: number;
  passwordLoginEnabled: number;
  authProvidersJson: string;
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface sessionsTable {
  id: string;
  userId: string;
  expiresAt: number;
}

export interface emailVerificationsTable {
  id: string;
  userId: string;
  email: string;
  code: string;
  expiresAt: number;
}

export interface passwordResetsTable {
  id: string;
  userId: string;
  token: string;
  expiresAt: number;
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface auditLogsTable {
  id: string;
  userId: string | null;
  action: string;
  ipAddress: string | null;
  status: string;
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface magicLinksTable {
  id: string;
  email: string;
  token: string;
  expiresAt: ColumnType<Date, Date | string | undefined, Date | string>;
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface rateLimitsTable {
  key: string;
  points: number;
  expire: number;
}

import { userGitTokensTable } from "./userGitTokens";

export interface database {
  users: usersTable;
  folders: foldersTable;
  folderCollaborators: folderCollaboratorsTable;
  projects: projectsTable;
  projectStars: projectStarsTable;
  projectCollaborators: projectCollaboratorsTable;
  blocks: blocksTable;
  links: linksTable;
  blockSnapshots: blockSnapshotsTable;
  systemSettings: systemSettingsTable;
  sessions: sessionsTable;
  emailVerifications: emailVerificationsTable;
  passwordResets: passwordResetsTable;
  invitations: invitationsTable;
  auditLogs: auditLogsTable;
  magicLinks: magicLinksTable;
  temporalStates: temporalStatesTable;
  rateLimits: rateLimitsTable;
  githubRepoStats: githubRepoStatsTable;
  linkPreviews: linkPreviewsTable;
  userGitTokens: userGitTokensTable;
  blockReactions: blockReactionsTable;
}

export interface githubRepoStatsTable {
  id: Generated<string>;
  url: string;
  owner: string;
  repo: string;
  data: string; // JSON string of the stats
  fetchedAt: ColumnType<Date, Date | string | undefined, Date | string>;
}
