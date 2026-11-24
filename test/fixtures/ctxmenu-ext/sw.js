// Two items: one on every page, one on selected words. On words both match,
// so the browser groups them under the extension's name.
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({ id: 'menu-page', title: 'Menu test item', contexts: ['page', 'link', 'selection'] })
  chrome.contextMenus.create({ id: 'menu-say', title: 'Say “%s”', contexts: ['selection'] })
})

chrome.contextMenus.onClicked.addListener(info => {
  chrome.storage.local.set({ last: `${info.menuItemId}|${info.selectionText || info.pageUrl || ''}` })
})

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.ask === 'last') chrome.storage.local.get('last', r => reply(r.last ?? null))
  return true
})
