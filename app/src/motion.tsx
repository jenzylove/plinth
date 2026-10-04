// Scroll motion: elements rise in as they enter the viewport; numbers count up to their live value.
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useInView<T extends Element>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen] as const;
}

export function Reveal({ children, delay = 0, as: Tag = 'div', className = '', style }: {
  children: ReactNode; delay?: number; as?: 'div' | 'section' | 'li' | 'p' | 'h2' | 'span'; className?: string; style?: CSSProperties;
}) {
  const [ref, seen] = useInView<HTMLElement>();
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={`reveal ${seen ? 'in' : ''} ${className}`} style={{ ...style, transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/** Shows the real value from the first paint (so a screenshot, a preview or a background tab never reads
 *  $0), then glides to each new value once visible. */
export function CountUp({ value, format }: { value: number; format: (x: number) => string }) {
  const [ref, seen] = useInView<HTMLSpanElement>(0.4);
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (!seen || from.current === value) return;
    if (reduced()) { setShown(value); from.current = value; return; }
    const start = performance.now(), a = from.current, dur = 1100;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value]);
  return <span ref={ref}>{format(shown)}</span>;
}

/** 0 when the element's top reaches the bottom of the viewport, 1 when its bottom leaves the top. */
export function useScrollProgress<T extends Element>() {
  const ref = useRef<T>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect(), vh = window.innerHeight;
        setP(Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height))));
      });
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, []);
  return [ref, p] as const;
}

/** Words turn from grey to ink one by one as the block scrolls through the viewport. */
export function FillText({ text, pill, pillWords }: { text: string; pill?: string; pillWords?: string[] }) {
  const [ref, p] = useScrollProgress<HTMLHeadingElement>();
  const words = text.split(' ');
  const k = Math.min(1, Math.max(0, (p - 0.15) / 0.45)) * (words.length + 1);
  return (
    <h2 ref={ref} className="fill-text">
      {words.map((w, i) => <span key={i} className={i < k ? 'on' : ''}>{w} </span>)}
      {pill && (
        <span className={`slide-pill ${k > words.length ? 'on' : ''}`}>
          <span className="slide-track">{[pill, ...(pillWords ?? []), pill].map((x, i) => <span key={i}>{x}</span>)}</span>
        </span>
      )}
    </h2>
  );
}
