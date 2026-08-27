# STATUS — WS2 `packages/fx-ui` (`@functionland/fx-ui`)

Updated 2026-08-27. Scope: plan section "WS2 — packages/fx-ui". Nothing committed; no `npm install` run.

## Verification (exact results, final run 01:20)

| Command | Result |
|---|---|
| `npm test -w packages/fx-ui` | 11 files, **57 tests passed**, 0 failed (vitest 3.2.7, jsdom) |
| `npm run typecheck -w packages/fx-ui` | exit 0 (tsc strict, `noUncheckedIndexedAccess`) |
| `npx eslint packages/fx-ui` | exit 0, no findings |
| `npx prettier --check "packages/fx-ui/**/*.{ts,tsx,css,md}"` | all files formatted |
| `npm run lint` (workspace) | **exit 1 — findings only in `apps/fxblox-web/src/**`** (WS3 files, being edited concurrently: 19 errors at 01:08, 3 problems at 01:15 — `utils/bleAiClient.ts` + `utils/httpAiClient.ts` unused type imports, `hooks/usePools.ts` unused eslint-disable). No findings in `packages/fx-ui`. |

## Done

- **Tailwind v4 entry** `src/styles/theme.css`: `@import "tailwindcss"`, `@source "../"` (scans this package's `src`; needed because the workspace symlink is under `node_modules`), `:root` / `[data-theme="dark"]` `--fx-*` variables, `@theme inline` (colours, `--radius-fx-*`, fonts, `desktop` 900px / `wide` 1280px breakpoints), `@custom-variant dark` on `[data-theme]`, `@utility fx-text-<variant>` for all 16 text variants, `@font-face` Montserrat 500/600 + Open Sans 300/400/600 (TTF copied to `src/styles/fonts/`), component base classes, keyframes, `prefers-reduced-motion` block.
- **Theming**: `ThemeProvider` (`light|dark|auto`, `data-theme`, `color-scheme`, `<meta theme-color>`, live `prefers-color-scheme`), `useFxTheme()` (mode + hex map), `useColorScheme()`.
- **Primitives** with the bounded restyle resolver (`styleProps.ts`): `FxBox`, `FxText` (`variant`/`color`/`numberOfLines`), `FxSpacer`, `FxHorizontalRule`, `FxVerticalRule`, `FxPressableOpacity` (`button`/`a`/`div role=button`, `onPress`, `onLongPress` via pointer events), `FxSafeAreaBox`, `FxScrollView` (+ `FxKeyboardAwareScrollView` alias).
- **P0**: FxButton (5 variants, 3 sizes, icons, `loading`), FxCard (+Title/Row/Row.Title/Row.Data), FxTag, FxTextInput (caption/error/errorMessage/disabled/secureTextEntry reveal/mono/inputMode/keyboardType/onChangeText/onSubmitEditing), FxTextArea, FxRadioButton (+Group single via Radix RadioGroup, multi via Radix Checkbox, +WithLabel; `utils.ts` verbatim), FxSwitch, FxDropdown (Radix Select), FxHeader (+FxGridSelector, add), FxProgressBar, FxLoadingSpinner + FxSpinner, FxError/FxWarning, FxAvatar (sizes + badge), FxSvg + 75 generated icons + `DynamicIcon`, FxSheet (vaul <900px / Radix Dialog or side panel ≥900px; ref `present/close/dismiss/isOpen` + controlled `open/onOpenChange` + `useFxSheet().close()` + `onDismiss`), FxDialog, FxConfirmProvider + `useConfirm()` (`confirm/alert/choose`, queued), Toast (provider/context/hooks/types ported verbatim; DOM renderer with a persistent live region, slide, swipe-up, Escape, per-toast auto-hide), FxCodeBlock, FxCopyButton + `useCopyToClipboard`, FxStatusDot, FxLedDot/FxLedSequence/FxTower, FxPageHeader, FxEmptyState, FxIconButton (40px, `aria-label` required by the type), FxSkeleton/FxListSkeleton, FxTooltip.
- **P1**: FxTabs (+`FxTabs.Panel`), FxTable (+Header/Title/Row/RowGroup/Cell), FxBreadcrumbs, FxButtonGroup, FxFoldableContent, FxLink, FxSlider, FxPicker (+FxPickerItem), FxFile, FxLineChart (visx AreaClosed + LinePath curveMonotoneX + LinearGradient + ParentSize).
- **Icons**: `scripts/convert-rn-icons.ts` (Node type-stripping, no deps; `npm run icons:generate -w packages/fx-ui`) → `src/icons/generated/*.tsx` (65 from `libs/component-library` + 10 from `apps/box/src/components/Icons.tsx`); the script refuses unknown elements/attributes. Two hand-written icons (`FxEyeIcon`, `FxEyeOffIcon`) for the password reveal.
- **Utilities/hooks**: `cn` (clsx + tailwind-merge, extended for `fx-text-*` and `rounded-fx-*`), `conversions.ts` (verbatim), `constants.ts` (`APP_HORIZONTAL_PADDING = 20`, `MIN_TOUCH_TARGET = 40`), `types.ts`, `useMediaQuery`/`useIsDesktop`/`useIsWide`/`useReducedMotion`, `useLongPress`, `useInterval` (verbatim), `useShare`, `useCopyToClipboard`.
- **Gallery**: `galleryEntries` (38 entries) + `<FxGallery />` rendering each demo in light and dark.
- **Tests** (`test/*.test.tsx`): ThemeProvider modes; Toast queue semantics (persistent live region, queue→show→auto-hide→next, `showToast` jumps the queue, per-toast timer, hide/clear, per-toast `autoHideDuration`, callbacks); FxSheet ref contract + `useFxSheet().close()` + controlled/side + drawer smoke + Escape/focus restore; Confirm true/false/Escape/alert/choose/null/queued/focus restore; FxCard static vs. pressable (hit area named by the title, nested controls independent, disabled, href); RadioGroup single (click + arrow keys, number values) vs multi vs standalone vs label click; Button variants/sizes/disabled/loading/styleProps; TextInput reveal/error/inputMode/Enter/textarea; Dropdown click + keyboard + empty-string values + states; icons (count > 60, `FxSvg` fill/aria, `DynamicIcon`); styleProps resolver + FxBox/FxText.
- **Docs**: `packages/fx-ui/README.md` (usage, theming, Tailwind `@source` setup for the app, a11y DoD).

## Deviations from the plan (deliberate)

1. **Radius utilities are `rounded-fx-s|m|l`**, not `rounded-s|m|l`: `rounded-s`/`rounded-l` are Tailwind's logical-start / left side utilities, so the plain names collide.
2. **Runtime colours use `var(--fx-<kebab>)`** rather than `var(--color-<kebab>)`: Tailwind v4 only emits `--color-*` variables used by generated utilities, so JS-side references could dangle. `colorVar(token)` is the helper.
3. **Imperative sheet handle uses the React 19 `ref` prop + `useImperativeHandle`** instead of `forwardRef` (identical consumer API: `useRef<FxSheetMethods>()` + `ref={…}`).
4. **Icons default to `currentColor`**: the codemod drops the root `fill="none"` and `FxSvg` sets `fill = color ? var(--fx-…) : fill ?? 'currentColor'` (mobile icons with `fill="none"` were invisible unless given a colour).
5. **Standalone `FxRadioButton` (no Group) renders `role="checkbox"`** (a lone `role="radio"` outside a radiogroup is invalid ARIA); multi-select groups are `role="group"`.
6. **Pressable `FxCard` uses the stretched hit-area pattern**: the card stays a static container; an invisible full-size `<button>` (or `<a>` with `href`) sits underneath, named by `FxCard.Title` (`aria-labelledby`) or `accessibilityLabel`; nested controls keep pointer events and are never inside another interactive element. **Consumers must give pressable cards a `FxCard.Title` or an `accessibilityLabel`.** Long press works on the hit area.
7. **`FxDropdown` maps items to their index as the Radix value** (Radix forbids `''` values and requires strings); `onValueChange(value, index)` returns the original value. `FxPicker` (native `<select>`) does the same.
8. **LED animations use the Web Animations API** (`el.animate`) — CSS keyframes cannot express dynamic on/off offsets; no-op under `prefers-reduced-motion` and in jsdom.
9. **Focus restore for imperatively opened overlays**: Radix modal dialogs focus their `Trigger` on close; with no trigger focus fell to `<body>`, so `useOpenerFocusRestore` captures the opener in a layout effect (before Radix's passive-effect autofocus) and restores it via `onCloseAutoFocus` (sheet, dialog, confirm).
10. **`FxConfirmProvider` marks requests as settled** — Radix `Action`/`Cancel` also emit `onOpenChange(false)` (Slot composes handlers child-first, so our handler runs first); the flag makes the second call a no-op instead of cancelling the *next* queued request.
11. **Toast auto-hide is a per-toast timer** (renderer-side; the verbatim provider is untouched). Mobile keyed one `setInterval` on the duration, so a toast shown late was cut short. The `role="status" aria-live="polite"` region is mounted permanently so screen readers announce toasts inserted into it.
12. `FxTextInput.error` stays boolean (as mobile); an extra `errorMessage` renders `FxError` wired through `aria-describedby`.
13. `WINDOW_WIDTH` (RN `Dimensions`) is not exported; use CSS / `useMediaQuery`.

## Open items

- **woff2 fonts**: no converter available offline (no `fonttools`/`woff2_compress`); `@font-face` uses the TTFs (≈780 KB total). Convert to woff2 in CI or by hand and add `url(*.woff2) format('woff2')` first.
- **vaul drawer in jsdom** is smoke-tested only (open/close/ref). Swipe physics and snap points need Playwright (WS7 gallery smoke).
- **`jest-axe`/axe-core** is not installed; the a11y DoD is asserted structurally (roles, labels, focus trap/restore) — add an axe pass in the Playwright gallery run.
- **WCAG contrast check** of token pairs (`content3` on `background-*`) not automated here.
- **Tailwind source scanning**: the app must register `@tailwindcss/vite` and import `@functionland/fx-ui/styles.css` once (see README). Verified against the Tailwind v4 docs, not by a Vite build in this session (the app shell is Phase-0). While doing that first build, also confirm focus rings / shadows still render with `--color-*: initial` (Tailwind v4 defaults to `currentColor` rings, so this is expected to be fine).
- **Breakpoint crossing while a sheet is open** keeps it open (state is shared between the vaul and Radix trees); focus is handed from the unmounting tree to the opener and then into the new dialog. Verify once in the browser at 899↔900px.
- **Workspace lint** fails on WS3 files (see table) — outside WS2.
- **Advisor seats this session**: agy (Antigravity) responded twice (design + end result) and Copilot once (end result, consumed 2 of the monthly 50 — the first attempt was truncated by the `copilot.cmd` shim). Adopted: layout-effect focus capture, per-toast timer, persistent live region, stretched hit-area card, keep sheet open across the breakpoint, standalone radio → checkbox role, toast Escape + focus pause. Rejected with evidence: replacing the confirm `settled` flag with queue removal (React batches the two updates; the flag is the guard), "`.fx-text .fx-text` breaks with intermediate elements" (it is a descendant selector). **Unavailable**: Codex (HTTP 402 `deactivated_workspace`), GLM-5.2 (z.ai error 1113 "insufficient balance or no resource package" — plan exhausted), Cursor (needs `cursor-agent login`), Kimi K2.7 (Cloudflare 403), MiMo (bynara 403 `telegram_required`), Kimi K3 (Kimi Code API HTTP 500 on every headless request all day — service-wide for this account, not quota; also kimi-code v0.26.0 rejects `-p` together with `--plan`, so `C:\Users\ehsan\.claude\agents\kimi-k3-advisor.md` must drop `--plan` and re-run its write-probe canary before being pointed at a repo). The built-in `advisor` tool is not available in this session. Operational note from the Copilot relay: `C:\Users\ehsan\.claude\agents\copilot-advisor.md` should invoke Copilot via `node …\@github\copilot\npm-loader.js` by full path (the `.cmd` shim is not on PATH and truncates multiline prompts).

## Dependencies

No new packages needed; everything used is already in `packages/fx-ui/package.json` (Radix ×14, vaul, visx ×5, clsx, tailwind-merge, tailwindcss, @tailwindcss/vite; dev: vitest, @testing-library/*, jsdom, @vitejs/plugin-react — the last is unused by `vitest.config.ts`, which relies on esbuild's automatic JSX runtime).

## Pre-mortem (assume it failed)

| Failure | Tripwire | Mitigation |
|---|---|---|
| Tailwind does not pick up fx-ui classes in the app build → unstyled components | first `vite build` of the app shell; gallery route looks unstyled | `@source "../"` is in `styles.css`; if the app moves the CSS entry, add `@source "../../packages/fx-ui/src"` in the app CSS |
| `fx-text-*` / variant classes missing because they were built dynamically | gallery text sizes all 16px | `textVariantClass` literal map; class maps in components are literal strings |
| vaul drawer misbehaves on Android Chrome (scroll lock, input reposition) | P2 manual runs on the Pixel | `presentation="dialog"` escape hatch on `FxSheet`; vaul options (`repositionInputs`) can be tuned in one place |
| Radix Select index mapping drifts if `options` change while open | dropdown picks the wrong item after a live re-sort | index is recomputed from the current `options` on every render and at selection time; keep option arrays stable while open |
| Pressable card without a title or `accessibilityLabel` → unnamed button | axe/Playwright a11y pass on the gallery | documented contract; add a dev-only warning if screens keep forgetting it |
| Focus lost after closing an overlay opened from a timer/route change | keyboard users land on `<body>` | `useOpenerFocusRestore` falls back to Radix's default when there was no focused opener; screens should call `present()` from a user gesture |
| Fonts flash / fallback (TTF weight) | slow first paint on the hotspot (no internet, fonts are local anyway) | `font-display: swap`; convert to woff2 (open item) |
