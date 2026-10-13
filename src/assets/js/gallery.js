// Photo album lightbox: opens a photo full size, with next/previous (buttons, arrow keys, swipe).
export function initGallery(data) {
  const dlg = document.getElementById('lightbox');
  const src = document.getElementById('album-data');
  if (!dlg || !src) return;
  const items = JSON.parse(src.textContent);
  const img = dlg.querySelector('.lb-img');
  const cap = dlg.querySelector('.lb-cap');
  const rtl = data.lang === 'ar';
  let i = 0;
  let opener = null;

  function show(n) {
    i = (n + items.length) % items.length;
    const it = items[i];
    img.src = it.src; img.alt = it.alt; img.width = it.w; img.height = it.h;
    cap.textContent = it.caption;
  }
  function open(n) {
    opener = document.activeElement;
    show(n);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  const close = () => { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); };

  document.querySelectorAll('[data-album-index]').forEach((b) => b.addEventListener('click', () => open(+b.dataset.albumIndex)));
  dlg.addEventListener('click', (e) => {
    const act = e.target.closest('[data-lb]')?.dataset.lb;
    if (act === 'close' || e.target === dlg) close();
    // "next" points to the reading direction: left in Arabic, right in English
    if (act === 'next') show(i + 1);
    if (act === 'prev') show(i - 1);
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(i + (rtl ? -1 : 1));
    if (e.key === 'ArrowLeft') show(i + (rtl ? 1 : -1));
  });
  dlg.addEventListener('close', () => opener?.focus?.());
  let x0 = null;
  dlg.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  dlg.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) show(i + ((dx < 0) !== rtl ? 1 : -1));
  });
}
