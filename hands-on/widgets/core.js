/* Chapter 10 deck -- the drawing and arithmetic core for the live figures.
 *
 * Nothing here is specific to a figure. Three parts:
 *   S     the statistics: least squares, entropy, information gain, ID3 with
 *         leave-one-out, the jury theorem, the sigmoid, the metrics, the ROC
 *   Plot  a small SVG plotter in the deck's palette
 *   UI    sliders, number boxes and readouts that redraw on input
 *
 * The data is the JSON block at the top of the .qmd, so the slides and their
 * numbers live in one file and the rendered deck needs nothing external.
 */
'use strict';

const D = JSON.parse(document.getElementById('ch10-data').textContent);

const C = {
  navy: '#0F1E3A', muted: '#5B6B86', faint: '#9AA6BC', grid: '#E1E8F4', card: '#F3F6FC',
  blue: '#2563EB', cyan: '#06B6D4', cyan2: '#0891B2', violet: '#7C3AED',
  amber: '#F59E0B', rose: '#F43F5E', teal: '#0E9F8E', white: '#FFFFFF',
};

const fmt = (v, d = 3) => Number(v).toFixed(d);
const pct = (v, d = 0) => (100 * v).toFixed(d) + '%';
const sum = a => a.reduce((t, v) => t + v, 0);
const mean = a => sum(a) / a.length;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* =====================================================================  S
 * Any figure that shows a number gets it from here, so what a chart draws and
 * what it reports are the same calculation. Two conventions are deliberate and
 * match the Chapter 10 notebook: a tied majority breaks toward the
 * alphabetically first label, and a tree with no branch for a value answers
 * null, which counts as wrong.
 */
