'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.SolutionManager = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _lodash = require('lodash');

var _omnisharpClient = require('omnisharp-client');

var _path = require('path');

var path = _interopRequireWildcard(_path);

var _rxjs = require('rxjs');

var _tsDisposables = require('ts-disposables');

var _genericListView = require('../views/generic-list-view');

var _atomProjects = require('./atom-projects');

var _compositeSolution = require('./composite-solution');

var _omnisharpTextEditor = require('./omnisharp-text-editor');

var _solution2 = require('./solution');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var SOLUTION_LOAD_TIME = 30000;
var openSelectList = void 0;

var SolutionInstanceManager = function () {
    function SolutionInstanceManager() {
        _classCallCheck(this, SolutionInstanceManager);

        this._unitTestMode_ = false;
        this._kick_in_the_pants_ = false;
        this._configurations = new Set();
        this._solutions = new Map();
        this._solutionProjects = new Map();
        this._temporarySolutions = new WeakMap();
        this._disposableSolutionMap = new WeakMap();
        this._findSolutionCache = new Map();
        this._candidateFinderCache = new Set();
        this._activated = false;
        this._nextIndex = 0;
        this._specialCaseExtensions = ['.csx'];
        this._activeSolutions = [];
        this._observation = new _compositeSolution.SolutionObserver();
        this._combination = new _compositeSolution.SolutionAggregateObserver();
        this._activeSolution = new _rxjs.BehaviorSubject(null);
        this._activeSolutionObserable = this._activeSolution.distinctUntilChanged().filter(function (z) {
            return !!z;
        }).publishReplay(1).refCount();
        this._activatedSubject = new _rxjs.Subject();
    }

    _createClass(SolutionInstanceManager, [{
        key: 'activate',
        value: function activate(activeEditor) {
            var _this = this;

            if (this._activated) return;
            this._disposable = new _tsDisposables.CompositeDisposable();
            this._solutionDisposable = new _tsDisposables.CompositeDisposable();
            this._atomProjects = new _atomProjects.AtomProjectTracker();
            this._disposable.add(this._atomProjects);
            this._activeSearch = Promise.resolve(undefined);
            this._subscribeToAtomProjectTracker();
            this._disposable.add(activeEditor.filter(function (z) {
                return !!z;
            }).flatMap(function (z) {
                return _this.getSolutionForEditor(z);
            }).subscribe(function (x) {
                return _this._activeSolution.next(x);
            }));
            this._atomProjects.activate();
            this._activated = true;
            this.activatedSubject.next(true);
            this._disposable.add(this._solutionDisposable);
        }
    }, {
        key: 'connect',
        value: function connect() {
            this._solutions.forEach(function (solution) {
                return solution.connect();
            });
        }
    }, {
        key: 'disconnect',
        value: function disconnect() {
            this._solutions.forEach(function (solution) {
                return solution.dispose();
            });
        }
    }, {
        key: 'deactivate',
        value: function deactivate() {
            this._activated = false;
            this._disposable.dispose();
            this.disconnect();
            this._solutions.clear();
            this._solutionProjects.clear();
            this._findSolutionCache.clear();
        }
    }, {
        key: '_subscribeToAtomProjectTracker',
        value: function _subscribeToAtomProjectTracker() {
            var _this2 = this;

            this._disposable.add(this._atomProjects.removed.filter(function (z) {
                return _this2._solutions.has(z);
            }).subscribe(function (project) {
                return _this2._removeSolution(project);
            }));
            this._disposable.add(this._atomProjects.added.filter(function (project) {
                return !_this2._solutionProjects.has(project);
            }).map(function (project) {
                return _this2._candidateFinder(project).flatMap(function (candidates) {
                    return _rxjs.Observable.from(candidates).flatMap(function (x) {
                        return _this2._findRepositoryForPath(x.path);
                    }, function (candidate, repo) {
                        return { candidate: candidate, repo: repo };
                    }).toArray().toPromise().then(function (repos) {
                        var newCandidates = (0, _lodash.difference)(candidates.map(function (z) {
                            return z.path;
                        }), fromIterator(_this2._solutions.keys())).map(function (z) {
                            return (0, _lodash.find)(candidates, { path: z });
                        }).map(function (_ref) {
                            var path = _ref.path,
                                isProject = _ref.isProject,
                                originalFile = _ref.originalFile;

                            var found = (0, _lodash.find)(repos, function (x) {
                                return x.candidate.path === path;
                            });
                            var repo = found && found.repo;
                            return { path: path, isProject: isProject, repo: repo, originalFile: originalFile };
                        });
                        return addCandidatesInOrder(newCandidates, function (candidate, repo, isProject, originalFile) {
                            return _this2._addSolution(candidate, repo, isProject, { originalFile: originalFile, project: project });
                        });
                    });
                }).toPromise();
            }).subscribe(function (candidateObservable) {
                _this2._activeSearch = _this2._activeSearch.then(function () {
                    return candidateObservable;
                });
            }));
        }
    }, {
        key: '_findRepositoryForPath',
        value: function _findRepositoryForPath(workingPath) {
            return _rxjs.Observable.from(atom.project.getRepositories() || []).filter(function (x) {
                return !!x;
            }).map(function (repo) {
                return { repo: repo, directory: repo.getWorkingDirectory() };
            }).filter(function (_ref2) {
                var directory = _ref2.directory;
                return path.normalize(directory) === path.normalize(workingPath);
            }).take(1).map(function (x) {
                return x.repo;
            });
        }
    }, {
        key: '_addSolution',
        value: function _addSolution(candidate, repo, isProject, _ref3) {
            var _this3 = this;

            var _ref3$temporary = _ref3.temporary,
                temporary = _ref3$temporary === undefined ? false : _ref3$temporary,
                project = _ref3.project,
                originalFile = _ref3.originalFile;

            var projectPath = candidate;
            if ((0, _lodash.endsWith)(candidate, '.sln')) {
                candidate = path.dirname(candidate);
            }
            var solution = void 0;
            if (this._solutions.has(candidate)) {
                solution = this._solutions.get(candidate);
            } else if (project && this._solutionProjects.has(project)) {
                solution = this._solutionProjects.get(project);
            }
            if (solution && !solution.isDisposed) {
                return _rxjs.Observable.of(solution);
            } else if (solution && solution.isDisposed) {
                var disposer = this._disposableSolutionMap.get(solution);
                disposer.dispose();
            }
            solution = new _solution2.Solution({
                projectPath: projectPath,
                index: ++this._nextIndex,
                temporary: temporary,
                repository: repo,
                runtime: (0, _lodash.endsWith)(originalFile, '.csx') ? _omnisharpClient.Runtime.ClrOrMono : _omnisharpClient.Runtime.ClrOrMono
            });
            if (!isProject) {
                solution.isFolderPerFile = true;
            }
            var cd = new _tsDisposables.CompositeDisposable();
            this._solutionDisposable.add(solution);
            solution.disposable.add(cd);
            this._disposableSolutionMap.set(solution, cd);
            solution.disposable.add(_tsDisposables.Disposable.create(function () {
                solution.connect = function () {
                    return _this3._addSolution(candidate, repo, isProject, { temporary: temporary, project: project });
                };
            }));
            cd.add(_tsDisposables.Disposable.create(function () {
                _this3._solutionDisposable.remove(cd);
                (0, _lodash.pull)(_this3._activeSolutions, solution);
                _this3._solutions.delete(candidate);
                if (_this3._temporarySolutions.has(solution)) {
                    _this3._temporarySolutions.delete(solution);
                }
                if (_this3._activeSolution.getValue() === solution) {
                    _this3._activeSolution.next(_this3._activeSolutions.length ? _this3._activeSolutions[0] : null);
                }
            }));
            this._configurations.forEach(function (config) {
                return config(solution);
            });
            this._solutions.set(candidate, solution);
            cd.add(this._observation.add(solution));
            cd.add(this._combination.add(solution));
            if (temporary) {
                var tempD = _tsDisposables.Disposable.create(function () {});
                tempD.dispose();
                this._temporarySolutions.set(solution, new _tsDisposables.RefCountDisposable(tempD));
            }
            this._activeSolutions.push(solution);
            if (this._activeSolutions.length === 1) this._activeSolution.next(solution);
            var result = this._addSolutionSubscriptions(solution, cd);
            solution.connect();
            return result;
        }
    }, {
        key: '_addSolutionSubscriptions',
        value: function _addSolutionSubscriptions(solution, cd) {
            var _this4 = this;

            var result = new _rxjs.AsyncSubject();
            var errorResult = solution.state.filter(function (z) {
                return z === _omnisharpClient.DriverState.Error;
            }).delay(100).take(1);
            cd.add(errorResult.subscribe(function () {
                return result.complete();
            }));
            cd.add(solution.model.observe.projectAdded.subscribe(function (project) {
                return _this4._solutionProjects.set(project.path, solution);
            }));
            cd.add(solution.model.observe.projectRemoved.subscribe(function (project) {
                return _this4._solutionProjects.delete(project.path);
            }));
            cd.add(solution.model.observe.projects.debounceTime(100).take(1).map(function () {
                return solution;
            }).timeout(SOLUTION_LOAD_TIME, _rxjs.Scheduler.queue).onErrorResumeNext().subscribe(function () {
                result.next(solution);
                result.complete();
            }, function () {
                result.complete();
            }));
            return result;
        }
    }, {
        key: '_removeSolution',
        value: function _removeSolution(candidate) {
            if ((0, _lodash.endsWith)(candidate, '.sln')) {
                candidate = path.dirname(candidate);
            }
            var solution = this._solutions.get(candidate);
            var refCountDisposable = solution && this._temporarySolutions.has(solution) && this._temporarySolutions.get(solution);
            if (refCountDisposable) {
                refCountDisposable.dispose();
                if (!refCountDisposable.isDisposed) {
                    return;
                }
            }
            if (solution) {
                solution.dispose();
                var disposable = this._disposableSolutionMap.get(solution);
                if (disposable) disposable.dispose();
            }
        }
    }, {
        key: 'getSolutionForPath',
        value: function getSolutionForPath(path) {
            if (!path) return _rxjs.Observable.empty();
            var isFolderPerFile = (0, _lodash.some)(this.__specialCaseExtensions, function (ext) {
                return (0, _lodash.endsWith)(path, ext);
            });
            var location = path;
            if (!location) {
                return _rxjs.Observable.empty();
            }
            var solutionValue = this._getSolutionForUnderlyingPath(location, isFolderPerFile);
            if (solutionValue) return _rxjs.Observable.of(solutionValue);
            return this._findSolutionForUnderlyingPath(location, isFolderPerFile);
        }
    }, {
        key: 'getSolutionForEditor',
        value: function getSolutionForEditor(editor) {
            return this._getSolutionForEditor(editor).filter(function () {
                return !editor.isDestroyed();
            });
        }
    }, {
        key: '_setupEditorWithContext',
        value: function _setupEditorWithContext(editor, solution) {
            var _this5 = this;

            var context = new _omnisharpTextEditor.OmnisharpEditorContext(editor, solution);
            var result = editor;
            this._disposable.add(context);
            if (solution && !context.temp && this._temporarySolutions.has(solution)) {
                var refCountDisposable = this._temporarySolutions.get(solution);
                var disposable = refCountDisposable.getDisposable();
                context.temp = true;
                context.solution.disposable.add(editor.onDidDestroy(function () {
                    disposable.dispose();
                    _this5._removeSolution(solution.path);
                }));
            }
            return result;
        }
    }, {
        key: '_getSolutionForEditor',
        value: function _getSolutionForEditor(editor) {
            var _this6 = this;

            if (!editor) {
                return _rxjs.Observable.empty();
            }
            var location = editor.getPath();
            if (!location) {
                return _rxjs.Observable.empty();
            }
            if ((0, _omnisharpTextEditor.isOmnisharpTextEditor)(editor)) {
                if (editor.omnisharp.metadata) {
                    return _rxjs.Observable.empty();
                }
                var _solution = editor.omnisharp.solution;
                if (_solution.currentState === _omnisharpClient.DriverState.Disconnected && atom.config.get('omnisharp-atom.autoStartOnCompatibleFile')) _solution.connect();
                if (_solution.currentState === _omnisharpClient.DriverState.Error) {
                    return _rxjs.Observable.empty();
                }
                return _rxjs.Observable.of(_solution);
            }
            var isFolderPerFile = (0, _lodash.some)(this.__specialCaseExtensions, function (ext) {
                return (0, _lodash.endsWith)(editor.getPath(), ext);
            });
            var solution = this._getSolutionForUnderlyingPath(location, isFolderPerFile);
            if (solution) {
                this._setupEditorWithContext(editor, solution);
                return _rxjs.Observable.of(solution);
            }
            return this._findSolutionForUnderlyingPath(location, isFolderPerFile).do(function (sln) {
                return _this6._setupEditorWithContext(editor, sln);
            });
        }
    }, {
        key: '_isPartOfAnyActiveSolution',
        value: function _isPartOfAnyActiveSolution(location, cb) {
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this._activeSolutions[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var solution = _step.value;

                    if (solution.isFolderPerFile) continue;
                    var paths = solution.model.projects.map(function (z) {
                        return z.path;
                    });
                    var intersect = this._intersectPathMethod(location, paths);
                    if (intersect) {
                        return cb(intersect, solution);
                    }
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }
        }
    }, {
        key: '_getSolutionForUnderlyingPath',
        value: function _getSolutionForUnderlyingPath(location, isFolderPerFile) {
            if (location === undefined) {
                return null;
            }
            if (isFolderPerFile) {
                var directory = path.dirname(location);
                if (this._solutions.has(directory)) return this._solutions.get(directory);
                return null;
            } else {
                var intersect = this._intersectPath(location);
                if (intersect) {
                    return this._solutions.get(intersect);
                }
            }
            if (!isFolderPerFile) {
                return this._isPartOfAnyActiveSolution(location, function (intersect, solution) {
                    return solution;
                });
            }
            return null;
        }
    }, {
        key: '_findSolutionForUnderlyingPath',
        value: function _findSolutionForUnderlyingPath(location, isFolderPerFile) {
            var _this7 = this;

            var directory = path.dirname(location);
            if (!this._activated) {
                return this.activatedSubject.take(1).flatMap(function () {
                    return _this7._findSolutionForUnderlyingPath(location, isFolderPerFile);
                });
            }
            var segments = location.split(path.sep);
            var mappedLocations = segments.map(function (loc, index) {
                return (0, _lodash.take)(segments, index + 1).join(path.sep);
            });
            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = mappedLocations[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var l = _step2.value;

                    if (this._findSolutionCache.has(l)) {
                        return this._findSolutionCache.get(l);
                    }
                }
            } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion2 && _iterator2.return) {
                        _iterator2.return();
                    }
                } finally {
                    if (_didIteratorError2) {
                        throw _iteratorError2;
                    }
                }
            }

            var subject = new _rxjs.AsyncSubject();
            (0, _lodash.each)(mappedLocations, function (l) {
                _this7._findSolutionCache.set(l, subject);
                subject.subscribe({ complete: function complete() {
                        return _this7._findSolutionCache.delete(l);
                    } });
            });
            var project = this._intersectAtomProjectPath(directory);
            var cb = function cb(candidates) {
                if (!_this7._activated) {
                    (0, _lodash.delay)(cb, SOLUTION_LOAD_TIME);
                    return;
                }
                if (!isFolderPerFile) {
                    var r = _this7._isPartOfAnyActiveSolution(location, function (intersect, solution) {
                        subject.next(solution);
                        subject.complete();
                        return true;
                    });
                    if (r) return;
                }
                _this7._activeSearch.then(function () {
                    return _rxjs.Observable.from(candidates).flatMap(function (x) {
                        return _this7._findRepositoryForPath(x.path);
                    }, function (candidate, repo) {
                        return { candidate: candidate, repo: repo };
                    }).toArray().toPromise().then(function (repos) {
                        var newCandidates = (0, _lodash.difference)(candidates.map(function (z) {
                            return z.path;
                        }), fromIterator(_this7._solutions.keys())).map(function (z) {
                            return (0, _lodash.find)(candidates, { path: z });
                        }).map(function (_ref4) {
                            var path = _ref4.path,
                                isProject = _ref4.isProject,
                                originalFile = _ref4.originalFile;

                            var found = (0, _lodash.find)(repos, function (x) {
                                return x.candidate.path === path;
                            });
                            var repo = found && found.repo;
                            return { path: path, isProject: isProject, repo: repo, originalFile: originalFile };
                        });
                        addCandidatesInOrder(newCandidates, function (candidate, repo, isProject, originalFile) {
                            return _this7._addSolution(candidate, repo, isProject, { temporary: !project, originalFile: originalFile });
                        }).then(function () {
                            if (!isFolderPerFile) {
                                var _r = _this7._isPartOfAnyActiveSolution(location, function (intersect, solution) {
                                    subject.next(solution);
                                    subject.complete();
                                    return;
                                });
                                if (_r) {
                                    return;
                                }
                            }
                            var intersect = _this7._intersectPath(location) || _this7._intersectAtomProjectPath(location);
                            if (intersect) {
                                if (_this7._solutions.has(intersect)) {
                                    subject.next(_this7._solutions.get(intersect));
                                }
                            } else {
                                atom.notifications.addInfo('Could not find a solution for "' + location + '"');
                            }
                            subject.complete();
                        });
                    });
                });
            };
            this._candidateFinder(directory).subscribe(cb);
            return subject;
        }
    }, {
        key: '_candidateFinder',
        value: function _candidateFinder(directory) {
            var _this8 = this;

            return _omnisharpClient.findCandidates.withCandidates(directory, this.logger, {
                independentSourceFilesToSearch: this.__specialCaseExtensions.map(function (z) {
                    return '*' + z;
                })
            }).flatMap(function (candidates) {
                var slns = (0, _lodash.filter)(candidates, function (x) {
                    return (0, _lodash.endsWith)(x.path, '.sln');
                });
                if (slns.length > 1) {
                    var items = (0, _lodash.difference)(candidates, slns);
                    var asyncResult = new _rxjs.AsyncSubject();
                    asyncResult.next(items);
                    var listView = new _genericListView.GenericSelectListView('', slns.map(function (x) {
                        return { displayName: x.path, name: x.path };
                    }), function (result) {
                        items.unshift.apply(items, _toConsumableArray(slns.filter(function (x) {
                            return x.path === result;
                        })));
                        (0, _lodash.each)(candidates, function (x) {
                            _this8._candidateFinderCache.add(x.path);
                        });
                        asyncResult.complete();
                    }, function () {
                        asyncResult.complete();
                    });
                    listView.message.text('Please select a solution to load.');
                    if (openSelectList) {
                        openSelectList.onClosed.subscribe(function () {
                            if (!(0, _lodash.some)(slns, function (x) {
                                return _this8._candidateFinderCache.has(x.path);
                            })) {
                                (0, _lodash.defer)(function () {
                                    return listView.toggle();
                                });
                            } else {
                                asyncResult.complete();
                            }
                        });
                    } else {
                        (0, _lodash.defer)(function () {
                            return listView.toggle();
                        });
                    }
                    asyncResult.do({ complete: function complete() {
                            openSelectList = null;
                        } });
                    openSelectList = listView;
                    return asyncResult;
                } else {
                    return _rxjs.Observable.of(candidates);
                }
            });
        }
    }, {
        key: 'registerConfiguration',
        value: function registerConfiguration(callback) {
            this._configurations.add(callback);
            this._solutions.forEach(function (solution) {
                return callback(solution);
            });
        }
    }, {
        key: '_intersectPathMethod',
        value: function _intersectPathMethod(location, paths) {
            var validSolutionPaths = paths;
            var segments = location.split(path.sep);
            var mappedLocations = segments.map(function (loc, index) {
                return (0, _lodash.take)(segments, index + 1).join(path.sep);
            });
            mappedLocations.reverse();
            var intersect = (0, _lodash.intersection)(mappedLocations, validSolutionPaths)[0];
            if (intersect) {
                return intersect;
            }
        }
    }, {
        key: '_intersectPath',
        value: function _intersectPath(location) {
            return this._intersectPathMethod(location, fromIterator(this._solutions.entries()).filter(function (z) {
                return !z[1].isFolderPerFile;
            }).map(function (z) {
                return z[0];
            }));
        }
    }, {
        key: '_intersectAtomProjectPath',
        value: function _intersectAtomProjectPath(location) {
            return this._intersectPathMethod(location, this._atomProjects.paths);
        }
    }, {
        key: 'logger',
        get: function get() {
            if (this._unitTestMode_ || this._kick_in_the_pants_) {
                return {
                    log: function log() {},
                    error: function error() {}
                };
            }
            return console;
        }
    }, {
        key: '__specialCaseExtensions',
        get: function get() {
            return this._specialCaseExtensions;
        }
    }, {
        key: 'activeSolutions',
        get: function get() {
            return this._activeSolutions;
        }
    }, {
        key: 'solutionObserver',
        get: function get() {
            return this._observation;
        }
    }, {
        key: 'solutionAggregateObserver',
        get: function get() {
            return this._combination;
        }
    }, {
        key: 'activeSolution',
        get: function get() {
            return this._activeSolutionObserable;
        }
    }, {
        key: 'activatedSubject',
        get: function get() {
            return this._activatedSubject;
        }
    }, {
        key: 'connected',
        get: function get() {
            var iterator = this._solutions.values();
            var result = iterator.next();
            while (!result.done) {
                if (result.value.currentState === _omnisharpClient.DriverState.Connected) return true;
            }return false;
        }
    }]);

    return SolutionInstanceManager;
}();

