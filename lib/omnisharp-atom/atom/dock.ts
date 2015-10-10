import {CompositeDisposable, SingleAssignmentDisposable, Disposable, Subject} from "rx";
import * as _ from 'lodash';
import Omni = require('../../omni-sharp-server/omni')
import {DockWindow, DockPane, DockButton, IDockWindowProps, DocPaneOptions, DocButtonOptions} from '../views/dock-window';
import React = require('react');

class Dock implements OmniSharp.IAtomFeature {
    private disposable: Rx.CompositeDisposable;
    private view: Element;
    private dock: DockWindow<IDockWindowProps>;
    private _panes: DockPane[] = [];
    private _buttons: DockButton[] = [];

    public activate() {
        this.disposable = new CompositeDisposable();

        this.disposable.add(atom.commands.add('atom-workspace', "omnisharp-atom:toggle-dock", () => this.toggle()));
        this.disposable.add(atom.commands.add('atom-workspace', "omnisharp-atom:show-dock", () => this.show()));
        this.disposable.add(atom.commands.add('atom-workspace', "omnisharp-atom:hide-dock", () => this.hide()));
        this.disposable.add(atom.commands.add('atom-workspace', 'core:close', () => this.hide()));
        this.disposable.add(atom.commands.add('atom-workspace', 'core:cancel', () => this.hide()));
    }

    public attach() {
        var p = atom.workspace.addBottomPanel({
            item: document.createElement('span'),
            visible: false,
            priority: 1000
        });

        this.view = p.item.parentElement;
        this.view.classList.add('omnisharp-atom-pane');
        this.dock = <any>React.render(React.createElement<IDockWindowProps>(DockWindow, {
            panes: this._panes,
            buttons: this._buttons,
            panel: p
        }), this.view);

        this.dock.selectedWindow.subscribe(x => this._selectedWindow.onNext(x));

        this.disposable.add(Disposable.create(() => {
            React.unmountComponentAtNode(this.view);
            p.destroy();
            this.view.remove();
        }));
    }

    public dispose() {
        this.disposable.dispose();
    }

    public get isOpen() { return this.dock && this.dock.isOpen; }
    public get selected() { return this.dock && this.dock.selected; }

    public toggle() {
        if (this.dock)
            this.dock.toggleView();
    }

    public show() {
        if (this.dock)
            this.dock.showView();
    }

    public hide() {
        if (this.dock)
            this.dock.hideView();
    }

    public toggleWindow(selected: string) {
        this.dock.toggleWindow(selected);
    }

    public selectWindow(selected: string) {
        this.dock.selectWindow(selected);
    }

    private _selectedWindow = new Subject<string>();
    public get selectedWindow() { return this._selectedWindow.asObservable(); }

    public addWindow<P, S>(id: string, title: string, view: typeof React.Component, props: P, options: DocPaneOptions = { priority: 1000 }, parentDisposable?: Rx.Disposable) {
        var disposable = new SingleAssignmentDisposable();
        var cd = new CompositeDisposable();
        this.disposable.add(disposable);
        disposable.setDisposable(cd);

        if (parentDisposable)
            cd.add(parentDisposable);

        this._panes.push({ id, title, view, props, options, disposable });

        cd.add(atom.commands.add('atom-workspace', "omnisharp-atom:show-" + id, () => this.selectWindow(id)));
        cd.add(atom.commands.add('atom-workspace', "omnisharp-atom:toggle-" + id, () => this.toggleWindow(id)));

        if (options.closeable) {
            cd.add(atom.commands.add('atom-workspace', "omnisharp-atom:close-" + id, () => {
                this.disposable.remove(disposable);
                if (this.dock.selected === id) {
                    this.dock.state.selected = 'output';
                    this.hide();
                }
                disposable.dispose();
            }));
        }

        cd.add(Disposable.create(() => {
            _.remove(this._panes, { id });
            this.dock.state.selected = 'output';
            this.dock.forceUpdate();
        }));

        this._update();

        return <Rx.IDisposable>disposable;
    }

    public addWebComponentWindow(id: string, title: string, element: string, options: DocPaneOptions = { priority: 1000 }, parentDisposable?: Rx.Disposable) {
        var disposable = new SingleAssignmentDisposable();
        var cd = new CompositeDisposable();
        this.disposable.add(disposable);
        disposable.setDisposable(cd);

        if (parentDisposable)
            cd.add(parentDisposable);

        this._panes.push({ id, title, element, options, disposable });

        cd.add(atom.commands.add('atom-workspace', "omnisharp-atom:show-" + id, () => this.selectWindow(id)));
        cd.add(atom.commands.add('atom-workspace', "omnisharp-atom:toggle-" + id, () => this.toggleWindow(id)));

        if (options.closeable) {
            cd.add(atom.commands.add('atom-workspace', "omnisharp-atom:close-" + id, () => {
                this.disposable.remove(disposable);
                if (this.dock.selected === id) {
                    this.dock.state.selected = 'output';
                    this.hide();
                }
                disposable.dispose();
            }));
        }

        cd.add(Disposable.create(() => {
            _.remove(this._panes, { id });
            this.dock.state.selected = 'output';
            this.dock.forceUpdate();
        }));

        this._update();

        return <Rx.IDisposable>disposable;
    }

    public getWebComponentWindow(id: string) {
        return document.getElementById(`dock-${id}`);
    }

    public addButton<T>(id: string, title: string, view: React.HTMLElement, options: DocButtonOptions = { priority: 1000 }, parentDisposable?: Rx.Disposable) {
        var disposable = new SingleAssignmentDisposable();
        var cd = new CompositeDisposable();
        this.disposable.add(disposable);
        disposable.setDisposable(cd);

        if (parentDisposable)
            cd.add(parentDisposable);

        this._buttons.push({ id, title, view, options, disposable });

        cd.add(Disposable.create(() => {
            _.remove(this._buttons, { id });
            this.dock.forceUpdate();
        }));

        this._update();

        return <Rx.IDisposable>disposable;
    }

    private _update() {
        if (this.dock) {
            this.dock.forceUpdate();
        }
    }

    public required = true;
    public title = 'Dock';
    public description = 'The dock window used to show logs and diagnostics and other things.';
}

export var dock = new Dock;
