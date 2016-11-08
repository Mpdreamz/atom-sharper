"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _lodash = require("lodash");

var _lodash2 = _interopRequireDefault(_lodash);

var _rxjs = require("rxjs");

var _tsDisposables = require("ts-disposables");

var _path = require("path");

var _path2 = _interopRequireDefault(_path);

var _fs = require("fs");

var _fs2 = _interopRequireDefault(_fs);

var _omni = require("./server/omni");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var win32 = process.platform === "win32";

var OmniSharpAtom = function () {
    function OmniSharpAtom() {
        _classCallCheck(this, OmniSharpAtom);

        this.config = {
            autoStartOnCompatibleFile: {
                title: "Autostart Omnisharp Roslyn",
                description: "Automatically starts Omnisharp Roslyn when a compatible file is opened.",
                type: "boolean",
                default: true
            },
            developerMode: {
                title: "Developer Mode",
                description: "Outputs detailed server calls in console.log",
                type: "boolean",
                default: false
            },
            showDiagnosticsForAllSolutions: {
                title: "Show Diagnostics for all Solutions",
                description: "Advanced: This will show diagnostics for all open solutions.  NOTE: May take a restart or change to each server to take effect when turned on.",
                type: "boolean",
                default: false
            },
            enableAdvancedFileNew: {
                title: "Enable `Advanced File New`",
                description: "Enable `Advanced File New` when doing ctrl-n/cmd-n within a C# editor.",
                type: "boolean",
                default: false
            },
            useLeftLabelColumnForSuggestions: {
                title: "Use Left-Label column in Suggestions",
                description: "Shows return types in a right-aligned column to the left of the completion suggestion text.",
                type: "boolean",
                default: false
            },
            useIcons: {
                title: "Use unique icons for kind indicators in Suggestions",
                description: "Shows kinds with unique icons rather than autocomplete default styles.",
                type: "boolean",
                default: true
            },
            autoAdjustTreeView: {
                title: "Adjust the tree view to match the solution root.",
                descrption: "This will automatically adjust the treeview to be the root of the solution.",
                type: "boolean",
                default: false
            },
            nagAdjustTreeView: {
                title: "Show the notifications to Adjust the tree view",
                type: "boolean",
                default: true
            },
            autoAddExternalProjects: {
                title: "Add external projects to the tree view.",
                descrption: "This will automatically add external sources to the tree view.\n External sources are any projects that are loaded outside of the solution root.",
                type: "boolean",
                default: false
            },
            nagAddExternalProjects: {
                title: "Show the notifications to add or remove external projects",
                type: "boolean",
                default: true
            },
            hideLinterInterface: {
                title: "Hide the linter interface when using omnisharp-atom editors",
                type: "boolean",
                default: true
            },
            wantMetadata: {
                title: "Request metadata definition with Goto Definition",
                descrption: "Request symbol metadata from the server, when using go-to-definition.  This is disabled by default on Linux, due to issues with Roslyn on Mono.",
                type: "boolean",
                default: win32
            },
            altGotoDefinition: {
                title: "Alt Go To Definition",
                descrption: "Use the alt key instead of the ctrl/cmd key for goto defintion mouse over.",
                type: "boolean",
                default: false
            },
            showHiddenDiagnostics: {
                title: "Show 'Hidden' diagnostics in the linter",
                descrption: "Show or hide hidden diagnostics in the linter, this does not affect greying out of namespaces that are unused.",
                type: "boolean",
                default: true
            }
        };
    }

    _createClass(OmniSharpAtom, [{
        key: "activate",
        value: function activate(state) {
            var _this = this;

            this.disposable = new _tsDisposables.CompositeDisposable();
            this._started = new _rxjs.AsyncSubject();
            this._activated = new _rxjs.AsyncSubject();
            this.configureKeybindings();
            this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:toggle", function () {
                return _this.toggle();
            }));
            this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:fix-usings", function () {
                return _omni.Omni.request(function (solution) {
                    return solution.fixusings({});
                });
            }));
            this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:settings", function () {
                return atom.workspace.open("atom://config/packages").then(function (tab) {
                    if (tab && tab.getURI && tab.getURI() !== "atom://config/packages/omnisharp-atom") {
                        atom.workspace.open("atom://config/packages/omnisharp-atom");
                    }
                });
            }));
            var grammars = atom.grammars;
            var grammarCb = function grammarCb(grammar) {
                if (_lodash2.default.find(_omni.Omni.grammars, function (gmr) {
                    return gmr.scopeName === grammar.scopeName;
                })) {
                    atom.grammars.startIdForScope(grammar.scopeName);
                    var omnisharpScopeName = grammar.scopeName + ".omnisharp";
                    var scopeId = grammars.idsByScope[grammar.scopeName];
                    grammars.idsByScope[omnisharpScopeName] = scopeId;
                    grammars.scopesById[scopeId] = omnisharpScopeName;
                    grammar.scopeName = omnisharpScopeName;
                }
            };
            _lodash2.default.each(grammars.grammars, grammarCb);
            this.disposable.add(atom.grammars.onDidAddGrammar(grammarCb));
            require("atom-package-deps").install("omnisharp-atom").then(function () {
                console.info("Activating omnisharp-atom solution tracking...");
                _omni.Omni.activate();
                _this.disposable.add(_omni.Omni);
                _this._started.next(true);
                _this._started.complete();
            }).then(function () {
                return _this.loadFeatures(_this.getFeatures("atom").delay(_omni.Omni["_kick_in_the_pants_"] ? 0 : 2000)).toPromise();
            }).then(function () {
                var startingObservable = _omni.Omni.activeSolution.filter(function (z) {
                    return !!z;
                }).take(1);
                if (_omni.Omni["_kick_in_the_pants_"]) {
                    startingObservable = _rxjs.Observable.of(null);
                }
                _this.disposable.add(startingObservable.flatMap(function () {
                    return _this.loadFeatures(_this.getFeatures("features"));
                }).subscribe({
                    complete: function complete() {
                        _this.disposable.add(atom.workspace.observeTextEditors(function (editor) {
                            _this.detectAutoToggleGrammar(editor);
                        }));
                        _this._activated.next(true);
                        _this._activated.complete();
                    }
                }));
            });
        }
    }, {
        key: "getFeatures",
        value: function getFeatures(folder) {
            var _this2 = this;

            var whiteList = atom.config.get("omnisharp-atom:feature-white-list");
            var featureList = atom.config.get("omnisharp-atom:feature-list");
            var whiteListUndefined = typeof whiteList === "undefined";
            console.info("Getting features for \"" + folder + "\"...");
            var featureDir = __dirname + "/" + folder;
            function loadFeature(file) {
                var result = require("./" + folder + "/" + file);
                console.info("Loading feature \"" + folder + "/" + file + "\"...");
                return result;
            }
            return _rxjs.Observable.bindNodeCallback(_fs2.default.readdir)(featureDir).flatMap(function (files) {
                return files;
            }).filter(function (file) {
                return (/\.js$/.test(file)
                );
            }).flatMap(function (file) {
                return _rxjs.Observable.bindNodeCallback(_fs2.default.stat)(featureDir + "/" + file);
            }, function (file, stat) {
                return { file: file, stat: stat };
            }).filter(function (z) {
                return !z.stat.isDirectory();
            }).map(function (z) {
                return {
                    file: (folder + "/" + _path2.default.basename(z.file)).replace(/\.js$/, ""),
                    load: function load() {
                        var feature = loadFeature(z.file);
                        var features = [];
                        _lodash2.default.each(feature, function (value, key) {
                            if (!_lodash2.default.isFunction(value) && !_lodash2.default.isArray(value)) {
                                if (!value.required) {
                                    _this2.config[key] = {
                                        title: "" + value.title,
                                        description: value.description,
                                        type: "boolean",
                                        default: _lodash2.default.has(value, "default") ? value.default : true
                                    };
                                }
                                features.push({
                                    key: key, activate: function activate() {
                                        return _this2.activateFeature(whiteListUndefined, key, value);
                                    }
                                });
                            }
                        });
                        return _rxjs.Observable.from(features);
                    }
                };
            }).filter(function (l) {
                if (typeof whiteList === "undefined") {
                    return true;
                }
                if (whiteList) {
                    return _lodash2.default.includes(featureList, l.file);
                } else {
                    return !_lodash2.default.includes(featureList, l.file);
                }
            });
        }
    }, {
        key: "loadFeatures",
        value: function loadFeatures(features) {
            var _this3 = this;

            return features.concatMap(function (z) {
                return z.load();
            }).toArray().concatMap(function (x) {
                return x;
            }).map(function (f) {
                return f.activate();
            }).filter(function (x) {
                return !!x;
            }).toArray().do({
                complete: function complete() {
                    atom.config.setSchema("omnisharp-atom", {
                        type: "object",
                        properties: _this3.config
                    });
                }
            }).concatMap(function (x) {
                return x;
            }).do(function (x) {
                return x();
            });
        }
    }, {
        key: "activateFeature",
        value: function activateFeature(whiteListUndefined, key, value) {
            var _this4 = this;

            var result = null;
            var firstRun = true;
            if (whiteListUndefined && _lodash2.default.has(this.config, key)) {
                (function () {
                    var configKey = "omnisharp-atom." + key;
                    var enableDisposable = void 0,
                        disableDisposable = void 0;
                    _this4.disposable.add(atom.config.observe(configKey, function (enabled) {
                        if (!enabled) {
                            if (disableDisposable) {
                                disableDisposable.dispose();
                                _this4.disposable.remove(disableDisposable);
                                disableDisposable = null;
                            }
                            try {
                                value.dispose();
                            } catch (ex) {}
                            enableDisposable = atom.commands.add("atom-workspace", "omnisharp-feature:enable-" + _lodash2.default.kebabCase(key), function () {
                                return atom.config.set(configKey, true);
                            });
                            _this4.disposable.add(enableDisposable);
                        } else {
                            if (enableDisposable) {
                                enableDisposable.dispose();
                                _this4.disposable.remove(disableDisposable);
                                enableDisposable = null;
                            }
                            console.info("Activating feature \"" + key + "\"...");
                            value.activate();
                            if (_lodash2.default.isFunction(value["attach"])) {
                                if (firstRun) {
                                    result = function result() {
                                        console.info("Attaching feature \"" + key + "\"...");
                                        value["attach"]();
                                    };
                                } else {
                                    console.info("Attaching feature \"" + key + "\"...");
                                    value["attach"]();
                                }
                            }
                            disableDisposable = atom.commands.add("atom-workspace", "omnisharp-feature:disable-" + _lodash2.default.kebabCase(key), function () {
                                return atom.config.set(configKey, false);
                            });
                            _this4.disposable.add(disableDisposable);
                        }
                        firstRun = false;
                    }));
                    _this4.disposable.add(atom.commands.add("atom-workspace", "omnisharp-feature:toggle-" + _lodash2.default.kebabCase(key), function () {
                        return atom.config.set(configKey, !atom.config.get(configKey));
                    }));
                })();
            } else {
                value.activate();
                if (_lodash2.default.isFunction(value["attach"])) {
                    result = function result() {
                        console.info("Attaching feature \"" + key + "\"...");
                        value["attach"]();
                    };
                }
            }
            this.disposable.add(_tsDisposables.Disposable.create(function () {
                try {
                    value.dispose();
                } catch (ex) {}
            }));
            return result;
        }
    }, {
        key: "detectAutoToggleGrammar",
        value: function detectAutoToggleGrammar(editor) {
            var _this5 = this;

            var grammar = editor.getGrammar();
            this.detectGrammar(editor, grammar);
            this.disposable.add(editor.onDidChangeGrammar(function (gmr) {
                return _this5.detectGrammar(editor, gmr);
            }));
        }
    }, {
        key: "detectGrammar",
        value: function detectGrammar(editor, grammar) {
            if (!atom.config.get("omnisharp-atom.autoStartOnCompatibleFile")) {
                return;
            }
            if (_omni.Omni.isValidGrammar(grammar)) {
                if (_omni.Omni.isOff) {
                    this.toggle();
                }
            } else if (grammar.name === "JSON") {
                if (_path2.default.basename(editor.getPath()) === "project.json") {
                    if (_omni.Omni.isOff) {
                        this.toggle();
                    }
                }
            }
        }
    }, {
        key: "toggle",
        value: function toggle() {
            if (_omni.Omni.isOff) {
                _omni.Omni.connect();
            } else if (_omni.Omni.isOn) {
                _omni.Omni.disconnect();
            }
        }
    }, {
        key: "deactivate",
        value: function deactivate() {
            this.disposable.dispose();
        }
    }, {
        key: "consumeStatusBar",
        value: function consumeStatusBar(statusBar) {
            var f = require("./atom/status-bar");
            f.statusBar.setup(statusBar);
            f = require("./atom/framework-selector");
            f.frameworkSelector.setup(statusBar);
            f = require("./atom/feature-buttons");
            f.featureEditorButtons.setup(statusBar);
        }
    }, {
        key: "consumeYeomanEnvironment",
        value: function consumeYeomanEnvironment(generatorService) {
            var _require = require("./atom/generator-aspnet"),
                generatorAspnet = _require.generatorAspnet;

            generatorAspnet.setup(generatorService);
        }
    }, {
        key: "provideAutocomplete",
        value: function provideAutocomplete() {
            return require("./services/completion-provider");
        }
    }, {
        key: "provideLinter",
        value: function provideLinter() {
            return [];
        }
    }, {
        key: "provideProjectJson",
        value: function provideProjectJson() {
            return require("./services/project-provider").concat(require("./services/framework-provider"));
        }
    }, {
        key: "consumeLinter",
        value: function consumeLinter(linter) {
            var LinterProvider = require("./services/linter-provider");
            var linters = LinterProvider.provider;
            this.disposable.add(_tsDisposables.Disposable.create(function () {
                _lodash2.default.each(linters, function (l) {
                    linter.deleteLinter(l);
                });
            }));
            this.disposable.add(LinterProvider.init(linter));
        }
    }, {
        key: "consumeIndieLinter",
        value: function consumeIndieLinter(linter) {
            require("./services/linter-provider").registerIndie(linter, this.disposable);
        }
    }, {
        key: "configureKeybindings",
        value: function configureKeybindings() {
            var disposable = void 0;
            var omnisharpAdvancedFileNew = _omni.Omni.packageDir + "/omnisharp-atom/keymaps/omnisharp-file-new.cson";
            this.disposable.add(atom.config.observe("omnisharp-atom.enableAdvancedFileNew", function (enabled) {
                if (enabled) {
                    disposable = atom.keymaps.loadKeymap(omnisharpAdvancedFileNew);
                } else {
                    if (disposable) disposable.dispose();
                    atom.keymaps.removeBindingsFromSource(omnisharpAdvancedFileNew);
                }
            }));
        }
    }]);

    return OmniSharpAtom;
}();

