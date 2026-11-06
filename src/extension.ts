import * as vscode from 'vscode';
import { WorkspaceIndexManager } from './indexManager';
import { VbDefinitionProvider } from './definition';
import { VbReferenceProvider } from './reference';
import { VbCodeLensProvider } from './codelens';
import { VbDocumentSymbolProvider } from './outline';
import { VbHoverProvider } from './hover';
import { VbRenameProvider } from './rename';
import { VbSignatureHelpProvider } from './signatureHelp';
import { vniToUnicode, unicodeToVni } from './vniConverter';

export function activate(context: vscode.ExtensionContext) {
  const indexManager = WorkspaceIndexManager.getInstance();

  // 1. Kick off background workspace indexing (non-blocking)
  indexManager.initialize(context);

  const selector: vscode.DocumentSelector = [
    { scheme: 'file', language: 'vb' },
    { scheme: 'file', pattern: '**/*.{bas,cls,frm,vb,vbs}' }
  ];

  // 2. Definition Provider (F12) - now O(1) in-memory lookup
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, new VbDefinitionProvider())
  );

  // 3. Reference Provider (Shift+F12) - fast in-memory search
  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(selector, new VbReferenceProvider())
  );

  // 4. CodeLens Provider - instant reference badges
  const codeLensProvider = new VbCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, codeLensProvider)
  );

  // 5. Document Symbol Provider (Outline & Breadcrumbs)
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, new VbDocumentSymbolProvider())
  );

  // 6. Hover Provider (Signature & Docs Tooltip)
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, new VbHoverProvider())
  );

  // 7. Rename Provider (Safe F2 Rename across workspace)
  context.subscriptions.push(
    vscode.languages.registerRenameProvider(selector, new VbRenameProvider())
  );

  // 8. Signature Help Provider (Parameter Hints)
  context.subscriptions.push(
    vscode.languages.registerSignatureHelpProvider(
      selector,
      new VbSignatureHelpProvider(),
      '(',
      ','
    )
  );

  // 9. Update index when a file is saved
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (vscode.languages.match(selector, doc)) {
        await indexManager.indexFile(doc.uri);
        codeLensProvider.refresh();
      }
    })
  );

  // 10. Manual refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('vbDefinitionNavigator.reindexWorkspace', async () => {
      await indexManager.initialize(context);
      codeLensProvider.refresh();
      vscode.window.showInformationMessage('VB Workspace Index refreshed.');
    })
  );

  // 11. Command: Convert Selection VNI -> Unicode UTF-8
  context.subscriptions.push(
    vscode.commands.registerCommand('vbDefinitionNavigator.convertVniToUnicode', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selections = editor.selections;
      editor.edit((editBuilder) => {
        for (const sel of selections) {
          const text = editor.document.getText(sel);
          if (text) {
            editBuilder.replace(sel, vniToUnicode(text));
          }
        }
      });
    })
  );

  // 12. Command: Convert Selection Unicode UTF-8 -> Access 97 VNI
  context.subscriptions.push(
    vscode.commands.registerCommand('vbDefinitionNavigator.convertUnicodeToVni', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selections = editor.selections;
      editor.edit((editBuilder) => {
        for (const sel of selections) {
          const text = editor.document.getText(sel);
          if (text) {
            editBuilder.replace(sel, unicodeToVni(text));
          }
        }
      });
    })
  );
}

export function deactivate() {}
