# Contributing to Ideon

Thank you for your interest in contributing to Ideon! We appreciate your help in making this project better.

## Getting Started

Ideon uses a **Docker-standardized development environment** to ensure high-fidelity performance and consistency across all machines.

### Prerequisites

- **Docker** & **Docker Compose v2**
- **Node.js** (for running checks and tests locally)

### Initial Setup

1.  **Fork the repository** and clone it locally.
2.  **Configure the environment**:
    ```bash
    cp env.example .env
    # Edit .env and ensure SECRET_KEY is set (e.g. using openssl rand -hex 32)
    ```
3.  **Install local dependencies** (required for IDE support and linting):
    ```bash
    npm install
    ```

### Running the Development Environment

The development server runs within Docker to guarantee production-like performance, especially for large spatial canvases.

```bash
npm run dev
```

This command will:

1.  Build the Ideon container images.
2.  Start the stack including the application and a **PostgreSQL** database.
3.  The app will be available at `http://localhost:3000`.

_Note: Ideon runs in production mode within Docker for maximum performance. You must run `npm run dev` each time you want to apply your changes, as this will trigger a rebuild of the local container image._

## Development Workflow

1.  **Install Pre-commit Hooks** (Mandatory):
    This project uses `pre-commit` to ensure code quality before every commit.

    ```bash
    # Install pre-commit (if not already installed)
    # macOS: brew install pre-commit
    # Linux: sudo apt install pre-commit
    # Arch: sudo pacman -S pre-commit

    # Install the git hooks
    pre-commit install
    ```

2.  Create a new branch for your feature or fix.
3.  Make your changes.

4.  **Run Pre-commit Manually** (Mandatory):
    You can run all checks on all files to verify your changes:

    ```bash
    pre-commit run --all-files
    ```

5.  **Run Tests & Quality Checks** (Mandatory):
    Before submitting your PR, you must ensure that all tests pass and code quality standards are met. The CI pipeline will fail if these checks do not pass.

    ```bash
    # Run unit and integration tests
    npm run test

    # Run type checking and linting
    npm run check
    ```

6.  Submit a **Pull Request (PR)** describing your changes. All pre-commit checks and CI workflows must pass.

## Code Style

- We use **Prettier** for formatting.
- We use **ESLint** for linting.
- Follow the existing naming conventions (camelCase for logic, PascalCase for components).
- **No inline styles** allowed (use CSS files).
- **No hardcoded strings** in the UI (use i18n dictionaries).

## Adding a New Language

Ideon supports dynamic language loading. To add a new language:

1.  Create a new JSON file in `src/app/i18n/` (e.g., `es.json` for Spanish).
2.  Add the `__label` key at the root of the JSON object. This is the name that will appear in the language selector.
3.  Add all required translation keys (copy the structure from `en.json`).

**Example `es.json`:**

```json
{
  "__label": "Español",
  "title": "Ideon",
  "subtitle": "...",
  ...
}
```

The application will automatically detect the new file and add it to the language selection menu. No code changes are required.

## License

By contributing, you agree that your contributions will be licensed under the project's **AGPLv3 License**.
