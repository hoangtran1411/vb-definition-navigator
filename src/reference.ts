import * as vscode from 'vscode';
import { PROCEDURE_DECLARATION_REGEX } from './utils';
import { WorkspaceIndexManager } from './indexManager';

export class VbReferenceProvider implements vscode.ReferenceProvider {
  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[] | null> {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);

    // Check if the current line is a declaration
    const currentLineText = document.lineAt(position.line).text;
    const isDecl = PROCEDURE_DECLARATION_REGEX.test(currentLineText);
    const defLine = isDecl ? position.line : -1;

    const index = WorkspaceIndexManager.getInstance();
    const references = index.findReferences(
      word,
      document.uri,
      defLine,
      context.includeDeclaration
    );

    if (token.isCancellationRequested || references.length === 0) {
      return null;
    }

    return references;
  }
}
