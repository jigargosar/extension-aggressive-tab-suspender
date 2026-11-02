const INACTIVITY_THRESHOLD_MINS = 2;
let tabHistory = {};
let isEnabled = true;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ isEnabled: true });
  updateBadge(true);
  initializeTimestamps();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(["isEnabled"], (result) => {
    isEnabled = result.isEnabled !== false;
    updateBadge(isEnabled);
  });
  initializeTimestamps();
});

function initializeTimestamps() {
  chrome.tabs.query({}, (tabs) => {
    const now = Date.now();
    tabs.forEach(tab => { tabHistory[tab.id] = now; });
  });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  const now = Date.now();
  tabHistory[activeInfo.tabId] = now;
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    tabs.forEach(tab => {
      if (!tab.active && !tabHistory[tab.id]) {
        tabHistory[tab.id] = now;
      }
    });
  });
});

chrome.tabs.onRemoved.addListener((tabId) => { delete tabHistory[tabId]; });

chrome.alarms.create("discardCheck", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "discardCheck" && isEnabled) {
    const cutoffTime = Date.now() - (INACTIVITY_THRESHOLD_MINS * 60 * 1000);
    chrome.tabs.query({ active: false, pinned: false, discarded: false }, (tabs) => {
      tabs.forEach((tab) => {
        const lastSeen = tabHistory[tab.id];
        if (lastSeen && lastSeen < cutoffTime) {
          chrome.tabs.discard(tab.id);
        }
      });
    });
  }
});

chrome.action.onClicked.addListener(() => {
  isEnabled = !isEnabled;
  chrome.storage.local.set({ isEnabled: isEnabled });
  updateBadge(isEnabled);
});

function updateBadge(active) {
  chrome.action.setBadgeText({ text: active ? "ON" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: active ? "#4CAF50" : "#9E9E9E" });
}
