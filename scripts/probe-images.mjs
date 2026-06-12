// One-shot: probe TheMealDB ingredient images + Wikipedia dish thumbnails,
// emit apps/api/prisma/seed-data/images.ts with only verified URLs.
import { writeFileSync } from "node:fs";

const INGREDIENTS = [
  "kangkong","kai lan","bok choy","chye sim","spinach","round cabbage","napa cabbage","lettuce","broccoli","cauliflower","carrot","potato","sweet potato","red onion","yellow onion","garlic","ginger","spring onion","red chilli","chilli padi","tomato","cucumber","long bean","french bean","bean sprouts","eggplant","okra","lime","lemon","banana","pandan leaves","lemongrass","galangal","coriander","kaffir lime leaves","shiitake mushroom","enoki mushroom","button mushroom","sweet corn","pumpkin","curry leaves","chicken breast","chicken thigh","whole chicken","chicken wings","chicken drumstick","pork belly","minced pork","pork ribs","pork loin","beef sirloin","minced beef","beef brisket","lamb shoulder","batang fish","salmon fillet","sea bass","red snapper","pomfret","prawns","squid","mussels","clams","dried shrimp","ikan bilis","fish cake","fish ball","fresh milk","evaporated milk","condensed milk","butter","cheddar cheese","plain yogurt","whipping cream","coconut milk","eggs","salted egg","century egg","jasmine rice","brown rice","glutinous rice","basmati rice","rolled oats","white bread","wholemeal bread","bee hoon","yellow noodles","hokkien noodles","kway teow","egg noodles","instant noodles","tang hoon","udon","spaghetti","macaroni","firm tofu","silken tofu","tempeh","tau pok","soy milk","light soy sauce","dark soy sauce","oyster sauce","fish sauce","sambal chilli","hoisin sauce","kecap manis","chilli sauce","tomato ketchup","tamari","rice vinegar","black vinegar","shaoxing wine","laksa paste","belacan","miso paste","tamarind paste","peanut butter","white pepper","black pepper","turmeric powder","curry powder","five spice powder","cinnamon","star anise","cumin powder","chilli powder","dried chilli","salt","vegetable oil","peanut oil","olive oil","sesame oil","canned tomatoes","tomato paste","canned sardines","luncheon meat","baked beans","canned chickpeas","frozen peas","frozen mixed vegetables","frozen dumplings","plain flour","rice flour","corn flour","white sugar","gula melaka","baking powder","peanuts","sesame seeds","dried shiitake","red dates","wolfberries",
];

// Manual candidates where our name differs from TheMealDB's vocabulary but the
// pictured item is genuinely equivalent (no misleading photos).
const CANDIDATES = {
  "sweet potato": ["Sweet Potatoes"],
  "sesame oil": ["Sesame Seed Oil"],
  "tomato paste": ["Tomato Puree"],
  "canned sardines": ["Sardines"],
  "kai lan": ["Chinese Broccoli"],
  "bok choy": ["Pak Choi", "Bok Choy"],
  "chye sim": ["Pak Choi"],
  "round cabbage": ["Cabbage"],
  "napa cabbage": ["Chinese Cabbage"],
  "red onion": ["Red Onions", "Red Onion"],
  "yellow onion": ["Onions", "Onion"],
  "spring onion": ["Spring Onions"],
  "red chilli": ["Red Chilli", "Red Chili"],
  "chilli padi": ["Red Chilli"],
  "long bean": ["Green Beans"],
  "french bean": ["Green Beans"],
  "bean sprouts": ["Beansprouts", "Bean Sprouts"],
  "eggplant": ["Aubergine"],
  "sweet corn": ["Sweetcorn", "Corn"],
  "shiitake mushroom": ["Shiitake Mushrooms", "Mushrooms"],
  "enoki mushroom": ["Mushrooms"],
  "button mushroom": ["Mushrooms"],
  "whole chicken": ["Chicken"],
  "chicken thigh": ["Chicken Thighs"],
  "chicken wings": ["Chicken Wings"],
  "chicken drumstick": ["Chicken Legs"],
  "pork belly": ["Pork"],
  "minced pork": ["Pork Mince", "Minced Pork", "Pork"],
  "pork ribs": ["Pork Ribs", "Pork"],
  "pork loin": ["Pork Chops", "Pork"],
  "beef sirloin": ["Beef Fillet", "Beef"],
  "minced beef": ["Minced Beef", "Beef Mince"],
  "beef brisket": ["Beef Brisket", "Beef"],
  "lamb shoulder": ["Lamb Shoulder", "Lamb"],
  "batang fish": ["Mackerel"],
  "salmon fillet": ["Salmon"],
  "sea bass": ["Sea Bass"],
  "red snapper": ["Red Snapper"],
  "prawns": ["Prawns", "King Prawns"],
  "dried shrimp": ["Prawns"],
  "ikan bilis": ["Anchovy Fillet"],
  "fresh milk": ["Milk"],
  "evaporated milk": ["Evaporated Milk", "Milk"],
  "condensed milk": ["Condensed Milk"],
  "cheddar cheese": ["Cheddar Cheese"],
  "plain yogurt": ["Greek Yogurt", "Yogurt"],
  "whipping cream": ["Double Cream", "Heavy Cream"],
  "eggs": ["Eggs", "Egg"],
  "salted egg": ["Eggs"],
  "century egg": [],
  "jasmine rice": ["Jasmine Rice", "Rice"],
  "brown rice": ["Brown Rice"],
  "glutinous rice": ["Rice"],
  "basmati rice": ["Basmati Rice"],
  "rolled oats": ["Oats", "Rolled Oats"],
  "white bread": ["Bread"],
  "wholemeal bread": ["Bread"],
  "bee hoon": ["Rice Noodles"],
  "yellow noodles": ["Noodles", "Egg Noodles"],
  "hokkien noodles": ["Noodles"],
  "kway teow": ["Rice Noodles"],
  "egg noodles": ["Egg Noodles", "Noodles"],
  "instant noodles": ["Noodles"],
  "tang hoon": ["Rice Noodles"],
  "udon": ["Udon Noodles", "Noodles"],
  "firm tofu": ["Tofu"],
  "silken tofu": ["Tofu"],
  "tau pok": ["Tofu"],
  "light soy sauce": ["Soy Sauce"],
  "dark soy sauce": ["Dark Soy Sauce", "Soy Sauce"],
  "sambal chilli": ["Chilli Paste"],
  "kecap manis": ["Dark Soy Sauce"],
  "chilli sauce": ["Hotsauce", "Hot Sauce"],
  "tomato ketchup": ["Tomato Ketchup", "Ketchup"],
  "rice vinegar": ["Rice Vinegar", "Vinegar"],
  "black vinegar": ["Vinegar"],
  "shaoxing wine": ["Rice Wine"],
  "miso paste": ["Miso"],
  "tamarind paste": ["Tamarind Paste"],
  "white pepper": ["White Pepper", "Pepper"],
  "black pepper": ["Black Pepper", "Pepper"],
  "turmeric powder": ["Turmeric"],
  "five spice powder": ["Chinese Five Spice"],
  "cumin powder": ["Cumin", "Ground Cumin"],
  "chilli powder": ["Chilli Powder", "Chili Powder"],
  "dried chilli": ["Dried Chillies"],
  "canned tomatoes": ["Canned Tomatoes", "Chopped Tomatoes"],
  "luncheon meat": ["Spam"],
  "baked beans": ["Baked Beans"],
  "canned chickpeas": ["Chickpeas"],
  "frozen peas": ["Peas", "Frozen Peas"],
  "frozen mixed vegetables": ["Mixed Vegetables"],
  "frozen dumplings": [],
  "plain flour": ["Plain Flour", "Flour"],
  "rice flour": ["Rice Flour"],
  "corn flour": ["Cornstarch", "Corn Flour"],
  "white sugar": ["Sugar", "Caster Sugar"],
  "gula melaka": ["Brown Sugar"],
  "peanuts": ["Peanuts"],
  "sesame seeds": ["Sesame Seed", "Sesame Seeds"],
  "dried shiitake": ["Shiitake Mushrooms"],
  "red dates": [],
  "wolfberries": ["Goji Berries"],
};

