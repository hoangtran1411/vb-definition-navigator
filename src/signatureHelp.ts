import * as vscode from 'vscode';
import { WorkspaceIndexManager } from './indexManager';

/**
 * Provides Parameter Hints when typing procedure calls like `CalculateSalary(` or `DoSomething(a, `
 */
export class VbSignatureHelpProvider implements vscode.SignatureHelpProvider {
  provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.SignatureHelpContext
  ): vscode.SignatureHelp | null {
    const linePrefix = document.lineAt(position.line).text.substring(0, position.character);

    // 1. Analyze text before cursor to find the procedure call and comma count
    const callInfo = this.parseCallContext(linePrefix);
    if (!callInfo) {
      return null;
    }

    const { procName, paramIndex } = callInfo;
    const index = WorkspaceIndexManager.getInstance();
    const defs = index.getDefinitions(procName);

    if (token.isCancellationRequested || defs.length === 0) {
      return null;
    }

    // 2. Fetch procedure declaration from memory cache
    const targetLoc = defs[0];
    const lines = index.getFileLines(targetLoc.uri);
    if (!lines || targetLoc.range.start.line >= lines.length) {
      return null;
    }

    const signatureRaw = lines[targetLoc.range.start.line].trim();

    // 3. Extract parameter list inside parentheses: `(ByVal id As Long, bonus As Currency)`
    const paramMatch = /\(([^)]*)\)/.exec(signatureRaw);
    if (!paramMatch) {
      return null;
    }

    const rawParams = paramMatch[1].trim();
    const paramList = rawParams.length > 0
      ? rawParams.split(',').map((p) => p.trim())
      : [];

    // 4. Construct VS Code SignatureHelp
    const sigHelp = new vscode.SignatureHelp();
    const sigInfo = new vscode.SignatureInformation(signatureRaw);

    sigInfo.parameters = paramList.map((paramStr) => {
      return new vscode.ParameterInformation(paramStr);
    });

    sigHelp.signatures = [sigInfo];
    sigHelp.activeSignature = 0;
    sigHelp.activeParameter = Math.min(paramIndex, Math.max(0, paramList.length - 1));

    return sigHelp;
  }

  /**
   * Scans backwards from cursor to determine active procedure name and parameter index.
   */
  private parseCallContext(text: string): { procName: string; paramIndex: number } | null {
    let parenDepth = 0;
    let inString = false;
    let paramIndex = 0;
    let openParenIndex = -1;

    // Scan backwards from cursor
    for (let i = text.length - 1; i >= 0; i--) {
      const char = text[i];

      if (char === '"') {
        inString = !inString;
      } else if (!inString) {
        if (char === ')') {
          parenDepth++;
        } else if (char === '(') {
          if (parenDepth === 0) {
            openParenIndex = i;
            break;
          }
          parenDepth--;
        } else if (char === ',' && parenDepth === 0) {
          paramIndex++;
        }
      }
    }

    if (openParenIndex === -1) {
      return null;
    }

    // Extract procedure name immediately before the opening parenthesis
    const beforeParen = text.substring(0, openParenIndex).trim();
    const match = /(?:Call\s+)?([a-zA-Z_][a-zA-Z0-9_]*)$/i.exec(beforeParen);

    if (!match) {
      return null;
    }

    return {
      procName: match[1],
      paramIndex
    };
  }
}
