# Accessibility

Target: **WCAG 2.2 AA** for every screen of the platform console, in light and dark themes, at any zoom level.

## What is automated (runs in CI)

| Check                                      | Where                                 | Covers                                                       |
| ------------------------------------------ | ------------------------------------- | ------------------------------------------------------------ |
| axe on every screen, light + dark          | `e2e/screens.spec.ts`                 | contrast, names, roles, ARIA, landmarks, target size (2.5.8) |
| axe on every component story, light + dark | `e2e/storybook/stories.spec.ts`       | every UI primitive and its states in isolation               |
| Mobile layouts / no horizontal scroll      | `e2e/responsive.spec.ts`              | reflow on a phone viewport                                   |
| Lint: `jsx-a11y`                           | `eslint.config.js`                    | labels, alt text, interactive semantics at write time        |
| Focus + announcement on navigation         | `src/components/shell/shell.test.tsx` | route announcer, drawer focus                                |
| Modal / drawer behaviour                   | component + feature tests             | Escape, focus trap, focus restore                            |

## Manual audit — 2026-09-25

This pass used scripted keyboard-only runs over all 28 screens, accessibility-tree checks, forced colours and a 320 px
reflow check. It did **not** use a real screen reader; the script below is for a human tester to run with one.

| Area                                                                                                                                                                                    | Result                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keyboard: every control reachable, no positive `tabindex`, no traps                                                                                                                     | ✅ all screens                                                                                                                                                                         |
| Visible focus on every focusable element                                                                                                                                                | ✅ (2 px accent outline; `Highlight` in forced colours)                                                                                                                                |
| Accessible name on every focusable element                                                                                                                                              | ✅ all screens                                                                                                                                                                         |
| One `<h1>` per screen, no skipped heading levels, one `<main>`                                                                                                                          | ✅ all screens                                                                                                                                                                         |
| Skip link is the first Tab stop and moves focus to the content                                                                                                                          | ✅                                                                                                                                                                                     |
| Dialogs (provision tenant, email owners, drawer, palette): focus moves in, Tab is trapped, Escape closes and focus returns to the opener                                                | ✅                                                                                                                                                                                     |
| Document title per screen                                                                                                                                                               | ✅ `"<Screen> · Coursiva console"`                                                                                                                                                     |
| `<html lang>` follows the chosen locale                                                                                                                                                 | ✅                                                                                                                                                                                     |
| Reflow at 320 px (= 400 % zoom) with no horizontal scroll                                                                                                                               | ✅ all screens (wide tables scroll inside their card)                                                                                                                                  |
| Reduced motion                                                                                                                                                                          | ✅ `prefers-reduced-motion` removes transitions and animations                                                                                                                         |
| **Route changes were silent**: focus stayed on the sidebar link and nothing was announced                                                                                               | 🔧 **Fixed.** On a screen change, focus moves to `#main` and a polite live region announces "<Screen> page". In-screen routes such as the tenant drawer keep their own focus handling. |
| **Forced colours (Windows High Contrast)**: toggles, selected chips/segments/rows/nav, progress bars and status dots were invisible or stateless, because they show state by fill alone | 🔧 **Fixed.** Added a `forced-colors: active` block in `ui.css` that maps each state onto system colours, and outlines `[aria-pressed]`, `[aria-selected]` and `[aria-current]`.       |

## Screen-reader test script (NVDA + Chrome, VoiceOver + Safari)

Run before each release that changes a flow. Use NVDA 2024+ with Chrome on Windows and VoiceOver with Safari on macOS.
Sign in with `sam@coursiva.io` / `password`, code `123456` (mock API). Tick each step or file an issue with the
reader, browser and exact speech.

### 1. Sign-in

- [ ] Heading "Sign in" is announced; both fields are announced with their labels.
- [ ] Submitting empty announces the field errors. Each field is announced as invalid, with its error text as the description.
- [ ] Wrong password: the error message is announced without moving focus away.
- [ ] Two-factor step: focus lands on "Authentication code", announced as a one-time-code field.

### 2. Shell and navigation

- [ ] Tab once: "Skip to content, link". Enter moves the reading position to the page content.
- [ ] The sidebar is announced as navigation; the current screen is announced as "current page".
- [ ] Choosing a sidebar item announces "<Screen> page". The next Tab / reading continues inside the content, not the sidebar.
- [ ] Ctrl/⌘ + K opens the command palette: dialog announced, search field focused. Typing announces the result count. Arrow keys announce each option. Enter navigates; Escape closes and returns focus.
- [ ] Notifications button announces the unread count; the panel opens and closes with Escape.

### 3. Tenants directory and drawer

- [ ] The filter chip groups are announced as groups, with the pressed state of each chip.
- [ ] Table navigation (NVDA: Ctrl+Alt+arrows; VO: VO+arrows) reads column headers with each cell.
- [ ] Sort buttons announce the current sort direction.
- [ ] Selecting rows with the checkboxes announces the bulk-action bar.
- [ ] Opening a tenant: dialog announced with the tenant name, and focus is inside it. Escape returns focus to the tenant link.
- [ ] Destructive actions (suspend, purge): the first press changes the label to "Are you sure?" and that change is announced; the second press confirms.

### 4. Forms (settings, pricing, provision tenant, invite staff)

- [ ] Each field is announced with its label, hint and, when invalid, its error.
- [ ] Saving announces the toast ("… saved") through the polite live region, without moving focus.
- [ ] The unsaved-changes dialog on leaving is announced and keyboard operable.
- [ ] Number inputs (trial length, prices) announce their range message when out of range.

### 5. Data screens (analytics, revenue, backup)

- [ ] KPI tiles read as label, value, then change.
- [ ] Charts have a text alternative (accessible name or table/summary) that states the key figure; decorative marks are silent.
- [ ] Progress bars announce their label and value.

### 6. Idle lock

- [ ] The warning dialog is announced with the countdown. It is not re-announced every second.
- [ ] Lock screen: the app behind is unreachable (`inert`); the password field is focused; unlocking restores the page.

### 7. Settings → language

- [ ] Switching to the pseudo-locale updates `lang`. Everything is read in the new locale; nothing is left in English except API data.

## Rules for new UI (see also CLAUDE.md → UI)

- Use the primitives in `components/ui`. They already handle names, focus, dialogs and live regions.
- Any state shown by colour must also be shown another way: text, icon, pressed or selected state, or an outline in forced colours.
- Every new primitive or variant gets a story; the Storybook axe gate must stay green.
