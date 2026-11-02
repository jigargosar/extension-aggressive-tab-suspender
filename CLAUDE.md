# Purpose

This Chrome extension frees memory by discarding idle tabs.

- A tab is discarded after 30 seconds without being viewed.
- Active, pinned and localhost tabs are never discarded.
- Clicking the toolbar icon turns discarding on or off.
- A badge on the icon shows ON or OFF.
- A tab with the cursor in a text input, textarea or editable area that holds text is postponed, not discarded.

# Resume notes

## Status

- Shelved on 2026-11-02, and removed from Chrome.
- Last commit: `35cd0e6`. `background.js` also has uncommitted changes, described below.
- Some sections below this one predate the uncommitted code. "Differences from the sections below" lists where.

## Why it was shelved

- Chrome gives a discarded tab a new id. Observed: YouTube tab `750777177` became `750777265` after the discard, with the same URL and position.
- A hotkey tool that remembers tab ids then can't switch to discarded tabs. That this is the cause was inferred, not proven.

## Ways to get the new id, not yet verified

- `chrome.tabs.discard()` returns a `Tab` (docs). It likely carries the new id.
- `chrome.tabs.onReplaced` gives `addedTabId` and `removedTabId`. It likely fires for discards, including Chrome's Memory Saver discards.
- `chrome.tabs.query` by `url`, or by `windowId` and `index`, is a guess. It would break with duplicate URLs or moved tabs.
- Proposed experiment, not built: a keyboard command (key not chosen) that jumps to the last viewed tab by `tab.lastAccessed`, or to the leftmost tab if there is none, and logs the id and discarded state before and after.

## What the uncommitted code does

- Each background tab gets a countdown, an alarm that fires 30 seconds after the tab was left. Viewing the tab cancels it.
- When the countdown ends, the tab is checked once, then discarded or kept.
- A kept tab is stored in `chrome.storage.session` as `kept<tabId>` with a reason. It gets no new countdown until it is viewed again.
- Kept reasons: localhost, playing audio, page can't be checked (such as `chrome://` pages), editing check failed, text in a focused field, discard refused by Chrome.
- The editing check runs in every frame and follows open shadow DOM.
- A tab closed during the checks is caught. Any other discard error is rethrown.
- Logging is behind one `DEBUG` flag, off by default. `warn` always prints.

## Differences from the sections below

- Purpose says "postponed". The code now keeps the tab instead.
- The known issue about re-checking every 30 seconds is fixed. The tab is checked once.
- The audio to-do is partly done. Audible tabs are kept. Muted players still playing are not detected.
- The to-do "can't be scripted counts as not editing" is fixed. Such tabs are now kept.
- `isEditing()` is now `pageKeepReason()`.
- The shadow DOM pending test should expect "kept", not "postponed".
- `chrome://` tabs, such as New Tab and Settings, are never discarded now, because they can't be checked.

## Agreed plan, not done

1. Remove the countdown restart when audio stops (`change.audible === false` in `onUpdated`). Audio tabs should stay kept until viewed. The restart is about 2 lines and was judged not needed.
2. Closed shadow DOM: try `chrome.dom.openOrClosedShadowRoot` in the injected script. It may not be available there. If focus sits on a component whose inside can't be seen, keep the tab.
3. Update the sections below to match the code.
4. Two `await` results are thrown away, against the global rule: the result of `markAsleep()` and the result of `chrome.alarms.clear()` in `onActivated`.
5. Search for libraries to replace the hand-written code (see MAJOR VALUES).
6. Add a global setting for the countdown length, in place of the fixed `IDLE_MS`.

## Other findings

