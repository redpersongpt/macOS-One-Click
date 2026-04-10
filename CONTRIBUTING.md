# Contributing

Thanks for taking the time to improve OpCore-OneClick.

## Before You Start

- Read the current [README](README.md)
- Search existing issues and pull requests before opening a new one
- Keep changes focused; unrelated cleanup should be a separate pull request

## What We Accept

- Bug fixes
- Stability improvements
- Hardware compatibility fixes backed by evidence
- Clear documentation improvements
- UI improvements that preserve the existing workflow

## What Needs Extra Care

Changes in these areas need especially strong validation:

- Disk flashing or partition logic
- Hardware detection
- OpenCore config generation
- Recovery download and caching
- Anything that changes what files get written to a target drive

If your change touches one of those paths, include a short note about:

- What changed
- What hardware or scenario it targets
- How you validated it

## Local Setup

```bash
npm install
```

Run the app in development:

```bash
npm run dev
npx tauri dev
```

## Verification

Before opening a pull request, run:

```bash
npm run lint
npm test
npm run build
cd src-tauri && cargo test
```

If a command is not relevant to your change, say that in the pull request.

## Pull Request Guidelines

- Explain the problem first, then the fix
- Include screenshots for UI changes
- Include logs or error text for bug fixes when possible
- Do not bundle unrelated refactors into the same PR
- Keep generated files, local build output, and personal notes out of the diff

## Commit Style

There is no strict commit format, but good commits are:

- small enough to review
- specific about the change
- free of unrelated noise

Examples:

- `fix: preserve AMD core count in EFI build profile`
- `docs: add security policy`
- `ui: add target macOS selector to compatibility step`

## Reporting Compatibility Problems

For hardware-specific issues, include as much of this as you can:

- CPU model
- GPU model(s)
- Motherboard or laptop model
- Wi-Fi / Ethernet chipset
- Target macOS version
- What step failed
- Relevant logs or screenshots

## Security Issues

Please do not open public issues for vulnerabilities that could put users or data at risk. Follow [SECURITY.md](SECURITY.md) instead.
