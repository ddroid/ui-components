# Actions And Docs

This guide is about registering component actions and document event handlers with the `DOCS` system.

## Using `DOCS` inside a component

Import `DOCS` and initialize it with the module filename and instance `sid`:

```js
const DOCS = require('DOCS')

async function component (opts, invite) {
  const docs = DOCS(__filename)(opts.sid)
  // ...
}
```

### Hooking DOM elements

Use `docs.hook(element, doc_content)` to wrap all event handler properties already assigned on the element, such as `onclick`, `ontouchstart`, or `onmousedown`. In docs mode, those events show the docs instead of running the handler.

```js
const button = document.createElement('button')
button.onclick = onbutton_click
button.onmousedown = onbutton_press
onbutton_click.docs = '# Click\nRuns the click action.'
onbutton_press.info = '# Press\nStarts press behavior.'

docs.hook(button)
```

`docs.hook` applies the same documentation to every handler when `doc_content` is passed. If `doc_content` is omitted, each handler can provide its own `handler.docs` or `handler.info`. The wrapped handler metadata includes `event_type`.
e.g.
```js
button.onclick = docs.wrap(onbutton_click, '# Close Button\nCloses the current view.')
```

### Wrapping individual handlers

`docs.wrap(handler, doc_content)` is deprecated; it still works (and warns once per module) but new handlers should use `docs.wrap_isolated()`. It is kept only as a migration stepping stone. For handlers that still need closure functions or mutate component-local DOM/state, prefer the element-attached `__fn` shim under `wrap_isolated` (see below) over `docs.wrap`.

```js
button.onmousedown = docs.wrap(onbutton_press, '# Press Button\nStarts press-and-hold behavior.')
```

If the docs belong to the handler itself, set `handler.docs` or `handler.info` and omit `doc_content`:

```js
function onbutton_click () {}
onbutton_click.docs = '# Close Button\nCloses the current view.'
button.onclick = docs.wrap(onbutton_click)
```

The wrapped handler receives `(event, sys)`. `sys` exposes docs helpers such as `sys.is_docs_mode()`, `sys.get_doc()`, `sys.get_meta()`, and `sys.show_doc()`.

When an isolated handler needs real normal-mode side effects, the component can optionally call `docs.set_sys({ _, sdb, drive })`. Without configured resources, `sys` suppresses unavailable sends/writes and warns instead of throwing.

Isolated handlers can use:

- `sys._.up(type, refs, data)` or `sys.send('up', type, refs, data)` to send through `net_helper` in normal mode
- `sys.drive.get(path)` to read drive files in normal mode; docs mode returns `{ raw: null, path }`
- `sys.drive.put(path, data)` to write in normal mode; docs mode returns `Promise<false>`
- `sys.sdb.watch(handler)` in normal mode; docs mode returns `Promise<[]>`
- `sys.state` - per-handler object for intermediate gesture state; cleared for all handlers when docs mode deactivates
- `sys.show_action_info(action)` before running an action; docs mode displays `action.info` and returns `true`
- `sys.trigger_action(action_or_name, options)` to display action `info` in docs mode or perform the configured normal-mode send/run

### Wrapping isolated handlers

Use `docs.wrap_isolated(handler_string, doc_content, options)` when the handler must be created from a function string and must not access local closure scope. `options.run_in_docs_mode` (default `true`) picks the docs-mode behavior:

- `true` (default) — the handler runs in docs mode with a dummy/safe `sys` (sends/writes suppressed). Add a docs-mode guard (`if (sys.is_docs_mode()) return sys.show_doc()`) before any real side effect; safe gesture progression (e.g. a counter display) can happen before the guard. Use `sys.trigger_action()` for action triggers so `action.info` shows in docs mode.
- `false` — docs mode blocks the event and shows `doc_content` instead. Reserve for the `__fn` shim or handlers that cannot be guarded inline.

If compilation fails, `DOCS` logs an error and returns a no-op handler.

```js
button.onclick = docs.wrap_isolated(
  'function (event, sys) { if (sys.is_docs_mode()) return sys.show_doc(); sys._.up("ui_focus", {}, { type: "button", sid: sys.get_meta().sid }) }',
  '# Inspect Button\nLogs component metadata.'
)
```

