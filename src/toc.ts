'use strict';

import * as path from 'path';
import * as stringSimilarity from 'string-similarity';
import { CancellationToken, CodeLens, CodeLensProvider, commands, EndOfLine, ExtensionContext, languages, Range, TextDocument, TextDocumentWillSaveEvent, TextEditor, window, workspace, WorkspaceEdit } from 'vscode';
import { isInFencedCodeBlock, isMdEditor, mdDocSelector, REGEX_FENCED_CODE_BLOCK, slugify } from './util';

/**
 * Represents a heading.
 */
interface IHeading {
    level: number;
    text: string;
    lineNum: number;
}

/**
 * Workspace config
 */
const docConfig = { tab: '  ', eol: '\r\n' };
const tocConfig = { startDepth: 1, endDepth: 6, listMarker: '-', orderedList: false, updateOnSave: false, plaintext: false, tabSize: 2 };

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        commands.registerCommand('markdown.extension.toc.create', createToc),
        commands.registerCommand('markdown.extension.toc.update', updateToc),
        commands.registerCommand('markdown.extension.toc.addSecNumbers', addSectionNumbers),
        commands.registerCommand('markdown.extension.toc.removeSecNumbers', removeSectionNumbers),
        workspace.onWillSaveTextDocument(onWillSave),
        languages.registerCodeLensProvider(mdDocSelector, new TocCodeLensProvider())
    );
}

async function createToc() {
    const editor = window.activeTextEditor;

    if (!(editor && isMdEditor(editor))) {
        return;
    }

    loadTocConfig(editor);

    let toc = await generateTocText(editor.document);
    await editor.edit(function (editBuilder) {
        editBuilder.delete(editor.selection);
        editBuilder.insert(editor.selection.active, toc);
    });
}

async function updateToc() {
    const editor = window.activeTextEditor;

    if (!(editor && isMdEditor(editor))) {
        return;
    }

    loadTocConfig(editor);

    const doc = editor.document;
    const tocRangesAndText = await detectTocRanges(doc);
    const tocRanges = tocRangesAndText[0];
    const newToc = tocRangesAndText[1];

    await editor.edit(editBuilder => {
        for (const tocRange of tocRanges) {
            if (tocRange !== null) {
                const oldToc = doc.getText(tocRange).replace(/\r?\n|\r/g, docConfig.eol);
                if (oldToc !== newToc) {
                    const unchangedLength = commonPrefixLength(oldToc, newToc);
                    const newStart = doc.positionAt(doc.offsetAt(tocRange.start) + unchangedLength);
                    const replaceRange = tocRange.with(newStart);
                    if (replaceRange.isEmpty) {
                        editBuilder.insert(replaceRange.start, newToc.substring(unchangedLength));
                    } else {
                        editBuilder.replace(replaceRange, newToc.substring(unchangedLength));
                    }
                }
            }
        }
    });
}

