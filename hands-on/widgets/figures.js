/* Chapter 10 deck — one entry per live figure.
 *
 * A slide asks for a figure with <div data-widget="name"></div>. Each entry
 * below builds its own controls, draws its chart into an SVG, and prints the
 * numbers it computed underneath. Nothing is stored: move a control and the
 * whole thing is recomputed and redrawn from the data block in the .qmd.
 */
'use strict';

const W = {};


/* In Reveal's print mode (?print-pdf, the PDF export) nobody can move a control,
 * so each figure opens in its finished state: the tree fully grown, all fourteen
 * tests run, every box counted, the searched line found. */
const PRINT = /print-pdf/.test(location.search);   // read from the URL: the widgets boot before Reveal adds its html class
/* ------------------------------------------------------------------ Part I */

/* The ten houses, before any line is drawn. Prices are draggable, so the
 * question "which line?" can be asked of a cloud the class has just moved. */
W['houses-scatter'] = host => {
  const h = D.houses10;
  const price = h.price.slice();
  const { fig, out } = UI.layout(host);

  function draw() {
    const p = new Plot({
      w: 620, h: 333, xlim: [1000, 2550], ylim: [150, 440],
      title: 'Ten recent home sales', xlabel: 'Area (square feet)',
      ylabel: 'Selling price ($1,000s)',
    });
    h.area.forEach((a, i) => p.dot(a, price[i], { r: 8, color: C.blue, cls: 'drag' }));
    UI.draggable(p, (dx, dy) => {
      let best = null, bd = 1e9;
      h.area.forEach((a, i) => {
        const d = Math.hypot((a - dx) / 1550, (dy - price[i]) / 290);
        if (d < bd) { bd = d; best = i; }
      });
      return bd < 0.06 ? best : null;
    }, (i, dx, dy) => { price[i] = clamp(Math.round(dy), 150, 440); draw(); });
    fig.replaceChildren(p.node);
    const spread = Math.max(...price) - Math.min(...price);
    UI.readout(out, [
      { key: 'houses', value: price.length },
      { key: 'price range', value: `${Math.min(...price)}–${Math.max(...price)}`, note: `spread ${spread}`, color: C.blue },
      { key: 'area range', value: `${Math.min(...h.area)}–${Math.max(...h.area)}`, color: C.muted },
    ]);
  }
  draw();
};

/* Least squares on the ten houses: drag a price and watch the line, the
 * residuals and the sum of their squares move with it. */
W['least-squares'] = host => {
  const h = D.houses10;
  const price = h.price.slice();
  let showResiduals = true;
  const { ctl, fig, out } = UI.layout(host);

  UI.toggle(ctl, { label: 'show the residuals', value: true, onInput: v => { showResiduals = v; draw(); } });
  UI.button(ctl, { label: 'reset the prices', onClick: () => { h.price.forEach((v, i) => { price[i] = v; }); draw(); } });

  function draw() {
    const f = S.fit(h.area, price);
    const p = new Plot({
      w: 620, h: 333, xlim: [1000, 2550], ylim: [150, 440],
      title: 'The least-squares line, and the ten residuals',
      xlabel: 'Area (square feet)', ylabel: 'Selling price ($1,000s)',
    });
    const xs = [1000, 2550];
    p.path(xs.map(x => [x, f.intercept + f.slope * x]), { color: C.rose, width: 2.8 });
    if (showResiduals) {
      h.area.forEach((a, i) => p.segment(a, price[i], a, f.predicted[i], { color: C.faint, dash: '5 4', width: 1.6 }));
    }
    h.area.forEach((a, i) => p.dot(a, price[i], { r: 8, color: C.blue }));
    const at = h.predict_at;
    p.star(at, f.intercept + f.slope * at, { r: 12, color: C.amber });
    p.legend([
      { color: C.rose, line: true, label: `price = ${fmt(f.intercept, 2)} + ${fmt(f.slope, 5)} × area` },
      { color: C.amber, label: `${at} sq ft → $${Math.round((f.intercept + f.slope * at) * 1000).toLocaleString()}` },
    ], { at: 'top-left' });
    UI.draggable(p, (dx, dy) => {
      let best = null, bd = 1e9;
      h.area.forEach((a, i) => {
        const d = Math.hypot((a - dx) / 1550, (dy - price[i]) / 290);
        if (d < bd) { bd = d; best = i; }
      });
      return bd < 0.06 ? best : null;
    }, (i, dx, dy) => { price[i] = clamp(Math.round(dy), 150, 440); draw(); });
    fig.replaceChildren(p.node);
    UI.readout(out, [
      { key: 'slope β₁', value: fmt(f.slope, 5), note: `$${fmt(f.slope * 1000, 2)} per sq ft`, color: C.cyan2 },
      { key: 'intercept β₀', value: fmt(f.intercept, 3), color: C.blue },
      { key: 'SSE', value: fmt(f.ssRes, 0), note: 'no line does better', color: C.rose },
      { key: 'R²', value: fmt(f.r2, 3), color: C.teal },
    ]);
  }
  draw();
};

/* The four-house example, worked by hand on the slide. Editing a price
 * re-derives the slope, the intercept, both sums of squares and all three
 * goodness-of-fit numbers. */
W['four-houses'] = host => {
  const h = D.houses4;
  const price = h.price.slice();
  const { ctl, fig, out } = UI.layout(host);

  const boxes = h.size.map((s, i) => UI.number(ctl, {
    label: `${s} m²`, min: 1, max: 12, step: 0.1, value: price[i], width: '4.2em',
    onInput: v => { price[i] = v; draw(); },
  }));
  UI.button(ctl, { label: 'reset', onClick: () => { h.price.forEach((v, i) => { price[i] = v; boxes[i].set(v); }); draw(); } });

  function draw() {
    const f = S.fit(h.size, price);
    const mx = mean(h.size), my = mean(price);
    const p = new Plot({
      w: 600, h: 323, xlim: [80, 270], ylim: [Math.min(1, ...price) - 0.6, Math.max(8, ...price) + 0.6],
      title: 'Four houses, their line, and their residuals',
      xlabel: 'Size (m²)', ylabel: 'Price (million baht)',
    });
    p.path([[80, f.intercept + f.slope * 80], [270, f.intercept + f.slope * 270]], { color: C.rose, width: 2.8 });
    h.size.forEach((s, i) => {
      p.segment(s, price[i], s, f.predicted[i], { color: C.faint, dash: '5 4', width: 1.6 });
      p.text(p.x(s) + 9, (p.y(price[i]) + p.y(f.predicted[i])) / 2 + 4,
        (f.residuals[i] >= 0 ? '+' : '') + fmt(f.residuals[i], 2),
        { size: 12, color: C.muted, inPlot: true });
      p.dot(s, price[i], { r: 9, color: C.blue });
    });
    p.dot(mx, my, { r: 8, color: C.teal });
    p.callout(mx, my, -14, -26, `point of averages (${fmt(mx, 0)}, ${fmt(my, 2)})`, { color: C.teal, size: 12 });
    fig.replaceChildren(p.node);
    UI.readout(out, [
      { key: 'slope', value: fmt(f.slope, 4), color: C.cyan2 },
      { key: 'intercept', value: fmt(f.intercept, 3), color: C.blue },
      { key: 'Σ residuals', value: fmt(sum(f.residuals), 3), note: 'always zero', color: C.muted },
      { key: 'R²', value: fmt(f.r2, 3), color: C.teal },
      { key: 'RMSE', value: fmt(f.rmse, 3), color: C.violet },
      { key: 'MAE', value: fmt(f.mae, 3), color: C.amber },
    ]);
  }
  draw();
};

/* R² as the two sums of squares, side by side. */
W['r2-bars'] = host => {
  const h = D.houses4;
  const price = h.price.slice();
  const { ctl, fig, out } = UI.layout(host);

  UI.slider(ctl, {
    label: 'the third house sold for', min: 3, max: 9, step: 0.1, value: price[2],
    format: v => `${fmt(v, 1)} M฿`,
    onInput: v => { price[2] = v; draw(); },
  });

  function draw() {
    const f = S.fit(h.size, price);
    const top = Math.max(f.ssTot, 1) * 1.25;
    const p = new Plot({
      w: 520, h: 280, xlim: [-0.6, 1.6], ylim: [0, top],
      title: `R² = 1 − ${fmt(f.ssRes, 2)} / ${fmt(f.ssTot, 2)} = ${fmt(f.r2, 3)}`,
      ylabel: 'Total squared error', xticks: [0, 1],
      xfmt: t => (t === 0 ? 'Guess the average' : 'Use the line'),
    });
    p.bar(0, f.ssTot, 0.55, { color: C.faint });
    p.bar(1, f.ssRes, 0.55, { color: C.teal });
    p.text(p.x(0), p.y(f.ssTot) - 9, fmt(f.ssTot, 2), { anchor: 'middle', size: 14, weight: 700, color: C.navy, inPlot: true });
    p.text(p.x(1), p.y(f.ssRes) - 9, fmt(f.ssRes, 2), { anchor: 'middle', size: 14, weight: 700, color: C.navy, inPlot: true });
    p.text(p.x(0), p.y(0) + 36, 'SS_tot', { anchor: 'middle', size: 12, color: C.muted, inPlot: true });
    p.text(p.x(1), p.y(0) + 36, 'SS_res', { anchor: 'middle', size: 12, color: C.muted, inPlot: true });
    fig.replaceChildren(p.node);
    UI.readout(out, [
      { key: 'SS_tot', value: fmt(f.ssTot, 2), note: 'guessing the average', color: C.muted },
      { key: 'SS_res', value: fmt(f.ssRes, 2), note: 'using the line', color: C.teal },
      { key: 'R²', value: fmt(f.r2, 3), note: `${pct(f.r2, 0)} of the error removed`, color: C.blue },
    ]);
  }
  draw();
};

/* The residual plot, and the two shapes that say a line was the wrong model.
 * The relationship itself can be switched, so the class sees each pattern. */
