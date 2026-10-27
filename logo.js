// The Lilotech logo as inline SVG, so it can animate: the tile pops in, the book opens,
// the text lines are written and the bookmark drops in. style.css holds the animation.
const SVG = `<svg class="logo-mark" viewBox="0 0 128 128" aria-hidden="true">
  <rect class="lg-tile" x="4" y="4" width="120" height="120" rx="28"/>
  <g class="lg-book">
    <path class="lg-page lg-left" d="M64 40C52 33 37 32 24 35V95C37 92 52 93 64 100Z"/>
    <path class="lg-page lg-right" d="M64 40C76 33 91 32 104 35V95C91 92 76 93 64 100Z"/>
    <path class="lg-lines" d="M34 52H54M34 62H54M34 72H50" pathLength="1"/>
  </g>
  <path class="lg-ribbon" d="M82 30H96V64L89 57L82 64Z"/>
</svg>`;

// Put the logo (and optionally the word "Lilotech") into an element.
export function mountLogo(el, { word = true, sub = '' } = {}) {
  const letters = [...'Lilotech'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('');
  el.classList.add('logo');
  el.innerHTML = SVG + (word ? `<span class="logo-word" aria-label="Lilotech">${letters}</span>` : '') +
    (sub ? `<span class="logo-sub">${sub}</span>` : '');
}

// Play the animation again, for example when a new item is added.
export function replayLogo(el) {
  el.classList.remove('play');
  void el.offsetWidth;
  el.classList.add('play');
}
