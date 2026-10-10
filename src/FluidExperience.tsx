import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/** Pointer effects update CSS variables at most once per frame, without React renders. */
export function FluidAtmosphere() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || !window.matchMedia('(pointer: fine)').matches) return;
    let frame = 0;
    let active: HTMLElement | null = null;
    const reset = () => { active?.style.setProperty('--light-opacity', '0'); active = null; };
    const move = (event: PointerEvent) => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        ref.current?.style.setProperty('--scene-x', `${(event.clientX / innerWidth - .5) * 40}px`);
        ref.current?.style.setProperty('--scene-y', `${(event.clientY / innerHeight - .5) * 28}px`);
        const target = (event.target as HTMLElement)?.closest<HTMLElement>('.primary-panel, .companion-card, .suggestion-card, .tone-option, .template, .modal, .dropzone, .promise-card');
        if (target !== active) reset();
        if (target) {
          const box = target.getBoundingClientRect();
          target.style.setProperty('--light-x', `${event.clientX - box.left}px`);
          target.style.setProperty('--light-y', `${event.clientY - box.top}px`);
          target.style.setProperty('--light-opacity', '1');
          active = target;
        }
      });
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    return () => { cancelAnimationFrame(frame); reset(); document.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', reset); window.removeEventListener('blur', reset); };
  }, [reduce]);
  return <div ref={ref} className="fluid-atmosphere" aria-hidden="true"><span className="aurora aurora-lilac"/><span className="aurora aurora-cream"/><span className="aurora aurora-blue"/><span className="ambient-mesh"/><span className="ambient-noise"/></div>;
}

export function FluidTitle({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const reduce = useReducedMotion();
  const frame = useRef(0);
  function reset() {
    cancelAnimationFrame(frame.current);
    ref.current?.querySelectorAll<HTMLElement>('.type-letter').forEach(el => {
      el.style.setProperty('--letter-lift', '0px'); el.style.setProperty('--letter-turn', '0deg'); el.style.setProperty('--letter-weight', '480'); el.style.setProperty('--letter-glow', '0');
    });
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => { if (reduce) reset(); }, [reduce]);
  return <h1 ref={ref} className="fluid-title" aria-label={text.replace('\n', '')} onPointerLeave={reset} onPointerMove={event => {
    if (reduce || event.pointerType === 'touch') return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      ref.current?.querySelectorAll<HTMLElement>('.type-letter').forEach(el => {
        const box = el.getBoundingClientRect();
        const dx = clientX - box.left - box.width / 2;
        const dy = clientY - box.top - box.height / 2;
        const influence = Math.max(0, 1 - Math.hypot(dx, dy) / 135);
        el.style.setProperty('--letter-lift', `${(-7 * influence).toFixed(2)}px`);
        el.style.setProperty('--letter-turn', `${(dx / 135 * influence * 5).toFixed(2)}deg`);
        el.style.setProperty('--letter-weight', `${Math.round(480 + 230 * influence)}`);
        el.style.setProperty('--letter-glow', influence.toFixed(2));
      });
    });
  }}>{text.split('\n').map((line, lineIndex) => <span key={lineIndex} className={`title-row ${lineIndex === 1 ? 'title-row-accent' : ''}`} aria-hidden="true"><motion.span className="title-reveal" initial={reduce ? false : { clipPath: 'inset(0 0 100% 0)', y: 16 }} animate={{ clipPath: 'inset(-20% -8% -20% -8%)', y: 0 }} transition={{ duration: .8, delay: .06 + lineIndex * .1, ease: [.22, 1, .36, 1] }}>{Array.from(line).map((letter, i) => <span key={i} className="type-letter">{letter}</span>)}</motion.span></span>)}</h1>;
}

export function LiquidLens() {
  return <div className="liquid-lens" aria-hidden="true"><span className="lens-ring"/><span className="lens-shine"/><span className="lens-spark">✦</span><span className="lens-caption">a little moonlight</span></div>;
}
