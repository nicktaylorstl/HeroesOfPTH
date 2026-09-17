/**
 * build-party-pages.mjs — turn Foundry VTT (PF2e) actor exports into wiki pages.
 *
 * Usage:  node tools/build-party-pages.mjs
 *
 * Reads  party/export/fvtt-Actor-*.json
 * Writes pages/the-party/<name>.md  (one page per PC)
 *
 * Rerun it after a level-up: re-export the actors from Foundry into
 * party/export/ and run the script again. Anything a player has written
 * below the PLAYER NOTES marker on a page is preserved.
 *
 * Derived numbers (AC, saves, skills, HP) follow the standard PF2e math
 * but ignore item/status/circumstance bonuses, so treat them as "close
 * enough for the wiki", not a rules-legal sheet.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const EXPORT_DIR = path.join(ROOT, "party", "export");
const OUT_DIR = path.join(ROOT, "pages", "the-party");
const NOTES_MARKER = "<!-- PLAYER NOTES — everything below this line survives sheet regeneration -->";
const STASH_START = "<!-- PARTY STASH START — auto-generated from the Foundry party sheet; edits between these markers are overwritten -->";
const STASH_END = "<!-- PARTY STASH END -->";

// One-time correction: 75 gp per PC that the GM handed out but forgot to add
// in Foundry before the 2026-09-17 exports. Set this back to 0 once a future
// export includes it, or the gold will be counted twice.
const GOLD_ADJUSTMENT = 75;

const COIN_VALUES = { "Platinum Pieces": 10, "Gold Pieces": 1, "Silver Pieces": 0.1, "Copper Pieces": 0.01 };

// portraits in party/images/, served by GitHub Pages alongside the site
// (keyed by page slug because the filenames don't match the actor names)
const PORTRAITS = {
  bruldrun: "Bruldrun.jpg",
  karzhared: "KharZhared.jpg",
  njal: "NJal.png",
  scribbleface: "Scribbles.png",
  sylfira: "Sylfira.webp",
};

const RANKS = ["Untrained", "Trained", "Expert", "Master", "Legendary"];
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const SKILL_ABILITY = {
  acrobatics: "dex", arcana: "int", athletics: "str", crafting: "int",
  deception: "cha", diplomacy: "cha", intimidation: "cha", medicine: "wis",
  nature: "wis", occultism: "int", performance: "cha", religion: "wis",
  society: "int", stealth: "dex", survival: "wis", thievery: "dex",
};

const mod = score => Math.floor((score - 10) / 2);
const fmt = n => (n >= 0 ? "+" : "") + n;
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const profBonus = (rank, level) => (rank > 0 ? rank * 2 + level : 0);

// must match slugify() in index.html so [[wiki links]] resolve to these pages
function slugify(name) {
  return name.toLowerCase().trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function abilityScores(actor) {
  const scores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const items = actor.items;
  const level = actor.system.details.level.value;
  const boost = a => { if (a && a in scores) scores[a] += scores[a] >= 18 ? 1 : 2; };
  const applyBoosts = obj => {
    for (const k of Object.keys(obj || {})) {
      const b = obj[k];
      boost(b.selected || (b.value && b.value.length === 1 ? b.value[0] : null));
    }
  };
  const ancestry = items.find(i => i.type === "ancestry");
  const background = items.find(i => i.type === "background");
  const cls = items.find(i => i.type === "class");

  applyBoosts(ancestry?.system.boosts);
  for (const k of Object.keys(ancestry?.system.flaws || {})) {
    const v = ancestry.system.flaws[k].value;
    if (v && v.length === 1) scores[v[0]] -= 2;
  }
  applyBoosts(background?.system.boosts);
  boost(cls?.system.keyAbility.selected || cls?.system.keyAbility.value?.[0]);
  const buckets = actor.system.build?.attributes?.boosts || {};
  for (const lvl of ["1", "5", "10", "15", "20"]) {
    if (+lvl <= level) (buckets[lvl] || []).forEach(boost);
  }
  return scores;
}

function buildPage(actor) {
  const sys = actor.system;
  const items = actor.items;
  const level = sys.details.level.value;
  const byType = t => items.filter(i => i.type === t);
  const one = t => items.find(i => i.type === t);

  const ancestry = one("ancestry"), heritage = one("heritage"),
        background = one("background"), cls = one("class");
  const scores = abilityScores(actor);
  const m = Object.fromEntries(ABILITIES.map(a => [a, mod(scores[a])]));

  /* header line */
  const gender = sys.details.gender?.value || "";
  const deity = sys.details.deity?.value || one("deity")?.name || "";
  const age = sys.details.age?.value || "";
  const langs = (sys.details.languages?.value || []).map(cap).join(", ");
  const headBits = [
    [gender, ancestry?.name, `(${heritage?.name || "—"})`].filter(Boolean).join(" "),
    `${cls?.name || "?"} ${level}`,
  ].join(" ");
  const subBits = [
    background && `Background: ${background.name}`,
    deity && `Follows ${deity}`,
    age && `Age ${age}`,
    langs && `Languages: ${langs}`,
  ].filter(Boolean).join(" · ");

  /* hp / ac / perception */
  const toughness = items.some(i => i.type === "feat" && /^toughness$/i.test(i.name)) ? level : 0;
  const maxHP = (ancestry?.system.hp || 0) + level * ((cls?.system.hp || 0) + m.con) + toughness;

  const armor = byType("armor")[0];
  const armorCat = armor?.system.category || "unarmored";
  // some exports lack system.martial — fall back to class proficiencies, and
  // assume at least trained in armor the character is actually wearing
  let armorRank = sys.martial?.[armorCat]?.rank
    ?? cls?.system.defenses?.[armorCat] ?? 0;
  if (armor && armorRank < 1) armorRank = 1;
  const ac = 10 + Math.min(m.dex, armor?.system.dexCap ?? 99)
           + (armor?.system.acBonus || 0) + (armor?.system.runes?.potency || 0)
           + profBonus(armorRank, level);

  const perRank = cls?.system.perception ?? 1;
  const perception = profBonus(perRank, level) + m.wis;

  /* saves */
  const SAVE_ABILITY = { fortitude: "con", reflex: "dex", will: "wis" };
  const saves = Object.entries(SAVE_ABILITY).map(([save, ab]) => {
    const rank = sys.savingThrows?.[save] ?? cls?.system.savingThrows?.[save] ?? 0;
    return `**${cap(save)}** ${fmt(profBonus(rank, level) + m[ab])} (${RANKS[rank]})`;
  }).join(" · ");

  /* skills */
  const skillRows = [];
  for (const [skill, ab] of Object.entries(SKILL_ABILITY)) {
    const rank = sys.skills?.[skill]?.rank ?? 0;
    if (rank > 0) skillRows.push([cap(skill), rank, ab]);
  }
  for (const lore of byType("lore")) {
    const rank = lore.system.proficient?.value ?? 1;
    skillRows.push([`${lore.name} Lore`, rank, "int"]);
  }
  skillRows.sort((a, b) => a[0].localeCompare(b[0]));
  const skillTable = skillRows.map(([name, rank, ab]) =>
    `| ${name} | ${RANKS[rank]} | ${fmt(profBonus(rank, level) + m[ab])} |`).join("\n");

  /* weapons */
  const weapons = byType("weapon").map(w => {
    const d = w.system.damage || {};
    const dice = (d.dice || 1) + (w.system.runes?.striking || 0);
    const dmg = d.die ? `${dice}${d.die} ${d.damageType || ""}`.trim() : "";
    const traits = (w.system.traits?.value || []).join(", ");
    return `- **${w.name}**${dmg ? ` — ${dmg}` : ""}${traits ? ` *(${traits})*` : ""}`;
  }).join("\n");

  /* spells */
  let spellsSection = "";
  const entries = byType("spellcastingEntry").filter(e => e.system.prepared?.value !== "items");
  for (const entry of entries) {
    const spells = byType("spell").filter(s => s.system.location?.value === entry._id);
    if (!spells.length) continue;
    const isCantrip = s => (s.system.traits?.value || []).includes("cantrip");
    const groups = new Map(); // label -> names
    for (const s of spells.sort((a, b) => a.name.localeCompare(b.name))) {
      const label = isCantrip(s) ? "Cantrips" : `Rank ${s.system.level.value}`;
      if (!groups.has(label)) groups.set(label, new Set());
      groups.get(label).add(s.name);
    }
    const order = (l) => l === "Cantrips" ? 0 : +l.slice(5);
    spellsSection += `\n### ${entry.name} *(${cap(entry.system.tradition?.value || "")}${entry.system.prepared?.value === "focus" ? ", focus" : ""})*\n\n`;
    for (const label of [...groups.keys()].sort((a, b) => order(a) - order(b))) {
      spellsSection += `- **${label}:** ${[...groups.get(label)].join(", ")}\n`;
    }
  }
  if (spellsSection) spellsSection = `## Spells\n${spellsSection}\n`;

  /* feats & features */
  const CATS = [
    ["Class feats", ["class"]],
    ["Ancestry feats", ["ancestry"]],
    ["Skill feats", ["skill"]],
    ["General feats", ["general"]],
    ["Features", ["classfeature", "ancestryfeature"]],
  ];
  let featsSection = "";
  for (const [label, cats] of CATS) {
    const list = byType("feat").filter(f => cats.includes(f.system.category))
      .sort((a, b) => (a.system.level?.taken || 0) - (b.system.level?.taken || 0) || a.name.localeCompare(b.name));
    if (list.length) featsSection += `- **${label}:** ${list.map(f => f.name).join(", ")}\n`;
  }

  /* gold — coins summed in gp, plus the one-time adjustment */
  const goldRaw = byType("treasure")
    .filter(i => i.name in COIN_VALUES)
    .reduce((sum, i) => sum + (i.system.quantity ?? 0) * COIN_VALUES[i.name], 0)
    + GOLD_ADJUSTMENT;
  const gold = (Math.round(goldRaw * 100) / 100).toString();

  /* inventory (coins live in Current Gold, not here) */
  const GEAR_TYPES = ["armor", "equipment", "backpack", "consumable", "ammo", "treasure"];
  const gear = GEAR_TYPES.flatMap(byType)
    .filter(i => !(i.name in COIN_VALUES) && (i.system.quantity ?? 1) > 0)
    .map(i => {
      const q = i.system.quantity ?? 1;
      return `${i.name}${q > 1 ? ` ×${q}` : ""}`;
    });

  /* appearance (only the bio field players marked visible) */
  const appearance = sys.details.biography?.visibility?.appearance
    ? (sys.details.biography?.appearance || "").replace(/<[^>]+>/g, "").trim() : "";

  const portraitFile = PORTRAITS[slugify(actor.name)];
  const portrait = portraitFile && fs.existsSync(path.join(ROOT, "party", "images", portraitFile))
    ? `\n<img class="side" src="party/images/${portraitFile}" alt="${actor.name}">\n` : "";

  const md = `# ${actor.name}
${portrait}
*${headBits}*${subBits ? `\n\n${subBits}` : ""}
${appearance ? `\n> ${appearance}\n` : ""}
**Current Gold:** ${gold} gp

## Stats

| STR | DEX | CON | INT | WIS | CHA |
|-----|-----|-----|-----|-----|-----|
| ${ABILITIES.map(a => `${fmt(m[a])} (${scores[a]})`).join(" | ")} |

**Max HP** ${maxHP} · **AC** ${ac} · **Perception** ${fmt(perception)} (${RANKS[perRank]})

${saves}

## Skills

| Skill | Proficiency | Bonus |
|-------|-------------|-------|
${skillTable}
${weapons ? `\n## Weapons\n\n${weapons}\n` : ""}
${spellsSection}## Feats & Features

