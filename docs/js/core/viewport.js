/**
 * Viewport role. `phone` is not "small desktop" — views recompose at this
 * breakpoint (tables become cards, the calendar becomes an agenda), so it is a
 * single source of truth shared by CSS (`--phone` in mobile.css) and JS.
 */
export const PHONE_QUERY = '(max-width: 640px)';
const mq = matchMedia(PHONE_QUERY);

export const isPhone = () => mq.matches;

/** Call `fn(isPhone)` when the role changes. Returns an unsubscribe. */
export function onPhoneChange(fn) {
  const handler = e => fn(e.matches);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

/** Coarse pointer — used to grow hit targets, independent of width. */
export const isTouch = () => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
