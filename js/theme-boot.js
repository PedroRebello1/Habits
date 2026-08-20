// theme-boot.js — applies the shared theme before the first paint.
//
// This exists as a file rather than an inline <script> on purpose: the app's
// CSP pins script-src to 'self' with no 'unsafe-inline', and that promise is
// worth more than the one saved request. Kept separate from theme.js so the
// engine itself stays identical across all three apps.

try {
  window.MyAppsTheme.apply('habits');
} catch (e) {
  /* The stylesheet's own :root values stand in. */
}
