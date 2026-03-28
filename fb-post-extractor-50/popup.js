const statusEl = document.getElementById("status");

function setStatus(value) {
  statusEl.textContent = value;
}

function renderState(state) {
  if (!state) {
    setStatus("No state available yet.");
    return;
  }

  setStatus(
    `running=${state.running}\n` +
    `done=${state.done}\n` +
    `count=${state.count}/${state.maxPosts}\n` +
    `attemptedScrolls=${state.attemptedScrolls}/${state.maxScrolls}\n` +
    `scrollDelayMs=${state.scrollDelayMs}\n` +
    `lastMessage=${state.lastMessage || ""}`
  );
}

document.getElementById("startBtn").addEventListener("click", () => {
  const maxPosts = Number(document.getElementById("maxPosts").value || 50);
  const scrollDelayMs = Number(document.getElementById("scrollDelayMs").value || 1600);
  const maxScrolls = Number(document.getElementById("maxScrolls").value || 180);

  setStatus("Injecting extractor script...");

  chrome.runtime.sendMessage(
    {
      type: "RUN_EXTRACTOR_ON_ACTIVE_TAB",
      config: {
        maxPosts,
        scrollDelayMs,
        maxScrolls
      }
    },
    (response) => {
      if (!response?.ok) {
        setStatus(`Error:\n${response?.error || "unknown"}`);
        return;
      }

      setStatus("Extraction started in active Facebook tab.");
      setTimeout(() => document.getElementById("statusBtn").click(), 1000);
    }
  );
});

document.getElementById("statusBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "GET_EXTRACTOR_STATUS_ON_ACTIVE_TAB" }, (response) => {
    if (!response?.ok) {
      setStatus(`Status error:\n${response?.error || "unknown"}`);
      return;
    }

    renderState(response.state);
  });
});

document.getElementById("copyBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "COPY_EXTRACTED_JSON" }, (response) => {
    if (!response?.ok) {
      setStatus(`Copy error:\n${response?.error || "unknown"}`);
      return;
    }

    setStatus(`Copied ${response.count} posts to clipboard.`);
  });
});

document.getElementById("downloadBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "DOWNLOAD_EXTRACTED_JSON" }, (response) => {
    if (!response?.ok) {
      setStatus(`Download error:\n${response?.error || "unknown"}`);
      return;
    }

    setStatus(`Downloaded JSON with ${response.count} posts.`);
  });
});