const S = {
  leastSquares(xs, ys) {
    const mx = mean(xs), my = mean(ys);
    let num = 0, den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    const slope = den ? num / den : 0;
    return { slope, intercept: my - slope * mx };
  },

  fit(xs, ys) {
    const { slope, intercept } = S.leastSquares(xs, ys);
    const predicted = xs.map(x => intercept + slope * x);
    const residuals = ys.map((y, i) => y - predicted[i]);
    const my = mean(ys);
    const ssRes = sum(residuals.map(e => e * e));
    const ssTot = sum(ys.map(y => (y - my) ** 2));
    return {
      slope, intercept, predicted, residuals, ssRes, ssTot,
      r2: ssTot ? 1 - ssRes / ssTot : NaN,
      rmse: Math.sqrt(ssRes / ys.length),
      mae: mean(residuals.map(Math.abs)),
    };
  },

  /* polynomial least squares, for the overfitting panel */
  polyfit(xs, ys, degree) {
    const n = degree + 1;
    const A = [], b = [];
    for (let r = 0; r < n; r++) {
      A.push(new Array(n).fill(0));
      b.push(0);
      for (let c = 0; c < n; c++) A[r][c] = sum(xs.map(x => x ** (r + c)));
      b[r] = sum(xs.map((x, i) => x ** r * ys[i]));
    }
    /* Gaussian elimination with partial pivoting */
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]];
      [b[i], b[p]] = [b[p], b[i]];
      if (Math.abs(A[i][i]) < 1e-12) continue;
      for (let r = i + 1; r < n; r++) {
        const f = A[r][i] / A[i][i];
        for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    const coef = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let acc = b[i];
      for (let c = i + 1; c < n; c++) acc -= A[i][c] * coef[c];
      coef[i] = Math.abs(A[i][i]) < 1e-12 ? 0 : acc / A[i][i];
    }
    return coef;                       // ascending powers
  },
  polyval: (coef, x) => coef.reduce((acc, c, i) => acc + c * x ** i, 0),

  counts(labels) {
    const c = new Map();
    labels.forEach(l => c.set(l, (c.get(l) || 0) + 1));
    return c;
  },

  entropy(labels) {
    const n = labels.length;
    if (!n) return 0;
    let total = 0;
    S.counts(labels).forEach(c => { total -= (c / n) * Math.log2(c / n); });
    return Math.abs(total);
  },

  gini(labels) {
    const n = labels.length;
    if (!n) return 0;
    let s = 0;
    S.counts(labels).forEach(c => { s += (c / n) ** 2; });
    return 1 - s;
  },

  splitOn(rows, attribute) {
    const groups = new Map();
    rows.forEach(r => {
      if (!groups.has(r[attribute])) groups.set(r[attribute], []);
      groups.get(r[attribute]).push(r);
    });
    return new Map([...groups.entries()].sort((a, b) => (a[0] > b[0] ? 1 : -1)));
  },

  informationGain(rows, attribute, label) {
    const before = S.entropy(rows.map(r => r[label]));
    let after = 0;
    S.splitOn(rows, attribute).forEach(g => {
      after += (g.length / rows.length) * S.entropy(g.map(r => r[label]));
    });
    return before - after;
  },

  gains(rows, attributes, label) {
    return attributes
      .map(a => ({ attribute: a, gain: S.informationGain(rows, a, label) }))
      .sort((x, y) => y.gain - x.gain);
  },

  /* pandas' .mode().iloc[0]: most frequent, a tie broken by sorted order.
   * The tie rule is not cosmetic -- on the golf table it moves the depth-1
   * leave-one-out score from 0.571 to 0.357. */
  majority(labels) {
    const c = S.counts(labels);
    const top = Math.max(...c.values());
    return [...c.entries()].filter(([, n]) => n === top).map(([l]) => l).sort()[0];
  },

  /* How the slides judge a question, in plain counts: split the rows on the
   * attribute, let each group answer with its majority, and count the rows that
   * answer settles; a group that is all one label is pure. The chapter notebook
   * implements the same two numbers, so deck and notebook grow the same trees. */
  splitScore(rows, attribute, label) {
    let settled = 0, pure = 0;
    S.splitOn(rows, attribute).forEach(g => {
      const c = S.counts(g.map(r => r[label]));
      settled += Math.max(...c.values());
      if (c.size === 1) pure += 1;
    });
    return { settled, pure };
  },

  /* The attribute that settles the most rows; a tie goes to the one with more
   * pure groups, and a tie on both to the one listed first. */
  bestSplit(rows, attributes, label) {
    let best = null;
    attributes.forEach(a => {
      const s = S.splitScore(rows, a, label);
      if (!best || s.settled > best.settled || (s.settled === best.settled && s.pure > best.pure)) {
        best = { attribute: a, ...s };
      }
    });
    return best;
  },

  buildTree(rows, attributes, label, maxDepth) {
    const labels = rows.map(r => r[label]);
    if (new Set(labels).size === 1 || !attributes.length || maxDepth === 0) {
      return { leaf: S.majority(labels), n: rows.length };
    }
    const best = S.bestSplit(rows, attributes, label);
    const remaining = attributes.filter(a => a !== best.attribute);
    const branches = new Map();
    S.splitOn(rows, best.attribute).forEach((group, value) => {
      branches.set(value, S.buildTree(group, remaining, label, maxDepth - 1));
    });
    return { attribute: best.attribute, settled: best.settled, pure: best.pure, n: rows.length, branches };
  },

  /* null for a value the training rows never showed: the tree has no answer,
   * and null never equals a label, so the row counts as wrong. */
  predict(node, row) {
    while (!('leaf' in node)) {
      if (!node.branches.has(row[node.attribute])) return null;
      node = node.branches.get(row[node.attribute]);
    }
    return node.leaf;
  },

  accuracy(node, rows, label) {
    return rows.filter(r => S.predict(node, r) === r[label]).length / rows.length;
  },

  leaveOneOut(rows, attributes, label, maxDepth) {
    let correct = 0;
    for (let i = 0; i < rows.length; i++) {
      const rest = rows.filter((_, j) => j !== i);
      if (S.predict(S.buildTree(rest, attributes, label, maxDepth), rows[i]) === rows[i][label]) correct++;
    }
    return correct / rows.length;
  },

  countLeaves(node) {
    if ('leaf' in node) return 1;
    let n = 0;
    node.branches.forEach(child => { n += S.countLeaves(child); });
    return n;
  },

  jury(n, p) {
    /* P(a majority of n independent voters, each right with probability p),
     * summed with logarithms so n = 101 does not overflow the binomial. */
    let total = 0;
    for (let j = Math.floor(n / 2) + 1; j <= n; j++) {
      total += Math.exp(S.logChoose(n, j) + j * Math.log(p) + (n - j) * Math.log(1 - p));
    }
    return total;
  },
  logGamma(x) {
    const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5, ser = 1.000000000190015;
    tmp -= (x + 0.5) * Math.log(tmp);
    for (let j = 0; j < 6; j++) ser += g[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  },
  logChoose: (n, k) => S.logGamma(n + 1) - S.logGamma(k + 1) - S.logGamma(n - k + 1),

  sigmoid: z => 1 / (1 + Math.exp(-z)),

  fBeta(precision, recall, beta) {
    const denom = beta * beta * precision + recall;
    return denom ? (1 + beta * beta) * precision * recall / denom : 0;
  },

  metrics(tp, fp, fn, tn) {
    const total = tp + fp + fn + tn;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    return {
      total, tp, fp, fn, tn,
      accuracy: total ? (tp + tn) / total : 0,
      precision, recall,
      specificity: tn + fp ? tn / (tn + fp) : 0,
      f1: S.fBeta(precision, recall, 1),
    };
  },

  confusionAt(ill, healthy, threshold) {
    const tp = ill.filter(s => s >= threshold).length;
    const fp = healthy.filter(s => s >= threshold).length;
    return { tp, fn: ill.length - tp, fp, tn: healthy.length - fp };
  },

  roc(ill, healthy) {
    const cuts = [...new Set([...ill, ...healthy])].sort((a, b) => b - a);
    const curve = [[0, 0]];
    cuts.forEach(t => {
      const c = S.confusionAt(ill, healthy, t);
      curve.push([c.fp / healthy.length, c.tp / ill.length]);
    });
    curve.push([1, 1]);
    let wins = 0;
    ill.forEach(a => healthy.forEach(b => { wins += a > b ? 1 : a === b ? 0.5 : 0; }));
    return { curve, wins, pairs: ill.length * healthy.length, auc: wins / (ill.length * healthy.length) };
  },

  margin: w => 2 / Math.hypot(...w),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
};

