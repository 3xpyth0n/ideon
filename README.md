<p align="center">
  <img src="https://www.theideon.com/images/ideon-text-logo.png" alt="Ideon logo" height="100" />
</p>

<p align="center">
  The Visual Hub for Everything Your Project Needs.
</p>

<p align="center">
  <a href="https://github.com/prettier/prettier">
    <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg" alt="Prettier">
  </a>
  <a href="https://github.com/3xpyth0n/ideon/actions/workflows/ci.yml">
    <img src="https://github.com/3xpyth0n/ideon/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://github.com/3xpyth0n/ideon/issues">
    <img src="https://img.shields.io/badge/contributions-welcome-brightgreen.svg" alt="Contributions welcome">
  </a>
  <a href="https://github.com/3xpyth0n/ideon/commits/main">
    <img src="https://img.shields.io/github/last-commit/3xpyth0n/ideon" alt="Last commit">
  </a>
  <a href="https://github.com/3xpyth0n/ideon/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-AGPLv3-blue.svg" alt="License">
  </a>
</p>

---

## Why Ideon ?

Most projects die from fragmentation.

Code lives in GitHub. Decisions live in chat logs. Visuals live in design tools. Random facts live in notes. Over time, nobody knows **why** something exists or **how** things relate.

Ideon exists to keep a project **mentally navigable**.

Not to replace GitHub, Notion, or Figma.  
But to **put the important parts in the same space**, at the same time.

---

## What Ideon actually is

Ideon is a **self-hosted visual workspace** where you place structured blocks on a canvas:

- repositories
- notes
- links
- files
- people
- references

And a lot more.

Just state, structure, and history.

---

## Core concepts

- **Blocks**  
  Each block represents one concrete thing:

  - GitHub repository
  - Color palette
  - Contact / stakeholder
  - Link or file
  - Plain text

- **Spatial organization**  
  You decide what is close, what is isolated, what depends on what.

- **State history**  
  The workspace has snapshots. You can track how decisions evolved over time.

- **Multiplayer collaboration**  
  Collaborate with teammates on projects in realtime.

---

## Demo Application

You can try Ideon without any setup using our hosted demo:

- **URL**: https://demo.theideon.com
- **Username**: `ideon-demo`
- **Password**: `ideon-demo`

---

## Requirements

- Docker
- Docker Compose

If you can run containers, you can run Ideon.

---

## Deployment

### Quick Start

The easiest way to install Ideon with a production-ready PostgreSQL database is using the automated installer.

1.  **Run the installer**:

    ```bash
    curl -fsSL https://install.theideon.com | sh
    ```

    This script will:

    - Check for necessary requirements (Docker, OpenSSL).
    - Download `docker-compose.yml`.
    - Generate secure secrets and configuration files.
    - Set up the environment.
    - Launch the application and database containers.

2.  **Access Ideon**:
    Open your browser at `http://localhost:3000` (or the URL you configured).

---

## License

**AGPLv3.** If you deploy it publicly and modify it, you are expected to share the changes.

---

## Contributing

Contributions are welcome! If you want to modify the code, please read our [CONTRIBUTING.md](CONTRIBUTING.md).
