import * as vscode from 'vscode';
import { PROCEDURE_DECLARATION_REGEX, escapeRegex, getWorkspaceFileGlob } from './utils';

export class VbDefinitionProvider implements vscode.DefinitionProvider {
  /**
   * Builds a regex targeting the declaration of a specific procedure name.
   */
  private getSpecificDefRegex(name: string): RegExp {
    const escaped = escapeRegex(name);
    return new RegExp(
      `^\\s*(?:(?:Public|Private|Friend)\\s+)?(?:Static\\s+)?(?:Sub|Function|Property\\s+(?:Get|Let|Set))\\s+(${escaped})\\b`,
      'i'
    );
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Location | vscode.Location[] | null> {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);
    const defRegex = this.getSpecificDefRegex(word);
    const locations: vscode.Location[] = [];

    // 1. Fast path: Search the current active document
    for (let i = 0; i < document.lineCount; i++) {
      if (token.isCancellationRequested) return null;
      const lineText = document.lineAt(i).text;
      const match = defRegex.exec(lineText);
      if (match) {
        const col = lineText.toLowerCase().indexOf(word.toLowerCase());
        locations.push(new vscode.Location(document.uri, new vscode.Position(i, col >= 0 ? col : 0)));
      }
    }

    // If already found locally and it's Private, we don't need to scan the whole workspace
    if (locations.length > 0) {
      const firstLine = document.lineAt(locations[0].range.start.line).text.trim();
      if (/^Private\s+/i.test(firstLine)) {
        return locations.length === 1 ? locations[0] : locations;
      }
    }

    // 2. Scan workspace files
    const fileGlob = getWorkspaceFileGlob();
    const files = await vscode.workspace.findFiles(fileGlob, '**/node_modules/**');

    for (const fileUri of files) {
      if (token.isCancellationRequested) return null;

      // Skip current document since already scanned above
      if (fileUri.toString() === document.uri.toString()) {
        continue;
      }

      const doc = await vscode.workspace.openTextDocument(fileUri);
      for (let i = 0; i < doc.lineCount; i++) {
        const lineText = doc.lineAt(i).text;
        const match = defRegex.exec(lineText);
        if (match) {
          const col = lineText.toLowerCase().indexOf(word.toLowerCase());
          locations.push(new vscode.Location(fileUri, new vscode.Position(i, col >= 0 ? col : 0)));
        }
      }
    }

    if (locations.length === 0) {
      return null;
    }

    return locations.length === 1 ? locations[0] : locations;
  }
}
