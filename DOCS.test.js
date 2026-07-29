import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const docs_path = './src/node_modules/DOCS/index.js'

describe('DOCS sys API', () => {
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

  it('runs wrap_isolated handlers in docs mode', async () => {
    const docs = create_docs()
    docs.admin.set_docs_mode(true)

    const handler = docs.wrap_isolated(
      'function (event, sys) { event.ran = true; event.docs_mode = sys.is_docs_mode() }',
      'Isolated docs'
    )
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    }

    await handler(event)

    expect(event.ran).toBe(true)
    expect(event.docs_mode).toBe(true)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it('keeps docs.wrap blocking behavior in docs mode', async () => {
    const docs = create_docs()
    const displays = []
    let ran = false
    docs.admin.set_doc_display_handler(display => displays.push(display))
    docs.admin.set_docs_mode(true)

    const handler = docs.wrap(function onclick () { ran = true }, 'Wrapped docs')
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    }

    await handler(event)

    expect(ran).toBe(false)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
    expect(displays).toEqual([{ content: 'Wrapped docs', sid: 'sid_1' }])
  })

  it('shows action info from sys.trigger_action in docs mode', async () => {
    const docs = create_docs()
    const displays = []
    docs.register_actions([create_action()])
    docs.admin.set_doc_display_handler(display => displays.push(display))
    docs.admin.set_docs_mode(true)

    const handler = docs.wrap_isolated(
      'function (event, sys) { event.result = sys.trigger_action("Open File", { channel: "up", type: "selected_action" }) }',
      'Trigger docs'
    )
    const event = {}

    await handler(event)

    expect(event.result).toBe(true)
    expect(displays).toEqual([{ content: 'Open the selected file.', sid: 'sid_1' }])
  })

  it('sends action messages from sys.trigger_action in normal mode', async () => {
    const docs = create_docs()
    const sent = []
    docs.set_sys({
      _: {
        up: function up (type, refs, data) {
          sent.push({ type, refs, data })
          return ['sid_1', 'parent', 0]
        }
      }
    })

    const handler = docs.wrap_isolated(
      'function (event, sys) { event.head = sys.trigger_action({ name: "Open File", info: "Open the selected file.", icon: "file", status: {}, steps: [] }, { channel: "up", type: "selected_action", refs: { source: "test" } }) }',
      'Trigger docs'
    )
    const event = {}

    await handler(event)

    expect(event.head).toEqual(['sid_1', 'parent', 0])
    expect(sent).toEqual([
      {
        type: 'selected_action',
        refs: { source: 'test' },
        data: create_action()
      }
    ])
  })

  it('returns empty subscriptions from sys.sdb.watch in docs mode', async () => {
    const docs = create_docs()
    docs.admin.set_docs_mode(true)

    const handler = docs.wrap_isolated(
      'async function (event, sys) { event.subs = await sys.sdb.watch(function onbatch () {}) }',
      'Watch docs'
    )
    const event = {}

    await handler(event)

    expect(event.subs).toEqual([])
  })

  it('suppresses missing sys resources instead of throwing', async () => {
    const docs = create_docs()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const handler = docs.wrap_isolated(
      'function (event, sys) { event.sent = sys._.up("selected_action", {}, {}); event.file = sys.drive.get("missing.json"); event.wrote = sys.drive.put("missing.json", {}); event.subs = sys.sdb.watch(function onbatch () {}) }',
      'Missing resources docs'
    )
    const event = {}

    await handler(event)

    expect(event.sent).toBe(false)
    await expect(event.file).resolves.toEqual({ raw: null, path: 'missing.json' })
    await expect(event.wrote).resolves.toBe(false)
    await expect(event.subs).resolves.toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('keeps sys.state across calls and clears it when docs mode deactivates', async () => {
    const docs = create_docs()
    docs.admin.set_docs_mode(true)

    const handler = docs.wrap_isolated(
      'function (event, sys) { sys.state.clicks = (sys.state.clicks || 0) + 1; event.clicks = sys.state.clicks }',
      'Stateful docs'
    )

    const event1 = {}
    const event2 = {}
    await handler(event1)
    await handler(event2)
    expect(event1.clicks).toBe(1)
    expect(event2.clicks).toBe(2)

    docs.admin.set_docs_mode(false)
    const event3 = {}
    await handler(event3)
    expect(event3.clicks).toBe(1)
  })

  it('lists registered actions and handler docs in get_toc', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const docs = create_docs()
    docs.register_actions([create_action()])
    docs.wrap_isolated('function (event, sys) {}', '# Handler One\nDocs.')
    docs.wrap(function onclick () {}, '# Handler Two\nDocs.')

    const toc = docs.get_toc()

    expect(toc.actions).toHaveLength(1)
    expect(toc.actions[0].name).toBe('Open File')
    expect(toc.handlers).toHaveLength(2)
    expect(toc.handlers[0].doc).toBe('# Handler One\nDocs.')
    expect(toc.handlers[1].doc).toBe('# Handler Two\nDocs.')
  })

  it('does not duplicate handler docs for repeated wraps and clears via clear_handler_docs', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const docs = create_docs()
    docs.wrap_isolated('function (event, sys) {}', '# Same\nDocs.')
    docs.wrap_isolated('function (event, sys) {}', '# Same\nDocs.')
    docs.wrap(function onclick () {}, '# Other\nDocs.')

    expect(docs.get_toc().handlers).toHaveLength(2)

    docs.clear_handler_docs()
    expect(docs.get_toc().handlers).toHaveLength(0)

    docs.wrap_isolated('function (event, sys) {}', '# Same\nDocs.')
    expect(docs.get_toc().handlers).toHaveLength(1)
  })

  it('shows doc instead of running wrap_isolated when run_in_docs_mode is false', async () => {
    const docs = create_docs()
    const displays = []
    docs.admin.set_doc_display_handler(display => displays.push(display))
    docs.admin.set_docs_mode(true)

    const handler = docs.wrap_isolated(
      'function (event, sys) { event.ran = true }',
      '# Show Doc\nShown in docs mode.',
      { run_in_docs_mode: false }
    )
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() }

    await handler(event)

    expect(event.ran).toBeUndefined()
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
    expect(displays).toEqual([{ content: '# Show Doc\nShown in docs mode.', sid: 'sid_1' }])
  })

  it('runs wrap_isolated body in normal mode when run_in_docs_mode is false', async () => {
    const docs = create_docs()
    const sent = []
    docs.set_sys({
      _: {
        up: function up (type, refs, data) {
          sent.push({ type, refs, data })
          return ['sid_1', 'parent', 0]
        }
      }
    })

    const handler = docs.wrap_isolated(
      'function (event, sys) { sys._.up("clicked", {}, null) }',
      '# Click\nSends a click.',
      { run_in_docs_mode: false }
    )

    await handler({})

    expect(sent).toEqual([{ type: 'clicked', refs: {}, data: null }])
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
    const handler = docs.wrap_isolated(on_click, 'Legacy docs')

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

  it('does not give function handlers access to their closure', async () => {
    const docs = create_docs()
    const closure_value = 'private'

    function on_click (event) { event.value = closure_value }

    const handler = docs.wrap_isolated(on_click)
    await expect(handler({})).rejects.toThrow(ReferenceError)
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
