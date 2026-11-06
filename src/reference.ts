import * as vscode from 'vscode';
import { PROCEDURE_DECLARATION_REGEX, escapeRegex, getWorkspaceFileGlob, isInsideComment } from './utils';

export class VbReferenceProvider implements vscode.ReferenceProvider {
  /**
   * Scans workspace for all references to the specified symbol name.
   */
  public static async findReferences(
    symbolName: string,
    definitionUri: vscode.Uri,
    definitionLine: number,
    includeDeclaration: boolean,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[]> {
    const escaped = escapeRegex(symbolName);
    const usageRegex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const fileGlob = getWorkspaceFileGlob();
    const files = await vscode.workspace.findFiles(fileGlob, '**/node_modules/**');

    const locations: vscode.Location[] = [];

    for (const fileUri of files) {
      if (token.isCancellationRequested) break;

      const doc = await vscode.workspace.openTextDocument(fileUri);
      const isDefFile = fileUri.toString() === definitionUri.toString();

      for (let lineIndex = 0; lineIndex < doc.lineCount; lineIndex++) {
        // If declaration line and we should NOT include declaration, skip it
        if (isDefFile && lineIndex === definitionLine && !includeDeclaration) {
          continue;
        }

        const lineText = doc.lineAt(lineIndex).text;
        let match: RegExpExecArray | null;

        while ((match = usageRegex.exec(lineText)) !== null) {
          const matchCol = match.index;

          // Ignore matches that are inside comments
          if (isInsideComment(lineText, matchCol)) {
            continue;
          }

          // If this is the declaration line and we want declarations, or if it's a regular call site
          locations.push(
            new vscode.Location(
              fileUri,
              new vscode.Range(lineIndex, matchCol, lineIndex, matchCol + symbolName.length)
            )
          );
        }
      }
    }

    return locations;
  }

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

    const references = await VbReferenceProvider.findReferences(
      word,
      document.uri,
      defLine,
      context.includeDeclaration,
      token
    );

    return references.length > 0 ? references : null;
  }
}
