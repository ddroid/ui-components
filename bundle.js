(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)


module.exports = action_bar

const quick_actions = require('quick_actions')
async function action_bar(opts, protocol) {
  const { id, sdb } = await get(opts.sid)
  const { drive } = sdb
  const on = {
    style: inject,
    icons: iconject
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  
  shadow.innerHTML = `
  <div class="action-bar-container main">
    <div class="command-history">
      <button class="icon-btn"></button>
    </div>
    <div class="quick-actions">
      <quick-actions></quick-actions>
    </div>
  </div>
  <style>
  </style>`
  const style = shadow.querySelector('style')
  const main = shadow.querySelector('.main')
  const history_icon = shadow.querySelector('.icon-btn')
  const quick_placeholder = shadow.querySelector('quick-actions')


  let console_icon = {}
  const subs = await sdb.watch(onbatch)

  let send = null
  let _ = null
  if(protocol){
    send = protocol(msg => onmessage(msg))
    _ = { up: send, send_quick_actions: null }
  }

  history_icon.innerHTML = console_icon
  history_icon.onclick = onhistory
  const element = protocol ? await quick_actions(subs[0], quick_actions_protocol) : await quick_actions(subs[0])
  element.classList.add('replaced-quick-actions')
  quick_placeholder.replaceWith(element)
  return el

  async function onbatch (batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
  }
  function fail (data, type) { throw new Error('invalid message', { cause: { data, type } }) }

  function inject(data) {
    style.innerHTML = data.join('\n')
  }

  function iconject(data) {
    console_icon = data[0]
  }
  function onhistory() {
    _.up({ type: 'console_history_toggle', data: null })
  }
  // ---------
  // PROTOCOLS  
  // ---------
  function quick_actions_protocol (send) {
    _.send_quick_actions = send
    return on
    function on ({ type, data }) {
      _.up({ type, data })
    }
  }
  
  function onmessage ({ type, data }) {
    _.send_quick_actions({ type, data })
  }
}

function fallback_module() {
  return {
    api: fallback_instance,
    _: {
      'quick_actions': {
        $: ''
      },
    }
  }
  function fallback_instance() {
    return {
      _: {
        'quick_actions': {
          0: '',
          mapping: {
            'style': 'style',
            'icons': 'icons',
            'actions': 'actions',
            'hardcons': 'hardcons'
          }
        }
      },
      drive: {
        'icons/': {
          'console.svg': {
            '$ref': 'console.svg'
          }
        },
        'style/': {
          'theme.css': {
            raw: `
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
              .replaced-quick-actions {
                display: flex;
                flex: auto;
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
        }
      }
    }
  }
}
}).call(this)}).call(this,"/src/node_modules/action_bar/action_bar.js")
},{"STATE":1,"quick_actions":7}],3:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
module.exports = actions

async function actions(opts, protocol) {
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
  </div>
  <style>
  </style>`
  const style = shadow.querySelector('style')
  const main = shadow.querySelector('.main')
  const actions_menu = shadow.querySelector('.actions-menu')

  
  let init = false
  let actions = []
  let icons = {}
  let hardcons = {}

  const subs = await sdb.watch(onbatch)
  let send = null
  let _ = null
  if (protocol) {
    send = protocol(msg => onmessage(msg))
    _ = { up: send }
  }

  return el

  function onmessage ({ type, data }) {
    switch (type) {
      case 'filter_actions':
        filter(data)
        break
      case 'send_selected_action':
        send_selected_action(data)
        break
      default:
        fail(data, type)
    }
  }
  
  function send_selected_action (msg) {
    _.up({ type: 'selected_action', data: msg.data })
  }

  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
    if (!init) {
      create_actions_menu()
      init = true
    }
  }

  function fail(data, type) { throw new Error('invalid message', { cause: { data, type } }) }

  function inject(data) {
    style.innerHTML = data.join('\n')
  }

  function iconject(data) {
    icons = data
  }

  function onhardcons(data) {
    hardcons = {
      pin: data[0],
      unpin: data[1],
      default: data[2],
      undefault: data[3]
    }
  }

  function onactions(data) {
    const vars = typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]
    actions = vars
  }

  function create_actions_menu() {
    actions_menu.replaceChildren()
    actions.forEach(create_action_item)
  }

  function create_action_item(action_data, index) {
    const action_item = document.createElement('div')
    action_item.classList.add('action-item')
    
    const icon = icons[index]
    
    action_item.innerHTML = `
    <div class="action-icon">${icon}</div>
    <div class="action-name">${action_data.action}</div>
    <div class="action-pin">${action_data.pin ? hardcons.pin : hardcons.unpin}</div>
    <div class="action-default">${action_data.default ? hardcons.default : hardcons.undefault}</div>`
    action_item.onclick = onaction
    actions_menu.appendChild(action_item)

    function onaction() {
      send_selected_action({ data: action_data })
    }
  }

  function filter(search_term) {
    const items = shadow.querySelectorAll('.action-item')
    items.forEach(item => {
      const action_name = item.children[1].textContext.toLowerCase()
      const matches = action_name.includes(search_term.toLowerCase())
      item.style.display = matches ? 'flex' : 'none'
    })
  }
}

function fallback_module() {
  return {
    api: fallback_instance,
  }

  function fallback_instance() {
    return {
      drive: {
        'actions/': {
          'commands.json': {
            raw: JSON.stringify([
              {
                action: 'New File',
                pinned: true,
                default: true,
                icon: 'file'
              },
              {
                action: 'Open File',
                pinned: false,
                default: true,
                icon: 'folder'
              },
              {
                action: 'Save File',
                pinned: true,
                default: false,
                icon: 'save'
              },
              {
                action: 'Settings',
                pinned: false,
                default: true,
                icon: 'gear'
              },
              {
                action: 'Help',
                pinned: false,
                default: false,
                icon: 'help'
              },
              {
                action: 'Terminal',
                pinned: true,
                default: true,
                icon: 'terminal'
              },
              {
                action: 'Search',
                pinned: false,
                default: true,
                icon: 'search'
              }
            ])
          }
        },
        'icons/': {
          'file.svg': {
            '$ref': 'icon.svg'
          },
          'folder.svg': {
            '$ref': 'icon.svg'
          },
          'save.svg': {
            '$ref': 'icon.svg'
          },
          'gear.svg': {
            '$ref': 'icon.svg'
          },
          'help.svg': {
            '$ref': 'icon.svg'
          },
          'terminal.svg': {
            '$ref': 'icon.svg'
          },
          'search.svg': {
            '$ref': 'icon.svg'
          }
        },
        'hardcons/': {
          'pin.svg': {
            '$ref': 'pin.svg'
          },
          'unpin.svg': {
            '$ref': 'unpin.svg'
          },
          'default.svg': {
            '$ref': 'default.svg'
          },
          'undefault.svg': {
            '$ref': 'undefault.svg'
          }
        },
        'style/': {
          'theme.css': {
            raw: `
              .actions-container {
                position: relative;
                top: 0;
                left: 0;
                right: 0;
                background: #202124;
                border: 1px solid #3c3c3c;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                z-index: 1;
                max-height: 400px;
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
},{"STATE":1}],4:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
module.exports = console_history

async function console_history (opts, protocol) {
  const { id, sdb } = await get(opts.sid)
  const {drive} = sdb
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
  </div>
  <style>
  </style>`
  const style = shadow.querySelector('style')
  const main = shadow.querySelector('.main')
  const commands_placeholder = shadow.querySelector('console-commands')
  
  
  let init = false
  let commands = []
  let dricons = []

  const subs = await sdb.watch(onbatch)
  let send = null
  let _ = null
  if(protocol){
    send = protocol(msg => onmessage(msg))
    _ = { up: send }
  }
  return el

  function onmessage ({ type, data }) {
    console.log(`[space->console_history]`, type, data)
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

    command_el.onclick = function () {
      _.up({ type: 'command_clicked', data: command_data })
    }

    return command_el
  }
  function render_commands () {
      const commands_container = document.createElement('div')
      commands_container.className = 'commands-list'
      
      commands.forEach((command, index) => {
        const command_item = create_command_item(command, index)
        commands_container.appendChild(command_item)
      })
      
      commands_placeholder.replaceWith(commands_container)
      init = true
  }
  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
    if (!init && commands.length > 0) {
      render_commands()
    }
  }

  function fail (data, type) { 
    throw new Error('invalid message', { cause: { data, type } }) 
  }

  function inject (data) {
    style.innerHTML = data.join('\n')
  }

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
    api: fallback_instance
  }

  function fallback_instance () {
    return {
      drive: {
        'commands/': {
          'list.json': {
            '$ref': 'commands.json'
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
},{"STATE":1}],5:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)

module.exports = graph_explorer

async function graph_explorer(opts) {
  const { sdb } = await get(opts.sid)
  const { drive } = sdb

  let vertical_scroll_value = 0
  let horizontal_scroll_value = 0

  const on = {
    entries: on_entries,
    style: inject_style
  }

  const el = document.createElement('div')
  el.className = 'graph-explorer-wrapper'
  el.onscroll = () => {
    vertical_scroll_value = el.scrollTop
    horizontal_scroll_value = el.scrollLeft
  }
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `<div class="graph-container"></div>`
  const container = shadow.querySelector('.graph-container')

  let all_entries = {}
  let view = []
  const instance_states = {}

  let start_index = 0
  let end_index = 0
  const chunk_size = 50
  const max_rendered_nodes = chunk_size * 3
  const node_height = 22

  const top_sentinel = document.createElement('div')
  const bottom_sentinel = document.createElement('div')
  top_sentinel.className = 'sentinel'
  bottom_sentinel.className = 'sentinel'

  const observer = new IntersectionObserver(handle_sentinel_intersection, {
    root: el,
    threshold: 0
  })

  await sdb.watch(onbatch)

  return el

  async function onbatch(batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
  }

  function fail (data, type) { throw new Error('invalid message', { cause: { data, type } }) }

  function on_entries(data) {
    all_entries = typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]
    const root_path = '/'
    if (all_entries[root_path]) {
      if (!instance_states[root_path]) {
        instance_states[root_path] = { expanded_subs: true, expanded_hubs: false }
      }
      build_and_render_view()
    }
  }

  function inject_style(data) {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(data[0])
    shadow.adoptedStyleSheets = [sheet]
  }

  function build_and_render_view(focal_instance_path = null) {
    const old_view = [...view]
    const old_scroll_top = vertical_scroll_value
    const old_scroll_left = horizontal_scroll_value

    view = build_view_recursive({
      base_path: '/',
      parent_instance_path: '',
      depth: 0,
      is_last_sub : true,
      is_hub: false,
      parent_pipe_trail: [],
      instance_states,
      all_entries
    })

    let focal_index = -1
    if (focal_instance_path) {
      focal_index = view.findIndex(
        node => node.instance_path === focal_instance_path
      )
    }
    if (focal_index === -1) {
      focal_index = Math.floor(old_scroll_top / node_height)
    }

    const old_focal_node = old_view[focal_index]
    let new_scroll_top = old_scroll_top

    if (old_focal_node) {
      const old_focal_instance_path = old_focal_node.instance_path
      const new_focal_index = view.findIndex(
        node => node.instance_path === old_focal_instance_path
      )
      if (new_focal_index !== -1) {
        const scroll_diff = (new_focal_index - focal_index) * node_height
        new_scroll_top = old_scroll_top + scroll_diff
      }
    }

    start_index = Math.max(0, focal_index - Math.floor(chunk_size / 2))
    end_index = start_index

    container.replaceChildren()
    container.appendChild(top_sentinel)
    container.appendChild(bottom_sentinel)
    observer.observe(top_sentinel)
    observer.observe(bottom_sentinel)

    render_next_chunk()

    requestAnimationFrame(() => {
      el.scrollTop = new_scroll_top
      el.scrollLeft = old_scroll_left
    })
  }

  function build_view_recursive({
    base_path,
    parent_instance_path,
    depth,
    is_last_sub,
    is_hub,
    parent_pipe_trail,
    instance_states,
    all_entries
  }) {

    const instance_path = `${parent_instance_path}|${base_path}`
    const entry = all_entries[base_path]
    if (!entry) return []

    if (!instance_states[instance_path]) {
      instance_states[instance_path] = {
        expanded_subs: false,
        expanded_hubs: false
      }
    }
    const state = instance_states[instance_path]
    const children_pipe_trail = [...parent_pipe_trail]
    let last_pipe = null

    if (depth > 0) {
      if (is_hub) {
        last_pipe = [...parent_pipe_trail]
        if (is_last_sub) { 
          children_pipe_trail.pop()
          children_pipe_trail.push(is_last_sub)
          last_pipe.pop()
          last_pipe.push(true)
        }
      }
      children_pipe_trail.push(!is_last_sub || is_hub)
    }

    let current_view = []

    if (state.expanded_hubs && entry.hubs) {
      entry.hubs.forEach((hub_path, i, arr) => {
        current_view = current_view.concat(
          build_view_recursive({
            base_path: hub_path,
            parent_instance_path: instance_path,
            depth: depth + 1,
            is_last_sub : i === arr.length - 1,
            is_hub: true,
            parent_pipe_trail: children_pipe_trail,
            instance_states,
            all_entries
          })
        )
      })
    }

    current_view.push({
      base_path,
      instance_path,
      depth,
      is_last_sub,
      is_hub,
      pipe_trail: (is_hub && is_last_sub) ? last_pipe : parent_pipe_trail
    })

    if (state.expanded_subs && entry.subs) {
      entry.subs.forEach((sub_path, i, arr) => {
        current_view = current_view.concat(
          build_view_recursive({
            base_path: sub_path,
            parent_instance_path: instance_path,
            depth: depth + 1,
            is_last_sub: i === arr.length - 1,
            is_hub: false,
            parent_pipe_trail: children_pipe_trail,
            instance_states,
            all_entries
          })
        )
      })
    }
    return current_view
  }

  function handle_sentinel_intersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        if (entry.target === top_sentinel) render_prev_chunk()
        else if (entry.target === bottom_sentinel) render_next_chunk()
      }
    })
  }

  function render_next_chunk() {
    if (end_index >= view.length) return
    const fragment = document.createDocumentFragment()
    const next_end = Math.min(view.length, end_index + chunk_size)
    for (let i = end_index; i < next_end; i++) {
      fragment.appendChild(create_node(view[i]))
    }
    container.insertBefore(fragment, bottom_sentinel)
    end_index = next_end
    cleanup_dom(false)
  }

  function render_prev_chunk() {
    if (start_index <= 0) return
    const fragment = document.createDocumentFragment()
    const prev_start = Math.max(0, start_index - chunk_size)
    for (let i = prev_start; i < start_index; i++) {
      fragment.appendChild(create_node(view[i]))
    }
    const old_scroll_height = container.scrollHeight
    const old_scroll_top = el.scrollTop
    container.insertBefore(fragment, top_sentinel.nextSibling)
    start_index = prev_start
    el.scrollTop = old_scroll_top + (container.scrollHeight - old_scroll_height)
    cleanup_dom(true)
  }

  function cleanup_dom(is_scrolling_up) {
    const rendered_count = end_index - start_index
    if (rendered_count < max_rendered_nodes) return
    const to_remove_count = rendered_count - max_rendered_nodes
    if (is_scrolling_up) {
      for (let i = 0; i < to_remove_count; i++) {
        bottom_sentinel.previousElementSibling.remove()
      }
      end_index -= to_remove_count
    } else {
      for (let i = 0; i < to_remove_count; i++) {
        top_sentinel.nextElementSibling.remove()
      }
      start_index += to_remove_count
    }
  }

  function get_prefix(is_last_sub, has_subs, state, is_hub) {
    const { expanded_subs, expanded_hubs } = state
    if (is_hub) {
      if (expanded_subs && expanded_hubs) return '┌┼'
      if (expanded_subs) return '┌┬'
      if (expanded_hubs) return '┌┴'
      return '┌─'
    } else if (is_last_sub) {
      if (expanded_subs && expanded_hubs) return '└┼'
      if (expanded_subs) return '└┬'
      if (expanded_hubs) return '└┴'
      return '└─'
    } else {
      if (expanded_subs && expanded_hubs) return '├┼'
      if (expanded_subs) return '├┬'
      if (expanded_hubs) return '├┴'
      return '├─'
    }
  }

  function create_node({ base_path, instance_path, depth, is_last_sub, is_hub, pipe_trail }) {
    const entry = all_entries[base_path]
    const state = instance_states[instance_path]
    const el = document.createElement('div')
    el.className = `node type-${entry.type}`
    el.dataset.instance_path = instance_path

    const has_hubs = entry.hubs && entry.hubs.length > 0
    const has_subs = entry.subs && entry.subs.length > 0
    
    if (depth) {
      el.style.paddingLeft = '20px'
    }

    if (base_path === '/' && instance_path === '|/') {
      const { expanded_subs } = state
      const prefix_symbol = expanded_subs ? '🪄┬' : '🪄─'
      const prefix_class = has_subs ? 'prefix clickable' : 'prefix'
      el.innerHTML = `<span class="${prefix_class}">${prefix_symbol}</span><span class="name">/🌐</span>`
      if (has_subs) {
        el.querySelector('.prefix').onclick = () => toggle_subs(instance_path)
        el.querySelector('.name').onclick = () => toggle_subs(instance_path)
      }
      return el
    }

    const prefix_symbol = get_prefix(is_last_sub, has_subs, state, is_hub)
    const pipe_html = pipe_trail.map(should_pipe => `<span class=${should_pipe ? 'pipe' : 'blank'}>${should_pipe ? '│' : ' '}</span>`).join('')
    
    const prefix_class = (!has_hubs || base_path !== '/') ? 'prefix clickable' : 'prefix'
    const icon_class = has_subs ? 'icon clickable' : 'icon'

    el.innerHTML = `
      <span class="indent">${pipe_html}</span>
      <span class="${prefix_class}">${prefix_symbol}</span>
      <span class="${icon_class}"></span>
      <span class="name">${entry.name}</span>
    `
    if(has_hubs && base_path !== '/') el.querySelector('.prefix').onclick = () => toggle_hubs(instance_path)
    if(has_subs) el.querySelector('.icon').onclick = () => toggle_subs(instance_path)
    return el
  }

  function toggle_subs(instance_path) {
    const state = instance_states[instance_path]
    if (state) {
      state.expanded_subs = !state.expanded_subs
      build_and_render_view(instance_path)
    }
  }

  function toggle_hubs(instance_path) {
    const state = instance_states[instance_path]
    if (state) {
      state.expanded_hubs = !state.expanded_hubs
      build_and_render_view(instance_path)
    }
  }
}

function fallback_module() {
  return {
    api: fallback_instance
  }
  function fallback_instance() {
    return {
      drive: {
        'entries/': {
          'entries.json': { $ref: 'entries.json' }
        },
        'style/': {
          'theme.css': {
            raw: `
              .graph-container {
                color: #abb2bf;
                background-color: #282c34;
                padding: 10px;
                height: 500px; /* Or make it flexible */
                overflow: auto;
              }
              .node {
                display: flex;
                align-items: center;
                white-space: nowrap;
                cursor: default;
                height: 22px; /* Important for scroll calculation */
              }
              .indent {
                display: flex;
              }
              .pipe {
                text-align: center;
              }
              .blank {
                width: 10px;
                text-align: center;
              }
              .clickable {
                cursor: pointer;
              }
              .prefix, .icon {
                margin-right: 6px;
              }
              .icon { display: inline-block; text-align: center; }
              .name { flex-grow: 1; }
              .node.type-root > .icon::before { content: '🌐'; }
              .node.type-folder > .icon::before { content: '📁'; }
              .node.type-html-file > .icon::before { content: '📄'; }
              .node.type-js-file > .icon::before { content: '📜'; }
              .node.type-css-file > .icon::before { content: '🎨'; }
              .node.type-json-file > .icon::before { content: '📝'; }
              .node.type-file > .icon::before { content: '📄'; }
              .sentinel { height: 1px; }
            `
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/graph_explorer/graph_explorer.js")
},{"STATE":1}],6:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)

module.exports = create_component_menu
async function create_component_menu (opts, names, inicheck, callbacks) {
  const { id, sdb } = await get(opts.sid)
  const {drive} = sdb
  const on = {
    style: inject
  }
  const {
    on_checkbox_change,
    on_label_click,
    on_select_all_toggle
  } = callbacks

  const checkobject = {}
  inicheck.forEach(i => {
    checkobject[i - 1] = true
  })
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
        </div>
        <ul class="menu-list"></ul>
      </div>
    </div>
  </div>
  <style>
  </style>`
  const style = shadow.querySelector('style')
  const main = shadow.querySelector('.main')
  const menu = shadow.querySelector('.menu')
  const toggle_btn = shadow.querySelector('.menu-toggle-button')
  const unselect_btn = shadow.querySelector('.unselect-all-button')
  const list = shadow.querySelector('.menu-list')


  names.forEach((name, index) => {
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

    checkbox.onchange = (e) => {
      on_checkbox_change({ index, checked: e.target.checked })
    }

    label.onclick = () => {
      on_label_click({ index, name })
      menu.classList.add('hidden')
    }
  })
  // event listeners
  const subs = await sdb.watch(onbatch)
  toggle_btn.onclick = on_toggle_btn
  unselect_btn.onclick = on_unselect_btn
  document.onclick = handle_document_click

  return el

  function on_toggle_btn (e) {
    e.stopPropagation()
    menu.classList.toggle('hidden')
  }

  function on_unselect_btn () {
    const select_all = unselect_btn.textContent === 'Select All'
    unselect_btn.textContent = select_all ? 'Unselect All' : 'Select All'
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = select_all })
    on_select_all_toggle({ selectAll: select_all })
  }

  function handle_document_click (e) {
    const path = e.composedPath()
    if (!menu.classList.contains('hidden') && !path.includes(el)) {
      menu.classList.add('hidden')
    }
  }

  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
  }

  function fail(data, type) { throw new Error('invalid message', { cause: { data, type } }) }

  function inject (data) {
    style.textContent = data.join('\n')
  }
}
function fallback_module () {
  return {
    api: fallback_instance,
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
            }

            .unselect-all-button:hover {
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

}).call(this)}).call(this,"/src/node_modules/menu.js")
},{"STATE":1}],7:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
module.exports = quick_actions

async function quick_actions(opts, protocol) {
  const { id, sdb } = await get(opts.sid)
  const {drive} = sdb
  
  const on = {
    style: inject,
    icons: iconject,
    hardcons: onhardcons,
    actions: onactions
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  
  
  shadow.innerHTML = `
  <div class="quick-actions-container main">
    <div class="default-actions"></div>
    <div class="text-bar" role="button"></div>
    <div class="input-wrapper" style="display: none;">
      <div class="input-display">
        <span class="slash-prefix">/</span>
        <span class="command-text"></span>
        <input class="input-field" type="text" placeholder="Type to search actions...">
      </div>
      <button class="submit-btn" style="display: none;"></button>
      <button class="close-btn"></button>
    </div>
  </div>
  <style>
  </style>`
  const default_actions = shadow.querySelector('.default-actions')
  const text_bar = shadow.querySelector('.text-bar')
  const input_wrapper = shadow.querySelector('.input-wrapper')
  const slash_prefix = shadow.querySelector('.slash-prefix')
  const command_text = shadow.querySelector('.command-text')
  const input_field = shadow.querySelector('.input-field')
  const submit_btn = shadow.querySelector('.submit-btn')
  const close_btn = shadow.querySelector('.close-btn')
  const style = shadow.querySelector('style')
  const main = shadow.querySelector('.main')

  
  let init = false
  let icons = {}
  let hardcons = {}
  let defaults = []
  let selected_action = null
  
  let send = null
  let _ = null
  if(protocol){
    send = protocol(msg => onmessage(msg))
    _ = { up: send }
  }
  text_bar.onclick = activate_input_field
  close_btn.onclick = deactivate_input_field
  submit_btn.onclick = onsubmit
  input_field.oninput = oninput

  const subs = await sdb.watch(onbatch)
  submit_btn.innerHTML = hardcons.submit
  close_btn.innerHTML = hardcons.cross
  return el

  function onmessage ({ type, data }) {
    if (type === 'selected_action') {
      select_action(data)
    }
  }
  function activate_input_field() {
    is_input_active = true
    
    default_actions.style.display = 'none'
    text_bar.style.display = 'none'
    
    input_wrapper.style.display = 'flex'
    input_field.focus()
    
    _.up({ type: 'display_actions', data: 'block' })
  }

  function onsubmit() {
    if (selected_action) {
      console.log('Selected action submitted:', selected_action)
      _.up({ type: 'action_submitted', data: selected_action })
    }
  }
  function oninput(e) {
    _.up({ type: 'filter_actions', data: e.target.value })
  }
  function deactivate_input_field() {
    is_input_active = false
    
    default_actions.style.display = 'flex'
    text_bar.style.display = 'flex'
    
    input_wrapper.style.display = 'none'
    
    input_field.value = ''
    selected_action = null
    update_input_display()
    
    _.up({ type: 'display_actions', data: 'none' })
  }
  function select_action(action) {
    selected_action = action
    update_input_display(selected_action)
  }

  function update_input_display(selected_action = null) {
    if (selected_action) {
      slash_prefix.style.display = 'inline'
      command_text.style.display = 'inline'
      command_text.textContent = `"${selected_action.action}"`
      input_field.style.display = 'none'
      submit_btn.style.display = 'flex'
    } else {
      slash_prefix.style.display = 'none'
      command_text.style.display = 'none'
      input_field.style.display = 'block'
      submit_btn.style.display = 'none'
      input_field.placeholder = 'Type to search actions...'
    }
  }

  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
    if(!init) {
      create_default_actions(defaults)
      init = true
    } else {
      //TODO: update actions
    }
  }
  function fail (data, type) { throw new Error('invalid message', { cause: { data, type } }) }

  function inject(data) {
    style.innerHTML = data.join('\n')
  }
  function onhardcons(data) {
    hardcons = {
      submit: data[0],
      cross: data[1]
    }
  }
  function iconject(data) {
    icons = data
  }

  function onactions(data) {
    const vars = typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]
    defaults = vars
  }

  function create_default_actions (actions) {
    default_actions.replaceChildren()
    actions.forEach(action => {
      const btn = document.createElement('div')
      btn.classList.add('action-btn')
      btn.innerHTML = icons[action.icon]
      default_actions.appendChild(btn)
    })
    
    close_btn.innerHTML = icons['close']
  }
}

function fallback_module() {
  return {
    api: fallback_instance
  }

  function fallback_instance() {
    return {
      drive: {
        'icons/': {
          '0.svg': {
            '$ref': 'action1.svg'
          },
          '1.svg': {
            '$ref': 'action2.svg'
          },
          '2.svg': {
            '$ref': 'action1.svg'
          },
          '3.svg': {
            '$ref': 'action2.svg'
          },
          '4.svg': {
            '$ref': 'action1.svg'
          }
        },
        'hardcons/': {
          'submit.svg': {
            '$ref': 'submit.svg'
          },
          'close.svg': {
            '$ref': 'cross.svg'
          }
        },
        'actions/': {
          'default.json': {
            raw: JSON.stringify([
              {
                name: 'New',
                icon: '0',
              },
              {
                name: 'Settings',
                icon: '1',
              },
              {
                name: 'Help',
                icon: '2',
              },
              {
                name: 'About',
                icon: '3',
              },
              {
                name: 'Exit',
                icon: '4',
              }
            ])
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
                padding: 4px;
                gap: 8px;
                min-width: 200px;
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
                min-height: 32px;
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
                border: 1px solid #3c3c3c;
                padding-right: 4px;
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
            `
          }
        }
      }
    }
  }
}
}).call(this)}).call(this,"/src/node_modules/quick_actions/quick_actions.js")
},{"STATE":1}],8:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { get } = statedb(fallback_module)

