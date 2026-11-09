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

  // Cooldowns & animations
  public attackCooldownTimer = 0;
  public abilityCooldownTimer = 0;
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
    this.equippedArmorId = 'bramble_armor';
    this.equippedTrinketId = null;
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
    this.defense = Math.min(82, def);
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    if (this.mana > this.maxMana) this.mana = this.maxMana;
  }

  public getDamageMultiplier(): number {
    const skillMult = (this.skills.might || 0) * 0.08;
    const trinketMult =
      this.equippedTrinketId && ITEMS[this.equippedTrinketId]
        ? ITEMS[this.equippedTrinketId].bonusDamageMult || 0
        : 0;
    const levelMult = (this.level - 1) * 0.03;
    return 1 + skillMult + trinketMult + levelMult;
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
    const reduction = Math.min(0.82, this.defense / 100);
    const finalDmg = Math.max(1, Math.round(rawDamage * (1 - reduction)));
    this.hp = Math.max(0, this.hp - finalDmg);
    this.hurtInvulnTimer = 0.45;
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
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    this.dashActiveTimer = Math.max(0, this.dashActiveTimer - dt);
    this.recallCooldownTimer = Math.max(0, this.recallCooldownTimer - dt);
    this.hurtInvulnTimer = Math.max(0, this.hurtInvulnTimer - dt);

    const armor = this.equippedArmorId ? ITEMS[this.equippedArmorId] : null;
    const trinket = this.equippedTrinketId ? ITEMS[this.equippedTrinketId] : null;

    // Passive HP & Mana Regeneration (boosted by Tier, Vitality/Arcane skills, and Trinkets)
    const tierBonus = this.unlockedTier * 0.4;
    const vitalityRegen = (this.skills.vitality || 0) * 1.2;
    const trinketRegen = trinket?.bonusRegen || 0;
    const arcaneMult = 1 + (this.skills.arcane || 0) * 0.2;

    this.hp = Math.min(this.maxHp, this.hp + (1.8 + tierBonus + vitalityRegen + trinketRegen) * dt);
    this.mana = Math.min(this.maxMana, this.mana + (9.5 + tierBonus * 2.5) * arcaneMult * dt);

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

    // Horizontal Movement
    const moveDir = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveDir.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveDir.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveDir.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveDir.x += 1;

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    }

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

    // Apply swept AABB collision per axis
    this.moveWithCollision(dt);

    if (this.onGround) {
      this.jumpsRemaining = armor?.allowDoubleJump ? (armor.tier >= 6 ? 3 : 2) : 1;
    }

    // Update Camera Transform (1st person vs 3rd person orbit)
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    if (this.isThirdPerson) {
      const lookBack = new THREE.Vector3(0, 0, 1).applyEuler(euler);
      const camDist = 4.2;
      const targetCamPos = new THREE.Vector3(
        this.position.x + lookBack.x * camDist,
        this.position.y + this.eyeHeight + 0.45 + lookBack.y * camDist * 0.6,
        this.position.z + lookBack.z * camDist
      );
      this.camera.position.copy(targetCamPos);
      this.updateThirdPersonHeroModel(moveDir.lengthSq() > 0);
    } else {
      this.camera.position.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    }

    // Update Held Item 3D Model & Animation
    this.updateHeldItemModel(dt, moveDir.lengthSq() > 0);
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
