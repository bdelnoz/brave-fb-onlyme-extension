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

  if (msg?.type === "COPY_EXTRACTED_JSON") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];

      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab found." });
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: "GET_EXTRACTED_POSTS" }, async (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        try {
          const payload = response?.data || [];
          await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
          sendResponse({ ok: true, count: payload.length });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
      });
    });

    return true;
  }

  if (msg?.type === "DOWNLOAD_EXTRACTED_JSON") {
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

        try {
          const payload = response?.data || [];
          const json = JSON.stringify(payload, null, 2);
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");

          chrome.downloads.download(
            {
              url,
              filename: `facebook-posts-50-${stamp}.json`,
              saveAs: true
            },
            () => {
              URL.revokeObjectURL(url);
              if (chrome.runtime.lastError) {
                sendResponse({ ok: false, error: chrome.runtime.lastError.message });
                return;
              }

              sendResponse({ ok: true, count: payload.length });
            }
          );
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
      });
    });

    return true;
  }
});
