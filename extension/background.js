"use strict";

// Clears the cached OAuth token when the extension is updated,
// so the user re-authenticates cleanly with any new scope changes.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "update") {
    chrome.identity.clearAllCachedAuthTokens(() => {});
  }
});
