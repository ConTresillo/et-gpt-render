(() => {
  // This is a local content mirror; forms must never send enquiries/orders.
  // Installed first so it holds even if the chat configuration is invalid.
  document.addEventListener('submit', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    alert('Local preview only. No enquiry or order was sent.');
  }, true);
  const label = document.createElement('div');
  label.textContent = 'LOCAL WEBSITE PREVIEW';
  Object.assign(label.style, { position:'fixed', bottom:'8px', left:'8px', padding:'5px 8px', background:'#141933', color:'#fff', font:'10px Arial,sans-serif', letterSpacing:'1px', zIndex:'999', borderRadius:'4px', opacity:'.8', pointerEvents:'none' });
  document.body.appendChild(label);

  const config = window.ETPL_PREVIEW || { chatOrigin: 'http://localhost:3100', widgetId: 1 };
  let origin;
  try { origin = new URL(config.chatOrigin); } catch { console.warn('ETPL preview: invalid chat origin', config.chatOrigin); return; }
  const widgetId = Number(config.widgetId);
  if (!['http:', 'https:'].includes(origin.protocol) || !Number.isInteger(widgetId) || widgetId < 1) { console.warn('ETPL preview: chat embed disabled by invalid configuration', config); return; }
  // Keep account access visible outside the widget, using the configured origin.
  document.querySelectorAll('header .header-left > ul, .rsnp-mnu > ul').forEach(menu => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `${origin.origin}/login`;
    link.textContent = 'SIGN IN';
    link.style.fontWeight = '700';
    item.appendChild(link);
    menu.appendChild(item);
  });
  const script = document.createElement('script');
  script.src = `${origin.origin}/widget.js`;
  script.dataset.widgetId = String(widgetId);
  script.defer = true;
  document.body.appendChild(script);
})();
