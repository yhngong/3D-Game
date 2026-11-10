import * as THREE from 'three';

export enum BlockId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Cobblestone = 4,
  OakLog = 5,
  OakLeaves = 6,
  OakPlanks = 7,
  Sand = 8,
  Water = 9,
  Glass = 10,
  Torch = 11,
  Workbench = 12,
  BronzeForge = 13,
  FrostAnvil = 14,
  SolarForge = 15,
  AstralAltar = 16,
  CopperOre = 17,
  TinOre = 18,
  MythrilOre = 19,
  CryoCrystal = 20,
  PyroclastOre = 21,
  Obsidian = 22,
  Voidstone = 23,
  AetheriumOre = 24,
  CelestialOre = 25,
  MossyStone = 26,
  PermafrostRock = 27,
  SnowBlock = 28,
  VolcanicRock = 29,
  MagmaBlock = 30,
  AstralBrick = 31,
  Bedrock = 32,
}

export type ProgressionTier = 1 | 2 | 3 | 4 | 5 | 6;

export type ItemCategory =
  | 'block'
  | 'material'
  | 'tool'
  | 'melee'
  | 'ranged'
  | 'armor'
  | 'trinket'
  | 'consumable'
  | 'boss_relic';

export interface BlockDef {
  id: BlockId;
  name: string;
  hardness: number; // seconds to break with matching tier
  minToolTier: number; // 0 = hand, 1 = flint/wood, 2 = bronze, 3 = mythril, 4 = pyroclast, 5 = aetherium, 6 = starsteel
  preferredTool: 'pickaxe' | 'axe' | 'any';
  dropItem: string;
  dropCount: number;
  transparent?: boolean;
  solid: boolean;
  liquid?: boolean;
  emissive?: boolean;
  colorTop: string;
  colorSide: string;
  colorBottom: string;
  accentColor?: string;
  pattern?: 'grass' | 'log' | 'leaves' | 'ore' | 'crystal' | 'brick' | 'station' | 'liquid' | 'stone' | 'magma';
}

export interface WeaponAbilityDef {
  name: string;
  description: string;
  manaCost: number;
  cooldown: number; // seconds
  type:
    | 'thorn_wave'
    | 'ice_nova'
    | 'shatter_slam'
    | 'flame_whirlwind'
    | 'lava_eruption'
    | 'shadow_blink'
    | 'starfall'
    | 'arrow_shot'
    | 'thorn_volley'
    | 'cryo_bolt'
    | 'hailstorm'
    | 'magma_bomb'
    | 'solar_beam'
    | 'lightning_rail'
    | 'singularity_orb'
    | 'astral_meteor'
    | 'supernova_blast';
}

export interface ItemDef {
  id: string;
  name: string;
  tier: ProgressionTier;
  category: ItemCategory;
  description: string;
  maxStack: number;
  blockId?: BlockId;
  // Tool properties
  toolType?: 'pickaxe' | 'axe';
  toolTier?: number;
  miningSpeed?: number;
  // Combat properties
  damage?: number;
  attackSpeed?: number; // attacks per second
  reach?: number;
  knockback?: number;
  critChance?: number;
  statusEffect?: 'poison' | 'chill' | 'burn' | 'void_weaken' | 'astral_mark';
  ability?: WeaponAbilityDef;
  // Armor & Trinket properties
  defense?: number;
  bonusMaxHp?: number;
  bonusMaxMana?: number;
  bonusDamageMult?: number;
  bonusRegen?: number;
  dashCooldownMult?: number;
  speedMultiplier?: number;
  jumpBoost?: number;
  allowDoubleJump?: boolean;
  allowGlide?: boolean;
  setBonusText?: string;
  // Consumable properties
  healHp?: number;
  healMana?: number;
  buffType?: 'regen' | 'strength' | 'haste' | 'cosmic';
  buffDuration?: number;
  // Boss summon & World totems
  summonsBossId?: string;
  totemEffect?: 'sundial' | 'tempest';
  // Visual icon colors
  primaryColor: string;
  secondaryColor: string;
  iconShape:
    | 'block'
    | 'ore'
    | 'ingot'
    | 'crystal'
    | 'essence'
    | 'core'
    | 'pickaxe'
    | 'axe'
    | 'sword'
    | 'greatsword'
    | 'scythe'
    | 'katana'
    | 'hammer'
    | 'bow'
    | 'staff'
    | 'repeater'
    | 'cannon'
    | 'rifle'
    | 'armor'
    | 'potion'
    | 'totem';
}

export interface RecipeIngredient {
  itemId: string;
  count: number;
}

export interface RecipeDef {
  id: string;
  resultItemId: string;
  resultCount: number;
  tier: ProgressionTier;
  category: ItemCategory;
  station?: string; // Descriptive station name
  ingredients: RecipeIngredient[];
}

export interface InventorySlot {
  itemId: string;
  count: number;
}

export type BiomeType = 'verdant_groves' | 'permafrost_peaks' | 'scorched_wastes' | 'astral_rifts';

export interface MonsterDrop {
  itemId: string;
  min: number;
  max: number;
  chance: number; // 0 to 1
}

export interface MonsterDef {
  id: string;
  name: string;
  tier: ProgressionTier;
  biome: BiomeType | 'any';
  maxHp: number;
  damage: number;
  speed: number;
  scale: number;
  aggroRange: number;
  attackRange: number;
  attackCooldown: number;
  isRanged?: boolean;
  projectileType?: string;
  projectileColor?: string;
  canTeleport?: boolean;
  canFly?: boolean;
  bodyColor: string;
  accentColor: string;
  eyeColor: string;
  modelType: 'boar' | 'stalker' | 'golem' | 'crawler' | 'wraith' | 'brute' | 'reaver' | 'sentinel';
  drops: MonsterDrop[];
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  tier: ProgressionTier;
  lore: string;
  summonItemId: string;
  maxHp: number;
  damage: number;
  speed: number;
  scale: number;
  bodyColor: string;
  accentColor: string;
  glowColor: string;
  modelType: 'treant_boss' | 'frost_boss' | 'molten_boss' | 'void_boss' | 'astral_boss';
  phases: {
    hpThreshold: number; // e.g., 1.0, 0.65, 0.3
    name: string;
    speedMult: number;
    attackInterval: number;
    attacks: string[];
  }[];
  drops: MonsterDrop[];
  unlocksTier: ProgressionTier;
  unlockMessage: string;
}

export interface ActiveProjectile {
  id: number;
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  fromPlayer: boolean;
  damage: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
  gravity: number;
  explosiveRadius?: number;
  statusEffect?: 'poison' | 'chill' | 'burn' | 'void_weaken' | 'astral_mark';
  homing?: boolean;
  piercing?: boolean;
}

export interface DroppedItemEntity {
  id: number;
  itemId: string;
  count: number;
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  createdAt: number;
}

export type SkillId = 'vitality' | 'arcane' | 'might' | 'prospector' | 'agility';

export interface SkillDef {
  id: SkillId;
  name: string;
  icon: string;
  color: string;
  maxRank: number;
  description: string;
  perRankText: string;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  tierColor: string;
}
