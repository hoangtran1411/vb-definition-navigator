import * as vscode from 'vscode';

/**
 * Regex matching VB/VBA procedure declarations:
 * Examples:
 *   Sub DoSomething()
 *   Public Function Calculate(x As Integer) As String
 *   Private Property Get Total() As Currency
 *   Friend Property Let Name(val As String)
 */
export const PROCEDURE_DECLARATION_REGEX =
  /^\s*(?:(?:Public|Private|Friend)\s+)?(?:Static\s+)?(?:Sub|Function|Property\s+(?:Get|Let|Set))\s+([a-zA-Z0-9_]+)\b/i;

/**
 * Escapes special regex characters.
 */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns the file glob pattern configured by the user.
 */
export function getWorkspaceFileGlob(): string {
  const config = vscode.workspace.getConfiguration('vbDefinitionNavigator');
  return config.get<string>('fileGlob', '**/*.{bas,cls,frm,vb,vbs}');
}

/**
 * Returns whether CodeLens is enabled in configuration.
 */
export function isCodeLensEnabled(): boolean {
  const config = vscode.workspace.getConfiguration('vbDefinitionNavigator');
  return config.get<boolean>('enableCodeLens', true);
}

/**
 * Checks if a match at `matchIndex` on `lineText` falls inside a VB comment.
 * In VB/VBA, a comment begins with `'` or `Rem ` (outside of string literals).
 */
export function isInsideComment(lineText: string, matchIndex: number): boolean {
  let inString = false;
  for (let i = 0; i < lineText.length; i++) {
    if (i >= matchIndex) {
      break;
    }
    const char = lineText[i];
    if (char === '"') {
      inString = !inString;
    } else if (char === '\'' && !inString) {
      // Everything after this unquoted single quote is a comment
      return true;
    }
  }
  return false;
}
