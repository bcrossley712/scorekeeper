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
  },

  // Enter moves focus to the next score-entry field instead of doing
  // nothing (the previous behavior) or submitting anything. Deliberately
  // scoped to `.entry-grid` only — player-name fields and the guest-name
  // prompt already have their own explicit Enter-to-submit handlers, and
  // this must never overlap with those or with the actual Save button.
  //
  // On the very last field, Enter just blurs (closes the keyboard) rather
  // than advancing to — or clicking — Save. That's intentional: this
  // screen exists specifically to avoid an Enter press ever submitting a
  // round of unfinished data, so the last step always has to be an actual
  // tap on Save.
  //
  // One delegated listener registered once at boot (see App.init), not
  // re-attached per render, since score entry forms are rebuilt from
  // scratch on every render.
  enableEnterNavigation() {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const field = e.target;
      if (!field.matches(".entry-grid input, .entry-grid select")) return;
      if (field.type === "checkbox") return; // checkboxes are tapped, not typed into — leave native behavior alone

      const grid = field.closest(".entry-grid");
      const candidates = Array.from(grid.querySelectorAll("input, select")).filter(el => {
        if (el.type === "checkbox" || el.disabled || el.closest(".hidden")) return false;
        const block = el.closest(".entry-unit-block");
        return !block || !block.classList.contains("collapsed");
      });
      const i = candidates.indexOf(field);
      e.preventDefault();
      if (i === -1) return;
      const next = candidates[i + 1];
      if (next) next.focus(); else field.blur();
    });
  }
};
