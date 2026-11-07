import * as vscode from 'vscode';

export {
  PROCEDURE_DECLARATION_REGEX,
  PROCEDURE_DECLARATION_DETAILED_REGEX,
  escapeRegex,
  isInsideComment,
  isInsideString,
  extractSignature,
  extractDocComments,
  parseParameters
} from './core/vbParser';

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
