"use strict";

/**
 * Configuration keys that this product contributes.
 * These values are relative to `markdown.extension`.
 */
type KnownKey =
    | "completion.respectVscodeSearchExclude"
    | "completion.root"
    | "italic.indicator"
    | "katex.macros"
    | "list.indentationSize"
    | "math.enabled"
    | "orderedList.autoRenumber"
    | "orderedList.marker"
    | "preview.autoShowPreviewToSide"
    | "print.absoluteImgPath"
    | "print.imgToBase64"
    | "print.includeVscodeStylesheets"
    | "print.enableCheckBoxes"
    | "print.onFileSave"
    | "print.theme"
    | "print.validateUrls"
    | "syntax.decorationFileSizeLimit" // To be superseded.
    | "syntax.plainTheme" // To be superseded.
    | "tableFormatter.enabled"
    | "tableFormatter.normalizeIndentation"
    | "theming.decoration.renderCodeSpan" // <- "syntax.decorations"
    | "theming.decoration.renderHardLineBreak"
    | "theming.decoration.renderLink"
    | "theming.decoration.renderParagraph"
    | "theming.decoration.renderStrikethrough" // <- "syntax.decorations"
    | "theming.decoration.renderTrailingSpace"
    | "toc.downcaseLink"
    | "toc.levels"
    | "toc.omittedFromToc" // To be superseded.
    | "toc.orderedList"
    | "toc.plaintext"
    | "toc.slugifyMode"
    | "toc.unorderedList.marker"
    | "toc.updateOnSave"
    ;

export default KnownKey;
