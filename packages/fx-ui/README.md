# @functionland/fx-ui

DOM design system for FxBlox Web. It re-implements the mobile `@functionland/component-library`
(`E:\GitHub\fx\libs\component-library`, `@shopify/restyle`) on **React 19 + Tailwind v4 + Radix UI**
(+ `vaul` for sheets, `@visx` for the chart) so the mobile screens' JSX and logic port nearly verbatim.

- Tokens: `src/theme/tokens.ts` (TS) and `src/styles/theme.css` (`--fx-*` CSS variables, light on `:root`,
  dark under `[data-theme="dark"]`). Values are copied from `theme/theme.ts`, plus the five tokens mobile
  screens reference but never defined (`borderBase`, `successMuted`, `errorMuted`, `warningMuted`, `infoMuted`).
- Components: `src/components/<name>/` (P0 + P1), overlays in `src/overlays/`, primitives in `src/primitives/`,
  icons in `src/icons/` (codemod output), hooks in `src/hooks/`, utilities in `src/utils/`.
- Everything is exported from `src/index.ts`; styles from `@functionland/fx-ui/styles.css`.

## Consuming the package (app setup)

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()] });
```

```ts
// main.tsx — once
import '@functionland/fx-ui/styles.css';
```

`styles.css` starts with `@import "tailwindcss"; @source "../";` — the `@source` makes Tailwind scan **this
package's `src`** for class names (Tailwind ignores `node_modules`, and the workspace symlink lives there).
The app's own sources are picked up by automatic source detection (its project root), so no extra
`@source` is needed on the app side unless the app's CSS entry lives outside the project root. If the app
adds its own Tailwind CSS file, do **not** `@import "tailwindcss"` a second time — import
`@functionland/fx-ui/styles.css` and add `@source`/`@theme` extensions after it.

`index.html` should set `data-theme` before React mounts (mobile default is dark):

```html
<html lang="en" data-theme="dark"></html>
```

## Theming

```tsx
<ThemeProvider mode={isAuto ? 'auto' : colorScheme}>…</ThemeProvider>
```

`ThemeProvider` writes `data-theme="light|dark"` + `color-scheme` on `<html>` and keeps
`<meta name="theme-color">` in sync; `mode="auto"` follows `prefers-color-scheme` live.
`useFxTheme()` returns `{ mode, resolved, colors, isDark }` — `colors` is the hex map for SVG/canvas/charts.
`useColorScheme()` returns the OS preference. Radix/vaul portals attach to `<body>` and inherit `[data-theme]`.

Tailwind utilities (via `@theme inline`): `bg-background-app`, `text-content1`, `border-border`,
`bg-green-base`, `text-error-base`, … (`--color-<kebab-token>`); radii `rounded-fx-s|m|l` (4/6/20px —
plain `rounded-s`/`rounded-l` are Tailwind's logical/side utilities, hence the prefix); fonts
`font-heading` (Montserrat) / `font-body` (Open Sans) / `font-mono`; breakpoints `desktop:` (900px) and
`wide:` (1280px); `dark:` follows `[data-theme="dark"]`. Text variants are `fx-text-<variant>` utilities
(`fx-text-h200`, `fx-text-bodySmallRegular`, …) — always reference them through `textVariantClass` or
literally, never as a template string (Tailwind only sees literal class names).

Runtime JS (inline styles, SVG fills) should use `colorVar(token)` → `var(--fx-…)`; the `--color-*`
theme variables are tree-shaken by Tailwind when unused.

## Restyle-compatible props

`FxBox`, `FxText`, `FxPressableOpacity`, `FxButton`, `FxCard`, … accept the mobile restyle vocabulary:

```tsx
<FxBox
  flexDirection="row"
  alignItems="center"
  padding="16"
  marginTop="8"
  backgroundColor="backgroundPrimary"
  borderRadius="s"
>
  <FxText variant="bodySmallRegular" color="content2" numberOfLines={1}>
    …
  </FxText>
</FxBox>
```

Spacing keys `'0'…'80'` → px, colour tokens → `var(--fx-…)`, radii `s|m|l` → px, numbers → px
(unitless where CSS expects it), `marginHorizontal`/`paddingVertical`/`start`/`end` and the restyle
shorthands (`mt`, `px`, …) are supported. See `src/primitives/styleProps.ts` for the exact bounded set.
`FxBox` is a flex column like RN `View`; `FxText` is block-level unless nested in another `FxText`.

## Pressable cards

`FxCard` is a static container until it gets `onPress` / `onLongPress` / `href`. Then an invisible full-size
button (stretched hit area) sits underneath the content, so nested controls (a kebab `FxIconButton`, a
switch…) never end up inside another interactive element. The hit area is named by `FxCard.Title`
(`aria-labelledby`) or by `accessibilityLabel` — **give every pressable card one of the two**.

## Overlays

- `FxSheet` (`FxBottomSheetModal` replacement): vaul drawer below 900px, Radix dialog (or
  `desktopMode="side"` panel) above. Imperative `ref.current.present()/close()/dismiss()` **and**
  controlled `open/onOpenChange`; `useFxSheet().close()` from inside; `onDismiss` on open→closed.
- `FxDialog`: Radix dialog with `title`, `description`, `footer`.
- `FxConfirmProvider` + `useConfirm()` → `confirm(opts): Promise<boolean>`, `alert(opts): Promise<void>`,
  `choose(opts): Promise<value | null>` (replaces `Alert.alert`). Requests queue; Escape cancels.
- Toast: `ToastProvider`, `useToast().showToast/queueToast/hideToast/clearToastQueue` — the mobile
  provider/context/hook are ported verbatim; the renderer is DOM (fixed top portal, swipe-up, Escape,
  `role="status"`).

## Icons

`scripts/convert-rn-icons.ts` converts the 63 `react-native-svg` icons in
`libs/component-library/src/lib/icons/icons.tsx` and the 10 in `apps/box/src/components/Icons.tsx` into
`src/icons/generated/*.tsx` (`<Path>`→`<path>`, `<Circle>`→`<circle>`). Re-run with
`npm run icons:generate -w packages/fx-ui`. `FxSvg` sets `fill` to `var(--fx-<token>)` when `color` is
given, otherwise `fill ?? 'currentColor'`; icons are `aria-hidden` unless they get an `aria-label`/`title`.
`DynamicIcon({ iconPath })` is kept. Two hand-written icons (`FxEyeIcon`, `FxEyeOffIcon`) back the
password reveal.

## Accessibility definition of done

Every component: keyboard operable (real `<button>`/`<a>`/Radix roles), focus trapped and restored in
`FxSheet`/`FxDialog`/confirm (Radix/vaul — asserted in tests), ARIA roles/labels on custom controls
(`FxIconButton` requires `aria-label`; `FxStatusDot`/`FxLedDot` expose `role="img"` when labelled),
`prefers-reduced-motion` respected (CSS `motion-reduce:` + the WAAPI hook is a no-op), 40px hit targets
for icon-only controls (`MIN_TOUCH_TARGET`).

## Gallery

`galleryEntries` (`{ id, title, Component }[]`) and `<FxGallery />` render every component in light and
dark side by side. The app mounts it at `/gallery` (DEV / `VITE_ENABLE_GALLERY`).

## Scripts

```
npm test -w packages/fx-ui          # vitest (jsdom)
npm run typecheck -w packages/fx-ui # tsc --noEmit (strict)
npm run lint                        # workspace eslint
npm run icons:generate -w packages/fx-ui
```
