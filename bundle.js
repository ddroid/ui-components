(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)

module.exports = graph_explorer

async function graph_explorer (opts, protocol) {
  /******************************************************************************
  COMPONENT INITIALIZATION
    - This sets up the initial state, variables, and the basic DOM structure.
    - It also initializes the IntersectionObserver for virtual scrolling and
      sets up the watcher for state changes.
  ******************************************************************************/
  const { sdb } = await get(opts.sid)
  const { drive } = sdb

  let vertical_scroll_value = 0
  let horizontal_scroll_value = 0
  let selected_instance_paths = []
  let confirmed_instance_paths = []
  let db = null // Database for entries
  let instance_states = {} // Holds expansion state {expanded_subs, expanded_hubs} for each node instance.
  let search_state_instances = {}
  let search_entry_states = {} // Holds expansion state for search mode interactions separately
  let view = [] // A flat array representing the visible nodes in the graph.
  let mode // Current mode of the graph explorer, can be set to 'default', 'menubar' or 'search'. Its value should be set by the `mode` file in the drive.
  let previous_mode
  let search_query = ''
  let hubs_flag = 'default' // Flag for hubs behavior: 'default' (prevent duplication), 'true' (no duplication prevention), 'false' (disable hubs)
  let selection_flag = 'default' // Flag for selection behavior: 'default' (enable selection), 'false' (disable selection)
  let recursive_collapse_flag = false // Flag for recursive collapse: true (recursive), false (parent level only)
  let drive_updated_by_scroll = false // Flag to prevent `onbatch` from re-rendering on scroll updates.
  let drive_updated_by_toggle = false // Flag to prevent `onbatch` from re-rendering on toggle updates.
  let drive_updated_by_search = false // Flag to prevent `onbatch` from re-rendering on search updates.
  let drive_updated_by_last_clicked = false // Flag to prevent `onbatch` from re-rendering on last clicked node updates.
  let ignore_drive_updated_by_scroll = false // Prevent scroll flag.
  let drive_updated_by_match = false // Flag to prevent `onbatch` from re-rendering on matching entry updates.
  let drive_updated_by_tracking = false // Flag to prevent `onbatch` from re-rendering on view order tracking updates.
  let drive_updated_by_undo = false // Flag to prevent onbatch from re-rendering on undo updates
  let is_loading_from_drive = false // Flag to prevent saving to drive during initial load
  let multi_select_enabled = false // Flag to enable multi-select mode without ctrl key
  let select_between_enabled = false // Flag to enable select between mode
  let select_between_first_node = null // First node selected in select between mode
  let duplicate_entries_map = {}
  let view_order_tracking = {} // Tracks instance paths by base path in real time as they are added into the view through toggle expand/collapse actions.
  let is_rendering = false // Flag to prevent concurrent rendering operations in virtual scrolling.
  let spacer_element = null // DOM element used to manage scroll position when hubs are toggled.
  let spacer_initial_height = 0
  let hub_num = 0 // Counter for expanded hubs.
  let last_clicked_node = null // Track the last clicked node instance path for highlighting.
  let root_wand_state = null // Store original root wand state when replaced with jump button
  const manipulated_inside_search = {}
  let keybinds = {} // Store keyboard navigation bindings
  let undo_stack = [] // Stack to track drive state changes for undo functionality

  // Protocol system for message-based communication
  let send = null
  let graph_explorer_mid = 0 // Message ID counter for graph_explorer.js -> page.js messages
  if (protocol) {
    send = protocol(msg => onmessage(msg))
  }

  // Create db object that communicates via protocol messages
  db = create_db()

  const el = document.createElement('div')
  el.className = 'graph-explorer-wrapper'
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
    <div>
      <div class="graph-container"></div>
    </div>
    <div class="searchbar"></div>
    <div class="menubar"></div>
  `
  const searchbar = shadow.querySelector('.searchbar')
  const menubar = shadow.querySelector('.menubar')
  const container = shadow.querySelector('.graph-container')

  document.body.style.margin = 0

  let scroll_update_pending = false
  container.onscroll = onscroll

  let start_index = 0
  let end_index = 0
  const chunk_size = 50
  const max_rendered_nodes = chunk_size * 3
  let node_height

  const top_sentinel = document.createElement('div')
  const bottom_sentinel = document.createElement('div')

  const observer = new IntersectionObserver(handle_sentinel_intersection, {
    root: container,
    rootMargin: '500px 0px',
    threshold: 0
  })

  // Define handlers for different data types from the drive, called by `onbatch`.
  const on = {
    style: inject_style,
    runtime: on_runtime,
    mode: on_mode,
    flags: on_flags,
    keybinds: on_keybinds,
    undo: on_undo
  }
  // Start watching for state changes. This is the main trigger for all updates.
  await sdb.watch(onbatch)

  document.onkeydown = handle_keyboard_navigation

  return el

  /******************************************************************************
  ESSAGE HANDLING
    - Handles incoming messages and sends outgoing messages.
    - Messages follow standardized format: { head: [by, to, mid], refs, type, data }
  ******************************************************************************/
  function onmessage (msg) {
    const { type, data } = msg
    const on_message_types = {
      set_mode: handle_set_mode,
      set_search_query: handle_set_search_query,
      select_nodes: handle_select_nodes,
      expand_node: handle_expand_node,
      collapse_node: handle_collapse_node,
      toggle_node: handle_toggle_node,
      get_selected: handle_get_selected,
      get_confirmed: handle_get_confirmed,
      clear_selection: handle_clear_selection,
      set_flag: handle_set_flag,
      scroll_to_node: handle_scroll_to_node,
      db_response: handle_db_response,
      db_initialized: handle_db_initialized
    }

    const handler = on_message_types[type]
    if (handler) handler(data)
    else console.warn(`[graph_explorer-protocol] Unknown message type: ${type}`, msg)

    function handle_db_response () {
      db.handle_response(msg)
    }

    function handle_set_mode (data) {
      const { mode: new_mode } = data
      if (new_mode && ['default', 'menubar', 'search'].includes(new_mode)) {
        update_drive_state({ type: 'mode/current_mode', message: new_mode })
        send_message({ type: 'mode_changed', data: { mode: new_mode } })
      }
    }

    function handle_set_search_query (data) {
      const { query } = data
      if (typeof query === 'string') {
        search_query = query
        drive_updated_by_search = true
        update_drive_state({ type: 'mode/search_query', message: query })
        if (mode === 'search') perform_search(query)
        send_message({ type: 'search_query_changed', data: { query } })
      }
    }

    function handle_select_nodes (data) {
      const { instance_paths } = data
      if (Array.isArray(instance_paths)) {
        update_drive_state({ type: 'runtime/selected_instance_paths', message: instance_paths })
        send_message({ type: 'selection_changed', data: { selected: instance_paths } })
      }
    }

    function handle_expand_node (data) {
      const { instance_path, expand_subs = true, expand_hubs = false } = data
      if (instance_path && instance_states[instance_path]) {
        instance_states[instance_path].expanded_subs = expand_subs
        instance_states[instance_path].expanded_hubs = expand_hubs
        drive_updated_by_toggle = true
        update_drive_state({ type: 'runtime/instance_states', message: instance_states })
        send_message({ type: 'node_expanded', data: { instance_path, expand_subs, expand_hubs } })
      }
    }

    function handle_collapse_node (data) {
      const { instance_path } = data
      if (instance_path && instance_states[instance_path]) {
        instance_states[instance_path].expanded_subs = false
        instance_states[instance_path].expanded_hubs = false
        drive_updated_by_toggle = true
        update_drive_state({ type: 'runtime/instance_states', message: instance_states })
        send_message({ type: 'node_collapsed', data: { instance_path } })
      }
    }

    async function handle_toggle_node (data) {
      const { instance_path, toggle_type = 'subs' } = data
      if (instance_path && instance_states[instance_path]) {
        if (toggle_type === 'subs') {
          await toggle_subs(instance_path)
        } else if (toggle_type === 'hubs') {
          await toggle_hubs(instance_path)
        }
        send_message({ type: 'node_toggled', data: { instance_path, toggle_type } })
      }
    }

    function handle_get_selected (data) {
      send_message({ type: 'selected_nodes', data: { selected: selected_instance_paths } })
    }

    function handle_get_confirmed (data) {
      send_message({ type: 'confirmed_nodes', data: { confirmed: confirmed_instance_paths } })
    }

    function handle_clear_selection (data) {
      update_drive_state({ type: 'runtime/selected_instance_paths', message: [] })
      update_drive_state({ type: 'runtime/confirmed_selected', message: [] })
      send_message({ type: 'selection_cleared', data: {} })
    }

    function handle_set_flag (data) {
      const { flag_type, value } = data
      if (flag_type === 'hubs' && ['default', 'true', 'false'].includes(value)) {
        update_drive_state({ type: 'flags/hubs', message: value })
      } else if (flag_type === 'selection') {
        update_drive_state({ type: 'flags/selection', message: value })
      } else if (flag_type === 'recursive_collapse') {
        update_drive_state({ type: 'flags/recursive_collapse', message: value })
      }
      send_message({ type: 'flag_changed', data: { flag_type, value } })
    }

    function handle_scroll_to_node (data) {
      const { instance_path } = data
      const node_index = view.findIndex(n => n.instance_path === instance_path)
      if (node_index !== -1) {
        const scroll_position = node_index * node_height
        container.scrollTop = scroll_position
        send_message({ type: 'scrolled_to_node', data: { instance_path, scroll_position } })
      }
    }
  }
  async function handle_db_initialized (data) {
    // Page.js, trigger initial render
    // After receiving entries, ensure the root node state is initialized and trigger the first render.
    const root_path = '/'
    if (await db.has(root_path)) {
      const root_instance_path = '|/'
      if (!instance_states[root_instance_path]) {
        instance_states[root_instance_path] = {
          expanded_subs: true,
          expanded_hubs: false
        }
      }
      // don't rebuild view if we're in search mode with active query
      if (mode === 'search' && search_query) {
        console.log('[SEARCH DEBUG] on_entries: skipping build_and_render_view in Search Mode with query:', search_query)
        perform_search(search_query)
      } else {
        // tracking will be initialized later if drive data is empty
        build_and_render_view()
      }
    } else {
      console.warn('Root path "/" not found in entries. Clearing view.')
      view = []
      if (container) container.replaceChildren()
    }
  }
  function send_message (msg) {
    if (send) {
      send(msg)
    }
  }

  function create_db () {
    // Pending requests map: key is message head [by, to, mid], value is {resolve, reject}
    const pending_requests = new Map()

    return {
      // All operations are async via protocol messages
      get: (path) => send_db_request('db_get', { path }),
      has: (path) => send_db_request('db_has', { path }),
      is_empty: () => send_db_request('db_is_empty', {}),
      root: () => send_db_request('db_root', {}),
      keys: () => send_db_request('db_keys', {}),
      raw: () => send_db_request('db_raw', {}),
      // Handle responses from page.js
      handle_response: (msg) => {
        if (!msg.refs || !msg.refs.cause) {
          console.warn('[graph_explorer] Response missing refs.cause:', msg)
          return
        }
        const request_head_key = JSON.stringify(msg.refs.cause)
        const pending = pending_requests.get(request_head_key)
        if (pending) {
          pending.resolve(msg.data.result)
          pending_requests.delete(request_head_key)
        } else {
          console.warn('[graph_explorer] No pending request for response:', msg.refs.cause)
        }
      }
    }

    function send_db_request (operation, params) {
      return new Promise((resolve, reject) => {
        const head = ['graph_explorer', 'page_js', graph_explorer_mid++]
        const head_key = JSON.stringify(head)
        pending_requests.set(head_key, { resolve, reject })

        send_message({
          head,
          refs: null, // New request has no references
          type: operation,
          data: params
        })
      })
    }
  }

  /******************************************************************************
  STATE AND DATA HANDLING
    - These functions process incoming data from the STATE module's `sdb.watch`.
    - `onbatch` is the primary entry point.
  ******************************************************************************/
  async function onbatch (batch) {
    console.log('[SEARCH DEBUG] onbatch caled:', {
      mode,
      search_query,
      last_clicked_node,
      feedback_flags: {
        scroll: drive_updated_by_scroll,
        toggle: drive_updated_by_toggle,
        search: drive_updated_by_search,
        match: drive_updated_by_match,
        tracking: drive_updated_by_tracking
      }
    })

    // Prevent feedback loops from scroll or toggle actions.
    if (check_and_reset_feedback_flags()) {
      console.log('[SEARCH DEBUG] onbatch prevented by feedback flags')
      return
    }

    for (const { type, paths } of batch) {
      if (!paths || !paths.length) continue
      const data = await Promise.all(
        paths.map(path => batch_get(path))
      )
      // Call the appropriate handler based on `type`.
      const func = on[type]
      func ? await func({ data, paths }) : fail(data, type)
    }

    function batch_get (path) {
      return drive
        .get(path)
        .then(file => (file ? file.raw : null))
        .catch(e => {
          console.error(`Error getting file from drive: ${path}`, e)
          return null
        })
    }
  }

  function fail (data, type) {
    throw new Error(`Invalid message type: ${type}`, { cause: { data, type } })
  }

  async function on_runtime ({ data, paths }) {
    const on_runtime_paths = {
      'node_height.json': handle_node_height,
      'vertical_scroll_value.json': handle_vertical_scroll,
      'horizontal_scroll_value.json': handle_horizontal_scroll,
      'selected_instance_paths.json': handle_selected_paths,
      'confirmed_selected.json': handle_confirmed_paths,
      'instance_states.json': handle_instance_states,
      'search_entry_states.json': handle_search_entry_states,
      'last_clicked_node.json': handle_last_clicked_node,
      'view_order_tracking.json': handle_view_order_tracking
    }
    let needs_render = false
    const render_nodes_needed = new Set()

    paths.forEach((path, i) => runtime_handler(path, data[i]))

    if (needs_render) {
      if (mode === 'search' && search_query) {
        console.log('[SEARCH DEBUG] on_runtime: Skipping build_and_render_view in search mode with query:', search_query)
        await perform_search(search_query)
      } else {
        await build_and_render_view()
      }
    } else if (render_nodes_needed.size > 0) {
      render_nodes_needed.forEach(re_render_node)
    }

    function runtime_handler (path, data) {
      if (data === null) return
      const value = parse_json_data(data, path)
      if (value === null) return

      // Extract filename from path and use handler if available
      const filename = path.split('/').pop()
      const handler = on_runtime_paths[filename]
      if (handler) {
        const result = handler({ value, render_nodes_needed })
        if (result?.needs_render) needs_render = true
      }
    }

    function handle_node_height ({ value }) {
      node_height = value
    }

    function handle_vertical_scroll ({ value }) {
      if (typeof value === 'number') vertical_scroll_value = value
    }

    function handle_horizontal_scroll ({ value }) {
      if (typeof value === 'number') horizontal_scroll_value = value
    }

    function handle_selected_paths ({ value, render_nodes_needed }) {
      selected_instance_paths = process_path_array_update({
        current_paths: selected_instance_paths,
        value,
        render_set: render_nodes_needed,
        name: 'selected_instance_paths'
      })
    }

    function handle_confirmed_paths ({ value, render_nodes_needed }) {
      confirmed_instance_paths = process_path_array_update({
        current_paths: confirmed_instance_paths,
        value,
        render_set: render_nodes_needed,
        name: 'confirmed_selected'
      })
    }

    function handle_instance_states ({ value }) {
      if (typeof value === 'object' && value && !Array.isArray(value)) {
        instance_states = value
        return { needs_render: true }
      } else {
        console.warn('instance_states is not a valid object, ignoring.', value)
      }
    }

    function handle_search_entry_states ({ value }) {
      if (typeof value === 'object' && value && !Array.isArray(value)) {
        search_entry_states = value
        if (mode === 'search') return { needs_render: true }
      } else {
        console.warn('search_entry_states is not a valid object, ignoring.', value)
      }
    }

    function handle_last_clicked_node ({ value, render_nodes_needed }) {
      const old_last_clicked = last_clicked_node
      last_clicked_node = typeof value === 'string' ? value : null
      if (old_last_clicked) render_nodes_needed.add(old_last_clicked)
      if (last_clicked_node) render_nodes_needed.add(last_clicked_node)
    }

    function handle_view_order_tracking ({ value }) {
      if (typeof value === 'object' && value && !Array.isArray(value)) {
        is_loading_from_drive = true
        view_order_tracking = value
        is_loading_from_drive = false
        if (Object.keys(view_order_tracking).length === 0) {
          initialize_tracking_from_current_state()
        }
        return { needs_render: true }
      } else {
        console.warn('view_order_tracking is not a valid object, ignoring.', value)
      }
    }
  }

  async function on_mode ({ data, paths }) {
    const on_mode_paths = {
      'current_mode.json': handle_current_mode,
      'previous_mode.json': handle_previous_mode,
      'search_query.json': handle_search_query,
      'multi_select_enabled.json': handle_multi_select_enabled,
      'select_between_enabled.json': handle_select_between_enabled
    }
    let new_current_mode, new_previous_mode, new_search_query, new_multi_select_enabled, new_select_between_enabled

    paths.forEach((path, i) => mode_handler(path, data[i]))

    if (typeof new_search_query === 'string') search_query = new_search_query
    if (new_previous_mode) previous_mode = new_previous_mode
    if (typeof new_multi_select_enabled === 'boolean') {
      multi_select_enabled = new_multi_select_enabled
      render_menubar() // Re-render menubar to update button text
    }
    if (typeof new_select_between_enabled === 'boolean') {
      select_between_enabled = new_select_between_enabled
      if (!select_between_enabled) select_between_first_node = null
      render_menubar()
    }

    if (
      new_current_mode &&
      !['default', 'menubar', 'search'].includes(new_current_mode)
    ) {
      console.warn(`Invalid mode "${new_current_mode}" provided. Ignoring update.`)
      return
    }

    if (new_current_mode === 'search' && !search_query) {
      search_state_instances = instance_states
    }
    if (!new_current_mode || mode === new_current_mode) return

    if (mode && new_current_mode === 'search') update_drive_state({ type: 'mode/previous_mode', message: mode })
    mode = new_current_mode
    render_menubar()
    render_searchbar()
    await handle_mode_change()
    if (mode === 'search' && search_query) await perform_search(search_query)

    function mode_handler (path, data) {
      const value = parse_json_data(data, path)
      if (value === null) return

      const filename = path.split('/').pop()
      const handler = on_mode_paths[filename]
      if (handler) {
        const result = handler({ value })
        if (result?.current_mode !== undefined) new_current_mode = result.current_mode
        if (result?.previous_mode !== undefined) new_previous_mode = result.previous_mode
        if (result?.search_query !== undefined) new_search_query = result.search_query
        if (result?.multi_select_enabled !== undefined) new_multi_select_enabled = result.multi_select_enabled
        if (result?.select_between_enabled !== undefined) new_select_between_enabled = result.select_between_enabled
      }
    }
    function handle_current_mode ({ value }) {
      return { current_mode: value }
    }

    function handle_previous_mode ({ value }) {
      return { previous_mode: value }
    }

    function handle_search_query ({ value }) {
      return { search_query: value }
    }

    function handle_multi_select_enabled ({ value }) {
      return { multi_select_enabled: value }
    }

    function handle_select_between_enabled ({ value }) {
      return { select_between_enabled: value }
    }
  }

  function on_flags ({ data, paths }) {
    const on_flags_paths = {
      'hubs.json': handle_hubs_flag,
      'selection.json': handle_selection_flag,
      'recursive_collapse.json': handle_recursive_collapse_flag
    }

    paths.forEach((path, i) => flags_handler(path, data[i]))

    function flags_handler (path, data) {
      const value = parse_json_data(data, path)
      if (value === null) return

      const filename = path.split('/').pop()
      const handler = on_flags_paths[filename]
      if (handler) {
        const result = handler(value)
        if (result && result.needs_render) {
          if (mode === 'search' && search_query) {
            console.log('[SEARCH DEBUG] on_flags: Skipping build_and_render_view in search mode with query:', search_query)
            perform_search(search_query)
          } else {
            build_and_render_view()
          }
        }
      }
    }

    function handle_hubs_flag (value) {
      if (typeof value === 'string' && ['default', 'true', 'false'].includes(value)) {
        hubs_flag = value
        return { needs_render: true }
      } else {
        console.warn('hubs flag must be one of: "default", "true", "false", ignoring.', value)
      }
    }

    function handle_selection_flag (value) {
      selection_flag = value
      return { needs_render: true }
    }

    function handle_recursive_collapse_flag (value) {
      recursive_collapse_flag = value
      return { needs_render: false }
    }
  }

  function inject_style ({ data }) {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(data[0])
    shadow.adoptedStyleSheets = [sheet]
  }

  function on_keybinds ({ data }) {
    if (!data || data[0] == null) {
      console.error('Keybinds data is missing or empty.')
      return
    }
    const parsed_data = parse_json_data(data[0])
    if (typeof parsed_data !== 'object' || !parsed_data) {
      console.error('Parsed keybinds data is not a valid object.')
      return
    }
    keybinds = parsed_data
  }

  function on_undo ({ data }) {
    if (!data || data[0] == null) {
      console.error('Undo stack data is missing or empty.')
      return
    }
    const parsed_data = parse_json_data(data[0])
    if (typeof parsed_data !== 'object' || !parsed_data) {
      console.error('Parsed undo stack data is not a valid Object.')
      return
    }
    undo_stack = parsed_data
  }

  // Helper to persist component state to the drive.
  async function update_drive_state ({ type, message }) {
    // Save current state to undo stack before updating (except for some)
    const should_track = (
      !drive_updated_by_undo &&
      !type.includes('scroll') &&
      !type.includes('last_clicked') &&
      !type.includes('view_order_tracking') &&
      !type.includes('select_between') &&
      type !== 'undo/stack'
    )
    if (should_track) {
      await save_to_undo_stack(type)
    }

    try {
      await drive.put(`${type}.json`, JSON.stringify(message))
    } catch (e) {
      const [dataset, name] = type.split('/')
      console.error(`Failed to update ${dataset} state for ${name}:`, e)
    }
    if (should_track) {
      render_menubar()
    }
  }

  async function save_to_undo_stack (type) {
    try {
      const current_file = await drive.get(`${type}.json`)
      if (current_file && current_file.raw) {
        const snapshot = {
          type,
          value: current_file.raw,
          timestamp: Date.now()
        }

        // Add to stack (limit to 50 items to prevent memory issues)
        undo_stack.push(snapshot)
        if (undo_stack.length > 50) {
          undo_stack.shift()
        }
        drive_updated_by_undo = true
        await drive.put('undo/stack.json', JSON.stringify(undo_stack))
      }
    } catch (e) {
      console.error('Failed to save to undo stack:', e)
    }
  }

  function get_or_create_state (states, instance_path) {
    if (!states[instance_path]) {
      states[instance_path] = { expanded_subs: false, expanded_hubs: false }
    }
    if (states[instance_path].expanded_subs === null) {
      states[instance_path].expanded_subs = true
    }

    return states[instance_path]
  }

  async function calculate_children_pipe_trail ({
    depth,
    is_hub,
    is_last_sub,
    is_first_hub = false,
    parent_pipe_trail,
    parent_base_path,
    base_path,
    db
  }) {
    const children_pipe_trail = [...parent_pipe_trail]
    const parent_entry = await db.get(parent_base_path)
    const is_hub_on_top = base_path === parent_entry?.hubs?.[0] || base_path === '/'

    if (depth > 0) {
      if (is_hub) {
        if (is_last_sub) {
          children_pipe_trail.pop()
          children_pipe_trail.push(true)
        }
        if (is_hub_on_top && !is_last_sub) {
          children_pipe_trail.pop()
          children_pipe_trail.push(true)
        }
        if (is_first_hub) {
          children_pipe_trail.pop()
          children_pipe_trail.push(false)
        }
      }
      children_pipe_trail.push(is_hub || !is_last_sub)
    }
    return { children_pipe_trail, is_hub_on_top }
  }

  // Extracted pipe logic for reuse in both default and search modes
  async function calculate_pipe_trail ({
    depth,
    is_hub,
    is_last_sub,
    is_first_hub = false,
    is_hub_on_top,
    parent_pipe_trail,
    parent_base_path,
    base_path,
    db
  }) {
    let last_pipe = null
    const parent_entry = await db.get(parent_base_path)
    const calculated_is_hub_on_top = base_path === parent_entry?.hubs?.[0] || base_path === '/'
    const final_is_hub_on_top = is_hub_on_top !== undefined ? is_hub_on_top : calculated_is_hub_on_top

    if (depth > 0) {
      if (is_hub) {
        last_pipe = [...parent_pipe_trail]
        if (is_last_sub) {
          last_pipe.pop()
          last_pipe.push(true)
          if (is_first_hub) {
            last_pipe.pop()
            last_pipe.push(false)
          }
        }
        if (final_is_hub_on_top && !is_last_sub) {
          last_pipe.pop()
          last_pipe.push(true)
        }
      }
    }

    const pipe_trail = (is_hub && is_last_sub) || (is_hub && final_is_hub_on_top) ? last_pipe : parent_pipe_trail
    const product = { pipe_trail, is_hub_on_top: final_is_hub_on_top }
    return product
  }

  /******************************************************************************
  VIEW AND RENDERING LOGIC AND SCALING
    - These functions build the `view` array and render the DOM.
    - `build_and_render_view` is the main orchestrator.
    - `build_view_recursive` creates the flat `view` array from the hierarchical data.
    - `calculate_mobile_scale` calculates the scale factor for mobile devices.
  ******************************************************************************/
  async function build_and_render_view (focal_instance_path, hub_toggle = false) {
    console.log('[SEARCH DEBUG] build_and_render_view called:', {
      focal_instance_path,
      hub_toggle,
      current_mode: mode,
      search_query,
      last_clicked_node,
      stack_trace: new Error().stack.split('\n').slice(1, 4).map(line => line.trim())
    })

    // This fuction should'nt be called in search mode for search
    if (mode === 'search' && search_query && !hub_toggle) {
      console.error('[SEARCH DEBUG] build_and_render_view called inappropriately in search mode!', {
        mode,
        search_query,
        focal_instance_path,
        stack_trace: new Error().stack.split('\n').slice(1, 6).map(line => line.trim())
      })
    }

    const is_empty = await db.is_empty()
    if (!db || is_empty) {
      console.warn('No entries available to render.')
      return
    }

    const old_view = [...view]
    const old_scroll_top = vertical_scroll_value
    const old_scroll_left = horizontal_scroll_value
    let existing_spacer_height = 0
    if (spacer_element && spacer_element.parentNode) existing_spacer_height = parseFloat(spacer_element.style.height) || 0

    // Recursively build the new `view` array from the graph data.
    view = await build_view_recursive({
      base_path: '/',
      parent_instance_path: '',
      depth: 0,
      is_last_sub: true,
      is_hub: false,
      parent_pipe_trail: [],
      instance_states,
      db
    })

    // Recalculate duplicates after view is built
    collect_all_duplicate_entries()

    const new_scroll_top = calculate_new_scroll_top({
      old_scroll_top,
      old_view,
      focal_path: focal_instance_path
    })
    const render_anchor_index = Math.max(0, Math.floor(new_scroll_top / node_height))
    start_index = Math.max(0, render_anchor_index - chunk_size)
    end_index = Math.min(view.length, render_anchor_index + chunk_size)

    const fragment = document.createDocumentFragment()
    for (let i = start_index; i < end_index; i++) {
      if (view[i]) fragment.appendChild(create_node(view[i]))
    }

    container.replaceChildren(top_sentinel, fragment, bottom_sentinel)
    top_sentinel.style.height = `${start_index * node_height}px`
    bottom_sentinel.style.height = `${(view.length - end_index) * node_height}px`

    observer.observe(top_sentinel)
    observer.observe(bottom_sentinel)

    // Handle the spacer element used for keep entries static wrt cursor by scrolling when hubs are toggled.
    handle_spacer_element({
      hub_toggle,
      existing_height: existing_spacer_height,
      new_scroll_top,
      sync_fn: set_scroll_and_sync
    })

    function set_scroll_and_sync () {
      drive_updated_by_scroll = true
      container.scrollTop = new_scroll_top
      container.scrollLeft = old_scroll_left
      vertical_scroll_value = container.scrollTop
    }
  }

  // Traverses the hierarchical entries data and builds a flat `view` array for rendering.
  async function build_view_recursive ({
    base_path,
    parent_instance_path,
    parent_base_path = null,
    depth,
    is_last_sub,
    is_hub,
    is_first_hub = false,
    parent_pipe_trail,
    instance_states,
    db
  }) {
    const instance_path = `${parent_instance_path}|${base_path}`
    const entry = await db.get(base_path)
    if (!entry) return []

    const state = get_or_create_state(instance_states, instance_path)

    const { children_pipe_trail, is_hub_on_top } = await calculate_children_pipe_trail({
      depth,
      is_hub,
      is_last_sub,
      is_first_hub,
      parent_pipe_trail,
      parent_base_path,
      base_path,
      db
    })

    const current_view = []
    // If hubs are expanded, recursively add them to the view first (they appear above the node).
    if (state.expanded_hubs && Array.isArray(entry.hubs)) {
      for (let i = 0; i < entry.hubs.length; i++) {
        const hub_path = entry.hubs[i]
        const hub_view = await build_view_recursive({
          base_path: hub_path,
          parent_instance_path: instance_path,
          parent_base_path: base_path,
          depth: depth + 1,
          is_last_sub: i === entry.hubs.length - 1,
          is_hub: true,
          is_first_hub: is_hub ? is_hub_on_top : false,
          parent_pipe_trail: children_pipe_trail,
          instance_states,
          db
        })
        current_view.push(...hub_view)
      }
    }

    // Calculate pipe_trail for this node
    const { pipe_trail, is_hub_on_top: calculated_is_hub_on_top } = await calculate_pipe_trail({
      depth,
      is_hub,
      is_last_sub,
      is_first_hub,
      is_hub_on_top,
      parent_pipe_trail,
      parent_base_path,
      base_path,
      db
    })

    current_view.push({
      base_path,
      instance_path,
      depth,
      is_last_sub,
      is_hub,
      is_first_hub,
      parent_pipe_trail,
      parent_base_path,
      entry, // Include entry data in view to avoid async lookups during rendering
      pipe_trail, // Pre-calculated pipe trail
      is_hub_on_top: calculated_is_hub_on_top // Pre-calculated hub position
    })

    // If subs are expanded, recursively add them to the view (they appear below the node).
    if (state.expanded_subs && Array.isArray(entry.subs)) {
      for (let i = 0; i < entry.subs.length; i++) {
        const sub_path = entry.subs[i]
        const sub_view = await build_view_recursive({
          base_path: sub_path,
          parent_instance_path: instance_path,
          parent_base_path: base_path,
          depth: depth + 1,
          is_last_sub: i === entry.subs.length - 1,
          is_hub: false,
          parent_pipe_trail: children_pipe_trail,
          instance_states,
          db
        })
        current_view.push(...sub_view)
      }
    }
    return current_view
  }

  /******************************************************************************
 4. NODE CREATION AND EVENT HANDLING
   - `create_node` generates the DOM element for a single node.
   - It sets up event handlers for user interactions like selecting or toggling.
  ******************************************************************************/

  function create_node ({
    base_path,
    instance_path,
    depth,
    is_last_sub,
    is_hub,
    is_search_match,
    is_direct_match,
    is_in_original_view,
    query,
    entry, // Entry data is now passed from view
    pipe_trail, // Pre-calculated pipe trail
    is_hub_on_top // Pre-calculated hub position
  }) {
    if (!entry) {
      const err_el = document.createElement('div')
      err_el.className = 'node error'
      err_el.textContent = `Error: Missing entry for ${base_path}`
      return err_el
    }

    let states
    if (mode === 'search') {
      if (manipulated_inside_search[instance_path]) {
        search_entry_states[instance_path] = manipulated_inside_search[instance_path]
        states = search_entry_states
      } else {
        states = search_state_instances
      }
    } else {
      states = instance_states
    }
    const state = get_or_create_state(states, instance_path)

    const el = document.createElement('div')
    el.className = `node type-${entry.type || 'unknown'}`
    el.dataset.instance_path = instance_path
    if (is_search_match) {
      el.classList.add('search-result')
      if (is_direct_match) el.classList.add('direct-match')
      if (!is_in_original_view) el.classList.add('new-entry')
    }

    if (selected_instance_paths.includes(instance_path)) el.classList.add('selected')
    if (confirmed_instance_paths.includes(instance_path)) el.classList.add('confirmed')
    if (last_clicked_node === instance_path) {
      mode === 'search' ? el.classList.add('search-last-clicked') : el.classList.add('last-clicked')
    }

    const has_hubs = hubs_flag === 'false' ? false : Array.isArray(entry.hubs) && entry.hubs.length > 0
    const has_subs = Array.isArray(entry.subs) && entry.subs.length > 0

    if (depth) {
      el.classList.add('left-indent')
    }

    if (base_path === '/' && instance_path === '|/') return create_root_node({ state, has_subs, instance_path })
    const prefix_class_name = get_prefix({ is_last_sub, has_subs, state, is_hub, is_hub_on_top })
    // Use pre-calculated pipe_trail
    const pipe_html = pipe_trail.map(p => `<span class="${p ? 'pipe' : 'blank'}"></span>`).join('')
    const prefix_class = has_subs ? 'prefix clickable' : 'prefix'
    const icon_class = has_hubs && base_path !== '/' ? 'icon clickable' : 'icon'
    const entry_name = entry.name || base_path
    const name_html = (is_direct_match && query)
      ? get_highlighted_name(entry_name, query)
      : entry_name

    // Check if this entry appears elsewhere in the view (any duplicate)
    let has_duplicate_entries = false
    let is_first_occurrence = false
    if (hubs_flag !== 'true') {
      has_duplicate_entries = has_duplicates(base_path)

      // coloring class for duplicates
      if (has_duplicate_entries) {
        is_first_occurrence = is_first_duplicate(base_path, instance_path)
        if (is_first_occurrence) {
          el.classList.add('first-matching-entry')
        } else {
          el.classList.add('matching-entry')
        }
      }
    }

    el.innerHTML = `
      <span class="indent">${pipe_html}</span>
      <span class="${prefix_class} ${prefix_class_name}"></span>
      <span class="${icon_class}"></span>
      <span class="name ${has_duplicate_entries && !is_first_occurrence ? '' : 'clickable'}">${name_html}</span>
    `

    // For matching entries, disable normal event listener and add handler to whole entry to create button for jump to next duplicate
    if (has_duplicate_entries && !is_first_occurrence && hubs_flag !== 'true') {
      el.onclick = jump_out_to_next_duplicate
    } else {
      const icon_el = el.querySelector('.icon')
      if (icon_el && has_hubs && base_path !== '/') {
        icon_el.onclick = (mode === 'search' && search_query)
          ? () => toggle_search_hubs(instance_path)
          : () => toggle_hubs(instance_path)
      }

      // Add click event to the whole first part (indent + prefix) for expanding/collapsing subs
      if (has_subs) {
        const indent_el = el.querySelector('.indent')
        const prefix_el = el.querySelector('.prefix')

        const toggle_subs_handler = (mode === 'search' && search_query)
          ? () => toggle_search_subs(instance_path)
          : () => toggle_subs(instance_path)

        if (indent_el) indent_el.onclick = toggle_subs_handler
        if (prefix_el) prefix_el.onclick = toggle_subs_handler
      }

      // Special handling for first duplicate entry - it should have normal select behavior but also show jump button
      const name_el = el.querySelector('.name')
      if (selection_flag !== false) {
        if (has_duplicate_entries && is_first_occurrence && hubs_flag !== 'true') {
          name_el.onclick = ev => jump_and_select_matching_entry(ev, instance_path)
        } else {
          name_el.onclick = ev => mode === 'search' ? handle_search_name_click(ev, instance_path) : select_node(ev, instance_path)
        }
      } else {
        name_el.onclick = () => handle_last_clicked_node(instance_path)
      }

      function handle_last_clicked_node (instance_path) {
        last_clicked_node = instance_path
        drive_updated_by_last_clicked = true
        update_drive_state({ type: 'runtime/last_clicked_node', message: instance_path })
        update_last_clicked_styling(instance_path)
      }
    }

    if (selected_instance_paths.includes(instance_path) || confirmed_instance_paths.includes(instance_path)) el.appendChild(create_confirm_checkbox(instance_path))

    return el
    function jump_and_select_matching_entry (ev, instance_path) {
      if (mode === 'search') {
        handle_search_name_click(ev, instance_path)
      } else {
        select_node(ev, instance_path)
      }
      // Also add jump button functionality for first occurrence
      setTimeout(() => add_jump_button_to_matching_entry(el, base_path, instance_path), 10)
    }
    function jump_out_to_next_duplicate () {
      last_clicked_node = instance_path
      drive_updated_by_match = true
      update_drive_state({ type: 'runtime/last_clicked_node', message: instance_path })
      update_last_clicked_styling(instance_path)
      add_jump_button_to_matching_entry(el, base_path, instance_path)
    }
  }

  // `re_render_node` updates a single node in the DOM, used when only its selection state changes.
  function re_render_node (instance_path) {
    const node_data = view.find(n => n.instance_path === instance_path)
    if (node_data) {
      const old_node_el = shadow.querySelector(`[data-instance_path="${CSS.escape(instance_path)}"]`)
      if (old_node_el) old_node_el.replaceWith(create_node(node_data))
    }
  }

  // `get_prefix` determines which box-drawing character to use for the node's prefix. It gives the name of a specific CSS class.
  function get_prefix ({ is_last_sub, has_subs, state, is_hub, is_hub_on_top }) {
    if (!state) {
      console.error('get_prefix called with invalid state.')
      return 'middle-line'
    }

    // Define handlers for different prefix types based on node position
    const on_prefix_types = {
      hub_on_top: get_hub_on_top_prefix,
      hub_not_on_top: get_hub_not_on_top_prefix,
      last_sub: get_last_sub_prefix,
      middle_sub: get_middle_sub_prefix
    }
    // Determine the prefix type based on node position
    let prefix_type
    if (is_hub && is_hub_on_top) prefix_type = 'hub_on_top'
    else if (is_hub && !is_hub_on_top) prefix_type = 'hub_not_on_top'
    else if (is_last_sub) prefix_type = 'last_sub'
    else prefix_type = 'middle_sub'

    const handler = on_prefix_types[prefix_type]

    return handler ? handler({ state, has_subs }) : 'middle-line'

    function get_hub_on_top_prefix ({ state }) {
      const { expanded_subs, expanded_hubs } = state
      if (expanded_subs && expanded_hubs) return 'top-cross'
      if (expanded_subs) return 'top-tee-down'
      if (expanded_hubs) return 'top-tee-up'
      return 'top-line'
    }

    function get_hub_not_on_top_prefix ({ state }) {
      const { expanded_subs, expanded_hubs } = state
      if (expanded_subs && expanded_hubs) return 'middle-cross'
      if (expanded_subs) return 'middle-tee-down'
      if (expanded_hubs) return 'middle-tee-up'
      return 'middle-line'
    }

    function get_last_sub_prefix ({ state, has_subs }) {
      const { expanded_subs, expanded_hubs } = state
      if (expanded_subs && expanded_hubs) return 'bottom-cross'
      if (expanded_subs) return 'bottom-tee-down'
      if (expanded_hubs) return has_subs ? 'bottom-tee-up' : 'bottom-light-tee-up'
      return has_subs ? 'bottom-line' : 'bottom-light-line'
    }

    function get_middle_sub_prefix ({ state, has_subs }) {
      const { expanded_subs, expanded_hubs } = state
      if (expanded_subs && expanded_hubs) return 'middle-cross'
      if (expanded_subs) return 'middle-tee-down'
      if (expanded_hubs) return has_subs ? 'middle-tee-up' : 'middle-light-tee-up'
      return has_subs ? 'middle-line' : 'middle-light-line'
    }
  }

  /******************************************************************************
  MENUBAR AND SEARCH
  ******************************************************************************/
  function render_menubar () {
    const search_button = document.createElement('button')
    search_button.textContent = 'Search'
    search_button.onclick = toggle_search_mode

    const undo_button = document.createElement('button')
    undo_button.textContent = `Undo (${undo_stack.length})`
    undo_button.onclick = () => undo(1)
    undo_button.disabled = undo_stack.length === 0

    const multi_select_button = document.createElement('button')
    multi_select_button.textContent = `Multi Select: ${multi_select_enabled}`
    multi_select_button.onclick = toggle_multi_select

    const select_between_button = document.createElement('button')
    select_between_button.textContent = `Select Between: ${select_between_enabled}`
    select_between_button.onclick = toggle_select_between

    const hubs_button = document.createElement('button')
    hubs_button.textContent = `Hubs: ${hubs_flag}`
    hubs_button.onclick = toggle_hubs_flag

    const selection_button = document.createElement('button')
    selection_button.textContent = `Selection: ${selection_flag}`
    selection_button.onclick = toggle_selection_flag

    const recursive_collapse_button = document.createElement('button')
    recursive_collapse_button.textContent = `Recursive Collapse: ${recursive_collapse_flag}`
    recursive_collapse_button.onclick = toggle_recursive_collapse_flag

    menubar.replaceChildren(search_button, undo_button, multi_select_button, select_between_button, hubs_button, selection_button, recursive_collapse_button)
  }

  function render_searchbar () {
    if (mode !== 'search') {
      searchbar.style.display = 'none'
      searchbar.replaceChildren()
      return
    }

    const search_opts = {
      type: 'text',
      placeholder: 'Search entries...',
      className: 'search-input',
      value: search_query,
      oninput: on_search_input
    }
    searchbar.style.display = 'flex'
    const search_input = Object.assign(document.createElement('input'), search_opts)

    searchbar.replaceChildren(search_input)
    requestAnimationFrame(() => search_input.focus())
  }

  async function handle_mode_change () {
    menubar.style.display = mode === 'default' ? 'none' : 'flex'
    render_searchbar()
    await build_and_render_view()
  }

  async function toggle_search_mode () {
    const target_mode = mode === 'search' ? previous_mode : 'search'
    console.log('[SEARCH DEBUG] Switching mode from', mode, 'to', target_mode)
    send_message({ type: 'mode_toggling', data: { from: mode, to: target_mode } })
    if (mode === 'search') {
      // When switching from search to default mode, expand selected entries
      if (selected_instance_paths.length > 0) {
        console.log('[SEARCH DEBUG] Expanding selected entries in default mode:', selected_instance_paths)
        await expand_selected_entries_in_default(selected_instance_paths)
        drive_updated_by_toggle = true
        update_drive_state({ type: 'runtime/instance_states', message: instance_states })
      }
      // Reset select-between mode when leaving search mode
      if (select_between_enabled) {
        select_between_enabled = false
        select_between_first_node = null
        update_drive_state({ type: 'mode/select_between_enabled', message: false })
        console.log('[SEARCH DEBUG] Reset select-between mode when leaving search')
      }
      search_query = ''
      update_drive_state({ type: 'mode/search_query', message: '' })
    }
    ignore_drive_updated_by_scroll = true
    update_drive_state({ type: 'mode/current_mode', message: target_mode })
    search_state_instances = instance_states
    send_message({ type: 'mode_changed', data: { mode: target_mode } })
  }

  function toggle_multi_select () {
    multi_select_enabled = !multi_select_enabled
    // Disable select between when enabling multi select
    if (multi_select_enabled && select_between_enabled) {
      select_between_enabled = false
      select_between_first_node = null
      update_drive_state({ type: 'mode/select_between_enabled', message: false })
    }
    update_drive_state({ type: 'mode/multi_select_enabled', message: multi_select_enabled })
    render_menubar() // Re-render to update button text
  }

  function toggle_select_between () {
    select_between_enabled = !select_between_enabled
    select_between_first_node = null // Reset first node selection
    // Disable multi select when enabling select between
    if (select_between_enabled && multi_select_enabled) {
      multi_select_enabled = false
      update_drive_state({ type: 'mode/multi_select_enabled', message: false })
    }
    update_drive_state({ type: 'mode/select_between_enabled', message: select_between_enabled })
    render_menubar() // Re-render to update button text
  }

  function toggle_hubs_flag () {
    const values = ['default', 'true', 'false']
    const current_index = values.indexOf(hubs_flag)
    const next_index = (current_index + 1) % values.length
    hubs_flag = values[next_index]
    update_drive_state({ type: 'flags/hubs', message: hubs_flag })
    render_menubar()
  }

  function toggle_selection_flag () {
    selection_flag = !selection_flag
    update_drive_state({ type: 'flags/selection', message: selection_flag })
    render_menubar()
  }

  function toggle_recursive_collapse_flag () {
    recursive_collapse_flag = !recursive_collapse_flag
    update_drive_state({ type: 'flags/recursive_collapse', message: recursive_collapse_flag })
    render_menubar()
  }

  function on_search_input (event) {
    search_query = event.target.value.trim()
    drive_updated_by_search = true
    update_drive_state({ type: 'mode/search_query', message: search_query })
    if (search_query === '') search_state_instances = instance_states
    perform_search(search_query)
  }

  async function perform_search (query) {
    console.log('[SEARCH DEBUG] perform_search called:', {
      query,
      current_mode: mode,
      search_query_var: search_query,
      has_search_entry_states: Object.keys(search_entry_states).length > 0,
      last_clicked_node
    })
    if (!query) {
      console.log('[SEARCH DEBUG] No query provided, building default view')
      return build_and_render_view()
    }

    const original_view = await build_view_recursive({
      base_path: '/',
      parent_instance_path: '',
      depth: 0,
      is_last_sub: true,
      is_hub: false,
      parent_pipe_trail: [],
      instance_states,
      db
    })
    const original_view_paths = original_view.map(n => n.instance_path)
    search_state_instances = {}
    const search_tracking = {}
    const search_view = await build_search_view_recursive({
      query,
      base_path: '/',
      parent_instance_path: '',
      depth: 0,
      is_last_sub: true,
      is_hub: false,
      is_first_hub: false,
      parent_pipe_trail: [],
      instance_states: search_state_instances,
      db,
      original_view_paths,
      is_expanded_child: false,
      search_tracking
    })
    console.log('[SEARCH DEBUG] Search view built:', search_view.length)
    render_search_results(search_view, query)
  }

  async function build_search_view_recursive ({
    query,
    base_path,
    parent_instance_path,
    parent_base_path = null,
    depth,
    is_last_sub,
    is_hub,
    is_first_hub = false,
    parent_pipe_trail,
    instance_states,
    db,
    original_view_paths,
    is_expanded_child = false,
    search_tracking = {}
  }) {
    const entry = await db.get(base_path)
    if (!entry) return []

    const instance_path = `${parent_instance_path}|${base_path}`
    const is_direct_match = entry.name && entry.name.toLowerCase().includes(query.toLowerCase())

    // track instance for duplicate detection
    if (!search_tracking[base_path]) search_tracking[base_path] = []
    const is_first_occurrence_in_search = !search_tracking[base_path].length
    search_tracking[base_path].push(instance_path)

    // Use extracted pipe logic for consistent rendering
    const { children_pipe_trail, is_hub_on_top } = await calculate_children_pipe_trail({
      depth,
      is_hub,
      is_last_sub,
      is_first_hub,
      parent_pipe_trail,
      parent_base_path,
      base_path,
      db
    })

    // Process hubs if they should be expanded
    const search_state = search_entry_states[instance_path]
    const should_expand_hubs = search_state ? search_state.expanded_hubs : false
    const should_expand_subs = search_state ? search_state.expanded_subs : false

    // Process hubs: if manually expanded, show ALL hubs regardless of search match
    const hub_results = []
    if (should_expand_hubs && entry.hubs) {
      for (let i = 0; i < entry.hubs.length; i++) {
        const hub_path = entry.hubs[i]
        const hub_view = await build_search_view_recursive({
          query,
          base_path: hub_path,
          parent_instance_path: instance_path,
          parent_base_path: base_path,
          depth: depth + 1,
          is_last_sub: i === entry.hubs.length - 1,
          is_hub: true,
          is_first_hub: is_hub_on_top,
          parent_pipe_trail: children_pipe_trail,
          instance_states,
          db,
          original_view_paths,
          is_expanded_child: true,
          search_tracking
        })
        hub_results.push(...hub_view)
      }
    }

    // Handle subs: if manually expanded, show ALL children; otherwise, search through them
    const sub_results = []
    if (should_expand_subs) {
      // Show ALL subs when manually expanded
      if (entry.subs) {
        for (let i = 0; i < entry.subs.length; i++) {
          const sub_path = entry.subs[i]
          const sub_view = await build_search_view_recursive({
            query,
            base_path: sub_path,
            parent_instance_path: instance_path,
            parent_base_path: base_path,
            depth: depth + 1,
            is_last_sub: i === entry.subs.length - 1,
            is_hub: false,
            is_first_hub: false,
            parent_pipe_trail: children_pipe_trail,
            instance_states,
            db,
            original_view_paths,
            is_expanded_child: true,
            search_tracking
          })
          sub_results.push(...sub_view)
        }
      }
    } else if (!is_expanded_child && is_first_occurrence_in_search) {
      // Only search through subs for the first occurrence of this base_path
      if (entry.subs) {
        for (let i = 0; i < entry.subs.length; i++) {
          const sub_path = entry.subs[i]
          const sub_view = await build_search_view_recursive({
            query,
            base_path: sub_path,
            parent_instance_path: instance_path,
            parent_base_path: base_path,
            depth: depth + 1,
            is_last_sub: i === entry.subs.length - 1,
            is_hub: false,
            is_first_hub: false,
            parent_pipe_trail: children_pipe_trail,
            instance_states,
            db,
            original_view_paths,
            is_expanded_child: false,
            search_tracking
          })
          sub_results.push(...sub_view)
        }
      }
    }

    const has_matching_descendant = sub_results.length > 0

    // If this is an expanded child, always include it regardless of search match
    // only include if it's the first occurrence OR if a dirct match
    if (!is_expanded_child && !is_direct_match && !has_matching_descendant) return []
    if (!is_expanded_child && !is_first_occurrence_in_search && !is_direct_match) return []

    const final_expand_subs = search_state ? search_state.expanded_subs : (has_matching_descendant && is_first_occurrence_in_search)
    const final_expand_hubs = search_state ? search_state.expanded_hubs : false

    instance_states[instance_path] = { expanded_subs: final_expand_subs, expanded_hubs: final_expand_hubs }
    const is_in_original_view = original_view_paths.includes(instance_path)

    // Calculate pipe_trail for this search node
    const { pipe_trail, is_hub_on_top: calculated_is_hub_on_top } = await calculate_pipe_trail({
      depth,
      is_hub,
      is_last_sub,
      is_first_hub,
      is_hub_on_top,
      parent_pipe_trail,
      parent_base_path,
      base_path,
      db
    })

    const current_node_view = {
      base_path,
      instance_path,
      depth,
      is_last_sub,
      is_hub,
      is_first_hub,
      parent_pipe_trail,
      parent_base_path,
      is_search_match: true,
      is_direct_match,
      is_in_original_view,
      entry, // Include entry data
      pipe_trail, // Pre-calculated pipe trail
      is_hub_on_top: calculated_is_hub_on_top // Pre-calculated hub position
    }

    return [...hub_results, current_node_view, ...sub_results]
  }

  function render_search_results (search_view, query) {
    view = search_view
    if (search_view.length === 0) {
      const no_results_el = document.createElement('div')
      no_results_el.className = 'no-results'
      no_results_el.textContent = `No results for "${query}"`
      return container.replaceChildren(no_results_el)
    }

    // temporary tracking map for search results to detect duplicates
    const search_tracking = {}
    search_view.forEach(node => set_search_tracking(node))

    const original_tracking = view_order_tracking
    view_order_tracking = search_tracking
    collect_all_duplicate_entries()

    const fragment = document.createDocumentFragment()
    search_view.forEach(node_data => fragment.appendChild(create_node({ ...node_data, query })))
    container.replaceChildren(fragment)

    view_order_tracking = original_tracking

    function set_search_tracking (node) {
      const { base_path, instance_path } = node
      if (!search_tracking[base_path]) search_tracking[base_path] = []
      search_tracking[base_path].push(instance_path)
    }
  }

  /******************************************************************************
  VIEW MANIPULATION & USER ACTIONS
      - These functions handle user interactions like selecting, confirming,
        toggling, and resetting the graph.
  ******************************************************************************/
  function select_node (ev, instance_path) {
    last_clicked_node = instance_path
    update_drive_state({ type: 'runtime/last_clicked_node', message: instance_path })
    send_message({ type: 'node_clicked', data: { instance_path } })

    // Handle shift+click to enable select between mode temporarily
    if (ev.shiftKey && !select_between_enabled) {
      select_between_enabled = true
      select_between_first_node = null
      update_drive_state({ type: 'mode/select_between_enabled', message: true })
      render_menubar()
    }

    const new_selected = new Set(selected_instance_paths)

    if (select_between_enabled) {
      handle_select_between(instance_path, new_selected)
    } else if (ev.ctrlKey || multi_select_enabled) {
      new_selected.has(instance_path) ? new_selected.delete(instance_path) : new_selected.add(instance_path)
      update_drive_state({ type: 'runtime/selected_instance_paths', message: [...new_selected] })
      send_message({ type: 'selection_changed', data: { selected: [...new_selected] } })
    } else {
      update_drive_state({ type: 'runtime/selected_instance_paths', message: [instance_path] })
      send_message({ type: 'selection_changed', data: { selected: [instance_path] } })
    }
  }

  function handle_select_between (instance_path, new_selected) {
    if (!select_between_first_node) {
      select_between_first_node = instance_path
    } else {
      const first_index = view.findIndex(n => n.instance_path === select_between_first_node)
      const second_index = view.findIndex(n => n.instance_path === instance_path)

      if (first_index !== -1 && second_index !== -1) {
        const start_index = Math.min(first_index, second_index)
        const end_index = Math.max(first_index, second_index)

        // Toggle selection for all nodes in the range
        for (let i = start_index; i <= end_index; i++) {
          const node_instance_path = view[i].instance_path
          new_selected.has(node_instance_path) ? new_selected.delete(node_instance_path) : new_selected.add(node_instance_path)
        }

        update_drive_state({ type: 'runtime/selected_instance_paths', message: [...new_selected] })
      }

      // Reset select between mode after second click
      select_between_enabled = false
      select_between_first_node = null
      update_drive_state({ type: 'mode/select_between_enabled', message: false })
      render_menubar()
    }
  }

  // Add the clicked entry and all its parents in the default tree
  async function expand_entry_path_in_default (target_instance_path) {
    console.log('[SEARCH DEBUG] search_expand_into_default called:', {
      target_instance_path,
      current_mode: mode,
      search_query,
      previous_mode,
      current_search_entry_states: Object.keys(search_entry_states).length,
      current_instance_states: Object.keys(instance_states).length
    })

    if (!target_instance_path) {
      console.warn('[SEARCH DEBUG] No target_instance_path provided')
      return
    }

    const parts = target_instance_path.split('|').filter(Boolean)
    if (parts.length === 0) {
      console.warn('[SEARCH DEBUG] No valid parts found in instance path:', target_instance_path)
      return
    }

    console.log('[SEARCH DEBUG] Parsed instance path parts:', parts)

    const root_state = get_or_create_state(instance_states, '|/')
    root_state.expanded_subs = true

    // Walk from root to target, expanding the path relative to already expanded entries
    for (let i = 0; i < parts.length - 1; i++) {
      const parent_base = parts[i]
      const child_base = parts[i + 1]
      const parent_instance_path = parts.slice(0, i + 1).map(p => '|' + p).join('')
      const parent_state = get_or_create_state(instance_states, parent_instance_path)
      const parent_entry = await db.get(parent_base)

      console.log('[SEARCH DEBUG] Processing parent-child relationship:', {
        parent_base,
        child_base,
        parent_instance_path,
        has_parent_entry: !!parent_entry
      })

      if (!parent_entry) continue
      if (Array.isArray(parent_entry.subs) && parent_entry.subs.includes(child_base)) {
        parent_state.expanded_subs = true
        console.log('[SEARCH DEBUG] Expanded subs for:', parent_instance_path)
      }
      if (Array.isArray(parent_entry.hubs) && parent_entry.hubs.includes(child_base)) {
        parent_state.expanded_hubs = true
        console.log('[SEARCH DEBUG] Expanded hubs for:', parent_instance_path)
      }
    }
  }

  // expand multiple selected entry in the default tree
  async function expand_selected_entries_in_default (selected_paths) {
    console.log('[SEARCH DEBUG] expand_selected_entries_in_default called:', {
      selected_paths,
      current_mode: mode,
      search_query,
      previous_mode
    })

    if (!Array.isArray(selected_paths) || selected_paths.length === 0) {
      console.warn('[SEARCH DEBUG] No valid selected paths provided')
      return
    }

    // expand foreach selected path
    for (const path of selected_paths) {
      await expand_entry_path_in_default(path)
    }

    console.log('[SEARCH DEBUG] All selected entries expanded in default mode')
  }

  // Add the clicked entry and all its parents in the default tree
  async function search_expand_into_default (target_instance_path) {
    if (!target_instance_path) {
      return
    }

    handle_search_node_click(target_instance_path)
    await expand_entry_path_in_default(target_instance_path)

    console.log('[SEARCH DEBUG] Current mode before switch:', mode)
    console.log('[SEARCH DEBUG] Target previous_mode:', previous_mode)

    // Persist selection and expansion state
    update_drive_state({ type: 'runtime/selected_instance_paths', message: [target_instance_path] })
    drive_updated_by_toggle = true
    update_drive_state({ type: 'runtime/instance_states', message: instance_states })
    search_query = ''
    update_drive_state({ type: 'mode/search_query', message: '' })

    console.log('[SEARCH DEBUG] About to switch from search mode to:', previous_mode)
    update_drive_state({ type: 'mode/current_mode', message: previous_mode })
  }

  function handle_confirm (ev, instance_path) {
    if (!ev.target) return
    const is_checked = ev.target.checked
    const new_selected = new Set(selected_instance_paths)
    const new_confirmed = new Set(confirmed_instance_paths)

    // use specific logic for mode
    if (mode === 'search') {
      handle_search_node_click(instance_path)
    } else {
      last_clicked_node = instance_path
      update_drive_state({ type: 'runtime/last_clicked_node', message: instance_path })
    }

    if (is_checked) {
      new_selected.delete(instance_path)
      new_confirmed.add(instance_path)
    } else {
      new_selected.add(instance_path)
      new_confirmed.delete(instance_path)
    }

    update_drive_state({ type: 'runtime/selected_instance_paths', message: [...new_selected] })
    update_drive_state({ type: 'runtime/confirmed_selected', message: [...new_confirmed] })
  }

  async function toggle_subs (instance_path) {
    const state = get_or_create_state(instance_states, instance_path)
    const was_expanded = state.expanded_subs
    state.expanded_subs = !state.expanded_subs

    // Update view order tracking for the toggled subs
    const base_path = instance_path.split('|').pop()
    const entry = await db.get(base_path)

    if (entry && Array.isArray(entry.subs)) {
      if (was_expanded && recursive_collapse_flag === true) {
        for (const sub_path of entry.subs) {
          await collapse_and_remove_instance(sub_path, instance_path, instance_states, db)
        }
      } else {
        for (const sub_path of entry.subs) {
          await toggle_subs_instance(sub_path, instance_path, instance_states, db)
        }
      }
    }

    last_clicked_node = instance_path
    update_drive_state({ type: 'runtime/last_clicked_node', message: instance_path })

    build_and_render_view(instance_path)
    // Set a flag to prevent the subsequent `onbatch` call from causing a render loop.
    drive_updated_by_toggle = true
    update_drive_state({ type: 'runtime/instance_states', message: instance_states })
    send_message({ type: 'subs_toggled', data: { instance_path, expanded: state.expanded_subs } })

    async function toggle_subs_instance (sub_path, instance_path, instance_states, db) {
      if (was_expanded) {
        // Collapsing so
        await remove_instances_recursively(sub_path, instance_path, instance_states, db)
      } else {
        // Expanding so
        await add_instances_recursively(sub_path, instance_path, instance_states, db)
      }
    }

    async function collapse_and_remove_instance (sub_path, instance_path, instance_states, db) {
      await collapse_subs_recursively(sub_path, instance_path, instance_states, db)
      await remove_instances_recursively(sub_path, instance_path, instance_states, db)
    }
  }

  async function toggle_hubs (instance_path) {
    const state = get_or_create_state(instance_states, instance_path)
    const was_expanded = state.expanded_hubs
    state.expanded_hubs ? hub_num-- : hub_num++
    state.expanded_hubs = !state.expanded_hubs

    // Update view order tracking for the toggled hubs
    const base_path = instance_path.split('|').pop()
    const entry = await db.get(base_path)

    if (entry && Array.isArray(entry.hubs)) {
      if (was_expanded && recursive_collapse_flag === true) {
        // collapse all hub descendants
        for (const hub_path of entry.hubs) {
          await collapse_and_remove_instance(hub_path, instance_path, instance_states, db)
        }
      } else {
        // only toggle direct hubs
        for (const hub_path of entry.hubs) {
          await toggle_hubs_instance(hub_path, instance_path, instance_states, db)
        }
      }

      async function collapse_and_remove_instance (hub_path, instance_path, instance_states, db) {
        await collapse_hubs_recursively(hub_path, instance_path, instance_states, db)
        await remove_instances_recursively(hub_path, instance_path, instance_states, db)
      }
    }

    last_clicked_node = instance_path
    drive_updated_by_scroll = true // Prevent onbatch interference with hub spacer
    update_drive_state({ type: 'runtime/last_clicked_node', message: instance_path })

    build_and_render_view(instance_path, true)
    drive_updated_by_toggle = true
    update_drive_state({ type: 'runtime/instance_states', message: instance_states })
    send_message({ type: 'hubs_toggled', data: { instance_path, expanded: state.expanded_hubs } })

    async function toggle_hubs_instance (hub_path, instance_path, instance_states, db) {
      if (was_expanded) {
        // Collapsing so
        await remove_instances_recursively(hub_path, instance_path, instance_states, db)
      } else {
        // Expanding so
        await add_instances_recursively(hub_path, instance_path, instance_states, db)
      }
    }
  }

  async function toggle_search_subs (instance_path) {
    console.log('[SEARCH DEBUG] toggle_search_subs called:', {
      instance_path,
      mode,
      search_query,
      current_state: search_entry_states[instance_path]?.expanded_subs || false,
      recursive_collapse_flag
    })

    const state = get_or_create_state(search_entry_states, instance_path)
    const old_expanded = state.expanded_subs
    state.expanded_subs = !state.expanded_subs

    if (old_expanded && recursive_collapse_flag === true) {
      const base_path = instance_path.split('|').pop()
      const entry = await db.get(base_path)
      if (entry && Array.isArray(entry.subs)) entry.subs.forEach(sub_path => collapse_search_subs_recursively(sub_path, instance_path, search_entry_states, db))
    }

    const has_matching_descendant = search_state_instances[instance_path]?.expanded_subs ? null : true
    const has_matching_parents = manipulated_inside_search[instance_path] ? search_entry_states[instance_path]?.expanded_hubs : search_state_instances[instance_path]?.expanded_hubs
    manipulated_inside_search[instance_path] = { expanded_hubs: has_matching_parents, expanded_subs: has_matching_descendant }
    console.log('[SEARCH DEBUG] Toggled subs state:', {
      instance_path,
      old_expanded,
      new_expanded: state.expanded_subs,
      recursive_state: old_expanded && recursive_collapse_flag === true
    })

    handle_search_node_click(instance_path)

    perform_search(search_query)
    drive_updated_by_search = true
    update_drive_state({ type: 'runtime/search_entry_states', message: search_entry_states })
  }

  async function toggle_search_hubs (instance_path) {
    console.log('[SEARCH DEBUG] toggle_search_hubs called:', {
      instance_path,
      mode,
      search_query,
      current_state: search_entry_states[instance_path]?.expanded_hubs || false,
      recursive_collapse_flag
    })

    const state = get_or_create_state(search_entry_states, instance_path)
    const old_expanded = state.expanded_hubs
    state.expanded_hubs = !state.expanded_hubs

    if (old_expanded && recursive_collapse_flag === true) {
      const base_path = instance_path.split('|').pop()
      const entry = await db.get(base_path)
      if (entry && Array.isArray(entry.hubs)) entry.hubs.forEach(hub_path => collapse_search_hubs_recursively(hub_path, instance_path, search_entry_states, db))
    }

    const has_matching_descendant = search_state_instances[instance_path]?.expanded_subs
    manipulated_inside_search[instance_path] = { expanded_hubs: state.expanded_hubs, expanded_subs: has_matching_descendant }
    console.log('[SEARCH DEBUG] Toggled hubs state:', {
      instance_path,
      old_expanded,
      new_expanded: state.expanded_hubs,
      recursive_state: old_expanded && recursive_collapse_flag === true
    })

    handle_search_node_click(instance_path)

    console.log('[SEARCH DEBUG] About to perform_search after toggle_search_hubs')
    perform_search(search_query)
    drive_updated_by_search = true
    update_drive_state({ type: 'runtime/search_entry_states', message: search_entry_states })
    console.log('[SEARCH DEBUG] toggle_search_hubs completed')
  }

  function handle_search_node_click (instance_path) {
    console.log('[SEARCH DEBUG] handle_search_node_click called:', {
      instance_path,
      current_mode: mode,
      search_query,
      previous_last_clicked: last_clicked_node
    })

    if (mode !== 'search') {
      console.warn('[SEARCH DEBUG] handle_search_node_click called but not in search mode!', {
        current_mode: mode,
        instance_path
      })
      return
    }

    // we need to handle last_clicked_node differently
    const old_last_clicked = last_clicked_node
    last_clicked_node = instance_path

    console.log('[SEARCH DEBUG] Updating last_clicked_node:', {
      old_value: old_last_clicked,
      new_value: last_clicked_node,
      mode,
      search_query
    })

    update_drive_state({ type: 'runtime/last_clicked_node', message: instance_path })

    // Update visual styling for search mode nodes
    update_search_last_clicked_styling(instance_path)
  }

  function update_search_last_clicked_styling (target_instance_path) {
    console.log('[SEARCH DEBUG] update_search_last_clicked_styling called:', {
      target_instance_path,
      mode,
      search_query
    })

    // Remove `last-clicked` class from all search result nodes
    const search_nodes = container.querySelectorAll('.node.search-result')
    console.log('[SEARCH DEBUG] Found search result nodes:', search_nodes.length)
    search_nodes.forEach(node => remove_last_clicked_styling(node))

    // Add last-clicked class to the target node if it exists in search results
    const target_node = container.querySelector(`[data-instance_path="${target_instance_path}"].search-result`)
    if (target_node) {
      mode === 'search' ? target_node.classList.add('search-last-clicked') : target_node.classList.add('last-clicked')
      console.log('[SEARCH DEBUG] Added last-clicked to target node:', target_instance_path)
    } else {
      console.warn('[SEARCH DEBUG] Target node not found in search results:', {
        target_instance_path,
        available_search_nodes: Array.from(search_nodes).map(n => n.dataset.instance_path)
      })
    }

    function remove_last_clicked_styling (node) {
      const was_last_clicked = node.classList.contains('last-clicked')
      mode === 'search' ? node.classList.remove('search-last-clicked') : node.classList.remove('last-clicked')
      if (was_last_clicked) {
        console.log('[SEARCH DEBUG] Removed last-clicked from:', node.dataset.instance_path)
      }
    }
  }

  function handle_search_name_click (ev, instance_path) {
    console.log('[SEARCH DEBUG] handle_search_name_click called:', {
      instance_path,
      mode,
      search_query,
      ctrlKey: ev.ctrlKey,
      metaKey: ev.metaKey,
      shiftKey: ev.shiftKey,
      multi_select_enabled,
      current_selected: selected_instance_paths.length
    })

    if (mode !== 'search') {
      console.error('[SEARCH DEBUG] handle_search_name_click called but not in search mode!', {
        current_mode: mode,
        instance_path
      })
      return
    }

    handle_search_node_click(instance_path)

    if (ev.ctrlKey || ev.metaKey || multi_select_enabled) {
      search_select_node(ev, instance_path)
    } else if (ev.shiftKey) {
      search_select_node(ev, instance_path)
    } else if (select_between_enabled) {
      // Handle select-between mode when button is enabled
      search_select_node(ev, instance_path)
    } else {
      // Regular click
      search_expand_into_default(instance_path)
    }
  }

  function search_select_node (ev, instance_path) {
    console.log('[SEARCH DEBUG] search_select_node called:', {
      instance_path,
      mode,
      search_query,
      shiftKey: ev.shiftKey,
      ctrlKey: ev.ctrlKey,
      metaKey: ev.metaKey,
      multi_select_enabled,
      select_between_enabled,
      select_between_first_node,
      current_selected: selected_instance_paths
    })

    const new_selected = new Set(selected_instance_paths)

    if (select_between_enabled) {
      if (!select_between_first_node) {
        select_between_first_node = instance_path
        console.log('[SEARCH DEBUG] Set first node for select between:', instance_path)
      } else {
        console.log('[SEARCH DEBUG] Completing select between range:', {
          first: select_between_first_node,
          second: instance_path
        })
        const first_index = view.findIndex(n => n.instance_path === select_between_first_node)
        const second_index = view.findIndex(n => n.instance_path === instance_path)

        if (first_index !== -1 && second_index !== -1) {
          const start_index = Math.min(first_index, second_index)
          const end_index = Math.max(first_index, second_index)

          // Toggle selection for all nodes in between
          for (let i = start_index; i <= end_index; i++) {
            const node_instance_path = view[i].instance_path
            if (new_selected.has(node_instance_path)) {
              new_selected.delete(node_instance_path)
            } else {
              new_selected.add(node_instance_path)
            }
          }
        }

        // Reset select between mode after completing the selection
        select_between_enabled = false
        select_between_first_node = null
        update_drive_state({ type: 'mode/select_between_enabled', message: false })
        render_menubar()
        console.log('[SEARCH DEBUG] Reset select between mode')
      }
    } else if (ev.shiftKey) {
      // Enable select between mode on shift click
      select_between_enabled = true
      select_between_first_node = instance_path
      update_drive_state({ type: 'mode/select_between_enabled', message: true })
      render_menubar()
      console.log('[SEARCH DEBUG] Enabled select between mode with first node:', instance_path)
      return
    } else if (multi_select_enabled || ev.ctrlKey || ev.metaKey) {
      if (new_selected.has(instance_path)) {
        console.log('[SEARCH DEBUG] Deselecting node:', instance_path)
        new_selected.delete(instance_path)
      } else {
        console.log('[SEARCH DEBUG] Selecting node:', instance_path)
        new_selected.add(instance_path)
      }
    } else {
      // Single selection mode
      new_selected.clear()
      new_selected.add(instance_path)
      console.log('[SEARCH DEBUG] Single selecting node:', instance_path)
    }

    const new_selection_array = [...new_selected]
    update_drive_state({ type: 'runtime/selected_instance_paths', message: new_selection_array })
    console.log('[SEARCH DEBUG] search_select_node completed, new selection:', new_selection_array)
  }

  function reset () {
    // reset all of the manual expansions made
    instance_states = {}
    view_order_tracking = {} // Clear view order tracking on reset
    drive_updated_by_tracking = true
    update_drive_state({ type: 'runtime/view_order_tracking', message: view_order_tracking })
    if (mode === 'search') {
      search_entry_states = {}
      drive_updated_by_toggle = true
      update_drive_state({ type: 'runtime/search_entry_states', message: search_entry_states })
      perform_search(search_query)
      return
    }
    const root_instance_path = '|/'
    const new_instance_states = {
      [root_instance_path]: { expanded_subs: true, expanded_hubs: false }
    }
    update_drive_state({ type: 'runtime/vertical_scroll_value', message: 0 })
    update_drive_state({ type: 'runtime/horizontal_scroll_value', message: 0 })
    update_drive_state({ type: 'runtime/selected_instance_paths', message: [] })
    update_drive_state({ type: 'runtime/confirmed_selected', message: [] })
    update_drive_state({ type: 'runtime/instance_states', message: new_instance_states })
  }

  /******************************************************************************
  VIRTUAL SCROLLING
    - These functions implement virtual scrolling to handle large graphs
      efficiently using an IntersectionObserver.
  ******************************************************************************/
  function onscroll () {
    if (scroll_update_pending) return
    scroll_update_pending = true
    requestAnimationFrame(scroll_frames)
    function scroll_frames () {
      const scroll_delta = vertical_scroll_value - container.scrollTop
      // Handle removal of the scroll spacer.
      if (spacer_element && scroll_delta > 0 && container.scrollTop === 0) {
        spacer_element.remove()
        spacer_element = null
        spacer_initial_height = 0
        hub_num = 0
      }

      vertical_scroll_value = update_scroll_state({ current_value: vertical_scroll_value, new_value: container.scrollTop, name: 'vertical_scroll_value' })
      horizontal_scroll_value = update_scroll_state({ current_value: horizontal_scroll_value, new_value: container.scrollLeft, name: 'horizontal_scroll_value' })
      scroll_update_pending = false
    }
  }

  async function fill_viewport_downwards () {
    if (is_rendering || end_index >= view.length) return
    is_rendering = true
    const container_rect = container.getBoundingClientRect()
    let sentinel_rect = bottom_sentinel.getBoundingClientRect()
    while (end_index < view.length && sentinel_rect.top < container_rect.bottom + 500) {
      render_next_chunk()
      await new Promise(resolve => requestAnimationFrame(resolve))
      sentinel_rect = bottom_sentinel.getBoundingClientRect()
    }
    is_rendering = false
  }

  async function fill_viewport_upwards () {
    if (is_rendering || start_index <= 0) return
    is_rendering = true
    const container_rect = container.getBoundingClientRect()
    let sentinel_rect = top_sentinel.getBoundingClientRect()
    while (start_index > 0 && sentinel_rect.bottom > container_rect.top - 500) {
      render_prev_chunk()
      await new Promise(resolve => requestAnimationFrame(resolve))
      sentinel_rect = top_sentinel.getBoundingClientRect()
    }
    is_rendering = false
  }

  function handle_sentinel_intersection (entries) {
    entries.forEach(entry => fill_downwards_or_upwards(entry))
  }

  function fill_downwards_or_upwards (entry) {
    if (entry.isIntersecting) {
      if (entry.target === top_sentinel) fill_viewport_upwards()
      else if (entry.target === bottom_sentinel) fill_viewport_downwards()
    }
  }

  function render_next_chunk () {
    if (end_index >= view.length) return
    const fragment = document.createDocumentFragment()
    const next_end = Math.min(view.length, end_index + chunk_size)
    for (let i = end_index; i < next_end; i++) { if (view[i]) fragment.appendChild(create_node(view[i])) }
    container.insertBefore(fragment, bottom_sentinel)
    end_index = next_end
    bottom_sentinel.style.height = `${(view.length - end_index) * node_height}px`
    cleanup_dom(false)
  }

  function render_prev_chunk () {
    if (start_index <= 0) return
    const fragment = document.createDocumentFragment()
    const prev_start = Math.max(0, start_index - chunk_size)
    for (let i = prev_start; i < start_index; i++) {
      if (view[i]) fragment.appendChild(create_node(view[i]))
    }
    container.insertBefore(fragment, top_sentinel.nextSibling)
    start_index = prev_start
    top_sentinel.style.height = `${start_index * node_height}px`
    cleanup_dom(true)
  }

  // Removes nodes from the DOM that are far outside the viewport.
  function cleanup_dom (is_scrolling_up) {
    const rendered_count = end_index - start_index
    if (rendered_count <= max_rendered_nodes) return

    const to_remove_count = rendered_count - max_rendered_nodes
    if (is_scrolling_up) {
      // If scrolling up, remove nodes from the bottom.
      remove_dom_nodes({ count: to_remove_count, start_el: bottom_sentinel, next_prop: 'previousElementSibling', boundary_el: top_sentinel })
      end_index -= to_remove_count
      bottom_sentinel.style.height = `${(view.length - end_index) * node_height}px`
    } else {
      // If scrolling down, remove nodes from the top.
      remove_dom_nodes({ count: to_remove_count, start_el: top_sentinel, next_prop: 'nextElementSibling', boundary_el: bottom_sentinel })
      start_index += to_remove_count
      top_sentinel.style.height = `${start_index * node_height}px`
    }
  }

  /******************************************************************************
  ENTRY DUPLICATION PREVENTION
  ******************************************************************************/

  function collect_all_duplicate_entries () {
    duplicate_entries_map = {}
    // Use view_order_tracking for duplicate detection
    for (const [base_path, instance_paths] of Object.entries(view_order_tracking)) {
      if (instance_paths.length > 1) {
        duplicate_entries_map[base_path] = {
          instances: instance_paths,
          first_instance: instance_paths[0] // First occurrence in view order
        }
      }
    }
  }

  async function initialize_tracking_from_current_state () {
    const root_path = '/'
    const root_instance_path = '|/'
    if (await db.has(root_path)) {
      add_instance_to_view_tracking(root_path, root_instance_path)
      // Add initially expanded subs if any
      const root_entry = await db.get(root_path)
      if (root_entry && Array.isArray(root_entry.subs)) {
        for (const sub_path of root_entry.subs) {
          await add_instances_recursively(sub_path, root_instance_path, instance_states, db)
        }
      }
    }
  }

  function add_instance_to_view_tracking (base_path, instance_path) {
    if (!view_order_tracking[base_path]) view_order_tracking[base_path] = []
    if (!view_order_tracking[base_path].includes(instance_path)) {
      view_order_tracking[base_path].push(instance_path)

      // Only save to drive if not currently loading from drive
      if (!is_loading_from_drive) {
        drive_updated_by_tracking = true
        update_drive_state({ type: 'runtime/view_order_tracking', message: view_order_tracking })
      }
    }
  }

  function remove_instance_from_view_tracking (base_path, instance_path) {
    if (view_order_tracking[base_path]) {
      const index = view_order_tracking[base_path].indexOf(instance_path)
      if (index !== -1) {
        view_order_tracking[base_path].splice(index, 1)
        // Clean up empty arrays
        if (view_order_tracking[base_path].length === 0) {
          delete view_order_tracking[base_path]
        }

        // Only save to drive if not currently loading from drive
        if (!is_loading_from_drive) {
          drive_updated_by_tracking = true
          update_drive_state({ type: 'runtime/view_order_tracking', message: view_order_tracking })
        }
      }
    }
  }

  // Recursively add instances to tracking when expanding
  async function add_instances_recursively (base_path, parent_instance_path, instance_states, db) {
    const instance_path = `${parent_instance_path}|${base_path}`
    const entry = await db.get(base_path)
    if (!entry) return

    const state = get_or_create_state(instance_states, instance_path)

    if (state.expanded_hubs && Array.isArray(entry.hubs)) {
      for (const hub_path of entry.hubs) {
        await add_instances_recursively(hub_path, instance_path, instance_states, db)
      }
    }

    if (state.expanded_subs && Array.isArray(entry.subs)) {
      for (const sub_path of entry.subs) {
        await add_instances_recursively(sub_path, instance_path, instance_states, db)
      }
    }

    // Add the instance itself
    add_instance_to_view_tracking(base_path, instance_path)
  }

  // Recursively remove instances from tracking when collapsing
  async function remove_instances_recursively (base_path, parent_instance_path, instance_states, db) {
    const instance_path = `${parent_instance_path}|${base_path}`
    const entry = await db.get(base_path)
    if (!entry) return

    const state = get_or_create_state(instance_states, instance_path)

    if (state.expanded_hubs && Array.isArray(entry.hubs)) {
      for (const hub_path of entry.hubs) {
        await remove_instances_recursively(hub_path, instance_path, instance_states, db)
      }
    }
    if (state.expanded_subs && Array.isArray(entry.subs)) {
      for (const sub_path of entry.subs) {
        await remove_instances_recursively(sub_path, instance_path, instance_states, db)
      }
    }

    // Remove the instance itself
    remove_instance_from_view_tracking(base_path, instance_path)
  }

  // Recursively hubs all subs in default mode
  async function collapse_subs_recursively (base_path, parent_instance_path, instance_states, db) {
    const instance_path = `${parent_instance_path}|${base_path}`
    const entry = await db.get(base_path)
    if (!entry) return

    const state = get_or_create_state(instance_states, instance_path)

    if (state.expanded_subs && Array.isArray(entry.subs)) {
      state.expanded_subs = false
      for (const sub_path of entry.subs) {
        await collapse_and_remove_instance(sub_path, instance_path, instance_states, db)
      }
    }

    if (state.expanded_hubs && Array.isArray(entry.hubs)) {
      state.expanded_hubs = false
      hub_num = Math.max(0, hub_num - 1) // Decrement hub counter
      for (const hub_path of entry.hubs) {
        await collapse_and_remove_instance(hub_path, instance_path, instance_states, db)
      }
    }
    async function collapse_and_remove_instance (base_path, instance_path, instance_states, db) {
      await collapse_subs_recursively(base_path, instance_path, instance_states, db)
      await remove_instances_recursively(base_path, instance_path, instance_states, db)
    }
  }

  // Recursively hubs all hubs in default mode
  async function collapse_hubs_recursively (base_path, parent_instance_path, instance_states, db) {
    const instance_path = `${parent_instance_path}|${base_path}`
    const entry = await db.get(base_path)
    if (!entry) return

    const state = get_or_create_state(instance_states, instance_path)

    if (state.expanded_hubs && Array.isArray(entry.hubs)) {
      state.expanded_hubs = false
      hub_num = Math.max(0, hub_num - 1)
      for (const hub_path of entry.hubs) {
        await collapse_and_remove_instance(hub_path, instance_path, instance_states, db)
      }
    }

    if (state.expanded_subs && Array.isArray(entry.subs)) {
      state.expanded_subs = false
      for (const sub_path of entry.subs) {
        await collapse_and_remove_instance(sub_path, instance_path, instance_states, db)
      }
    }
    async function collapse_and_remove_instance (base_path, instance_path, instance_states, db) {
      await collapse_all_recursively(base_path, instance_path, instance_states, db)
      await remove_instances_recursively(base_path, instance_path, instance_states, db)
    }
  }

  // Recursively collapse in default mode
  async function collapse_all_recursively (base_path, parent_instance_path, instance_states, db) {
    const instance_path = `${parent_instance_path}|${base_path}`
    const entry = await db.get(base_path)
    if (!entry) return

    const state = get_or_create_state(instance_states, instance_path)

    if (state.expanded_subs && Array.isArray(entry.subs)) {
      state.expanded_subs = false
      for (const sub_path of entry.subs) {
        await collapse_and_remove_instance_recursively(sub_path, instance_path, instance_states, db)
      }
    }

    if (state.expanded_hubs && Array.isArray(entry.hubs)) {
      state.expanded_hubs = false
      hub_num = Math.max(0, hub_num - 1)
      for (const hub_path of entry.hubs) {
        await collapse_and_remove_instance_recursively(hub_path, instance_path, instance_states, db)
      }
    }

    async function collapse_and_remove_instance_recursively (base_path, instance_path, instance_states, db) {
      await collapse_all_recursively(base_path, instance_path, instance_states, db)
      await remove_instances_recursively(base_path, instance_path, instance_states, db)
    }
  }

  // Recursively subs all hubs in search mode
  async function collapse_search_subs_recursively (base_path, parent_instance_path, search_entry_states, db) {
    const instance_path = `${parent_instance_path}|${base_path}`
    const entry = await db.get(base_path)
    if (!entry) return

    const state = get_or_create_state(search_entry_states, instance_path)

    if (state.expanded_subs && Array.isArray(entry.subs)) {
      state.expanded_subs = false
      for (const sub_path of entry.subs) {
        await collapse_search_all_recursively(sub_path, instance_path, search_entry_states, db)
      }
    }

    if (state.expanded_hubs && Array.isArray(entry.hubs)) {
      state.expanded_hubs = false
      for (const hub_path of entry.hubs) {
        await collapse_search_all_recursively(hub_path, instance_path, search_entry_states, db)
      }
    }
  }

  // Recursively hubs all hubs in search mode
  async function collapse_search_hubs_recursively (base_path, parent_instance_path, search_entry_states, db) {
    const instance_path = `${parent_instance_path}|${base_path}`
    const entry = await db.get(base_path)
    if (!entry) return

    const state = get_or_create_state(search_entry_states, instance_path)

    if (state.expanded_hubs && Array.isArray(entry.hubs)) {
      state.expanded_hubs = false
      for (const hub_path of entry.hubs) {
        await collapse_search_all_recursively(hub_path, instance_path, search_entry_states, db)
      }
    }

    if (state.expanded_subs && Array.isArray(entry.subs)) {
      state.expanded_subs = false
      for (const sub_path of entry.subs) {
        await collapse_search_all_recursively(sub_path, instance_path, search_entry_states, db)
      }
    }
  }

  // Recursively collapse in search mode
  async function collapse_search_all_recursively (base_path, parent_instance_path, search_entry_states, db) {
    const instance_path = `${parent_instance_path}|${base_path}`
    const entry = await db.get(base_path)
    if (!entry) return

    const state = get_or_create_state(search_entry_states, instance_path)

    if (state.expanded_subs && Array.isArray(entry.subs)) {
      state.expanded_subs = false
      for (const sub_path of entry.subs) {
        await collapse_search_all_recursively(sub_path, instance_path, search_entry_states, db)
      }
    }

    if (state.expanded_hubs && Array.isArray(entry.hubs)) {
      state.expanded_hubs = false
      for (const hub_path of entry.hubs) {
        await collapse_search_all_recursively(hub_path, instance_path, search_entry_states, db)
      }
    }
  }

  function get_next_duplicate_instance (base_path, current_instance_path) {
    const duplicates = duplicate_entries_map[base_path]
    if (!duplicates || duplicates.instances.length <= 1) return null

    const current_index = duplicates.instances.indexOf(current_instance_path)
    if (current_index === -1) return duplicates.instances[0]

    const next_index = (current_index + 1) % duplicates.instances.length
    return duplicates.instances[next_index]
  }

  function has_duplicates (base_path) {
    return duplicate_entries_map[base_path] && duplicate_entries_map[base_path].instances.length > 1
  }

  function is_first_duplicate (base_path, instance_path) {
    const duplicates = duplicate_entries_map[base_path]
    return duplicates && duplicates.first_instance === instance_path
  }

  function cycle_to_next_duplicate (base_path, current_instance_path) {
    const next_instance_path = get_next_duplicate_instance(base_path, current_instance_path)
    if (next_instance_path) {
      remove_jump_button_from_entry(current_instance_path)

      // First, handle the scroll and DOM updates without drive state changes
      scroll_to_and_highlight_instance(next_instance_path, current_instance_path)

      // Manually update DOM styling
      update_last_clicked_styling(next_instance_path)
      last_clicked_node = next_instance_path
      drive_updated_by_scroll = true // Prevent onbatch from interfering with scroll
      drive_updated_by_match = true
      update_drive_state({ type: 'runtime/last_clicked_node', message: next_instance_path })

      // Add jump button to the target entry (with a small delay to ensure DOM is ready)
      setTimeout(jump_out, 10)
      function jump_out () {
        const target_element = shadow.querySelector(`[data-instance_path="${CSS.escape(next_instance_path)}"]`)
        if (target_element) {
          add_jump_button_to_matching_entry(target_element, base_path, next_instance_path)
        }
      }
    }
  }

  function update_last_clicked_styling (new_instance_path) {
    // Remove last-clicked class from all elements
    const all_nodes = mode === 'search' ? shadow.querySelectorAll('.node.search-last-clicked') : shadow.querySelectorAll('.node.last-clicked')
    console.log('Removing last-clicked class from all nodes', all_nodes)
    all_nodes.forEach(node => (mode === 'search' ? node.classList.remove('search-last-clicked') : node.classList.remove('last-clicked')))
    // Add last-clicked class to the new element
    if (new_instance_path) {
      const new_element = shadow.querySelector(`[data-instance_path="${CSS.escape(new_instance_path)}"]`)
      if (new_element) {
        mode === 'search' ? new_element.classList.add('search-last-clicked') : new_element.classList.add('last-clicked')
      }
    }
  }

  function remove_jump_button_from_entry (instance_path) {
    const current_element = shadow.querySelector(`[data-instance_path="${CSS.escape(instance_path)}"]`)
    if (current_element) {
      // restore the wand icon
      const node_data = view.find(n => n.instance_path === instance_path)
      if (node_data && node_data.base_path === '/' && instance_path === '|/') {
        const wand_el = current_element.querySelector('.wand.navigate-to-hub')
        if (wand_el && root_wand_state) {
          wand_el.textContent = root_wand_state.content
          wand_el.className = root_wand_state.className
          wand_el.onclick = root_wand_state.onclick

          root_wand_state = null
        }
        return
      }

      // Regular behavior for non-root nodes
      const button_container = current_element.querySelector('.indent-btn-container')
      if (button_container) {
        button_container.remove()
        // Restore left-indent class
        if (node_data && node_data.depth > 0) {
          current_element.classList.add('left-indent')
        }
      }
    }
  }

  function add_jump_button_to_matching_entry (el, base_path, instance_path) {
    // Check if jump button already exists
    if (el.querySelector('.navigate-to-hub')) return

    // replace the wand icon temporarily
    if (base_path === '/' && instance_path === '|/') {
      const wand_el = el.querySelector('.wand')
      if (wand_el) {
        // Store original wand state in JavaScript variable
        root_wand_state = {
          content: wand_el.textContent,
          className: wand_el.className,
          onclick: wand_el.onclick
        }

        // Replace with jump button
        wand_el.textContent = '^'
        wand_el.className = 'wand navigate-to-hub clickable'
        wand_el.onclick = (ev) => handle_jump_button_click(ev, instance_path)
      }
      return

      function handle_jump_button_click (ev, instance_path) {
        ev.stopPropagation()
        last_clicked_node = instance_path
        drive_updated_by_match = true
        update_drive_state({ type: 'runtime/last_clicked_node', message: instance_path })

        update_last_clicked_styling(instance_path)

        cycle_to_next_duplicate(base_path, instance_path)
      }
    }

    const indent_button_div = document.createElement('div')
    indent_button_div.className = 'indent-btn-container'

    const navigate_button = document.createElement('span')
    navigate_button.className = 'navigate-to-hub clickable'
    navigate_button.textContent = '^'
    navigate_button.onclick = (ev) => handle_navigate_button_click(ev, instance_path)

    indent_button_div.appendChild(navigate_button)

    // Remove left padding
    el.classList.remove('left-indent')
    el.insertBefore(indent_button_div, el.firstChild)

    function handle_navigate_button_click (ev, instance_path) {
      ev.stopPropagation() // Prevent triggering the whole entry click again
      // Manually update last clicked node for jump button
      last_clicked_node = instance_path
      drive_updated_by_match = true
      update_drive_state({ type: 'runtime/last_clicked_node', message: instance_path })

      // Manually update DOM classes for last-clicked styling
      update_last_clicked_styling(instance_path)

      cycle_to_next_duplicate(base_path, instance_path)
    }
  }

  function scroll_to_and_highlight_instance (target_instance_path, source_instance_path = null) {
    const target_index = view.findIndex(n => n.instance_path === target_instance_path)
    if (target_index === -1) return

    // Calculate scroll position
    let target_scroll_top = target_index * node_height

    if (source_instance_path) {
      const source_index = view.findIndex(n => n.instance_path === source_instance_path)
      if (source_index !== -1) {
        const source_scroll_top = source_index * node_height
        const current_scroll_top = container.scrollTop
        const source_visible_offset = source_scroll_top - current_scroll_top
        target_scroll_top = target_scroll_top - source_visible_offset
      }
    }

    container.scrollTop = target_scroll_top
  }

  /******************************************************************************
  HELPER FUNCTIONS
  ******************************************************************************/
  function get_highlighted_name (name, query) {
  // Creates a new regular expression.
  // `escape_regex(query)` sanitizes the query string to treat special regex characters literally.
  // `(...)` creates a capturing group for the escaped query.
  // 'gi' flags: 'g' for global (all occurrences), 'i' for case-insensitive.
    const regex = new RegExp(`(${escape_regex(query)})`, 'gi')
    // Replaces all matches of the regex in 'name' with the matched text wrapped in search-match class.
    // '$1' refers to the content of the first capturing group (the matched query).
    return name.replace(regex, '<span class="search-match">$1</span>')
  }

  function escape_regex (string) {
  // Escapes special regular expression characters in a string.
  // It replaces characters like -, /, \, ^, $, *, +, ?, ., (, ), |, [, ], {, }
  // with their escaped versions (e.g., '.' becomes '\.').
  // This prevents them from being interpreted as regex metacharacters.
    return string.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') // Corrected: should be \\$& to escape the found char
  }

  function check_and_reset_feedback_flags () {
    if (drive_updated_by_scroll && !ignore_drive_updated_by_scroll) {
      drive_updated_by_scroll = false
      return true
    } else ignore_drive_updated_by_scroll = false
    if (drive_updated_by_toggle) {
      drive_updated_by_toggle = false
      return true
    }
    if (drive_updated_by_search) {
      drive_updated_by_search = false
      return true
    }
    if (drive_updated_by_match) {
      drive_updated_by_match = false
      return true
    }
    if (drive_updated_by_tracking) {
      drive_updated_by_tracking = false
      return true
    }
    if (drive_updated_by_last_clicked) {
      drive_updated_by_last_clicked = false
      return true
    }
    if (drive_updated_by_undo) {
      drive_updated_by_undo = false
      return true
    }
    console.log('[SEARCH DEBUG] No feedback flags set, allowing onbatch')
    return false
  }

  function parse_json_data (data, path) {
    if (data === null) return null
    try {
      return typeof data === 'string' ? JSON.parse(data) : data
    } catch (e) {
      console.error(`Failed to parse JSON for ${path}:`, e)
      return null
    }
  }

  function process_path_array_update ({ current_paths, value, render_set, name }) {
    const old_paths = [...current_paths]
    const new_paths = Array.isArray(value)
      ? value
      : (console.warn(`${name} is not an array, defaulting to empty.`, value), [])
    ;[...new Set([...old_paths, ...new_paths])].forEach(p => render_set.add(p))
    return new_paths
  }

  function calculate_new_scroll_top ({ old_scroll_top, old_view, focal_path }) {
    // Calculate the new scroll position to maintain the user's viewport.
    if (focal_path) {
      // If an action was focused on a specific node (like a toggle), try to keep it in the same position.
      const old_idx = old_view.findIndex(n => n.instance_path === focal_path)
      const new_idx = view.findIndex(n => n.instance_path === focal_path)
      if (old_idx !== -1 && new_idx !== -1) {
        return old_scroll_top + (new_idx - old_idx) * node_height
      }
    } else if (old_view.length > 0) {
      // Otherwise, try to keep the topmost visible node in the same position.
      const old_top_idx = Math.floor(old_scroll_top / node_height)
      const old_top_node = old_view[old_top_idx]
      if (old_top_node) {
        const new_top_idx = view.findIndex(n => n.instance_path === old_top_node.instance_path)
        if (new_top_idx !== -1) {
          return new_top_idx * node_height + (old_scroll_top % node_height)
        }
      }
    }
    return old_scroll_top
  }

  function handle_spacer_element ({ hub_toggle, existing_height, new_scroll_top, sync_fn }) {
    if (hub_toggle || hub_num > 0) {
      spacer_element = document.createElement('div')
      spacer_element.className = 'spacer'
      container.appendChild(spacer_element)

      if (hub_toggle) {
        requestAnimationFrame(spacer_frames)
      } else {
        spacer_element.style.height = `${existing_height}px`
        requestAnimationFrame(sync_fn)
      }
    } else {
      spacer_element = null
      spacer_initial_height = 0
      requestAnimationFrame(sync_fn)
    }
    function spacer_frames () {
      const container_height = container.clientHeight
      const content_height = view.length * node_height
      const max_scroll_top = content_height - container_height

      if (new_scroll_top > max_scroll_top) {
        spacer_initial_height = new_scroll_top - max_scroll_top
        spacer_element.style.height = `${spacer_initial_height}px`
      }
      sync_fn()
    }
  }

  function create_root_node ({ state, has_subs, instance_path }) {
    // Handle the special case for the root node since its a bit different.
    const el = document.createElement('div')
    el.className = 'node type-root'
    el.dataset.instance_path = instance_path
    const prefix_class = has_subs || (mode === 'search' && search_query) ? 'prefix clickable' : 'prefix'
    const prefix_name = state.expanded_subs ? 'tee-down' : 'line-h'
    el.innerHTML = `<div class="wand clickable">🪄</div><span class="${prefix_class} ${prefix_name}"></span><span class="name ${(mode === 'search' && search_query) ? '' : 'clickable'}">/🌐</span>`

    el.querySelector('.wand').onclick = reset
    if (has_subs) {
      const prefix_el = el.querySelector('.prefix')
      if (prefix_el) {
        prefix_el.onclick = (mode === 'search' && search_query) ? null : () => toggle_subs(instance_path)
      }
    }
    el.querySelector('.name').onclick = ev => (mode === 'search' && search_query) ? null : select_node(ev, instance_path)
    return el
  }

  function create_confirm_checkbox (instance_path) {
    const checkbox_div = document.createElement('div')
    checkbox_div.className = 'confirm-wrapper'
    const is_confirmed = confirmed_instance_paths.includes(instance_path)
    checkbox_div.innerHTML = `<input type="checkbox" ${is_confirmed ? 'checked' : ''}>`
    const checkbox_input = checkbox_div.querySelector('input')
    if (checkbox_input) checkbox_input.onchange = ev => handle_confirm(ev, instance_path)
    return checkbox_div
  }

  function update_scroll_state ({ current_value, new_value, name }) {
    if (current_value !== new_value) {
      drive_updated_by_scroll = true // Set flag to prevent render loop.
      update_drive_state({ type: `runtime/${name}`, message: new_value })
      return new_value
    }
    return current_value
  }

  function remove_dom_nodes ({ count, start_el, next_prop, boundary_el }) {
    for (let i = 0; i < count; i++) {
      const temp = start_el[next_prop]
      if (temp && temp !== boundary_el) temp.remove()
      else break
    }
  }

  /******************************************************************************
  KEYBOARD NAVIGATION
    - Handles keyboard-based navigation for the graph explorer
    - Navigate up/down around last_clicked node
  ******************************************************************************/
  function handle_keyboard_navigation (event) {
    // Don't handle keyboard events if focus is on input elements
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return
    }
    const on_bind = {
      navigate_up_current_node,
      navigate_down_current_node,
      toggle_subs_for_current_node,
      toggle_hubs_for_current_node,
      multiselect_current_node,
      select_between_current_node,
      toggle_search_mode,
      jump_to_next_duplicate

    }
    let key_combination = ''
    if (event.ctrlKey) key_combination += 'Control+'
    if (event.altKey) key_combination += 'Alt+'
    if (event.shiftKey) key_combination += 'Shift+'
    key_combination += event.key

    const action = keybinds[key_combination] || keybinds[event.key]
    if (!action) return

    // Prevent default behavior for handled keys
    event.preventDefault()
    const base_path = last_clicked_node.split('|').pop()
    const current_instance_path = last_clicked_node
    // Execute the appropriate action
    on_bind[action]({ base_path, current_instance_path })
  }
  function navigate_up_current_node () {
    navigate_to_adjacent_node(-1)
  }
  function navigate_down_current_node () {
    navigate_to_adjacent_node(1)
  }
  function navigate_to_adjacent_node (direction) {
    if (view.length === 0) return
    if (!last_clicked_node) last_clicked_node = view[0].instance_path
    const current_index = view.findIndex(node => node.instance_path === last_clicked_node)
    if (current_index === -1) return

    const new_index = current_index + direction
    if (new_index < 0 || new_index >= view.length) return

    const new_node = view[new_index]
    last_clicked_node = new_node.instance_path
    drive_updated_by_last_clicked = true
    update_drive_state({ type: 'runtime/last_clicked_node', message: last_clicked_node })

    // Update visual styling
    if (mode === 'search' && search_query) {
      update_search_last_clicked_styling(last_clicked_node)
    } else {
      update_last_clicked_styling(last_clicked_node)
    }
    const base_path = last_clicked_node.split('|').pop()
    const has_duplicate_entries = has_duplicates(base_path)
    const is_first_occurrence = is_first_duplicate(base_path, last_clicked_node)
    if (has_duplicate_entries && !is_first_occurrence) {
      const el = shadow.querySelector(`[data-instance_path="${CSS.escape(last_clicked_node)}"]`)
      add_jump_button_to_matching_entry(el, base_path, last_clicked_node)
    }
    scroll_to_node(new_node.instance_path)
  }

  async function toggle_subs_for_current_node () {
    if (!last_clicked_node) return

    const base_path = last_clicked_node.split('|').pop()
    const entry = await db.get(base_path)
    const has_subs = Array.isArray(entry?.subs) && entry.subs.length > 0
    if (!has_subs) return

    if (hubs_flag === 'default') {
      const has_duplicate_entries = has_duplicates(base_path)
      const is_first_occurrence = is_first_duplicate(base_path, last_clicked_node)
      if (has_duplicate_entries && !is_first_occurrence) return
    }

    if (mode === 'search' && search_query) {
      await toggle_search_subs(last_clicked_node)
    } else {
      await toggle_subs(last_clicked_node)
    }
  }

  async function toggle_hubs_for_current_node () {
    if (!last_clicked_node) return

    const base_path = last_clicked_node.split('|').pop()
    const entry = await db.get(base_path)
    const has_hubs = hubs_flag === 'false' ? false : Array.isArray(entry?.hubs) && entry.hubs.length > 0
    if (!has_hubs || base_path === '/') return

    if (hubs_flag === 'default') {
      const has_duplicate_entries = has_duplicates(base_path)
      const is_first_occurrence = is_first_duplicate(base_path, last_clicked_node)

      if (has_duplicate_entries && !is_first_occurrence) return
    }

    if (mode === 'search' && search_query) {
      await toggle_search_hubs(last_clicked_node)
    } else {
      await toggle_hubs(last_clicked_node)
    }
  }

  function multiselect_current_node () {
    if (!last_clicked_node || selection_flag === false) return

    // IMPORTANT FIX!!!!! : synthetic event object for compatibility with existing functions
    const synthetic_event = { ctrlKey: true, metaKey: false, shiftKey: false }

    if (mode === 'search' && search_query) {
      search_select_node(synthetic_event, last_clicked_node)
    } else {
      select_node(synthetic_event, last_clicked_node)
    }
  }

  function select_between_current_node () {
    if (!last_clicked_node || selection_flag === false) return

    if (!select_between_enabled) {
      // Enable select between mode and set first node
      select_between_enabled = true
      select_between_first_node = last_clicked_node
      update_drive_state({ type: 'mode/select_between_enabled', message: true })
      render_menubar()
    } else {
      // Complete the select between operation
      const synthetic_event = { ctrlKey: false, metaKey: false, shiftKey: true }

      if (mode === 'search' && search_query) {
        search_select_node(synthetic_event, last_clicked_node)
      } else {
        select_node(synthetic_event, last_clicked_node)
      }
    }
  }

  function scroll_to_node (instance_path) {
    const node_index = view.findIndex(node => node.instance_path === instance_path)
    if (node_index === -1 || !node_height) return

    const target_scroll_top = node_index * node_height
    const container_height = container.clientHeight
    const current_scroll_top = container.scrollTop

    // Only scroll if the node is not fully visible
    if (target_scroll_top < current_scroll_top || target_scroll_top + node_height > current_scroll_top + container_height) {
      const centered_scroll_top = target_scroll_top - (container_height / 2) + (node_height / 2)
      container.scrollTop = Math.max(0, centered_scroll_top)

      vertical_scroll_value = container.scrollTop
      drive_updated_by_scroll = true
      update_drive_state({ type: 'runtime/vertical_scroll_value', message: vertical_scroll_value })
    }
  }

  function jump_to_next_duplicate ({ base_path, current_instance_path }) {
    if (hubs_flag === 'default') {
      cycle_to_next_duplicate(base_path, current_instance_path)
    }
  }

  /******************************************************************************
  UNDO FUNCTIONALITY
    - Implements undo functionality to revert drive state changes
  ******************************************************************************/
  async function undo (steps = 1) {
    if (undo_stack.length === 0) {
      console.warn('No actions to undo')
      return
    }

    const actions_to_undo = Math.min(steps, undo_stack.length)
    console.log(`Undoing ${actions_to_undo} action(s)`)

    // Pop the specified number of actions from the stack
    const snapshots_to_restore = []
    for (let i = 0; i < actions_to_undo; i++) {
      const snapshot = undo_stack.pop()
      if (snapshot) snapshots_to_restore.push(snapshot)
    }

    // Restore the last snapshot's state
    if (snapshots_to_restore.length > 0) {
      const snapshot = snapshots_to_restore[snapshots_to_restore.length - 1]

      try {
        // Restore the state WITHOUT setting drive_updated_by_undo flag
        // This allows onbatch to process the change and update the UI
        await drive.put(`${snapshot.type}.json`, snapshot.value)

        // Update the undo stack in drive (with flag to prevent tracking this update)
        // drive_updated_by_undo = true
        await drive.put('undo/stack.json', JSON.stringify(undo_stack))

        console.log(`Undo completed: restored ${snapshot.type} to previous state`)

        // Re-render menubar to update undo button count
        render_menubar()
      } catch (e) {
        console.error('Failed to undo action:', e)
      }
    }
  }
}

/******************************************************************************
  FALLBACK CONFIGURATION
    - This provides the default data and API configuration for the component,
      following the pattern described in `instructions.md`.
    - It defines the default datasets (`entries`, `style`, `runtime`) and their
      initial values.
  ******************************************************************************/
function fallback_module () {
  return {
    api: fallback_instance
  }
  function fallback_instance () {
    return {
      drive: {
        'style/': {
          'theme.css': {
            $ref: 'theme.css'
          }
        },
        'runtime/': {
          'node_height.json': { raw: '16' },
          'vertical_scroll_value.json': { raw: '0' },
          'horizontal_scroll_value.json': { raw: '0' },
          'selected_instance_paths.json': { raw: '[]' },
          'confirmed_selected.json': { raw: '[]' },
          'instance_states.json': { raw: '{}' },
          'search_entry_states.json': { raw: '{}' },
          'last_clicked_node.json': { raw: 'null' },
          'view_order_tracking.json': { raw: '{}' }
        },
        'mode/': {
          'current_mode.json': { raw: '"menubar"' },
          'previous_mode.json': { raw: '"menubar"' },
          'search_query.json': { raw: '""' },
          'multi_select_enabled.json': { raw: 'false' },
          'select_between_enabled.json': { raw: 'false' }
        },
        'flags/': {
          'hubs.json': { raw: '"default"' },
          'selection.json': { raw: 'true' },
          'recursive_collapse.json': { raw: 'true' }
        },
        'keybinds/': {
          'navigation.json': {
            raw: JSON.stringify({
              ArrowUp: 'navigate_up_current_node',
              ArrowDown: 'navigate_down_current_node',
              'Control+ArrowDown': 'toggle_subs_for_current_node',
              'Control+ArrowUp': 'toggle_hubs_for_current_node',
              'Alt+s': 'multiselect_current_node',
              'Alt+b': 'select_between_current_node',
              'Control+m': 'toggle_search_mode',
              'Alt+j': 'jump_to_next_duplicate'
            })
          }
        },
        'undo/': {
          'stack.json': { raw: '[]' }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/node_modules/graph-explorer/lib/graph_explorer.js")
},{"STATE":1}],3:[function(require,module,exports){
module.exports = require('ui_gallery')

},{"ui_gallery":29}],4:[function(require,module,exports){
(function (global){(function (){
// --- Main Export ---
// Usage: const docs = DOCS(__filename)(opts.sid)
//        docs.wrap(handler, docContent)
// Admin: Only first caller (root module) gets admin API

module.exports = function DOCS (filename) {
  return function (sid) { return create_context(filename, sid) }
}

const scope = typeof window !== 'undefined' ? window : global

if (!scope.__DOCS_GLOBAL_STATE__) {
  scope.__DOCS_GLOBAL_STATE__ = {
    docs_mode_active: false,
    docs_mode_listeners: [],
    doc_display_callback: null,
    action_registry: new Map()
  }
}

const state = scope.__DOCS_GLOBAL_STATE__

// --- Static Methods (called as DOCS.method()) ---
// Exported via DOCS admin API (only available to first caller)
function set_docs_mode (active) {
  state.docs_mode_active = active
  state.docs_mode_listeners.forEach(listener => listener(active))
}

function get_docs_mode () { return state.docs_mode_active }

function on_docs_mode_change (listener) {
  state.docs_mode_listeners.push(listener)
  return unsubscribe_docs_mode_change

  function unsubscribe_docs_mode_change () { state.docs_mode_listeners = state.docs_mode_listeners.filter(l => l !== listener) }
}

function set_doc_display_handler (callback) { state.doc_display_callback = callback }

function get_actions (sid) {
  const actions = state.action_registry.get(sid) || []
  if (actions.length === 0) throw new Error('DOCS: No actions registered for SID ' + sid)
  return actions
}

function list_registered () { return Array.from(state.action_registry.keys()) }

// --- Internal Helpers ---

function verify_actions (actions) {
  if (!Array.isArray(actions)) throw new Error('DOCS: Actions must be array')
  actions.forEach(validate_action)

  function validate_action (action, i) {
    if (!action.name || typeof action.name !== 'string') throw new Error(`DOCS: Action[${i}] Invalid 'name'`)
    if (!action.icon || typeof action.icon !== 'string') throw new Error(`DOCS: Action[${i}] Invalid 'icon'`)
    if (!action.status || typeof action.status !== 'object') throw new Error(`DOCS: Action[${i}] Invalid 'status'`)
    if (!action.steps || !Array.isArray(action.steps)) throw new Error(`DOCS: Action[${i}] Invalid 'steps'`)
  }
}

async function display_doc (content, sid) {
  let resolved_content = content
  if (typeof content === 'function') {
    resolved_content = await content()
  } else if (typeof content.then === 'function') {
    resolved_content = await content
  }

  if (state.doc_display_callback) {
    state.doc_display_callback({ content: resolved_content || 'No documentation available', sid })
  }
}

function create_sys_api (meta) {
  return {
    is_docs_mode: () => state.docs_mode_active,
    get_doc: () => meta.doc || 'No documentation available',
    get_meta: () => ({ ...meta }),
    show_doc: () => display_doc(meta.doc || 'No documentation available', meta.sid)
  }
}

// --- Instance Methods (called as docs.method()) ---

function wrap (handler, meta = {}, make_sys = create_sys_api) {
  const sys = make_sys(meta)

  return async function wrapped_handler (event) {
    if (sys.is_docs_mode()) {
      if (event.preventDefault) {
        event.preventDefault()
        event.stopPropagation()
      }
      sys.show_doc()
      return
    }
    return handler.call(this, event, sys)
  }
}

function wrap_isolated (handler_string, meta = {}) {
  try {
    const params = 'meta, make_sys'
    const source = `(${wrap.toString()})(${handler_string}, ${params})`
    const isolated_fn = new Function(params, source)(meta, create_sys_api)
    return isolated_fn
  } catch (err) {
    console.error('handler function is not allowed to access closure scope', err)
    return wrap(() => {}, meta)
  }
}

function hook (dom, meta = {}) {
  if (!dom) return dom

  const proto = Object.getPrototypeOf(Object.getPrototypeOf(dom))
  if (!proto) return dom

  Object.keys(proto).forEach(hook_event_handler)

  function hook_event_handler (key) {
    if (key.startsWith('on') && typeof dom[key] === 'function') {
      const original = dom[key]
      dom[key] = wrap(original, { ...meta, event_type: key })
    }
  }

  return dom
}

// --- Context Factory (creates instance with component scope) ---

function register_actions (sid, actions) {
  verify_actions(actions)
  state.action_registry.set(sid, actions)
}

let admin = true
function create_context (filename, sid) {
  const api = {
    wrap: wrap_with_component,
    wrap_isolated: wrap_isolated_with_component,
    hook: hook_with_component,
    get_docs_mode,
    on_docs_mode_change,
    register_actions: register_component_actions
  }
  const context = admin ? (admin = false, Object.assign({ admin: { set_docs_mode, set_doc_display_handler, get_actions, list_registered } }, api)) : api
  return context

  function wrap_with_component (handler, doc) { return wrap(handler, { doc, sid, component: filename }) }
  function wrap_isolated_with_component (handler_string, doc) { return wrap_isolated(handler_string, { doc, sid, component: filename }) }
  function hook_with_component (dom, doc) { return hook(dom, { doc, sid, component: filename }) }
  function register_component_actions (actions) { return register_actions(sid, actions) }
}

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],5:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const DOCS = require('DOCS')
const net = require('net_helper')

const quick_actions = require('quick_actions')

module.exports = action_bar

async function action_bar (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject,
    icons: iconject
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })

  shadow.innerHTML = `
  <div class="container">
    <div class="action-bar-container main">
      <div class="command-history">
        <button class="icon-btn"></button>
      </div>
      <div class="quick-actions">
        <quick-actions></quick-actions>
      </div>
    </div>
  </div>`
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]
  const history_icon = shadow.querySelector('.icon-btn')
  const quick_placeholder = shadow.querySelector('quick-actions')

  const { io, _ } = net(id)
  let console_icon = {}
  const docs = DOCS(__filename)(opts.sid)
  const subs = await sdb.watch(onbatch)

  let selected_action = null

  io.on = {
    up: onmessage,
    quick_actions: quick_actions_protocol
  }
  if (invite) io.accept(invite)

  history_icon.innerHTML = console_icon
  history_icon.onclick = docs.wrap(onhistory, get_doc_content)
  const element = await quick_actions({ ...subs[0] }, io.invite('quick_actions', { up: id }))
  quick_placeholder.replaceWith(element)

  const parent_handler = {
    load_actions,
    selected_action: parent_selected_action,
    show_submit_btn,
    hide_submit_btn,
    step_clicked: parent_step_clicked,
    update_quick_actions_for_app,
    update_quick_actions_input,
    action_submitted: parent__action_submitted,
    clean_up: parent__clean_up
  }

  return el

  async function get_doc_content () {
    const doc_file = await drive.get('docs/README.md')
    return doc_file.raw || 'No documentation available'
  }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func({ data, type })
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail ({ data, type }) { console.warn('Unknown message type:', type, data) }
  function inject ({ data }) { sheet.replaceSync(data[0]) }
  function iconject ({ data }) { console_icon = data[0] }

  async function onhistory () {
    _.up('console_history_toggle', null, {})
    // const head2 = [by, to, mid++]
    // _.up({ head: head2, refs, type: 'ui_focus', data: 'command_history' })
  }

  // -------------------------------
  // Protocol: quick actions
  // -------------------------------

  function quick_actions_protocol (msg) {
    const quick_handlers = {
      display_actions: quick_actions_display_actions,
      action_submitted: quick_actions_action_submitted,
      filter_actions: quick_actions_filter_actions,
      update_quick_actions_input,
      activate_steps_wizard: quick_actions_activate_steps_wizard,
      ui_focus_docs
    }

    const { type } = msg
    const handler = quick_handlers[type] || fail
    handler(msg)
  }

  function quick_actions_filter_actions (msg) { _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  function quick_actions_display_actions (msg) {
    const { data } = msg
    _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {})
    const display = typeof data === 'string' ? data : data.display
    const reason = typeof data === 'string' ? '' : data.reason
    const should_clean = display === 'none' && reason !== 'selected'
    if (should_clean) {
      _.up('clean_up', selected_action, msg.head ? { cause: msg.head } : {})
    }
  }

  function quick_actions_action_submitted (msg) {
    _.quick_actions('deactivate_input_field', { reason: 'completed' }, msg.head ? { cause: msg.head } : {})
    _.up('action_submitted', { selected_action }, msg.head ? { cause: msg.head } : {})
  }

  function onmessage (msg) {
    const { type } = msg
    if (type === 'docs_toggle') {
      _.quick_actions(type, msg.data, msg.head ? { cause: msg.head } : {})
    } else {
      const handler = parent_handler[type] || fail
      handler(msg)
    }
  }

  function load_actions (msg) {
    // const { data } = msg
  }
  function parent_selected_action (msg) {
    _.quick_actions(msg.type, msg.data, msg.head ? { cause: msg.head } : {})
  }
  function show_submit_btn (msg) { _.quick_actions('show_submit_btn', null, msg.head ? { cause: msg.head } : {}) }
  function hide_submit_btn (msg) { _.quick_actions('hide_submit_btn', null, msg.head ? { cause: msg.head } : {}) }

  function update_quick_actions_for_app (msg) {
    const { data, type } = msg
    _.quick_actions(type, data, msg.head ? { cause: msg.head } : {})
  }

  function update_quick_actions_input (msg) {
    const { data } = msg
    selected_action = data || null
    _.quick_actions('update_input_command', data, msg.head ? { cause: msg.head } : {})
  }

  function quick_actions_activate_steps_wizard (msg) { _.up('activate_steps_wizard', msg.data, msg.head ? { cause: msg.head } : {}) }

  function parent_step_clicked (msg) {
    const { data } = msg
    _.quick_actions('update_current_step', data, msg.head ? { cause: msg.head } : {})
    _.up('render_form', data, msg.head ? { cause: msg.head } : {})
  }

  function parent__action_submitted (msg) {
    _.quick_actions('deactivate_input_field', { reason: 'completed' }, msg.head ? { cause: msg.head } : {})
    _.up('action_submitted', msg.data, msg.head ? { cause: msg.head } : {})
  }

  function parent__clean_up (msg) {
    _.quick_actions('deactivate_input_field', { reason: 'cancel' }, msg.head ? { cause: msg.head } : {})
    _.up('clean_up', msg.data, msg.head ? { cause: msg.head } : {})
  }

  function ui_focus_docs (msg) { _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      quick_actions: { $: '' },
      DOCS: { $: '' },
      net_helper: { $: '' }
    }
  }
  function fallback_instance () {
    return {
      _: {
        quick_actions: {
          0: '',
          mapping: {
            style: 'style',
            icons: 'icons',
            actions: 'actions',
            hardcons: 'hardcons',
            prefs: 'prefs',
            docs: 'docs'
          }
        },
        DOCS: {
          0: ''
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'icons/': {
          'console.svg': {
            $ref: 'console.svg'
          }
        },
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        },
        'style/': {
          'theme.css': {
            raw: `
              .container {
                display: flex;
                flex-direction: column;
                width: 100%;
              }
              .action-bar-container {
                display: flex;
                flex-direction: row;
                flex-wrap: nowrap;
                align-items: center;
                background: #131315;
                padding: 8px;
                gap: 12px;
              }
              .command-history {
                display: flex;
                align-items: center;
              }
              .quick-actions {
                display: flex;
                flex: auto;
                flex-direction: row;
                flex-wrap: nowrap;
                align-items: center;
                min-width: 300px;
              }
              .hide {
                display: none;
              }
              
              .icon-btn {
                display: flex;
                min-width: 32px;
                height: 32px;
                border: none;
                background: transparent;
                cursor: pointer;
                flex-direction: row;
                justify-content: center;
                align-items: center;
                padding: 6px;
                border-radius: 6px;
                color: #a6a6a6;
              }
              .icon-btn:hover {
                background: rgba(255, 255, 255, 0.1);
              }
              svg {
                width: 20px;
                height: 20px;
              }
            `
          }
        },
        'actions/': {},
        'hardcons/': {},
        'prefs/': {},
        'variables/': {}
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/action_bar/action_bar.js")
},{"DOCS":4,"STATE":1,"net_helper":17,"quick_actions":20}],6:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const net = require('net_helper')

const program = require('program')
const steps_wizard = require('steps_wizard')

const { form_input, input_test, form_tile_split_choice } = program

const component_modules = {
  form_input,
  input_test,
  form_tile_split_choice
  // Add more form input components here if needed
}

module.exports = action_executor

async function action_executor (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="container main">
    <program></program>
    <form-input></form-input>
    <steps-wizard></steps-wizard>
  </div>`

  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]
  const program_placeholder = shadow.querySelector('program')
  const form_input_placeholder = shadow.querySelector('form-input')
  const steps_wizard_placeholder = shadow.querySelector('steps-wizard')
  const { io, _ } = net(id)

  const subs = await sdb.watch(onbatch)

  let all_data = null
  let selected_action = null

  io.on = {
    up: onmessage,
    program: program_protocol,
    steps_wizard: steps_wizard_protocol
  }

  // dynamic form input component SIDs
  for (const [component_name] of Object.entries(component_modules)) {
    // const final_index = index + 2
    io.on[component_name] = form_input_protocol(component_name)
  }
  if (invite) io.accept(invite)

  const program_el = await program({ ...subs[0] }, io.invite('program', { up: id }))
  program_el.classList.add('program-bar', 'hide')
  program_placeholder.replaceWith(program_el)

  const steps_wizard_el = await steps_wizard({ ...subs[1] }, io.invite('steps_wizard', { up: id }))
  steps_wizard_el.classList.add('steps-wizard-bar', 'hide')
  steps_wizard_placeholder.replaceWith(steps_wizard_el)

  const form_input_elements = {}

  for (const [index, [component_name, component_fn]] of Object.entries(component_modules).entries()) {
    const final_index = index + 2
    const sub_entry = subs[final_index] || { sid: opts.sid }
    const element = await component_fn({ ...sub_entry }, io.invite(component_name, { up: id }))
    element.classList.add('form-inputs', 'hide')
    form_input_elements[component_name] = element
    form_input_placeholder.parentNode.insertBefore(element, form_input_placeholder)
  }

  form_input_placeholder.remove()

  const parent_handler = {
    update_steps_wizard_for_app,
    load_actions,
    action_submitted,
    update_data,
    activate_steps_wizard,
    form_data,
    render_form,
    selected_action: parent_selected_action,
    clean_up
  }

  return el

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }
  function fail (data, type) { console.warn('Unknown message type:', type, data) }
  function inject (data) { sheet.replaceSync(data[0]) }

  // --- Toggle Views ---
  function toggle_view (el, show) { el.classList.toggle('hide', !show) }
  function steps_toggle_view (display) { toggle_view(steps_wizard_el, display === 'block') }

  function render_form_component (component_name) {
    for (const name in form_input_elements) {
      toggle_view(form_input_elements[name], name === component_name)
    }
  }

  function hide_all_forms () {
    for (const name in form_input_elements) {
      toggle_view(form_input_elements[name], false)
    }
  }

  // -------------------------------
  // Protocol: program
  // -------------------------------

  function program_protocol (msg) {
    const program_handlers = {
      load_actions: program_load_actions
    }
    const { type, data } = msg
    const handler = program_handlers[type] || fail
    handler(data, type, msg)
  }

  function program_load_actions (data, type, msg) {
    _.up(type, data, msg.head ? { cause: msg.head } : {})
  }

  // -------------------------------
  // Protocol: steps wizard
  // -------------------------------

  function steps_wizard_protocol (msg) {
    const steps_handlers = {
      step_clicked: steps_wizard_step_clicked
    }

    const { type } = msg
    const handler = steps_handlers[type]
    if (handler) handler(msg)
    else _.up(type, msg.data, msg.head ? { cause: msg.head } : {})
  }

  function steps_wizard_step_clicked (msg) {
    const { data } = msg
    const refs = msg.head ? { cause: msg.head } : {}
    _.up('step_clicked', data, refs)

    if (should_execute_step(data)) {
      _.up('execute_step', {
        action: selected_action,
        step: data,
        commands: data.commands
      }, refs)
    }

    function should_execute_step (step_data) {
      return step_data && Array.isArray(step_data.commands) && step_data.commands.length > 0
    }
  }

  // -------------------------------
  // Protocol: form input
  // -------------------------------

  function form_input_protocol (component_name) {
    return on

    function on (msg) {
      const form_input_handlers = {
        action_submitted: form_action_submitted,
        action_incomplete: form_action_incomplete,
        action_complete: form__action_complete
      }
      const { type, data } = msg
      const handler = form_input_handlers[type] || fail
      handler(data, type, msg)
    }
  }

  function form_action_submitted (data, type, msg) {
    console.error('action_executor: form_action_submitted', data, 'selected_action:', selected_action)
    const step = selected_action.steps[data?.index]
    Object.assign(step, {
      is_completed: true,
      status: 'completed',
      data: data.value
    })
    console.error('action_executor: step updated', step)

    const refs = msg.head ? { cause: msg.head } : {}
    _.program('update_data', all_data, refs)
    _.steps_wizard('init_data', selected_action.steps, refs)

    if (selected_action.steps[selected_action.steps.length - 1]?.is_completed) {
      _.up('show_submit_btn', null, refs)
    }
  }

  function form_action_incomplete (data, type, msg) {
    console.error('action_executor: form_action_incomplete', data)
    const step = selected_action.steps[data?.index]

    if (!step.is_completed) return

    Object.assign(step, {
      is_completed: false,
      status: 'error',
      data: data.value !== undefined ? data.value : undefined
    })
    const refs = msg.head ? { cause: msg.head } : {}
    _.program('update_data', all_data, refs)
    _.steps_wizard('init_data', selected_action.steps, refs)
    _.up('hide_submit_btn', null, refs)
  }

  function form__action_complete (data, type, msg) {
    console.error('action_executor: form__action_complete', data, 'selected_action:', selected_action)
    if (!selected_action || !selected_action.steps) {
      console.error('action_executor: no selected_action or steps')
      return
    }

    const all_mandatory_complete = selected_action.steps.every(is_step_complete_or_optional)
    console.error('action_executor: all_mandatory_complete:', all_mandatory_complete)

    if (all_mandatory_complete) {
      hide_all_forms()
      _.up('action_auto_completed', { selected_action, trigger: 'form' }, msg.head ? { cause: msg.head } : {})
    }

    function is_step_complete_or_optional (step) {
      return step.is_completed || step.type === 'optional'
    }
  }

  // -------------------------------
  // onmessage from parent
  // -------------------------------

  function onmessage (msg) {
    const { type } = msg
    if (type === 'docs_toggle') {
      _.steps_wizard(type, msg.data, msg.head ? { cause: msg.head } : {})
      for (const name in component_modules) {
        _[name](type, msg.data, msg.head ? { cause: msg.head } : {})
      }
    } else {
      parent_handler[type](msg)
    }
  }

  function update_steps_wizard_for_app (msg) {
    const { data } = msg
    all_data = data
  }

  function load_actions (msg) {
    _.program(msg.type, msg.data, msg.head ? { cause: msg.head } : {})
  }

  function action_submitted (msg) {
    const { data } = msg
    data.result = JSON.stringify(selected_action.steps.map(step => step.data), null, 2)

    reset_selected_action_steps()
    _.program('display_result', data, msg.head ? { cause: msg.head } : {})
  }

  function reset_selected_action_steps () {
    if (!selected_action?.steps) return

    selected_action.steps.forEach(step => {
      step.data = ''
      step.is_completed = false
    })
  }

  function render_form (msg) {
    const { data } = msg
    render_form_component(data.component)
    const send = _[data.component]
    if (send) {
      send('step_data', data, msg.head ? { cause: msg.head } : {})
    }
  }

  function parent_selected_action (msg) { selected_action = msg.data }

  function update_data (msg) {
    const { data: msg_data, type } = msg
    _.program(type, msg_data, msg.head ? { cause: msg.head } : {})
  }

  function activate_steps_wizard (msg) {
    if (!all_data) return
    const steps_data = all_data.find(matches_selected_action)
    selected_action = steps_data
    if (!steps_data) return
    steps_toggle_view('block')
    const data = steps_data.steps
    _.steps_wizard('init_data', data, msg.head ? { cause: msg.head } : {})

    function matches_selected_action (action) { return action.name === msg.data }
  }

  function form_data (msg) {
    // forward init_data to steps_wizard with current action steps
    _.steps_wizard('init_data', msg.data, msg.head ? { cause: msg.head } : {})
  }

  function clean_up (msg) {
    steps_toggle_view('none')
    for (const el of Object.values(form_input_elements)) {
      toggle_view(el, false)
    }
  }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      program: { $: '' },
      steps_wizard: { $: '' },
      net_helper: { $: '' }
    }
  }
  function fallback_instance () {
    return {
      _: {
        program: {
          0: '',
          mapping: {
            style: 'style',
            variables: 'variables',
            docs: 'docs'
          }
        },
        steps_wizard: {
          0: '',
          mapping: {
            style: 'style',
            variables: 'variables',
            docs: 'docs'
          }
        },
        'program>form_input': {
          0: '',
          mapping: {
            style: 'style',
            data: 'data',
            docs: 'docs'
          }
        },
        'program>input_test': {
          0: '',
          mapping: {
            style: 'style',
            data: 'data',
            docs: 'docs'
          }
        },
        'program>form_tile_split_choice': {
          0: '',
          mapping: {
            style: 'style',
            data: 'data',
            docs: 'docs'
          },
          DOCS: {
            0: ''
          }
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'style/': {
          'action_executor.css': {
            raw: `
              .container {
                display: flex;
                flex-direction: column;
                width: 100%;
              }
              .program-bar {
                display: flex;
              }
              .form-inputs {
                display: flex;
              }
              .steps-wizard-bar {
                display: flex;
              }
              .hide {
                display: none;
              }
            `
          }
        },
        'variables/': {},
        'data/': {},
        'docs/': {}
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/action_executor/action_executor.js")
},{"STATE":1,"net_helper":17,"program":18,"steps_wizard":22}],7:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const DOCS = require('DOCS')
const net = require('net_helper')

module.exports = actions

async function actions (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject,
    actions: onactions,
    icons: iconject,
    hardcons: onhardcons
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })

  shadow.innerHTML = `
  <div class="actions-container main">
    <div class="actions-menu"></div>
  </div>`
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]
  const actions_menu = shadow.querySelector('.actions-menu')

  let init = false
  let actions = []
  let icons = {}
  let hardcons = {}
  const docs = DOCS(__filename)(opts.sid)
  const on_message = {
    filter_actions: handle_filter_actions,
    send_selected_action: handle_send_selected_action,
    load_actions: handle_load_actions_message,
    update_actions_for_app: handle_update_actions_for_app_message
  }
  const { io, _ } = net(id)

  await sdb.watch(onbatch)
  io.on = {
    up: onmessage
  }
  if (invite) io.accept(invite)

  return el

  function onmessage (msg) {
    const handler = on_message[msg.type] || onmessage_fail
    handler(msg)
  }

  function handle_filter_actions (msg) { filter(msg.data) }
  function handle_send_selected_action (msg) { send_selected_action(msg) }
  function handle_load_actions_message (msg) { handle_load_actions(msg.data) }
  function handle_update_actions_for_app_message (msg) { update_actions_for_app(msg.data) }
  function onmessage_fail (msg) { fail(msg.data, msg.type) }
  function handle_load_actions (data) {
    const converted_actions = Object.keys(data).map(convert_action_key)
    actions = converted_actions
    create_actions_menu()

    function convert_action_key (action_key) {
      return {
        action: action_key,
        pinned: false,
        default: true,
        icon: 'file'
      }
    }
  }

  function send_selected_action (msg) {
    const action_data = msg.data.data || msg.data
    _.up('selected_action', action_data, msg.head ? { cause: msg.head } : {})
  }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }
    if (!init) {
      create_actions_menu()
      init = true
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail (data, type) { console.warn('invalid message', { cause: { data, type } }) }

  function inject (data) { sheet.replaceSync(data[0]) }
  function iconject (data) { icons = data }

  function onhardcons (data) {
    console.log('Hardcons data:', opts.sid, data)
    hardcons = {
      pin: data[0],
      unpin: data[1],
      default: data[2],
      undefault: data[3]
    }
  }

  function onactions (data) {
    const vars = typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]
    actions = vars
    create_actions_menu()
  }

  function create_actions_menu () {
    actions_menu.replaceChildren()
    actions.forEach(create_action_item)
  }

  function create_action_item (action_data, index) {
    const action_item = document.createElement('div')
    action_item.classList.add('action-item')

    const this_icon = icons[index] || icons[0]
    action_item.innerHTML = `
    <div class="action-icon">${this_icon}</div>
    <div class="action-name">${action_data.action}</div>
    <div class="action-pin">${action_data.pin ? hardcons.pin : hardcons.unpin}</div>
    <div class="action-default">${action_data.default ? hardcons.default : hardcons.undefault}</div>`
    action_item.onclick = docs.wrap(on_action_item_click, get_doc_content)
    actions_menu.appendChild(action_item)

    function on_action_item_click () { send_selected_action({ data: action_data.action }) }
    async function get_doc_content () {
      const doc_file = await drive.get('docs/README.md')
      return doc_file.raw || 'No documentation available'
    }
  }

  function filter (search_term) {
    const items = shadow.querySelectorAll('.action-item')
    items.forEach(update_item_visibility)

    function update_item_visibility (item) {
      const action_name = item.children[1].textContent.toLowerCase()
      const matches = action_name.includes(search_term.toLowerCase())
      item.style.display = matches ? 'flex' : 'none'
    }
  }

  async function update_actions_for_app (data) {
    if (data) {
      drive.put('actions/commands.json', data)
    }
  }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      DOCS: {
        $: ''
      },
      net_helper: {
        $: ''
      }
    }
  }

  function fallback_instance () {
    return {
      _: {
        DOCS: {
          0: ''
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'actions/': {
          'commands.json': {
            raw: JSON.stringify([])
          }
        },
        'icons/': {
          'file.svg': {
            $ref: 'icon.svg'
          },
          'folder.svg': {
            $ref: 'icon.svg'
          },
          'save.svg': {
            $ref: 'icon.svg'
          },
          'gear.svg': {
            $ref: 'icon.svg'
          },
          'help.svg': {
            $ref: 'icon.svg'
          },
          'terminal.svg': {
            $ref: 'icon.svg'
          },
          'search.svg': {
            $ref: 'icon.svg'
          }
        },
        'hardcons/': {
          'pin.svg': {
            $ref: 'pin.svg'
          },
          'unpin.svg': {
            $ref: 'unpin.svg'
          },
          'default.svg': {
            $ref: 'default.svg'
          },
          'undefault.svg': {
            $ref: 'undefault.svg'
          }
        },
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        },
        'style/': {
          'theme.css': {
            raw: `
              .actions-container {
                position: relative;
                background: #202124;
                border: 1px solid #3c3c3c;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                height: auto;
                max-height: 100%;
                min-height: 0;
                width: 100%;
                overflow-y: auto;
                color: #e8eaed;
              }
              
              .actions-menu {
                padding: 8px 0;
              }
              
              .action-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 8px 16px;
                cursor: pointer;
                border-bottom: 1px solid #3c3c3c;
                transition: background-color 0.2s ease;
              }
              
              .action-item:hover {
                background-color: #2d2f31;
              }
              
              .action-item:last-child {
                border-bottom: none;
              }
              
              .action-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                color: #a6a6a6;
              }
              
              .action-name {
                flex: 1;
                font-size: 14px;
                color: #e8eaed;
              }
              
              .action-pin .action-default{
                display: flex;
                align-items: center;
                justify-content: center;
                width: 16px;
                height: 16px;
                font-size: 12px;
                opacity: 0.7;
                color: #a6a6a6;
              }
              
              svg {
                width: 16px;
                height: 16px;
              }
            `
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/actions/actions.js")
},{"DOCS":4,"STATE":1,"net_helper":17}],8:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const DOCS = require('DOCS')
const net = require('net_helper')

module.exports = console_history

async function console_history (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject,
    commands: oncommands,
    icons: iconject
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="console-history-container main">
    <div class="console-menu">
      <console-commands></console-commands>
    </div>
  </div>`
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]
  const commands_placeholder = shadow.querySelector('console-commands')

  let init = false
  let commands = []
  let dricons = []
  const docs = DOCS(__filename)(opts.sid)
  const { io, _ } = net(id)

  // Register actions with DOCS system
  const actions_file = await drive.get('actions/commands.json')
  if (actions_file.raw) {
    const actions_data = typeof actions_file.raw === 'string' ? JSON.parse(actions_file.raw) : actions_file.raw
    docs.register_actions(actions_data)
  } else {
    console.error('actions.json not found')
  }

  await sdb.watch(onbatch)
  io.on = {
    up: onmessage
  }
  if (invite) io.accept(invite)
  return el

  function onmessage (msg) {
    // Temp placeholder
  }

  function create_command_item (command_data) {
    const command_el = document.createElement('div')
    command_el.className = 'command-item'

    const icon_html = dricons[command_data.icon_type] || ''
    const linked_icon_html = command_data.linked.is ? (dricons[command_data.linked.icon_type] || '') : ''

    let action_html = ''
    action_html += command_data.can_restore ? '<div class="action-icon">' + (dricons.restore || '') + '</div>' : ''
    action_html += command_data.can_delete ? '<div class="action-icon">' + (dricons.delete || '') + '</div>' : ''
    action_html += command_data.action ? '<div class="action-text">' + command_data.action + '</div>' : ''

    command_el.innerHTML = `
    <div class="command-content">
    <div class="command-icon">${icon_html}</div>
    <div class="command-info">
      <div class="command-path">${command_data.name_path}</div>
    </div>
    ${command_data.linked.is
    ? `<div class="linked-info">
          <span class="command-separator">---&gt;</span>
          <div class="linked-icon">${linked_icon_html}</div>
          <div class="linked-name">${command_data.linked.name}</div>
        </div>`
    : ''}
      ${action_html
    ? `<div class="command-actions">${action_html}</div>`
    : ''}
        <div class="command-name">${command_data.command}</div>
      </div>`

    command_el.onclick = docs.wrap(on_command_click, get_doc_content)

    async function on_command_click () {
      const data = {
        type: 'command_history',
        sid: opts.sid
      }
      _.up('ui_focus', data, {})
      _.up('command_clicked', command_data, {})
    }

    async function get_doc_content () {
      const doc_file = await drive.get('docs/README.md')
      return doc_file.raw || 'No documentation available'
    }

    return command_el
  }
  function render_commands () {
    const commands_container = document.createElement('div')
    commands_container.className = 'commands-list'

    commands.forEach(append_command_item)

    function append_command_item (command, index) {
      const command_item = create_command_item(command, index)
      commands_container.appendChild(command_item)
    }

    commands_placeholder.replaceWith(commands_container)
    init = true
  }
  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }
    if (!init && commands.length > 0) {
      render_commands()
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail (data, type) { console.warn('invalid message', { cause: { data, type } }) }

  function inject (data) { sheet.replaceSync(data[0]) }
  function oncommands (data) {
    const commands_data = typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]
    commands = commands_data
  }

  function iconject (data) {
    dricons = {
      file: data[0] || '',
      bulb: data[1] || '',
      restore: data[2] || '',
      delete: data[3] || ''
    }
  }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      DOCS: {
        $: ''
      },
      net_helper: {
        $: ''
      }
    }
  }

  function fallback_instance () {
    return {
      _: {
        DOCS: {
          0: ''
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'commands/': {
          'list.json': {
            $ref: 'commands.json'
          }
        },
        'actions/': {
          'commands.json': {
            raw: JSON.stringify([
              {
                name: 'Clear History',
                icon: 'trash',
                status: {
                  pinned: false,
                  default: true
                },
                steps: [
                  { name: 'Confirm Clear', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' }
                ]
              },
              {
                name: 'Export History',
                icon: 'download',
                status: {
                  pinned: true,
                  default: false
                },
                steps: [
                  { name: 'Choose Format', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' },
                  { name: 'Select Location', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' }
                ]
              },
              {
                name: 'Search History',
                icon: 'search',
                status: {
                  pinned: false,
                  default: true
                },
                steps: [
                  { name: 'Enter Search Term', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' }
                ]
              }
            ])
          }
        },
        'icons/': {
          'file.svg': {
            raw: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9.5 1H3.5C3.10218 1 2.72064 1.15804 2.43934 1.43934C2.15804 1.72064 2 2.10218 2 2.5V13.5C2 13.8978 2.15804 14.2794 2.43934 14.5607C2.72064 14.8420 3.10218 15 3.5 15H12.5C12.8978 15 13.2794 14.8420 13.5607 14.5607C13.8420 14.2794 14 13.8978 14 13.5V5.5L9.5 1Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M9.5 1V5.5H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`
          },
          'bulb.svg': {
            raw: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 1C6.4087 1 4.88258 1.63214 3.75736 2.75736C2.63214 3.88258 2 5.4087 2 7C2 8.5913 2.63214 10.1174 3.75736 11.2426C4.88258 12.3679 6.4087 13 8 13C9.5913 13 11.1174 12.3679 12.2426 11.2426C13.3679 10.1174 14 8.5913 14 7C14 5.4087 13.3679 3.88258 12.2426 2.75736C11.1174 1.63214 9.5913 1 8 1Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M6.5 14H9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`
          },
          'restore.svg': {
            raw: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-counterclockwise" viewBox="0 0 16 16">
              <path fill-rule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/>
              <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/>
            </svg>`
          },
          'delete.svg': {
            raw: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16">
              <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Zm1.958 1-.846 10.58a1 1 0 0 1-.997.92H4.885a1 1 0 0 1-.997-.92L3.042 3.5h9.916Zm-7.487 1a.5.5 0 0 1 .528.47l.5 8.5a.5.5 0 0 1-.998.06L5 5.03a.5.5 0 0 1 .47-.528ZM8 4.5a.5.5 0 0 1 .5.5v8.5a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5Zm2.522.47a.5.5 0 0 1 .528.47l-.5 8.5a.5.5 0 1 1-.998-.06l.5-8.5a.5.5 0 0 1 .47-.528Z"/>
            </svg>`
          }
        },
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        },
        'style/': {
          'theme.css': {
            raw: `
              .console-history-container {
                position: relative;
                width: 100%; /* Or a specific width based on images */
                background: #202124;
                border: 1px solid #3c3c3c;
                Set box-sizing property to border-box:
                box-sizing: border-box;
                -moz-box-sizing: border-box;
                -webkit-box-sizing: border-box;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                z-index: 1;
                max-height: 400px;
                overflow-y: auto;
                color: #e8eaed;
              }

              .console-menu {
                padding: 0px;
              }

              .commands-list {
                display: flex;
                flex-direction: column;
                gap: 0px;
              }

              .command-item {
                display: flex;
                align-items: center;
                padding: 10px 16px;
                background: transparent;
                border-bottom: 1px solid #3c3c3c;
                cursor: pointer;
                transition: background-color 0.2s ease;
              }

              .command-item:last-child {
                border-bottom: none;
              }

              .command-item:hover {
                background: #282a2d;
              }

              .command-content {
                display: flex;
                align-items: center;
                width: 100%;
                gap: 10px; /* Adjusted gap */
              }

              .command-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                color: #969ba1;
              }

              .command-icon svg {
                width: 16px;
                height: 16px;
              }

              .command-info {
                display: flex; /* Use flex to align name and path */
                align-items: center; /* Vertically align items if they wrap */
                gap: 8px; /* Gap between name and path */
                min-width: 0; /* Prevent overflow issues with flex items */
              }

              .command-name {
                font-size: 13px;
                font-weight: 400;
                color: #e8eaed;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }

              .command-path {
                font-size: 13px;
                color: #969ba1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              
              .command-separator {
                color: #969ba1;
                margin: 0 4px;
                font-size: 13px;
              }

              .linked-info {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-grow: 1; /* Allow info to take available space */

              }

              .linked-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 16px;
                height: 16px;
                color: #fbbc04; 
              }

              .linked-icon svg {
                width: 14px;
                height: 14px;
              }

              .linked-name {
                font-size: 13px;
                color: #fbbc04;
                font-weight: 400;
                white-space: nowrap;
              }

              .command-actions {
                display: flex;
                align-items: center;
                gap: 10px; /* Adjusted gap */
                margin-left: auto; /* Pushes actions to the right */
              }

              .action-text {
                font-size: 13px;
                color: #969ba1;
                white-space: nowrap;
              }

              .action-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                color: #969ba1;
                cursor: pointer;
              }

              .action-icon:hover {
                color: #e8eaed;
              }

              .action-icon svg {
                width: 16px;
                height: 16px;
              }
            `
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/console_history/console_history.js")
},{"DOCS":4,"STATE":1,"net_helper":17}],9:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const net = require('net_helper')

module.exports = docs_window

async function docs_window (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject
  }

  const { io, _ } = net(id)
  io.on = {
    up: onmessage
  }
  if (invite) io.accept(invite)

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="docs-window main">
    <button class="close-btn">✕</button>
    <div class="docs-content">
      <pre class="docs-text">No documentation available</pre>
    </div>
  </div>`

  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]
  const close_btn = shadow.querySelector('.close-btn')
  const docs_text = shadow.querySelector('.docs-text')

  close_btn.onclick = onclose

  await sdb.watch(onbatch)

  return el

  function onclose () {
    _.up('close_docs', null, {})
  }

  function onmessage (msg) {
    const { type, data } = msg
    if (type === 'display_doc') {
      display_content(data)
    }
  }

  function display_content (data) {
    const content = data.content || undefined
    docs_text.textContent = content || 'No documentation available'
  }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail (data, type) { console.warn('invalid message', { cause: { data, type } }) }

  function inject (data) { sheet.replaceSync(data[0]) }
}

function fallback_module () {
  return {
    _: {
      net_helper: {
        $: ''
      }
    },
    api: fallback_instance
  }

  function fallback_instance () {
    return {
      _: {
        net_helper: {
          0: ''
        }
      },
      drive: {
        'style/': {
          'theme.css': {
            raw: `
              .docs-window {
                position: relative;
                background: #1e1e2e;
                border: 1px solid #3c3c3c;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                color: #e8eaed;
                overflow: hidden;
                display: flex;
                justify-content: space-between;
                flex-direction: row-reverse;
                flex-wrap: nowrap;
                align-items: flex-start;
              }
              .close-btn {
                background: transparent;
                border: none;
                color: #a6a6a6;
                cursor: pointer;
                font-size: 16px;
                padding: 4px 8px;
                border-radius: 4px;
                transition: background 0.2s, color 0.2s;
              }
              .close-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #e8eaed;
              }
              .docs-content {
                padding: 16px;
                max-height: 200px;
                overflow-y: auto;
              }
              .docs-text {
                font-size: 13px;
                line-height: 1.6;
                color: #c9d1d9;
                margin: 0;
                white-space: pre-wrap;
                word-wrap: break-word;
              }
            `
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/docs_window/docs_window.js")
},{"STATE":1,"net_helper":17}],10:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const DOCS = require('DOCS')
const net = require('net_helper')

module.exports = form_input
async function form_input (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject,
    data: ondata
  }

  let current_step = null
  let input_accessible = true

  const { io, _ } = net(id)
  io.on = {
    up: onmessage
  }
  if (invite) io.accept(invite)

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="input-display">
    <div class='test'>
      <input class="input-field" type="text" placeholder="Type to submit">
    </div>
    <div class="overlay-lock" hidden></div>
  </div>`
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]

  const input_field_el = shadow.querySelector('.input-field')
  const overlay_el = shadow.querySelector('.overlay-lock')

  input_field_el.oninput = on_input_field_input

  async function on_input_field_input () {
    if (!input_accessible) return
    await drive.put('data/form_input.json', {
      input_field: input_field_el.value
    })
    if (input_field_el.value.length >= 10) {
      _.up('action_submitted', {
        value: input_field_el.value,
        index: current_step.index !== undefined ? current_step.index : 0
      }, {})
      console.log('mark_as_complete')
    } else {
      _.up('action_incomplete', {
        value: input_field_el.value,
        index: current_step.index !== undefined ? current_step.index : 0
      }, {})
    }
  }

  await sdb.watch(onbatch)
  const parent_handler = {
    step_data,
    reset_data
  }

  return el

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail (data, type) { console.warn('invalid message', { cause: { data, type } }) }

  function inject (data) { sheet.replaceSync(data[0]) }

  function ondata (data) {
    if (data.length > 0) {
      const input_data = data[0]
      if (input_data.input_field) {
        input_field_el.value = input_data.input_field
      }
    } else {
      input_field_el.value = ''
    }
  }

  function onmessage ({ type, data }) {
    console.log('message from form_input', type, data)
    const handler = parent_handler[type] || fail
    handler(data, type)
  }

  function step_data (data, type) {
    current_step = data
    input_field_el.value = data?.data

    input_accessible = data.is_accessible !== false

    overlay_el.hidden = input_accessible

    input_field_el.placeholder = input_accessible
      ? 'Type to submit'
      : 'Input disabled for this step'
  }

  function reset_data (data, type) {
    input_field_el.value = ''
    drive.put('data/form_input.json', {
      input_field: ''
    })
  }
}
function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      DOCS: {
        $: ''
      },
      net_helper: {
        $: ''
      }
    }
  }
  function fallback_instance () {
    return {
      _: {
        DOCS: {
          0: ''
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'style/': {
          'theme.css': {
            raw: `
            .input-display {
              background: #131315;
              border-radius: 16px;
              border: 1px solid #3c3c3c;
              display: flex;
              flex: 1;
              align-items: center;
              padding: 0 12px;
              min-height: 32px;
              position: relative;
            }
            .input-display:focus-within {
              border-color: #4285f4;
              background: #1a1a1c;
            }
            .input-field {
              flex: 1;
              min-height: 32px;
              background: transparent;
              border: none;
              color: #e8eaed;
              padding: 0 12px;
              font-size: 14px;
              outline: none;
            }
            .input-field::placeholder {
              color: #a6a6a6;
            }
            .overlay-lock {
              position: absolute;
              inset: 0;
              background: transparent;
              z-index: 10;
              cursor: not-allowed;
            }`
          }
        },
        'data/': {
          'form_input.json': {
            raw: {
              input_field: ''
            }
          }
        },
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/form_input/form_input.js")
},{"DOCS":4,"STATE":1,"net_helper":17}],11:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const DOCS = require('DOCS')
const net = require('net_helper')

module.exports = form_tile_split_choice
async function form_tile_split_choice (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject,
    data: ondata
  }

  let current_step = null
  const { io, _ } = net(id)

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="tile-split-chooser">
    <div class="title">Split Tile</div>
    <div class="choices">
      <button class="choice-btn" data-choice="up">
        <span class="arrow up"></span>
        <span class="label">Up</span>
      </button>
      <button class="choice-btn" data-choice="left">
        <span class="arrow left"></span>
        <span class="label">Left</span>
      </button>
      <button class="choice-btn" data-choice="right">
        <span class="arrow right"></span>
        <span class="label">Right</span>
      </button>
      <button class="choice-btn" data-choice="down">
        <span class="arrow down"></span>
        <span class="label">Down</span>
      </button>
    </div>
    <div class="hint">Choose direction to split the tile</div>
  </div>
  <style></style>
  `
  const style = shadow.querySelector('style')
  const buttons = Array.from(shadow.querySelectorAll('.choice-btn'))

  buttons.forEach(btn => btn.addEventListener('click', on_choice_click))

  await sdb.watch(onbatch)

  const parent_handler = {
    step_data,
    reset_data
  }

  io.on = {
    up: onmessage
  }
  if (invite) io.accept(invite)

  return el

  function onmessage ({ type, data }) {
    const handler = parent_handler[type] || fail
    handler(data, type)
  }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail (data, type) { console.warn('invalid message', { cause: { data, type } }) }

  function inject (data) {
    style.replaceChildren(create_style_element())

    function create_style_element () {
      const style_el = document.createElement('style')
      style_el.textContent = data[0]
      return style_el
    }
  }

  function ondata (data) {
    // support persisted/default choice if present
    if (data.length > 0 && data[0] && data[0].choice) {
      highlight_choice(String(data[0].choice))
    }
  }

  function step_data (data) {
    current_step = data
  }

  function reset_data () {
    // nothing for now
  }

  async function on_choice_click (ev) {
    const choice = ev.currentTarget.getAttribute('data-choice')
    await drive.put('data/form_tile_split_choice.json', { choice })
    highlight_choice(choice)
    _.up('action_submitted', { value: choice, index: current_step?.index ?? 0 }, {})

    // If this is a single-step action, auto-complete the action
    if (current_step && current_step.total_steps === 1) {
      _.up('action_complete', { value: choice }, {})
    }
  }

  function highlight_choice (choice) {
    buttons.forEach(b => {
      const isActive = b.getAttribute('data-choice') === choice
      b.classList.toggle('active', isActive)
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false')
      if (isActive) {
        b.style.background = 'linear-gradient(180deg, rgba(103,195,255,0.06), rgba(103,195,255,0.02))'
        b.style.boxShadow = '0 12px 36px rgba(103,195,255,0.16)'
        b.style.borderColor = 'rgba(103,195,255,0.36)'
        b.style.transform = 'translateY(-2px) scale(1.01)'
      } else {
        b.style.background = ''
        b.style.boxShadow = ''
        b.style.borderColor = ''
        b.style.transform = ''
      }
    })
  }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      DOCS: { $: '' },
      net_helper: { $: '' }
    }
  }

  function fallback_instance () {
    return {
      _: {
        DOCS: { 0: '' },
        net_helper: { 0: '' }
      },
      drive: {
        'style/': {
          'form_tile_split_choice.css': { $ref: 'form_tile_split_choice.css' }
        },
        'data/': {
          'form_tile_split_choice.json': { raw: { choice: null } }
        },
        'docs/': { 'README.md': { $ref: 'README.md' } }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/form_tile_split_choice/form_tile_split_choice.js")
},{"DOCS":4,"STATE":1,"net_helper":17}],12:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const net = require('net_helper')
const graph_explorer = require('graph-explorer')
const graphdb = require('./graphdb')

module.exports = graph_explorer_wrapper

async function graph_explorer_wrapper (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  let db = null
  let latest_entries = null
  const pending_to_graph_explorer = []
  let send_to_graph_explorer = null
  let graph_explorer_db_ready = false

  // Protocol
  const { io, _ } = net(id)
  io.on = {
    up: onmessage
  }
  if (invite) io.accept(invite)

  let child_mid = 0

  const on = {
    theme: inject,
    entries: on_entries
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })

  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]

  const subs = await sdb.watch(onbatch)

  const explorer_el = await graph_explorer(subs[0], graph_explorer_protocol)
  shadow.append(explorer_el)

  return el

  function onmessage (msg) {
    const parent_handlers = {
      execute_step: parent_execute_step,
      set_mode: parent_forward_to_graph_explorer,
      set_search_query: parent_forward_to_graph_explorer,
      select_nodes: parent_forward_to_graph_explorer,
      expand_node: parent_forward_to_graph_explorer,
      collapse_node: parent_forward_to_graph_explorer,
      toggle_node: parent_forward_to_graph_explorer,
      get_selected: parent_forward_to_graph_explorer,
      get_confirmed: parent_forward_to_graph_explorer,
      clear_selection: parent_forward_to_graph_explorer,
      set_flag: parent_forward_to_graph_explorer,
      scroll_to_node: parent_forward_to_graph_explorer,
      docs_toggle: parent_forward_to_graph_explorer
    }
    const handler = parent_handlers[msg.type] || fail
    handler(msg)
  }

  function parent_execute_step (msg) {
    const commands = get_step_commands(msg.data)
    for (const command of commands) {
      const refs = msg.head ? { cause: msg.head } : {}
      send_to_graph_explorer_message(command.type, command.data !== undefined ? command.data : {}, refs)
    }
  }

  function parent_forward_to_graph_explorer (msg) {
    const refs = msg.head ? { cause: msg.head } : {}
    send_to_graph_explorer_message(msg.type, msg.data, refs)
  }

  function send_to_graph_explorer_message (type, data, refs) {
    if (!can_send_to_graph_explorer()) {
      pending_to_graph_explorer.push({ type, data, refs })
      return
    }
    send_child_message(type, data, refs)
  }

  function flush_to_graph_explorer_queue () {
    while (can_send_to_graph_explorer() && pending_to_graph_explorer.length) {
      const next_msg = pending_to_graph_explorer.shift()
      send_child_message(next_msg.type, next_msg.data, next_msg.refs)
    }
  }

  function can_send_to_graph_explorer () {
    return Boolean(send_to_graph_explorer && graph_explorer_db_ready)
  }

  function get_step_commands (data) {
    if (!data) return []
    if (Array.isArray(data.commands)) return data.commands.filter(has_command_type)
    if (data.command && has_command_type(data.command)) return [data.command]
    if (has_command_type(data)) {
      return [{ type: data.type, data: data.data !== undefined ? data.data : {} }]
    }
    return []

    function has_command_type (command) {
      return command && typeof command.type === 'string' && command.type.length > 0
    }
  }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const handler = on[type] || fail
      handler({ data, type })
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail ({ data, type }) { console.warn('invalid message', { cause: { data, type } }) }
  function inject ({ data }) { sheet.replaceSync(data.join('\n')) }

  function on_entries ({ data }) {
    if (!data || !data[0]) {
      console.error('Entries data is missing or empty.')
      latest_entries = {}
      db = graphdb({})
      notify_db_initialized({})
      return
    }

    let parsed_data
    try {
      parsed_data = typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]
    } catch (e) {
      console.error('Failed to parse entries data:', e)
      parsed_data = {}
    }

    if (typeof parsed_data !== 'object' || !parsed_data) {
      console.error('Parsed entries data is not a valid object.')
      parsed_data = {}
    }

    db = graphdb(parsed_data)
    latest_entries = parsed_data
    graph_explorer_db_ready = false
    notify_db_initialized(parsed_data)
  }

  function notify_db_initialized (entries) {
    if (!send_to_graph_explorer) return
    send_child_message('db_initialized', { entries })
    graph_explorer_db_ready = true
    flush_to_graph_explorer_queue()
  }

  // ---------------------------------------------------------
  // PROTOCOL
  // ---------------------------------------------------------

  function graph_explorer_protocol (send) {
    send_to_graph_explorer = send
    Promise.resolve().then(sync_initial_state_to_child)
    return on_graph_explorer_message

    function on_graph_explorer_message (msg) {
      const { type } = msg

      if (type.startsWith('db_')) {
        handle_db_request(msg)
      } else {
        _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {})
      }
    }
  }

  function send_child_message (type, data = {}, refs = {}) {
    const head = [id, 'graph-explorer', child_mid++]
    const meta = { time: Date.now(), stack: (new Error().stack) }
    send_to_graph_explorer({ head, refs, type, data, meta })
    return head
  }

  function sync_initial_state_to_child () {
    if (latest_entries !== null) {
      notify_db_initialized(latest_entries)
    }
  }

  function handle_db_request (request_msg) {
    const { head: request_head, type: operation, data: params } = request_msg
    if (!db) {
      console.error('[graph_explorer_wrapper] Database not initialized yet')
      send_response(request_head, null)
      return
    }
    const db_handler = {
      db_get: (path) => db.get(path),
      db_has: (path) => db.has(path),
      db_is_empty: () => db.is_empty(),
      db_root: () => db.root(),
      db_keys: () => db.keys(),
      db_raw: () => db.raw()
    }
    const method = db_handler[operation] || db_fail
    const result = method(params.path)
    send_response(request_head, result)

    function db_fail () {
      console.warn('[graph_explorer_wrapper] Unknown db operation:', operation)
      send_response(request_head, null)
    }
  }

  function send_response (request_head, result) {
    send_child_message('db_response', { result }, { cause: request_head })
  }
}

