import * as vscode from 'vscode';
import { VbDefinitionProvider } from './definition';
import { VbReferenceProvider } from './reference';
import { VbCodeLensProvider } from './codelens';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('VB Definition Navigator');
  outputChannel.appendLine('VB Definition & References Navigator is now active.');

  const selector: vscode.DocumentSelector = [
    { scheme: 'file', language: 'vb' },
    { scheme: 'file', pattern: '**/*.{bas,cls,frm,vb,vbs}' }
  ];

  // 1. Definition Provider (F12)
  const defProvider = new VbDefinitionProvider();
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, defProvider)
  );

  // 2. Reference Provider (Shift+F12)
  const refProvider = new VbReferenceProvider();
  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(selector, refProvider)
  );

  // 3. CodeLens Provider (Usage count)
  const codeLensProvider = new VbCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, codeLensProvider)
  );

  // Refresh CodeLens when a document is saved or config changes
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (vscode.languages.match(selector, doc)) {
        codeLensProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('vbDefinitionNavigator')) {
        codeLensProvider.refresh();
      }
    })
  );

  // 4. Command to manually refresh CodeLens
  context.subscriptions.push(
    vscode.commands.registerCommand('vbDefinitionNavigator.refreshCodeLens', () => {
      codeLensProvider.refresh();
      vscode.window.showInformationMessage('VB CodeLens references refreshed.');
    })
  );
}

export function deactivate() {}
