import {CompositeDisposable} from "rx";
import Omni = require('../../omni-sharp-server/omni')

class Navigate implements OmniSharp.IFeature {
    private disposable: Rx.CompositeDisposable;

    public activate() {
        this.disposable = new CompositeDisposable();

        this.disposable.add(Omni.addTextEditorCommand("omnisharp-atom:navigate-up", () => {
            return this.navigateUp();
        }));

        this.disposable.add(Omni.addTextEditorCommand("omnisharp-atom:navigate-down", () => {
            return this.navigateDown();
        }));

        this.disposable.add(Omni.listener.navigateup.subscribe((data) => this.navigateTo(data.response)));
        this.disposable.add(Omni.listener.navigatedown.subscribe((data) => this.navigateTo(data.response)));
    }

    public dispose() {
        this.disposable.dispose();
    }

    public navigateUp() {
        Omni.request(solution => solution.navigateup({}));
    }

    public navigateDown() {
        Omni.request(solution => solution.navigatedown({}));
    }

    private navigateTo(data: OmniSharp.Models.NavigateResponse) {
        var editor = atom.workspace.getActiveTextEditor();
        Omni.navigateTo({ FileName: editor.getURI(), Line: data.Line, Column: data.Column });
    }

    public required = true;
    public title = 'Navigate';
    public description = 'Adds server based navigation support';
}
export var navigate = new Navigate;
