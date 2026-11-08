import * as THREE from 'three';
import { sound } from '../audio/soundEngine';
import { BLOCKS, ITEMS } from '../data/itemsAndBlocks';
import { RECIPES } from '../data/recipes';
import { BlockId, InventorySlot, ItemDef, ProgressionTier, RecipeDef } from '../types';
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

  // World & Cheats configuration
  public worldName = 'Realm of Aethelgard';
  public cheatsEnabled = false;
  public hasSavedWorld = false;

  // Inventory: 9 hotbar slots (0..8) + 27 backpack slots (9..35)
  public inventory: (InventorySlot | null)[] = new Array(36).fill(null);
  public selectedHotbarIndex = 0;
  public equippedArmorId: string | null = null;

  // Cooldowns & animations
  public attackCooldownTimer = 0;
  public abilityCooldownTimer = 0;
  public dashCooldownTimer = 0;
  public hurtInvulnTimer = 0;
  public swingAnimProgress = 0;
  public isSwinging = false;

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

    this.initStarterInventory();
    this.loadPlayerState();
    this.recalculateStats();

    const spawnY = this.world.getSurfaceHeight(Math.floor(this.position.x), Math.floor(this.position.z)) + 2.5;
    this.position.y = Math.max(this.position.y, spawnY);
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
    let baseHp = 120;
    let baseMana = 100;
    let def = 0;

    if (this.equippedArmorId && ITEMS[this.equippedArmorId]) {
      const armor = ITEMS[this.equippedArmorId];
      baseHp += armor.bonusMaxHp || 0;
      baseMana += armor.bonusMaxMana || 0;
      def += armor.defense || 0;
    }

    this.maxHp = baseHp;
    this.maxMana = baseMana;
    this.defense = def;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    if (this.mana > this.maxMana) this.mana = this.maxMana;
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
      // Automatically equip newly crafted armor if higher tier or unequipped, and put old armor in inventory
      if (this.equippedArmorId) {
        this.addItem(this.equippedArmorId, 1);
      }
      this.equippedArmorId = recipe.resultItemId;
      this.recalculateStats();
      this.hp = this.maxHp;
      this.mana = this.maxMana;
    } else {
      this.addItem(recipe.resultItemId, recipe.resultCount);
    }

    if (recipe.tier > this.unlockedTier) {
      this.unlockedTier = recipe.tier;
    }
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
    this.dashCooldownTimer = 1.6;
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.velocity.x = forward.x * 15;
    this.velocity.z = forward.z * 15;
    this.velocity.y = Math.max(this.velocity.y, 4.2);
    sound.playSwordSwing(true);
    return true;
  }

  public takeDamage(rawDamage: number): number {
    if (this.hurtInvulnTimer > 0) return 0;
    const reduction = Math.min(0.78, this.defense / 100);
    const finalDmg = Math.max(1, Math.round(rawDamage * (1 - reduction)));
    this.hp = Math.max(0, this.hp - finalDmg);
    this.hurtInvulnTimer = 0.45;
    sound.playPlayerHurt();

    if (this.hp <= 0) {
      // Respawn at Sanctuary with full HP
      this.hp = this.maxHp;
      this.mana = this.maxMana;
      const sy = this.world.getSurfaceHeight(6, 6) + 3;
      this.position.set(6.5, sy, 6.5);
      this.velocity.set(0, 0, 0);
    }
    return finalDmg;
  }

  public update(dt: number): void {
    this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - dt);
    this.abilityCooldownTimer = Math.max(0, this.abilityCooldownTimer - dt);
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    this.hurtInvulnTimer = Math.max(0, this.hurtInvulnTimer - dt);

    // Passive HP & Mana Regeneration
    const tierBonus = this.unlockedTier * 0.4;
    this.hp = Math.min(this.maxHp, this.hp + (1.8 + tierBonus) * dt);
    this.mana = Math.min(this.maxMana, this.mana + (9.5 + tierBonus * 2.5) * dt);

    const armor = this.equippedArmorId ? ITEMS[this.equippedArmorId] : null;
    const speedMult = armor?.speedMultiplier || 1.0;
    const jumpMult = armor?.jumpBoost || 1.0;

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

    const accel = this.onGround ? 18 : 8;
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

    // Update Camera Transform
    this.camera.position.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // Update Held Item 3D Model & Animation
    this.updateHeldItemModel(dt, moveDir.lengthSq() > 0);
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
    // X axis
    this.position.x += this.velocity.x * dt;
    if (this.checkCollision(this.position.x, this.position.y, this.position.z)) {
      // Auto step-up 1 block if walking into a low ledge
      if (this.onGround && !this.checkCollision(this.position.x, this.position.y + 1.05, this.position.z)) {
        this.position.y += 1.02;
      } else {
        this.position.x -= this.velocity.x * dt;
        this.velocity.x = 0;
      }
    }

    // Z axis
    this.position.z += this.velocity.z * dt;
    if (this.checkCollision(this.position.x, this.position.y, this.position.z)) {
      if (this.onGround && !this.checkCollision(this.position.x, this.position.y + 1.05, this.position.z)) {
        this.position.y += 1.02;
      } else {
        this.position.z -= this.velocity.z * dt;
        this.velocity.z = 0;
      }
    }

    // Y axis
    this.onGround = false;
    this.position.y += this.velocity.y * dt;
    if (this.checkCollision(this.position.x, this.position.y, this.position.z)) {
      if (this.velocity.y < 0) {
        this.onGround = true;
      }
      this.position.y -= this.velocity.y * dt;
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
    const minY = Math.floor(py);
    const maxY = Math.floor(py + this.height);
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
    const bobX = isMoving ? Math.cos(time) * 0.025 : 0;
    const bobY = isMoving ? Math.abs(Math.sin(time * 2)) * 0.03 : Math.sin(time * 0.4) * 0.008;

    let swingRotX = 0;
    let swingRotY = 0;
    let swingRotZ = 0;

    if (this.isSwinging) {
      this.swingAnimProgress += dt * 5.5;
      if (this.swingAnimProgress >= 1) {
        this.swingAnimProgress = 0;
        this.isSwinging = false;
      } else {
        const s = Math.sin(this.swingAnimProgress * Math.PI);
        swingRotX = -s * 0.95;
        swingRotY = s * 0.45;
        swingRotZ = s * 0.35;
      }
    }

    this.handGroup.position.set(0.42 + bobX, -0.34 + bobY, -0.58);
    this.handGroup.rotation.set(0.15 + swingRotX, -0.25 + swingRotY, swingRotZ);
  }

  private buildHeldMeshFor(item: ItemDef): void {
    const primaryMat = new THREE.MeshLambertMaterial({
      color: item.primaryColor,
      emissive: item.tier >= 3 ? item.primaryColor : '#000000',
      emissiveIntensity: item.tier >= 3 ? 0.28 : 0,
    });
    const secondaryMat = new THREE.MeshLambertMaterial({ color: item.secondaryColor });
    const handleMat = new THREE.MeshLambertMaterial({ color: '#78350f' });

    if (item.category === 'block') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), primaryMat);
      this.heldMeshGroup.add(box);
      return;
    }

    if (item.category === 'melee') {
      // Hilt + Crossguard + Blade
      const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), handleMat);
      hilt.position.set(0, -0.1, 0);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.07), secondaryMat);
      guard.position.set(0, 0.02, 0);
      const bladeLen = item.iconShape === 'greatsword' ? 0.62 : 0.5;
      const bladeWidth = item.iconShape === 'greatsword' ? 0.11 : 0.07;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(bladeWidth, bladeLen, 0.03), primaryMat);
      blade.position.set(0, 0.04 + bladeLen * 0.5, 0);
      this.heldMeshGroup.add(hilt, guard, blade);

      if (item.iconShape === 'scythe' || item.iconShape === 'hammer') {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.12), primaryMat);
        head.position.set(-0.1, 0.45, 0);
        this.heldMeshGroup.add(head);
      }
      return;
    }

    if (item.category === 'tool') {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.48, 0.05), handleMat);
      handle.position.set(0, 0.1, 0);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.07), primaryMat);
      head.position.set(0, 0.32, 0);
      this.heldMeshGroup.add(handle, head);
      return;
    }

    if (item.category === 'ranged') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.48), primaryMat);
      body.position.set(0, 0.08, -0.1);
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), secondaryMat);
      core.position.set(0, 0.12, -0.32);
      this.heldMeshGroup.add(body, core);
      return;
    }

    // Default crystal/relic/potion held model
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), primaryMat);
    orb.position.set(0, 0.1, 0);
    this.heldMeshGroup.add(orb);
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
    this.worldName = worldName.trim() || 'Realm of Aethelgard';
    this.cheatsEnabled = cheatsEnabled;
    this.unlockedTier = 1;
    this.defeatedBosses.clear();
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
        unlockedTier: this.unlockedTier,
        defeatedBosses: Array.from(this.defeatedBosses),
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
      if (state.unlockedTier) {
        this.unlockedTier = state.unlockedTier;
      }
      if (Array.isArray(state.defeatedBosses)) {
        this.defeatedBosses = new Set(state.defeatedBosses);
      }
    } catch {
      // ignore corrupt storage
    }
  }
}