W['residuals'] = host => {
  const h = D.houses10;
  let shape = 'real';
  const { ctl, fig, out } = UI.layout(host);

  UI.choice(ctl, {
    label: 'the data is',
    value: 'real',
    options: [
      { value: 'real', label: 'the ten houses' },
      { value: 'curved', label: 'curved' },
      { value: 'funnel', label: 'a widening spread' },
    ],
    onInput: v => { shape = v; draw(); },
  });

  function series() {
    if (shape === 'real') return h.price.slice();
    const lo = Math.min(...h.area), hi = Math.max(...h.area);
    return h.area.map((a, i) => {
      const t = (a - lo) / (hi - lo);
      const wobble = [1, -1, 1, -1, 1, -1, 1, -1, 1, -1][i];
      if (shape === 'curved') return 200 + 320 * t - 240 * t * t + 8 * wobble;
      return 200 + 120 * t + wobble * (8 + 70 * t);
    });
  }

  function draw() {
    const price = series();
    const f = S.fit(h.area, price);
    const lo = Math.min(...f.residuals), hi = Math.max(...f.residuals);
    const pad = Math.max(12, (hi - lo) * 0.25);
    const p = new Plot({
      w: 620, h: 333, xlim: [Math.min(...f.predicted) - 12, Math.max(...f.predicted) + 12],
      ylim: [lo - pad, hi + pad],
      title: 'Residual plot — look for structureless noise',
      xlabel: 'Predicted price', ylabel: 'Residual',
    });
    p.hline(0, { color: C.rose, width: 2 });
    h.area.forEach((a, i) => {
      p.segment(f.predicted[i], 0, f.predicted[i], f.residuals[i], { color: C.grid, width: 1.4 });
      p.dot(f.predicted[i], f.residuals[i], { r: 7.5, color: C.blue });
    });
    fig.replaceChildren(p.node);
    const verdicts = {
      real: ['a line is adequate', 'Nothing systematic is left for a better line to pick up.', C.teal],
      curved: ['the model is wrong', 'The residuals arch: the relationship is not straight.', C.amber],
      funnel: ['the spread is not constant', 'The errors grow with the prediction, so one RMSE does not describe them.', C.rose],
    }[shape];
    UI.readout(out, [
      { key: 'R²', value: fmt(f.r2, 3), color: C.blue },
      { key: 'RMSE', value: fmt(f.rmse, 1), color: C.violet },
      { key: 'verdict', value: verdicts[0], note: verdicts[1], color: verdicts[2] },
    ]);
  }
  draw();
};


/* Correlation: a cloud of forty points whose correlation is set by a slider,
 * with the coefficient recomputed from the points actually drawn. The points
 * come from a fixed pseudo-random sequence, so the same r always gives the
 * same cloud. */
W['correlation'] = host => {
  let target = 0.8;
  const { ctl, fig, out } = UI.layout(host);

  /* mulberry32: small, deterministic, good enough for a picture */
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const next = rng(888102);
  const base = [];
  for (let i = 0; i < 40; i++) {           // two independent standard normals
    const u = Math.max(next(), 1e-9), v = next();
    const m = Math.sqrt(-2 * Math.log(u));
    base.push([m * Math.cos(2 * Math.PI * v), m * Math.sin(2 * Math.PI * v)]);
  }

  UI.slider(ctl, {
    label: 'how strongly x and y move together', min: -1, max: 1, step: 0.05, value: target,
    format: v => (v > 0 ? '+' : '') + fmt(v, 2), onInput: v => { target = v; draw(); },
  });
  UI.choice(ctl, {
    value: 'pos',
    options: [{ value: 'pos', label: 'positive' }, { value: 'none', label: 'none' }, { value: 'neg', label: 'negative' }],
    onInput: v => {
      target = v === 'pos' ? 0.8 : v === 'neg' ? -0.8 : 0;
      ctl.querySelector('input[type=range]').value = target;
      ctl.querySelector('.c-val').textContent = (target > 0 ? '+' : '') + fmt(target, 2);
      draw();
    },
  });

  function draw() {
    const k = Math.sqrt(Math.max(0, 1 - target * target));
    const pts = base.map(([z1, z2]) => [50 + 15 * z1, 50 + 15 * (target * z1 + k * z2)]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const mx = mean(xs), my = mean(ys);
    const sxy = sum(xs.map((x, i) => (x - mx) * (ys[i] - my)));
    const sxx = sum(xs.map(x => (x - mx) ** 2)), syy = sum(ys.map(y => (y - my) ** 2));
    const r = sxy / Math.sqrt(sxx * syy);
    const word = Math.abs(r) < 0.2 ? 'no clear relationship'
      : (r > 0 ? 'positive' : 'negative') + (Math.abs(r) > 0.7 ? ', strong' : ', moderate');
    const color = Math.abs(r) < 0.2 ? C.muted : r > 0 ? C.teal : C.rose;
    const p = new Plot({
      w: 600, h: 323, xlim: [0, 100], ylim: [0, 100],
      title: `r = ${(r > 0 ? '+' : '') + fmt(r, 2)} — ${word}`,
      xlabel: 'x  (advertising spend)', ylabel: 'y  (sales)',
    });
    pts.forEach(q => p.dot(q[0], q[1], { r: 6.5, color }));
    if (Math.abs(r) >= 0.2) {
      const f = S.fit(xs, ys);
      p.path([[0, f.intercept], [100, f.intercept + 100 * f.slope]], { color: C.faint, width: 1.6, dash: '6 5' });
    }
    fig.replaceChildren(p.node);
    UI.readout(out, [
      { key: 'r', value: (r > 0 ? '+' : '') + fmt(r, 3), color },
      { key: 'direction', value: r > 0.2 ? 'x up, y tends up' : r < -0.2 ? 'x up, y tends down' : 'none visible', color: C.navy },
      { key: 'r²', value: fmt(r * r, 2), note: 'the share of y explained by x, on the R² slide', color: C.blue },
    ]);
  }
  draw();
};


/* Choosing the tree's first question, in counts rather than bits: pick an
 * attribute and see how the fourteen days fall into its groups, how many each
 * group already gets right by majority, and whether any group is pure. */
W['split-counts'] = host => {
  const label = D.golf.label;
  /* data-branch="Sunny" runs the same search inside one branch of the root:
   * only that branch's days, only the features not yet used */
  const branch = host.dataset.branch || null;
  const rows = branch ? D.golf.rows.filter(r => r.outlook === branch) : D.golf.rows;
  const attributes = branch ? D.golf.attributes.filter(a => a !== 'outlook') : D.golf.attributes;
  const n = rows.length;
  const yesAll = rows.filter(r => r[label] === 'Yes').length;
  function summary(attribute) {
    const groups = [];
    S.splitOn(rows, attribute).forEach((g, value) => {
      const yes = g.filter(r => r[label] === 'Yes').length;
      groups.push({ value, n: g.length, yes, no: g.length - yes });
    });
    const settled = sum(groups.map(g => Math.max(g.yes, g.no)));
    const pure = groups.filter(g => g.yes === 0 || g.no === 0).length;
    return { groups, settled, pure };
  }
  let picked = host.dataset.pick || (branch ? S.bestSplit(rows, attributes, label).attribute : 'outlook');
  const { ctl, fig, out } = UI.layout(host);

  UI.choice(ctl, {
    label: 'ask about',
    value: picked,
    options: attributes.map(a => ({ value: a, label: a })),
    onInput: v => { picked = v; draw(); },
  });


  function draw() {
    const s = summary(picked);
    const p = new Plot({
      w: 600, h: 300, xlim: [-0.6, s.groups.length - 0.4], ylim: [0, branch ? 4.6 : 8.6],
      title: branch
        ? `${branch} days (${yesAll} Yes / ${n - yesAll} No), split on ${picked}: ${s.settled} of ${n} settled`
        : `Split on ${picked}: ${s.settled} of ${n} days settled by one question`,
      ylabel: 'Days',
      xticks: s.groups.map((_, i) => i), xfmt: t => `${s.groups[t].value} (${s.groups[t].n})`,
      yticks: branch ? [0, 1, 2, 3, 4] : [0, 2, 4, 6, 8],
    });
    s.groups.forEach((g, i) => {
      // stacked: No on the bottom in rose, Yes on top in teal
      p.bar(i, g.no, 0.55, { color: C.rose });
      if (g.yes) {
        const y0 = p.y(g.no), y1 = p.y(g.no + g.yes);
        p.addIn('rect', { x: p.x(i - 0.275), y: y1, width: p.x(i + 0.275) - p.x(i - 0.275), height: y0 - y1, rx: 2, fill: C.teal });
      }
      const pure = g.yes === 0 || g.no === 0;
      p.text(p.x(i), p.y(g.n) - 9, `${g.yes} Yes / ${g.no} No${pure ? ' — pure' : ''}`,
        { anchor: 'middle', size: 12, weight: pure ? 800 : 400, color: pure ? C.navy : C.muted, inPlot: true });
    });
    p.legend([{ color: C.teal, label: 'played' }, { color: C.rose, label: 'did not play' }], { at: 'top-right' });
    fig.replaceChildren(p.node);

    const all = attributes.map(a => ({ a, ...summary(a) }));
    const best = all.reduce((x, y) => (y.settled > x.settled || (y.settled === x.settled && y.pure > x.pure) ? y : x));
    UI.readout(out, [
      { key: 'groups', value: s.groups.length, color: C.muted },
      { key: 'settled by majority', value: `${s.settled} / ${n}`, color: C.blue },
      { key: 'pure groups', value: s.pure, note: s.pure ? 'a branch that needs no further question' : 'every group is still mixed', color: s.pure ? C.teal : C.amber },
      { key: branch ? 'best next question' : 'best first question', value: best.a, note: `${best.settled} settled, ${best.pure} pure`, color: C.navy },
    ]);
  }
  draw();
};


/* The decision tree, drawn, as the algorithm grows it. A step slider runs the
 * procedure on the fourteen days: all days in one group; the best first
 * question and its branches; the same search again inside each mixed branch;
 * stop when every branch is pure. data-step="full" draws the finished tree
 * with no slider. Every count on the drawing is computed from the table. */
W['tree-grow'] = host => {
  const { rows, attributes, label } = D.golf;
  const fixed = host.dataset.step === 'full';
  const forced = host.dataset.step != null && !fixed ? +host.dataset.step : null;   // print: one page per step
  let step = fixed || (PRINT && forced == null) ? 99 : forced != null ? forced : 0;
  const { ctl, fig, out } = UI.layout(host);

  /* grow the tree to a given depth, keeping every node's rows for the counts */
  function grow(rs, attrs, depth, maxDepth) {
    const yes = rs.filter(r => r[label] === 'Yes').length;
    const node = { rows: rs, yes, no: rs.length - yes, depth };
    const pure = yes === 0 || yes === rs.length;
    if (pure || !attrs.length || depth >= maxDepth) {
      node.leaf = pure ? (yes ? 'Yes' : 'No') : null;     // null: mixed, not yet split
      if (!pure && !attrs.length) node.leaf = S.majority(rs.map(r => r[label]));
      return node;
    }
    const best = S.bestSplit(rs, attrs, label).attribute;   // the same rule as the split-counts slide
    node.attribute = best;
    node.children = [];
    S.splitOn(rs, best).forEach((group, value) => {
      node.children.push({ value, node: grow(group, attrs.filter(a => a !== best), depth + 1, maxDepth) });
    });
    return node;
  }

  const fullDepth = (function depthOf(n) {
    return n.children ? 1 + Math.max(...n.children.map(c => depthOf(c.node))) : 0;
  })(grow(rows, attributes, 0, 99));

  if (!fixed && forced == null) {
    UI.slider(ctl, {
      label: 'step', min: 0, max: fullDepth, step: 1, value: PRINT ? fullDepth : 0,
      format: v => ['all days in one group', 'the first question', 'inside the mixed branches', 'every branch pure'][Math.min(v, 3)] || String(v),
      onInput: v => { step = v; draw(); },
    });
  }

  function draw() {
    const root = grow(rows, attributes, 0, step);
    /* layout: leaves left to right, parents centred over their children */
    let nextX = 0;
    const big = fixed;                       // the finished tree has the whole slide
    const W = big ? 1000 : 660, H = big ? 430 : 360, top = big ? 24 : 30, levelGap = big ? 160 : 118;
    const leafGap = W / (big ? 5.2 : 5.6);
    const f = big ? 1.35 : 1;                // font and box scale
    (function place(n) {
      if (!n.children) { n.x = (nextX++ + 0.5) * leafGap + 10; return; }
      n.children.forEach(c => place(c.node));
      n.x = mean(n.children.map(c => c.node.x));
    })(root);
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'wfig', preserveAspectRatio: 'xMidYMid meet' });
    const g = svgEl('g'); svg.appendChild(g);
    const text = (x, y, str, o = {}) => {
      const n = svgEl('text', { x, y, fill: o.color || C.navy, 'font-size': o.size || 12,
        'font-weight': o.weight || 400, 'text-anchor': o.anchor || 'middle', 'font-family': 'inherit' });
      n.textContent = str; g.appendChild(n); return n;
    };
    const box = (x, y, w, h, fill, r = 8) => g.appendChild(svgEl('rect', { x: x - w / 2, y, width: w, height: h, rx: r, fill }));

    (function render(n, parentX, parentY, edge) {
      const y = top + n.depth * levelGap;
      if (parentX != null) {
        g.appendChild(svgEl('line', { x1: parentX, y1: parentY, x2: n.x, y2: y, stroke: C.faint, 'stroke-width': 2 }));
        const mx = (parentX + n.x) / 2, my = (parentY + y) / 2;
        box(mx, my - 9 * f, (String(edge).length * 7 + 14) * f, 18 * f, C.white, 4);
        text(mx, my + 4 * f, edge, { size: 11.5 * f, weight: 700, color: C.muted });
      }
      const bh = 46 * f;
      if (n.children) {
        box(n.x, y, 128 * f, bh, C.navy, 8 * f);
        text(n.x, y + 19 * f, `${n.attribute}?`, { size: 13.5 * f, weight: 800, color: C.white });
        text(n.x, y + 36 * f, `${n.yes} Yes / ${n.no} No`, { size: 11 * f, color: '#BFD0EC' });
        n.children.forEach(c => render(c.node, n.x, y + bh, c.value));
      } else if (n.leaf) {
        box(n.x, y, 110 * f, bh, n.leaf === 'Yes' ? C.teal : C.rose, 8 * f);
        text(n.x, y + 19 * f, n.leaf === 'Yes' ? 'play' : 'do not play', { size: 13 * f, weight: 800, color: C.white });
        text(n.x, y + 36 * f, `${n.yes} Yes / ${n.no} No · pure`, { size: 10.5 * f, color: C.white });
      } else {
        box(n.x, y, 118 * f, bh, C.amber, 8 * f);
        text(n.x, y + 19 * f, 'mixed — ask next', { size: 12.5 * f, weight: 800, color: C.white });
        text(n.x, y + 36 * f, `${n.yes} Yes / ${n.no} No`, { size: 11 * f, color: C.white });
      }
    })(root, null, null, null);
    fig.replaceChildren(svg);

    const leaves = [], mixed = [];
    (function walk(n) { if (n.children) n.children.forEach(c => walk(c.node)); else (n.leaf ? leaves : mixed).push(n); })(root);
    const notes = [
      `One group of ${rows.length} days, ${root.yes} Yes and ${root.no} No. It is mixed, so the algorithm looks for a question that sorts it.`,
      `Each of the four features is tried as the first question; <b>${root.attribute || 'outlook'}</b> sorts the days best, so it becomes the root and the days go down its branches. A pure branch is finished; a mixed one is not.`,
      `The same search runs again inside each mixed branch, on that branch's own days only, with the features not yet used. Each is settled by one more question.`,
    ];
    const done = mixed.length === 0;
    UI.note(out, (done && step >= fullDepth ? `<b>Every branch ends in a pure group, so the growing stops.</b> ${leaves.length} leaves, ${fullDepth} questions deep. The drawing is the model: to predict a new day, start at the root and follow its answers.`
      : notes[Math.min(step, notes.length - 1)]) + (mixed.length ? ` &nbsp;<b>${mixed.length}</b> mixed group${mixed.length > 1 ? 's' : ''} still to split.` : ''));
  }
  draw();
};


