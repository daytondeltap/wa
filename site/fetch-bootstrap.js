(() => {
  // Keep a reference to the browser's real fetch before auth-ck installs its
  // Google/CK gateway router. egress-runtime uses this to let legacy raw-key
  // requests go straight to their original Edge Function instead of taking
  // the extra gateway hop.
  if (!window.LG_NATIVE_FETCH) window.LG_NATIVE_FETCH = window.fetch.bind(window);
})();
