import * as THREE from 'three';
import { sound } from '../audio/soundEngine';
import { BLOCKS, BOSSES, ITEMS, MONSTERS } from '../data/itemsAndBlocks';
import {
  ActiveProjectile,
  BossDef,
  DroppedItemEntity,
  MonsterDef,
  ProgressionTier,
} from '../types';
import { VoxelWorld } from '../world/voxelWorld';
import { PlayerController } from './player';

export interface ActiveMonster {
  uid: number;
  def: MonsterDef;
  isBoss: false;
  hp: number;
  maxHp: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  onGround: boolean;
  yaw: number;
  rootGroup: THREE.Group;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  hpBarFill: THREE.Mesh;
  attackTimer: number;
  hitFlashTimer: number;
  statusPoisonTimer: number;
  statusChillTimer: number;
  statusBurnTimer: number;
  dotTickTimer: number;
}

export interface ActiveBoss {
  uid: number;
  def: BossDef;
  isBoss: true;
  hp: number;
  maxHp: number;
  phaseIndex: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  onGround: boolean;
  yaw: number;
  rootGroup: THREE.Group;
  haloRing1: THREE.Object3D | null;
  haloRing2: THREE.Object3D | null;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  attackTimer: number;
  hitFlashTimer: number;
  statusPoisonTimer: number;
  statusChillTimer: number;
  statusBurnTimer: number;
  dotTickTimer: number;
}

interface Particle3D {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  maxRadius: number;
  life: number;
  maxLife: number;
}

export class EntityManager {
  public scene: THREE.Scene;
  public world: VoxelWorld;
  public player: PlayerController;

  public monsters: ActiveMonster[] = [];
  public activeBoss: ActiveBoss | null = null;
  public projectiles: ActiveProjectile[] = [];
  public droppedItems: DroppedItemEntity[] = [];
  private particles: Particle3D[] = [];
  private shockwaves: ShockwaveRing[] = [];

  private nextUid = 1;
  private spawnTimer = 2.0;

  // Callbacks to UI for floating damage text & boss/tier notifications
  public onDamageNumber?: (worldPos: THREE.Vector3, amount: number, color: string, isCrit?: boolean) => void;
  public onBannerNotification?: (title: string, subtitle: string, color: string) => void;

  constructor(scene: THREE.Scene, world: VoxelWorld, player: PlayerController) {
    this.scene = scene;
    this.world = world;
    this.player = player;
  }