function addSectionNumbers() {
    const editor = window.activeTextEditor;

    if (!(editor && isMdEditor(editor))) {
        return;
    }

    loadTocConfig(editor);

    const doc = editor.document;
    const toc = buildToc(doc);
    if (toc === null || toc === undefined || toc.length < 1) return;
    const startDepth = Math.max(tocConfig.startDepth, Math.min(...toc.map(h => h.level)));

    let secNumbers = [0, 0, 0, 0, 0, 0];
    let edit = new WorkspaceEdit();
    toc.forEach(entry => {
        const level = entry.level;
        const lineNum = entry.lineNum;

        if (level < startDepth) return;

        secNumbers[level - 1] += 1;
        secNumbers.fill(0, level);
        const secNumStr = [...Array(level - startDepth + 1).keys()].map(num => `${secNumbers[num + startDepth - 1]}.`).join('');

        const lineText = doc.lineAt(lineNum).text;
        const newText = lineText.includes('#')
            ? lineText.replace(/^(\s{0,3}#+ +)((?:\d{1,9}\.)* )?(.*)/, (_, g1, _g2, g3) => `${g1}${secNumStr} ${g3}`)
            : lineText.replace(/^(\s{0,3})((?:\d{1,9}\.)* )?(.*)/, (_, g1, _g2, g3) => `${g1}${secNumStr} ${g3}`);
        edit.replace(doc.uri, doc.lineAt(lineNum).range, newText);
    });

    return workspace.applyEdit(edit);
}

function removeSectionNumbers() {
    const editor = window.activeTextEditor;
    if (!(editor && isMdEditor(editor))) {
        return;
    }
    const doc = editor.document;
    const toc = buildToc(editor.document);
    let edit = new WorkspaceEdit();
    toc.forEach(entry => {
        const lineNum = entry.lineNum;
        const lineText = doc.lineAt(lineNum).text;
        const newText = lineText.includes('#')
            ? lineText.replace(/^(\s{0,3}#+ +)((?:\d{1,9}\.)* )?(.*)/, (_, g1, _g2, g3) => `${g1}${g3}`)
            : lineText.replace(/^(\s{0,3})((?:\d{1,9}\.)* )?(.*)/, (_, g1, _g2, g3) => `${g1}${g3}`);
        edit.replace(doc.uri, doc.lineAt(lineNum).range, newText);
    });

    return workspace.applyEdit(edit);
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, '/').toLowerCase();
}

//// Returns a list of user defined excluded headings for the given document.
function getExcludedHeadings(doc: TextDocument): { level: number, text: string; }[] {
    const configObj = workspace.getConfiguration('markdown.extension.toc').get<{ [path: string]: string[]; }>('omittedFromToc');

    if (typeof configObj !== 'object' || configObj === null) {
        window.showErrorMessage(`\`omittedFromToc\` must be an object (e.g. \`{"README.md": ["# Introduction"]}\`)`);
        return [];
    }

    const docWorkspace = workspace.getWorkspaceFolder(doc.uri);

    let omittedTocPerFile: { [path: string]: string[]; } = {};
    for (const filePath of Object.keys(configObj)) {
        let normedPath: string;
        //// Converts paths to absolute paths if a workspace is opened
        if (docWorkspace !== undefined && !path.isAbsolute(filePath)) {
            normedPath = normalizePath(path.join(docWorkspace.uri.fsPath, filePath));
        } else {
            normedPath = normalizePath(filePath);
        }
        omittedTocPerFile[normedPath] = [...(omittedTocPerFile[normedPath] || []), ...configObj[filePath]];
    }

    const currentFile = normalizePath(doc.fileName);
    const omittedList = omittedTocPerFile[currentFile] || [];

    if (!Array.isArray(omittedList)) {
        window.showErrorMessage(`\`omittedFromToc\` attributes must be arrays (e.g. \`{"README.md": ["# Introduction"]}\`)`);
        return [];
    }

    return omittedList.map(heading => {
        const matches = heading.match(/^ *(#+) +(.*)$/);
        if (matches === null) {
            window.showErrorMessage(`Invalid entry "${heading}" in \`omittedFromToc\``);
            return { level: -1, text: '' };
        }
        const [, sharps, name] = matches;
        return {
            level: sharps.length,
            text: name
        };
    });
}

async function generateTocText(doc: TextDocument): Promise<string> {
    const orderedListMarkerIsOne: boolean = workspace.getConfiguration('markdown.extension.orderedList').get<string>('marker') === 'one';

    let toc: string[] = [];
    let tocEntries = buildToc(doc);
    if (tocEntries === null || tocEntries === undefined || tocEntries.length < 1) return '';

    const startDepth = Math.max(tocConfig.startDepth, Math.min(...tocEntries.map(h => h.level)));
    let order = new Array(tocConfig.endDepth - startDepth + 1).fill(0); // Used for ordered list

    const anchorOccurrences: { [slug: string]: number; } = {};
    let ignoredDepthBound: number | undefined = undefined;
    const excludedHeadings = getExcludedHeadings(doc);

    tocEntries.forEach(entry => {
        if (entry.level <= tocConfig.endDepth && entry.level >= startDepth) {
            let relativeLvl = entry.level - startDepth;

            //// Remove certain Markdown syntaxes
            //// `[text](link)` → `text`
            let headingText = entry.text.replace(/\[([^\]]*)\]\([^\)]*\)/, (_, g1) => g1);
            //// `[text][label]` → `text`
            headingText = headingText.replace(/\[([^\]]*)\]\[[^\)]*\]/, (_, g1) => g1);

            let slug = slugify(entry.text);

            if (anchorOccurrences.hasOwnProperty(slug)) {
                anchorOccurrences[slug] += 1;
                slug += '-' + String(anchorOccurrences[slug]);
            } else {
                anchorOccurrences[slug] = 0;
            }

            // Filter out used excluded headings.
            const isExcluded = excludedHeadings.some(({ level, text }) => level === entry.level && text === entry.text);
            const isOmittedSubHeading = ignoredDepthBound !== undefined && entry.level > ignoredDepthBound;
            if (isExcluded) {
                // Keep track of the latest omitted heading's depth to also omit its subheadings.
                ignoredDepthBound = entry.level;
            } else if (!isOmittedSubHeading) {
                // Reset ignore bound (not ignored sub heading anymore).
                ignoredDepthBound = undefined;
                let row = [
                    docConfig.tab.repeat(relativeLvl),
                    (tocConfig.orderedList ? (orderedListMarkerIsOne ? '1' : ++order[relativeLvl]) + '.' : tocConfig.listMarker) + ' ',
                    tocConfig.plaintext ? headingText : `[${headingText}](#${slug})`
                ];
                toc.push(row.join(''));
                if (tocConfig.orderedList) order.fill(0, relativeLvl + 1);
            }
        }
    });
    while (/^[ \t]/.test(toc[0])) {
        toc = toc.slice(1);
    }
    return toc.join(docConfig.eol);
}

/**
 * Returns an array of TOC ranges.
 * If no TOC is found, returns an empty array.
 * @param doc a TextDocument
 */
async function detectTocRanges(doc: TextDocument): Promise<[Array<Range>, string]> {
    let tocRanges = [];
    const newTocText = await generateTocText(doc);
    const fullText = doc.getText();
    let listRegex = /(^|\r?\n)((?:[-+*]|[0-9]+[.)]) .*(?:\r?\n[ \t]*(?:[-+*]|[0-9]+[.)]) .*)*)/g;
    let match;
    while ((match = listRegex.exec(fullText)) !== null) {
        //// #525 <!-- no toc --> comment
        const listStartPos = doc.positionAt(match.index + match[1].length);
        if (
            (listStartPos.line > 0 && doc.lineAt(listStartPos.line - 1).text.includes("no toc"))
            || isInFencedCodeBlock(doc, listStartPos.line)
        ) {
            continue;
        }

        const listText = match[2];

        //// Sanity checks
        const firstLine: string = listText.split(/\r?\n/)[0];
        if (workspace.getConfiguration('markdown.extension.toc').get<boolean>('plaintext')) {
            //// A lazy way to check whether it is a link
            if (firstLine.includes('](')) {
                continue;
            }
        } else {
            //// GitHub issue #304 (must contain `#`), #549 and #683 (shouldn't contain text other than links)
            if (!/^([-\*+]|[0-9]+[.)]) +\[[^\]]+\]\(\#[^\)]+\)$/.test(firstLine)) {
                continue;
            }
        }

        if (radioOfCommonPrefix(newTocText, listText) + stringSimilarity.compareTwoStrings(newTocText, listText) > 0.5) {
            tocRanges.push(
                new Range(listStartPos, doc.positionAt(listRegex.lastIndex))
            );
        }
    }

    return [tocRanges, newTocText];
}

