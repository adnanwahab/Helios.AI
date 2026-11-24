export const PALETTES = ['aurora', 'ocean', 'orchid', 'ember', 'galaxy', 'jade'];
export const PART_TYPES = ['ellipsoid', 'box', 'cylinder', 'cone', 'torus', 'tube', 'wing'];
export const PART_COLORS = ['primary', 'secondary', 'accent', 'highlight', 'shadow'];
const pointSchema = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
  required: ['x', 'y', 'z'], additionalProperties: false,
};

// Restricted geometry language: model invents a layout, browser generates the points.
// No executable code from the model is ever evaluated.
export const SHAPE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    palette: { type: 'string', enum: PALETTES },
    parts: {
      type: 'array', items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: PART_TYPES },
          center: pointSchema,
          size: pointSchema,
          rotation: pointSchema,
          color: { type: 'string', enum: PART_COLORS },
          weight: { type: 'number' },
          path: { type: 'array', items: pointSchema },
        },
        required: ['kind', 'center', 'size', 'rotation', 'color', 'weight', 'path'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'description', 'palette', 'parts'],
  additionalProperties: false,
};

const finiteClamp = (n, low, high, fallback = 0) =>
  Number.isFinite(n) ? Math.max(low, Math.min(high, n)) : fallback;
const cleanPoint = (p, low, high, fallback) => ({
  x: finiteClamp(p?.x, low, high, fallback),
  y: finiteClamp(p?.y, low, high, fallback),
  z: finiteClamp(p?.z, low, high, fallback),
});

export function sanitizeShape(scene) {
  if (!scene || !Array.isArray(scene.parts) || scene.parts.length === 0) {
    throw new Error('The model returned no renderable shape parts.');
  }
  const parts = scene.parts.slice(0, 32).map(part => {
    const kind = PART_TYPES.includes(part?.kind) ? part.kind : 'ellipsoid';
    return {
      kind,
      center: cleanPoint(part?.center, -8, 8, 0),
      size: cleanPoint(part?.size, 0.025, 6, 0.5),
      rotation: cleanPoint(part?.rotation, -6.2832, 6.2832, 0),
      color: PART_COLORS.includes(part?.color) ? part.color : 'primary',
      weight: finiteClamp(part?.weight, 0.2, 4, 1),
      path: Array.isArray(part?.path)
        ? part.path.slice(0, 24).map(p => cleanPoint(p, -8, 8, 0)) : [],
    };
  });
  return {
    title: String(scene.title || 'Untitled creation').slice(0, 56),
    description: String(scene.description || 'AI-generated particle sculpture').slice(0, 180),
    palette: PALETTES.includes(scene.palette) ? scene.palette : 'aurora',
    parts,
  };
}

export const SHAPE_INSTRUCTIONS = `You are a talented 3D sculptor working in a limited, declarative geometric language. Turn the user's text into an instantly recognizable, beautiful 3D object or concept, assembled from AT MOST 28 geometry primitives. Return the structured JSON. Do not respond with prose or code.

Coordinate system: x is right, y is up, z faces the camera. Everything should be centered around the origin, approximately 4 to 5 units across. For humans, animals, plants, structures or machines, build recognizable features and spatial anatomy: silhouette first, then head/body/tail/eyes/wings/etc. Avoid simply producing a single sphere for a specific object. Use distinct pieces, correct relative positioning, and the requested color mood.

Allowed parts:
- ellipsoid: surface of ellipsoid with half-axis radii (size.x, size.y, size.z).
- box: rectangular surface with half-extent sizes.
- cylinder: vertical cylinder surface; radius size.x, half-height size.y.
- cone: vertical taper with base at y=-size.y and tip at y=+size.y, base radius size.x.
- torus: donut ring oriented around y axis; major radius size.x, minor radius size.y.
- tube: a thin tubular surface along path points, provided in LOCAL coordinates relative to center; tube radius size.x. Use at least 2 path points. Good for antennae, limbs, tails, stems, tentacles.
- wing: a filled polygonal membrane triangulated as a fan from 3 to 8 path corners in LOCAL coordinates. Good for wings, sails, fins, leaf clusters, ears.

rotation is Euler radians (x then y then z). center, size and all path coordinates are in world units. Each part must have all fields; use path=[] except for tube and wing. Pick palette: aurora (cyan/violet), ocean (blue/teal), orchid (pink/purple), ember (orange/gold), galaxy (indigo/lilac), jade (green/mint). Color slot primary, secondary, accent, highlight, shadow. Weight controls relative particle density (0.2 to 4). Plan for a large, visually legible silhouette in a rotating point cloud. 12-26 parts is ideal for a complex animal; 5-15 parts for simpler designs. Keep title concise and description one brief vivid sentence.`;

/** A paid AI capability: disabled until the operator opts in explicitly. */
export function createMorphLabService({env = process.env, fetchImpl = fetch} = {}) {
  const apiKey = (env.OPENAI_API_KEY || '').trim();
  const model = (env.OPENAI_MODEL || 'gpt-4.1-mini').trim();
  const enabled = env.MORPHLAB_ENABLED === '1' && Boolean(apiKey);
  let active = 0;
  return {
    enabled,
    model: enabled ? model : null,
    config() { return {enabled, model: enabled ? model : null}; },
    async generate(prompt) {
      if (!enabled) throw new Error('MorphLab is not configured.');
      if (active >= 3) {
        const error = new Error('MorphLab is busy. Please try again.');
        error.code = 'MORPHLAB_BUSY';
        throw error;
      }
      active++;
      try {
        const upstream = await fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
          signal: AbortSignal.timeout(25_000),
          body: JSON.stringify({
            model, store: false, instructions: SHAPE_INSTRUCTIONS,
            input: `Sculpt the following as a particle sculpture: ${prompt}`,
            max_output_tokens: 5000,
            text: {format: {type: 'json_schema', name: 'particle_sculpture', strict: true, schema: SHAPE_SCHEMA}},
          }),
        });
        if (!upstream.ok) throw new Error('OpenAI response was unsuccessful.');
        const payload = await upstream.json();
        if (payload.status === 'incomplete') throw new Error('OpenAI shape response was truncated.');
        const output = payload.output?.flatMap(item => item.content || []).find(chunk => chunk.type === 'output_text')?.text;
        if (!output) throw new Error('OpenAI returned no shape.');
        return sanitizeShape(JSON.parse(output));
      } finally {
        active--;
      }
    },
  };
}
