// The signature visual: the floor is a stone block, the stock leg a bronze column standing on it.
// Heights are to scale with the vault's own numbers; they animate when the numbers change.
import { usd } from './format';

const money = (x: number) => usd(x, x < 100 ? 2 : 0);

export function PlinthFigure({ total, floor, stock, breakDistance, label }: {
  total: number; floor: number; stock: number; breakDistance: number | null; label: string;
}) {
  const W = 360, H = 310, base = 280, top = 40;
  const scale = (base - top) / Math.max(total, 1);
  const safe = total - stock;
  const hFloor = floor * scale, hSafe = safe * scale, hStock = stock * scale;
  const colW = 120, x0 = 60;
  return (
    <figure className="plinth-fig" aria-label={`${label}: ${money(stock)} in stock on ${money(safe)} safe, floor ${money(floor)}`}>
      <svg viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <pattern id="grain" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M0 6 L6 0" className="grain" />
          </pattern>
        </defs>
        {/* safe leg: the stone */}
        <rect className="stone anim" x={x0} width={240} y={base - hSafe} height={hSafe} />
        <rect className="stone-grain anim" x={x0} width={240} y={base - hSafe} height={hSafe} fill="url(#grain)" />
        {/* stock leg: the bronze column on top */}
        <rect className="bronze anim" x={x0 + (240 - colW) / 2} width={colW} y={base - hSafe - hStock} height={hStock} />
        {/* the cushion: the part of the column above the floor, all that can be lost */}
        {stock > 0 && total > floor && (
          <>
            <rect className="cushion anim" x={x0 + (240 - colW) / 2} width={colW} y={base - total * scale} height={Math.min((total - floor) * scale, hStock)} />
            <text className="fig-label lose" x={x0 + 120} y={base - total * scale - 10} textAnchor="middle">can lose {money(total - floor)}</text>
          </>
        )}
        {/* the floor line */}
        <line className="floor-line anim" x1={x0 - 30} x2={x0 + 270} y1={base - hFloor} y2={base - hFloor} />
        <text className="fig-label" x={x0 + 274} y={base - hFloor + 4}>floor</text>
        <text className="fig-num" x={x0 + (240 - colW) / 2 + colW + 8} y={base - hSafe - hStock / 2 + 4}>{money(stock)} in stock</text>
        <text className="fig-num on-stone" x={x0 + 12} y={base - 12}>{money(safe)} safe</text>
        <line className="ground" x1={20} x2={W - 20} y1={base} y2={base} />
      </svg>
      <figcaption>
        {breakDistance === null
          ? 'Nothing is in stock right now: the vault is all stone.'
          : <>The stock could drop <strong>{(breakDistance * 100).toFixed(1)}%</strong> in one move before the column reaches the floor.</>}
      </figcaption>
    </figure>
  );
}
