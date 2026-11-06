import * as vscode from 'vscode';

/**
 * Regex matching procedure header:
 * Captures:
 * 1: Procedure type ('Sub', 'Function', 'Property Get', etc.)
 * 2: Procedure name
 * 3: Rest of signature (parameters & return type)
 */
const PROCEDURE_HEADER_REGEX =
  /^\s*(?:(?:Public|Private|Friend)\s+)?(?:Static\s+)?(Sub|Function|Property\s+(?:Get|Let|Set))\s+([a-zA-Z0-9_]+)\b(.*)$/i;

const PROCEDURE_END_REGEX = /^\s*End\s+(Sub|Function|Property)\b/i;

export class VbDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      if (token.isCancellationRequested) break;

      const line = document.lineAt(i);
      const match = PROCEDURE_HEADER_REGEX.exec(line.text);

      if (match) {
        const procType = match[1].trim();
        const procName = match[2].trim();
        const signatureRest = match[3].trim();

        // Determine SymbolKind
        let kind = vscode.SymbolKind.Function;
        if (/^Sub/i.test(procType)) {
          kind = vscode.SymbolKind.Method;
        } else if (/^Property/i.test(procType)) {
          kind = vscode.SymbolKind.Property;
        }

        // Selection range (the identifier name)
        const nameCol = line.text.indexOf(procName);
        const selectionRange = new vscode.Range(
          i,
          nameCol >= 0 ? nameCol : 0,
          i,
          (nameCol >= 0 ? nameCol : 0) + procName.length
        );

        // Find the matching End Sub / End Function / End Property
        let endLine = i;
        for (let j = i + 1; j < document.lineCount; j++) {
          const nextLineText = document.lineAt(j).text;
          if (PROCEDURE_END_REGEX.test(nextLineText)) {
            endLine = j;
            break;
          }
          // If we hit another procedure header without End, stop before it
          if (PROCEDURE_HEADER_REGEX.test(nextLineText)) {
            endLine = j - 1;
            break;
          }
        }

        const fullRange = new vscode.Range(
          i,
          0,
          endLine,
          document.lineAt(endLine).text.length
        );

        const detail = `${procType} ${signatureRest}`.trim();

        const docSymbol = new vscode.DocumentSymbol(
          procName,
          detail,
          kind,
          fullRange,
          selectionRange
        );

        symbols.push(docSymbol);

        // Advance line index to the end of procedure
        i = endLine;
      }
    }

    return symbols;
  }
}
