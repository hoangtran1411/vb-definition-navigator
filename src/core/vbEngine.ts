import * as fs from 'fs';
import * as path from 'path';
import {
  PROCEDURE_DECLARATION_DETAILED_REGEX,
  escapeRegex,
  extractDocComments,
  extractSignature,
  isInsideComment,
  isInsideString,
  parseParameters
} from './vbParser';
import { unicodeToVni, vniToUnicode } from '../vniConverter';

export interface VbProcedureInfo {
  name: string;
  kind: string;
  visibility: string;
  isStatic: boolean;
  signature: string;
  parameters: string[];
  docComments: string[];
  filePath: string;
  relativePath: string;
  line: number; // 1-based line number for user/agent readability
  column: number; // 0-based column
}

export interface VbReferenceInfo {
  filePath: string;
  relativePath: string;
  line: number; // 1-based
  column: number; // 0-based
  lineText: string;
  isDeclaration: boolean;
}

export interface CachedFile {
  filePath: string;
  relativePath: string;
  lines: string[];
  rawLower: string;
}

export interface IndexSummary {
  workspaceDir: string;
  fileCount: number;
  symbolCount: number;
  durationMs: number;
}

const SUPPORTED_EXTENSIONS = new Set(['.bas', '.cls', '.frm', '.vb', '.vbs']);
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.vscode',
  'out',
  'dist',
  'bin',
  'obj',
  '.idea'
]);

/**
 * Pure, high-performance in-memory indexing engine for VB/VBA/VB.NET codebases.
 * Zero dependency on VS Code API. Can run anywhere (MCP server, CLI, or test harness).
 */
export class VbEngine {
  private fileCache = new Map<string, CachedFile>();
  private definitions = new Map<string, VbProcedureInfo[]>();
  private fileDeclaredSymbols = new Map<string, Set<string>>();
  private workspaceDir = '';

  public getWorkspaceDir(): string {
    return this.workspaceDir;
  }

  /**
   * Scans and indexes all VB files in the target directory into memory.
   */
  public async indexWorkspace(workspaceDir: string): Promise<IndexSummary> {
    const startTime = Date.now();
    this.workspaceDir = path.resolve(workspaceDir);
    this.fileCache.clear();
    this.definitions.clear();
    this.fileDeclaredSymbols.clear();

    const files = await this.discoverFiles(this.workspaceDir);

    for (const file of files) {
      await this.indexFile(file);
    }

    let symbolCount = 0;
    for (const defs of this.definitions.values()) {
      symbolCount += defs.length;
    }

    return {
      workspaceDir: this.workspaceDir,
      fileCount: this.fileCache.size,
      symbolCount,
      durationMs: Date.now() - startTime
    };
  }

