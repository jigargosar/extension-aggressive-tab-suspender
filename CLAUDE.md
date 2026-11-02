# Purpose

This Chrome extension frees memory by discarding idle tabs.

- A tab is discarded after 30 seconds without being viewed.
- Active, pinned and localhost tabs are never discarded.
- Clicking the toolbar icon turns discarding on or off.
- A badge on the icon shows ON or OFF.
- A tab with the cursor in a text input, textarea or editable area that holds text is postponed, not discarded.

# Tasks

- Research a library that detects unsaved form input, to replace the basic check in `isEditing()`.

# Pending tests

- Empty fields: test a page with the cursor in an empty input or textarea. It should be discarded, not postponed.
- Hidden fields: test a page with hidden inputs or textareas that hold text. The check ignores them, so typed text in a field without the cursor is not protected.
