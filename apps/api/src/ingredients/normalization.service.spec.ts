import { NormalizationService } from './normalization.service';

describe('NormalizationService', () => {
  const service = new NormalizationService();

  it('parses simple quantity + volume unit + name', () => {
    const parsed = service.normalizeLine('1 tbsp light soy sauce');
    expect(parsed.quantity).toBe(1);
    expect(parsed.unit).toBe('tbsp');
    expect(parsed.name).toBe('light soy sauce');
    expect(parsed.optional).toBe(false);
  });

  it('parses count units and strips trailing prep clause', () => {
    const parsed = service.normalizeLine('2 cloves garlic, minced');
    expect(parsed.quantity).toBe(2);
    expect(parsed.unit).toBe('cloves');
    expect(parsed.name).toBe('garlic');
  });

  it('splits glued quantity+unit and strips trailing notes', () => {
    const parsed = service.normalizeLine('500g chicken breast, skin removed');
    expect(parsed.quantity).toBe(500);
    expect(parsed.unit).toBe('g');
    expect(parsed.name).toBe('chicken breast');
  });

  it('handles SG wet-market unit catty', () => {
    const parsed = service.normalizeLine('1 catty kangkong');
    expect(parsed.quantity).toBe(1);
    expect(parsed.unit).toBe('catty');
    expect(parsed.name).toBe('kangkong');
  });

  it('handles "to taste" with no quantity', () => {
    const parsed = service.normalizeLine('Salt to taste');
    expect(parsed.quantity).toBeNull();
    expect(parsed.unit).toBeNull();
    expect(parsed.name).toBe('salt');
  });

  it('handles unicode fraction ½', () => {
    const parsed = service.normalizeLine('½ cup sugar');
    expect(parsed.quantity).toBe(0.5);
    expect(parsed.unit).toBe('cup');
    expect(parsed.name).toBe('sugar');
  });

  it('handles glued unicode mixed number like 1½', () => {
    const parsed = service.normalizeLine('1½ tsp sesame oil');
    expect(parsed.quantity).toBe(1.5);
    expect(parsed.unit).toBe('tsp');
    expect(parsed.name).toBe('sesame oil');
  });

  it('handles ascii mixed numbers', () => {
    const parsed = service.normalizeLine('1 1/2 cups jasmine rice');
    expect(parsed.quantity).toBe(1.5);
    expect(parsed.unit).toBe('cups');
    expect(parsed.name).toBe('jasmine rice');
  });

  it('handles plain fractions', () => {
    const parsed = service.normalizeLine('3/4 cup coconut milk');
    expect(parsed.quantity).toBe(0.75);
    expect(parsed.unit).toBe('cup');
    expect(parsed.name).toBe('coconut milk');
  });

  it('takes the midpoint of hyphen ranges', () => {
    const parsed = service.normalizeLine('2-3 stalks spring onion');
    expect(parsed.quantity).toBe(2.5);
    expect(parsed.unit).toBe('stalks');
    expect(parsed.name).toBe('spring onion');
  });

  it('takes the midpoint of "X to Y" ranges', () => {
    const parsed = service.normalizeLine('2 to 4 tbsp oyster sauce');
    expect(parsed.quantity).toBe(3);
    expect(parsed.unit).toBe('tbsp');
    expect(parsed.name).toBe('oyster sauce');
  });

  it('flags (optional) and removes parenthetical notes', () => {
    const parsed = service.normalizeLine('1 red chilli (optional)');
    expect(parsed.optional).toBe(true);
    expect(parsed.name).toBe('red chilli');
    expect(parsed.quantity).toBe(1);
  });

  it('flags ", optional" suffix', () => {
    const parsed = service.normalizeLine('2 tbsp fried shallots, optional');
    expect(parsed.optional).toBe(true);
    expect(parsed.name).toBe('fried shallots');
  });

  it('removes non-optional parenthetical notes from the name', () => {
    const parsed = service.normalizeLine('2 tbsp oil (vegetable or canola)');
    expect(parsed.quantity).toBe(2);
    expect(parsed.unit).toBe('tbsp');
    expect(parsed.name).toBe('oil');
    expect(parsed.optional).toBe(false);
  });

  it('parses decimals with kg', () => {
    const parsed = service.normalizeLine('1.5 kg pork belly');
    expect(parsed.quantity).toBe(1.5);
    expect(parsed.unit).toBe('kg');
    expect(parsed.name).toBe('pork belly');
  });

  it('treats bare count nouns as the ingredient name', () => {
    const parsed = service.normalizeLine('2 eggs');
    expect(parsed.quantity).toBe(2);
    expect(parsed.unit).toBe('piece');
    expect(parsed.name).toBe('eggs');
  });

  it('handles "2 eggs, beaten"', () => {
    const parsed = service.normalizeLine('2 eggs, beaten');
    expect(parsed.quantity).toBe(2);
    expect(parsed.unit).toBe('piece');
    expect(parsed.name).toBe('eggs');
  });

  it('strips descriptor words for matching', () => {
    const parsed = service.normalizeLine('3 tbsp finely chopped fresh coriander');
    expect(parsed.quantity).toBe(3);
    expect(parsed.unit).toBe('tbsp');
    expect(parsed.name).toBe('coriander');
  });

  it('strips size descriptors', () => {
    const parsed = service.normalizeLine('1 large onion, diced');
    expect(parsed.quantity).toBe(1);
    expect(parsed.name).toBe('onion');
  });

  it('handles the two-word unit "fl oz"', () => {
    const parsed = service.normalizeLine('4 fl oz evaporated milk');
    expect(parsed.quantity).toBe(4);
    expect(parsed.unit).toBe('fl oz');
    expect(parsed.name).toBe('evaporated milk');
  });

  it('drops the connective "of" after a unit', () => {
    const parsed = service.normalizeLine('2 cups of chicken stock');
    expect(parsed.quantity).toBe(2);
    expect(parsed.unit).toBe('cups');
    expect(parsed.name).toBe('chicken stock');
  });

  it('keeps the full name when no quantity is present', () => {
    const parsed = service.normalizeLine('dark soy sauce');
    expect(parsed.quantity).toBeNull();
    expect(parsed.unit).toBeNull();
    expect(parsed.name).toBe('dark soy sauce');
  });

  it('does not treat non-unit words as units', () => {
    const parsed = service.normalizeLine('3 garlic chives');
    expect(parsed.quantity).toBe(3);
    expect(parsed.unit).toBeNull();
    expect(parsed.name).toBe('garlic chives');
  });

  it('strips leading bullet markers', () => {
    const parsed = service.normalizeLine('- 200 g bean sprouts');
    expect(parsed.quantity).toBe(200);
    expect(parsed.unit).toBe('g');
    expect(parsed.name).toBe('bean sprouts');
  });

  it('handles unit with trailing period abbreviation', () => {
    const parsed = service.normalizeLine('2 tbsp. dark soy sauce');
    expect(parsed.quantity).toBe(2);
    expect(parsed.unit).toBe('tbsp');
    expect(parsed.name).toBe('dark soy sauce');
  });

  it('handles unicode fraction ranges like ½-1 tsp', () => {
    const parsed = service.normalizeLine('½-1 tsp white pepper');
    expect(parsed.quantity).toBe(0.75);
    expect(parsed.unit).toBe('tsp');
    expect(parsed.name).toBe('white pepper');
  });

  it('handles "salt and pepper to taste"', () => {
    const parsed = service.normalizeLine('salt and pepper to taste');
    expect(parsed.quantity).toBeNull();
    expect(parsed.name).toBe('salt and pepper');
  });

  it('handles tahil (1/16 catty) as a mass unit', () => {
    const parsed = service.normalizeLine('2 tahil dried shrimp');
    expect(parsed.quantity).toBe(2);
    expect(parsed.unit).toBe('tahil');
    expect(parsed.name).toBe('dried shrimp');
  });

  it('returns empty-safe output for whitespace input', () => {
    const parsed = service.normalizeLine('   ');
    expect(parsed.quantity).toBeNull();
    expect(parsed.unit).toBeNull();
    expect(parsed.name).toBe('');
    expect(parsed.optional).toBe(false);
  });
});
