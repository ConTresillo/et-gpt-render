/* ET-GPT embeddable widget. Usage:
 *   <script src="https://CHAT_ORIGIN/widget.js" data-widget-id="1" defer></script>
 * Styles live in a shadow root so the host page is never affected.
 * No secrets here: the chat runs in an iframe on the chatbot origin. */
(() => {
  const me = document.currentScript;
  if (!me || window.__etgpt) return;
  window.__etgpt = true;
  const origin = new URL(me.src).origin;
  const widgetId = me.dataset.widgetId || "1";
  const host = document.createElement("div");
  host.id = "etgpt-widget";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const BRAND = "#003399";
  root.innerHTML = `
<style>
  :host{all:initial}
  *{box-sizing:border-box;font-family:Poppins,"Open Sans",system-ui,sans-serif}
  .launcher{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:0;background:${BRAND};color:#fff;cursor:pointer;box-shadow:0 6px 20px #0004;z-index:2147483000;display:flex;align-items:center;justify-content:center;transition:transform .15s}
  .launcher:hover,.launcher:focus-visible{transform:scale(1.07);outline:3px solid #fff8;outline-offset:2px}
  .panel{position:fixed;right:20px;bottom:92px;width:400px;height:620px;max-height:calc(100vh - 112px);background:#fff;border-radius:16px;box-shadow:0 12px 40px #0005;overflow:hidden;z-index:2147483000;display:none;flex-direction:column}
  .panel.open{display:flex}
  .panel.big{width:min(820px,calc(100vw - 40px));height:calc(100vh - 112px)}
  .bar{background:${BRAND};color:#fff;padding:10px 12px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
  .bar span{flex:1}
  .bar button{background:transparent;border:0;color:#fff;cursor:pointer;font-size:18px;line-height:1;padding:4px 8px;border-radius:6px}
  .bar button:hover,.bar button:focus-visible{background:#fff3;outline:none}
  iframe{flex:1;border:0;width:100%}
  @media (max-width:520px){.panel,.panel.big{right:0;bottom:0;width:100vw;height:100dvh;max-height:none;border-radius:0}.launcher{right:14px;bottom:14px}}
  @media (prefers-reduced-motion:reduce){.launcher{transition:none}}
</style>
<button class="launcher" aria-label="Open EarthTekniks chat" aria-expanded="false">
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
</button>
<section class="panel" role="dialog" aria-label="EarthTekniks chat">
  <div class="bar"><span>EarthTekniks Assistant</span>
    <button class="expand" aria-label="Expand chat">⤢</button>
    <button class="close" aria-label="Close chat">✕</button></div>
</section>`;
  const launcher = root.querySelector(".launcher");
  const panel = root.querySelector(".panel");
  let frame;
  const setOpen = (open) => {
    panel.classList.toggle("open", open);
    launcher.setAttribute("aria-expanded", String(open));
    if (open && !frame) {
      frame = document.createElement("iframe");
      frame.title = "EarthTekniks chat";
      frame.allow = "microphone; clipboard-write";
      frame.src = `${origin}/?widget=${encodeURIComponent(widgetId)}`;
      panel.appendChild(frame);
    }
    if (open) panel.querySelector(".close").focus(); else launcher.focus();
  };
  launcher.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
  panel.querySelector(".close").addEventListener("click", () => setOpen(false));
  panel.querySelector(".expand").addEventListener("click", () => panel.classList.toggle("big"));
  root.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
})();