/* How the algorithm finds the line. Set any line by hand and read its total
 * squared miss; then let the search run: each step nudges slope and intercept
 * in the direction that shrinks the total, and it stops when no nudge helps.
 * The search works on standardized x so one step size serves both numbers. */
W['line-search'] = host => {
  const h = D.houses10;
  const xs = h.area, ys = h.price;
  const mx = mean(xs), sx = Math.sqrt(mean(xs.map(x => (x - mx) ** 2)));
  const best = S.fit(xs, ys);
  const atEnd = host.dataset.line ? host.dataset.line === 'end' : PRINT;   // print: the flat start, then the answer
  let b0 = atEnd ? best.intercept : 250, b1 = atEnd ? best.slope : 0;    // a deliberately poor start: a flat line
  let timer = null, steps = 0;
  const { ctl, fig, out } = UI.layout(host);

  const sse = (i, s) => sum(xs.map((x, k) => (ys[k] - (i + s * x)) ** 2));

  const sInt = UI.slider(ctl, { label: 'intercept', min: -150, max: 400, step: 1, value: b0, format: v => fmt(v, 0), onInput: v => { stop(); b0 = v; draw(); } });
  const sSlp = UI.slider(ctl, { label: 'slope', min: -0.05, max: 0.25, step: 0.001, value: b1, format: v => fmt(v, 3), onInput: v => { stop(); b1 = v; draw(); } });
  const run = UI.button(ctl, { label: 'let the algorithm search', onClick: () => (timer ? stop() : start()) });
  UI.button(ctl, { label: 'start again', onClick: () => { stop(); b0 = 250; b1 = 0; steps = 0; draw(); } });

  function stop() { if (timer) { clearInterval(timer); timer = null; run.textContent = 'let the algorithm search'; } }
  function start() {
    run.textContent = 'stop';
    timer = setInterval(() => {
      /* one step of gradient descent in standardized x: z = (x - mx) / sx */
      let a = b0 + b1 * mx, c = b1 * sx;    // the same line as y = a + c z
      let ga = 0, gc = 0;
      xs.forEach((x, k) => { const z = (x - mx) / sx, e = ys[k] - (a + c * z); ga -= 2 * e; gc -= 2 * e * z; });
      const before = sse(b0, b1);
      a -= 0.05 * ga / xs.length * 5; c -= 0.05 * gc / xs.length * 5;
      b1 = c / sx; b0 = a - b1 * mx; steps++;
      draw();
      if (Math.abs(before - sse(b0, b1)) < 1e-4 || steps > 400) stop();
    }, 70);
  }

  function draw() {
    sInt.set(Math.round(b0)); sSlp.set(+b1.toFixed(3));
    const total = sse(b0, b1);
    const converged = Math.abs(total - best.ssRes) < 0.5;
    const p = new Plot({
      w: 620, h: 333, xlim: [1000, 2550], ylim: [100, 480],
      title: converged ? 'No move makes the total smaller — this is the line' : `A line, and what it misses: total squared miss ${fmt(total, 0)}`,
      xlabel: 'Area (square feet)', ylabel: 'Selling price ($1,000s)',
    });
    p.path([[1000, best.intercept + best.slope * 1000], [2550, best.intercept + best.slope * 2550]], { color: C.grid, width: 2, dash: '6 5' });
    xs.forEach((x, k) => p.segment(x, ys[k], x, b0 + b1 * x, { color: C.faint, dash: '5 4', width: 1.6 }));
    p.path([[1000, b0 + b1 * 1000], [2550, b0 + b1 * 2550]], { color: converged ? C.rose : C.amber, width: 3 });
    xs.forEach((x, k) => p.dot(x, ys[k], { r: 8, color: C.blue }));
    fig.replaceChildren(p.node);
    UI.readout(out, [
      { key: 'this line', value: `${fmt(b0, 1)} + ${fmt(b1, 4)} × area`, color: converged ? C.rose : C.amber },
      { key: 'total squared miss', value: fmt(total, 0), color: C.navy },
      { key: 'smallest possible', value: fmt(best.ssRes, 0), note: 'the least-squares line', color: C.teal },
      { key: 'search steps', value: steps, color: C.muted },
    ]);
  }
  draw();
};

/* ----------------------------------------------------------------- Part II */

/* Entropy and Gini across every possible mix, with the golf table's own point
 * on the curve and a slider that moves it. */
