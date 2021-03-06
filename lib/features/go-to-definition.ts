import { last } from 'lodash';
import { Models } from 'omnisharp-client';
import { Observable, Subscription } from 'rxjs';
import { CompositeDisposable } from 'ts-disposables';
import { Omni } from '../server/omni';
// tslint:disable-next-line:no-require-imports no-var-requires
const $: JQueryStatic = require('jquery');
// tslint:disable-next-line:no-require-imports no-var-requires
const Range: typeof TextBuffer.Range = require('atom').Range;
const identifierRegex = /^identifier|identifier$|\.identifier\./;

class GoToDefinition implements IFeature {
    public required = true;
    public title = 'Go To Definition';
    public description = 'Adds support to goto definition, as well as display metadata returned by a goto definition metadata response';

    private disposable: CompositeDisposable;
    private enhancedHighlighting: boolean;
    private marker: Atom.Marker;
    private wantMetadata: boolean;

    public activate() {
        this.disposable = new CompositeDisposable();
        let altGotoDefinition = false;
        this.disposable.add(atom.config.observe('omnisharp-atom:altGotoDefinition', value => altGotoDefinition = value));

        this.disposable.add(Omni.switchActiveEditor((editor, cd) => {
            const view = $(atom.views.getView(editor));
            const scroll = this._getFromShadowDom(view, '.scroll-view');
            if (!scroll[0]) {
                return;
            }

            const click = Observable.fromEvent<MouseEvent>(scroll[0], 'click');

            const mousemove = Observable.fromEvent<MouseEvent>(scroll[0], 'mousemove');

            const keyup = Observable.merge(
                Observable.fromEvent<any>(view[0], 'focus'),
                Observable.fromEvent<any>(view[0], 'blur'),
                Observable.fromEventPattern<any>(
                    x => { (<any>atom.getCurrentWindow()).on('focus', x); },
                    x => { (<any>atom.getCurrentWindow()).removeListener('focus', x); }),
                Observable.fromEventPattern<any>(
                    x => { (<any>atom.getCurrentWindow()).on('blur', x); },
                    x => { (<any>atom.getCurrentWindow()).removeListener('blur', x); }),
                Observable.fromEvent<KeyboardEvent>(view[0], 'keyup')
                    .filter(x => {
                        if (altGotoDefinition) {
                            return x.which === 18; // alt
                        }
                        return x.which === 17 /*ctrl*/ || /*meta --> */ x.which === 224 || x.which === 93 || x.which === 92 || x.which === 91;
                    })
            )
                .throttleTime(100);

            const keydown = Observable.fromEvent<KeyboardEvent>(view[0], 'keydown')
                .filter(z => !z.repeat)
                .filter(e => altGotoDefinition ? e.altKey : (e.ctrlKey || e.metaKey))
                .throttleTime(100);

            const specialKeyDown = keydown
                .switchMap(x => mousemove
                    .takeUntil(keyup)
                    .map(event => {
                        const pixelPt = this._pixelPositionFromMouseEvent(editor, view, event);
                        if (!pixelPt) { return; }
                        const screenPt = editor.screenPositionForPixelPosition(pixelPt);
                        return editor.bufferPositionForScreenPosition(screenPt);
                    })
                    .filter(a => !!a)
                    .startWith(editor.getCursorBufferPosition())
                    .map(bufferPt => ({ bufferPt, range: this._getWordRange(editor, bufferPt) }))
                    .filter(z => !!z.range)
                    .distinctUntilChanged((current, next) => current.range.isEqual(<any>next.range)));

            editor.onDidDestroy(() => cd.dispose());

            let eventDisposable: Subscription;
            cd.add(atom.config.observe('omnisharp-atom.enhancedHighlighting', (enabled: boolean) => {
                this.enhancedHighlighting = enabled;
                if (eventDisposable) {
                    eventDisposable.unsubscribe();
                    cd.remove(eventDisposable);
                }

                let observable = specialKeyDown;
                if (!enabled) {
                    observable = observable.debounceTime(200);
                }

                eventDisposable = observable
                    .subscribe(({ bufferPt, range }) => this._underlineIfNavigable(editor, bufferPt, range));

                cd.add(eventDisposable);
            }));

            cd.add(keyup.subscribe(() => this._removeMarker()));

            cd.add(click.subscribe(e => {
                if (!e.ctrlKey && !e.metaKey) {
                    return;
                }
                if (altGotoDefinition && !e.altKey) {
                    return;
                }

                this._removeMarker();
                this.goToDefinition();
            }));
            this.disposable.add(cd);
        }));

        this.disposable.add(atom.emitter.on('symbols-view:go-to-declaration', () => this.goToDefinition()));
        this.disposable.add(Omni.addTextEditorCommand('omnisharp-atom:go-to-definition', () => this.goToDefinition()));
        this.disposable.add(atom.config.observe('omnisharp-atom.wantMetadata', enabled => {
            this.wantMetadata = enabled;
        }));
    }

