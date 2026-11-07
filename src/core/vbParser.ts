import { looksLikeVni, vniToUnicode } from '../vniConverter';

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

export const PROCEDURE_DECLARATION_DETAILED_REGEX =
  /^\s*(?:(Public|Private|Friend)\s+)?(?:(Static)\s+)?(Sub|Function|Property\s+(?:Get|Let|Set))\s+([a-zA-Z0-9_]+)\b/i;

/**
 * Escapes special regex characters.
 */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if a character index falls inside a string literal ("...").
 * Handles VB escaped double quotes `""`.
 */
export function isInsideString(lineText: string, matchIndex: number): boolean {
  let inString = false;
  for (let i = 0; i < lineText.length; i++) {
    if (i >= matchIndex) {
      return inString;
    }
    const char = lineText[i];
    if (char === '"') {
      if (inString && i + 1 < lineText.length && lineText[i + 1] === '"') {
        i++; // Skip escaped double quote in VB
        continue;
      }
      inString = !inString;
    }
  }
  return inString;
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
      if (inString && i + 1 < lineText.length && lineText[i + 1] === '"') {
        i++;
        continue;
      }
      inString = !inString;
    } else if (char === '\'' && !inString) {
      // Everything after this unquoted single quote is a comment
      return true;
    }
  }

  // Also check if preceded by 'Rem ' keyword outside string
  if (!inString) {
    const remMatch = /\bRem\s+/i.exec(lineText);
    if (remMatch && remMatch.index < matchIndex && !isInsideString(lineText, remMatch.index)) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves multi-line procedure signatures (handling ' _' line continuations).
 */
export function extractSignature(lines: string[], startLine: number): { signature: string; endLine: number } {
  let signature = (lines[startLine] || '').trim();
  let currentLine = startLine;
  while (signature.endsWith('_') && currentLine + 1 < lines.length) {
    currentLine++;
    const nextLine = (lines[currentLine] || '').trim();
    signature = signature.slice(0, -1).trim() + ' ' + nextLine;
  }
  return { signature, endLine: currentLine };
}

/**
 * Extracts preceding documentation comments (handling `'` and `Rem`, with VNI auto-decoding).
 */
export function extractDocComments(lines: string[], defLineIndex: number): string[] {
  const docComments: string[] = [];
  for (let i = defLineIndex - 1; i >= 0; i--) {
    const lineTrim = (lines[i] || '').trim();
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
  return docComments;
}

/**
 * Extracts parameter list from a procedure signature.
 */
export function parseParameters(signature: string): string[] {
  const paramMatch = /\(([^)]*)\)/.exec(signature);
  if (!paramMatch) {
    return [];
  }
  const rawParams = paramMatch[1].trim();
  if (rawParams.length === 0) {
    return [];
  }
  return rawParams.split(',').map((p) => p.trim());
}
