// The worker answers what the tests ask of it: the same APIs, from a worker.
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.ask === 'spaces') {
    reply({
      sidePanel: typeof chrome.sidePanel?.open,
      offscreen: typeof chrome.offscreen?.createDocument,
      identity: typeof chrome.identity?.launchWebAuthFlow,
      tabGroups: chrome.tabGroups?.Color?.BLUE,
    })
  }
})
