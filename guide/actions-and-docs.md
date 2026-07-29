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

### Wrapping isolated handlers

Pass a normal function to `docs.wrap_isolated()`. DOCS compiles it without closure access and supplies only the original `event`, callable `$`, and `$.state`.

```js
const click_state = { count: 0 }

function on_click (event, $) {
  $.state.count += 1
  event.currentTarget.textContent = $.state.count
  if ($.state.count === 10) $('Click Rate Result')
}

on_click.info = 'Record one click in the sequence.'
on_click.opts = { state: click_state }
button.onclick = docs.wrap_isolated(on_click)
```

The handler may progress an interaction across several events before requesting one action. It does not receive `sdb`, `drive`, `_`, or component closures. Real effects belong in the registered action's `run` function.

Normal mode uses the declared state and executes `run`. Docs mode blocks the browser event, uses fresh disposable state, and displays handler or action information without executing `run`. Handlers sharing the same state object participate in the same interaction sequence.

Use `handler.info` for documentation. `handler.docs` is supported only for compatibility. State belongs in `handler.opts.state`, never on a DOM element.

### Hooking DOM elements

The current `docs.hook(element, doc_content)` wraps handler properties already assigned on one element. It can use shared `doc_content` or each handler's `info`/legacy `docs`. Recursive and shadow-DOM traversal are not implemented.

### Legacy compatibility

`docs.wrap()`, string input to `wrap_isolated`, `run_in_docs_mode`, `set_sys`, and the old `sys` resource facade remain temporarily for unmigrated components. Do not use them in new code.

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

1. Docs mode is activated globally.
2. DOCS prevents the browser default and propagation for a function-based isolated handler.
3. The handler runs with disposable interaction state.
4. If it requests an action, DOCS displays `action.info` instead of calling `run`; otherwise it displays the handler documentation.
5. The display handler receives `{ content, sid }` and renders the content.
6. `docs.get_toc()` lets the UI browse all actions and handler docs without triggering a gesture.

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

`info` is required. Keep it short and useful because docs mode displays this text when the action would normally run. A component-owned action may also include a `run` closure; DOCS stores it privately and omits it from public action metadata.

### Registering actions

Load the actions array from the component drive and register:

```js
const actions_file = await drive.get('actions/commands.json')
if (actions_file.raw) {
  const actions = JSON.parse(actions_file.raw)
  docs.register_actions(actions)
}
```

For a component-owned action, register its real closure with the metadata:

```js
const save_action = {
  name: 'Save',
  info: 'Save the current document.',
  icon: 'save',
  status: {},
  steps: [],
  run: save
}

docs.register_actions([save_action])
```

An isolated handler requests it by name or generated alias:

```js
function on_save (event, $) { $('save') }
```

DOCS alone decides whether to show `info` or call `run`. Components must not call `show_action_info()` to gate execution.

### Retrieving actions (ActionBar/Admin)

The root module uses the admin API to retrieve registered actions for the focused app:

```js
const actions = docs.admin.get_actions(focused_sid)
// Pass actions to action_bar component
```
