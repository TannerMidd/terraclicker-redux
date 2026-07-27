/* Landing page behaviour. Two small things, no dependencies:
   the gauges fill when they scroll into view, and the gallery opens a lightbox. */

// ————— gauges —————
const gauges = document.querySelector('.gauges[data-animate]');
if (gauges) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gauges.classList.add('in');
  } else {
    new IntersectionObserver(
      (entries, obs) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('in');
          obs.unobserve(e.target);
        }
      },
      { threshold: 0.4 },
    ).observe(gauges);
  }
}

// ————— lightbox —————
const box = document.getElementById('lightbox');
if (box && typeof box.showModal === 'function') {
  const img = box.querySelector('img');
  const cap = box.querySelector('.lb-cap');

  for (const btn of document.querySelectorAll('.gallery button[data-src]')) {
    btn.addEventListener('click', () => {
      img.src = btn.dataset.src;
      img.alt = btn.querySelector('img')?.alt ?? '';
      cap.textContent = btn.dataset.cap ?? '';
      box.showModal();
    });
  }

  box.querySelector('.lb-close').addEventListener('click', () => box.close());
  // Click anywhere outside the picture closes it — the backdrop reports as the dialog.
  box.addEventListener('click', (e) => {
    if (e.target === box) box.close();
  });
}