module.exports = quick_editor

async function quick_editor (opts) {
  // ----------------------------------------
  let init
  let data
  const current_data = {}

  const { sdb, io, net } = await get(opts.sid)
  const { drive } = sdb

  const on = {
    style: inject
  }
  // ----------------------------------------
  const el = document.createElement('div')
  el.classList.add('quick-editor')
  const shadow = el.attachShadow({mode: 'closed'})

  shadow.innerHTML = `
      <button class="dots-button">⋮</button>
      <div class="quick-box">
        <div class="quick-menu hidden">
          <!-- Top Tabs -->
          <div class="top-btns">
          </div>
          <div class="top-tabs">
          </div>
          <button class="apply-button">Apply</button>
        </div>
      </div>
      <style>
      </style>
      `

  const style = shadow.querySelector('style')
  const menu_btn = shadow.querySelector('.dots-button')
  const menu = shadow.querySelector('.quick-menu')
  const textarea = shadow.querySelector('textarea')
  const apply_btn = shadow.querySelector('.apply-button')
  const top_btns = shadow.querySelector('.top-btns')
  const top_tabs = shadow.querySelector('.top-tabs')
  // ----------------------------------------
  // EVENTS
  // ----------------------------------------
  await sdb.watch(onbatch)
  menu_btn.onclick = menu_click
  apply_btn.onclick = apply

  io.on(port => {
    const { by, to } = port
    port.onmessage = event => {
      const txt = event.data
      const key = `[${by} -> ${to}]`
      data = txt
    }
  })
  const port = await io.at(net.page.id)
  
  return el

  // ----------------------------------------
  // FUNCTIONS
  // ----------------------------------------
  function make_btn (name, classes) {
    const btn = document.createElement('button')
    btn.textContent = name
    btn.classList.add(...classes.split(' '))
    btn.setAttribute('tab', name)
    return btn
  }
  function make_tab (id, classes) {
    const tab = document.createElement('div')
    tab.classList.add(...classes.split(' '))
    tab.id = id.replaceAll('.', '')
    tab.innerHTML = `
      <div class="sub-btns">
      </div>
      <div class="subtab-content">
      </div>
    `
    return tab
  }
  function make_textarea (id, classes, value) {
    const textarea = document.createElement('textarea')
    textarea.id = id.replaceAll('.', '')
    textarea.classList.add(...classes.split(' '))
    textarea.value = value
    textarea.placeholder = 'Type here...'
    return textarea
  }
  async function menu_click () {
    menu.classList.toggle('hidden')
    if(init)
      return
    init = true
    Object.entries(data).forEach(([dataset, files], i) => {
      let first = ''
      if(!i){
        first = ' active'
        current_data.dataset = dataset
      }
      const no_slash = dataset.split('/')[0]
      const btn = make_btn(no_slash, `tab-button${first}`)
      const tab = make_tab(no_slash, `tab-content${first}`)

      btn.onclick = () => tab_btn_click(btn, top_btns, top_tabs, '.tab-content', 'dataset', dataset)
      
      top_btns.append(btn)
      top_tabs.append(tab)

      const sub_btns = tab.querySelector('.sub-btns')
      const subtab = tab.querySelector('.subtab-content')
      Object.entries(files).forEach(([file, raw], j) => {
        let first = ''
        if(!j){
          first = ' active'
          current_data.file = file
        }
        const sub_btn = make_btn(file, `sub-btn${first}`)
        const textarea = make_textarea(file, `subtab-textarea${first}`, raw)

        sub_btn.onclick = () => tab_btn_click(sub_btn, sub_btns, subtab, '.subtab-textarea', 'file', file)

        sub_btns.append(sub_btn)
        subtab.append(textarea)
      })
    })
  }
  function tab_btn_click (btn, btns, tabs, tab_class, key, name) {
    btns.querySelector('.active').classList.remove('active')
    tabs.querySelector(tab_class+'.active').classList.remove('active')

    btn.classList.add('active')
    tabs.querySelector('#'+btn.getAttribute('tab').replaceAll('.', '')).classList.add('active')
    current_data[key] = name

  }

  function apply() {
    port.postMessage({ type: 'put', args: [
      current_data.dataset + current_data.file,
      shadow.querySelector('.tab-content.active textarea.active').value
    ]})
  }
  
  function inject (data) {
    style.textContent = data.join('\n')
  }
  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
  }

  function fail(data, type) { throw new Error('invalid message', { cause: { data, type } }) }

}


