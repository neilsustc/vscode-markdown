import { workspace, Selection } from 'vscode';
import { testMdFile, defaultConfigs, testCommand } from './testUtils';

let previousConfigs = Object.assign({}, defaultConfigs);

suite("TOC.", () => {
    suiteSetup(async () => {
        // 💩 Preload file to prevent the first test to be treated timeout
        await workspace.openTextDocument(testMdFile);

        for (let key of Object.keys(previousConfigs)) {
            previousConfigs[key] = workspace.getConfiguration('', null).get(key);
        }
    });

    suiteTeardown(async () => {
        for (let key of Object.keys(previousConfigs)) {
            await workspace.getConfiguration('', null).update(key, previousConfigs[key], true);
        }
    });

    test("Create", done => {
        testCommand('markdown.extension.toc.create', {},
            [
                '# Section 1',
                '',
                '## Section 1.1',
                '',
                '# Section 2',
                '',
                ''
            ],
            new Selection(6, 0, 6, 0),
            [
                '# Section 1',
                '',
                '## Section 1.1',
                '',
                '# Section 2',
                '',
                '- [Section 1](#section-1)',
                '  - [Section 1.1](#section-11)',
                '- [Section 2](#section-2)'
            ],
            new Selection(8, 25, 8, 25)).then(done, done);
    });

    test("Update", done => {
        testCommand('markdown.extension.toc.update', {},
            [
                '# Section 1',
                '',
                '## Section 1.1',
                '',
                '# Section 2',
                '',
                '## Section 2.1',
                '',
                '- [Section 1](#section-1)',
                '  - [Section 1.1](#section-11)',
                '- [Section 2](#section-2)'
            ],
            new Selection(0, 0, 0, 0),
            [
                '# Section 1',
                '',
                '## Section 1.1',
                '',
                '# Section 2',
                '',
                '## Section 2.1',
                '',
                '- [Section 1](#section-1)',
                '  - [Section 1.1](#section-11)',
                '- [Section 2](#section-2)',
                '  - [Section 2.1](#section-21)'
            ],
            new Selection(0, 0, 0, 0)).then(done, done);
    });

    test("Update (ordered list)", done => {
        testCommand('markdown.extension.toc.update',
            {
                "markdown.extension.toc.orderedList": true
            },
            [
                '# Section 1',
                '',
                '## Section 1.1',
                '',
                '# Section 2',
                '',
                '## Section 2.1',
                '',
                '1. [Section 1](#section-1)',
                '   1. [Section 1.1](#section-11)',
                '2. [Section 2](#section-2)'
            ],
            new Selection(0, 0, 0, 0),
            [
                '# Section 1',
                '',
                '## Section 1.1',
                '',
                '# Section 2',
                '',
                '## Section 2.1',
                '',
                '1. [Section 1](#section-1)',
                '   1. [Section 1.1](#section-11)',
                '2. [Section 2](#section-2)',
                '   1. [Section 2.1](#section-21)'
            ],
            new Selection(0, 0, 0, 0)).then(done, done);
    });

    test("Create (levels 2..3)", done => {
        testCommand('markdown.extension.toc.create',
            {
                "markdown.extension.toc.levels": "2..3"
            },
            [
                '# Section 1',
                '',
                '## Section 1.1',
                '',
                '### Section 1.1.1',
                '',
                '#### Section 1.1.1.1',
                '',
                '# Section 2',
                '',
                '## Section 2.1',
                '',
                '### Section 2.1.1',
                '',
                '#### Section 2.1.1.1',
                '',
                ''
            ],
            new Selection(16, 0, 16, 0),
            [
                '# Section 1',
                '',
                '## Section 1.1',
                '',
                '### Section 1.1.1',
                '',
                '#### Section 1.1.1.1',
                '',
                '# Section 2',
                '',
                '## Section 2.1',
                '',
                '### Section 2.1.1',
                '',
                '#### Section 2.1.1.1',
                '',
                '- [Section 1.1](#section-11)',
                '  - [Section 1.1.1](#section-111)',
                '- [Section 2.1](#section-21)',
                '  - [Section 2.1.1](#section-211)',
            ],
            new Selection(19, 33, 19, 33)).then(done, done);
    });

    test("Update (levels 2..3)", done => {
        testCommand('markdown.extension.toc.update',
            {
                "markdown.extension.toc.levels": "2..3"
            },
            [
                '# Section 1',
                '',
                '## Section 1.1',
                '',
                '### Section 1.1.1',
                '',
                '#### Section 1.1.1.1',
                '',
                '# Section 2',
                '',
                '## Section 2.1',
                '',
                '- [Section 1.1](#section-11)',
                '  - [Section 1.1.1](#section-111)',
                '- [Section 2.1](#section-21)',
                '  - [Section 2.1.1](#section-211)',
            ],
            new Selection(0, 0, 0, 0),
            [
                '# Section 1',
                '',
                '## Section 1.1',
                '',
                '### Section 1.1.1',
                '',
                '#### Section 1.1.1.1',
                '',
                '# Section 2',
                '',
                '## Section 2.1',
                '',
                '- [Section 1.1](#section-11)',
                '  - [Section 1.1.1](#section-111)',
                '- [Section 2.1](#section-21)'
            ],
            new Selection(0, 0, 0, 0)).then(done, done);
    });

    test("Create 中文", done => {
        testCommand('markdown.extension.toc.create', {},
            [
                '# Section 中文',
                '',
                '## Section 1.1',
                '',
                '# Section 2',
                '',
                ''
            ],
            new Selection(6, 0, 6, 0),
            [
                '# Section 中文',
                '',
                '## Section 1.1',
                '',
                '# Section 2',
                '',
                '- [Section 中文](#section-中文)',
                '  - [Section 1.1](#section-11)',
                '- [Section 2](#section-2)'
            ],
            new Selection(8, 25, 8, 25)).then(done, done);
    });

    test("Setext headings", done => {
        testCommand('markdown.extension.toc.create', {},
            [
                'Section 1',
                '===',
                '',
                'Section 1.1',
                '---',
                '',
                ''
            ],
            new Selection(6, 0, 6, 0),
            [
                'Section 1',
                '===',
                '',
                'Section 1.1',
                '---',
                '',
                '- [Section 1](#section-1)',
                '  - [Section 1.1](#section-11)'
            ],
            new Selection(7, 30, 7, 30)).then(done, done);
    });

    test("ATX Heading closing sequence", done => {
        testCommand('markdown.extension.toc.create', {},
            [
                '# H1 #',
                '## H1.1 ###',
                '## H1.2 ##  ',
                '# H2 ## foo',
                '# H3#',
                '# H4 \\###',
                '# H5 #\\##',
                '# H6 \\#',
                '',
                ''
            ],
            new Selection(9, 0, 9, 0),
            [
                '# H1 #',
                '## H1.1 ###',
                '## H1.2 ##  ',
                '# H2 ## foo',
                '# H3#',
                '# H4 \\###',
                '# H5 #\\##',
                '# H6 \\#',
                '',
                '- [H1](#h1)',
                '  - [H1.1](#h11)',
                '  - [H1.2](#h12)',
                '- [H2 ## foo](#h2--foo)',
                '- [H3#](#h3)',
                '- [H4 \\###](#h4-)',
                '- [H5 #\\##](#h5-)',
                '- [H6 \\#](#h6-)',
            ],
            new Selection(16, 15, 16, 15)).then(done, done);
    });

    test("ATX Heading followed by thematic break doesn't get parsed as a setext heading", done => {
        testCommand('markdown.extension.toc.create', {},
            [
                '# H1',
                '---',
                '',
                '',
            ],
            new Selection(3, 0, 3, 0),
            [
                '# H1',
                '---',
                '',
                '- [H1](#h1)',
            ],
            new Selection(3, 10, 3, 10)).then(done, done);
    });

    test("Non-Latin symbols (Option `toc.slugifyMode: github`)", done => {
        testCommand('markdown.extension.toc.create',
            {
                "markdown.extension.toc.slugifyMode": "github"
            },
            [
                '# Секция 1',
                '',
                '## Секция 1.1',
                '',
                ''
            ],
            new Selection(4, 0, 4, 0),
            [
                '# Секция 1',
                '',
                '## Секция 1.1',
                '',
                '- [Секция 1](#секция-1)',
                '  - [Секция 1.1](#секция-11)'
            ],
            new Selection(5, 28, 5, 28)).then(done, done);
    });

    // https://github.com/yzhang-gh/vscode-markdown/issues/469
    test("Non-Latin symbols (Option `toc.slugifyMode = gitlab`)", done => {
        testCommand('markdown.extension.toc.create',
            {
                "markdown.extension.toc.slugifyMode": "gitlab"
            },
            [
                '# Секция 1',
                '',
                '## Секция 1.1',
                '',
                ''
            ],
            new Selection(4, 0, 4, 0),
            [
                '# Секция 1',
                '',
                '## Секция 1.1',
                '',
                '- [Секция 1](#секция-1)',
                '  - [Секция 1.1](#секция-11)'
            ],
            new Selection(5, 28, 5, 28)).then(done, done);
    });

    test("Non-Latin symbols (Option `toc.slugifyMode = gitea`)", done => {
        testCommand('markdown.extension.toc.create',
            {
                "markdown.extension.toc.slugifyMode": "gitea"
            },
            [
                '# Секция 1',
                '',
                '## Секция 1.1',
                '',
                ''
            ],
            new Selection(4, 0, 4, 0),
            [
                '# Секция 1',
                '',
                '## Секция 1.1',
                '',
                '- [Секция 1](#секция-1)',
                '  - [Секция 1.1](#секция-1-1)'
            ],
            new Selection(5, 29, 5, 29)).then(done, done);
    });

    test("Update multiple TOCs", done => {
        testCommand('markdown.extension.toc.update',
            {
                "markdown.extension.toc.slugifyMode": "github"
            },
            [
                '# Head 1',
                '# Head 2',
                '',
                '- [Head 1](#head-1)',
                '- [Head 2](#head-2)',
                '- [Head 3](#head-3)',
                '',
                '- [Head 1](#head-1)',
                '- [Head 2](#head-2)',
                '- [Head 3](#head-3)',
                '',
                '# Head 3',
                '# Head 4'
            ],
            new Selection(0, 0, 0, 0),
            [
                '# Head 1',
                '# Head 2',
                '',
                '- [Head 1](#head-1)',
                '- [Head 2](#head-2)',
                '- [Head 3](#head-3)',
                '- [Head 4](#head-4)',
                '',
                '- [Head 1](#head-1)',
                '- [Head 2](#head-2)',
                '- [Head 3](#head-3)',
                '- [Head 4](#head-4)',
                '',
                '# Head 3',
                '# Head 4'
            ],
            new Selection(0, 0, 0, 0)).then(done, done);
    });

    test("Exclude omitted headings (`toc.omittedFromToc`)", (done) => {
        testCommand(
            'markdown.extension.toc.create',
            {
                'markdown.extension.toc.omittedFromToc': {
                    [testMdFile]: [
                        // With more than one space between sharps and text.
                        '#  Introduction',
                        // With spaces before sharps ans special chars.
                        '  ## Ignored - with "special" ~ chars',
                        '## Underlined heading'
                    ],
                    'not-ignored.md': ['# Head 1']
                }
            },
            [
                '',
                '',
                '# Introduction',
                '## Sub heading (should be ignored, too)',
                '# Head 1',
                '',
                // Underlined heading should be ignored, too.
                'Underlined heading',
                '------------------',
                '',
                '- [Head 1](#head-1)',
                '- [Head 2](#head-2)',
                '- [Head 3](#head-3)',
                '',
                '- [Head 1](#head-1)',
                '- [Head 2](#head-2)',
                '- [Head 3](#head-3)',
                '',
                '# Head 3',
                '## Ignored - with "special" ~ chars',
                // Second "Introduction" heading is visible (should have a number suffix in ToC).
                '## Introduction',
                '# Head 4'
            ],
            new Selection(0, 0, 0, 0),
            [
                '- [Head 1](#head-1)',
                '- [Head 3](#head-3)',
                '  - [Introduction](#introduction-1)',
                '- [Head 4](#head-4)',
                '',
                '# Introduction',
                '## Sub heading (should be ignored, too)',
                '# Head 1',
                '',
                'Underlined heading',
                '------------------',
                '',
                '- [Head 1](#head-1)',
                '- [Head 2](#head-2)',
                '- [Head 3](#head-3)',
                '',
                '- [Head 1](#head-1)',
                '- [Head 2](#head-2)',
                '- [Head 3](#head-3)',
                '',
                '# Head 3',
                '## Ignored - with "special" ~ chars',
                '## Introduction',
                '# Head 4'
            ],
            new Selection(3, 19, 3, 19)
        ).then(done, done);
    })

    test("Option `toc.downcaseLink`", done => {
        testCommand('markdown.extension.toc.create',
            {
                "markdown.extension.toc.slugifyMode": "vscode", // VS Code tolerates uppercase characters.
                "markdown.extension.toc.downcaseLink": false
            },
            [
                '# Section 1',
                '',
                '## Section 1.1',
                '',
                '# Section 2',
                '',
                ''
            ],
            new Selection(6, 0, 6, 0),
            [
                '# Section 1',
                '',
                '## Section 1.1',
                '',
                '# Section 2',
                '',
                '- [Section 1](#Section-1)',
                '  - [Section 1.1](#Section-11)',
                '- [Section 2](#Section-2)'
            ],
            new Selection(8, 25, 8, 25)).then(done, done);
    });

    test("Inline <!-- omit in toc -->", done => {
        testCommand('markdown.extension.toc.create', {},
            [
                '# Section 1',
                '',
                '## Section 1.1 <!-- omit in toc -->',
                '',
                '# Section 2',
                '',
                ''
            ],
            new Selection(6, 0, 6, 0),
            [
                '# Section 1',
                '',
                '## Section 1.1 <!-- omit in toc -->',
                '',
                '# Section 2',
                '',
                '- [Section 1](#section-1)',
                '- [Section 2](#section-2)'
            ],
            new Selection(7, 25, 7, 25)).then(done, done);
    });

    test("<!-- omit in toc --> in previous line", done => {
        testCommand('markdown.extension.toc.create', {},
            [
                '# Section 1',
                '',
                '<!-- omit in toc -->',
                '## Section 1.1',
                '',
                '# Section 2',
                '',
                ''
            ],
            new Selection(7, 0, 7, 0),
            [
                '# Section 1',
                '',
                '<!-- omit in toc -->',
                '## Section 1.1',
                '',
                '# Section 2',
                '',
                '- [Section 1](#section-1)',
                '- [Section 2](#section-2)'
            ],
            new Selection(8, 25, 8, 25)).then(done, done);
    });

    test("Ignore code blocks", done => {
        testCommand('markdown.extension.toc.create', {},
            [
                '# Section 1',
                '',
                '```',
                '## Section 1.1',
                '```',
                '',
                '# Section 2',
                '',
                ''
            ],
            new Selection(8, 0, 8, 0),
            [
                '# Section 1',
                '',
                '```',
                '## Section 1.1',
                '```',
                '',
                '# Section 2',
                '',
                '- [Section 1](#section-1)',
                '- [Section 2](#section-2)'
            ],
            new Selection(9, 25, 9, 25)).then(done, done);
    });

    test("Ignore code blocks indented with TAB (GitHub #603)", done => {
        testCommand('markdown.extension.toc.create', {},
            [
                '# Section 1',
                '',
                '\t```',
                '\t## Section 1.1',
                '\t```',
                '',
                '# Section 2',
                '',
                ''
            ],
            new Selection(8, 0, 8, 0),
            [
                '# Section 1',
                '',
                '\t```',
                '\t## Section 1.1',
                '\t```',
                '',
                '# Section 2',
                '',
                '- [Section 1](#section-1)',
                '- [Section 2](#section-2)'
            ],
            new Selection(9, 25, 9, 25)).then(done, done);
    });

    test("Ignore code blocks. TOC update", done => {
        testCommand('markdown.extension.toc.update', {},
            [
                '# H1',
                '# H2',
                '# H3',
                '',
                '```',
                '- [H1](#h1)',
                '- [H2](#h2)',
                '',
                '```'
            ],
            new Selection(0, 0, 0, 0),
            [
                '# H1',
                '# H2',
                '# H3',
                '',
                '```',
                '- [H1](#h1)',
                '- [H2](#h2)',
                '',
                '```'
            ],
            new Selection(0, 0, 0, 0)).then(done, done);
    });

    test("Markdown syntax in headings", done => {
        testCommand('markdown.extension.toc.create', {},
            [
                '# [text](link)',
                '# [text2][label]',
                '# **bold**',
                '# *it1* _it2_',
                '# `code`',
                '# 1. Heading',
                '# 1) Heading',
                '',
                ''
            ],
            new Selection(8, 0, 8, 0),
            [
                '# [text](link)',
                '# [text2][label]',
                '# **bold**',
                '# *it1* _it2_',
                '# `code`',
                '# 1. Heading',
                '# 1) Heading',
                '',
                '- [text](#text)',
                '- [text2](#text2)',
                '- [**bold**](#bold)',
                '- [*it1* _it2_](#it1-it2)',
                '- [`code`](#code)',
                '- [1. Heading](#1-heading)',
                '- [1) Heading](#1-heading-1)'
            ],
            new Selection(14, 28, 14, 28)).then(done, done);
    });

    // https://github.com/yzhang-gh/vscode-markdown/issues/469
    test("Multiple removed symbols in a row (Option `toc.slugifyMode = gitlab`)", done => {
        testCommand('markdown.extension.toc.create',
            {
                "markdown.extension.toc.slugifyMode": "gitlab"
            },
            [
                '# Test + Heading',
                '',
                ''
            ],
            new Selection(2, 0, 2, 0),
            [
                '# Test + Heading',
                '',
                '- [Test + Heading](#test-heading)'
            ],
            new Selection(2, 33, 2, 33)).then(done, done);
    });

    test("Add section numbers", done => {
        testCommand('markdown.extension.toc.addSecNumbers', {},
            [
                '---',
                'title: test',
                '---',
                '# Heading 1',
                '##  Heading 1.1',
                '   Heading 2',
                '===',
                '```markdown',
                '# _Heading 3',
                '```',
                '## Heading 2.1',
                '## _Heading 2.2 <!-- omit in toc -->',
                '<!--',
                '## _Heading 2.3',
                '-->',
                '## Heading 2.2',
            ],
            new Selection(0, 0, 0, 0),
            [
                '---',
                'title: test',
                '---',
                '# 1. Heading 1',
                '##  1.1. Heading 1.1',
                '   2. Heading 2',
                '===',
                '```markdown',
                '# _Heading 3',
                '```',
                '## 2.1. Heading 2.1',
                '## _Heading 2.2 <!-- omit in toc -->',
                '<!--',
                '## _Heading 2.3',
                '-->',
                '## 2.2. Heading 2.2',
            ],
            new Selection(0, 0, 0, 0)).then(done, done);
    });

    test("Update section numbers", done => {
        testCommand('markdown.extension.toc.addSecNumbers', {},
            [
                '---',
                'title: test',
                '---',
                '# Heading 1',
                '## 1.2. Heading 1.1',
                '2. Heading 2',
                '===',
                '```markdown',
                '# _Heading 3',
                '```',
                '## 2.1.1. Heading 2.1',
                '## _Heading 2.2 <!-- omit in toc -->',
                '<!--',
                '## _Heading 2.3',
                '-->',
                '## 2.2. Heading 2.2',
            ],
            new Selection(0, 0, 0, 0),
            [
                '---',
                'title: test',
                '---',
                '# 1. Heading 1',
                '## 1.1. Heading 1.1',
                '2. Heading 2',
                '===',
                '```markdown',
                '# _Heading 3',
                '```',
                '## 2.1. Heading 2.1',
                '## _Heading 2.2 <!-- omit in toc -->',
                '<!--',
                '## _Heading 2.3',
                '-->',
                '## 2.2. Heading 2.2',
            ],
            new Selection(0, 0, 0, 0)).then(done, done);
    });

    test("Remove section numbers", done => {
        testCommand('markdown.extension.toc.removeSecNumbers', {},
            [
                '---',
                'title: test',
                '---',
                '# 1. Heading 1',
                '## 1.1. Heading 1.1',
                '2. Heading 2',
                '===',
                '```markdown',
                '# _Heading 3',
                '```',
                '## 2.1. Heading 2.1',
                '## _Heading 2.2 <!-- omit in toc -->',
                '<!--',
                '## _Heading 2.3',
                '-->',
                '## 2.2. Heading 2.2',
            ],
            new Selection(0, 0, 0, 0),
            [
                '---',
                'title: test',
                '---',
                '# Heading 1',
                '## Heading 1.1',
                'Heading 2',
                '===',
                '```markdown',
                '# _Heading 3',
                '```',
                '## Heading 2.1',
                '## _Heading 2.2 <!-- omit in toc -->',
                '<!--',
                '## _Heading 2.3',
                '-->',
                '## Heading 2.2',
            ],
            new Selection(0, 0, 0, 0)).then(done, done);
    });

    test("Section numbering starting level", done => {
        testCommand('markdown.extension.toc.addSecNumbers', {},
            [
                '# Heading <!-- omit in toc -->',
                '## Heading 1',
                '## Heading 2',
                '## Heading 3',
            ],
            new Selection(0, 0, 0, 0),
            [
                '# Heading <!-- omit in toc -->',
                '## 1. Heading 1',
                '## 2. Heading 2',
                '## 3. Heading 3',
            ],
            new Selection(0, 0, 0, 0)).then(done, done);
    });

    test("Section numbering and `toc.levels`", done => {
        testCommand('markdown.extension.toc.addSecNumbers',
            {
                "markdown.extension.toc.levels": "2..6"
            },
            [
                '# Heading',
                '## Heading 1',
                '## Heading 2',
                '## Heading 3',
            ],
            new Selection(0, 0, 0, 0),
            [
                '# Heading',
                '## 1. Heading 1',
                '## 2. Heading 2',
                '## 3. Heading 3',
            ],
            new Selection(0, 0, 0, 0)).then(done, done);
    });
});