function fallback_module () {
  return {
    _: {
      'graph-explorer': {
        $: ''
      },
      './graphdb': {
        $: ''
      },
      net_helper: {
        $: ''
      }
    },
    api: fallback_instance
  }

  function fallback_instance () {
    return {
      _: {
        'graph-explorer': {
          $: '',
          0: '',
          mapping: {
            style: 'theme',
            runtime: 'runtime',
            mode: 'mode',
            flags: 'flags',
            keybinds: 'keybinds',
            undo: 'undo',
            docs: 'docs'
          }
        },
        './graphdb': {
          $: ''
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'theme/': {
          'style.css': {
            raw: `
              :host {
              display: block;
              height: 100%;
              width: 100%;
              }
            `
          }
        },
        'entries/': {
          'entries.json': {
            $ref: 'entries.json'
          }
        },
        'runtime/': {
          'node_height.json': { raw: '16' },
          'vertical_scroll_value.json': { raw: '0' },
          'horizontal_scroll_value.json': { raw: '0' },
          'selected_instance_paths.json': { raw: '[]' },
          'confirmed_selected.json': { raw: '[]' },
          'instance_states.json': { raw: '{}' },
          'search_entry_states.json': { raw: '{}' },
          'last_clicked_node.json': { raw: 'null' },
          'view_order_tracking.json': { raw: '{}' }
        },
        'mode/': {
          'current_mode.json': { raw: '"menubar"' },
          'previous_mode.json': { raw: '"menubar"' },
          'search_query.json': { raw: '""' },
          'multi_select_enabled.json': { raw: 'false' },
          'select_between_enabled.json': { raw: 'false' }
        },
        'flags/': {
          'hubs.json': { raw: '"default"' },
          'selection.json': { raw: 'true' },
          'recursive_collapse.json': { raw: 'true' }
        },
        'keybinds/': {
          'navigation.json': {
            raw: JSON.stringify({
              ArrowUp: 'navigate_up_current_node',
              ArrowDown: 'navigate_down_current_node',
              'Control+ArrowDown': 'toggle_subs_for_current_node',
              'Control+ArrowUp': 'toggle_hubs_for_current_node',
              'Alt+s': 'multiselect_current_node',
              'Alt+b': 'select_between_current_node',
              'Control+m': 'toggle_search_mode',
              'Alt+j': 'jump_to_next_duplicate'
            })
          }
        },
        'undo/': {
          'stack.json': { raw: '[]' }
        },
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/graph_explorer_wrapper/graph_explorer_wrapper.js")
},{"./graphdb":13,"STATE":1,"graph-explorer":2,"net_helper":17}],13:[function(require,module,exports){
module.exports = graphdb

function graphdb (entries) {
  // Validate entries
  if (!entries || typeof entries !== 'object') {
    console.warn('[graphdb] Invalid entries provided, using empty object')
    entries = {}
  }

  const api = {
    get,
    has,
    keys,
    is_empty,
    root,
    raw
  }

  return api

  function get (path) { return entries[path] || null }
  function has (path) { return path in entries }
  function keys () { return Object.keys(entries) }
  function is_empty () { return Object.keys(entries).length === 0 }
  function root () { return entries['/'] || null }
  function raw () { return entries }
}

},{}],14:[function(require,module,exports){
module.exports = { resource }

function resource (timeout = 1000) {
  const states = {}
  return { set, get }
  function load (pid) { return states[pid] || (states[pid] = { item: null, pending: [] }) }
  function set (pid, item) {
    const state = load(pid)
    state.item = item
    const { pending } = state
    state.pending = []
    pending.map(resolve_pending_waiter)

    function resolve_pending_waiter (waiter) { waiter.resolve(item) }
  }
  function get (pid) {
    return new Promise(on)
    function on (resolve, reject) {
      const { item, pending } = load(pid)
      if (item) return resolve(item)
      pending.push({ resolve, reject })
    }
  }
}

},{}],15:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const DOCS = require('DOCS')
const net = require('net_helper')

module.exports = input_test
async function input_test (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject,
    data: ondata
  }

  let current_step = null
  let input_accessible = true
  const { io, _ } = net(id)
  io.on = {
    up: onmessage
  }
  if (invite) io.accept(invite)

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class='title'> Testing 2nd Type </div>
  <div class="input-display">
    <input class="input-field" type="text" placeholder="Type to submit">
    <div class="overlay-lock" hidden></div>
  </div>`
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]

  const input_field_el = shadow.querySelector('.input-field')
  const overlay_el = shadow.querySelector('.overlay-lock')

  input_field_el.oninput = on_input_field_input

  async function on_input_field_input () {
    if (!input_accessible) return

    await drive.put('data/input_test.json', {
      input_field: input_field_el.value
    })

    if (input_field_el.value.length >= 10) {
      _.up('action_submitted', {
        value: input_field_el.value,
        index: current_step.index !== undefined ? current_step.index : 0
      }, {})
      console.log('mark_as_complete')
    } else {
      _.up('action_incomplete', {
        value: input_field_el.value,
        index: current_step.index !== undefined ? current_step.index : 0
      }, {})
    }
  }

  await sdb.watch(onbatch)

  const parent_handler = {
    step_data,
    reset_data
  }

  return el

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail (data, type) { console.warn('invalid message', { cause: { data, type } }) }
  function inject (data) { sheet.replaceSync(data[0]) }

  function ondata (data) {
    if (data.length > 0) {
      const input_data = data[0]
      if (input_data.input_field) {
        input_field_el.value = input_data.input_field
      }
    } else {
      input_field_el.value = ''
    }
  }

  // ------------------
  // Parent Observer
  // ------------------

  function onmessage ({ type, data }) {
    console.log('message from input_test', type, data)
    const handler = parent_handler[type] || fail
    handler(data, type)
  }

  function step_data (data, type) {
    current_step = data

    input_accessible = data.is_accessible !== false

    overlay_el.hidden = input_accessible

    input_field_el.placeholder = input_accessible
      ? 'Type to submit'
      : 'Input disabled for this step'
  }

  function reset_data (data, type) {
    input_field_el.value = ''
    drive.put('data/input_test.json', {
      input_field: ''
    })
  }
}
function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      DOCS: {
        $: ''
      },
      net_helper: {
        $: ''
      }
    }
  }
  function fallback_instance () {
    return {
      _: {
        DOCS: {
          0: ''
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'style/': {
          'theme.css': {
            raw: `
            .title {
              color: #e8eaed;
              font-size: 18px;
              display: flex;
              align-items: center;
            }
            .input-display {
              position: relative;
              background: #131315;
              border-radius: 16px;
              border: 1px solid #3c3c3c;
              display: flex;
              flex: 1;
              align-items: center;
              padding: 0 12px;
              min-height: 32px;
            }
            .input-display:focus-within {
              border-color: #4285f4;
              background: #1a1a1c;
            }
            .input-field {
              flex: 1;
              min-height: 32px;
              background: transparent;
              border: none;
              color: #e8eaed;
              padding: 0 12px;
              font-size: 14px;
              outline: none;
            }
            .input-field::placeholder {
              color: #a6a6a6;
            }
            .overlay-lock {
              position: absolute;
              inset: 0;
              background: transparent;
              z-index: 10;
              cursor: not-allowed;
            }`
          }
        },
        'data/': {
          'input_test.json': {
            raw: {
              input_field: ''
            }
          }
        },
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/input_test/input_test.js")
},{"DOCS":4,"STATE":1,"net_helper":17}],16:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)

module.exports = create_component_menu
async function create_component_menu (opts, names, inicheck, callbacks) {
  const { sdb } = await get(opts.sid)
  const { drive } = sdb
  const on = {
    style: inject
  }
  const {
    on_checkbox_change,
    on_label_click,
    on_select_all_toggle,
    on_resize_toggle
  } = callbacks

  const checkobject = {}
  inicheck.forEach(mark_checked_index)

  function mark_checked_index (checked_position) { checkobject[checked_position - 1] = true }

  const all_checked = inicheck.length === 0 || Object.keys(checkobject).length === names.length

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="nav-bar-container-inner main">
    <div class="nav-bar">
      <button class="menu-toggle-button">☰ MENU</button>
      <div class="menu hidden">
        <div class="menu-header">
          <button class="unselect-all-button">${all_checked ? 'Unselect All' : 'Select All'}</button>
          <button class="resize-toggle-button">Toggle Resize</button>
        </div>
        <ul class="menu-list"></ul>
      </div>
    </div>
  </div>`
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]
  const menu = shadow.querySelector('.menu')
  const toggle_btn = shadow.querySelector('.menu-toggle-button')
  const unselect_btn = shadow.querySelector('.unselect-all-button')
  const resize_btn = shadow.querySelector('.resize-toggle-button')
  const list = shadow.querySelector('.menu-list')

  names.forEach(create_menu_item)

  function create_menu_item (name, index) {
    const is_checked = all_checked || checkobject[index] === true
    const menu_item = document.createElement('li')
    menu_item.className = 'menu-item'
    menu_item.innerHTML = `
      <span data-index="${index}" data-name="${name}">${name}</span>
      <input type="checkbox" data-index="${index}" ${is_checked ? 'checked' : ''}>
    `
    list.appendChild(menu_item)

    const checkbox = menu_item.querySelector('input')
    const label = menu_item.querySelector('span')

    checkbox.onchange = on_checkbox_change_event
    label.onclick = on_label_click_event

    function on_checkbox_change_event (e) { on_checkbox_change({ index, checked: e.target.checked }) }
    function on_label_click_event () {
      on_label_click({ index, name })
      menu.classList.add('hidden')
    }
  }
  await sdb.watch(onbatch)
  // event listeners
  console.log('resize_btn', resize_btn)
  toggle_btn.onclick = on_toggle_btn
  unselect_btn.onclick = on_unselect_btn
  resize_btn.onclick = on_resize_btn
  document.onclick = handle_document_click

  return el

  function on_toggle_btn (e) {
    e.stopPropagation()
    menu.classList.toggle('hidden')
  }

  function on_unselect_btn () {
    const select_all = unselect_btn.textContent === 'Select All'
    unselect_btn.textContent = select_all ? 'Unselect All' : 'Select All'
    list.querySelectorAll('input[type="checkbox"]').forEach(update_checkbox_state)
    on_select_all_toggle({ selectAll: select_all })

    function update_checkbox_state (checkbox) { checkbox.checked = select_all }
  }

  function on_resize_btn () {
    console.log('on_resize_btn')
    on_resize_toggle()
  }

  function handle_document_click (e) {
    const path = e.composedPath()
    if (!menu.classList.contains('hidden') && !path.includes(el)) {
      menu.classList.add('hidden')
    }
  }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail (data, type) { console.warn('invalid message', { cause: { data, type } }) }

  function inject (data) { sheet.replaceSync(data[0]) }
}
function fallback_module () {
  return {
    api: fallback_instance
  }
  function fallback_instance () {
    return {
      drive: {
        'style/': {
          'theme.css': {
            raw: `
            :host {
              display: block;
              position: sticky;
              top: 0;
              z-index: 100;
              background-color: #e0e0e0;
            }

            .nav-bar-container-inner {
            }

            .nav-bar {
              display: flex;
              position: relative;
              justify-content: center;
              align-items: center;
              padding: 10px 20px;
              border-bottom: 2px solid #333;
              min-height: 30px;
            }

            .menu-toggle-button {
              padding: 10px;
              background-color: #e0e0e0;
              border: none;
              cursor: pointer;
              border-radius: 5px;
              font-weight: bold;
            }

            .menu-toggle-button:hover {
              background-color: #d0d0d0;
            }

            .menu.hidden {
              display: none;
            }

            .menu {
              display: block;
              position: absolute;
              top: 100%;
              left: 50%;
              transform: translateX(-50%);
              width: 250px;
              max-width: 90%;
              background-color: #f0f0f0;
              padding: 10px;
              border-radius: 0 0 5px 5px;
              box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
              z-index: 101;
            }

            .menu-header {
              margin-bottom: 10px;
              text-align: center;
            }

            .unselect-all-button {
              padding: 8px 12px;
              border: none;
              background-color: #d0d0d0;
              cursor: pointer;
              border-radius: 5px;
              width: 100%;
              margin-bottom: 5px;
            }

            .unselect-all-button:hover {
              background-color: #c0c0c0;
            }

            .resize-toggle-button {
              padding: 8px 12px;
              border: none;
              background-color: #d0d0d0;
              cursor: pointer;
              border-radius: 5px;
              width: 100%;
            }

            .resize-toggle-button:hover {
              background-color: #c0c0c0;
            }

            .menu-list {
              list-style: none;
              padding: 0;
              margin: 0;
              max-height: 400px;
              overflow-y: auto;
              background-color: #f0f0f0;
            }

            .menu-list::-webkit-scrollbar {
              width: 8px;
            }

            .menu-list::-webkit-scrollbar-track {
              background: #f0f0f0;
            }

            .menu-list::-webkit-scrollbar-thumb {
              background: #ccc;
              border-radius: 4px;
            }

            .menu-list::-webkit-scrollbar-thumb:hover {
              background: #bbb;
            }

            .menu-item {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 8px 5px;
              border-bottom: 1px solid #ccc;
            }

            .menu-item span {
              cursor: pointer;
              flex-grow: 1;
              margin-right: 10px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .menu-item span:hover {
              color: #007bff;
            }

            .menu-item:last-child {
              border-bottom: none;
            }

            .menu-item input[type="checkbox"] {
              flex-shrink: 0;
            }`
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/menu/menu.js")
},{"STATE":1}],17:[function(require,module,exports){
(function (__filename){(function (){
module.exports = net

function net (id) {
  const [label, io, _, sub, hub] = [`[${id}@${__filename}]`, { invite, accept, on: {} }, {}, {}, {}]
  return { io, _ }
  function forward (to, M) {
    if (to.startsWith(id)) {
      const ups = [...new Set(Object.keys(hub).map(id => hub[id].tx))]
      for (const tx of ups) tx(M)
      return
    }
    for (const id of Object.keys(sub)) if (to.startsWith(id)) return sub[id].tx(M)
    throw new Error(`${label} unknown recipient "${to}"`)
  }
  function invite (name, ids) {
    if (!io.on[name]) throw new Error(`${label} no protocol handler for "${name}"`)
    return Object.assign(invite, { ids })
    function invite (tx) {
      const rx = router(sub)
      add(name, tx, tx.id, rx, sub)
      return rx
    }
  }
  function accept (invite) {
    const rx = router(hub)
    const tx = invite(Object.assign(rx, { id }))
    for (const [name, to] of Object.entries(invite.ids)) {
      if (hub[to]) throw new Error(`${label} already connected to "${to}"`)
      if (!io.on[name]) throw new Error(`${label} no "${name}" protocol for "${to}"`)
      add(name, tx, to, rx, hub)
    }
  }
  function router ($) {
    return function rx (M) {
      const { head: [by, to] } = M
      console.log(`[M]\n${by} \n to: \n ${to}`, M)
      if (to !== id) return forward(to, M)
      if (!$[by]) throw new Error(`${label} unknown sender "${by}"`)
      const { name } = $[by].state
      if (!io.on[name]) throw new Error(`${label} no "${name}" protocol for "${to}"`)
      io.on[name](M)
    }
  }
  function add (name, tx, to, rx, $) {
    const state = { name, to, mid: 0 }
    _[name] = send
    $[to] = { rx, tx, state }
    function send (type, data = [], refs = {}) {
      const head = [id, to, state.mid++]
      const meta = { time: Date.now(), stack: (new Error().stack) }
      tx({ head, refs, type, data, meta })
      return head
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/net_helper/net_helper.js")
},{}],18:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const net = require('net_helper')

const form_input = require('form_input')
const input_test = require('input_test')
const form_tile_split_choice = require('form_tile_split_choice')

program.form_input = form_input
program.input_test = input_test
program.form_tile_split_choice = form_tile_split_choice

module.exports = program

async function program (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject,
    variables: onvariables
  }

  const { io } = net(id)
  io.on = {
    up: onmessage
  }
  if (invite) io.accept(invite)

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]

  await sdb.watch(onbatch)

  const parent_handler = {
    display_result,
    update_data
  }

  return el

  // --- Internal Functions ---
  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail (data, type) { console.warn('invalid message', { cause: { data, type } }) }

  function inject (data) { sheet.replaceSync(data[0]) }

  function onvariables (data) {
    // Dont get why we have this module.
  }

  function onmessage ({ type, data }) {
    const handler = parent_handler[type](data, type) || fail
    handler(data, type)
  }
  function display_result (data) {
    console.log('Display Result:', data)
    alert(`Result of action(${data.selected_action ? data.selected_action : 'unknown'}): ${data.result ? data.result : 'no result'}`)
  }
  function update_data (data) { drive.put('variables/program.json', data) }
}

// --- Fallback Module ---
function fallback_module () {
  return {
    api: fallback_instance,
    _: {

      form_input: { $: '' },
      input_test: { $: '' },
      form_tile_split_choice: { $: '' },
      net_helper: { $: '' }
    }
  }

  function fallback_instance () {
    return {
      _: {
        net_helper: { 0: '' }
      },
      drive: {
        'style/': {
          'program.css': {
            raw: `
              .main {
                display: flex;
                flex-direction: column;
                align-items: center;
              }
            `
          }
        },
        'variables/': {
          'program.json': { $ref: 'program.json' }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/program/program.js")
},{"STATE":1,"form_input":10,"form_tile_split_choice":11,"input_test":15,"net_helper":17}],19:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const DOCS = require('DOCS')
const docs = DOCS(__filename)()
const net = require('net_helper')

const console_history = require('console_history')
const actions = require('actions')
const tabbed_editor = require('tabbed_editor')
const graph_explorer_wrapper = require('graph_explorer_wrapper')
const docs_window = require('docs_window')

module.exports = program_container

async function program_container (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject
  }
  const { io, _ } = net(id)

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="program-container main">
    <docs-window-placeholder></docs-window-placeholder>
    <graph-explorer-placeholder></graph-explorer-placeholder>
    <actions-placeholder></actions-placeholder>
    <tabbed-editor-placeholder></tabbed-editor-placeholder>
    <console-history-placeholder></console-history-placeholder>
  </div>`
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]

  const program_main = shadow.querySelector('.program-container')
  const graph_explorer_placeholder = shadow.querySelector('graph-explorer-placeholder')
  const actions_placeholder = shadow.querySelector('actions-placeholder')
  const tabbed_editor_placeholder = shadow.querySelector('tabbed-editor-placeholder')
  const console_placeholder = shadow.querySelector('console-history-placeholder')
  const docs_window_placeholder = shadow.querySelector('docs-window-placeholder')

  let console_history_el = null
  let docs_window_el = null
  let actions_el = null
  let tabbed_editor_el = null
  let graph_explorer_el = null

  const subs = await sdb.watch(onbatch)

  io.on = {
    up: onmessage,
    console_history: console_history_protocol,
    actions: actions_protocol,
    tabbed_editor: tabbed_editor_protocol,
    graph_explorer: graph_explorer_protocol,
    docs_window: docs_window_protocol
  }
  if (invite) io.accept(invite)

  actions_el = await actions({ ...subs[1] }, io.invite('actions', { up: id }))
  actions_el.classList.add('actions')
  actions_placeholder.replaceWith(actions_el)

  tabbed_editor_el = await tabbed_editor({ ...subs[2] }, io.invite('tabbed_editor', { up: id }))
  tabbed_editor_el.classList.add('tabbed-editor')
  tabbed_editor_placeholder.replaceWith(tabbed_editor_el)

  docs_window_el = await docs_window({ ...subs[4] }, io.invite('docs_window', { up: id }))
  docs_window_el.classList.add('docs-window')
  docs_window_el.classList.add('hide')
  docs_window_placeholder.replaceWith(docs_window_el)

  graph_explorer_el = await graph_explorer_wrapper({ ...subs[3] }, io.invite('graph_explorer', { up: id }))
  graph_explorer_el.classList.add('graph-explorer')
  graph_explorer_placeholder.replaceWith(graph_explorer_el)

  console_history_el = await console_history({ ...subs[0] }, io.invite('console_history', { up: id }))
  console_history_el.classList.add('console-history')
  console_placeholder.replaceWith(console_history_el)
  let console_view = false
  let actions_view = false
  let graph_explorer_view = false

  if (invite) {
    console_history_el.classList.add('hide')
    actions_el.classList.add('hide')
    tabbed_editor_el.classList.add('show')
    graph_explorer_el.classList.add('hide')

    // Send message to root to set doc display handler
    _.up('set_doc_display_handler', { callback: on_doc_display }, {})
  }

  if (!invite) {
    actions_view = !actions_el.classList.contains('hide')
    console_view = !console_history_el.classList.contains('hide')
    graph_explorer_view = !graph_explorer_el.classList.contains('hide')
  }
  update_program_layout()

  return el

  function console_history_toggle_view () {
    const next_view = !console_view
    set_panel_visibility(console_history_el, next_view)
    console_view = next_view
    update_program_layout()
  }

  function actions_toggle_view (display_data) {
    const next_view = resolve_display_state(display_data, actions_view)
    set_panel_visibility(actions_el, next_view)
    actions_view = next_view
    update_program_layout()
  }

  function graph_explorer_toggle_view () {
    const next_view = !graph_explorer_view
    set_panel_visibility(graph_explorer_el, next_view)
    graph_explorer_view = next_view
    update_program_layout()
  }

  function resolve_display_state (display_data, current_view) {
    if (typeof display_data === 'boolean') return display_data
    if (typeof display_data === 'string') return display_data !== 'none'
    if (typeof display_data === 'object' && display_data.display !== undefined) return display_data.display !== 'none'
    return !current_view
  }

  function set_panel_visibility (panel_el, visible) {
    if (visible) {
      panel_el.classList.remove('hide')
      panel_el.classList.add('show')
    } else {
      panel_el.classList.remove('show')
      panel_el.classList.add('hide')
    }
  }

  function tabbed_editor_toggle_view (show = true) {
    if (show) {
      set_panel_visibility(tabbed_editor_el, true)
      set_panel_visibility(actions_el, false)
      set_panel_visibility(console_history_el, false)
      set_panel_visibility(graph_explorer_el, false)
      actions_view = false
      console_view = false
      graph_explorer_view = false
    } else {
      set_panel_visibility(tabbed_editor_el, false)
    }
    update_program_layout()
  }

  function update_program_layout () {
    const tabbed_visible = !tabbed_editor_el.classList.contains('hide')
    const graph_visible = !graph_explorer_el.classList.contains('hide')
    const actions_visible = !actions_el.classList.contains('hide')
    const console_visible = !console_history_el.classList.contains('hide')
    const has_primary = tabbed_visible || graph_visible

    let tabbed_row = '0px'
    let graph_row = '0px'
    let actions_row = '0px'
    let console_row = '0px'

    if (tabbed_visible) {
      tabbed_row = graph_visible ? 'minmax(120px, 1fr)' : 'minmax(80px, 1fr)'
    }
    if (graph_visible) {
      graph_row = tabbed_visible ? 'minmax(150px, 1fr)' : 'minmax(200px, 1fr)'
    }
    if (actions_visible) {
      if (!has_primary && !console_visible) actions_row = 'minmax(80px, 1fr)'
      else actions_row = 'fit-content(260px)'
    }
    if (console_visible) {
      if (!has_primary && !actions_visible) console_row = 'minmax(80px, 1fr)'
      else console_row = 'fit-content(260px)'
    }
    if (!tabbed_visible && !graph_visible && !actions_visible && !console_visible) {
      tabbed_row = '1fr'
    }

    program_main.style.gridTemplateRows = `${tabbed_row} ${graph_row} ${actions_row} ${console_row}`
  }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func({ data, type })
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }
  function fail ({ data, type }) { console.warn('invalid message', { cause: { data, type } }) }
  function inject ({ data }) { sheet.replaceSync(data[0]) }

  function on_doc_display (display_data) {
    const { content, sid } = display_data
    docs_window_el.classList.remove('hide')
    _.docs_window('display_doc', { content, sid })
  }

  // ---------
  // PROTOCOLS
  // ---------

  function console_history_protocol (msg) { _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }

  function actions_protocol (msg) {
    const action_handlers = {
      selected_action: actions_selected_action,
      ui_focus_docs: actions_ui_focus_docs,
      ui_focus: actions_forward_up
    }

    const handler = action_handlers[msg.type] || actions_forward_up
    handler(msg)

    function actions_forward_up (msg) { _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  }

  function actions_selected_action (msg) {
    const { data } = msg
    _.up('update_quick_actions_input', data, msg.head ? { cause: msg.head } : {})
  }

  function actions_ui_focus_docs (msg) { _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }

  function tabbed_editor_protocol (msg) { _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }

  function graph_explorer_protocol (msg) { _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }

  function docs_window_protocol (msg) {
    const action_handlers = {
      close_docs: docs_window_close_docs
    }
    const handler = action_handlers[msg.type] || docs_window_noop
    handler(msg)
    _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {})

    function docs_window_close_docs () { docs_window_el.classList.add('hide') }
    function docs_window_noop () {}
  }

  function onmessage (msg) {
    const action_handlers = {
      console_history_toggle: onmessage_console_history_toggle,
      graph_explorer_toggle: onmessage_graph_explorer_toggle,
      display_actions: onmessage_display_actions,
      filter_actions: onmessage_filter_actions,
      tab_name_clicked: onmessage_tab_name_clicked,
      tab_close_clicked: onmessage_tab_close_clicked,
      switch_tab: onmessage_switch_tab,
      entry_toggled: onmessage_entry_toggled,
      execute_step: onmessage_execute_step,
      display_doc: onmessage_display_doc,
      load_actions: onmessage_send_actions,
      update_actions_for_app: onmessage_send_actions
    }
    const handler = action_handlers[msg.type] || fail
    handler(msg)

    function onmessage_console_history_toggle () { console_history_toggle_view() }
    function onmessage_graph_explorer_toggle () { graph_explorer_toggle_view() }
    function onmessage_display_actions (msg) { actions_toggle_view(msg.data) }
    function onmessage_filter_actions (msg) { _.actions(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
    function onmessage_tab_close_clicked (msg) { _.tabbed_editor('close_tab', msg.data, msg.head ? { cause: msg.head } : {}) }
    function onmessage_entry_toggled (msg) { _.graph_explorer(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
    function onmessage_execute_step (msg) {
      if (!msg.data || !Array.isArray(msg.data.commands) || msg.data.commands.length === 0) return
      set_panel_visibility(graph_explorer_el, true)
      graph_explorer_view = true
      update_program_layout()
      _.graph_explorer(msg.type, msg.data, msg.head ? { cause: msg.head } : {})
    }
    function onmessage_send_actions (msg) { _.actions(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
    function onmessage_tab_name_clicked (msg) {
      tabbed_editor_toggle_view(true)
      _.tabbed_editor('toggle_tab', msg.data, msg.head ? { cause: msg.head } : {})
    }
    function onmessage_switch_tab (msg) {
      tabbed_editor_toggle_view(true)
      _.tabbed_editor(msg.type, msg.data, msg.head ? { cause: msg.head } : {})
    }
    function onmessage_display_doc (msg) {
      docs_window_el.classList.remove('hide')
      _.docs_window(msg.type, msg.data, msg.head ? { cause: msg.head } : {})
    }
  }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      console_history: {
        $: ''
      },
      actions: {
        $: ''
      },
      tabbed_editor: {
        $: ''
      },
      graph_explorer_wrapper: {
        $: ''
      },
      docs_window: {
        $: ''
      },
      DOCS: {
        $: ''
      },
      net_helper: {
        $: ''
      }
    }
  }

  function fallback_instance () {
    return {
      _: {
        console_history: {
          0: '',
          mapping: {
            style: 'style',
            commands: 'commands',
            icons: 'icons',
            scroll: 'scroll',
            docs: 'docs',
            actions: 'actions'
          }
        },
        actions: {
          0: '',
          mapping: {
            style: 'style',
            actions: 'actions',
            icons: 'icons',
            hardcons: 'hardcons',
            docs: 'docs'
          }
        },
        tabbed_editor: {
          0: '',
          mapping: {
            style: 'style',
            files: 'files',
            highlight: 'highlight',
            active_tab: 'active_tab',
            docs: 'docs'
          }
        },
        graph_explorer_wrapper: {
          0: '',
          mapping: {
            theme: 'style',
            entries: 'entries',
            runtime: 'runtime',
            mode: 'mode',
            flags: 'flags',
            keybinds: 'keybinds',
            undo: 'undo',
            docs: 'docs'
          }
        },
        docs_window: {
          0: '',
          mapping: {
            style: 'docs_style'
          }
        },
        DOCS: {
          0: ''
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'style/': {
          'theme.css': {
            raw: `
              .program-container {
                display: grid;
                grid-template-columns: minmax(0, 1fr);
                min-height: 200px;
                height: 100%;
                background: linear-gradient(135deg, #0d1117 0%, #161b22 100%);
                position: relative;
                gap: 0;
                padding: 0;
                overflow: hidden;
                container-type: size;
              }
              .docs-window {
                position: absolute;
                inset: 12px;
                z-index: 20;
              }
              .tabbed-editor {
                grid-row: 1;
                grid-column: 1;
                min-height: 0;
                min-width: 0;
                width: 100%;
                height: 100%;
              }
              .graph-explorer {
                grid-row: 2;
                grid-column: 1;
                min-height: 0;
                min-width: 0;
                width: 100%;
                height: 100%;
              }
              .console-history {
                grid-row: 4;
                grid-column: 1;
                position: relative;
                width: 100%;
                height: auto;
                max-height: 100%;
                min-height: 0;
                min-width: 0;
                background-color: #161b22;
                border: 1px solid #21262d;
                border-radius: 6px;
                overflow: auto;
              }
              .actions {
                grid-row: 3;
                grid-column: 1;
                position: relative;
                width: 100%;
                height: auto;
                max-height: 100%;
                min-height: 0;
                min-width: 0;
                background-color: #161b22;
                border: 1px solid #21262d;
                border-radius: 6px;
                overflow: auto;
              }
              .tabbed-editor {
                position: relative;
                width: 100%;
                min-width: 0;
                background-color: #0d1117;
                border: 1px solid #21262d;
                border-radius: 6px;
                overflow: hidden;
              }
              .show {
                display: block;
              }
              .hide {
                display: none;
              }
            `
          }
        },
        'entries/': {},
        'flags/': {},
        'keybinds/': {},
        'commands/': {},
        'icons/': {},
        'scroll/': {},
        'actions/': {},
        'hardcons/': {},
        'files/': {},
        'highlight/': {},
        'active_tab/': {},
        'runtime/': {},
        'mode/': {},
        'undo/': {},
        'docs_style/': {}
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/program_container/program_container.js")
},{"DOCS":4,"STATE":1,"actions":7,"console_history":8,"docs_window":9,"graph_explorer_wrapper":12,"net_helper":17,"tabbed_editor":23}],20:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const DOCS = require('DOCS')
const net = require('net_helper')

module.exports = quick_actions

async function quick_actions (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject,
    icons: iconject,
    hardcons: onhardcons,
    actions: onactions,
    prefs: onprefs
  }

  const el = document.createElement('div')
  el.style.display = 'flex'
  el.style.flex = 'auto'

  const shadow = el.attachShadow({ mode: 'closed' })

  shadow.innerHTML = `
  <div class="quick-actions-container main">
    <div class="default-actions"></div>
    <div class="text-bar" role="button"></div>
    <div class="input-wrapper" style="display: none;">
      <div class="input-display">
        <span class="slash-prefix">/</span>
        <span class="command-text"></span>
        <span class="step-display" style="display: none;">
          <span>steps:</span>
          <span class="current-step">1</span>
          <span class="step-separator">-</span>
          <span class="total-step">1</span>
        </span>
        <input class="input-field" type="text" placeholder="Type to search actions...">
        <div class="input-tooltip" style="display: none;"></div>
      </div>
      <button class="confirm-btn" style="display: none;"></button>
      <button class="submit-btn" style="display: none;"></button>
      <button class="close-btn"></button>
    </div>
    <div class="tooltip hide"></div>
  </div>`
  const container = shadow.querySelector('.quick-actions-container')
  const default_actions = shadow.querySelector('.default-actions')
  const text_bar = shadow.querySelector('.text-bar')
  const input_wrapper = shadow.querySelector('.input-wrapper')
  const slash_prefix = shadow.querySelector('.slash-prefix')
  const command_text = shadow.querySelector('.command-text')
  const input_field = shadow.querySelector('.input-field')
  const confirm_btn = shadow.querySelector('.confirm-btn')
  const submit_btn = shadow.querySelector('.submit-btn')
  const close_btn = shadow.querySelector('.close-btn')
  const step_display = shadow.querySelector('.step-display')
  const current_step = shadow.querySelector('.current-step')
  const total_steps = shadow.querySelector('.total-step')
  const tooltip = shadow.querySelector('.tooltip')
  const input_tooltip = shadow.querySelector('.input-tooltip')
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]

  let init = false
  let enable_quick_action_tooltips = false
  let enable_input_field_tooltips = false
  let icons = {}
  let hardcons = {}
  let defaults = []
  let stored_selected_action = ''
  let action_selected = false
  const docs = DOCS(__filename)(opts.sid)
  const { io, _ } = net(id)

  io.on = {
    up: onmessage
  }
  if (invite) io.accept(invite)
  text_bar.onclick = docs.wrap(activate_input_field, get_doc_content)
  close_btn.onclick = docs.wrap(deactivate_input_field, get_doc_content)
  confirm_btn.onclick = docs.wrap(onconfirm, get_doc_content)
  submit_btn.onclick = docs.wrap(onsubmit, get_doc_content)
  input_field.oninput = oninput

  await sdb.watch(onbatch)

  return el

  async function get_doc_content () {
    const doc_file = await drive.get('docs/README.md')
    return doc_file.raw || 'No documentation available'
  }

  function onsubmit () {
    _.up('action_submitted', null, {})
  }

  function onconfirm () {
    _.up('activate_steps_wizard', stored_selected_action, {})
  }
  function oninput (e) {
    const value = e.target.value
    if (enable_input_field_tooltips) update_input_tooltip(value)
    _.up('filter_actions', value, {})
  }

  function update_input_display (selected_action = null) {
    if (selected_action) {
      action_selected = true
      slash_prefix.style.display = 'inline'
      command_text.style.display = 'inline'
      command_text.textContent = `#${selected_action.action}`
      current_step.textContent = selected_action.current_step ? selected_action.current_step : 1
      total_steps.textContent = selected_action.total_steps ? selected_action.total_steps : 1
      step_display.style.display = 'inline-flex'

      input_field.style.display = 'none'
      confirm_btn.style.display = 'flex'
      hide_input_tooltip()
    } else {
      slash_prefix.style.display = 'none'
      command_text.style.display = 'none'
      input_field.style.display = 'block'
      confirm_btn.style.display = 'none'
      submit_btn.style.display = 'none'
      step_display.style.display = 'none'
      input_field.placeholder = 'Type to search actions...'
      hide_input_tooltip()
      action_selected = false
    }
  }

  function activate_input_field () {
    if (action_selected) return
    default_actions.style.display = 'none'
    text_bar.style.display = 'none'

    input_wrapper.style.display = 'flex'
    input_field.focus()

    if (enable_input_field_tooltips) update_input_tooltip('')

    _.up('display_actions', { display: 'block', reason: 'browse' }, {})
  }

  function onmessage (msg) {
    const { type, data } = msg
    // No need to handle docs_toggle - DOCS module handles it globally
    const message_map = {
      deactivate_input_field,
      show_submit_btn,
      update_current_step,
      hide_submit_btn,
      update_quick_actions_for_app,
      update_input_command
    }
    const handler = message_map[type] || fail
    handler(data)
  }

  function deactivate_input_field (data) {
    const reason = data.reason ? data.reason : 'cancel'

    default_actions.style.display = 'flex'
    text_bar.style.display = 'flex'

    input_wrapper.style.display = 'none'

    input_field.value = ''
    update_input_display()
    hide_input_tooltip()

    _.up('display_actions', { display: 'none', reason }, {})
  }

  function show_submit_btn () {
    submit_btn.style.display = 'flex'
    confirm_btn.style.display = 'none'
  }
  function hide_submit_btn () { submit_btn.style.display = 'none' }

  function update_current_step (data) {
    const current_step_value = data.index !== undefined ? data.index + 1 : 1
    current_step.textContent = current_step_value
  }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }
    if (!init) {
      create_default_actions(defaults)
      init = true
    } else {
      // TODO: update actions
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }
  function fail (data, type) { console.warn(`Invalid message type: ${type}`, { cause: { data, type } }) }

  function inject (data) { sheet.replaceSync(data[0]) }
  function onhardcons (data) {
    hardcons = {
      submit: data[0],
      cross: data[1],
      confirm: data[2]
    }
    submit_btn.innerHTML = hardcons.submit
    close_btn.innerHTML = hardcons.cross
    confirm_btn.innerHTML = hardcons.confirm
  }
  function iconject (data) { icons = data }

  function onactions (data) {
    const vars = typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]
    defaults = vars
    create_default_actions(defaults)
  }

  function onprefs (data) {
    const vars = typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]
    enable_input_field_tooltips = vars.input_field
    enable_quick_action_tooltips = vars.quick_actions
  }

  function create_default_actions (actions) {
    default_actions.replaceChildren()
    actions.forEach(create_action_button)
  }

  function create_action_button (action) {
    const btn = document.createElement('div')
    btn.classList.add('action-btn')
    if (icons[action.icon] === undefined) {
      const texon = action.name.substring(0, 2)
      btn.innerHTML = texon
    } else {
      btn.innerHTML = icons[action.icon]
    }
    btn.dataset.name = action.name
    if (enable_quick_action_tooltips) {
      btn.onmouseenter = on_action_btn_mouseenter
      btn.onmouseleave = hide_tooltip
    }
    btn.onclick = docs.wrap(onclick, get_doc_content)
    default_actions.appendChild(btn)

    function on_action_btn_mouseenter () { show_tooltip(btn, action.name) }

    function onclick () {
      _.up('update_quick_actions_input', action.name, {})
    }
  }

  function update_input_tooltip (value) {
    if (!value || value.trim() === '') {
      hide_input_tooltip()
      return
    }
    const tooltip_text = get_tooltip_text(value)
    if (tooltip_text) {
      show_input_tooltip(tooltip_text)
    } else {
      hide_input_tooltip()
    }
  }

  function get_tooltip_text (value) {
    const lower_value = value.toLowerCase().trim()
    if (lower_value.length === 0) return null
    if (defaults.length > 0) {
      const matching = defaults.filter(matches_action_for_tooltip)
      if (matching.length > 0) {
        const names = matching.map(get_action_name)
        return `Found ${matching.length} action${matching.length > 1 ? 's' : ''}: ${names.join(', ')}`
      }
    }
    return 'No actions found. Try a different search term.'

    function matches_action_for_tooltip (action) { return matches_action(action, lower_value) }
    function get_action_name (action) { return action.name }
  }

  function matches_action (action, search_term) { return action.name.toLowerCase().includes(search_term) }

  function show_input_tooltip (text) {
    input_tooltip.textContent = text
    input_tooltip.style.display = 'block'
    position_input_tooltip()
  }

  function hide_input_tooltip () { input_tooltip.style.display = 'none' }

  function position_input_tooltip () {
    const input_rect = input_field.getBoundingClientRect()
    const wrapper_rect = input_wrapper.getBoundingClientRect()
    const tooltip_rect = input_tooltip.getBoundingClientRect()
    const left = input_rect.left - wrapper_rect.left + (input_rect.width / 2) - (tooltip_rect.width / 2)
    const top = input_rect.top - wrapper_rect.top - tooltip_rect.height - 8
    input_tooltip.style.left = `${left}px`
    input_tooltip.style.top = `${top}px`
  }

  function update_quick_actions_for_app (data) {
    if (data) {
      drive.put('actions/default.json', data)
    }
  }

  function update_input_command (command) {
    if (action_selected) return
    stored_selected_action = command
    if (input_wrapper.style.display === 'none') {
      default_actions.style.display = 'none'
      text_bar.style.display = 'none'
      input_wrapper.style.display = 'flex'
      input_field.focus()
      if (enable_input_field_tooltips) update_input_tooltip('')
    }

    // Find the action that matches the command
    const matching_action = defaults.find(matches_selected_command)

    if (matching_action) {
      const pass_data = {
        action: matching_action.name,
        current_step: 1,
        total_steps: matching_action.total_steps || 1
      }
      update_input_display(pass_data)
    } else {
      // TODO: Strictly handle this case
      const pass_data = {
        action: command.action,
        current_step: 1,
        total_steps: 3
      }
      update_input_display(pass_data)
    }

    _.up('display_actions', { display: 'none', reason: 'selected' }, {})
    _.up('activate_steps_wizard', stored_selected_action, {})

    function matches_selected_command (action) { return action.name === command || action.action === command }
  }

  function show_tooltip (btn, name) {
    tooltip.textContent = name
    tooltip.style.display = 'block'
    const btn_rect = btn.getBoundingClientRect()
    const container_rect = container.getBoundingClientRect()
    const tooltip_rect = tooltip.getBoundingClientRect()
    const left = btn_rect.left - container_rect.left + (btn_rect.width / 2) - (tooltip_rect.width / 2)
    const top = btn_rect.top - container_rect.top - tooltip_rect.height - 8
    tooltip.style.left = `${left}px`
    tooltip.style.top = `${top}px`
  }

  function hide_tooltip () { tooltip.style.display = 'none' }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      DOCS: {
        $: ''
      },
      net_helper: {
        $: ''
      }
    }
  }

  function fallback_instance () {
    return {
      _: {
        DOCS: {
          0: ''
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'icons/': {
          '0.svg': {
            $ref: 'action1.svg'
          },
          '1.svg': {
            $ref: 'action2.svg'
          },
          '2.svg': {
            $ref: 'action1.svg'
          },
          '3.svg': {
            $ref: 'action2.svg'
          },
          '4.svg': {
            $ref: 'action1.svg'
          }
        },
        'hardcons/': {
          'submit.svg': {
            $ref: 'submit.svg'
          },
          'close.svg': {
            $ref: 'cross.svg'
          },
          'confirm.svg': {
            $ref: 'check.svg'
          }
        },
        'actions/': {
          'default.json': {
            raw: JSON.stringify([])
          }
        },
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        },
        'style/': {
          'theme.css': {
            raw: `
              .quick-actions-container {
                display: flex;
                flex: auto;
                flex-direction: row;
                align-items: center;
                background: #191919;
                border-radius: 20px;
                gap: 8px;
                min-width: 200px;
                position: relative;
              }
              .default-actions {
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 4px;
                padding: 0 4px;
              }
              .action-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                padding: 6px;
                border-radius: 50%;
                cursor: pointer;
                color: #a6a6a6;
              }
              .action-btn:hover {
                background: rgba(255, 255, 255, 0.1);
              }
              .text-bar {
                flex: 1;
                height: 24px;
                margin: 4px;
                border-radius: 16px;
                background: #131315;
                cursor: pointer;
                user-select: none;
              }
              .text-bar:hover {
                background: #1a1a1c;
              }
              .input-wrapper {
                display: flex;
                flex: 1;
                align-items: center;
                background: #131315;
                border-radius: 16px;
                width: auto;
                height: 30px;
                border: 1px solid #3c3c3c;
              }
              .input-wrapper:focus-within {
                border-color: #4285f4;
                background: #1a1a1c;
              }
              .input-display {
                display: flex;
                flex: 1;
                align-items: center;
                padding: 0 12px;
                min-height: 32px;
                position: relative;
              }
              .slash-prefix {
                color: #a6a6a6;
                font-size: 14px;
                margin-right: 4px;
                display: none;
              }
              .command-text {
                color: #e8eaed;
                font-size: 14px;
                background: #2d2d2d;
                border: 1px solid #4285f4;
                border-radius: 4px;
                padding: 2px 6px;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                display: none;
              }
              .input-field {
                flex: 1;
                min-height: 32px;
                background: transparent;
                border: none;
                color: #e8eaed;
                padding: 0 12px;
                font-size: 14px;
                outline: none;
              }
              .input-field::placeholder {
                color: #a6a6a6;
              }
              .submit-btn {
                display: none;
                align-items: center;
                justify-content: center;
                background: #ffffff00;
                border: none;
                padding: 6px;
                border-radius: 50%;
                cursor: pointer;
                color: white;
                min-width: 32px;
                height: 32px;
                margin-right: 4px;
                font-size: 12px;
              }
              .submit-btn:hover {
                background: #ffffff00;
              }
              .confirm-btn {
                display: none;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                padding: 6px;
                border-radius: 50%;
                cursor: pointer;
                color: #a6a6a6;
                min-width: 32px;
                height: 32px;
                margin-right: 4px;
                font-size: 12px;
              }
              .confirm-btn:hover {
                background: rgba(255, 255, 255, 0.1);
              }
              .close-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                padding: 6px;
                border-radius: 50%;
                cursor: pointer;
                color: #a6a6a6;
                min-width: 32px;
                height: 32px;
              }
              .close-btn:hover {
                background: rgba(255, 255, 255, 0.1);
              }
              svg {
                width: 16px;
                height: 16px;
              }
              .step-display {
                display: inline-flex;
                align-items: center;
                gap: 2px;
                margin-left: 8px;
                background: #2d2d2d;
                border: 1px solid #666;
                border-radius: 4px;
                padding: 1px 6px;
                font-size: 12px;
                color: #fff;
                font-family: monospace;
              }
              .current-step {
                color:#f0f0f0;
              }
              .step-separator {
                color: #888;
              }
              .total-step {
                color: #f0f0f0;
              }
              .hide {
                display: none;
              }
              .tooltip {
                position: absolute;
                background: #2d2d2d;
                color: #e8eaed;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                pointer-events: none;
                z-index: 1000;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                border: 1px solid #3c3c3c;
              }
              .tooltip::after {
                content: '';
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%);
                border: 4px solid transparent;
                border-top-color: #2d2d2d;
              }
              .input-tooltip {
                position: absolute;
                background: #2d2d2d;
                color: #e8eaed;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 12px;
                white-space: normal;
                pointer-events: none;
                z-index: 1001;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                border: 1px solid #4285f4;
                max-width: 300px;
                word-wrap: break-word;
              }
              .input-tooltip::after {
                content: '';
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%);
                border: 4px solid transparent;
                border-top-color: #4285f4;
              }
            `
          }
        },
        'prefs/': {
          'tooltips.json': {
            raw: JSON.stringify({
              quick_actions: true,
              input_field: false
            })
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/quick_actions/quick_actions.js")
},{"DOCS":4,"STATE":1,"net_helper":17}],21:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const { resource } = require('helpers')

module.exports = quick_editor
let is_called
const nesting = 0

async function quick_editor (opts) {
  // ----------------------------------------
  let init; let data; let port; let labels; let nesting_limit; let top_first; let select = []
  const current_data = {}

  const { sdb, io, net } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject
  }
  // ----------------------------------------
  const el = document.createElement('div')
  el.classList.add('quick-editor')
  const shadow = el.attachShadow({ mode: 'closed' })

  shadow.innerHTML = `
  <button class="dots-button">⋮</button>
  <div class="quick-box">
    <div class="quick-menu hidden">
      <div class="btn-box">
        <button class="button">Apply</button>
        ${is_called
    ? ''
    : `
          <button class="button import">Import</button>
          <button class="button export">Export</button>
          <input type="file" accept='.json' hidden />`
}
      </div>
    </div>
  </div>`

  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]
  const menu_btn = shadow.querySelector('.dots-button')
  const menu = shadow.querySelector('.quick-menu')
  const import_btn = shadow.querySelector('.button.import')
  const export_btn = shadow.querySelector('.button.export')
  const input = shadow.querySelector('input')
  const apply_btn = shadow.querySelector('.button')
  // ----------------------------------------
  // EVENTS
  // ----------------------------------------
  await sdb.watch(onbatch)
  menu_btn.onclick = on_menu_btn_click

  function on_menu_btn_click () { menu_click(false) }

  if (is_called) {
    apply_btn.onclick = apply
    menu_btn.onclick = on_called_menu_btn_click

    function on_called_menu_btn_click () { menu_click(true) }

    labels = ['Nodes', 'Types', 'Files']
    nesting_limit = nesting + 3
    top_first = 0
  } else {
    apply_btn.onclick = on_apply_switch_click
    input.onchange = upload
    import_btn.onclick = on_import_btn_click
    export_btn.onclick = on_export_btn_click

    function on_apply_switch_click () { port.postMessage({ type: 'swtch', data: [{ name: current_data.Types.trim(), type: current_data.Names.trim() }] }) }
    function on_import_btn_click () { input.click() }
    function on_export_btn_click () {
      if (current_data.radio.name === 'Names') {
        port.postMessage({ type: 'export_db', data: [{ name: current_data.Names.trim(), type: current_data.Types.trim() }] })
      } else {
        port.postMessage({ type: 'export_root', data: [{ name: current_data.Root.trim(), type: current_data.Nodes.trim() }] })
      }
    }

    menu.classList.add('admin')
    labels = ['Root', 'Types', 'Names', 'Nodes', 'Files', 'Entries']
    nesting_limit = nesting + 6
    top_first = 1
    select = [1, 0, 1, 0, 0, 0]
  }

  // ----------------------------------------
  // IO
  // ----------------------------------------
  const item = resource()
  io.on(register_port_channel)

  function register_port_channel (port) {
    const { by, to } = port
    item.set(port.to, port)

    port.onmessage = on_port_message

    function on_port_message (event) {
      const txt = event.data
      const key = `[${by} -> ${to}]`
      console.log(key)
      data = txt
      if (init) {
        menu_click(false)
        init = false
        menu_click(false)
      }
    }
  }

  await io.at(net.page.id)
  is_called = true
  return el

  // ----------------------------------------
  // FUNCTIONS
  // ----------------------------------------
  function upload (e) {
    const file = e.target.files[0]
    const reader = new FileReader()
    reader.onload = on_reader_load

    function on_reader_load (event) {
      const content = event.target.result
      try {
        data = JSON.parse(content)
        console.log(file)
        if (current_data.radio.name === 'Names') { port.postMessage({ type: 'import_db', data: [data] }) } else { port.postMessage({ type: 'import_root', data: [data, file.name.split('.')[0]] }) }
      } catch (err) {
        console.error('Invalid JSON file', err)
      }
    }

    reader.readAsText(file)
  }
  function make_btn (name, classes, key, nesting) {
    const btn = document.createElement('button')
    if (select[nesting]) {
      btn.innerHTML = `
        <input type='radio' name='${key}' /> ${name}
      `
      const input = btn.querySelector('input')
      input.onchange = on_radio_input_change

      function on_radio_input_change () { radio_change(input) }
    } else { btn.textContent = name }
    btn.classList.add(...classes.split(' '))
    btn.setAttribute('tab', name.replaceAll(/[^A-Za-z0-9]/g, ''))
    btn.setAttribute('key', key)
    btn.setAttribute('title', name)
    return btn
  }
  function make_tab (id, classes, sub_classes, nesting = 0) {
    const tab = document.createElement('div')
    tab.classList.add(...classes.split(' '), id.replaceAll(/[^A-Za-z0-9]/g, ''))

    let height
    if (nesting % 2 === top_first) height = 565 - ((nesting + 1) * 30) + 'px'
    else tab.style.maxWidth = 700 - ((nesting + 1) * 47) + 'px'

    tab.innerHTML = `
      <div class="${sub_classes[0]}" style="--before-content: '${labels[nesting]}'; max-height: ${height}">
      </div>
      <div class="${sub_classes[1]}">
      </div>
    `

    return tab
  }
  function make_textarea (id, classes, value, nesting) {
    const textarea = document.createElement('textarea')
    textarea.id = id.replaceAll(/[^A-Za-z0-9]/g, '')
    textarea.classList.add(...classes.split(' '))
    textarea.value = typeof (value) === 'object' ? JSON.stringify(value, null, 2) : value
    textarea.placeholder = 'Type here...'
    textarea.style.width = 700 - ((nesting + 2) * 47) + 'px'
    return textarea
  }
  function radio_change (radio) {
    current_data.radio && (current_data.radio.checked = false)
    current_data.radio = radio
  }
  async function menu_click (call) {
    port = await item.get(net.page.id)
    menu.classList.toggle('hidden')
    if (init) { return }
    init = true

    const old_box = menu.querySelector('.tab-content')
    old_box && old_box.remove()

    const box = make_tab('any', 'tab-content active' + (top_first ? '' : ' sub'), ['btns', 'tabs'])
    menu.append(box)
    make_tabs(box, data, nesting)
  }
  function make_tabs (box, data, nesting) {
    const local_nesting = nesting + 1
    const not_last_nest = local_nesting !== nesting_limit
    let sub = ''
    if (local_nesting % 2 === top_first) { sub = ' sub' }
    const btns = box.querySelector('.btns')
    const tabs = box.querySelector('.tabs')
    Object.entries(data).forEach(create_tab_entry)

    function create_tab_entry (entry, i) {
      const [key, value] = entry
      let first = ''
      if (!i) {
        first = ' active'
        current_data[labels[nesting]] = key
      }

      const btn = make_btn(key, `tab-button${first}`, labels[nesting], nesting)
      const tab = make_tab(key, `tab-content${sub + first}`, ['btns', 'tabs'], local_nesting)
      btn.onclick = on_tab_button_click

      function on_tab_button_click () { tab_btn_click(btn, btns, tabs, '.root-tabs > .tab-content', 'node', key) }

      btns.append(btn)
      tabs.append(tab)
      if (typeof (value) === 'object' && value !== null && not_last_nest && Object.keys(value).length) { make_tabs(tab, value, local_nesting) } else {
        const textarea = make_textarea(key, `subtab-textarea${first}`, value, local_nesting)
        tab.append(textarea)
      }
    }
  }
  function tab_btn_click (btn, btns, tabs) {
    btns.querySelector('.active').classList.remove('active')
    tabs.querySelector(':scope > .active').classList.remove('active')

    btn.classList.add('active')
    const tab = tabs.querySelector('.' + btn.getAttribute('tab'))
    tab.classList.add('active')
    current_data[btn.getAttribute('key')] = btn.textContent

    recurse(tab)
    function recurse (tab) {
      const btn = tab.querySelector('.btns > .active')
      if (!btn) { return }
      current_data[btn.getAttribute('key')] = btn.textContent
      const sub_tab = tab.querySelector('.tabs > .active')
      recurse(sub_tab)
    }
  }

  function apply () {
    let raw = shadow.querySelector('.tab-content.active .tab-content.active textarea.active').value
    if (current_data.Files.split('.')[1] === 'json') { raw = JSON.parse(raw) }
    port.postMessage({
      type: 'put',
      data: [
        current_data.dataset + current_data.file,
        raw,
        current_data.node
      ]
    })
  }

  function inject (data) { sheet.replaceSync(data[0]) }
  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail (data, type) { console.warn('invalid message', { cause: { data, type } }) }
}

function fallback_module () {
  return {
    api: fallback_instance
  }
  function fallback_instance () {
    return {
      drive: {
        'style/': {
          'quick_editor.css': {
            raw: `
            .dots-button {
              border: none;
              font-size: 24px;
              cursor: pointer;
              line-height: 1;
              background-color: white;
              letter-spacing: 1px;
              padding: 3px 5px;
              border-radius: 20%;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }

            .quick-menu {
              display: flex;
              position: absolute;
              top: 100%;
              right: 0;
              background: white;
              padding: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.15);
              white-space: nowrap;
              z-index: 10;
              width: fit-content;
            }
            *{
              box-sizing: border-box;
            }

            .hidden {
              display: none;
            }
            
            .btns::before {
              display: none;
              content: var(--before-content);
              font-weight: bold;
              color: white;
              background: #4CAF50;
              padding: 2px 6px;
              border-radius: 4px;
              position: absolute;
              margin-left: -10px;
              margin-top: -20px;
            }
            .btns:hover {
              border: 2px solid #4CAF50;
            }
            .btns:hover::before {
              display: block;
            }
            .btns{
              display: flex;
              margin-bottom: 8px;
              overflow-x: auto;
              background: #d0f0d0;
            }
            .sub > .btns {
              display: flex;
              flex-direction: column;
              gap: 4px;
              max-height: 400px;
              overflow-y: auto;
              min-width: fit-content;
              margin-right: 8px;
              background: #d0d2f0ff;
            }

            .tab-button {
              flex: 1;
              padding: 6px;
              background: #eee;
              border: none;
              cursor: pointer;
              border-bottom: 2px solid transparent;
              max-width: 70px;
              width: fit-content;
              text-overflow: ellipsis;
              overflow: hidden;
              min-width: 70px;
              min-height: 29px;
              position: relative;
              text-align: left;
            }
            .tab-button.active {
              background: #fff;
              border-bottom: 2px solid #4CAF50;
            }
            .sub > div > .tab-button.active {
              border-bottom: 2px solid #2196F3;
            }
            .tab-content {
              display: none;
              max-width: 700px;
              background: #d0d2f0ff;
            }
            .tab-content.active {
              display: block;
            }
            .tab-content.sub.active{
              display: flex;
              align-items: flex-start;
            }

            textarea {
              width: 500px;
              max-width: 560px;
              height: 400px;
              display: block;
              resize: vertical;
            }

            .button {
              display: block;
              margin-top: 10px;
              padding: 5px 10px;
              background-color: #4CAF50;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              height: fit-content;
              self-align: end;
              width: 100%;
            }
            .btn-box {
              border-right: 1px solid #ccc;
              padding-right: 10px;
            }
            .tabs{
              border-left: 2px solid #ccc;
              border-top: 1px solid #ccc;
            }
            button:has(input[type="radio"]:checked){
              background: #45abffff;
            }
            button > input[type="radio"]{
              width: 12px;
              height: 12px;
              border: 2px solid #555;
              border-radius: 50%;
              display: inline-block;
              position: relative;
              cursor: pointer;
              margin: 0;
            }
            `
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/quick_editor/quick_editor.js")
},{"STATE":1,"helpers":14}],22:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const DOCS = require('DOCS')
const net = require('net_helper')

module.exports = steps_wizard

async function steps_wizard (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject
  }

  let variables = []
  let currentActiveStep = 0
  const docs = DOCS(__filename)(opts.sid)
  const { io, _ } = net(id)

  io.on = {
    up: onmessage
  }
  if (invite) io.accept(invite)

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="steps-wizard main">
    <div class="steps-container">
      <div class="steps-slot"></div>
    </div>
  </div>`
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]
  const steps_wizard_main = shadow.querySelector('.steps-wizard')
  const steps_entries = shadow.querySelector('.steps-slot')
  await sdb.watch(onbatch)

  // for demo purpose
  render_steps([
    { name: 'Optional Step', type: 'optional', is_completed: false, component: 'form_input', status: 'default', data: '' },
    { name: 'Split Tile', type: 'mandatory', is_completed: false, component: 'form_tile_split_choice', status: 'default', data: '' },
    { name: 'Step 3', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' },
    { name: 'Step 4', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' },
    { name: 'Step 5', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' }
  ], false)

  return el

  function onmessage ({ type, data }) {
    // docs_toggle handled globally by DOCS module
    if (type === 'init_data') {
      // If data contains steps from the new action format, use them
      if (data) {
        render_steps(data, true)
      } else {
        // Fallback to default steps
        variables = [
          { name: 'Optional Step', type: 'optional', is_completed: false, component: 'form_input', status: 'default', data: '' },
          { name: 'Split Tile', type: 'mandatory', is_completed: false, component: 'form_tile_split_choice', status: 'default', data: '' },
          { name: 'Step 3', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: 'asdasd' },
          { name: 'Step 4', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' },
          { name: 'Step 5', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' }
        ]
        render_steps(variables, true)
      }
    }
  }

  function render_steps (steps, auto_focus_first) {
    if (!steps) { return }

    const is_single_step = steps.length === 1
    steps_wizard_main.style.display = is_single_step ? 'none' : ''

    steps_entries.innerHTML = ''
    currentActiveStep = 0

    steps.forEach(create_step_button)

    function create_step_button (step, index) {
      const btn = document.createElement('button')
      btn.className = 'step-button'
      btn.textContent = step.name + (step.type === 'optional' ? ' *' : '')
      btn.title = btn.textContent
      btn.setAttribute('data-step', index + 1)

      const accessible = can_access(index, steps)

      let status = 'default'
      if (!accessible) status = 'disabled'
      else if (step.is_completed) status = 'completed'
      else if (step.status === 'error') status = 'error'
      else if (step.type === 'optional') status = 'optional'

      btn.classList.add(`step-${status}`)

      if (index === currentActiveStep - 1 && index > 0) {
        btn.classList.add('back')
      }
      if (index === currentActiveStep + 1 && index < steps.length - 1) {
        btn.classList.add('next')
      }
      if (index === currentActiveStep) {
        btn.classList.add('active')
      }

      btn.onclick = docs.wrap(on_step_click, get_doc_content)

      async function on_step_click () {
        console.log('Clicked:', step)
        currentActiveStep = index
        center_step(btn)
        render_steps(steps, false)
        _.up('step_clicked', { ...step, index, total_steps: steps.length, is_accessible: accessible }, {})
      }

      async function get_doc_content () {
        const doc_file = await drive.get('docs/README.md')
        return doc_file.raw || 'No documentation available'
      }

      steps_entries.appendChild(btn)

      if (auto_focus_first && index === 0) {
        btn.classList.add('active')
        center_step(btn)
        _.up('step_clicked', { ...step, index: 0, total_steps: steps.length, is_accessible: accessible }, {})
      }
    }
  }

  function center_step (step_button) {
    const container_width = steps_entries.clientWidth
    const step_left = step_button.offsetLeft
    const step_width = step_button.offsetWidth

    const center_position = step_left - (container_width / 2) + (step_width / 2)

    steps_entries.scrollTo({
      left: center_position,
      behavior: 'smooth'
    })
  }

  function can_access (index, steps) {
    for (let i = 0; i < index; i++) {
      if (!steps[i].is_completed && steps[i].type !== 'optional') {
        return false
      }
    }

    return true
  }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }
  function fail (data, type) { console.warn('invalid message', { cause: { data, type } }) }

  function inject (data) { sheet.replaceSync(data[0]) }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      DOCS: {
        $: ''
      },
      net_helper: {
        $: ''
      }
    }
  }

  function fallback_instance () {
    return {
      _: {
        DOCS: {
          0: ''
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        },
        'style/': {
          'stepswizard.css': {
            $ref: 'stepswizard.css'
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/steps_wizard/steps_wizard.js")
},{"DOCS":4,"STATE":1,"net_helper":17}],23:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const DOCS = require('DOCS')
const net = require('net_helper')

module.exports = tabbed_editor

async function tabbed_editor (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject,
    files: onfiles,
    active_tab: onactivetab
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="tabbed-editor main">
    <div class="editor-content">
      <div class="editor-placeholder">
        <div class="placeholder-text">Select a file to edit</div>
      </div>
    </div>
  </div>`
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]
  const editor_content = shadow.querySelector('.editor-content')

  let init = false
  let files = {}
  let active_tab = null
  let current_editor = null
  const on_message = {
    switch_tab: handle_switch_tab,
    close_tab: handle_close_tab,
    toggle_tab: handle_toggle_tab
  }

  const { io, _ } = net(id)
  io.on = {
    up: onmessage
  }
  if (invite) io.accept(invite)
  await sdb.watch(onbatch)

  return el

  function onmessage (msg) {
    const handler = on_message[msg.type] || onmessage_fail
    handler(msg)
  }

  function handle_switch_tab (msg) { switch_to_tab(msg.data, msg) }
  function handle_close_tab (msg) { close_tab(msg.data, msg) }
  function handle_toggle_tab (msg) { toggle_tab(msg.data, msg) }
  function onmessage_fail () { /* docs_toggle @TODO */ }

  function switch_to_tab (tab_data, msg) {
    if (active_tab === tab_data.id) {
      return
    }

    active_tab = tab_data.id
    create_editor(tab_data)
    _.up('tab_switched', tab_data, msg?.head ? { cause: msg.head } : {})
  }

  function toggle_tab (tab_data, msg) {
    if (active_tab === tab_data.id) {
      hide_editor()
      active_tab = null
    } else {
      switch_to_tab(tab_data, msg)
    }
  }

  function close_tab (tab_data, msg) {
    if (active_tab === tab_data.id) {
      hide_editor()
      active_tab = null
    }

    _.up('tab_closed', tab_data, msg.head ? { cause: msg.head } : {})
  }

  function create_editor (tab_data) {
    const parsed_data = JSON.parse(tab_data[0])
    const file_content = files[parsed_data.id] || ''
    // console.log('Creating editor for:', parsed_data)

    editor_content.replaceChildren()

    editor_content.innerHTML = `
    <div class="code-editor">
    <div class="editor-wrapper">
      <div class="line-numbers"></div>
      <textarea class="code-area" placeholder="Start editing ${parsed_data.name || parsed_data.id}...">${file_content}</textarea>
    </div>
    </div>`
    const editor = editor_content.querySelector('.code-editor')
    const line_numbers = editor_content.querySelector('.line-numbers')
    const code_area = editor_content.querySelector('.code-area')
    current_editor = { editor, code_area, line_numbers, tab_data: parsed_data }

    code_area.oninput = handle_code_input
    code_area.onscroll = handle_code_scroll

    update_line_numbers()
  }

  function hide_editor () {
    editor_content.innerHTML = `
      <div class="editor-placeholder">
        <div class="placeholder-text">Select a file to edit</div>
      </div>`
    current_editor = null
  }

  function update_line_numbers () {
    if (!current_editor) return

    const { code_area, line_numbers } = current_editor
    const lines = code_area.value.split('\n')
    const line_count = lines.length

    let line_html = ''
    for (let i = 1; i <= line_count; i++) {
      line_html += `<div class="line-number">${i}</div>`
    }

    line_numbers.innerHTML = line_html
  }

  function save_file_content () {
    if (!current_editor) return

    const { code_area, tab_data } = current_editor
    files[tab_data.id] = code_area.value
    _.up('file_changed', {
      id: tab_data.id,
      content: code_area.value
    }, {})
  }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }
    if (!init) {
      init = true
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail (data, type) { console.warn('Invalid message', { data, type }) }
  function inject (data) { sheet.replaceSync(data[0]) }
  function onfiles (data) { files = data[0] }

  function onactivetab (data) {
    if (data.id !== active_tab) {
      switch_to_tab(data)
    }
  }

  function handle_code_input () {
    update_line_numbers()
    save_file_content()
  }

  function handle_code_scroll () {
    if (!current_editor) return
    const { code_area, line_numbers } = current_editor
    line_numbers.scrollTop = code_area.scrollTop
  }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      DOCS: {
        $: ''
      },
      net_helper: {
        $: ''
      }
    }
  }

  function fallback_instance () {
    return {
      _: {
        DOCS: {
          0: ''
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'files/': {
          'example.js': {
            raw: `
              function hello() {
                console.log("Hello, World!");
              }

              const x = 42;
              let y = "string";

              if (x > 0) {
                hello();
              }
            `
          },
          'example.md': {
            raw: `
              # Example Markdown
              This is an **example** markdown file.

              ## Features

              - Syntax highlighting
              - Line numbers
              - File editing

              \`\`\`javascript
              function example() {
                return true;
              }
              \`\`\`
            `
          },
          'data.json': {
            raw: `
              {
                "name": "example",
                "version": "1.0.0",
                "dependencies": {
                "lodash": "^4.17.21"
              }
            `
          }
        },
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        },
        'style/': {
          'theme.css': {
            raw: `
              .tabbed-editor {
                width: 100%;
                height: 100%;
                min-height: 80px;
                background-color: #0d1117;
                color: #e6edf3;
                font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', monospace;
                display: grid;
                grid-template-rows: 1fr;
                position: relative;
                border: 1px solid #30363d;
                border-radius: 6px;
                overflow: hidden;
              }

              .editor-content {
                display: grid;
                grid-template-rows: 1fr;
                min-height: 0;
                position: relative;
                overflow: hidden;
                background-color: #0d1117;
              }

              .editor-placeholder {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: #7d8590;
                font-style: italic;
                font-size: 16px;
                background: linear-gradient(135deg, #0d1117 0%, #161b22 100%);
              }

              .code-editor {
                height: 100%;
                min-height: 0;
                display: grid;
                grid-template-rows: 1fr;
                background-color: #0d1117;
              }

              .editor-wrapper {
                display: grid;
                grid-template-columns: auto 1fr;
                min-height: 0;
                height: 100%;
                position: relative;
                overflow: auto;
                background-color: #0d1117;
              }

              .line-numbers {
                background-color: #161b22;
                color: #7d8590;
                padding: 12px 16px;
                text-align: right;
                user-select: none;
                font-size: 13px;
                line-height: 20px;
                font-weight: 400;
                border-right: 1px solid #21262d;
                position: sticky;
                left: 0;
                z-index: 1;
                height: 100%;
              }

              .line-number {
                height: 20px;
                line-height: 20px;
                transition: color 0.1s ease;
              }

              .line-number:hover {
                color: #f0f6fc;
              }

              .code-area {
                background-color: #0d1117;
                color: #e6edf3;
                border: none;
                outline: none;
                resize: none;
                font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', monospace;
                font-size: 13px;
                line-height: 20px;
                padding: 12px 16px;
                position: relative;
                z-index: 2;
                tab-size: 2;
                white-space: pre;
                overflow-wrap: normal;
                overflow-x: auto;
              }

              .code-area:focus {
                background-color: #0d1117;
                box-shadow: none;
              }

              .code-area::selection {
                background-color: #264f78;
              }

              .editor-wrapper::-webkit-scrollbar {
                width: 8px;
                height: 8px;
              }

              .editor-wrapper::-webkit-scrollbar-track {
                background: #161b22;
              }

              .editor-wrapper::-webkit-scrollbar-thumb {
                background: #30363d;
                border-radius: 4px;
              }

              .editor-wrapper::-webkit-scrollbar-thumb:hover {
                background: #484f58;
              }
            `
          }
        },
        'active_tab/': {
          'current.json': {
            raw: JSON.stringify({
              id: 'example.js',
              name: 'example.js'
            })
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/tabbed_editor/tabbed_editor.js")
},{"DOCS":4,"STATE":1,"net_helper":17}],24:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const DOCS = require('DOCS')
const net = require('net_helper')

module.exports = component

async function component (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    variables: onvariables,
    style: inject,
    icons: iconject,
    scroll: onscroll
  }
  const div = document.createElement('div')
  const shadow = div.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="tab-entries main"></div>`
  const entries = shadow.querySelector('.tab-entries')
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]

  let init = false
  let variables = []
  let dricons = []
  const docs = DOCS(__filename)(opts.sid)
  const { io, _ } = net(id)

  // Register actions with DOCS system
  const actions_file = await drive.get('actions/commands.json')
  if (actions_file.raw) {
    const actions_data = typeof actions_file.raw === 'string' ? JSON.parse(actions_file.raw) : actions_file.raw
    docs.register_actions(actions_data)
  }

  await sdb.watch(onbatch)
  io.on = {
    up: onmessage
  }
  if (invite) io.accept(invite)
  if (entries) {
    let is_down = false
    let start_x
    let scroll_start

    function stop_drag_scroll () {
      is_down = false
      entries.classList.remove('grabbing')
      update_scroll_position()
    }

    function move_drag_scroll (pointer_x) {
      if (!is_down) return
      if (entries.scrollWidth <= entries.clientWidth) return stop_drag_scroll()
      entries.scrollLeft = scroll_start - (pointer_x - start_x) * 1.5
    }

    entries.onmousedown = on_entries_mousedown

    function on_entries_mousedown (e) {
      if (entries.scrollWidth <= entries.clientWidth) return
      is_down = true
      entries.classList.add('grabbing')
      start_x = e.pageX - entries.offsetLeft
      scroll_start = entries.scrollLeft
      window.onmousemove = on_window_mousemove
      window.onmouseup = on_window_mouseup
    }

    function on_window_mousemove (e) {
      move_drag_scroll(e.pageX - entries.offsetLeft)
      e.preventDefault()
    }

    function on_window_mouseup () {
      stop_drag_scroll()
      window.onmousemove = null
      window.onmouseup = null
    }

    entries.onmouseleave = stop_drag_scroll
    entries.ontouchstart = on_entries_touchstart

    function on_entries_touchstart (e) {
      if (entries.scrollWidth <= entries.clientWidth) return
      is_down = true
      start_x = e.touches[0].pageX - entries.offsetLeft
      scroll_start = entries.scrollLeft
    }

    ;['ontouchend', 'ontouchcancel'].forEach(bind_touch_end_handler)
    entries.ontouchmove = on_entries_touchmove

    function bind_touch_end_handler (event_name) { entries[event_name] = stop_drag_scroll }
    function on_entries_touchmove (e) {
      move_drag_scroll(e.touches[0].pageX - entries.offsetLeft)
      e.preventDefault()
    }
  }
  return div

  function onmessage (msg) {
    const { type, data } = msg
    console.error('tabs: onmessage', type, data)

    if (type === 'add_link_tab') {
      console.error('tabs: adding link tab', data)
      add_link_tab(data)
    } else if (type === 'remove_link_tab') {
      console.error('tabs: removing link tab', data)
      remove_link_tab(data)
    } else if (type === 'add_default_tab') {
      console.error('tabs: adding default tab', data)
      add_default_tab(data)
    }
  }

  function add_default_tab ({ name, program, tile_id }) {
    const tab_id = `tab_${Date.now()}`

    const el = document.createElement('div')
    el.innerHTML = `
    <span class="icon">${dricons[1] || '📄'}</span>
    <span class='name'>${tab_id}</span>
    <span class="name">${name || 'New Tab'}</span>
    <button class="btn">${dricons[0] || '×'}</button>`

    el.className = 'tabsbtn default-tab active'
    el.setAttribute('data-tab-id', tab_id)
    el.setAttribute('data-program', program || 'text_editor')

    const name_el = el.querySelector('.name')
    const close_btn = el.querySelector('.btn')

    name_el.onclick = () => {
      console.error('tabs: default tab clicked', tab_id)
      entries.querySelectorAll('.tabsbtn').forEach(t => t.classList.remove('active'))
      el.classList.add('active')
      _.up('tab_name_clicked', { id: tab_id, name, program }, {})
    }

    close_btn.onclick = (e) => {
      e.stopPropagation()
      console.error('tabs: default tab close clicked', tab_id)
      el.remove()
      _.up('tab_close_clicked', { id: tab_id, name }, {})
    }

    entries.appendChild(el)
    console.error('tabs: default tab added', tab_id)
  }

  function add_link_tab ({ tile_id, name, direction }) {
    const link_tab_id = `split_tile_${tile_id}`
    const existing = entries.querySelector(`[data-link-tab-id="${link_tab_id}"]`)
    if (existing) {
      console.error('tabs: link tab already exists', link_tab_id)
      return
    }

    const el = document.createElement('div')
    el.innerHTML = `
    <span class="icon">⊞</span>
    <span class='name'>${link_tab_id}</span>
    <span class="name">${name || 'Split ' + direction}</span>
    <button class="btn">${dricons[0] || '×'}</button>`

    el.className = 'tabsbtn link-tab'
    el.setAttribute('data-link-tab-id', link_tab_id)
    el.setAttribute('data-tile-id', tile_id)

    const name_el = el.querySelector('.name')
    const close_btn = el.querySelector('.btn')

    name_el.onclick = () => {
      console.error('tabs: link tab clicked', link_tab_id)
      _.up('link_tab_clicked', { tile_id, link_tab_id }, {})
    }

    close_btn.onclick = (e) => {
      e.stopPropagation()
      console.error('tabs: link tab close clicked', link_tab_id)
      _.up('link_tab_close_clicked', { tile_id, link_tab_id }, {})
    }

    entries.appendChild(el)
    console.error('tabs: link tab added', link_tab_id)
  }

  function remove_link_tab ({ tile_id }) {
    const link_tab_id = `split_tile_${tile_id}`
    const el = entries.querySelector(`[data-link-tab-id="${link_tab_id}"]`)
    if (el) {
      el.remove()
      console.error('tabs: link tab removed', link_tab_id)
    }
  }

  async function create_btn ({ name, id }, index) {
    const el = document.createElement('div')
    el.innerHTML = `
    <span class="icon">${dricons[index + 1]}</span>
    <span class='name'>${id}</span>
    <span class="name">${name}</span>
    <button class="btn">${dricons[0]}</button>`

    el.className = 'tabsbtn'
    const name_el = el.querySelector('.name')
    const close_btn = el.querySelector('.btn')

    name_el.draggable = false

    // Add click handler for tab name (switch/toggle tab)
    name_el.onclick = docs.wrap(on_tab_name_click, get_doc_content)

    async function on_tab_name_click () {
      if (_) {
        const data = {
          type: 'tab',
          sid: opts.sid
        }
        _.up('ui_focus', data, {})
        _.up('tab_name_clicked', { id, name }, {})
      }
    }

    async function get_doc_content () {
      const doc_file = await drive.get('docs/README.md')
      return doc_file.raw || 'No documentation available'
    }

    // Add click handler for close button
    close_btn.onclick = docs.wrap(on_tab_close_click, get_doc_content)

    async function on_tab_close_click (e) {
      e.stopPropagation()
      if (_) {
        const data = {
          type: 'tab',
          sid: opts.sid
        }
        _.up('ui_focus', data, {})
        _.up('tab_close_clicked', { id, name }, {})
      }
    }

    entries.appendChild(el)
  }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }
    if (!init) {
      variables.forEach(create_btn)
      init = true
    } else {
      // TODO: Here we can handle drive updates
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }
  function fail (data, type) { console.warn('invalid message', { cause: { data, type } }) }
  function inject (data) { sheet.replaceSync(data[0]) }

  function onvariables (data) {
    const vars = typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]
    variables = vars
  }

  function iconject (data) { dricons = data }

  function update_scroll_position () {
    // TODO
  }

  function onscroll (data) {
    setTimeout(apply_scroll_position, 200)
    function apply_scroll_position () {
      if (entries) {
        entries.scrollLeft = data
      }
    }
  }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      DOCS: {
        $: ''
      },
      net_helper: {
        $: ''
      }
    }
  }
  function fallback_instance () {
    return {
      _: {
        DOCS: {
          0: ''
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'icons/': {
          'cross.svg': {
            $ref: 'cross.svg'
          },
          '1.svg': {
            $ref: 'icon.svg'
          },
          '2.svg': {
            $ref: 'icon.svg'
          },
          '3.svg': {
            $ref: 'icon.svg'
          }
        },
        'actions/': {
          'commands.json': {
            raw: JSON.stringify([
              {
                name: 'New Tab',
                icon: 'plus',
                status: {
                  pinned: true,
                  default: true
                },
                steps: [
                  { name: 'Enter Tab Name', type: 'optional', is_completed: false, component: 'form_input', status: 'default', data: '' }
                ]
              },
              {
                name: 'Duplicate Tab',
                icon: 'copy',
                status: {
                  pinned: false,
                  default: false
                },
                steps: [
                  { name: 'Select Tab to Duplicate', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' },
                  { name: 'Enter New Tab Name', type: 'optional', is_completed: false, component: 'form_input', status: 'default', data: '' }
                ]
              },
              {
                name: 'Close Tab',
                icon: 'close',
                status: {
                  pinned: false,
                  default: true
                },
                steps: [
                  { name: 'Select Tab to Close', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' },
                  { name: 'Confirm Close', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' }
                ]
              }
            ])
          }
        },
        'variables/': {
          'tabs.json': {
            $ref: 'tabs.json'
          }
        },
        'scroll/': {
          'position.json': {
            raw: '100'
          }
        },
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        },
        'style/': {
          'theme.css': {
            $ref: 'style.css'
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/tabs/tabs.js")
},{"DOCS":4,"STATE":1,"net_helper":17}],25:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const state_db = STATE(__filename)
const { get } = state_db(fallback_module)
const DOCS = require('DOCS')
const net = require('net_helper')

const tabs_component = require('tabs')
const task_manager = require('task_manager')

module.exports = tabsbar

async function tabsbar (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject,
    icons: inject_icons
  }

  let dricons = {}
  let docs_toggle_active = false
  const on_message = {
    docs_toggle: handle_docs_toggle,
    add_link_tab: handle_forward_tabs,
    remove_link_tab: handle_forward_tabs
  }
  const { io, _ } = net(id)
  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  const docs = DOCS(__filename)(opts.sid)
  // Register actions with DOCS system
  const actions_file = await drive.get('actions/command.json')
  if (actions_file.raw) {
    const actions_data = typeof actions_file.raw === 'string' ? JSON.parse(actions_file.raw) : actions_file.raw
    docs.register_actions(actions_data)
  }

  io.on = {
    up: onmessage,
    tabs: tabs_protocol,
    task_manager: task_manager_protocol
  }
  if (invite) {
    io.accept(invite)
    const data = {
      type: 'wizard_hat',
      sid: opts.sid
    }
    _.up('ui_focus', data, {})
  }

  shadow.innerHTML = `
  <div class="tabs-bar-container main">
  <button class="hat-btn"></button>
  <tabs></tabs>
  <task-manager></task-manager>
  <button class="bar-btn"></button>
  </div>`
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]
  const hat_btn = shadow.querySelector('.hat-btn')
  const bar_btn = shadow.querySelector('.bar-btn')

  const subs = await sdb.watch(onbatch)

  function onload (svg) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svg, 'image/svg+xml')
    const svgElem = doc.documentElement
    hat_btn.replaceChildren(svgElem)
    hat_btn.onclick = docs.wrap(hat_click, get_doc_content)
  }
  if (dricons[0]) {
    onload(dricons[0])
  }
  if (dricons[2]) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(dricons[2], 'image/svg+xml')
    const svgElem = doc.documentElement
    bar_btn.replaceChildren(svgElem)
    bar_btn.onclick = on_bar_btn_click

    function on_bar_btn_click () {
      docs_toggle_active = !docs_toggle_active
      // Send message to root module to set docs mode
      _.up('set_docs_mode', { active: docs_toggle_active }, {})
      // Also send docs_toggle notification for UI updates
      _.up('docs_toggle', { active: docs_toggle_active }, {})
      bar_btn.classList.toggle('active', docs_toggle_active)
      _.task_manager('docs_toggle', { active: docs_toggle_active }, {})
    }
  }
  const tabs = await tabs_component({ ...subs[0] }, io.invite('tabs', { up: id }))
  tabs.classList.add('tabs-bar')
  shadow.querySelector('tabs').replaceWith(tabs)

  const task_mgr = await task_manager({ ...subs[1] }, io.invite('task_manager', { up: id }))
  task_mgr.classList.add('bar-btn')
  shadow.querySelector('task-manager').replaceWith(task_mgr)

  return el

  async function get_doc_content () {
    const doc_file = await drive.get('docs/README.md')
    return doc_file.raw || 'No documentation available'
  }

  async function hat_click () {
    const data = {
      type: 'wizard_hat',
      sid: opts.sid
    }
    _.up('ui_focus', data, {})
  }
  function onmessage (msg) {
    const handler = on_message[msg.type] || onmessage_fail
    handler(msg)
  }

  function handle_docs_toggle (msg) { _.tabs(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  function handle_forward_tabs (msg) { _.tabs(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }

  function onmessage_fail () {
    // Handle other message types
  }

  function tabs_protocol (msg) { _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }

  function task_manager_protocol (msg) { _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail (data, type) { console.warn('invalid message', { cause: { data, type } }) }
  function inject (data) { sheet.replaceSync(data[0]) }
  function inject_icons (data) { dricons = data }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      tabs: {
        $: ''
      },
      task_manager: {
        $: ''
      },
      DOCS: {
        $: ''
      },
      net_helper: {
        $: ''
      }
    }
  }

  function fallback_instance () {
    return {
      _: {
        tabs: {
          0: '',
          mapping: {
            icons: 'icons',
            variables: 'variables',
            scroll: 'scroll',
            style: 'style',
            docs: 'docs',
            actions: 'actions'
          }
        },
        task_manager: {
          0: '',
          mapping: {
            count: 'count',
            style: 'style',
            docs: 'docs',
            actions: 'actions'
          }
        },
        DOCS: {
          0: ''
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'style/': {
          'theme.css': {
            raw: `
              .tabs-bar-container {
                display: flex;
                flex: inherit;
                flex-direction: row;
                flex-wrap: nowrap;
                align-items: stretch;
              }
              .tabs-bar {
                display: flex;
                flex: auto;
                flex-direction: row;
                flex-wrap: nowrap;
                align-items: stretch;
                min-width: 256px;
              }
              .hat-btn, .bar-btn {
                display: flex;
                min-width: 32px;
                border: none;
                background: #131315;
                cursor: pointer;
                flex-direction: row;
                justify-content: center;
                align-items: center;
              }
              .bar-btn.active {
                background: #2d4a6d;
              }
            `
          }
        },
        'icons/': {
          '1.svg': {
            $ref: 'hat.svg'
          },
          '2.svg': {
            $ref: 'hat.svg'
          },
          '3.svg': {
            $ref: 'docs.svg'
          }
        },
        'actions/': {
          'command.json': {
            raw: JSON.stringify([
              {
                name: 'New File',
                icon: 'file',
                status: {
                  pinned: true,
                  default: true
                },
                steps: [
                  {
                    name: 'Enter File Name',
                    type: 'mandatory',
                    is_completed: false,
                    component: 'input_test',
                    status: 'default',
                    data: '',
                    commands: [
                      { type: 'set_mode', data: { mode: 'search' } },
                      { type: 'set_search_query', data: { query: 'file' } }
                    ]
                  },
                  { name: 'Choose Location', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' }
                ]
              },
              {
                name: 'Open File',
                icon: 'folder',
                status: {
                  pinned: false,
                  default: true
                },
                steps: [
                  {
                    name: 'Select File',
                    type: 'mandatory',
                    is_completed: false,
                    component: 'form_input',
                    status: 'default',
                    data: '',
                    commands: [
                      { type: 'set_mode', data: { mode: 'default' } },
                      { type: 'clear_selection', data: {} }
                    ]
                  }
                ]
              },
              {
                name: 'Save File',
                icon: 'save',
                status: {
                  pinned: true,
                  default: false
                },
                steps: [
                  { name: 'Choose Location', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' },
                  { name: 'Enter File Name', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' }
                ]
              },
              {
                name: 'Settings',
                icon: 'gear',
                status: {
                  pinned: false,
                  default: true
                },
                steps: [
                  {
                    name: 'Configure Settings',
                    type: 'optional',
                    is_completed: false,
                    component: 'input_test',
                    status: 'default',
                    data: '',
                    commands: [
                      { type: 'set_flag', data: { flag_type: 'hubs', value: 'true' } }
                    ]
                  }
                ]
              },
              {
                name: 'Help',
                icon: 'help',
                status: {
                  pinned: false,
                  default: false
                },
                steps: [
                  { name: 'View Documentation', type: 'optional', is_completed: false, component: 'form_input', status: 'default', data: '' }
                ]
              },
              {
                name: 'Terminal',
                icon: 'terminal',
                status: {
                  pinned: true,
                  default: true
                },
                steps: [
                  { name: 'Open Terminal', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' }
                ]
              },
              {
                name: 'Search',
                icon: 'search',
                status: {
                  pinned: false,
                  default: true
                },
                steps: [
                  {
                    name: 'Enter Search Query',
                    type: 'mandatory',
                    is_completed: false,
                    component: 'form_input',
                    status: 'default',
                    data: '',
                    commands: [
                      { type: 'set_mode', data: { mode: 'search' } },
                      { type: 'set_search_query', data: { query: 'action' } }
                    ]
                  },
                  {
                    name: 'Select Scope',
                    type: 'optional',
                    is_completed: false,
                    component: 'input_test',
                    status: 'default',
                    data: '',
                    commands: [
                      { type: 'set_flag', data: { flag_type: 'selection', value: 'default' } },
                      { type: 'get_selected', data: {} }
                    ]
                  }
                ]
              },
              {
                name: 'Split Tile',
                icon: 'split',
                status: {
                  pinned: false,
                  default: true
                },
                steps: [
                  {
                    name: 'Choose Split Direction',
                    type: 'mandatory',
                    is_completed: false,
                    component: 'form_tile_split_choice',
                    status: 'default',
                    data: ''
                  }
                ]
              }
            ])
          }
        },
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/tabsbar/tabsbar.js")
},{"DOCS":4,"STATE":1,"net_helper":17,"tabs":24,"task_manager":26}],26:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const DOCS = require('DOCS')
const net = require('net_helper')

module.exports = task_manager

async function task_manager (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const docs = DOCS(__filename)(opts.sid)

  // Register actions with DOCS system
  const actions_file = await drive.get('actions/commands.json')
  if (actions_file.raw) {
    const actions_data = typeof actions_file.raw === 'string' ? JSON.parse(actions_file.raw) : actions_file.raw
    docs.register_actions(actions_data)
  }

  const on = {
    style: inject,
    count: update_count
  }
  const { io, _ } = net(id)

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })

  shadow.innerHTML = `
  <div class="task-manager-container main">
    <button class="task-count-btn">0</button>
  </div>`
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]
  const btn = shadow.querySelector('.task-count-btn')

  io.on = {
    up: onmessage
  }
  if (invite) io.accept(invite)

  // DOCS.wrap() is used for automatic docs mode hook
  btn.onclick = docs.wrap(on_task_manager_click, get_doc_content)

  async function on_task_manager_click () {
    if (_) {
      const data = {
        type: 'task_manager',
        sid: opts.sid
      }
      _.up('ui_focus', data, {})
    }
  }

  async function get_doc_content () {
    const doc_file = await drive.get('docs/README.md')
    return doc_file.raw || 'No documentation available'
  }

  await sdb.watch(onbatch)

  return el

  function onmessage (msg) {
    // Temporary placeholder
  }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }
  function fail (data, type) { console.warn('invalid message', { cause: { data, type } }) }
  function inject (data) { sheet.replaceSync(data[0]) }
  function update_count (data) { if (btn) btn.textContent = data.toString() }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      DOCS: {
        $: ''
      },
      net_helper: {
        $: ''
      }
    }
  }

  function fallback_instance () {
    return {
      _: {
        DOCS: {
          0: ''
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'style/': {
          'theme.css': {
            raw: `
              .task-count-btn {
                background: #2d2d2d;
                color: #fff;
                border: none;
                border-radius: 100%;
                padding: 4px 8px;
                min-width: 24px;
                cursor: pointer;
                display: flex;
                align-items: center;
              }
              .task-count-btn:hover {
                background: #3d3d3d;
              }
            `
          }
        },
        'actions/': {
          'commands.json': {
            raw: JSON.stringify([
              {
                name: 'Kill Process',
                icon: 'stop',
                status: {
                  pinned: false,
                  default: true
                },
                steps: [
                  { name: 'Select Process', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' },
                  { name: 'Confirm Kill', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' }
                ]
              },
              {
                name: 'Restart Task',
                icon: 'refresh',
                status: {
                  pinned: true,
                  default: false
                },
                steps: [
                  { name: 'Select Task', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' },
                  { name: 'Confirm Restart', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' }
                ]
              },
              {
                name: 'Task Details',
                icon: 'info',
                status: {
                  pinned: false,
                  default: true
                },
                steps: [
                  { name: 'Select Task', type: 'mandatory', is_completed: false, component: 'form_input', status: 'default', data: '' },
                  { name: 'View Details', type: 'optional', is_completed: false, component: 'form_input', status: 'default', data: '' }
                ]
              }
            ])
          }
        },
        'count/': {
          'value.json': {
            raw: '3'
          }
        },
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/task_manager/task_manager.js")
},{"DOCS":4,"STATE":1,"net_helper":17}],27:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const net = require('net_helper')
const action_bar = require('action_bar')
const action_executor = require('action_executor')
const tabsbar = require('tabsbar')

module.exports = taskbar

async function taskbar (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject
  }
  const on_message = {
    update_steps_wizard_for_app: handle_update_steps_wizard_for_app,
    docs_toggle: handle_docs_toggle,
    load_actions: handle_load_actions,
    step_clicked: handle_step_clicked,
    update_quick_actions_for_app: handle_update_quick_actions_for_app,
    update_quick_actions_input: handle_update_quick_actions_input,
    show_submit_btn: handle_submit_btn_toggle,
    hide_submit_btn: handle_submit_btn_toggle,
    add_link_tab: handle_forward_tabsbar,
    remove_link_tab: handle_forward_tabsbar
  }
  const { io, _ } = net(id)

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })

  shadow.innerHTML = `
  <div class="taskbar-container main">
    <div class="action-executor-slot"></div>
    <div class="bottom-slot">
      <div class="action-bar-slot"></div>
      <div class="tabsbar-slot"></div>
    </div>
  </div>`
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]
  const action_executor_slot = shadow.querySelector('.action-executor-slot')
  const action_bar_slot = shadow.querySelector('.action-bar-slot')
  const tabsbar_slot = shadow.querySelector('.tabsbar-slot')

  const subs = await sdb.watch(onbatch)
  io.on = {
    up: onmessage,
    action_bar: action_bar_protocol,
    action_executor: action_executor_protocol,
    tabsbar: tabsbar_protocol
  }
  if (invite) io.accept(invite)

  const action_bar_el = await action_bar({ ...subs[0] }, io.invite('action_bar', { up: id }))
  action_bar_el.classList.add('replaced-action-bar')
  action_bar_slot.replaceWith(action_bar_el)

  const action_executor_el = await action_executor({ ...subs[1] }, io.invite('action_executor', { up: id }))
  action_executor_el.classList.add('replaced-action-executor')
  action_executor_slot.replaceWith(action_executor_el)

  const tabsbar_el = await tabsbar({ ...subs[2] }, io.invite('tabsbar', { up: id }))
  tabsbar_el.classList.add('replaced-tabsbar')
  tabsbar_slot.replaceWith(tabsbar_el)

  return el

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func({ data, type })
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function fail ({ data, type }) { console.warn('invalid message', { cause: { data, type } }) }

  function inject ({ data }) { sheet.replaceSync(data[0]) }

  // ---------
  // PROTOCOLS
  // ---------

  function action_bar_protocol (msg) {
    const action_handlers = {
      action_submitted: action_bar_forward_action_executor,
      selected_action: action_bar_forward_action_executor,
      activate_steps_wizard: action_bar_forward_action_executor,
      render_form: action_bar_forward_action_executor,
      console_history_toggle: action_bar_forward_up,
      ui_focus: action_bar_forward_up,
      display_actions: action_bar_forward_up,
      filter_actions: action_bar_forward_up
    }
    const handler = action_handlers[msg.type] || action_bar_forward_up
    handler(msg)

    function action_bar_forward_action_executor (msg) { _.action_executor(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
    function action_bar_forward_up (msg) { _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  }

  function action_executor_protocol (msg) {
    console.error('taskbar: action_executor_protocol', msg.type, msg.data)
    const action_handlers = {
      load_actions: action_executor__forward_action_bar,
      step_clicked: action_executor__forward_action_bar,
      show_submit_btn: action_executor__forward_action_bar,
      hide_submit_btn: action_executor__forward_action_bar,
      action_auto_completed: action_executor__auto_completed
    }
    const handler = action_handlers[msg.type] || action_executor__noop
    handler(msg)
    _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {})

    function action_executor__forward_action_bar (msg) { _.action_bar(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
    function action_executor__noop () {}

    function action_executor__auto_completed (msg) { _.action_bar('action_submitted', msg.data, msg.head ? { cause: msg.head } : {}) }
  }

  function tabsbar_protocol (msg) {
    const action_handlers = {
      docs_toggle: tabsbar_docs_toggle,
      link_tab_close_clicked: tabsbar_forward_up,
      link_tab_clicked: tabsbar_forward_up
    }
    const handler = action_handlers[msg.type] || tabsbar__noop
    handler(msg)
    _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {})

    function tabsbar_docs_toggle (msg) {
      _.action_bar(msg.type, msg.data, msg.head ? { cause: msg.head } : {})
      _.action_executor(msg.type, msg.data, msg.head ? { cause: msg.head } : {})
    }

    function tabsbar_forward_up (msg) { _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
    function tabsbar__noop () {}
  }

  function onmessage (msg) {
    const handler = on_message[msg.type] || onmessage_forward_action_bar
    handler(msg)
  }

  function handle_update_steps_wizard_for_app (msg) { _.action_executor(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  function handle_docs_toggle (msg) { _.action_bar(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  function handle_load_actions (msg) { _.action_bar(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  function handle_step_clicked (msg) { _.action_bar(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  function handle_update_quick_actions_for_app (msg) { _.action_bar(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  function handle_update_quick_actions_input (msg) { _.action_bar(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  function handle_submit_btn_toggle (msg) { _.action_bar(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  function handle_forward_tabsbar (msg) { _.tabsbar(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  function onmessage_forward_action_bar (msg) { _.action_bar(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      action_bar: {
        $: ''
      },
      action_executor: {
        $: ''
      },
      tabsbar: {
        $: ''
      },
      net_helper: {
        $: ''
      }
    }
  }

  function fallback_instance () {
    return {
      _: {
        action_bar: {
          0: '',
          mapping: {
            icons: 'icons',
            style: 'style',
            variables: 'variables',
            data: 'data',
            actions: 'actions',
            hardcons: 'hardcons',
            prefs: 'prefs',
            docs: 'docs'
          }
        },
        action_executor: {
          0: '',
          mapping: {
            style: 'style',
            variables: 'variables',
            docs: 'docs',
            data: 'data'
          }
        },
        tabsbar: {
          0: '',
          mapping: {
            icons: 'icons',
            style: 'style',
            docs: 'docs',
            actions: 'actions'
          }
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'style/': {
          'theme.css': {
            raw: `
              .taskbar-container {
                display: flex;
                background: #2d2d2d;
                column-gap: 1px;
                flex-direction: column;
                align-content: center;
                justify-content: center;
                container-type: inline-size;
              }
              .replaced-tabsbar {
                display: flex;
                flex: auto;
              }
              .replaced-action-bar {
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: flex-start;
                background: #131315;
              }
              .replaced-action-executor {
                display: flex;
              }
              .bottom-slot {
                display: flex;
                flex-direction: row;
                justify-content: space-between;
              }
              @container (max-width: 700px) {
                .bottom-slot {
                  flex-direction: column;
                }
              }
            `
          }
        },
        'icons/': {},
        'variables/': {},
        'data/': {},
        'actions/': {},
        'hardcons/': {},
        'prefs/': {},
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/taskbar/taskbar.js")
},{"STATE":1,"action_bar":5,"action_executor":6,"net_helper":17,"tabsbar":25}],28:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)
const net = require('net_helper')

const program_container = require('program_container')
const taskbar = require('taskbar')

module.exports = theme_widget

async function theme_widget (opts, invite) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject,
    focused: handle_focused
  }

  // Inline focus tracking (merged from focus_tracker)
  let last_focused = null
  const { io, _ } = net(id)

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="theme-widget main">
    <div class="program-container-slot"></div>
    <div class="taskbar-slot"></div>
  </div>
  `
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]
  const program_container_slot = shadow.querySelector('.program-container-slot')
  const taskbar_slot = shadow.querySelector('.taskbar-slot')

  const subs = await sdb.watch(onbatch)

  let program_container_el = null
  let taskbar_el = null
  io.on = {
    up: onmessage_from_root,
    program_container: program_container_protocol,
    taskbar: taskbar_protocol
  }
  if (invite) io.accept(invite)

  taskbar_el = await taskbar({ ...subs[1] }, io.invite('taskbar', { up: id }))
  taskbar_el.classList.add('taskbar')
  taskbar_slot.replaceWith(taskbar_el)

  program_container_el = await program_container({ ...subs[0] }, io.invite('program_container', { up: id }))
  program_container_el.classList.add('program-container')
  program_container_slot.replaceWith(program_container_el)

  return el

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func({ data, type })
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }

  function inject ({ data }) { sheet.replaceSync(data[0]) }

  // Inline focus tracker: reads persisted focused value to keep last_focused in sync
  function handle_focused ({ data }) {
    const focused = typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]
    last_focused = focused.value
  }

  function fail ({ data, type }) { console.warn('invalid message', { cause: { data, type } }) }

  function onmessage_from_root (msg) {
    const action_handlers = {
      update_actions_for_app: root_update_actions_for_app,
      update_quick_actions_for_app: root_forward_taskbar,
      update_steps_wizard_for_app: root_forward_taskbar,
      add_link_tab: root_forward_taskbar,
      remove_link_tab: root_forward_taskbar
    }
    const handler = action_handlers[msg.type] || fail
    handler(msg)

    function root_update_actions_for_app (msg) {
      if (_.program_container) _.program_container(msg.type, msg.data, msg.head ? { cause: msg.head } : {})
      else setTimeout(root_retry_send_program_container, 500, msg)
    }

    function root_retry_send_program_container (msg) { _.program_container(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
    function root_forward_taskbar (msg) { _.taskbar(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  }

  // Inline focus tracker: handles ui_focus messages from children
  function handle_ui_focus (msg) {
    if (last_focused !== msg.data.type) {
      _.up('focused_app_changed', msg.data, {})
    }
    drive.put('focused/current.json', { value: msg.data.type })
  }

  // ---------
  // PROTOCOLS
  // ---------
  function program_container_protocol (msg) {
    const action_handlers = {
      ui_focus: program_container_forward_ui_focus,
      set_doc_display_handler: program_container_forward_up,
      action_auto_completed: program_container_forward_up,
      action_complete: program_container_forward_up
    }
    const handler = action_handlers[msg.type] || program_container_forward_taskbar
    handler(msg)

    function program_container_forward_ui_focus (msg) { handle_ui_focus(msg) }
    function program_container_forward_up (msg) { _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
    function program_container_forward_taskbar (msg) { _.taskbar(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  }

  function taskbar_protocol (msg) {
    console.error('theme_widget: taskbar_protocol', msg.type, msg.data)
    const action_handlers = {
      ui_focus: taskbar_forward_ui_focus,
      docs_toggle: taskbar_docs_toggle,
      set_docs_mode: taskbar_forward_up,
      action_auto_completed: taskbar_forward_up,
      action_complete: taskbar_forward_up,
      link_tab_close_clicked: taskbar_forward_up,
      link_tab_clicked: taskbar_forward_up
    }
    const handler = action_handlers[msg.type] || taskbar_forward_program_container
    handler(msg)

    function taskbar_forward_ui_focus (msg) { handle_ui_focus(msg) }
    function taskbar_forward_up (msg) { _.up(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
    function taskbar_forward_program_container (msg) { _.program_container(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
    function taskbar_docs_toggle (msg) { _.program_container(msg.type, msg.data, msg.head ? { cause: msg.head } : {}) }
  }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      program_container: {
        $: ''
      },
      taskbar: {
        $: ''
      },
      net_helper: {
        $: ''
      }
    },
    drive: {}
  }

  function fallback_instance () {
    return {
      _: {
        program_container: {
          0: '',
          mapping: {
            style: 'style',
            icons: 'icons',
            commands: 'commands',
            scroll: 'scroll',
            actions: 'actions',
            hardcons: 'hardcons',
            files: 'files',
            highlight: 'highlight',
            active_tab: 'active_tab',
            entries: 'entries',
            runtime: 'runtime',
            mode: 'mode',
            flags: 'flags',
            keybinds: 'keybinds',
            undo: 'undo',
            focused: 'focused',
            temp_actions: 'temp_actions',
            temp_quick_actions: 'temp_quick_actions',
            prefs: 'prefs',
            variables: 'variables',
            data: 'data',
            docs: 'docs',
            docs_style: 'docs_style'
          }
        },
        taskbar: {
          0: '',
          mapping: {
            style: 'style',
            icons: 'icons',
            actions: 'actions',
            prefs: 'prefs',
            variables: 'variables',
            data: 'data',
            hardcons: 'hardcons',
            docs: 'docs'
          }
        },
        net_helper: {
          0: ''
        }
      },
      drive: {
        'style/': {
          'theme.css': {
            raw: `
              .theme-widget {
                display: flex;
                flex-direction: column;
                width: 100%;
                height: 100%;
                background: #131315;
                min-height: 0;
              }
              .program-container {
                flex: 1 1 auto;
                min-height: 0;
                height: 100%;
              }
              .taskbar {
                flex: 0 0 auto;
                width: 100%;
                z-index: 10;
              }
            `
          }
        },
        'flags/': {},
        'commands/': {},
        'icons/': {},
        'scroll/': {},
        'actions/': {},
        'hardcons/': {},
        'files/': {},
        'highlight/': {},
        'active_tab/': {},
        'entries/': {},
        'runtime/': {},
        'mode/': {},
        'keybinds/': {},
        'undo/': {},
        'focused/': {
          'current.json': {
            raw: { value: 'default' }
          }
        },
        'temp_actions/': {},
        'temp_quick_actions/': {},
        'prefs/': {},
        'variables/': {},
        'data/': {},
        'docs_style/': {},
        'docs/': {
          'README.md': {
            $ref: 'README.md'
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/theme_widget/theme_widget.js")
},{"STATE":1,"net_helper":17,"program_container":19,"taskbar":27}],29:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const admin_api = statedb.admin()
const admin_on = {}
admin_api.on(handle_admin_message)
const { sdb, io: sdbio, id } = statedb(fallback_module)
const { drive, admin } = sdb
const net = require('net_helper')
const DOCS = require('DOCS')
const docs = DOCS(__filename)()
const docs_admin = docs.admin
/******************************************************************************
  PAGE
******************************************************************************/
const navbar = require('menu')
const theme_widget = require('theme_widget')
const taskbar = require('taskbar')
const tabsbar = require('tabsbar')
const action_bar = require('action_bar')
const program_container = require('program_container')
const tabs = require('tabs')
const console_history = require('console_history')
const actions = require('actions')
const tabbed_editor = require('tabbed_editor')
const task_manager = require('task_manager')
const quick_actions = require('quick_actions')
const graph_explorer_wrapper = require('graph_explorer_wrapper')
const editor = require('quick_editor')
const action_executor = require('action_executor')
const steps_wizard = require('steps_wizard')
const { resource } = require('helpers')

const imports = {
  theme_widget,
  taskbar,
  tabsbar,
  action_bar,
  program_container,
  tabs,
  console_history,
  actions,
  tabbed_editor,
  task_manager,
  quick_actions,
  graph_explorer_wrapper,
  action_executor,
  steps_wizard
}
module.exports = ui_gallery

/******************************************************************************
  PAGE BOOT
******************************************************************************/
async function ui_gallery (opts = {}) {
  // ----------------------------------------
  // ID + JSON STATE
  // ----------------------------------------
  let resize_enabled = true
  const on = {
    style: inject,
    resize_container: update_resize,
    ...sdb.admin.status.dataset.drive,
    ...sdb.admin
  }
  // const status = {}
  // ----------------------------------------
  // TEMPLATE
  // ----------------------------------------
  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="navbar-slot"></div>
  <div class="components-wrapper-container">
    <div class="components-wrapper"></div>
  </div>`
  document.body.style.margin = 0
  document.body.style.backgroundColor = '#d8dee9'

  // ----------------------------------------
  // ELEMENTS
  // ----------------------------------------

  const navbar_slot = shadow.querySelector('.navbar-slot')
  const components_wrapper = shadow.querySelector('.components-wrapper')
  const sheet = new CSSStyleSheet()
  shadow.adoptedStyleSheets = [sheet]

  const entries = Object.entries(imports)
  const wrappers = []
  const names = entries.map(get_entry_name)
  let current_selected_wrapper = null

  function get_entry_name (entry) { return entry[0] }

  const url_params = new URLSearchParams(window.location.search)
  const checked_param = url_params.get('checked')
  const selected_name_param = url_params.get('selected')
  let initial_checked_indices = []

  if (checked_param) {
    try {
      const parsed = JSON.parse(checked_param)
      if (Array.isArray(parsed) && parsed.every(Number.isInteger)) {
        initial_checked_indices = parsed
      } else {
        console.warn('Invalid "checked" URL parameter format.')
      }
    } catch (e) {
      console.error('Error parsing "checked" URL parameter:', e)
    }
  }

  const menu_callbacks = {
    on_checkbox_change: handle_checkbox_change,
    on_label_click: handle_label_click,
    on_select_all_toggle: handle_select_all_toggle,
    on_resize_toggle: handle_resize_toggle
  }
  const item = resource()
  sdbio.on(register_io_port)
  const { io: theme_widget_io, _: theme_widget_send } = net(id)
  theme_widget_io.on = {
    theme_widget: theme_widget_protocol
  }

  // Create io handles for all preview components to provide up-channel invites
  const preview_ios = {}
  const preview_names = Object.keys(imports)
  for (const name of preview_names) {
    if (name === 'theme_widget') continue
    const { io } = net(id)
    // Register minimal protocol handler so io.invite() can work
    io.on = {
      [name]: () => {},
      up: () => {}
    }
    preview_ios[name] = io
  }

  function register_io_port (port) {
    const { by, to } = port
    item.set(port.to, port)

    port.onmessage = on_port_message

    function on_port_message (event) {
      const txt = event.data
      const key = `[${by} -> ${to}]`
      console.log('[ port-stuff ]', key)

      on[txt.type](...txt.data)
    }
  }

  const editor_subs = await sdb.get_sub('ui_gallery>quick_editor')
  // const subs = await sdb.watch(onbatch)
  const subs = (await sdb.watch(onbatch)).filter(is_even_index)

  function is_even_index (_, index) { return index % 2 === 0 }

  console.log('Page subs', subs)
  const nav_menu_element = await navbar(subs[names.length], names, initial_checked_indices, menu_callbacks)

  const main_editor = editor_subs[0] ? await editor(editor_subs[0]) : null
  navbar_slot.replaceWith(nav_menu_element, main_editor || document.createElement('div'))
  await create_component(entries)
  update_resize(resize_enabled)
  window.onload = scroll_to_initial_selected
  send_quick_editor_data()
  admin_on.import = send_quick_editor_data

  function theme_widget_protocol (msg) {
    const action_handlers = {
      set_docs_mode: handle_set_docs_mode,
      set_doc_display_handler: handle_set_doc_display_handler,
      focused_app_changed: handle_focused_app_changed
    }
    const handler = action_handlers[msg.type] || handle_fail
    handler(msg)

    function handle_set_docs_mode (msg) { docs_admin.set_docs_mode(msg.data.active) }
    function handle_set_doc_display_handler (msg) { docs_admin.set_doc_display_handler(msg.data.callback) }
    function handle_fail (msg) { console.warn('page: unhandled message from theme_widget', msg) }

    function handle_focused_app_changed (msg) {
      const actions = docs_admin.get_actions(msg.data.sid)
      update_actions_for_app(actions, msg)
    }

    async function update_actions_for_app (data, msg) {
      const focused_app = msg.data.type
      let actions_data = null
      let quick_actions_data = null
      let steps_wizard_data = null

      if (focused_app) {
        const component_actions = await get_component_actions(data)
        actions_data = component_actions.actions
        quick_actions_data = component_actions.quick_actions
        steps_wizard_data = component_actions.steps_wizard
      }

      const refs = msg.head ? { cause: msg.head } : {}
      theme_widget_send.theme_widget('update_actions_for_app', actions_data, refs)
      theme_widget_send.theme_widget('update_quick_actions_for_app', quick_actions_data, refs)
      theme_widget_send.theme_widget('update_steps_wizard_for_app', steps_wizard_data, refs)
    }

    async function get_component_actions (data) {
      const result_actions = []
      const result_quick_actions = []

      data.forEach(add_action_entry)

      return {
        actions: result_actions,
        quick_actions: result_quick_actions,
        steps_wizard: data
      }

      function add_action_entry (entry) {
        result_actions.push({
          action: entry.name,
          icon: entry.icon,
          pinned: entry.status.pinned,
          default: entry.status.default
        })
        result_quick_actions.push({
          name: entry.name,
          icon: entry.icon,
          total_steps: entry.steps.length
        })
      }
    }
  }
  return el
  async function create_component (entries_obj) {
    let index = 0
    for (const [name, factory] of entries_obj) {
      const is_initially_checked = initial_checked_indices.length === 0 || initial_checked_indices.includes(index + 1)
      const outer = document.createElement('div')
      outer.className = 'component-outer-wrapper'
      outer.style.display = is_initially_checked ? 'block' : 'none'
      outer.innerHTML = `
      <div class="component-name-label">${name}</div>
      <div class="component-wrapper"></div>
    `
      const inner = outer.querySelector('.component-wrapper')
      let component_content
      if (name === 'theme_widget') {
        component_content = await factory({ ...subs[index] }, theme_widget_io.invite('theme_widget', { up: id }))
      } else {
        const component_io = preview_ios[name]
        component_content = await factory({ ...subs[index] }, component_io.invite(name, { up: id }))
      }
      component_content.className = 'component-content'

      const node_id = admin.status.s2i[subs[index].sid]
      const editor_index = index + 1
      const component_editor = editor_subs[editor_index] ? await editor(editor_subs[editor_index]) : null
      inner.append(component_content, component_editor || document.createElement('div'))

      const result = {}
      const drive = admin.status.dataset.drive

      const modulepath = node_id.split(':')[0]
      const fields = admin.status.db.read_all(['state', modulepath])
      const nodes = Object.keys(fields).filter(is_state_node)

      function is_state_node (field) { return !isNaN(Number(field.split(':').at(-1))) }

      for (const node of nodes) {
        result[node] = {}
        const datasets = drive.list('', node)
        for (const dataset of datasets) {
          result[node][dataset] = {}
          const files = drive.list(dataset, node)
          for (const file of files) {
            result[node][dataset][file] = (await drive.get(dataset + file, node)).raw
          }
        }
      }

      if (editor_subs[editor_index]) {
        const editor_id = admin.status.a2i[admin.status.s2i[editor_subs[editor_index].sid]]
        const port = await item.get(editor_id)
        // await sdbio.at(editor_id)
        port.postMessage(result)
      }

      components_wrapper.appendChild(outer)
      wrappers[index] = { outer, inner, name, checkbox_state: is_initially_checked }
      index++
    }
  }

  function scroll_to_initial_selected () {
    if (selected_name_param) {
      const index = names.indexOf(selected_name_param)
      if (index !== -1 && wrappers[index]) {
        const target_wrapper = wrappers[index].outer
        if (target_wrapper.style.display !== 'none') {
          setTimeout(scroll_to_selected_wrapper, 100)

          function scroll_to_selected_wrapper () {
            target_wrapper.scrollIntoView({ behavior: 'auto', block: 'center' })
            clear_selection_highlight()
            target_wrapper.style.backgroundColor = '#2e3440'
            current_selected_wrapper = target_wrapper
          }
        }
      }
    }
  }

  function clear_selection_highlight () {
    if (current_selected_wrapper) {
      current_selected_wrapper.style.backgroundColor = ''
    }
    current_selected_wrapper = null
  }

  function update_url (selected_name = url_params.get('selected')) {
    const checked_indices = wrappers.reduce(collect_checked_index, [])

    function collect_checked_index (acc, wrapper_entry, index) {
      if (wrapper_entry.checkbox_state) { acc.push(index + 1) }
      return acc
    }

    const params = new URLSearchParams()
    if (checked_indices.length > 0 && checked_indices.length < wrappers.length) {
      params.set('checked', JSON.stringify(checked_indices))
    }
    const selected_index = names.indexOf(selected_name)
    if (selected_name && selected_index !== -1 && wrappers[selected_index].checkbox_state) {
      params.set('selected', selected_name)
    }
    const new_url = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`
    window.history.replaceState(null, '', new_url)
  }

  function handle_checkbox_change (detail) {
    const { index, checked } = detail
    if (wrappers[index]) {
      wrappers[index].outer.style.display = checked ? 'block' : 'none'
      wrappers[index].checkbox_state = checked
      update_url()
      if (!checked && current_selected_wrapper === wrappers[index].outer) {
        clear_selection_highlight()
        update_url(null)
      }
    }
  }

  function handle_label_click (detail) {
    const { index, name } = detail
    if (wrappers[index]) {
      const target_wrapper = wrappers[index].outer
      if (target_wrapper.style.display === 'none') {
        target_wrapper.style.display = 'block'
        wrappers[index].checkbox_state = true
      }
      target_wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' })
      clear_selection_highlight()
      target_wrapper.style.backgroundColor = 'lightblue'
      current_selected_wrapper = target_wrapper
      update_url(name)
    }
  }

  function handle_select_all_toggle (detail) {
    const { selectAll: select_all } = detail
    wrappers.forEach(update_wrapper_visibility)

    function update_wrapper_visibility (wrapper_entry) {
      wrapper_entry.outer.style.display = select_all ? 'block' : 'none'
      wrapper_entry.checkbox_state = select_all
    }

    clear_selection_highlight()
    update_url(null)
  }

  function handle_resize_toggle () {
    console.log('handle_resize_toggle', resize_enabled)
    resize_enabled = !resize_enabled
    drive.put('resize_container/state.json', resize_enabled)
  }

  async function onbatch (batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(load_path_raw))
      const func = on[type] || fail
      func(data, type)
    }

    function load_path_raw (path) { return drive.get(path).then(read_drive_file_raw) }
    function read_drive_file_raw (file) { return file.raw }
  }
  function fail (data, type) { console.warn(__filename + 'invalid message', { cause: { data, type } }) }
  function inject (data) { sheet.replaceSync(data[0]) }
  function update_resize (data) {
    console.log('[ update_resize ]', data)
    resize_enabled = data
    wrappers.forEach(update_wrapper_resize)

    function update_wrapper_resize (wrap) {
      const wrapper = wrap.outer.querySelector('.component-wrapper')
      if (wrapper) {
        wrapper.style.resize = resize_enabled ? 'both' : 'none'
        wrapper.style.overflow = resize_enabled ? 'auto' : 'visible'
      }
    }
  }
  async function send_quick_editor_data () {
    const roots = admin.status.db.read(['root_datasets'])
    const result = {}
    roots.forEach(add_root_dataset)

    function add_root_dataset (root_dataset) {
      const root = root_dataset.name
      result[root] = {}
      const inputs = sdb.admin.get_dataset({ root }) || []
      inputs.forEach(add_input_type)

      function add_input_type (type) {
        result[root][type] = {}
        const datasets = sdb.admin.get_dataset({ root, type })

        if (!datasets) return
        Object.values(datasets).forEach(add_dataset_name)

        function add_dataset_name (dataset_name) {
          result[root][type][dataset_name] = {}
          const dataset_ids = sdb.admin.get_dataset({ root, type, name: dataset_name })
          dataset_ids.forEach(add_dataset_id)

          function add_dataset_id (dataset_id) {
            const files = admin.status.db.read([root, dataset_id]).files || []
            result[root][type][dataset_name][dataset_id] = {}
            files.forEach(add_file_data)

            function add_file_data (file_id) { result[root][type][dataset_name][dataset_id][file_id] = admin.status.db.read([root, file_id]) }
          }
        }
      }
    }

    if (!editor_subs[0]) return
    const editor_id = admin.status.a2i[admin.status.s2i[editor_subs[0].sid]]
    const port = await item.get(editor_id)
    // await sdbio.at(editor_id)
    port.postMessage(result)
  }
}
function fallback_module () {
  const menuname = 'menu'
  const names = [
    'theme_widget',
    'taskbar',
    'tabsbar',
    'action_bar',
    'program_container',
    'tabs',
    'console_history',
    'actions',
    'tabbed_editor',
    'task_manager',
    'quick_actions',
    'graph_explorer_wrapper',
    'action_executor',
    'steps_wizard'
  ]
  const subs = {}
  names.forEach(subgen)
  subs.helpers = 0
  subs.DOCS = 0
  subs.net_helper = 0
  subs.taskbar = {
    $: '',
    0: '',
    mapping: {
      style: 'style',
      icons: 'icons',
      actions: 'actions',
      prefs: 'prefs',
      variables: 'variables',
      data: 'data',
      hardcons: 'hardcons',
      docs: 'docs'
    }
  }
  subs.tabs = {
    $: '',
    0: '',
    mapping: {
      icons: 'icons',
      variables: 'variables',
      scroll: 'scroll',
      style: 'style',
      docs: 'docs',
      actions: 'actions'
    }
  }
  subs.program_container = {
    $: '',
    0: '',
    mapping: {
      style: 'style',
      flags: 'flags',
      commands: 'commands',
      icons: 'icons',
      scroll: 'scroll',
      actions: 'actions',
      hardcons: 'hardcons',
      files: 'files',
      highlight: 'highlight',
      active_tab: 'active_tab',
      entries: 'entries',
      runtime: 'runtime',
      mode: 'mode',
      keybinds: 'keybinds',
      undo: 'undo',
      docs_style: 'docs_style',
      docs: 'docs'
    }
  }
  subs.action_executor = {
    $: '',
    0: '',
    mapping: {
      style: 'style',
      variables: 'variables',
      docs: 'docs',
      data: 'data'
    }
  }
  subs.steps_wizard = {
    $: '',
    0: '',
    mapping: {
      style: 'style',
      docs: 'docs'
    }
  }
  subs.tabsbar = {
    $: '',
    0: '',
    mapping: {
      icons: 'icons',
      style: 'style',
      docs: 'docs',
      actions: 'actions'
    }
  }
  subs.action_bar = {
    $: '',
    0: '',
    mapping: {
      icons: 'icons',
      style: 'style',
      actions: 'actions',
      variables: 'variables',
      hardcons: 'hardcons',
      prefs: 'prefs',
      docs: 'docs'
    }
  }
  subs.console_history = {
    $: '',
    0: '',
    mapping: {
      style: 'style',
      commands: 'commands',
      icons: 'icons',
      scroll: 'scroll',
      docs: 'docs',
      actions: 'actions'
    }
  }
  subs.actions = {
    $: '',
    0: '',
    mapping: {
      actions: 'actions',
      icons: 'icons',
      hardcons: 'hardcons',
      style: 'style',
      docs: 'docs'
    }
  }
  subs.tabbed_editor = {
    $: '',
    0: '',
    mapping: {
      style: 'style',
      files: 'files',
      highlight: 'highlight',
      active_tab: 'active_tab',
      docs: 'docs'
    }
  }
  subs.task_manager = {
    $: '',
    0: '',
    mapping: {
      style: 'style',
      count: 'count',
      docs: 'docs',
      actions: 'actions'
    }
  }
  subs.quick_actions = {
    $: '',
    0: '',
    mapping: {
      style: 'style',
      icons: 'icons',
      actions: 'actions',
      hardcons: 'hardcons',
      prefs: 'prefs',
      docs: 'docs'
    }
  }
  subs[menuname] = {
    $: '',
    0: '',
    mapping: {
      style: 'style',
      docs: 'docs'
    }
  }
  subs.quick_editor = {
    $: '',
    mapping: {
      style: 'style',
      docs: 'docs'
    }
  }
  subs.theme_widget = {
    $: '',
    0: '',
    mapping: {
      style: 'style',
      commands: 'commands',
      icons: 'icons',
      scroll: 'scroll',
      actions: 'actions',
      hardcons: 'hardcons',
      files: 'files',
      highlight: 'highlight',
      active_tab: 'active_tab',
      entries: 'entries',
      runtime: 'runtime',
      mode: 'mode',
      flags: 'flags',
      keybinds: 'keybinds',
      undo: 'undo',
      focused: 'focused',
      temp_actions: 'temp_actions',
      temp_quick_actions: 'temp_quick_actions',
      prefs: 'prefs',
      variables: 'variables',
      data: 'data',
      docs_style: 'docs_style',
      docs: 'docs'
    }
  }
  subs.graph_explorer_wrapper = {
    $: '',
    0: '',
    mapping: {
      theme: 'style',
      entries: 'entries',
      runtime: 'runtime',
      mode: 'mode',
      flags: 'flags',
      keybinds: 'keybinds',
      undo: 'undo',
      docs: 'docs'
    }
  }
  for (let i = 0; i < Object.keys(subs).length - 1; i++) {
    subs.quick_editor[i] = quick_editor$
  }

  return {
    _: subs,
    drive: {
      'style/': {
        'theme.css': {
          raw: `
          .components-wrapper-container {
            padding-top: 10px; /* Adjust as needed */
          }

          .component-outer-wrapper {
            margin-bottom: 20px;
            padding: 0px 0px 10px 0px;
            transition: background-color 0.3s ease;
          }

          .component-name-label {
            background-color:transparent;
            padding: 8px 15px;
            text-align: center;
            font-weight: bold;
            color: #333;
          }

          .component-wrapper {
            width: 95%;
            margin: 0 auto;
            position: relative;
            padding: 15px;
            border: 3px solid #666;
            resize: none;
            overflow: visible;
            border-radius: 0px;
            background-color: #eceff4;
            min-height: 50px;
          }
          .component-content {
            width: 100%;
            height: 100%;
          }
          .toggle-switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 26px;
          }

          .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
          }

          .slider {
            position: absolute;
            cursor: pointer;
            inset: 0;
            background-color: #ccc;
            border-radius: 26px;
            transition: 0.4s;
          }

          .slider::before {
            content: "";
            position: absolute;
            height: 20px;
            width: 20px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            border-radius: 50%;
            transition: 0.4s;
          }

          input:checked + .slider {
            background-color: #2196F3;
          }

          input:checked + .slider::before {
            transform: translateX(24px);
          }
          .component-wrapper:hover::before {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            border: 4px solid skyblue;
            pointer-events: none;
            z-index: 15;
            resize: both;
            overflow: auto;
          }
          .quick-editor {
            position: absolute;
            z-index: 100;
            top: 0;
            right: 0;
          }
          .component-wrapper:hover .quick-editor {
            display: block;
          }
          .component-wrapper > .quick-editor {
            display: none;
            top: -5px;
            right: -10px;
          }`
        }
      },
      'resize_container/': {
        'state.json': {
          raw: 'false'
        }
      },
      'icons/': {},
      'variables/': {},
      'scroll/': {},
      'commands/': {},
      'actions/': {},
      'hardcons/': {},
      'files/': {},
      'highlight/': {},
      'count/': {},
      'entries/': {},
      'active_tab/': {},
      'runtime/': {},
      'mode/': {},
      'data/': {},
      'flags/': {},
      'keybinds/': {},
      'undo/': {},
      'focused/': {},
      'temp_actions/': {},
      'temp_quick_actions/': {},
      'prefs/': {},
      'docs_style/': {},
      'docs/': {}
    }
  }
  function quick_editor$ (args, tools, [quick_editor]) {
    const state = quick_editor()
    state.net = {
      page: {}
    }
    return state
  }
  function subgen (name) {
    subs[name] = {
      $: '',
      0: '',
      mapping: {
        style: 'style',
        docs: 'docs'
      }
    }
  }
}

function handle_admin_message (msg) {
  const { type } = msg
  admin_on[type] && admin_on[type]()
}

}).call(this)}).call(this,"/src/node_modules/ui_gallery/index.js")
},{"DOCS":4,"STATE":1,"action_bar":5,"action_executor":6,"actions":7,"console_history":8,"graph_explorer_wrapper":12,"helpers":14,"menu":16,"net_helper":17,"program_container":19,"quick_actions":20,"quick_editor":21,"steps_wizard":22,"tabbed_editor":23,"tabs":24,"tabsbar":25,"task_manager":26,"taskbar":27,"theme_widget":28}],30:[function(require,module,exports){
const ui_gallery = require('../src/index')
config().then(boot_default_page)

async function config () {
  const html = document.documentElement
  const meta = document.createElement('meta')
  const font = 'https://fonts.googleapis.com/css?family=Nunito:300,400,700,900|Slackey&display=swap'
  const loadFont = `<link href=${font} rel='stylesheet' type='text/css'>`
  html.setAttribute('lang', 'en')
  meta.setAttribute('name', 'viewport')
  meta.setAttribute('content', 'width=device-width,initial-scale=1.0')
  document.head.append(meta)
  document.head.insertAdjacentHTML('beforeend', loadFont)
  await document.fonts.ready
}

async function boot_default_page () {
  document.body.append(await ui_gallery({ sid: '' }))
}

},{"../src/index":3}]},{},[30]);
