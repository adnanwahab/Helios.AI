/* Eight Billion, Five Laws. Every person answers each law once.
   Dots sit where people live (data/population.json). Each dot's thought is drawn in a
   vertex shader from a hash of the dot's index, and the inspector runs the same integer
   math in JavaScript so it shows the draws the GPU made. */
(function () {
  'use strict';

  // ---- Configuration. Placeholders: replace the laws and thoughts with the real ones. ----
  const TOTAL_PEOPLE = 8000000000;          // the population this map stands for
  const DOTS = 1 << 21;                     // 2,097,152 dots, each standing for TOTAL_PEOPLE / DOTS people
  const LEAN_BOOST = 3;                     // how much likelier a law's two leaning themes are to be drawn
  const DOT_COLORS = { yes: '#3987e5', no: '#d95926', unsure: '#898781' }; // dark-mode steps, validated on #1a1a19
  const FADE_MS = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450;

  const LAWS = [
    { name: 'Law 1', leans: [0, 6] },
    { name: 'Law 2', leans: [1, 7] },
    { name: 'Law 3', leans: [2, 3] },
    { name: 'Law 4', leans: [5, 9] },
    { name: 'Law 5', leans: [8, 4] },
  ];

  // Ten thoughts per theme, grouped by vote. Keep ten per theme (checked below).
  const THEMES = [
    {
      name: 'Money & prices',
      yes: [
        "This could leave more money in my pocket each month.",
        "Lower costs would make the rest of my budget easier.",
        "If prices really fall, I'm all for it.",
      ],
      unsure: [
        "I'd need the numbers before I know what it costs me.",
        "Not sure who actually pays for this in the end.",
      ],
      no: [
        "This sounds like a tax I'll end up paying.",
        "Prices will rise, and my wages won't keep up.",
        "Someone will profit from this while I pay the bill.",
        "I can't afford another rule that adds costs.",
        "The costs land on households while the gains go elsewhere.",
      ],
    },
    {
      name: 'Safety & security',
      yes: [
        "My street would feel safer after this.",
        "I'd sleep better knowing this is in place.",
        "Protecting people from harm should come first.",
        "This could prevent accidents I've seen up close.",
        "It's a sensible precaution for everyone.",
        "My kids would be safer under this.",
      ],
      unsure: [
        "I want to see whether it works before I judge.",
        "Safety matters, but I'm not sure this is the way to get it.",
      ],
      no: [
        "Heavier rules won't make anyone actually safer.",
        "This could give officials too much power over ordinary people.",
      ],
    },
    {
      name: 'Freedom & choice',
      yes: [
        "People should be trusted to make their own decisions.",
        "More choice always sounds good to me.",
        "This removes a rule that has always bugged me.",
        "Less red tape means more room to live my own way.",
      ],
      unsure: [
        "Freedom is great, but who decides the limits?",
        "I can see both sides on how much choice we should have.",
      ],
      no: [
        "This takes away a choice I should be able to make.",
        "Government shouldn't be telling me how to live.",
        "This feels like an overreach into my private life.",
        "Once it's in place, it's hard to undo.",
      ],
    },
    {
      name: 'Fairness & rights',
      yes: [
        "This looks like a fair deal for people like me.",
        "Everyone should be treated equally under this.",
        "It's about time someone addressed this unfairness.",
        "The rights it protects matter to me and my neighbors.",
        "I think this helps the people who need it most.",
      ],
      unsure: [
        "It sounds fair on paper, but I'd like to see how it's applied.",
        "I can't tell yet who benefits most.",
      ],
      no: [
        "This favors some groups over others.",
        "It punishes people for things they didn't choose.",
        "The fairness claims don't hold up when I look closely.",
      ],
    },
    {
      name: 'Trust & institutions',
      yes: [
        "I trust the people who wrote this to get it right.",
        "Finally, an institution that's accountable to us.",
        "This could rebuild some of the trust we've lost.",
      ],
      unsure: [
        "I don't know who to believe about this.",
        "I'll wait and see what officials actually do.",
        "Trust has to be earned, and it's not clear yet.",
      ],
      no: [
        "The people behind this don't have my interests at heart.",
        "I've been burned by promises like this before.",
        "This feels like a way to hide problems from us.",
        "I don't trust the people who will enforce it.",
      ],
    },
    {
      name: 'Family & home',
      yes: [
        "It would help my family get through the year.",
        "I can picture this making home life easier.",
        "Better for families is better for everyone.",
        "My parents would have benefited from something like this.",
        "It makes it easier to look after the people I love.",
      ],
      unsure: [
        "I'm not sure how it affects my household yet.",
      ],
      no: [
        "It would make things harder for families like mine.",
        "This could split up people who depend on each other.",
        "My home would feel less secure under this.",
        "We'd have less time together if this goes through.",
      ],
    },
    {
      name: 'Work & jobs',
      yes: [
        "This could create better jobs in my area.",
        "Workers would get a fairer shake under this.",
        "It might open doors for people just starting out.",
      ],
      unsure: [
        "Jobs could change, and I'm not sure which way.",
        "I'd need to know how it affects my industry.",
      ],
      no: [
        "I worry my job will disappear because of this.",
        "Employers will use this as an excuse to cut hours.",
        "It makes hiring harder for small businesses like mine.",
        "This adds paperwork my boss will push onto me.",
        "I'm already stretched thin, and this makes it worse.",
      ],
    },
    {
      name: 'Health & care',
      yes: [
        "It could get people the care they need sooner.",
        "A healthier population is worth the trade-off.",
        "My doctor would probably welcome this.",
        "This could catch problems before they get serious.",
        "Access to care shouldn't depend on how much you earn.",
        "I've seen how much good this kind of care does.",
      ],
      unsure: [
        "I'd like to know more about the medical side of it.",
      ],
      no: [
        "This could slow down the care I already rely on.",
        "It leaves too many people without coverage.",
        "The downsides for patients worry me.",
      ],
    },
    {
      name: 'Environment & future',
      yes: [
        "Our kids deserve a cleaner future than this.",
        "This is a step in the right direction for the planet.",
        "I'd rather pay now than pay for the damage later.",
        "Nature around here would benefit from this.",
      ],
      unsure: [
        "It's a good goal, but the plan seems vague.",
        "I'd want to know the long-term effects first.",
        "The environmental gains could be real or overstated.",
      ],
      no: [
        "This could cost jobs without a real payoff for the planet.",
        "Good intentions, but the implementation looks wasteful.",
        "It shifts the burden onto people who can least afford it.",
      ],
    },
    {
      name: 'Community & belonging',
      yes: [
        "It would bring my neighborhood closer together.",
        "Local people would have a real say in what happens.",
        "This could make our town a better place to live.",
        "I'd volunteer to help make this work.",
      ],
      unsure: [
        "I'd like to hear from my neighbors before I decide.",
        "It could help or divide us, and it's hard to say which.",
      ],
      no: [
        "This could split our community along old lines.",
        "Outsiders will decide things that affect us locally.",
        "It erodes what already makes this place feel like home.",
        "I don't think this reflects what people around here want.",
      ],
    },
  ];

  // ---- Thought pool: index k = theme * 10 + position within the theme ----
  const THOUGHTS = [];
  THEMES.forEach((theme, t) => {
    const items = [
      ...theme.yes.map((text) => ({ text, stance: 1 })),
      ...theme.unsure.map((text) => ({ text, stance: 0 })),
      ...theme.no.map((text) => ({ text, stance: -1 })),
    ];
    if (items.length !== 10) throw new Error(`"${theme.name}" has ${items.length} thoughts; it needs 10.`);
    items.forEach((item) => THOUGHTS.push({ ...item, theme: t }));
  });

  // Probability of each theme under each law. A law lifts the themes it leans toward.
  const THEME_SHARE = LAWS.map((law) => {
    const w = THEMES.map((_, t) => 1 + (law.leans.includes(t) ? LEAN_BOOST : 0));
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map((v) => v / sum);
  });
  const THEME_CDF = THEME_SHARE.map((p) => {
    let acc = 0;
    return p.map((v) => (acc += v));
  });
  const SHARE_MAX = Math.max(...THEME_SHARE.flat());

  // Expected share of people voting yes, no or unsure under each law (exact for the model).
  const VOTE_SHARE = LAWS.map((_, l) => {
    const out = { yes: 0, no: 0, unsure: 0 };
    THEMES.forEach((theme, t) => {
      const per = THEME_SHARE[l][t] / 10;
      out.yes += per * theme.yes.length;
      out.no += per * theme.no.length;
      out.unsure += per * theme.unsure.length;
    });
    return out;
  });

  const VOTE_LABEL = { yes: 'Yes', no: 'No', unsure: 'Unsure' };
  const voteOf = (stance) => (stance > 0 ? 'yes' : stance < 0 ? 'no' : 'unsure');
  const PEOPLE_PER_DOT = TOTAL_PEOPLE / DOTS;
  const nf = new Intl.NumberFormat('en-US');

  // ---- Integer hash, identical in GLSL and JavaScript ----
  const U32 = 4294967296;
  function lowbias32(x) {
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }
  // The thought a dot draws under a law: pick a theme from the law's distribution, then a thought within it.
  function thoughtFor(dotId, law) {
    const s = (dotId * 5 + law) >>> 0;
    const a = lowbias32((s ^ 0x9e3779b9) >>> 0);
    const b = lowbias32((a ^ 0x632be5ab) >>> 0);
    const u1 = a / U32;
    const u2 = b / U32;
    const cdf = THEME_CDF[law];
    let theme = 0;
    for (let t = 0; t < 9; t++) if (u1 >= cdf[t]) theme++;
    return theme * 10 + Math.min(9, Math.floor(u2 * 10));
  }

  // ---- Population: stratified sampling of the cumulative population ----
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / U32;
    };
  }
  const GRID = { cols: 1440, res: 0.25 };

  // The population file is a JSON array of [cell index, people] pairs, one per line.
  async function loadPopulation() {
    const res = await fetch('data/population.json');
    if (!res.ok) throw new Error(`The population data did not load (status ${res.status}).`);
    const rows = await res.json();
    const cells = new Uint32Array(rows.length);
    const people = new Float32Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      cells[i] = rows[i][0];
      people[i] = rows[i][1];
    }
    return { cells, people };
  }

  // Stratified sampling: dot j takes slot perm(j) of the cumulative population, so each dot
  // represents an equal share of people and the dot density follows population exactly.
  function placeDots(cells, people, n) {
    const C = cells.length;
    const cum = new Float64Array(C);
    let acc = 0;
    for (let i = 0; i < C; i++) {
      acc += people[i];
      cum[i] = acc;
    }
    const rnd = mulberry32(20261120);
    const pos = new Float32Array(n * 2);
    for (let j = 0; j < n; j++) {
      const slot = Math.imul(j, 0x9e3779b1) & (n - 1); // a permutation of 0..n-1 because n is a power of two
      const q = ((slot + rnd()) / n) * acc;
      let lo = 0;
      let hi = C - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cum[mid] > q) hi = mid;
        else lo = mid + 1;
      }
      const cell = cells[lo];
      const row = Math.floor(cell / GRID.cols);
      const col = cell - row * GRID.cols;
      pos[2 * j] = -180 + GRID.res * (col + 0.5) + (rnd() - 0.5) * GRID.res;
      pos[2 * j + 1] = 90 - GRID.res * (row + 0.5) + (rnd() - 0.5) * GRID.res;
    }
    return pos;
  }

  // ---- Shader: one extension per law, so the law is a constant in the compiled code ----
  const hexRGB = (hex) =>
    [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4));
  const glslVec = (hex) => `vec3(${hexRGB(hex).join(', ')})`;
  const SHADER_TABLES = [
    `const float LAW_CDF[50] = float[50](${THEME_CDF.flat().map((v) => v.toFixed(7)).join(', ')});`,
    `const int STANCE[100] = int[100](${THOUGHTS.map((t) => t.stance).join(', ')});`,
    `const vec3 VOTE_RGB[3] = vec3[3](${glslVec(DOT_COLORS.yes)}, ${glslVec(DOT_COLORS.no)}, ${glslVec(DOT_COLORS.unsure)});`,
  ].join('\n');
  const SHADER_FUNCS = `
uint ppl_lowbias(uint x) {
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}
int ppl_thought(uint dotId) {
  uint s = dotId * 5u + uint(LAW_INDEX);
  uint a = ppl_lowbias(s ^ 0x9e3779b9u);
  uint b = ppl_lowbias(a ^ 0x632be5abu);
  float u1 = float(a) * 2.3283064365386963e-10;
  float u2 = float(b) * 2.3283064365386963e-10;
  int theme = 0;
  for (int t = 0; t < 9; t++) {
    if (u1 >= LAW_CDF[LAW_INDEX * 10 + t]) theme++;
  }
  return theme * 10 + min(int(u2 * 10.0), 9);
}
vec4 ppl_vote_color(int k) {
  int stance = STANCE[k];
  int v = stance > 0 ? 0 : (stance < 0 ? 1 : 2);
  return vec4(VOTE_RGB[v], 0.9);
}`;

  // Built inside start(), after the deck.gl check, so a missing library is reported on the page.
  function makeExtensions() {
    return LAWS.map(
      (_, law) =>
        new (class extends deck.LayerExtension {
          getShaders() {
            return {
              modules: [],
              inject: {
                'vs:#decl': `const int LAW_INDEX = ${law};\n${SHADER_TABLES}\n${SHADER_FUNCS}`,
                'vs:DECKGL_FILTER_COLOR': 'color = ppl_vote_color(ppl_thought(uint(gl_InstanceID)));',
                'fs:DECKGL_FILTER_COLOR':
                  'float ppl_r = length(geometry.uv);\n  color.a *= 1.0 - smoothstep(0.55, 1.0, ppl_r);',
              },
            };
          }
        })(),
    );
  }

  // ---- Page wiring ----
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function fitZoom() {
    const w = Math.max(window.innerWidth, 640);
    const h = Math.max(window.innerHeight, 480);
    return Math.min(Math.log2(w / 520), Math.log2(h / 440));
  }

  async function start() {
    const EXTENSIONS = makeExtensions();
    const pop = await loadPopulation();
    const POS = placeDots(pop.cells, pop.people, DOTS);
    const DATA = { length: DOTS, attributes: { getPosition: { value: POS, size: 2 } } };
    const PARAMS = { depthTest: false };

    const land = new deck.GeoJsonLayer({
      id: 'land',
      data: window.LAND_GEOJSON,
      filled: true,
      stroked: true,
      getFillColor: [31, 31, 29],
      getLineColor: [56, 56, 53],
      lineWidthUnits: 'pixels',
      getLineWidth: 0.7,
      pickable: false,
    });

    function dots(id, law, opacity, pickable) {
      return new deck.ScatterplotLayer({
        id,
        data: DATA,
        binary: true,
        pickable,
        opacity,
        filled: true,
        stroked: false,
        radiusUnits: 'pixels',
        getRadius: 1.2,
        radiusMinPixels: 0.8,
        radiusMaxPixels: 4,
        getFillColor: [255, 255, 255],
        parameters: PARAMS,
        extensions: [EXTENSIONS[law]],
      });
    }

    let seq = 0;
    let active = { id: 'dots-0', law: 0 };
    let leaving = null;
    let raf = 0;
    let pinned = -1;
    let shown = -2;

    function layersAt(t) {
      const list = [land];
      const fading = leaving && t < 1;
      if (fading) list.push(dots(leaving.id, leaving.law, 1 - t, false));
      list.push(dots(active.id, active.law, fading ? t : 1, true));
      return list;
    }

    function hitIndex(info) {
      return info && info.layer && info.layer.id === active.id && info.index >= 0 ? info.index : -1;
    }

    const deckgl = new deck.Deck({
      parent: document.getElementById('map'),
      views: [new deck.MapView({ id: 'world', repeat: false })],
      initialViewState: { longitude: 8, latitude: 18, zoom: fitZoom(), minZoom: 0.5, maxZoom: 9 },
      controller: true,
      pickingRadius: 12,
      layers: layersAt(1),
      onHover(info) {
        if (pinned >= 0) return;
        const j = hitIndex(info);
        if (j === shown) return;
        shown = j;
        if (j < 0) showHint();
        else showDot(j, false);
      },
      onClick(info) {
        const j = hitIndex(info);
        pinned = j;
        shown = -2;
        if (j >= 0) showDot(j, true);
        else showHint();
      },
      onLoad() {
        document.body.dataset.ready = '1';
      },
    });

    function render(t) {
      deckgl.setProps({ layers: layersAt(t) });
    }

    function setLaw(law) {
      if (law === active.law) return;
      cancelAnimationFrame(raf);
      leaving = FADE_MS ? active : null;
      active = { id: `dots-${++seq}`, law };
      updateChrome(law);
      if (!FADE_MS) {
        render(1);
        return;
      }
      const began = performance.now();
      const step = (now) => {
        const t = Math.min(1, Math.max(0, (now - began) / FADE_MS));
        if (t >= 1) {
          leaving = null;
          render(1);
          return;
        }
        render(t);
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }

    // ---- Chrome: law buttons, results and inspector ----
    const seg = document.getElementById('seg');
    LAWS.forEach((law, i) => {
      const b = el('button', null, `Law ${i + 1}`);
      b.type = 'button';
      b.setAttribute('aria-label', law.name);
      b.addEventListener('click', () => setLaw(i));
      seg.append(b);
    });

    function updateChrome(law) {
      [...seg.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === law)));
      const L = LAWS[law];
      document.getElementById('lean-line').textContent =
        `Leans toward ${L.leans.map((t) => THEMES[t].name).join(' and ')}.`;
      document.getElementById('result-title').textContent =
        `${L.name}: what ${(TOTAL_PEOPLE / 1e9).toFixed(1)} billion people say`;

      const votes = document.getElementById('votes');
      votes.replaceChildren(...['yes', 'no', 'unsure'].map((k) => {
        const share = VOTE_SHARE[law][k];
        const row = el('div', 'row');
        const lab = el('span', 'lab');
        const chip = el('span', 'chip');
        chip.style.background = DOT_COLORS[k];
        lab.append(chip, VOTE_LABEL[k]);
        const track = el('div', 'track');
        const fill = el('i');
        fill.style.width = `${(share * 100).toFixed(2)}%`;
        fill.style.background = DOT_COLORS[k];
        track.append(fill);
        const val = el(
          'span',
          'val num',
          `${((share * TOTAL_PEOPLE) / 1e9).toFixed(2)} B · ${(share * 100).toFixed(1)}%`,
        );
        row.append(lab, track, val);
        return row;
      }));

      const themes = document.getElementById('themes');
      themes.replaceChildren(...THEMES.map((theme, t) => {
        const share = THEME_SHARE[law][t];
        const row = el('div', 'row');
        const track = el('div', 'track');
        const fill = el('i');
        fill.style.width = `${((share / SHARE_MAX) * 100).toFixed(2)}%`;
        fill.style.background = DOT_COLORS.yes;
        track.append(fill);
        row.append(el('span', 'lab', theme.name), track, el('span', 'val num', `${(share * 100).toFixed(1)}%`));
        return row;
      }));
    }

    function showHint() {
      document.getElementById('dot-title').textContent = 'Hover a dot';
      document.getElementById('dot-meta').textContent =
        `Each dot stands for about ${nf.format(Math.round(PEOPLE_PER_DOT))} people. ` +
        'Hover one to see the five thoughts it drew, or click to pin it.';
      document.getElementById('dot-pin').textContent = '';
      document.getElementById('dot-rows').replaceChildren();
    }

    function showDot(j, pin) {
      const lon = POS[2 * j];
      const lat = POS[2 * j + 1];
      document.getElementById('dot-title').textContent = `Dot ${nf.format(j)}`;
      document.getElementById('dot-meta').textContent =
        `Stands for about ${nf.format(Math.round(PEOPLE_PER_DOT))} people at ` +
        `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}.`;
      document.getElementById('dot-pin').textContent = pin ? 'Pinned. Press Esc to release.' : '';
      document.getElementById('dot-rows').replaceChildren(...LAWS.map((law, l) => {
        const th = THOUGHTS[thoughtFor(j, l)];
        const vote = voteOf(th.stance);
        const li = el('li', 'resp');
        const chip = el('span', 'chip');
        chip.style.background = DOT_COLORS[vote];
        const body = el('div');
        const head = el('div', 'resp-head');
        head.append(el('b', null, law.name), ' · ', el('span', 'vote', VOTE_LABEL[vote]));
        body.append(head, el('div', 'soft', th.text), el('div', 'muted small', THEMES[th.theme].name));
        li.append(chip, body);
        return li;
      }));
    }

    // Pool list (collapsed by default).
    const pool = document.getElementById('pool-list');
    THEMES.forEach((theme, t) => {
      pool.append(el('h3', null, theme.name));
      const ul = el('ul');
      THOUGHTS.filter((th) => th.theme === t).forEach((th) => {
        ul.append(el('li', null, `${VOTE_LABEL[voteOf(th.stance)]}: ${th.text}`));
      });
      pool.append(ul);
    });

    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key >= '1' && e.key <= '5') setLaw(Number(e.key) - 1);
      if (e.key === 'Escape') {
        pinned = -1;
        shown = -2;
        showHint();
      }
    });

    updateChrome(0);
    showHint();
    document.getElementById('loading').remove();
  }

  function fail(err) {
    console.error(err);
    const box = document.getElementById('loading');
    box.textContent = `Could not start the map. ${err && err.message ? err.message : err}`;
    box.classList.add('error');
  }

  setTimeout(() => {
    if (!window.deck) {
      fail(new Error('deck.gl did not load. Check the connection and reload.'));
      return;
    }
    start().catch(fail);
  }, 30);
})();
