import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceIndexManager } from './indexManager';

export class VbHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.Hover | null {
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

    // Target the first/primary definition
    const targetLoc = locations[0];
    const lines = index.getFileLines(targetLoc.uri);

    if (!lines) {
      return null;
    }

    const defLineIndex = targetLoc.range.start.line;
    if (defLineIndex >= lines.length) {
      return null;
    }

    // 1. Extract full signature (handling VB line continuations with ' _')
    let signature = lines[defLineIndex].trim();
    let currentLine = defLineIndex;
    while (signature.endsWith('_') && currentLine + 1 < lines.length) {
      currentLine++;
      const nextLine = lines[currentLine].trim();
      // Remove trailing underscore and combine
      signature = signature.slice(0, -1).trim() + ' ' + nextLine;
    }

    // 2. Extract preceding documentation comments
    const docComments: string[] = [];
    for (let i = defLineIndex - 1; i >= 0; i--) {
      const lineTrim = lines[i].trim();
      if (lineTrim.startsWith('\'') || /^Rem\b/i.test(lineTrim)) {
        // Strip the comment marker
        let clean = lineTrim.replace(/^('|\bRem\b)\s*/i, '');
        docComments.unshift(clean);
      } else {
        // Stop at the first non-comment line
        break;
      }
    }

    // 3. Format Markdown tooltip
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    // Code block with VB signature
    md.appendCodeblock(signature, 'vb');

    // Location reference
    const fileName = path.basename(targetLoc.uri.fsPath);
    const lineNum = defLineIndex + 1;
    md.appendMarkdown(`*Defined in:* \`${fileName}:${lineNum}\``);

    // If multiple definitions exist (e.g. interfaces/multiple branches)
    if (locations.length > 1) {
      md.appendMarkdown(` *(+${locations.length - 1} other definition${locations.length > 2 ? 's' : ''})*`);
    }

    // Comments / documentation
    if (docComments.length > 0) {
      md.appendMarkdown('\n\n---\n');
      md.appendMarkdown(docComments.join('\n\n'));
    }

    return new vscode.Hover(md, wordRange);
  }
}
