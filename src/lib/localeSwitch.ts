import { flushSync } from 'react-dom';

const SURFACE_SELECTOR = '.locale-switch-surface';
const FADE_OUT_MS = 90;
const FADE_IN_MS = 110;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitFadeOut(): Promise<void> {
  const surface = document.querySelector(SURFACE_SELECTOR);
  if (!surface) return wait(FADE_OUT_MS);

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      surface.removeEventListener('transitionend', onEnd);
      resolve();
    };

    const onEnd = (event: Event) => {
      const te = event as TransitionEvent;
      if (te.target !== surface || te.propertyName !== 'opacity') return;
      finish();
    };

    surface.addEventListener('transitionend', onEnd);
    window.setTimeout(finish, FADE_OUT_MS + 40);
  });
}

/** Fade out → apply locale (layout di belakang layar) → fade in */
export async function runLocaleSwitch(applyLocale: () => void): Promise<void> {
  if (prefersReducedMotion()) {
    flushSync(applyLocale);
    return;
  }

  const html = document.documentElement;
  html.classList.add('locale-switching');

  const surface = document.querySelector(SURFACE_SELECTOR);
  surface?.classList.add('locale-switch-surface--hiding');

  // Paksa browser mulai transition opacity
  void surface?.getBoundingClientRect();

  await waitFadeOut();

  flushSync(applyLocale);

  await wait(0);

  surface?.classList.remove('locale-switch-surface--hiding');
  html.classList.remove('locale-switching');

  await wait(FADE_IN_MS);
}
