const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// TODO: Replace with your actual API keys
const ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY_HERE';
const WEAVY_URL = 'YOUR_WEAVY_ENVIRONMENT_URL_HERE'; // e.g. https://your-env.weavy.io
const WEAVY_API_KEY = 'YOUR_WEAVY_API_KEY_HERE';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

// ─── Size → viewBox map ────────────────────────────────────────────────────
const SIZE_MAP = {
  '16:9': { vb: '0 0 1600 900',  w: 1600, h: 900  },
  '9:16': { vb: '0 0 900 1600',  w: 900,  h: 1600 },
  '3:4':  { vb: '0 0 900 1200',  w: 900,  h: 1200 },
  '4:3':  { vb: '0 0 1200 900',  w: 1200, h: 900  },
  '1:1':  { vb: '0 0 1000 1000', w: 1000, h: 1000 },
};

// ─── /api/generate ────────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const {
    prompt = 'A family using healthcare services',
    category = 'Healthcare',
    strength = 50,
    colors = '3',
    size = '16:9',
    background = 'fill',
  } = req.body;

  const { vb, w, h } = SIZE_MAP[size] || SIZE_MAP['16:9'];

  // Complexity from strength slider (0–100)
  let complexityLabel, complexityDetail;
  if (strength < 34) {
    complexityLabel = 'simple and minimal';
    complexityDetail = 'Use only 3–5 large simple shapes. Minimal elements, lots of negative space, very clean and uncluttered.';
  } else if (strength < 67) {
    complexityLabel = 'moderately detailed';
    complexityDetail = 'Use 8–15 distinct elements. Balanced composition with some supporting details like shadows, small objects, and background elements.';
  } else {
    complexityLabel = 'highly detailed and complex';
    complexityDetail = 'Use 20+ elements. Rich scene with intricate patterns, textures, many figures, architectural details, and layered depth.';
  }

  // Colors palette description
  const numColors = parseInt(colors) || 3;
  const paletteLines = [
    'Primary orange: #EC810F',
    'Deep teal: #125365',
    'Warm beige: #F0EDE4',
    'Warm skin tone: #F5C5A3',
    'Dark skin tone: #C47B4E',
    'Golden accent: #F4A742',
    'Deep navy: #0A2E3D',
  ].slice(0, Math.max(numColors, 3)).join(', ');

  const bgLine = background === 'fill'
    ? `Include a full-bleed background <rect x="0" y="0" width="${w}" height="${h}" fill="#F0EDE4"/> as the very first element inside <svg>.`
    : `Do NOT include any background rectangle. The SVG background must be transparent (no fill on root or any bg rect).`;

  const systemPrompt = `You are an expert SVG illustrator creating flat isometric illustrations for Covered California, California's official health insurance marketplace.

VISUAL STYLE — follow exactly:
• Flat illustration with isometric / axonometric perspective (objects drawn at ~30–45° angle, like a tilted top-down view)
• Every major shape has a thick black outline (stroke="#1A1A1A", stroke-width="2.5" to "4")
• Solid fills only — absolutely no gradients, no filters, no blur, no drop-shadow filters
• Stylized, abstract human figures (not realistic). Rounded limbs, simple faces
• Warm skin tones for people: #F5C5A3 (light) or #C47B4E (medium/dark)
• California and community-oriented imagery when relevant

PALETTE — use only these colors (${numColors} accent colors):
${paletteLines}
Black outline: #1A1A1A

COMPLEXITY: ${complexityLabel}
${complexityDetail}

TECHNICAL — strict requirements:
• Output ONLY the raw SVG. No markdown, no code fences, no explanation
• Start exactly with <svg and end exactly with </svg>
• Use viewBox="${vb}" — do NOT set explicit width/height attributes on the root <svg>
• ${bgLine}
• Group related shapes with <g> elements
• Use only: rect, circle, ellipse, polygon, polyline, path, line, g, title
• No <image>, no <use> referencing external files, no <script>, no <foreignObject>
• No text labels or typography inside the illustration
• Ensure all shapes are within the viewBox boundaries
• Make the composition fill the viewBox well — avoid excessive empty space at edges`;

  const userPrompt = `Create a flat isometric SVG illustration for Covered California.

Subject: ${prompt}
Category theme: ${category}
Complexity: ${complexityLabel}

Use the Covered California brand colors (orange #EC810F, teal #125365) prominently. Apply thick black outlines to all shapes. Draw in a flat isometric perspective with stylized human figures if appropriate.

Output ONLY the SVG code — nothing else.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let svg = message.content[0].text.trim();

    // Strip any markdown fences if model added them
    const svgMatch = svg.match(/<svg[\s\S]*<\/svg>/i);
    if (svgMatch) svg = svgMatch[0];

    if (!svg.startsWith('<svg')) {
      return res.status(500).json({ error: 'Model did not return valid SVG.' });
    }

    res.json({ svg });
  } catch (err) {
    console.error('[/api/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── /api/weavy-config ────────────────────────────────────────────────────
// Returns the Weavy environment URL so the frontend can initialise wy-context.
app.get('/api/weavy-config', (req, res) => {
  const configured =
    WEAVY_URL    !== 'YOUR_WEAVY_ENVIRONMENT_URL_HERE' &&
    WEAVY_API_KEY !== 'YOUR_WEAVY_API_KEY_HERE';
  res.json({ configured, weavyUrl: configured ? WEAVY_URL : null });
});

// ─── /api/weavy-token ─────────────────────────────────────────────────────
// Called automatically by the Weavy SDK (tokenurl attribute).
// Must return { "access_token": "..." } — Weavy refreshes it as needed.
// Requires Node 18+ for built-in fetch; run `node -v` to confirm.
app.get('/api/weavy-token', async (req, res) => {
  if (
    WEAVY_URL     === 'YOUR_WEAVY_ENVIRONMENT_URL_HERE' ||
    WEAVY_API_KEY === 'YOUR_WEAVY_API_KEY_HERE'
  ) {
    return res.status(401).json({ error: 'Weavy credentials not configured in server.js' });
  }

  try {
    // Single shared user identity for all studio visitors.
    const userId = 'cc-studio-user';

    const response = await fetch(`${WEAVY_URL}/api/users/${userId}/tokens`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WEAVY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expires_in: 3600 }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Weavy ${response.status}: ${text}`);
    }

    const data = await response.json();
    // Return the shape the Weavy SDK expects
    res.json({ access_token: data.access_token });
  } catch (err) {
    console.error('[/api/weavy-token]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve index.html for all other routes ────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  CC Illustration Studio`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Local: http://localhost:${PORT}`);
  console.log(`\n  ⚠  Set ANTHROPIC_API_KEY in server.js before generating.`);
  if (WEAVY_URL === 'YOUR_WEAVY_ENVIRONMENT_URL_HERE') {
    console.log(`  ℹ  Weavy credentials not set — chat panel runs in demo mode.\n`);
  }
});
