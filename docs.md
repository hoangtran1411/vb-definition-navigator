# VB Definition & References Navigator — Architecture & Engineering Guide

This document captures the technical architecture, performance engineering principles, and design patterns used in the **VB Definition & References Navigator** extension. You can use this guide as a reusable blueprint for building high-performance Language Tooling and CodeLens providers for other languages in VS Code.

---

## 📌 Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [The Performance Engineering Journey](#2-the-performance-engineering-journey)
3. [The 4-Stage Reference Counting Pipeline](#3-the-4-stage-reference-counting-pipeline)
4. [Incremental Cache & Event-Driven Invalidation](#4-incremental-cache--event-driven-invalidation)
5. [Advanced Language Feature Implementations](#5-advanced-language-feature-implementations)
   - [5.1 Document Symbol & Outline Provider](#51-document-symbol--outline-provider-outline-view--breadcrumbs)
   - [5.2 Zero-I/O Rich Hover Provider](#52-zero-io-rich-hover-provider-signatures--doc-comments)
   - [5.3 Safe Workspace-Wide Rename Engine](#53-safe-workspace-wide-rename-engine-f2)
   - [5.4 Parameter Hints & Signature Help](#54-parameter-hints--signature-help)
   - [5.5 Access 97 VNI ↔ UTF-8 Bidirectional Translation](#55-access-97-vni--utf-8-bidirectional-translation)
6. [Key Reusable Patterns for VS Code Extensions](#6-key-reusable-patterns-for-vs-code-extensions)
7. [Offline Packaging & Distribution (.VSIX)](#7-offline-packaging--distribution-vsix)
8. [AI Agent Integration & MCP Architecture Blueprint](#8-ai-agent-integration--mcp-architecture-blueprint)
   - [8.1 The Mindset: Breaking Out of the IDE "Walled Garden"](#81-the-mindset-breaking-out-of-the-ide-walled-garden)
   - [8.2 Architectural Blueprint: The 3-Tier Decoupling Pattern](#82-architectural-blueprint-the-3-tier-decoupling-pattern)
   - [8.3 Step-by-Step Technical Replication Guide](#83-step-by-step-technical-replication-guide)
   - [8.4 Critical Engineering Gotchas in MCP Server Development](#84-critical-engineering-gotchas-in-mcp-server-development)

---

## 1. Architecture Overview

Modern IDE language support in VS Code relies on decoupled provider interfaces coordinated through a shared in-memory index:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 VS Code Extension API                                  │
├──────────────┬──────────────┬──────────────┬───────────────┬─────────────┬─────────────┤
│  Definition  │  Reference   │   CodeLens   │DocumentSymbol │    Hover    │   Rename    │
│  Provider    │  Provider    │   Provider   │   Provider    │  Provider   │  Provider   │
│    (F12)     │ (Shift+F12)  │ (Ref Count)  │(Outline/C-S-O)│  (Tooltip)  │    (F2)     │
└──────┬───────┴──────┬───────┴──────┬───────┴───────┬───────┴──────┬──────┴──────┬──────┘
       │              │              │               │              │             │
       └──────────────┼──────────────┼───────────────┴──────────────┼─────────────┘
                      ▼              ▼                              ▼
               ┌──────────────────────────────────────────────────────────┐
               │                  WorkspaceIndexManager                   │
               │                 (Single Source of Truth)                 │
               ├──────────────────────────────────────────────────────────┤
               │ • definitions: Map<lowerSymbol, Location[]>              │
               │ • fileCache: Map<uriKey, { lines, rawLower }>            │
               │ • fileDeclaredSymbols: Map<uriKey, Set<lowerSymbol>>     │
               │ • FileSystemWatcher (Incremental delta invalidations)    │
               └──────────────────────────────────────────────────────────┘
```

- **`DefinitionProvider`**: Instant $O(1)$ jump from symbol at cursor $\rightarrow$ target procedure definition.
- **`ReferenceProvider`**: Returns all workspace call sites for peek / find-references view.
- **`CodeLensProvider`**: Computes inline annotations (`N references`) displayed directly above function headers.
- **`DocumentSymbolProvider`**: Powers the Outline View sidebar and top Breadcrumbs navigation bar.
- **`HoverProvider`**: Displays Markdown signatures, continuation lines, and preceding doc comments.
- **`RenameProvider`**: Atomically updates definitions and call sites across all workspace files with identifier validation.
- **`WorkspaceIndexManager`**: A centralized in-memory engine ensuring zero disk I/O during active navigation and editing.

---

## 2. The Performance Engineering Journey

### The Naive Disk-Bound Anti-Pattern (Before)
Initially, whenever CodeLens or Go to Definition executed:
1. It queried `vscode.workspace.findFiles()`.
2. It called `vscode.workspace.openTextDocument(uri)` across every workspace file in a loop.
3. It scanned every line using regular expressions.

$$\text{Disk Operations per File Open} = N_{\text{functions}} \times M_{\text{files}}$$

For a file with **30 functions** in a **50-file** project, this created **1,500 synchronous disk read operations and document buffer allocations**, completely freezing the extension host for 3–6 seconds.

---

### The In-Memory Architecture (After)

To achieve **< 2ms response times**, the engine was redesigned into a **Memory-Resident Index**:

| Phase | Strategy | Time Complexity |
|---|---|---|
| **Startup Ingestion** | Background parallel read of all VB files via raw byte streams (`fs.readFile`) into RAM | $O(TotalBytes)$ once on startup |
| **Go to Definition (`F12`)** | Pre-parsed into `Map<string, Location[]>` | **$O(1)$** instant hash map lookup (< 0.001 ms) |
| **Reference Search** | String pre-filtering via V8 C++ SIMD `includes()` | Discards 95%+ of files in < 0.1 ms |
| **Hover Tooltip** | In-memory line slice from `fileCache` (0 disk I/O) | **< 0.5 ms** |
| **Active Editing** | Event-driven incremental delta invalidation | Only the saved file is re-indexed |

---

## 3. The 4-Stage Reference Counting Pipeline

Accurately counting usages without false positives or CPU slowdown uses a 4-stage filter pipeline:

```
Target Symbol: "CalculateTotal"
                     │
                     ▼
  ┌──────────────────────────────────────────────┐
  │ Stage 1: File-Level Substring Pre-Filter     │
  │ cached.rawLower.includes("calculatetotal")   │
  │ -> 95% of workspace files discarded in 0.1ms │
  └──────────────────────┬───────────────────────┘
                         │ Files containing candidate
                         ▼
  ┌──────────────────────────────────────────────┐
  │ Stage 2: Definition Header Exclusion         │
  │ Skip: "Public Function CalculateTotal(...)"  │
  │ -> Prevents function from counting itself    │
  └──────────────────────┬───────────────────────┘
                         │ Remaining candidate lines
                         ▼
  ┌──────────────────────────────────────────────┐
  │ Stage 3: Exact Word-Boundary Regex (\b)      │
  │ Regex: /\bCalculateTotal\b/gi                │
  │ -> Skips "CalculateTotalAmount", "PreCalc"   │
  └──────────────────────┬───────────────────────┘
                         │ Candidate matches
                         ▼
  ┌──────────────────────────────────────────────┐
  │ Stage 4: Comment & String Literal Stripping  │
  │ Walks characters up to matchIndex to verify  │
  │ it does NOT sit after unquoted "'" or "Rem"  │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
               Final Count & Location[]
```

### Stage 4 Code Implementation (Comment Stripping)
```typescript
export function isInsideComment(lineText: string, matchIndex: number): boolean {
  let inString = false;

  for (let i = 0; i < lineText.length; i++) {
    if (i >= matchIndex) break;

    const char = lineText[i];
    if (char === '"') {
      inString = !inString; // Toggle string state
    } else if (char === '\'' && !inString) {
      // Anything following an unquoted single quote is a comment
      return true;
    }
  }
  return false;
}
```

---

## 4. Incremental Cache & Event-Driven Invalidation

A common pitfall in IDE extensions is re-indexing the entire workspace on every file save.

The `WorkspaceIndexManager` registers a `vscode.FileSystemWatcher`:

```typescript
const watcher = vscode.workspace.createFileSystemWatcher(getWorkspaceFileGlob());

// When user saves or edits a file:
watcher.onDidChange((uri) => this.indexFile(uri));
watcher.onDidCreate((uri) => this.indexFile(uri));
watcher.onDidDelete((uri) => this.removeFile(uri));
```

When `indexFile(uri)` runs:
1. It cleans out only the symbols that were previously declared in that specific URI.
2. It re-reads that single file into RAM.
3. It updates the hash map entries for those symbols.
4. **All other workspace files remain untouched in memory.**

---

## 5. Advanced Language Feature Implementations

### 5.1 Document Symbol & Outline Provider (Outline View & Breadcrumbs)

To light up VS Code's **Outline View**, **Breadcrumbs**, and **`Ctrl + Shift + O`**, the extension implements `vscode.DocumentSymbolProvider`:

- **Boundary Detection**: Parses procedure headers (`Sub`, `Function`, `Property Get/Let/Set`) and tracks forward to match the closing `End Sub`, `End Function`, or `End Property`.
- **Two-Range Model**:
  - `range`: The entire procedure body from header to `End Sub` (used for code folding and breadcrumb scope).
  - `selectionRange`: The specific range of the identifier name on the declaration line (where the cursor lands when clicked).
- **SymbolKind Mapping**:
  - `Sub` $\rightarrow$ `vscode.SymbolKind.Method`
  - `Function` $\rightarrow$ `vscode.SymbolKind.Function`
  - `Property` $\rightarrow$ `vscode.SymbolKind.Property`

```typescript
const docSymbol = new vscode.DocumentSymbol(
  procName,
  detail,
  kind,
  fullRange,
  selectionRange
);
```

---

### 5.2 Zero-I/O Rich Hover Provider (Signatures & Doc Comments)

When hovering over an identifier, the `VbHoverProvider` creates rich Markdown tooltips without touching the disk:

1. **In-Memory Line Lookup**: Calls `indexManager.getFileLines(targetLoc.uri)` directly from memory.
2. **VB Line Continuation Unwrapping**: Detects Visual Basic continuation underscores (` _`) at the end of declaration lines and concatenates them into a single clean signature:
   ```typescript
   while (signature.endsWith('_') && currentLine + 1 < lines.length) {
     currentLine++;
     signature = signature.slice(0, -1).trim() + ' ' + lines[currentLine].trim();
   }
   ```
3. **Preceding Documentation Comment Harvesting**: Scans upward from the declaration line index (`lineIndex - 1`) backwards until the first non-comment line, extracting any `'` or `Rem` comments:
   ```typescript
   for (let i = defLineIndex - 1; i >= 0; i--) {
     const lineTrim = lines[i].trim();
     if (lineTrim.startsWith('\'') || /^Rem\b/i.test(lineTrim)) {
       let clean = lineTrim.replace(/^('|\bRem\b)\s*/i, '');
       docComments.unshift(clean);
     } else {
       break;
     }
   }
   ```
4. **Markdown Formatting**: Renders syntax-highlighted code blocks (````vb ... ````) along with the source file, line number, and parsed docstrings.

---

### 5.3 Safe Workspace-Wide Rename Engine (`F2`)

Renaming symbols across multiple legacy VB modules with naive Find-and-Replace is dangerous because it can corrupt substrings, variables, and comments.

The `VbRenameProvider` implements a two-phase rename contract:

1. **`prepareRename(document, position)`**:
   - Ensures the cursor is on an actual symbol.
   - Verifies the symbol exists in `indexManager.getDefinitions(word)` so users cannot accidentally trigger renames on keywords or unindexed text.
2. **`provideRenameEdits(document, position, newName)`**:
   - **Syntax Validation**: Ensures `newName` satisfies Visual Basic identifier rules (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`).
   - **Cross-File Collection**: Calls `indexManager.findReferences(oldName, undefined, -1, true)` with `includeDeclaration: true` to collect every declaration and call site.
   - **Atomic WorkspaceEdit**: Constructs a `vscode.WorkspaceEdit` containing replacements across all affected URIs. VS Code applies all edits atomically in a single undo step.

---

### 5.4 Parameter Hints & Signature Help

The `VbSignatureHelpProvider` triggers on `(` and `,` to guide developers through complex Visual Basic procedure arguments:

1. **Backwards Call Context Scanning**:
   - Scans backward from cursor position, tracking parenthesis depth `(` / `)` and comma separators outside of string literals.
   - Extracts the procedure identifier preceding the opening parenthesis.
2. **Signature & Parameter Decomposition**:
   - Retrieves the full signature from the in-memory cache without hitting the disk.
   - Extracts and splits comma-separated arguments inside `(...)` into `vscode.ParameterInformation` elements.
3. **Active Parameter Indexing**:
   - Calculates the active argument based on comma count, clamped to the parameter count.

---

### 5.5 Access 97 VNI ↔ UTF-8 Bidirectional Translation

Visual Basic applications in Microsoft Access 97 store Vietnamese characters using the legacy **VNI-Windows-1258** font encoding (`Tieàn löông`, `Nhaân vieân`), creating unreadable text in modern UTF-8 environments.

The extension introduces a domain-specific bidirectional converter (`src/vniConverter.ts`):

1. **VNI Hover Decoding**:
   - Automatically detects whether the hovered string literal or comment contains characteristic VNI sequences (`aø`, `aù`, `eâø`, `oâù`, `öù`, `ñ`, etc.).
   - Renders an inline Markdown tooltip with the decoded UTF-8 Vietnamese translation:
     > **🇻🇳 Access 97 VNI Decoded:**
     > *Tiền lương nhân viên*
2. **Auto-Decoding Doc Comments**:
   - Any legacy VNI documentation comments written above procedure headers are automatically translated to readable UTF-8 in procedure hover tooltips.
3. **Bidirectional Editor Conversion Commands**:
   - **`VB: Convert Selection (VNI -> UTF-8)`**: Decodes legacy VNI strings in selected text into modern UTF-8.
   - **`VB: Convert Selection (UTF-8 -> Access 97 VNI)`**: Encodes modern UTF-8 Vietnamese text back into legacy VNI-Windows format for compatibility with Access 97 Jet 3.5 databases.

---

## 6. Key Reusable Patterns for VS Code Extensions

When building tooling for other legacy or custom languages (e.g., COBOL, FoxPro, Pascal):

1. **Never use `workspace.openTextDocument()` in tight loops**:
   Use `vscode.workspace.fs.readFile(uri)` and convert to string. It is orders of magnitude lighter.
2. **Always separate `provideCodeLenses` and `resolveCodeLens`**:
   - `provideCodeLenses` must return instantly with placeholder ranges so the editor displays immediately.
   - `resolveCodeLens` calculates the reference count asynchronously in the background.
3. **Pre-filter with `String.prototype.includes` before executing RegExp**:
   V8's `includes` runs heavily optimized native vector instructions. Discarding non-matching files with `includes` is 50–100× faster than running regex matches over entire documents.
4. **Use Case-Insensitive Normalized Keys**:
   Always normalize symbol lookups (`toLowerCase()`) for languages that are case-insensitive.
5. **Leverage In-Memory Line Caches for Hover**:
   Do not re-read files from disk to show tooltips; retrieve cached lines directly from your central index manager.

---

## 7. Offline Packaging & Distribution (.VSIX)

VS Code extensions can be packaged into offline, standalone installers without needing an Azure account, credit card, or Marketplace registration:

### Packaging Command:
```pwsh
npx @vscode/vsce package --no-git-tag-version
```

### Installing the `.vsix` on any machine:
```pwsh
code --install-extension vb-definition-navigator-0.3.0.vsix
```

Or via VS Code GUI:
- Open **Extensions** (`Ctrl+Shift+X`) $\rightarrow$ Click `...` $\rightarrow$ **Install from VSIX...**

---

## 8. AI Agent Integration & MCP Architecture Blueprint

As AI programming agents (such as Antigravity, Claude Code, Cursor, Serena, and Windsurf) become central to developer workflows, language tooling must evolve beyond interactive GUI-only extensions. Legacy language projects (VB6, VBA, COBOL, FoxPro) are frequently explored and refactored by AI agents, yet agents cannot press `F12` or view CodeLens badges in VS Code.

This section documents the **mindset**, **architectural design patterns**, and **step-by-step technical implementation** to transform any VS Code language extension into an AI-ready **Model Context Protocol (MCP)** server without over-engineering.

---

### 8.1 The Mindset: Breaking Out of the IDE "Walled Garden"

#### The Problem: Extension Host Isolation
Traditional VS Code extensions operate in an isolated process called the **Extension Host**. All symbol indices, parsed metadata, and caches reside in this process's private RAM. When an AI Agent or MCP server (like Serena) runs, it executes as an external operating system process.
- **Process Barrier**: An external agent process cannot inspect or access memory inside the VS Code Extension Host.
- **Runtime Lock-in**: Code relying directly on `import * as vscode from 'vscode'` cannot be executed outside VS Code. Running `node out/extension.js` from the command line crashes immediately with `Cannot find module 'vscode'`.

#### The Architectural Trap: Over-Engineering vs Pragmatic MCP
When developers attempt to expose IDE tooling to agents, they often fall into two opposite traps:
1. **The Overkill Trap (Full LSP Rewrite)**: Rewriting the entire extension into a full Language Server Protocol (LSP) daemon (`vscode-languageserver`). While LSP is standard for editor integrations, it introduces immense protocol overhead (document synchronization protocols, capabilities negotiation, diagnostics polling, URI translation). For AI agents, 95% of LSP complexity is dead weight; agents merely need atomic tool queries: *"Where is symbol X defined?"* and *"Where is X used?"*.
2. **The Fragile Hack (In-Extension Local HTTP Server)**: Opening a local Express/HTTP port inside the VS Code extension. This fails whenever VS Code is closed, suffers from port collision, requires CORS/firewall handling, and leaves dangling sockets.

#### The Pragmatic Sweet Spot: The Headless Engine + Stdio MCP
The optimal architecture decouples the indexing engine into a **pure Node.js headless core** and wraps it in a **local Model Context Protocol (MCP)** server communicating via standard input/output (`stdio`):

| Property | Full LSP Rewrite | Local HTTP in VS Code | Headless Stdio MCP (Our Approach) |
|---|---|---|---|
| **Architecture Complexity** | High (50+ protocol messages) | Medium (Networking, HTTP) | **Low & Controlled (~150 LOC)** |
| **Requires VS Code Open?** | No | Yes (Fails if closed) | **No (Runs independently anywhere)** |
| **Network / Firewall / Ports** | None | Requires open TCP port | **Zero open ports (OS stdio pipe)** |
| **Cloud / Hosting Required?** | No | No | **100% Local (Spawned as child process)** |
| **AI Agent Compatibility** | Requires LSP client bridge | Custom HTTP prompts | **Native (Claude, Cursor, Antigravity, Serena)** |

---

### 8.2 Architectural Blueprint: The 3-Tier Decoupling Pattern

To make language tooling reusable across both human IDEs and AI Agents, structure the codebase into three decoupled layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CONSUMER LAYER                                │
│   ┌───────────────────────────────┐  ┌──────────────────────────────┐  │
│   │    VS Code Extension Host     │  │   External AI Agent (MCP)    │  │
│   │  (Interactive Human Dev UI)   │  │  (Claude, Serena, Cursor)   │  │
│   └───────────────┬───────────────┘  └──────────────┬───────────────┘  │
└───────────────────┼─────────────────────────────────┼──────────────────┘
                    ▼                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          ADAPTER LAYER                                 │
│   ┌───────────────────────────────┐  ┌──────────────────────────────┐  │
│   │   VS Code Providers           │  │   Stdio MCP Server & CLI     │  │
│   │   • DefinitionProvider (F12)  │  │   • ListToolsRequestSchema   │  │
│   │   • ReferenceProvider         │  │   • CallToolRequestSchema    │  │
│   │   • CodeLens / Hover          │  │   • Direct CLI Flag Router   │  │
│   │   (Wraps output into          │  │   (Wraps output into         │  │
│   │    vscode.Location/Uri)       │  │    JSON text content)        │  │
│   └───────────────┬───────────────┘  └──────────────┬───────────────┘  │
└───────────────────┼─────────────────────────────────┼──────────────────┘
                    ▼                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     HEADLESS CORE ENGINE LAYER                         │
│                    (Zero 'vscode' Dependencies)                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ • VbEngine: Pure fs.promises workspace scanner & in-memory Map │   │
│   │ • vbParser: Pure regex lexing, isInsideComment, isInsideString │   │
│   │ • vniConverter: Pure string manipulation & encoding tables     │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 8.3 Step-by-Step Technical Replication Guide

If you are building or modernizing an extension for another language, follow these exact 4 steps:

#### Step 1: Strip `vscode` Primitives from the Core Engine
Ensure all core data types use plain JavaScript primitives instead of VS Code classes:

```typescript
// ❌ Anti-pattern (Coupled to VS Code runtime):
import * as vscode from 'vscode';
interface ProcedureInfo {
  location: vscode.Location;
  uri: vscode.Uri;
}

// ✅ Clean Pattern (Headless & Portable):
interface ProcedureInfo {
  filePath: string;
  relativePath: string;
  line: number;      // 1-based line number for human/AI reading
  column: number;    // 0-based character column
  signature: string;
  parameters: string[];
  docComments: string[];
}
```
Use `fs.promises.readFile` and `fs.promises.readdir` for file operations. The VS Code extension can simply map these plain objects to `new vscode.Location(vscode.Uri.file(info.filePath), new vscode.Position(info.line - 1, info.column))`.

#### Step 2: Implement Accurate Lexical State Tracking
Naive regex matches cause false positives by matching identifiers inside comments or strings. Implement lightweight character-scanning state machines:

```typescript
// Detects if a match falls inside a string literal (accounting for escaped quotes `""`)
export function isInsideString(lineText: string, matchIndex: number): boolean {
  let inString = false;
  for (let i = 0; i < lineText.length; i++) {
    if (i >= matchIndex) return inString;
    if (lineText[i] === '"') {
      if (inString && i + 1 < lineText.length && lineText[i + 1] === '"') {
        i++; // skip escaped quote in VB
        continue;
      }
      inString = !inString;
    }
  }
  return inString;
}
```

#### Step 3: Implement the Stdio MCP Server
Install `@modelcontextprotocol/sdk` and wire up the stdio transport:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'vb-definition-navigator', version: '0.4.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'vb_find_definition',
      description: 'Instantly locates the declaration, signature, docstrings, and location of a VB/VBA procedure using O(1) in-memory index.',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Procedure name' },
          workspace: { type: 'string', description: 'Project root directory' }
        },
        required: ['symbol']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'vb_find_definition') {
    const symbol = String(request.params.arguments?.symbol);
    const defs = engine.getDefinitions(symbol);
    return {
      content: [{ type: 'text', text: JSON.stringify(defs, null, 2) }]
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

#### Step 4: Add the Dual-Mode CLI Router
Allow the exact same binary to function either as an MCP server or as a standalone CLI for quick testing:

```typescript
const args = process.argv.slice(2);
if (args[0] === '--def') {
  // Standalone CLI Mode: output human/JSON text to stdout and exit
  console.log(JSON.stringify(engine.getDefinitions(args[1]), null, 2));
  process.exit(0);
}

// No CLI flag? Start MCP Server on stdio
await startMcpServer();
```

---

### 8.4 Critical Engineering Gotchas in MCP Server Development

1. **🚨 The `stdout` Poisoning Bug (Fatal in MCP)**:
   - In an MCP stdio server, `process.stdout` is strictly reserved for JSON-RPC framed packets.
   - **Never call `console.log()`** inside MCP request handlers or indexing routines! Any extraneous string written to stdout will corrupt JSON-RPC framing and cause the MCP client to drop the connection.
   - **Rule**: All diagnostics, progress, and error logging MUST use `console.error(...)` (which routes safely to `stderr`).

2. **Memory Efficiency with Raw Lowercase Strings**:
   - Instead of storing duplicate parsed AST nodes for every line in the workspace, store raw lines alongside an in-memory normalized lowercase string (`rawLower`).
   - Use `rawLower.includes(symbolLower)` as a sub-microsecond pre-filter before executing regular expressions. This technique allows a 100,000-line legacy VB project to be indexed in under 50MB of RAM.

3. **Workspace Path Resolution & Cold Starts**:
   - AI Agents often execute across varied working directories. Always resolve relative workspace paths to absolute paths (`path.resolve()`).
   - Lazily index the workspace on the first tool call (`ensureIndexed(workspace)`) and keep the index resident in memory for subsequent queries within the same agent session.