function addCandidatesInOrder(candidates, cb) {
    var asyncSubject = new _rxjs.AsyncSubject();
    if (!candidates.length) {
        asyncSubject.next(candidates);
        asyncSubject.complete();
        return asyncSubject.toPromise();
    }
    var cds = candidates.slice();
    var candidate = cds.shift();
    var handleCandidate = function handleCandidate(cand) {
        cb(cand.path, cand.repo, cand.isProject, cand.originalFile).subscribe({
            complete: function complete() {
                if (cds.length) {
                    cand = cds.shift();
                    handleCandidate(cand);
                } else {
                    asyncSubject.next(candidates);
                    asyncSubject.complete();
                }
            }
        });
    };
    handleCandidate(candidate);
    return asyncSubject.toPromise();
}
function fromIterator(iterator) {
    var items = [];
    var result = iterator.next();
    while (!result.done) {
        items.push(result.value);
        result = iterator.next();
    }
    return items;
}
var SolutionManager = exports.SolutionManager = new SolutionInstanceManager();
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxpYi9zZXJ2ZXIvc29sdXRpb24tbWFuYWdlci50cyJdLCJuYW1lcyI6WyJwYXRoIiwiU09MVVRJT05fTE9BRF9USU1FIiwib3BlblNlbGVjdExpc3QiLCJTb2x1dGlvbkluc3RhbmNlTWFuYWdlciIsIl91bml0VGVzdE1vZGVfIiwiX2tpY2tfaW5fdGhlX3BhbnRzXyIsIl9jb25maWd1cmF0aW9ucyIsIlNldCIsIl9zb2x1dGlvbnMiLCJNYXAiLCJfc29sdXRpb25Qcm9qZWN0cyIsIl90ZW1wb3JhcnlTb2x1dGlvbnMiLCJXZWFrTWFwIiwiX2Rpc3Bvc2FibGVTb2x1dGlvbk1hcCIsIl9maW5kU29sdXRpb25DYWNoZSIsIl9jYW5kaWRhdGVGaW5kZXJDYWNoZSIsIl9hY3RpdmF0ZWQiLCJfbmV4dEluZGV4IiwiX3NwZWNpYWxDYXNlRXh0ZW5zaW9ucyIsIl9hY3RpdmVTb2x1dGlvbnMiLCJfb2JzZXJ2YXRpb24iLCJfY29tYmluYXRpb24iLCJfYWN0aXZlU29sdXRpb24iLCJfYWN0aXZlU29sdXRpb25PYnNlcmFibGUiLCJkaXN0aW5jdFVudGlsQ2hhbmdlZCIsImZpbHRlciIsInoiLCJwdWJsaXNoUmVwbGF5IiwicmVmQ291bnQiLCJfYWN0aXZhdGVkU3ViamVjdCIsImFjdGl2ZUVkaXRvciIsIl9kaXNwb3NhYmxlIiwiX3NvbHV0aW9uRGlzcG9zYWJsZSIsIl9hdG9tUHJvamVjdHMiLCJhZGQiLCJfYWN0aXZlU2VhcmNoIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ1bmRlZmluZWQiLCJfc3Vic2NyaWJlVG9BdG9tUHJvamVjdFRyYWNrZXIiLCJmbGF0TWFwIiwiZ2V0U29sdXRpb25Gb3JFZGl0b3IiLCJzdWJzY3JpYmUiLCJuZXh0IiwieCIsImFjdGl2YXRlIiwiYWN0aXZhdGVkU3ViamVjdCIsImZvckVhY2giLCJzb2x1dGlvbiIsImNvbm5lY3QiLCJkaXNwb3NlIiwiZGlzY29ubmVjdCIsImNsZWFyIiwicmVtb3ZlZCIsImhhcyIsIl9yZW1vdmVTb2x1dGlvbiIsInByb2plY3QiLCJhZGRlZCIsIm1hcCIsIl9jYW5kaWRhdGVGaW5kZXIiLCJmcm9tIiwiY2FuZGlkYXRlcyIsIl9maW5kUmVwb3NpdG9yeUZvclBhdGgiLCJjYW5kaWRhdGUiLCJyZXBvIiwidG9BcnJheSIsInRvUHJvbWlzZSIsInRoZW4iLCJuZXdDYW5kaWRhdGVzIiwiZnJvbUl0ZXJhdG9yIiwia2V5cyIsImlzUHJvamVjdCIsIm9yaWdpbmFsRmlsZSIsImZvdW5kIiwicmVwb3MiLCJhZGRDYW5kaWRhdGVzSW5PcmRlciIsIl9hZGRTb2x1dGlvbiIsImNhbmRpZGF0ZU9ic2VydmFibGUiLCJ3b3JraW5nUGF0aCIsImF0b20iLCJnZXRSZXBvc2l0b3JpZXMiLCJkaXJlY3RvcnkiLCJnZXRXb3JraW5nRGlyZWN0b3J5Iiwibm9ybWFsaXplIiwidGFrZSIsInRlbXBvcmFyeSIsInByb2plY3RQYXRoIiwiZGlybmFtZSIsImdldCIsImlzRGlzcG9zZWQiLCJvZiIsImRpc3Bvc2VyIiwiaW5kZXgiLCJyZXBvc2l0b3J5IiwicnVudGltZSIsIkNsck9yTW9ubyIsImlzRm9sZGVyUGVyRmlsZSIsImNkIiwiZGlzcG9zYWJsZSIsInNldCIsImNyZWF0ZSIsInJlbW92ZSIsImRlbGV0ZSIsImdldFZhbHVlIiwibGVuZ3RoIiwiY29uZmlnIiwidGVtcEQiLCJwdXNoIiwicmVzdWx0IiwiX2FkZFNvbHV0aW9uU3Vic2NyaXB0aW9ucyIsImVycm9yUmVzdWx0Iiwic3RhdGUiLCJFcnJvciIsImRlbGF5IiwiY29tcGxldGUiLCJtb2RlbCIsIm9ic2VydmUiLCJwcm9qZWN0QWRkZWQiLCJwcm9qZWN0UmVtb3ZlZCIsInByb2plY3RzIiwiZGVib3VuY2VUaW1lIiwidGltZW91dCIsInF1ZXVlIiwib25FcnJvclJlc3VtZU5leHQiLCJyZWZDb3VudERpc3Bvc2FibGUiLCJlbXB0eSIsIl9fc3BlY2lhbENhc2VFeHRlbnNpb25zIiwiZXh0IiwibG9jYXRpb24iLCJzb2x1dGlvblZhbHVlIiwiX2dldFNvbHV0aW9uRm9yVW5kZXJseWluZ1BhdGgiLCJfZmluZFNvbHV0aW9uRm9yVW5kZXJseWluZ1BhdGgiLCJlZGl0b3IiLCJfZ2V0U29sdXRpb25Gb3JFZGl0b3IiLCJpc0Rlc3Ryb3llZCIsImNvbnRleHQiLCJ0ZW1wIiwiZ2V0RGlzcG9zYWJsZSIsIm9uRGlkRGVzdHJveSIsImdldFBhdGgiLCJvbW5pc2hhcnAiLCJtZXRhZGF0YSIsImN1cnJlbnRTdGF0ZSIsIkRpc2Nvbm5lY3RlZCIsIl9zZXR1cEVkaXRvcldpdGhDb250ZXh0IiwiZG8iLCJzbG4iLCJjYiIsInBhdGhzIiwiaW50ZXJzZWN0IiwiX2ludGVyc2VjdFBhdGhNZXRob2QiLCJfaW50ZXJzZWN0UGF0aCIsIl9pc1BhcnRPZkFueUFjdGl2ZVNvbHV0aW9uIiwic2VnbWVudHMiLCJzcGxpdCIsInNlcCIsIm1hcHBlZExvY2F0aW9ucyIsImxvYyIsImpvaW4iLCJsIiwic3ViamVjdCIsIl9pbnRlcnNlY3RBdG9tUHJvamVjdFBhdGgiLCJyIiwibm90aWZpY2F0aW9ucyIsImFkZEluZm8iLCJ3aXRoQ2FuZGlkYXRlcyIsImxvZ2dlciIsImluZGVwZW5kZW50U291cmNlRmlsZXNUb1NlYXJjaCIsInNsbnMiLCJpdGVtcyIsImFzeW5jUmVzdWx0IiwibGlzdFZpZXciLCJkaXNwbGF5TmFtZSIsIm5hbWUiLCJ1bnNoaWZ0IiwibWVzc2FnZSIsInRleHQiLCJvbkNsb3NlZCIsInRvZ2dsZSIsImNhbGxiYWNrIiwidmFsaWRTb2x1dGlvblBhdGhzIiwicmV2ZXJzZSIsImVudHJpZXMiLCJsb2ciLCJlcnJvciIsImNvbnNvbGUiLCJpdGVyYXRvciIsInZhbHVlcyIsImRvbmUiLCJ2YWx1ZSIsIkNvbm5lY3RlZCIsImFzeW5jU3ViamVjdCIsImNkcyIsInNsaWNlIiwic2hpZnQiLCJoYW5kbGVDYW5kaWRhdGUiLCJjYW5kIiwiU29sdXRpb25NYW5hZ2VyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7SUFBWUEsSTs7QUFDWjs7QUFD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Q1B3RSxzQkFBVSxvQkFBQTtBQUNOLG9CQUFJOEUsSUFBSXhGLE1BQVIsRUFBZ0I7QUFDWjRGLDJCQUFPSixJQUFJRSxLQUFKLEVBQVA7QUFDQUMsb0NBQWdCQyxJQUFoQjtBQUNILGlCQUhELE1BR087QUFDSEwsaUNBQWFwSixJQUFiLENBQWtCa0IsVUFBbEI7QUFDQWtJLGlDQUFhN0UsUUFBYjtBQUNIO0FBQ0o7QUFUTSxTQURmO0FBWUgsS0FiRDtBQWNBaUYsb0JBQWdCcEksU0FBaEI7QUFDQSxXQUFPZ0ksYUFBYTdILFNBQWIsRUFBUDtBQUNIO0FBRUQsU0FBQUcsWUFBQSxDQUF5QnFILFFBQXpCLEVBQXNEO0FBQ2xELFFBQU1qQixRQUFhLEVBQW5CO0FBQ0EsUUFBSTdELFNBQVM4RSxTQUFTL0ksSUFBVCxFQUFiO0FBQ0EsV0FBTyxDQUFDaUUsT0FBT2dGLElBQWYsRUFBcUI7QUFDakJuQixjQUFNOUQsSUFBTixDQUFXQyxPQUFPaUYsS0FBbEI7QUFFQWpGLGlCQUFTOEUsU0FBUy9JLElBQVQsRUFBVDtBQUNIO0FBRUQsV0FBTzhILEtBQVA7QUFDSDtBQUdNLElBQU00Qiw0Q0FBa0IsSUFBSWxNLHVCQUFKLEVBQXhCIiwiZmlsZSI6ImxpYi9zZXJ2ZXIvc29sdXRpb24tbWFuYWdlci5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGRlZmVyLCBkZWxheSwgZGlmZmVyZW5jZSwgZWFjaCwgZW5kc1dpdGgsIGZpbHRlciwgZmluZCwgaW50ZXJzZWN0aW9uLCBwdWxsLCBzb21lLCB0YWtlIH0gZnJvbSAnbG9kYXNoJztcclxuaW1wb3J0IHsgZmluZENhbmRpZGF0ZXMsIENhbmRpZGF0ZSwgRHJpdmVyU3RhdGUsIFJ1bnRpbWUgfSBmcm9tICdvbW5pc2hhcnAtY2xpZW50JztcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcclxuaW1wb3J0IHsgQXN5bmNTdWJqZWN0LCBCZWhhdmlvclN1YmplY3QsIE9ic2VydmFibGUsIFNjaGVkdWxlciwgU3ViamVjdCB9IGZyb20gJ3J4anMnO1xyXG5pbXBvcnQgeyBDb21wb3NpdGVEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgUmVmQ291bnREaXNwb3NhYmxlIH0gZnJvbSAndHMtZGlzcG9zYWJsZXMnO1xyXG5pbXBvcnQgeyBHZW5lcmljU2VsZWN0TGlzdFZpZXcgfSBmcm9tICcuLi92aWV3cy9nZW5lcmljLWxpc3Qtdmlldyc7XHJcbmltcG9ydCB7IEF0b21Qcm9qZWN0VHJhY2tlciB9IGZyb20gJy4vYXRvbS1wcm9qZWN0cyc7XHJcbmltcG9ydCB7IFNvbHV0aW9uQWdncmVnYXRlT2JzZXJ2ZXIsIFNvbHV0aW9uT2JzZXJ2ZXIgfSBmcm9tICcuL2NvbXBvc2l0ZS1zb2x1dGlvbic7XHJcbmltcG9ydCB7IGlzT21uaXNoYXJwVGV4dEVkaXRvciwgSU9tbmlzaGFycFRleHRFZGl0b3IsIE9tbmlzaGFycEVkaXRvckNvbnRleHQgfSBmcm9tICcuL29tbmlzaGFycC10ZXh0LWVkaXRvcic7XHJcbmltcG9ydCB7IFNvbHV0aW9uIH0gZnJvbSAnLi9zb2x1dGlvbic7XHJcblxyXG50eXBlIFJFUE9TSVRPUlkgPSB7IGdldFdvcmtpbmdEaXJlY3RvcnkoKTogc3RyaW5nOyB9O1xyXG5jb25zdCBTT0xVVElPTl9MT0FEX1RJTUUgPSAzMDAwMDtcclxuXHJcbmxldCBvcGVuU2VsZWN0TGlzdDogR2VuZXJpY1NlbGVjdExpc3RWaWV3O1xyXG5jbGFzcyBTb2x1dGlvbkluc3RhbmNlTWFuYWdlciB7XHJcbiAgICAvKiB0c2xpbnQ6ZGlzYWJsZTp2YXJpYWJsZS1uYW1lICovXHJcbiAgICBwdWJsaWMgX3VuaXRUZXN0TW9kZV8gPSBmYWxzZTtcclxuICAgIHB1YmxpYyBfa2lja19pbl90aGVfcGFudHNfID0gZmFsc2U7XHJcblxyXG4gICAgcHJpdmF0ZSBnZXQgbG9nZ2VyKCkge1xyXG4gICAgICAgIGlmICh0aGlzLl91bml0VGVzdE1vZGVfIHx8IHRoaXMuX2tpY2tfaW5fdGhlX3BhbnRzXykge1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgbG9nOiAoKSA9PiB7LyogKi8gfSxcclxuICAgICAgICAgICAgICAgIGVycm9yOiAoKSA9PiB7LyogKi8gfVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGNvbnNvbGU7XHJcbiAgICB9XHJcbiAgICAvKiB0c2xpbnQ6ZW5hYmxlOnZhcmlhYmxlLW5hbWUgKi9cclxuICAgIHByaXZhdGUgX2Rpc3Bvc2FibGU6IENvbXBvc2l0ZURpc3Bvc2FibGU7XHJcbiAgICBwcml2YXRlIF9zb2x1dGlvbkRpc3Bvc2FibGU6IENvbXBvc2l0ZURpc3Bvc2FibGU7XHJcbiAgICBwcml2YXRlIF9hdG9tUHJvamVjdHM6IEF0b21Qcm9qZWN0VHJhY2tlcjtcclxuXHJcbiAgICBwcml2YXRlIF9jb25maWd1cmF0aW9ucyA9IG5ldyBTZXQ8KHNvbHV0aW9uOiBTb2x1dGlvbikgPT4gdm9pZD4oKTtcclxuICAgIHByaXZhdGUgX3NvbHV0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBTb2x1dGlvbj4oKTtcclxuICAgIHByaXZhdGUgX3NvbHV0aW9uUHJvamVjdHMgPSBuZXcgTWFwPHN0cmluZywgU29sdXRpb24+KCk7XHJcbiAgICBwcml2YXRlIF90ZW1wb3JhcnlTb2x1dGlvbnMgPSBuZXcgV2Vha01hcDxTb2x1dGlvbiwgUmVmQ291bnREaXNwb3NhYmxlPigpO1xyXG4gICAgcHJpdmF0ZSBfZGlzcG9zYWJsZVNvbHV0aW9uTWFwID0gbmV3IFdlYWtNYXA8U29sdXRpb24sIElEaXNwb3NhYmxlPigpO1xyXG4gICAgcHJpdmF0ZSBfZmluZFNvbHV0aW9uQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgT2JzZXJ2YWJsZTxTb2x1dGlvbj4+KCk7XHJcbiAgICBwcml2YXRlIF9jYW5kaWRhdGVGaW5kZXJDYWNoZSA9IG5ldyBTZXQ8c3RyaW5nPigpO1xyXG5cclxuICAgIHByaXZhdGUgX2FjdGl2YXRlZCA9IGZhbHNlO1xyXG4gICAgcHJpdmF0ZSBfbmV4dEluZGV4ID0gMDtcclxuICAgIHByaXZhdGUgX2FjdGl2ZVNlYXJjaDogUHJvbWlzZTxhbnk+O1xyXG5cclxuICAgIC8vIFRoZXNlIGV4dGVuc2lvbnMgb25seSBzdXBwb3J0IHNlcnZlciBwZXIgZm9sZGVyLCB1bmxpa2Ugbm9ybWFsIGNzIGZpbGVzLlxyXG4gICAgcHJpdmF0ZSBfc3BlY2lhbENhc2VFeHRlbnNpb25zID0gWycuY3N4JywgLypcIi5jYWtlXCIqL107XHJcbiAgICBwdWJsaWMgZ2V0IF9fc3BlY2lhbENhc2VFeHRlbnNpb25zKCkgeyByZXR1cm4gdGhpcy5fc3BlY2lhbENhc2VFeHRlbnNpb25zOyB9XHJcblxyXG4gICAgcHJpdmF0ZSBfYWN0aXZlU29sdXRpb25zOiBTb2x1dGlvbltdID0gW107XHJcbiAgICBwdWJsaWMgZ2V0IGFjdGl2ZVNvbHV0aW9ucygpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5fYWN0aXZlU29sdXRpb25zO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIHRoaXMgc29sdXRpb24gY2FuIGJlIHVzZWQgdG8gb2JzZXJ2ZSBiZWhhdmlvciBhY3Jvc3MgYWxsIHNvbHV0aW9uLlxyXG4gICAgcHJpdmF0ZSBfb2JzZXJ2YXRpb24gPSBuZXcgU29sdXRpb25PYnNlcnZlcigpO1xyXG4gICAgcHVibGljIGdldCBzb2x1dGlvbk9ic2VydmVyKCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9vYnNlcnZhdGlvbjtcclxuICAgIH1cclxuXHJcbiAgICAvLyB0aGlzIHNvbHV0aW9uIGNhbiBiZSB1c2VkIHRvIGFnZ3JlZ2F0ZSBiZWhhdmlvciBhY3Jvc3MgYWxsIHNvbHV0aW9uc1xyXG4gICAgcHJpdmF0ZSBfY29tYmluYXRpb24gPSBuZXcgU29sdXRpb25BZ2dyZWdhdGVPYnNlcnZlcigpO1xyXG4gICAgcHVibGljIGdldCBzb2x1dGlvbkFnZ3JlZ2F0ZU9ic2VydmVyKCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9jb21iaW5hdGlvbjtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9hY3RpdmVTb2x1dGlvbiA9IG5ldyBCZWhhdmlvclN1YmplY3Q8U29sdXRpb24+KG51bGwpO1xyXG4gICAgcHJpdmF0ZSBfYWN0aXZlU29sdXRpb25PYnNlcmFibGUgPSB0aGlzLl9hY3RpdmVTb2x1dGlvbi5kaXN0aW5jdFVudGlsQ2hhbmdlZCgpLmZpbHRlcih6ID0+ICEheikucHVibGlzaFJlcGxheSgxKS5yZWZDb3VudCgpO1xyXG4gICAgcHVibGljIGdldCBhY3RpdmVTb2x1dGlvbigpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5fYWN0aXZlU29sdXRpb25PYnNlcmFibGU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBfYWN0aXZhdGVkU3ViamVjdCA9IG5ldyBTdWJqZWN0PGJvb2xlYW4+KCk7XHJcbiAgICBwcml2YXRlIGdldCBhY3RpdmF0ZWRTdWJqZWN0KCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9hY3RpdmF0ZWRTdWJqZWN0O1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBhY3RpdmF0ZShhY3RpdmVFZGl0b3I6IE9ic2VydmFibGU8SU9tbmlzaGFycFRleHRFZGl0b3I+KSB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2FjdGl2YXRlZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLl9kaXNwb3NhYmxlID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKTtcclxuICAgICAgICB0aGlzLl9zb2x1dGlvbkRpc3Bvc2FibGUgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpO1xyXG4gICAgICAgIHRoaXMuX2F0b21Qcm9qZWN0cyA9IG5ldyBBdG9tUHJvamVjdFRyYWNrZXIoKTtcclxuICAgICAgICB0aGlzLl9kaXNwb3NhYmxlLmFkZCh0aGlzLl9hdG9tUHJvamVjdHMpO1xyXG5cclxuICAgICAgICB0aGlzLl9hY3RpdmVTZWFyY2ggPSBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcclxuXHJcbiAgICAgICAgLy8gbW9uaXRvciBhdG9tIHByb2plY3QgcGF0aHNcclxuICAgICAgICB0aGlzLl9zdWJzY3JpYmVUb0F0b21Qcm9qZWN0VHJhY2tlcigpO1xyXG5cclxuICAgICAgICAvLyBXZSB1c2UgdGhlIGFjdGl2ZSBlZGl0b3Igb24gb21uaXNoYXJwQXRvbSB0b1xyXG4gICAgICAgIC8vIGNyZWF0ZSBhbm90aGVyIG9ic2VydmFibGUgdGhhdCBjaG5hZ2VzIHdoZW4gd2UgZ2V0IGEgbmV3IHNvbHV0aW9uLlxyXG4gICAgICAgIHRoaXMuX2Rpc3Bvc2FibGUuYWRkKGFjdGl2ZUVkaXRvclxyXG4gICAgICAgICAgICAuZmlsdGVyKHogPT4gISF6KVxyXG4gICAgICAgICAgICAuZmxhdE1hcCh6ID0+IHRoaXMuZ2V0U29sdXRpb25Gb3JFZGl0b3IoeikpXHJcbiAgICAgICAgICAgIC5zdWJzY3JpYmUoeCA9PiB0aGlzLl9hY3RpdmVTb2x1dGlvbi5uZXh0KHgpKSk7XHJcblxyXG4gICAgICAgIHRoaXMuX2F0b21Qcm9qZWN0cy5hY3RpdmF0ZSgpO1xyXG4gICAgICAgIHRoaXMuX2FjdGl2YXRlZCA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5hY3RpdmF0ZWRTdWJqZWN0Lm5leHQodHJ1ZSk7XHJcbiAgICAgICAgdGhpcy5fZGlzcG9zYWJsZS5hZGQodGhpcy5fc29sdXRpb25EaXNwb3NhYmxlKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgY29ubmVjdCgpIHtcclxuICAgICAgICB0aGlzLl9zb2x1dGlvbnMuZm9yRWFjaChzb2x1dGlvbiA9PiBzb2x1dGlvbi5jb25uZWN0KCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBkaXNjb25uZWN0KCkge1xyXG4gICAgICAgIHRoaXMuX3NvbHV0aW9ucy5mb3JFYWNoKHNvbHV0aW9uID0+IHNvbHV0aW9uLmRpc3Bvc2UoKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGRlYWN0aXZhdGUoKSB7XHJcbiAgICAgICAgdGhpcy5fYWN0aXZhdGVkID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5fZGlzcG9zYWJsZS5kaXNwb3NlKCk7XHJcbiAgICAgICAgdGhpcy5kaXNjb25uZWN0KCk7XHJcblxyXG4gICAgICAgIHRoaXMuX3NvbHV0aW9ucy5jbGVhcigpO1xyXG4gICAgICAgIHRoaXMuX3NvbHV0aW9uUHJvamVjdHMuY2xlYXIoKTtcclxuICAgICAgICB0aGlzLl9maW5kU29sdXRpb25DYWNoZS5jbGVhcigpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBnZXQgY29ubmVjdGVkKCkge1xyXG4gICAgICAgIGNvbnN0IGl0ZXJhdG9yID0gdGhpcy5fc29sdXRpb25zLnZhbHVlcygpO1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGl0ZXJhdG9yLm5leHQoKTtcclxuICAgICAgICB3aGlsZSAoIXJlc3VsdC5kb25lKVxyXG4gICAgICAgICAgICBpZiAocmVzdWx0LnZhbHVlLmN1cnJlbnRTdGF0ZSA9PT0gRHJpdmVyU3RhdGUuQ29ubmVjdGVkKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX3N1YnNjcmliZVRvQXRvbVByb2plY3RUcmFja2VyKCkge1xyXG4gICAgICAgIHRoaXMuX2Rpc3Bvc2FibGUuYWRkKHRoaXMuX2F0b21Qcm9qZWN0cy5yZW1vdmVkXHJcbiAgICAgICAgICAgIC5maWx0ZXIoeiA9PiB0aGlzLl9zb2x1dGlvbnMuaGFzKHopKVxyXG4gICAgICAgICAgICAuc3Vic2NyaWJlKHByb2plY3QgPT4gdGhpcy5fcmVtb3ZlU29sdXRpb24ocHJvamVjdCkpKTtcclxuXHJcbiAgICAgICAgdGhpcy5fZGlzcG9zYWJsZS5hZGQodGhpcy5fYXRvbVByb2plY3RzLmFkZGVkXHJcbiAgICAgICAgICAgIC5maWx0ZXIocHJvamVjdCA9PiAhdGhpcy5fc29sdXRpb25Qcm9qZWN0cy5oYXMocHJvamVjdCkpXHJcbiAgICAgICAgICAgIC5tYXAocHJvamVjdCA9PiB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fY2FuZGlkYXRlRmluZGVyKHByb2plY3QpXHJcbiAgICAgICAgICAgICAgICAgICAgLmZsYXRNYXAoY2FuZGlkYXRlcyA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmZyb20oY2FuZGlkYXRlcylcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5mbGF0TWFwKHggPT4gdGhpcy5fZmluZFJlcG9zaXRvcnlGb3JQYXRoKHgucGF0aCksIChjYW5kaWRhdGUsIHJlcG8pID0+ICh7IGNhbmRpZGF0ZSwgcmVwbyB9KSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC50b0FycmF5KClcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC50b1Byb21pc2UoKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnRoZW4ocmVwb3MgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld0NhbmRpZGF0ZXMgPSBkaWZmZXJlbmNlKGNhbmRpZGF0ZXMubWFwKHogPT4gei5wYXRoKSwgZnJvbUl0ZXJhdG9yKHRoaXMuX3NvbHV0aW9ucy5rZXlzKCkpKS5tYXAoeiA9PiBmaW5kKGNhbmRpZGF0ZXMsIHsgcGF0aDogeiB9KSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLm1hcCgoeyBwYXRoLCBpc1Byb2plY3QsIG9yaWdpbmFsRmlsZSB9KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmb3VuZCA9IGZpbmQocmVwb3MsIHggPT4geC5jYW5kaWRhdGUucGF0aCA9PT0gcGF0aCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXBvID0gZm91bmQgJiYgZm91bmQucmVwbztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHBhdGgsIGlzUHJvamVjdCwgcmVwbywgb3JpZ2luYWxGaWxlIH07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBhZGRDYW5kaWRhdGVzSW5PcmRlcihuZXdDYW5kaWRhdGVzLCAoY2FuZGlkYXRlLCByZXBvLCBpc1Byb2plY3QsIG9yaWdpbmFsRmlsZSkgPT4gdGhpcy5fYWRkU29sdXRpb24oY2FuZGlkYXRlLCByZXBvLCBpc1Byb2plY3QsIHsgb3JpZ2luYWxGaWxlLCBwcm9qZWN0IH0pKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pLnRvUHJvbWlzZSgpO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuc3Vic2NyaWJlKGNhbmRpZGF0ZU9ic2VydmFibGUgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fYWN0aXZlU2VhcmNoID0gdGhpcy5fYWN0aXZlU2VhcmNoLnRoZW4oKCkgPT4gY2FuZGlkYXRlT2JzZXJ2YWJsZSk7XHJcbiAgICAgICAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9maW5kUmVwb3NpdG9yeUZvclBhdGgod29ya2luZ1BhdGg6IHN0cmluZykge1xyXG4gICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmZyb208UkVQT1NJVE9SWT4oYXRvbS5wcm9qZWN0LmdldFJlcG9zaXRvcmllcygpIHx8IFtdKVxyXG4gICAgICAgICAgICAuZmlsdGVyKHggPT4gISF4KVxyXG4gICAgICAgICAgICAubWFwKHJlcG8gPT4gKHsgcmVwbywgZGlyZWN0b3J5OiByZXBvLmdldFdvcmtpbmdEaXJlY3RvcnkoKSB9KSlcclxuICAgICAgICAgICAgLmZpbHRlcigoe2RpcmVjdG9yeX0pID0+IHBhdGgubm9ybWFsaXplKGRpcmVjdG9yeSkgPT09IHBhdGgubm9ybWFsaXplKHdvcmtpbmdQYXRoKSlcclxuICAgICAgICAgICAgLnRha2UoMSlcclxuICAgICAgICAgICAgLm1hcCh4ID0+IHgucmVwbyk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBfYWRkU29sdXRpb24oY2FuZGlkYXRlOiBzdHJpbmcsIHJlcG86IFJFUE9TSVRPUlksIGlzUHJvamVjdDogYm9vbGVhbiwge3RlbXBvcmFyeSA9IGZhbHNlLCBwcm9qZWN0LCBvcmlnaW5hbEZpbGV9OiB7IGRlbGF5PzogbnVtYmVyOyB0ZW1wb3Jhcnk/OiBib29sZWFuOyBwcm9qZWN0Pzogc3RyaW5nOyBvcmlnaW5hbEZpbGU/OiBzdHJpbmc7IH0pIHtcclxuICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IGNhbmRpZGF0ZTtcclxuICAgICAgICBpZiAoZW5kc1dpdGgoY2FuZGlkYXRlLCAnLnNsbicpKSB7XHJcbiAgICAgICAgICAgIGNhbmRpZGF0ZSA9IHBhdGguZGlybmFtZShjYW5kaWRhdGUpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHNvbHV0aW9uOiBTb2x1dGlvbjtcclxuICAgICAgICBpZiAodGhpcy5fc29sdXRpb25zLmhhcyhjYW5kaWRhdGUpKSB7XHJcbiAgICAgICAgICAgIHNvbHV0aW9uID0gdGhpcy5fc29sdXRpb25zLmdldChjYW5kaWRhdGUpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAocHJvamVjdCAmJiB0aGlzLl9zb2x1dGlvblByb2plY3RzLmhhcyhwcm9qZWN0KSkge1xyXG4gICAgICAgICAgICBzb2x1dGlvbiA9IHRoaXMuX3NvbHV0aW9uUHJvamVjdHMuZ2V0KHByb2plY3QpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHNvbHV0aW9uICYmICFzb2x1dGlvbi5pc0Rpc3Bvc2VkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLm9mKHNvbHV0aW9uKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHNvbHV0aW9uICYmIHNvbHV0aW9uLmlzRGlzcG9zZWQpIHtcclxuICAgICAgICAgICAgY29uc3QgZGlzcG9zZXIgPSB0aGlzLl9kaXNwb3NhYmxlU29sdXRpb25NYXAuZ2V0KHNvbHV0aW9uKTtcclxuICAgICAgICAgICAgZGlzcG9zZXIuZGlzcG9zZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc29sdXRpb24gPSBuZXcgU29sdXRpb24oe1xyXG4gICAgICAgICAgICBwcm9qZWN0UGF0aCxcclxuICAgICAgICAgICAgaW5kZXg6ICsrdGhpcy5fbmV4dEluZGV4LFxyXG4gICAgICAgICAgICB0ZW1wb3JhcnksXHJcbiAgICAgICAgICAgIHJlcG9zaXRvcnk6IDxhbnk+cmVwbyxcclxuICAgICAgICAgICAgcnVudGltZTogZW5kc1dpdGgob3JpZ2luYWxGaWxlLCAnLmNzeCcpID8gUnVudGltZS5DbHJPck1vbm8gOiBSdW50aW1lLkNsck9yTW9ub1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAoIWlzUHJvamVjdCkge1xyXG4gICAgICAgICAgICBzb2x1dGlvbi5pc0ZvbGRlclBlckZpbGUgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgY2QgPSBuZXcgQ29tcG9zaXRlRGlzcG9zYWJsZSgpO1xyXG5cclxuICAgICAgICB0aGlzLl9zb2x1dGlvbkRpc3Bvc2FibGUuYWRkKHNvbHV0aW9uKTtcclxuICAgICAgICBzb2x1dGlvbi5kaXNwb3NhYmxlLmFkZChjZCk7XHJcbiAgICAgICAgdGhpcy5fZGlzcG9zYWJsZVNvbHV0aW9uTWFwLnNldChzb2x1dGlvbiwgY2QpO1xyXG5cclxuICAgICAgICBzb2x1dGlvbi5kaXNwb3NhYmxlLmFkZChEaXNwb3NhYmxlLmNyZWF0ZSgoKSA9PiB7XHJcbiAgICAgICAgICAgIHNvbHV0aW9uLmNvbm5lY3QgPSAoKSA9PiB0aGlzLl9hZGRTb2x1dGlvbihjYW5kaWRhdGUsIHJlcG8sIGlzUHJvamVjdCwgeyB0ZW1wb3JhcnksIHByb2plY3QgfSk7XHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBjZC5hZGQoRGlzcG9zYWJsZS5jcmVhdGUoKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLl9zb2x1dGlvbkRpc3Bvc2FibGUucmVtb3ZlKGNkKTtcclxuICAgICAgICAgICAgcHVsbCh0aGlzLl9hY3RpdmVTb2x1dGlvbnMsIHNvbHV0aW9uKTtcclxuICAgICAgICAgICAgdGhpcy5fc29sdXRpb25zLmRlbGV0ZShjYW5kaWRhdGUpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMuX3RlbXBvcmFyeVNvbHV0aW9ucy5oYXMoc29sdXRpb24pKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl90ZW1wb3JhcnlTb2x1dGlvbnMuZGVsZXRlKHNvbHV0aW9uKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMuX2FjdGl2ZVNvbHV0aW9uLmdldFZhbHVlKCkgPT09IHNvbHV0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9hY3RpdmVTb2x1dGlvbi5uZXh0KHRoaXMuX2FjdGl2ZVNvbHV0aW9ucy5sZW5ndGggPyB0aGlzLl9hY3RpdmVTb2x1dGlvbnNbMF0gOiBudWxsKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgdGhpcy5fY29uZmlndXJhdGlvbnMuZm9yRWFjaChjb25maWcgPT4gY29uZmlnKHNvbHV0aW9uKSk7XHJcbiAgICAgICAgdGhpcy5fc29sdXRpb25zLnNldChjYW5kaWRhdGUsIHNvbHV0aW9uKTtcclxuXHJcbiAgICAgICAgLy8ga2VlcCB0cmFjayBvZiB0aGUgYWN0aXZlIHNvbHV0aW9uc1xyXG4gICAgICAgIGNkLmFkZCh0aGlzLl9vYnNlcnZhdGlvbi5hZGQoc29sdXRpb24pKTtcclxuICAgICAgICBjZC5hZGQodGhpcy5fY29tYmluYXRpb24uYWRkKHNvbHV0aW9uKSk7XHJcblxyXG4gICAgICAgIGlmICh0ZW1wb3JhcnkpIHtcclxuICAgICAgICAgICAgY29uc3QgdGVtcEQgPSBEaXNwb3NhYmxlLmNyZWF0ZSgoKSA9PiB7IC8qICovIH0pO1xyXG4gICAgICAgICAgICB0ZW1wRC5kaXNwb3NlKCk7XHJcbiAgICAgICAgICAgIHRoaXMuX3RlbXBvcmFyeVNvbHV0aW9ucy5zZXQoc29sdXRpb24sIG5ldyBSZWZDb3VudERpc3Bvc2FibGUodGVtcEQpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuX2FjdGl2ZVNvbHV0aW9ucy5wdXNoKHNvbHV0aW9uKTtcclxuICAgICAgICBpZiAodGhpcy5fYWN0aXZlU29sdXRpb25zLmxlbmd0aCA9PT0gMSlcclxuICAgICAgICAgICAgdGhpcy5fYWN0aXZlU29sdXRpb24ubmV4dChzb2x1dGlvbik7XHJcblxyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuX2FkZFNvbHV0aW9uU3Vic2NyaXB0aW9ucyhzb2x1dGlvbiwgY2QpO1xyXG4gICAgICAgIHNvbHV0aW9uLmNvbm5lY3QoKTtcclxuICAgICAgICByZXR1cm4gPE9ic2VydmFibGU8U29sdXRpb24+Pjxhbnk+cmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX2FkZFNvbHV0aW9uU3Vic2NyaXB0aW9ucyhzb2x1dGlvbjogU29sdXRpb24sIGNkOiBDb21wb3NpdGVEaXNwb3NhYmxlKSB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gbmV3IEFzeW5jU3ViamVjdDxTb2x1dGlvbj4oKTtcclxuICAgICAgICBjb25zdCBlcnJvclJlc3VsdCA9IHNvbHV0aW9uLnN0YXRlXHJcbiAgICAgICAgICAgIC5maWx0ZXIoeiA9PiB6ID09PSBEcml2ZXJTdGF0ZS5FcnJvcilcclxuICAgICAgICAgICAgLmRlbGF5KDEwMClcclxuICAgICAgICAgICAgLnRha2UoMSk7XHJcblxyXG4gICAgICAgIGNkLmFkZChlcnJvclJlc3VsdC5zdWJzY3JpYmUoKCkgPT4gcmVzdWx0LmNvbXBsZXRlKCkpKTsgLy8gSWYgdGhpcyBzb2x1dGlvbiBlcnJvcnMgbW92ZSBvbiB0byB0aGUgbmV4dFxyXG5cclxuICAgICAgICBjZC5hZGQoc29sdXRpb24ubW9kZWwub2JzZXJ2ZS5wcm9qZWN0QWRkZWQuc3Vic2NyaWJlKHByb2plY3QgPT4gdGhpcy5fc29sdXRpb25Qcm9qZWN0cy5zZXQocHJvamVjdC5wYXRoLCBzb2x1dGlvbikpKTtcclxuICAgICAgICBjZC5hZGQoc29sdXRpb24ubW9kZWwub2JzZXJ2ZS5wcm9qZWN0UmVtb3ZlZC5zdWJzY3JpYmUocHJvamVjdCA9PiB0aGlzLl9zb2x1dGlvblByb2plY3RzLmRlbGV0ZShwcm9qZWN0LnBhdGgpKSk7XHJcblxyXG4gICAgICAgIC8vIFdhaXQgZm9yIHRoZSBwcm9qZWN0cyB0byByZXR1cm4gZnJvbSB0aGUgc29sdXRpb25cclxuICAgICAgICBjZC5hZGQoc29sdXRpb24ubW9kZWwub2JzZXJ2ZS5wcm9qZWN0c1xyXG4gICAgICAgICAgICAuZGVib3VuY2VUaW1lKDEwMClcclxuICAgICAgICAgICAgLnRha2UoMSlcclxuICAgICAgICAgICAgLm1hcCgoKSA9PiBzb2x1dGlvbilcclxuICAgICAgICAgICAgLnRpbWVvdXQoU09MVVRJT05fTE9BRF9USU1FLCBTY2hlZHVsZXIucXVldWUpIC8vIFdhaXQgMzAgc2Vjb25kcyBmb3IgdGhlIHByb2plY3QgdG8gbG9hZC5cclxuICAgICAgICAgICAgLm9uRXJyb3JSZXN1bWVOZXh0KClcclxuICAgICAgICAgICAgLnN1YnNjcmliZSgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAvLyBXZSBsb2FkZWQgc3VjY2Vzc2Z1bGx5IHJldHVybiB0aGUgc29sdXRpb25cclxuICAgICAgICAgICAgICAgIHJlc3VsdC5uZXh0KHNvbHV0aW9uKTtcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5jb21wbGV0ZSgpO1xyXG4gICAgICAgICAgICB9LCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAvLyBNb3ZlIGFsb25nLlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LmNvbXBsZXRlKCk7XHJcbiAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9yZW1vdmVTb2x1dGlvbihjYW5kaWRhdGU6IHN0cmluZykge1xyXG4gICAgICAgIGlmIChlbmRzV2l0aChjYW5kaWRhdGUsICcuc2xuJykpIHtcclxuICAgICAgICAgICAgY2FuZGlkYXRlID0gcGF0aC5kaXJuYW1lKGNhbmRpZGF0ZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBzb2x1dGlvbiA9IHRoaXMuX3NvbHV0aW9ucy5nZXQoY2FuZGlkYXRlKTtcclxuXHJcbiAgICAgICAgY29uc3QgcmVmQ291bnREaXNwb3NhYmxlID0gc29sdXRpb24gJiYgdGhpcy5fdGVtcG9yYXJ5U29sdXRpb25zLmhhcyhzb2x1dGlvbikgJiYgdGhpcy5fdGVtcG9yYXJ5U29sdXRpb25zLmdldChzb2x1dGlvbik7XHJcbiAgICAgICAgaWYgKHJlZkNvdW50RGlzcG9zYWJsZSkge1xyXG4gICAgICAgICAgICByZWZDb3VudERpc3Bvc2FibGUuZGlzcG9zZSgpO1xyXG4gICAgICAgICAgICBpZiAoIXJlZkNvdW50RGlzcG9zYWJsZS5pc0Rpc3Bvc2VkKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIGtlZXAgdHJhY2sgb2YgdGhlIHJlbW92ZWQgc29sdXRpb25zXHJcbiAgICAgICAgaWYgKHNvbHV0aW9uKSB7XHJcbiAgICAgICAgICAgIHNvbHV0aW9uLmRpc3Bvc2UoKTtcclxuICAgICAgICAgICAgY29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX2Rpc3Bvc2FibGVTb2x1dGlvbk1hcC5nZXQoc29sdXRpb24pO1xyXG4gICAgICAgICAgICBpZiAoZGlzcG9zYWJsZSkgZGlzcG9zYWJsZS5kaXNwb3NlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBnZXRTb2x1dGlvbkZvclBhdGgocGF0aDogc3RyaW5nKSB7XHJcbiAgICAgICAgaWYgKCFwYXRoKVxyXG4gICAgICAgICAgICAvLyBObyB0ZXh0IGVkaXRvciBmb3VuZFxyXG4gICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5lbXB0eTxTb2x1dGlvbj4oKTtcclxuXHJcbiAgICAgICAgY29uc3QgaXNGb2xkZXJQZXJGaWxlID0gc29tZSh0aGlzLl9fc3BlY2lhbENhc2VFeHRlbnNpb25zLCBleHQgPT4gZW5kc1dpdGgocGF0aCwgZXh0KSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGxvY2F0aW9uID0gcGF0aDtcclxuICAgICAgICBpZiAoIWxvY2F0aW9uKSB7XHJcbiAgICAgICAgICAgIC8vIFRleHQgZWRpdG9yIG5vdCBzYXZlZCB5ZXQ/XHJcbiAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmVtcHR5PFNvbHV0aW9uPigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgc29sdXRpb25WYWx1ZSA9IHRoaXMuX2dldFNvbHV0aW9uRm9yVW5kZXJseWluZ1BhdGgobG9jYXRpb24sIGlzRm9sZGVyUGVyRmlsZSk7XHJcblxyXG4gICAgICAgIGlmIChzb2x1dGlvblZhbHVlKVxyXG4gICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5vZihzb2x1dGlvblZhbHVlKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ZpbmRTb2x1dGlvbkZvclVuZGVybHlpbmdQYXRoKGxvY2F0aW9uLCBpc0ZvbGRlclBlckZpbGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBnZXRTb2x1dGlvbkZvckVkaXRvcihlZGl0b3I6IEF0b20uVGV4dEVkaXRvcikge1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9nZXRTb2x1dGlvbkZvckVkaXRvcihlZGl0b3IpLmZpbHRlcigoKSA9PiAhZWRpdG9yLmlzRGVzdHJveWVkKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX3NldHVwRWRpdG9yV2l0aENvbnRleHQoZWRpdG9yOiBBdG9tLlRleHRFZGl0b3IsIHNvbHV0aW9uOiBTb2x1dGlvbikge1xyXG4gICAgICAgIGNvbnN0IGNvbnRleHQgPSBuZXcgT21uaXNoYXJwRWRpdG9yQ29udGV4dChlZGl0b3IsIHNvbHV0aW9uKTtcclxuICAgICAgICBjb25zdCByZXN1bHQ6IElPbW5pc2hhcnBUZXh0RWRpdG9yID0gPGFueT5lZGl0b3I7XHJcbiAgICAgICAgdGhpcy5fZGlzcG9zYWJsZS5hZGQoY29udGV4dCk7XHJcblxyXG4gICAgICAgIGlmIChzb2x1dGlvbiAmJiAhY29udGV4dC50ZW1wICYmIHRoaXMuX3RlbXBvcmFyeVNvbHV0aW9ucy5oYXMoc29sdXRpb24pKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlZkNvdW50RGlzcG9zYWJsZSA9IHRoaXMuX3RlbXBvcmFyeVNvbHV0aW9ucy5nZXQoc29sdXRpb24pO1xyXG4gICAgICAgICAgICBjb25zdCBkaXNwb3NhYmxlID0gcmVmQ291bnREaXNwb3NhYmxlLmdldERpc3Bvc2FibGUoKTtcclxuICAgICAgICAgICAgY29udGV4dC50ZW1wID0gdHJ1ZTtcclxuICAgICAgICAgICAgY29udGV4dC5zb2x1dGlvbi5kaXNwb3NhYmxlLmFkZChlZGl0b3Iub25EaWREZXN0cm95KCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fcmVtb3ZlU29sdXRpb24oc29sdXRpb24ucGF0aCk7XHJcbiAgICAgICAgICAgIH0pKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBfZ2V0U29sdXRpb25Gb3JFZGl0b3IoZWRpdG9yOiBBdG9tLlRleHRFZGl0b3IpIHtcclxuICAgICAgICBpZiAoIWVkaXRvcikge1xyXG4gICAgICAgICAgICAvLyBObyB0ZXh0IGVkaXRvciBmb3VuZFxyXG4gICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5lbXB0eTxTb2x1dGlvbj4oKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGxvY2F0aW9uID0gZWRpdG9yLmdldFBhdGgoKTtcclxuICAgICAgICBpZiAoIWxvY2F0aW9uKSB7XHJcbiAgICAgICAgICAgIC8vIFRleHQgZWRpdG9yIG5vdCBzYXZlZCB5ZXQ/XHJcbiAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmVtcHR5PFNvbHV0aW9uPigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGlzT21uaXNoYXJwVGV4dEVkaXRvcihlZGl0b3IpKSB7XHJcbiAgICAgICAgICAgIGlmIChlZGl0b3Iub21uaXNoYXJwLm1ldGFkYXRhKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBjbGllbnQgLyBzZXJ2ZXIgZG9lc25cInQgd29yayBjdXJyZW50bHkgZm9yIG1ldGFkYXRhIGRvY3VtZW50cy5cclxuICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmVtcHR5PFNvbHV0aW9uPigpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBzb2x1dGlvbiA9IGVkaXRvci5vbW5pc2hhcnAuc29sdXRpb247XHJcblxyXG4gICAgICAgICAgICAvLyBJZiB0aGUgc29sdXRpb24gaGFzIGRpc2Nvbm5lY3RlZCwgcmVjb25uZWN0IGl0XHJcbiAgICAgICAgICAgIGlmIChzb2x1dGlvbi5jdXJyZW50U3RhdGUgPT09IERyaXZlclN0YXRlLkRpc2Nvbm5lY3RlZCAmJiBhdG9tLmNvbmZpZy5nZXQoJ29tbmlzaGFycC1hdG9tLmF1dG9TdGFydE9uQ29tcGF0aWJsZUZpbGUnKSlcclxuICAgICAgICAgICAgICAgIHNvbHV0aW9uLmNvbm5lY3QoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENsaWVudCBpcyBpbiBhbiBpbnZhbGlkIHN0YXRlXHJcbiAgICAgICAgICAgIGlmIChzb2x1dGlvbi5jdXJyZW50U3RhdGUgPT09IERyaXZlclN0YXRlLkVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5lbXB0eTxTb2x1dGlvbj4oKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUub2Yoc29sdXRpb24pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaXNGb2xkZXJQZXJGaWxlID0gc29tZSh0aGlzLl9fc3BlY2lhbENhc2VFeHRlbnNpb25zLCBleHQgPT4gZW5kc1dpdGgoZWRpdG9yLmdldFBhdGgoKSwgZXh0KSk7XHJcbiAgICAgICAgY29uc3Qgc29sdXRpb24gPSB0aGlzLl9nZXRTb2x1dGlvbkZvclVuZGVybHlpbmdQYXRoKGxvY2F0aW9uLCBpc0ZvbGRlclBlckZpbGUpO1xyXG4gICAgICAgIGlmIChzb2x1dGlvbikge1xyXG4gICAgICAgICAgICB0aGlzLl9zZXR1cEVkaXRvcldpdGhDb250ZXh0KGVkaXRvciwgc29sdXRpb24pO1xyXG4gICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5vZihzb2x1dGlvbik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gdGhpcy5fZmluZFNvbHV0aW9uRm9yVW5kZXJseWluZ1BhdGgobG9jYXRpb24sIGlzRm9sZGVyUGVyRmlsZSlcclxuICAgICAgICAgICAgLmRvKHNsbiA9PiB0aGlzLl9zZXR1cEVkaXRvcldpdGhDb250ZXh0KGVkaXRvciwgc2xuKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBfaXNQYXJ0T2ZBbnlBY3RpdmVTb2x1dGlvbjxUPihsb2NhdGlvbjogc3RyaW5nLCBjYjogKGludGVyc2VjdDogc3RyaW5nLCBzb2x1dGlvbjogU29sdXRpb24pID0+IFQpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHNvbHV0aW9uIG9mIHRoaXMuX2FjdGl2ZVNvbHV0aW9ucykge1xyXG4gICAgICAgICAgICAvLyBXZSBkb25cInQgY2hlY2sgZm9yIGZvbGRlciBiYXNlZCBzb2x1dGlvbnNcclxuICAgICAgICAgICAgaWYgKHNvbHV0aW9uLmlzRm9sZGVyUGVyRmlsZSkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBwYXRocyA9IHNvbHV0aW9uLm1vZGVsLnByb2plY3RzLm1hcCh6ID0+IHoucGF0aCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGludGVyc2VjdCA9IHRoaXMuX2ludGVyc2VjdFBhdGhNZXRob2QobG9jYXRpb24sIHBhdGhzKTtcclxuICAgICAgICAgICAgaWYgKGludGVyc2VjdCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNiKGludGVyc2VjdCwgc29sdXRpb24pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX2dldFNvbHV0aW9uRm9yVW5kZXJseWluZ1BhdGgobG9jYXRpb246IHN0cmluZywgaXNGb2xkZXJQZXJGaWxlOiBib29sZWFuKTogU29sdXRpb24ge1xyXG4gICAgICAgIGlmIChsb2NhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGlzRm9sZGVyUGVyRmlsZSkge1xyXG4gICAgICAgICAgICAvLyBDU1ggYXJlIHNwZWNpYWwsIGFuZCBuZWVkIGEgc29sdXRpb24gcGVyIGRpcmVjdG9yeS5cclxuICAgICAgICAgICAgY29uc3QgZGlyZWN0b3J5ID0gcGF0aC5kaXJuYW1lKGxvY2F0aW9uKTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuX3NvbHV0aW9ucy5oYXMoZGlyZWN0b3J5KSlcclxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9zb2x1dGlvbnMuZ2V0KGRpcmVjdG9yeSk7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zdCBpbnRlcnNlY3QgPSB0aGlzLl9pbnRlcnNlY3RQYXRoKGxvY2F0aW9uKTtcclxuICAgICAgICAgICAgaWYgKGludGVyc2VjdCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NvbHV0aW9ucy5nZXQoaW50ZXJzZWN0KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCFpc0ZvbGRlclBlckZpbGUpIHtcclxuICAgICAgICAgICAgLy8gQXR0ZW1wdCB0byBzZWUgaWYgdGhpcyBmaWxlIGlzIHBhcnQgYSBzb2x1dGlvblxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faXNQYXJ0T2ZBbnlBY3RpdmVTb2x1dGlvbihsb2NhdGlvbiwgKGludGVyc2VjdCwgc29sdXRpb24pID0+IHNvbHV0aW9uKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX2ZpbmRTb2x1dGlvbkZvclVuZGVybHlpbmdQYXRoKGxvY2F0aW9uOiBzdHJpbmcsIGlzRm9sZGVyUGVyRmlsZTogYm9vbGVhbik6IE9ic2VydmFibGU8U29sdXRpb24+IHtcclxuICAgICAgICBjb25zdCBkaXJlY3RvcnkgPSBwYXRoLmRpcm5hbWUobG9jYXRpb24pO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuX2FjdGl2YXRlZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hY3RpdmF0ZWRTdWJqZWN0LnRha2UoMSlcclxuICAgICAgICAgICAgICAgIC5mbGF0TWFwKCgpID0+IHRoaXMuX2ZpbmRTb2x1dGlvbkZvclVuZGVybHlpbmdQYXRoKGxvY2F0aW9uLCBpc0ZvbGRlclBlckZpbGUpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHNlZ21lbnRzID0gbG9jYXRpb24uc3BsaXQocGF0aC5zZXApO1xyXG4gICAgICAgIGNvbnN0IG1hcHBlZExvY2F0aW9ucyA9IHNlZ21lbnRzLm1hcCgobG9jLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gdGFrZShzZWdtZW50cywgaW5kZXggKyAxKS5qb2luKHBhdGguc2VwKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBsIG9mIG1hcHBlZExvY2F0aW9ucykge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5fZmluZFNvbHV0aW9uQ2FjaGUuaGFzKGwpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fZmluZFNvbHV0aW9uQ2FjaGUuZ2V0KGwpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBzdWJqZWN0ID0gbmV3IEFzeW5jU3ViamVjdDxTb2x1dGlvbj4oKTtcclxuICAgICAgICBlYWNoKG1hcHBlZExvY2F0aW9ucywgbCA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuX2ZpbmRTb2x1dGlvbkNhY2hlLnNldChsLCA8T2JzZXJ2YWJsZTxTb2x1dGlvbj4+PGFueT5zdWJqZWN0KTtcclxuICAgICAgICAgICAgc3ViamVjdC5zdWJzY3JpYmUoeyBjb21wbGV0ZTogKCkgPT4gdGhpcy5fZmluZFNvbHV0aW9uQ2FjaGUuZGVsZXRlKGwpIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBwcm9qZWN0ID0gdGhpcy5faW50ZXJzZWN0QXRvbVByb2plY3RQYXRoKGRpcmVjdG9yeSk7XHJcbiAgICAgICAgY29uc3QgY2IgPSAoY2FuZGlkYXRlczogQ2FuZGlkYXRlW10pID0+IHtcclxuICAgICAgICAgICAgLy8gV2Ugb25seSB3YW50IHRvIHNlYXJjaCBmb3Igc29sdXRpb25zIGFmdGVyIHRoZSBtYWluIHNvbHV0aW9ucyBoYXZlIGJlZW4gcHJvY2Vzc2VkLlxyXG4gICAgICAgICAgICAvLyBXZSBjYW4gZ2V0IGludG8gdGhpcyByYWNlIGNvbmRpdGlvbiBpZiB0aGUgdXNlciBoYXMgd2luZG93cyB0aGF0IHdlcmUgb3BlbmVkIHByZXZpb3VzbHkuXHJcbiAgICAgICAgICAgIGlmICghdGhpcy5fYWN0aXZhdGVkKSB7XHJcbiAgICAgICAgICAgICAgICBkZWxheShjYiwgU09MVVRJT05fTE9BRF9USU1FKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKCFpc0ZvbGRlclBlckZpbGUpIHtcclxuICAgICAgICAgICAgICAgIC8vIEF0dGVtcHQgdG8gc2VlIGlmIHRoaXMgZmlsZSBpcyBwYXJ0IGEgc29sdXRpb25cclxuICAgICAgICAgICAgICAgIGNvbnN0IHIgPSB0aGlzLl9pc1BhcnRPZkFueUFjdGl2ZVNvbHV0aW9uKGxvY2F0aW9uLCAoaW50ZXJzZWN0LCBzb2x1dGlvbikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHN1YmplY3QubmV4dChzb2x1dGlvbik7XHJcbiAgICAgICAgICAgICAgICAgICAgc3ViamVjdC5jb21wbGV0ZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBpZiAocikgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLl9hY3RpdmVTZWFyY2gudGhlbigoKSA9PiBPYnNlcnZhYmxlLmZyb20oY2FuZGlkYXRlcylcclxuICAgICAgICAgICAgICAgIC5mbGF0TWFwKHggPT4gdGhpcy5fZmluZFJlcG9zaXRvcnlGb3JQYXRoKHgucGF0aCksIChjYW5kaWRhdGUsIHJlcG8pID0+ICh7IGNhbmRpZGF0ZSwgcmVwbyB9KSlcclxuICAgICAgICAgICAgICAgIC50b0FycmF5KClcclxuICAgICAgICAgICAgICAgIC50b1Byb21pc2UoKVxyXG4gICAgICAgICAgICAgICAgLnRoZW4ocmVwb3MgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld0NhbmRpZGF0ZXMgPSBkaWZmZXJlbmNlKGNhbmRpZGF0ZXMubWFwKHogPT4gei5wYXRoKSwgZnJvbUl0ZXJhdG9yKHRoaXMuX3NvbHV0aW9ucy5rZXlzKCkpKS5tYXAoeiA9PiBmaW5kKGNhbmRpZGF0ZXMsIHsgcGF0aDogeiB9KSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgLm1hcCgoeyBwYXRoLCBpc1Byb2plY3QsIG9yaWdpbmFsRmlsZSB9KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmb3VuZCA9IGZpbmQocmVwb3MsIHggPT4geC5jYW5kaWRhdGUucGF0aCA9PT0gcGF0aCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXBvID0gZm91bmQgJiYgZm91bmQucmVwbztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHBhdGgsIGlzUHJvamVjdCwgcmVwbywgb3JpZ2luYWxGaWxlIH07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGFkZENhbmRpZGF0ZXNJbk9yZGVyKG5ld0NhbmRpZGF0ZXMsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIChjYW5kaWRhdGUsIHJlcG8sIGlzUHJvamVjdCwgb3JpZ2luYWxGaWxlKSA9PiB0aGlzLl9hZGRTb2x1dGlvbihjYW5kaWRhdGUsIHJlcG8sIGlzUHJvamVjdCwgeyB0ZW1wb3Jhcnk6ICFwcm9qZWN0LCBvcmlnaW5hbEZpbGUgfSkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghaXNGb2xkZXJQZXJGaWxlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQXR0ZW1wdCB0byBzZWUgaWYgdGhpcyBmaWxlIGlzIHBhcnQgYSBzb2x1dGlvblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHIgPSB0aGlzLl9pc1BhcnRPZkFueUFjdGl2ZVNvbHV0aW9uKGxvY2F0aW9uLCAoaW50ZXJzZWN0LCBzb2x1dGlvbikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJqZWN0Lm5leHQoc29sdXRpb24pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJqZWN0LmNvbXBsZXRlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocikgeyByZXR1cm47IH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnRlcnNlY3QgPSB0aGlzLl9pbnRlcnNlY3RQYXRoKGxvY2F0aW9uKSB8fCB0aGlzLl9pbnRlcnNlY3RBdG9tUHJvamVjdFBhdGgobG9jYXRpb24pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGludGVyc2VjdCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLl9zb2x1dGlvbnMuaGFzKGludGVyc2VjdCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3ViamVjdC5uZXh0KHRoaXMuX3NvbHV0aW9ucy5nZXQoaW50ZXJzZWN0KSk7IC8vIFRoZSBib29sZWFuIG1lYW5zIHRoaXMgc29sdXRpb24gaXMgdGVtcG9yYXJ5LlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEluZm8oYENvdWxkIG5vdCBmaW5kIGEgc29sdXRpb24gZm9yIFwiJHtsb2NhdGlvbn1cImApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3ViamVjdC5jb21wbGV0ZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLl9jYW5kaWRhdGVGaW5kZXIoZGlyZWN0b3J5KS5zdWJzY3JpYmUoY2IpO1xyXG5cclxuICAgICAgICByZXR1cm4gPE9ic2VydmFibGU8U29sdXRpb24+Pjxhbnk+c3ViamVjdDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9jYW5kaWRhdGVGaW5kZXIoZGlyZWN0b3J5OiBzdHJpbmcpIHtcclxuICAgICAgICByZXR1cm4gZmluZENhbmRpZGF0ZXMud2l0aENhbmRpZGF0ZXMoZGlyZWN0b3J5LCB0aGlzLmxvZ2dlciwge1xyXG4gICAgICAgICAgICBpbmRlcGVuZGVudFNvdXJjZUZpbGVzVG9TZWFyY2g6IHRoaXMuX19zcGVjaWFsQ2FzZUV4dGVuc2lvbnMubWFwKHogPT4gJyonICsgeilcclxuICAgICAgICB9KVxyXG4gICAgICAgICAgICAuZmxhdE1hcChjYW5kaWRhdGVzID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHNsbnMgPSBmaWx0ZXIoY2FuZGlkYXRlcywgeCA9PiBlbmRzV2l0aCh4LnBhdGgsICcuc2xuJykpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHNsbnMubGVuZ3RoID4gMSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gZGlmZmVyZW5jZShjYW5kaWRhdGVzLCBzbG5zKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhc3luY1Jlc3VsdCA9IG5ldyBBc3luY1N1YmplY3Q8dHlwZW9mIGNhbmRpZGF0ZXM+KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXN5bmNSZXN1bHQubmV4dChpdGVtcyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIGhhbmRsZSBtdWx0aXBsZSBzb2x1dGlvbnMuXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGlzdFZpZXcgPSBuZXcgR2VuZXJpY1NlbGVjdExpc3RWaWV3KCcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzbG5zLm1hcCh4ID0+ICh7IGRpc3BsYXlOYW1lOiB4LnBhdGgsIG5hbWU6IHgucGF0aCB9KSksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIChyZXN1bHQ6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlbXMudW5zaGlmdCguLi5zbG5zLmZpbHRlcih4ID0+IHgucGF0aCA9PT0gcmVzdWx0KSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlYWNoKGNhbmRpZGF0ZXMsIHggPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2NhbmRpZGF0ZUZpbmRlckNhY2hlLmFkZCh4LnBhdGgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXN5bmNSZXN1bHQuY29tcGxldGUoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXN5bmNSZXN1bHQuY29tcGxldGUoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGxpc3RWaWV3Lm1lc3NhZ2UudGV4dCgnUGxlYXNlIHNlbGVjdCBhIHNvbHV0aW9uIHRvIGxvYWQuJyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIFNob3cgdGhlIHZpZXdcclxuICAgICAgICAgICAgICAgICAgICBpZiAob3BlblNlbGVjdExpc3QpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgb3BlblNlbGVjdExpc3Qub25DbG9zZWQuc3Vic2NyaWJlKCgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc29tZShzbG5zLCB4ID0+IHRoaXMuX2NhbmRpZGF0ZUZpbmRlckNhY2hlLmhhcyh4LnBhdGgpKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVyKCgpID0+IGxpc3RWaWV3LnRvZ2dsZSgpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXN5bmNSZXN1bHQuY29tcGxldGUoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXIoKCkgPT4gbGlzdFZpZXcudG9nZ2xlKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgYXN5bmNSZXN1bHQuZG8oeyBjb21wbGV0ZTogKCkgPT4geyBvcGVuU2VsZWN0TGlzdCA9IG51bGw7IH0gfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgb3BlblNlbGVjdExpc3QgPSBsaXN0VmlldztcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIDxPYnNlcnZhYmxlPHR5cGVvZiBjYW5kaWRhdGVzPj48YW55PmFzeW5jUmVzdWx0O1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5vZihjYW5kaWRhdGVzKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHJlZ2lzdGVyQ29uZmlndXJhdGlvbihjYWxsYmFjazogKHNvbHV0aW9uOiBTb2x1dGlvbikgPT4gdm9pZCkge1xyXG4gICAgICAgIHRoaXMuX2NvbmZpZ3VyYXRpb25zLmFkZChjYWxsYmFjayk7XHJcbiAgICAgICAgdGhpcy5fc29sdXRpb25zLmZvckVhY2goc29sdXRpb24gPT4gY2FsbGJhY2soc29sdXRpb24pKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9pbnRlcnNlY3RQYXRoTWV0aG9kKGxvY2F0aW9uOiBzdHJpbmcsIHBhdGhzPzogc3RyaW5nW10pIHtcclxuICAgICAgICBjb25zdCB2YWxpZFNvbHV0aW9uUGF0aHMgPSBwYXRocztcclxuXHJcbiAgICAgICAgY29uc3Qgc2VnbWVudHMgPSBsb2NhdGlvbi5zcGxpdChwYXRoLnNlcCk7XHJcbiAgICAgICAgY29uc3QgbWFwcGVkTG9jYXRpb25zID0gc2VnbWVudHMubWFwKChsb2MsIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiB0YWtlKHNlZ21lbnRzLCBpbmRleCArIDEpLmpvaW4ocGF0aC5zZXApO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBMb29rIGZvciB0aGUgY2xvc2VzdCBtYXRjaCBmaXJzdC5cclxuICAgICAgICBtYXBwZWRMb2NhdGlvbnMucmV2ZXJzZSgpO1xyXG5cclxuICAgICAgICBjb25zdCBpbnRlcnNlY3Q6IHN0cmluZyA9IGludGVyc2VjdGlvbihtYXBwZWRMb2NhdGlvbnMsIHZhbGlkU29sdXRpb25QYXRocylbMF07XHJcbiAgICAgICAgaWYgKGludGVyc2VjdCkge1xyXG4gICAgICAgICAgICByZXR1cm4gaW50ZXJzZWN0O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9pbnRlcnNlY3RQYXRoKGxvY2F0aW9uOiBzdHJpbmcpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5faW50ZXJzZWN0UGF0aE1ldGhvZChsb2NhdGlvbiwgZnJvbUl0ZXJhdG9yKHRoaXMuX3NvbHV0aW9ucy5lbnRyaWVzKCkpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoeiA9PiAhelsxXS5pc0ZvbGRlclBlckZpbGUpLm1hcCh6ID0+IHpbMF0pKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9pbnRlcnNlY3RBdG9tUHJvamVjdFBhdGgobG9jYXRpb246IHN0cmluZykge1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9pbnRlcnNlY3RQYXRoTWV0aG9kKGxvY2F0aW9uLCB0aGlzLl9hdG9tUHJvamVjdHMucGF0aHMpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBhZGRDYW5kaWRhdGVzSW5PcmRlcihjYW5kaWRhdGVzOiB7IHBhdGg6IHN0cmluZzsgcmVwbzogUkVQT1NJVE9SWTsgaXNQcm9qZWN0OiBib29sZWFuOyBvcmlnaW5hbEZpbGU6IHN0cmluZzsgfVtdLCBjYjogKGNhbmRpZGF0ZTogc3RyaW5nLCByZXBvOiBSRVBPU0lUT1JZLCBpc1Byb2plY3Q6IGJvb2xlYW4sIG9yaWdpbmFsRmlsZTogc3RyaW5nKSA9PiBPYnNlcnZhYmxlPFNvbHV0aW9uPikge1xyXG4gICAgY29uc3QgYXN5bmNTdWJqZWN0ID0gbmV3IEFzeW5jU3ViamVjdCgpO1xyXG5cclxuICAgIGlmICghY2FuZGlkYXRlcy5sZW5ndGgpIHtcclxuICAgICAgICBhc3luY1N1YmplY3QubmV4dChjYW5kaWRhdGVzKTtcclxuICAgICAgICBhc3luY1N1YmplY3QuY29tcGxldGUoKTtcclxuICAgICAgICByZXR1cm4gYXN5bmNTdWJqZWN0LnRvUHJvbWlzZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNkcyA9IGNhbmRpZGF0ZXMuc2xpY2UoKTtcclxuICAgIGNvbnN0IGNhbmRpZGF0ZSA9IGNkcy5zaGlmdCgpO1xyXG4gICAgY29uc3QgaGFuZGxlQ2FuZGlkYXRlID0gKGNhbmQ6IHsgcGF0aDogc3RyaW5nOyByZXBvOiBSRVBPU0lUT1JZOyBpc1Byb2plY3Q6IGJvb2xlYW47IG9yaWdpbmFsRmlsZTogc3RyaW5nOyB9KSA9PiB7XHJcbiAgICAgICAgY2IoY2FuZC5wYXRoLCBjYW5kLnJlcG8sIGNhbmQuaXNQcm9qZWN0LCBjYW5kLm9yaWdpbmFsRmlsZSlcclxuICAgICAgICAgICAgLnN1YnNjcmliZSh7XHJcbiAgICAgICAgICAgICAgICBjb21wbGV0ZTogKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChjZHMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbmQgPSBjZHMuc2hpZnQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaGFuZGxlQ2FuZGlkYXRlKGNhbmQpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzeW5jU3ViamVjdC5uZXh0KGNhbmRpZGF0ZXMpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhc3luY1N1YmplY3QuY29tcGxldGUoKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfTtcclxuICAgIGhhbmRsZUNhbmRpZGF0ZShjYW5kaWRhdGUpO1xyXG4gICAgcmV0dXJuIGFzeW5jU3ViamVjdC50b1Byb21pc2UoKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZnJvbUl0ZXJhdG9yPFQ+KGl0ZXJhdG9yOiBJdGVyYWJsZUl0ZXJhdG9yPFQ+KSB7XHJcbiAgICBjb25zdCBpdGVtczogVFtdID0gW107XHJcbiAgICBsZXQgcmVzdWx0ID0gaXRlcmF0b3IubmV4dCgpO1xyXG4gICAgd2hpbGUgKCFyZXN1bHQuZG9uZSkge1xyXG4gICAgICAgIGl0ZW1zLnB1c2gocmVzdWx0LnZhbHVlKTtcclxuXHJcbiAgICAgICAgcmVzdWx0ID0gaXRlcmF0b3IubmV4dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBpdGVtcztcclxufVxyXG5cclxuLyogdHNsaW50OmRpc2FibGU6dmFyaWFibGUtbmFtZSAqL1xyXG5leHBvcnQgY29uc3QgU29sdXRpb25NYW5hZ2VyID0gbmV3IFNvbHV0aW9uSW5zdGFuY2VNYW5hZ2VyKCk7XHJcbi8qIHRzbGludDplbmFibGU6dmFyaWFibGUtbmFtZSAqL1xyXG4iXX0=
