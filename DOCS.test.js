import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const docs_path = './src/node_modules/DOCS/index.js'

describe('DOCS isolated handlers', () => {
  let DOCS

  beforeEach(() => {
    delete global.__DOCS_GLOBAL_STATE__
    delete require.cache[require.resolve(docs_path)]
    DOCS = require(docs_path)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function create_docs () {
    return DOCS('test_component.js')('sid_1')
  }

  function create_action () {
    return {
      name: 'Open File',
      info: 'Open the selected file.',
      icon: 'file',
      status: {},
      steps: []
    }
  }

  it('accepts only function handlers and exposes only the isolated API', async () => {
    const docs = create_docs()
    const receiver = {}
    const event = {}

    function inspect (event, $) {
      event.receiver = this
      event.keys = Object.keys($)
    }

    expect(() => docs.wrap_isolated('function () {}')).toThrow('must be a function')
    expect(Object.keys(docs).sort()).toEqual([
      'admin',
      'clear_handler_docs',
      'get_docs_mode',
      'get_toc',
      'on_docs_mode_change',
      'register_actions',
      'wrap_isolated'
    ])

    await docs.wrap_isolated(inspect).call(receiver, event)
    expect(event.receiver).toBe(receiver)
    expect(event.keys).toEqual(['state'])
  })

  it('blocks the event and shows handler info in docs mode', async () => {
    const docs = create_docs()
    const displays = []
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() }

    function on_click (event) {
      event.ran = true
      return 'clicked'
    }
    on_click.info = 'Click docs.'

    docs.admin.set_doc_display_handler(display => displays.push(display))
    docs.admin.set_docs_mode(true)

    await expect(docs.wrap_isolated(on_click)(event)).resolves.toBe('clicked')
    expect(event.ran).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
    expect(displays).toEqual([{ content: 'Click docs.', sid: 'sid_1' }])
  })

  it('lists, deduplicates, and clears handler docs', () => {
    const docs = create_docs()

    function first () {}
    function second () {}
    function third () {}
    first.info = '# Same\nDocs.'
    second.info = '# Same\nDocs.'
    third.info = '# Other\nDocs.'

    docs.register_actions([create_action()])
    docs.wrap_isolated(first)
    docs.wrap_isolated(second)
    docs.wrap_isolated(third)

    expect(docs.get_toc().actions[0].name).toBe('Open File')
    expect(docs.get_toc().handlers.map(entry => entry.doc)).toEqual(['# Same\nDocs.', '# Other\nDocs.'])

    docs.clear_handler_docs()
    expect(docs.get_toc().handlers).toEqual([])
  })

  it('runs registered action closures from function handlers', async () => {
    const docs = create_docs()
    const interaction_state = { count: 0 }
    const run = vi.fn(() => 'completed')
    const action = { ...create_action(), run }

    function on_click (event, $) {
      $.state.count += 1
      if ($.state.count === 2) $('open_file')
      return $.state.count
    }
    on_click.info = 'Count clicks.'
    on_click.opts = { state: interaction_state }

    docs.register_actions([action])
    const handler = docs.wrap_isolated(on_click)

    expect(docs.get_toc().handlers[0].doc).toBe('Count clicks.')
    expect(await handler({})).toBe(1)
    expect(await handler({})).toBe('completed')
    expect(run).toHaveBeenCalledOnce()
    expect(interaction_state.count).toBe(2)
    expect(docs.admin.get_actions('sid_1')[0].run).toBeUndefined()
  })

  it('shares disposable docs state across isolated handlers', async () => {
    const docs = create_docs()
    const displays = []
    const interaction_state = { count: 0 }
    const run = vi.fn()

    function add (event, $) {
      $.state.count += event.value
      return $.state.count
    }
    function submit (event, $) {
      if ($.state.count === 2) $('Open File')
    }
    add.info = 'Add input.'
    submit.info = 'Submit input.'
    add.opts = { state: interaction_state }
    submit.opts = { state: interaction_state }

    docs.register_actions([{ ...create_action(), run }])
    docs.admin.set_doc_display_handler(display => displays.push(display))
    docs.admin.set_docs_mode(true)

    const add_handler = docs.wrap_isolated(add)
    const submit_handler = docs.wrap_isolated(submit)
    expect(await add_handler({ value: 2 })).toBe(2)
    await submit_handler({})

    expect(interaction_state.count).toBe(0)
    expect(run).not.toHaveBeenCalled()
    expect(displays.map(display => display.content)).toEqual(['Add input.', 'Open the selected file.'])

    docs.admin.set_docs_mode(false)
    await add_handler({ value: 1 })
    docs.admin.set_docs_mode(true)
    await submit_handler({})

    expect(interaction_state.count).toBe(1)
    expect(displays.at(-1).content).toBe('Submit input.')
  })

  it('rejects invalid requests and propagates action failures', async () => {
    const docs = create_docs()
    const failure = new Error('action failed')

    function unknown (event, $) { $('Unknown') }
    function open_file (event, $) { $('Open File') }
    function repeated (event, $) {
      $('Open File')
      $('Open File')
    }

    await expect(docs.wrap_isolated(unknown)({})).rejects.toThrow('Unknown action')
    docs.register_actions([create_action()])
    await expect(docs.wrap_isolated(open_file)({})).rejects.toThrow('has no run callback')
    await expect(docs.wrap_isolated(repeated)({})).rejects.toThrow('already requested an action')

    docs.register_actions([{ ...create_action(), run: () => { throw failure } }])
    await expect(docs.wrap_isolated(open_file)({})).rejects.toThrow(failure)
  })

  it('does not give handlers access to their closure', async () => {
    const docs = create_docs()
    const closure_value = 'private'

    function on_click (event) { event.value = closure_value }

    await expect(docs.wrap_isolated(on_click)({})).rejects.toThrow(ReferenceError)
  })

  it('propagates documentation display failures', async () => {
    const docs = create_docs()
    const failure = new Error('display failed')

    function on_click () {}
    on_click.info = 'Click docs.'

    docs.admin.set_doc_display_handler(() => Promise.reject(failure))
    docs.admin.set_docs_mode(true)

    await expect(docs.wrap_isolated(on_click)({})).rejects.toThrow(failure)
  })

  it('validates action info and rejects ambiguous aliases', () => {
    const docs = create_docs()
    const invalid_action = { ...create_action(), info: '' }
    const alias_collision = { ...create_action(), name: 'open_file' }

    expect(() => docs.register_actions([invalid_action])).toThrow("Invalid 'info'")
    expect(() => docs.register_actions([create_action(), alias_collision])).toThrow('Duplicate action key "open_file"')
  })
})
