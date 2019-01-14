'use strict';

// See https://github.com/Microsoft/vscode/tree/master/extensions/markdown/src

import * as fs from "fs";
import * as path from 'path';
import * as vscode from 'vscode';
import localize from './localize';
import { isMdEditor, slugify } from './util';

let md;
let slugCounts = {};

async function initMdIt() {
    // takes ~0.5s

    // Cannot reuse these modules since vscode packs them using webpack
    const hljs = await import('highlight.js');
    const mdtl = await import('markdown-it-task-lists');
    const mdkt = await import('@neilsustc/markdown-it-katex');

    md = (await import('markdown-it'))({
        html: true,
        highlight: (str: string, lang: string) => {
            // Workaround for highlight not supporting tsx: https://github.com/isagalaev/highlight.js/issues/1155
            if (lang && ['tsx', 'typescriptreact'].indexOf(lang.toLocaleLowerCase()) >= 0) {
                lang = 'jsx';
            }
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return `<div>${hljs.highlight(lang, str, true).value}</div>`;
                } catch (error) { }
            }
            return `<div>${md.utils.escapeHtml(str)}</div>`;
        }
    }).use(mdtl).use(mdkt);

    addNamedHeaders(md);
}

// Adapted from <https://github.com/leff/markdown-it-named-headers/blob/master/index.js>
// and <https://github.com/Microsoft/vscode/blob/cadd6586c6656e0c7df3b15ad01c5c4030da5d46/extensions/markdown-language-features/src/markdownEngine.ts#L225>
function addNamedHeaders(md: any): void {
    const originalHeadingOpen = md.renderer.rules.heading_open;

    md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
        const title = tokens[idx + 1].children.reduce((acc: string, t: any) => acc + t.content, '');
        let slug = slugify(title);

        if (slugCounts.hasOwnProperty(slug)) {
            slugCounts[slug] += 1;
            slug += '-' + slugCounts[slug];
        } else {
            slugCounts[slug] = 0;
        }

        tokens[idx].attrs = tokens[idx].attrs || [];
        tokens[idx].attrs.push(['id', slug]);

        if (originalHeadingOpen) {
            return originalHeadingOpen(tokens, idx, options, env, self);
        } else {
            return self.renderToken(tokens, idx, options, env, self);
        }
    };
}

let thisContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
    thisContext = context;
    context.subscriptions.push(vscode.commands.registerCommand('markdown.extension.printToHtml', () => { print('html'); }));
}

export function deactivate() { }

async function print(type: string) {
    const editor = vscode.window.activeTextEditor;

    if (!isMdEditor(editor)) {
        vscode.window.showErrorMessage(localize("noValidMarkdownFile"));
        return;
    }

    const doc = editor.document;
    if (doc.isDirty || doc.isUntitled) {
        doc.save();
    }

    vscode.window.setStatusBarMessage(localize("printing") + ` '${path.basename(doc.fileName)}' ` + localize("to") + ` '${type.toUpperCase()}' ...`, 1000);

    /**
     * Modified from <https://github.com/Microsoft/vscode/tree/master/extensions/markdown>
     * src/previewContentProvider MDDocumentContentProvider provideTextDocumentContent
     */
    let outPath = doc.fileName.replace(/\.\w+?$/, `.${type}`);
    outPath = outPath.replace(/^([cdefghij]):\\/, function (match, p1: string) {
        return `${p1.toUpperCase()}:\\`; // Capitalize drive letter
    });
    if (!outPath.endsWith(`.${type}`)) {
        outPath += `.${type}`;
    }

    let title = doc.getText().split(/\r?\n/g).find(lineText => lineText.startsWith('#'));
    if (title) {
        title = title.replace(/^#+/, '').replace(/#+$/, '').trim();
    }

    let body = await render(doc.getText(), vscode.workspace.getConfiguration('markdown.preview', doc.uri));

    // Image paths
    const config = vscode.workspace.getConfiguration('markdown.extension', doc.uri);

    if (config.get<boolean>("print.imgToBase64")) {
        body = body.replace(/(<img[^>]+src=")([^"]+)("[^>]*>)/g, function (_, p1, p2, p3) { // Match '<img...src="..."...>'
            const imgUri = fixHref(doc.uri, p2);
            try {
                const imgExt = path.extname(imgUri.fsPath).slice(1);
                const file = fs.readFileSync(imgUri.fsPath).toString('base64');
                return `${p1}data:image/${imgExt};base64,${file}${p3}`;
            } catch (e) {
                vscode.window.showWarningMessage(localize("unableToReadFile") + ` ${imgUri.fsPath}, ` + localize("revertingToImagePaths"));
            }
            return `${p1}${imgUri.toString()}${p3}`;
        });
    } else if (config.get<boolean>('print.absoluteImgPath')) {
        body = body.replace(/(<img[^>]+src=")([^"]+)("[^>]*>)/g, function (_, p1, p2, p3) { // Match '<img...src="..."...>'
            const imgUri = fixHref(doc.uri, p2);
            return `${p1}${imgUri.toString()}${p3}`;
        });
    }

    const html = `<!DOCTYPE html>
    <html>
    <head>
        <meta http-equiv="Content-type" content="text/html;charset=UTF-8">
        <title>${title ? title : ''}</title>
        ${getStyles(doc.uri)}
        <script src="https://cdn.jsdelivr.net/npm/katex-copytex@latest/dist/katex-copytex.min.js"></script>
    </head>
    <body>
        ${body}
    </body>
    </html>`;

    switch (type) {
        case 'html':
            fs.writeFile(outPath, html, 'utf-8', function (err) {
                if (err) { console.log(err); }
            });
            break;
        case 'pdf':
            break;
    }
}

