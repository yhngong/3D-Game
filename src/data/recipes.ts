import { ProgressionTier, RecipeDef } from '../types';

export const RECIPES: RecipeDef[] = [
  // ========================
  // TIER 1: TIMBER & FLINT
  // ========================
  {
    id: 'craft_planks',
    resultItemId: 'block_oak_planks',
    resultCount: 4,
    tier: 1,
    category: 'block',
    station: 'Hand Crafting',
    ingredients: [{ itemId: 'block_oak_log', count: 1 }],
  },
  {
    id: 'craft_flint_from_cobble',
    resultItemId: 'flint_shard',
    resultCount: 2,
    tier: 1,
    category: 'material',
    station: 'Hand Crafting',
    ingredients: [{ itemId: 'block_cobblestone', count: 2 }],
  },
  {
    id: 'craft_workbench',
    resultItemId: 'block_workbench',
    resultCount: 1,
    tier: 1,
    category: 'block',
    station: 'Hand Crafting',
    ingredients: [{ itemId: 'block_oak_planks', count: 4 }],
  },
  {
    id: 'craft_torch',
    resultItemId: 'block_torch',
    resultCount: 4,
    tier: 1,
    category: 'block',
    station: 'Hand Crafting',
    ingredients: [
      { itemId: 'block_oak_planks', count: 1 },
      { itemId: 'flint_shard', count: 1 },
    ],
  },
  {
    id: 'craft_flint_pickaxe',
    resultItemId: 'flint_pickaxe',
    resultCount: 1,
    tier: 1,
    category: 'tool',
    station: 'Artisan Workbench',
    ingredients: [
      { itemId: 'block_oak_planks', count: 2 },
      { itemId: 'flint_shard', count: 2 },
    ],
  },
  {
    id: 'craft_flint_hatchet',
    resultItemId: 'flint_hatchet',
    resultCount: 1,
    tier: 1,
    category: 'tool',
    station: 'Artisan Workbench',
    ingredients: [
      { itemId: 'block_oak_planks', count: 2 },
      { itemId: 'flint_shard', count: 2 },
    ],
  },
  {
    id: 'craft_bramble_blade',
    resultItemId: 'bramble_blade',
    resultCount: 1,
    tier: 1,
    category: 'melee',
    station: 'Artisan Workbench',
    ingredients: [
      { itemId: 'block_oak_planks', count: 2 },
      { itemId: 'flint_shard', count: 3 },
      { itemId: 'living_vine', count: 2 },
    ],
  },
  {
    id: 'craft_hunters_bow',
    resultItemId: 'hunters_bow',
    resultCount: 1,
    tier: 1,
    category: 'ranged',
    station: 'Artisan Workbench',
    ingredients: [
      { itemId: 'block_oak_planks', count: 3 },
      { itemId: 'living_vine', count: 3 },
    ],
  },
  {
    id: 'craft_bramble_armor',
    resultItemId: 'bramble_armor',
    resultCount: 1,
    tier: 1,
    category: 'armor',
    station: 'Artisan Workbench',
    ingredients: [
      { itemId: 'tough_hide', count: 4 },
      { itemId: 'living_vine', count: 2 },
    ],
  },
  {
    id: 'craft_sylvan_salve',
    resultItemId: 'sylvan_salve',
    resultCount: 2,
    tier: 1,
    category: 'consumable',
    station: 'Hand Crafting',
    ingredients: [
      { itemId: 'living_vine', count: 2 },
      { itemId: 'block_dirt', count: 1 },
    ],
  },

  // ========================
  // TIER 2: VERDANT BRONZE & SYLVAN CORE
  // ========================
  {
    id: 'craft_bronze_forge',
    resultItemId: 'block_bronze_forge',
    resultCount: 1,
    tier: 2,
    category: 'block',
    station: 'Artisan Workbench',
    ingredients: [
      { itemId: 'block_cobblestone', count: 8 },
      { itemId: 'copper_ore', count: 2 },
    ],
  },
  {
    id: 'smelt_bronze_ingot',
    resultItemId: 'bronze_ingot',
    resultCount: 2,
    tier: 2,
    category: 'material',
    station: 'Bronze Smeltery',
    ingredients: [
      { itemId: 'copper_ore', count: 1 },
      { itemId: 'tin_ore', count: 1 },
    ],
  },
  {
    id: 'craft_bronze_pickaxe',
    resultItemId: 'bronze_pickaxe',
    resultCount: 1,
    tier: 2,
    category: 'tool',
    station: 'Bronze Smeltery',
    ingredients: [
      { itemId: 'bronze_ingot', count: 3 },
      { itemId: 'block_oak_planks', count: 2 },
    ],
  },
  {
    id: 'craft_bronze_broadsword',
    resultItemId: 'bronze_broadsword',
    resultCount: 1,
    tier: 2,
    category: 'melee',
    station: 'Bronze Smeltery',
    ingredients: [
      { itemId: 'bronze_ingot', count: 4 },
      { itemId: 'living_vine', count: 2 },
    ],
  },
  {
    id: 'craft_sylvan_thorn_staff',
    resultItemId: 'sylvan_thorn_staff',
    resultCount: 1,
    tier: 2,
    category: 'ranged',
    station: 'Bronze Smeltery',
    ingredients: [
      { itemId: 'bronze_ingot', count: 3 },
      { itemId: 'sylvan_essence', count: 3 },
      { itemId: 'living_vine', count: 2 },
    ],
  },
  {
    id: 'craft_bronze_armor',
    resultItemId: 'bronze_armor',
    resultCount: 1,
    tier: 2,
    category: 'armor',
    station: 'Bronze Smeltery',
    ingredients: [
      { itemId: 'bronze_ingot', count: 6 },
      { itemId: 'sylvan_essence', count: 2 },
    ],
  },
  {
    id: 'craft_totem_sylvan_behemoth',
    resultItemId: 'totem_sylvan_behemoth',
    resultCount: 1,
    tier: 2,
    category: 'boss_relic',
    station: 'Bronze Smeltery',
    ingredients: [
      { itemId: 'bronze_ingot', count: 3 },
      { itemId: 'sylvan_essence', count: 3 },
      { itemId: 'living_vine', count: 3 },
    ],
  },
  {
    id: 'craft_sylvan_vineblade',
    resultItemId: 'sylvan_vineblade',
    resultCount: 1,
    tier: 2,
    category: 'melee',
    station: 'Bronze Smeltery',
    ingredients: [
      { itemId: 'heart_of_the_grove', count: 1 },
      { itemId: 'bronze_ingot', count: 4 },
      { itemId: 'sylvan_essence', count: 3 },
    ],
  },

  // ========================
  // TIER 3: FROSTFORGED MYTHRIL
  // ========================
  {
    id: 'craft_frost_anvil',
    resultItemId: 'block_frost_anvil',
    resultCount: 1,
    tier: 3,
    category: 'block',
    station: 'Bronze Smeltery',
    ingredients: [
      { itemId: 'bronze_ingot', count: 4 },
      { itemId: 'mythril_ore', count: 3 },
      { itemId: 'cryo_shard', count: 2 },
    ],
  },
  {
    id: 'smelt_mythril_ingot',
    resultItemId: 'mythril_ingot',
    resultCount: 2,
    tier: 3,
    category: 'material',
    station: 'Frostforged Anvil',
    ingredients: [
      { itemId: 'mythril_ore', count: 2 },
      { itemId: 'cryo_shard', count: 1 },
    ],
  },
  {
    id: 'craft_mythril_pickaxe',
    resultItemId: 'mythril_pickaxe',
    resultCount: 1,
    tier: 3,
    category: 'tool',
    station: 'Frostforged Anvil',
    ingredients: [
      { itemId: 'mythril_ingot', count: 3 },
      { itemId: 'cryo_shard', count: 2 },
    ],
  },
  {
    id: 'craft_frost_greatsword',
    resultItemId: 'frost_greatsword',
    resultCount: 1,
    tier: 3,
    category: 'melee',
    station: 'Frostforged Anvil',
    ingredients: [
      { itemId: 'mythril_ingot', count: 4 },
      { itemId: 'cryo_shard', count: 3 },
    ],
  },
  {
    id: 'craft_cryo_repeater',
    resultItemId: 'cryo_repeater',
    resultCount: 1,
    tier: 3,
    category: 'ranged',
    station: 'Frostforged Anvil',
    ingredients: [
      { itemId: 'mythril_ingot', count: 4 },
      { itemId: 'cryo_shard', count: 4 },
    ],
  },
  {
    id: 'craft_mythril_armor',
    resultItemId: 'mythril_armor',
    resultCount: 1,
    tier: 3,
    category: 'armor',
    station: 'Frostforged Anvil',
    ingredients: [
      { itemId: 'mythril_ingot', count: 6 },
      { itemId: 'cryo_shard', count: 4 },
    ],
  },
  {
    id: 'craft_frostward_elixir',
    resultItemId: 'frostward_elixir',
    resultCount: 2,
    tier: 3,
    category: 'consumable',
    station: 'Frostforged Anvil',
    ingredients: [
      { itemId: 'cryo_shard', count: 2 },
      { itemId: 'sylvan_essence', count: 1 },
    ],
  },
  {
    id: 'craft_totem_cryonax',
    resultItemId: 'totem_cryonax',
    resultCount: 1,
    tier: 3,
    category: 'boss_relic',
    station: 'Frostforged Anvil',
    ingredients: [
      { itemId: 'mythril_ingot', count: 3 },
      { itemId: 'cryo_shard', count: 4 },
      { itemId: 'heart_of_the_grove', count: 1 },
    ],
  },
  {
    id: 'craft_glacier_warhammer',
    resultItemId: 'glacier_warhammer',
    resultCount: 1,
    tier: 3,
    category: 'melee',
    station: 'Frostforged Anvil',
    ingredients: [
      { itemId: 'cryo_matrix', count: 1 },
      { itemId: 'mythril_ingot', count: 4 },
      { itemId: 'cryo_shard', count: 4 },
    ],
  },

  // ========================
  // TIER 4: SOLAR PYROCLAST
  // ========================
  {
    id: 'craft_solar_forge',
    resultItemId: 'block_solar_forge',
    resultCount: 1,
    tier: 4,
    category: 'block',
    station: 'Frostforged Anvil',
    ingredients: [
      { itemId: 'pyroclast_ore', count: 3 },
      { itemId: 'solar_cinder', count: 3 },
      { itemId: 'block_obsidian', count: 4 },
    ],
  },
  {
    id: 'smelt_pyroclast_ingot',
    resultItemId: 'pyroclast_ingot',
    resultCount: 2,
    tier: 4,
    category: 'material',
    station: 'Solar Pyroclast Forge',
    ingredients: [
      { itemId: 'pyroclast_ore', count: 2 },
      { itemId: 'solar_cinder', count: 1 },
    ],
  },
  {
    id: 'craft_pyroclast_pickaxe',
    resultItemId: 'pyroclast_pickaxe',
    resultCount: 1,
    tier: 4,
    category: 'tool',
    station: 'Solar Pyroclast Forge',
    ingredients: [
      { itemId: 'pyroclast_ingot', count: 3 },
      { itemId: 'solar_cinder', count: 2 },
    ],
  },
  {
    id: 'craft_inferno_scythe',
    resultItemId: 'inferno_scythe',
    resultCount: 1,
    tier: 4,
    category: 'melee',
    station: 'Solar Pyroclast Forge',
    ingredients: [
      { itemId: 'pyroclast_ingot', count: 4 },
      { itemId: 'solar_cinder', count: 4 },
    ],
  },
  {
    id: 'craft_magma_cannon',
    resultItemId: 'magma_cannon',
    resultCount: 1,
    tier: 4,
    category: 'ranged',
    station: 'Solar Pyroclast Forge',
    ingredients: [
      { itemId: 'pyroclast_ingot', count: 4 },
      { itemId: 'solar_cinder', count: 4 },
    ],
  },
  {
    id: 'craft_pyroclast_armor',
    resultItemId: 'pyroclast_armor',
    resultCount: 1,
    tier: 4,
    category: 'armor',
    station: 'Solar Pyroclast Forge',
    ingredients: [
      { itemId: 'pyroclast_ingot', count: 6 },
      { itemId: 'solar_cinder', count: 4 },
    ],
  },
  {
    id: 'craft_totem_ignis_rex',
    resultItemId: 'totem_ignis_rex',
    resultCount: 1,
    tier: 4,
    category: 'boss_relic',
    station: 'Solar Pyroclast Forge',
    ingredients: [
      { itemId: 'pyroclast_ingot', count: 3 },
      { itemId: 'solar_cinder', count: 4 },
      { itemId: 'cryo_matrix', count: 1 },
    ],
  },

  // ========================
  // TIER 5: VOID-TOUCHED AETHERIUM
  // ========================
  {
    id: 'craft_astral_altar',
    resultItemId: 'block_astral_altar',
    resultCount: 1,
    tier: 5,
    category: 'block',
    station: 'Solar Pyroclast Forge',
    ingredients: [
      { itemId: 'aetherium_ore', count: 3 },
      { itemId: 'void_crystal', count: 3 },
      { itemId: 'block_voidstone', count: 4 },
    ],
  },
  {
    id: 'smelt_aetherium_ingot',
    resultItemId: 'aetherium_ingot',
    resultCount: 2,
    tier: 5,
    category: 'material',
    station: 'Astral Nexus Altar',
    ingredients: [
      { itemId: 'aetherium_ore', count: 2 },
      { itemId: 'void_crystal', count: 1 },
    ],
  },
  {
    id: 'craft_aetherium_pickaxe',
    resultItemId: 'aetherium_pickaxe',
    resultCount: 1,
    tier: 5,
    category: 'tool',
    station: 'Astral Nexus Altar',
    ingredients: [
      { itemId: 'aetherium_ingot', count: 3 },
      { itemId: 'void_crystal', count: 2 },
    ],
  },
  {
    id: 'craft_voidrend_katana',
    resultItemId: 'voidrend_katana',
    resultCount: 1,
    tier: 5,
    category: 'melee',
    station: 'Astral Nexus Altar',
    ingredients: [
      { itemId: 'aetherium_ingot', count: 4 },
      { itemId: 'void_crystal', count: 4 },
      { itemId: 'solar_core', count: 1 },
    ],
  },
  {
    id: 'craft_aether_arc_rifle',
    resultItemId: 'aether_arc_rifle',
    resultCount: 1,
    tier: 5,
    category: 'ranged',
    station: 'Astral Nexus Altar',
    ingredients: [
      { itemId: 'aetherium_ingot', count: 4 },
      { itemId: 'void_crystal', count: 4 },
    ],
  },
  {
    id: 'craft_aetherium_armor',
    resultItemId: 'aetherium_armor',
    resultCount: 1,
    tier: 5,
    category: 'armor',
    station: 'Astral Nexus Altar',
    ingredients: [
      { itemId: 'aetherium_ingot', count: 6 },
      { itemId: 'void_crystal', count: 4 },
    ],
  },
  {
    id: 'craft_astral_nectar',
    resultItemId: 'astral_nectar',
    resultCount: 2,
    tier: 5,
    category: 'consumable',
    station: 'Astral Nexus Altar',
    ingredients: [
      { itemId: 'void_crystal', count: 2 },
      { itemId: 'solar_cinder', count: 2 },
    ],
  },
  {
    id: 'craft_totem_malakor',
    resultItemId: 'totem_malakor',
    resultCount: 1,
    tier: 5,
    category: 'boss_relic',
    station: 'Astral Nexus Altar',
    ingredients: [
      { itemId: 'aetherium_ingot', count: 3 },
      { itemId: 'void_crystal', count: 4 },
      { itemId: 'solar_core', count: 1 },
    ],
  },

  // ========================
  // TIER 6: CELESTIAL STARSTEEL (FINAL ASCENSION)
  // ========================
  {
    id: 'smelt_starsteel_ingot',
    resultItemId: 'starsteel_ingot',
    resultCount: 2,
    tier: 6,
    category: 'material',
    station: 'Astral Nexus Altar',
    ingredients: [
      { itemId: 'celestial_ore', count: 2 },
      { itemId: 'void_crystal', count: 1 },
    ],
  },
  {
    id: 'craft_starsteel_pickaxe',
    resultItemId: 'starsteel_pickaxe',
    resultCount: 1,
    tier: 6,
    category: 'tool',
    station: 'Astral Nexus Altar',
    ingredients: [
      { itemId: 'starsteel_ingot', count: 3 },
      { itemId: 'aetherium_ingot', count: 2 },
    ],
  },
  {
    id: 'craft_starforged_cleaver',
    resultItemId: 'starforged_cleaver',
    resultCount: 1,
    tier: 6,
    category: 'melee',
    station: 'Astral Nexus Altar',
    ingredients: [
      { itemId: 'starsteel_ingot', count: 5 },
      { itemId: 'astral_keystone', count: 1 },
    ],
  },
  {
    id: 'craft_chronos_scepter',
    resultItemId: 'chronos_scepter',
    resultCount: 1,
    tier: 6,
    category: 'ranged',
    station: 'Astral Nexus Altar',
    ingredients: [
      { itemId: 'starsteel_ingot', count: 5 },
      { itemId: 'void_crystal', count: 4 },
    ],
  },
  {
    id: 'craft_starsteel_armor',
    resultItemId: 'starsteel_armor',
    resultCount: 1,
    tier: 6,
    category: 'armor',
    station: 'Astral Nexus Altar',
    ingredients: [
      { itemId: 'starsteel_ingot', count: 6 },
      { itemId: 'astral_keystone', count: 1 },
    ],
  },
  {
    id: 'craft_totem_aethelgard',
    resultItemId: 'totem_aethelgard',
    resultCount: 1,
    tier: 6,
    category: 'boss_relic',
    station: 'Astral Nexus Altar',
    ingredients: [
      { itemId: 'starsteel_ingot', count: 4 },
      { itemId: 'astral_keystone', count: 1 },
      { itemId: 'void_crystal', count: 4 },
    ],
  },
];

