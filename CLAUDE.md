# Purpose

This Chrome extension frees memory by discarding idle tabs.

- A tab is discarded after 30 seconds without being viewed.
- Active, pinned and localhost tabs are never discarded.
- Clicking the toolbar icon turns discarding on or off.
- A badge on the icon shows ON or OFF.
- A tab with the cursor in an input, textarea, select or editable area is postponed, not discarded.

# Pending tests

- Empty fields: test a page with empty inputs and textareas. The check looks only at where the cursor is, not at content, so an empty focused field also postpones the discard. Confirm this is the wanted behavior.
- Hidden fields: test a page with hidden inputs or textareas that hold text. The check ignores them, so typed text in a field without the cursor is not protected.