async function render(text: string, config: vscode.WorkspaceConfiguration) {
    if (md === undefined) {
        await initMdIt();
    }

    md.set({
        breaks: config.get<boolean>('breaks', false),
        linkify: config.get<boolean>('linkify', true)
    });

    slugCounts = {};

    return md.render(text);
}

function getMediaPath(mediaFile: string): string {
    return thisContext.asAbsolutePath(path.join('media', mediaFile));
}

function wrapWithStyleTag(src: string) {
    const uri = vscode.Uri.parse(src);
    if (uri.scheme.includes('http')) {
        return `<link rel="stylesheet" href="${src}">`;
    } else {
        return `<style>\n${readCss(src)}\n</style>`;
    }
}

function readCss(fileName: string) {
    try {
        return fs.readFileSync(fileName).toString().replace(/\s+/g, ' ');
    } catch (error) {
        let msg = error.message.replace('ENOENT: no such file or directory, open', localize("customStyle")) + localize("notFound");
        msg = msg.replace(/'([c-z]):/, function (match, g1) {
            return `'${g1.toUpperCase()}:`;
        });
        vscode.window.showWarningMessage(msg);
        return '';
    }
}

function getStyles(uri: vscode.Uri) {
    const katexCss = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.10.0/dist/katex.min.css" integrity="sha384-9eLZqc9ds8eNjO3TmqPeYcDj8n+Qfa4nuSiGYa6DjLNcv9BtN69ZIulL9+8CqC9Y" crossorigin="anonymous">';
    const markdownCss = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Microsoft/vscode/extensions/markdown-language-features/media/markdown.css">';
    const highlightCss = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Microsoft/vscode/extensions/markdown-language-features/media/highlight.css">';
    const copyTeXCss = '<link href="https://cdn.jsdelivr.net/npm/katex-copytex@latest/dist/katex-copytex.min.css" rel="stylesheet" type="text/css">';

    const baseCssPaths = ['checkbox.css'].map(s => getMediaPath(s));
    const customCssPaths = getCustomStyleSheets(uri);

    return `${katexCss}
        ${markdownCss}
        ${highlightCss}
        ${copyTeXCss}
        ${baseCssPaths.map(css => wrapWithStyleTag(css)).join('\n')}
        ${getPreviewSettingStyles()}
        ${customCssPaths.map(css => wrapWithStyleTag(css)).join('\n')}`;
}

function getCustomStyleSheets(resource: vscode.Uri): string[] {
    const styles = vscode.workspace.getConfiguration('markdown')['styles'];
    if (styles && Array.isArray(styles) && styles.length > 0) {
        return styles.map(s => {
            const uri = fixHref(resource, s);
            if (uri.scheme === 'file') {
                return uri.fsPath;
            }
            return s;
        });
    }
    return [];
}

function fixHref(resource: vscode.Uri, href: string): vscode.Uri {
    if (!href) {
        return vscode.Uri.file(href);
    }

    // Use href if it is already an URL
    const hrefUri = vscode.Uri.parse(href);
    if (['http', 'https'].indexOf(hrefUri.scheme) >= 0) {
        return hrefUri;
    }

    // Use href as file URI if it is absolute
    if (path.isAbsolute(href) || hrefUri.scheme === 'file') {
        return hrefUri;
    }

    // Otherwise look relative to the markdown file
    return vscode.Uri.file(path.join(path.dirname(resource.fsPath), href));
}

function getPreviewSettingStyles(): string {
    const previewSettings = vscode.workspace.getConfiguration('markdown')['preview'];
    if (!previewSettings) {
        return '';
    }
    const { fontFamily, fontSize, lineHeight } = previewSettings;
    return `<style>
            body {
                ${fontFamily ? `font-family: ${fontFamily};` : ''}
                ${+fontSize > 0 ? `font-size: ${fontSize}px;` : ''}
                ${+lineHeight > 0 ? `line-height: ${lineHeight};` : ''}
            }
        </style>`;
}
