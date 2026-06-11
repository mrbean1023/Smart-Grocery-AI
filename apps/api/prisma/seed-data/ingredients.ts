/**
 * 150+ ingredients common in Singapore home cooking, with local aliases and
 * realistic per-100g nutrition values.
 */

export type SeedIngredientCategory =
  | 'PRODUCE'
  | 'MEAT'
  | 'SEAFOOD'
  | 'DAIRY'
  | 'EGGS'
  | 'GRAINS'
  | 'BAKERY'
  | 'CANNED'
  | 'FROZEN'
  | 'CONDIMENTS'
  | 'SPICES'
  | 'OILS'
  | 'BEVERAGES'
  | 'SNACKS'
  | 'NOODLES_PASTA'
  | 'TOFU_SOY'
  | 'SAUCES'
  | 'BAKING'
  | 'OTHER';

export interface SeedNutrition {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fibreG: number;
  sodiumMg: number;
  sugarG: number;
}

export interface SeedIngredient {
  name: string; // canonical, lowercase, unique
  displayName: string;
  category: SeedIngredientCategory;
  defaultUnit: 'g' | 'ml' | 'piece';
  density?: number; // g/ml
  gramsPerPiece?: number;
  aliases: string[]; // >= 2, lowercase, include local names
  nutrition: SeedNutrition;
}

/** nutrition shorthand: calories, protein, carbs, fat, fibre, sodiumMg, sugar (per 100g) */
const n = (
  calories: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  fibreG: number,
  sodiumMg: number,
  sugarG: number,
): SeedNutrition => ({ calories, proteinG, carbsG, fatG, fibreG, sodiumMg, sugarG });

