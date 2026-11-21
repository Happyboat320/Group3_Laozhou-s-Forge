// 铁质生活用具 × 五档品质的提示词表（10 × 5 = 50 张）。
// 提示词规则和 STYLE.md 的「装备图」一节保持一致；改这里的同时改 STYLE.md。
// 用法：被 tools/gen_ironware.mjs import。

/** 五档品质，从低到高；key 和 src/core/drop.ts 的 Quality 一致。 */
export const QUALITIES = ['common', 'fine', 'rare', 'epic', 'legend'];

export const QUALITY_LABEL = {
  common: '凡品',
  fine: '良品',
  rare: '珍品',
  epic: '极品',
  legend: '传说',
};

/** 10 种器物。axis 描述“上端”在哪，提示词据此约束朝向。 */
export const ITEMS = [
  { name: 'pot', zh: '铁锅', subject: 'a traditional Chinese iron cooking pot with two loop handles and one short side handle, lid slightly lifted', upperEnd: 'the far rim of the pot and the short side handle at the upper left' },
  { name: 'ladle', zh: '铁勺', subject: 'a traditional Chinese iron soup ladle, long straight handle and a deep round bowl', upperEnd: 'the end of the handle at the upper left' },
  { name: 'cleaver', zh: '铁菜刀', subject: 'a traditional Chinese iron cleaver, rectangular thick-backed blade and one short wooden handle', upperEnd: 'the wooden handle end at the upper left' },
  { name: 'kettle', zh: '铁水壶', subject: 'a traditional Chinese iron water kettle with an arched carrying handle and a curved spout', upperEnd: 'the top of the arched handle at the upper left' },
  { name: 'wok', zh: '铁炒锅', subject: 'a traditional Chinese round-bottom iron wok with one long straight handle', upperEnd: 'the far rim of the wok at the upper left' },
  { name: 'nail', zh: '铁钉', subject: 'one chunky traditional Chinese square-section iron nail with a flat round head', upperEnd: 'the round nail head at the upper left' },
  { name: 'tongs', zh: '火钳', subject: 'a pair of traditional Chinese iron fire tongs, two arms joined at one pivot end and opening at the other', upperEnd: 'the joined pivot end at the upper left' },
  { name: 'hoe', zh: '铁锄', subject: 'a traditional Chinese iron farming hoe with a long wooden handle and one broad iron blade', upperEnd: 'the wooden handle end at the upper left' },
  { name: 'bucket', zh: '铁桶', subject: 'a traditional Chinese iron water bucket with a round open top and an arched carrying handle', upperEnd: 'the far rim and the top of the arched handle at the upper left' },
  { name: 'scissors', zh: '铁剪刀', subject: 'a pair of traditional Chinese iron scissors, two crossed blades with two round finger loops', upperEnd: 'the two round finger loops at the upper left' },
];

/** 品质的材质与装饰描述：只升级材质和装饰，器物形状不变。 */
export const QUALITY_STYLE = {
  common:
    'plain worn grey iron, matte surface, light rust speckles, a couple of small dents and a slightly bent edge, no decoration at all',
  fine:
    'cleaner grey iron with a soft blue sheen, edges polished by use, one simple brass band around the handle, a few tiny hammer marks',
  rare:
    'blue-silver steel-like iron, crisp bevel highlights, a simple engraved cloud pattern on the surface, thin warm copper trim, two tiny soft white sparkles',
  epic:
    'deep blue-purple tinted iron with a subtle glow along the edges, intricate engraved scroll pattern, warm gold inlay, one small purple gem rivet, three to four purple-white sparkles close to the surface',
  legend:
    'radiant gold-and-red-hot iron with a warm glowing rim, dragon-and-cloud carved pattern, gold filigree, one small glinting gem, golden sparkles, and a faint warm golden halo tight behind the object',
};

const STYLE = `Style: cute chibi ancient-Chinese casual mobile game asset, drawn as a floating single item cut out of the page. Only the object itself has a thick continuous dark-brown outline (about #5a3220, not black) with rounded line caps; flat colors with one soft shadow tone and one small white highlight from the top-left; warm palette, medium-high saturation; chunky rounded shapes with soft corners, no thin fragile parts. The outline is the contour of the object only.`;

const COMPOSITION = `Composition: exactly one object, centered, filling about 80% of the square frame with a small even margin. The object's main axis runs from the upper left down to the lower right at about 30 degrees: {UPPER_END}, the working end pointing down to the lower right at about 45 degrees. Seen from a 3/4 top-down angle so its thickness reads clearly.`;

const BACKGROUND = `Background: pure white #FFFFFF, perfectly flat and clean, with no shadow, no gradient, no vignette, no glow spill, no ground plane, no drop shadow and no reflection. Between the object's own outline and the pure white background there is nothing at all: no frame, no rounded rectangle border, no badge, no card, no tile, no panel, no plate, no badge ring, no second outline around the object, no padding box. The pure white simply continues to all four edges of the picture. Crisp closed outline around the object, ready to be cut out to transparency.`;

const AVOID = `Avoid: frame, border, outline box, rounded rectangle frame, square frame, circular badge, medal ring, card, tile, panel, plate, sticker sheet edge, drop shadow, text, letters, numbers, labels, watermark, logo, realism, 3D render, pixel art, noisy textures, dark gloomy mood, blood, multiple objects, any prop or decoration floating in the background, background sparkles outside the object's outline.`;

/**
 * 拼一张图的提示词。
 * @param {string} name ITEMS 里的 name
 * @param {string} quality QUALITIES 里的 key
 */
export function buildPrompt(name, quality) {
  const item = ITEMS.find((i) => i.name === name);
  if (!item) throw new Error(`unknown item: ${name}`);
  if (!QUALITIES.includes(quality)) throw new Error(`unknown quality: ${quality}`);
  return [
    `Subject: ${item.subject}, ${QUALITY_STYLE[quality]}.`,
    STYLE,
    COMPOSITION.replace('{UPPER_END}', item.upperEnd),
    BACKGROUND,
    AVOID,
  ].join('\n\n');
}

/** 素材 ID 与文件名：item_iron_<name>_<quality>。 */
export function assetId(name, quality) {
  return `item_iron_${name}_${quality}`;
}
