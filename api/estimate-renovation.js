const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `Du er en dansk renoveringsekspert og prisberegner. Du estimerer materiale- og arbejdsomkostninger for renoveringsprojekter i Danmark baseret på aktuelle markedspriser (2026).

Regler:
- Alle priser i danske kroner (DKK), inkl. moms
- Opdel i individuelle poster med materialeomkostning og arbejdsløn separat
- Brug realistiske danske håndværkerpriser (typisk 350-550 kr./time inkl. moms)
- Materialepriser baseret på danske byggemarkeder og grossister (Bauhaus, XL-BYG, Stark, etc.)
- Juster kvalitetsniveau: "budget" = billigste funktionelle løsning, "mellem" = god standard, "høj" = premium materialer
- Tag højde for byggeår - ældre bygninger kan kræve ekstra arbejde (asbest, gammelt el, bærende vægge)
- Tilføj altid en post for "Uforudsete udgifter" (8-12% af subtotal)
- Svar KUN med valid JSON, ingen anden tekst

JSON format:
{
  "items": [
    {"desc": "Beskrivende postnavn", "materialCost": number, "laborCost": number, "totalCost": number}
  ],
  "totalMaterial": number,
  "totalLabor": number,
  "totalEstimate": number,
  "notes": "Kort note om forbehold eller anbefalinger"
}`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY er ikke konfigureret.' });
  }

  const { roomType, squareMeters, qualityLevel, description, yearBuilt, propertySize } = req.body || {};

  if (!description && !roomType) {
    return res.status(400).json({ success: false, error: 'Angiv rumtype eller beskrivelse.' });
  }

  const roomLabels = {
    'badeværelse': 'badeværelse', 'køkken': 'køkken', 'stue': 'stue',
    'soveværelse': 'soveværelse', 'entré': 'entré/gang', 'kælder': 'kælder',
    'tag': 'tag/tagkonstruktion', 'facade': 'facade/ydervægge',
    'hel-lejlighed': 'hel lejlighed/hus', 'andet': 'rum'
  };

  let userMessage = `Estimer renovering af ${roomLabels[roomType] || roomType || 'rum'}`;
  if (squareMeters > 0) userMessage += ` på ${squareMeters} m²`;
  userMessage += '.';
  if (qualityLevel) userMessage += ` Kvalitetsniveau: ${qualityLevel}.`;
  if (yearBuilt > 0) userMessage += ` Byggeår: ${yearBuilt}.`;
  if (propertySize > 0) userMessage += ` Samlet boligareal: ${propertySize} m².`;
  if (description) userMessage += `\nDetaljer: ${description}`;

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });

    const text = message.content[0]?.text || '';

    // Extract JSON from response (handle potential markdown wrapping)
    let jsonStr = text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr.message, 'Raw:', text.substring(0, 500));
      return res.status(500).json({ success: false, error: 'AI-svar kunne ikke fortolkes. Prøv igen.' });
    }

    // Validate structure
    if (!result.items || !Array.isArray(result.items)) {
      return res.status(500).json({ success: false, error: 'Ugyldigt estimat-format. Prøv igen.' });
    }

    // Ensure numeric fields
    result.items = result.items.map(item => ({
      desc: String(item.desc || 'Post'),
      materialCost: Math.round(Number(item.materialCost) || 0),
      laborCost: Math.round(Number(item.laborCost) || 0),
      totalCost: Math.round(Number(item.totalCost) || 0)
    }));

    result.totalMaterial = result.items.reduce((s, i) => s + i.materialCost, 0);
    result.totalLabor = result.items.reduce((s, i) => s + i.laborCost, 0);
    result.totalEstimate = result.items.reduce((s, i) => s + i.totalCost, 0);

    return res.status(200).json({
      success: true,
      items: result.items,
      totalMaterial: result.totalMaterial,
      totalLabor: result.totalLabor,
      totalEstimate: result.totalEstimate,
      notes: result.notes || ''
    });

  } catch (err) {
    console.error('Anthropic error:', err.message);

    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ success: false, error: 'Ugyldig API-nøgle.' });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ success: false, error: 'For mange forespørgsler. Prøv igen om lidt.' });
    }

    return res.status(500).json({ success: false, error: 'AI-estimering fejlede: ' + err.message });
  }
};
