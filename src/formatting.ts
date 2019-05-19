'use strict';

import { commands, env, ExtensionContext, Position, Range, Selection, TextEditor, window, workspace, WorkspaceEdit } from 'vscode';

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        commands.registerCommand('markdown.extension.editing.toggleBold', toggleBold),
        commands.registerCommand('markdown.extension.editing.toggleItalic', toggleItalic),
        commands.registerCommand('markdown.extension.editing.toggleCodeSpan', toggleCodeSpan),
        commands.registerCommand('markdown.extension.editing.toggleStrikethrough', toggleStrikethrough),
        commands.registerCommand('markdown.extension.editing.toggleMath', () => toggleMath(transTable)),
        commands.registerCommand('markdown.extension.editing.toggleMathReverse', () => toggleMath(reverseTransTable)),
        commands.registerCommand('markdown.extension.editing.toggleHeadingUp', toggleHeadingUp),
        commands.registerCommand('markdown.extension.editing.toggleHeadingDown', toggleHeadingDown),
        commands.registerCommand('markdown.extension.editing.toggleUnorderedList', toggleUnorderedList),
        commands.registerCommand('markdown.extension.editing.paste', paste)
    );
}

/**
 * Here we store Regexp to check if the text is the single link.
 */
const singleLinkRegex: RegExp = createLinkRegex();

// Return Promise because need to chain operations in unit tests

function toggleBold() {
    return styleByWrapping('**');
}

function toggleItalic() {
    let indicator = workspace.getConfiguration('markdown.extension.italic').get<string>('indicator');
    return styleByWrapping(indicator);
}

function toggleCodeSpan() {
    return styleByWrapping('`');
}

function toggleStrikethrough() {
    return styleByWrapping('~~');
}

async function toggleHeadingUp() {
    let editor = window.activeTextEditor;
    let lineIndex = editor.selection.active.line;
    let lineText = editor.document.lineAt(lineIndex).text;

    return await editor.edit((editBuilder) => {
        if (!lineText.startsWith('#')) { // Not a heading
            editBuilder.insert(new Position(lineIndex, 0), '# ');
        }
        else if (!lineText.startsWith('######')) { // Already a heading (but not level 6)
            editBuilder.insert(new Position(lineIndex, 0), '#');
        }
    });
}

function toggleHeadingDown() {
    let editor = window.activeTextEditor;
    let lineIndex = editor.selection.active.line;
    let lineText = editor.document.lineAt(lineIndex).text;

    editor.edit((editBuilder) => {
        if (lineText.startsWith('# ')) { // Heading level 1
            editBuilder.delete(new Range(new Position(lineIndex, 0), new Position(lineIndex, 2)));
        }
        else if (lineText.startsWith('#')) { // Heading (but not level 1)
            editBuilder.delete(new Range(new Position(lineIndex, 0), new Position(lineIndex, 1)));
        }
    });
}

enum MathBlockState {
    // State 1: not in any others states
    NONE,
    // State 2: $|$
    INLINE,
    // State 3: $$ | $$
    SINGLE_DISPLAYED,
    // State 4:
    // $$
    // |
    // $$
    MULTI_DISPLAYED
}

function getMathState(editor: TextEditor, cursor: Position): MathBlockState {
    if (getContext(editor, cursor, '$') === '$|$') {
        return MathBlockState.INLINE;
    } else if (getContext(editor, cursor, '$$ ', ' $$') === '$$ | $$') {
        return MathBlockState.SINGLE_DISPLAYED;
    } else if (editor.document.lineAt(cursor.line).text === '' 
                && cursor.line > 0
                && editor.document.lineAt(cursor.line-1).text === '$$'
                && cursor.line < editor.document.lineCount - 1
                && editor.document.lineAt(cursor.line+1).text === '$$'
                ){
                    return MathBlockState.MULTI_DISPLAYED
    } else {
        return MathBlockState.NONE;
    }
}

/**
 * Modify the document, change from `oldMathBlockState` to `newMathBlockState`.
 * @param editor 
 * @param cursor 
 * @param oldMathBlockState 
 * @param newMathBlockState 
 */