function fallback_module(){
  return {
    api: fallback_instance
  }
  function fallback_instance(){
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
              position: absolute;
              top: 100%;
              right: 0;
              background: white;
              padding: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.15);
              white-space: nowrap;
              z-index: 10;
              width: 400px;
            }

            .hidden {
              display: none;
            }

            .top-btns {
              display: flex;
              margin-bottom: 8px;
            }

            .tab-button {
              flex: 1;
              padding: 6px 10px;
              background: #eee;
              border: none;
              cursor: pointer;
              border-bottom: 2px solid transparent;
            }
            .tab-button.active {
              background: white;
              border-bottom: 2px solid #4CAF50;
            }
            .tab-content {
              display: none;
            }
            .tab-content.active {
              display: block;
            }

            .sub-btns {
              float: right;
              display: flex;
              flex-direction: column;
              gap: 4px;
              margin-left: 5px;
            }

            .sub-btn {
              padding: 4px 8px;
              background: #f1f1f1;
              border: none;
              cursor: pointer;
              text-align: right;
            }
            .sub-btn.active {
              background: #d0f0d0;
            }

            .subtab-content {
              overflow: hidden;
            }

            .subtab-textarea {
              width: 300px;
              height: 400px;
              display: none;
              resize: vertical;
            }
            .subtab-textarea.active {
              display: block;
            }

            .apply-button {
              display: block;
              margin-top: 10px;
              padding: 5px 10px;
              background-color: #4CAF50;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
            }

            `
          }
        }
      }
    }
  }
}
}).call(this)}).call(this,"/src/node_modules/quick_editor.js")
},{"STATE":1}],9:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)

const console_history = require('console_history')
const actions = require('actions')
const tabbed_editor = require('tabbed_editor')
const graph_explorer = require('graph_explorer')

module.exports = component

async function component (opts, protocol) {
  const { id, sdb } = await get(opts.sid)
  const {drive} = sdb
  const on = {
    style: inject
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="space main">
    <graph-explorer-placeholder></graph-explorer-placeholder>
    <actions-placeholder></actions-placeholder>
    <tabbed-editor-placeholder></tabbed-editor-placeholder>
    <console-history-placeholder></console-history-placeholder>
  </div>
  <style>
  </style>`
  const style = shadow.querySelector('style')
  const main = shadow.querySelector('.main')
  const graph_explorer_placeholder = shadow.querySelector('graph-explorer-placeholder')
  const actions_placeholder = shadow.querySelector('actions-placeholder')
  const tabbed_editor_placeholder = shadow.querySelector('tabbed-editor-placeholder')
  const console_placeholder = shadow.querySelector('console-history-placeholder')

  
  let console_history_el = null
  let actions_el = null
  let tabbed_editor_el = null
  let graph_explorer_el = null

  const subs = await sdb.watch(onbatch)
  let send = null
  let _ = null
  if(protocol) {
    send = protocol(msg => onmessage(msg))
    _ = { up: send, actions: null, send_console_history: null, send_tabbed_editor: null, send_graph_explorer: null }
  }
  
  graph_explorer_el = protocol ? await graph_explorer(subs[3], graph_explorer_protocol) : await graph_explorer(subs[3])
  graph_explorer_el.classList.add('graph-explorer')
  graph_explorer_placeholder.replaceWith(graph_explorer_el)
  
  actions_el = protocol ? await actions(subs[1], actions_protocol) : await actions(subs[1])
  actions_el.classList.add('actions')
  actions_placeholder.replaceWith(actions_el)
  
  tabbed_editor_el = protocol ? await tabbed_editor(subs[2], tabbed_editor_protocol) : await tabbed_editor(subs[2])
  tabbed_editor_el.classList.add('tabbed-editor')
  tabbed_editor_placeholder.replaceWith(tabbed_editor_el)
  
  console_history_el = protocol ? await console_history(subs[0], console_history_protocol) : await console_history(subs[0])
  console_history_el.classList.add('console-history')
  console_placeholder.replaceWith(console_history_el)
  let console_view = false
  let actions_view = false
  let tabbed_editor_view = true
  let graph_explorer_view = false

  if (protocol) {
    console_history_el.classList.add('hide')
    actions_el.classList.add('hide')
    tabbed_editor_el.classList.add('show')
    graph_explorer_el.classList.add('hide')
  }

  return el
  
  function console_history_toggle_view() { 
    if(console_view) {
      console_history_el.classList.remove('show')
      console_history_el.classList.add('hide')
    } else {
      console_history_el.classList.remove('hide')
      console_history_el.classList.add('show')
    }
    console_view = !console_view
  }

  function actions_toggle_view() {
    if(actions_view) {
      actions_el.classList.remove('show')
      actions_el.classList.add('hide')
    } else {
      actions_el.classList.remove('hide')
      actions_el.classList.add('show')
    }
    actions_view = !actions_view
  }

  function graph_explorer_toggle_view() {
    if(graph_explorer_view) {
      graph_explorer_el.classList.remove('show')
      graph_explorer_el.classList.add('hide')
    } else {
      graph_explorer_el.classList.remove('hide')
      graph_explorer_el.classList.add('show')
    }
    graph_explorer_view = !graph_explorer_view
  }

  function tabbed_editor_toggle_view(show = true) {
    if (show) {
      tabbed_editor_el.classList.remove('hide')
      tabbed_editor_el.classList.add('show')
      actions_el.classList.remove('show')
      actions_el.classList.add('hide')
      console_history_el.classList.remove('show')
      console_history_el.classList.add('hide')
      graph_explorer_el.classList.remove('show')
      graph_explorer_el.classList.add('hide')
      tabbed_editor_view = true
      actions_view = false
      console_view = false
      graph_explorer_view = false
    } else {
      tabbed_editor_el.classList.remove('show')
      tabbed_editor_el.classList.add('hide')
      tabbed_editor_view = false
    }
  } 

  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
  }
  function fail(data, type) { throw new Error('invalid message', { cause: { data, type } }) }
  function inject (data) {
    style.replaceChildren((() => {
      return document.createElement('style').textContent = data[0]
    })())
  }
  
  // ---------
  // PROTOCOLS
  // ---------

  function console_history_protocol (send) {
    _.send_console_history = send
    return on
    function on ({ type, data }) { 
      _.up(type, data)
    }
  }
  
  function actions_protocol (send) {
    _.send_actions = send
    return on
    function on ({ type, data }) { 
      _.up({ type, data })
    }
  }
  
  function tabbed_editor_protocol (send) {
    _.send_tabbed_editor = send
    return on
    function on ({ type, data }) { 
      _.up({ type, data })
    }
  }
  
  function graph_explorer_protocol (send) {
    _.send_graph_explorer = send
    return on
    function on ({ type, data }) { 
      _.up({ type, data })
    }
  }
  
  function onmessage ({ type, data }) {
    if(type == 'console_history_toggle') console_history_toggle_view()
    else if (type == 'graph_explorer_toggle') graph_explorer_toggle_view()
    else if (type == 'display_actions') actions_toggle_view(data)
    else if (type == 'filter_actions') _.send_actions({ type, data })
    else if (type == 'tab_name_clicked') {
      tabbed_editor_toggle_view(true)
      if (_.send_tabbed_editor) {
        _.send_tabbed_editor({ type: 'toggle_tab', data })
      }
    }
    else if (type == 'tab_close_clicked') {
      if (_.send_tabbed_editor) {
        _.send_tabbed_editor({ type: 'close_tab', data })
      }
    }
    else if (type == 'switch_tab') {
      tabbed_editor_toggle_view(true)
      if (_.send_tabbed_editor) {
        _.send_tabbed_editor({ type, data })
      }
    }
    else if (type == 'entry_toggled') {
      if (_.send_graph_explorer) {
        _.send_graph_explorer({ type, data })
      }
    }
  }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      'console_history': {
        $: ''
      },
      'actions': {
        $: ''
      },
      'tabbed_editor': {
        $: ''
      },
      'graph_explorer': {
        $: ''
      }
    }
  }

  function fallback_instance () {
    return {
      _: {
        'console_history': {
          0: '',
          mapping: {
            'style': 'style',
            'commands': 'commands',
            'icons': 'icons',
            'scroll': 'scroll'
          }
        },
        'actions': {
          0: '',
          mapping: {
            'style': 'style',
            'actions': 'actions',
            'icons': 'icons',
            'hardcons': 'hardcons'
          }
        },
        'tabbed_editor': {
          0: '',
          mapping: {
            'style': 'style',
            'files': 'files',
            'highlight': 'highlight',
            'active_tab': 'active_tab'
          }
        },
        'graph_explorer': {
          0: '',
          mapping: {
            'style': 'style',
            'entries': 'entries'
          }
        }
      },
      drive: {
        'style/': {
          'theme.css': {
            raw: `
              .space {
                display: grid;
                grid-template-rows: 1fr auto auto;
                min-height: 200px;
                width: 100;
                height: 100;
                background: linear-gradient(135deg, #0d1117 0%, #161b22 100%);
                position: relative;
                gap: 8px;
                padding: 8px;
              }
              .console-history {
                grid-row: 3;
                position: relative;
                width: 100%;
                background-color: #161b22;
                border: 1px solid #21262d;
                border-radius: 6px;
                min-height: 120px;
              }
              .actions {
                grid-row: 2;
                position: relative;
                width: 100%;
                background-color: #161b22;
                border: 1px solid #21262d;
                border-radius: 6px;
                min-height: 60px;
              }
              .tabbed-editor {
                grid-row: 1;
                position: relative;
                width: 100%;
                min-height: 250px;
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
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/space.js")
},{"STATE":1,"actions":3,"console_history":4,"graph_explorer":5,"tabbed_editor":11}],10:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)

const actions = require('actions')


module.exports = steps_wizard

async function steps_wizard (opts) {
  const { id, sdb } = await get(opts.sid)
  const {drive} = sdb
  const on = {
    style: inject
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="steps-wizard main">
    <div class="actions-slot"></div>
  </div>
  <style>
  </style>
  `

  const style = shadow.querySelector('style')
  const main = shadow.querySelector('.main')
  const actions_slot = shadow.querySelector('.actions-slot')


  const subs = await sdb.watch(onbatch)

  let actions_el = null

  actions_el = await actions(subs[0])
  actions_slot.replaceWith(actions_el)
  
  return el
  
  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
  }
  function fail(data, type) { throw new Error('invalid message', { cause: { data, type } }) }
  function inject (data) {
    style.replaceChildren((() => {
      return document.createElement('style').textContent = data[0]
    })())
  }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      'actions': {
        $: ''
      },
    }
  }

  function fallback_instance () {
    return {
      _: {
        'actions': {
          0: '',
          mapping: {
            'style': 'style',
            'actions': 'actions',
            'icons': 'icons',
            'hardcons': 'hardcons'
          }
        }
      },
      drive: {
        'style/': {
          'stepswizard.css': {
            raw: `
              .steps-wizard {
                display: flex;
                flex-direction: column;
                width: 100%;
                height: 100%;
                background: #131315;
              }
              .space{
                height: inherit;
                }
            `
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/steps_wizard/steps_wizard.js")
},{"STATE":1,"actions":3}],11:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
module.exports = tabbed_editor

async function tabbed_editor(opts, protocol) {
  const { sdb } = await get(opts.sid)
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
  </div>
  <style>
  </style>`
  const style = shadow.querySelector('style')
  const main = shadow.querySelector('.main')
  const editor_content = shadow.querySelector('.editor-content')

  
  let init = false
  let files = {}
  let active_tab = null
  let current_editor = null

  let send = null
  let _ = null
  if (protocol) {
    send = protocol(msg => onmessage(msg))
    _ = { up: send }
  }

  const subs = await sdb.watch(onbatch)

  return el

  function onmessage({ type, data }) {
    switch (type) {
      case 'switch_tab':
        switch_to_tab(data)
        break
      case 'close_tab':
        close_tab(data)
        break
      case 'toggle_tab':
        toggle_tab(data)
        break
      default:
    }
  }

  function switch_to_tab(tab_data) {
    if (active_tab === tab_data.id) {
      return
    }
    
    active_tab = tab_data.id
    create_editor(tab_data)
    
    if (_) {
      _.up({ type: 'tab_switched', data: tab_data })
    }
  }

  function toggle_tab(tab_data) {
    if (active_tab === tab_data.id) {
      hide_editor()
      active_tab = null
    } else {
      switch_to_tab(tab_data)
    }
  }

  function close_tab(tab_data) {
    if (active_tab === tab_data.id) {
      hide_editor()
      active_tab = null
    }
    
    if (_) {
      _.up({ type: 'tab_closed', data: tab_data })
    }
  }

  function create_editor(tab_data) {
    let parsed_data = JSON.parse(tab_data[0])
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

  function hide_editor() {
    editor_content.innerHTML = `
      <div class="editor-placeholder">
        <div class="placeholder-text">Select a file to edit</div>
      </div>`
    current_editor = null
  }

  function update_line_numbers() {
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

  function save_file_content() {
    if (!current_editor) return
    
    const { code_area, tab_data } = current_editor
    files[tab_data.id] = code_area.value
    
    if (_) {
      _.up({ 
        type: 'file_changed', 
        data: { 
          id: tab_data.id, 
          content: code_area.value 
        } 
      })
    }
  }

  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
    if (!init) {
      init = true
    }
  }

  function fail(data, type) { 
    console.warn('Invalid message', { data, type })
  }

  function inject(data) {
    style.innerHTML = data.join('\n')
  }

  function onfiles(data) {
    files = data[0]
  }

  function onactivetab(data) {
    if (data && data.id !== active_tab) {
      switch_to_tab(data)
    }
  }

  function handle_code_input() {
    update_line_numbers()
    save_file_content()
  }

  function handle_code_scroll() {
    if (!current_editor) return
    const { code_area, line_numbers } = current_editor
    line_numbers.scrollTop = code_area.scrollTop
  }
}

function fallback_module() {
  return {
    api: fallback_instance
  }

  function fallback_instance() {
    return {
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
        'style/': {
          'theme.css': {
            raw: `
              .tabbed-editor {
                width: 100%;
                height: 100%;
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
                display: grid;
                grid-template-rows: 1fr;
                background-color: #0d1117;
              }

              .editor-wrapper {
                display: grid;
                grid-template-columns: auto 1fr;
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
                min-height: 100%;
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
},{"STATE":1}],12:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
module.exports = component

async function component (opts, protocol) {
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
  <div class="tab-entries main"></div>
  <style>
  </style>`
  const entries = shadow.querySelector('.tab-entries')
  const style = shadow.querySelector('style')
  const main = shadow.querySelector('.main')

  
  let init = false
  let variables = []
  let dricons = []
  const subs = await sdb.watch(onbatch)
  let send = null
  let _ = null
  if (protocol) {
    send = protocol(msg => onmessage(msg))
    _ = { up: send }
  }
  if (entries) {
    let is_down = false
    let start_x
    let scroll_start

    const stop = () => {
      is_down = false
      entries.classList.remove('grabbing')
      update_scroll_position()
    }

    const move = x => {
      if (!is_down) return
      if (entries.scrollWidth <= entries.clientWidth) return stop()
      entries.scrollLeft = scroll_start - (x - start_x) * 1.5
    }

    entries.onmousedown = e => {
      if (entries.scrollWidth <= entries.clientWidth) return
      is_down = true
      entries.classList.add('grabbing')
      start_x = e.pageX - entries.offsetLeft
      scroll_start = entries.scrollLeft
      window.onmousemove = e => {
        move(e.pageX - entries.offsetLeft)
        e.preventDefault()
      }
      window.onmouseup = () => {
        stop()
        window.onmousemove = window.onmouseup = null
      }
    }

    entries.onmouseleave = stop

    entries.ontouchstart = e => {
      if (entries.scrollWidth <= entries.clientWidth) return
      is_down = true
      start_x = e.touches[0].pageX - entries.offsetLeft
      scroll_start = entries.scrollLeft
    }
    ;['ontouchend', 'ontouchcancel'].forEach(ev => {
      entries[ev] = stop
    })

    entries.ontouchmove = e => {
      move(e.touches[0].pageX - entries.offsetLeft)
      e.preventDefault()
    }
  }
  return div

  function onmessage({ type, data }) {
    switch (type) {
      default:
        // Handle other message types
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
    const icon_el = el.querySelector('.icon')
    const name_el = el.querySelector('.name')
    const close_btn = el.querySelector('.btn')

    name_el.draggable = false
    
    // Add click handler for tab name (switch/toggle tab)
    name_el.onclick = () => {
      if (_) {
        _.up({ type: 'tab_name_clicked', data: { id, name } })
      }
    }
    
    // Add click handler for close button
    close_btn.onclick = (e) => {
      e.stopPropagation()
      if (_) {
        _.up({ type: 'tab_close_clicked', data: { id, name } })
      }
    }
    
    entries.appendChild(el)
    return
  }

  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
    if (!init) {
      variables.forEach(create_btn)
      init = true
    } else {
      // TODO: Here we can handle drive updates
    }
  }
  function fail (data, type) { throw new Error('invalid message', { cause: { data, type } }) }
  function inject (data) {
    style.innerHTML = data.join('\n')
  }

  function onvariables (data) {
    const vars = typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]
    variables = vars
  }

  function iconject (data) {
    dricons = data
  }

  function update_scroll_position () {
    // TODO
  }

  function onscroll (data) {
    setTimeout(() => {
      if (entries) {
        entries.scrollLeft = data
      }
    }, 200)
  }
}

function fallback_module () {
  return {
    api: fallback_instance,
  }
  function fallback_instance () {
    return {
      drive: {
        'icons/': {
          'cross.svg': {
            '$ref': 'cross.svg'
          },
          '1.svg': {
            '$ref': 'icon.svg'
          },
          '2.svg': {
            '$ref': 'icon.svg'
          },
          '3.svg': {
            '$ref': 'icon.svg'
          }
        },
        'variables/': {
          'tabs.json': {
            '$ref': 'tabs.json'
          }
        },
        'scroll/': {
          'position.json': {
            raw: '100'
          }
        },
        'style/': {
          'theme.css': {
            '$ref': 'style.css'
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/tabs/tabs.js")
},{"STATE":1}],13:[function(require,module,exports){
(function (__filename){(function (){
const state = require('STATE')
const state_db = state(__filename)
const { sdb, get } = state_db(fallback_module)

const tabs_component = require('tabs')
const task_manager = require('task_manager')

module.exports = tabsbar

async function tabsbar (opts, protocol) {
  const { id, sdb } = await get(opts.sid)
  const {drive} = sdb
  const on = {
    style: inject,
    icons: inject_icons
  }

  let dricons = {}
  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  
  let send = null
  let _ = null
  if (protocol) {
    send = protocol(msg => onmessage(msg))
    _ = { up: send, tabs: null }
  }
  
  shadow.innerHTML = `
  <div class="tabs-bar-container main">
  <button class="hat-btn"></button>
  <tabs></tabs>
  <task-manager></task-manager>
  <button class="bar-btn"></button>
  </div>
  <style>
  </style>`
  const style = shadow.querySelector('style')
  const main = shadow.querySelector('.main')
  const hat_btn = shadow.querySelector('.hat-btn')
  const bar_btn = shadow.querySelector('.bar-btn')

  const subs = await sdb.watch(onbatch)
  if (dricons[0]) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(dricons[0], 'image/svg+xml')
    const svgElem = doc.documentElement
    hat_btn.replaceChildren(svgElem)
  }
  if (dricons[2]) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(dricons[2], 'image/svg+xml')
    const svgElem = doc.documentElement
    bar_btn.replaceChildren(svgElem)
  }
  const tabs = protocol ? await tabs_component(subs[0], () => {}, tabs_protocol) : await tabs_component(subs[0])
  tabs.classList.add('tabs-bar')
  shadow.querySelector('tabs').replaceWith(tabs)

  const task_mgr = await task_manager(subs[1], () => console.log('Task manager clicked!'))
  task_mgr.classList.add('bar-btn')
  shadow.querySelector('task-manager').replaceWith(task_mgr)

  return el

  function onmessage({ type, data }) {
    switch (type) {
      default:
        // Handle other message types
    }
  }

  function tabs_protocol(send) {
    _.tabs = send
    return on
    function on({ type, data }) {
      _.up({ type, data })
    }
  }

  return el

  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
  }
  function fail (data, type) { throw new Error('invalid message', { cause: { data, type } }) }

  function inject (data) {
    style.innerHTML = data.join('\n')
  }

  function inject_icons (data) {
    dricons = data
  }
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
            style: 'style'
          }
        },
        task_manager: {
          0: '',
          mapping: {
            count: 'count',
            style: 'style'
          }
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
                width: 300px;
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
        }
      }
    }
  }
}
}).call(this)}).call(this,"/src/node_modules/tabsbar/tabsbar.js")
},{"STATE":1,"tabs":12,"task_manager":14}],14:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
module.exports = task_manager

async function task_manager (opts, callback = () => console.log('task manager clicked')) {
  const { id, sdb } = await get(opts.sid)
  const {drive} = sdb
  let number = 0
  const on = {
    style: inject,
    count: update_count
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })

  shadow.innerHTML = `
  <div class="task-manager-container main">
    <button class="task-count-btn">0</button>
  </div>
  <style>
  </style>`
  const style = shadow.querySelector('style')
  const main = shadow.querySelector('.main')
  const btn = shadow.querySelector('.task-count-btn')

  
  btn.onclick = callback

  await sdb.watch(onbatch)

  return el

  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
  }
  function fail (data, type) { throw new Error('invalid message', { cause: { data, type } }) }
  function inject (data) {
    style.innerHTML = data.join('\n')
  }

  function update_count (data) {
    if (btn) btn.textContent = data.toString()
    else number = data
  }
}

function fallback_module () {
  return {
    api: fallback_instance,
  }

  function fallback_instance () {
    return {
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
        'count/': {
          'value.json': {
            raw: '3'
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/task_manager.js")
},{"STATE":1}],15:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
const action_bar = require('action_bar')
const tabsbar = require('tabsbar')

module.exports = taskbar

async function taskbar(opts, protocol) {
  const { id, sdb } = await get(opts.sid)
  const {drive} = sdb
  const on = {
    style: inject
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })

  shadow.innerHTML = `
  <div class="taskbar-container main">
    <div class="action-bar-slot"></div>
    <div class="tabsbar-slot"></div>
  </div>
  <style>
  </style>`
  const style = shadow.querySelector('style')
  const main = shadow.querySelector('.main')
  const action_bar_slot = shadow.querySelector('.action-bar-slot')
  const tabsbar_slot = shadow.querySelector('.tabsbar-slot')

  
  const subs = await sdb.watch(onbatch)
  let send = null
  let _ = null
  if(protocol) {
    send = protocol(msg => onmessage(msg))
    _ = { up: send, action_bar: null, tabsbar: null }
  }
  const action_bar_el = protocol ? await action_bar(subs[0], action_bar_protocol) : await action_bar(subs[0])
  action_bar_el.classList.add('replaced-action-bar')
  action_bar_slot.replaceWith(action_bar_el)

  const tabsbar_el = protocol ? await tabsbar(subs[1], tabsbar_protocol) : await tabsbar(subs[1])
  tabsbar_el.classList.add('replaced-tabsbar')
  tabsbar_slot.replaceWith(tabsbar_el)

  return el

  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
  }

  function fail(data, type) { throw new Error('invalid message', { cause: { data, type } }) }

  function inject(data) {
    style.innerHTML = data.join('\n')
  }

  // ---------
  // PROTOCOLS  
  // ---------
  function action_bar_protocol (send) {
    _.action_bar = send
    return on
    function on ({ type, data }) { 
      _.up({ type, data })
    }
  }
  
  function tabsbar_protocol (send) {
    _.tabsbar = send
    return on
    function on ({ type, data }) { 
      _.up({ type, data })
    }
  }
  
  function onmessage ({ type, data }) {
    switch (type) {
      case 'tab_name_clicked':
      case 'tab_close_clicked':
        _.up({ type, data })
        break
      default:
        if (_.action_bar) {
          _.action_bar({ type, data })
        }
    }
  }
}

function fallback_module() {
  return {
    api: fallback_instance,
    _: {
      'action_bar': {
        $: ''
      },
      'tabsbar': {
        $: ''
      },
    }
  }

  function fallback_instance() {
    return {
      _: {
        'action_bar': {
          0: '',
          mapping: {
            'icons': 'icons',
            'style': 'style'
          }
        },
        'tabsbar': {
          0: '',
          mapping: {
            'icons': 'icons',
            'style': 'style'
          }
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
              }
              .replaced-tabsbar {
                display: flex;
                flex: auto;
              }
              .replaced-action-bar {
                display: flex;
              }
              @media (max-width: 768px) {
                .taskbar-container {
                  flex-direction: column;
                }
              }
            `
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/taskbar/taskbar.js")
},{"STATE":1,"action_bar":2,"tabsbar":13}],16:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)

const space = require('space')
const taskbar = require('taskbar')

module.exports = theme_widget

async function theme_widget (opts) {
  const { id, sdb } = await get(opts.sid)
  const {drive} = sdb
  const on = {
    style: inject
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="theme-widget main">
    <div class="space-slot"></div>
    <div class="taskbar-slot"></div>
  </div>
  <style>
  </style>
  `

  const style = shadow.querySelector('style')
  const main = shadow.querySelector('.main')
  const space_slot = shadow.querySelector('.space-slot')
  const taskbar_slot = shadow.querySelector('.taskbar-slot')


  const subs = await sdb.watch(onbatch)
  
  let space_el = null
  let taskbar_el = null
  const _ = { send_space: null, send_taskbar: null }
  
  taskbar_el = await taskbar(subs[1], taskbar_protocol)
  taskbar_slot.replaceWith(taskbar_el)
  
  space_el = await space(subs[0], space_protocol)
  space_el.classList.add('space')
  space_slot.replaceWith(space_el)
  
  return el
  
  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
  }
  function fail(data, type) { throw new Error('invalid message', { cause: { data, type } }) }
  function inject (data) {
    style.replaceChildren((() => {
      return document.createElement('style').textContent = data[0]
    })())
  }

  // ---------
  // PROTOCOLS
  // ---------
  function space_protocol (send) {
    _.send_space = send
    return on
    function on ({ type, data }) {
      _.send_taskbar({ type, data })
    }
  }

  function taskbar_protocol (send) {
    _.send_taskbar = send
    return on
    function on ({ type, data }) {
      _.send_space({ type, data })
    }
  }
}

function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      'space': {
        $: ''
      },
      'taskbar': {
        $: ''
      },
    }
  }

  function fallback_instance () {
    return {
      _: {
        'space': {
          0: '',
          mapping: {
            'style': 'style'
          }
        },
        'taskbar': {
          0: '',
          mapping: {
            'style': 'style'
          }
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
              }
              .space{
                height: inherit;
                }
            `
          }
        }
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/theme_widget/theme_widget.js")
},{"STATE":1,"space":9,"taskbar":15}],17:[function(require,module,exports){
const prefix = 'https://raw.githubusercontent.com/alyhxn/playproject/main/'
const init_url = location.hash === '#dev' ? 'web/init.js' : prefix + 'src/node_modules/init.js'
const args = arguments

const has_save = location.hash.includes('#save')
const fetch_opts = has_save ? {} : { cache: 'no-store' }

if (!has_save) {
  localStorage.clear()
}

fetch(init_url, fetch_opts).then(res => res.text()).then(async source => {
  const module = { exports: {} }
  const f = new Function('module', 'require', source)
  f(module, require)
  const init = module.exports
  await init(args, prefix)
  require('./page') // or whatever is otherwise the main entry of our project
})

},{"./page":18}],18:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('../src/node_modules/STATE')
const statedb = STATE(__filename)
const { sdb, io } = statedb(fallback_module)
const { drive, admin } = sdb
/******************************************************************************
  PAGE
******************************************************************************/
const navbar = require('../src/node_modules/menu')
const theme_widget = require('../src/node_modules/theme_widget')
const taskbar = require('../src/node_modules/taskbar')
const tabsbar = require('../src/node_modules/tabsbar')
const action_bar = require('../src/node_modules/action_bar')
const space = require('../src/node_modules/space')
const tabs = require('../src/node_modules/tabs')
const console_history = require('../src/node_modules/console_history')
const actions = require('../src/node_modules/actions')
const tabbed_editor = require('../src/node_modules/tabbed_editor')
const task_manager = require('../src/node_modules/task_manager')
const quick_actions = require('../src/node_modules/quick_actions')
const graph_explorer = require('../src/node_modules/graph_explorer')
const editor = require('../src/node_modules/quick_editor')
const steps_wizard = require('../src/node_modules/steps_wizard')

const imports = {
  theme_widget,
  taskbar,
  tabsbar,
  action_bar,
  space,
  tabs,
  console_history,
  actions,
  tabbed_editor,
  task_manager,
  quick_actions,
  graph_explorer,
  steps_wizard,
}
config().then(() => boot({ sid: '' }))

async function config () {
  // const path = path => new URL(`../src/node_modules/${path}`, `file://${__dirname}`).href.slice(8)
  const html = document.documentElement
  const meta = document.createElement('meta')
  // const appleTouch = '<link rel="apple-touch-icon" sizes="180x180" href="./src/node_modules/assets/images/favicon/apple-touch-icon.png">'
  // const icon32 = '<link rel="icon" type="image/png" sizes="32x32" href="./src/node_modules/assets/images/favicon/favicon-32x32.png">'
  // const icon16 = '<link rel="icon" type="image/png" sizes="16x16" href="./src/node_modules/assets/images/favicon/favicon-16x16.png">'
  // const webmanifest = '<link rel="manifest" href="./src/node_modules/assets/images/favicon/site.webmanifest"></link>'
  const font = 'https://fonts.googleapis.com/css?family=Nunito:300,400,700,900|Slackey&display=swap'
  const loadFont = `<link href=${font} rel='stylesheet' type='text/css'>`
  html.setAttribute('lang', 'en')
  meta.setAttribute('name', 'viewport')
  meta.setAttribute('content', 'width=device-width,initial-scale=1.0')
  // @TODO: use font api and cache to avoid re-downloading the font data every time
  document.head.append(meta)
  document.head.innerHTML += loadFont // + icon16 + icon32 + webmanifest
  await document.fonts.ready // @TODO: investigate why there is a FOUC
}
/******************************************************************************
  PAGE BOOT
******************************************************************************/
async function boot (opts) {
  // ----------------------------------------
  // ID + JSON STATE
  // ----------------------------------------
  const on = {
    style: inject,
    ...sdb.admin.status.dataset.drive
  }
  // const status = {}
  // ----------------------------------------
  // TEMPLATE
  // ----------------------------------------
  const el = document.body
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="navbar-slot"></div>
  <div class="components-wrapper-container">
    <div class="components-wrapper"></div>
  </div>
  <style>
  </style>`
  el.style.margin = 0
  el.style.backgroundColor = '#d8dee9'


  // ----------------------------------------
  // ELEMENTS
  // ----------------------------------------

  const navbar_slot = shadow.querySelector('.navbar-slot')
  const components_wrapper = shadow.querySelector('.components-wrapper')
  const style = shadow.querySelector('style')

  const entries = Object.entries(imports)
  const wrappers = []
  const pairs = {}
  const names = entries.map(([name]) => name)
  let current_selected_wrapper = null

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
    on_select_all_toggle: handle_select_all_toggle
  }
  io.on(port => {
    const { by, to } = port
    port.onmessage = event => {
      const txt = event.data
      const key = `[${by} -> ${to}]`
      on[txt.type] && on[txt.type](...txt.args, pairs[to])

    }
  })
  

  const editor_subs = await sdb.get_sub("page>../src/node_modules/quick_editor")
  const subs = (await sdb.watch(onbatch)).filter((_, index) => index % 2 === 0)
  console.log('Page subs', subs)
  const nav_menu_element = await navbar(subs[names.length], names, initial_checked_indices, menu_callbacks)
  navbar_slot.replaceWith(nav_menu_element)
  create_component(entries)
  window.onload = scroll_to_initial_selected

  
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
    const component_content = await factory(subs[index])
    console.log('component_content', index)
    component_content.className = 'component-content'
    
    const node_id = admin.status.s2i[subs[index].sid]
    const editor_id = admin.status.a2i[admin.status.s2i[editor_subs[index].sid]]
    inner.append(component_content, await editor(editor_subs[index]))
    

    const result = {}
    const drive = admin.status.dataset.drive

    pairs[editor_id] = node_id
    
    const datasets = drive.list('', node_id)
    for(dataset of datasets) {
      result[dataset] = {}
      const files = drive.list(dataset, node_id)
      for(file of files){
        result[dataset][file] = (await drive.get(dataset+file, node_id)).raw
      }
    }
    

    const port = await io.at(editor_id)
    port.postMessage(result)

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
          setTimeout(() => {
            target_wrapper.scrollIntoView({ behavior: 'auto', block: 'center' })
            clear_selection_highlight()
            target_wrapper.style.backgroundColor = '#2e3440'
            current_selected_wrapper = target_wrapper
          }, 100)
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
    const checked_indices = wrappers.reduce((acc, w, i) => {
      if (w.checkbox_state) { acc.push(i + 1) }
      return acc
    }, [])
    const params = new URLSearchParams()
    if (checked_indices.length > 0 && checked_indices.length < wrappers.length) {
      params.set('checked', JSON.stringify(checked_indices))
    }
    const selected_index = names.indexOf(selected_name)
    if (selected_name && selected_index !== -1 && wrappers[selected_index]?.checkbox_state) {
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
    wrappers.forEach((w, index) => {
      w.outer.style.display = select_all ? 'block' : 'none'
      w.checkbox_state = select_all
    })
    clear_selection_highlight()
    update_url(null)
  }

  async function onbatch(batch) {
    for (const { type, paths } of batch){
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      console.log('onbatch', type, data)
      const func = on[type] || fail
      func(data, type)
    }
  }
  function fail (data, type) { throw new Error('invalid message', { cause: { data, type } }) }
  function inject(data) {
    style.innerHTML = data.join('\n')
  }
}
function fallback_module () {
  const menuname = '../src/node_modules/menu'
  const names = [
    '../src/node_modules/theme_widget',
    '../src/node_modules/taskbar',
    '../src/node_modules/tabsbar',
    '../src/node_modules/action_bar',
    '../src/node_modules/space',
    '../src/node_modules/tabs',
    '../src/node_modules/console_history',
    '../src/node_modules/actions',
    '../src/node_modules/tabbed_editor',
    '../src/node_modules/task_manager',
    '../src/node_modules/quick_actions',
    '../src/node_modules/graph_explorer',
    '../src/node_modules/steps_wizard'
  ]
  const subs = {}
  names.forEach(subgen)
  subs['../src/node_modules/tabs'] = {
    $: '',
    0: '',
    mapping: {
      'icons': 'icons',
      'variables': 'variables',
      'scroll': 'scroll',
      'style': 'style'
    }
  }
  subs['../src/node_modules/tabsbar'] = {
    $: '',
    0: '',
    mapping: {
      'icons': 'icons',
      'style': 'style'
    }
  }
  subs['../src/node_modules/action_bar'] = {
    $: '',
    0: '',
    mapping: {
      'icons': 'icons',
      'style': 'style'
    }
  }
  subs['../src/node_modules/console_history'] = {
    $: '',
    0: '',
    mapping: {
      'style': 'style',
      'commands': 'commands',
      'icons': 'icons',
      'scroll': 'scroll'
    }
  }
  subs['../src/node_modules/actions'] = {
    $: '',
    0: '',
    mapping: {
      'actions': 'actions',
      'icons': 'icons',
      'hardcons': 'hardcons',
      'style': 'style'
    }
  }
  subs['../src/node_modules/tabbed_editor'] = {
    $: '',
    0: '',
    mapping: {
      'style': 'style',
      'files': 'files',
      'highlight': 'highlight',
      'active_tab': 'active_tab'
    }
  }
  subs['../src/node_modules/task_manager'] = {
    $: '',
    0: '',
    mapping: {
      'style': 'style',
      'count': 'count'
    }
  }
  subs['../src/node_modules/quick_actions'] = {
    $: '',
    0: '',
    mapping: {
      'style': 'style',
      'icons': 'icons',
      'actions': 'actions',
      'hardcons': 'hardcons'
    }
  }
  subs['../src/node_modules/graph_explorer'] = {
    $: '',
    0: '',
    mapping: {
      'style': 'style',
      'entries': 'entries'
    }
  }
  subs[menuname] = { 
    $: '',
    0: '',
    mapping: {
      'style': 'style',
    }
  }
  subs['../src/node_modules/quick_editor'] = {
    $: '',
    mapping: {
      'style': 'style'
    }
  }
  for(i = 0; i < Object.keys(subs).length - 2; i++){
    subs['../src/node_modules/quick_editor'][i] = quick_editor$
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
      
          .components-wrapper {
            width: 95%;
            margin: 0 auto;
            padding: 2.5%;
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
            position: relative;
            padding: 15px;
            border: 3px solid #666;
            resize: both;
            overflow: auto;
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
      .component-wrapper:hover .quick-editor {
        display: block;
      }
      .quick-editor {
        display: none;
        position: absolute;
        top: -5px;
        right: -10px;
        z-index: 16;
      }`
        }
      }
    }
  }
  function quick_editor$ (args, tools, [quick_editor]){
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
        'style': 'style',
      }
    }
  }
}

}).call(this)}).call(this,"/web/page.js")
},{"../src/node_modules/STATE":1,"../src/node_modules/action_bar":2,"../src/node_modules/actions":3,"../src/node_modules/console_history":4,"../src/node_modules/graph_explorer":5,"../src/node_modules/menu":6,"../src/node_modules/quick_actions":7,"../src/node_modules/quick_editor":8,"../src/node_modules/space":9,"../src/node_modules/steps_wizard":10,"../src/node_modules/tabbed_editor":11,"../src/node_modules/tabs":12,"../src/node_modules/tabsbar":13,"../src/node_modules/task_manager":14,"../src/node_modules/taskbar":15,"../src/node_modules/theme_widget":16}]},{},[17]);