/* ==================================================================  Plot
 * An SVG chart sized in its own coordinate space and scaled to the column by
 * `width: 100%`, so it stays crisp at any projector resolution.
 */
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  return n;
};

function niceTicks(a, b, count = 5) {
  const raw = (b - a) / count;
  if (!(raw > 0)) return [a];
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let t = Math.ceil(a / step) * step; t <= b + step * 1e-9; t += step) {
    out.push(+t.toPrecision(12));
  }
  return out;
}

class Plot {
  constructor(o = {}) {
    this.o = Object.assign({
      w: 620, h: 380, top: 34, right: 16, bottom: 46, left: 60,
      xlim: [0, 1], ylim: [0, 1], title: '', xlabel: '', ylabel: '',
      xticks: null, yticks: null, xfmt: String, yfmt: String, grid: true,
    }, o);
    this.node = svgEl('svg', {
      viewBox: `0 0 ${this.o.w} ${this.o.h}`,
      class: 'wfig',
      preserveAspectRatio: 'xMidYMid meet',
    });
    this.g = svgEl('g');
    this.node.appendChild(this.g);
    this.frame();
  }

  get iw() { return this.o.w - this.o.left - this.o.right; }
  get ih() { return this.o.h - this.o.top - this.o.bottom; }
  x(v) { const [a, b] = this.o.xlim; return this.o.left + ((v - a) / (b - a)) * this.iw; }
  y(v) { const [a, b] = this.o.ylim; return this.o.top + this.ih - ((v - a) / (b - a)) * this.ih; }
  xInv(px) { const [a, b] = this.o.xlim; return a + ((px - this.o.left) / this.iw) * (b - a); }
  yInv(py) { const [a, b] = this.o.ylim; return a + ((this.o.top + this.ih - py) / this.ih) * (b - a); }
  add(tag, attrs) { const n = svgEl(tag, attrs); this.g.appendChild(n); return n; }