function setMathState(editor: TextEditor, cursor: Position, oldMathBlockState: MathBlockState, newMathBlockState: MathBlockState) {
    // Step 1: Delete old math block.
    editor.edit(editBuilder => {
        let rangeToBeDeleted: Range
        switch (oldMathBlockState) {
            case MathBlockState.NONE:
                rangeToBeDeleted = new Range(cursor, cursor);
                break;
            case MathBlockState.INLINE:
                rangeToBeDeleted = new Range(new Position(cursor.line, cursor.character-1), new Position(cursor.line, cursor.character+1))
                break;
            case MathBlockState.SINGLE_DISPLAYED:
                rangeToBeDeleted = new Range(new Position(cursor.line, cursor.character-3), new Position(cursor.line, cursor.character+3))
                break;
            case MathBlockState.MULTI_DISPLAYED:
                rangeToBeDeleted = new Range(new Position(cursor.line-1, 0), new Position(cursor.line+1, 2))
                break;
        }
        editBuilder.delete(rangeToBeDeleted)
    }).then(() => {
        // Step 2: Insert new math block.
        editor.edit(editBuilder => {
            let newCursor = editor.selection.active;
            let stringToBeInserted: string
            switch (newMathBlockState) {
                case MathBlockState.NONE:
                    stringToBeInserted = ''
                    break;
                case MathBlockState.INLINE:
                    stringToBeInserted = '$$'
                    break;
                case MathBlockState.SINGLE_DISPLAYED:
                    stringToBeInserted = '$$  $$'
                    break;
                case MathBlockState.MULTI_DISPLAYED:
                    stringToBeInserted = '$$\n\n$$'
                    break;
            }
            editBuilder.insert(newCursor, stringToBeInserted);
        }).then(() => {
            // Step 3: Move cursor to the middle.
            let newCursor = editor.selection.active;
            let newPosition: Position;
            switch (newMathBlockState) {
                case MathBlockState.NONE:
                    newPosition = newCursor
                    break;
                case MathBlockState.INLINE:
                    newPosition = newCursor.with(newCursor.line, newCursor.character-1)
                    break;
                case MathBlockState.SINGLE_DISPLAYED:
                    newPosition = newCursor.with(newCursor.line, newCursor.character-3)
                    break;
                case MathBlockState.MULTI_DISPLAYED:
                    newPosition = newCursor.with(newCursor.line-1, 0)
                    break;
            }
            editor.selection = new Selection(newPosition, newPosition);
        })
    });
}

const transTable = [
    MathBlockState.NONE, 
    MathBlockState.INLINE,
    MathBlockState.MULTI_DISPLAYED, 
    MathBlockState.SINGLE_DISPLAYED
];
const reverseTransTable = new Array(...transTable).reverse();

function toggleMath(transTable) {
    let editor = window.activeTextEditor;
    if (!editor.selection.isEmpty) return;
    let cursor = editor.selection.active;

    let oldMathBlockState = getMathState(editor, cursor)
    let currentStateIndex = transTable.indexOf(oldMathBlockState);
    setMathState(editor, cursor, oldMathBlockState, transTable[(currentStateIndex + 1) % transTable.length])
}

function toggleUnorderedList() {
    let editor = window.activeTextEditor;
    if (!editor.selection.isEmpty) return;
    let cursor = editor.selection.active;
    let textBeforeCursor = editor.document.lineAt(cursor.line).text.substr(0, cursor.character);

    let indentation = 0;
    switch (textBeforeCursor.trim()) {
        case '':
            return editor.edit(editBuilder => {
                editBuilder.insert(cursor, '- ');
            });
        case '-':
            indentation = textBeforeCursor.indexOf('-');
            return editor.edit(editBuilder => {
                editBuilder.replace(new Range(cursor.line, indentation, cursor.line, cursor.character), '*' + ' '.repeat(textBeforeCursor.length - indentation - 1));
            });
        case '*':
            indentation = textBeforeCursor.indexOf('*');
            return editor.edit(editBuilder => {
                editBuilder.replace(new Range(cursor.line, indentation, cursor.line, cursor.character), '+' + ' '.repeat(textBeforeCursor.length - indentation - 1));
            });
        case '+':
            indentation = textBeforeCursor.indexOf('+');
            return editor.edit(editBuilder => {
                editBuilder.delete(new Range(cursor.line, indentation, cursor.line, cursor.character));
            });
    }
}

async function paste() {
    const editor = window.activeTextEditor;
    const selection = editor.selection;
    if (selection.isSingleLine && !isSingleLink(editor.document.getText(selection))) {
        const text = await env.clipboard.readText();
        if (isSingleLink(text)) {
            return commands.executeCommand("editor.action.insertSnippet", { "snippet": `[$TM_SELECTED_TEXT$0](${text})` });
        }
    }
    return commands.executeCommand("editor.action.clipboardPasteAction");
}