W['entropy-gini'] = host => {
  const rows = D.golf.rows, label = D.golf.label;
  const total = rows.length;
  const yesInData = rows.filter(r => r[label] === 'Yes').length;
  let yes = yesInData;
  const { ctl, fig, out } = UI.layout(host);

  UI.slider(ctl, {
    label: `days golf was played, of ${total}`, min: 0, max: total, step: 1, value: yes,
    format: v => `${v} Yes / ${total - v} No`,
    onInput: v => { yes = v; draw(); },
  });

  function draw() {
    const labels = [].concat(new Array(yes).fill('Yes'), new Array(total - yes).fill('No'));
    const e = S.entropy(labels), g = S.gini(labels);
    const share = yes / total;
    const p = new Plot({
      w: 600, h: 323, xlim: [0, 1], ylim: [0, 1.08],
      title: 'Both measures peak at a 50/50 mix and vanish on a pure group',
      xlabel: 'Share of the group that played', ylabel: 'Impurity',
    });
    const grid = [];
    for (let i = 0; i <= 200; i++) grid.push(i / 200);
    p.path(grid.map(q => [q, S.entropy([].concat(new Array(Math.round(q * 1000)).fill('Yes'),
      new Array(1000 - Math.round(q * 1000)).fill('No')))]), { color: C.violet, width: 2.8 });
    p.path(grid.map(q => [q, S.gini([].concat(new Array(Math.round(q * 1000)).fill('Yes'),
      new Array(1000 - Math.round(q * 1000)).fill('No')))]), { color: C.teal, width: 2.8 });
    p.dot(share, e, { r: 8.5, color: C.rose });
    p.dot(share, g, { r: 8.5, color: C.rose });
    p.callout(share, e, share > 0.5 ? -18 : 18, -24, `${yes} Yes / ${total - yes} No → ${fmt(e, 3)}`, { size: 12 });
    p.legend([
      { color: C.violet, line: true, label: 'Entropy  (max 1)' },
      { color: C.teal, line: true, label: 'Gini impurity  (max 0.5)' },
    ], { at: 'bottom-right' });
    fig.replaceChildren(p.node);
    UI.readout(out, [
      { key: 'entropy', value: fmt(e, 3), note: e === 0 ? 'pure — nothing to ask' : e > 0.99 ? 'as mixed as it gets' : '', color: C.violet },
      { key: 'Gini', value: fmt(g, 3), color: C.teal },
      { key: 'the data', value: `${yesInData} / ${total - yesInData}`, note: `entropy ${fmt(S.entropy(rows.map(r => r[label])), 3)}`, color: C.muted },
    ]);
  }
  draw();
};

/* Information gain for every attribute, computed from the golf table, with the
 * chosen attribute's branches shown beneath. */
W['information-gain'] = host => {
  const { rows, attributes, label } = D.golf;
  const scored = S.gains(rows, attributes, label);
  let picked = scored[0].attribute;
  const { ctl, fig, out } = UI.layout(host);

  UI.choice(ctl, {
    label: 'split on',
    value: picked,
    options: attributes.map(a => ({ value: a, label: a })),
    onInput: v => { picked = v; draw(); },
  });

  function draw() {
    const top = Math.max(...scored.map(s => s.gain)) * 1.35;
    const p = new Plot({
      w: 600, h: 323, xlim: [0, top], ylim: [-0.7, scored.length - 0.3],
      title: 'Every attribute tried — the largest drop becomes the root',
      xlabel: 'Information gain (bits)',
      yticks: scored.map((_, i) => i),
      yfmt: t => scored[scored.length - 1 - t].attribute,
      grid: false,
    });
    scored.forEach((s, i) => {
      const row = scored.length - 1 - i;
      const chosen = s.attribute === picked;
      const y0 = p.y(row - 0.3), y1 = p.y(row + 0.3);
      p.addIn('rect', {
        x: p.x(0), y: Math.min(y0, y1), width: p.x(s.gain) - p.x(0),
        height: Math.abs(y1 - y0), rx: 2,
        fill: chosen ? C.cyan2 : C.faint,
      });
      p.text(p.x(s.gain) + 8, p.y(row) + 5, fmt(s.gain, 3),
        { size: 13, weight: 700, color: chosen ? C.navy : C.muted, inPlot: true });
    });
    fig.replaceChildren(p.node);

    const before = S.entropy(rows.map(r => r[label]));
    const parts = [];
    let after = 0;
    S.splitOn(rows, picked).forEach((group, value) => {
      const ls = group.map(r => r[label]);
      const e = S.entropy(ls);
      after += (group.length / rows.length) * e;
      parts.push(`<b>${value}</b> · ${group.length} rows · ${ls.filter(l => l === 'Yes').length} Yes / `
        + `${ls.filter(l => l === 'No').length} No · entropy ${fmt(e, 3)}`);
    });
    UI.note(out, `Splitting on <b>${picked}</b>: ${parts.join(' &nbsp;·&nbsp; ')}<br>`
      + `Entropy before ${fmt(before, 3)}, weighted entropy after ${fmt(after, 3)}, `
      + `so the gain is <b>${fmt(before - after, 3)}</b> bits.`);
  }
  draw();
};

/* The jury theorem: how many trees, each how good. */
W['jury'] = host => {
  const f = D.forest;
  let p0 = f.p, n = 3;
  const { ctl, fig, out } = UI.layout(host);

  UI.slider(ctl, {
    label: 'each tree is right', min: 0.3, max: 0.9, step: 0.01, value: p0,
    format: v => pct(v, 0), onInput: v => { p0 = v; draw(); },
  });
  UI.slider(ctl, {
    label: 'trees in the forest', min: 1, max: f.max_trees, step: 2, value: n,
    format: v => String(v), onInput: v => { n = v; draw(); },
  });

  function draw() {
    const sizes = [];
    for (let k = 1; k <= f.max_trees; k += 2) sizes.push(k);
    const plot = new Plot({
      w: 600, h: 323, xlim: [0, f.max_trees], ylim: [0, 1.04],
      title: 'A crowd of mediocre trees — but only above 50%',
      xlabel: 'Number of trees in the forest', ylabel: 'P(majority vote correct)',
    });
    plot.hline(0.5, { color: C.faint, width: 1.4, dash: '6 5' });
    f.compare_p.forEach((q, i) => {
      const color = [C.teal, C.cyan2, C.rose][i] || C.muted;
      const curve = sizes.map(k => [k, S.jury(k, q)]);
      plot.path(curve, { color, width: 2.2, opacity: 0.45 });
      plot.text(plot.x(f.max_trees) - 6, plot.y(curve[curve.length - 1][1]) - 7,
        pct(q, 0), { anchor: 'end', size: 12, weight: 700, color, inPlot: true });
    });
    const live = sizes.map(k => [k, S.jury(k, p0)]);
    plot.path(live, { color: C.blue, width: 3 });
    const here = S.jury(n, p0);
    plot.dot(n, here, { r: 9, color: C.amber });
    plot.callout(n, here, 30, n > f.max_trees / 2 ? 26 : -26,
      `${n} trees → ${fmt(here, 3)}`, { size: 13 });
    fig.replaceChildren(plot.node);
    UI.readout(out, [
      { key: 'each tree', value: pct(p0, 0), color: C.muted },
      { key: `${n} trees vote`, value: fmt(here, 4), color: C.blue },
      {
        key: 'the crowd',
        value: here > p0 ? 'beats one tree' : here < p0 ? 'is worse than one tree' : 'matches one tree',
        note: p0 <= 0.5 ? 'below 50% the vote amplifies the error' : '',
        color: here > p0 ? C.teal : C.rose,
      },
    ]);
  }
  draw();
};

/* ---------------------------------------------------- probability models */

/* The sigmoid, with both coefficients on sliders and a weight to score. */
W['sigmoid'] = host => {
  const lg = D.logistic;
  let b0 = lg.b0, b1 = lg.b1, at = lg.mark_weights[0];
  const { ctl, fig, out } = UI.layout(host);

  UI.slider(ctl, { label: 'b₀', min: -14, max: 0, step: 0.25, value: b0, format: v => fmt(v, 2), onInput: v => { b0 = v; draw(); } });
  UI.slider(ctl, { label: 'b₁', min: 0.01, max: 0.3, step: 0.005, value: b1, format: v => fmt(v, 3), onInput: v => { b1 = v; draw(); } });
  UI.number(ctl, { label: 'weight (kg)', min: 30, max: 160, step: 1, value: at, width: '4.6em', onInput: v => { at = v; draw(); } });

  function draw() {
    const p = new Plot({
      w: 600, h: 323, xlim: [30, 160], ylim: [-0.04, 1.04],
      title: 'p = 1 / (1 + e^−(b₀ + b₁ × weight))',
      xlabel: 'Patient weight (kg)', ylabel: 'P(obese)',
    });
    const curve = [];
    for (let wt = 30; wt <= 160; wt += 0.5) curve.push([wt, S.sigmoid(b0 + b1 * wt)]);
    p.hline(0.5, { color: C.grid, width: 1.4 });
    p.path(curve, { color: C.violet, width: 3 });
    lg.mark_weights.forEach(wt => {
      const v = S.sigmoid(b0 + b1 * wt);
      p.dot(wt, v, { r: 7, color: C.faint });
      p.text(p.x(wt), p.y(v) - 12, `${wt} kg`, { anchor: 'middle', size: 11, color: C.muted, inPlot: true });
    });
    const here = S.sigmoid(b0 + b1 * at);
    p.vline(at, { color: C.amber, width: 1.6, dash: '5 4' });
    p.dot(at, here, { r: 10, color: C.amber });
    p.callout(at, here, at > 95 ? -34 : 34, -22, `${at} kg → ${fmt(here, 3)}`, { size: 13 });
    const midpoint = -b0 / b1;
    if (midpoint > 30 && midpoint < 160) {
      p.text(p.x(midpoint), p.y(0.5) + 20, `p = 0.5 at ${fmt(midpoint, 1)} kg`,
        { anchor: 'middle', size: 11, color: C.muted, inPlot: true });
    }
    fig.replaceChildren(p.node);
    const odds = here / (1 - here);
    UI.readout(out, [
      { key: 'p', value: fmt(here, 3), color: C.violet },
      { key: 'odds', value: `${fmt(odds, 2)} : 1`, color: C.blue },
      { key: 'log-odds', value: fmt(b0 + b1 * at, 3), note: 'the straight line itself', color: C.muted },
      { key: 'odds ratio per kg', value: fmt(Math.exp(b1), 3), note: `${pct(Math.exp(b1) - 1, 1)} higher odds`, color: C.teal },
    ]);
  }
  draw();
};

/* Naive Bayes on the golf table: pick a value of any attribute and the
 * frequencies, the likelihood and the posterior are all counted live. */
