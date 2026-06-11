import { RecipeMapper, type RecipeWithRelations } from './recipe.mapper';
import type { StorageService } from '../storage/storage.service';

function buildRecipe(overrides: Partial<RecipeWithRelations> = {}): RecipeWithRelations {
  const base = {
    id: 'r-1',
    userId: 'u-1',
    title: 'Chicken Rice',
    description: 'Classic hawker dish',
    source: 'MANUAL',
    status: 'READY',
    sourceUrl: null,
    imageUrl: null,
    rawText: null,
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 60,
    instructions: ['Poach chicken', 'Cook rice'],
    tags: ['hawker', 'chicken'],
    cuisine: 'Singaporean',
    isPublic: false,
    failureReason: null,
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    updatedAt: new Date('2026-06-01T08:00:00.000Z'),
    deletedAt: null,
    ingredients: [
      {
        id: 'ri-2',
        recipeId: 'r-1',
        ingredientId: null,
        rawText: 'Salt to taste',
        quantity: null,
        unit: null,
        normalizedQtyG: null,
        optional: false,
        matchConfidence: null,
        sortOrder: 1,
        ingredient: null,
      },
      {
        id: 'ri-1',
        recipeId: 'r-1',
        ingredientId: 'ing-1',
        rawText: '500g chicken breast',
        quantity: 500,
        unit: 'g',
        normalizedQtyG: 500,
        optional: false,
        matchConfidence: 1,
        sortOrder: 0,
        ingredient: {
          id: 'ing-1',
          name: 'chicken breast',
          displayName: 'Chicken Breast',
          category: 'MEAT',
          defaultUnit: 'g',
          density: null,
          gramsPerPiece: 250,
          imageUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ],
    nutrition: {
      id: 'n-1',
      recipeId: 'r-1',
      calories: 542.5,
      proteinG: 80.2,
      carbsG: 28.2,
      fatG: 9,
      fibreG: 0.4,
      sodiumMg: 185,
      sugarG: 0,
      healthScore: 88.5,
      computedAt: new Date(),
    },
  };
  return { ...base, ...overrides } as unknown as RecipeWithRelations;
}

describe('RecipeMapper', () => {
  const getSignedUrl = jest.fn();
  const storage = { getSignedUrl } as unknown as StorageService;
  const mapper = new RecipeMapper(storage);

  beforeEach(() => {
    getSignedUrl.mockReset();
    getSignedUrl.mockResolvedValue('https://minio.local/signed-url?sig=abc');
  });

  it('maps scalar fields, sorts ingredients by sortOrder, and maps nutrition', async () => {
    const dto = await mapper.toDto(buildRecipe());

    expect(dto.id).toBe('r-1');
    expect(dto.title).toBe('Chicken Rice');
    expect(dto.source).toBe('MANUAL');
    expect(dto.status).toBe('READY');
    expect(dto.servings).toBe(4);
    expect(dto.instructions).toEqual(['Poach chicken', 'Cook rice']);
    expect(dto.createdAt).toBe('2026-06-01T08:00:00.000Z');

    // sorted by sortOrder, not array order
    expect(dto.ingredients.map((i) => i.id)).toEqual(['ri-1', 'ri-2']);
    expect(dto.ingredients[0].ingredient).toEqual({
      id: 'ing-1',
      name: 'chicken breast',
      displayName: 'Chicken Breast',
      category: 'MEAT',
    });
    expect(dto.ingredients[1].ingredient).toBeNull();
    expect(dto.ingredients[1].quantity).toBeNull();

    expect(dto.nutrition).toEqual({
      calories: 542.5,
      proteinG: 80.2,
      carbsG: 28.2,
      fatG: 9,
      fibreG: 0.4,
      sodiumMg: 185,
      sugarG: 0,
      healthScore: 88.5,
    });
  });

  it('presigns storage keys stored in imageUrl', async () => {
    const dto = await mapper.toDto(
      buildRecipe({ imageUrl: 'recipes/u-1/abc-photo.jpg' } as Partial<RecipeWithRelations>),
    );
    expect(getSignedUrl).toHaveBeenCalledWith('recipes/u-1/abc-photo.jpg');
    expect(dto.imageUrl).toBe('https://minio.local/signed-url?sig=abc');
  });

  it('passes external http(s) image URLs through untouched', async () => {
    const dto = await mapper.toDto(
      buildRecipe({ imageUrl: 'https://example.sg/kaya.jpg' } as Partial<RecipeWithRelations>),
    );
    expect(getSignedUrl).not.toHaveBeenCalled();
    expect(dto.imageUrl).toBe('https://example.sg/kaya.jpg');
  });

  it('degrades to a null imageUrl when presigning fails', async () => {
    getSignedUrl.mockRejectedValue(new Error('minio down'));
    const dto = await mapper.toDto(
      buildRecipe({ imageUrl: 'recipes/u-1/abc.jpg' } as Partial<RecipeWithRelations>),
    );
    expect(dto.imageUrl).toBeNull();
  });

  it('maps null nutrition and empty ingredients', async () => {
    const dto = await mapper.toDto(
      buildRecipe({ nutrition: null, ingredients: [] } as Partial<RecipeWithRelations>),
    );
    expect(dto.nutrition).toBeNull();
    expect(dto.ingredients).toEqual([]);
  });
});