${featsSection}
## Inventory

${gear.join(" · ")}

---

*Auto-generated from the Foundry VTT export — derived numbers skip item/status bonuses. The GM regenerates this section, so edit **below** the line and your changes will stick.*

${NOTES_MARKER}

## Player Notes

*(yours to fill in — goals, grudges, loot claims, embarrassing moments…)*
`;

  return md;
}

function stashSection(actor) {
  const items = actor.items;
  const byType = t => items.filter(i => i.type === t);
  const qty = i => i.system.quantity ?? 1;
  const priceGp = i => {
    const p = i.system.price?.value || {};
    return (p.pp || 0) * 10 + (p.gp || 0) + (p.sp || 0) * 0.1 + (p.cp || 0) * 0.01;
  };

  const gear = ["weapon", "armor", "equipment", "backpack", "consumable", "ammo"]
    .flatMap(byType)
    .filter(i => qty(i) > 0)
    .map(i => `${i.name}${qty(i) > 1 ? ` ×${qty(i)}` : ""}`);

  const treasures = byType("treasure").filter(i => qty(i) > 0);
  const coins = treasures.filter(i => i.name in COIN_VALUES)
    .reduce((sum, i) => sum + qty(i) * COIN_VALUES[i.name], 0);
  const valuables = treasures.filter(i => !(i.name in COIN_VALUES));
  const valuablesTotal = valuables.reduce((sum, i) => sum + qty(i) * priceGp(i), 0);
  const valuablesList = valuables.map(i => {
    const each = priceGp(i);
    return `${i.name}${qty(i) > 1 ? ` ×${qty(i)}` : ""}${each ? ` (${each} gp${qty(i) > 1 ? " each" : ""})` : ""}`;
  });

  const description = (actor.system.details?.description || "").replace(/<[^>]+>/g, "").trim();

  let md = `## Party Stash\n\n*Shared gear from the Foundry party sheet — regenerated with the character sheets, so don't edit this section.*\n`;
  if (description) md += `\n${description}\n`;
  if (gear.length) md += `\n**Gear:** ${gear.join(" · ")}\n`;
  if (valuablesList.length) {
    md += `\n**Valuables:** ${valuablesList.join(" · ")} — worth ${Math.round(valuablesTotal * 100) / 100} gp total\n`;
  }
  if (coins) md += `\n**Party coin:** ${Math.round(coins * 100) / 100} gp\n`;
  if (!gear.length && !valuablesList.length && !coins) md += `\n*(empty — the party owns nothing. Sad.)*\n`;
  return md;
}