const RECIPE_WIKI = {
  "Hainanese Chicken Rice": "Hainanese_chicken_rice",
  "Char Kway Teow": "Char_kway_teow",
  "Laksa Lemak": "Laksa",
  "Sambal Kangkong": "Kangkung_belacan",
  "Singapore Chicken Curry": "Curry_chicken_noodles",
  "ABC Soup": "ABC_soup",
  "Egg Fried Rice": "Fried_rice",
  "Mee Goreng Mamak": "Mie_goreng",
  "Teochew Steamed Fish": "Steamed_fish",
  "Claypot Chicken Rice": "Claypot_chicken_rice",
  "Tofu & Broccoli Stir-fry": "Stir_frying",
  "Bak Chor Mee": "Bak_chor_mee",
};

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

async function head(url) {
  try {
    // Wikimedia rejects UA-less requests with 403 — send a browser-like UA.
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "Mozilla/5.0 (SmartGroceryAI seed-image probe)" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

const ingredientImages = {};
let hits = 0;
for (const name of INGREDIENTS) {
  const candidates = [...(CANDIDATES[name] ?? []), titleCase(name)];
  for (const c of candidates) {
    const url = `https://www.themealdb.com/images/ingredients/${encodeURIComponent(c)}.png`;
    if (await head(url)) {
      ingredientImages[name] = url;
      hits++;
      break;
    }
  }
  if (!ingredientImages[name]) console.log(`miss: ${name}`);
}
console.log(`ingredients: ${hits}/${INGREDIENTS.length} matched`);

const recipeImages = {};
for (const [title, page] of Object.entries(RECIPE_WIKI)) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${page}`, {
      headers: { "User-Agent": "SmartGroceryAI/1.0 (seed images)" },
    });
    if (!res.ok) { console.log(`wiki miss: ${title}`); continue; }
    const data = await res.json();
    const src = data.thumbnail?.source ?? data.originalimage?.source;
    if (!src) { console.log(`wiki no-image: ${title}`); continue; }
    // Use the API's exact thumbnail URL — upscaling Commons thumbs past the
    // original size returns HTTP 400. Verify before trusting it.
    if (await head(src)) recipeImages[title] = src;
    else console.log(`wiki dead-url: ${title}`);
  } catch { console.log(`wiki error: ${title}`); }
}
console.log(`recipes: ${Object.keys(recipeImages).length}/12 matched`);

const out = `/**
 * Verified image URLs (generated by scripts/probe-images.mjs — every URL
 * returned HTTP 200 at generation time).
 * Ingredient photos: TheMealDB (free for educational/small-scale use).
 * Dish photos: Wikipedia/Wikimedia Commons thumbnails (CC licences).
 */

export const INGREDIENT_IMAGES: Record<string, string> = ${JSON.stringify(ingredientImages, null, 2)};

export const RECIPE_IMAGES: Record<string, string> = ${JSON.stringify(recipeImages, null, 2)};
`;
writeFileSync("apps/api/prisma/seed-data/images.ts", out);
console.log("wrote apps/api/prisma/seed-data/images.ts");