```js
button.onclick = docs.wrap_isolated(
  'function (event, sys) { sys.trigger_action("Open File", { channel: "up", type: "selected_action" }) }',
  '# Open File\nStarts the file-open action.'
)
```

Isolated handlers cannot reach closure variables. Pass per-event data through the event target (`el.__action = action_data`, read via `event.currentTarget.__action`) and component functions through element properties. Call `docs.set_sys({ _, sdb, drive })` once per component so isolated handlers have real normal-mode side effects.

For a closure handler not yet restructured, use the `__fn` shim: attach the closure to the element and delegate from a thin string with `run_in_docs_mode: false`:

```js
button.__fn = local_on_click
button.onclick = docs.wrap_isolated(
  'function (event, sys) { event.currentTarget.__fn(event, sys) }',
  '# Button\nDocs for the shimmed handler.',
  { run_in_docs_mode: false }
)
```

### Browsing docs without gestures

`docs.get_toc()` (admin: `docs.admin.get_toc(sid)`) returns `{ actions, handlers }` so a details UI can list every action `info` and handler doc for a component without clicking:

```js
const { actions, handlers } = docs.get_toc()
// handlers: [{ doc, event_type, component }, ...] recorded from wrap/wrap_isolated/hook
```

The registry dedupes by `(event_type, doc)`, so re-rendering a dynamic list does not add duplicate entries. Call `docs.clear_handler_docs()` (admin: `docs.admin.clear_handler_docs(sid)`) to reset a component's handler docs on teardown or re-init.

---

## How the ❔ details window works

The details window leverages a global docs mode state:

1. Docs mode is activated globally (e.g. by toggling the `docs_toggle` action).
2. For a handler wrapped with `run_in_docs_mode: false` (or the `__fn` shim, or the deprecated `docs.wrap()`), `DOCS` prevents the default action, stops propagation, and triggers the doc display handler.
3. `docs.wrap_isolated()` handlers with `run_in_docs_mode: true` (the default) still run in docs mode with a dummy/safe `sys`; sends and writes are suppressed, a docs-mode guard shows the handler doc before real side effects, and intermediate state lives in `sys.state` and is discarded when docs mode deactivates.
4. When the user triggers a registered action, the action `info` text is shown instead of executing the action.
5. The display handler receives `{ content, sid }` and renders the markdown in the details window.
6. `docs.get_toc()` lets the UI browse all actions and handler docs without triggering any gesture.

### Admin Setup (Root Module)

Only the first caller (the root module) gets the admin API:

```js
const docs = DOCS(__filename)(opts.sid)

// Toggle docs mode
docs.admin.set_docs_mode(true)

// Set the display callback
docs.admin.set_doc_display_handler(({ content, sid }) => {
  // Render details UI with content
})
```

---

## Action Registration for the ActionBar

Components register their available administrative/user actions using `docs.register_actions(actions_list)`.

### Action Schema

Each action must follow this shape:

```json
{
  "name": "Action Name",
  "info": "Explain what this action does when it is triggered.",
  "icon": "icon_identifier",
  "status": {
    "pinned": true,
    "default": false
  },
  "steps": [
    {
      "name": "Step Name",
      "type": "mandatory",
      "is_completed": false,
      "component": "form_input",
      "status": "default",
      "data": ""
    }
  ]
}
```

`info` is required. Keep it short and useful because docs mode displays this text in the details window when the action would normally run.

### Registering actions

Load the actions array from the component drive and register:

```js
const actions_file = await drive.get('actions/commands.json')
if (actions_file.raw) {
  const actions = JSON.parse(actions_file.raw)
  docs.register_actions(actions)
}
```

When a component is about to run a registered action, call `docs.show_action_info(action)` first. It returns `true` in docs mode after displaying `action.info`, so the component should stop there.

```js
function on_action_click () {
  if (docs.show_action_info(action)) return
  run_action(action)
}
```

### Retrieving actions (ActionBar/Admin)

The root module uses the admin API to retrieve registered actions for the focused app:

```js
const actions = docs.admin.get_actions(focused_sid)
// Pass actions to action_bar component
```
