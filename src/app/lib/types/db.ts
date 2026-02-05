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

export type ProjectStar = Selectable<projectStarsTable>;
export type NewProjectStar = Insertable<projectStarsTable>;

export type Block = Selectable<blocksTable>;
export type NewBlock = Insertable<blocksTable>;
export type BlockUpdate = Updateable<blocksTable>;

export type Link = Selectable<linksTable>;
export type NewLink = Insertable<linksTable>;

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

export interface projectsTable {
  id: Generated<string>;
  name: string;
  description: string | null;
  ownerId: string;
  currentStateId: string | null; // Tip of the temporal history
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
  updatedAt: ColumnType<Date, Date | string | undefined, Date | string>;
  deletedAt: ColumnType<Date, Date | string | undefined, Date | string> | null;
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

export interface temporalStatesTable {
  id: string; // UUID
  projectId: string;
  parentId: string | null;
  authorId: string;
  timestamp: ColumnType<Date, Date | string | undefined, Date | string>;
  intent: string; // e.g., 'autosave', 'userAction', 'restoration'
  diff: string; // JSON string of the operation-based diff
  isSnapshot: number; // Boolean as int (0 or 1)
}

export interface blocksTable {
  id: string; // Not generated, client-side UUID
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
    | "checklist";
  metadata: string;
  parentBlockId: string | null; // For grouping/zones
  positionX: number;
  positionY: number;
  ownerId: string;
  content: string | null;
  data: string; // JSON string for other metadata
  width: number | null;
  height: number | null;
  selected: number; // Boolean as int
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
  updatedAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface linksTable {
  id: string; // Client-side UUID
  projectId: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  type: string | null;
  animated: number;
  sourceX: number | null;
  sourceY: number | null;
  targetX: number | null;
  targetY: number | null;
  sourceOrientation: string | null;
  targetOrientation: string | null;
  data: string; // JSON string for other metadata
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
  updatedAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface blockSnapshotsTable {
  id: Generated<string>;
  blockId: string;
  label: string | null;
  data: string;
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface projectCollaboratorsTable {
  projectId: string;
  userId: string;
  role: "owner" | "admin" | "editor" | "viewer";
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface invitationsTable {
  id: Generated<string>;
  email: string;
  token: string;
  expiresAt: ColumnType<Date, Date | string | undefined, Date | string>;
  invitedBy: string | null;
  role: "superadmin" | "admin" | "member";
  createdAt: ColumnType<Date, Date | string | undefined, Date | string>;
  acceptedAt: ColumnType<Date, Date | string | undefined, Date | string> | null;
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

export interface database {
  users: usersTable;
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
}

export interface githubRepoStatsTable {
  id: Generated<string>;
  url: string;
  owner: string;
  repo: string;
  data: string; // JSON string of the stats
  fetchedAt: ColumnType<Date, Date | string | undefined, Date | string>;
}
