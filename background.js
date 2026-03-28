chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "RUN_ON_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];

      if (!tab?.id) {
        sendResponse({ ok: false, error: "Aucun onglet actif." });
        return;
      }

      if (!/^https:\/\/(www|m)\.facebook\.com\//i.test(tab.url || "")) {
        sendResponse({ ok: false, error: "Ouvre Facebook dans l'onglet actif." });
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
            type: "START_ONLYME_BULK",
            config: msg.config || {}
          },
          (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                ok: false,
                error: chrome.runtime.lastError.message
              });
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

  if (msg?.type === "STOP_ON_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];

      if (!tab?.id) {
        sendResponse({ ok: false, error: "Aucun onglet actif." });
        return;
      }

      chrome.tabs.sendMessage(
        tab.id,
        { type: "STOP_ONLYME_BULK" },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({
              ok: false,
              error: chrome.runtime.lastError.message
            });
            return;
          }

          sendResponse(response || { ok: true });
        }
      );
    });

    return true;
  }

  if (msg?.type === "GET_STATUS_ON_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];

      if (!tab?.id) {
        sendResponse({ ok: false, error: "Aucun onglet actif." });
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: "GET_ONLYME_STATUS" }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError.message
          });
          return;
        }

        sendResponse(response || { ok: true, state: null });
      });
    });

    return true;
  }
});
