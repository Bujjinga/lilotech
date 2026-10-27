// The Lilotech logo as inline SVG, so it can animate: an orange cat looking through a magnifying glass.
// The tile pops in, the cat rises into view, sweeps the glass across, and blinks. style.css holds the animation.
const SVG = `<svg class="logo-mark" viewBox="0 0 128 128" aria-hidden="true">
  <rect class="lg-tile" x="4" y="4" width="120" height="120" rx="28"/>
  <g class="lg-cat">
    <path class="lg-fur" d="M30 56L35 22L58 42Z"/>
    <path class="lg-fur" d="M102 56L97 22L74 42Z"/>
    <path class="lg-ear" d="M37 48L39 31L51 42Z"/>
    <path class="lg-ear" d="M95 48L93 31L81 42Z"/>
    <ellipse class="lg-fur" cx="66" cy="73" rx="38" ry="32"/>
    <path class="lg-stripe" d="M57 45L60 55M66 43V54M75 45L72 55"/>
    <ellipse class="lg-muzzle" cx="62" cy="88" rx="14" ry="9"/>
    <path class="lg-nose" d="M57.5 82H66.5L62 87Z"/>
    <ellipse class="lg-eye" cx="46" cy="71" rx="4.5" ry="6"/>
  </g>
  <g class="lg-glass">
    <path class="lg-handle" d="M93 89L110 108"/>
    <circle class="lg-lens" cx="80" cy="70" r="17"/>
    <ellipse class="lg-eye lg-big" cx="80" cy="71" rx="7" ry="9"/>
    <circle class="lg-shine" cx="82.5" cy="66.5" r="2.5"/>
    <circle class="lg-fur" cx="104" cy="104" r="7"/>
  </g>
</svg>`;

export const LOGO_SVG = SVG;

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