module.exports = new OmniSharpAtom();
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9vbW5pc2hhcnAtYXRvbS5qcyIsImxpYi9vbW5pc2hhcnAtYXRvbS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7O0FBQUE7Ozs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7OztBQ0dBLElBQU0sUUFBUSxRQUFRLFFBQVIsS0FBcUIsT0FBckI7O0lBRWQ7QUFBQSw2QkFBQTs7O0FBZ1VXLGFBQUEsTUFBQSxHQUFTO0FBQ1osdUNBQTJCO0FBQ3ZCLHVCQUFPLDRCQUFQO0FBQ0EsNkJBQWEseUVBQWI7QUFDQSxzQkFBTSxTQUFOO0FBQ0EseUJBQVMsSUFBVDthQUpKO0FBTUEsMkJBQWU7QUFDWCx1QkFBTyxnQkFBUDtBQUNBLDZCQUFhLDhDQUFiO0FBQ0Esc0JBQU0sU0FBTjtBQUNBLHlCQUFTLEtBQVQ7YUFKSjtBQU1BLDRDQUFnQztBQUM1Qix1QkFBTyxvQ0FBUDtBQUNBLDZCQUFhLGdKQUFiO0FBQ0Esc0JBQU0sU0FBTjtBQUNBLHlCQUFTLEtBQVQ7YUFKSjtBQU1BLG1DQUF1QjtBQUNuQix1QkFBTyw0QkFBUDtBQUNBLDZCQUFhLHdFQUFiO0FBQ0Esc0JBQU0sU0FBTjtBQUNBLHlCQUFTLEtBQVQ7YUFKSjtBQU1BLDhDQUFrQztBQUM5Qix1QkFBTyxzQ0FBUDtBQUNBLDZCQUFhLDZGQUFiO0FBQ0Esc0JBQU0sU0FBTjtBQUNBLHlCQUFTLEtBQVQ7YUFKSjtBQU1BLHNCQUFVO0FBQ04sdUJBQU8scURBQVA7QUFDQSw2QkFBYSx3RUFBYjtBQUNBLHNCQUFNLFNBQU47QUFDQSx5QkFBUyxJQUFUO2FBSko7QUFNQSxnQ0FBb0I7QUFDaEIsdUJBQU8sa0RBQVA7QUFDQSw0QkFBWSw2RUFBWjtBQUNBLHNCQUFNLFNBQU47QUFDQSx5QkFBUyxLQUFUO2FBSko7QUFNQSwrQkFBbUI7QUFDZix1QkFBTyxnREFBUDtBQUNBLHNCQUFNLFNBQU47QUFDQSx5QkFBUyxJQUFUO2FBSEo7QUFLQSxxQ0FBeUI7QUFDckIsdUJBQU8seUNBQVA7QUFDQSw0QkFBWSxrSkFBWjtBQUNBLHNCQUFNLFNBQU47QUFDQSx5QkFBUyxLQUFUO2FBSko7QUFNQSxvQ0FBd0I7QUFDcEIsdUJBQU8sMkRBQVA7QUFDQSxzQkFBTSxTQUFOO0FBQ0EseUJBQVMsSUFBVDthQUhKO0FBS0EsaUNBQXFCO0FBQ2pCLHVCQUFPLDZEQUFQO0FBQ0Esc0JBQU0sU0FBTjtBQUNBLHlCQUFTLElBQVQ7YUFISjtBQUtBLDBCQUFjO0FBQ1YsdUJBQU8sa0RBQVA7QUFDQSw0QkFBWSxpSkFBWjtBQUNBLHNCQUFNLFNBQU47QUFDQSx5QkFBUyxLQUFUO2FBSko7QUFNQSwrQkFBbUI7QUFDZix1QkFBTyxzQkFBUDtBQUNBLDRCQUFZLDRFQUFaO0FBQ0Esc0JBQU0sU0FBTjtBQUNBLHlCQUFTLEtBQVQ7YUFKSjtBQU1BLG1DQUF1QjtBQUNuQix1QkFBTyx5Q0FBUDtBQUNBLDRCQUFZLGdIQUFaO0FBQ0Esc0JBQU0sU0FBTjtBQUNBLHlCQUFTLElBQVQ7YUFKSjtTQTVFRyxDQWhVWDtLQUFBOzs7O2lDQU1vQixPQUFVOzs7QUFDdEIsaUJBQUssVUFBTCxHQUFrQix3Q0FBbEIsQ0FEc0I7QUFFdEIsaUJBQUssUUFBTCxHQUFnQix3QkFBaEIsQ0FGc0I7QUFHdEIsaUJBQUssVUFBTCxHQUFrQix3QkFBbEIsQ0FIc0I7QUFLdEIsaUJBQUssb0JBQUwsR0FMc0I7QUFPdEIsaUJBQUssVUFBTCxDQUFnQixHQUFoQixDQUFvQixLQUFLLFFBQUwsQ0FBYyxHQUFkLENBQWtCLGdCQUFsQixFQUFvQyx1QkFBcEMsRUFBNkQ7dUJBQU0sTUFBSyxNQUFMO2FBQU4sQ0FBakYsRUFQc0I7QUFRdEIsaUJBQUssVUFBTCxDQUFnQixHQUFoQixDQUFvQixLQUFLLFFBQUwsQ0FBYyxHQUFkLENBQWtCLGdCQUFsQixFQUFvQywyQkFBcEMsRUFBaUU7dUJBQU0sV0FBSyxPQUFMLENBQWE7MkJBQVksU0FBUyxTQUFULENBQW1CLEVBQW5CO2lCQUFaO2FBQW5CLENBQXJGLEVBUnNCO0FBU3RCLGlCQUFLLFVBQUwsQ0FBZ0IsR0FBaEIsQ0FBb0IsS0FBSyxRQUFMLENBQWMsR0FBZCxDQUFrQixnQkFBbEIsRUFBb0MseUJBQXBDLEVBQStEO3VCQUFNLEtBQUssU0FBTCxDQUFlLElBQWYsQ0FBb0Isd0JBQXBCLEVBQ3BGLElBRG9GLENBQy9FLGVBQUc7QUFDTCx3QkFBSSxPQUFPLElBQUksTUFBSixJQUFjLElBQUksTUFBSixPQUFpQix1Q0FBakIsRUFBMEQ7QUFDL0UsNkJBQUssU0FBTCxDQUFlLElBQWYsQ0FBb0IsdUNBQXBCLEVBRCtFO3FCQUFuRjtpQkFERTthQUR5RSxDQUFuRixFQVRzQjtBQWdCdEIsZ0JBQU0sV0FBaUIsS0FBSyxRQUFMLENBaEJEO0FBaUJ0QixnQkFBTSxZQUFZLFNBQVosU0FBWSxDQUFDLE9BQUQsRUFBZ0M7QUFDOUMsb0JBQUksaUJBQUUsSUFBRixDQUFPLFdBQUssUUFBTCxFQUFlLFVBQUMsR0FBRDsyQkFBYyxJQUFJLFNBQUosS0FBa0IsUUFBUSxTQUFSO2lCQUFoQyxDQUExQixFQUE4RTtBQUUxRSx5QkFBSyxRQUFMLENBQWMsZUFBZCxDQUE4QixRQUFRLFNBQVIsQ0FBOUIsQ0FGMEU7QUFJMUUsd0JBQU0scUJBQXdCLFFBQVEsU0FBUixlQUF4QixDQUpvRTtBQUsxRSx3QkFBTSxVQUFVLFNBQVMsVUFBVCxDQUFvQixRQUFRLFNBQVIsQ0FBOUIsQ0FMb0U7QUFNMUUsNkJBQVMsVUFBVCxDQUFvQixrQkFBcEIsSUFBMEMsT0FBMUMsQ0FOMEU7QUFPMUUsNkJBQVMsVUFBVCxDQUFvQixPQUFwQixJQUErQixrQkFBL0IsQ0FQMEU7QUFRMUUsNEJBQVEsU0FBUixHQUFvQixrQkFBcEIsQ0FSMEU7aUJBQTlFO2FBRGMsQ0FqQkk7QUE2QnRCLDZCQUFFLElBQUYsQ0FBTyxTQUFTLFFBQVQsRUFBbUIsU0FBMUIsRUE3QnNCO0FBOEJ0QixpQkFBSyxVQUFMLENBQWdCLEdBQWhCLENBQW9CLEtBQUssUUFBTCxDQUFjLGVBQWQsQ0FBOEIsU0FBOUIsQ0FBcEIsRUE5QnNCO0FBZ0N0QixvQkFBUSxtQkFBUixFQUE2QixPQUE3QixDQUFxQyxnQkFBckMsRUFDSyxJQURMLENBQ1UsWUFBQTtBQUNGLHdCQUFRLElBQVIsQ0FBYSxnREFBYixFQURFO0FBRUYsMkJBQUssUUFBTCxHQUZFO0FBR0Ysc0JBQUssVUFBTCxDQUFnQixHQUFoQixhQUhFO0FBS0Ysc0JBQUssUUFBTCxDQUFjLElBQWQsQ0FBbUIsSUFBbkIsRUFMRTtBQU1GLHNCQUFLLFFBQUwsQ0FBYyxRQUFkLEdBTkU7YUFBQSxDQURWLENBVUssSUFWTCxDQVVVO3VCQUFNLE1BQUssWUFBTCxDQUFrQixNQUFLLFdBQUwsQ0FBaUIsTUFBakIsRUFBeUIsS0FBekIsQ0FBK0IsV0FBSyxxQkFBTCxJQUE4QixDQUE5QixHQUFrQyxJQUFsQyxDQUFqRCxFQUEwRixTQUExRjthQUFOLENBVlYsQ0FZSyxJQVpMLENBWVUsWUFBQTtBQUNGLG9CQUFJLHFCQUFxQixXQUFLLGNBQUwsQ0FDcEIsTUFEb0IsQ0FDYjsyQkFBSyxDQUFDLENBQUMsQ0FBRDtpQkFBTixDQURhLENBRXBCLElBRm9CLENBRWYsQ0FGZSxDQUFyQixDQURGO0FBTUYsb0JBQUksV0FBSyxxQkFBTCxDQUFKLEVBQWlDO0FBQzdCLHlDQUFxQixpQkFBVyxFQUFYLENBQWMsSUFBZCxDQUFyQixDQUQ2QjtpQkFBakM7QUFNQSxzQkFBSyxVQUFMLENBQWdCLEdBQWhCLENBQW9CLG1CQUNmLE9BRGUsQ0FDUDsyQkFBTSxNQUFLLFlBQUwsQ0FBa0IsTUFBSyxXQUFMLENBQWlCLFVBQWpCLENBQWxCO2lCQUFOLENBRE8sQ0FFZixTQUZlLENBRUw7QUFDUCw4QkFBVSxvQkFBQTtBQUNOLDhCQUFLLFVBQUwsQ0FBZ0IsR0FBaEIsQ0FBb0IsS0FBSyxTQUFMLENBQWUsa0JBQWYsQ0FBa0MsVUFBQyxNQUFELEVBQXdCO0FBQzFFLGtDQUFLLHVCQUFMLENBQTZCLE1BQTdCLEVBRDBFO3lCQUF4QixDQUF0RCxFQURNO0FBS04sOEJBQUssVUFBTCxDQUFnQixJQUFoQixDQUFxQixJQUFyQixFQUxNO0FBTU4sOEJBQUssVUFBTCxDQUFnQixRQUFoQixHQU5NO3FCQUFBO2lCQUhFLENBQXBCLEVBWkU7YUFBQSxDQVpWLENBaENzQjs7OztvQ0F3RVAsUUFBYzs7O0FBQzdCLGdCQUFNLFlBQVksS0FBSyxNQUFMLENBQVksR0FBWixDQUF5QixtQ0FBekIsQ0FBWixDQUR1QjtBQUU3QixnQkFBTSxjQUFjLEtBQUssTUFBTCxDQUFZLEdBQVosQ0FBMEIsNkJBQTFCLENBQWQsQ0FGdUI7QUFHN0IsZ0JBQU0scUJBQXNCLE9BQU8sU0FBUCxLQUFxQixXQUFyQixDQUhDO0FBSzdCLG9CQUFRLElBQVIsNkJBQXNDLGdCQUF0QyxFQUw2QjtBQU83QixnQkFBTSxhQUFnQixrQkFBYSxNQUE3QixDQVB1QjtBQVM3QixxQkFBQSxXQUFBLENBQXFCLElBQXJCLEVBQWlDO0FBQzdCLG9CQUFNLFNBQVMsZUFBYSxlQUFVLElBQXZCLENBQVQsQ0FEdUI7QUFFN0Isd0JBQVEsSUFBUix3QkFBaUMsZUFBVSxjQUEzQyxFQUY2QjtBQUc3Qix1QkFBTyxNQUFQLENBSDZCO2FBQWpDO0FBTUEsbUJBQU8saUJBQVcsZ0JBQVgsQ0FBNEIsYUFBRyxPQUFILENBQTVCLENBQXdDLFVBQXhDLEVBQ0YsT0FERSxDQUNNO3VCQUFTO2FBQVQsQ0FETixDQUVGLE1BRkUsQ0FFSzt1QkFBUSxTQUFRLElBQVIsQ0FBYSxJQUFiOzthQUFSLENBRkwsQ0FHRixPQUhFLENBR007dUJBQVEsaUJBQVcsZ0JBQVgsQ0FBNEIsYUFBRyxJQUFILENBQTVCLENBQXdDLG1CQUFjLElBQXREO2FBQVIsRUFBdUUsVUFBQyxJQUFELEVBQU8sSUFBUDt1QkFBaUIsRUFBRSxVQUFGLEVBQVEsVUFBUjthQUFqQixDQUg3RSxDQUlGLE1BSkUsQ0FJSzt1QkFBSyxDQUFDLEVBQUUsSUFBRixDQUFPLFdBQVAsRUFBRDthQUFMLENBSkwsQ0FLRixHQUxFLENBS0U7dUJBQU07QUFDUCwwQkFBTSxDQUFHLGVBQVUsZUFBSyxRQUFMLENBQWMsRUFBRSxJQUFGLEVBQTNCLENBQXFDLE9BQXJDLENBQTZDLE9BQTdDLEVBQXNELEVBQXRELENBQU47QUFDQSwwQkFBTSxnQkFBQTtBQUNGLDRCQUFNLFVBQVUsWUFBWSxFQUFFLElBQUYsQ0FBdEIsQ0FESjtBQUdGLDRCQUFNLFdBQTBELEVBQTFELENBSEo7QUFJRix5Q0FBRSxJQUFGLENBQU8sT0FBUCxFQUFnQixVQUFDLEtBQUQsRUFBa0IsR0FBbEIsRUFBNkI7QUFDekMsZ0NBQUksQ0FBQyxpQkFBRSxVQUFGLENBQWEsS0FBYixDQUFELElBQXdCLENBQUMsaUJBQUUsT0FBRixDQUFVLEtBQVYsQ0FBRCxFQUFtQjtBQUMzQyxvQ0FBSSxDQUFDLE1BQU0sUUFBTixFQUFnQjtBQUNqQiwyQ0FBSyxNQUFMLENBQVksR0FBWixJQUFtQjtBQUNmLG9EQUFVLE1BQU0sS0FBTjtBQUNWLHFEQUFhLE1BQU0sV0FBTjtBQUNiLDhDQUFNLFNBQU47QUFDQSxpREFBVSxpQkFBRSxHQUFGLENBQU0sS0FBTixFQUFhLFNBQWIsSUFBMEIsTUFBTSxPQUFOLEdBQWdCLElBQTFDO3FDQUpkLENBRGlCO2lDQUFyQjtBQVNBLHlDQUFTLElBQVQsQ0FBYztBQUNWLDRDQURVLEVBQ0wsVUFBVSxvQkFBQTtBQUNYLCtDQUFPLE9BQUssZUFBTCxDQUFxQixrQkFBckIsRUFBeUMsR0FBekMsRUFBOEMsS0FBOUMsQ0FBUCxDQURXO3FDQUFBO2lDQURuQixFQVYyQzs2QkFBL0M7eUJBRFksQ0FBaEIsQ0FKRTtBQXVCRiwrQkFBTyxpQkFBVyxJQUFYLENBQTZELFFBQTdELENBQVAsQ0F2QkU7cUJBQUE7O2FBRkwsQ0FMRixDQWlDRixNQWpDRSxDQWlDSyxhQUFDO0FBQ0wsb0JBQUksT0FBTyxTQUFQLEtBQXFCLFdBQXJCLEVBQWtDO0FBQ2xDLDJCQUFPLElBQVAsQ0FEa0M7aUJBQXRDO0FBSUEsb0JBQUksU0FBSixFQUFlO0FBQ1gsMkJBQU8saUJBQUUsUUFBRixDQUFXLFdBQVgsRUFBd0IsRUFBRSxJQUFGLENBQS9CLENBRFc7aUJBQWYsTUFFTztBQUNILDJCQUFPLENBQUMsaUJBQUUsUUFBRixDQUFXLFdBQVgsRUFBd0IsRUFBRSxJQUFGLENBQXpCLENBREo7aUJBRlA7YUFMSSxDQWpDWixDQWY2Qjs7OztxQ0E2RGIsVUFBMkc7OztBQUMzSCxtQkFBTyxTQUNGLFNBREUsQ0FDUTt1QkFBSyxFQUFFLElBQUY7YUFBTCxDQURSLENBRUYsT0FGRSxHQUdGLFNBSEUsQ0FHUTt1QkFBSzthQUFMLENBSFIsQ0FJRixHQUpFLENBSUU7dUJBQUssRUFBRSxRQUFGO2FBQUwsQ0FKRixDQUtGLE1BTEUsQ0FLSzt1QkFBSyxDQUFDLENBQUMsQ0FBRDthQUFOLENBTEwsQ0FNRixPQU5FLEdBT0YsRUFQRSxDQU9DO0FBQ0EsMEJBQVUsb0JBQUE7QUFDQSx5QkFBSyxNQUFMLENBQWEsU0FBYixDQUF1QixnQkFBdkIsRUFBeUM7QUFDM0MsOEJBQU0sUUFBTjtBQUNBLG9DQUFZLE9BQUssTUFBTDtxQkFGVixFQURBO2lCQUFBO2FBUlgsRUFlRixTQWZFLENBZVE7dUJBQUs7YUFBTCxDQWZSLENBZ0JGLEVBaEJFLENBZ0JDO3VCQUFLO2FBQUwsQ0FoQlIsQ0FEMkg7Ozs7d0NBb0J4RyxvQkFBNkIsS0FBYSxPQUFlOzs7QUFDNUUsZ0JBQUksU0FBcUIsSUFBckIsQ0FEd0U7QUFFNUUsZ0JBQUksV0FBVyxJQUFYLENBRndFO0FBSzVFLGdCQUFJLHNCQUFzQixpQkFBRSxHQUFGLENBQU0sS0FBSyxNQUFMLEVBQWEsR0FBbkIsQ0FBdEIsRUFBK0M7O0FBQy9DLHdCQUFNLGdDQUE4QixHQUE5QjtBQUNOLHdCQUFJLHlCQUFKO3dCQUFtQywwQkFBbkM7QUFDQSwyQkFBSyxVQUFMLENBQWdCLEdBQWhCLENBQW9CLEtBQUssTUFBTCxDQUFZLE9BQVosQ0FBb0IsU0FBcEIsRUFBK0IsbUJBQU87QUFDdEQsNEJBQUksQ0FBQyxPQUFELEVBQVU7QUFDVixnQ0FBSSxpQkFBSixFQUF1QjtBQUNuQixrREFBa0IsT0FBbEIsR0FEbUI7QUFFbkIsdUNBQUssVUFBTCxDQUFnQixNQUFoQixDQUF1QixpQkFBdkIsRUFGbUI7QUFHbkIsb0RBQW9CLElBQXBCLENBSG1COzZCQUF2QjtBQU1BLGdDQUFJO0FBQUUsc0NBQU0sT0FBTixHQUFGOzZCQUFKLENBQXlCLE9BQU8sRUFBUCxFQUFXLEVBQVg7QUFFekIsK0NBQW1CLEtBQUssUUFBTCxDQUFjLEdBQWQsQ0FBa0IsZ0JBQWxCLGdDQUFnRSxpQkFBRSxTQUFGLENBQVksR0FBWixDQUFoRSxFQUFvRjt1Q0FBTSxLQUFLLE1BQUwsQ0FBWSxHQUFaLENBQWdCLFNBQWhCLEVBQTJCLElBQTNCOzZCQUFOLENBQXZHLENBVFU7QUFVVixtQ0FBSyxVQUFMLENBQWdCLEdBQWhCLENBQW9CLGdCQUFwQixFQVZVO3lCQUFkLE1BV087QUFDSCxnQ0FBSSxnQkFBSixFQUFzQjtBQUNsQixpREFBaUIsT0FBakIsR0FEa0I7QUFFbEIsdUNBQUssVUFBTCxDQUFnQixNQUFoQixDQUF1QixpQkFBdkIsRUFGa0I7QUFHbEIsbURBQW1CLElBQW5CLENBSGtCOzZCQUF0QjtBQU1BLG9DQUFRLElBQVIsMkJBQW9DLGFBQXBDLEVBUEc7QUFRSCxrQ0FBTSxRQUFOLEdBUkc7QUFVSCxnQ0FBSSxpQkFBRSxVQUFGLENBQWEsTUFBTSxRQUFOLENBQWIsQ0FBSixFQUFtQztBQUMvQixvQ0FBSSxRQUFKLEVBQWM7QUFDViw2Q0FBUyxrQkFBQTtBQUNMLGdEQUFRLElBQVIsMEJBQW1DLGFBQW5DLEVBREs7QUFFTCw4Q0FBTSxRQUFOLElBRks7cUNBQUEsQ0FEQztpQ0FBZCxNQUtPO0FBQ0gsNENBQVEsSUFBUiwwQkFBbUMsYUFBbkMsRUFERztBQUVILDBDQUFNLFFBQU4sSUFGRztpQ0FMUDs2QkFESjtBQVlBLGdEQUFvQixLQUFLLFFBQUwsQ0FBYyxHQUFkLENBQWtCLGdCQUFsQixpQ0FBaUUsaUJBQUUsU0FBRixDQUFZLEdBQVosQ0FBakUsRUFBcUY7dUNBQU0sS0FBSyxNQUFMLENBQVksR0FBWixDQUFnQixTQUFoQixFQUEyQixLQUEzQjs2QkFBTixDQUF6RyxDQXRCRztBQXVCSCxtQ0FBSyxVQUFMLENBQWdCLEdBQWhCLENBQW9CLGlCQUFwQixFQXZCRzt5QkFYUDtBQW9DQSxtQ0FBVyxLQUFYLENBckNzRDtxQkFBUCxDQUFuRDtBQXlDQSwyQkFBSyxVQUFMLENBQWdCLEdBQWhCLENBQW9CLEtBQUssUUFBTCxDQUFjLEdBQWQsQ0FBa0IsZ0JBQWxCLGdDQUFnRSxpQkFBRSxTQUFGLENBQVksR0FBWixDQUFoRSxFQUFvRjsrQkFBTSxLQUFLLE1BQUwsQ0FBWSxHQUFaLENBQWdCLFNBQWhCLEVBQTJCLENBQUMsS0FBSyxNQUFMLENBQVksR0FBWixDQUFnQixTQUFoQixDQUFEO3FCQUFqQyxDQUF4RztxQkE1QytDO2FBQW5ELE1BNkNPO0FBQ0gsc0JBQU0sUUFBTixHQURHO0FBR0gsb0JBQUksaUJBQUUsVUFBRixDQUFhLE1BQU0sUUFBTixDQUFiLENBQUosRUFBbUM7QUFDL0IsNkJBQVMsa0JBQUE7QUFDTCxnQ0FBUSxJQUFSLDBCQUFtQyxhQUFuQyxFQURLO0FBRUwsOEJBQU0sUUFBTixJQUZLO3FCQUFBLENBRHNCO2lCQUFuQzthQWhESjtBQXdEQSxpQkFBSyxVQUFMLENBQWdCLEdBQWhCLENBQW9CLDBCQUFXLE1BQVgsQ0FBa0IsWUFBQTtBQUFRLG9CQUFJO0FBQUUsMEJBQU0sT0FBTixHQUFGO2lCQUFKLENBQXlCLE9BQU8sRUFBUCxFQUFXLEVBQVg7YUFBakMsQ0FBdEMsRUE3RDRFO0FBOEQ1RSxtQkFBTyxNQUFQLENBOUQ0RTs7OztnREFpRWhELFFBQXVCOzs7QUFDbkQsZ0JBQU0sVUFBVSxPQUFPLFVBQVAsRUFBVixDQUQ2QztBQUVuRCxpQkFBSyxhQUFMLENBQW1CLE1BQW5CLEVBQTJCLE9BQTNCLEVBRm1EO0FBR25ELGlCQUFLLFVBQUwsQ0FBZ0IsR0FBaEIsQ0FBb0IsT0FBTyxrQkFBUCxDQUEwQixVQUFDLEdBQUQ7dUJBQTRCLE9BQUssYUFBTCxDQUFtQixNQUFuQixFQUEyQixHQUEzQjthQUE1QixDQUE5QyxFQUhtRDs7OztzQ0FNakMsUUFBeUIsU0FBMEI7QUFDckUsZ0JBQUksQ0FBQyxLQUFLLE1BQUwsQ0FBWSxHQUFaLENBQWdCLDBDQUFoQixDQUFELEVBQThEO0FBQzlELHVCQUQ4RDthQUFsRTtBQUlBLGdCQUFJLFdBQUssY0FBTCxDQUFvQixPQUFwQixDQUFKLEVBQWtDO0FBQzlCLG9CQUFJLFdBQUssS0FBTCxFQUFZO0FBQ1oseUJBQUssTUFBTCxHQURZO2lCQUFoQjthQURKLE1BSU8sSUFBSSxRQUFRLElBQVIsS0FBaUIsTUFBakIsRUFBeUI7QUFDaEMsb0JBQUksZUFBSyxRQUFMLENBQWMsT0FBTyxPQUFQLEVBQWQsTUFBb0MsY0FBcEMsRUFBb0Q7QUFDcEQsd0JBQUksV0FBSyxLQUFMLEVBQVk7QUFDWiw2QkFBSyxNQUFMLEdBRFk7cUJBQWhCO2lCQURKO2FBREc7Ozs7aUNBU0U7QUFDVCxnQkFBSSxXQUFLLEtBQUwsRUFBWTtBQUNaLDJCQUFLLE9BQUwsR0FEWTthQUFoQixNQUVPLElBQUksV0FBSyxJQUFMLEVBQVc7QUFDbEIsMkJBQUssVUFBTCxHQURrQjthQUFmOzs7O3FDQUtNO0FBQ2IsaUJBQUssVUFBTCxDQUFnQixPQUFoQixHQURhOzs7O3lDQUlPLFdBQWM7QUFDbEMsZ0JBQUksSUFBSSxRQUFRLG1CQUFSLENBQUosQ0FEOEI7QUFFbEMsY0FBRSxTQUFGLENBQVksS0FBWixDQUFrQixTQUFsQixFQUZrQztBQUdsQyxnQkFBSSxRQUFRLDJCQUFSLENBQUosQ0FIa0M7QUFJbEMsY0FBRSxpQkFBRixDQUFvQixLQUFwQixDQUEwQixTQUExQixFQUprQztBQUtsQyxnQkFBSSxRQUFRLHdCQUFSLENBQUosQ0FMa0M7QUFNbEMsY0FBRSxvQkFBRixDQUF1QixLQUF2QixDQUE2QixTQUE3QixFQU5rQzs7OztpREFVTixrQkFBcUI7MkJBQ3ZCLFFBQVEseUJBQVI7Z0JBQW5CLDJDQUQwQzs7QUFFakQsNEJBQWdCLEtBQWhCLENBQXNCLGdCQUF0QixFQUZpRDs7Ozs4Q0FLM0I7QUFDdEIsbUJBQU8sUUFBUSxnQ0FBUixDQUFQLENBRHNCOzs7O3dDQUlOO0FBQ2hCLG1CQUFPLEVBQVAsQ0FEZ0I7Ozs7NkNBTUs7QUFDckIsbUJBQU8sUUFBUSw2QkFBUixFQUF1QyxNQUF2QyxDQUE4QyxRQUFRLCtCQUFSLENBQTlDLENBQVAsQ0FEcUI7Ozs7c0NBSUosUUFBVztBQUM1QixnQkFBTSxpQkFBaUIsUUFBUSw0QkFBUixDQUFqQixDQURzQjtBQUU1QixnQkFBTSxVQUFVLGVBQWUsUUFBZixDQUZZO0FBSTVCLGlCQUFLLFVBQUwsQ0FBZ0IsR0FBaEIsQ0FBb0IsMEJBQVcsTUFBWCxDQUFrQixZQUFBO0FBQ2xDLGlDQUFFLElBQUYsQ0FBTyxPQUFQLEVBQWdCLGFBQUM7QUFDYiwyQkFBTyxZQUFQLENBQW9CLENBQXBCLEVBRGE7aUJBQUQsQ0FBaEIsQ0FEa0M7YUFBQSxDQUF0QyxFQUo0QjtBQVU1QixpQkFBSyxVQUFMLENBQWdCLEdBQWhCLENBQW9CLGVBQWUsSUFBZixDQUFvQixNQUFwQixDQUFwQixFQVY0Qjs7OzsyQ0FhTixRQUFXO0FBQ2pDLG9CQUFRLDRCQUFSLEVBQXNDLGFBQXRDLENBQW9ELE1BQXBELEVBQTRELEtBQUssVUFBTCxDQUE1RCxDQURpQzs7OzsrQ0FLVDtBQUN4QixnQkFBSSxtQkFBSixDQUR3QjtBQUV4QixnQkFBTSwyQkFBMkIsV0FBSyxVQUFMLEdBQWtCLGlEQUFsQixDQUZUO0FBR3hCLGlCQUFLLFVBQUwsQ0FBZ0IsR0FBaEIsQ0FBb0IsS0FBSyxNQUFMLENBQVksT0FBWixDQUFvQixzQ0FBcEIsRUFBNEQsVUFBQyxPQUFELEVBQWlCO0FBQzdGLG9CQUFJLE9BQUosRUFBYTtBQUNULGlDQUFhLEtBQUssT0FBTCxDQUFhLFVBQWIsQ0FBd0Isd0JBQXhCLENBQWIsQ0FEUztpQkFBYixNQUVPO0FBQ0gsd0JBQUksVUFBSixFQUFnQixXQUFXLE9BQVgsR0FBaEI7QUFDQSx5QkFBSyxPQUFMLENBQWEsd0JBQWIsQ0FBc0Msd0JBQXRDLEVBRkc7aUJBRlA7YUFENEUsQ0FBaEYsRUFId0I7Ozs7Ozs7QUFrR2hDLE9BQU8sT0FBUCxHQUFpQixJQUFJLGFBQUosRUFBakIiLCJmaWxlIjoibGliL29tbmlzaGFycC1hdG9tLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IF8gZnJvbSBcImxvZGFzaFwiO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZSwgQXN5bmNTdWJqZWN0IH0gZnJvbSBcInJ4anNcIjtcbmltcG9ydCB7IENvbXBvc2l0ZURpc3Bvc2FibGUsIERpc3Bvc2FibGUgfSBmcm9tIFwidHMtZGlzcG9zYWJsZXNcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgZnMgZnJvbSBcImZzXCI7XG5pbXBvcnQgeyBPbW5pIH0gZnJvbSBcIi4vc2VydmVyL29tbmlcIjtcbmNvbnN0IHdpbjMyID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gXCJ3aW4zMlwiO1xuY2xhc3MgT21uaVNoYXJwQXRvbSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuY29uZmlnID0ge1xuICAgICAgICAgICAgYXV0b1N0YXJ0T25Db21wYXRpYmxlRmlsZToge1xuICAgICAgICAgICAgICAgIHRpdGxlOiBcIkF1dG9zdGFydCBPbW5pc2hhcnAgUm9zbHluXCIsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiQXV0b21hdGljYWxseSBzdGFydHMgT21uaXNoYXJwIFJvc2x5biB3aGVuIGEgY29tcGF0aWJsZSBmaWxlIGlzIG9wZW5lZC5cIixcbiAgICAgICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiB0cnVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZGV2ZWxvcGVyTW9kZToge1xuICAgICAgICAgICAgICAgIHRpdGxlOiBcIkRldmVsb3BlciBNb2RlXCIsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiT3V0cHV0cyBkZXRhaWxlZCBzZXJ2ZXIgY2FsbHMgaW4gY29uc29sZS5sb2dcIixcbiAgICAgICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiBmYWxzZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHNob3dEaWFnbm9zdGljc0ZvckFsbFNvbHV0aW9uczoge1xuICAgICAgICAgICAgICAgIHRpdGxlOiBcIlNob3cgRGlhZ25vc3RpY3MgZm9yIGFsbCBTb2x1dGlvbnNcIixcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJBZHZhbmNlZDogVGhpcyB3aWxsIHNob3cgZGlhZ25vc3RpY3MgZm9yIGFsbCBvcGVuIHNvbHV0aW9ucy4gIE5PVEU6IE1heSB0YWtlIGEgcmVzdGFydCBvciBjaGFuZ2UgdG8gZWFjaCBzZXJ2ZXIgdG8gdGFrZSBlZmZlY3Qgd2hlbiB0dXJuZWQgb24uXCIsXG4gICAgICAgICAgICAgICAgdHlwZTogXCJib29sZWFuXCIsXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogZmFsc2VcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBlbmFibGVBZHZhbmNlZEZpbGVOZXc6IHtcbiAgICAgICAgICAgICAgICB0aXRsZTogXCJFbmFibGUgYEFkdmFuY2VkIEZpbGUgTmV3YFwiLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIkVuYWJsZSBgQWR2YW5jZWQgRmlsZSBOZXdgIHdoZW4gZG9pbmcgY3RybC1uL2NtZC1uIHdpdGhpbiBhIEMjIGVkaXRvci5cIixcbiAgICAgICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiBmYWxzZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHVzZUxlZnRMYWJlbENvbHVtbkZvclN1Z2dlc3Rpb25zOiB7XG4gICAgICAgICAgICAgICAgdGl0bGU6IFwiVXNlIExlZnQtTGFiZWwgY29sdW1uIGluIFN1Z2dlc3Rpb25zXCIsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiU2hvd3MgcmV0dXJuIHR5cGVzIGluIGEgcmlnaHQtYWxpZ25lZCBjb2x1bW4gdG8gdGhlIGxlZnQgb2YgdGhlIGNvbXBsZXRpb24gc3VnZ2VzdGlvbiB0ZXh0LlwiLFxuICAgICAgICAgICAgICAgIHR5cGU6IFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IGZhbHNlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdXNlSWNvbnM6IHtcbiAgICAgICAgICAgICAgICB0aXRsZTogXCJVc2UgdW5pcXVlIGljb25zIGZvciBraW5kIGluZGljYXRvcnMgaW4gU3VnZ2VzdGlvbnNcIixcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJTaG93cyBraW5kcyB3aXRoIHVuaXF1ZSBpY29ucyByYXRoZXIgdGhhbiBhdXRvY29tcGxldGUgZGVmYXVsdCBzdHlsZXMuXCIsXG4gICAgICAgICAgICAgICAgdHlwZTogXCJib29sZWFuXCIsXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogdHJ1ZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGF1dG9BZGp1c3RUcmVlVmlldzoge1xuICAgICAgICAgICAgICAgIHRpdGxlOiBcIkFkanVzdCB0aGUgdHJlZSB2aWV3IHRvIG1hdGNoIHRoZSBzb2x1dGlvbiByb290LlwiLFxuICAgICAgICAgICAgICAgIGRlc2NycHRpb246IFwiVGhpcyB3aWxsIGF1dG9tYXRpY2FsbHkgYWRqdXN0IHRoZSB0cmVldmlldyB0byBiZSB0aGUgcm9vdCBvZiB0aGUgc29sdXRpb24uXCIsXG4gICAgICAgICAgICAgICAgdHlwZTogXCJib29sZWFuXCIsXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogZmFsc2VcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBuYWdBZGp1c3RUcmVlVmlldzoge1xuICAgICAgICAgICAgICAgIHRpdGxlOiBcIlNob3cgdGhlIG5vdGlmaWNhdGlvbnMgdG8gQWRqdXN0IHRoZSB0cmVlIHZpZXdcIixcbiAgICAgICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiB0cnVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYXV0b0FkZEV4dGVybmFsUHJvamVjdHM6IHtcbiAgICAgICAgICAgICAgICB0aXRsZTogXCJBZGQgZXh0ZXJuYWwgcHJvamVjdHMgdG8gdGhlIHRyZWUgdmlldy5cIixcbiAgICAgICAgICAgICAgICBkZXNjcnB0aW9uOiBcIlRoaXMgd2lsbCBhdXRvbWF0aWNhbGx5IGFkZCBleHRlcm5hbCBzb3VyY2VzIHRvIHRoZSB0cmVlIHZpZXcuXFxuIEV4dGVybmFsIHNvdXJjZXMgYXJlIGFueSBwcm9qZWN0cyB0aGF0IGFyZSBsb2FkZWQgb3V0c2lkZSBvZiB0aGUgc29sdXRpb24gcm9vdC5cIixcbiAgICAgICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiBmYWxzZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG5hZ0FkZEV4dGVybmFsUHJvamVjdHM6IHtcbiAgICAgICAgICAgICAgICB0aXRsZTogXCJTaG93IHRoZSBub3RpZmljYXRpb25zIHRvIGFkZCBvciByZW1vdmUgZXh0ZXJuYWwgcHJvamVjdHNcIixcbiAgICAgICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiB0cnVlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgaGlkZUxpbnRlckludGVyZmFjZToge1xuICAgICAgICAgICAgICAgIHRpdGxlOiBcIkhpZGUgdGhlIGxpbnRlciBpbnRlcmZhY2Ugd2hlbiB1c2luZyBvbW5pc2hhcnAtYXRvbSBlZGl0b3JzXCIsXG4gICAgICAgICAgICAgICAgdHlwZTogXCJib29sZWFuXCIsXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogdHJ1ZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHdhbnRNZXRhZGF0YToge1xuICAgICAgICAgICAgICAgIHRpdGxlOiBcIlJlcXVlc3QgbWV0YWRhdGEgZGVmaW5pdGlvbiB3aXRoIEdvdG8gRGVmaW5pdGlvblwiLFxuICAgICAgICAgICAgICAgIGRlc2NycHRpb246IFwiUmVxdWVzdCBzeW1ib2wgbWV0YWRhdGEgZnJvbSB0aGUgc2VydmVyLCB3aGVuIHVzaW5nIGdvLXRvLWRlZmluaXRpb24uICBUaGlzIGlzIGRpc2FibGVkIGJ5IGRlZmF1bHQgb24gTGludXgsIGR1ZSB0byBpc3N1ZXMgd2l0aCBSb3NseW4gb24gTW9uby5cIixcbiAgICAgICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiB3aW4zMlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFsdEdvdG9EZWZpbml0aW9uOiB7XG4gICAgICAgICAgICAgICAgdGl0bGU6IFwiQWx0IEdvIFRvIERlZmluaXRpb25cIixcbiAgICAgICAgICAgICAgICBkZXNjcnB0aW9uOiBcIlVzZSB0aGUgYWx0IGtleSBpbnN0ZWFkIG9mIHRoZSBjdHJsL2NtZCBrZXkgZm9yIGdvdG8gZGVmaW50aW9uIG1vdXNlIG92ZXIuXCIsXG4gICAgICAgICAgICAgICAgdHlwZTogXCJib29sZWFuXCIsXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogZmFsc2VcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzaG93SGlkZGVuRGlhZ25vc3RpY3M6IHtcbiAgICAgICAgICAgICAgICB0aXRsZTogXCJTaG93ICdIaWRkZW4nIGRpYWdub3N0aWNzIGluIHRoZSBsaW50ZXJcIixcbiAgICAgICAgICAgICAgICBkZXNjcnB0aW9uOiBcIlNob3cgb3IgaGlkZSBoaWRkZW4gZGlhZ25vc3RpY3MgaW4gdGhlIGxpbnRlciwgdGhpcyBkb2VzIG5vdCBhZmZlY3QgZ3JleWluZyBvdXQgb2YgbmFtZXNwYWNlcyB0aGF0IGFyZSB1bnVzZWQuXCIsXG4gICAgICAgICAgICAgICAgdHlwZTogXCJib29sZWFuXCIsXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogdHJ1ZVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cbiAgICBhY3RpdmF0ZShzdGF0ZSkge1xuICAgICAgICB0aGlzLmRpc3Bvc2FibGUgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZTtcbiAgICAgICAgdGhpcy5fc3RhcnRlZCA9IG5ldyBBc3luY1N1YmplY3QoKTtcbiAgICAgICAgdGhpcy5fYWN0aXZhdGVkID0gbmV3IEFzeW5jU3ViamVjdCgpO1xuICAgICAgICB0aGlzLmNvbmZpZ3VyZUtleWJpbmRpbmdzKCk7XG4gICAgICAgIHRoaXMuZGlzcG9zYWJsZS5hZGQoYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCBcIm9tbmlzaGFycC1hdG9tOnRvZ2dsZVwiLCAoKSA9PiB0aGlzLnRvZ2dsZSgpKSk7XG4gICAgICAgIHRoaXMuZGlzcG9zYWJsZS5hZGQoYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCBcIm9tbmlzaGFycC1hdG9tOmZpeC11c2luZ3NcIiwgKCkgPT4gT21uaS5yZXF1ZXN0KHNvbHV0aW9uID0+IHNvbHV0aW9uLmZpeHVzaW5ncyh7fSkpKSk7XG4gICAgICAgIHRoaXMuZGlzcG9zYWJsZS5hZGQoYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCBcIm9tbmlzaGFycC1hdG9tOnNldHRpbmdzXCIsICgpID0+IGF0b20ud29ya3NwYWNlLm9wZW4oXCJhdG9tOi8vY29uZmlnL3BhY2thZ2VzXCIpXG4gICAgICAgICAgICAudGhlbih0YWIgPT4ge1xuICAgICAgICAgICAgaWYgKHRhYiAmJiB0YWIuZ2V0VVJJICYmIHRhYi5nZXRVUkkoKSAhPT0gXCJhdG9tOi8vY29uZmlnL3BhY2thZ2VzL29tbmlzaGFycC1hdG9tXCIpIHtcbiAgICAgICAgICAgICAgICBhdG9tLndvcmtzcGFjZS5vcGVuKFwiYXRvbTovL2NvbmZpZy9wYWNrYWdlcy9vbW5pc2hhcnAtYXRvbVwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkpKTtcbiAgICAgICAgY29uc3QgZ3JhbW1hcnMgPSBhdG9tLmdyYW1tYXJzO1xuICAgICAgICBjb25zdCBncmFtbWFyQ2IgPSAoZ3JhbW1hcikgPT4ge1xuICAgICAgICAgICAgaWYgKF8uZmluZChPbW5pLmdyYW1tYXJzLCAoZ21yKSA9PiBnbXIuc2NvcGVOYW1lID09PSBncmFtbWFyLnNjb3BlTmFtZSkpIHtcbiAgICAgICAgICAgICAgICBhdG9tLmdyYW1tYXJzLnN0YXJ0SWRGb3JTY29wZShncmFtbWFyLnNjb3BlTmFtZSk7XG4gICAgICAgICAgICAgICAgY29uc3Qgb21uaXNoYXJwU2NvcGVOYW1lID0gYCR7Z3JhbW1hci5zY29wZU5hbWV9Lm9tbmlzaGFycGA7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2NvcGVJZCA9IGdyYW1tYXJzLmlkc0J5U2NvcGVbZ3JhbW1hci5zY29wZU5hbWVdO1xuICAgICAgICAgICAgICAgIGdyYW1tYXJzLmlkc0J5U2NvcGVbb21uaXNoYXJwU2NvcGVOYW1lXSA9IHNjb3BlSWQ7XG4gICAgICAgICAgICAgICAgZ3JhbW1hcnMuc2NvcGVzQnlJZFtzY29wZUlkXSA9IG9tbmlzaGFycFNjb3BlTmFtZTtcbiAgICAgICAgICAgICAgICBncmFtbWFyLnNjb3BlTmFtZSA9IG9tbmlzaGFycFNjb3BlTmFtZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgXy5lYWNoKGdyYW1tYXJzLmdyYW1tYXJzLCBncmFtbWFyQ2IpO1xuICAgICAgICB0aGlzLmRpc3Bvc2FibGUuYWRkKGF0b20uZ3JhbW1hcnMub25EaWRBZGRHcmFtbWFyKGdyYW1tYXJDYikpO1xuICAgICAgICByZXF1aXJlKFwiYXRvbS1wYWNrYWdlLWRlcHNcIikuaW5zdGFsbChcIm9tbmlzaGFycC1hdG9tXCIpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oXCJBY3RpdmF0aW5nIG9tbmlzaGFycC1hdG9tIHNvbHV0aW9uIHRyYWNraW5nLi4uXCIpO1xuICAgICAgICAgICAgT21uaS5hY3RpdmF0ZSgpO1xuICAgICAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmFkZChPbW5pKTtcbiAgICAgICAgICAgIHRoaXMuX3N0YXJ0ZWQubmV4dCh0cnVlKTtcbiAgICAgICAgICAgIHRoaXMuX3N0YXJ0ZWQuY29tcGxldGUoKTtcbiAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMubG9hZEZlYXR1cmVzKHRoaXMuZ2V0RmVhdHVyZXMoXCJhdG9tXCIpLmRlbGF5KE9tbmlbXCJfa2lja19pbl90aGVfcGFudHNfXCJdID8gMCA6IDIwMDApKS50b1Byb21pc2UoKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIGxldCBzdGFydGluZ09ic2VydmFibGUgPSBPbW5pLmFjdGl2ZVNvbHV0aW9uXG4gICAgICAgICAgICAgICAgLmZpbHRlcih6ID0+ICEheilcbiAgICAgICAgICAgICAgICAudGFrZSgxKTtcbiAgICAgICAgICAgIGlmIChPbW5pW1wiX2tpY2tfaW5fdGhlX3BhbnRzX1wiXSkge1xuICAgICAgICAgICAgICAgIHN0YXJ0aW5nT2JzZXJ2YWJsZSA9IE9ic2VydmFibGUub2YobnVsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmRpc3Bvc2FibGUuYWRkKHN0YXJ0aW5nT2JzZXJ2YWJsZVxuICAgICAgICAgICAgICAgIC5mbGF0TWFwKCgpID0+IHRoaXMubG9hZEZlYXR1cmVzKHRoaXMuZ2V0RmVhdHVyZXMoXCJmZWF0dXJlc1wiKSkpXG4gICAgICAgICAgICAgICAgLnN1YnNjcmliZSh7XG4gICAgICAgICAgICAgICAgY29tcGxldGU6ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmFkZChhdG9tLndvcmtzcGFjZS5vYnNlcnZlVGV4dEVkaXRvcnMoKGVkaXRvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZXRlY3RBdXRvVG9nZ2xlR3JhbW1hcihlZGl0b3IpO1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2FjdGl2YXRlZC5uZXh0KHRydWUpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9hY3RpdmF0ZWQuY29tcGxldGUoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBnZXRGZWF0dXJlcyhmb2xkZXIpIHtcbiAgICAgICAgY29uc3Qgd2hpdGVMaXN0ID0gYXRvbS5jb25maWcuZ2V0KFwib21uaXNoYXJwLWF0b206ZmVhdHVyZS13aGl0ZS1saXN0XCIpO1xuICAgICAgICBjb25zdCBmZWF0dXJlTGlzdCA9IGF0b20uY29uZmlnLmdldChcIm9tbmlzaGFycC1hdG9tOmZlYXR1cmUtbGlzdFwiKTtcbiAgICAgICAgY29uc3Qgd2hpdGVMaXN0VW5kZWZpbmVkID0gKHR5cGVvZiB3aGl0ZUxpc3QgPT09IFwidW5kZWZpbmVkXCIpO1xuICAgICAgICBjb25zb2xlLmluZm8oYEdldHRpbmcgZmVhdHVyZXMgZm9yIFwiJHtmb2xkZXJ9XCIuLi5gKTtcbiAgICAgICAgY29uc3QgZmVhdHVyZURpciA9IGAke19fZGlybmFtZX0vJHtmb2xkZXJ9YDtcbiAgICAgICAgZnVuY3Rpb24gbG9hZEZlYXR1cmUoZmlsZSkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gcmVxdWlyZShgLi8ke2ZvbGRlcn0vJHtmaWxlfWApO1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKGBMb2FkaW5nIGZlYXR1cmUgXCIke2ZvbGRlcn0vJHtmaWxlfVwiLi4uYCk7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmJpbmROb2RlQ2FsbGJhY2soZnMucmVhZGRpcikoZmVhdHVyZURpcilcbiAgICAgICAgICAgIC5mbGF0TWFwKGZpbGVzID0+IGZpbGVzKVxuICAgICAgICAgICAgLmZpbHRlcihmaWxlID0+IC9cXC5qcyQvLnRlc3QoZmlsZSkpXG4gICAgICAgICAgICAuZmxhdE1hcChmaWxlID0+IE9ic2VydmFibGUuYmluZE5vZGVDYWxsYmFjayhmcy5zdGF0KShgJHtmZWF0dXJlRGlyfS8ke2ZpbGV9YCksIChmaWxlLCBzdGF0KSA9PiAoeyBmaWxlLCBzdGF0IH0pKVxuICAgICAgICAgICAgLmZpbHRlcih6ID0+ICF6LnN0YXQuaXNEaXJlY3RvcnkoKSlcbiAgICAgICAgICAgIC5tYXAoeiA9PiAoe1xuICAgICAgICAgICAgZmlsZTogYCR7Zm9sZGVyfS8ke3BhdGguYmFzZW5hbWUoei5maWxlKX1gLnJlcGxhY2UoL1xcLmpzJC8sIFwiXCIpLFxuICAgICAgICAgICAgbG9hZDogKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZlYXR1cmUgPSBsb2FkRmVhdHVyZSh6LmZpbGUpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZlYXR1cmVzID0gW107XG4gICAgICAgICAgICAgICAgXy5lYWNoKGZlYXR1cmUsICh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghXy5pc0Z1bmN0aW9uKHZhbHVlKSAmJiAhXy5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF2YWx1ZS5yZXF1aXJlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnW2tleV0gPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpdGxlOiBgJHt2YWx1ZS50aXRsZX1gLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogdmFsdWUuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OiAoXy5oYXModmFsdWUsIFwiZGVmYXVsdFwiKSA/IHZhbHVlLmRlZmF1bHQgOiB0cnVlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBmZWF0dXJlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBrZXksIGFjdGl2YXRlOiAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFjdGl2YXRlRmVhdHVyZSh3aGl0ZUxpc3RVbmRlZmluZWQsIGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUuZnJvbShmZWF0dXJlcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKVxuICAgICAgICAgICAgLmZpbHRlcihsID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygd2hpdGVMaXN0ID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAod2hpdGVMaXN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIF8uaW5jbHVkZXMoZmVhdHVyZUxpc3QsIGwuZmlsZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gIV8uaW5jbHVkZXMoZmVhdHVyZUxpc3QsIGwuZmlsZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBsb2FkRmVhdHVyZXMoZmVhdHVyZXMpIHtcbiAgICAgICAgcmV0dXJuIGZlYXR1cmVzXG4gICAgICAgICAgICAuY29uY2F0TWFwKHogPT4gei5sb2FkKCkpXG4gICAgICAgICAgICAudG9BcnJheSgpXG4gICAgICAgICAgICAuY29uY2F0TWFwKHggPT4geClcbiAgICAgICAgICAgIC5tYXAoZiA9PiBmLmFjdGl2YXRlKCkpXG4gICAgICAgICAgICAuZmlsdGVyKHggPT4gISF4KVxuICAgICAgICAgICAgLnRvQXJyYXkoKVxuICAgICAgICAgICAgLmRvKHtcbiAgICAgICAgICAgIGNvbXBsZXRlOiAoKSA9PiB7XG4gICAgICAgICAgICAgICAgYXRvbS5jb25maWcuc2V0U2NoZW1hKFwib21uaXNoYXJwLWF0b21cIiwge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB0aGlzLmNvbmZpZ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAgICAgLmNvbmNhdE1hcCh4ID0+IHgpXG4gICAgICAgICAgICAuZG8oeCA9PiB4KCkpO1xuICAgIH1cbiAgICBhY3RpdmF0ZUZlYXR1cmUod2hpdGVMaXN0VW5kZWZpbmVkLCBrZXksIHZhbHVlKSB7XG4gICAgICAgIGxldCByZXN1bHQgPSBudWxsO1xuICAgICAgICBsZXQgZmlyc3RSdW4gPSB0cnVlO1xuICAgICAgICBpZiAod2hpdGVMaXN0VW5kZWZpbmVkICYmIF8uaGFzKHRoaXMuY29uZmlnLCBrZXkpKSB7XG4gICAgICAgICAgICBjb25zdCBjb25maWdLZXkgPSBgb21uaXNoYXJwLWF0b20uJHtrZXl9YDtcbiAgICAgICAgICAgIGxldCBlbmFibGVEaXNwb3NhYmxlLCBkaXNhYmxlRGlzcG9zYWJsZTtcbiAgICAgICAgICAgIHRoaXMuZGlzcG9zYWJsZS5hZGQoYXRvbS5jb25maWcub2JzZXJ2ZShjb25maWdLZXksIGVuYWJsZWQgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghZW5hYmxlZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGlzYWJsZURpc3Bvc2FibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc2FibGVEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGlzcG9zYWJsZS5yZW1vdmUoZGlzYWJsZURpc3Bvc2FibGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGlzYWJsZURpc3Bvc2FibGUgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZS5kaXNwb3NlKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2F0Y2ggKGV4KSB7IH1cbiAgICAgICAgICAgICAgICAgICAgZW5hYmxlRGlzcG9zYWJsZSA9IGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwgYG9tbmlzaGFycC1mZWF0dXJlOmVuYWJsZS0ke18ua2ViYWJDYXNlKGtleSl9YCwgKCkgPT4gYXRvbS5jb25maWcuc2V0KGNvbmZpZ0tleSwgdHJ1ZSkpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRpc3Bvc2FibGUuYWRkKGVuYWJsZURpc3Bvc2FibGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVuYWJsZURpc3Bvc2FibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kaXNwb3NhYmxlLnJlbW92ZShkaXNhYmxlRGlzcG9zYWJsZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVEaXNwb3NhYmxlID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmluZm8oYEFjdGl2YXRpbmcgZmVhdHVyZSBcIiR7a2V5fVwiLi4uYCk7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlLmFjdGl2YXRlKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChfLmlzRnVuY3Rpb24odmFsdWVbXCJhdHRhY2hcIl0pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZmlyc3RSdW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuaW5mbyhgQXR0YWNoaW5nIGZlYXR1cmUgXCIke2tleX1cIi4uLmApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZVtcImF0dGFjaFwiXSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmluZm8oYEF0dGFjaGluZyBmZWF0dXJlIFwiJHtrZXl9XCIuLi5gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZVtcImF0dGFjaFwiXSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGRpc2FibGVEaXNwb3NhYmxlID0gYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCBgb21uaXNoYXJwLWZlYXR1cmU6ZGlzYWJsZS0ke18ua2ViYWJDYXNlKGtleSl9YCwgKCkgPT4gYXRvbS5jb25maWcuc2V0KGNvbmZpZ0tleSwgZmFsc2UpKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmFkZChkaXNhYmxlRGlzcG9zYWJsZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZpcnN0UnVuID0gZmFsc2U7XG4gICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB0aGlzLmRpc3Bvc2FibGUuYWRkKGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwgYG9tbmlzaGFycC1mZWF0dXJlOnRvZ2dsZS0ke18ua2ViYWJDYXNlKGtleSl9YCwgKCkgPT4gYXRvbS5jb25maWcuc2V0KGNvbmZpZ0tleSwgIWF0b20uY29uZmlnLmdldChjb25maWdLZXkpKSkpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFsdWUuYWN0aXZhdGUoKTtcbiAgICAgICAgICAgIGlmIChfLmlzRnVuY3Rpb24odmFsdWVbXCJhdHRhY2hcIl0pKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmluZm8oYEF0dGFjaGluZyBmZWF0dXJlIFwiJHtrZXl9XCIuLi5gKTtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVbXCJhdHRhY2hcIl0oKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuZGlzcG9zYWJsZS5hZGQoRGlzcG9zYWJsZS5jcmVhdGUoKCkgPT4geyB0cnkge1xuICAgICAgICAgICAgdmFsdWUuZGlzcG9zZSgpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChleCkgeyB9IH0pKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgZGV0ZWN0QXV0b1RvZ2dsZUdyYW1tYXIoZWRpdG9yKSB7XG4gICAgICAgIGNvbnN0IGdyYW1tYXIgPSBlZGl0b3IuZ2V0R3JhbW1hcigpO1xuICAgICAgICB0aGlzLmRldGVjdEdyYW1tYXIoZWRpdG9yLCBncmFtbWFyKTtcbiAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VHcmFtbWFyKChnbXIpID0+IHRoaXMuZGV0ZWN0R3JhbW1hcihlZGl0b3IsIGdtcikpKTtcbiAgICB9XG4gICAgZGV0ZWN0R3JhbW1hcihlZGl0b3IsIGdyYW1tYXIpIHtcbiAgICAgICAgaWYgKCFhdG9tLmNvbmZpZy5nZXQoXCJvbW5pc2hhcnAtYXRvbS5hdXRvU3RhcnRPbkNvbXBhdGlibGVGaWxlXCIpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKE9tbmkuaXNWYWxpZEdyYW1tYXIoZ3JhbW1hcikpIHtcbiAgICAgICAgICAgIGlmIChPbW5pLmlzT2ZmKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b2dnbGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChncmFtbWFyLm5hbWUgPT09IFwiSlNPTlwiKSB7XG4gICAgICAgICAgICBpZiAocGF0aC5iYXNlbmFtZShlZGl0b3IuZ2V0UGF0aCgpKSA9PT0gXCJwcm9qZWN0Lmpzb25cIikge1xuICAgICAgICAgICAgICAgIGlmIChPbW5pLmlzT2ZmKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9nZ2xlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHRvZ2dsZSgpIHtcbiAgICAgICAgaWYgKE9tbmkuaXNPZmYpIHtcbiAgICAgICAgICAgIE9tbmkuY29ubmVjdCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKE9tbmkuaXNPbikge1xuICAgICAgICAgICAgT21uaS5kaXNjb25uZWN0KCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZGVhY3RpdmF0ZSgpIHtcbiAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcbiAgICB9XG4gICAgY29uc3VtZVN0YXR1c0JhcihzdGF0dXNCYXIpIHtcbiAgICAgICAgbGV0IGYgPSByZXF1aXJlKFwiLi9hdG9tL3N0YXR1cy1iYXJcIik7XG4gICAgICAgIGYuc3RhdHVzQmFyLnNldHVwKHN0YXR1c0Jhcik7XG4gICAgICAgIGYgPSByZXF1aXJlKFwiLi9hdG9tL2ZyYW1ld29yay1zZWxlY3RvclwiKTtcbiAgICAgICAgZi5mcmFtZXdvcmtTZWxlY3Rvci5zZXR1cChzdGF0dXNCYXIpO1xuICAgICAgICBmID0gcmVxdWlyZShcIi4vYXRvbS9mZWF0dXJlLWJ1dHRvbnNcIik7XG4gICAgICAgIGYuZmVhdHVyZUVkaXRvckJ1dHRvbnMuc2V0dXAoc3RhdHVzQmFyKTtcbiAgICB9XG4gICAgY29uc3VtZVllb21hbkVudmlyb25tZW50KGdlbmVyYXRvclNlcnZpY2UpIHtcbiAgICAgICAgY29uc3QgeyBnZW5lcmF0b3JBc3BuZXQgfSA9IHJlcXVpcmUoXCIuL2F0b20vZ2VuZXJhdG9yLWFzcG5ldFwiKTtcbiAgICAgICAgZ2VuZXJhdG9yQXNwbmV0LnNldHVwKGdlbmVyYXRvclNlcnZpY2UpO1xuICAgIH1cbiAgICBwcm92aWRlQXV0b2NvbXBsZXRlKCkge1xuICAgICAgICByZXR1cm4gcmVxdWlyZShcIi4vc2VydmljZXMvY29tcGxldGlvbi1wcm92aWRlclwiKTtcbiAgICB9XG4gICAgcHJvdmlkZUxpbnRlcigpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbiAgICBwcm92aWRlUHJvamVjdEpzb24oKSB7XG4gICAgICAgIHJldHVybiByZXF1aXJlKFwiLi9zZXJ2aWNlcy9wcm9qZWN0LXByb3ZpZGVyXCIpLmNvbmNhdChyZXF1aXJlKFwiLi9zZXJ2aWNlcy9mcmFtZXdvcmstcHJvdmlkZXJcIikpO1xuICAgIH1cbiAgICBjb25zdW1lTGludGVyKGxpbnRlcikge1xuICAgICAgICBjb25zdCBMaW50ZXJQcm92aWRlciA9IHJlcXVpcmUoXCIuL3NlcnZpY2VzL2xpbnRlci1wcm92aWRlclwiKTtcbiAgICAgICAgY29uc3QgbGludGVycyA9IExpbnRlclByb3ZpZGVyLnByb3ZpZGVyO1xuICAgICAgICB0aGlzLmRpc3Bvc2FibGUuYWRkKERpc3Bvc2FibGUuY3JlYXRlKCgpID0+IHtcbiAgICAgICAgICAgIF8uZWFjaChsaW50ZXJzLCBsID0+IHtcbiAgICAgICAgICAgICAgICBsaW50ZXIuZGVsZXRlTGludGVyKGwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pKTtcbiAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmFkZChMaW50ZXJQcm92aWRlci5pbml0KGxpbnRlcikpO1xuICAgIH1cbiAgICBjb25zdW1lSW5kaWVMaW50ZXIobGludGVyKSB7XG4gICAgICAgIHJlcXVpcmUoXCIuL3NlcnZpY2VzL2xpbnRlci1wcm92aWRlclwiKS5yZWdpc3RlckluZGllKGxpbnRlciwgdGhpcy5kaXNwb3NhYmxlKTtcbiAgICB9XG4gICAgY29uZmlndXJlS2V5YmluZGluZ3MoKSB7XG4gICAgICAgIGxldCBkaXNwb3NhYmxlO1xuICAgICAgICBjb25zdCBvbW5pc2hhcnBBZHZhbmNlZEZpbGVOZXcgPSBPbW5pLnBhY2thZ2VEaXIgKyBcIi9vbW5pc2hhcnAtYXRvbS9rZXltYXBzL29tbmlzaGFycC1maWxlLW5ldy5jc29uXCI7XG4gICAgICAgIHRoaXMuZGlzcG9zYWJsZS5hZGQoYXRvbS5jb25maWcub2JzZXJ2ZShcIm9tbmlzaGFycC1hdG9tLmVuYWJsZUFkdmFuY2VkRmlsZU5ld1wiLCAoZW5hYmxlZCkgPT4ge1xuICAgICAgICAgICAgaWYgKGVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICBkaXNwb3NhYmxlID0gYXRvbS5rZXltYXBzLmxvYWRLZXltYXAob21uaXNoYXJwQWR2YW5jZWRGaWxlTmV3KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChkaXNwb3NhYmxlKVxuICAgICAgICAgICAgICAgICAgICBkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcbiAgICAgICAgICAgICAgICBhdG9tLmtleW1hcHMucmVtb3ZlQmluZGluZ3NGcm9tU291cmNlKG9tbmlzaGFycEFkdmFuY2VkRmlsZU5ldyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKTtcbiAgICB9XG59XG5tb2R1bGUuZXhwb3J0cyA9IG5ldyBPbW5pU2hhcnBBdG9tO1xuIiwiaW1wb3J0IF8gZnJvbSBcImxvZGFzaFwiO1xyXG5pbXBvcnQge09ic2VydmFibGUsIEFzeW5jU3ViamVjdH0gZnJvbSBcInJ4anNcIjtcclxuaW1wb3J0IHtDb21wb3NpdGVEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZX0gZnJvbSBcInRzLWRpc3Bvc2FibGVzXCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCBmcyBmcm9tIFwiZnNcIjtcclxuXHJcbi8vIFRPRE86IFJlbW92ZSB0aGVzZSBhdCBzb21lIHBvaW50IHRvIHN0cmVhbSBsaW5lIHN0YXJ0dXAuXHJcbmltcG9ydCB7T21uaX0gZnJvbSBcIi4vc2VydmVyL29tbmlcIjtcclxuY29uc3Qgd2luMzIgPSBwcm9jZXNzLnBsYXRmb3JtID09PSBcIndpbjMyXCI7XHJcblxyXG5jbGFzcyBPbW5pU2hhcnBBdG9tIHtcclxuICAgIHByaXZhdGUgZGlzcG9zYWJsZTogQ29tcG9zaXRlRGlzcG9zYWJsZTtcclxuICAgIC8vIEludGVybmFsOiBVc2VkIGJ5IHVuaXQgdGVzdGluZyB0byBtYWtlIHN1cmUgdGhlIHBsdWdpbiBpcyBjb21wbGV0ZWx5IGFjdGl2YXRlZC5cclxuICAgIHByaXZhdGUgX3N0YXJ0ZWQ6IEFzeW5jU3ViamVjdDxib29sZWFuPjtcclxuICAgIHByaXZhdGUgX2FjdGl2YXRlZDogQXN5bmNTdWJqZWN0PGJvb2xlYW4+O1xyXG5cclxuICAgIHB1YmxpYyBhY3RpdmF0ZShzdGF0ZTogYW55KSB7XHJcbiAgICAgICAgdGhpcy5kaXNwb3NhYmxlID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGU7XHJcbiAgICAgICAgdGhpcy5fc3RhcnRlZCA9IG5ldyBBc3luY1N1YmplY3Q8Ym9vbGVhbj4oKTtcclxuICAgICAgICB0aGlzLl9hY3RpdmF0ZWQgPSBuZXcgQXN5bmNTdWJqZWN0PGJvb2xlYW4+KCk7XHJcblxyXG4gICAgICAgIHRoaXMuY29uZmlndXJlS2V5YmluZGluZ3MoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmFkZChhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIFwib21uaXNoYXJwLWF0b206dG9nZ2xlXCIsICgpID0+IHRoaXMudG9nZ2xlKCkpKTtcclxuICAgICAgICB0aGlzLmRpc3Bvc2FibGUuYWRkKGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwgXCJvbW5pc2hhcnAtYXRvbTpmaXgtdXNpbmdzXCIsICgpID0+IE9tbmkucmVxdWVzdChzb2x1dGlvbiA9PiBzb2x1dGlvbi5maXh1c2luZ3Moe30pKSkpO1xyXG4gICAgICAgIHRoaXMuZGlzcG9zYWJsZS5hZGQoYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCBcIm9tbmlzaGFycC1hdG9tOnNldHRpbmdzXCIsICgpID0+IGF0b20ud29ya3NwYWNlLm9wZW4oXCJhdG9tOi8vY29uZmlnL3BhY2thZ2VzXCIpXHJcbiAgICAgICAgICAgIC50aGVuKHRhYiA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGFiICYmIHRhYi5nZXRVUkkgJiYgdGFiLmdldFVSSSgpICE9PSBcImF0b206Ly9jb25maWcvcGFja2FnZXMvb21uaXNoYXJwLWF0b21cIikge1xyXG4gICAgICAgICAgICAgICAgICAgIGF0b20ud29ya3NwYWNlLm9wZW4oXCJhdG9tOi8vY29uZmlnL3BhY2thZ2VzL29tbmlzaGFycC1hdG9tXCIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KSkpO1xyXG5cclxuICAgICAgICBjb25zdCBncmFtbWFycyA9ICg8YW55PmF0b20uZ3JhbW1hcnMpO1xyXG4gICAgICAgIGNvbnN0IGdyYW1tYXJDYiA9IChncmFtbWFyOiB7IHNjb3BlTmFtZTogc3RyaW5nOyB9KSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChfLmZpbmQoT21uaS5ncmFtbWFycywgKGdtcjogYW55KSA9PiBnbXIuc2NvcGVOYW1lID09PSBncmFtbWFyLnNjb3BlTmFtZSkpIHtcclxuICAgICAgICAgICAgICAgIC8vIGVuc3VyZSB0aGUgc2NvcGUgaGFzIGJlZW4gaW5pdGVkXHJcbiAgICAgICAgICAgICAgICBhdG9tLmdyYW1tYXJzLnN0YXJ0SWRGb3JTY29wZShncmFtbWFyLnNjb3BlTmFtZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3Qgb21uaXNoYXJwU2NvcGVOYW1lID0gYCR7Z3JhbW1hci5zY29wZU5hbWV9Lm9tbmlzaGFycGA7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBzY29wZUlkID0gZ3JhbW1hcnMuaWRzQnlTY29wZVtncmFtbWFyLnNjb3BlTmFtZV07XHJcbiAgICAgICAgICAgICAgICBncmFtbWFycy5pZHNCeVNjb3BlW29tbmlzaGFycFNjb3BlTmFtZV0gPSBzY29wZUlkO1xyXG4gICAgICAgICAgICAgICAgZ3JhbW1hcnMuc2NvcGVzQnlJZFtzY29wZUlkXSA9IG9tbmlzaGFycFNjb3BlTmFtZTtcclxuICAgICAgICAgICAgICAgIGdyYW1tYXIuc2NvcGVOYW1lID0gb21uaXNoYXJwU2NvcGVOYW1lO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICBfLmVhY2goZ3JhbW1hcnMuZ3JhbW1hcnMsIGdyYW1tYXJDYik7XHJcbiAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmFkZChhdG9tLmdyYW1tYXJzLm9uRGlkQWRkR3JhbW1hcihncmFtbWFyQ2IpKTtcclxuXHJcbiAgICAgICAgcmVxdWlyZShcImF0b20tcGFja2FnZS1kZXBzXCIpLmluc3RhbGwoXCJvbW5pc2hhcnAtYXRvbVwiKVxyXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmluZm8oXCJBY3RpdmF0aW5nIG9tbmlzaGFycC1hdG9tIHNvbHV0aW9uIHRyYWNraW5nLi4uXCIpO1xyXG4gICAgICAgICAgICAgICAgT21uaS5hY3RpdmF0ZSgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmFkZChPbW5pKTtcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9zdGFydGVkLm5leHQodHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9zdGFydGVkLmNvbXBsZXRlKCk7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC8qIHRzbGludDpkaXNhYmxlOm5vLXN0cmluZy1saXRlcmFsICovXHJcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMubG9hZEZlYXR1cmVzKHRoaXMuZ2V0RmVhdHVyZXMoXCJhdG9tXCIpLmRlbGF5KE9tbmlbXCJfa2lja19pbl90aGVfcGFudHNfXCJdID8gMCA6IDIwMDApKS50b1Byb21pc2UoKSlcclxuICAgICAgICAgICAgLyogdHNsaW50OmVuYWJsZTpuby1zdHJpbmctbGl0ZXJhbCAqL1xyXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBsZXQgc3RhcnRpbmdPYnNlcnZhYmxlID0gT21uaS5hY3RpdmVTb2x1dGlvblxyXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoeiA9PiAhIXopXHJcbiAgICAgICAgICAgICAgICAgICAgLnRha2UoMSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLyogdHNsaW50OmRpc2FibGU6bm8tc3RyaW5nLWxpdGVyYWwgKi9cclxuICAgICAgICAgICAgICAgIGlmIChPbW5pW1wiX2tpY2tfaW5fdGhlX3BhbnRzX1wiXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0aW5nT2JzZXJ2YWJsZSA9IE9ic2VydmFibGUub2YobnVsbCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAvKiB0c2xpbnQ6ZGlzYWJsZTpuby1zdHJpbmctbGl0ZXJhbCAqL1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIE9ubHkgYWN0aXZhdGUgZmVhdHVyZXMgb25jZSB3ZSBoYXZlIGEgc29sdXRpb24hXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRpc3Bvc2FibGUuYWRkKHN0YXJ0aW5nT2JzZXJ2YWJsZVxyXG4gICAgICAgICAgICAgICAgICAgIC5mbGF0TWFwKCgpID0+IHRoaXMubG9hZEZlYXR1cmVzKHRoaXMuZ2V0RmVhdHVyZXMoXCJmZWF0dXJlc1wiKSkpXHJcbiAgICAgICAgICAgICAgICAgICAgLnN1YnNjcmliZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBsZXRlOiAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRpc3Bvc2FibGUuYWRkKGF0b20ud29ya3NwYWNlLm9ic2VydmVUZXh0RWRpdG9ycygoZWRpdG9yOiBBdG9tLlRleHRFZGl0b3IpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRldGVjdEF1dG9Ub2dnbGVHcmFtbWFyKGVkaXRvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fYWN0aXZhdGVkLm5leHQodHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9hY3RpdmF0ZWQuY29tcGxldGUoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBnZXRGZWF0dXJlcyhmb2xkZXI6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IHdoaXRlTGlzdCA9IGF0b20uY29uZmlnLmdldDxib29sZWFuPihcIm9tbmlzaGFycC1hdG9tOmZlYXR1cmUtd2hpdGUtbGlzdFwiKTtcclxuICAgICAgICBjb25zdCBmZWF0dXJlTGlzdCA9IGF0b20uY29uZmlnLmdldDxzdHJpbmdbXT4oXCJvbW5pc2hhcnAtYXRvbTpmZWF0dXJlLWxpc3RcIik7XHJcbiAgICAgICAgY29uc3Qgd2hpdGVMaXN0VW5kZWZpbmVkID0gKHR5cGVvZiB3aGl0ZUxpc3QgPT09IFwidW5kZWZpbmVkXCIpO1xyXG5cclxuICAgICAgICBjb25zb2xlLmluZm8oYEdldHRpbmcgZmVhdHVyZXMgZm9yIFwiJHtmb2xkZXJ9XCIuLi5gKTtcclxuXHJcbiAgICAgICAgY29uc3QgZmVhdHVyZURpciA9IGAke19fZGlybmFtZX0vJHtmb2xkZXJ9YDtcclxuXHJcbiAgICAgICAgZnVuY3Rpb24gbG9hZEZlYXR1cmUoZmlsZTogc3RyaW5nKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHJlcXVpcmUoYC4vJHtmb2xkZXJ9LyR7ZmlsZX1gKTtcclxuICAgICAgICAgICAgY29uc29sZS5pbmZvKGBMb2FkaW5nIGZlYXR1cmUgXCIke2ZvbGRlcn0vJHtmaWxlfVwiLi4uYCk7XHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7Ly9fLnZhbHVlcyhyZXN1bHQpLmZpbHRlcihmZWF0dXJlID0+ICFfLmlzRnVuY3Rpb24oZmVhdHVyZSkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIE9ic2VydmFibGUuYmluZE5vZGVDYWxsYmFjayhmcy5yZWFkZGlyKShmZWF0dXJlRGlyKVxyXG4gICAgICAgICAgICAuZmxhdE1hcChmaWxlcyA9PiBmaWxlcylcclxuICAgICAgICAgICAgLmZpbHRlcihmaWxlID0+IC9cXC5qcyQvLnRlc3QoZmlsZSkpXHJcbiAgICAgICAgICAgIC5mbGF0TWFwKGZpbGUgPT4gT2JzZXJ2YWJsZS5iaW5kTm9kZUNhbGxiYWNrKGZzLnN0YXQpKGAke2ZlYXR1cmVEaXJ9LyR7ZmlsZX1gKSwgKGZpbGUsIHN0YXQpID0+ICh7IGZpbGUsIHN0YXQgfSkpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoeiA9PiAhei5zdGF0LmlzRGlyZWN0b3J5KCkpXHJcbiAgICAgICAgICAgIC5tYXAoeiA9PiAoe1xyXG4gICAgICAgICAgICAgICAgZmlsZTogYCR7Zm9sZGVyfS8ke3BhdGguYmFzZW5hbWUoei5maWxlKX1gLnJlcGxhY2UoL1xcLmpzJC8sIFwiXCIpLFxyXG4gICAgICAgICAgICAgICAgbG9hZDogKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZlYXR1cmUgPSBsb2FkRmVhdHVyZSh6LmZpbGUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmZWF0dXJlczogeyBrZXk6IHN0cmluZywgYWN0aXZhdGU6ICgpID0+ICgpID0+IHZvaWQgfVtdID0gW107XHJcbiAgICAgICAgICAgICAgICAgICAgXy5lYWNoKGZlYXR1cmUsICh2YWx1ZTogSUZlYXR1cmUsIGtleTogc3RyaW5nKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghXy5pc0Z1bmN0aW9uKHZhbHVlKSAmJiAhXy5pc0FycmF5KHZhbHVlKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF2YWx1ZS5yZXF1aXJlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnW2tleV0gPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpdGxlOiBgJHt2YWx1ZS50aXRsZX1gLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogdmFsdWUuZGVzY3JpcHRpb24sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiYm9vbGVhblwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OiAoXy5oYXModmFsdWUsIFwiZGVmYXVsdFwiKSA/IHZhbHVlLmRlZmF1bHQgOiB0cnVlKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmVhdHVyZXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAga2V5LCBhY3RpdmF0ZTogKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hY3RpdmF0ZUZlYXR1cmUod2hpdGVMaXN0VW5kZWZpbmVkLCBrZXksIHZhbHVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5mcm9tPHsga2V5OiBzdHJpbmcsIGFjdGl2YXRlOiAoKSA9PiAoKSA9PiB2b2lkIH0+KGZlYXR1cmVzKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSkpXHJcbiAgICAgICAgICAgIC5maWx0ZXIobCA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHdoaXRlTGlzdCA9PT0gXCJ1bmRlZmluZWRcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGlmICh3aGl0ZUxpc3QpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXy5pbmNsdWRlcyhmZWF0dXJlTGlzdCwgbC5maWxlKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICFfLmluY2x1ZGVzKGZlYXR1cmVMaXN0LCBsLmZpbGUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgbG9hZEZlYXR1cmVzKGZlYXR1cmVzOiBPYnNlcnZhYmxlPHsgZmlsZTogc3RyaW5nOyBsb2FkOiAoKSA9PiBPYnNlcnZhYmxlPHsga2V5OiBzdHJpbmcsIGFjdGl2YXRlOiAoKSA9PiAoKSA9PiB2b2lkIH0+IH0+KSB7XHJcbiAgICAgICAgcmV0dXJuIGZlYXR1cmVzXHJcbiAgICAgICAgICAgIC5jb25jYXRNYXAoeiA9PiB6LmxvYWQoKSlcclxuICAgICAgICAgICAgLnRvQXJyYXkoKVxyXG4gICAgICAgICAgICAuY29uY2F0TWFwKHggPT4geClcclxuICAgICAgICAgICAgLm1hcChmID0+IGYuYWN0aXZhdGUoKSlcclxuICAgICAgICAgICAgLmZpbHRlcih4ID0+ICEheClcclxuICAgICAgICAgICAgLnRvQXJyYXkoKVxyXG4gICAgICAgICAgICAuZG8oe1xyXG4gICAgICAgICAgICAgICAgY29tcGxldGU6ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAoPGFueT5hdG9tLmNvbmZpZykuc2V0U2NoZW1hKFwib21uaXNoYXJwLWF0b21cIiwge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIm9iamVjdFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB0aGlzLmNvbmZpZ1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuY29uY2F0TWFwKHggPT4geClcclxuICAgICAgICAgICAgLmRvKHggPT4geCgpKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgYWN0aXZhdGVGZWF0dXJlKHdoaXRlTGlzdFVuZGVmaW5lZDogYm9vbGVhbiwga2V5OiBzdHJpbmcsIHZhbHVlOiBJRmVhdHVyZSkge1xyXG4gICAgICAgIGxldCByZXN1bHQ6ICgpID0+IHZvaWQgPSBudWxsO1xyXG4gICAgICAgIGxldCBmaXJzdFJ1biA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIFdoaXRlbGlzdCBpcyB1c2VkIGZvciB1bml0IHRlc3RpbmcsIHdlIGRvblwidCB3YW50IHRoZSBjb25maWcgdG8gbWFrZSBjaGFuZ2VzIGhlcmVcclxuICAgICAgICBpZiAod2hpdGVMaXN0VW5kZWZpbmVkICYmIF8uaGFzKHRoaXMuY29uZmlnLCBrZXkpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbmZpZ0tleSA9IGBvbW5pc2hhcnAtYXRvbS4ke2tleX1gO1xyXG4gICAgICAgICAgICBsZXQgZW5hYmxlRGlzcG9zYWJsZTogSURpc3Bvc2FibGUsIGRpc2FibGVEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcclxuICAgICAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmFkZChhdG9tLmNvbmZpZy5vYnNlcnZlKGNvbmZpZ0tleSwgZW5hYmxlZCA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWVuYWJsZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZGlzYWJsZURpc3Bvc2FibGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGlzYWJsZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRpc3Bvc2FibGUucmVtb3ZlKGRpc2FibGVEaXNwb3NhYmxlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGlzYWJsZURpc3Bvc2FibGUgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgdmFsdWUuZGlzcG9zZSgpOyB9IGNhdGNoIChleCkgeyAvKiAqLyB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZURpc3Bvc2FibGUgPSBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIGBvbW5pc2hhcnAtZmVhdHVyZTplbmFibGUtJHtfLmtlYmFiQ2FzZShrZXkpfWAsICgpID0+IGF0b20uY29uZmlnLnNldChjb25maWdLZXksIHRydWUpKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRpc3Bvc2FibGUuYWRkKGVuYWJsZURpc3Bvc2FibGUpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZW5hYmxlRGlzcG9zYWJsZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kaXNwb3NhYmxlLnJlbW92ZShkaXNhYmxlRGlzcG9zYWJsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZURpc3Bvc2FibGUgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5pbmZvKGBBY3RpdmF0aW5nIGZlYXR1cmUgXCIke2tleX1cIi4uLmApO1xyXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlLmFjdGl2YXRlKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChfLmlzRnVuY3Rpb24odmFsdWVbXCJhdHRhY2hcIl0pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmaXJzdFJ1bikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuaW5mbyhgQXR0YWNoaW5nIGZlYXR1cmUgXCIke2tleX1cIi4uLmApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlW1wiYXR0YWNoXCJdKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5pbmZvKGBBdHRhY2hpbmcgZmVhdHVyZSBcIiR7a2V5fVwiLi4uYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZVtcImF0dGFjaFwiXSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBkaXNhYmxlRGlzcG9zYWJsZSA9IGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwgYG9tbmlzaGFycC1mZWF0dXJlOmRpc2FibGUtJHtfLmtlYmFiQ2FzZShrZXkpfWAsICgpID0+IGF0b20uY29uZmlnLnNldChjb25maWdLZXksIGZhbHNlKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmFkZChkaXNhYmxlRGlzcG9zYWJsZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBmaXJzdFJ1biA9IGZhbHNlO1xyXG4gICAgICAgICAgICB9KSk7XHJcblxyXG5cclxuICAgICAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmFkZChhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIGBvbW5pc2hhcnAtZmVhdHVyZTp0b2dnbGUtJHtfLmtlYmFiQ2FzZShrZXkpfWAsICgpID0+IGF0b20uY29uZmlnLnNldChjb25maWdLZXksICFhdG9tLmNvbmZpZy5nZXQoY29uZmlnS2V5KSkpKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB2YWx1ZS5hY3RpdmF0ZSgpO1xyXG5cclxuICAgICAgICAgICAgaWYgKF8uaXNGdW5jdGlvbih2YWx1ZVtcImF0dGFjaFwiXSkpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmluZm8oYEF0dGFjaGluZyBmZWF0dXJlIFwiJHtrZXl9XCIuLi5gKTtcclxuICAgICAgICAgICAgICAgICAgICB2YWx1ZVtcImF0dGFjaFwiXSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmFkZChEaXNwb3NhYmxlLmNyZWF0ZSgoKSA9PiB7IHRyeSB7IHZhbHVlLmRpc3Bvc2UoKTsgfSBjYXRjaCAoZXgpIHsgLyogKi8gfSB9KSk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRldGVjdEF1dG9Ub2dnbGVHcmFtbWFyKGVkaXRvcjogQXRvbS5UZXh0RWRpdG9yKSB7XHJcbiAgICAgICAgY29uc3QgZ3JhbW1hciA9IGVkaXRvci5nZXRHcmFtbWFyKCk7XHJcbiAgICAgICAgdGhpcy5kZXRlY3RHcmFtbWFyKGVkaXRvciwgZ3JhbW1hcik7XHJcbiAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VHcmFtbWFyKChnbXI6IEZpcnN0TWF0ZS5HcmFtbWFyKSA9PiB0aGlzLmRldGVjdEdyYW1tYXIoZWRpdG9yLCBnbXIpKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkZXRlY3RHcmFtbWFyKGVkaXRvcjogQXRvbS5UZXh0RWRpdG9yLCBncmFtbWFyOiBGaXJzdE1hdGUuR3JhbW1hcikge1xyXG4gICAgICAgIGlmICghYXRvbS5jb25maWcuZ2V0KFwib21uaXNoYXJwLWF0b20uYXV0b1N0YXJ0T25Db21wYXRpYmxlRmlsZVwiKSkge1xyXG4gICAgICAgICAgICByZXR1cm47IC8vc2hvcnQgb3V0LCBpZiBzZXR0aW5nIHRvIG5vdCBhdXRvIHN0YXJ0IGlzIGVuYWJsZWRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChPbW5pLmlzVmFsaWRHcmFtbWFyKGdyYW1tYXIpKSB7XHJcbiAgICAgICAgICAgIGlmIChPbW5pLmlzT2ZmKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRvZ2dsZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChncmFtbWFyLm5hbWUgPT09IFwiSlNPTlwiKSB7XHJcbiAgICAgICAgICAgIGlmIChwYXRoLmJhc2VuYW1lKGVkaXRvci5nZXRQYXRoKCkpID09PSBcInByb2plY3QuanNvblwiKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoT21uaS5pc09mZikge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9nZ2xlKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHRvZ2dsZSgpIHtcclxuICAgICAgICBpZiAoT21uaS5pc09mZikge1xyXG4gICAgICAgICAgICBPbW5pLmNvbm5lY3QoKTtcclxuICAgICAgICB9IGVsc2UgaWYgKE9tbmkuaXNPbikge1xyXG4gICAgICAgICAgICBPbW5pLmRpc2Nvbm5lY3QoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGRlYWN0aXZhdGUoKSB7XHJcbiAgICAgICAgdGhpcy5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgY29uc3VtZVN0YXR1c0JhcihzdGF0dXNCYXI6IGFueSkge1xyXG4gICAgICAgIGxldCBmID0gcmVxdWlyZShcIi4vYXRvbS9zdGF0dXMtYmFyXCIpO1xyXG4gICAgICAgIGYuc3RhdHVzQmFyLnNldHVwKHN0YXR1c0Jhcik7XHJcbiAgICAgICAgZiA9IHJlcXVpcmUoXCIuL2F0b20vZnJhbWV3b3JrLXNlbGVjdG9yXCIpO1xyXG4gICAgICAgIGYuZnJhbWV3b3JrU2VsZWN0b3Iuc2V0dXAoc3RhdHVzQmFyKTtcclxuICAgICAgICBmID0gcmVxdWlyZShcIi4vYXRvbS9mZWF0dXJlLWJ1dHRvbnNcIik7XHJcbiAgICAgICAgZi5mZWF0dXJlRWRpdG9yQnV0dG9ucy5zZXR1cChzdGF0dXNCYXIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qIHRzbGludDpkaXNhYmxlOnZhcmlhYmxlLW5hbWUgKi9cclxuICAgIHB1YmxpYyBjb25zdW1lWWVvbWFuRW52aXJvbm1lbnQoZ2VuZXJhdG9yU2VydmljZTogYW55KSB7XHJcbiAgICAgICAgY29uc3Qge2dlbmVyYXRvckFzcG5ldH0gPSByZXF1aXJlKFwiLi9hdG9tL2dlbmVyYXRvci1hc3BuZXRcIik7XHJcbiAgICAgICAgZ2VuZXJhdG9yQXNwbmV0LnNldHVwKGdlbmVyYXRvclNlcnZpY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBwcm92aWRlQXV0b2NvbXBsZXRlKCkge1xyXG4gICAgICAgIHJldHVybiByZXF1aXJlKFwiLi9zZXJ2aWNlcy9jb21wbGV0aW9uLXByb3ZpZGVyXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBwcm92aWRlTGludGVyKCk6IGFueVtdIHtcclxuICAgICAgICByZXR1cm4gW107XHJcbiAgICAgICAgLy9jb25zdCBMaW50ZXJQcm92aWRlciA9IHJlcXVpcmUoXCIuL3NlcnZpY2VzL2xpbnRlci1wcm92aWRlclwiKTtcclxuICAgICAgICAvL3JldHVybiBMaW50ZXJQcm92aWRlci5wcm92aWRlcjtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgcHJvdmlkZVByb2plY3RKc29uKCkge1xyXG4gICAgICAgIHJldHVybiByZXF1aXJlKFwiLi9zZXJ2aWNlcy9wcm9qZWN0LXByb3ZpZGVyXCIpLmNvbmNhdChyZXF1aXJlKFwiLi9zZXJ2aWNlcy9mcmFtZXdvcmstcHJvdmlkZXJcIikpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBjb25zdW1lTGludGVyKGxpbnRlcjogYW55KSB7XHJcbiAgICAgICAgY29uc3QgTGludGVyUHJvdmlkZXIgPSByZXF1aXJlKFwiLi9zZXJ2aWNlcy9saW50ZXItcHJvdmlkZXJcIik7XHJcbiAgICAgICAgY29uc3QgbGludGVycyA9IExpbnRlclByb3ZpZGVyLnByb3ZpZGVyO1xyXG5cclxuICAgICAgICB0aGlzLmRpc3Bvc2FibGUuYWRkKERpc3Bvc2FibGUuY3JlYXRlKCgpID0+IHtcclxuICAgICAgICAgICAgXy5lYWNoKGxpbnRlcnMsIGwgPT4ge1xyXG4gICAgICAgICAgICAgICAgbGludGVyLmRlbGV0ZUxpbnRlcihsKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICB0aGlzLmRpc3Bvc2FibGUuYWRkKExpbnRlclByb3ZpZGVyLmluaXQobGludGVyKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNvbnN1bWVJbmRpZUxpbnRlcihsaW50ZXI6IGFueSkge1xyXG4gICAgICAgIHJlcXVpcmUoXCIuL3NlcnZpY2VzL2xpbnRlci1wcm92aWRlclwiKS5yZWdpc3RlckluZGllKGxpbnRlciwgdGhpcy5kaXNwb3NhYmxlKTtcclxuICAgIH1cclxuICAgIC8qIHRzbGludDplbmFibGU6dmFyaWFibGUtbmFtZSAqL1xyXG5cclxuICAgIHByaXZhdGUgY29uZmlndXJlS2V5YmluZGluZ3MoKSB7XHJcbiAgICAgICAgbGV0IGRpc3Bvc2FibGU6IEV2ZW50S2l0LkRpc3Bvc2FibGU7XHJcbiAgICAgICAgY29uc3Qgb21uaXNoYXJwQWR2YW5jZWRGaWxlTmV3ID0gT21uaS5wYWNrYWdlRGlyICsgXCIvb21uaXNoYXJwLWF0b20va2V5bWFwcy9vbW5pc2hhcnAtZmlsZS1uZXcuY3NvblwiO1xyXG4gICAgICAgIHRoaXMuZGlzcG9zYWJsZS5hZGQoYXRvbS5jb25maWcub2JzZXJ2ZShcIm9tbmlzaGFycC1hdG9tLmVuYWJsZUFkdmFuY2VkRmlsZU5ld1wiLCAoZW5hYmxlZDogYm9vbGVhbikgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZW5hYmxlZCkge1xyXG4gICAgICAgICAgICAgICAgZGlzcG9zYWJsZSA9IGF0b20ua2V5bWFwcy5sb2FkS2V5bWFwKG9tbmlzaGFycEFkdmFuY2VkRmlsZU5ldyk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoZGlzcG9zYWJsZSkgZGlzcG9zYWJsZS5kaXNwb3NlKCk7XHJcbiAgICAgICAgICAgICAgICBhdG9tLmtleW1hcHMucmVtb3ZlQmluZGluZ3NGcm9tU291cmNlKG9tbmlzaGFycEFkdmFuY2VkRmlsZU5ldyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNvbmZpZyA9IHtcclxuICAgICAgICBhdXRvU3RhcnRPbkNvbXBhdGlibGVGaWxlOiB7XHJcbiAgICAgICAgICAgIHRpdGxlOiBcIkF1dG9zdGFydCBPbW5pc2hhcnAgUm9zbHluXCIsXHJcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIkF1dG9tYXRpY2FsbHkgc3RhcnRzIE9tbmlzaGFycCBSb3NseW4gd2hlbiBhIGNvbXBhdGlibGUgZmlsZSBpcyBvcGVuZWQuXCIsXHJcbiAgICAgICAgICAgIHR5cGU6IFwiYm9vbGVhblwiLFxyXG4gICAgICAgICAgICBkZWZhdWx0OiB0cnVlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBkZXZlbG9wZXJNb2RlOiB7XHJcbiAgICAgICAgICAgIHRpdGxlOiBcIkRldmVsb3BlciBNb2RlXCIsXHJcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIk91dHB1dHMgZGV0YWlsZWQgc2VydmVyIGNhbGxzIGluIGNvbnNvbGUubG9nXCIsXHJcbiAgICAgICAgICAgIHR5cGU6IFwiYm9vbGVhblwiLFxyXG4gICAgICAgICAgICBkZWZhdWx0OiBmYWxzZVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgc2hvd0RpYWdub3N0aWNzRm9yQWxsU29sdXRpb25zOiB7XHJcbiAgICAgICAgICAgIHRpdGxlOiBcIlNob3cgRGlhZ25vc3RpY3MgZm9yIGFsbCBTb2x1dGlvbnNcIixcclxuICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiQWR2YW5jZWQ6IFRoaXMgd2lsbCBzaG93IGRpYWdub3N0aWNzIGZvciBhbGwgb3BlbiBzb2x1dGlvbnMuICBOT1RFOiBNYXkgdGFrZSBhIHJlc3RhcnQgb3IgY2hhbmdlIHRvIGVhY2ggc2VydmVyIHRvIHRha2UgZWZmZWN0IHdoZW4gdHVybmVkIG9uLlwiLFxyXG4gICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgICAgZGVmYXVsdDogZmFsc2VcclxuICAgICAgICB9LFxyXG4gICAgICAgIGVuYWJsZUFkdmFuY2VkRmlsZU5ldzoge1xyXG4gICAgICAgICAgICB0aXRsZTogXCJFbmFibGUgYEFkdmFuY2VkIEZpbGUgTmV3YFwiLFxyXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJFbmFibGUgYEFkdmFuY2VkIEZpbGUgTmV3YCB3aGVuIGRvaW5nIGN0cmwtbi9jbWQtbiB3aXRoaW4gYSBDIyBlZGl0b3IuXCIsXHJcbiAgICAgICAgICAgIHR5cGU6IFwiYm9vbGVhblwiLFxyXG4gICAgICAgICAgICBkZWZhdWx0OiBmYWxzZVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgdXNlTGVmdExhYmVsQ29sdW1uRm9yU3VnZ2VzdGlvbnM6IHtcclxuICAgICAgICAgICAgdGl0bGU6IFwiVXNlIExlZnQtTGFiZWwgY29sdW1uIGluIFN1Z2dlc3Rpb25zXCIsXHJcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIlNob3dzIHJldHVybiB0eXBlcyBpbiBhIHJpZ2h0LWFsaWduZWQgY29sdW1uIHRvIHRoZSBsZWZ0IG9mIHRoZSBjb21wbGV0aW9uIHN1Z2dlc3Rpb24gdGV4dC5cIixcclxuICAgICAgICAgICAgdHlwZTogXCJib29sZWFuXCIsXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6IGZhbHNlXHJcbiAgICAgICAgfSxcclxuICAgICAgICB1c2VJY29uczoge1xyXG4gICAgICAgICAgICB0aXRsZTogXCJVc2UgdW5pcXVlIGljb25zIGZvciBraW5kIGluZGljYXRvcnMgaW4gU3VnZ2VzdGlvbnNcIixcclxuICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiU2hvd3Mga2luZHMgd2l0aCB1bmlxdWUgaWNvbnMgcmF0aGVyIHRoYW4gYXV0b2NvbXBsZXRlIGRlZmF1bHQgc3R5bGVzLlwiLFxyXG4gICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgICAgZGVmYXVsdDogdHJ1ZVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYXV0b0FkanVzdFRyZWVWaWV3OiB7XHJcbiAgICAgICAgICAgIHRpdGxlOiBcIkFkanVzdCB0aGUgdHJlZSB2aWV3IHRvIG1hdGNoIHRoZSBzb2x1dGlvbiByb290LlwiLFxyXG4gICAgICAgICAgICBkZXNjcnB0aW9uOiBcIlRoaXMgd2lsbCBhdXRvbWF0aWNhbGx5IGFkanVzdCB0aGUgdHJlZXZpZXcgdG8gYmUgdGhlIHJvb3Qgb2YgdGhlIHNvbHV0aW9uLlwiLFxyXG4gICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgICAgZGVmYXVsdDogZmFsc2VcclxuICAgICAgICB9LFxyXG4gICAgICAgIG5hZ0FkanVzdFRyZWVWaWV3OiB7XHJcbiAgICAgICAgICAgIHRpdGxlOiBcIlNob3cgdGhlIG5vdGlmaWNhdGlvbnMgdG8gQWRqdXN0IHRoZSB0cmVlIHZpZXdcIixcclxuICAgICAgICAgICAgdHlwZTogXCJib29sZWFuXCIsXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6IHRydWVcclxuICAgICAgICB9LFxyXG4gICAgICAgIGF1dG9BZGRFeHRlcm5hbFByb2plY3RzOiB7XHJcbiAgICAgICAgICAgIHRpdGxlOiBcIkFkZCBleHRlcm5hbCBwcm9qZWN0cyB0byB0aGUgdHJlZSB2aWV3LlwiLFxyXG4gICAgICAgICAgICBkZXNjcnB0aW9uOiBcIlRoaXMgd2lsbCBhdXRvbWF0aWNhbGx5IGFkZCBleHRlcm5hbCBzb3VyY2VzIHRvIHRoZSB0cmVlIHZpZXcuXFxuIEV4dGVybmFsIHNvdXJjZXMgYXJlIGFueSBwcm9qZWN0cyB0aGF0IGFyZSBsb2FkZWQgb3V0c2lkZSBvZiB0aGUgc29sdXRpb24gcm9vdC5cIixcclxuICAgICAgICAgICAgdHlwZTogXCJib29sZWFuXCIsXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6IGZhbHNlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBuYWdBZGRFeHRlcm5hbFByb2plY3RzOiB7XHJcbiAgICAgICAgICAgIHRpdGxlOiBcIlNob3cgdGhlIG5vdGlmaWNhdGlvbnMgdG8gYWRkIG9yIHJlbW92ZSBleHRlcm5hbCBwcm9qZWN0c1wiLFxyXG4gICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgICAgZGVmYXVsdDogdHJ1ZVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgaGlkZUxpbnRlckludGVyZmFjZToge1xyXG4gICAgICAgICAgICB0aXRsZTogXCJIaWRlIHRoZSBsaW50ZXIgaW50ZXJmYWNlIHdoZW4gdXNpbmcgb21uaXNoYXJwLWF0b20gZWRpdG9yc1wiLFxyXG4gICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgICAgZGVmYXVsdDogdHJ1ZVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgd2FudE1ldGFkYXRhOiB7XHJcbiAgICAgICAgICAgIHRpdGxlOiBcIlJlcXVlc3QgbWV0YWRhdGEgZGVmaW5pdGlvbiB3aXRoIEdvdG8gRGVmaW5pdGlvblwiLFxyXG4gICAgICAgICAgICBkZXNjcnB0aW9uOiBcIlJlcXVlc3Qgc3ltYm9sIG1ldGFkYXRhIGZyb20gdGhlIHNlcnZlciwgd2hlbiB1c2luZyBnby10by1kZWZpbml0aW9uLiAgVGhpcyBpcyBkaXNhYmxlZCBieSBkZWZhdWx0IG9uIExpbnV4LCBkdWUgdG8gaXNzdWVzIHdpdGggUm9zbHluIG9uIE1vbm8uXCIsXHJcbiAgICAgICAgICAgIHR5cGU6IFwiYm9vbGVhblwiLFxyXG4gICAgICAgICAgICBkZWZhdWx0OiB3aW4zMlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYWx0R290b0RlZmluaXRpb246IHtcclxuICAgICAgICAgICAgdGl0bGU6IFwiQWx0IEdvIFRvIERlZmluaXRpb25cIixcclxuICAgICAgICAgICAgZGVzY3JwdGlvbjogXCJVc2UgdGhlIGFsdCBrZXkgaW5zdGVhZCBvZiB0aGUgY3RybC9jbWQga2V5IGZvciBnb3RvIGRlZmludGlvbiBtb3VzZSBvdmVyLlwiLFxyXG4gICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgICAgZGVmYXVsdDogZmFsc2VcclxuICAgICAgICB9LFxyXG4gICAgICAgIHNob3dIaWRkZW5EaWFnbm9zdGljczoge1xyXG4gICAgICAgICAgICB0aXRsZTogXCJTaG93ICdIaWRkZW4nIGRpYWdub3N0aWNzIGluIHRoZSBsaW50ZXJcIixcclxuICAgICAgICAgICAgZGVzY3JwdGlvbjogXCJTaG93IG9yIGhpZGUgaGlkZGVuIGRpYWdub3N0aWNzIGluIHRoZSBsaW50ZXIsIHRoaXMgZG9lcyBub3QgYWZmZWN0IGdyZXlpbmcgb3V0IG9mIG5hbWVzcGFjZXMgdGhhdCBhcmUgdW51c2VkLlwiLFxyXG4gICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgICAgZGVmYXVsdDogdHJ1ZVxyXG4gICAgICAgIH1cclxuICAgIH07XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gbmV3IE9tbmlTaGFycEF0b207XHJcbiJdfQ==
