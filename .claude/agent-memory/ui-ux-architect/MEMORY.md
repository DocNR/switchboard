# UI/UX Architect Memory — switchboard

## Status
Agent initialized. No audits completed yet.

## Key Design Decisions (Locked)
- Dark-only theme, no light mode
- Purple-600 primary accent, do not change
- max-w-xl single-column mobile-first layout
- Symbol+text for all status indicators (colorblind-safe)
- Checkbox rows use <label> wrap for click-anywhere toggle

## Top Priority Accessibility Gaps
1. Focus rings missing on most interactive elements
2. Modal dialogs do not trap keyboard focus
3. Loading/progress states not announced to screen readers
4. Progress bar missing ARIA role and attributes

## See Also
(Add links to topic files as audits are completed)
