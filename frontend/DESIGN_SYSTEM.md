# Atlas frontend design system

The MUI + Tailwind migration starts from `main`, independently from the closed PR #71.

- **MUI** owns accessible controls, focus behavior, dialogs, menus, table semantics, form inputs, and interaction states.
- **Tailwind CSS v4** owns responsive grid/flex composition, spacing and layout. Shared brand colors are in `globals.css`.
- **Theme** lives in `components/ui/AtlasMuiProvider.tsx`. Existing `data-theme` and the account theme toggle are preserved.
- **Legacy styles** are temporarily isolated in the `legacy` CSS layer. Their styles can be removed screen-by-screen without accumulating override files.
- **Cascade order** is `theme, base, legacy, mui, components, utilities`. Never add unlayered CSS overrides for new screens.
- **Server rendering** uses `AppRouterCacheProvider` with `enableCssLayer`. Keep this when adding server-rendered MUI controls.
- **Accessibility**: icon-only actions have names, all input elements have labels, modal focus is controlled by MUI, and loading/empty/error states must remain functional.
- **Verification**: `npm ci`, `npm run format:check`, `npm run test`, `npm run typecheck`, `npm run build`, and Playwright tests.

During migration, preserve source selection, permission checks, document import, and evidence navigation. An attractive view with broken research behavior is not a completed redesign.
