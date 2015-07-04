import Omni = require('../../../omni-sharp-server/omni')
var Range = require('atom').Range;
import _ = require('lodash');
import {Observable, CompositeDisposable} from "rx";

export var disposable = new CompositeDisposable();

interface LinterError {
    type: string; // 'error' | 'warning'
    text?: string;
    html?: string;
    filePath?: string,
    range?: Range
}

function getWordAt(str: string, pos: number) {
    var wordLocation = {
        start: pos,
        end: pos
    }

    if (str === undefined) {
        return wordLocation;
    }

    while (pos < str.length && /\W/.test(str[pos])) {
        ++pos;
    }

    var left = str.slice(0, pos + 1).search(/\W(?!.*\W)/);
    var right = str.slice(pos).search(/(\W|$)/);

    wordLocation.start = left + 1;
    wordLocation.end = wordLocation.start + right;

    return wordLocation;
}

function mapValues(editor: Atom.TextEditor, error: OmniSharp.Models.DiagnosticLocation): LinterError {
    var line = error.Line;
    var column = error.Column;
    var text = editor.lineTextForBufferRow(line);
    var wordLocation = getWordAt(text, column);
    var level = error.LogLevel.toLowerCase();

    return {
        type: level,
        text: `${error.Text} [${Omni.getFrameworks(error.Projects) }] `,
        filePath: editor.getPath(),
        line: line + 1,
        col: column + 1,
        range: new Range([line, wordLocation.start], [line, wordLocation.end])
    };
}

_.delay(() => {
    // show linter buttons
    disposable.add(Omni.activeEditor
        .where(z => !z)
        .subscribe(() => {
            _.each(document.querySelectorAll('linter-bottom-tab'), (element: HTMLElement) => element.style.display = '');
            _.each(document.querySelectorAll('linter-bottom-status'), (element: HTMLElement) => element.style.display = '');
            var panel = <HTMLElement>document.getElementById('#linter-panel');
            if (panel)
                panel.style.display = '';
        }));

    // hide linter buttons
    disposable.add(Omni.activeEditor
        .where(z => !!z)
        .subscribe(() => {
            _.each(document.querySelectorAll('linter-bottom-tab'), (element: HTMLElement) => element.style.display = 'none');
            _.each(document.querySelectorAll('linter-bottom-status'), (element: HTMLElement) => element.style.display = 'none');
            var panel = <HTMLElement>document.getElementById('#linter-panel');
            if (panel)
                panel.style.display = 'none';
        }));
}, 1000);

export var provider = [{
    grammarScopes: ['source.cs'],
    scope: 'file',
    lintOnFly: true,
    lint: (editor: Atom.TextEditor) =>
        Omni.request(editor, client => client.codecheck(client.makeRequest(editor)))
            .flatMap(x => Observable.from<OmniSharp.Models.DiagnosticLocation>(x.QuickFixes))
            .where(z => z.LogLevel !== "Hidden")
            .map(error => mapValues(editor, error))
            .toArray()
            .toPromise()
}/*, {
        grammarScopes: ['source.cs'],
        scope: 'project',
        lintOnFly: false,
        lint: (editor: Atom.TextEditor) =>
            Omni.request(editor, client => { var r = client.makeRequest(editor); r.FileName = null; return client.codecheck(r) })
                .flatMap(x => Observable.from<OmniSharp.Models.DiagnosticLocation>(x.QuickFixes))
                .where(z => z.LogLevel != "Hidden")
                .map(error => mapValues(editor, error))
                .toArray()
                .toPromise()
    }*/];