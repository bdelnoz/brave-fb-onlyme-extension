chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "RUN_EXTRACTOR_ON_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];

      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab found." });
        return;
      }

      if (!/^https:\/\/(www|m)\.facebook\.com\//i.test(tab.url || "")) {
        sendResponse({ ok: false, error: "Open Facebook in the active tab first." });
        return;
      }

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });

        chrome.tabs.sendMessage(
          tab.id,
          {
            type: "START_FB_POST_EXTRACTION",
            config: msg.config || {}
          },
          (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }

            sendResponse(response || { ok: true });
          }
        );
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    });

    return true;
  }

  if (msg?.type === "GET_EXTRACTOR_STATUS_ON_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];

      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab found." });
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: "GET_FB_POST_EXTRACTION_STATUS" }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        sendResponse(response || { ok: true, state: null });
      });
    });

    return true;
  }

  // Return extracted posts to the popup where clipboard + URL APIs are available.
  if (msg?.type === "GET_EXTRACTED_JSON") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];

      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab found." });
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: "GET_EXTRACTED_POSTS" }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        const payload = response?.data || [];
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        sendResponse({
          ok: true,
          count: payload.length,
          payload,
          filename: `facebook-posts-50-${stamp}.json`
        });
      });
    });

    return true;
  }
});
