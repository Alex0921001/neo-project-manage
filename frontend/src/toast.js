let toastEl = null;

export function toast(msg, type = "success") {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "global-toast";
    toastEl.style.cssText = `
      position:fixed; bottom:20px; right:20px; padding:10px 18px;
      border-radius:8px; font-size:13px; color:#fff;
      z-index:2000; opacity:0; transition:opacity 0.3s;
    `;
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.style.background = type === "error" ? "#dc3545" : (type === "warn" ? "#f59e0b" : "#28a745");
  toastEl.style.opacity = "1";
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => { toastEl.style.opacity = "0"; }, 2000);
}
