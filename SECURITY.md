# Security Policy

## Supported Versions

Security fixes are applied to the latest release line on `main`.

Older releases may not receive patches.

## Reporting a Vulnerability

If you found a security issue, please report it privately.

Preferred route:

- Open a GitHub Security Advisory draft for this repository

If that is not available, contact the maintainer through GitHub and include:

- a short description of the issue
- affected version or commit
- reproduction steps
- impact
- any suggested mitigation

Please do not post working exploit details in a public issue before the problem has been reviewed.

## What Counts as a Security Issue

Examples include:

- unsafe disk-write paths that can target the wrong device
- token or auth bypass in destructive actions
- remote code execution
- path traversal or arbitrary file write
- shipping secrets or credentials

## Response Expectations

The project is maintained on a best-effort basis, but valid reports will be reviewed as quickly as practical.

When a report is confirmed, the likely path is:

1. reproduce and scope the issue
2. prepare a fix
3. publish the patch
4. credit the reporter if they want public credit
