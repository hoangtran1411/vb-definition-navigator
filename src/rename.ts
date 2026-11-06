import * as vscode from 'vscode';
import { WorkspaceIndexManager } from './indexManager';

const VB_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class VbRenameProvider implements vscode.RenameProvider {
  prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string }> {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return Promise.reject(new Error('Cannot rename this element: no symbol selected.'));
    }

    const word = document.getText(wordRange);
    const index = WorkspaceIndexManager.getInstance();
    const defs = index.getDefinitions(word);

    // Allow rename if the symbol is a known procedure or function
    if (defs.length === 0) {
      return Promise.reject(
        new Error(`Cannot rename "${word}": procedure definition not found in workspace.`)
      );
    }

    return {
      range: wordRange,
      placeholder: word
    };
  }

  provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.WorkspaceEdit> {
    const trimmedNewName = newName.trim();

    // 1. Validate new identifier
    if (!VB_IDENTIFIER_REGEX.test(trimmedNewName)) {
      return Promise.reject(
        new Error(
          `"${trimmedNewName}" is not a valid Visual Basic identifier. Names must start with a letter or underscore and contain only alphanumeric characters.`
        )
      );
    }

    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    const oldName = document.getText(wordRange);
    const index = WorkspaceIndexManager.getInstance();

    // 2. Find all occurrences including declarations across workspace
    const locations = index.findReferences(
      oldName,
      undefined,
      -1,
      true // include declarations
    );

    if (token.isCancellationRequested || locations.length === 0) {
      return null;
    }

    // 3. Construct atomic WorkspaceEdit
    const workspaceEdit = new vscode.WorkspaceEdit();

    for (const loc of locations) {
      workspaceEdit.replace(loc.uri, loc.range, trimmedNewName);
    }

    return workspaceEdit;
  }
}
