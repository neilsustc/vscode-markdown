'use strict';

import * as fs from 'fs';
import * as path from 'path';
import { ExtensionContext, languages, window, workspace } from 'vscode';
import * as completion from './completion';
import * as formatting from './formatting';
import * as listEditing from './listEditing';
import * as preview from './preview';
import * as print from './print';
import * as decorations from './syntaxDecorations';
import * as tableFormatter from './tableFormatter';
import * as toc from './toc';
import { getNewFeatureMsg, showChangelog } from './util';
import localize from './localize';

export function activate(context: ExtensionContext) {
    activateMdExt(context);

    return {
        extendMarkdownIt(md) {
            return md.use(require('markdown-it-task-lists'))
                .use(require('@neilsustc/markdown-it-katex'), { "throwOnError": false });
        }
    }
}

function activateMdExt(context: ExtensionContext) {
    // Override `Enter`, `Tab` and `Backspace` keys
    listEditing.activate(context);
    // Shortcuts
    formatting.activate(context);
    // Toc
    toc.activate(context);
    // Syntax decorations
    decorations.activiate(context);
    // Images paths and math commands completions
    completion.activate(context);
    // Print to PDF
    print.activate(context);
    // Table formatter
    if (workspace.getConfiguration('markdown.extension.tableFormatter').get<boolean>('enabled')) {
        tableFormatter.activate(context);
    }
    // Auto show preview to side
    preview.activate(context);

    // Allow `*` in word pattern for quick styling
    languages.setLanguageConfiguration('markdown', {
        wordPattern: /(-?\d*\.\d\w*)|([^\`\!\@\#\%\^\&\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s\，\。\《\》\？\；\：\‘\“\’\”\（\）\【\】\、]+)/g
    });

    newVersionMessage(context.extensionPath);
}

function newVersionMessage(extensionPath: string) {
    let data, currentVersion;
    try {
        data = fs.readFileSync(`${extensionPath}${path.sep}package.json`).toString();
        currentVersion = JSON.parse(data).version;
        if (fs.existsSync(`${extensionPath}${path.sep}VERSION`) &&
            fs.readFileSync(`${extensionPath}${path.sep}VERSION`).toString() === currentVersion) {
            return;
        }
        fs.writeFileSync(`${extensionPath}${path.sep}VERSION`, currentVersion);
    } catch (error) {
        console.log(error);
        return;
    }
    const featureMsg = getNewFeatureMsg(currentVersion);
    if (featureMsg === undefined) return;
    const message1 = localize("extension.showMe.text");
    const message2 = localize("extension.dismiss.text");
    window.showInformationMessage(featureMsg, message1, message2).then(option => {
        switch (option) {
            case message1:
                showChangelog();
            case message2:
                break;
        }
    });
}

export function deactivate() { }
