import * as vscode from 'vscode';
import { WorkspaceIndexManager } from './indexManager';

export class VbDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.Location | vscode.Location[] | null {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);
    const index = WorkspaceIndexManager.getInstance();

    const locations = index.getDefinitions(word);

    if (token.isCancellationRequested || locations.length === 0) {
      return null;
    }

    // If only one match, return directly; otherwise return all matches
    return locations.length === 1 ? locations[0] : locations;
  }
}
