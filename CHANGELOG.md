# Changelog

All notable changes to this project will be documented in this file.

The Ideon project follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format
and uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
