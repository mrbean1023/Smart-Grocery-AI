import {
  extractRecipeJsonLd,
  extractVisibleText,
  parseIso8601DurationToMinutes,
} from './recipe-extraction';

const JSON_LD_FIXTURE = `
<!DOCTYPE html>
<html>
<head>
  <title>Hainanese Chicken Rice</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Hainanese Chicken Rice",
    "description": "Singapore's national dish.",
    "image": { "@type": "ImageObject", "url": "https://example.sg/chicken-rice.jpg" },
    "recipeYield": "4 servings",
    "prepTime": "PT15M",
    "cookTime": "PT1H10M",
    "recipeCuisine": "Singaporean",
    "keywords": "chicken, rice, hawker",
    "recipeIngredient": [
      "1 whole chicken (about 1.5 kg)",
      "2 cups jasmine rice",
      "4 cloves garlic, minced",
      "1 tbsp light soy sauce",
      "Salt to taste"
    ],
    "recipeInstructions": [
      { "@type": "HowToStep", "text": "Poach the chicken in simmering water for 40 minutes." },
      { "@type": "HowToStep", "text": "Fry garlic, then cook rice in the poaching stock." }
    ]
  }
  </script>
</head>
<body><h1>Hainanese Chicken Rice</h1></body>
</html>`;

const GRAPH_FIXTURE = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "name": "Some Food Blog" },
    {
      "@type": ["Recipe", "NewsArticle"],
      "name": "Kaya Toast",
      "recipeYield": 2,
      "image": ["https://example.sg/kaya.jpg"],
      "recipeIngredient": ["4 slices bread", "2 tbsp kaya", "1 tbsp butter (optional)"],
      "recipeInstructions": "Toast the bread.\\nSpread kaya and butter."
    }
  ]
}
</script>
</head><body></body></html>`;

const NO_RECIPE_FIXTURE = `
<html><head>
<script type="application/ld+json">{"@type": "NewsArticle", "headline": "Not food"}</script>
</head>
<body>
  <nav>Home | About</nav>
  <article class="recipe-content">
    Laksa lemak. Ingredients: 200 g rice noodles, 400 ml coconut milk, 2 tbsp laksa paste,
    100 g prawns. Boil the noodles, simmer everything together for 10 minutes, then serve
    hot with sambal and a sprinkle of laksa leaves on top for an authentic hawker flavour.
  </article>
  <footer>Copyright</footer>
</body></html>`;

describe('parseIso8601DurationToMinutes', () => {
  it('parses minutes-only durations', () => {
    expect(parseIso8601DurationToMinutes('PT15M')).toBe(15);
  });
  it('parses hour+minute durations', () => {
    expect(parseIso8601DurationToMinutes('PT1H10M')).toBe(70);
  });
  it('parses day durations', () => {
    expect(parseIso8601DurationToMinutes('P1D')).toBe(1440);
  });
  it('returns null for junk', () => {
    expect(parseIso8601DurationToMinutes('45 minutes')).toBeNull();
    expect(parseIso8601DurationToMinutes(null)).toBeNull();
    expect(parseIso8601DurationToMinutes('P')).toBeNull();
  });
});

describe('extractRecipeJsonLd', () => {
  it('extracts a complete Recipe node', () => {
    const recipe = extractRecipeJsonLd(JSON_LD_FIXTURE);
    expect(recipe).not.toBeNull();
    expect(recipe!.title).toBe('Hainanese Chicken Rice');
    expect(recipe!.description).toBe("Singapore's national dish.");
    expect(recipe!.servings).toBe(4);
    expect(recipe!.prepMinutes).toBe(15);
    expect(recipe!.cookMinutes).toBe(70);
    expect(recipe!.cuisine).toBe('Singaporean');
    expect(recipe!.tags).toEqual(['chicken', 'rice', 'hawker']);
    expect(recipe!.imageUrl).toBe('https://example.sg/chicken-rice.jpg');
    expect(recipe!.ingredients).toHaveLength(5);
    expect(recipe!.ingredients[3]).toEqual({
      rawText: '1 tbsp light soy sauce',
      optional: false,
    });
    expect(recipe!.instructions).toEqual([
      'Poach the chicken in simmering water for 40 minutes.',
      'Fry garlic, then cook rice in the poaching stock.',
    ]);
  });

  it('finds the Recipe inside an @graph wrapper with array @type', () => {
    const recipe = extractRecipeJsonLd(GRAPH_FIXTURE);
    expect(recipe).not.toBeNull();
    expect(recipe!.title).toBe('Kaya Toast');
    expect(recipe!.servings).toBe(2);
    expect(recipe!.imageUrl).toBe('https://example.sg/kaya.jpg');
    expect(recipe!.ingredients).toHaveLength(3);
    expect(recipe!.ingredients[2].optional).toBe(true); // "(optional)" in line
    // newline-separated instruction blob is split into steps
    expect(recipe!.instructions).toEqual(['Toast the bread.', 'Spread kaya and butter.']);
  });

  it('returns null when no Recipe JSON-LD exists', () => {
    expect(extractRecipeJsonLd(NO_RECIPE_FIXTURE)).toBeNull();
    expect(extractRecipeJsonLd('<html><body>plain page</body></html>')).toBeNull();
  });

  it('ignores malformed JSON-LD blocks', () => {
    const html =
      '<html><head><script type="application/ld+json">{not json</script></head><body></body></html>';
    expect(extractRecipeJsonLd(html)).toBeNull();
  });
});

describe('extractVisibleText', () => {
  it('prefers recipe-like containers and drops chrome', () => {
    const text = extractVisibleText(NO_RECIPE_FIXTURE);
    expect(text).toContain('Laksa lemak');
    expect(text).toContain('200 g rice noodles');
    expect(text).not.toContain('Copyright');
    expect(text).not.toContain('Home | About');
  });

  it('falls back to the body text', () => {
    const text = extractVisibleText('<html><body><p>short page</p></body></html>');
    expect(text).toBe('short page');
  });
});