W['naive-bayes'] = host => {
  const { rows, attributes, label } = D.golf;
  let attribute = 'outlook';
  let value = 'Sunny';
  const { ctl, fig, out } = UI.layout(host);

  const valueChoice = UI.host(ctl, 'c-choice-slot');
  UI.choice(ctl, {
    label: 'attribute',
    value: attribute,
    options: attributes.map(a => ({ value: a, label: a })),
    onInput: v => { attribute = v; value = [...S.splitOn(rows, v).keys()][0]; buildValues(); draw(); },
  });
  ctl.insertBefore(valueChoice, null);

  function buildValues() {
    valueChoice.innerHTML = '';
    UI.choice(valueChoice, {
      label: 'value',
      value,
      options: [...S.splitOn(rows, attribute).keys()].map(v => ({ value: v, label: String(v) })),
      onInput: v => { value = v; draw(); },
    });
  }

  function draw() {
    const classes = [...new Set(rows.map(r => r[label]))].sort().reverse();
    const table = classes.map(c => {
      const inClass = rows.filter(r => r[label] === c);
      const withValue = inClass.filter(r => String(r[attribute]) === String(value));
      return { c, n: inClass.length, k: withValue.length };
    });
    const matching = rows.filter(r => String(r[attribute]) === String(value));
    const pValue = matching.length / rows.length;
    const posterior = table.map(t => {
      const likelihood = t.n ? t.k / t.n : 0;
      const prior = t.n / rows.length;
      return { ...t, likelihood, prior, post: pValue ? (likelihood * prior) / pValue : 0 };
    });
    const winner = posterior.reduce((a, b) => (b.post > a.post ? b : a));

    const p = new Plot({
      w: 560, h: 301, xlim: [-0.6, classes.length - 0.4], ylim: [0, 1.12],
      title: `P(class | ${attribute} = ${value})`,
      ylabel: 'Posterior probability',
      yticks: [0, 0.25, 0.5, 0.75, 1], yfmt: t => fmt(t, 2),
      xticks: classes.map((_, i) => i), xfmt: t => classes[t],
    });
    p.hline(0.5, { color: C.grid, width: 1.4 });
    posterior.forEach((t, i) => {
      p.bar(i, t.post, 0.5, { color: t === winner ? C.teal : C.faint });
      p.text(p.x(i), p.y(t.post) - 10, fmt(t.post, 3),
        { anchor: 'middle', size: 14, weight: 700, color: C.navy, inPlot: true });
    });
    fig.replaceChildren(p.node);
    /* one line per class: likelihood × prior ÷ evidence = posterior */
    UI.note(out, posterior.map(t =>
      `<b>${t.c}</b> &nbsp; ${t.k}/${t.n} × ${t.n}/${rows.length} ÷ ${fmt(pValue, 3)}`
      + ` = <b>${fmt(t.post, 3)}</b>`).join(' &nbsp;&nbsp;·&nbsp;&nbsp; ')
      + ` &nbsp;→&nbsp; the model answers <b>${winner.c}</b>.`);
  }
  buildValues();
  draw();
};

/* Laplace smoothing: the zero, and what adding one imaginary observation does. */
W['laplace'] = host => {
  const { rows, label } = D.golf;
  let alpha = 1;
  let cls = 'No';
  const { ctl, fig, out } = UI.layout(host);

  UI.slider(ctl, {
    label: 'α (imaginary observations)', min: 0, max: 3, step: 0.25, value: alpha,
    format: v => fmt(v, 2), onInput: v => { alpha = v; draw(); },
  });
  UI.choice(ctl, {
    label: 'for the class',
    value: cls,
    options: [...new Set(rows.map(r => r[label]))].sort().reverse().map(c => ({ value: c, label: c })),
    onInput: v => { cls = v; draw(); },
  });

  function draw() {
    const values = [...S.splitOn(rows, 'outlook').keys()];
    const inClass = rows.filter(r => r[label] === cls);
    const bars = values.map(v => {
      const k = inClass.filter(r => r.outlook === v).length;
      return { v, k, plain: inClass.length ? k / inClass.length : 0,
        smooth: (k + alpha) / (inClass.length + alpha * values.length) };
    });
    const p = new Plot({
      w: 560, h: 301, xlim: [-0.6, values.length - 0.4], ylim: [0, 1.02],
      title: `P(outlook | play = ${cls}), plain and smoothed`,
      ylabel: 'Probability',
      xticks: values.map((_, i) => i), xfmt: t => values[t],
      yticks: [0, 0.25, 0.5, 0.75, 1], yfmt: t => fmt(t, 2),
    });
    bars.forEach((b, i) => {
      p.bar(i - 0.13, b.plain, 0.24, { color: C.faint });
      p.bar(i + 0.13, b.smooth, 0.24, { color: b.k === 0 ? C.rose : C.teal });
      p.text(p.x(i - 0.13), p.y(b.plain) - 8, fmt(b.plain, 3), { anchor: 'middle', size: 11, color: C.muted, inPlot: true });
      p.text(p.x(i + 0.13), p.y(b.smooth) - 8, fmt(b.smooth, 3), { anchor: 'middle', size: 11, weight: 700, color: C.navy, inPlot: true });
    });
    p.legend([{ color: C.faint, label: 'count / total' }, { color: C.teal, label: 'smoothed' }],
      { at: 'top-right' });
    fig.replaceChildren(p.node);
    const zero = bars.find(b => b.k === 0);
    UI.readout(out, zero ? [
      { key: `${zero.v} never appears with ${cls}`, value: `${zero.k}/${inClass.length}`, color: C.muted },
      { key: 'unsmoothed', value: fmt(zero.plain, 3), note: 'vetoes the class outright', color: C.rose },
      { key: `smoothed at α = ${fmt(alpha, 2)}`, value: fmt(zero.smooth, 3), note: alpha ? 'unlikely, not impossible' : 'α = 0 is no smoothing', color: C.teal },
    ] : [
      { key: `every outlook appears with ${cls}`, value: 'no zero to correct', color: C.teal },
      { key: 'largest change from α', value: fmt(Math.max(...bars.map(b => Math.abs(b.smooth - b.plain))), 3), color: C.muted },
    ]);
  }
  draw();
};

/* ------------------------------------------------------ geometric models */

/* KNN on the iris sample: drag the new flower, change k, watch the vote. */
W['knn'] = host => {
  const iris = D.iris15;
  let at = iris.new_flower.slice();
  let k = 5;
  const { ctl, fig, out } = UI.layout(host);

  UI.slider(ctl, { label: 'k', min: 1, max: 9, step: 1, value: k, format: String, onInput: v => { k = v; draw(); } });
  UI.button(ctl, { label: 'put the flower back', onClick: () => { at = iris.new_flower.slice(); draw(); } });

  const styles = {
    Setosa: { color: C.teal, shape: 'dot' },
    Versicolor: { color: C.blue, shape: 'square' },
    Virginica: { color: C.violet, shape: 'triangle' },
  };

  function draw() {
    const dists = iris.length.map((L, i) => ({
      i, L, W: iris.width[i], s: iris.species[i],
      d: S.dist([L, iris.width[i]], at),
    })).sort((a, b) => a.d - b.d);
    const near = dists.slice(0, k);
    const votes = S.counts(near.map(n => n.s));
    const winner = S.majority(near.map(n => n.s));

    const p = new Plot({
      w: 600, h: 400, xlim: [4.3, 7.7], ylim: [2.15, 4.05],
      title: `k = ${k} → ${winner}`,
      xlabel: 'Sepal length (cm)', ylabel: 'Sepal width (cm)',
    });
    p.circleData(at[0], at[1], near[near.length - 1].d, { color: C.muted });
    near.forEach(n => p.ring(n.L, n.W, { r: 13, color: C.amber, width: 2.4 }));
    dists.forEach(n => {
      const st = styles[n.s] || { color: C.muted, shape: 'dot' };
      p[st.shape](n.L, n.W, { r: 7.5, color: st.color });
    });
    p.star(at[0], at[1], { r: 13, color: C.rose, cls: 'drag' });
    p.legend(Object.entries(styles).map(([name, st]) => ({ color: st.color, label: name })),
      { at: 'bottom-left' });
    UI.draggable(p,
      (dx, dy) => (S.dist([dx, dy], at) < 0.28 ? 0 : null),
      (_, dx, dy) => { at = [clamp(dx, 4.4, 7.6), clamp(dy, 2.2, 4.0)]; draw(); });
    fig.replaceChildren(p.node);
    UI.readout(out, [
      { key: 'the flower', value: `(${fmt(at[0], 1)}, ${fmt(at[1], 1)})`, color: C.rose },
      { key: 'nearest', value: `${fmt(near[0].d, 3)}`, note: near[0].s, color: C.muted },
      { key: 'votes', value: [...votes.entries()].map(([s, n]) => `${n} ${s}`).join(', '), color: C.blue },
      { key: 'answer', value: winner, color: styles[winner] ? styles[winner].color : C.navy },
    ]);
  }
  draw();
};

/* The SVM margin: slide the boundary and watch the margin shrink away from
 * the widest one. */
