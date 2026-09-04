/**
 * KaTeX, loaded on first use from cdnjs. If the network is unavailable the
 * equation block shows its LaTeX source in mono — legible, never broken.
 */
const VERSION = '0.16.11';
const BASE = `https://cdnjs.cloudflare.com/ajax/libs/KaTeX/${VERSION}/`;
let loading = null;

export function loadKatex() {
  if (window.katex) return Promise.resolve(window.katex);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-katex]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = BASE + 'katex.min.css'; link.dataset.katex = '1';
      document.head.append(link);
    }
    const s = document.createElement('script');
    s.src = BASE + 'katex.min.js'; s.async = true;
    s.onload = () => resolve(window.katex);
    s.onerror = () => { loading = null; reject(new Error('KaTeX unavailable')); };
    document.head.append(s);
  });
  return loading;
}

export async function renderMath(el, tex) {
  if (!tex.trim()) { el.textContent = 'Empty equation — click to write LaTeX'; el.classList.add('is-empty'); return; }
  el.classList.remove('is-empty');
  try {
    const katex = await loadKatex();
    katex.render(tex, el, { displayMode: true, throwOnError: false, output: 'html' });
  } catch {
    el.innerHTML = ''; const f = document.createElement('code'); f.className = 'eq__fallback'; f.textContent = tex; el.append(f);
  }
}
