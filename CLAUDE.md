# Purpose

This Chrome extension frees memory by discarding idle tabs.

- A tab is discarded after 30 seconds without being viewed.
- Active, pinned and localhost tabs are never discarded.
- Clicking the toolbar icon turns discarding on or off.
- A badge on the icon shows ON or OFF.
- A tab with the cursor in a text input, textarea or editable area that holds text is postponed, not discarded.

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
- After disabling and re-enabling the extension, setup might not run, leaving idle tabs without alarms until the next tab switch. Running setup at worker start when no alarms exist could cover it.
- `package.json` has an unused `main`, a placeholder `test` script, a dev dependency on an absolute local `.tgz` path, and a version that differs from `manifest.json`.
- Research a library that detects unsaved form input, to replace the basic check in `isEditing()`.
- Raise the 30 second limit once testing is done.

# Pending tests

- Hidden fields: test a page with hidden inputs or textareas that hold text. The check ignores them.
- Shadow DOM fields: find a page with a text field inside shadow DOM, type into it, and leave the tab. It should be postponed.
- Blocked iframes: check whether one blocked iframe makes the whole editing check fail.
