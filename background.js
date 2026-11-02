// The service worker stops when idle and loses its variables, so all state lives in chrome.storage and chrome.alarms.
// Each idle tab has its own alarm. Viewing a tab cancels its alarm. Leaving it sets a new one.
const IDLE_MS = 30 * 1000;
const alarmName = (tabId) => `tab${tabId}`;
const log = (...args) => console.log(new Date().toLocaleTimeString(), ...args);

// Local dev servers stay loaded so testing isn't disrupted. url is absent on pages the extension can't access, such as chrome://.
function isLocalhost(url) {
  const host = url && new URL(url).hostname;
  return host === "localhost" || Boolean(host?.endsWith(".localhost"));
}

// Give every idle tab that has no alarm a fresh one.
async function armIdleTabs(filter = {}) {
  const [tabs, alarms] = await Promise.all([
    chrome.tabs.query({ ...filter, active: false, pinned: false, discarded: false }),
    chrome.alarms.getAll(),
  ]);
  const armed = new Set(alarms.map((alarm) => alarm.name));
  const unarmed = tabs.filter((tab) => !armed.has(alarmName(tab.id)));
  await Promise.all(unarmed.map((tab) => chrome.alarms.create(alarmName(tab.id), { when: Date.now() + IDLE_MS })));
  log("armed", unarmed.map((tab) => tab.id), "already armed", tabs.length - unarmed.length);
}

async function showBadge() {
  const { paused } = await chrome.storage.local.get("paused");
  await chrome.action.setBadgeText({ text: paused ? "OFF" : "ON" });
  await chrome.action.setBadgeBackgroundColor({ color: paused ? "#9E9E9E" : "#4CAF50" });
}

// Tab ids change across browser restarts, so old alarms are dropped first.
async function setup() {
  log("setup");
  await chrome.alarms.clearAll();
  await Promise.all([showBadge(), armIdleTabs()]);
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

chrome.action.onClicked.addListener(async () => {
  const paused = !(await chrome.storage.local.get("paused")).paused;
  await chrome.storage.local.set({ paused });
  log(paused ? "paused" : "resumed");
  await showBadge();
  if (!paused) await armIdleTabs();
});

chrome.tabs.onCreated.addListener(({ id, windowId }) => {
  log("created", id);
  return armIdleTabs({ windowId });
});

// A tab that was unpinned, or reloaded without being viewed, is idle again. Pinned tabs are never armed.
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.pinned === false || change.discarded === false) return armIdleTabs({ windowId: tab.windowId });
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  log("viewing", tabId);
  await chrome.alarms.clear(alarmName(tabId));
  await armIdleTabs({ windowId });
});

// Prefix the title so discarded tabs are visible in the tab strip. The page restores its own title when reloaded.
// Chrome blocks scripts on chrome:// and Web Store pages. Those tabs are discarded without the marker.
async function markAsleep(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => { if (!document.title.startsWith("💤")) document.title = `💤 ${document.title}`; },
    });
  } catch (error) {
    log("marker skipped for", tabId, error.message);
  }
}

// True when the cursor is in a text field, dropdown or editable area in any frame. Discarding would lose the input.
// When Chrome blocks the check (chrome:// and Web Store pages), the tab counts as not editing.
async function isEditing(tabId) {
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const el = document.activeElement;
        return Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)));
      },
    });
    return frames.some((frame) => frame.result);
  } catch (error) {
    log("editing check skipped for", tabId, error.message);
    return false;
  }
}

// The tab may have been closed, pinned, viewed or discarded since its alarm was set.
chrome.alarms.onAlarm.addListener(async ({ name }) => {
  const { paused } = await chrome.storage.local.get("paused");
  if (paused) return log("alarm", name, "skipped: paused");
  const idle = await chrome.tabs.query({ active: false, pinned: false, discarded: false });
  const tab = idle.find((t) => alarmName(t.id) === name);
  if (!tab) return log("alarm", name, "skipped: tab not idle");
  if (isLocalhost(tab.url)) return log("alarm", name, "skipped: localhost");
  if (await isEditing(tab.id)) {
    await chrome.alarms.create(name, { when: Date.now() + IDLE_MS });
    return log("alarm", name, "postponed: cursor in a text field");
  }
  await markAsleep(tab.id);
  const result = await chrome.tabs.discard(tab.id);
  log("alarm", name, result ? "discarded" : "discard refused by Chrome");
});
