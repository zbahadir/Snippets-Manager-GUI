const vscode = require("vscode");
const utils = require("../common/utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

class SCMProvider {
	constructor() {
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
		this.caches = {};
		this.tree;
	}

	getfolderIcon(data) {
		// cerate folder name
		//let folder_name = 'folder_type_'+data.slice(0, -14)+'.svg';
		let folder_name = 'folder_type_'+data.split(".")[0]+'.svg'; // new multi file types

		// check exist forder icon
		let iconwithpath = path.join(__filename, '..', '..', 'resources', 'icons', folder_name );
		// else user default folder icon
		if (!fs.existsSync(iconwithpath)){
			folder_name = 'default_folder.svg';
		}
		return folder_name;
	}

	async getChildren(element) {		
		if (!element) {
			let filenames = fs.readdirSync(utils.vsCodeSnippetsPath);
			return filenames.map(x => ({ // .filter(x => x.endsWith('.code-snippets'))
				//label: x.slice(0, -14),
				label: x.split(".")[0],
				contextValue: 'group',
				collapsibleState: true,
				iconPath: {
					light: path.join(__filename, '..', '..', 'resources', 'icons', this.getfolderIcon(x)),
					dark: path.join(__filename, '..', '..', 'resources', 'icons', this.getfolderIcon(x))
				}
			}));
		}
		if (element.contextValue == 'group') {
			let cache = await this.getSnippets(element.label);
			return cache.list;
		}
		return element ? this.model.getChildren(element) : this.model.roots;
	}

	getTreeItem(element) {
		return element;
	}

	refresh() {	
		this._onDidChangeTreeData.fire();
	}

	// snippet files location
	snippetPath(group) {
		return path.join(utils.vsCodeSnippetsPath, group);
	}
	/**
	 * @param {string} text 
	 */
	text2snippet(text, languageId) {
		let comment = utils.getLineComment(languageId);
		let snippet = {};
		let lines = text.split('\n');
		let body = "";
		for (let i = 0; i < lines.length; i++) {
			if (lines[i] == '/* eslint-disable */') {
				body = lines.slice(i + 1);
				while (body[0] == '') body.shift();
				lines = lines.slice(0, i);
				break;
			}
			if (!lines[i].startsWith(comment)) {
				body = lines.slice(i);
				while (body[0] == '') body.shift();
				lines = lines.slice(0, i);
				break;
			}
		}
		let prev;
		let key;
		for (let line of lines) {
			line = line.slice(comment.length);
			let m = /\s*@\w+\s*/.exec(line);
			if (m) {
				prev = m[0];
				key = prev.trim().slice(1);
				snippet[key] = (snippet[key] || "") + line.slice(prev.length);
			} else if (prev) {
				snippet[key] += '\n' + line.replace(/^\s+/, '');
			}
		}
		snippet.body = body;
		return snippet;
	}

	snippet2text(snippet, languageId) {
		
		let comment = utils.getLineComment(languageId);
		let text = "";	

		for (let k of ["prefix", "description","type"]) {
			if (k == "body") continue;
			let v = snippet[k] || '';
			for (let item of v.split('\n')) {
				text += `${comment} @${k} ${item}\n`;
				if (k[0] != ' ') k = Array.from(k).fill(' ').join();
			}
		}
		if (languageId == 'javascript')
			text += "/* eslint-disable */\n";
		text += "\n";
		if (snippet.body instanceof Array)
			text += snippet.body.join('\n');
		else
			text += snippet.body || '';
		return text;
	}

	/**
	 * 保存代码片段
	 * @param {string} languageId 
	 * @param {string} key 
	 * @param {string} text 
	 */	
	async saveSnippet(languageId, key, text) {

		let filename = await this.getFilePos(languageId);
		let tmpFilename = this.snippetPath(filename);		
		let cache = await this.getSnippets(languageId);
		let snippet = this.text2snippet(text, languageId);

		if (!snippet.prefix)
			return vscode.window.showErrorMessage('@prefix is required');
		if (!snippet.body || !snippet.body.length)
			return vscode.window.showErrorMessage("snippet body can't be empty");
		cache.data[key] = snippet;
		cache.t = +new Date();	

		fs.writeFileSync(tmpFilename, JSON.stringify(cache.data, null, 2), 'utf8');
		vscode.window.showInformationMessage(`snippet "${key}.${languageId}" save success`);		
		this.tree.reveal({ languageId, label: key });
	}

	getParent(e) {
		if (e.languageId) {
			let list = this.getChildren();
			return list.find(x => x.label == e.languageId);
		}
		return null;
	}

	async addGroup() {
		
		// get grup name
		let group = await vscode.window.showInputBox({ placeHolder: 'Snippet Group Name' });
		if (!group) return;

		// get file pos
		let snippetFile = await this.getFilePos(group);
		
		// create file name plaintext.code-snippets as type.code-snippets
		let sf = this.snippetPath(snippetFile);

		// cheeck snippet file exist
		if (!fs.existsSync(sf)) {
			fs.writeFileSync(sf, '{}');
			this.refresh();	
		}
		

		
		// to add snippet 	
		// this.addSnippet(groupName)		
	}

	async editGroup(item) {
		let filename = this.snippetPath(item.label);
		vscode.window.showTextDocument(vscode.Uri.file(filename));
	}
	// DELETE GROUP
	async deleteGroup(group) {

		// get file pos
		let filename = await this.getFilePos(group.label);

		let flag = await vscode.window.showQuickPick(['No', 'Yes'], { placeHolder: `Are you sure? delete snippet "${filename}"` });
		if (flag != "Yes") return;		

		let fname = this.snippetPath(filename);
		fs.unlinkSync(fname);
		this.refresh();
		
	}

	/**
	 * @param {{lable:string}} e 
	 */
	async addSnippet(e, def) {
		// add: label: "Notes", contextValue: "group", collapsibleState: true
		
		let group = e.label;
		let languageId = e.label;
		// get key from user
		let key = await vscode.window.showInputBox({ placeHolder: 'snippet key' });
				
		let languages = await vscode.languages.getLanguages();
		if(languages.indexOf(e.label) === -1){
			languageId = await utils.pickLanguage();			
		} 
		
		this.editSnippet({languageId, key, group}, def);
		this.refresh();

	}


	/**
	 * @param {{key:string,languageId:string}} e 
	 * @param {Snippet} def new snippet template
	 */
	async editSnippet( e, def ) {	 //type, key	
		
		// edit
		//languageId: "Notes", key: "asd"
		if(!e.group) e.group = e.languageId
		
		def = Object.assign({ prefix: e.key, body: "  ", type: e.languageId });
		
		let snippet = await this.getSnippet(e.languageId, e.key);	
		if (!snippet) snippet = def;
		if (!snippet.prefix) snippet.prefix = def.prefix;
		
		let text = this.snippet2text(snippet, e.languageId);
		
		let filename = path.join(os.tmpdir(), Buffer.from(e.key).toString('base64').replace(/\//g, '-') + '.' + e.group + '.snippet'); 
		let content	 

		if (!fs.existsSync(filename))			
			fs.writeFileSync(filename, content = text);
		let editor = await vscode.window.showTextDocument(vscode.Uri.file(filename));			
				
		await vscode.languages.setTextDocumentLanguage(editor.document, snippet.type ); 
		let range = utils.selectAllRange(editor.document);
		if(content==null)
		content = editor.document.getText(range)
		if(content==text) return;
		await editor.edit((eb) => {
			eb.replace(range, text);
		});
		editor.selection = utils.endSelection(editor.document);
				
	}

	async getSnippet(languageId, key) {			
		let cache = await this.getSnippets(languageId);	
		return cache.data[key];		
	}

	async getSnippets(languageId) {
		
		let file = await this.getFilePos(languageId);
		let filename = this.snippetPath(file);	
		
		let stat;
		try {
			stat = fs.statSync(filename);
		} catch (error) {
			return { data: {} };
		}
		
		let cache = this.caches[languageId] || {};
		if (cache && cache.t >= stat.mtime.getTime())
			return cache;		
		
		let text = fs.readFileSync(filename, "utf8");
		let data = new Function('return ' + text)();
		let list = [];
		for (let key in data) {
			let v = data[key];
			let label = key;
			let description = v.description;
			let contextValue = 'snippet';
			let iconPath = {
				light: path.join(__filename, '..', '..', 'resources', 'icons', 'file_type_'+ v.type +'.svg'),
				dark: path.join(__filename, '..', '..', 'resources', 'icons', 'file_type_'+ v.type +'.svg')
			};
			let command = {
				command: 'snippetCMExplorer.editSnippet',
				arguments: [{ languageId, key }],
				title: 'Edit Snippet.'				
			};
			list.push({ label, description, languageId, contextValue, command, iconPath });
		}
		list.sort((a, b) => a.label > b.label ? 1 : -1);
		cache.t = stat.mtime.getTime();
		cache.list = list;
		cache.data = data;		
		return this.caches[languageId] = cache;		
	}

	/**
	 * @param {{label:string,languageId:string}} e 
	 */
	async deleteSnippet(e) {
		let flag = await vscode.window.showQuickPick(['No', 'Yes'], { placeHolder: `Are you sure? delete snippet "${e.label}.${e.languageId}"` });
		if (flag != "Yes") return;
		let cache = await this.getSnippets(e.languageId);
		if (!cache.data[e.label]) return;
		let filename = this.snippetPath(e.languageId);
		delete cache.data[e.label];
		cache.t = +new Date();
		fs.writeFileSync(filename, JSON.stringify(cache.data, null, 2), 'utf8');
		this.refresh();
	}

	async search() {
		
		let languageId = await utils.pickLanguage()
		if(!languageId) return;
		if(!this.caches[languageId])
			await this.getSnippets(languageId)
		if(!this.caches[languageId])
			return vscode.window.showErrorMessage(`no snippet in language: ${languageId}`)
		let list = this.caches[languageId].list
		let item = await vscode.window.showQuickPick(list, { placeHolder: '' });
		let key = item.label;
		this.tree.reveal({ languageId, label: key });
		this.editSnippet({key, languageId})
		
	}

	async getFilePos(group) {
		let languages = await vscode.languages.getLanguages();
        if(languages.indexOf(group) === -1){
			return group + '.code-snippets';
        } else {
			return group + '.json'
		}
	}

}

module.exports = SCMProvider;