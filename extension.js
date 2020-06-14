const vscode = require('vscode');
const path = require("path");
const SCMProvider = require("./src/SCMProvider");
const utils = require("./common/utils");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	let provider = new SCMProvider();
    let explorer = vscode.window.createTreeView('snippetCMExplorer', { treeDataProvider: provider });
    provider.tree = explorer;
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('snippetCMExplorer', provider),
        vscode.commands.registerCommand('snippetCMExplorer.refresh', provider.refresh.bind(provider)),
        vscode.commands.registerCommand('snippetCMExplorer.addGroup', provider.addGroup.bind(provider)),
        vscode.commands.registerCommand('snippetCMExplorer.addSnippet', provider.addSnippet.bind(provider)),
        vscode.commands.registerCommand('snippetCMExplorer.editGroup', provider.editGroup.bind(provider)),
        vscode.commands.registerCommand('snippetCMExplorer.deleteGroup', provider.deleteGroup.bind(provider)),
        vscode.commands.registerCommand('snippetCMExplorer.deleteSnippet', provider.deleteSnippet.bind(provider)),
        vscode.commands.registerCommand('snippetCMExplorer.editSnippet', provider.editSnippet.bind(provider)),
        vscode.commands.registerCommand('snippetCMExplorer.search',provider.search.bind(provider)),
        vscode.commands.registerCommand('snippetCMExplorer.open', function() {
            explorer.reveal(provider.getChildren()[0]);
        }),
        
        vscode.commands.registerCommand('snippetscodemanagerjs.run', async function() {
            let text = utils.getSelectedText();
            if (!text) return vscode.window.showWarningMessage("can't convert to snippet by select nothing");
            let label = vscode.window.activeTextEditor.document.languageId;
            provider.addSnippet({ label });
		}),		
        vscode.workspace.onDidSaveTextDocument(function(e) {
            if (e.fileName.endsWith('.json') && e.fileName.startsWith(utils.vsCodeSnippetsPath))
                return provider.refresh();
            if (!e.fileName.endsWith('.snippet')) return;
            let name = path.basename(e.fileName, '.snippet');
            let ss = name.split('.');
            if (ss.length != 2) return;
            let key = Buffer.from(ss[0].replace(/-/g, '/'), 'base64').toString();
            let languageId = ss[1];
            provider.saveSnippet(languageId, key, e.getText());
            provider.refresh();
        }),
		
    );
	
}
exports.activate = activate;

function deactivate() {
	utils.clearCaches();
}

module.exports = {
	activate,
	deactivate
}
