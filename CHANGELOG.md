# Changelog

All notable changes to this project will be documented in this file.

The Ideon project follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format
and uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