function updateOverviewStash(actor) {
  const outPath = path.join(OUT_DIR, "overview.md");
  const block = `${STASH_START}\n\n${stashSection(actor)}\n${STASH_END}`;
  let existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "# The Party\n";
  const si = existing.indexOf(STASH_START);
  const ei = existing.indexOf(STASH_END);
  if (si !== -1 && ei !== -1) {
    existing = existing.slice(0, si) + block + existing.slice(ei + STASH_END.length);
  } else {
    existing = existing.trimEnd() + "\n\n" + block + "\n";
  }
  fs.writeFileSync(outPath, existing, "utf8");
  console.log(`updated pages/the-party/overview.md (party stash from ${actor.name})`);
}

/* ── main ── */
const files = fs.readdirSync(EXPORT_DIR).filter(f => f.endsWith(".json"));
if (!files.length) { console.error(`No JSON exports found in ${EXPORT_DIR}`); process.exit(1); }

for (const file of files) {
  const actor = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, file), "utf8"));
  if (actor.type === "party") { updateOverviewStash(actor); continue; }
  if (actor.type !== "character") { console.log(`skip ${file} (not a PC)`); continue; }
  const slug = slugify(actor.name);
  const outPath = path.join(OUT_DIR, `${slug}.md`);
  let page = buildPage(actor);

  // keep whatever players wrote below the marker on an existing page
  if (fs.existsSync(outPath)) {
    const existing = fs.readFileSync(outPath, "utf8");
    const idx = existing.indexOf(NOTES_MARKER);
    if (idx !== -1) {
      page = page.slice(0, page.indexOf(NOTES_MARKER)) + existing.slice(idx);
    }
  }
  fs.writeFileSync(outPath, page, "utf8");
  console.log(`wrote pages/the-party/${slug}.md (${actor.name})`);
}
