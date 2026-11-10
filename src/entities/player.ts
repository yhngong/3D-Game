import * as THREE from 'three';
import { sound } from '../audio/soundEngine';
import { ACHIEVEMENTS, BLOCKS, ITEMS, SKILLS } from '../data/itemsAndBlocks';
import { RECIPES } from '../data/recipes';
import { AchievementDef, BlockId, InventorySlot, ItemDef, ProgressionTier, RecipeDef, SkillId } from '../types';
import { VoxelWorld } from '../world/voxelWorld';

export class PlayerController {
  public camera: THREE.PerspectiveCamera;
  public world: VoxelWorld;

  public position = new THREE.Vector3(6.5, 26, 9.5);
  public velocity = new THREE.Vector3(0, 0, 0);
  public yaw = 0;
  public pitch = -0.15;

  public readonly width = 0.65;
  public readonly height = 1.72;
  public readonly eyeHeight = 1.54;

  public onGround = false;
  public inWater = false;
  public jumpsRemaining = 1;

  // Combat & Progression Stats
  public hp = 120;
  public maxHp = 120;
  public mana = 100;
  public maxMana = 100;
  public defense = 0;
  public unlockedTier: ProgressionTier = 1;
  public defeatedBosses: Set<string> = new Set();

  // RPG Leveling, Skills & Achievements
  public level = 1;
  public xp = 0;
  public xpToNext = 100;
  public skillPoints = 1;
  public skills: Record<SkillId, number> = {
    vitality: 0,
    arcane: 0,
    might: 0,
    prospector: 0,
    agility: 0,
  };
  public unlockedAchievements: Set<string> = new Set();
  public blocksMinedCount = 0;
  public monstersSlainCount = 0;
  public itemsDisposedCount = 0;

  public onLevelUpCallback: ((newLevel: number) => void) | null = null;
  public onAchievementCallback: ((ach: AchievementDef) => void) | null = null;

  // World & Cheats configuration
  public worldName = 'funnyblockgame World';
  public cheatsEnabled = false;
  public hasSavedWorld = false;

  // Inventory: 9 hotbar slots (0..8) + 27 backpack slots (9..35)
  public inventory: (InventorySlot | null)[] = new Array(36).fill(null);
  public selectedHotbarIndex = 0;
  public equippedArmorId: string | null = null;
  public equippedTrinketId: string | null = null;
  public equippedMountId: string | null = null;
  public isMounted = false;

  // Cooldowns & animations
  public attackCooldownTimer = 0;
  public weaponPower = 1.0; // 0.0 to 1.0 (0% to 100% power bar)
  public abilityCooldownTimer = 0;
  public potionCooldownTimer = 0;
  public dashCooldownTimer = 0;
  public dashActiveTimer = 0;
  public recallCooldownTimer = 0;
  public hurtInvulnTimer = 0;
  public swingAnimProgress = 0;
  public isSwinging = false;

  // Camera perspective (1st person vs 3rd person)
  public isThirdPerson = false;
  public heroGroup: THREE.Group;
  private heroLeftLeg!: THREE.Mesh;
  private heroRightLeg!: THREE.Mesh;
  private heroLeftArm!: THREE.Mesh;
  private heroRightArm!: THREE.Group;
  private heroTorsoMat!: THREE.MeshLambertMaterial;
  private heroAccentMat!: THREE.MeshLambertMaterial;
  private lastHeroArmorId: string | null = '__init__';

  // 3D Flying Mount Rig (visible beneath player while riding!)
  public mountGroup: THREE.Group;
  private mountLeftWing: THREE.Object3D | null = null;
  private mountRightWing: THREE.Object3D | null = null;
  private mountSpinRing: THREE.Object3D | null = null;
  private lastBuiltMountId: string | null = '__init__';

  // First-person held item 3D rig
  public handGroup: THREE.Group;
  private heldMeshGroup: THREE.Group;
  private lastHeldItemId: string | null = '__init__';

  // Input state
  public keys: Record<string, boolean> = {};

  constructor(camera: THREE.PerspectiveCamera, world: VoxelWorld) {
    this.camera = camera;
    this.world = world;

    this.handGroup = new THREE.Group();
    this.heldMeshGroup = new THREE.Group();
    this.handGroup.add(this.heldMeshGroup);
    this.camera.add(this.handGroup);

    this.heroGroup = new THREE.Group();
    this.buildThirdPersonHeroMesh();
    this.world.scene.add(this.heroGroup);

    this.mountGroup = new THREE.Group();
    this.mountGroup.visible = false;
    this.world.scene.add(this.mountGroup);

    this.initStarterInventory();
    this.loadPlayerState();
    this.recalculateStats();

    const spawnY = this.world.getSurfaceHeight(Math.floor(this.position.x), Math.floor(this.position.z)) + 2.5;
    this.position.y = Math.max(this.position.y, spawnY);
  }

