# VB Definition & References Navigator

A lightweight Visual Studio Code extension providing modern IDE navigation capabilities for **Visual Basic (VB6, VBA, and VB.NET)** files (`.bas`, `.cls`, `.frm`, `.vb`, `.vbs`).

---

## ✨ Features

1. **Go to Definition (`F12`)**:
   - Instantly jumps from any procedure call to its definition (`Sub`, `Function`, or `Property Get/Let/Set`).
   - Prioritizes local definitions in the active file, and searches across workspace modules.

2. **Reference Count CodeLens**:
   - Displays an inline badge directly above each procedure showing the total number of usages (e.g. `3 references`).
   - Clicking the badge opens VS Code's interactive reference peek view.
   - Automatically filters out comments (`'` and `Rem`) so only real call sites are counted.

3. **Find All References (`Shift + F12`)**:
   - Right-click any function or sub name and choose **Find All References** or press `Shift + F12` to inspect all call sites across the entire project.

---

## 🛠️ Supported File Types

- `.bas` — Visual Basic Standard Modules
- `.cls` — Class Modules
- `.frm` — Forms (Code-behind)
- `.vb`  — VB.NET Source Files
- `.vbs` — VBScript Files

---

## ⚙️ Configuration Settings

This extension contributes the following settings:

- `vbDefinitionNavigator.enableCodeLens`: Enable/disable the inline reference count badge (default: `true`).
- `vbDefinitionNavigator.fileGlob`: Glob pattern for workspace VB files to scan (default: `"**/*.{bas,cls,frm,vb,vbs}"`).

---

## 🚀 Development & Testing

1. Open this repository in VS Code:
   ```pwsh
   cd E:\Workspace\Dev\tools\vs-code-extension\vb-definition-navigator
   npm install
   ```

2. Press **`F5`** to launch a new **Extension Development Host** window.

3. Open any folder containing VBA / VB files and test `F12` and CodeLens.

---

## 📦 Packaging to .VSIX

To distribute and install locally:

```pwsh
npm install -g @vscode/vsce
vsce package
code --install-extension vb-definition-navigator-0.1.0.vsix
```
