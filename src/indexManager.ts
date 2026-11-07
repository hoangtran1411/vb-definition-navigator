import * as vscode from 'vscode';
import { PROCEDURE_DECLARATION_REGEX, escapeRegex, getWorkspaceFileGlob, isInsideComment, isInsideString } from './utils';

export interface CachedFile {
  uri: vscode.Uri;
  lines: string[];
  rawLower: string;
}

/**
 * High-performance In-Memory Symbol & Text Index.
 * Replaces disk I/O on every request with sub-millisecond in-memory lookups.
 */
export class WorkspaceIndexManager {
  private static instance: WorkspaceIndexManager;

  // Map<lowerSymbolName, Location[]>
  private definitions = new Map<string, vscode.Location[]>();

  // Map<uriString, CachedFile>
  private fileCache = new Map<string, CachedFile>();

  // Map<uriString, Set<lowerSymbolName>> (track which symbols are declared in which file)
  private fileDeclaredSymbols = new Map<string, Set<string>>();

  private isInitialized = false;
  private statusBarItem: vscode.StatusBarItem;

  private constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.text = '$(sync~spin) VB Indexing...';
  }

  public static getInstance(): WorkspaceIndexManager {
    if (!WorkspaceIndexManager.instance) {
      WorkspaceIndexManager.instance = new WorkspaceIndexManager();
    }
    return WorkspaceIndexManager.instance;
  }

  /**
   * Initializes workspace index in the background without blocking the UI.
   */
  public async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.statusBarItem.show();

    try {
      const glob = getWorkspaceFileGlob();
      const files = await vscode.workspace.findFiles(glob, '**/node_modules/**');

      // Batch process files to avoid I/O bottlenecks
      const BATCH_SIZE = 30;
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map((file) => this.indexFile(file)));
      }

      this.isInitialized = true;
      this.statusBarItem.text = `$(check) VB Indexed (${this.fileCache.size} files)`;
      setTimeout(() => this.statusBarItem.hide(), 3000);
    } catch (err) {
      this.statusBarItem.text = '$(error) VB Index Error';
      console.error('VB Indexing error:', err);
    }

    // Watch for file changes across workspace
    this.setupFileWatcher(context);
  }

  private setupFileWatcher(context: vscode.ExtensionContext): void {
    const watcher = vscode.workspace.createFileSystemWatcher(getWorkspaceFileGlob());

    watcher.onDidChange((uri) => this.indexFile(uri));
    watcher.onDidCreate((uri) => this.indexFile(uri));
    watcher.onDidDelete((uri) => this.removeFile(uri));

    context.subscriptions.push(watcher, this.statusBarItem);
  }

  /**
   * Reads and indexes a single file in memory.
   */
  public async indexFile(uri: vscode.Uri): Promise<void> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = new TextDecoder('utf-8').decode(bytes);
      const lines = content.split(/\r?\n/);
      const rawLower = content.toLowerCase();

      const uriKey = uri.toString();

      // Clean old definitions for this file
      this.clearFileDeclarations(uriKey);

      // Cache file text in memory
      this.fileCache.set(uriKey, { uri, lines, rawLower });

      const declaredInThisFile = new Set<string>();

      // Extract all procedure declarations
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const match = PROCEDURE_DECLARATION_REGEX.exec(line);
        if (match) {
          const symbolName = match[1];
          const symbolLower = symbolName.toLowerCase();
          const col = line.toLowerCase().indexOf(symbolLower);
          const location = new vscode.Location(
            uri,
            new vscode.Position(lineIndex, col >= 0 ? col : 0)
          );

          declaredInThisFile.add(symbolLower);

          const existing = this.definitions.get(symbolLower) || [];
          existing.push(location);
          this.definitions.set(symbolLower, existing);
        }
      }

      this.fileDeclaredSymbols.set(uriKey, declaredInThisFile);
    } catch {
      // Ignore unreadable or deleted files
    }
  }

  /**
   * Removes a deleted file from memory caches.
   */
  public removeFile(uri: vscode.Uri): void {
    const uriKey = uri.toString();
    this.clearFileDeclarations(uriKey);
    this.fileCache.delete(uriKey);
    this.fileDeclaredSymbols.delete(uriKey);
  }

  private clearFileDeclarations(uriKey: string): void {
    const symbols = this.fileDeclaredSymbols.get(uriKey);
    if (symbols) {
      for (const sym of symbols) {
        const locs = this.definitions.get(sym);
        if (locs) {
          const filtered = locs.filter((loc) => loc.uri.toString() !== uriKey);
          if (filtered.length > 0) {
            this.definitions.set(sym, filtered);
          } else {
            this.definitions.delete(sym);
          }
        }
      }
    }
  }

  /**
   * Returns cached lines for a given file URI without touching disk.
   */
  public getFileLines(uri: vscode.Uri): string[] | undefined {
    return this.fileCache.get(uri.toString())?.lines;
  }

  /**
   * O(1) Instant Go to Definition from memory.
   */
  public getDefinitions(symbolName: string): vscode.Location[] {
    const symbolLower = symbolName.toLowerCase();
    return this.definitions.get(symbolLower) || [];
  }

  /**
   * Ultra-fast references lookup using in-memory string search with .includes() pre-filter.
   */
  public findReferences(
    symbolName: string,
    definitionUri?: vscode.Uri,
    definitionLine = -1,
    includeDeclaration = false
  ): vscode.Location[] {
    const symbolLower = symbolName.toLowerCase();
    const escaped = escapeRegex(symbolName);
    const usageRegex = new RegExp(`\\b${escaped}\\b`, 'gi');

    const defUriStr = definitionUri ? definitionUri.toString() : '';
    const locations: vscode.Location[] = [];

    for (const [uriKey, cached] of this.fileCache.entries()) {
      // Lightning-fast pre-filter: If whole file doesn't have the substring, skip completely!
      if (!cached.rawLower.includes(symbolLower)) {
        continue;
      }

      const isDefFile = uriKey === defUriStr;
      const lines = cached.lines;

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        // Skip definition header line if includeDeclaration is false
        if (isDefFile && lineIndex === definitionLine && !includeDeclaration) {
          continue;
        }

        const lineText = lines[lineIndex];

        // Skip line if it doesn't contain the substring
        if (!lineText.toLowerCase().includes(symbolLower)) {
          continue;
        }

        let match: RegExpExecArray | null;
        usageRegex.lastIndex = 0; // Reset regex state

        while ((match = usageRegex.exec(lineText)) !== null) {
          const matchCol = match.index;

          if (isInsideComment(lineText, matchCol) || isInsideString(lineText, matchCol)) {
            continue;
          }

          locations.push(
            new vscode.Location(
              cached.uri,
              new vscode.Range(lineIndex, matchCol, lineIndex, matchCol + symbolName.length)
            )
          );
        }
      }
    }

    return locations;
  }
}
