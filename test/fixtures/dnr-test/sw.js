// The worker answers the tests: what chrome.commands sent, and the DNR API
// as a worker sees it.
chrome.commands.onCommand.addListener((command, tab) => {
  chrome.storage.local.set({ lastCommand: command, commandTab: tab ? tab.url : null, commandAt: Date.now() })
})
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message === 'worker') {
    Promise.all([
      chrome.declarativeNetRequest.getEnabledRulesets(),
      chrome.commands.getAll(),
    ]).then(([rulesets, commands]) => reply({ rulesets, commands, same: globalThis.browser === chrome }))
    return true
  }
})
