# Contributing to VB Definition & References Navigator

Thank you for your interest in contributing to **VB Definition & References Navigator**! We welcome community contributions, bug reports, feature suggestions, and improvements.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Coding Standards](#coding-standards)
- [Commit Message Guidelines](#commit-message-guidelines)

---

## 🤝 Code of Conduct

Please help maintain a welcoming, respectful, and collaborative environment. Be polite, constructive in code reviews, and considerate of different experience levels.

---

## 🛠️ How Can I Contribute?

### Reporting Bugs

Before filing an issue, please:

1. Search existing issues to ensure the bug has not already been reported.
2. Provide a minimal reproducible example (e.g., a short `.bas` or `.cls` code snippet).
3. Include your VS Code version, OS, and extension version.

### Suggesting Features

Feature requests are welcome! When proposing a new feature:

- Describe the use case and why it benefits developers working with Visual Basic / VBA.
- Provide examples of expected behavior.

### Pull Requests

1. Fork or branch from `main`.
2. Follow the branch naming convention:
   - `feat/feature-name`
   - `fix/bug-fix-name`
   - `docs/documentation-update`
3. Ensure your code compiles cleanly (`npm run compile`).
4. Submit a Pull Request describing your changes.

---

## 💻 Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or higher)
- [VS Code](https://code.visualstudio.com/) (v1.85.0 or higher)
- PowerShell (pwsh) or bash

### Getting Started

1. Clone or open the repository:

   ```pwsh
   git clone <repo-url>
   cd vb-definition-navigator
   ```

2. Install dependencies:

   ```pwsh
   npm install
   ```

3. Build the TypeScript source code:

   ```pwsh
   npm run compile
   ```

4. Launch the Extension Development Host:
   - Press **`F5`** in VS Code.
   - A new Extension Development Host window will open with the extension active.

---

## 🏗️ Project Architecture

```
vb-definition-navigator/
├── src/
│   ├── extension.ts     # Extension entry point, registers providers & commands
│   ├── definition.ts    # VbDefinitionProvider (Go to Definition - F12)
│   ├── codelens.ts      # VbCodeLensProvider (Reference Count above procedures)
│   ├── reference.ts     # VbReferenceProvider (Find All References - Shift+F12)
│   └── utils.ts         # Regex helpers, comment stripping, configuration helpers
├── out/                 # Compiled JavaScript output (generated)
├── package.json         # Extension manifest, language contributions & settings
├── tsconfig.json        # TypeScript compiler configuration
└── CONTRIBUTOR.md       # Contribution guidelines
```

---

## 📏 Coding Standards

- **TypeScript Strict Mode**: Keep code strongly typed without unnecessary `any`.
- **Case-Insensitive Parsing**: Remember that Visual Basic is case-insensitive. Always use the `/i` regex flag or `.toLowerCase()` when matching symbols.
- **Comment-Aware Scanning**: Ensure symbol references do not falsely match identifiers inside comments (`'` or `Rem`) or string literals.
- **Performance**: Avoid synchronous disk I/O. Use VS Code's asynchronous `workspace.findFiles` and `openTextDocument` APIs.

---

## 📝 Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` A new feature (e.g., `feat: add outline breadcrumb support`)
- `fix:` A bug fix (e.g., `fix: handle multiline procedure signatures`)
- `docs:` Documentation changes (e.g., `docs: update troubleshooting section`)
- `refactor:` Code refactoring without changing behavior
- `test:` Adding or updating tests
- `chore:` Tooling, dependency updates, or configuration changes

---

Thank you for helping make VB development in VS Code better! 🚀