export const PROGRESSION_GUIDE: Record<
  ProgressionTier,
  {
    summary: string;
    steps: string[];
    bossName: string;
    bossId: string;
  }
> = {
  1: {
    summary: 'Gather timber, stone & vines in the Verdant Groves to forge your first weapons and Copper/Tin mining gear.',
    steps: [
      'Chop Oak Logs & Sylvan Leaves for Timber Planks and Living Vines',
      'Mine Stone with your starter Flint Pickaxe to collect Cobblestone, Copper Ore & Tin Ore',
      'Press [E] to craft a Bramble Thorn-Blade or Sylvan Hunter Shortbow',
      'Smelt Verdant Bronze Ingots to advance to Tier II!',
    ],
    bossName: 'Sylvan Behemoth (Tier II Boss)',
    bossId: 'boss_sylvan_behemoth',
  },
  2: {
    summary: 'Alloy Copper & Tin into Verdant Bronze, hunt Sylvan Stalkers & Moss Golems, and awaken the Sylvan Behemoth.',
    steps: [
      'Mine Copper & Tin Ore veins and craft Verdant Bronze Ingots in [E]',
      'Forge the Verdant Bronze Pickaxe, Broadsword, and Bronze Plate Set',
      'Slay Sylvan Stalkers & Moss Golems for Sylvan Essence',
      'Craft the Verdant Effigy and summon BOSS I: SYLVAN BEHEMOTH!',
    ],
    bossName: 'Sylvan Behemoth, Ancient Treant Titan',
    bossId: 'boss_sylvan_behemoth',
  },
  3: {
    summary: 'Venture into the Permafrost Peaks or deep caves to mine Frostforged Mythril & Cryo Shards.',
    steps: [
      'Use your Bronze Pickaxe to mine glowing blue Mythril Ore & Cryo Crystal Clusters',
      'Battle Crystal Crawlers & Permafrost Wraiths for extra Cryo Shards',
      'Craft Frostforged Mythril Armor (unlocks Double-Jump!) & Frost Greatsword / Cryo-Repeater',
      'Craft the Permafrost Idol and defeat BOSS II: CRYONAX, THE PERMAFROST TITAN!',
    ],
    bossName: 'Cryonax, The Permafrost Titan',
    bossId: 'boss_cryonax',
  },
  4: {
    summary: 'Harness volcanic Pyroclast Ore & Solar Cinders in the Scorched Wastes to challenge Ignis Rex.',
    steps: [
      'Mine blazing orange Pyroclast Ore with a Mythril Pickaxe in the Scorched Wastes or deep underground',
      'Hunt Magma Brutes & mine Magmacrust for Solar Cinders',
      'Forge the Pyroclast Inferno Scythe, Magma Cannon, and Solar Warplate',
      'Craft the Cinder Sigil and defeat BOSS III: IGNIS REX, THE MOLTEN COLOSSUS!',
    ],
    bossName: 'Ignis Rex, The Molten Colossus',
    bossId: 'boss_ignis_rex',
  },
  5: {
    summary: 'Enter the Astral Void Rifts to harvest Aetherium Ore & Void Crystals and confront the Void Architect.',
    steps: [
      'Use your Pyroclast Pickaxe to mine violet Aetherium Rift Ore',
      'Slay teleporting Abyssal Void Reavers for Void Crystals',
      'Craft the Voidrend Dimensional Katana (with Shadow Blink Strike!), Arc-Railgun & Voidwalker Armor',
      'Craft the Void Resonator and defeat BOSS IV: MALAKOR, ARCHITECT OF THE VOID!',
    ],
    bossName: 'Malakor, Architect of the Void',
    bossId: 'boss_malakor',
  },
  6: {
    summary: 'Forge mythic Celestial Starsteel and summon Aethelgard, The Astral Sovereign for the ultimate battle!',
    steps: [
      'Mine golden Celestial Starsteel Ore with an Aetherium Rift-Pick',
      'Forge the Zenith Starforged Blade, Chronos Astral Scepter & Celestial Starsteel Regalia',
      'Craft the Astral Zenith Crown and defeat FINAL BOSS: AETHELGARD, THE ASTRAL SOVEREIGN!',
    ],
    bossName: 'Aethelgard, The Astral Sovereign',
    bossId: 'boss_aethelgard',
  },
};
