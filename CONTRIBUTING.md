# Contributing to Ideon

Thank you for your interest in contributing to Ideon! We appreciate your help in making this project better.

## Getting Started

Ideon is designed to be easy to develop on. It supports two database modes depending on the environment:

- **SQLite** (Development): Used automatically when running in dev mode. Zero setup required.
- **PostgreSQL** (Production): Used when running via Docker or `npm start`.

### Local Development (SQLite)

This is the recommended way to work on the codebase. It uses a local SQLite file (`storage/dev.db`).

1.  **Fork the repository** and clone it locally.
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Run the development server**:
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:3000`.

### Production Simulation (PostgreSQL)

If you need to test the production behavior or database migrations with Postgres:

1.  Use the `install.sh` script to set up the environment and Docker containers:
    ```bash
    ./install.sh
    ```

## Development Workflow

1.  **Install Pre-commit Hooks** (Mandatory):
    This project uses `pre-commit` to ensure code quality before every commit.

    ```bash
    # Install pre-commit (if not already installed)
    # macOS: brew install pre-commit
    # Linux: sudo apt install pre-commit

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
- **No inline styles** allowed (use CSS modules or global CSS).
- **No hardcoded strings** in the UI (use i18n dictionaries).

## License

By contributing, you agree that your contributions will be licensed under the project's **AGPLv3 License**.