/**
 * Creates Regexp to check if the text is a link (further detailes in the isSingleLink() documentation).
 *
 * @return Regexp
 */
function createLinkRegex(): RegExp {
    // unicode letters range(must not be a raw string)
    const ul = '\\u00a1-\\uffff';
    // IP patterns
    const ipv4_re = '(?:25[0-5]|2[0-4]\\d|[0-1]?\\d?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|[0-1]?\\d?\\d)){3}';
    const ipv6_re = '\\[[0-9a-f:\\.]+\\]';  // simple regex (in django it is validated additionally)


    // Host patterns
    const hostname_re = '[a-z' + ul + '0-9](?:[a-z' + ul + '0-9-]{0,61}[a-z' + ul + '0-9])?';
    // Max length for domain name labels is 63 characters per RFC 1034 sec. 3.1
    const domain_re = '(?:\\.(?!-)[a-z' + ul + '0-9-]{1,63}(?<!-))*';

    const tld_re = ''
        + '\\.'                               // dot
        + '(?!-)'                             // can't start with a dash
        + '(?:[a-z' + ul + '-]{2,63}'         // domain label
        + '|xn--[a-z0-9]{1,59})'              // or punycode label
        + '(?<!-)'                            // can't end with a dash
        + '\\.?'                              // may have a trailing dot
        ;

    const host_re = '(' + hostname_re + domain_re + tld_re + '|localhost)';
    const pattern = ''
        + '^(?:[a-z0-9\\.\\-\\+]*)://'  // scheme is not validated (in django it is validated additionally)
        + '(?:[^\\s:@/]+(?::[^\\s:@/]*)?@)?'  // user: pass authentication
        + '(?:' + ipv4_re + '|' + ipv6_re + '|' + host_re + ')'
        + '(?::\\d{2,5})?'  // port
        + '(?:[/?#][^\\s]*)?'  // resource path
        + '$' // end of string
        ;

    return new RegExp(pattern, 'i');
}

/**
 * Checks if the string is a link. The list of link examples you can see in the tests file
 * `test/linksRecognition.test.ts`. This code ported from django's
 * [URLValidator](https://github.com/django/django/blob/2.2b1/django/core/validators.py#L74) with some simplifyings.
 *
 * @param text string to check
 *
 * @return boolean
 */
export function isSingleLink(text: string): boolean {
    return singleLinkRegex.test(text);
}

function styleByWrapping(startPattern, endPattern?) {
    if (endPattern == undefined) {
        endPattern = startPattern;
    }

    let editor = window.activeTextEditor;
    let selections = editor.selections;

    let batchEdit = new WorkspaceEdit();
    let shifts: [Position, number][] = [];
    let newSelections: Selection[] = selections.slice();

    selections.forEach((selection, i) => {

        let cursorPos = selection.active;
        const shift = shifts.map(([pos, s]) => (selection.start.line == pos.line && selection.start.character >= pos.character) ? s : 0)
            .reduce((a, b) => a + b, 0);

        if (selection.isEmpty) {
            // No selected text
            if (startPattern !== '~~' && getContext(editor, cursorPos, startPattern) === `${startPattern}text|${endPattern}`) {
                // `**text|**` to `**text**|`
                let newCursorPos = cursorPos.with({ character: cursorPos.character + shift + endPattern.length });
                newSelections[i] = new Selection(newCursorPos, newCursorPos);
                return;
            } else if (getContext(editor, cursorPos, startPattern) === `${startPattern}|${endPattern}`) {
                // `**|**` to `|`
                let start = cursorPos.with({ character: cursorPos.character - startPattern.length });
                let end = cursorPos.with({ character: cursorPos.character + endPattern.length });
                wrapRange(editor, batchEdit, shifts, newSelections, i, shift, cursorPos, new Range(start, end), false, startPattern);
            } else {
                // Select word under cursor
                let wordRange = editor.document.getWordRangeAtPosition(cursorPos);
                if (wordRange == undefined) {
                    wordRange = selection;
                }
                // One special case: toggle strikethrough in task list
                const currentTextLine = editor.document.lineAt(cursorPos.line);
                if (startPattern === '~~' && /^\s*[\*\+\-] (\[[ x]\] )? */g.test(currentTextLine.text)) {
                    wordRange = currentTextLine.range.with(new Position(cursorPos.line, currentTextLine.text.match(/^\s*[\*\+\-] (\[[ x]\] )? */g)[0].length));
                }
                wrapRange(editor, batchEdit, shifts, newSelections, i, shift, cursorPos, wordRange, false, startPattern);
            }
        } else {
            // Text selected
            wrapRange(editor, batchEdit, shifts, newSelections, i, shift, cursorPos, selection, true, startPattern);
        }
    });

    return workspace.applyEdit(batchEdit).then(() => {
        editor.selections = newSelections;
    });
}

