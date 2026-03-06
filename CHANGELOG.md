# Changelog

All notable changes to this project will be documented in this file.

The Ideon project follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format
and uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.5] - 2026-03-06

### Added

- **NEW Kanban Block**: Added a minimal Kanban block with customizable columns and drag and drop support for tasks between the Kanban and checklist blocks.
- **Camera Centering on Keyboard Navigation**: the viewport now smoothly centers on blocks when navigating with arrow keys or vim keys (h/j/k/l), making it easier to follow focus across the canvas.

### Fixed

- Fixed multiple sketch block issues, including disappearing or delayed drawings, and improved real-time rendering.

## [0.5.4] - 2026-03-04

### Added

- **Automated Snapshots**: the canvas now automatically saves snapshots after significant actions.
- **Sync Status Indicator**: a real-time connection indicator shows the current sync state.
- **Sketch Block Eraser Customization**: the eraser tool now supports custom size input (1-100px) in addition to the preset sizes.

## [0.5.3] - 2026-03-02

### Changed

- **PostgreSQL 16 → 18**: upgraded the officially supported PostgreSQL version. Existing PostgreSQL 16 deployments continue to work without any changes. If you want to upgrade, see the [migration guide](https://www.theideon.com/docs/migrations/upgrade-postgresql).

### Fixed

- Fixed all remaining Row-Level Security (RLS) issues, including critical failures when running on PostgreSQL 18. These fixes pave the way for migrating Ideon's officially supported PostgreSQL version from 16 to 18.
- Improved overall CPU usage when working inside the canvas.

## [0.5.2] - 2026-03-02

### Added

- **Create Block Modal** — replaced the context menu block list with a searchable grid modal (`Ctrl+A`) for adding blocks. Features all block types with icons and a search input
- **Shell Block** — a fully interactive terminal embedded in the canvas, powered by xterm.js and node-pty. Supports start/stop/kill lifecycle: **Stop** pauses the session while preserving the scrollback buffer for instant resume, **Kill** destroys the session entirely. Zero RAM consumption when stopped. Restricted to project creators and owners.
- **Changelog Viewer** — when an update is available, the version badge tooltip now includes a "See changes" link. Clicking it opens a modal that fetches the changelog directly from Internet, with all versions newer than the current one subtly highlighted.

## [0.5.1] - 2026-02-28

### Added

- Added a Command Palette (`Ctrl+P`) displaying all keyboard shortcuts in a searchable card grid, with a discreet hint button on the canvas.

## [0.5.0] - 2026-02-27

### Added

- Added drag-and-drop reordering for checklist items.
- Added keyboard navigation for the canvas (Arrow keys and Vim keys h/j/k/l).
- Added `Enter` shortcut to enter edit mode on a selected block.
- Added `Escape` shortcut to unselect all blocks.
- Added common keyboard shortcuts (Ctrl+B/I/U/K, Undo/Redo) to the Markdown editor.
- Added `GIT_ALLOWED_HOSTS` environment variable to allow fetching stats from internal/private Git repositories (bypassing SSRF protection for specified hosts).

### Improved

- Improved block title layout to handle long text gracefully (ellipsis, better resizing).
- Improved scrolling behavior in Account settings with better section positioning.

### Fixed

- Fixed Git block stats not refreshing correctly by disabling aggressive caching and ensuring timestamp updates even when stats are unchanged. Added error indicator for failed fetches.

## [0.4.5] - 2026-02-25

### Added

- Added support for Tables and Task Lists (checkboxes) in the Markdown editor (Note Block).

### Fixed

- Fixed a critical issue where project pages would return 404 on PostgreSQL by ensuring all queries run within an authenticated RLS session (#46).
- Resolved Docker permission issues and significantly improved build times by optimizing the entrypoint script (#45).

## [0.4.4] - 2026-02-23

### Fixed

- Resolved a race condition during project loading where blocks would briefly appear and then disappear. The system now waits for remote synchronization before initializing the canvas, ensuring a stable and consistent view for large projects.

## [0.4.3] - 2026-02-21

### Added

- Introduced 4 distinct project roles (Creator, Owner, Editor, Viewer) to separate management privileges from content editing and read-only access.

- A new "Request Access" workflow allows users to ask for an invitation to private projects. Owners can now approve or reject these requests directly from the project settings.

### Fixed

- Resolved a critical privacy issue where private projects could be incorrectly visible to other users on the dashboard. Your projects are now properly secured and only visible to you and your team.

## [0.4.2] - 2026-02-19

### Improved

- Light theme readability and small comfort improvements across the interface.
- General UX polish to make interactions feel smoother.

### Changed

- Large internal refactor to improve maintainability.
- Split oversized files into smaller modules and removed redundant code.
- Simplified structure to make future contributions easier.

## [0.4.1] - 2026-02-17

### Security

Fixed several vulnerabilities:

- **SSRF Protection**: Implemented strict validation on the image proxy to block private IP access and enforce HTTPS (OWASP SSRF, CWE-918).
- **WebSocket Security**: Added strict Origin validation to prevent Cross-Site WebSocket Hijacking (OWASP CSWSH, CWE-346).
- **IP Spoofing**: Implemented trusted proxy-aware IP extraction for accurate client identification (OWASP Logging, RFC 7239).

## [0.4.0] - 2026-02-15

### Added

- Emoji reactions on blocks to enable quick feedback during collaboration without editing content
- Edge labels to clarify relationships between blocks and improve visual structure.
- Permanent “Empty Trash” option allowing users to fully clear deleted items and remove all related project content in one action.

### Improved

- Performance improvements across the app.
- UX refinements to make interactions smoother and more responsive.
- Overall user experience enhancements.

### Fixed

- Fixed project creation failure due to missing ownerId in session by implementing robust token fallback (#42).

## [0.3.4] - 2026-02-13

### Fixed

- Resolved an infinite recursion error in PostgreSQL RLS policies that prevented project creation in v0.3.3 (#40).

## [0.3.3] - 2026-02-13

### Added

- Support for touch devices with long-press gestures, allowing access to all context menus (including block creation on the canvas) (#37).

### Fixed

- Resolved permission issues when using bind mounts by implementing a dynamic entrypoint script that automatically manages directory ownership (#38).

## [0.3.2] - 2026-02-12

### Added

- New Sketch block type for freehand drawing and annotations.

## [0.3.1] - 2026-02-11

### Added

- Added support for private repositories using personal access tokens.
- Compatible with GitHub, GitLab, Gitea, and Forgejo (including self-hosted instances).

## [0.3.0] - 2026-02-10

### Added

- Public project sharing via shareable links
- Project organization using folders
- Full project export as a single image

### Fixed

- Resolved an issue where opening large projects could cause the application to crash.

## [0.2.8] - 2026-02-07

### Added

- Miscellaneous bug fixes and performance improvements.

## [0.2.7] - 2026-02-06

### Added

- **Checklist Progress**: Added visual progress tracking to checklist blocks with dynamic color indicators to easily monitor task completion.
- **Application Version Tracking**: Added a new system directly in the sidebar to monitor your current application version and instantly check for available updates.

## [0.2.6] - 2026-02-05

### Added

- **New Dashboard Navigation**: Introduced a unified "Home" section with collapsible views for streamlined access.
- **New Project Views**:
  - **My Projects**: Displays only the projects owned by you.
  - **Shared with me**: Dedicated view for projects shared with you as a collaborator.
  - **Starred**: Mark important projects as favorites for instant access.
  - **Recent**: Automatically tracks and lists your most recently opened projects.
  - **Trash**: Safe deletion workflow with options to restore or permanently delete projects.

## [0.2.5] - 2026-02-04

### Added

- Implemented **Undo/Redo** system with keyboard shortcuts (Ctrl+Z/Y) and UI controls.
- Added "Don't ask again" option to the block deletion confirmation modal, allowing users to skip future confirmations.
- Added `Tab` shortcut for creating child blocks. Pressing Tab on a selected block now creates a connected child block in the appropriate direction.

## [0.2.4] - 2026-02-03

### Security

- Fixed Server-Side Request Forgery (SSRF) vulnerability in the link metadata service by implementing strict URL validation and blocking private IP ranges.
- Enforced mandatory `SECRET_KEY` or `AUTH_SECRET` environment variables. The application will now fail to start if no secret is configured, preventing insecure deployments.

### Fixed

- Fixed metadata fetching for bare domains (e.g., `google.com`) by automatically normalizing URLs to use HTTPS.

## [0.2.3] - 2026-02-03

### Fixed

- Fixed CI/CD workflow to prevent incomplete Docker builds on documentation changes (#18)
- Quoted OpenSSL string generation to prevent escape character issues during setup

### Added

- Added a hover badge on git, link, and contact blocks to make editing more discoverable and intuitive

## [0.2.2] - 2026-02-02

### Fixed

- Fixed context menu behavior and right-click interactions on blocks.
- Fixed critical `JWTSessionError` where Edge Middleware and Node.js Runtime were using mismatched secret configurations, causing login loops and WebSocket rejections.

## [0.2.1] - 2026-02-02

### Security

- Removed `INTERNAL_SECRET` environment variable and legacy key derivation logic to prevent potential authentication bypass.

### Fixed

- Fixed `MIDDLEWARE_INVOCATION_FAILED` error on Edge Runtime (Vercel) by removing Node.js-specific dependencies from middleware.
- Resolved system setup check failures by moving verification logic from client-side to server-side layout.

## [0.2.0] - 2026-02-01

### Added

- Added dynamic language loading system: new languages can now be added simply by dropping a JSON file into the i18n directory.
- Added Prettier integration in Snippet Blocks for automatic code formatting.
- Added Tiptap bubble menu for text formatting (bold, italic, etc.) to assist users unfamiliar with Markdown.
- Added support for top and bottom connectors on blocks to allow more flexible flow layouts.

- Support for self-hosted Git providers (GitLab, Gitea, Forgejo) in addition to GitHub. Auto-detection of Git provider based on URL.
- Enhanced OIDC compatibility: added support for multiple profile picture fields (`picture`, `avatar`, `avatar_url`) to handle diverse OIDC providers (e.g., Keycloak, Authentik).
- Added option to authorize SSO and block public registration page separately.

## [0.1.0] - 2026-01-24

### Vision

Ideon addresses the cognitive load of modern software development. By bringing code, design, and decision-making into a single spatial interface, it transforms abstract project metadata into a tangible, navigable map. The goal is to maintain a shared mental model across the entire lifecycle of a product, ensuring that the "why" and "how" remain accessible alongside the "what".

### Technology Stack

Built on a bleeding-edge foundation to ensure performance, security, and type safety:

- **Framework**: Next.js 16 (App Router) & React 19
- **Language**: TypeScript
- **Data Layer**: PostgreSQL with Kysely
- **Real-time Engine**: Yjs (CRDTs) over WebSockets
- **Authentication**: NextAuth.js v5
- **Security**: HKDF key derivation & AES-256-GCM encryption

### Core Features

- **Spatial Workspace**: An infinite canvas powered by ReactFlow for organizing project components visually
- **Universal Blocks**: First-class support for diverse content types:
  - Rich Text & Markdown
  - GitHub Repositories
  - Code Snippets
  - File Attachments
  - External Links
  - Color Palettes
  - Contact Cards
- **Multiplayer Collaboration**: Real-time cursor tracking and concurrent editing enabled by CRDTs
- **Temporal State**: Comprehensive history tracking to view and revert project evolution over time
- **Security**:
  - Field-level encryption with Argon2id for sensitive data
  - Comprehensive audit logging for all critical actions
- **Internationalization**: Native i18n support: English and French (for now...)
- **Deployment**: Fully dockerized with Docker Compose for easy self-hosting
