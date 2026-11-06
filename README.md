# VB Definition & References Navigator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue.svg)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)

A lightweight, modern Visual Studio Code extension bringing IDE navigation capabilities—**Go to Definition (`F12`)**, **Reference Count CodeLens**, and **Find All References (`Shift+F12`)**—to Visual Basic (VB6, VBA, Access 97, and VB.NET) projects.

---

## 🎯 Motivation

Developing and maintaining legacy Visual Basic / VBA systems (e.g., Microsoft Access 97 / 2003 `.bas`, `.cls`, `.frm` code-behind) in modern editors often lacks jump-to-definition and reference tracking. This extension restores standard modern IDE navigation, enabling developers to navigate and refactor complex legacy VB codebases effortlessly.

---

## ✨ Features

### 1. Go to Definition (`F12`)

- Place cursor on any procedure or function call and press `F12`.
- Automatically jumps to:
  - `Sub <Name>`
  - `Function <Name>`
  - `Property Get <Name>`, `Property Let <Name>`, `Property Set <Name>`
- Prioritizes definitions in the active file, and seamlessly searches across all workspace modules.

```vb
' Calling code
Call CalculateSalary(empId, bonus)   ' <-- Press F12 here to jump!

' Definition in another module
Public Function CalculateSalary(ByVal id As Long, ByVal bonus As Currency) As Currency
    ...
End Function
```

### 2. Reference Count CodeLens

- Displays an interactive reference count badge directly above every procedure declaration.
- Shows real-time usage across the entire workspace (e.g., `4 references` or `0 references`).
- **Interactive Peek View**: Clicking on the badge displays an interactive preview of all call sites.
- **Comment-Aware**: Intelligently ignores matches inside comments (`'` or `Rem`) and string literals.

```vb
┌────────────────────────────────────────────────────────┐
│  4 references   <-- CodeLens (Click to peek usages)     │
│  Public Sub ExportPayrollData(period As String)        │
│      ...                                               │
│  End Sub                                               │
└────────────────────────────────────────────────────────┘
```

### 3. Find All References (`Shift + F12`)

- Right-click any function or sub identifier and select **Find All References** or press `Shift + F12`.
- Inspect all occurrences grouped by file in the VS Code References pane.

---

## 📂 Supported File Types

| Extension | Description |
|-----------|-------------|
| `.bas`    | Visual Basic Standard Module |
| `.cls`    | Visual Basic Class Module |
| `.frm`    | Visual Basic Form (Code-behind) |
| `.vb`     | VB.NET Source File |
| `.vbs`    | VBScript File |

---

## ⌨️ Keyboard Shortcuts

| Command | Shortcut (Windows/Linux) | Shortcut (macOS) |
| --------- | -------------------------- | ------------------ |
| **Go to Definition** | `F12` | `F12` |
| **Peek Definition** | `Alt + F12` | `⌥ + F12` |
| **Find All References** | `Shift + F12` | `⇧ + F12` |

---

## ⚙️ Extension Settings

This extension contributes the following configurable settings:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `vbDefinitionNavigator.enableCodeLens` | `boolean` | `true` | Toggle display of reference counts above procedure headers. |
| `vbDefinitionNavigator.fileGlob` | `string` | `"**/*.{bas,cls,frm,vb,vbs}"` | File glob pattern specifying which files to scan across the workspace. |

You can customize these in your `settings.json`:

```json
{
  "vbDefinitionNavigator.enableCodeLens": true,
  "vbDefinitionNavigator.fileGlob": "**/*.{bas,cls,frm,vb,vbs}"
}
```

---

## 🚀 Getting Started & Development

### 1. Run in Development Mode

1. Clone or open the project folder in VS Code:

   ```pwsh
   cd E:\Workspace\Dev\tools\vs-code-extension\vb-definition-navigator
   npm install
   ```

2. Press **`F5`** to launch a new **Extension Development Host** window.
3. Open any directory with `.bas`, `.cls`, or `.vb` files to test navigation and CodeLens.

### 2. Package and Install Locally (`.vsix`)

```pwsh
npm install -g @vscode/vsce
vsce package
code --install-extension vb-definition-navigator-0.1.0.vsix
```

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome! Please read our [Contribution Guidelines](./CONTRIBUTING.md) for details on code style, architecture, and the pull request process.

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](./LICENSE) file for full details.
