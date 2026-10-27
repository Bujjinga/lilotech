// A small orange cat with a ball of yarn. It sits and swishes its tail, plays while Lilotech is
// working, and plays for a few seconds when clicked. The animations are in style.css.
const SVG = `<svg viewBox="0 0 120 90" aria-hidden="true">
  <ellipse class="cat-shadow" cx="66" cy="84" rx="44" ry="4"/>
  <g class="cat-yarn">
    <circle cx="20" cy="74" r="10"/>
    <path d="M12 69C18 72 24 72 29 68M11 76C17 79 25 79 30 75M17 65C15 71 16 78 20 84"/>
  </g>
  <path class="cat-thread" d="M29 79C38 82 42 80 44 78"/>
  <g class="cat-tail"><path d="M95 70C110 66 112 50 106 40"/></g>
  <g class="cat-body">
    <ellipse class="cat-fur" cx="75" cy="66" rx="26" ry="17"/>
    <ellipse class="cat-belly" cx="68" cy="72" rx="13" ry="9"/>
    <path class="cat-stripe" d="M80 50L77 58M88 52L84 59M95 57L90 62"/>
    <ellipse class="cat-fur" cx="92" cy="77" rx="9" ry="6"/>
    <g class="cat-paw"><rect class="cat-fur" x="47" y="62" width="9" height="20" rx="4.5"/></g>
    <rect class="cat-fur" x="58" y="64" width="9" height="19" rx="4.5"/>
    <g class="cat-head">
      <path class="cat-fur" d="M38 34L41 14L55 27Z"/>
      <path class="cat-fur" d="M70 34L67 14L53 27Z"/>
      <path class="cat-ear" d="M42 30L43 20L50 27Z"/>
      <path class="cat-ear" d="M66 30L65 20L58 27Z"/>
      <ellipse class="cat-fur" cx="54" cy="42" rx="19" ry="16"/>
      <path class="cat-stripe" d="M50 28L51 33M54 27V33M58 28L57 33"/>
      <ellipse class="cat-belly" cx="54" cy="49" rx="8" ry="5.5"/>
      <path class="cat-nose" d="M51.5 45.5H56.5L54 48.5Z"/>
      <g class="cat-eyes">
        <ellipse cx="46.5" cy="41" rx="2.6" ry="3.6"/>
        <ellipse cx="61.5" cy="41" rx="2.6" ry="3.6"/>
      </g>
    </g>
  </g>
</svg>`;

export function mountCat(el) {
  el.classList.add('cat');
  el.innerHTML = SVG;
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.title = 'Play with me';
  el.setAttribute('aria-label', 'Orange cat. Click to play.');
  let timer = null;
  let working = false;
  const update = () => el.classList.toggle('playing', working || !!timer);
  const cat = {
    // Play for a while (after a click), or until busy(false) when work is running.
    play(ms = 3200) {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; update(); }, ms);
      update();
    },
    busy(on) { working = !!on; update(); },
  };
  el.addEventListener('click', () => cat.play());
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cat.play(); } });
  return cat;
}