function commonPrefixLength(s1: string, s2: string): number {
    let minLength = Math.min(s1.length, s2.length);
    for (let i = 0; i < minLength; i++) {
        if (s1[i] !== s2[i]) {
            return i;
        }
    }
    return minLength;
}

function radioOfCommonPrefix(s1: string, s2: string): number {
    let minLength = Math.min(s1.length, s2.length);
    let maxLength = Math.max(s1.length, s2.length);

    let prefixLength = commonPrefixLength(s1, s2);
    if (prefixLength < minLength) {
        return prefixLength / minLength;
    } else {
        return minLength / maxLength;
    }
}

function onWillSave(e: TextDocumentWillSaveEvent) {
    if (!tocConfig.updateOnSave) return;
    if (e.document.languageId == 'markdown') {
        e.waitUntil(updateToc());
    }
}

function isAtxHeading(lineText: String): Boolean {
    return lineText.trim().startsWith('#')
        && !lineText.startsWith('    ')  //// The opening `#` character may be indented 0-3 spaces
        && lineText.includes('# ')
}

/**
 * Updates `tocConfig` and `docConfig`.
 * @param editor The editor, from which we detect `docConfig`.
 */
function loadTocConfig(editor: TextEditor): void {
    const tocSectionCfg = workspace.getConfiguration('markdown.extension.toc');
    const tocLevels = tocSectionCfg.get<string>('levels')!;
    let matches;
    if (matches = tocLevels.match(/^([1-6])\.\.([1-6])$/)) {
        tocConfig.startDepth = Number(matches[1]);
        tocConfig.endDepth = Number(matches[2]);
    }
    tocConfig.orderedList = tocSectionCfg.get<boolean>('orderedList')!;
    tocConfig.listMarker = tocSectionCfg.get<string>('unorderedList.marker')!;
    tocConfig.plaintext = tocSectionCfg.get<boolean>('plaintext')!;
    tocConfig.updateOnSave = tocSectionCfg.get<boolean>('updateOnSave')!;

    // Load workspace config
    docConfig.eol = editor.document.eol === EndOfLine.CRLF ? '\r\n' : '\n';

    let tabSize = Number(editor.options.tabSize);
    // Seems not robust.
    if (workspace.getConfiguration('markdown.extension.list', editor.document.uri).get<string>('indentationSize') === 'adaptive') {
        tabSize = tocConfig.orderedList ? 3 : 2;
    }

    const insertSpaces = editor.options.insertSpaces;
    if (insertSpaces) {
        docConfig.tab = ' '.repeat(tabSize);
    } else {
        docConfig.tab = '\t';
    }
}