  /**
   * Recursively discovers all VB source files while skipping ignored directories.
   */
  private async discoverFiles(dir: string): Promise<string[]> {
    const results: string[] = [];

    const traverse = async (currentDir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!IGNORED_DIRECTORIES.has(entry.name)) {
            await traverse(path.join(currentDir, entry.name));
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            results.push(path.join(currentDir, entry.name));
          }
        }
      }
    };

    await traverse(dir);
    return results;
  }

  /**
   * Reads and indexes a single file in memory.
   */
  public async indexFile(filePath: string): Promise<void> {
    const resolvedPath = path.resolve(filePath);
    try {
      const content = await fs.promises.readFile(resolvedPath, 'utf8');
      const lines = content.split(/\r?\n/);
      const rawLower = content.toLowerCase();
      const relativePath = this.workspaceDir
        ? path.relative(this.workspaceDir, resolvedPath)
        : path.basename(resolvedPath);

      // Clean old definitions for this file if already indexed
      this.clearFileDeclarations(resolvedPath);

      this.fileCache.set(resolvedPath, {
        filePath: resolvedPath,
        relativePath,
        lines,
        rawLower
      });

      const declaredInThisFile = new Set<string>();

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const match = PROCEDURE_DECLARATION_DETAILED_REGEX.exec(line);
        if (match) {
          const visibility = match[1] || 'Public';
          const isStatic = Boolean(match[2]);
          const kind = match[3];
          const symbolName = match[4];
          const symbolLower = symbolName.toLowerCase();
          const col = line.toLowerCase().indexOf(symbolLower);

          const { signature } = extractSignature(lines, lineIndex);
          const docComments = extractDocComments(lines, lineIndex);
          const parameters = parseParameters(signature);

          const info: VbProcedureInfo = {
            name: symbolName,
            kind,
            visibility,
            isStatic,
            signature,
            parameters,
            docComments,
            filePath: resolvedPath,
            relativePath,
            line: lineIndex + 1, // 1-based line number
            column: col >= 0 ? col : 0
          };

          declaredInThisFile.add(symbolLower);

          const existing = this.definitions.get(symbolLower) || [];
          existing.push(info);
          this.definitions.set(symbolLower, existing);
        }
      }

      this.fileDeclaredSymbols.set(resolvedPath, declaredInThisFile);
    } catch {
      // Ignore unreadable or deleted files
    }
  }

  private clearFileDeclarations(resolvedPath: string): void {
    const symbols = this.fileDeclaredSymbols.get(resolvedPath);
    if (symbols) {
      for (const sym of symbols) {
        const defs = this.definitions.get(sym);
        if (defs) {
          const filtered = defs.filter((d) => d.filePath !== resolvedPath);
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
   * O(1) Instant lookup of procedure definitions by symbol name.
   */
  public getDefinitions(symbolName: string): VbProcedureInfo[] {
    const symbolLower = symbolName.trim().toLowerCase();
    return this.definitions.get(symbolLower) || [];
  }

  /**
   * Fast in-memory search for all usages/references of a symbol across the workspace.
   */
  public findReferences(
    symbolName: string,
    options?: { limit?: number; includeDeclaration?: boolean }
  ): VbReferenceInfo[] {
    const symbolClean = symbolName.trim();
    if (!symbolClean) return [];

    const symbolLower = symbolClean.toLowerCase();
    const escaped = escapeRegex(symbolClean);
    const usageRegex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const limit = options?.limit ?? 100;
    const includeDeclaration = options?.includeDeclaration ?? false;

    // Collect declarations line coordinates to filter them out if needed
    const declMap = new Map<string, Set<number>>();
    if (!includeDeclaration) {
      const defs = this.definitions.get(symbolLower) || [];
      for (const d of defs) {
        let set = declMap.get(d.filePath);
        if (!set) {
          set = new Set<number>();
          declMap.set(d.filePath, set);
        }
        set.add(d.line - 1); // 0-based
      }
    }

    const references: VbReferenceInfo[] = [];

    for (const [filePath, cached] of this.fileCache.entries()) {
      // Substring pre-filter: Skip entire file if substring is absent
      if (!cached.rawLower.includes(symbolLower)) {
        continue;
      }

      const lines = cached.lines;
      const declLines = declMap.get(filePath);

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const isDecl = Boolean(declLines?.has(lineIndex));
        if (isDecl && !includeDeclaration) {
          continue;
        }

        const lineText = lines[lineIndex];
        if (!lineText.toLowerCase().includes(symbolLower)) {
          continue;
        }

        let match: RegExpExecArray | null;
        usageRegex.lastIndex = 0;

        while ((match = usageRegex.exec(lineText)) !== null) {
          const matchCol = match.index;

          if (isInsideComment(lineText, matchCol) || isInsideString(lineText, matchCol)) {
            continue;
          }

          references.push({
            filePath,
            relativePath: cached.relativePath,
            line: lineIndex + 1,
            column: matchCol,
            lineText: lineText.trim(),
            isDeclaration: isDecl
          });

          if (references.length >= limit) {
            return references;
          }
        }
      }
    }

    return references;
  }

  /**
   * Lists symbols in the workspace or within a specific file.
   */
  public listSymbols(filter?: { filePath?: string; query?: string }): VbProcedureInfo[] {
    const results: VbProcedureInfo[] = [];
    const targetFile = filter?.filePath ? path.resolve(filter.filePath) : null;
    const queryLower = filter?.query ? filter.query.trim().toLowerCase() : null;

    for (const defs of this.definitions.values()) {
      for (const def of defs) {
        if (targetFile && def.filePath !== targetFile && def.relativePath !== filter?.filePath) {
          continue;
        }
        if (queryLower && !def.name.toLowerCase().includes(queryLower)) {
          continue;
        }
        results.push(def);
      }
    }

    // Sort by file path then line number
    return results.sort((a, b) => {
      const cmp = a.relativePath.localeCompare(b.relativePath);
      return cmp !== 0 ? cmp : a.line - b.line;
    });
  }

  /**
   * Utility for Access 97 VNI-Windows <-> Unicode UTF-8 bidirectional conversion.
   */
  public convertVni(text: string, direction: 'vni_to_utf8' | 'utf8_to_vni' = 'vni_to_utf8'): string {
    return direction === 'vni_to_utf8' ? vniToUnicode(text) : unicodeToVni(text);
  }
}
