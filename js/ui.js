// ============================================================
// UI — small themed replacements for native browser dialogs
// (confirm/alert/prompt), plus the "update available" banner.
// Kept separate from controllers.js since these are generic,
// reusable primitives rather than game-specific actions.
//
// Note: the app only ever has one of these open at a time, so
// fixed element ids (uiConfirmYes, etc.) are fine — no stacking.
// ============================================================

var UI = {
  confirm(message, onConfirm, opts) {
    opts = opts || {};
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h3>${opts.title || "Are you sure?"}</h3>
        <p class="hint-text">${message}</p>
        <button class="btn-primary" id="uiConfirmYes">${opts.confirmLabel || "Confirm"}</button>
        <button class="tiny-link" id="uiConfirmNo" style="display:block;text-align:center;margin-top:16px;">Cancel</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById("uiConfirmYes").onclick = () => {
      overlay.remove();
      onConfirm();
    };
    document.getElementById("uiConfirmNo").onclick = () => overlay.remove();
  },

  prompt(message, onSubmit, opts) {
    opts = opts || {};
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h3>${opts.title || "Enter a value"}</h3>
        <p class="hint-text">${message}</p>
        <input type="text" class="text-input" id="uiPromptInput" placeholder="${opts.placeholder || ""}" />
        <button class="btn-primary" id="uiPromptOk" style="margin-top:12px;">${opts.okLabel || "OK"}</button>
        <button class="tiny-link" id="uiPromptCancel" style="display:block;text-align:center;margin-top:16px;">Cancel</button>
      </div>`;
    document.body.appendChild(overlay);
    const input = document.getElementById("uiPromptInput");
    const submit = () => {
      const val = input.value;
      overlay.remove();
      onSubmit(val);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    });
    document.getElementById("uiPromptOk").onclick = submit;
    document.getElementById("uiPromptCancel").onclick = () => overlay.remove();
    input.focus();
  },

  alert(message, opts) {
    opts = opts || {};
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h3>${opts.title || "Heads up"}</h3>
        <p class="hint-text">${message}</p>
        <button class="btn-primary" id="uiAlertOk">${opts.okLabel || "OK"}</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById("uiAlertOk").onclick = () => overlay.remove();
  },

  // Called when a new service worker takes control of an already-open page
  // (see index.html) — lets people know a refresh will pick up the update,
  // without forcing a reload out from under them mid-game.
  showUpdateBanner() {
    if (document.getElementById("updateBanner")) return;
    const banner = document.createElement("div");
    banner.id = "updateBanner";
    banner.className = "update-banner";
    banner.innerHTML = `<span>A new version is ready.</span><button id="updateBannerBtn">Refresh</button>`;
    document.body.appendChild(banner);
    document.getElementById("updateBannerBtn").onclick = () => window.location.reload();
  }
};
