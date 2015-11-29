import {Models} from "omnisharp-client";
import {Omni} from "../server/omni";
/* tslint:disable:variable-name */
const Range = require("atom").Range;
/* tslint:enable:variable-name */
const _: _.LoDashStatic = require("lodash");
import {Observable, CompositeDisposable} from "rx";
import {codeCheck} from "../features/code-check";

interface LinterError {
    type: string; // "error" | "warning"
    text?: string;
    html?: string;
    filePath?: string;
    range?: Range;
    [key: string]: any;
}

function mapValues(editor: Atom.TextEditor, error: Models.DiagnosticLocation): LinterError {
    const level = error.LogLevel.toLowerCase();

    return {
        type: level,
        text: `${error.Text} [${Omni.getFrameworks(error.Projects)}] `,
        filePath: editor.getPath(),
        range: new Range([error.Line, error.Column], [error.EndLine, error.EndColumn])
    };
}

function showLinter() {
    _.each(document.querySelectorAll("linter-bottom-tab"), (element: HTMLElement) => element.style.display = "");
    _.each(document.querySelectorAll("linter-bottom-status"), (element: HTMLElement) => element.style.display = "");
    const panel = <HTMLElement>document.querySelector("linter-panel");
    if (panel)
        panel.style.display = "";
}

function hideLinter() {
    _.each(document.querySelectorAll("linter-bottom-tab"), (element: HTMLElement) => element.style.display = "none");
    _.each(document.querySelectorAll("linter-bottom-status"), (element: HTMLElement) => element.style.display = "none");
    const panel = <HTMLElement>document.querySelector("linter-panel");
    if (panel)
        panel.style.display = "none";
}

export function init() {
    const disposable = new CompositeDisposable();
    let cd: CompositeDisposable;
    disposable.add(atom.config.observe("omnisharp-atom.hideLinterInterface", hidden => {
        if (hidden) {
            cd = new CompositeDisposable();
            disposable.add(cd);

            // show linter buttons
            cd.add(Omni.activeEditor
                .where(z => !z)
                .subscribe(showLinter));

            // hide linter buttons
            cd.add(Omni.activeEditor
                .where(z => !!z)
                .subscribe(hideLinter));
        } else {
            if (cd) {
                disposable.remove(cd);
                cd.dispose();
            }
            showLinter();
        }
    }));

    return disposable;
}

export const provider = [
    {
        name: "c#",
        get grammarScopes() { return Omni.grammars.map((x: any) => x.scopeName); },
        scope: "file",
        lintOnFly: true,
        lint: (editor: Atom.TextEditor) => {
            const path = editor.getPath();
            return codeCheck.doCodeCheck(editor)
                .flatMap(x => x)
                .where(z => z.FileName === path)
                .map(error => mapValues(editor, error))
                .toArray()
                .toPromise();
        }
    }, {
        name: "c#",
        get grammarScopes() { return Omni.grammars.map((x: any) => x.scopeName); },
        scope: "project",
        lintOnFly: false,
        lint: (editor: Atom.TextEditor) => {
            return Omni.activeModel
                .flatMap(x => Observable.from(x.diagnostics))
                .where(z => z.LogLevel !== "Hidden")
                .map(error => mapValues(editor, error))
                .toArray()
                .toPromise();
        }
    }
];