W['svm'] = host => {
  const sv = D.svm;
  let b = sv.b;
  const { ctl, fig, out } = UI.layout(host);

  UI.slider(ctl, {
    label: 'move the boundary (b)', min: -4.6, max: -1.4, step: 0.05, value: b,
    format: v => fmt(v, 2), onInput: v => { b = v; draw(); },
  });
  UI.button(ctl, { label: 'widest margin', onClick: () => { b = best(); redrawSlider(); draw(); } });
  const sliderRef = ctl.querySelector('input[type=range]');
  const redrawSlider = () => { sliderRef.value = b; sliderRef.dispatchEvent(new Event('input')); };

  const w = sv.w, norm = Math.hypot(...w);
  const signed = (pt, bb) => (w[0] * pt[0] + w[1] * pt[1] + bb) / norm;

  /* the b that makes the two nearest distances equal */
  function best() {
    const dA = Math.min(...sv.class_a.map(pt => w[0] * pt[0] + w[1] * pt[1]));
    const dB = Math.max(...sv.class_b.map(pt => w[0] * pt[0] + w[1] * pt[1]));
    return -(dA + dB) / 2;
  }

  function draw() {
    const toA = Math.min(...sv.class_a.map(pt => signed(pt, b)));
    const toB = Math.min(...sv.class_b.map(pt => -signed(pt, b)));
    const half = Math.min(toA, toB);
    const p = new Plot({
      w: 600, h: 323, xlim: [-0.3, 3.4], ylim: [-0.3, 3.6],
      title: 'Of every separating line, the one that keeps farthest from both',
      xlabel: 'x₁', ylabel: 'x₂',
    });
    const xs = [];
    for (let x = -0.3; x <= 3.4; x += 0.1) xs.push(+x.toFixed(2));
    const centre = x => (-b - w[0] * x) / w[1];
    const offset = (half * norm) / w[1];
    p.band(xs, xs.map(x => centre(x) - offset), xs.map(x => centre(x) + offset),
      { color: half > 0 ? C.cyan : C.rose, opacity: 0.16 });
    p.path(xs.map(x => [x, centre(x) + offset]), { color: C.muted, width: 1.5, dash: '7 5' });
    p.path(xs.map(x => [x, centre(x) - offset]), { color: C.muted, width: 1.5, dash: '7 5' });
    p.path(xs.map(x => [x, centre(x)]), { color: C.navy, width: 2.8 });
    sv.class_b.forEach(pt => p.square(pt[0], pt[1], { r: 7, color: C.rose }));
    sv.class_a.forEach(pt => p.dot(pt[0], pt[1], { r: 7.5, color: C.blue }));
    [...sv.class_a, ...sv.class_b].forEach(pt => {
      if (Math.abs(Math.abs(signed(pt, b)) - half) < 1e-6) p.ring(pt[0], pt[1], { r: 14 });
    });
    fig.replaceChildren(p.node);
    const separates = Math.min(...sv.class_a.map(pt => signed(pt, b))) > 0
      && Math.max(...sv.class_b.map(pt => signed(pt, b))) < 0;
    const widest = Math.abs(b - best()) < 0.03;
    UI.readout(out, [
      { key: 'to the nearest +1', value: fmt(toA, 3), color: C.blue },
      { key: 'to the nearest −1', value: fmt(toB, 3), color: C.rose },
      { key: 'margin', value: fmt(2 * half, 3), note: `2 / ‖w‖ = ${fmt(S.margin(w), 3)} is the most available`, color: half > 0 ? C.teal : C.rose },
      { key: 'verdict', value: !separates ? 'it no longer separates them' : widest ? 'the widest margin' : 'separates, but not by as much', color: !separates ? C.rose : widest ? C.teal : C.amber },
    ]);
  }
  draw();
};

/* The kernel trick: no split point works on the line, one does once x² is
 * added. Both cut-offs are on sliders, so the failure is checkable. */
W['kernel'] = host => {
  const kd = D.kernel1d;
  let cut = 0, lift = 1.8;
  const { ctl, fig, out } = UI.layout(host);

  UI.slider(ctl, { label: 'split point on x', min: -2.6, max: 2.6, step: 0.05, value: cut, format: v => fmt(v, 2), onInput: v => { cut = v; draw(); } });
  UI.slider(ctl, { label: 'height of the line in x²', min: 0, max: 6.5, step: 0.05, value: lift, format: v => fmt(v, 2), onInput: v => { lift = v; draw(); } });

  function draw() {
    const wrap = document.createElement('div');
    wrap.className = 'wrow';

    /* left: the line */
    const errLine = kd.inner.filter(x => x < cut).length + kd.outer.filter(x => x >= cut).length;
    const alt = kd.inner.filter(x => x >= cut).length + kd.outer.filter(x => x < cut).length;
    const wrongLine = Math.min(errLine, alt);
    const p1 = new Plot({
      w: 420, h: 226, xlim: [-3, 3], ylim: [-1, 1],
      title: `On the line: ${wrongLine} of 12 on the wrong side`,
      xlabel: 'x', yticks: [], left: 22, bottom: 42,
    });
    p1.vline(cut, { color: C.navy, width: 2.4 });
    kd.inner.forEach(x => p1.dot(x, 0, { r: 8, color: C.rose }));
    kd.outer.forEach(x => p1.dot(x, 0, { r: 8, color: C.blue }));
    wrap.appendChild(p1.node);

    /* right: with x squared */
    const wrongSq = kd.inner.filter(x => x * x >= lift).length + kd.outer.filter(x => x * x < lift).length;
    const p2 = new Plot({
      w: 420, h: 226, xlim: [-3, 3], ylim: [-0.4, 6.8],
      title: `Add x²: ${wrongSq} of 12 on the wrong side`,
      xlabel: 'x', ylabel: 'x²', left: 46, bottom: 42,
    });
    p2.hline(lift, { color: C.navy, width: 2.4 });
    kd.inner.forEach(x => p2.dot(x, x * x, { r: 8, color: C.rose }));
    kd.outer.forEach(x => p2.dot(x, x * x, { r: 8, color: C.blue }));
    wrap.appendChild(p2.node);

    fig.replaceChildren(wrap);
    const ke = kd.kernel_example;
    const dot = sum(ke.x.map((v, i) => v * ke.z[i]));
    const sq = sum(ke.x.map((v, i) => (v - ke.z[i]) ** 2));
    UI.readout(out, [
      { key: 'best a line can do', value: `${wrongLine} wrong`, note: 'no split point separates them', color: C.rose },
      { key: 'with x²', value: `${wrongSq} wrong`, color: wrongSq === 0 ? C.teal : C.amber },
      { key: `(x·z)^${ke.degree}`, value: `${dot}^${ke.degree} = ${dot ** ke.degree}`, note: 'the shortcut, two multiplications', color: C.blue },
      { key: `RBF at γ=${ke.gamma}`, value: fmt(Math.exp(-ke.gamma * sq), 3), color: C.violet },
    ]);
  }
  draw();
};


/* Predicted against actual, day by day: the tree's answer for each of the
 * fourteen days beside what actually happened, each row named as one of the
 * four boxes, and the boxes counted from those rows. Two ways to predict: the
 * tree grown on all fourteen days (it has seen every answer), or for each day
 * a tree grown on the other thirteen (it has not). */
W['tree-predictions'] = host => {
  const { rows, attributes, label } = D.golf;
  /* every prediction is held out: the tree is regrown without that day and asked about it.
   * (A 'train' mode, predicting with the tree grown on all 14 days, was removed on 2026-09-11:
   * the switch confused more than it taught.) */
  const mode = host.dataset.mode || 'heldout';
  /* data-count: count the boxes one at a time, in the order TN, FN, FP, TP */
  const ORDER = ['tn', 'fn', 'fp', 'tp'];
  let focus = 'count' in host.dataset ? (host.dataset.focus || (PRINT ? 'all' : 'tn')) : null;
  const { ctl, fig, out } = UI.layout(host);

  if (focus) {
    UI.choice(ctl, {
      label: 'count',
      value: focus,
      options: [...ORDER.map(k => ({ value: k, label: k.toUpperCase() })), { value: 'all', label: 'all four' }],
      onInput: v => { focus = v; draw(); },
    });
  }

  const full = S.buildTree(rows, attributes, label, 2);
  function predictions() {
    return rows.map((row, i) => {
      const tree = mode === 'train' ? full
        : S.buildTree(rows.filter((_, k) => k !== i), attributes, label, 2);
      return S.predict(tree, row);
    });
  }

  function draw() {
    const pred = predictions();
    const cell = { tp: 0, fp: 0, fn: 0, tn: 0 };
    const kind = pred.map((p, i) => {
      const said = p === 'Yes', truth = rows[i][label] === 'Yes';
      const k = said ? (truth ? 'tp' : 'fp') : (truth ? 'fn' : 'tn');
      cell[k] += 1;
      return k;
    });
    const names = { tp: 'TP', fp: 'FP', fn: 'FN', tn: 'TN' };
    const wrap = document.createElement('div');
    wrap.className = 'wrow pred';
    const table = document.createElement('table');
    table.className = 'pred-table';
    table.innerHTML = '<thead><tr><th>Day</th><th>Outlook</th><th>Humidity</th><th>Windy</th>'
      + '<th>Actual</th><th>Predicted</th><th>Box</th></tr></thead>'
      + '<tbody>' + rows.map((r, i) => `<tr class="${kind[i]}${focus && focus !== 'all' ? (kind[i] === focus ? ' hit' : ' dim') : ''}"><td>${i + 1}</td><td>${r.outlook}</td>`
        + `<td>${r.humidity}</td><td>${r.windy}</td><td><b>${r[label]}</b></td>`
        + `<td><b>${pred[i] ?? '—'}</b></td><td class="k">${names[kind[i]]}</td></tr>`).join('') + '</tbody>';
    wrap.appendChild(table);

    const side = document.createElement('div');
    side.className = 'pred-side';
    const shown = k => !focus || focus === 'all' || ORDER.indexOf(k) <= ORDER.indexOf(focus);
    const box = (klass, n, l, how) =>
      `<div class="box ${klass}${focus && focus !== 'all' && klass !== focus ? ' faded' : ''}">`
      + `<span class="n">${shown(klass) ? n : '?'}</span><span class="l">${l}</span><span class="how">${how}</span></div>`;
    side.innerHTML = '<div class="cm live count"><div class="blank"></div><div class="h">actually No</div><div class="h">actually Yes</div>'
      + '<div class="h">predict<br>No</div>'
      + box('tn', cell.tn, 'TN', 'predicted No, was No') + box('fn', cell.fn, 'FN', 'predicted No, was Yes')
      + '<div class="h">predict<br>Yes</div>'
      + box('fp', cell.fp, 'FP', 'predicted Yes, was No') + box('tp', cell.tp, 'TP', 'predicted Yes, was Yes')
      + '</div>';
    wrap.appendChild(side);
    fig.replaceChildren(wrap);

    const right = cell.tp + cell.tn;
    if (focus && focus !== 'all') {
      const rule = { tn: 'predicted No, was No', fn: 'predicted No, was Yes', fp: 'predicted Yes, was No', tp: 'predicted Yes, was Yes' }[focus];
      const days = kind.map((k, i) => (k === focus ? i + 1 : null)).filter(Boolean);
      const sofar = ORDER.slice(0, ORDER.indexOf(focus) + 1);
      const placed = sum(sofar.map(k => cell[k]));
      UI.note(out, `<b>${focus.toUpperCase()}</b> — ${rule}: <b>${cell[focus]}</b> `
        + (days.length ? `(day${days.length > 1 ? 's' : ''} ${days.join(', ')})` : '(no such day)')
        + ` &nbsp;·&nbsp; counted so far <b>${sofar.map(k => cell[k]).join(' + ')} = ${placed}</b>, `
        + (sofar.length === 4 ? 'all 14 days placed.' : `${14 - placed} days still to place.`));
      return;
    }
    UI.readout(out, [
      { key: 'count the rows', value: `${cell.tp} + ${cell.fp} + ${cell.fn} + ${cell.tn} = 14`, color: C.muted },
      { key: 'right', value: `${right} / 14`, note: 'the two diagonal boxes', color: C.teal },
      { key: 'wrong', value: `${cell.fp + cell.fn} / 14`, note: `${cell.fp} false alarm${cell.fp === 1 ? '' : 's'}, ${cell.fn} miss${cell.fn === 1 ? '' : 'es'}`, color: cell.fp + cell.fn ? C.rose : C.teal },
      { key: 'these are', value: mode === 'train' ? 'training numbers' : 'held-out numbers', note: mode === 'train' ? 'the tree has seen every answer' : 'each day was hidden from its tree', color: mode === 'train' ? C.amber : C.blue },
    ]);
  }
  draw();
};