/**
 * Add or remove `startPattern`/`endPattern` according to the context
 * @param editor
 * @param options The undo/redo behavior
 * @param cursor cursor position
 * @param range range to be replaced
 * @param isSelected is this range selected
 * @param startPtn
 * @param endPtn
 */
function wrapRange(editor: TextEditor, wsEdit: WorkspaceEdit, shifts: [Position, number][], newSelections: Selection[], i: number, shift: number, cursor: Position, range: Range, isSelected: boolean, startPtn: string, endPtn?: string) {
    if (endPtn == undefined) {
        endPtn = startPtn;
    }

    let text = editor.document.getText(range);
    const prevSelection = newSelections[i];
    const ptnLength = (startPtn + endPtn).length;

    let newCursorPos = cursor.with({ character: cursor.character + shift });
    let newSelection: Selection;
    if (isWrapped(text, startPtn)) {
        // remove start/end patterns from range
        wsEdit.replace(editor.document.uri, range, text.substr(startPtn.length, text.length - ptnLength));

        shifts.push([range.end, -ptnLength]);

        // Fix cursor position
        if (!isSelected) {
            if (!range.isEmpty) { // means quick styling
                if (cursor.character == range.end.character) {
                    newCursorPos = cursor.with({ character: cursor.character + shift - ptnLength });
                } else {
                    newCursorPos = cursor.with({ character: cursor.character + shift - startPtn.length });
                }
            } else { // means `**|**` -> `|`
                newCursorPos = cursor.with({ character: cursor.character + shift + startPtn.length });
            }
            newSelection = new Selection(newCursorPos, newCursorPos);
        } else {
            newSelection = new Selection(
                prevSelection.start.with({ character: prevSelection.start.character + shift }),
                prevSelection.end.with({ character: prevSelection.end.character + shift - ptnLength })
            );
        }
    } else {
        // add start/end patterns around range
        wsEdit.replace(editor.document.uri, range, startPtn + text + endPtn);

        shifts.push([range.end, ptnLength]);

        // Fix cursor position
        if (!isSelected) {
            if (!range.isEmpty) { // means quick styling
                if (cursor.character == range.end.character) {
                    newCursorPos = cursor.with({ character: cursor.character + shift + ptnLength });
                } else {
                    newCursorPos = cursor.with({ character: cursor.character + shift + startPtn.length });
                }
            } else { // means `|` -> `**|**`
                newCursorPos = cursor.with({ character: cursor.character + shift + startPtn.length });
            }
            newSelection = new Selection(newCursorPos, newCursorPos);
        } else {
            newSelection = new Selection(
                prevSelection.start.with({ character: prevSelection.start.character + shift }),
                prevSelection.end.with({ character: prevSelection.end.character + shift + ptnLength })
            );
        }
    }

    newSelections[i] = newSelection;
}

function isWrapped(text, startPattern, endPattern?): boolean {
    if (endPattern == undefined) {
        endPattern = startPattern;
    }
    return text.startsWith(startPattern) && text.endsWith(endPattern);
}

function getContext(editor, cursorPos, startPattern, endPattern?): string {
    if (endPattern == undefined) {
        endPattern = startPattern;
    }

    let startPositionCharacter = cursorPos.character - startPattern.length;
    let endPositionCharacter = cursorPos.character + endPattern.length;

    if (startPositionCharacter < 0) {
        startPositionCharacter = 0;
    }

    let leftText = editor.document.getText(new Range(cursorPos.line, startPositionCharacter, cursorPos.line, cursorPos.character));
    let rightText = editor.document.getText(new Range(cursorPos.line, cursorPos.character, cursorPos.line, endPositionCharacter));

    if (rightText == endPattern) {
        if (leftText == startPattern) {
            return `${startPattern}|${endPattern}`;
        } else {
            return `${startPattern}text|${endPattern}`;
        }
    }
    return '|';
}
