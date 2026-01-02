# Security Policy

## Reporting a Vulnerability

We take the security of Ideon seriously. If you believe you have found a security vulnerability, please report it through the official GitHub repository's security advisories feature.

**Please do not report security vulnerabilities through public GitHub issues.**

To report a vulnerability:

1. Navigate to [https://github.com/3xpyth0n/ideon/security/advisories/new](https://github.com/3xpyth0n/ideon/security/advisories/new)
2. Fill out the report form with as much detail as possible, including steps to reproduce the issue.
3. Our team will review the report and respond accordingly.

## Security Practices

Ideon follows industry-standard security practices, including:

- **Authentication**: Powered by NextAuth v5 with support for OAuth, Credentials, and Magic Links.
- **Data Integrity**: Strict schema validation using Zod for all API requests.
- **Audit Logging**: Tracking of sensitive administrative and security actions.
- **Environment Isolation**: Support for distinct development and production database configurations.