export const SEED_INGREDIENTS: SeedIngredient[] = [
  // ===================== PRODUCE =====================
  { name: 'kangkong', displayName: 'Kangkong', category: 'PRODUCE', defaultUnit: 'g', aliases: ['water spinach', 'ong choy', 'kong xin cai'], nutrition: n(19, 2.6, 3.1, 0.2, 2.1, 113, 0.5) },
  { name: 'kai lan', displayName: 'Kai Lan', category: 'PRODUCE', defaultUnit: 'g', aliases: ['chinese kale', 'gai lan', 'chinese broccoli'], nutrition: n(26, 1.2, 4.7, 0.8, 2.6, 7, 0.8) },
  { name: 'bok choy', displayName: 'Bok Choy', category: 'PRODUCE', defaultUnit: 'g', aliases: ['pak choi', 'xiao bai cai', 'nai bai'], nutrition: n(13, 1.5, 2.2, 0.2, 1.0, 65, 1.2) },
  { name: 'chye sim', displayName: 'Chye Sim', category: 'PRODUCE', defaultUnit: 'g', aliases: ['choy sum', 'cai xin', 'chinese flowering cabbage'], nutrition: n(17, 1.8, 2.4, 0.3, 1.4, 40, 1.0) },
  { name: 'spinach', displayName: 'Spinach', category: 'PRODUCE', defaultUnit: 'g', aliases: ['bayam', 'english spinach'], nutrition: n(23, 2.9, 3.6, 0.4, 2.2, 79, 0.4) },
  { name: 'round cabbage', displayName: 'Round Cabbage', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 900, aliases: ['cabbage', 'white cabbage', 'kobis'], nutrition: n(25, 1.3, 5.8, 0.1, 2.5, 18, 3.2) },
  { name: 'napa cabbage', displayName: 'Napa Cabbage', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 1000, aliases: ['wong bok', 'wombok', 'chinese cabbage'], nutrition: n(16, 1.2, 3.2, 0.2, 1.2, 9, 1.4) },
  { name: 'lettuce', displayName: 'Lettuce', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 300, aliases: ['iceberg lettuce', 'romaine lettuce'], nutrition: n(15, 1.4, 2.9, 0.2, 1.3, 28, 0.8) },
  { name: 'broccoli', displayName: 'Broccoli', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 350, aliases: ['brocolli', 'xi lan hua'], nutrition: n(34, 2.8, 6.6, 0.4, 2.6, 33, 1.7) },
  { name: 'cauliflower', displayName: 'Cauliflower', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 500, aliases: ['cauli', 'hua cai'], nutrition: n(25, 1.9, 5, 0.3, 2, 30, 1.9) },
  { name: 'carrot', displayName: 'Carrot', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 60, aliases: ['carrots', 'hong luo bo', 'lobak merah'], nutrition: n(41, 0.9, 9.6, 0.2, 2.8, 69, 4.7) },
  { name: 'potato', displayName: 'Potato', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 170, aliases: ['potatoes', 'us potato', 'kentang'], nutrition: n(77, 2, 17, 0.1, 2.2, 6, 0.8) },
  { name: 'sweet potato', displayName: 'Sweet Potato', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 200, aliases: ['kumara', 'ubi keledek', 'orange sweet potato'], nutrition: n(86, 1.6, 20, 0.1, 3, 55, 4.2) },
  { name: 'red onion', displayName: 'Red Onion', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 110, aliases: ['onion red', 'bawang merah'], nutrition: n(40, 1.1, 9.3, 0.1, 1.7, 4, 4.2) },
  { name: 'yellow onion', displayName: 'Yellow Onion', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 110, aliases: ['brown onion', 'holland onion', 'bawang besar'], nutrition: n(40, 1.1, 9.3, 0.1, 1.7, 4, 4.2) },
  { name: 'garlic', displayName: 'Garlic', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 50, aliases: ['garlic bulb', 'bawang putih', 'suan tou'], nutrition: n(149, 6.4, 33, 0.5, 2.1, 17, 1) },
  { name: 'ginger', displayName: 'Ginger', category: 'PRODUCE', defaultUnit: 'g', aliases: ['old ginger', 'halia', 'jiang'], nutrition: n(80, 1.8, 17.8, 0.8, 2, 13, 1.7) },
  { name: 'spring onion', displayName: 'Spring Onion', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 15, aliases: ['scallion', 'green onion', 'daun bawang'], nutrition: n(32, 1.8, 7.3, 0.2, 2.6, 16, 2.3) },
  { name: 'red chilli', displayName: 'Red Chilli', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 10, aliases: ['red chili', 'cili merah', 'chilli'], nutrition: n(40, 1.9, 8.8, 0.4, 1.5, 9, 5.3) },
  { name: 'chilli padi', displayName: 'Chilli Padi', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 2, aliases: ['bird eye chilli', 'cili padi', 'birds eye chili'], nutrition: n(40, 1.9, 8.8, 0.4, 1.5, 9, 5.3) },
  { name: 'tomato', displayName: 'Tomato', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 120, aliases: ['tomatoes', 'roma tomato'], nutrition: n(18, 0.9, 3.9, 0.2, 1.2, 5, 2.6) },
  { name: 'cucumber', displayName: 'Cucumber', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 250, aliases: ['timun', 'japanese cucumber'], nutrition: n(15, 0.7, 3.6, 0.1, 0.5, 2, 1.7) },
  { name: 'long bean', displayName: 'Long Bean', category: 'PRODUCE', defaultUnit: 'g', aliases: ['snake bean', 'yardlong bean', 'kacang panjang'], nutrition: n(47, 2.8, 8.4, 0.4, 3.6, 4, 3) },
  { name: 'french bean', displayName: 'French Bean', category: 'PRODUCE', defaultUnit: 'g', aliases: ['green bean', 'buncis'], nutrition: n(31, 1.8, 7, 0.2, 2.7, 6, 3.3) },
  { name: 'bean sprouts', displayName: 'Bean Sprouts', category: 'PRODUCE', defaultUnit: 'g', aliases: ['taugeh', 'taoge', 'mung bean sprouts'], nutrition: n(30, 3, 5.9, 0.2, 1.8, 6, 4.1) },
  { name: 'eggplant', displayName: 'Eggplant', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 300, aliases: ['brinjal', 'aubergine', 'terung'], nutrition: n(25, 1, 5.9, 0.2, 3, 2, 3.5) },
  { name: 'okra', displayName: 'Okra', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 15, aliases: ['lady finger', 'ladies finger', 'bendi'], nutrition: n(33, 1.9, 7.5, 0.2, 3.2, 7, 1.5) },
  { name: 'lime', displayName: 'Lime', category: 'PRODUCE', defaultUnit: 'piece', gramsPerPiece: 30, aliases: ['calamansi', 'limau', 'small lime'], nutrition: n(30, 0.7, 10.5, 0.2, 2.8, 2, 1.7) },
  { name: 'lemon', displayName: 'Lemon', category: 'PRODUCE', defaultUnit: 'piece', gramsPerPiece: 100, aliases: ['lemons', 'yellow lemon'], nutrition: n(29, 1.1, 9.3, 0.3, 2.8, 2, 2.5) },
  { name: 'banana', displayName: 'Banana', category: 'PRODUCE', defaultUnit: 'piece', gramsPerPiece: 120, aliases: ['pisang', 'cavendish banana'], nutrition: n(89, 1.1, 22.8, 0.3, 2.6, 1, 12.2) },
  { name: 'pandan leaves', displayName: 'Pandan Leaves', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 3, aliases: ['screwpine leaves', 'daun pandan'], nutrition: n(32, 1.5, 7, 0.1, 3.5, 3, 0.5) },
  { name: 'lemongrass', displayName: 'Lemongrass', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 20, aliases: ['serai', 'citronella stalk'], nutrition: n(99, 1.8, 25.3, 0.5, 0, 6, 0) },
  { name: 'galangal', displayName: 'Galangal', category: 'PRODUCE', defaultUnit: 'g', aliases: ['blue ginger', 'lengkuas'], nutrition: n(71, 1.2, 15, 0.7, 2.4, 10, 0) },
  { name: 'coriander', displayName: 'Coriander', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 25, aliases: ['cilantro', 'chinese parsley', 'wansui'], nutrition: n(23, 2.1, 3.7, 0.5, 2.8, 46, 0.9) },
  { name: 'kaffir lime leaves', displayName: 'Kaffir Lime Leaves', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 1, aliases: ['makrut lime leaves', 'daun limau purut'], nutrition: n(50, 1.5, 11, 0.5, 5, 5, 0.5) },
  { name: 'shiitake mushroom', displayName: 'Shiitake Mushroom', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 20, aliases: ['fresh shiitake', 'donggu', 'chinese mushroom'], nutrition: n(34, 2.2, 6.8, 0.5, 2.5, 9, 2.4) },
  { name: 'enoki mushroom', displayName: 'Enoki Mushroom', category: 'PRODUCE', defaultUnit: 'g', aliases: ['golden needle mushroom', 'jin zhen gu'], nutrition: n(37, 2.7, 7.8, 0.3, 2.7, 3, 0.2) },
  { name: 'button mushroom', displayName: 'Button Mushroom', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 15, aliases: ['white mushroom', 'champignon'], nutrition: n(22, 3.1, 3.3, 0.3, 1, 5, 2) },
  { name: 'sweet corn', displayName: 'Sweet Corn', category: 'PRODUCE', defaultUnit: 'piece', gramsPerPiece: 250, aliases: ['corn on the cob', 'jagung'], nutrition: n(86, 3.3, 19, 1.4, 2, 15, 6.3) },
  { name: 'pumpkin', displayName: 'Pumpkin', category: 'PRODUCE', defaultUnit: 'g', aliases: ['labu', 'butternut pumpkin'], nutrition: n(26, 1, 6.5, 0.1, 0.5, 1, 2.8) },
  { name: 'curry leaves', displayName: 'Curry Leaves', category: 'PRODUCE', defaultUnit: 'g', gramsPerPiece: 1, aliases: ['daun kari', 'kari patta'], nutrition: n(108, 6.1, 18.7, 1, 6.4, 8, 0) },

  // ===================== MEAT =====================
  { name: 'chicken breast', displayName: 'Chicken Breast', category: 'MEAT', defaultUnit: 'g', gramsPerPiece: 250, aliases: ['chicken fillet', 'boneless chicken breast', 'skinless chicken breast'], nutrition: n(165, 31, 0, 3.6, 0, 74, 0) },
  { name: 'chicken thigh', displayName: 'Chicken Thigh', category: 'MEAT', defaultUnit: 'g', gramsPerPiece: 120, aliases: ['boneless chicken thigh', 'chicken leg meat'], nutrition: n(209, 18.6, 0, 14.7, 0, 84, 0) },
  { name: 'whole chicken', displayName: 'Whole Chicken', category: 'MEAT', defaultUnit: 'piece', gramsPerPiece: 1200, aliases: ['fresh whole chicken', 'kampong chicken'], nutrition: n(215, 18.6, 0, 15.1, 0, 70, 0) },
  { name: 'chicken wings', displayName: 'Chicken Wings', category: 'MEAT', defaultUnit: 'g', gramsPerPiece: 90, aliases: ['mid joint wings', 'chicken wing'], nutrition: n(203, 18.3, 0, 14, 0, 73, 0) },
  { name: 'chicken drumstick', displayName: 'Chicken Drumstick', category: 'MEAT', defaultUnit: 'g', gramsPerPiece: 100, aliases: ['drumsticks', 'chicken leg'], nutrition: n(172, 18.8, 0, 10.2, 0, 88, 0) },
  { name: 'pork belly', displayName: 'Pork Belly', category: 'MEAT', defaultUnit: 'g', aliases: ['sam cham bak', 'wu hua rou'], nutrition: n(518, 9.3, 0, 53, 0, 32, 0) },
  { name: 'minced pork', displayName: 'Minced Pork', category: 'MEAT', defaultUnit: 'g', aliases: ['ground pork', 'pork mince'], nutrition: n(263, 16.9, 0, 21.2, 0, 56, 0) },
  { name: 'pork ribs', displayName: 'Pork Ribs', category: 'MEAT', defaultUnit: 'g', aliases: ['prime ribs', 'spare ribs', 'pai gu'], nutrition: n(277, 16.5, 0, 23, 0, 75, 0) },
  { name: 'pork loin', displayName: 'Pork Loin', category: 'MEAT', defaultUnit: 'g', aliases: ['pork chop', 'pork fillet'], nutrition: n(143, 21, 0, 5.9, 0, 50, 0) },
  { name: 'beef sirloin', displayName: 'Beef Sirloin', category: 'MEAT', defaultUnit: 'g', aliases: ['sirloin steak', 'striploin'], nutrition: n(206, 26, 0, 11, 0, 55, 0) },
  { name: 'minced beef', displayName: 'Minced Beef', category: 'MEAT', defaultUnit: 'g', aliases: ['ground beef', 'beef mince'], nutrition: n(250, 17.2, 0, 20, 0, 67, 0) },
  { name: 'beef brisket', displayName: 'Beef Brisket', category: 'MEAT', defaultUnit: 'g', aliases: ['ngo chap', 'beef stew cut'], nutrition: n(218, 18.5, 0, 15.6, 0, 60, 0) },
  { name: 'lamb shoulder', displayName: 'Lamb Shoulder', category: 'MEAT', defaultUnit: 'g', aliases: ['mutton shoulder', 'lamb cut'], nutrition: n(245, 17.5, 0, 19.2, 0, 65, 0) },

  // ===================== SEAFOOD =====================
  { name: 'batang fish', displayName: 'Batang Fish', category: 'SEAFOOD', defaultUnit: 'g', aliases: ['spanish mackerel', 'tenggiri', 'batang steak'], nutrition: n(105, 20, 0, 2.5, 0, 59, 0) },
  { name: 'salmon fillet', displayName: 'Salmon Fillet', category: 'SEAFOOD', defaultUnit: 'g', gramsPerPiece: 200, aliases: ['salmon', 'norwegian salmon'], nutrition: n(208, 20, 0, 13, 0, 59, 0) },
  { name: 'sea bass', displayName: 'Sea Bass', category: 'SEAFOOD', defaultUnit: 'g', gramsPerPiece: 600, aliases: ['barramundi', 'siakap', 'kim bak lor'], nutrition: n(97, 18.4, 0, 2, 0, 68, 0) },
  { name: 'red snapper', displayName: 'Red Snapper', category: 'SEAFOOD', defaultUnit: 'g', gramsPerPiece: 700, aliases: ['ang kuey', 'ikan merah'], nutrition: n(100, 20.5, 0, 1.3, 0, 64, 0) },
  { name: 'pomfret', displayName: 'Pomfret', category: 'SEAFOOD', defaultUnit: 'g', gramsPerPiece: 400, aliases: ['white pomfret', 'bawal putih'], nutrition: n(96, 19, 0, 2, 0, 60, 0) },
  { name: 'prawns', displayName: 'Prawns', category: 'SEAFOOD', defaultUnit: 'g', gramsPerPiece: 25, aliases: ['shrimp', 'udang', 'grey prawns'], nutrition: n(99, 24, 0.2, 0.3, 0, 111, 0) },
  { name: 'squid', displayName: 'Squid', category: 'SEAFOOD', defaultUnit: 'g', gramsPerPiece: 150, aliases: ['sotong', 'calamari'], nutrition: n(92, 15.6, 3.1, 1.4, 0, 44, 0) },
  { name: 'mussels', displayName: 'Mussels', category: 'SEAFOOD', defaultUnit: 'g', aliases: ['green mussels', 'kupang'], nutrition: n(86, 11.9, 3.7, 2.2, 0, 286, 0) },
  { name: 'clams', displayName: 'Clams', category: 'SEAFOOD', defaultUnit: 'g', aliases: ['lala', 'vongole'], nutrition: n(86, 14.7, 3, 1, 0, 56, 0) },
  { name: 'dried shrimp', displayName: 'Dried Shrimp', category: 'SEAFOOD', defaultUnit: 'g', aliases: ['hae bee', 'udang kering'], nutrition: n(250, 50, 5, 3, 0, 1800, 0) },
  { name: 'ikan bilis', displayName: 'Ikan Bilis', category: 'SEAFOOD', defaultUnit: 'g', aliases: ['dried anchovies', 'anchovy', 'silver fish'], nutrition: n(170, 33, 0, 3, 0, 3668, 0) },
  { name: 'fish cake', displayName: 'Fish Cake', category: 'SEAFOOD', defaultUnit: 'piece', gramsPerPiece: 100, aliases: ['fishcake', 'yu bing'], nutrition: n(110, 11, 11, 2, 0.5, 600, 1.5) },
  { name: 'fish ball', displayName: 'Fish Ball', category: 'SEAFOOD', defaultUnit: 'piece', gramsPerPiece: 12, aliases: ['fishball', 'yu wan'], nutrition: n(77, 12, 4.5, 1, 0, 550, 0.5) },

  // ===================== DAIRY =====================
  { name: 'fresh milk', displayName: 'Fresh Milk', category: 'DAIRY', defaultUnit: 'ml', density: 1.03, aliases: ['full cream milk', 'whole milk', 'pasteurised milk'], nutrition: n(64, 3.3, 4.8, 3.6, 0, 44, 4.8) },
  { name: 'evaporated milk', displayName: 'Evaporated Milk', category: 'DAIRY', defaultUnit: 'ml', density: 1.07, aliases: ['unsweetened condensed milk', 'carnation milk'], nutrition: n(135, 6.8, 10, 7.6, 0, 106, 10) },
  { name: 'condensed milk', displayName: 'Condensed Milk', category: 'DAIRY', defaultUnit: 'ml', density: 1.29, aliases: ['sweetened condensed milk', 'susu pekat'], nutrition: n(321, 7.9, 54.4, 8.7, 0, 127, 54.4) },
  { name: 'butter', displayName: 'Butter', category: 'DAIRY', defaultUnit: 'g', aliases: ['unsalted butter', 'salted butter'], nutrition: n(717, 0.9, 0.1, 81, 0, 11, 0.1) },
  { name: 'cheddar cheese', displayName: 'Cheddar Cheese', category: 'DAIRY', defaultUnit: 'g', aliases: ['cheese slices', 'cheddar block'], nutrition: n(403, 24.9, 1.3, 33.1, 0, 621, 0.5) },
  { name: 'plain yogurt', displayName: 'Plain Yogurt', category: 'DAIRY', defaultUnit: 'g', aliases: ['natural yoghurt', 'greek yogurt'], nutrition: n(59, 10, 3.6, 0.4, 0, 36, 3.2) },
  { name: 'whipping cream', displayName: 'Whipping Cream', category: 'DAIRY', defaultUnit: 'ml', density: 0.99, aliases: ['heavy cream', 'thickened cream'], nutrition: n(340, 2.1, 2.8, 36, 0, 26, 2.9) },
  { name: 'coconut milk', displayName: 'Coconut Milk', category: 'DAIRY', defaultUnit: 'ml', density: 0.97, aliases: ['santan', 'coconut milk fresh'], nutrition: n(230, 2.3, 5.5, 23.8, 2.2, 15, 3.3) },

  // ===================== EGGS =====================
  { name: 'eggs', displayName: 'Chicken Eggs', category: 'EGGS', defaultUnit: 'piece', gramsPerPiece: 55, aliases: ['egg', 'fresh eggs', 'telur'], nutrition: n(143, 12.6, 0.7, 9.5, 0, 142, 0.4) },
  { name: 'salted egg', displayName: 'Salted Egg', category: 'EGGS', defaultUnit: 'piece', gramsPerPiece: 60, aliases: ['salted duck egg', 'telur masin'], nutrition: n(180, 13, 1.5, 13.5, 0, 900, 0.5) },
  { name: 'century egg', displayName: 'Century Egg', category: 'EGGS', defaultUnit: 'piece', gramsPerPiece: 60, aliases: ['preserved egg', 'pidan'], nutrition: n(178, 13.5, 2.5, 12.7, 0, 542, 0.7) },

  // ===================== GRAINS =====================
  { name: 'jasmine rice', displayName: 'Jasmine Rice', category: 'GRAINS', defaultUnit: 'g', aliases: ['thai fragrant rice', 'white rice', 'beras'], nutrition: n(365, 7.1, 80, 0.7, 1.3, 5, 0.1) },
  { name: 'brown rice', displayName: 'Brown Rice', category: 'GRAINS', defaultUnit: 'g', aliases: ['unpolished rice', 'wholegrain rice'], nutrition: n(370, 7.9, 77.2, 2.9, 3.5, 7, 0.9) },
  { name: 'glutinous rice', displayName: 'Glutinous Rice', category: 'GRAINS', defaultUnit: 'g', aliases: ['sticky rice', 'pulut'], nutrition: n(370, 6.8, 81.7, 0.6, 2.8, 7, 0.1) },
  { name: 'basmati rice', displayName: 'Basmati Rice', category: 'GRAINS', defaultUnit: 'g', aliases: ['briyani rice', 'long grain rice'], nutrition: n(356, 8.9, 77.1, 0.6, 1.8, 2, 0.1) },
  { name: 'rolled oats', displayName: 'Rolled Oats', category: 'GRAINS', defaultUnit: 'g', aliases: ['oatmeal', 'quick oats'], nutrition: n(389, 16.9, 66.3, 6.9, 10.6, 2, 0.99) },

  // ===================== BAKERY =====================
  { name: 'white bread', displayName: 'White Bread', category: 'BAKERY', defaultUnit: 'piece', gramsPerPiece: 30, aliases: ['sandwich bread', 'bread loaf', 'roti'], nutrition: n(265, 9, 49, 3.2, 2.7, 491, 5) },
  { name: 'wholemeal bread', displayName: 'Wholemeal Bread', category: 'BAKERY', defaultUnit: 'piece', gramsPerPiece: 30, aliases: ['wholegrain bread', 'wheat bread'], nutrition: n(247, 13, 41, 3.4, 7, 472, 4.3) },

  // ===================== NOODLES & PASTA =====================
  { name: 'bee hoon', displayName: 'Bee Hoon', category: 'NOODLES_PASTA', defaultUnit: 'g', aliases: ['rice vermicelli', 'mee hoon', 'vermicelli'], nutrition: n(364, 5.9, 83, 0.6, 1.6, 15, 0.1) },
  { name: 'yellow noodles', displayName: 'Yellow Noodles', category: 'NOODLES_PASTA', defaultUnit: 'g', aliases: ['mee', 'fresh yellow mee'], nutrition: n(138, 4.5, 27, 1, 1.5, 250, 0.3) },
  { name: 'hokkien noodles', displayName: 'Thick Hokkien Noodles', category: 'NOODLES_PASTA', defaultUnit: 'g', aliases: ['thick yellow noodles', 'dai mee'], nutrition: n(140, 4.6, 27.5, 1, 1.4, 240, 0.3) },
  { name: 'kway teow', displayName: 'Kway Teow', category: 'NOODLES_PASTA', defaultUnit: 'g', aliases: ['flat rice noodles', 'hor fun', 'kuey teow'], nutrition: n(155, 2.4, 34, 0.8, 0.9, 120, 0.2) },
  { name: 'egg noodles', displayName: 'Egg Noodles', category: 'NOODLES_PASTA', defaultUnit: 'g', aliases: ['mee kia', 'wonton noodles', 'mee pok'], nutrition: n(384, 14, 71, 4.4, 3.3, 21, 1) },
  { name: 'instant noodles', displayName: 'Instant Noodles', category: 'NOODLES_PASTA', defaultUnit: 'piece', gramsPerPiece: 80, aliases: ['ramen packet', 'maggi mee'], nutrition: n(436, 9.5, 62, 17, 2.4, 1160, 2.3) },
  { name: 'tang hoon', displayName: 'Tang Hoon', category: 'NOODLES_PASTA', defaultUnit: 'g', aliases: ['glass noodles', 'mung bean vermicelli', 'cellophane noodles'], nutrition: n(351, 0.2, 86.1, 0.1, 0.5, 10, 0) },
  { name: 'udon', displayName: 'Udon', category: 'NOODLES_PASTA', defaultUnit: 'g', aliases: ['udon noodles', 'japanese thick noodles'], nutrition: n(127, 3.1, 25.5, 0.6, 1.2, 109, 0.3) },
  { name: 'spaghetti', displayName: 'Spaghetti', category: 'NOODLES_PASTA', defaultUnit: 'g', aliases: ['pasta', 'spaghettini'], nutrition: n(371, 13, 74.7, 1.5, 3.2, 6, 2.7) },
  { name: 'macaroni', displayName: 'Macaroni', category: 'NOODLES_PASTA', defaultUnit: 'g', aliases: ['elbow pasta', 'elbow macaroni'], nutrition: n(371, 13, 74.7, 1.5, 3.2, 6, 2.7) },

  // ===================== TOFU & SOY =====================
  { name: 'firm tofu', displayName: 'Firm Tofu', category: 'TOFU_SOY', defaultUnit: 'piece', gramsPerPiece: 300, aliases: ['tau kwa', 'taukwa', 'pressed tofu'], nutrition: n(76, 8, 1.9, 4.8, 0.3, 7, 0.6) },
  { name: 'silken tofu', displayName: 'Silken Tofu', category: 'TOFU_SOY', defaultUnit: 'piece', gramsPerPiece: 300, aliases: ['soft tofu', 'tofu tube', 'tau huay tofu'], nutrition: n(55, 4.8, 1.8, 3.2, 0.2, 4, 0.6) },
  { name: 'tempeh', displayName: 'Tempeh', category: 'TOFU_SOY', defaultUnit: 'g', aliases: ['tempe', 'fermented soybean cake'], nutrition: n(192, 20.3, 7.6, 10.8, 4.8, 9, 0) },
  { name: 'tau pok', displayName: 'Tau Pok', category: 'TOFU_SOY', defaultUnit: 'piece', gramsPerPiece: 15, aliases: ['fried tofu puff', 'beancurd puff'], nutrition: n(271, 17.7, 2.5, 21.2, 0.8, 16, 0.5) },
  { name: 'soy milk', displayName: 'Soy Milk', category: 'TOFU_SOY', defaultUnit: 'ml', density: 1.03, aliases: ['soybean milk', 'soya milk'], nutrition: n(54, 3.3, 6, 1.8, 0.6, 51, 4) },

  // ===================== SAUCES =====================
  { name: 'light soy sauce', displayName: 'Light Soy Sauce', category: 'SAUCES', defaultUnit: 'ml', density: 1.15, aliases: ['soy sauce', 'sheng chou', 'kicap cair'], nutrition: n(53, 8, 4.9, 0.6, 0.8, 5493, 0.4) },
  { name: 'dark soy sauce', displayName: 'Dark Soy Sauce', category: 'SAUCES', defaultUnit: 'ml', density: 1.2, aliases: ['black soy sauce', 'lao chou', 'kicap pekat'], nutrition: n(60, 5.6, 9.5, 0.1, 0.5, 4900, 5) },
  { name: 'oyster sauce', displayName: 'Oyster Sauce', category: 'SAUCES', defaultUnit: 'ml', density: 1.25, aliases: ['hao you', 'oyster flavoured sauce'], nutrition: n(51, 1.4, 11, 0.3, 0.3, 2733, 8) },
  { name: 'fish sauce', displayName: 'Fish Sauce', category: 'SAUCES', defaultUnit: 'ml', density: 1.2, aliases: ['nam pla', 'nuoc mam'], nutrition: n(35, 5.1, 3.6, 0, 0, 7851, 3.6) },
  { name: 'sambal chilli', displayName: 'Sambal Chilli', category: 'SAUCES', defaultUnit: 'g', aliases: ['sambal', 'sambal oelek', 'sambal tumis'], nutrition: n(101, 2.3, 14, 4.4, 3.2, 1338, 8) },
  { name: 'hoisin sauce', displayName: 'Hoisin Sauce', category: 'SAUCES', defaultUnit: 'ml', density: 1.25, aliases: ['hai xian jiang', 'chinese bbq sauce'], nutrition: n(220, 3.3, 44.1, 3.4, 2.8, 1615, 27.3) },
  { name: 'kecap manis', displayName: 'Kecap Manis', category: 'SAUCES', defaultUnit: 'ml', density: 1.3, aliases: ['sweet soy sauce', 'abc sweet soy'], nutrition: n(247, 3.3, 57, 0.2, 0.4, 2600, 50) },
  { name: 'chilli sauce', displayName: 'Chilli Sauce', category: 'SAUCES', defaultUnit: 'ml', density: 1.1, aliases: ['chili sauce', 'sriracha', 'cili sos'], nutrition: n(93, 1.9, 19.2, 0.5, 2.2, 2124, 15) },
  { name: 'tomato ketchup', displayName: 'Tomato Ketchup', category: 'SAUCES', defaultUnit: 'ml', density: 1.1, aliases: ['ketchup', 'tomato sauce'], nutrition: n(101, 1, 25.8, 0.1, 0.3, 907, 21.3) },
  { name: 'tamari', displayName: 'Tamari', category: 'SAUCES', defaultUnit: 'ml', density: 1.15, aliases: ['gluten free soy sauce', 'tamari shoyu'], nutrition: n(60, 10.5, 5.6, 0.1, 0.8, 5586, 1.7) },
  { name: 'rice vinegar', displayName: 'Rice Vinegar', category: 'SAUCES', defaultUnit: 'ml', density: 1.0, aliases: ['white rice vinegar', 'cuka beras'], nutrition: n(18, 0, 0.04, 0, 0, 2, 0.04) },
  { name: 'black vinegar', displayName: 'Black Vinegar', category: 'SAUCES', defaultUnit: 'ml', density: 1.0, aliases: ['chinkiang vinegar', 'zhenjiang vinegar'], nutrition: n(25, 0.5, 5, 0, 0, 10, 1) },
  { name: 'shaoxing wine', displayName: 'Shaoxing Wine', category: 'SAUCES', defaultUnit: 'ml', density: 0.98, aliases: ['chinese cooking wine', 'hua tiao chiew'], nutrition: n(127, 0.5, 5, 0, 0, 9, 0.5) },
  { name: 'laksa paste', displayName: 'Laksa Paste', category: 'SAUCES', defaultUnit: 'g', aliases: ['laksa premix', 'curry laksa paste'], nutrition: n(232, 4, 16, 17, 4, 2200, 8) },

  // ===================== CONDIMENTS =====================
  { name: 'belacan', displayName: 'Belacan', category: 'CONDIMENTS', defaultUnit: 'g', aliases: ['shrimp paste', 'terasi'], nutrition: n(190, 35, 4, 4, 0, 4500, 0) },
  { name: 'miso paste', displayName: 'Miso Paste', category: 'CONDIMENTS', defaultUnit: 'g', aliases: ['white miso', 'shiro miso'], nutrition: n(199, 11.7, 26.5, 6, 5.4, 3728, 6.2) },
  { name: 'tamarind paste', displayName: 'Tamarind Paste', category: 'CONDIMENTS', defaultUnit: 'g', aliases: ['assam', 'asam jawa'], nutrition: n(239, 2.8, 62.5, 0.6, 5.1, 28, 38.8) },
  { name: 'peanut butter', displayName: 'Peanut Butter', category: 'CONDIMENTS', defaultUnit: 'g', aliases: ['peanut spread', 'pb'], nutrition: n(588, 25, 20, 50, 6, 426, 9.2) },

  // ===================== SPICES =====================
  { name: 'white pepper', displayName: 'White Pepper', category: 'SPICES', defaultUnit: 'g', aliases: ['white pepper powder', 'bai hu jiao'], nutrition: n(296, 10.4, 68.6, 2.1, 26.2, 5, 0.6) },
  { name: 'black pepper', displayName: 'Black Pepper', category: 'SPICES', defaultUnit: 'g', aliases: ['black peppercorn', 'lada hitam'], nutrition: n(251, 10.4, 63.9, 3.3, 25.3, 20, 0.6) },
  { name: 'turmeric powder', displayName: 'Turmeric Powder', category: 'SPICES', defaultUnit: 'g', aliases: ['kunyit', 'haldi'], nutrition: n(312, 9.7, 67.1, 3.2, 22.7, 27, 3.2) },
  { name: 'curry powder', displayName: 'Curry Powder', category: 'SPICES', defaultUnit: 'g', aliases: ['meat curry powder', 'rempah kari'], nutrition: n(325, 14.3, 55.8, 14, 53.2, 52, 2.8) },
  { name: 'five spice powder', displayName: 'Five Spice Powder', category: 'SPICES', defaultUnit: 'g', aliases: ['ngoh hiang powder', 'wu xiang fen'], nutrition: n(347, 12.5, 50.5, 12, 14.7, 60, 2) },
  { name: 'cinnamon', displayName: 'Cinnamon', category: 'SPICES', defaultUnit: 'g', aliases: ['cinnamon stick', 'kayu manis'], nutrition: n(247, 4, 80.6, 1.2, 53.1, 10, 2.2) },
  { name: 'star anise', displayName: 'Star Anise', category: 'SPICES', defaultUnit: 'g', aliases: ['bunga lawang', 'ba jiao'], nutrition: n(337, 17.6, 50, 15.9, 14.6, 16, 0) },
  { name: 'cumin powder', displayName: 'Cumin Powder', category: 'SPICES', defaultUnit: 'g', aliases: ['jintan putih', 'jeera powder'], nutrition: n(375, 17.8, 44.2, 22.3, 10.5, 168, 2.3) },
  { name: 'chilli powder', displayName: 'Chilli Powder', category: 'SPICES', defaultUnit: 'g', aliases: ['chili powder', 'serbuk cili'], nutrition: n(282, 13.5, 49.7, 14.3, 34.8, 1640, 7.2) },
  { name: 'dried chilli', displayName: 'Dried Chilli', category: 'SPICES', defaultUnit: 'g', aliases: ['dried chili', 'cili kering'], nutrition: n(324, 10.6, 69.9, 5.8, 28.7, 91, 41.1) },
  { name: 'salt', displayName: 'Salt', category: 'SPICES', defaultUnit: 'g', aliases: ['fine salt', 'table salt', 'garam'], nutrition: n(0, 0, 0, 0, 0, 38758, 0) },

  // ===================== OILS =====================
  { name: 'vegetable oil', displayName: 'Vegetable Oil', category: 'OILS', defaultUnit: 'ml', density: 0.92, aliases: ['cooking oil', 'canola oil', 'minyak masak'], nutrition: n(884, 0, 0, 100, 0, 0, 0) },
  { name: 'peanut oil', displayName: 'Peanut Oil', category: 'OILS', defaultUnit: 'ml', density: 0.92, aliases: ['groundnut oil', 'minyak kacang'], nutrition: n(884, 0, 0, 100, 0, 0, 0) },
  { name: 'olive oil', displayName: 'Olive Oil', category: 'OILS', defaultUnit: 'ml', density: 0.91, aliases: ['extra virgin olive oil', 'evoo'], nutrition: n(884, 0, 0, 100, 0, 2, 0) },
  { name: 'sesame oil', displayName: 'Sesame Oil', category: 'OILS', defaultUnit: 'ml', density: 0.92, aliases: ['ma you', 'minyak bijan', 'pure sesame oil'], nutrition: n(884, 0, 0, 100, 0, 0, 0) },

  // ===================== CANNED =====================
  { name: 'canned tomatoes', displayName: 'Canned Tomatoes', category: 'CANNED', defaultUnit: 'g', aliases: ['chopped tomatoes', 'whole peeled tomatoes'], nutrition: n(32, 1.6, 7.3, 0.3, 1.9, 186, 4.4) },
  { name: 'tomato paste', displayName: 'Tomato Paste', category: 'CANNED', defaultUnit: 'g', aliases: ['tomato puree', 'concentrated tomato'], nutrition: n(82, 4.3, 18.9, 0.5, 4.1, 59, 12.2) },
  { name: 'canned sardines', displayName: 'Canned Sardines', category: 'CANNED', defaultUnit: 'g', aliases: ['sardines in tomato sauce', 'sardin'], nutrition: n(186, 17.9, 1.4, 11.8, 0.2, 414, 1.2) },
  { name: 'luncheon meat', displayName: 'Luncheon Meat', category: 'CANNED', defaultUnit: 'g', aliases: ['spam', 'pork luncheon meat'], nutrition: n(334, 13.4, 4.6, 28.9, 0, 1245, 0.5) },
  { name: 'baked beans', displayName: 'Baked Beans', category: 'CANNED', defaultUnit: 'g', aliases: ['beans in tomato sauce', 'canned beans'], nutrition: n(94, 4.8, 17.5, 0.5, 4.3, 422, 5.3) },
  { name: 'canned chickpeas', displayName: 'Canned Chickpeas', category: 'CANNED', defaultUnit: 'g', aliases: ['garbanzo beans', 'kacang kuda'], nutrition: n(139, 7.1, 22.5, 2.4, 6.4, 246, 0.4) },

  // ===================== FROZEN =====================
  { name: 'frozen peas', displayName: 'Frozen Peas', category: 'FROZEN', defaultUnit: 'g', aliases: ['green peas', 'garden peas'], nutrition: n(77, 5.2, 13.6, 0.4, 4.5, 108, 5) },
  { name: 'frozen mixed vegetables', displayName: 'Frozen Mixed Vegetables', category: 'FROZEN', defaultUnit: 'g', aliases: ['mixed veg', 'frozen veg mix'], nutrition: n(65, 3.3, 13.1, 0.5, 4, 47, 3.5) },
  { name: 'frozen dumplings', displayName: 'Frozen Dumplings', category: 'FROZEN', defaultUnit: 'piece', gramsPerPiece: 25, aliases: ['gyoza', 'jiaozi'], nutrition: n(199, 7.5, 26, 7, 1.5, 480, 1.5) },

  // ===================== BAKING =====================
  { name: 'plain flour', displayName: 'Plain Flour', category: 'BAKING', defaultUnit: 'g', aliases: ['all purpose flour', 'wheat flour', 'tepung gandum'], nutrition: n(364, 10.3, 76.3, 1, 2.7, 2, 0.3) },
  { name: 'rice flour', displayName: 'Rice Flour', category: 'BAKING', defaultUnit: 'g', aliases: ['tepung beras', 'ground rice'], nutrition: n(366, 5.9, 80.1, 1.4, 2.4, 0, 0.1) },
  { name: 'corn flour', displayName: 'Corn Flour', category: 'BAKING', defaultUnit: 'g', aliases: ['cornstarch', 'corn starch', 'tepung jagung'], nutrition: n(381, 0.3, 91.3, 0.1, 0.9, 9, 0) },
  { name: 'white sugar', displayName: 'White Sugar', category: 'BAKING', defaultUnit: 'g', aliases: ['granulated sugar', 'caster sugar', 'gula'], nutrition: n(387, 0, 100, 0, 0, 1, 100) },
  { name: 'gula melaka', displayName: 'Gula Melaka', category: 'BAKING', defaultUnit: 'g', aliases: ['palm sugar', 'coconut palm sugar'], nutrition: n(383, 0.4, 95, 0, 0, 30, 90) },
  { name: 'baking powder', displayName: 'Baking Powder', category: 'BAKING', defaultUnit: 'g', aliases: ['double acting baking powder', 'serbuk penaik'], nutrition: n(53, 0, 27.7, 0, 0.2, 10600, 0) },

  // ===================== OTHER =====================
  { name: 'peanuts', displayName: 'Peanuts', category: 'OTHER', defaultUnit: 'g', aliases: ['groundnuts', 'kacang tanah'], nutrition: n(567, 25.8, 16.1, 49.2, 8.5, 18, 4.7) },
  { name: 'sesame seeds', displayName: 'Sesame Seeds', category: 'OTHER', defaultUnit: 'g', aliases: ['white sesame', 'bijan'], nutrition: n(573, 17.7, 23.4, 49.7, 11.8, 11, 0.3) },
  { name: 'dried shiitake', displayName: 'Dried Shiitake Mushroom', category: 'OTHER', defaultUnit: 'g', gramsPerPiece: 5, aliases: ['dried chinese mushroom', 'dried donggu'], nutrition: n(296, 9.6, 75.4, 1, 11.5, 13, 2.2) },
  { name: 'red dates', displayName: 'Red Dates', category: 'OTHER', defaultUnit: 'g', gramsPerPiece: 4, aliases: ['jujube', 'hong zao'], nutrition: n(287, 3.7, 73.6, 0.5, 6, 9, 63) },
  { name: 'wolfberries', displayName: 'Wolfberries', category: 'OTHER', defaultUnit: 'g', aliases: ['goji berries', 'gou qi zi'], nutrition: n(349, 14.3, 77.1, 0.4, 13, 298, 45.6) },
];