    public dispose() {
        this.disposable.dispose();
    }

    public goToDefinition() {
        const editor = atom.workspace.getActiveTextEditor();
        if (editor) {
            const word = <any>editor.getWordUnderCursor();
            Omni.request(editor, solution => solution.gotodefinition({
                WantMetadata: this.wantMetadata
            }))
                .subscribe((data: Models.GotoDefinitionResponse) => {
                    // tslint:disable-next-line:triple-equals
                    if (data.FileName != null) {
                        Omni.navigateTo(data);
                    } else if (data.MetadataSource) {
                        /* tslint:disable:variable-name */
                        const { AssemblyName, TypeName } = data.MetadataSource;
                        /* tslint:enable:variable-name */
                        atom.workspace.open(`omnisharp://metadata/${AssemblyName}/${TypeName}`, <any>{
                            initialLine: data.Line,
                            initialColumn: data.Column,
                            searchAllPanes: true
                        });
                    } else {
                        atom.notifications.addWarning(`Can't navigate to ${word}`);
                    }
                });
        }
    }

    private _getWordRange(editor: Atom.TextEditor, bufferPt: TextBuffer.Point): TextBuffer.Range {
        const buffer = editor.getBuffer();
        let startColumn = bufferPt.column;
        let endColumn = bufferPt.column;
        const line = buffer.getLines()[bufferPt.row];

        if (!/[A-Z_0-9]/i.test(line[bufferPt.column])) {
            if (this.marker) { this._removeMarker(); }
            return;
        }

        while (startColumn > 0 && /[A-Z_0-9]/i.test(line[--startColumn])) { /* */ }

        while (endColumn < line.length && /[A-Z_0-9]/i.test(line[++endColumn])) { /* */ }

        return new Range([bufferPt.row, startColumn + 1], [bufferPt.row, endColumn]);
    }

    private _underlineIfNavigable(editor: Atom.TextEditor, bufferPt: TextBuffer.Point, wordRange: TextBuffer.Range) {
        if (this.marker &&
            (<any>this.marker.bufferMarker).range &&
            (<any>this.marker.bufferMarker).range.compare(wordRange) === 0) {
            return;
        }

        let decoration: Atom.Marker;
        const addMark = () => {
            this._removeMarker();
            this.marker = editor.markBufferRange(wordRange);
            decoration = editor.decorateMarker(this.marker, { type: 'highlight', class: 'gotodefinition-underline' });
        };

        if (this.enhancedHighlighting) {
            const scopes: string[] = (<any>editor.scopeDescriptorForBufferPosition(bufferPt)).scopes;
            if (identifierRegex.test(last(scopes))) {
                addMark();
            }
        } else {
            // If enhanced highlighting is off, fallback to the old method.
            Omni.request(editor, solution => solution.gotodefinition({
                Line: bufferPt.row,
                Column: bufferPt.column
            })).filter(data => !!data.FileName || !!data.MetadataSource)
                .subscribe(data => addMark());
        }
    }

    private _pixelPositionFromMouseEvent(editor: Atom.TextEditor, editorView: any, event: MouseEvent) {
        const clientX = event.clientX;
        const clientY = event.clientY;
        const shadow = this._getFromShadowDom(editorView, '.lines')[0];
        if (!shadow) {
            return;
        }

        const linesClientRect = shadow.getBoundingClientRect();

        let top = clientY - linesClientRect.top;
        let left = clientX - linesClientRect.left;
        top += (<any>editor).getScrollTop();
        left += (<any>editor).getScrollLeft();
        return { top, left };
    }

    private _getFromShadowDom(element: JQuery, selector: string): JQuery {
        try {
            const el = element[0];
            const found = (<any>el).rootElement.querySelectorAll(selector);
            return $(found[0]);
        } catch (e) {
            return $(document.createElement('div'));
        }
    }

    private _removeMarker() {
        // tslint:disable-next-line:triple-equals
        if (this.marker != null) {
            this.marker.destroy();
            this.marker = null;
        }
    }
}

// tslint:disable-next-line:export-name
export const goToDefintion = new GoToDefinition();
