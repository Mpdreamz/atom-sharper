import _ = require('lodash');
import {CompositeDisposable, Subject, Observable} from "rx";
import Omni = require('../../omni-sharp-server/omni')
import SpacePen = require('atom-space-pen-views');
import CodeActionsView = require('../views/code-actions-view');
import Changes = require('./lib/apply-changes');

interface TemporaryCodeAction {
    Name: string;
    Id: number;
}

class CodeAction implements OmniSharp.IFeature {
    private disposable: Rx.CompositeDisposable;

    private view: SpacePen.SelectListView;

    public activate() {
        this.disposable = new CompositeDisposable();

        this.disposable.add(Omni.addTextEditorCommand("omnisharp-atom:get-code-actions", () => {
            //store the editor that this was triggered by.
            Omni.request(client => client.getcodeactions(client.makeRequest()));
        }));

        this.disposable.add(Omni.listener.observeGetcodeactions.subscribe((data) => {
            //hack: this is a temporary workaround until the server
            //can give us code actions based on an Id.
            var wrappedCodeActions = this.WrapCodeActionWithFakeIdGeneration(data.response)

            //pop ui to user.
            this.view = new CodeActionsView(wrappedCodeActions, (selectedItem) => {
                Omni.activeEditor
                    .first()
                    .subscribe(editor => {
                        Omni.request(editor, client => client.runcodeaction(client.makeDataRequest<OmniSharp.Models.CodeActionRequest>({
                            CodeAction: selectedItem.Id,
                            WantsTextChanges: true
                        }))).subscribe((response) => this.applyAllChanges(response.Changes));
                    });
            });
        }));

        this.disposable.add(Omni.editors.subscribe(editor => {
            var word, marker: Atom.Marker, subscription: Rx.Disposable;
            var makeLightbulbRequest = (position: TextBuffer.Point) => {
                if (subscription) subscription.dispose();

                subscription = Omni.request(client => client.getcodeactions(client.makeRequest(), { silent: true }))
                    .subscribe(response => {
                        if (response.CodeActions.length > 0) {
                            if (marker) {
                                marker.destroy();
                                marker = null;
                            }

                            var range = [[position.row, 0], [position.row, 0]];
                            marker = editor.markBufferRange(range);
                            editor.decorateMarker(marker, { type: "line-number", class: "quickfix" });
                        }
                    });
            };

            var update = _.debounce((pos: TextBuffer.Point) => {
                if (subscription) subscription.dispose();
                makeLightbulbRequest(pos);
            }, 400);

            this.disposable.add(editor.onDidChangeCursorPosition(e => {
                var oldPos = e.oldBufferPosition;
                var newPos = e.newBufferPosition;

                var newWord: string = <any>editor.getWordUnderCursor();
                if (word !== newWord || oldPos.row !== newPos.row) {
                    word = newWord;
                    if (marker) {
                        marker.destroy();
                        marker = null;
                    }

                    update(newPos);
                }
            }));
        }));
    }

    public dispose() {
        this.disposable.dispose();
    }

    private WrapCodeActionWithFakeIdGeneration(data: OmniSharp.Models.GetCodeActionsResponse): TemporaryCodeAction[] {
        var wrappedCodeActions: TemporaryCodeAction[] = [];
        for (var i = 0; i < data.CodeActions.length; i++) {
            wrappedCodeActions.push({ Name: data.CodeActions[i], Id: i });
        }
        return wrappedCodeActions;
    }

    public applyAllChanges(changes: any[]) {
        return _.each(changes, (change) => {
            atom.workspace.open(change.FileName, undefined)
                .then((editor) => { Changes.applyChanges(editor, change.Changes); })
        });
    }
}

export var codeAction = new CodeAction;
