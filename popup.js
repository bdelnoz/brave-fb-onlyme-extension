const statusEl = document.getElementById("status");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function renderState(state) {
  if (!state) {
    setStatus("Aucun état reçu.");
    return;
  }

  setStatus(
    `running=${state.running}
    stopRequested=${state.stopRequested}
    attempted=${state.attempted}
    changed=${state.changed}
    skippedAlreadyOnlyMe=${state.skippedAlreadyOnlyMe}
    failedMenus=${state.failedMenus}
    failedEditAudience=${state.failedEditAudience}
    failedOnlyMe=${state.failedOnlyMe}
    failedDone=${state.failedDone}
    lastMessage=${state.lastMessage || ""}`
  );
}

document.getElementById("startBtn").addEventListener("click", () => {
  const maxPosts = parseInt(document.getElementById("maxPosts").value, 10) || 10;
  const actionDelayMs = parseInt(document.getElementById("actionDelayMs").value, 10) || 1800;
  const scrollDelayMs = parseInt(document.getElementById("scrollDelayMs").value, 10) || 2200;

  setStatus("Injection en cours...");

  chrome.runtime.sendMessage(
    {
      type: "RUN_ON_ACTIVE_TAB",
      config: {
        maxPosts,
        actionDelayMs,
        scrollDelayMs
      }
    },
    (resp) => {
      if (!resp?.ok) {
        setStatus("Erreur:\n" + (resp?.error || "inconnue"));
        return;
      }

      setStatus("Script lancé dans l’onglet Facebook.");
      setTimeout(() => {
        document.getElementById("refreshBtn").click();
      }, 1000);
    }
  );
});

document.getElementById("stopBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_ON_ACTIVE_TAB" }, (resp) => {
    if (!resp?.ok) {
      setStatus("Erreur stop:\n" + (resp?.error || "inconnue"));
      return;
    }
    setStatus("Stop demandé.");
  });
});

document.getElementById("refreshBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "GET_STATUS_ON_ACTIVE_TAB" }, (resp) => {
    if (!resp?.ok) {
      setStatus("Erreur statut:\n" + (resp?.error || "inconnue"));
      return;
    }

    renderState(resp.state);
  });
});