  public update(dt: number, isNightTime = false): void {
    // Natural monster spawning ONLY happens at night; all monsters disappear when it becomes day!
    if (isNightTime) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.activeBoss ? 6.0 : 2.8;
        if (this.monsters.length < 14) {
          this.spawnBiomeMonsterNearPlayer();
        }
      }
    } else if (this.monsters.length > 0) {
      this.despawnAllMonsters();
    }

    this.updateMonsters(dt);
    this.updateBoss(dt);
    this.updateProjectiles(dt);
    this.updateDroppedItems(dt);
    this.updateParticles(dt);
    this.updateShockwaves(dt);
  }

  public despawnAllMonsters(): void {
    for (const m of this.monsters) {
      this.spawnParticles(
        m.position.clone().add(new THREE.Vector3(0, 1.0, 0)),
        '#fde047',
        12,
        4.5
      );
      this.scene.remove(m.rootGroup);
    }
    this.monsters.length = 0;
  }

  private spawnBiomeMonsterNearPlayer(): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 16 + Math.random() * 14;
    const sx = this.player.position.x + Math.cos(angle) * dist;
    const sz = this.player.position.z + Math.sin(angle) * dist;
    const sy = this.world.getSurfaceHeight(Math.floor(sx), Math.floor(sz)) + 1.5;

    const biome = this.world.getBiomeAt(sx, sz);
    const candidates = MONSTERS.filter(
      (m) => m.biome === biome || m.tier <= this.player.unlockedTier + 1
    );
    const biomePreferred = candidates.filter((m) => m.biome === biome);
    const pool = biomePreferred.length > 0 ? biomePreferred : MONSTERS;
    const def = pool[Math.floor(Math.random() * pool.length)];

    this.spawnMonster(def, new THREE.Vector3(sx, sy, sz));
  }

  public spawnMonster(def: MonsterDef, pos: THREE.Vector3): ActiveMonster {
    const built = this.buildMonsterModel(def);
    built.rootGroup.position.copy(pos);
    this.scene.add(built.rootGroup);

    const mob: ActiveMonster = {
      uid: this.nextUid++,
      def,
      isBoss: false,
      hp: def.maxHp,
      maxHp: def.maxHp,
      position: pos.clone(),
      velocity: new THREE.Vector3(),
      onGround: false,
      yaw: Math.random() * Math.PI * 2,
      rootGroup: built.rootGroup,
      leftLeg: built.leftLeg,
      rightLeg: built.rightLeg,
      leftArm: built.leftArm,
      rightArm: built.rightArm,
      hpBarFill: built.hpBarFill,
      attackTimer: 1.0,
      hitFlashTimer: 0,
      statusPoisonTimer: 0,
      statusChillTimer: 0,
      statusBurnTimer: 0,
      dotTickTimer: 0.5,
    };
    this.monsters.push(mob);
    return mob;
  }

  public summonBoss(bossId: string): boolean {
    const def = BOSSES[bossId];
    if (!def) return false;

    // Remove existing boss if any
    if (this.activeBoss) {
      this.scene.remove(this.activeBoss.rootGroup);
      this.activeBoss = null;
    }

    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.player.yaw
    );
    const sx = this.player.position.x + forward.x * 14;
    const sz = this.player.position.z + forward.z * 14;
    const sy = this.world.getSurfaceHeight(Math.floor(sx), Math.floor(sz)) + 2.0;
    const pos = new THREE.Vector3(sx, sy, sz);

    const built = this.buildBossModel(def);
    built.rootGroup.position.copy(pos);
    this.scene.add(built.rootGroup);

    this.activeBoss = {
      uid: this.nextUid++,
      def,
      isBoss: true,
      hp: def.maxHp,
      maxHp: def.maxHp,
      phaseIndex: 0,
      position: pos,
      velocity: new THREE.Vector3(),
      onGround: false,
      yaw: 0,
      rootGroup: built.rootGroup,
      haloRing1: built.haloRing1,
      haloRing2: built.haloRing2,
      leftArm: built.leftArm,
      rightArm: built.rightArm,
      leftLeg: built.leftLeg,
      rightLeg: built.rightLeg,
      attackTimer: 2.0,
      hitFlashTimer: 0,
      statusPoisonTimer: 0,
      statusChillTimer: 0,
      statusBurnTimer: 0,
      dotTickTimer: 0.5,
    };

    sound.playBossRoar();
    this.spawnShockwave(pos, 12, def.glowColor);
    this.spawnParticles(pos.clone().add(new THREE.Vector3(0, 2, 0)), def.glowColor, 35, 7);

    if (this.onBannerNotification) {
      this.onBannerNotification(
        `${def.name.toUpperCase()} AWAKENS!`,
        def.title,
        def.accentColor
      );
    }
    return true;
  }

  private updateMonsters(dt: number): void {
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      const distToPlayer = m.position.distanceTo(this.player.position);

      // Despawn very far monsters
      if (distToPlayer > 58) {
        this.scene.remove(m.rootGroup);
        this.monsters.splice(i, 1);
        continue;
      }

      // Status effects (Poison, Burn, Chill)
      m.statusPoisonTimer = Math.max(0, m.statusPoisonTimer - dt);
      m.statusChillTimer = Math.max(0, m.statusChillTimer - dt);
      m.statusBurnTimer = Math.max(0, m.statusBurnTimer - dt);
      m.dotTickTimer -= dt;
      if (m.dotTickTimer <= 0) {
        m.dotTickTimer = 0.6;
        if (m.statusPoisonTimer > 0) {
          this.damageMonster(m, 6 + this.player.unlockedTier * 3, '#4ade80', false, true);
        }
        if (m.statusBurnTimer > 0) {
          this.damageMonster(m, 10 + this.player.unlockedTier * 4, '#fb923c', false, true);
        }
      }

      if (m.hp <= 0) continue;

      const chillMult = m.statusChillTimer > 0 ? 0.55 : 1.0;
      const dx = this.player.position.x - m.position.x;
      const dz = this.player.position.z - m.position.z;
      const horizDist = Math.hypot(dx, dz);

      if (horizDist < m.def.aggroRange && horizDist > 0.1) {
        m.yaw = Math.atan2(dx, dz);
        if (horizDist > m.def.attackRange * 0.85) {
          const spd = m.def.speed * chillMult;
          m.velocity.x = (dx / horizDist) * spd;
          m.velocity.z = (dz / horizDist) * spd;
        } else {
          m.velocity.x *= 0.8;
          m.velocity.z *= 0.8;
        }

        // Void Reaver shadow teleport ability
        if (m.def.canTeleport && horizDist > 7 && Math.random() < dt * 0.35) {
          this.spawnParticles(m.position.clone().add(new THREE.Vector3(0, 1, 0)), '#c084fc', 12, 3);
          m.position.x = this.player.position.x - (dx / horizDist) * 2.5;
          m.position.z = this.player.position.z - (dz / horizDist) * 2.5;
          m.position.y = this.world.getSurfaceHeight(Math.floor(m.position.x), Math.floor(m.position.z)) + 1.2;
          this.spawnParticles(m.position.clone().add(new THREE.Vector3(0, 1, 0)), '#c084fc', 12, 3);
        }

        // Attack logic
        m.attackTimer -= dt * chillMult;
        if (m.attackTimer <= 0 && horizDist <= m.def.attackRange + 0.5) {
          m.attackTimer = m.def.attackCooldown;
          if (m.def.isRanged) {
            const origin = m.position.clone().add(new THREE.Vector3(0, 1.3 * m.def.scale, 0));
            const target = this.player.position.clone().add(new THREE.Vector3(0, 1.0, 0));
            const dir = target.sub(origin).normalize();
            this.spawnProjectile({
              position: origin,
              velocity: dir.multiplyScalar(15),
              fromPlayer: false,
              damage: m.def.damage,
              radius: 0.25,
              color: m.def.projectileColor || '#38bdf8',
              maxLife: 3.0,
              gravity: 0,
            });
            sound.playMagicCast(0.8);
          } else if (horizDist <= m.def.attackRange + 0.6) {
            this.player.takeDamage(m.def.damage);
            // Lunge animation
            m.leftArm.rotation.x = -1.2;
            m.rightArm.rotation.x = -1.2;
          }
        }
      } else {
        m.velocity.x *= 0.88;
        m.velocity.z *= 0.88;
      }

      // Move monster with real voxel collision & auto-jump over blocks!
      const mobRadius = 0.36 * m.def.scale;
      const mobHeight = 1.65 * m.def.scale;
      if (m.def.canFly) {
        m.position.x += m.velocity.x * dt;
        m.position.z += m.velocity.z * dt;
        const targetGroundY = this.world.getSurfaceHeight(Math.floor(m.position.x), Math.floor(m.position.z)) + 1;
        const desiredY = targetGroundY + 1.6 + Math.sin(performance.now() * 0.004 + m.uid) * 0.45;
        m.position.y += (desiredY - m.position.y) * Math.min(1, 8 * dt);
      } else {
        m.onGround = this.moveEntityWithAutoJump(
          m.position,
          m.velocity,
          m.onGround,
          mobRadius,
          mobHeight,
          dt
        );
      }

      m.rootGroup.position.copy(m.position);
      m.rootGroup.rotation.y = m.yaw;

      // Limb walk animation
      const walkCycle = performance.now() * 0.01 * m.def.speed;
      const isMoving = Math.hypot(m.velocity.x, m.velocity.z) > 0.4;
      const swing = isMoving ? Math.sin(walkCycle) * 0.65 : 0;
      m.leftLeg.rotation.x = swing;
      m.rightLeg.rotation.x = -swing;
      m.leftArm.rotation.x += (-swing * 0.6 - m.leftArm.rotation.x) * Math.min(1, 10 * dt);
      m.rightArm.rotation.x += (swing * 0.6 - m.rightArm.rotation.x) * Math.min(1, 10 * dt);

      // Update floating health bar orientation
      const hpRatio = Math.max(0.01, m.hp / m.maxHp);
      m.hpBarFill.scale.x = hpRatio;
      m.hpBarFill.parent?.lookAt(this.player.camera.position);
    }
  }

  private checkEntityBlockCollision(px: number, py: number, pz: number, radius: number, height: number): boolean {
    const minX = Math.floor(px - radius);
    const maxX = Math.floor(px + radius);
    const minY = Math.floor(py + 0.01);
    const maxY = Math.floor(py + height - 0.01);
    const minZ = Math.floor(pz - radius);
    const maxZ = Math.floor(pz + radius);

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

  private moveEntityWithAutoJump(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    onGround: boolean,
    radius: number,
    height: number,
    dt: number
  ): boolean {
    vel.y -= 24.0 * dt;
    let blockedHoriz = false;

    // X axis
    pos.x += vel.x * dt;
    if (this.checkEntityBlockCollision(pos.x, pos.y, pos.z, radius, height)) {
      pos.x -= vel.x * dt;
      blockedHoriz = true;
    }

    // Z axis
    pos.z += vel.z * dt;
    if (this.checkEntityBlockCollision(pos.x, pos.y, pos.z, radius, height)) {
      pos.z -= vel.z * dt;
      blockedHoriz = true;
    }

    // Auto-jump when hitting a block obstacle while on the ground!
    if (blockedHoriz && onGround) {
      vel.y = 8.6;
      onGround = false;
    }

    // Y axis
    let groundedNow = false;
    pos.y += vel.y * dt;
    if (this.checkEntityBlockCollision(pos.x, pos.y, pos.z, radius, height)) {
      if (vel.y < 0) {
        groundedNow = true;
        pos.y = Math.floor(pos.y) + 1.0001;
      } else {
        pos.y -= vel.y * dt;
      }
      vel.y = 0;
    }

    if (pos.y < 2) {
      pos.y = this.world.getSurfaceHeight(Math.floor(pos.x), Math.floor(pos.z)) + 1.5;
      vel.y = 0;
      groundedNow = true;
    }

    return groundedNow;
  }

  private updateBoss(dt: number): void {
    const b = this.activeBoss;
    if (!b) return;

    // Status DoT ticks
    b.statusPoisonTimer = Math.max(0, b.statusPoisonTimer - dt);
    b.statusChillTimer = Math.max(0, b.statusChillTimer - dt);
    b.statusBurnTimer = Math.max(0, b.statusBurnTimer - dt);
    b.dotTickTimer -= dt;
    if (b.dotTickTimer <= 0) {
      b.dotTickTimer = 0.6;
      if (b.statusPoisonTimer > 0) this.damageBoss(12, '#4ade80', false, true);
      if (b.statusBurnTimer > 0) this.damageBoss(18, '#fb923c', false, true);
      if (!this.activeBoss) return;
    }

    // Check phase transitions
    const hpRatio = b.hp / b.maxHp;
    for (let pIdx = b.def.phases.length - 1; pIdx >= 0; pIdx--) {
      if (hpRatio <= b.def.phases[pIdx].hpThreshold) {
        if (pIdx > b.phaseIndex) {
          b.phaseIndex = pIdx;
          sound.playBossRoar();
          this.spawnShockwave(b.position, 15, b.def.glowColor);
          if (this.onBannerNotification) {
            this.onBannerNotification(
              `${b.def.name}: ${b.def.phases[pIdx].name}`,
              'Boss power intensifies!',
              b.def.glowColor
            );
          }
        }
        break;
      }
    }

    const phase = b.def.phases[b.phaseIndex];
    const chillMult = b.statusChillTimer > 0 ? 0.72 : 1.0;
    const dx = this.player.position.x - b.position.x;
    const dz = this.player.position.z - b.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 0.1) {
      b.yaw = Math.atan2(dx, dz);
      const desiredDist = 5.5;
      if (dist > desiredDist) {
        const spd = b.def.speed * phase.speedMult * chillMult;
        b.velocity.x = (dx / dist) * spd;
        b.velocity.z = (dz / dist) * spd;
      } else {
        b.velocity.x *= 0.82;
        b.velocity.z *= 0.82;
      }
    }

    const isFloatingBoss = b.def.modelType === 'void_boss' || b.def.modelType === 'astral_boss';
    if (isFloatingBoss) {
      b.position.x += b.velocity.x * dt;
      b.position.z += b.velocity.z * dt;
      const groundY = this.world.getSurfaceHeight(Math.floor(b.position.x), Math.floor(b.position.z)) + 1;
      const floatOffset = 2.2 + Math.sin(performance.now() * 0.003) * 0.6;
      b.position.y += (groundY + floatOffset - b.position.y) * Math.min(1, 8 * dt);
    } else {
      b.onGround = this.moveEntityWithAutoJump(
        b.position,
        b.velocity,
        b.onGround,
        0.75 * b.def.scale,
        2.6 * b.def.scale,
        dt
      );
    }

    b.rootGroup.position.copy(b.position);
    b.rootGroup.rotation.y = b.yaw;

    // Boss walk limb animation
    const walkCycle = performance.now() * 0.008 * b.def.speed;
    const isMoving = Math.hypot(b.velocity.x, b.velocity.z) > 0.35;
    const legSwing = isMoving ? Math.sin(walkCycle) * 0.5 : 0;
    b.leftLeg.rotation.x = legSwing;
    b.rightLeg.rotation.x = -legSwing;
    b.leftArm.rotation.x += (-legSwing * 0.45 - b.leftArm.rotation.x) * Math.min(1, 8 * dt);
    b.rightArm.rotation.x += (legSwing * 0.45 - b.rightArm.rotation.x) * Math.min(1, 8 * dt);

    // Rotate boss halo rings if present
    if (b.haloRing1) {
      b.haloRing1.rotation.z += dt * 1.4;
      b.haloRing1.rotation.x += dt * 0.7;
    }
    if (b.haloRing2) {
      b.haloRing2.rotation.y -= dt * 1.8;
    }

    // Contact melee damage if very close
    if (dist < 3.6 && Math.abs(this.player.position.y - b.position.y) < 4.5) {
      this.player.takeDamage(Math.round(b.def.damage * 0.75));
    }

    // Boss special attacks
    b.attackTimer -= dt * chillMult;
    if (b.attackTimer <= 0) {
      b.attackTimer = phase.attackInterval;
      const attackName = phase.attacks[Math.floor(Math.random() * phase.attacks.length)];
      this.executeBossAttack(b, attackName);
    }
  }

  private executeBossAttack(b: ActiveBoss, attack: string): void {
    const center = b.position.clone().add(new THREE.Vector3(0, 2.2, 0));
    const toPlayer = this.player.position
      .clone()
      .add(new THREE.Vector3(0, 1.0, 0))
      .sub(center)
      .normalize();

    b.leftArm.rotation.x = -1.3;
    b.rightArm.rotation.x = -1.3;

    switch (attack) {
      case 'spore_barrage':
      case 'icicle_fan':
      case 'magma_volley':
      case 'starlight_lance': {
        const count = attack === 'starlight_lance' ? 7 : 5;
        const spread = 0.18;
        for (let i = 0; i < count; i++) {
          const offsetAngle = (i - (count - 1) / 2) * spread;
          const dir = toPlayer.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), offsetAngle);
          this.spawnProjectile({
            position: center.clone(),
            velocity: dir.multiplyScalar(18),
            fromPlayer: false,
            damage: b.def.damage,
            radius: 0.35,
            color: b.def.glowColor,
            maxLife: 3.5,
            gravity: attack === 'magma_volley' ? 3.5 : 0,
            explosiveRadius: attack === 'magma_volley' ? 3.0 : undefined,
          });
        }
        sound.playMagicCast(0.7);
        break;
      }

      case 'root_slam':
      case 'frost_nova':
      case 'lava_shockwave':
      case 'cosmic_nova': {
        const radius = 9.5;
        this.spawnShockwave(b.position, radius, b.def.accentColor);
        sound.playExplosion();
        if (this.player.position.distanceTo(b.position) <= radius) {
          this.player.takeDamage(b.def.damage);
          this.player.velocity.y = 7.5;
        }
        break;
      }

      case 'summon_stalkers': {
        const stalkerDef = MONSTERS.find((m) => m.id === 'sylvan_stalker') || MONSTERS[0];
        if (this.monsters.length < 10) {
          this.spawnMonster(
            stalkerDef,
            b.position.clone().add(new THREE.Vector3(3, 1, 3))
          );
        }
        break;
      }

      case 'blizzard_spiral':
      case 'void_spiral':
      case 'singularity_burst':
      case 'supernova_cataclysm': {
        const bolts = attack === 'supernova_cataclysm' ? 14 : 10;
        for (let i = 0; i < bolts; i++) {
          const angle = (i / bolts) * Math.PI * 2 + performance.now() * 0.002;
          const dir = new THREE.Vector3(Math.cos(angle), -0.05, Math.sin(angle)).normalize();
          this.spawnProjectile({
            position: center.clone(),
            velocity: dir.multiplyScalar(15),
            fromPlayer: false,
            damage: b.def.damage,
            radius: 0.38,
            color: b.def.glowColor,
            maxLife: 3.5,
            gravity: 0,
          });
        }
        sound.playMagicCast(1.2);
        break;
      }

      case 'meteor_rain': {
        for (let i = 0; i < 4; i++) {
          const skyPos = this.player.position
            .clone()
            .add(new THREE.Vector3((Math.random() - 0.5) * 12, 16 + i * 2, (Math.random() - 0.5) * 12));
          this.spawnProjectile({
            position: skyPos,
            velocity: new THREE.Vector3(0, -18, 0),
            fromPlayer: false,
            damage: b.def.damage,
            radius: 0.55,
            color: b.def.accentColor,
            maxLife: 2.5,
            gravity: 4.0,
            explosiveRadius: 3.8,
          });
        }
        sound.playExplosion();
        break;
      }

      case 'rift_teleport': {
        this.spawnParticles(center, b.def.glowColor, 20, 5);
        const angle = Math.random() * Math.PI * 2;
        b.position.x = this.player.position.x + Math.cos(angle) * 9;
        b.position.z = this.player.position.z + Math.sin(angle) * 9;
        b.position.y = this.world.getSurfaceHeight(Math.floor(b.position.x), Math.floor(b.position.z)) + 2;
        this.spawnParticles(b.position, b.def.glowColor, 20, 5);
        break;
      }
    }
  }

  public performPlayerMeleeAttack(item: typeof ITEMS[string]): void {
    const reach = item.reach || 4.5;
    const baseDmg = item.damage || 10;
    const camPos = this.player.camera.position.clone();
    const camDir = new THREE.Vector3();
    this.player.camera.getWorldDirection(camDir);

    sound.playSwordSwing(item.iconShape === 'greatsword' || item.iconShape === 'hammer');

    // Starforged Zenith Blade fires a piercing crescent projectile on every swing!
    if (item.id === 'starforged_cleaver') {
      this.spawnProjectile({
        position: camPos.clone().add(camDir.clone().multiplyScalar(1.0)),
        velocity: camDir.clone().multiplyScalar(28),
        fromPlayer: true,
        damage: Math.round(baseDmg * 0.75),
        radius: 0.55,
        color: '#fde047',
        maxLife: 1.8,
        gravity: 0,
        piercing: true,
        statusEffect: 'astral_mark',
      });
    }

    // Check hit against monsters within reach cone
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      const mobCenter = m.position.clone().add(new THREE.Vector3(0, 1.0 * m.def.scale, 0));
      const toMob = mobCenter.clone().sub(camPos);
      const dist = toMob.length();
      if (dist <= reach + 0.8) {
        const dot = toMob.normalize().dot(camDir);
        if (dot > 0.45 || dist < 2.2) {
          const isCrit = Math.random() < (item.critChance || 0.1);
          const dmg = Math.round(baseDmg * (isCrit ? 1.6 : 1.0));
          this.applyStatusToEntity(m, item.statusEffect);
          this.damageMonster(m, dmg, isCrit ? '#fde047' : '#ffffff', isCrit);
          // Knockback
          const kb = item.knockback || 5;
          m.velocity.x += camDir.x * kb;
          m.velocity.z += camDir.z * kb;
          m.position.y += 0.25;
        }
      }
    }

    // Check hit against Active Boss
    if (this.activeBoss) {
      const bossCenter = this.activeBoss.position.clone().add(new THREE.Vector3(0, 2.0, 0));
      const toBoss = bossCenter.clone().sub(camPos);
      const dist = toBoss.length();
      if (dist <= reach + 2.4) {
        const dot = toBoss.normalize().dot(camDir);
        if (dot > 0.35 || dist < 3.5) {
          const isCrit = Math.random() < (item.critChance || 0.1);
          const dmg = Math.round(baseDmg * (isCrit ? 1.6 : 1.0));
          this.applyStatusToEntity(this.activeBoss, item.statusEffect);
          this.damageBoss(dmg, isCrit ? '#fde047' : '#ffffff', isCrit);
        }
      }
    }
  }

  public performWeaponAbility(item: typeof ITEMS[string]): boolean {
    const ab = item.ability;
    if (!ab) return false;
    if (this.player.abilityCooldownTimer > 0) return false;
    if (this.player.mana < ab.manaCost) return false;

    this.player.mana -= ab.manaCost;
    this.player.abilityCooldownTimer = ab.cooldown;
    this.player.triggerSwing();

    const camPos = this.player.camera.position.clone();
    const camDir = new THREE.Vector3();
    this.player.camera.getWorldDirection(camDir);
    const baseDmg = item.damage || 20;

    switch (ab.type) {
      case 'arrow_shot':
      case 'cryo_bolt':
      case 'lightning_rail': {
        const speed = ab.type === 'lightning_rail' ? 38 : 26;
        this.spawnProjectile({
          position: camPos.clone().add(camDir.clone().multiplyScalar(0.8)),
          velocity: camDir.clone().multiplyScalar(speed),
          fromPlayer: true,
          damage: baseDmg,
          radius: ab.type === 'lightning_rail' ? 0.35 : 0.22,
          color: item.primaryColor,
          maxLife: 2.5,
          gravity: ab.type === 'arrow_shot' ? 2.5 : 0,
          piercing: ab.type === 'lightning_rail',
          statusEffect: item.statusEffect,
        });
        sound.playMagicCast(ab.type === 'lightning_rail' ? 1.4 : 1.0);
        break;
      }

      case 'thorn_wave':
      case 'thorn_volley': {
        const count = item.id === 'sylvan_vineblade' ? 5 : 3;
        for (let i = 0; i < count; i++) {
          const angle = (i - (count - 1) / 2) * 0.14;
          const dir = camDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
          this.spawnProjectile({
            position: camPos.clone().add(dir.clone().multiplyScalar(0.8)),
            velocity: dir.multiplyScalar(22),
            fromPlayer: true,
            damage: Math.round(baseDmg * 0.85),
            radius: 0.25,
            color: '#4ade80',
            maxLife: 2.0,
            gravity: 0,
            statusEffect: 'poison',
          });
        }
        sound.playMagicCast(0.9);
        break;
      }

      case 'shatter_slam':
      case 'ice_nova': {
        const radius = ab.type === 'ice_nova' ? 8.0 : 6.0;
        const color = ab.type === 'ice_nova' ? '#38bdf8' : '#fbbf24';
        this.spawnShockwave(this.player.position, radius, color);
        this.spawnParticles(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), color, 28, 6);
        sound.playExplosion();
        this.damageAllEnemiesInRadius(this.player.position, radius, Math.round(baseDmg * 1.4), item.statusEffect);
        break;
      }

      case 'flame_whirlwind': {
        this.spawnShockwave(this.player.position, 7.5, '#f97316');
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const dir = new THREE.Vector3(Math.cos(angle), 0.05, Math.sin(angle)).normalize();
          this.spawnProjectile({
            position: this.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
            velocity: dir.multiplyScalar(18),
            fromPlayer: true,
            damage: baseDmg,
            radius: 0.35,
            color: '#fb923c',
            maxLife: 1.6,
            gravity: 0,
            statusEffect: 'burn',
          });
        }
        sound.playExplosion();
        break;
      }

      case 'magma_bomb': {
        this.spawnProjectile({
          position: camPos.clone().add(camDir.clone().multiplyScalar(0.9)),
          velocity: camDir.clone().multiplyScalar(22),
          fromPlayer: true,
          damage: baseDmg,
          radius: 0.38,
          color: '#ea580c',
          maxLife: 3.0,
          gravity: 5.0,
          explosiveRadius: 4.5,
          statusEffect: 'burn',
        });
        sound.playExplosion();
        break;
      }

      case 'shadow_blink': {
        // Teleport forward along look horizontal vector and slash all enemies along path
        const startPos = this.player.position.clone();
        const horizDir = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
        const blinkDist = 8.5;
        const endX = startPos.x + horizDir.x * blinkDist;
        const endZ = startPos.z + horizDir.z * blinkDist;
        const endY = Math.max(
          startPos.y,
          this.world.getSurfaceHeight(Math.floor(endX), Math.floor(endZ)) + 1.2
        );
        this.spawnParticles(startPos.clone().add(new THREE.Vector3(0, 1, 0)), '#c084fc', 22, 5);
        this.player.position.set(endX, endY, endZ);
        this.spawnParticles(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), '#c084fc', 25, 6);
        this.damageAllEnemiesInRadius(this.player.position, 6.5, Math.round(baseDmg * 1.6), 'void_weaken');
        sound.playSwordSwing(true);
        break;
      }

      case 'starfall':
      case 'supernova_blast': {
        for (let i = 0; i < 2; i++) {
          const spread = (i - 0.5) * 0.1;
          const dir = camDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
          this.spawnProjectile({
            position: camPos.clone().add(dir.clone().multiplyScalar(1.0)),
            velocity: dir.multiplyScalar(26),
            fromPlayer: true,
            damage: baseDmg,
            radius: 0.42,
            color: '#fde047',
            maxLife: 2.5,
            gravity: 0,
            explosiveRadius: 4.8,
            homing: true,
            statusEffect: 'astral_mark',
          });
        }
        sound.playMagicCast(1.3);
        break;
      }
    }

    return true;
  }

  private applyStatusToEntity(
    target: ActiveMonster | ActiveBoss,
    effect?: 'poison' | 'chill' | 'burn' | 'void_weaken' | 'astral_mark'
  ): void {
    if (!effect) return;
    if (effect === 'poison') target.statusPoisonTimer = 5.0;
    if (effect === 'chill') target.statusChillTimer = 4.0;
    if (effect === 'burn' || effect === 'astral_mark') target.statusBurnTimer = 5.0;
  }

  private damageAllEnemiesInRadius(
    center: THREE.Vector3,
    radius: number,
    damage: number,
    effect?: 'poison' | 'chill' | 'burn' | 'void_weaken' | 'astral_mark'
  ): void {
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      if (m.position.distanceTo(center) <= radius) {
        this.applyStatusToEntity(m, effect);
        this.damageMonster(m, damage, '#fde047', true);
      }
    }
    if (this.activeBoss && this.activeBoss.position.distanceTo(center) <= radius + 2.0) {
      this.applyStatusToEntity(this.activeBoss, effect);
      this.damageBoss(damage, '#fde047', true);
    }
  }

  public damageMonster(
    mob: ActiveMonster,
    amount: number,
    color = '#ffffff',
    isCrit = false,
    silent = false
  ): void {
    mob.hp -= amount;
    if (!silent) sound.playMonsterHit();

    if (this.onDamageNumber) {
      this.onDamageNumber(
        mob.position.clone().add(new THREE.Vector3(0, 1.8 * mob.def.scale, 0)),
        amount,
        color,
        isCrit
      );
    }

    this.spawnParticles(
      mob.position.clone().add(new THREE.Vector3(0, 1.0, 0)),
      mob.def.accentColor,
      6,
      3.5
    );

    if (mob.hp <= 0) {
      // Drop loot
      for (const drop of mob.def.drops) {
        if (Math.random() <= drop.chance) {
          const count = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
          this.spawnDroppedItem(drop.itemId, count, mob.position.clone().add(new THREE.Vector3(0, 0.8, 0)));
        }
      }
      this.spawnParticles(mob.position.clone().add(new THREE.Vector3(0, 1.0, 0)), mob.def.bodyColor, 18, 5);
      this.scene.remove(mob.rootGroup);
      const idx = this.monsters.indexOf(mob);
      if (idx !== -1) this.monsters.splice(idx, 1);
    }
  }

  public damageBoss(amount: number, color = '#ffffff', isCrit = false, silent = false): void {
    const b = this.activeBoss;
    if (!b) return;
    b.hp -= amount;
    if (!silent) sound.playMonsterHit();

    if (this.onDamageNumber) {
      this.onDamageNumber(
        b.position.clone().add(new THREE.Vector3(0, 3.2, 0)),
        amount,
        color,
        isCrit
      );
    }

    this.spawnParticles(
      b.position.clone().add(new THREE.Vector3(0, 2.0, 0)),
      b.def.glowColor,
      8,
      4.5
    );

    if (b.hp <= 0) {
      const defeatedDef = b.def;
      const deathPos = b.position.clone();
      this.scene.remove(b.rootGroup);
      this.activeBoss = null;

      sound.playFanfare();
      this.spawnShockwave(deathPos, 18, defeatedDef.glowColor);
      this.spawnParticles(deathPos.clone().add(new THREE.Vector3(0, 2, 0)), defeatedDef.glowColor, 55, 9);

      // Drop boss cores & rewards directly + as 3D items
      for (const drop of defeatedDef.drops) {
        const count = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
        this.spawnDroppedItem(drop.itemId, count, deathPos.clone().add(new THREE.Vector3(0, 1.5, 0)));
      }

      this.player.defeatedBosses.add(defeatedDef.id);
      if (defeatedDef.unlocksTier > this.player.unlockedTier) {
        this.player.unlockedTier = defeatedDef.unlocksTier as ProgressionTier;
      }
      this.player.savePlayerState();

      if (this.onBannerNotification) {
        this.onBannerNotification(
          `${defeatedDef.name.toUpperCase()} VANQUISHED!`,
          defeatedDef.unlockMessage,
          defeatedDef.glowColor
        );
      }
    }
  }

  public spawnProjectile(opts: {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    fromPlayer: boolean;
    damage: number;
    radius: number;
    color: string;
    maxLife: number;
    gravity: number;
    explosiveRadius?: number;
    statusEffect?: 'poison' | 'chill' | 'burn' | 'void_weaken' | 'astral_mark';
    homing?: boolean;
    piercing?: boolean;
  }): void {
    const geo = new THREE.OctahedronGeometry(opts.radius, 0);
    const mat = new THREE.MeshBasicMaterial({ color: opts.color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(opts.position);
    this.scene.add(mesh);

    this.projectiles.push({
      id: this.nextUid++,
      mesh,
      position: opts.position.clone(),
      velocity: opts.velocity.clone(),
      fromPlayer: opts.fromPlayer,
      damage: opts.damage,
      radius: opts.radius,
      color: opts.color,
      life: 0,
      maxLife: opts.maxLife,
      gravity: opts.gravity,
      explosiveRadius: opts.explosiveRadius,
      statusEffect: opts.statusEffect,
      homing: opts.homing,
      piercing: opts.piercing,
    });
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      // Homing logic for Chronos Scepter / Starfall projectiles
      if (p.homing && p.fromPlayer) {
        let targetPos: THREE.Vector3 | null = null;
        if (this.activeBoss) {
          targetPos = this.activeBoss.position.clone().add(new THREE.Vector3(0, 2.0, 0));
        } else if (this.monsters.length > 0) {
          let closest = this.monsters[0];
          let minDist = p.position.distanceTo(closest.position);
          for (const m of this.monsters) {
            const d = p.position.distanceTo(m.position);
            if (d < minDist) {
              minDist = d;
              closest = m;
            }
          }
          if (minDist < 24) {
            targetPos = closest.position.clone().add(new THREE.Vector3(0, 1.0, 0));
          }
        }
        if (targetPos) {
          const desired = targetPos.sub(p.position).normalize().multiplyScalar(p.velocity.length());
          p.velocity.lerp(desired, Math.min(1, 6 * dt));
        }
      }

      p.velocity.y -= p.gravity * dt;
      p.position.addScaledVector(p.velocity, dt);
      p.mesh.position.copy(p.position);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 8;

      // Check voxel world collision
      const b = this.world.getBlock(p.position.x, p.position.y, p.position.z);
      if (b !== 0 && !p.piercing) {
        if (p.explosiveRadius) {
          this.spawnShockwave(p.position, p.explosiveRadius, p.color);
          this.spawnParticles(p.position, p.color, 16, 5);
          if (p.fromPlayer) {
            this.damageAllEnemiesInRadius(p.position, p.explosiveRadius, p.damage, p.statusEffect);
          } else if (this.player.position.distanceTo(p.position) <= p.explosiveRadius) {
            this.player.takeDamage(p.damage);
          }
        }
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.fromPlayer) {
        let hitSomething = false;
        for (let mIdx = this.monsters.length - 1; mIdx >= 0; mIdx--) {
          const m = this.monsters[mIdx];
          const mobCenter = m.position.clone().add(new THREE.Vector3(0, 1.0 * m.def.scale, 0));
          if (p.position.distanceTo(mobCenter) <= 1.2 * m.def.scale + p.radius) {
            this.applyStatusToEntity(m, p.statusEffect);
            if (p.explosiveRadius) {
              this.spawnShockwave(p.position, p.explosiveRadius, p.color);
              this.damageAllEnemiesInRadius(p.position, p.explosiveRadius, p.damage, p.statusEffect);
            } else {
              this.damageMonster(m, p.damage, p.color);
            }
            hitSomething = true;
            if (!p.piercing) break;
          }
        }

        if (!hitSomething && this.activeBoss) {
          const bossCenter = this.activeBoss.position.clone().add(new THREE.Vector3(0, 2.2, 0));
          if (p.position.distanceTo(bossCenter) <= 2.4 + p.radius) {
            this.applyStatusToEntity(this.activeBoss, p.statusEffect);
            if (p.explosiveRadius) {
              this.spawnShockwave(p.position, p.explosiveRadius, p.color);
              this.damageAllEnemiesInRadius(p.position, p.explosiveRadius, p.damage, p.statusEffect);
            } else {
              this.damageBoss(p.damage, p.color);
            }
            hitSomething = true;
          }
        }

        if (hitSomething && !p.piercing) {
          this.scene.remove(p.mesh);
          this.projectiles.splice(i, 1);
        }
      } else {
        // Enemy projectile hitting player
        const playerCenter = this.player.position.clone().add(new THREE.Vector3(0, 1.0, 0));
        if (p.position.distanceTo(playerCenter) <= 0.95 + p.radius) {
          this.player.takeDamage(p.damage);
          this.scene.remove(p.mesh);
          this.projectiles.splice(i, 1);
        }
      }
    }
  }

  public spawnDroppedItem(itemId: string, count: number, pos: THREE.Vector3): void {
    const def = ITEMS[itemId];
    if (!def) return;

    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      color: def.primaryColor,
      emissive: def.primaryColor,
      emissiveIntensity: 0.35,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), mat);
    group.add(mesh);
    group.position.copy(pos);
    this.scene.add(group);

    this.droppedItems.push({
      id: this.nextUid++,
      itemId,
      count,
      mesh: group,
      position: pos.clone(),
      velocity: new THREE.Vector3((Math.random() - 0.5) * 3, 4.5, (Math.random() - 0.5) * 3),
      createdAt: performance.now(),
    });
  }

  private updateDroppedItems(dt: number): void {
    for (let i = this.droppedItems.length - 1; i >= 0; i--) {
      const item = this.droppedItems[i];
      item.velocity.y -= 14 * dt;
      item.position.addScaledVector(item.velocity, dt);

      const groundY = this.world.getSurfaceHeight(Math.floor(item.position.x), Math.floor(item.position.z)) + 1.35;
      if (item.position.y < groundY) {
        item.position.y = groundY;
        item.velocity.y = 0;
        item.velocity.x *= 0.8;
        item.velocity.z *= 0.8;
      }

      // Magnetize toward player
      const playerTarget = this.player.position.clone().add(new THREE.Vector3(0, 1.0, 0));
      const dist = item.position.distanceTo(playerTarget);
      if (dist < 5.5) {
        const pull = playerTarget.clone().sub(item.position).normalize().multiplyScalar(11 * dt);
        item.position.add(pull);
      }

      item.mesh.position.copy(item.position);
      item.mesh.position.y += Math.sin(performance.now() * 0.005 + item.id) * 0.12;
      item.mesh.rotation.y += dt * 2.5;

      if (dist < 1.5) {
        if (this.player.addItem(item.itemId, item.count)) {
          sound.playPickup();
          this.scene.remove(item.mesh);
          this.droppedItems.splice(i, 1);
        }
      }
    }
  }

  public spawnParticles(pos: THREE.Vector3, color: string, count = 10, speed = 4): void {
    const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const mat = new THREE.MeshBasicMaterial({ color });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * speed * 2,
          Math.random() * speed * 1.4 + 1,
          (Math.random() - 0.5) * speed * 2
        ),
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.velocity.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      const scale = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(scale);
    }
  }

  public spawnShockwave(center: THREE.Vector3, maxRadius: number, color: string): void {
    const geo = new THREE.RingGeometry(0.4, 0.85, 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    mesh.position.y += 0.15;
    this.scene.add(mesh);

    this.shockwaves.push({
      mesh,
      maxRadius,
      life: 0,
      maxLife: 0.45,
    });
  }

  private updateShockwaves(dt: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }
      const progress = s.life / s.maxLife;
      const scale = 1 + progress * s.maxRadius;
      s.mesh.scale.set(scale, 1, scale);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.85;
    }
  }

  private buildMonsterModel(def: MonsterDef): {
    rootGroup: THREE.Group;
    leftLeg: THREE.Object3D;
    rightLeg: THREE.Object3D;
    leftArm: THREE.Object3D;
    rightArm: THREE.Object3D;
    hpBarFill: THREE.Mesh;
  } {
    const rootGroup = new THREE.Group();
    const s = def.scale;

    const bodyMat = new THREE.MeshLambertMaterial({ color: def.bodyColor });
    const darkMat = new THREE.MeshLambertMaterial({ color: '#18181b' });
    const boneMat = new THREE.MeshLambertMaterial({ color: '#f8fafc' });
    const accentMat = new THREE.MeshLambertMaterial({
      color: def.accentColor,
      emissive: def.accentColor,
      emissiveIntensity: 0.3,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: def.eyeColor });

    // Pivot groups for limbs so they rotate from hip/shoulder joints
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();

    if (def.modelType === 'boar') {
      // 4-legged Bramble Tusk-Boar with hunched spine, snout, curved tusks, ears & dorsal bramble spikes
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.85 * s, 0.65 * s, 1.25 * s), bodyMat);
      body.position.set(0, 0.72 * s, 0);
      const hump = new THREE.Mesh(new THREE.BoxGeometry(0.76 * s, 0.25 * s, 0.65 * s), bodyMat);
      hump.position.set(0, 1.1 * s, 0.2 * s);
      rootGroup.add(body, hump);

      // Dorsal Bramble Spines along back
      for (let i = 0; i < 4; i++) {
        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.1 * s, 0.32 * s, 4), accentMat);
        spine.position.set(0, 1.22 * s - i * 0.04 * s, 0.35 * s - i * 0.28 * s);
        spine.rotation.x = -0.35;
        rootGroup.add(spine);
      }

      // Boar Head + Snout + Tusks
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.68 * s, 0.56 * s, 0.58 * s), bodyMat);
      head.position.set(0, 0.82 * s, 0.78 * s);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 0.32 * s, 0.34 * s), darkMat);
      snout.position.set(0, -0.08 * s, 0.38 * s);
      const tuskL = new THREE.Mesh(new THREE.ConeGeometry(0.065 * s, 0.34 * s, 4), boneMat);
      tuskL.position.set(-0.22 * s, 0.02 * s, 0.42 * s);
      tuskL.rotation.x = 0.4;
      tuskL.rotation.z = 0.25;
      const tuskR = new THREE.Mesh(new THREE.ConeGeometry(0.065 * s, 0.34 * s, 4), boneMat);
      tuskR.position.set(0.22 * s, 0.02 * s, 0.42 * s);
      tuskR.rotation.x = 0.4;
      tuskR.rotation.z = -0.25;
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, 0.1 * s, 0.06 * s), eyeMat);
      eyeL.position.set(-0.24 * s, 0.1 * s, 0.28 * s);
      const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, 0.1 * s, 0.06 * s), eyeMat);
      eyeR.position.set(0.24 * s, 0.1 * s, 0.28 * s);
      head.add(snout, tuskL, tuskR, eyeL, eyeR);
      rootGroup.add(head);

      // 4 Hoofed Legs (hind legs = leftLeg/rightLeg, front legs = leftArm/rightArm)
      leftLeg.position.set(-0.28 * s, 0.45 * s, -0.42 * s);
      rightLeg.position.set(0.28 * s, 0.45 * s, -0.42 * s);
      leftArm.position.set(-0.28 * s, 0.45 * s, 0.42 * s);
      rightArm.position.set(0.28 * s, 0.45 * s, 0.42 * s);
      [leftLeg, rightLeg, leftArm, rightArm].forEach((limb) => {
        const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.46 * s, 0.22 * s), bodyMat);
        legMesh.position.y = -0.22 * s;
        const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.24 * s, 0.1 * s, 0.25 * s), darkMat);
        hoof.position.y = -0.42 * s;
        limb.add(legMesh, hoof);
      });
      rootGroup.add(leftLeg, rightLeg, leftArm, rightArm);
    } else if (def.modelType === 'crawler') {
      // Multi-legged Arachnid/Scorpion Cryo-Crawler with crystal clusters & pincers
      const thorax = new THREE.Mesh(new THREE.BoxGeometry(0.75 * s, 0.45 * s, 0.75 * s), bodyMat);
      thorax.position.set(0, 0.52 * s, 0.18 * s);
      const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.95 * s, 0.62 * s, 0.95 * s), bodyMat);
      abdomen.position.set(0, 0.68 * s, -0.55 * s);
      abdomen.rotation.x = 0.2;
      rootGroup.add(thorax, abdomen);

      // Glowing Cryo Crystals sprouting from abdomen
      for (let c = 0; c < 3; c++) {
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.24 * s, 0), accentMat);
        shard.scale.set(0.7, 1.8, 0.7);
        shard.position.set((c - 1) * 0.26 * s, 1.08 * s, -0.55 * s - (c % 2) * 0.15 * s);
        shard.rotation.z = (c - 1) * 0.35;
        rootGroup.add(shard);
      }

      // Spider Eyes & Mandibles
      for (let e = -1; e <= 1; e += 2) {
        const mainEye = new THREE.Mesh(new THREE.BoxGeometry(0.13 * s, 0.12 * s, 0.08 * s), eyeMat);
        mainEye.position.set(e * 0.18 * s, 0.6 * s, 0.58 * s);
        const sideEye = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.08 * s, 0.08 * s), eyeMat);
        sideEye.position.set(e * 0.32 * s, 0.64 * s, 0.52 * s);
        const mandible = new THREE.Mesh(new THREE.ConeGeometry(0.09 * s, 0.35 * s, 4), accentMat);
        mandible.position.set(e * 0.22 * s, 0.42 * s, 0.72 * s);
        mandible.rotation.x = Math.PI * 0.45;
        mandible.rotation.z = -e * 0.3;
        rootGroup.add(mainEye, sideEye, mandible);
      }

      // Jointed Spider Legs
      leftLeg.position.set(-0.38 * s, 0.48 * s, -0.2 * s);
      rightLeg.position.set(0.38 * s, 0.48 * s, -0.2 * s);
      leftArm.position.set(-0.38 * s, 0.48 * s, 0.25 * s);
      rightArm.position.set(0.38 * s, 0.48 * s, 0.25 * s);
      [
        { grp: leftLeg, side: -1 },
        { grp: rightLeg, side: 1 },
        { grp: leftArm, side: -1 },
        { grp: rightArm, side: 1 },
      ].forEach(({ grp, side }) => {
        for (let pair = 0; pair < 2; pair++) {
          const zOff = (pair - 0.5) * 0.28 * s;
          const femur = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 0.12 * s, 0.12 * s), accentMat);
          femur.position.set(side * 0.2 * s, 0.08 * s, zOff);
          femur.rotation.z = side * 0.45;
          const tibia = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 0.52 * s, 0.12 * s), bodyMat);
          tibia.position.set(side * 0.42 * s, -0.22 * s, zOff);
          tibia.rotation.z = -side * 0.2;
          grp.add(femur, tibia);
        }
      });
      rootGroup.add(leftLeg, rightLeg, leftArm, rightArm);
    } else if (def.modelType === 'wraith' || def.modelType === 'sentinel') {
      // Floating Wraith / Celestial Star-Sentinel
      if (def.modelType === 'sentinel') {
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.45 * s, 0), bodyMat);
        core.position.set(0, 1.35 * s, 0);
        const eyeLens = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 * s, 0), eyeMat);
        eyeLens.position.set(0, 1.35 * s, 0.34 * s);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.65 * s, 0.06 * s, 6, 20), accentMat);
        halo.position.set(0, 1.35 * s, 0);
        rootGroup.add(core, eyeLens, halo);

        // Floating Wing Shields
        leftArm.position.set(-0.75 * s, 1.45 * s, 0);
        rightArm.position.set(0.75 * s, 1.45 * s, 0);
        const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.95 * s, 0.42 * s), accentMat);
        const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.95 * s, 0.42 * s), accentMat);
        leftArm.add(wingL);
        rightArm.add(wingR);
        rootGroup.add(leftLeg, rightLeg, leftArm, rightArm);
      } else {
        // Permafrost Wraith: Hooded cloak + glowing ribcage core + trailing ice ribbons
        const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.55 * s, 1.35 * s, 6), bodyMat);
        cloak.position.set(0, 1.15 * s, 0);
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28 * s, 0), accentMat);
        core.position.set(0, 1.2 * s, 0.15 * s);
        const hood = new THREE.Mesh(new THREE.BoxGeometry(0.56 * s, 0.56 * s, 0.56 * s), bodyMat);
        hood.position.set(0, 1.85 * s, 0.05 * s);
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.32 * s, 0.4 * s, 4), accentMat);
        crown.position.set(0, 0.42 * s, 0);
        const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.09 * s, 0.06 * s), eyeMat);
        eyeL.position.set(-0.13 * s, 0.02 * s, 0.29 * s);
        const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.09 * s, 0.06 * s), eyeMat);
        eyeR.position.set(0.13 * s, 0.02 * s, 0.29 * s);
        hood.add(crown, eyeL, eyeR);

        leftArm.position.set(-0.56 * s, 1.55 * s, 0.1 * s);
        rightArm.position.set(0.56 * s, 1.55 * s, 0.1 * s);
        const clawL = new THREE.Mesh(new THREE.ConeGeometry(0.15 * s, 0.65 * s, 4), accentMat);
        clawL.rotation.x = Math.PI;
        clawL.position.y = -0.3 * s;
        const clawR = new THREE.Mesh(new THREE.ConeGeometry(0.15 * s, 0.65 * s, 4), accentMat);
        clawR.rotation.x = Math.PI;
        clawR.position.y = -0.3 * s;
        leftArm.add(clawL);
        rightArm.add(clawR);

        rootGroup.add(cloak, core, hood, leftLeg, rightLeg, leftArm, rightArm);
      }
    } else {
      // Bipedal Monsters: Sylvan Stalker, Moss Golem, Magma Brute, Void Reaver
      const isHeavy = def.modelType === 'golem' || def.modelType === 'brute';
      const chestW = isHeavy ? 0.98 * s : 0.68 * s;
      const chestH = isHeavy ? 0.92 * s : 0.78 * s;
      const chestD = isHeavy ? 0.58 * s : 0.42 * s;

      // Pelvis + Chest + Glowing Core/Runes
      const pelvis = new THREE.Mesh(new THREE.BoxGeometry(chestW * 0.78, 0.32 * s, chestD * 0.85), darkMat);
      pelvis.position.set(0, 0.78 * s, 0);
      const chest = new THREE.Mesh(new THREE.BoxGeometry(chestW, chestH, chestD), bodyMat);
      chest.position.set(0, 1.32 * s, 0);
      const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(chestW * 0.65, chestH * 0.55, chestD + 0.06 * s), accentMat);
      chestPlate.position.set(0, 1.36 * s, 0);
      rootGroup.add(pelvis, chest, chestPlate);

      // Head + Helmet/Horns/Eyes
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.56 * s, 0.56 * s, 0.56 * s), bodyMat);
      head.position.set(0, 2.02 * s, 0);
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.1 * s, 0.06 * s), eyeMat);
      eyeL.position.set(-0.14 * s, 0.05 * s, 0.29 * s);
      const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.1 * s, 0.06 * s), eyeMat);
      eyeR.position.set(0.14 * s, 0.05 * s, 0.29 * s);
      head.add(eyeL, eyeR);

      if (def.modelType === 'brute' || def.modelType === 'reaver') {
        const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.1 * s, 0.45 * s, 4), accentMat);
        hornL.position.set(-0.32 * s, 0.34 * s, 0);
        hornL.rotation.z = 0.45;
        const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.1 * s, 0.45 * s, 4), accentMat);
        hornR.position.set(0.32 * s, 0.34 * s, 0);
        hornR.rotation.z = -0.45;
        head.add(hornL, hornR);
      } else {
        const crest = new THREE.Mesh(new THREE.BoxGeometry(0.66 * s, 0.24 * s, 0.36 * s), accentMat);
        crest.position.set(0, 0.34 * s, 0);
        head.add(crest);
      }
      rootGroup.add(head);

      // Articulated Legs
      leftLeg.position.set(-chestW * 0.28, 0.68 * s, 0);
      rightLeg.position.set(chestW * 0.28, 0.68 * s, 0);
      [leftLeg, rightLeg].forEach((leg) => {
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.28 * s, 0.68 * s, 0.28 * s), bodyMat);
        thigh.position.y = -0.34 * s;
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.31 * s, 0.22 * s, 0.34 * s), accentMat);
        boot.position.set(0, -0.58 * s, 0.04 * s);
        leg.add(thigh, boot);
      });

      // Articulated Arms + Pauldrons + Held Monster Weapons!
      leftArm.position.set(-(chestW * 0.5 + 0.18 * s), 1.66 * s, 0);
      rightArm.position.set(chestW * 0.5 + 0.18 * s, 1.66 * s, 0);
      [leftArm, rightArm].forEach((arm, idx) => {
        const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.36 * s, 0.28 * s, 0.36 * s), accentMat);
        pauldron.position.y = 0.05 * s;
        const forearm = new THREE.Mesh(
          new THREE.BoxGeometry((isHeavy ? 0.32 : 0.22) * s, 0.78 * s, (isHeavy ? 0.32 : 0.22) * s),
          bodyMat
        );
        forearm.position.y = -0.38 * s;
        arm.add(pauldron, forearm);

        // Give Void Reavers dual glowing blades & Magma Brutes a volcanic club!
        if (def.modelType === 'reaver') {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.12 * s, 0.85 * s), accentMat);
          blade.position.set(0, -0.72 * s, 0.38 * s);
          arm.add(blade);
        } else if (def.modelType === 'brute' && idx === 1) {
          const club = new THREE.Mesh(new THREE.BoxGeometry(0.24 * s, 0.24 * s, 0.9 * s), accentMat);
          club.position.set(0, -0.72 * s, 0.35 * s);
          arm.add(club);
        }
      });

      rootGroup.add(leftLeg, rightLeg, leftArm, rightArm);
    }

    // Floating 3D Health Bar above monster
    const hpGroup = new THREE.Group();
    hpGroup.position.set(0, 2.55 * s, 0);
    const bgBar = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.13),
      new THREE.MeshBasicMaterial({ color: '#1e293b', side: THREE.DoubleSide })
    );
    const hpBarFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.06, 0.09),
      new THREE.MeshBasicMaterial({ color: '#ef4444', side: THREE.DoubleSide })
    );
    hpBarFill.position.z = 0.01;
    hpGroup.add(bgBar, hpBarFill);
    rootGroup.add(hpGroup);

    return { rootGroup, leftLeg, rightLeg, leftArm, rightArm, hpBarFill };
  }

  private buildBossModel(def: BossDef): {
    rootGroup: THREE.Group;
    haloRing1: THREE.Object3D | null;
    haloRing2: THREE.Object3D | null;
    leftArm: THREE.Object3D;
    rightArm: THREE.Object3D;
    leftLeg: THREE.Object3D;
    rightLeg: THREE.Object3D;
  } {
    const rootGroup = new THREE.Group();
    const s = def.scale;

    const bodyMat = new THREE.MeshLambertMaterial({ color: def.bodyColor });
    const darkMat = new THREE.MeshLambertMaterial({ color: '#090d16' });
    const accentMat = new THREE.MeshLambertMaterial({
      color: def.accentColor,
      emissive: def.accentColor,
      emissiveIntensity: 0.42,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: def.glowColor });

    // Multi-layered Armored Boss Torso + Ribcage Plates + Glowing Heart Core
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.95 * s, 0.38 * s, 0.62 * s), darkMat);
    pelvis.position.y = 0.92 * s;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.28 * s, 1.38 * s, 0.78 * s), bodyMat);
    torso.position.y = 1.65 * s;
    const chestArmor = new THREE.Mesh(new THREE.BoxGeometry(1.36 * s, 0.65 * s, 0.84 * s), accentMat);
    chestArmor.position.y = 1.88 * s;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42 * s, 0), glowMat);
    core.position.set(0, 1.65 * s, 0.42 * s);
    rootGroup.add(pelvis, torso, chestArmor, core);

    // Boss Head + Horns / Antlers / Seraph Crown + Visor Eyes
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.76 * s, 0.76 * s, 0.76 * s), bodyMat);
    head.position.set(0, 2.72 * s, 0);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(1.12 * s, 0.32 * s, 0.44 * s), accentMat);
    crown.position.set(0, 0.44 * s, 0);
    const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 0.75 * s, 4), glowMat);
    hornL.position.set(-0.48 * s, 0.68 * s, 0);
    hornL.rotation.z = 0.35;
    const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 0.75 * s, 4), glowMat);
    hornR.position.set(0.48 * s, 0.68 * s, 0);
    hornR.rotation.z = -0.35;
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.58 * s, 0.15 * s, 0.08 * s), glowMat);
    eyes.position.set(0, 0.06 * s, 0.39 * s);
    head.add(crown, hornL, hornR, eyes);
    rootGroup.add(head);

    // 6 Articulated Wings for Aethelgard / Void Boss, or Back Spires for Titans
    if (def.modelType === 'astral_boss' || def.modelType === 'void_boss') {
      const wingPairs = def.modelType === 'astral_boss' ? 3 : 2;
      for (let w = 0; w < wingPairs; w++) {
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(new THREE.BoxGeometry(1.45 * s, 0.24 * s, 0.08 * s), w % 2 === 0 ? accentMat : glowMat);
          wing.position.set(side * 1.15 * s, (2.25 - w * 0.42) * s, -0.42 * s);
          wing.rotation.z = side * (0.35 - w * 0.22);
          wing.rotation.y = -side * 0.25;
          rootGroup.add(wing);
        }
      }
    } else {
      // Back Crystal / Magma / Canopy Spires
      for (const side of [-1, 1]) {
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.24 * s, 0.95 * s, 5), accentMat);
        spire.position.set(side * 0.45 * s, 2.35 * s, -0.45 * s);
        spire.rotation.x = -0.4;
        spire.rotation.z = -side * 0.25;
        rootGroup.add(spire);
      }
    }

    // Pauldrons, Giant Arms & Signature Boss Weapon in Right Hand
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.96 * s, 2.15 * s, 0);
    const lPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.58 * s, 0.45 * s, 0.58 * s), accentMat);
    const lLimb = new THREE.Mesh(new THREE.BoxGeometry(0.44 * s, 1.32 * s, 0.44 * s), bodyMat);
    lLimb.position.y = -0.62 * s;
    const lGauntlet = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.42 * s, 0.5 * s), accentMat);
    lGauntlet.position.y = -1.1 * s;
    leftArm.add(lPauldron, lLimb, lGauntlet);

    const rightArm = new THREE.Group();
    rightArm.position.set(0.96 * s, 2.15 * s, 0);
    const rPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.58 * s, 0.45 * s, 0.58 * s), accentMat);
    const rLimb = new THREE.Mesh(new THREE.BoxGeometry(0.44 * s, 1.32 * s, 0.44 * s), bodyMat);
    rLimb.position.y = -0.62 * s;
    const rGauntlet = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.42 * s, 0.5 * s), accentMat);
    rGauntlet.position.y = -1.1 * s;
    // Boss Great-Weapon held in right hand
    const weapShaft = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.14 * s, 1.85 * s), darkMat);
    weapShaft.position.set(0, -1.15 * s, 0.65 * s);
    const weapBlade = new THREE.Mesh(new THREE.BoxGeometry(0.32 * s, 0.65 * s, 0.95 * s), glowMat);
    weapBlade.position.set(0, -1.15 * s, 1.45 * s);
    rightArm.add(rPauldron, rLimb, rGauntlet, weapShaft, weapBlade);

    // Articulated Boss Legs
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.38 * s, 0.9 * s, 0);
    const lLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 0.9 * s, 0.46 * s), bodyMat);
    lLegMesh.position.y = -0.45 * s;
    const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.52 * s, 0.28 * s, 0.56 * s), accentMat);
    lBoot.position.set(0, -0.76 * s, 0.05 * s);
    leftLeg.add(lLegMesh, lBoot);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.38 * s, 0.9 * s, 0);
    const rLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 0.9 * s, 0.46 * s), bodyMat);
    rLegMesh.position.y = -0.45 * s;
    const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.52 * s, 0.28 * s, 0.56 * s), accentMat);
    rBoot.position.set(0, -0.76 * s, 0.05 * s);
    rightLeg.add(rLegMesh, rBoot);

    rootGroup.add(leftArm, rightArm, leftLeg, rightLeg);

    // Rotating Halo / Cryo / Astral Rings for bosses
    const haloRing1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.38 * s, 0.08 * s, 8, 24),
      accentMat
    );
    haloRing1.position.set(0, 1.95 * s, -0.35 * s);
    rootGroup.add(haloRing1);

    let haloRing2: THREE.Object3D | null = null;
    if (def.tier >= 5) {
      haloRing2 = new THREE.Mesh(
        new THREE.TorusGeometry(1.78 * s, 0.07 * s, 8, 24),
        glowMat
      );
      haloRing2.position.set(0, 1.95 * s, -0.35 * s);
      rootGroup.add(haloRing2);
    }

    return { rootGroup, haloRing1, haloRing2, leftArm, rightArm, leftLeg, rightLeg };
  }
}
