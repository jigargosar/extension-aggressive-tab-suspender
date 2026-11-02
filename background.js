// The service worker stops when idle and loses its variables, so all state lives in chrome.storage and chrome.alarms.
// Each background tab gets a countdown: an alarm that fires IDLE_MS after the tab was left. Viewing the tab cancels it.
// When the countdown ends, the tab is either discarded or kept. A kept tab is recorded in chrome.storage.session
// and gets no new countdown until it is viewed again. When in doubt, the tab is kept.
const IDLE_MS = 30 * 1000;
const alarmName = (tabId) => `tab${tabId}`;
const keptKey = (tabId) => `kept${tabId}`;

// Set DEBUG to true to trace every event. Warnings about recovered failures always print.
const DEBUG = false;
const stamp = () => new Date().toLocaleTimeString();
const log = DEBUG ? (...args) => console.log(stamp(), ...args) : () => {};
const warn = (...args) => console.warn(stamp(), ...args);

// Local dev servers stay loaded so testing isn't disrupted. url is absent on pages the extension can't access, such as chrome://.
function isLocalhost(url) {
  const host = url && new URL(url).hostname;
  return host === "localhost" || Boolean(host?.endsWith(".localhost"));
}

// Start a countdown for every background tab in scope that has none and isn't kept.
async function startCountdowns(filter = {}) {
  const [tabs, alarms, kept] = await Promise.all([
    chrome.tabs.query({ ...filter, active: false, pinned: false, discarded: false }),
    chrome.alarms.getAll(),
    chrome.storage.session.get(null),
  ]);
  const counting = new Set(alarms.map((alarm) => alarm.name));
  const fresh = tabs.filter((tab) => !counting.has(alarmName(tab.id)) && !kept[keptKey(tab.id)]);
  await Promise.all(fresh.map((tab) => chrome.alarms.create(alarmName(tab.id), { when: Date.now() + IDLE_MS })));
  log("countdown started", fresh.map((tab) => tab.id));
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
  await Promise.all([showBadge(), startCountdowns()]);
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

chrome.action.onClicked.addListener(async () => {
  const paused = !(await chrome.storage.local.get("paused")).paused;
  await chrome.storage.local.set({ paused });
  log(paused ? "paused" : "resumed");
  await showBadge();
  if (!paused) await startCountdowns();
});

chrome.tabs.onCreated.addListener(({ id, windowId }) => {
  log("created", id);
  return startCountdowns({ windowId });
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(keptKey(tabId)));

// Unpinned, reloaded without being viewed, or no longer playing audio: the tab may be discardable again.
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.audible === false) await chrome.storage.session.remove(keptKey(tabId));
  if (change.pinned === false || change.discarded === false || change.audible === false) {
    await startCountdowns({ windowId: tab.windowId });
  }
});

// Viewing a tab cancels its countdown and clears its kept state. The tab just left then gets a countdown.
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  log("viewing", tabId);
  await Promise.all([chrome.alarms.clear(alarmName(tabId)), chrome.storage.session.remove(keptKey(tabId))]);
  await startCountdowns({ windowId });
});

// Runs func inside the page. Returns null when the page can't be scripted.
// A missing url means no access (chrome:// pages), so no attempt is made.
// Other refusals, such as Web Store pages or a tab closed mid-way, are logged as warnings.
async function runInPage(tab, func, allFrames) {
  if (!tab.url) {
    log("no page access", tab.id);
    return null;
  }
  try {
    return await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames }, func });
  } catch (error) {
    warn("script refused on tab", tab.id, error.message);
    return null;
  }
}

// Prefix the title so discarded tabs are visible in the tab strip. The page restores its own title when reloaded.
function markAsleep(tab) {
  return runInPage(tab, () => {
    if (!document.title.startsWith("💤")) document.title = `💤 ${document.title}`;
  }, false);
}

// Returns why the page must stay loaded, or null when it is safe to discard.
// Text in the focused field of any frame, following open shadow DOM, means the user would lose input.
// A page that can't be checked, or a check that breaks, also keeps the tab.
async function pageKeepReason(tab) {
  const frames = await runInPage(tab, () => {
    try {
      let el = document.activeElement;
      while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
      if (!el) return { editing: false };
      if (el.isContentEditable) return { editing: el.textContent.trim() !== "" };
      if (el.tagName === "TEXTAREA") return { editing: el.value.trim() !== "" };
      const typed = ["text", "search", "email", "url", "tel", "password", "number"];
      return { editing: el.tagName === "INPUT" && typed.includes(el.type) && el.value.trim() !== "" };
    } catch (error) {
      return { error: String(error) };
    }
  }, true);
  if (!frames) return "page can't be checked";
  const failures = frames.filter((frame) => typeof frame.result?.editing !== "boolean");
  failures.forEach((frame) => warn("editing check failed on tab", tab.id, "frame", frame.frameId, frame.result?.error));
  if (failures.length > 0) return "editing check failed";
  if (frames.some((frame) => frame.result.editing)) return "text in a focused field";
  return null;
}

async function keep(tab, reason) {
  await chrome.storage.session.set({ [keptKey(tab.id)]: reason });
  log("kept", tab.id, reason);
}

// Countdown ended. The tab may have been closed, pinned, viewed or discarded since it started.
chrome.alarms.onAlarm.addListener(async ({ name }) => {
  const { paused } = await chrome.storage.local.get("paused");
  if (paused) return log("countdown ended", name, "skipped: paused");
  const idle = await chrome.tabs.query({ active: false, pinned: false, discarded: false });
  const tab = idle.find((t) => alarmName(t.id) === name);
  if (!tab) return log("countdown ended", name, "skipped: tab not idle");
  if (isLocalhost(tab.url)) return keep(tab, "localhost");
  if (tab.audible) return keep(tab, "playing audio");
  const reason = await pageKeepReason(tab);
  if (reason) return keep(tab, reason);
  await markAsleep(tab);
  let result;
  try {
    result = await chrome.tabs.discard(tab.id);
  } catch (error) {
    // A tab closed during the checks is expected. Any other failure is a bug and is rethrown.
    const open = (await chrome.tabs.query({})).some((t) => t.id === tab.id);
    if (open) throw error;
    return log("countdown ended", name, "skipped: tab closed");
  }
  if (!result) return keep(tab, "discard refused by Chrome");
  log("discarded", tab.id);
});