/**
 * Gets root-level headings in a text document.
 */
export function buildToc(doc: TextDocument): IHeading[] {
    const replacer = (foundStr: string) => foundStr.replace(/[^\r\n]/g, '');
    let lines = doc.getText()
        .replace(REGEX_FENCED_CODE_BLOCK, replacer)                 //// Remove fenced code blocks (and #603, #675)
        .replace(/<!-- omit in (toc|TOC) -->/g, '&lt; omit in toc &gt;')    //// Escape magic comment
        .replace(/<!--[\W\w]+?-->/g, replacer)                      //// Remove comments
        .replace(/^---[\W\w]+?(\r?\n)---/, replacer)                //// Remove YAML front matter
        .split(/\r?\n/g);

    //// Some special cases that we need to look at multiple lines to decide
    lines.forEach((lineText, i, arr) => {
        //// Transform setext headings to ATX headings
        if (
            i < arr.length - 1
            && !isAtxHeading(lineText) //// #879
            && lineText.match(/^ {0,3}\S.*$/)
            && lineText.replace(/[ -]/g, '').length > 0  //// #629
            && arr[i + 1].match(/^ {0,3}(=+|-{2,}) *$/)
        ) {
            arr[i] = (arr[i + 1].includes('=') ? '# ' : '## ') + lineText;
        }
        //// Ignore headings following `<!-- omit in toc -->`
        if (
            i > 0
            && arr[i - 1] === '&lt; omit in toc &gt;'
        ) {
            arr[i] = '';
        }
    });

    const toc = lines.map((lineText, index) => {
        if (
            isAtxHeading(lineText)
            && !lineText.includes('&lt; omit in toc &gt;')
        ) {
            lineText = lineText.replace(/^ +/, '');
            const matches = /^(#+) (.*)/.exec(lineText)!;
            const entry = {
                level: matches[1].length,
                text: matches[2].replace(/ #+ *$/, '').trim(),
                lineNum: index,
            };
            return entry;
        } else {
            return null;
        }
    }).filter(entry => entry !== null);

    return toc as IHeading[]; // TODO: Rewrite later.
}

class TocCodeLensProvider implements CodeLensProvider {
    public provideCodeLenses(document: TextDocument, _: CancellationToken):
        CodeLens[] | Thenable<CodeLens[]> {
        // VS Code asks for code lens as soon as a text editor is visible (atop the group that holds it), no matter whether it has focus.
        // Duplicate editor views refer to the same TextEditor, and the same TextDocument.
        const editor = window.visibleTextEditors.find(e => e.document === document)!;

        loadTocConfig(editor);

        const lenses: CodeLens[] = [];
        return detectTocRanges(document).then(tocRangesAndText => {
            const tocRanges = tocRangesAndText[0];
            const newToc = tocRangesAndText[1];
            for (let tocRange of tocRanges) {
                let status = document.getText(tocRange).replace(/\r?\n|\r/g, docConfig.eol) === newToc ? 'up to date' : 'out of date';
                lenses.push(new CodeLens(tocRange, {
                    arguments: [],
                    title: `Table of Contents (${status})`,
                    command: ''
                }));
            }
            return lenses;
        });
    }
}
