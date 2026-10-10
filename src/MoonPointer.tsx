import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// The tip follows the actual pointer without interpolation. Only the light lags.
// This preserves a precise hotspot while giving the ambient light a softer motion.
export default function MoonPointer() {
  const layer = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const light = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = layer.current;
    if (!root || !tip.current || !light.current || !ring.current) return;
    const fine = matchMedia('(pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const contrast = matchMedia('(forced-colors: active)');
    const disposers: (() => void)[] = [];
    const effects = new Set<{ node: HTMLElement; animations: Animation[]; timer: ReturnType<typeof setTimeout> | null }>();
    let frame = 0, active = false, pressed = false, hovered = false;
    let x = 0, y = 0, glowX = 0, glowY = 0, lastTime = 0;
    function listen(target: EventTarget, event: string, handler: EventListener, options?: AddEventListenerOptions) {
      target.addEventListener(event, handler, options);
      disposers.push(() => target.removeEventListener(event, handler, options));
    }
    function clearEffects() {
      for (const effect of effects) { if (effect.timer) clearTimeout(effect.timer); effect.animations.forEach(a => a.cancel()); effect.node.remove(); }
      effects.clear();
    }
    function hide() {
      active = false; pressed = false; hovered = false;
      cancelAnimationFrame(frame); frame = 0; lastTime = 0;
      document.body.classList.remove('moon-pointer-active');
      root!.dataset.active = 'false'; root!.dataset.hover = 'false'; root!.dataset.pressed = 'false';
      clearEffects();
    }
    function trackLight(time: number) {
      frame = 0;
      if (!active) return;
      const elapsed = lastTime ? Math.min(48, time - lastTime) : 16;
      lastTime = time;
      const blend = 1 - Math.exp(-elapsed / 85);
      glowX += (x - glowX) * blend; glowY += (y - glowY) * blend;
      light.current!.style.transform = `translate3d(${glowX}px,${glowY}px,0)`;
      ring.current!.style.transform = `translate3d(${glowX}px,${glowY}px,0)`;
      if (Math.hypot(x - glowX, y - glowY) > .15) frame = requestAnimationFrame(trackLight);
    }
    function move(event: PointerEvent) {
      const target = event.target;
      if (!fine.matches || reduced.matches || contrast.matches || event.pointerType !== 'mouse' || !(target instanceof Element) ||
          target.closest('input, textarea, select, option, [contenteditable]:not([contenteditable="false"]), .resume-paper, .final-editor, .diff-grid, button:disabled, [data-native-cursor]') || getComputedStyle(target).cursor === 'wait') { hide(); return; }
      x = event.clientX; y = event.clientY;
      if (!active) { glowX = x; glowY = y; lastTime = 0; }
      active = true;
      hovered = Boolean(target.closest('button, a[href], summary, [role="button"], label[for]'));
      tip.current!.style.transform = `translate3d(${x - 3}px,${y - 3}px,0)`;
      root!.dataset.active = 'true'; root!.dataset.hover = String(hovered); root!.dataset.pressed = String(pressed);
      document.body.classList.add('moon-pointer-active');
      if (!frame) frame = requestAnimationFrame(trackLight);
    }
    function click(event: PointerEvent) {
      move(event);
      if (!active || event.button !== 0) return;
      pressed = true; root!.dataset.pressed = 'true';
      // Bound the transient DOM even when someone clicks very quickly.
      if (effects.size >= 6) { const oldest = effects.values().next().value; if (oldest) { if (oldest.timer) clearTimeout(oldest.timer); oldest.animations.forEach(a => a.cancel()); oldest.node.remove(); effects.delete(oldest); } }
      const bloom = document.createElement('div');
      bloom.className = 'moon-click-bloom'; bloom.style.left = `${x}px`; bloom.style.top = `${y}px`; bloom.setAttribute('aria-hidden', 'true');
      root!.append(bloom);
      const animations: Animation[] = [];
      for (let index = 0; index < 2; index++) {
        const ripple = document.createElement('span'); ripple.className = `moon-click-ripple ripple-${index}`; bloom.append(ripple);
        animations.push(ripple.animate([{ transform: 'translate(-50%,-50%) scale(.25)', opacity: .64 }, { transform: 'translate(-50%,-50%) scale(1.8)', opacity: 0 }], { duration: 580, delay: index * 60, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }));
      }
      for (let index = 0; index < 5; index++) {
        const spark = document.createElement('span'); spark.className = `moon-click-spark spark-${index}`; spark.textContent = index % 2 ? '·' : '✦'; bloom.append(spark);
        const angle = (index * 72 - 90) * Math.PI / 180;
        const distance = 30 + index % 2 * 9;
        animations.push(spark.animate([{ transform: 'translate(-50%,-50%) scale(.35)', opacity: .8 }, { transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px),calc(-50% + ${Math.sin(angle) * distance}px)) scale(.8) rotate(35deg)`, opacity: 0 }], { duration: 560, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }));
      }
      const effect = { node: bloom, animations, timer: null as ReturnType<typeof setTimeout> | null }; effects.add(effect);
      const dispose = () => { if (effect.timer) clearTimeout(effect.timer); animations.forEach(a => a.cancel()); bloom.remove(); effects.delete(effect); };
      // Background/throttled windows may not advance the animation timeline.
      // A wall-clock ceiling prevents particles lingering in those cases.
      effect.timer = setTimeout(dispose, 820);
      void Promise.allSettled(animations.map(a => a.finished)).then(dispose);
    }
    listen(document, 'pointermove', move as EventListener, { passive: true });
    listen(document, 'pointerdown', click as EventListener, { passive: true });
    listen(window, 'pointerup', () => { pressed = false; root.dataset.pressed = 'false'; });
    listen(document, 'pointerleave', hide); listen(document, 'pointercancel', hide);
    listen(window, 'blur', hide); listen(window, 'scroll', hide, { passive: true }); listen(window, 'resize', hide);
    listen(document, 'visibilitychange', () => { if (document.hidden) hide(); });
    listen(document, 'keydown', ((event: KeyboardEvent) => { if (['Tab', 'Escape'].includes(event.key)) hide(); }) as EventListener);
    [fine, reduced, contrast].forEach(query => listen(query, 'change', hide));
    return () => { hide(); disposers.forEach(dispose => dispose()); };
  }, []);

  return createPortal(<div ref={layer} className="moon-pointer-layer" data-active="false" data-hover="false" data-pressed="false" aria-hidden="true">
    <div ref={light} className="moon-pointer-light"><span/></div>
    <div ref={ring} className="moon-pointer-ring"><span/></div>
    <div ref={tip} className="moon-pointer-tip"><svg viewBox="0 0 38 42" width="38" height="42" focusable="false"><defs><linearGradient id="pointer-moon-gold" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff3ca"/><stop offset="1" stopColor="#d7b570"/></linearGradient></defs><path d="M3 3L6 24L12 18L19 19Z" fill="#705783" stroke="#fffaf0" strokeWidth="1.4" strokeLinejoin="round"/><path d="M32 31a11.3 11.3 0 0 1-9.6-15.7A11.5 11.5 0 1 0 32 31Z" fill="url(#pointer-moon-gold)" stroke="#a38a60" strokeWidth=".55"/><circle cx="17" cy="28" r=".95" fill="#705736"/><circle cx="22" cy="29" r=".95" fill="#705736"/><path d="M18 32q2 1.7 4 .4" fill="none" stroke="#9a784d" strokeWidth=".8" strokeLinecap="round"/><path d="M31 9l1.1 3 3 1.1-3 1.1-1.1 3-1.1-3-3-1.1 3-1.1Z" fill="#c3abc8"/></svg></div>
  </div>, document.body);
}