- If the tab is viewed while it is being checked, `keep()` can run after `onActivated` cleared the kept state. The tab then skips one countdown. It fails safe.
- Chrome's Memory Saver discards tabs on its own rules, independent of this extension. Its ring mark seems to appear only on its own discards.
- In `chrome://discards`, our discards show as `discarded (external)` (observed).
- A discarded tab keeps the 💤 title in the tab strip (observed).
- Reloading the extension does not reset the ON/OFF setting (observed).
- `chrome.storage.session` is cleared when the extension is disabled, reloaded or updated, and when the browser restarts (docs).
- Alarms persist across sessions by default, since `persistAcrossSessions` defaults to true (docs).
- The `tabs` permission only unlocks `url`, `pendingUrl`, `title` and `favIconUrl`, and host permissions unlock them too (docs).
- `tab.lastAccessed` is "the last time the tab became active in its window" (docs).

## Test results on 2026-11-02

- Tabs were discarded 30 seconds after being left (log).
- Pause and resume worked (log).
- Text in a focused field postponed the discard. An empty focused field did not.
- The 💤 marker showed on discarded tabs.
- With the uncommitted code: the YouTube tab was discarded, `chrome://extensions` was kept with "page can't be checked", and localhost stayed active.

## How to test

1. Reload the extension in `chrome://extensions`, then open its "service worker" console.
2. Make sure the badge shows ON.
3. Run this line in the console. It prints the full state as plain text:

```js
console.log(JSON.stringify({ newCodeLoaded: typeof pageKeepReason === "function", paused: (await chrome.storage.local.get("paused")).paused ?? false, countdowns: Object.fromEntries((await chrome.alarms.getAll()).map((a) => [a.name, new Date(a.scheduledTime).toLocaleTimeString()])), kept: await chrome.storage.session.get(null), tabs: (await chrome.tabs.query({})).map((t) => `${t.id} ${t.active ? "ACTIVE" : t.discarded ? "DISCARDED" : "loaded"}${t.pinned ? " pinned" : ""}${t.audible ? " audio" : ""} ${t.url ?? "(no access: chrome:// page)"}`) }, null, 2))
```

# MAJOR VALUES
- Too much handrollded code, no checks for libraries has been perormed. most of the code can go away.
- when doubt dont suspend.

# Pre-Release

- The 30 second limit is aggressive only for testing when using it locally, out of dev env. it should be nominal.

# Debugging

- Set `DEBUG` to `true` at the top of `background.js` to trace every event in the service worker console.
- Warnings about recovered failures always print.

# Known issues

- The active tab of an unfocused window is never discarded. waiting if there is a practical impact.
- Text typed into a field that no longer has the cursor is not protected. The check was kept basic on purpose, and a library might cover this later.
- Fields inside closed shadow DOM are not checked, perhaps there is a way. 
- A tab with text in a focused field is checked again every 30 seconds for as long as it stays that way. The cost looks small.
- Chrome might cap how many alarms an extension can hold, and one alarm per tab could reach it with hundreds of tabs. it is likely need to figure out a solution or we should build things smartly. or via some library. 

# To-dos

- Tabs playing audio or video get discarded, which stops the media. Skipping tabs where `tab.audible` is true might cover most cases, and a page check for playing `video` or `audio` elements might cover muted players.
- The 💤 marker might stay on a tab that was not discarded: when Chrome declines the discard, or when the tab is viewed in the moment between marker and discard. Removing the marker on every tab activation could cover both.
- When the page can't be scripted, the editing check counts the tab as not editing. A blocked iframe might also fail the whole check. Falling back to the top frame alone could help.
- [ ] After disabling and re-enabling the extension, setup might not run, leaving idle tabs without alarms until the next tab switch. Running setup at worker start when no alarms exist could cover it.
- `package.json` has an unused `main`, a placeholder `test` script, a dev dependency on an absolute local `.tgz` path, and a version that differs from `manifest.json`.
- Research a library that detects unsaved form input, to replace the basic check in `isEditing()`.
- Raise the 30 second limit once testing is done.

# Pending tests

- Hidden fields: test a page with hidden inputs or textareas that hold text. The check ignores them.
- Shadow DOM fields: find a page with a text field inside shadow DOM, type into it, and leave the tab. It should be postponed.
- Blocked iframes: check whether one blocked iframe makes the whole editing check fail.
