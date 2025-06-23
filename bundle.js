(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)

const editor = require('quick_editor')

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

  main.append(editor(style, inject))

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
      'quick_editor': 0
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
},{"STATE":1,"quick_actions":7,"quick_editor":8}],3:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
const editor = require('quick_editor')
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

  main.append(editor(style, inject))
  
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
    _: {
      'quick_editor': 0
    }
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
},{"STATE":1,"quick_editor":8}],4:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
const editor = require('quick_editor')
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
  
  main.append(editor(style, inject))
  
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
    api: fallback_instance,
    _:{
      'quick_editor': 0
    }
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
},{"STATE":1,"quick_editor":8}],5:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)

module.exports = component

async function component (opts, protocol) {
  const { sdb } = await get(opts.sid)
  const { drive } = sdb
  const on = {
    style: inject_style,
    entries: on_entries,
    icons: iconject
  }

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="graph-explorer">
    <div class="explorer-container"></div>
  </div>`

  const container = shadow.querySelector('.explorer-container')

  /******************************************************************************
  Variables for entries and view management. To get data from the state drive.
  ******************************************************************************/
  let entries = []
  let view = []
  let view_num = 0
  let expanded_nodes = new Set()
  let init = false

  /******************************************************************************
  Intersection Observer to track which nodes are currently in view.
  //TODO: Lazy loading of nodes based on scroll visibility.
  ******************************************************************************/
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const node_id = entry.target.dataset.path
      if (entry.isIntersecting) {
        if (!view.includes(node_id)) {
          view.push(node_id)
        }
      } else {
        const index = view.indexOf(node_id)
        if (index !== -1) {
          view.splice(index, 1)
        }
      }
    })
  }, {
    root: container,
    threshold: 0.1
  })

  function calculate_view_num() {
    const container_height = container.clientHeight
    const node_height = 24
    view_num = Math.ceil(container_height / node_height) * 3 || 30
    // console.log('view:', view)
  }


  const subs = await sdb.watch(onbatch)

  /******************************************************************************
  Resize Observer
  ******************************************************************************/
  const resize_observer = new ResizeObserver(() => {
    calculate_view_num()
    render_visible_nodes()
  })
  resize_observer.observe(container)

  let send = null
  if (protocol) {
    send = protocol(msg => onmessage(msg))
  }

  return el

  function onmessage(msg) {
    // console.log('Graph Explorer received message:', msg)
  }

  async function onbatch(batch) {
    for (const { type, paths } of batch) {
      const data = await Promise.all(paths.map(path => drive.get(path).then(file => file.raw)))
      const func = on[type] || fail
      func(data, type)
    }
    if (!init && entries.length > 0) {
      calculate_view_num()
      render_visible_nodes()
      init = true
    }
  }

  function fail (data, type) { 
    throw new Error('invalid message', { cause: { data, type } }) 
  }

  function on_entries(data) {
    entries = typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]
  }
  function iconject(data) {
    icons = data
  }
  function inject_style(data) {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(data)
    shadow.adoptedStyleSheets = [sheet]
  }
  /******************************************************************************
  Function for the rendering based on the visible nodes.
  ******************************************************************************/
  function render_visible_nodes() {
    container.replaceChildren()
    if (entries.length === 0) return
    
    const visible_entries = calculate_visible_entries()
    visible_entries.forEach(entry => {
      const node = create_node(entry)
      // console.log(container, node)
      container.appendChild(node)
      observer.observe(node)
    })
  }

  function calculate_visible_entries() {
    const visible_entries = []
    visible_entries.push(entries[0])
    let queue = [...entries[0].subs.map(index => entries[index])]
    
    while (queue.length > 0 && visible_entries.length < view_num) {
      const entry = queue.shift()
      if (!entry) continue
      visible_entries.push(entry)

      const entry_path = get_full_path(entry)
      if (expanded_nodes.has(entry_path) && entry.subs && entry.subs.length > 0) {
        queue = [...entry.subs.map(index => entries[index]), ...queue]
      }
    }
    
    return visible_entries
  }
  /******************************************************************************
  Create a node element for the explorer tree.
  ******************************************************************************/
  function create_node(entry) {
    const node = document.createElement('div')
    const depth = calculate_depth(entry.path)
    const is_expanded = expanded_nodes.has(get_full_path(entry))
    const has_children = entry.subs && entry.subs.length > 0
    
    let icon = get_icon_for_type(entry.type)
    let prefix = create_tree_prefix(entry, depth, is_expanded, has_children)
    
    node.className = 'explorer-node'
    node.dataset.path = get_full_path(entry)
    node.dataset.index = entries.indexOf(entry)
    node.style.paddingLeft = `${depth * 10}px`
    
    node.innerHTML = `
      <span class="tree-prefix">${prefix}</span>
      <span class="node-icon">${icon}</span>
      <span class="node-name">${entry.name}</span>
    `
    
    // Setup click handlers
    const prefix_el = node.querySelector('.tree-prefix')
    const icon_el = node.querySelector('.node-icon')
    
    if (has_children) {
      prefix_el.onclick = null
      //TODO: Add supernode support
      icon_el.onclick = () => toggle_node(entry)
    }
    
    return node
  }

  // Toggle node expansion state
  function toggle_node(entry) {
    const path = get_full_path(entry)
    
    if (expanded_nodes.has(path)) {
      expanded_nodes.delete(path)
    } else {
      expanded_nodes.add(path)
    }
    render_visible_nodes()
    // console.log('view:', view)
    // console.log('view:', view_num)
  }

  // Get appropriate icon for entry type
  function get_icon_for_type(type) {
    const type_icons = {
      'root': '🌐',
      'folder': '📁',
      'file': '📄',
      'html-file': '📄',
      'js-file': '📄',
      'css-file': '🖌️',
      'json-file': '🎨'
    }
    
    return type_icons[type] || '📄'
  }
  /******************************************************************************
   Prefix creation for tree structure.
   //TODO: Add support for different icons based on entry type.
  /******************************************************************************/
  function create_tree_prefix(entry, depth, is_expanded, has_children) {
    if (depth === 0) return has_children ? (is_expanded ? '🪄┬' : '🪄┬') : '🪄─'
    if (has_children) {
      return is_expanded ? '├┬' : '├─'
    } else {
      return '└─'
    }
  }

  function calculate_depth(path) {
    if (!path) return 0
    return (path.match(/\//g) || []).length
  }
  function get_full_path(entry) {
    return entry.path + entry.name + '/'
  }
}

function fallback_module() {
  return {
    api: fallback_instance
  }
  
  function fallback_instance() {
    return {
      drive: {
        'style/': {
          'theme.css': {
            raw: `
              .graph-explorer {
                height: 300px;
                overflow: auto;
                font-family: monospace;
                color: #eee;
                background-color: #2d3440;
                user-select: none;
              }
              
              .explorer-container {
                padding: 10px;
                height: 300px;
              }
              
              .explorer-node {
                display: flex;
                align-items: center;
                padding: 2px 0;
                white-space: nowrap;
                cursor: pointer;
              }
              
              .explorer-node:hover {
                background-color: rgba(255, 255, 255, 0.1);
              }
              
              .tree-prefix {
                margin-right: 4px;
                opacity: 0.7;
                cursor: pointer;
              }
              
              .node-icon {
                margin-right: 6px;
                cursor: pointer;
              }
              
              .node-name {
                overflow: hidden;
                text-overflow: ellipsis;
              }
            `
          }
        },
        'entries/': {
          'graph.json': {
            '$ref': 'entries.json'
          }
        },
        'icons/': {
          'folder_icons.json': {
            raw: `{
              "root": "🌐",
              "folder": "📁",
              "file": "📄",
              "html-file": "📄",
              "js-file": "📄",
              "css-file": "🖌️",
              "json-file": "🎨"
            }`
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
const editor = require('quick_editor')

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

  main.append(editor(style, inject))

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
    style.innerHTML = data.join('\n')
  }
}
function fallback_module () {
  return {
    api: fallback_instance,
    _: {
      'quick_editor': 0
    }
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
},{"STATE":1,"quick_editor":8}],7:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
const editor = require('quick_editor')
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

  main.append(editor(style, inject))
  
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
    api: fallback_instance,
    _:{
      'quick_editor': 0
    }
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
},{"STATE":1,"quick_editor":8}],8:[function(require,module,exports){
module.exports = editor
let count = 0
let first = true
const els = []
const els_data = []

function toggle () {
  els.forEach((el, i) => {
    if(el.innerHTML){
      els_data[i].text = el.querySelector('textarea').value
      el.replaceChildren('')
    }
    else
      el.replaceChildren(...init(els_data[i], el).children)
  })
}
function editor (style, inject, drive) {
  if(first){
      first = false
      return toggle
  }
  const el = document.createElement('div')
  el.classList.add('quick-editor')
  els.push(el)
  els_data.push({style, inject, drive})
  return el
}

function init ({ style, inject, drive, text }, el) {
  
  el.innerHTML = `
      <button class="dots-button">⋮</button>
      <div class="quick-menu hidden">
        <textarea placeholder="Type here..."></textarea>
        <button class="apply-button">Apply</button>
      </div>
    
    <style>
      .main {
        position: relative;
        overflow: visible;
      }
      .main:hover {
        margin-right: 20px;
      }
      .main:hover::before {
        content: '';
        position: absolute;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
        border: 4px solid skyblue;
        pointer-events: none;
        z-index: 4;
      }
      .main:hover .quick-editor {
        display: block;
      }
      .quick-editor {
        display: none;
        position: absolute;
        top: -5px;
        right: -10px;
        z-index: 5;
      }

      .quick-editor .dots-button {
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

      .quick-editor .quick-menu {
        position: absolute;
        top: 100%;
        left: 0;
        background: white;
        padding: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        white-space: nowrap;
        z-index: 10;
      }

      .quick-editor .quick-menu textarea {
        width: 300px;
        height: 400px;
        resize: vertical;
      }

      .quick-editor .hidden {
        display: none;
      }
      .quick-editor .apply-button {
        display: block;
        margin-top: 10px;
        padding: 5px 10px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
    </style>
  `
  const btn = el.querySelector('.dots-button')
  const menu = el.querySelector('.quick-menu')
  const textarea = el.querySelector('textarea')
  const applyBtn = el.querySelector('.apply-button')

  btn.addEventListener('click', (e) => {
    menu.classList.toggle('hidden')
    textarea.value = text || style.innerHTML
    // Auto reposition to avoid overflow
    const rect = menu.getBoundingClientRect()
    const overflowRight = rect.right > window.innerWidth
    const overflowLeft = rect.left < 0

    if (overflowRight) {
      menu.style.left = 'auto'
      menu.style.right = '0'
    } else if (overflowLeft) {
      menu.style.left = '0'
      menu.style.right = 'auto'
    } else {
      menu.style.left = '0'
      menu.style.right = 'auto'
    }
  })

  applyBtn.addEventListener('click', apply)

  textarea.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'Enter') {
      apply()
    }
  })

  return el

  function apply() {
    if (style && textarea) {
      inject([textarea.value])
    }
  }
}
},{}],9:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)

const console_history = require('console_history')
const actions = require('actions')
const tabbed_editor = require('tabbed_editor')
const graph_explorer = require('graph_explorer')
const editor = require('quick_editor')

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

  main.append(editor(style, inject))
  
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
      },
      'quick_editor': 0
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
            'entries': 'entries',
            'icons': 'icons'
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
},{"STATE":1,"actions":3,"console_history":4,"graph_explorer":5,"quick_editor":8,"tabbed_editor":11}],10:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)

module.exports = steps_wizard

async function steps_wizard (opts) {
  const { id, sdb } = await get(opts.sid)
  const {drive} = sdb

  const on = {
    style: inject,
    variables: onvariables,
  }

  let variables = []

  const el = document.createElement('div')
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <div class="steps-wizard main">
    <div class="steps-slot"></div>
  </div>
  <style>
  </style>
  `

  const style = shadow.querySelector('style')
  const steps_entries = shadow.querySelector('.steps-slot')

  const subs = await sdb.watch(onbatch)

  return el
  
  function render_steps(steps) {
    steps_entries.innerHTML = '';

    steps.forEach((step, index) => {
      const btn = document.createElement('button');
      btn.className = 'step-button';
      btn.textContent = step.name + (step.type === 'optional' ? ' *' : '');
      btn.setAttribute('data-step', index + 1);

      const accessible = can_access(index, steps);

      let status = 'default';
      if (!accessible) status = 'disabled';
      else if (step.is_completed) status = 'completed';
      else if (step.status === 'error') status = 'error';
      else if (step.type === 'optional') status = 'optional';

      btn.classList.add(`step-${status}`);
      btn.disabled = (status === 'disabled');

      btn.onclick = () => {
        if (!btn.disabled) {
          step.is_completed = true
          step.status = 'completed';
          console.log('Clicked:', step);
          render_steps(steps);
        }
      };

      steps_entries.appendChild(btn);
    });
    
  }

  function can_access(index, steps) {
    for (let i = 0; i < index; i++) {
      if (!steps[i].is_completed && steps[i].type !== 'optional') {
        return false;
      }
    }

    return true;
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

  function onvariables (data) {
    const vars = typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]
    variables = vars['change_path']
    render_steps(variables); 
  }

}

function fallback_module () {
  return {
    api: fallback_instance
  }

  function fallback_instance () {
    return {
      drive: {
        'style/': {
          'stepswizard.css': {
            '$ref': 'stepswizard.css' 
          }
        },
        'variables/': {
          'steps_wizard.json': {
            '$ref': 'steps_wizard.json'
          }
        },
      }
    }
  }
}

}).call(this)}).call(this,"/src/node_modules/steps_wizard/steps_wizard.js")
},{"STATE":1}],11:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
const editor = require('quick_editor')
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

  main.append(editor(style, inject))
  
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
    api: fallback_instance,
    _: {
      'quick_editor': 0
    }
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
},{"STATE":1,"quick_editor":8}],12:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
const editor = require('quick_editor')
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

  main.append(editor(style, inject))
  
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
    _:{
      'quick_editor': 0
    }
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
},{"STATE":1,"quick_editor":8}],13:[function(require,module,exports){
(function (__filename){(function (){
const state = require('STATE')
const state_db = state(__filename)
const { sdb, get } = state_db(fallback_module)

const tabs_component = require('tabs')
const task_manager = require('task_manager')
const editor = require('quick_editor')

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

  main.append(editor(style, inject))
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
      'quick_editor': 0
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
},{"STATE":1,"quick_editor":8,"tabs":12,"task_manager":14}],14:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
const editor = require('quick_editor')
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

  main.append(editor(style, inject))
  
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
    _: {
      'quick_editor': 0
    }
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
},{"STATE":1,"quick_editor":8}],15:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)
const editor = require('quick_editor')
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

  main.append(editor(style, inject))
  
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
      'quick_editor': 0
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
},{"STATE":1,"action_bar":2,"quick_editor":8,"tabsbar":13}],16:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('STATE')
const statedb = STATE(__filename)
const { sdb, get } = statedb(fallback_module)

