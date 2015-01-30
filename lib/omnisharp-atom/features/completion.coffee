CompletionProvider = require "./lib/completion-provider"

module.exports =
class Completion
  autocompleteService: null
  constructor: ->
    @registerProviders()

  registerProviders: ->
    provider = new CompletionProvider

    console.log(provider)
    @autocompleteService = atom.services.provide 'autocomplete.provider', '1.0.0', provider: provider

  deactivate: ->
    @autocompleteService?.dispose()
    @editorSubscription = null