  private buildThirdPersonHeroMesh(): void {
    this.heroTorsoMat = new THREE.MeshLambertMaterial({ color: '#a16207' });
    this.heroAccentMat = new THREE.MeshLambertMaterial({ color: '#22c55e', emissive: '#22c55e', emissiveIntensity: 0.25 });
    const darkMat = new THREE.MeshLambertMaterial({ color: '#1e293b' });
    const visorMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });

    // Legs
    const legGeo = new THREE.BoxGeometry(0.24, 0.68, 0.24);
    this.heroLeftLeg = new THREE.Mesh(legGeo, darkMat);
    this.heroLeftLeg.position.set(-0.15, 0.34, 0);
    this.heroRightLeg = new THREE.Mesh(legGeo, darkMat);
    this.heroRightLeg.position.set(0.15, 0.34, 0);

    // Armored Torso + Chest Core
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.32), this.heroTorsoMat);
    torso.position.set(0, 1.02, 0);
    const chestCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), this.heroAccentMat);
    chestCore.position.set(0, 1.06, -0.17);
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.72, 0.04), this.heroAccentMat);
    cape.position.set(0, 0.96, 0.19);
    cape.rotation.x = 0.14;

    // Head & Helmet
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), this.heroTorsoMat);
    head.position.set(0, 1.58, 0);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.05), visorMat);
    visor.position.set(0, 1.58, -0.21);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.46), this.heroAccentMat);
    crest.position.set(0, 1.82, 0);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.2, 0.62, 0.2);
    this.heroLeftArm = new THREE.Mesh(armGeo, this.heroTorsoMat);
    this.heroLeftArm.position.set(-0.4, 1.02, 0);

    this.heroRightArm = new THREE.Group();
    this.heroRightArm.position.set(0.4, 1.25, 0);
    const rArmMesh = new THREE.Mesh(armGeo, this.heroTorsoMat);
    rArmMesh.position.set(0, -0.23, 0);
    const rBlade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.1), this.heroAccentMat);
    rBlade.position.set(0, -0.35, -0.32);
    rBlade.rotation.x = -Math.PI / 3;
    this.heroRightArm.add(rArmMesh, rBlade);

    this.heroGroup.add(
      this.heroLeftLeg,
      this.heroRightLeg,
      torso,
      chestCore,
      cape,
      head,
      visor,
      crest,
      this.heroLeftArm,
      this.heroRightArm
    );
    this.heroGroup.visible = false;
  }

  public toggleCameraView(): boolean {
    this.isThirdPerson = !this.isThirdPerson;
    this.heroGroup.visible = this.isThirdPerson;
    this.handGroup.visible = !this.isThirdPerson;
    return this.isThirdPerson;
  }

  public initStarterInventory(): void {
    this.inventory.fill(null);
    this.inventory[0] = { itemId: 'bramble_blade', count: 1 };
    this.inventory[1] = { itemId: 'flint_pickaxe', count: 1 };
    this.inventory[2] = { itemId: 'flint_hatchet', count: 1 };
    this.inventory[3] = { itemId: 'hunters_bow', count: 1 };
    this.inventory[4] = { itemId: 'sylvan_salve', count: 4 };
    this.inventory[5] = { itemId: 'block_torch', count: 16 };
    this.inventory[6] = { itemId: 'block_oak_planks', count: 24 };
    this.inventory[7] = { itemId: 'sundial_totem', count: 2 };
    this.inventory[8] = { itemId: 'tempest_totem', count: 2 };
    this.equippedArmorId = 'bramble_armor';
    this.equippedTrinketId = null;
    this.equippedMountId = null;
    this.isMounted = false;
    if (this.mountGroup) this.mountGroup.visible = false;
  }

  public toggleMount(): { mounted: boolean; mountDef: ItemDef | null } {
    const mountDef = this.equippedMountId ? ITEMS[this.equippedMountId] || null : null;
    if (!mountDef) {
      this.isMounted = false;
      this.mountGroup.visible = false;
      return { mounted: false, mountDef: null };
    }
    this.isMounted = !this.isMounted;
    this.mountGroup.visible = this.isMounted;
    if (this.isMounted) {
      this.velocity.y = Math.max(this.velocity.y, 5.2);
      this.onGround = false;
      this.unlockAchievement('sky_rider');
      sound.playMagicCast(1.2);
    } else {
      sound.playPickup();
    }
    return { mounted: this.isMounted, mountDef };
  }

  public equipAndRideMountFromSlot(slotIndex: number): ItemDef | null {
    const slot = this.inventory[slotIndex];
    if (!slot) return null;
    const def = ITEMS[slot.itemId];
    if (!def || def.category !== 'mount') return null;

    const prevMount = this.equippedMountId;
    this.equippedMountId = def.id;
    this.inventory[slotIndex] = prevMount ? { itemId: prevMount, count: 1 } : null;
    this.isMounted = true;
    this.mountGroup.visible = true;
    this.velocity.y = Math.max(this.velocity.y, 5.2);
    this.onGround = false;
    this.unlockAchievement('sky_rider');
    sound.playMagicCast(1.2);
    this.savePlayerState();
    return def;
  }

  public getSelectedSlot(): InventorySlot | null {
    return this.inventory[this.selectedHotbarIndex];
  }

  public getSelectedItemDef(): ItemDef | null {
    const slot = this.getSelectedSlot();
    if (!slot) return null;
    return ITEMS[slot.itemId] || null;
  }

  public recalculateStats(): void {
    let baseHp = 120 + (this.level - 1) * 10 + (this.skills.vitality || 0) * 25;
    let baseMana = 100 + (this.level - 1) * 8 + (this.skills.arcane || 0) * 25;
    let def = 0;

    if (this.equippedArmorId && ITEMS[this.equippedArmorId]) {
      const armor = ITEMS[this.equippedArmorId];
      baseHp += armor.bonusMaxHp || 0;
      baseMana += armor.bonusMaxMana || 0;
      def += armor.defense || 0;
    }

    if (this.equippedTrinketId && ITEMS[this.equippedTrinketId]) {
      const trinket = ITEMS[this.equippedTrinketId];
      baseHp += trinket.bonusMaxHp || 0;
      baseMana += trinket.bonusMaxMana || 0;
      def += trinket.defense || 0;
    }

    this.maxHp = baseHp;
    this.maxMana = baseMana;
    this.defense = Math.min(60, def);
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    if (this.mana > this.maxMana) this.mana = this.maxMana;
  }

  public getDamageMultiplier(): number {
    const skillMult = (this.skills.might || 0) * 0.06;
    const trinketMult =
      this.equippedTrinketId && ITEMS[this.equippedTrinketId]
        ? ITEMS[this.equippedTrinketId].bonusDamageMult || 0
        : 0;
    const levelMult = (this.level - 1) * 0.02;
    return 1 + skillMult + trinketMult + levelMult;
  }

  /**
   * Returns the damage multiplier based on current Weapon Power Bar percentage:
   * - Under 50%: 0.25x
   * - 50% to <80%: 0.75x
   * - 80% to <100%: 1.0x
   * - 100%: 2.0x
   */
  public getWeaponPowerMultiplier(power = this.weaponPower): number {
    if (power >= 0.999) return 2.0;
    if (power >= 0.8) return 1.0;
    if (power >= 0.5) return 0.75;
    return 0.25;
  }

  /**
   * Consumes the current Weapon Power Bar (resetting it to 0) and returns the multiplier.
   */
  public consumeWeaponPower(): { multiplier: number; isMaxPower: boolean; pct: number } {
    const pct = this.weaponPower;
    const multiplier = this.getWeaponPowerMultiplier(pct);
    const isMaxPower = pct >= 0.999;
    this.weaponPower = 0;
    return { multiplier, isMaxPower, pct };
  }

  public getMiningSpeedMultiplier(): number {
    return 1 + (this.skills.prospector || 0) * 0.14;
  }

  public getDashCooldownDuration(): number {
    const skillFactor = Math.max(0.4, 1 - (this.skills.agility || 0) * 0.06);
    const trinketFactor =
      this.equippedTrinketId && ITEMS[this.equippedTrinketId]?.dashCooldownMult
        ? ITEMS[this.equippedTrinketId].dashCooldownMult!
        : 1.0;
    return Math.max(0.35, 1.6 * skillFactor * trinketFactor);
  }

  public gainXp(amount: number): void {
    if (amount <= 0) return;
    this.xp += Math.round(amount);
    let leveledUp = false;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.skillPoints++;
      this.xpToNext = Math.round(100 * Math.pow(1.26, this.level - 1));
      leveledUp = true;
    }
    if (leveledUp) {
      this.recalculateStats();
      this.hp = this.maxHp;
      this.mana = this.maxMana;
      sound.playFanfare();
      if (this.onLevelUpCallback) {
        this.onLevelUpCallback(this.level);
      }
    }
    this.savePlayerState();
  }

  public upgradeSkill(skillId: SkillId): boolean {
    if (this.skillPoints <= 0) return false;
    const def = SKILLS.find((s) => s.id === skillId);
    if (!def) return false;
    const cur = this.skills[skillId] || 0;
    if (cur >= def.maxRank) return false;

    this.skillPoints--;
    this.skills[skillId] = cur + 1;
    this.recalculateStats();
    this.hp = Math.min(this.maxHp, this.hp + 25);
    this.mana = Math.min(this.maxMana, this.mana + 25);
    sound.playPickup();
    this.savePlayerState();
    return true;
  }

  public unlockAchievement(achId: string): boolean {
    if (this.unlockedAchievements.has(achId)) return false;
    const def = ACHIEVEMENTS.find((a) => a.id === achId);
    if (!def) return false;
    this.unlockedAchievements.add(achId);
    this.gainXp(def.xpReward);
    sound.playFanfare();
    if (this.onAchievementCallback) {
      this.onAchievementCallback(def);
    }
    this.savePlayerState();
    return true;
  }

  /**
   * Disposes of items in a given inventory slot (0..35) via the Void Incinerator,
   * salvaging them into bonus XP and Mana!
   */
  public disposeSlotItem(slotIndex: number, disposeAll = true): { itemName: string; count: number; xpGained: number } | null {
    if (slotIndex < 0 || slotIndex >= this.inventory.length) return null;
    const slot = this.inventory[slotIndex];
    if (!slot) return null;

    const def = ITEMS[slot.itemId];
    const removeCount = disposeAll ? slot.count : 1;
    const tier = def ? def.tier : 1;
    const xpGained = Math.max(4, removeCount * tier * 6);

    slot.count -= removeCount;
    if (slot.count <= 0) {
      this.inventory[slotIndex] = null;
    }

    this.itemsDisposedCount += removeCount;
    this.mana = Math.min(this.maxMana, this.mana + removeCount * 4);
    this.gainXp(xpGained);
    this.unlockAchievement('void_incinerator');
    sound.playBlockBreak();
    this.savePlayerState();

    return {
      itemName: def ? def.name : slot.itemId,
      count: removeCount,
      xpGained,
    };
  }

  /**
   * Disposes of the currently held hotbar item ([X] key).
   */
  public disposeHeldItem(disposeEntireStack = false): { itemName: string; count: number; xpGained: number } | null {
    return this.disposeSlotItem(this.selectedHotbarIndex, disposeEntireStack);
  }

  /**
   * Consolidates partial stacks and cleanly sorts the backpack slots (9..35) by Category & Tier.
   */
  public sortAndStackInventory(): void {
    // 1. Merge partial stacks across all slots
    for (let i = 0; i < this.inventory.length; i++) {
      const slotA = this.inventory[i];
      if (!slotA) continue;
      const def = ITEMS[slotA.itemId];
      if (!def || slotA.count >= def.maxStack) continue;

      for (let j = i + 1; j < this.inventory.length; j++) {
        const slotB = this.inventory[j];
        if (slotB && slotB.itemId === slotA.itemId) {
          const transfer = Math.min(def.maxStack - slotA.count, slotB.count);
          slotA.count += transfer;
          slotB.count -= transfer;
          if (slotB.count <= 0) {
            this.inventory[j] = null;
          }
          if (slotA.count >= def.maxStack) break;
        }
      }
    }

    // 2. Sort backpack slots (indices 9..35) by Tier descending, then Category, then Name
    const backpack = this.inventory.slice(9).filter((s): s is InventorySlot => s !== null);
    backpack.sort((a, b) => {
      const defA = ITEMS[a.itemId];
      const defB = ITEMS[b.itemId];
      if (!defA || !defB) return 0;
      if (defB.tier !== defA.tier) return defB.tier - defA.tier;
      if (defA.category !== defB.category) return defA.category.localeCompare(defB.category);
      return defA.name.localeCompare(defB.name);
    });

    for (let i = 9; i < 36; i++) {
      this.inventory[i] = backpack[i - 9] || null;
    }

    sound.playPickup();
    this.savePlayerState();
  }

  public recallToSanctuary(): boolean {
    if (this.recallCooldownTimer > 0) return false;
    this.recallCooldownTimer = 6.0;
    const sy = this.world.getSurfaceHeight(6, 9) + 2.8;
    this.position.set(6.5, sy, 9.5);
    this.velocity.set(0, 0, 0);
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.35);
    this.mana = Math.min(this.maxMana, this.mana + this.maxMana * 0.35);
    sound.playFanfare();
    this.savePlayerState();
    return true;
  }

  public addItem(itemId: string, count = 1): boolean {
    const def = ITEMS[itemId];
    if (!def || count <= 0) return false;

    let remaining = count;

    // Auto-unlock tier awareness if picking up high-tier items
    if (def.tier > this.unlockedTier) {
      this.unlockedTier = def.tier;
    }

    // First stack into existing slots
    for (let i = 0; i < this.inventory.length; i++) {
      const slot = this.inventory[i];
      if (slot && slot.itemId === itemId && slot.count < def.maxStack) {
        const space = def.maxStack - slot.count;
        const add = Math.min(space, remaining);
        slot.count += add;
        remaining -= add;
        if (remaining <= 0) {
          this.savePlayerState();
          return true;
        }
      }
    }

    // Place in empty slots
    for (let i = 0; i < this.inventory.length; i++) {
      if (!this.inventory[i]) {
        const add = Math.min(def.maxStack, remaining);
        this.inventory[i] = { itemId, count: add };
        remaining -= add;
        if (remaining <= 0) {
          this.savePlayerState();
          return true;
        }
      }
    }

    this.savePlayerState();
    return remaining < count;
  }

  public getItemCount(itemId: string): number {
    let total = 0;
    for (const slot of this.inventory) {
      if (slot && slot.itemId === itemId) total += slot.count;
    }
    return total;
  }

  public removeItem(itemId: string, count = 1): boolean {
    if (this.getItemCount(itemId) < count) return false;
    let remaining = count;
    for (let i = 0; i < this.inventory.length; i++) {
      const slot = this.inventory[i];
      if (slot && slot.itemId === itemId) {
        const take = Math.min(slot.count, remaining);
        slot.count -= take;
        remaining -= take;
        if (slot.count <= 0) {
          this.inventory[i] = null;
        }
        if (remaining <= 0) break;
      }
    }
    this.savePlayerState();
    return true;
  }

  public canCraft(recipe: RecipeDef): boolean {
    for (const ing of recipe.ingredients) {
      if (this.getItemCount(ing.itemId) < ing.count) return false;
    }
    return true;
  }

  public craftRecipe(recipe: RecipeDef): boolean {
    if (!this.canCraft(recipe)) return false;
    for (const ing of recipe.ingredients) {
      this.removeItem(ing.itemId, ing.count);
    }
    const resultDef = ITEMS[recipe.resultItemId];
    if (resultDef && resultDef.category === 'armor') {
      if (this.equippedArmorId) {
        this.addItem(this.equippedArmorId, 1);
      }
      this.equippedArmorId = recipe.resultItemId;
      this.recalculateStats();
      this.hp = this.maxHp;
      this.mana = this.maxMana;
    } else if (resultDef && resultDef.category === 'trinket') {
      if (this.equippedTrinketId) {
        this.addItem(this.equippedTrinketId, 1);
      }
      this.equippedTrinketId = recipe.resultItemId;
      this.recalculateStats();
      this.hp = this.maxHp;
      this.mana = this.maxMana;
    } else if (resultDef && resultDef.category === 'mount') {
      if (this.equippedMountId) {
        this.addItem(this.equippedMountId, 1);
      }
      this.equippedMountId = recipe.resultItemId;
      this.unlockAchievement('sky_rider');
    } else {
      this.addItem(recipe.resultItemId, recipe.resultCount);
    }

    if (recipe.resultItemId === 'bronze_ingot') {
      this.unlockAchievement('bronze_smith');
    }

    if (recipe.tier > this.unlockedTier) {
      this.unlockedTier = recipe.tier;
    }
    this.gainXp(recipe.tier * 22);
    sound.playPickup();
    this.savePlayerState();
    return true;
  }

  public triggerSwing(): void {
    this.isSwinging = true;
    this.swingAnimProgress = 0;
  }

  public triggerDash(): boolean {
    if (this.dashCooldownTimer > 0) return false;
    this.dashCooldownTimer = this.getDashCooldownDuration();
    this.dashActiveTimer = 0.34;
    this.hurtInvulnTimer = Math.max(this.hurtInvulnTimer, 0.34);

    // Dash along WASD movement direction if held, otherwise forward along camera yaw
    const dashDir = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) dashDir.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) dashDir.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) dashDir.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dashDir.x += 1;

    if (dashDir.lengthSq() > 0) {
      dashDir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    } else {
      dashDir.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    }

    const dashPower = 28 + (this.skills.agility || 0) * 1.2;
    this.velocity.x = dashDir.x * dashPower;
    this.velocity.z = dashDir.z * dashPower;
    this.velocity.y = Math.max(this.velocity.y, 6.2);
    this.onGround = false;
    sound.playSwordSwing(true);
    sound.playMagicCast(1.35);
    return true;
  }

  public takeDamage(rawDamage: number): number {
    if (this.hurtInvulnTimer > 0) return 0;
    const reduction = Math.min(0.6, this.defense / 100);
    const finalDmg = Math.max(1, Math.round(rawDamage * (1 - reduction)));
    this.hp = Math.max(0, this.hp - finalDmg);
    this.hurtInvulnTimer = 0.42;
    sound.playPlayerHurt();

    if (this.hp <= 0) {
      // Respawn at Sanctuary with full HP
      this.hp = this.maxHp;
      this.mana = this.maxMana;
      const sy = this.world.getSurfaceHeight(6, 9) + 3;
      this.position.set(6.5, sy, 9.5);
      this.velocity.set(0, 0, 0);
    }
    return finalDmg;
  }

  public update(dt: number): void {
    this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - dt);
    this.abilityCooldownTimer = Math.max(0, this.abilityCooldownTimer - dt);
    this.potionCooldownTimer = Math.max(0, this.potionCooldownTimer - dt);
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    this.dashActiveTimer = Math.max(0, this.dashActiveTimer - dt);
    this.recallCooldownTimer = Math.max(0, this.recallCooldownTimer - dt);
    this.hurtInvulnTimer = Math.max(0, this.hurtInvulnTimer - dt);

    // Rapidly recharge Weapon Power Bar when not attacking
    const heldItem = this.getSelectedItemDef();
    const powerChargeRate = heldItem?.attackSpeed ? Math.max(1.25, heldItem.attackSpeed * 0.82) : 1.55;
    this.weaponPower = Math.min(1.0, this.weaponPower + powerChargeRate * dt);

    const armor = this.equippedArmorId ? ITEMS[this.equippedArmorId] : null;
    const trinket = this.equippedTrinketId ? ITEMS[this.equippedTrinketId] : null;

    // Balanced Passive HP & Mana Regeneration (boosted by Tier, Vitality/Arcane skills, and Trinkets)
    const tierBonus = this.unlockedTier * 0.25;
    const vitalityRegen = (this.skills.vitality || 0) * 0.7;
    const trinketRegen = trinket?.bonusRegen || 0;
    const arcaneMult = 1 + (this.skills.arcane || 0) * 0.18;

    this.hp = Math.min(this.maxHp, this.hp + (1.0 + tierBonus + vitalityRegen + trinketRegen) * dt);
    this.mana = Math.min(this.maxMana, this.mana + (8.5 + tierBonus * 2.2) * arcaneMult * dt);

    const armorSpeed = armor?.speedMultiplier || 1.0;
    const trinketSpeed = trinket?.speedMultiplier || 1.0;
    const agilitySpeed = 1 + (this.skills.agility || 0) * 0.04;
    const speedMult = armorSpeed * Math.max(1.0, trinketSpeed) * agilitySpeed;

    // Check water / magma at feet
    const footBlock = this.world.getBlock(this.position.x, this.position.y + 0.2, this.position.z);
    const underBlock = this.world.getBlock(this.position.x, this.position.y - 0.1, this.position.z);
    this.inWater = footBlock === BlockId.Water;

    if (underBlock === BlockId.MagmaBlock && (!armor || armor.tier < 4)) {
      this.takeDamage(10);
    }

    const mount = this.isMounted && this.equippedMountId ? ITEMS[this.equippedMountId] : null;
    if (this.isMounted && !mount) {
      this.isMounted = false;
    }

    // Horizontal Movement (Ground vs Tiered Flying Mount!)
    const moveDir = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveDir.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveDir.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveDir.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveDir.x += 1;

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    }

    if (mount) {
      // Terraria-style Tiered Flying Mount Physics!
      const mountSpeed = (mount.mountFlySpeed || 10) * (this.keys['ShiftLeft'] ? 1.2 : 1.0);
      const targetVx = moveDir.x * mountSpeed;
      const targetVz = moveDir.z * mountSpeed;
      const flyAccel = this.dashActiveTimer > 0 ? 2.5 : 10.5;
      this.velocity.x += (targetVx - this.velocity.x) * Math.min(1, flyAccel * dt);
      this.velocity.z += (targetVz - this.velocity.z) * Math.min(1, flyAccel * dt);

      const vertSpeed = mount.mountVerticalSpeed || 8.0;
      let targetVy = mount.mountHover ? 0 : -1.5; // Tier 1 Bee slowly glides down unless buzzing up; Tier 2-6 hover!
      if (this.keys['Space']) {
        targetVy = vertSpeed;
      } else if (this.keys['KeyC'] || this.keys['ControlLeft']) {
        targetVy = -vertSpeed;
      }
      this.velocity.y += (targetVy - this.velocity.y) * Math.min(1, 11 * dt);
    } else {
      const baseSpeed = (this.keys['ShiftLeft'] ? 7.4 : 5.5) * speedMult;
      const targetVx = moveDir.x * baseSpeed;
      const targetVz = moveDir.z * baseSpeed;

      // Preserve high dash momentum while dashActiveTimer > 0 so the dash launches you much further!
      const accel = this.dashActiveTimer > 0 ? 1.8 : this.onGround ? 18 : 8;
      this.velocity.x += (targetVx - this.velocity.x) * Math.min(1, accel * dt);
      this.velocity.z += (targetVz - this.velocity.z) * Math.min(1, accel * dt);

      // Gravity & Gliding
      if (this.inWater) {
        this.velocity.y -= 9.0 * dt;
        if (this.keys['Space']) {
          this.velocity.y = 5.5;
        }
      } else {
        let gravity = 24.0;
        if (armor?.allowGlide && this.keys['Space'] && this.velocity.y < -2.0) {
          gravity = 4.5;
          this.velocity.y = Math.max(this.velocity.y, -3.2);
        }
        this.velocity.y -= gravity * dt;
      }
    }

    // Apply swept AABB collision per axis
    this.moveWithCollision(dt);
    if (this.position.y > 62) {
      this.position.y = 62;
      this.velocity.y = Math.min(0, this.velocity.y);
    }

    if (this.onGround) {
      this.jumpsRemaining = armor?.allowDoubleJump ? (armor.tier >= 6 ? 3 : 2) : 1;
    }

    // Update 3D Flying Mount Visual Rig
    this.updateMountModel(dt, mount, moveDir.lengthSq() > 0);

    // Update Camera Transform (1st person vs 3rd person orbit)
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    if (this.isThirdPerson) {
      const lookBack = new THREE.Vector3(0, 0, 1).applyEuler(euler);
      const camDist = mount ? 5.2 : 4.2;
      const targetCamPos = new THREE.Vector3(
        this.position.x + lookBack.x * camDist,
        this.position.y + this.eyeHeight + 0.45 + lookBack.y * camDist * 0.6,
        this.position.z + lookBack.z * camDist
      );
      this.camera.position.copy(targetCamPos);
      this.updateThirdPersonHeroModel(moveDir.lengthSq() > 0 && !mount);
    } else {
      this.camera.position.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    }

    // Update Held Item 3D Model & Animation
    this.updateHeldItemModel(dt, moveDir.lengthSq() > 0 && !mount);
  }

  private updateMountModel(dt: number, mountDef: ItemDef | null, isMoving: boolean): void {
    if (!mountDef || !this.isMounted) {
      this.mountGroup.visible = false;
      return;
    }
    this.mountGroup.visible = true;

    if (this.lastBuiltMountId !== mountDef.id) {
      this.lastBuiltMountId = mountDef.id;
      this.rebuildMountMesh(mountDef);
    }

    const nowSec = performance.now() * 0.001;
    const hoverBob = Math.sin(nowSec * 4.5) * 0.07;
    this.mountGroup.position.set(this.position.x, this.position.y - 0.12 + hoverBob, this.position.z);
    this.mountGroup.rotation.y = this.yaw;
    this.mountGroup.rotation.x = isMoving ? -0.08 : 0;

    if (this.mountLeftWing && this.mountRightWing) {
      const flapFreq = mountDef.mountModelType === 'bee' ? 28 : 9.5;
      const flapAmp = mountDef.mountModelType === 'bee' ? 0.48 : 0.55;
      const flap = Math.sin(nowSec * flapFreq) * flapAmp;
      this.mountLeftWing.rotation.z = flap;
      this.mountRightWing.rotation.z = -flap;
    }
    if (this.mountSpinRing) {
      this.mountSpinRing.rotation.y += dt * 3.8;
    }
  }

  private rebuildMountMesh(def: ItemDef): void {
    while (this.mountGroup.children.length > 0) {
      this.mountGroup.remove(this.mountGroup.children[0]);
    }
    this.mountLeftWing = null;
    this.mountRightWing = null;
    this.mountSpinRing = null;

    const pMat = new THREE.MeshLambertMaterial({
      color: def.primaryColor,
      emissive: def.primaryColor,
      emissiveIntensity: 0.28,
    });
    const sMat = new THREE.MeshLambertMaterial({
      color: def.secondaryColor,
      emissive: def.secondaryColor,
      emissiveIntensity: 0.25,
    });
    const darkMat = new THREE.MeshLambertMaterial({ color: '#1e293b' });
    const glowMat = new THREE.MeshBasicMaterial({ color: def.secondaryColor });

    // Note: Player faces -Z when yaw = 0, so Mount front/head faces -Z!
    if (def.mountModelType === 'ufo') {
      // Tier 5: Aetherium Rift-Saucer UFO!
      const saucerHull = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.45, 0.28, 16), pMat);
      saucerHull.position.y = 0.22;
      const cockpitRim = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.08, 8, 18), glowMat);
      cockpitRim.rotation.x = Math.PI / 2;
      cockpitRim.position.y = 0.42;
      const tractorCore = new THREE.Mesh(
        new THREE.ConeGeometry(0.75, 0.55, 12),
        new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.45 })
      );
      tractorCore.position.y = -0.15;

      const spinRing = new THREE.Group();
      spinRing.position.y = 0.22;
      const outerTorus = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.09, 8, 24), glowMat);
      outerTorus.rotation.x = Math.PI / 2;
      spinRing.add(outerTorus);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glowMat);
        orb.position.set(Math.cos(a) * 1.52, 0, Math.sin(a) * 1.52);
        spinRing.add(orb);
      }
      this.mountSpinRing = spinRing;
      this.mountGroup.add(saucerHull, cockpitRim, tractorCore, spinRing);
      return;
    }

    if (def.mountModelType === 'bee') {
      // Tier 1: Giant Striped Bramble Honey-Hornet!
      const thorax = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.65, 1.45), pMat);
      thorax.position.set(0, 0.35, 0.15);
      const stripe1 = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.68, 0.26), sMat);
      stripe1.position.set(0, 0.35, 0.05);
      const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.68, 0.26), sMat);
      stripe2.position.set(0, 0.35, 0.52);
      const stinger = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.48, 4), darkMat);
      stinger.rotation.x = Math.PI / 2;
      stinger.position.set(0, 0.32, 1.08);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.48, 0.48), sMat);
      head.position.set(0, 0.42, -0.75);
      this.mountGroup.add(thorax, stripe1, stripe2, stinger, head);

      const wingMat = new THREE.MeshBasicMaterial({
        color: '#e0f2fe',
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
      });
      const lWing = new THREE.Group();
      lWing.position.set(-0.42, 0.68, 0.0);
      const lwMesh = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.04, 0.52), wingMat);
      lwMesh.position.x = -0.55;
      lWing.add(lwMesh);

      const rWing = new THREE.Group();
      rWing.position.set(0.42, 0.68, 0.0);
      const rwMesh = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.04, 0.52), wingMat);
      rwMesh.position.x = 0.55;
      rWing.add(rwMesh);

      this.mountLeftWing = lWing;
      this.mountRightWing = rWing;
      this.mountGroup.add(lWing, rWing);
      return;
    }

    // Winged Beasts & Dragons: Owl (T2), Frost Sky-Drake (T3), Solar Phoenix (T4), Starsteel Leviathan (T6)
    const isDragon = def.mountModelType === 'wyvern' || def.mountModelType === 'star_drake';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.62, 1.85), pMat);
    body.position.set(0, 0.34, 0.1);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.16, 0.68), darkMat);
    saddle.position.set(0, 0.68, 0.05);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.58, 0.52), pMat);
    neck.position.set(0, 0.68, -0.95);
    neck.rotation.x = 0.35;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.44, 0.68), pMat);
    head.position.set(0, 0.96, -1.35);
    const beakOrHorns = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.52, 4), glowMat);
    beakOrHorns.rotation.x = -Math.PI / 2;
    beakOrHorns.position.set(0, 0.92, -1.82);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.35, 4), sMat);
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 0.36, 1.55);
    this.mountGroup.add(body, saddle, neck, head, beakOrHorns, tail);

    const wingSpan = def.mountModelType === 'star_drake' ? 2.15 : isDragon ? 1.85 : 1.55;
    const lWing = new THREE.Group();
    lWing.position.set(-0.45, 0.56, -0.05);
    const lwMain = new THREE.Mesh(new THREE.BoxGeometry(wingSpan, 0.07, 0.82), pMat);
    lwMain.position.x = -wingSpan * 0.5;
    const lwTrim = new THREE.Mesh(new THREE.BoxGeometry(wingSpan * 0.85, 0.09, 0.22), glowMat);
    lwTrim.position.set(-wingSpan * 0.45, 0.02, -0.35);
    lWing.add(lwMain, lwTrim);

    const rWing = new THREE.Group();
    rWing.position.set(0.45, 0.56, -0.05);
    const rwMain = new THREE.Mesh(new THREE.BoxGeometry(wingSpan, 0.07, 0.82), pMat);
    rwMain.position.x = wingSpan * 0.5;
    const rwTrim = new THREE.Mesh(new THREE.BoxGeometry(wingSpan * 0.85, 0.09, 0.22), glowMat);
    rwTrim.position.set(wingSpan * 0.45, 0.02, -0.35);
    rWing.add(rwMain, rwTrim);

    if (def.mountModelType === 'star_drake') {
      // Secondary Starlight Wing Pair + Spinning Celestial Engine Halo!
      const subL = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.06, 0.42), glowMat);
      subL.position.set(-0.75, -0.18, 0.45);
      subL.rotation.z = -0.22;
      lWing.add(subL);
      const subR = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.06, 0.42), glowMat);
      subR.position.set(0.75, -0.18, 0.45);
      subR.rotation.z = 0.22;
      rWing.add(subR);

      const engineHalo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 6, 20), glowMat);
      engineHalo.position.set(0, 0.45, 0.95);
      this.mountSpinRing = engineHalo;
      this.mountGroup.add(engineHalo);
    }

    this.mountLeftWing = lWing;
    this.mountRightWing = rWing;
    this.mountGroup.add(lWing, rWing);
  }

  private updateThirdPersonHeroModel(isMoving: boolean): void {
    this.heroGroup.position.copy(this.position);
    this.heroGroup.rotation.y = this.yaw;

    if (this.equippedArmorId !== this.lastHeroArmorId) {
      this.lastHeroArmorId = this.equippedArmorId;
      const armor = this.equippedArmorId ? ITEMS[this.equippedArmorId] : null;
      this.heroTorsoMat.color.set(armor ? armor.primaryColor : '#64748b');
      this.heroAccentMat.color.set(armor ? armor.secondaryColor : '#38bdf8');
      this.heroAccentMat.emissive.set(armor ? armor.secondaryColor : '#38bdf8');
    }

    const t = performance.now() * 0.01;
    const walkSwing = isMoving ? Math.sin(t) * 0.65 : 0;
    this.heroLeftLeg.rotation.x = walkSwing;
    this.heroRightLeg.rotation.x = -walkSwing;
    this.heroLeftArm.rotation.x = -walkSwing * 0.8;

    if (this.isSwinging) {
      const s = Math.sin(this.swingAnimProgress * Math.PI);
      this.heroRightArm.rotation.x = -s * 1.6;
    } else {
      this.heroRightArm.rotation.x = walkSwing * 0.8;
    }
  }

  public handleJumpKeyPress(): void {
    if (this.isMounted) return; // Space smoothly ascends while riding a Flying Mount!
    if (this.inWater) {
      this.velocity.y = 6.2;
      return;
    }
    const armor = this.equippedArmorId ? ITEMS[this.equippedArmorId] : null;
    const jumpMult = armor?.jumpBoost || 1.0;

    if (this.onGround || this.jumpsRemaining > 0) {
      this.velocity.y = 8.6 * jumpMult;
      this.onGround = false;
      this.jumpsRemaining--;
      sound.playBlockPlace();
    }
  }

  private moveWithCollision(dt: number): void {
    // X axis (no auto-step: player must jump to get over blocks!)
    this.position.x += this.velocity.x * dt;
    if (this.checkCollision(this.position.x, this.position.y, this.position.z)) {
      this.position.x -= this.velocity.x * dt;
      this.velocity.x = 0;
    }

    // Z axis (no auto-step: player must jump to get over blocks!)
    this.position.z += this.velocity.z * dt;
    if (this.checkCollision(this.position.x, this.position.y, this.position.z)) {
      this.position.z -= this.velocity.z * dt;
      this.velocity.z = 0;
    }

    // Y axis
    this.onGround = false;
    this.position.y += this.velocity.y * dt;
    if (this.checkCollision(this.position.x, this.position.y, this.position.z)) {
      if (this.velocity.y < 0) {
        this.onGround = true;
        this.position.y = Math.floor(this.position.y) + 1.0001;
      } else {
        this.position.y -= this.velocity.y * dt;
      }
      this.velocity.y = 0;
    }

    if (this.position.y < 2) {
      this.position.y = 30;
      this.velocity.y = 0;
    }
  }

  public checkCollision(px: number, py: number, pz: number): boolean {
    const hw = this.width * 0.5;
    const minX = Math.floor(px - hw);
    const maxX = Math.floor(px + hw);
    const minY = Math.floor(py + 0.001);
    const maxY = Math.floor(py + this.height - 0.001);
    const minZ = Math.floor(pz - hw);
    const maxZ = Math.floor(pz + hw);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const b = this.world.getBlock(x, y, z);
          if (BLOCKS[b] && BLOCKS[b].solid) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private updateHeldItemModel(dt: number, isMoving: boolean): void {
    const selected = this.getSelectedItemDef();
    const curId = selected ? selected.id : null;

    if (curId !== this.lastHeldItemId) {
      this.lastHeldItemId = curId;
      while (this.heldMeshGroup.children.length > 0) {
        this.heldMeshGroup.remove(this.heldMeshGroup.children[0]);
      }
      if (selected) {
        this.buildHeldMeshFor(selected);
      }
    }

    // Swing animation + walk bobbing
    const time = performance.now() * 0.006;
    const bobX = isMoving ? Math.cos(time) * 0.022 : 0;
    const bobY = isMoving ? Math.abs(Math.sin(time * 2)) * 0.028 : Math.sin(time * 0.4) * 0.008;

    let swingRotX = 0;
    let swingRotY = 0;
    let swingRotZ = 0;
    let swingPushZ = 0;
    let swingDropY = 0;

    if (this.isSwinging) {
      this.swingAnimProgress += dt * 5.8;
      if (this.swingAnimProgress >= 1) {
        this.swingAnimProgress = 0;
        this.isSwinging = false;
      } else {
        const s = Math.sin(this.swingAnimProgress * Math.PI);
        // Clean forward-and-downward chop toward the crosshair
        swingRotX = -s * 1.18;
        swingRotY = s * 0.22;
        swingRotZ = s * 0.15;
        swingPushZ = -s * 0.14;
        swingDropY = -s * 0.08;
      }
    }

    this.handGroup.position.set(0.38 + bobX, -0.34 + bobY + swingDropY, -0.55 + swingPushZ);
    this.handGroup.rotation.set(-0.22 + swingRotX, 0.1 + swingRotY, 0.06 + swingRotZ);
  }

  private buildHeldMeshFor(item: ItemDef): void {
    const primaryMat = new THREE.MeshLambertMaterial({
      color: item.primaryColor,
      emissive: item.tier >= 2 ? item.primaryColor : '#000000',
      emissiveIntensity: item.tier >= 3 ? 0.32 : item.tier === 2 ? 0.12 : 0,
    });
    const secondaryMat = new THREE.MeshLambertMaterial({
      color: item.secondaryColor,
      emissive: item.tier >= 4 ? item.secondaryColor : '#000000',
      emissiveIntensity: item.tier >= 4 ? 0.25 : 0,
    });
    const handleMat = new THREE.MeshLambertMaterial({ color: '#5c3a21' });
    const gripBandMat = new THREE.MeshLambertMaterial({ color: '#292524' });
    const glowMat = new THREE.MeshBasicMaterial({ color: item.secondaryColor });

    if (item.category === 'block') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), primaryMat);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.06, 0.29), secondaryMat);
      trim.position.y = 0.11;
      this.heldMeshGroup.add(box, trim);
      return;
    }

    if (item.category === 'melee') {
      // Pommel + Wrapped Grip
      const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), secondaryMat);
      pommel.position.set(0, -0.22, 0);
      const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.22, 0.048), handleMat);
      hilt.position.set(0, -0.1, 0);
      const band1 = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.03, 0.054), gripBandMat);
      band1.position.set(0, -0.14, 0);
      const band2 = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.03, 0.054), gripBandMat);
      band2.position.set(0, -0.06, 0);
      this.heldMeshGroup.add(pommel, hilt, band1, band2);

      // Note: -Z is forward (direction of swing/strike), X is thin side-to-side
      if (item.id === 'leviathan_trident') {
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.72, 0.046), secondaryMat);
        shaft.position.set(0, 0.22, 0);
        const crossGuard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.28), secondaryMat);
        crossGuard.position.set(0, 0.54, 0);
        const seaGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), glowMat);
        seaGem.position.set(0, 0.54, 0);
        for (const zOff of [-0.11, 0, 0.11]) {
          const prong = new THREE.Mesh(
            new THREE.ConeGeometry(0.032, zOff === 0 ? 0.32 : 0.25, 4),
            primaryMat
          );
          prong.position.set(0, zOff === 0 ? 0.72 : 0.68, zOff);
          this.heldMeshGroup.add(prong);
        }
        this.heldMeshGroup.add(shaft, crossGuard, seaGem);
        return;
      }

      if (item.iconShape === 'scythe') {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.68, 0.048), handleMat);
        pole.position.set(0, 0.2, 0);
        const socket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), secondaryMat);
        socket.position.set(0, 0.52, 0);
        // Reaper blade extends forward (-Z)
        const bladeBase = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.28), primaryMat);
        bladeBase.position.set(0, 0.54, -0.14);
        bladeBase.rotation.x = -0.22;
        const bladeTip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.24), glowMat);
        bladeTip.position.set(0, 0.45, -0.32);
        bladeTip.rotation.x = -0.65;
        this.heldMeshGroup.add(pole, socket, bladeBase, bladeTip);
        return;
      }

      if (item.iconShape === 'hammer') {
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.56, 0.055), handleMat);
        shaft.position.set(0, 0.16, 0);
        // Warhammer striking faces aligned along Z (-Z front strike face, +Z back face)
        const headCore = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.36), primaryMat);
        headCore.position.set(0, 0.44, 0);
        const faceFront = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.05), secondaryMat);
        faceFront.position.set(0, 0.44, -0.19);
        const faceBack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.05), secondaryMat);
        faceBack.position.set(0, 0.44, 0.19);
        const topSpike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), glowMat);
        topSpike.position.set(0, 0.59, 0);
        this.heldMeshGroup.add(shaft, headCore, faceFront, faceBack, topSpike);
        return;
      }

      // Detailed Crossguard & Blade oriented along Z (-Z is forward cutting edge!)
      const isGreat = item.iconShape === 'greatsword';
      const isKatana = item.iconShape === 'katana';
      const guardSpan = isKatana ? 0.14 : isGreat ? 0.32 : 0.24;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, guardSpan), secondaryMat);
      guard.position.set(0, 0.02, 0);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), glowMat);
      gem.position.set(-0.04, 0.02, 0);
      this.heldMeshGroup.add(guard, gem);

      if (!isKatana) {
        const wingFront = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.06), primaryMat);
        wingFront.position.set(0, 0.04, -guardSpan * 0.5);
        wingFront.rotation.x = -0.35;
        const wingBack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.06), primaryMat);
        wingBack.position.set(0, 0.04, guardSpan * 0.5);
        wingBack.rotation.x = 0.35;
        this.heldMeshGroup.add(wingFront, wingBack);
      }

      // Multi-part Tapered Blade + Glowing Fuller Core + Tip (edge faces -Z forward)
      const bladeLen = isGreat ? 0.64 : isKatana ? 0.6 : 0.5;
      const bladeDepth = isGreat ? 0.12 : isKatana ? 0.055 : 0.085;
      const bladeBody = new THREE.Mesh(new THREE.BoxGeometry(0.028, bladeLen, bladeDepth), primaryMat);
      bladeBody.position.set(0, 0.04 + bladeLen * 0.5, 0);

      const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.034, bladeLen * 0.82, bladeDepth * 0.45), secondaryMat);
      fuller.position.set(0, 0.04 + bladeLen * 0.46, 0);

      const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(bladeDepth * 0.65, 0.14, 4), primaryMat);
      bladeTip.rotation.y = Math.PI / 4;
      bladeTip.scale.set(0.35, 1, 1);
      bladeTip.position.set(0, 0.04 + bladeLen + 0.06, 0);

      this.heldMeshGroup.add(bladeBody, fuller, bladeTip);
      return;
    }

    if (item.category === 'tool') {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.52, 0.048), handleMat);
      handle.position.set(0, 0.12, 0);
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.075), secondaryMat);
      collar.position.set(0, 0.34, 0);
      this.heldMeshGroup.add(handle, collar);

      if (item.toolType === 'pickaxe') {
        // Pickaxe prongs extend forward (-Z) and backward (+Z)
        const centerHead = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.075, 0.22), primaryMat);
        centerHead.position.set(0, 0.35, 0);
        const prongFront = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.14), primaryMat);
        prongFront.position.set(0, 0.32, -0.15);
        prongFront.rotation.x = -0.38;
        const prongBack = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.14), primaryMat);
        prongBack.position.set(0, 0.32, 0.15);
        prongBack.rotation.x = 0.38;
        const tipFront = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.06), glowMat);
        tipFront.position.set(0, 0.29, -0.22);
        const tipBack = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.06), glowMat);
        tipBack.position.set(0, 0.29, 0.22);
        this.heldMeshGroup.add(centerHead, prongFront, prongBack, tipFront, tipBack);
      } else {
        // Bearded Hatchet / Axe facing forward (-Z)
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.18), primaryMat);
        cheek.position.set(0, 0.33, -0.1);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.04), glowMat);
        edge.position.set(0, 0.32, -0.19);
        const poll = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.08), secondaryMat);
        poll.position.set(0, 0.34, 0.06);
        this.heldMeshGroup.add(cheek, edge, poll);
      }
      return;
    }

    if (item.category === 'ranged') {
      if (item.iconShape === 'bow') {
        const riser = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.05), handleMat);
        const upperLimb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.04), primaryMat);
        upperLimb.position.set(0, 0.18, 0.05);
        upperLimb.rotation.x = -0.35;
        const lowerLimb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.04), primaryMat);
        lowerLimb.position.set(0, -0.18, 0.05);
        lowerLimb.rotation.x = 0.35;
        const bowString = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.56, 0.01), glowMat);
        bowString.position.set(0, 0, 0.12);
        const arrowShaft = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.45), secondaryMat);
        arrowShaft.position.set(0, 0, -0.05);
        this.heldMeshGroup.add(riser, upperLimb, lowerLimb, bowString, arrowShaft);
        return;
      }

      if (item.iconShape === 'staff') {
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.62, 0.045), handleMat);
        shaft.position.set(0, 0.15, 0);
        const prong1 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.035), secondaryMat);
        prong1.position.set(-0.07, 0.48, 0);
        prong1.rotation.z = 0.3;
        const prong2 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.035), secondaryMat);
        prong2.position.set(0.07, 0.48, 0);
        prong2.rotation.z = -0.3;
        const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 0), glowMat);
        orb.position.set(0, 0.54, 0);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 6, 16), primaryMat);
        halo.position.set(0, 0.54, 0);
        this.heldMeshGroup.add(shaft, prong1, prong2, orb, halo);
        return;
      }

      // Repeater / Cannon / Railgun
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.26), handleMat);
      stock.position.set(0, 0.02, 0.06);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.46), primaryMat);
      barrel.position.set(0, 0.08, -0.16);
      const railTop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.42), secondaryMat);
      railTop.position.set(0, 0.15, -0.16);
      const muzzle = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), glowMat);
      muzzle.position.set(0, 0.08, -0.4);
      this.heldMeshGroup.add(stock, barrel, railTop, muzzle);

      if (item.iconShape === 'repeater') {
        const prod = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.06), secondaryMat);
        prod.position.set(0, 0.08, -0.32);
        this.heldMeshGroup.add(prod);
      }
      return;
    }

    // Royal Crowns: Astral Zenith Crown (Final Boss Relic) & Crown of Aethelgard (Secret Boss Trophy)
    if (item.id === 'totem_aethelgard' || item.id === 'sovereign_crown_shard') {
      const isSovereign = item.id === 'sovereign_crown_shard';
      const goldMat = new THREE.MeshLambertMaterial({
        color: '#facc15',
        emissive: '#ca8a04',
        emissiveIntensity: 0.35,
      });
      const jewelMat = new THREE.MeshBasicMaterial({ color: isSovereign ? '#2dd4bf' : '#38bdf8' });
      const velvetMat = new THREE.MeshLambertMaterial({ color: isSovereign ? '#7e22ce' : '#1e3a8a' });

      const crownGroup = new THREE.Group();
      crownGroup.position.set(0, 0.14, 0);
      crownGroup.rotation.x = 0.22;

      // Circular Golden Royal Circlet Rim
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.165, 0.075, 12, 1, true), goldMat);
      band.material.side = THREE.DoubleSide;
      const lowerTrim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 6, 16), goldMat);
      lowerTrim.rotation.x = Math.PI / 2;
      lowerTrim.position.y = -0.035;
      crownGroup.add(band, lowerTrim);

      if (isSovereign) {
        const velvetCap = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), velvetMat);
        velvetCap.position.y = -0.01;
        crownGroup.add(velvetCap);
      }

      // 6 Pointed Golden Crown Spires + Spire-Tip Star Pearls around the rim
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spireH = i % 2 === 0 ? 0.15 : 0.11;
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.042, spireH, 4), goldMat);
        spire.position.set(Math.cos(a) * 0.172, 0.035 + spireH * 0.5, Math.sin(a) * 0.172);
        const pearl = new THREE.Mesh(new THREE.OctahedronGeometry(0.025, 0), jewelMat);
        pearl.position.set(Math.cos(a) * 0.172, 0.04 + spireH, Math.sin(a) * 0.172);
        crownGroup.add(spire, pearl);
      }

      // Floating Celestial Star / Halo above the Crown
      const centerStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), jewelMat);
      centerStar.position.set(0, 0.22, 0);
      const upperHalo = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 16), jewelMat);
      upperHalo.rotation.x = Math.PI / 2;
      upperHalo.position.set(0, 0.25, 0);
      crownGroup.add(centerStar, upperHalo);

      this.heldMeshGroup.add(crownGroup);
      return;
    }

    if (item.iconShape === 'totem') {
      if (item.id === 'tempest_totem') {
        // 1. TEMPEST TOTEM: Carved Storm-Thunderbird Totem Pole + Storm Clouds + Lightning!
        const slateMat = new THREE.MeshLambertMaterial({ color: '#475569' });
        const stormCloudMat = new THREE.MeshLambertMaterial({ color: '#1e293b' });
        const boltMat = new THREE.MeshBasicMaterial({ color: '#fde047' });
        const cyanEyeMat = new THREE.MeshBasicMaterial({ color: '#7dd3fc' });

        const basePedestal = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.16), stormCloudMat);
        basePedestal.position.set(0, -0.02, 0);
        const totemTrunk = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.36, 0.12), slateMat);
        totemTrunk.position.set(0, 0.18, 0);

        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.14), stormCloudMat);
        brow.position.set(0, 0.27, 0);
        const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.135), cyanEyeMat);
        eyeL.position.set(-0.036, 0.235, 0);
        const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.135), cyanEyeMat);
        eyeR.position.set(0.036, 0.235, 0);
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 4), boltMat);
        beak.rotation.x = -Math.PI / 2;
        beak.position.set(0, 0.19, -0.09);

        const upperWings = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.065, 0.04), primaryMat);
        upperWings.position.set(0, 0.24, 0.02);
        const lowerWings = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.04), secondaryMat);
        lowerWings.position.set(0, 0.17, 0.02);

        const cloudCenter = new THREE.Mesh(new THREE.DodecahedronGeometry(0.085, 0), stormCloudMat);
        cloudCenter.position.set(0, 0.4, 0);
        const cloudLeft = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06, 0), stormCloudMat);
        cloudLeft.position.set(-0.07, 0.39, 0);
        const cloudRight = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06, 0), stormCloudMat);
        cloudRight.position.set(0.07, 0.39, 0);
        const lightningTop = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.15, 4), boltMat);
        lightningTop.position.set(0, 0.5, 0);
        lightningTop.rotation.z = -0.28;

        this.heldMeshGroup.add(
          basePedestal,
          totemTrunk,
          brow,
          eyeL,
          eyeR,
          beak,
          upperWings,
          lowerWings,
          cloudCenter,
          cloudLeft,
          cloudRight,
          lightningTop
        );
        return;
      }

      if (item.id === 'sundial_totem') {
        // 2. SUNDIAL TOTEM: Split Day/Night Chronos Totem + Radiant Golden Sundial Ring!
        const sunMat = new THREE.MeshBasicMaterial({ color: '#fde047' });
        const nightMat = new THREE.MeshLambertMaterial({ color: '#1e3a8a' });
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.15), handleMat);
        base.position.set(0, -0.02, 0);
        const leftHalf = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.32, 0.12), handleMat);
        leftHalf.position.set(-0.034, 0.16, 0);
        const rightHalf = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.32, 0.12), nightMat);
        rightHalf.position.set(0.034, 0.16, 0);
        const wingSun = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.065, 0.04), sunMat);
        wingSun.position.set(-0.12, 0.22, 0);
        const wingMoon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.065, 0.04), secondaryMat);
        wingMoon.position.set(0.12, 0.22, 0);
        const dialRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 6, 18), sunMat);
        dialRing.position.set(0, 0.43, 0);
        const sunOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), secondaryMat);
        sunOrb.position.set(0, 0.43, 0);
        this.heldMeshGroup.add(base, leftHalf, rightHalf, wingSun, wingMoon, dialRing, sunOrb);
        return;
      }

      if (item.id === 'totem_sylvan_behemoth') {
        // 3. VERDANT EFFIGY (Boss I): Living Gnarled Treant Effigy with Roots & Leafy Canopy!
        const barkMat = new THREE.MeshLambertMaterial({ color: '#5c3a21' });
        const leafMat = new THREE.MeshLambertMaterial({ color: '#16a34a', emissive: '#15803d', emissiveIntensity: 0.25 });
        const rootL = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), barkMat);
        rootL.position.set(-0.08, 0.0, 0);
        rootL.rotation.z = 0.65;
        const rootR = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), barkMat);
        rootR.position.set(0.08, 0.0, 0);
        rootR.rotation.z = -0.65;
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.13), barkMat);
        trunk.position.set(0, 0.16, 0);
        const heartSeed = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), primaryMat);
        heartSeed.position.set(0, 0.15, -0.07);
        const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.14), glowMat);
        eyes.position.set(0, 0.25, 0);
        const canopyTop = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), leafMat);
        canopyTop.position.set(0, 0.4, 0);
        const canopyL = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), leafMat);
        canopyL.position.set(-0.1, 0.36, 0);
        const canopyR = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), leafMat);
        canopyR.position.set(0.1, 0.36, 0);
        this.heldMeshGroup.add(rootL, rootR, trunk, heartSeed, eyes, canopyTop, canopyL, canopyR);
        return;
      }

      if (item.id === 'totem_cryonax') {
        // 4. PERMAFROST IDOL (Boss II): Sculpted Glacial Dragon-Skull & Crystal Wings!
        const skull = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.24), primaryMat);
        skull.position.set(0, 0.2, -0.03);
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.18, 6), secondaryMat);
        pedestal.position.set(0, 0.05, 0);
        for (const side of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 4), glowMat);
          horn.position.set(side * 0.08, 0.34, 0.04);
          horn.rotation.x = -0.55;
          horn.rotation.z = -side * 0.35;
          const wing = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 4), primaryMat);
          wing.position.set(side * 0.18, 0.22, 0.02);
          wing.rotation.z = -side * 1.1;
          this.heldMeshGroup.add(horn, wing);
        }
        const frostPrism = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), glowMat);
        frostPrism.position.set(0, 0.44, 0);
        this.heldMeshGroup.add(pedestal, skull, frostPrism);
        return;
      }

      if (item.id === 'totem_ignis_rex') {
        // 5. CINDER SIGIL (Boss III): Volcanic Obsidian Centipede Medallion + Molten Mandibles!
        const obsMat = new THREE.MeshLambertMaterial({ color: '#290f02' });
        const tablet = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 8), obsMat);
        tablet.rotation.x = Math.PI / 2;
        tablet.position.set(0, 0.2, 0);
        const magmaCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), glowMat);
        magmaCore.position.set(0, 0.2, 0);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 6, 8), primaryMat);
        rim.position.set(0, 0.2, 0);
        for (const side of [-1, 1]) {
          const pincer = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.18, 4), primaryMat);
          pincer.position.set(side * 0.09, 0.42, 0);
          pincer.rotation.z = side * 0.45;
          this.heldMeshGroup.add(pincer);
        }
        this.heldMeshGroup.add(tablet, magmaCore, rim);
        return;
      }

      if (item.id === 'totem_malakor') {
        // 6. VOID RESONATOR (Boss IV): Abyssal Tuning-Fork Prongs + Levitating Singularity Eye!
        const voidDark = new THREE.MeshLambertMaterial({ color: '#1e1b4b' });
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.18, 6), voidDark);
        grip.position.set(0, 0.04, 0);
        const crossBase = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.06), primaryMat);
        crossBase.position.set(0, 0.14, 0);
        const prongL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.05), primaryMat);
        prongL.position.set(-0.11, 0.3, 0);
        prongL.rotation.z = -0.08;
        const prongR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.05), primaryMat);
        prongR.position.set(0.11, 0.3, 0);
        prongR.rotation.z = 0.08;
        const singularity = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), glowMat);
        singularity.position.set(0, 0.31, 0);
        const riftRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 6, 18), secondaryMat);
        riftRing.position.set(0, 0.31, 0);
        riftRing.rotation.x = 0.65;
        this.heldMeshGroup.add(grip, crossBase, prongL, prongR, singularity, riftRing);
        return;
      }
    }

    // Default crystal/relic/potion held model
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), primaryMat);
    orb.position.set(0, 0.1, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 6, 16), secondaryMat);
    ring.position.set(0, 0.1, 0);
    this.heldMeshGroup.add(orb, ring);
  }

  public grantTierSandboxKit(tier: ProgressionTier): boolean {
    if (!this.cheatsEnabled) return false;
    this.unlockedTier = Math.max(this.unlockedTier, tier) as ProgressionTier;
    const tierRecipes = RECIPES.filter((r) => r.tier === tier);
    for (const r of tierRecipes) {
      const def = ITEMS[r.resultItemId];
      if (!def) continue;
      if (def.category === 'armor') {
        this.equippedArmorId = def.id;
      } else if (def.category === 'trinket') {
        this.equippedTrinketId = def.id;
      } else if (def.category === 'mount') {
        this.equippedMountId = def.id;
      } else if (def.category === 'boss_relic') {
        this.addItem(def.id, 2);
      } else if (def.category === 'melee' || def.category === 'ranged' || def.category === 'tool') {
        this.addItem(def.id, 1);
      }
    }
    this.recalculateStats();
    this.hp = this.maxHp;
    this.mana = this.maxMana;
    sound.playFanfare();
    this.savePlayerState();
    return true;
  }

  public grantCheatItem(itemId: string, count = 1): boolean {
    if (!this.cheatsEnabled) return false;
    const ok = this.addItem(itemId, count);
    if (ok) {
      sound.playPickup();
      this.savePlayerState();
    }
    return ok;
  }

  public createNewWorld(worldName: string, seed: number, cheatsEnabled: boolean): void {
    this.worldName = worldName.trim() || 'funnyblockgame World';
    this.cheatsEnabled = cheatsEnabled;
    this.unlockedTier = 1;
    this.defeatedBosses.clear();
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 100;
    this.skillPoints = 1;
    this.skills = { vitality: 0, arcane: 0, might: 0, prospector: 0, agility: 0 };
    this.unlockedAchievements.clear();
    this.blocksMinedCount = 0;
    this.monstersSlainCount = 0;
    this.itemsDisposedCount = 0;
    this.initStarterInventory();
    this.recalculateStats();
    this.hp = this.maxHp;
    this.mana = this.maxMana;

    this.world.resetWorldMods(seed);
    const spawnY = this.world.getSurfaceHeight(6, 9) + 2.8;
    this.position.set(6.5, spawnY, 9.5);
    this.velocity.set(0, 0, 0);
    this.hasSavedWorld = true;
    this.savePlayerState();
  }

  public savePlayerState(): void {
    try {
      const state = {
        worldName: this.worldName,
        seed: this.world.seed,
        cheatsEnabled: this.cheatsEnabled,
        inventory: this.inventory,
        equippedArmorId: this.equippedArmorId,
        equippedTrinketId: this.equippedTrinketId,
        equippedMountId: this.equippedMountId,
        unlockedTier: this.unlockedTier,
        defeatedBosses: Array.from(this.defeatedBosses),
        level: this.level,
        xp: this.xp,
        xpToNext: this.xpToNext,
        skillPoints: this.skillPoints,
        skills: this.skills,
        unlockedAchievements: Array.from(this.unlockedAchievements),
        blocksMinedCount: this.blocksMinedCount,
        monstersSlainCount: this.monstersSlainCount,
        itemsDisposedCount: this.itemsDisposedCount,
      };
      localStorage.setItem('aethelgard_player_state', JSON.stringify(state));
      this.hasSavedWorld = true;
    } catch {
      // ignore storage errors
    }
  }

  public loadPlayerState(): void {
    try {
      const raw = localStorage.getItem('aethelgard_player_state');
      if (!raw) {
        this.hasSavedWorld = false;
        return;
      }
      const state = JSON.parse(raw);
      this.hasSavedWorld = true;
      if (typeof state.worldName === 'string') {
        this.worldName = state.worldName;
      }
      if (typeof state.cheatsEnabled === 'boolean') {
        this.cheatsEnabled = state.cheatsEnabled;
      }
      if (typeof state.seed === 'number') {
        this.world.seed = state.seed;
      }
      if (Array.isArray(state.inventory) && state.inventory.length === 36) {
        this.inventory = state.inventory;
      }
      if (state.equippedArmorId) {
        this.equippedArmorId = state.equippedArmorId;
      }
      if (state.equippedTrinketId) {
        this.equippedTrinketId = state.equippedTrinketId;
      }
      if (state.equippedMountId) {
        this.equippedMountId = state.equippedMountId;
      }
      if (state.unlockedTier) {
        this.unlockedTier = state.unlockedTier;
      }
      if (Array.isArray(state.defeatedBosses)) {
        this.defeatedBosses = new Set(state.defeatedBosses);
      }
      if (typeof state.level === 'number') this.level = state.level;
      if (typeof state.xp === 'number') this.xp = state.xp;
      if (typeof state.xpToNext === 'number') this.xpToNext = state.xpToNext;
      if (typeof state.skillPoints === 'number') this.skillPoints = state.skillPoints;
      if (state.skills && typeof state.skills === 'object') {
        this.skills = { ...this.skills, ...state.skills };
      }
      if (Array.isArray(state.unlockedAchievements)) {
        this.unlockedAchievements = new Set(state.unlockedAchievements);
      }
      if (typeof state.blocksMinedCount === 'number') this.blocksMinedCount = state.blocksMinedCount;
      if (typeof state.monstersSlainCount === 'number') this.monstersSlainCount = state.monstersSlainCount;
      if (typeof state.itemsDisposedCount === 'number') this.itemsDisposedCount = state.itemsDisposedCount;
    } catch {
      // ignore corrupt storage
    }
  }
}
