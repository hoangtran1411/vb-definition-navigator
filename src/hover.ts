import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceIndexManager } from './indexManager';
import { looksLikeVni, vniToUnicode } from './vniConverter';

export class VbHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.Hover | null {
    const lineText = document.lineAt(position.line).text;

    // 1. Check if hovering inside a string literal with VNI encoding
    const strInfo = this.getStringAtPosition(lineText, position.character);
    if (strInfo && looksLikeVni(strInfo.content)) {
      const decoded = vniToUnicode(strInfo.content);
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**🇻🇳 Access 97 VNI Decoded:**\n\n> ${decoded}`);
      const range = new vscode.Range(position.line, strInfo.start, position.line, strInfo.end);
      return new vscode.Hover(md, range);
    }

    // 2. Check if hovering inside a comment with VNI encoding
    const commentInfo = this.getCommentAtPosition(lineText, position.character);
    if (commentInfo && looksLikeVni(commentInfo.content)) {
      const decoded = vniToUnicode(commentInfo.content);
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**🇻🇳 Access 97 VNI Decoded:**\n\n> ${decoded}`);
      const range = new vscode.Range(position.line, commentInfo.start, position.line, commentInfo.end);
      return new vscode.Hover(md, range);
    }

    // 3. Fallback to procedure definition hover
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

    const targetLoc = locations[0];
    const lines = index.getFileLines(targetLoc.uri);
    if (!lines) {
      return null;
    }

    const defLineIndex = targetLoc.range.start.line;
    if (defLineIndex >= lines.length) {
      return null;
    }

    // Extract signature (handling line continuations with ' _')
    let signature = lines[defLineIndex].trim();
    let currentLine = defLineIndex;
    while (signature.endsWith('_') && currentLine + 1 < lines.length) {
      currentLine++;
      const nextLine = lines[currentLine].trim();
      signature = signature.slice(0, -1).trim() + ' ' + nextLine;
    }

    // Extract preceding doc comments (auto-decode if VNI encoded)
    const docComments: string[] = [];
    for (let i = defLineIndex - 1; i >= 0; i--) {
      const lineTrim = lines[i].trim();
      if (lineTrim.startsWith('\'') || /^Rem\b/i.test(lineTrim)) {
        let clean = lineTrim.replace(/^('|\bRem\b)\s*/i, '');
        if (looksLikeVni(clean)) {
          clean = `${vniToUnicode(clean)} *(VNI decoded)*`;
        }
        docComments.unshift(clean);
      } else {
        break;
      }
    }

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendCodeblock(signature, 'vb');

    const fileName = path.basename(targetLoc.uri.fsPath);
    const lineNum = defLineIndex + 1;
    md.appendMarkdown(`*Defined in:* \`${fileName}:${lineNum}\``);

    if (locations.length > 1) {
      md.appendMarkdown(` *(+${locations.length - 1} other definition${locations.length > 2 ? 's' : ''})*`);
    }

    if (docComments.length > 0) {
      md.appendMarkdown('\n\n---\n');
      md.appendMarkdown(docComments.join('\n\n'));
    }

    return new vscode.Hover(md, wordRange);
  }

  /**
   * Identifies if character index sits within a double-quoted string literal.
   */
  private getStringAtPosition(
    line: string,
    col: number
  ): { start: number; end: number; content: string } | null {
    let inString = false;
    let start = -1;

    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        if (!inString) {
          inString = true;
          start = i;
        } else {
          inString = false;
          if (col >= start && col <= i) {
            return {
              start: start + 1,
              end: i,
              content: line.substring(start + 1, i)
            };
          }
        }
      }
    }
    return null;
  }

  /**
   * Identifies if character index sits within a comment.
   */
  private getCommentAtPosition(
    line: string,
    col: number
  ): { start: number; end: number; content: string } | null {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inString = !inString;
      } else if (line[i] === '\'' && !inString) {
        if (col >= i) {
          return {
            start: i + 1,
            end: line.length,
            content: line.substring(i + 1).trim()
          };
        }
        break;
      }
    }
    return null;
  }
}