/* Cross-validation as the document asks for it: test the model many times and
 * see whether it is consistent. Each of the fourteen days is one test -- hold
 * it out, grow the tree on the other thirteen, ask about it. A slider runs the
 * tests one at a time; the score after each test settles as they accumulate. */
W['cv-folds'] = host => {
  const { rows, attributes, label } = D.golf;
  let k = host.dataset.tests ? +host.dataset.tests : PRINT ? rows.length : 1;
  const { ctl, fig, out } = UI.layout(host);
  const results = rows.map((row, i) =>
    S.predict(S.buildTree(rows.filter((_, x) => x !== i), attributes, label, 2), row) === row[label]);
  const trainAcc = S.accuracy(S.buildTree(rows, attributes, label, 2), rows, label);

  UI.slider(ctl, { label: 'tests run', min: 1, max: rows.length, step: 1, value: k, format: v => `${v} of ${rows.length}`, onInput: v => { k = v; draw(); } });

  function draw() {
    const wrap = document.createElement('div');
    const strip = document.createElement('div');
    strip.className = 'folds';
    results.forEach((ok, i) => {
      const c = document.createElement('div');
      c.className = 'fold ' + (i < k ? (ok ? 'ok' : 'bad') : 'todo');
      c.innerHTML = `<span>day ${i + 1}</span><b>${i < k ? (ok ? 'right' : 'wrong') : '·'}</b>`;
      strip.appendChild(c);
    });
    wrap.appendChild(strip);

    const running = results.map((_, i) => results.slice(0, i + 1).filter(Boolean).length / (i + 1));
    const p = new Plot({
      w: 640, h: 250, xlim: [0.5, rows.length + 0.5], ylim: [-0.04, 1.08],
      title: 'Score after each test', xlabel: 'Tests run', ylabel: 'Share right so far',
      xticks: [1, 3, 5, 7, 9, 11, 13], yticks: [0, 0.25, 0.5, 0.75, 1], yfmt: t => pct(t, 0), top: 30, bottom: 44,
    });
    p.hline(trainAcc, { color: C.amber, width: 1.5, dash: '6 5' });
    p.text(p.x(rows.length) - 4, p.y(trainAcc) - 7, `on its own days: ${pct(trainAcc, 0)}`, { anchor: 'end', size: 11.5, color: C.amber, inPlot: true });
    const finalAcc = running[rows.length - 1];
    p.hline(finalAcc, { color: C.teal, width: 1.5, dash: '6 5' });
    p.text(p.x(1) + 4, p.y(finalAcc) + 16, `after all ${rows.length}: ${pct(finalAcc, 0)}`, { anchor: 'start', size: 11.5, color: C.teal, inPlot: true });
    p.path(running.slice(0, k).map((v, i) => [i + 1, v]), { color: C.blue, width: 2.8 });
    running.slice(0, k).forEach((v, i) => p.dot(i + 1, v, { r: 5.5, color: results[i] ? C.teal : C.rose }));
    wrap.appendChild(p.node);
    fig.replaceChildren(wrap);

    const right = results.slice(0, k).filter(Boolean).length;
    UI.readout(out, [
      { key: 'tests run', value: `${k} of ${rows.length}`, color: C.muted },
      { key: 'right so far', value: `${right} / ${k} = ${pct(right / k, 0)}`, color: right / k >= 0.7 ? C.teal : C.rose },
      { key: 'one test alone', value: k === 1 ? (results[0] ? '100% — and lucky' : '0% — and unlucky') : 'can say 0% or 100%', color: C.amber },
      { key: 'all fourteen', value: pct(finalAcc, 0), note: 'the number to trust', color: C.blue },
    ]);
  }
  draw();
};

/* ---------------------------------------------------------------- Part III */

/* The confusion matrix, and every metric built from it. */
/* The golf tree's held-out confusion matrix: each day is held out in turn, a
 * depth-2 tree is grown on the other 13, and its prediction for the held-out
 * day is compared with the truth. Recomputed here rather than stored. */
function treeHeldOutMatrix() {
  const { rows, attributes, label } = D.golf;
  const cell = { tp: 0, fp: 0, fn: 0, tn: 0 };
  rows.forEach((row, i) => {
    const rest = rows.filter((_, k) => k !== i);
    const said = S.predict(S.buildTree(rest, attributes, label, 2), row) === 'Yes';
    const truth = row[label] === 'Yes';
    cell[said ? (truth ? 'tp' : 'fp') : (truth ? 'fn' : 'tn')] += 1;
  });
  return cell;
}

W['confusion'] = host => {
  const src = host.dataset.source === 'tree' ? treeHeldOutMatrix()
            : host.dataset.source === 'golf' ? D.golf_nb : D.screening;
  const cell = { tp: src.tp, fp: src.fp, fn: src.fn, tn: src.tn };
  let beta = 1;
  const { ctl, fig, out } = UI.layout(host);

  const boxes = {};
  ['tp', 'fp', 'fn', 'tn'].forEach(key => {
    boxes[key] = UI.number(ctl, {
      label: key.toUpperCase(), min: 0, max: 100000, step: 1, value: cell[key], width: '5em',
      onInput: v => { cell[key] = Math.round(v); draw(); },
    });
  });
  UI.button(ctl, { label: 'reset', onClick: () => { Object.keys(boxes).forEach(k => { cell[k] = src[k]; boxes[k].set(src[k]); }); draw(); } });

  function draw() {
    const m = S.metrics(cell.tp, cell.fp, cell.fn, cell.tn);
    const grid = document.createElement('div');
    grid.className = 'cm live';
    const box = (klass, n, l) =>
      `<div class="box ${klass}"><span class="n">${n.toLocaleString()}</span><span class="l">${l}</span></div>`;
    grid.innerHTML = '<div class="blank"></div><div class="h">actually No</div><div class="h">actually Yes</div>'
      + '<div class="h">predict<br>No</div>' + box('tn', cell.tn, 'TN — a correct pass') + box('fn', cell.fn, 'FN — a Type II error')
      + '<div class="h">predict<br>Yes</div>' + box('fp', cell.fp, 'FP — a Type I error') + box('tp', cell.tp, 'TP — a correct catch');
    fig.replaceChildren(grid);
    UI.readout(out, [
      { key: 'accuracy', value: `${cell.tp + cell.tn} / ${m.total} = ${fmt(m.accuracy, 3)}`, color: C.blue },
      { key: 'precision', value: `${cell.tp} / ${cell.tp + cell.fp} = ${fmt(m.precision, 3)}`, color: C.cyan2 },
      { key: 'recall', value: `${cell.tp} / ${cell.tp + cell.fn} = ${fmt(m.recall, 3)}`, color: C.teal },
      { key: 'F₁', value: fmt(m.f1, 3), color: C.rose },
    ]);
  }
  draw();
};

/* F-beta as a curve: one set of counts, every weighting of the two mistakes. */
W['fbeta'] = host => {
  const sc = D.screening;
  const m = S.metrics(sc.tp, sc.fp, sc.fn, sc.tn);
  let beta = 1;
  const { ctl, fig, out } = UI.layout(host);

  UI.slider(ctl, {
    label: 'β — recall weighted β times as heavily', min: 0.25, max: 4, step: 0.05, value: beta,
    format: v => fmt(v, 2), onInput: v => { beta = v; draw(); },
  });

  function draw() {
    const p = new Plot({
      w: 600, h: 323, xlim: [0.25, 4], ylim: [Math.min(m.precision, m.recall) - 0.06, Math.max(m.precision, m.recall) + 0.06],
      title: 'One test, one set of counts, every verdict',
      xlabel: 'β', ylabel: 'F-score', yfmt: t => fmt(t, 2),
    });
    const curve = [];
    for (let b = 0.25; b <= 4.001; b += 0.02) curve.push([b, S.fBeta(m.precision, m.recall, b)]);
    p.hline(m.precision, { color: C.cyan2, width: 1.4, dash: '6 4' });
    p.hline(m.recall, { color: C.teal, width: 1.4, dash: '6 4' });
    p.text(p.x(3.9), p.y(m.precision) - 8, `precision ${fmt(m.precision, 3)}`, { anchor: 'end', size: 12, color: C.cyan2, inPlot: true });
    p.text(p.x(3.9), p.y(m.recall) + 16, `recall ${fmt(m.recall, 3)}`, { anchor: 'end', size: 12, color: C.teal, inPlot: true });
    p.path(curve, { color: C.rose, width: 3 });
    [0.5, 1, 2].forEach(b => p.dot(b, S.fBeta(m.precision, m.recall, b), { r: 6, color: C.faint }));
    const here = S.fBeta(m.precision, m.recall, beta);
    p.dot(beta, here, { r: 9, color: C.amber });
    p.callout(beta, here, beta > 2.2 ? -30 : 30, -22, `F(${fmt(beta, 2)}) = ${fmt(here, 3)}`, { size: 13 });
    fig.replaceChildren(p.node);
    UI.readout(out, [
      { key: 'F₀.₅', value: fmt(S.fBeta(m.precision, m.recall, 0.5), 3), note: 'a false alarm is worse', color: C.cyan2 },
      { key: 'F₁', value: fmt(S.fBeta(m.precision, m.recall, 1), 3), note: 'both alike', color: C.blue },
      { key: 'F₂', value: fmt(S.fBeta(m.precision, m.recall, 2), 3), note: 'a miss is worse', color: C.violet },
      { key: `F(${fmt(beta, 2)})`, value: fmt(here, 3), color: C.amber },
    ]);
  }
  draw();
};