  frame() {
    const o = this.o;
    const xt = o.xticks || niceTicks(o.xlim[0], o.xlim[1], 6);
    const yt = o.yticks || niceTicks(o.ylim[0], o.ylim[1], 5);
    if (o.grid) {
      xt.forEach(t => this.add('line', {
        x1: this.x(t), x2: this.x(t), y1: o.top, y2: o.top + this.ih,
        stroke: C.grid, 'stroke-width': 1,
      }));
      yt.forEach(t => this.add('line', {
        x1: o.left, x2: o.left + this.iw, y1: this.y(t), y2: this.y(t),
        stroke: C.grid, 'stroke-width': 1,
      }));
    }
    this.add('line', { x1: o.left, x2: o.left + this.iw, y1: o.top + this.ih, y2: o.top + this.ih, stroke: C.grid, 'stroke-width': 1.5 });
    this.add('line', { x1: o.left, x2: o.left, y1: o.top, y2: o.top + this.ih, stroke: C.grid, 'stroke-width': 1.5 });
    xt.forEach(t => this.text(this.x(t), o.top + this.ih + 20, o.xfmt(t), { anchor: 'middle', size: 13, color: C.muted }));
    yt.forEach(t => this.text(o.left - 9, this.y(t) + 4.5, o.yfmt(t), { anchor: 'end', size: 13, color: C.muted }));
    if (o.xlabel) this.text(o.left + this.iw / 2, o.h - 8, o.xlabel, { anchor: 'middle', size: 14, color: C.muted });
    if (o.ylabel) {
      const t = this.text(0, 0, o.ylabel, { anchor: 'middle', size: 14, color: C.muted });
      t.setAttribute('transform', `translate(16 ${o.top + this.ih / 2}) rotate(-90)`);
    }
    if (o.title) this.text(o.left + this.iw / 2, 20, o.title, { anchor: 'middle', size: 15, weight: 700, color: C.navy });
    this.plotArea = svgEl('g');
    this.g.appendChild(this.plotArea);
    return this;
  }

  /* everything below draws into the clipped plot area group */
  addIn(tag, attrs) { const n = svgEl(tag, attrs); this.plotArea.appendChild(n); return n; }

  text(px, py, str, opt = {}) {
    const n = svgEl('text', {
      x: px, y: py, fill: opt.color || C.navy,
      'font-size': opt.size || 13, 'font-weight': opt.weight || 400,
      'text-anchor': opt.anchor || 'start', 'font-family': 'inherit',
      'font-style': opt.italic ? 'italic' : null,
    });
    n.textContent = str;
    (opt.inPlot ? this.plotArea : this.g).appendChild(n);
    return n;
  }