const space = require('space')
const taskbar = require('taskbar')
const editor = require('quick_editor')

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

  main.append(editor(style, inject = inject))

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
      'quick_editor': 0
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
},{"STATE":1,"quick_editor":8,"space":9,"taskbar":15}],17:[function(require,module,exports){
const hash = 'dd5a8a33c1ca1228ed3f4284b3067f36a0d2873e'
const prefix = 'https://raw.githubusercontent.com/alyhxn/playproject/' + hash + '/'
const init_url = prefix + 'doc/state/example/init.js'
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
  require('./page')
})
},{"./page":18}],18:[function(require,module,exports){
(function (__filename){(function (){
const STATE = require('../src/node_modules/STATE')
const statedb = STATE(__filename)
const { sdb } = statedb(fallback_module)
const {drive} = sdb
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
    style: inject
  }
  // const status = {}
  // ----------------------------------------
  // TEMPLATE
  // ----------------------------------------
  const el = document.body
  const shadow = el.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
  <label class="toggle-switch">
    <input type="checkbox">
    <span class="slider"></span>
  </label>
  <div class="navbar-slot"></div>
  <div class="components-wrapper-container">
    <div class="components-wrapper"></div>
  </div>
  <style>
  </style>`
  el.style.margin = 0
  el.style.backgroundColor = '#d8dee9'
  const editor_btn = shadow.querySelector('input')
  const toggle = editor()
  editor_btn.onclick = toggle

  // ----------------------------------------
  // ELEMENTS
  // ----------------------------------------

  const navbar_slot = shadow.querySelector('.navbar-slot')
  const components_wrapper = shadow.querySelector('.components-wrapper')
  const style = shadow.querySelector('style')

  const entries = Object.entries(imports)
  const wrappers = []
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
  const subs = (await sdb.watch(onbatch)).filter((_, index) => index % 2 === 0)
  console.log('subs', subs)
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
    inner.append(component_content)
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
  subs['../src/node_modules/steps_wizard'] = {
    $: '',
    0: '',
    mapping: {
      'variables': 'variables',
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
      'entries': 'entries',
      'icons': 'icons'
    }
  }
  subs[menuname] = { 
    $: '',
    0: '',
    mapping: {
      'style': 'style',
    }
  }
  subs['../src/node_modules/quick_editor'] = 0
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
        `
        }
      }
    }
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