/* Leave-one-out cross-validation of the tree's depth, run in the browser over
 * the golf table -- fourteen trees per depth, on every redraw. */
W['cv-depth'] = host => {
  const { rows, attributes, label } = D.golf;
  const depths = [1, 2, 3, 4];
  let picked = 2;
  const { ctl, fig, out } = UI.layout(host);

  const scores = depths.map(d => ({
    depth: d,
    training: S.accuracy(S.buildTree(rows, attributes, label, d), rows, label),
    heldOut: S.leaveOneOut(rows, attributes, label, d),
    leaves: S.countLeaves(S.buildTree(rows, attributes, label, d)),
  }));

  UI.slider(ctl, {
    label: 'maximum depth', min: 1, max: 4, step: 1, value: picked,
    format: String, onInput: v => { picked = v; draw(); },
  });

  function draw() {
    const p = new Plot({
      w: 600, h: 323, xlim: [-0.6, depths.length - 0.4], ylim: [0, 1.18],
      title: 'Training accuracy claims 100%; held-out days say less',
      ylabel: 'Share predicted correctly',
      xticks: depths.map((_, i) => i), xfmt: t => `depth ${depths[t]}`,
      yticks: [0, 0.25, 0.5, 0.75, 1], yfmt: t => pct(t, 0),
    });
    scores.forEach((s, i) => {
      const on = s.depth === picked;
      p.bar(i - 0.16, s.training, 0.28, { color: C.faint, opacity: on ? 1 : 0.45 });
      p.bar(i + 0.16, s.heldOut, 0.28, { color: C.teal, opacity: on ? 1 : 0.45 });
      p.text(p.x(i - 0.16), p.y(s.training) - 8, pct(s.training, 0), { anchor: 'middle', size: 12, color: C.muted, inPlot: true });
      p.text(p.x(i + 0.16), p.y(s.heldOut) - 8, pct(s.heldOut, 0), { anchor: 'middle', size: 12, weight: 700, color: C.navy, inPlot: true });
    });
    p.legend([{ color: C.faint, label: 'training accuracy' }, { color: C.teal, label: 'leave-one-out accuracy' }],
      { at: 'top-left' });
    fig.replaceChildren(p.node);
    const s = scores[picked - 1];
    const bestDepth = scores.reduce((a, b) => (b.heldOut > a.heldOut ? b : a));
    UI.readout(out, [
      { key: `depth ${s.depth} · leaves`, value: s.leaves, color: C.muted },
      { key: 'training', value: pct(s.training, 1), note: 'not evidence', color: C.faint },
      { key: 'held out', value: pct(s.heldOut, 1), color: C.teal },
      { key: 'the gap', value: pct(s.training - s.heldOut, 1), note: 'overfitting, measured', color: C.rose },
      { key: 'cross-validation picks', value: `depth ${bestDepth.depth}`, color: C.blue },
    ]);
  }
  draw();
};

/* Underfitting and overfitting on one slider, with a held-out score that only
 * a middling degree wins. */
W['overfitting'] = host => {
  const pts = D.overfit.points;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let degree = 3;
  const { ctl, fig, out } = UI.layout(host);

  UI.slider(ctl, {
    label: 'degree of the polynomial', min: 1, max: 12, step: 1, value: degree,
    format: String, onInput: v => { degree = v; draw(); },
  });

  function looError(deg) {
    let total = 0;
    for (let i = 0; i < xs.length; i++) {
      const tx = xs.filter((_, j) => j !== i), ty = ys.filter((_, j) => j !== i);
      total += (ys[i] - S.polyval(S.polyfit(tx, ty, deg), xs[i])) ** 2;
    }
    return Math.sqrt(total / xs.length);
  }

  function draw() {
    const coef = S.polyfit(xs, ys, degree);
    const trainRmse = Math.sqrt(mean(xs.map((x, i) => (ys[i] - S.polyval(coef, x)) ** 2)));
    const held = looError(degree);
    const label = degree <= 1 ? 'Underfit' : degree <= 5 ? 'About right' : 'Overfit';
    const color = degree <= 1 ? C.rose : degree <= 5 ? C.teal : C.violet;
    const p = new Plot({
      w: 620, h: 333, xlim: [-0.04, 1.04], ylim: [-0.55, 1.85],
      title: `${label} — degree ${degree}`, xlabel: 'x', ylabel: 'y', yfmt: t => fmt(t, 1),
    });
    const curve = [];
    for (let x = -0.02; x <= 1.02; x += 0.004) curve.push([x, S.polyval(coef, x)]);
    p.path(curve.filter(q => q[1] > -3 && q[1] < 4), { color, width: 3 });
    pts.forEach(q => p.dot(q[0], q[1], { r: 7, color: C.blue }));
    fig.replaceChildren(p.node);
    UI.readout(out, [
      { key: 'coefficients fitted', value: degree + 1, note: `from ${pts.length} points`, color: C.muted },
      { key: 'training RMSE', value: fmt(trainRmse, 4), note: 'falls with every degree', color: C.faint },
      { key: 'held-out RMSE', value: fmt(held, 4), note: 'the number that matters', color: C.teal },
      { key: 'verdict', value: label, color },
    ]);
  }
  draw();
};

/* The ROC curve, with the threshold on a slider and the confusion matrix it
 * produces shown beside the point it puts on the curve. */
W['roc'] = host => {
  const pt = D.patients10;
  const r = S.roc(pt.ill, pt.healthy);
  const cuts = [...new Set([...pt.ill, ...pt.healthy])].sort((a, b) => b - a);
  let threshold = 0.5;
  const { ctl, fig, out } = UI.layout(host);

  UI.slider(ctl, {
    label: 'threshold', min: 0.05, max: 1, step: 0.05, value: threshold,
    format: v => fmt(v, 2), onInput: v => { threshold = v; draw(); },
  });

  function draw() {
    const c = S.confusionAt(pt.ill, pt.healthy, threshold);
    const tpr = c.tp / pt.ill.length, fpr = c.fp / pt.healthy.length;
    const p = new Plot({
      w: 560, h: 390, xlim: [-0.03, 1.03], ylim: [-0.03, 1.03],
      title: `Every threshold, on one chart — AUC ${fmt(r.auc, 3)}`,
      xlabel: 'False positive rate', ylabel: 'True positive rate (recall)',
      xfmt: t => fmt(t, 1), yfmt: t => fmt(t, 1),
    });
    p.path([[0, 0], [1, 1]], { color: C.faint, width: 1.5, dash: '7 5' });
    const stepped = [];
    r.curve.forEach((q, i) => {
      if (i) stepped.push([q[0], r.curve[i - 1][1]]);
      stepped.push(q);
    });
    p.area(stepped, 0, { color: C.blue, opacity: 0.1 });
    p.path(stepped, { color: C.blue, width: 2.8 });
    cuts.forEach(t => {
      const cc = S.confusionAt(pt.ill, pt.healthy, t);
      p.dot(cc.fp / pt.healthy.length, cc.tp / pt.ill.length, { r: 5, color: C.faint });
    });
    p.dot(fpr, tpr, { r: 10, color: C.amber });
    p.callout(fpr, tpr, fpr > 0.6 ? -30 : 30, 26, `t = ${fmt(threshold, 2)}`, { size: 13 });
    fig.replaceChildren(p.node);
    UI.readout(out, [
      { key: 'TP / FN', value: `${c.tp} / ${c.fn}`, note: `of ${pt.ill.length} ill`, color: C.teal },
      { key: 'FP / TN', value: `${c.fp} / ${c.tn}`, note: `of ${pt.healthy.length} healthy`, color: C.amber },
      { key: 'TPR', value: fmt(tpr, 2), color: C.blue },
      { key: 'FPR', value: fmt(fpr, 2), color: C.rose },
      { key: 'AUC', value: `${r.wins}/${r.pairs} = ${fmt(r.auc, 3)}`, note: 'the same at every threshold', color: C.violet },
    ]);
  }
  draw();
};

/* ==================================================================  boot */
/* Print: a control cannot be pressed on paper, so a slide whose figure declares
 * data-print-states="a,b,c" data-print-attr="pick" is repeated once per state,
 * each copy fixing the figure at that state (host.dataset.pick = 'a', 'b', 'c').
 * Two figures on one slide advance together. The kicker gets "· 2 of 3". This
 * runs before Reveal lays the pages out, so every copy becomes its own page. */
function expandPrintStates() {
  if (!PRINT) return;
  document.querySelectorAll('.reveal .slides > section').forEach(section => {
    const hosts = [...section.querySelectorAll('[data-print-states]')];
    if (!hosts.length) return;
    const states = hosts.map(h => h.dataset.printStates.split(',').map(x => x.trim()));
    const n = Math.max(...states.map(x => x.length));
    const copies = [section];
    for (let i = 1; i < n; i++) {
      const copy = section.cloneNode(true);
      copy.removeAttribute('id');
      section.parentNode.insertBefore(copy, copies[copies.length - 1].nextSibling);
      copies.push(copy);
    }
    copies.forEach((sec, i) => {
      sec.querySelectorAll('[data-print-states]').forEach((h, j) => {
        const list = states[j];
        h.dataset[h.dataset.printAttr] = list[Math.min(i, list.length - 1)];
        delete h.dataset.printStates;
        delete h.dataset.printAttr;
      });
      const kicker = sec.querySelector('.kicker');
      if (kicker) kicker.textContent += ` · ${i + 1} of ${n}`;
    });
  });
}

function boot() {
  expandPrintStates();
  document.querySelectorAll('[data-widget]').forEach(hostEl => {
    if (hostEl.dataset.ready) return;
    const build = W[hostEl.dataset.widget];
    if (!build) { console.warn('no widget named', hostEl.dataset.widget); return; }
    hostEl.dataset.ready = '1';
    try {
      build(hostEl);
    } catch (err) {
      hostEl.dataset.ready = '';
      console.error('widget', hostEl.dataset.widget, err);
    }
  });
}

document.addEventListener('DOMContentLoaded', boot);
if (document.readyState !== 'loading') boot();
setTimeout(boot, 400);
if (window.Reveal && Reveal.on) Reveal.on('ready', boot);
