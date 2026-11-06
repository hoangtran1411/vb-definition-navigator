import * as vscode from 'vscode';
import { PROCEDURE_DECLARATION_REGEX, isCodeLensEnabled } from './utils';
import { WorkspaceIndexManager } from './indexManager';

export class VbCodeLens extends vscode.CodeLens {
  constructor(
    range: vscode.Range,
    public readonly symbolName: string,
    public readonly documentUri: vscode.Uri
  ) {
    super(range);
  }
}

export class VbCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    if (!isCodeLensEnabled()) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      if (token.isCancellationRequested) break;

      const line = document.lineAt(i);
      const match = PROCEDURE_DECLARATION_REGEX.exec(line.text);

      if (match) {
        const symbolName = match[1];
        const col = line.text.toLowerCase().indexOf(symbolName.toLowerCase());
        const range = new vscode.Range(i, col >= 0 ? col : 0, i, (col >= 0 ? col : 0) + symbolName.length);

        codeLenses.push(new VbCodeLens(range, symbolName, document.uri));
      }
    }

    return codeLenses;
  }

  resolveCodeLens(
    codeLens: vscode.CodeLens,
    token: vscode.CancellationToken
  ): vscode.CodeLens {
    if (!(codeLens instanceof VbCodeLens)) {
      return codeLens;
    }

    const { symbolName, documentUri, range } = codeLens;
    const index = WorkspaceIndexManager.getInstance();

    // Fast in-memory reference counting
    const locations = index.findReferences(
      symbolName,
      documentUri,
      range.start.line,
      false // exclude definition line itself
    );

    if (token.isCancellationRequested) {
      return codeLens;
    }

    const count = locations.length;
    const label = count === 1 ? '1 reference' : `${count} references`;

    codeLens.command = {
      title: label,
      tooltip: `Click to view ${count} reference(s) for "${symbolName}"`,
      command: 'editor.action.showReferences',
      arguments: [documentUri, range.start, locations]
    };

    return codeLens;
  }
}
