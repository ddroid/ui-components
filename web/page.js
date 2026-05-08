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
  document.body.append(await ui_gallery())
}