  path(points, opt = {}) {
    if (!points.length) return null;
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${this.x(p[0]).toFixed(2)} ${this.y(p[1]).toFixed(2)}`).join(' ');
    return this.addIn('path', {
      d, fill: 'none', stroke: opt.color || C.blue,
      'stroke-width': opt.width || 2.6, 'stroke-dasharray': opt.dash || null,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: opt.opacity,
    });
  }

  step(points, opt = {}) {
    const pts = [];
    points.forEach((p, i) => {
      if (i) pts.push([p[0], points[i - 1][1]]);
      pts.push(p);
    });
    return this.path(pts, opt);
  }

  area(points, base, opt = {}) {
    if (!points.length) return null;
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${this.x(p[0]).toFixed(2)} ${this.y(p[1]).toFixed(2)}`).join(' ')
      + ` L${this.x(points[points.length - 1][0]).toFixed(2)} ${this.y(base).toFixed(2)}`
      + ` L${this.x(points[0][0]).toFixed(2)} ${this.y(base).toFixed(2)} Z`;
    return this.addIn('path', { d, fill: opt.color || C.blue, opacity: opt.opacity ?? 0.14, stroke: 'none' });
  }

  band(xs, lo, hi, opt = {}) {
    const top = xs.map((x, i) => [x, hi[i]]);
    const bottom = xs.map((x, i) => [x, lo[i]]).reverse();
    const all = top.concat(bottom);
    const d = all.map((p, i) => `${i ? 'L' : 'M'}${this.x(p[0]).toFixed(2)} ${this.y(p[1]).toFixed(2)}`).join(' ') + ' Z';
    return this.addIn('path', { d, fill: opt.color || C.cyan, opacity: opt.opacity ?? 0.16, stroke: 'none' });
  }

  dot(vx, vy, opt = {}) {
    return this.addIn('circle', {
      cx: this.x(vx), cy: this.y(vy), r: opt.r || 7,
      fill: opt.color || C.blue, stroke: opt.edge || C.white,
      'stroke-width': opt.edgeWidth ?? 1.6, class: opt.cls, opacity: opt.opacity,
    });
  }

  square(vx, vy, opt = {}) {
    const s = (opt.r || 6.4) * 1.8;
    return this.addIn('rect', {
      x: this.x(vx) - s / 2, y: this.y(vy) - s / 2, width: s, height: s, rx: 1.5,
      fill: opt.color || C.blue, stroke: opt.edge || C.white, 'stroke-width': opt.edgeWidth ?? 1.6,
    });
  }

  triangle(vx, vy, opt = {}) {
    const s = (opt.r || 7) * 1.15;
    const cx = this.x(vx), cy = this.y(vy);
    return this.addIn('polygon', {
      points: `${cx},${cy - s} ${cx + s},${cy + s * 0.8} ${cx - s},${cy + s * 0.8}`,
      fill: opt.color || C.blue, stroke: opt.edge || C.white, 'stroke-width': opt.edgeWidth ?? 1.4,
    });
  }

  star(vx, vy, opt = {}) {
    const r = opt.r || 11, cx = this.x(vx), cy = this.y(vy), pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
    }
    return this.addIn('polygon', {
      points: pts.join(' '), fill: opt.color || C.rose,
      stroke: opt.edge || C.white, 'stroke-width': opt.edgeWidth ?? 1.6, class: opt.cls,
    });
  }

  ring(vx, vy, opt = {}) {
    return this.addIn('circle', {
      cx: this.x(vx), cy: this.y(vy), r: opt.r || 13, fill: 'none',
      stroke: opt.color || C.amber, 'stroke-width': opt.width || 2.6,
      'stroke-dasharray': opt.dash || null,
    });
  }

  /* a circle in data units (needs equal scales on both axes) */
  circleData(cx, cy, radius, opt = {}) {
    return this.addIn('ellipse', {
      cx: this.x(cx), cy: this.y(cy),
      rx: Math.abs(this.x(cx + radius) - this.x(cx)),
      ry: Math.abs(this.y(cy + radius) - this.y(cy)),
      fill: opt.fill || 'none', stroke: opt.color || C.muted,
      'stroke-width': opt.width || 1.6, 'stroke-dasharray': opt.dash || '6 5',
    });
  }

  hline(v, opt = {}) {
    return this.addIn('line', {
      x1: this.o.left, x2: this.o.left + this.iw, y1: this.y(v), y2: this.y(v),
      stroke: opt.color || C.rose, 'stroke-width': opt.width || 2,
      'stroke-dasharray': opt.dash || null,
    });
  }

  vline(v, opt = {}) {
    return this.addIn('line', {
      x1: this.x(v), x2: this.x(v), y1: this.o.top, y2: this.o.top + this.ih,
      stroke: opt.color || C.rose, 'stroke-width': opt.width || 2,
      'stroke-dasharray': opt.dash || null,
    });
  }

  segment(x1, y1, x2, y2, opt = {}) {
    return this.addIn('line', {
      x1: this.x(x1), y1: this.y(y1), x2: this.x(x2), y2: this.y(y2),
      stroke: opt.color || C.faint, 'stroke-width': opt.width || 1.4,
      'stroke-dasharray': opt.dash || null,
    });
  }

  bar(vx, vy, width, opt = {}) {
    const x1 = this.x(vx - width / 2), x2 = this.x(vx + width / 2);
    const y0 = this.y(Math.max(0, this.o.ylim[0])), y1 = this.y(vy);
    return this.addIn('rect', {
      x: Math.min(x1, x2), y: Math.min(y0, y1), width: Math.abs(x2 - x1),
      height: Math.abs(y1 - y0), rx: 2,
      fill: opt.color || C.blue, opacity: opt.opacity,
    });
  }

  /* a leader line from a label to a point */
  callout(vx, vy, dx, dy, str, opt = {}) {
    const x0 = this.x(vx), y0 = this.y(vy);
    this.addIn('line', {
      x1: x0 + dx * 0.14, y1: y0 + dy * 0.14, x2: x0 + dx * 0.86, y2: y0 + dy * 0.86,
      stroke: opt.color || C.muted, 'stroke-width': 1.2,
    });
    const t = this.text(x0 + dx, y0 + dy, str, {
      anchor: opt.anchor || (dx < 0 ? 'end' : 'start'),
      size: opt.size || 13, weight: opt.weight || 700,
      color: opt.color || C.navy, inPlot: true,
    });
    return t;
  }

  /* A legend placed by corner, so a caller says where the chart is empty
   * rather than computing pixel offsets. */
  legend(items, opt = {}) {
    const o = this.o;
    const at = opt.at || 'top-right';
    const right = at.endsWith('right');
    const pad = 10;
    const x0 = right ? o.left + this.iw - pad : o.left + pad;
    const rowH = 19;
    const y0 = at.startsWith('top')
      ? o.top + 14
      : o.top + this.ih - pad - (items.length - 1) * rowH;
    items.forEach((it, i) => {
      const yy = y0 + i * rowH;
      const markEnd = right ? x0 : x0 + 22;
      const markStart = right ? x0 - 22 : x0;
      if (it.line || it.dash) {
        this.add('line', {
          x1: markStart, x2: markEnd, y1: yy - 4, y2: yy - 4,
          stroke: it.color, 'stroke-width': 2.6, 'stroke-dasharray': it.dash || null,
        });
      } else {
        this.add('circle', { cx: (markStart + markEnd) / 2, cy: yy - 4, r: 5.5, fill: it.color });
      }
      this.text(right ? markStart - 7 : markEnd + 7, yy, it.label, {
        anchor: right ? 'end' : 'start', size: 13, color: C.muted,
      });
    });
    return this;
  }

  /* pointer position in data units, for dragging */
  dataAt(event) {
    const r = this.node.getBoundingClientRect();
    const px = ((event.clientX - r.left) / r.width) * this.o.w;
    const py = ((event.clientY - r.top) / r.height) * this.o.h;
    return [this.xInv(px), this.yInv(py)];
  }
}

