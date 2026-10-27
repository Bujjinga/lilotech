// Section chips: one toggle per section, plus "+ New section" to make your own.
import { escapeHtml, newSectionId, setSettings } from './lib.js';

export function chipsHtml(sections, selected) {
  return sections.map((s) => `<button type="button" class="chip${selected.includes(s.id) ? ' on' : ''}" data-sec="${escapeHtml(s.id)}" aria-pressed="${selected.includes(s.id)}">${escapeHtml(s.name)}</button>`).join('');
}

// Draw chips into `el`. `state` is { sections, selected }; onChange gets the new selection.
export function mountChips(el, state, onChange) {
  const draw = () => {
    el.innerHTML = chipsHtml(state.sections, state.selected) + '<button type="button" class="chip" data-new>+ New section</button>';
  };
  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.new !== undefined) {
      const input = Object.assign(document.createElement('input'), { type: 'text', className: 'chip-input', placeholder: 'Section name' });
      b.replaceWith(input);
      input.focus();
      let done = false;
      const finish = async (keep) => {
        if (done) return;
        done = true;
        const name = input.value.trim();
        if (keep && name && !state.sections.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
          const id = newSectionId(name, state.sections);
          state.sections = [...state.sections, { id, name }];
          state.selected = [...state.selected, id];
          await setSettings({ sections: state.sections });
          onChange(state.selected);
        }
        draw();
      };
      input.onkeydown = (k) => { if (k.key === 'Enter') { k.preventDefault(); finish(true); } if (k.key === 'Escape') finish(false); };
      input.onblur = () => finish(true);
      return;
    }
    const id = b.dataset.sec;
    state.selected = state.selected.includes(id) ? state.selected.filter((x) => x !== id) : [...state.selected, id];
    draw();
    onChange(state.selected);
  };
  draw();
}