/* ====================================================================  UI
 * Controls that call back on every input, plus a readout strip for the
 * numbers a figure computes.
 */
const UI = {
  host(el, klass) {
    const n = document.createElement('div');
    if (klass) n.className = klass;
    el.appendChild(n);
    return n;
  },

  /* the two rows every widget has: controls on top, figure below */
  layout(el, { controlsFirst = true } = {}) {
    el.innerHTML = '';
    const ctl = UI.host(el, 'ctl');
    const fig = UI.host(el, 'wfigwrap');
    const out = UI.host(el, 'wout');
    if (!controlsFirst) el.insertBefore(fig, ctl);
    return { ctl, fig, out };
  },

  slider(ctl, { label, min, max, step = 1, value, format = String, onInput }) {
    const wrap = document.createElement('label');
    wrap.className = 'c-slider';
    const name = document.createElement('span');
    name.className = 'c-name';
    name.textContent = label;
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min, max, step, value });
    const val = document.createElement('span');
    val.className = 'c-val';
    const show = () => { val.textContent = format(+input.value); };
    show();
    input.addEventListener('input', () => { show(); onInput(+input.value); });
    wrap.append(name, input, val);
    ctl.appendChild(wrap);
    return { input, set: v => { input.value = v; show(); } };
  },

  number(ctl, { label, min, max, step = 1, value, width, onInput }) {
    const wrap = document.createElement('label');
    wrap.className = 'c-number';
    const name = document.createElement('span');
    name.className = 'c-name';
    name.textContent = label;
    const input = document.createElement('input');
    Object.assign(input, { type: 'number', min, max, step, value });
    if (width) input.style.width = width;
    input.addEventListener('input', () => {
      const v = +input.value;
      if (Number.isFinite(v)) onInput(clamp(v, min, max));
    });
    wrap.append(name, input);
    ctl.appendChild(wrap);
    return { input, set: v => { input.value = v; } };
  },

  choice(ctl, { label, options, value, onInput }) {
    const wrap = document.createElement('span');
    wrap.className = 'c-choice';
    if (label) {
      const name = document.createElement('span');
      name.className = 'c-name';
      name.textContent = label;
      wrap.appendChild(name);
    }
    const buttons = options.map(o => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.label;
      b.className = o.value === value ? 'on' : '';
      b.addEventListener('click', () => {
        buttons.forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        onInput(o.value);
      });
      wrap.appendChild(b);
      return b;
    });
    ctl.appendChild(wrap);
    return { buttons };
  },

  toggle(ctl, { label, value, onInput }) {
    const wrap = document.createElement('label');
    wrap.className = 'c-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!value;
    const name = document.createElement('span');
    name.textContent = label;
    input.addEventListener('input', () => onInput(input.checked));
    wrap.append(input, name);
    ctl.appendChild(wrap);
    return { input };
  },

  button(ctl, { label, onClick }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'c-btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    ctl.appendChild(b);
    return b;
  },

  /* the strip of computed numbers under a figure */
  readout(out, entries) {
    out.innerHTML = '';
    /* three chips or fewer can carry their notes on the slide; a wider strip
     * would cost the figure above it too much height, so the note becomes a
     * tooltip and the strip stays one line high. */
    out.classList.toggle('roomy', entries.length <= 3);
    entries.forEach(e => {
      const n = document.createElement('span');
      n.className = 'r-item';
      n.style.setProperty('--accent', e.color || C.cyan2);
      const k = document.createElement('span');
      k.className = 'r-key';
      k.textContent = e.key;
      const v = document.createElement('span');
      v.className = 'r-val';
      v.textContent = e.value;
      n.append(k, v);
      if (e.note) {
        n.title = e.note;
        const s = document.createElement('span');
        s.className = 'r-note';
        s.textContent = e.note;
        n.appendChild(s);
      }
      out.appendChild(n);
    });
  },

  note(out, text) {
    out.innerHTML = '';
    const n = document.createElement('p');
    n.className = 'r-line';
    n.innerHTML = text;
    out.appendChild(n);
  },

  /* make points draggable: onMove(index, x, y) is called with data units */
  draggable(plot, hit, onMove) {
    let active = null;
    const start = ev => {
      const [dx, dy] = plot.dataAt(ev);
      active = hit(dx, dy);
      if (active != null) { plot.node.setPointerCapture(ev.pointerId); ev.preventDefault(); }
    };
    const move = ev => {
      if (active == null) return;
      const [dx, dy] = plot.dataAt(ev);
      onMove(active, dx, dy);
      ev.preventDefault();
    };
    const end = () => { active = null; };
    plot.node.addEventListener('pointerdown', start);
    plot.node.addEventListener('pointermove', move);
    plot.node.addEventListener('pointerup', end);
    plot.node.addEventListener('pointercancel', end);
    plot.node.classList.add('grabbable');
  },
};
