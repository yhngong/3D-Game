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
  extraAnimObj: THREE.Object3D | null;
  secondaryAnimObj: THREE.Object3D | null;
  hpBarFill: THREE.Mesh;
  attackTimer: number;
  hitFlashTimer: number;
  statusPoisonTimer: number;
  statusChillTimer: number;
  statusBurnTimer: number;
  dotTickTimer: number;
}

export interface CentipedeSegment {
  index: number; // 0 = head, 1..7 = trailing segments
  hp: number;
  maxHp: number;
  alive: boolean;
  position: THREE.Vector3;
  yaw: number;
  group: THREE.Group;
  armorMat: THREE.MeshLambertMaterial;
  weakpointMesh: THREE.Mesh;
  leftLegs: THREE.Object3D;
  rightLegs: THREE.Object3D;
}

export interface BossSubNode {
  uid: number;
  kind: 'healing_root' | 'astral_pylon';
  hp: number;
  maxHp: number;
  position: THREE.Vector3;
  orbitAngle: number;
  group: THREE.Group;
}

export interface BossMirrorClone {
  uid: number;
  position: THREE.Vector3;
  orbitAngle: number;
  shootTimer: number;
  group: THREE.Group;
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

  // Unique Boss Special Features
  flightState: 'none' | 'airborne' | 'diving' | 'grounded';
  flightTimer: number;
  orbitAngle: number;
  diveTarget: THREE.Vector3;
  segments: CentipedeSegment[];
  subNodes: BossSubNode[];
  clones: BossMirrorClone[];
  shieldMesh: THREE.Mesh | null;
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

  public update(dt: number, isNightTime = false, isRaining = false): void {
    // Monsters spawn at Night OR during Tempest Rainstorms (at 2x spawn rate & 2x max cap!)
    if (isNightTime || isRaining) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const baseInterval = this.activeBoss ? 6.0 : 2.8;
        this.spawnTimer = isRaining ? baseInterval * 0.5 : baseInterval;
        const maxMonsters = isRaining ? 28 : 14;
        const perWave = isRaining ? 2 : 1;
        for (let w = 0; w < perWave; w++) {
          if (this.monsters.length < maxMonsters) {
            this.spawnBiomeMonsterNearPlayer();
          }
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

  public spawnStormSurgeMonsters(count = 4): void {
    for (let i = 0; i < count; i++) {
      if (this.monsters.length < 28) {
        this.spawnBiomeMonsterNearPlayer();
      }
    }
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
      extraAnimObj: built.extraAnimObj,
      secondaryAnimObj: built.secondaryAnimObj,
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

  private cleanupActiveBoss(): void {
    if (!this.activeBoss) return;
    const b = this.activeBoss;
    this.scene.remove(b.rootGroup);
    for (const seg of b.segments) {
      if (seg.index > 0) {
        this.scene.remove(seg.group);
      }
    }
    for (const node of b.subNodes) {
      this.scene.remove(node.group);
    }
    for (const clone of b.clones) {
      this.scene.remove(clone.group);
    }
    this.activeBoss = null;
  }

  public getBossMechanicStatus(): string {
    const b = this.activeBoss;
    if (!b) return '';
    if (b.def.modelType === 'treant_boss') {
      return b.subNodes.length > 0
        ? `🌿 ${b.subNodes.length} Healing Roots Active — Smash Roots to Break 80% Shield!`
        : '🪓 Bark Shield Down — Vulnerable!';
    }
    if (b.def.modelType === 'frost_boss') {
      if (b.flightState === 'airborne') return '🐉 Airborne Sky-Flight — Raining Glacial Breath!';
      if (b.flightState === 'diving') return '⚡ PREDATOR DIVE-BOMB INCOMING — DODGE!';
      return '❄️ Landed on Ground — Melee Strike Window!';
    }
    if (b.def.modelType === 'molten_boss') {
      const aliveSegs = b.segments.filter((s) => s.alive).length;
      return aliveSegs > 1
        ? `🔥 Segments: ${aliveSegs} / ${b.segments.length} — Anti-Pierce Armor! Hit Glowing Tail!`
        : '💀 FINAL HEAD EXPOSED — Finish Ignis Rex!';
    }
    if (b.def.modelType === 'void_boss') {
      return b.clones.length > 0
        ? `👁️ ${b.clones.length} Mirror Clones Active — Strike the Real Malakor!`
        : '🔮 Illusion Broken — Direct Hits Enabled!';
    }
    if (b.def.modelType === 'astral_boss') {
      return b.subNodes.length > 0
        ? `🛡️ ${b.subNodes.length} Starlight Shield Pylons Orbiting — Shatter Pylons First!`
        : '✨ Astral Barrier Shattered — Vulnerable!';
    }
    return '';
  }

  public summonBoss(bossId: string): boolean {
    const def = BOSSES[bossId];
    if (!def) return false;

    // Remove existing boss & all sub-entities cleanly
    this.cleanupActiveBoss();

    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.player.yaw
    );
    const sx = this.player.position.x + forward.x * 14;
    const sz = this.player.position.z + forward.z * 14;
    const sy =
      this.world.getSurfaceHeight(Math.floor(sx), Math.floor(sz)) +
      (def.modelType === 'frost_boss' ? 10.5 : 2.0);
    const pos = new THREE.Vector3(sx, sy, sz);

    const built = this.buildBossModel(def);
    built.rootGroup.position.copy(pos);
    this.scene.add(built.rootGroup);

    const boss: ActiveBoss = {
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
      flightState: def.modelType === 'frost_boss' ? 'airborne' : 'none',
      flightTimer: def.modelType === 'frost_boss' ? 9.0 : 0,
      orbitAngle: Math.random() * Math.PI * 2,
      diveTarget: pos.clone(),
      segments: [],
      subNodes: [],
      clones: [],
      shieldMesh: built.shieldMesh,
    };

    this.activeBoss = boss;

    // Initialize Boss-specific unique mechanics!
    if (def.modelType === 'molten_boss') {
      // Build 8-segment Magma Centipede (0 = Head, 1..7 = Armored Body/Tail Segments)
      const totalSegments = 8;
      const segHp = Math.round(def.maxHp / totalSegments);
      // Segment 0 is the Head (boss.rootGroup)
      boss.segments.push({
        index: 0,
        hp: segHp,
        maxHp: segHp,
        alive: true,
        position: pos.clone(),
        yaw: 0,
        group: built.rootGroup,
        armorMat: built.primaryBodyMat,
        weakpointMesh: built.headWeakpointMesh,
        leftLegs: built.leftLeg,
        rightLegs: built.rightLeg,
      });
      for (let idx = 1; idx < totalSegments; idx++) {
        const segPos = pos.clone().add(new THREE.Vector3(0, 0, -idx * 2.2));
        segPos.y = this.world.getSurfaceHeight(Math.floor(segPos.x), Math.floor(segPos.z)) + 1.0;
        const segBuilt = this.buildCentipedeSegmentMesh(def, idx === totalSegments - 1);
        segBuilt.group.position.copy(segPos);
        this.scene.add(segBuilt.group);
        boss.segments.push({
          index: idx,
          hp: segHp,
          maxHp: segHp,
          alive: true,
          position: segPos,
          yaw: 0,
          group: segBuilt.group,
          armorMat: segBuilt.armorMat,
          weakpointMesh: segBuilt.weakpointMesh,
          leftLegs: segBuilt.leftLegs,
          rightLegs: segBuilt.rightLegs,
        });
      }
      this.refreshCentipedeWeakpoint(boss);
    } else if (def.modelType === 'astral_boss') {
      this.spawnAstralShieldPylons(boss, 3);
    } else if (def.modelType === 'treant_boss') {
      this.spawnTreantHealingRoots(boss, 3);
    }

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

      // Limb & creature-specific secondary animations
      const nowT = performance.now() * 0.001;
      const walkCycle = nowT * 10 * m.def.speed;
      const isMoving = Math.hypot(m.velocity.x, m.velocity.z) > 0.4;
      const swing = isMoving ? Math.sin(walkCycle) * 0.65 : 0;

      if (m.def.modelType === 'crawler') {
        // Arachnid scuttling legs + pincer snap + bobbing scorpion stinger tail
        m.leftLeg.rotation.z = swing * 0.45;
        m.rightLeg.rotation.z = -swing * 0.45;
        m.leftArm.rotation.y += (Math.sin(nowT * 6 + m.uid) * 0.25 - m.leftArm.rotation.y) * Math.min(1, 8 * dt);
        m.rightArm.rotation.y += (-Math.sin(nowT * 6 + m.uid) * 0.25 - m.rightArm.rotation.y) * Math.min(1, 8 * dt);
        if (m.extraAnimObj) {
          m.extraAnimObj.rotation.x = Math.sin(nowT * 4.5 + m.uid) * 0.18;
        }
      } else if (m.def.modelType === 'sentinel') {
        // Hovering seraph wing pulse + counter-rotating gyroscope rings
        const pulse = Math.sin(nowT * 4 + m.uid) * 0.22;
        m.leftArm.rotation.z = pulse;
        m.rightArm.rotation.z = -pulse;
        if (m.extraAnimObj) {
          m.extraAnimObj.rotation.z += dt * 2.2;
          m.extraAnimObj.rotation.x += dt * 1.1;
        }
        if (m.secondaryAnimObj) {
          m.secondaryAnimObj.rotation.y -= dt * 2.6;
          m.secondaryAnimObj.rotation.z -= dt * 0.9;
        }
      } else {
        m.leftLeg.rotation.x = swing;
        m.rightLeg.rotation.x = -swing;
        m.leftArm.rotation.x += (-swing * 0.6 - m.leftArm.rotation.x) * Math.min(1, 10 * dt);
        m.rightArm.rotation.x += (swing * 0.6 - m.rightArm.rotation.x) * Math.min(1, 10 * dt);

        if (m.extraAnimObj) {
          if (m.def.modelType === 'boar') {
            m.extraAnimObj.rotation.z = Math.sin(nowT * 9) * 0.35;
          } else {
            m.extraAnimObj.rotation.y += dt * 2.6;
            m.extraAnimObj.rotation.z += dt * 1.2;
          }
        }
        if (m.secondaryAnimObj) {
          m.secondaryAnimObj.rotation.x = Math.sin(nowT * 4.5 + m.uid) * 0.2;
        }
      }

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

    const nowSec = performance.now() * 0.001;

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
          // Trigger phase-transition special boss mechanics!
          if (b.def.modelType === 'astral_boss') {
            this.spawnAstralShieldPylons(b, 3 + (pIdx >= 2 ? 1 : 0));
          } else if (b.def.modelType === 'treant_boss') {
            this.spawnTreantHealingRoots(b, 3);
          } else if (b.def.modelType === 'void_boss') {
            this.spawnMalakorMirrorClones(b, 3);
          }
          if (this.onBannerNotification) {
            this.onBannerNotification(
              `${b.def.name}: ${b.def.phases[pIdx].name}`,
              this.getBossMechanicStatus() || 'Boss power intensifies!',
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

    // Toggle protective barrier visual for Treant (Roots) & Aethelgard (Pylons)
    if (b.shieldMesh) {
      b.shieldMesh.visible = b.subNodes.length > 0;
      b.shieldMesh.rotation.y += dt * 1.6;
    }

    // =====================================================
    // UNIQUE MOVEMENT & SPECIAL MECHANICS PER BOSS TYPE
    // =====================================================
    if (b.def.modelType === 'frost_boss') {
      // CRYONAX: True Flying Frost Dragon (Airborne Sky-Circles -> Dive-Bomb -> Grounded Window)
      b.flightTimer -= dt;
      if (b.flightState === 'airborne') {
        b.orbitAngle += dt * 0.78 * phase.speedMult * chillMult;
        const orbitRadius = 12.5;
        const targetX = this.player.position.x + Math.cos(b.orbitAngle) * orbitRadius;
        const targetZ = this.player.position.z + Math.sin(b.orbitAngle) * orbitRadius;
        const surfY = this.world.getSurfaceHeight(Math.floor(targetX), Math.floor(targetZ));
        const targetY = Math.max(this.player.position.y + 8.5, surfY + 9.5) + Math.sin(nowSec * 2.6) * 1.1;

        const moveX = targetX - b.position.x;
        const moveZ = targetZ - b.position.z;
        b.position.x += moveX * Math.min(1, 3.2 * dt);
        b.position.z += moveZ * Math.min(1, 3.2 * dt);
        b.position.y += (targetY - b.position.y) * Math.min(1, 4.0 * dt);
        b.yaw = Math.atan2(dx, dz);

        // Giant crystal dragon wing flap
        const flap = Math.sin(nowSec * 7.5) * 0.62;
        b.leftArm.rotation.z = flap;
        b.rightArm.rotation.z = -flap;
        b.rootGroup.rotation.x = 0.12;

        if (b.flightTimer <= 0) {
          b.flightState = 'diving';
          b.flightTimer = 1.7;
          const diveSurf = this.world.getSurfaceHeight(
            Math.floor(this.player.position.x),
            Math.floor(this.player.position.z)
          );
          b.diveTarget.set(this.player.position.x, diveSurf + 1.2, this.player.position.z);
          sound.playBossRoar();
          if (this.onBannerNotification) {
            this.onBannerNotification('🐉 CRYONAX DIVE-BOMBS!', 'Use [Q] Dash to evade the aerial slam!', '#38bdf8');
          }
        }
      } else if (b.flightState === 'diving') {
        const toDive = b.diveTarget.clone().sub(b.position);
        const diveDist = toDive.length();
        const diveSpd = 27 * chillMult;
        if (diveDist > 1.8 && b.flightTimer > 0) {
          toDive.normalize();
          b.position.addScaledVector(toDive, diveSpd * dt);
          b.yaw = Math.atan2(toDive.x, toDive.z);
          b.rootGroup.rotation.x = 0.55;
          b.leftArm.rotation.z = -0.55;
          b.rightArm.rotation.z = 0.55;
        } else {
          // Impact slam!
          b.flightState = 'grounded';
          b.flightTimer = 6.2;
          b.rootGroup.rotation.x = 0;
          this.spawnShockwave(b.position, 11.0, '#38bdf8');
          this.spawnParticles(b.position.clone().add(new THREE.Vector3(0, 1.5, 0)), '#e0f2fe', 34, 8);
          sound.playExplosion();
          if (this.player.position.distanceTo(b.position) <= 9.5) {
            this.player.takeDamage(Math.round(b.def.damage * 1.25));
            this.player.velocity.y = 9.0;
          }
        }
      } else {
        // Grounded Dragon phase (melee punish window!)
        b.rootGroup.rotation.x = 0;
        if (dist > 0.1) {
          b.yaw = Math.atan2(dx, dz);
          const spd = b.def.speed * phase.speedMult * chillMult * 0.85;
          b.velocity.x = dist > 3.0 ? (dx / dist) * spd : b.velocity.x * 0.8;
          b.velocity.z = dist > 3.0 ? (dz / dist) * spd : b.velocity.z * 0.8;
        }
        b.onGround = this.moveEntityWithAutoJump(b.position, b.velocity, b.onGround, 1.6, 4.2, dt);
        const groundFlap = Math.sin(nowSec * 3.5) * 0.2;
        b.leftArm.rotation.z = groundFlap;
        b.rightArm.rotation.z = -groundFlap;

        if (b.flightTimer <= 0) {
          b.flightState = 'airborne';
          b.flightTimer = 8.5;
          b.velocity.y = 14;
          sound.playBossRoar();
          this.spawnShockwave(b.position, 8.0, '#38bdf8');
        }
      }
    } else if (b.def.modelType === 'molten_boss') {
      // IGNIS REX: 8-Segment Slithering Magma Centipede
      const aliveCount = b.segments.filter((s) => s.alive).length;
      const lostSegBoost = 1 + (b.segments.length - aliveCount) * 0.1;
      const baseAngle = Math.atan2(dx, dz);
      // Serpentine S-curve weave so its multi-segment body coils across the terrain
      const weave = dist > 4.5 ? Math.sin(nowSec * 3.6) * 0.58 : Math.sin(nowSec * 4.5) * 0.25;
      b.yaw = baseAngle + weave;
      const spd = b.def.speed * phase.speedMult * lostSegBoost * chillMult;
      b.velocity.x = Math.sin(b.yaw) * spd;
      b.velocity.z = Math.cos(b.yaw) * spd;

      b.onGround = this.moveEntityWithAutoJump(b.position, b.velocity, b.onGround, 1.35, 3.2, dt);

      // Update Head (segment 0) & follow-the-leader chain for segments 1..7
      if (b.segments.length > 0) {
        b.segments[0].position.copy(b.position);
        b.segments[0].yaw = b.yaw;
        let prevPos = b.position;
        const segSpacing = 2.15;

        for (let sIdx = 1; sIdx < b.segments.length; sIdx++) {
          const seg = b.segments[sIdx];
          if (!seg.alive) continue;
          const diffX = seg.position.x - prevPos.x;
          const diffZ = seg.position.z - prevPos.z;
          const segDist = Math.hypot(diffX, diffZ) || 0.001;
          seg.position.x = prevPos.x + (diffX / segDist) * segSpacing;
          seg.position.z = prevPos.z + (diffZ / segDist) * segSpacing;
          const targetGroundY =
            this.world.getSurfaceHeight(Math.floor(seg.position.x), Math.floor(seg.position.z)) + 1.05;
          seg.position.y += (targetGroundY - seg.position.y) * Math.min(1, 12 * dt);
          seg.yaw = Math.atan2(prevPos.x - seg.position.x, prevPos.z - seg.position.z);

          seg.group.position.copy(seg.position);
          seg.group.rotation.y = seg.yaw;

          // Chittering centipede magma legs
          const legWave = Math.sin(nowSec * 14 + sIdx * 1.1) * 0.45;
          seg.leftLegs.rotation.z = legWave;
          seg.rightLegs.rotation.z = -legWave;
          seg.weakpointMesh.rotation.y += dt * 4.5;
          const pulse = 1.0 + Math.sin(nowSec * 9) * 0.18;
          seg.weakpointMesh.scale.setScalar(pulse);

          // Segment contact damage
          if (this.player.position.distanceTo(seg.position) < 2.35) {
            this.player.takeDamage(Math.round(b.def.damage * 0.75));
          }
          prevPos = seg.position;
        }
      }
      // Snapping mandibles on centipede head
      const snap = Math.sin(nowSec * 10) * 0.35;
      b.leftArm.rotation.y = snap;
      b.rightArm.rotation.y = -snap;
    } else if (b.def.modelType === 'void_boss' || b.def.modelType === 'astral_boss') {
      // MALAKOR (Void Illusionist) & AETHELGARD (Six-Winged Astral Seraph)
      if (dist > 0.1) {
        b.yaw = Math.atan2(dx, dz);
        const desiredDist = b.def.modelType === 'astral_boss' ? 4.2 : 3.2;
        if (dist > desiredDist) {
          const spd = b.def.speed * phase.speedMult * chillMult;
          b.velocity.x = (dx / dist) * spd;
          b.velocity.z = (dz / dist) * spd;
        } else {
          b.velocity.x *= 0.82;
          b.velocity.z *= 0.82;
        }
      }
      b.position.x += b.velocity.x * dt;
      b.position.z += b.velocity.z * dt;
      const groundY = this.world.getSurfaceHeight(Math.floor(b.position.x), Math.floor(b.position.z)) + 1;
      const floatOffset = (b.def.modelType === 'astral_boss' ? 2.9 : 2.2) + Math.sin(nowSec * 3.0) * 0.65;
      b.position.y += (groundY + floatOffset - b.position.y) * Math.min(1, 8 * dt);

      // Update Malakor's Mirror Clones
      if (b.clones.length > 0) {
        for (const clone of b.clones) {
          clone.orbitAngle += dt * 0.95;
          const cx = this.player.position.x + Math.cos(clone.orbitAngle) * 9.5;
          const cz = this.player.position.z + Math.sin(clone.orbitAngle) * 9.5;
          const cy = this.world.getSurfaceHeight(Math.floor(cx), Math.floor(cz)) + 3.0 + Math.sin(nowSec * 3 + clone.uid) * 0.5;
          clone.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, 6 * dt));
          clone.group.position.copy(clone.position);
          clone.group.rotation.y = Math.atan2(
            this.player.position.x - clone.position.x,
            this.player.position.z - clone.position.z
          );
          clone.shootTimer -= dt;
          if (clone.shootTimer <= 0) {
            clone.shootTimer = 2.3;
            const shotOrigin = clone.position.clone().add(new THREE.Vector3(0, 1.8, 0));
            const shotDir = this.player.position
              .clone()
              .add(new THREE.Vector3(0, 1.0, 0))
              .sub(shotOrigin)
              .normalize();
            this.spawnProjectile({
              position: shotOrigin,
              velocity: shotDir.multiplyScalar(19),
              fromPlayer: false,
              damage: Math.round(b.def.damage * 0.45),
              radius: 0.34,
              color: '#c084fc',
              maxLife: 3.0,
              gravity: 0,
            });
          }
        }
      }

      // Update Aethelgard's Orbiting 3D Starlight Shield Pylons
      if (b.def.modelType === 'astral_boss' && b.subNodes.length > 0) {
        for (const node of b.subNodes) {
          node.orbitAngle += dt * (1.25 + b.phaseIndex * 0.25);
          const r = 6.2;
          node.position.set(
            b.position.x + Math.cos(node.orbitAngle) * r,
            b.position.y + 2.2 + Math.sin(nowSec * 4 + node.uid) * 0.55,
            b.position.z + Math.sin(node.orbitAngle) * r
          );
          node.group.position.copy(node.position);
          node.group.rotation.y += dt * 3.0;
          if (Math.random() < dt * 4) {
            this.spawnParticles(node.position, '#fde047', 1, 1.5);
          }
        }
      }
    } else {
      // SYLVAN BEHEMOTH (Root-Tether Treant)
      if (dist > 0.1) {
        b.yaw = Math.atan2(dx, dz);
        if (dist > 2.8) {
          const spd = b.def.speed * phase.speedMult * chillMult;
          b.velocity.x = (dx / dist) * spd;
          b.velocity.z = (dz / dist) * spd;
        } else {
          b.velocity.x *= 0.82;
          b.velocity.z *= 0.82;
        }
      }
      b.onGround = this.moveEntityWithAutoJump(
        b.position,
        b.velocity,
        b.onGround,
        0.75 * b.def.scale,
        2.6 * b.def.scale,
        dt
      );

      // Living Heart-Roots heal Sylvan Behemoth & pulse emerald particles!
      if (b.subNodes.length > 0) {
        b.hp = Math.min(b.maxHp, b.hp + b.subNodes.length * 16 * dt);
        for (const root of b.subNodes) {
          root.group.rotation.y += dt * 2.0;
          if (Math.random() < dt * 3.5) {
            this.spawnParticles(root.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#4ade80', 2, 2.5);
          }
        }
      }

      // Treant walk limb animation
      const walkCycle = nowSec * 8 * b.def.speed;
      const isMoving = Math.hypot(b.velocity.x, b.velocity.z) > 0.35;
      const legSwing = isMoving ? Math.sin(walkCycle) * 0.45 : 0;
      b.leftLeg.rotation.x = legSwing;
      b.rightLeg.rotation.x = -legSwing;
      b.leftArm.rotation.x += (-legSwing * 0.45 - b.leftArm.rotation.x) * Math.min(1, 8 * dt);
      b.rightArm.rotation.x += (legSwing * 0.45 - b.rightArm.rotation.x) * Math.min(1, 8 * dt);
    }

    b.rootGroup.position.copy(b.position);
    b.rootGroup.rotation.y = b.yaw;

    // Rotate boss halo rings if present
    if (b.haloRing1) {
      b.haloRing1.rotation.z += dt * 1.6;
      b.haloRing1.rotation.x += dt * 0.9;
    }
    if (b.haloRing2) {
      b.haloRing2.rotation.y -= dt * 2.1;
      b.haloRing2.rotation.z -= dt * 0.8;
    }

    // Contact melee damage if very close
    if (dist < 3.6 && Math.abs(this.player.position.y - b.position.y) < 4.2) {
      this.player.takeDamage(Math.round(b.def.damage * 0.85));
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
      case 'void_lance_barrage':
      case 'starlight_lance': {
        const isLast3 = attack === 'magma_volley' || attack === 'void_lance_barrage' || attack === 'starlight_lance';
        const isFinal2 = attack === 'void_lance_barrage' || attack === 'starlight_lance';
        const count =
          attack === 'starlight_lance'
            ? 9
            : attack === 'void_lance_barrage'
              ? 7
              : attack === 'magma_volley'
                ? 7
                : 5;
        const spread = isFinal2 ? 0.13 : isLast3 ? 0.15 : 0.18;
        const projSpeed =
          attack === 'starlight_lance'
            ? 29
            : attack === 'void_lance_barrage'
              ? 26
              : attack === 'magma_volley'
                ? 22
                : 18;
        const centerIdx = Math.floor(count / 2);
        for (let i = 0; i < count; i++) {
          const offsetAngle = (i - (count - 1) / 2) * spread;
          const dir = toPlayer.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), offsetAngle);
          this.spawnProjectile({
            position: center.clone(),
            velocity: dir.multiplyScalar(projSpeed),
            fromPlayer: false,
            damage: b.def.damage,
            radius: isFinal2 ? 0.46 : isLast3 ? 0.42 : 0.35,
            color: b.def.glowColor,
            maxLife: 3.6,
            gravity: attack === 'magma_volley' ? 2.8 : 0,
            homing: isFinal2 && i === centerIdx,
            explosiveRadius:
              attack === 'magma_volley' ? 3.4 : attack === 'starlight_lance' ? 2.8 : undefined,
          });
        }
        sound.playMagicCast(0.7);
        break;
      }

      case 'root_slam':
      case 'frost_nova':
      case 'lava_shockwave':
      case 'cosmic_nova': {
        const radius =
          attack === 'cosmic_nova'
            ? 13.5
            : attack === 'lava_shockwave'
              ? 11.5
              : 9.5;
        this.spawnShockwave(b.position, radius, b.def.accentColor);
        sound.playExplosion();
        if (this.player.position.distanceTo(b.position) <= radius) {
          this.player.takeDamage(Math.round(b.def.damage * 1.1));
          this.player.velocity.y = 9.0;
        }
        // Ignis Rex's lava_shockwave also erupts radial magma fireballs!
        if (attack === 'lava_shockwave') {
          for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2;
            const dir = new THREE.Vector3(Math.cos(angle), 0.12, Math.sin(angle)).normalize();
            this.spawnProjectile({
              position: center.clone(),
              velocity: dir.multiplyScalar(19),
              fromPlayer: false,
              damage: Math.round(b.def.damage * 0.9),
              radius: 0.4,
              color: b.def.accentColor,
              maxLife: 3.0,
              gravity: 3.2,
              explosiveRadius: 2.5,
            });
          }
        }
        break;
      }

      case 'gravity_crush': {
        // Pulls player violently toward the boss and detonates an abyssal shockwave + ring of orbs!
        const radius = 16.0;
        this.spawnShockwave(b.position, radius, b.def.glowColor);
        this.spawnParticles(center, b.def.accentColor, 32, 8);
        sound.playExplosion();
        const pullDir = b.position.clone().sub(this.player.position).normalize();
        this.player.velocity.x += pullDir.x * 18;
        this.player.velocity.z += pullDir.z * 18;
        this.player.velocity.y = 6.5;
        if (this.player.position.distanceTo(b.position) <= 12.0) {
          this.player.takeDamage(Math.round(b.def.damage * 1.15));
        }
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize();
          this.spawnProjectile({
            position: center.clone(),
            velocity: dir.multiplyScalar(21),
            fromPlayer: false,
            damage: b.def.damage,
            radius: 0.42,
            color: b.def.accentColor,
            maxLife: 3.2,
            gravity: 0,
          });
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

      case 'summon_crawlers': {
        const crawlerDef = MONSTERS.find((m) => m.id === 'crystal_crawler') || MONSTERS[0];
        if (this.monsters.length < 11) {
          for (const side of [-1, 1]) {
            this.spawnMonster(
              crawlerDef,
              b.position.clone().add(new THREE.Vector3(side * 3.5, 1, 2.5))
            );
          }
        }
        sound.playMagicCast(0.4);
        break;
      }

      case 'summon_magma_brutes': {
        const bruteDef = MONSTERS.find((m) => m.id === 'magma_brute') || MONSTERS[0];
        if (this.monsters.length < 12) {
          for (const side of [-1, 1]) {
            this.spawnMonster(
              bruteDef,
              b.position.clone().add(new THREE.Vector3(side * 4, 1.5, 3))
            );
          }
        }
        sound.playMagicCast(0.6);
        break;
      }

      case 'summon_void_reavers': {
        const reaverDef = MONSTERS.find((m) => m.id === 'void_reaver') || MONSTERS[0];
        if (this.monsters.length < 12) {
          for (const side of [-1, 1]) {
            this.spawnMonster(
              reaverDef,
              b.position.clone().add(new THREE.Vector3(side * 4, 1.5, 3))
            );
          }
        }
        sound.playMagicCast(0.5);
        break;
      }

      case 'summon_sentinels': {
        const sentinelDef = MONSTERS.find((m) => m.id === 'astral_sentinel') || MONSTERS[0];
        if (this.monsters.length < 14) {
          for (const side of [-1, 1]) {
            this.spawnMonster(
              sentinelDef,
              b.position.clone().add(new THREE.Vector3(side * 5, 2.5, -2))
            );
          }
        }
        sound.playMagicCast(1.3);
        break;
      }

      case 'blizzard_spiral':
      case 'void_spiral':
      case 'singularity_burst':
      case 'supernova_cataclysm': {
        const isSuper = attack === 'supernova_cataclysm' || attack === 'singularity_burst';
        const bolts = attack === 'supernova_cataclysm' ? 18 : attack === 'singularity_burst' ? 14 : 10;
        const speed = isSuper ? 22 : 15;
        for (let i = 0; i < bolts; i++) {
          const angle = (i / bolts) * Math.PI * 2 + performance.now() * 0.002;
          const dir = new THREE.Vector3(Math.cos(angle), -0.04, Math.sin(angle)).normalize();
          this.spawnProjectile({
            position: center.clone(),
            velocity: dir.multiplyScalar(speed),
            fromPlayer: false,
            damage: b.def.damage,
            radius: isSuper ? 0.45 : 0.38,
            color: b.def.glowColor,
            maxLife: 3.5,
            gravity: 0,
          });
        }
        // Extra aimed burst directly at player for the last 2 bosses!
        if (isSuper) {
          for (let j = -1; j <= 1; j++) {
            const aimed = toPlayer.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), j * 0.12);
            this.spawnProjectile({
              position: center.clone(),
              velocity: aimed.multiplyScalar(26),
              fromPlayer: false,
              damage: Math.round(b.def.damage * 1.1),
              radius: 0.48,
              color: b.def.accentColor,
              maxLife: 3.2,
              gravity: 0,
              explosiveRadius: 3.2,
            });
          }
        }
        sound.playMagicCast(1.2);
        break;
      }

      case 'meteor_rain': {
        const count = b.def.tier >= 6 ? 9 : b.def.tier >= 4 ? 7 : 4;
        for (let i = 0; i < count; i++) {
          const skyPos = this.player.position
            .clone()
            .add(new THREE.Vector3((Math.random() - 0.5) * 10, 14 + i * 1.4, (Math.random() - 0.5) * 10));
          this.spawnProjectile({
            position: skyPos,
            velocity: new THREE.Vector3((Math.random() - 0.5) * 3, -24, (Math.random() - 0.5) * 3),
            fromPlayer: false,
            damage: Math.round(b.def.damage * 1.05),
            radius: 0.65,
            color: b.def.accentColor,
            maxLife: 2.5,
            gravity: 5.5,
            explosiveRadius: 4.5,
          });
        }
        sound.playExplosion();
        break;
      }

      case 'rift_teleport': {
        this.spawnParticles(center, b.def.glowColor, 24, 6);
        const angle = Math.random() * Math.PI * 2;
        const dist = b.def.tier >= 5 ? 6.5 : 9;
        b.position.x = this.player.position.x + Math.cos(angle) * dist;
        b.position.z = this.player.position.z + Math.sin(angle) * dist;
        b.position.y = this.world.getSurfaceHeight(Math.floor(b.position.x), Math.floor(b.position.z)) + 2;
        this.spawnParticles(b.position, b.def.glowColor, 24, 6);
        // Ambush slash right after teleporting for the last 2 bosses!
        if (b.def.tier >= 5) {
          const ambushDir = this.player.position
            .clone()
            .add(new THREE.Vector3(0, 1.0, 0))
            .sub(b.position.clone().add(new THREE.Vector3(0, 2.0, 0)))
            .normalize();
          for (let k = -1; k <= 1; k++) {
            const shotDir = ambushDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), k * 0.16);
            this.spawnProjectile({
              position: b.position.clone().add(new THREE.Vector3(0, 2.0, 0)),
              velocity: shotDir.multiplyScalar(25),
              fromPlayer: false,
              damage: b.def.damage,
              radius: 0.42,
              color: b.def.glowColor,
              maxLife: 3.0,
              gravity: 0,
            });
          }
        }
        break;
      }

      case 'plant_healing_roots': {
        if (b.subNodes.length === 0) {
          this.spawnTreantHealingRoots(b, 3);
          if (this.onBannerNotification) {
            this.onBannerNotification(
              '🌿 LIVING HEART-ROOTS SPROUTED!',
              'Destroy the glowing emerald roots to break Sylvan Behemoth’s 80% Bark Shield!',
              '#4ade80'
            );
          }
        } else {
          this.spawnShockwave(b.position, 9.5, '#10b981');
          if (this.player.position.distanceTo(b.position) <= 9.5) {
            this.player.takeDamage(b.def.damage);
          }
        }
        break;
      }

      case 'mirror_clones': {
        if (b.clones.length === 0) {
          this.spawnMalakorMirrorClones(b, 3);
          if (this.onBannerNotification) {
            this.onBannerNotification(
              '👁️ MALAKOR SPLITS INTO MIRROR CLONES!',
              'Fake illusions shatter in 1 hit — strike the TRUE Malakor to dispel them!',
              '#c084fc'
            );
          }
        } else {
          this.executeBossAttack(b, 'void_lance_barrage');
        }
        break;
      }

      case 'antigrav_pulse': {
        this.spawnShockwave(this.player.position, 12.0, '#38bdf8');
        this.spawnParticles(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), '#fde047', 28, 7);
        sound.playMagicCast(1.5);
        this.player.velocity.y = 14.5;
        this.player.onGround = false;
        for (let i = 0; i < 7; i++) {
          const offsetAngle = (i - 3) * 0.14;
          const dir = toPlayer.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), offsetAngle);
          this.spawnProjectile({
            position: center.clone(),
            velocity: dir.multiplyScalar(25),
            fromPlayer: false,
            damage: b.def.damage,
            radius: 0.42,
            color: '#38bdf8',
            maxLife: 3.4,
            gravity: 0,
          });
        }
        break;
      }
    }
  }

  private spawnTreantHealingRoots(b: ActiveBoss, count: number): void {
    for (const n of b.subNodes) this.scene.remove(n.group);
    b.subNodes.length = 0;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const rx = b.position.x + Math.cos(angle) * 7.5;
      const rz = b.position.z + Math.sin(angle) * 7.5;
      const ry = this.world.getSurfaceHeight(Math.floor(rx), Math.floor(rz)) + 1.0;
      const pos = new THREE.Vector3(rx, ry, rz);

      const group = new THREE.Group();
      const barkMat = new THREE.MeshLambertMaterial({ color: '#3f2e1e' });
      const gemMat = new THREE.MeshBasicMaterial({ color: '#4ade80' });
      const base = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.5, 5), barkMat);
      base.position.y = 0.75;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), gemMat);
      crystal.position.y = 1.85;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.08, 6, 16), gemMat);
      ring.position.y = 1.85;
      ring.rotation.x = Math.PI / 2;
      group.add(base, crystal, ring);
      group.position.copy(pos);
      this.scene.add(group);

      b.subNodes.push({
        uid: this.nextUid++,
        kind: 'healing_root',
        hp: 140,
        maxHp: 140,
        position: pos,
        orbitAngle: angle,
        group,
      });
      this.spawnParticles(pos.clone().add(new THREE.Vector3(0, 1.5, 0)), '#4ade80', 16, 4);
    }
    sound.playMagicCast(0.6);
  }

  private spawnAstralShieldPylons(b: ActiveBoss, count: number): void {
    for (const n of b.subNodes) this.scene.remove(n.group);
    b.subNodes.length = 0;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const pos = b.position.clone().add(new THREE.Vector3(Math.cos(angle) * 6.2, 2.2, Math.sin(angle) * 6.2));

      const group = new THREE.Group();
      const goldMat = new THREE.MeshLambertMaterial({
        color: '#fde047',
        emissive: '#f59e0b',
        emissiveIntensity: 0.5,
      });
      const cyanMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
      const obelisk = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), cyanMat);
      obelisk.scale.set(0.8, 1.7, 0.8);
      const cage = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.09, 6, 16), goldMat);
      group.add(obelisk, cage);
      group.position.copy(pos);
      this.scene.add(group);

      b.subNodes.push({
        uid: this.nextUid++,
        kind: 'astral_pylon',
        hp: 620,
        maxHp: 620,
        position: pos,
        orbitAngle: angle,
        group,
      });
      this.spawnParticles(pos, '#fde047', 18, 5);
    }
    sound.playMagicCast(1.4);
  }

  private spawnMalakorMirrorClones(b: ActiveBoss, cloneCount: number): void {
    for (const c of b.clones) this.scene.remove(c.group);
    b.clones.length = 0;

    const totalSpots = cloneCount + 1;
    const realSpot = Math.floor(Math.random() * totalSpots);
    const baseAngle = Math.random() * Math.PI * 2;

    for (let i = 0; i < totalSpots; i++) {
      const angle = baseAngle + (i / totalSpots) * Math.PI * 2;
      const px = this.player.position.x + Math.cos(angle) * 9.5;
      const pz = this.player.position.z + Math.sin(angle) * 9.5;
      const py = this.world.getSurfaceHeight(Math.floor(px), Math.floor(pz)) + 3.0;
      const spotPos = new THREE.Vector3(px, py, pz);
      this.spawnParticles(spotPos, '#c084fc', 20, 5);

      if (i === realSpot) {
        b.position.copy(spotPos);
      } else {
        const cloneModel = this.buildBossModel(b.def);
        cloneModel.rootGroup.position.copy(spotPos);
        this.scene.add(cloneModel.rootGroup);
        b.clones.push({
          uid: this.nextUid++,
          position: spotPos,
          orbitAngle: angle,
          shootTimer: 1.0 + i * 0.55,
          group: cloneModel.rootGroup,
        });
      }
    }
    sound.playMagicCast(0.8);
  }

  private getVulnerableCentipedeSegment(b: ActiveBoss): CentipedeSegment | null {
    for (let idx = b.segments.length - 1; idx >= 0; idx--) {
      if (b.segments[idx].alive) return b.segments[idx];
    }
    return null;
  }

  private refreshCentipedeWeakpoint(b: ActiveBoss): void {
    const vuln = this.getVulnerableCentipedeSegment(b);
    for (const seg of b.segments) {
      if (!seg.alive) continue;
      const isVuln = vuln !== null && seg.index === vuln.index;
      seg.weakpointMesh.visible = isVuln;
      if (isVuln) {
        seg.armorMat.color.set('#ea580c');
        seg.armorMat.emissive.set('#f97316');
        seg.armorMat.emissiveIntensity = 0.55;
      } else {
        seg.armorMat.color.set('#290f02');
        seg.armorMat.emissive.set('#451a03');
        seg.armorMat.emissiveIntensity = 0.15;
      }
    }
  }

  private damageCentipedeSegment(
    b: ActiveBoss,
    hitSeg: CentipedeSegment,
    amount: number,
    color: string,
    isCrit: boolean
  ): void {
    const vuln = this.getVulnerableCentipedeSegment(b);
    if (!vuln) return;

    if (hitSeg.index !== vuln.index) {
      // Impervious obsidian carapace on non-vulnerable segments!
      sound.playBlockHit(1.5);
      this.spawnParticles(hitSeg.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#94a3b8', 8, 4);
      if (this.onDamageNumber) {
        this.onDamageNumber(hitSeg.position.clone().add(new THREE.Vector3(0, 2.2, 0)), 1, '#94a3b8', false);
      }
      return;
    }

    // Full damage to the single exposed tail/head segment (excess damage NEVER spills into next segment!)
    vuln.hp = Math.max(0, vuln.hp - amount);
    sound.playMonsterHit();
    if (this.onDamageNumber) {
      this.onDamageNumber(vuln.position.clone().add(new THREE.Vector3(0, 2.4, 0)), amount, color, isCrit);
    }
    this.spawnParticles(vuln.position.clone().add(new THREE.Vector3(0, 1.3, 0)), '#fef08a', 10, 4.5);

    if (vuln.hp <= 0) {
      if (vuln.index > 0) {
        vuln.alive = false;
        this.scene.remove(vuln.group);
        sound.playExplosion();
        this.spawnShockwave(vuln.position, 6.5, '#f97316');
        this.spawnParticles(vuln.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#fb923c', 32, 7);
        for (let f = 0; f < 5; f++) {
          const a = (f / 5) * Math.PI * 2;
          this.spawnProjectile({
            position: vuln.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
            velocity: new THREE.Vector3(Math.cos(a) * 14, 5, Math.sin(a) * 14),
            fromPlayer: false,
            damage: Math.round(b.def.damage * 0.8),
            radius: 0.36,
            color: '#f97316',
            maxLife: 2.5,
            gravity: 6.0,
            explosiveRadius: 2.4,
          });
        }
        this.refreshCentipedeWeakpoint(b);
        const remaining = b.segments.filter((s) => s.alive).length;
        b.hp = b.segments.reduce((sum, s) => sum + (s.alive ? s.hp : 0), 0);
        if (this.onBannerNotification) {
          this.onBannerNotification(
            `🔥 SEGMENT SEVERED! (${remaining} / ${b.segments.length} LEFT)`,
            remaining === 1
              ? 'Only Ignis Rex’s Armored Head remains — finish it!'
              : 'Next tail segment exposed! Keep striking the glowing segment!',
            '#f97316'
          );
        }
        return;
      } else {
        b.hp = 0;
        this.handleBossDeath(b);
        return;
      }
    }

    b.hp = b.segments.reduce((sum, s) => sum + (s.alive ? s.hp : 0), 0);
  }

  private damageBossSubNode(b: ActiveBoss, nodeIdx: number, amount: number, isCrit: boolean): void {
    const node = b.subNodes[nodeIdx];
    if (!node) return;
    node.hp -= amount;
    sound.playMonsterHit();
    if (this.onDamageNumber) {
      this.onDamageNumber(node.position.clone().add(new THREE.Vector3(0, 1.8, 0)), amount, '#fde047', isCrit);
    }
    this.spawnParticles(node.position.clone().add(new THREE.Vector3(0, 1.0, 0)), b.def.glowColor, 10, 4);

    if (node.hp <= 0) {
      this.scene.remove(node.group);
      b.subNodes.splice(nodeIdx, 1);
      sound.playExplosion();
      this.spawnShockwave(node.position, 5.5, b.def.glowColor);
      if (b.subNodes.length === 0 && this.onBannerNotification) {
        this.onBannerNotification(
          b.def.modelType === 'astral_boss' ? '✨ ASTRAL SHIELD SHATTERED!' : '🌿 BARK SHIELD BROKEN!',
          `${b.def.name} is now exposed to 100% full damage!`,
          b.def.glowColor
        );
      }
    }
  }

  public performPlayerMeleeAttack(item: typeof ITEMS[string]): void {
    const reach = item.reach || 4.5;
    const { multiplier: powerMult, isMaxPower } = this.player.consumeWeaponPower();
    const baseDmg = Math.max(1, Math.round((item.damage || 10) * this.player.getDamageMultiplier() * powerMult));
    const camPos = new THREE.Vector3(
      this.player.position.x,
      this.player.position.y + this.player.eyeHeight,
      this.player.position.z
    );
    const camDir = new THREE.Vector3();
    this.player.camera.getWorldDirection(camDir);

    sound.playSwordSwing(isMaxPower || item.iconShape === 'greatsword' || item.iconShape === 'hammer');

    if (isMaxPower) {
      const slashPos = camPos.clone().add(camDir.clone().multiplyScalar(1.8));
      this.spawnParticles(slashPos, item.primaryColor || '#fde047', 10, 4.5);
    }

    // Starforged Zenith Blade fires a piercing crescent projectile on swings (scaled by power bar!)
    if (item.id === 'starforged_cleaver') {
      this.spawnProjectile({
        position: camPos.clone().add(camDir.clone().multiplyScalar(1.0)),
        velocity: camDir.clone().multiplyScalar(28),
        fromPlayer: true,
        damage: Math.max(1, Math.round(baseDmg * 0.45)),
        radius: isMaxPower ? 0.65 : 0.45,
        color: isMaxPower ? '#fde047' : '#38bdf8',
        maxLife: 1.8,
        gravity: 0,
        piercing: true,
        statusEffect: 'astral_mark',
      });
    }

    const dmgColor = isMaxPower ? '#fde047' : powerMult < 0.5 ? '#94a3b8' : '#ffffff';

    // Check hit against monsters within reach cone
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      const mobCenter = m.position.clone().add(new THREE.Vector3(0, 1.0 * m.def.scale, 0));
      const toMob = mobCenter.clone().sub(camPos);
      const dist = toMob.length();
      if (dist <= reach + 0.8) {
        const dot = toMob.normalize().dot(camDir);
        if (dot > 0.45 || dist < 2.2) {
          const isCrit = powerMult >= 0.8 && Math.random() < (item.critChance || 0.1);
          const dmg = Math.max(1, Math.round(baseDmg * (isCrit ? 1.5 : 1.0)));
          if (powerMult >= 0.5) {
            this.applyStatusToEntity(m, item.statusEffect);
          }
          this.damageMonster(m, dmg, isCrit || isMaxPower ? '#fde047' : dmgColor, isCrit || isMaxPower);
          // Knockback scaled by power bar
          const kb = (item.knockback || 5) * Math.min(1.35, Math.max(0.35, powerMult));
          m.velocity.x += camDir.x * kb;
          m.velocity.z += camDir.z * kb;
          m.position.y += 0.25;
        }
      }
    }

    // Check hit against Active Boss & Boss Special Sub-Entities (Roots, Pylons, Clones, Centipede Segments!)
    if (this.activeBoss) {
      const b = this.activeBoss;
      const isCrit = powerMult >= 0.8 && Math.random() < (item.critChance || 0.1);
      const dmg = Math.max(1, Math.round(baseDmg * (isCrit ? 1.5 : 1.0)));

      // 1. Check Boss Sub-Nodes (Treant Healing Roots / Aethelgard Shield Pylons)
      for (let nIdx = b.subNodes.length - 1; nIdx >= 0; nIdx--) {
        const node = b.subNodes[nIdx];
        const nodeCenter = node.position.clone().add(new THREE.Vector3(0, 1.0, 0));
        const toNode = nodeCenter.clone().sub(camPos);
        const nDist = toNode.length();
        if (nDist <= reach + 1.8 && (toNode.normalize().dot(camDir) > 0.35 || nDist < 2.8)) {
          this.damageBossSubNode(b, nIdx, dmg, isCrit || isMaxPower);
          return;
        }
      }

      // 2. Check Malakor's Mirror Clones (1 hit shatters a fake clone!)
      for (let cIdx = b.clones.length - 1; cIdx >= 0; cIdx--) {
        const clone = b.clones[cIdx];
        const cloneCenter = clone.position.clone().add(new THREE.Vector3(0, 1.8, 0));
        const toClone = cloneCenter.clone().sub(camPos);
        const cDist = toClone.length();
        if (cDist <= reach + 2.2 && (toClone.normalize().dot(camDir) > 0.35 || cDist < 3.2)) {
          sound.playMagicCast(0.5);
          this.spawnParticles(cloneCenter, '#c084fc', 28, 6);
          if (this.onDamageNumber) {
            this.onDamageNumber(cloneCenter, 0, '#c084fc', false);
          }
          this.scene.remove(clone.group);
          b.clones.splice(cIdx, 1);
          return;
        }
      }

      // 3. Check Ignis Rex's 8 Centipede Segments (prioritize vulnerable tail segment if in swing cone!)
      if (b.def.modelType === 'molten_boss' && b.segments.length > 0) {
        const vuln = this.getVulnerableCentipedeSegment(b);
        if (vuln) {
          const vCenter = vuln.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          const toVuln = vCenter.clone().sub(camPos);
          const vDist = toVuln.length();
          if (vDist <= reach + 2.4 && (toVuln.normalize().dot(camDir) > 0.3 || vDist < 3.4)) {
            if (powerMult >= 0.5) this.applyStatusToEntity(b, item.statusEffect);
            this.damageCentipedeSegment(b, vuln, dmg, isCrit || isMaxPower ? '#fde047' : dmgColor, isCrit || isMaxPower);
            return;
          }
        }
        // Otherwise check if swinging at an armored middle/head segment
        for (const seg of b.segments) {
          if (!seg.alive) continue;
          const sCenter = seg.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          const toSeg = sCenter.clone().sub(camPos);
          const sDist = toSeg.length();
          if (sDist <= reach + 2.2 && (toSeg.normalize().dot(camDir) > 0.35 || sDist < 3.2)) {
            this.damageCentipedeSegment(b, seg, dmg, dmgColor, false);
            return;
          }
        }
        return;
      }

      // 4. Standard Boss Body Hit
      const bossCenter = b.position.clone().add(new THREE.Vector3(0, 2.0, 0));
      const toBoss = bossCenter.clone().sub(camPos);
      const dist = toBoss.length();
      if (dist <= reach + 2.6) {
        const dot = toBoss.normalize().dot(camDir);
        if (dot > 0.35 || dist < 3.6) {
          if (powerMult >= 0.5) {
            this.applyStatusToEntity(b, item.statusEffect);
          }
          this.damageBoss(dmg, isCrit || isMaxPower ? '#fde047' : dmgColor, isCrit || isMaxPower);
        }
      }
    }
  }

  public performWeaponAbility(item: typeof ITEMS[string]): boolean {
    const ab = item.ability;
    if (!ab) return false;
    const isRangedWeapon = item.category === 'ranged';
    if (!isRangedWeapon && this.player.abilityCooldownTimer > 0) return false;

    // Ranged weapons use the Weapon Power Bar on every shot; melee abilities use their mana/cooldown
    let powerMult = 1.0;
    if (isRangedWeapon) {
      const consumed = this.player.consumeWeaponPower();
      powerMult = consumed.multiplier;
      const manaNeeded = Math.max(2, Math.round(ab.manaCost * Math.min(1, consumed.pct + 0.25)));
      if (this.player.mana < manaNeeded) return false;
      this.player.mana -= manaNeeded;
    } else {
      if (this.player.mana < ab.manaCost) return false;
      this.player.mana -= ab.manaCost;
      this.player.abilityCooldownTimer = ab.cooldown;
    }

    this.player.triggerSwing();

    const camPos = new THREE.Vector3(
      this.player.position.x,
      this.player.position.y + this.player.eyeHeight,
      this.player.position.z
    );
    const camDir = new THREE.Vector3();
    this.player.camera.getWorldDirection(camDir);
    const baseDmg = Math.max(1, Math.round((item.damage || 20) * this.player.getDamageMultiplier() * powerMult));

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
    if (this.activeBoss) {
      const b = this.activeBoss;
      for (let nIdx = b.subNodes.length - 1; nIdx >= 0; nIdx--) {
        if (b.subNodes[nIdx].position.distanceTo(center) <= radius + 1.5) {
          this.damageBossSubNode(b, nIdx, damage, true);
        }
      }
      for (let cIdx = b.clones.length - 1; cIdx >= 0; cIdx--) {
        if (b.clones[cIdx].position.distanceTo(center) <= radius + 1.5) {
          this.spawnParticles(b.clones[cIdx].position.clone().add(new THREE.Vector3(0, 1.5, 0)), '#c084fc', 22, 5);
          this.scene.remove(b.clones[cIdx].group);
          b.clones.splice(cIdx, 1);
        }
      }
      if (b.def.modelType === 'molten_boss' && b.segments.length > 0) {
        const vuln = this.getVulnerableCentipedeSegment(b);
        if (vuln && vuln.position.distanceTo(center) <= radius + 2.2) {
          this.applyStatusToEntity(b, effect);
          this.damageCentipedeSegment(b, vuln, damage, '#fde047', true);
        }
        return;
      }
      if (b.position.distanceTo(center) <= radius + 2.2) {
        this.applyStatusToEntity(b, effect);
        this.damageBoss(damage, '#fde047', true);
      }
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
      // Drop loot & grant XP
      for (const drop of mob.def.drops) {
        if (Math.random() <= drop.chance) {
          const count = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
          this.spawnDroppedItem(drop.itemId, count, mob.position.clone().add(new THREE.Vector3(0, 0.8, 0)));
        }
      }
      this.player.monstersSlainCount++;
      this.player.gainXp(mob.def.tier * 35);
      this.player.unlockAchievement('night_hunter');

      this.spawnParticles(mob.position.clone().add(new THREE.Vector3(0, 1.0, 0)), mob.def.bodyColor, 18, 5);
      this.scene.remove(mob.rootGroup);
      const idx = this.monsters.indexOf(mob);
      if (idx !== -1) this.monsters.splice(idx, 1);
    }
  }

  public damageBoss(amount: number, color = '#ffffff', isCrit = false, silent = false): void {
    const b = this.activeBoss;
    if (!b) return;

    // Route DoTs on Centipede to its currently exposed segment
    if (b.def.modelType === 'molten_boss' && b.segments.length > 0) {
      const vuln = this.getVulnerableCentipedeSegment(b);
      if (vuln) {
        this.damageCentipedeSegment(b, vuln, amount, color, isCrit);
      }
      return;
    }

    let finalAmount = amount;
    let finalColor = color;

    // Treant Living Heart-Roots grant 80% Bark Shield!
    if (b.def.modelType === 'treant_boss' && b.subNodes.length > 0 && !silent) {
      finalAmount = Math.max(1, Math.round(amount * 0.2));
      finalColor = '#86efac';
    }

    // Aethelgard Orbiting Starlight Pylons grant 90% Astral Shield!
    if (b.def.modelType === 'astral_boss' && b.subNodes.length > 0 && !silent) {
      finalAmount = Math.max(1, Math.round(amount * 0.1));
      finalColor = '#7dd3fc';
    }

    // Striking the TRUE Malakor dispels all active Mirror Clones & staggers him!
    if (b.def.modelType === 'void_boss' && b.clones.length > 0 && !silent) {
      for (const c of b.clones) {
        this.spawnParticles(c.position.clone().add(new THREE.Vector3(0, 1.6, 0)), '#c084fc', 20, 5);
        this.scene.remove(c.group);
      }
      b.clones.length = 0;
      finalAmount = Math.round(finalAmount * 1.25);
      finalColor = '#f0abfc';
      sound.playExplosion();
      if (this.onBannerNotification) {
        this.onBannerNotification('🔮 TRUE MALAKOR STRUCK!', 'All Mirror Clones dispelled — +25% Bonus Stagger Damage!', '#f0abfc');
      }
    }

    b.hp -= finalAmount;
    if (!silent) sound.playMonsterHit();

    if (this.onDamageNumber) {
      this.onDamageNumber(
        b.position.clone().add(new THREE.Vector3(0, 3.2, 0)),
        finalAmount,
        finalColor,
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
      this.handleBossDeath(b);
    }
  }

  private handleBossDeath(b: ActiveBoss): void {
    const defeatedDef = b.def;
    const deathPos = b.position.clone();
    this.cleanupActiveBoss();

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
    this.player.gainXp(defeatedDef.tier * 280);
    if (defeatedDef.id === 'boss_sylvan_behemoth') this.player.unlockAchievement('slay_behemoth');
    if (defeatedDef.id === 'boss_cryonax') this.player.unlockAchievement('slay_cryonax');
    if (defeatedDef.id === 'boss_ignis_rex') this.player.unlockAchievement('slay_ignis');
    if (defeatedDef.id === 'boss_malakor') this.player.unlockAchievement('slay_malakor');
    if (defeatedDef.id === 'boss_aethelgard') this.player.unlockAchievement('slay_aethelgard');
    this.player.savePlayerState();

    if (this.onBannerNotification) {
      this.onBannerNotification(
        `${defeatedDef.name.toUpperCase()} VANQUISHED!`,
        defeatedDef.unlockMessage,
        defeatedDef.glowColor
      );
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
          const b = this.activeBoss;
          if (b.subNodes.length > 0) {
            targetPos = b.subNodes[0].position.clone().add(new THREE.Vector3(0, 1.0, 0));
          } else if (b.def.modelType === 'molten_boss') {
            const vuln = this.getVulnerableCentipedeSegment(b);
            targetPos = vuln ? vuln.position.clone().add(new THREE.Vector3(0, 1.3, 0)) : b.position.clone();
          } else {
            targetPos = b.position.clone().add(new THREE.Vector3(0, 2.0, 0));
          }
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

        let forceStopProjectile = false;

        if (!hitSomething && this.activeBoss) {
          const b = this.activeBoss;

          // 1. Check Boss Sub-Nodes (Roots / Orbiting Shield Pylons)
          for (let nIdx = b.subNodes.length - 1; nIdx >= 0; nIdx--) {
            const nodeCenter = b.subNodes[nIdx].position.clone().add(new THREE.Vector3(0, 1.1, 0));
            if (p.position.distanceTo(nodeCenter) <= 1.55 + p.radius) {
              this.damageBossSubNode(b, nIdx, p.damage, false);
              hitSomething = true;
              break;
            }
          }

          // 2. Check Malakor's Mirror Clones
          if (!hitSomething && b.clones.length > 0) {
            for (let cIdx = b.clones.length - 1; cIdx >= 0; cIdx--) {
              const cCenter = b.clones[cIdx].position.clone().add(new THREE.Vector3(0, 1.8, 0));
              if (p.position.distanceTo(cCenter) <= 2.0 + p.radius) {
                sound.playMagicCast(0.5);
                this.spawnParticles(cCenter, '#c084fc', 24, 5);
                this.scene.remove(b.clones[cIdx].group);
                b.clones.splice(cIdx, 1);
                hitSomething = true;
                break;
              }
            }
          }

          // 3. Check Ignis Rex Centipede Segments (Anti-Pierce Carapace: NEVER lets projectiles pierce!)
          if (!hitSomething && b.def.modelType === 'molten_boss' && b.segments.length > 0) {
            let hitSeg: CentipedeSegment | null = null;
            let bestDist = Infinity;
            for (const seg of b.segments) {
              if (!seg.alive) continue;
              const sCenter = seg.position.clone().add(new THREE.Vector3(0, 1.2, 0));
              const d = p.position.distanceTo(sCenter);
              if (d <= 2.1 + p.radius && d < bestDist) {
                bestDist = d;
                hitSeg = seg;
              }
            }
            if (hitSeg) {
              this.applyStatusToEntity(b, p.statusEffect);
              this.damageCentipedeSegment(b, hitSeg, p.damage, p.color, false);
              hitSomething = true;
              // Centipede's obsidian carapace completely stops ALL projectiles from piercing!
              forceStopProjectile = true;
            }
          }

          // 4. Standard Boss Body Hit
          if (!hitSomething && b.def.modelType !== 'molten_boss') {
            const bossCenter = b.position.clone().add(new THREE.Vector3(0, 2.2, 0));
            if (p.position.distanceTo(bossCenter) <= 2.5 + p.radius) {
              this.applyStatusToEntity(b, p.statusEffect);
              if (p.explosiveRadius) {
                this.spawnShockwave(p.position, p.explosiveRadius, p.color);
                this.damageAllEnemiesInRadius(p.position, p.explosiveRadius, p.damage, p.statusEffect);
              } else {
                this.damageBoss(p.damage, p.color);
              }
              hitSomething = true;
            }
          }
        }

        if (hitSomething && (!p.piercing || forceStopProjectile)) {
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
    extraAnimObj: THREE.Object3D | null;
    secondaryAnimObj: THREE.Object3D | null;
    hpBarFill: THREE.Mesh;
  } {
    const rootGroup = new THREE.Group();
    const s = def.scale;

    const bodyMat = new THREE.MeshLambertMaterial({ color: def.bodyColor });
    const darkMat = new THREE.MeshLambertMaterial({ color: '#111827' });
    const boneMat = new THREE.MeshLambertMaterial({ color: '#f8fafc' });
    const accentMat = new THREE.MeshLambertMaterial({
      color: def.accentColor,
      emissive: def.accentColor,
      emissiveIntensity: 0.38,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: def.eyeColor });

    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    let extraAnimObj: THREE.Object3D | null = null;
    let secondaryAnimObj: THREE.Object3D | null = null;

    if (def.modelType === 'boar') {
      // =====================================================
      // 1. BRAMBLE TUSK-BOAR: Armored Razorback War-Beast
      // =====================================================
      const ribcage = new THREE.Mesh(new THREE.BoxGeometry(0.92 * s, 0.72 * s, 0.92 * s), bodyMat);
      ribcage.position.set(0, 0.78 * s, 0.22 * s);
      const haunch = new THREE.Mesh(new THREE.BoxGeometry(0.76 * s, 0.58 * s, 0.68 * s), bodyMat);
      haunch.position.set(0, 0.7 * s, -0.45 * s);
      const shoulderMane = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52 * s, 0), darkMat);
      shoulderMane.scale.set(1.05, 0.75, 1.15);
      shoulderMane.position.set(0, 1.08 * s, 0.28 * s);
      const vineSaddle = new THREE.Mesh(new THREE.BoxGeometry(0.98 * s, 0.22 * s, 0.36 * s), accentMat);
      vineSaddle.position.set(0, 0.85 * s, 0.12 * s);
      rootGroup.add(ribcage, haunch, shoulderMane, vineSaddle);

      // 6 Jagged Emerald Bramble Crystal Spines down the razorback
      for (let i = 0; i < 6; i++) {
        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.11 * s, (0.44 - i * 0.04) * s, 4), accentMat);
        spine.position.set(0, (1.36 - i * 0.06) * s, (0.48 - i * 0.24) * s);
        spine.rotation.x = -0.42;
        rootGroup.add(spine);
      }

      // Armored Boar Skull + Flared Ears + Snout + 4 Curved War-Tusks
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.72 * s, 0.58 * s, 0.62 * s), bodyMat);
      head.position.set(0, 0.84 * s, 0.86 * s);
      const browArmor = new THREE.Mesh(new THREE.BoxGeometry(0.76 * s, 0.16 * s, 0.38 * s), darkMat);
      browArmor.position.set(0, 0.24 * s, 0.14 * s);
      browArmor.rotation.x = 0.2;
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 0.34 * s, 0.42 * s), darkMat);
      snout.position.set(0, -0.1 * s, 0.42 * s);
      head.add(browArmor, snout);

      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 0.24 * s, 0.1 * s), bodyMat);
        ear.position.set(side * 0.38 * s, 0.28 * s, -0.08 * s);
        ear.rotation.z = -side * 0.5;
        const mainTusk = new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 0.52 * s, 4), boneMat);
        mainTusk.position.set(side * 0.28 * s, 0.04 * s, 0.52 * s);
        mainTusk.rotation.x = 0.45;
        mainTusk.rotation.z = -side * 0.32;
        const subTusk = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.28 * s, 4), accentMat);
        subTusk.position.set(side * 0.22 * s, -0.1 * s, 0.58 * s);
        subTusk.rotation.x = 0.7;
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.11 * s, 0.08 * s), eyeMat);
        eye.position.set(side * 0.28 * s, 0.1 * s, 0.3 * s);
        head.add(ear, mainTusk, subTusk, eye);
      }
      rootGroup.add(head);

      // Wagging Thorny Tail
      const tailGroup = new THREE.Group();
      tailGroup.position.set(0, 0.85 * s, -0.78 * s);
      const tailStem = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.1 * s, 0.36 * s), darkMat);
      tailStem.position.set(0, 0.05 * s, -0.16 * s);
      const tailMace = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 * s, 0), accentMat);
      tailMace.position.set(0, 0.08 * s, -0.36 * s);
      tailGroup.add(tailStem, tailMace);
      extraAnimObj = tailGroup;
      rootGroup.add(tailGroup);

      // 4 Muscled Cloven War-Legs
      leftLeg.position.set(-0.32 * s, 0.5 * s, -0.46 * s);
      rightLeg.position.set(0.32 * s, 0.5 * s, -0.46 * s);
      leftArm.position.set(-0.34 * s, 0.52 * s, 0.44 * s);
      rightArm.position.set(0.34 * s, 0.52 * s, 0.44 * s);
      [leftLeg, rightLeg, leftArm, rightArm].forEach((limb) => {
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.26 * s, 0.32 * s, 0.28 * s), bodyMat);
        upper.position.y = -0.14 * s;
        const shin = new THREE.Mesh(new THREE.BoxGeometry(0.2 * s, 0.28 * s, 0.2 * s), darkMat);
        shin.position.y = -0.34 * s;
        const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.25 * s, 0.12 * s, 0.28 * s), accentMat);
        hoof.position.set(0, -0.46 * s, 0.03 * s);
        limb.add(upper, shin, hoof);
      });
      rootGroup.add(leftLeg, rightLeg, leftArm, rightArm);
    } else if (def.modelType === 'stalker') {
      // =====================================================
      // 2. SYLVAN BRIAR-STALKER: Antlered Mantis Forest-Predator
      // =====================================================
      const abdomen = new THREE.Mesh(new THREE.ConeGeometry(0.36 * s, 0.95 * s, 5), darkMat);
      abdomen.position.set(0, 0.95 * s, -0.32 * s);
      abdomen.rotation.x = -0.85;
      const thorax = new THREE.Mesh(new THREE.BoxGeometry(0.58 * s, 0.85 * s, 0.44 * s), bodyMat);
      thorax.position.set(0, 1.38 * s, 0.08 * s);
      thorax.rotation.x = 0.32;
      const heartPod = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 * s, 0), eyeMat);
      heartPod.position.set(0, 1.38 * s, 0.28 * s);
      rootGroup.add(abdomen, thorax, heartPod);

      // Fluttering Leaf-Cloak Strips on Back
      const cloakGrp = new THREE.Group();
      cloakGrp.position.set(0, 1.68 * s, -0.1 * s);
      for (let c = -1; c <= 1; c++) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.95 * s, 0.05 * s), accentMat);
        strip.position.set(c * 0.22 * s, -0.45 * s, -0.18 * s);
        strip.rotation.x = 0.28;
        strip.rotation.z = c * 0.14;
        cloakGrp.add(strip);
      }
      secondaryAnimObj = cloakGrp;
      rootGroup.add(cloakGrp);

      // Predatory Skull Mask + 4-Tine Stag Antlers + Slanted Hunter Eyes
      const skull = new THREE.Mesh(new THREE.OctahedronGeometry(0.38 * s, 0), boneMat);
      skull.scale.set(0.95, 0.9, 1.25);
      skull.position.set(0, 1.94 * s, 0.26 * s);
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.08 * s, 0.12 * s), eyeMat);
        eye.position.set(side * 0.18 * s, 0.04 * s, 0.28 * s);
        eye.rotation.z = -side * 0.25;
        const mainBeam = new THREE.Mesh(new THREE.ConeGeometry(0.065 * s, 0.72 * s, 4), accentMat);
        mainBeam.position.set(side * 0.28 * s, 0.42 * s, -0.05 * s);
        mainBeam.rotation.z = -side * 0.45;
        mainBeam.rotation.x = -0.25;
        const tine = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.42 * s, 4), accentMat);
        tine.position.set(side * 0.42 * s, 0.52 * s, 0.15 * s);
        tine.rotation.x = 0.55;
        tine.rotation.z = -side * 0.25;
        skull.add(eye, mainBeam, tine);
      }
      rootGroup.add(skull);

      // Digitigrade Raptor Hind Legs
      leftLeg.position.set(-0.24 * s, 0.85 * s, -0.06 * s);
      rightLeg.position.set(0.24 * s, 0.85 * s, -0.06 * s);
      for (const leg of [leftLeg, rightLeg]) {
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.2 * s, 0.48 * s, 0.22 * s), bodyMat);
        thigh.position.set(0, -0.2 * s, 0.08 * s);
        thigh.rotation.x = -0.4;
        const shin = new THREE.Mesh(new THREE.BoxGeometry(0.15 * s, 0.52 * s, 0.16 * s), darkMat);
        shin.position.set(0, -0.58 * s, -0.04 * s);
        shin.rotation.x = 0.35;
        const talon = new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, 0.28 * s, 4), accentMat);
        talon.rotation.x = Math.PI / 2;
        talon.position.set(0, -0.8 * s, 0.14 * s);
        leg.add(thigh, shin, talon);
      }

      // Dual Curved Emerald Mantis-Scythe Forelimbs!
      leftArm.position.set(-0.42 * s, 1.65 * s, 0.18 * s);
      rightArm.position.set(0.42 * s, 1.65 * s, 0.18 * s);
      for (const arm of [leftArm, rightArm]) {
        const humerus = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.55 * s, 0.18 * s), bodyMat);
        humerus.position.set(0, -0.22 * s, 0.15 * s);
        humerus.rotation.x = 0.65;
        const scytheBlade = new THREE.Mesh(new THREE.ConeGeometry(0.14 * s, 0.98 * s, 4), accentMat);
        scytheBlade.scale.set(0.38, 1.0, 1.15);
        scytheBlade.position.set(0, -0.58 * s, 0.45 * s);
        scytheBlade.rotation.x = 2.35;
        arm.add(humerus, scytheBlade);
      }
      rootGroup.add(leftLeg, rightLeg, leftArm, rightArm);
    } else if (def.modelType === 'golem') {
      // =====================================================
      // 3. ANCIENT MOSS GOLEM: Hollow-Core Runic Stone Construct
      // =====================================================
      const waistBoulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42 * s, 0), darkMat);
      waistBoulder.position.set(0, 0.82 * s, 0);
      // Hollow Stone Rib-Frame surrounding a Levitating Spinning Rune-Heart!
      const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.36 * s, 0.95 * s, 0.58 * s), bodyMat);
      leftPillar.position.set(-0.42 * s, 1.42 * s, 0);
      const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.36 * s, 0.95 * s, 0.58 * s), bodyMat);
      rightPillar.position.set(0.42 * s, 1.42 * s, 0);
      const shoulderArch = new THREE.Mesh(new THREE.BoxGeometry(1.28 * s, 0.34 * s, 0.68 * s), bodyMat);
      shoulderArch.position.set(0, 1.88 * s, 0);
      const mossMantle = new THREE.Mesh(new THREE.BoxGeometry(1.34 * s, 0.16 * s, 0.72 * s), accentMat);
      mossMantle.position.set(0, 2.04 * s, 0);
      rootGroup.add(waistBoulder, leftPillar, rightPillar, shoulderArch, mossMantle);

      // Levitating Spinning Emerald Rune-Heart inside Chest Cavity!
      const coreGrp = new THREE.Group();
      coreGrp.position.set(0, 1.42 * s, 0.05 * s);
      const runeHeart = new THREE.Mesh(new THREE.OctahedronGeometry(0.28 * s, 0), eyeMat);
      const runeRing = new THREE.Mesh(new THREE.TorusGeometry(0.38 * s, 0.045 * s, 6, 16), accentMat);
      coreGrp.add(runeHeart, runeRing);
      extraAnimObj = coreGrp;
      rootGroup.add(coreGrp);

      // Sunken Monolith Visor Head + Sprouting Shoulder Crystals
      const monolithHead = new THREE.Mesh(new THREE.BoxGeometry(0.54 * s, 0.48 * s, 0.52 * s), bodyMat);
      monolithHead.position.set(0, 2.24 * s, 0.08 * s);
      const visorEye = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 0.11 * s, 0.08 * s), eyeMat);
      visorEye.position.set(0, 0.02 * s, 0.25 * s);
      monolithHead.add(visorEye);
      const crystalSpire = new THREE.Mesh(new THREE.OctahedronGeometry(0.24 * s, 0), accentMat);
      crystalSpire.scale.set(0.65, 1.8, 0.65);
      crystalSpire.position.set(-0.55 * s, 2.28 * s, -0.1 * s);
      crystalSpire.rotation.z = 0.35;
      rootGroup.add(monolithHead, crystalSpire);

      // Heavy Stone Pillar Legs
      leftLeg.position.set(-0.34 * s, 0.72 * s, 0);
      rightLeg.position.set(0.34 * s, 0.72 * s, 0);
      for (const leg of [leftLeg, rightLeg]) {
        const stoneLeg = new THREE.Mesh(new THREE.BoxGeometry(0.36 * s, 0.72 * s, 0.42 * s), bodyMat);
        stoneLeg.position.y = -0.36 * s;
        const mossCuff = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.16 * s, 0.46 * s), accentMat);
        mossCuff.position.y = -0.58 * s;
        leg.add(stoneLeg, mossCuff);
      }

      // Colossal Asymmetric Vine-Wrapped Boulder Gauntlets
      leftArm.position.set(-0.82 * s, 1.82 * s, 0);
      rightArm.position.set(0.82 * s, 1.82 * s, 0);
      for (const arm of [leftArm, rightArm]) {
        const pauldron = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34 * s, 0), bodyMat);
        const vineCord = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.68 * s, 0.22 * s), accentMat);
        vineCord.position.y = -0.45 * s;
        const boulderFist = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.56 * s, 0.52 * s), bodyMat);
        boulderFist.position.set(0, -0.95 * s, 0.08 * s);
        const knuckleGlow = new THREE.Mesh(new THREE.BoxGeometry(0.54 * s, 0.14 * s, 0.16 * s), eyeMat);
        knuckleGlow.position.set(0, -1.12 * s, 0.28 * s);
        arm.add(pauldron, vineCord, boulderFist, knuckleGlow);
      }
      rootGroup.add(leftLeg, rightLeg, leftArm, rightArm);
    } else if (def.modelType === 'crawler') {
      // =====================================================
      // 4. CRYO-CRYSTAL CRAWLER: Glacial Scorpion-Arachnid
      // =====================================================
      const cephalothorax = new THREE.Mesh(new THREE.BoxGeometry(0.84 * s, 0.46 * s, 0.84 * s), bodyMat);
      cephalothorax.position.set(0, 0.52 * s, 0.22 * s);
      const abdomen = new THREE.Mesh(new THREE.DodecahedronGeometry(0.58 * s, 0), bodyMat);
      abdomen.scale.set(1.05, 0.78, 1.25);
      abdomen.position.set(0, 0.68 * s, -0.56 * s);
      rootGroup.add(cephalothorax, abdomen);

      // Erupting Translucent Cryo-Crystal Cluster on Carapace
      for (let c = 0; c < 4; c++) {
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.24 * s, 0), c % 2 === 0 ? accentMat : eyeMat);
        shard.scale.set(0.65, 2.0, 0.65);
        shard.position.set(((c % 3) - 1) * 0.26 * s, 1.12 * s, -0.48 * s - c * 0.12 * s);
        shard.rotation.z = ((c % 3) - 1) * 0.42;
        shard.rotation.x = -0.25;
        rootGroup.add(shard);
      }

      // Arching 5-Segment Scorpion Stinger Tail curving overhead!
      const stingerGroup = new THREE.Group();
      stingerGroup.position.set(0, 0.85 * s, -0.95 * s);
      const tailCoords = [
        [0, 0.25, -0.2, 0.4],
        [0, 0.62, -0.28, 0.1],
        [0, 0.98, -0.1, -0.4],
        [0, 1.22, 0.25, -0.9],
      ];
      for (const [tx, ty, tz, rx] of tailCoords) {
        const tSeg = new THREE.Mesh(new THREE.BoxGeometry(0.24 * s, 0.36 * s, 0.24 * s), bodyMat);
        tSeg.position.set(tx * s, ty * s, tz * s);
        tSeg.rotation.x = rx;
        stingerGroup.add(tSeg);
      }
      const stingerBarb = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 0.55 * s, 4), eyeMat);
      stingerBarb.position.set(0, 1.26 * s, 0.62 * s);
      stingerBarb.rotation.x = Math.PI * 0.62;
      stingerGroup.add(stingerBarb);
      extraAnimObj = stingerGroup;
      rootGroup.add(stingerGroup);

      // 6 Glowing Arachnid Eyes
      for (const side of [-1, 1]) {
        for (let e = 0; e < 3; e++) {
          const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.09 * s, 0.08 * s), eyeMat);
          eye.position.set(side * (0.14 + e * 0.12) * s, (0.58 + e * 0.04) * s, (0.64 - e * 0.06) * s);
          rootGroup.add(eye);
        }
      }

      // Giant Snapping Ice-Crab Pincer Claws (leftArm & rightArm)
      leftArm.position.set(-0.42 * s, 0.52 * s, 0.52 * s);
      rightArm.position.set(0.42 * s, 0.52 * s, 0.52 * s);
      for (const { clawGrp, side } of [
        { clawGrp: leftArm, side: -1 },
        { clawGrp: rightArm, side: 1 },
      ]) {
        const armSeg = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 0.16 * s, 0.46 * s), bodyMat);
        armSeg.position.set(side * 0.12 * s, 0, 0.22 * s);
        armSeg.rotation.y = -side * 0.3;
        const pincerOuter = new THREE.Mesh(new THREE.ConeGeometry(0.15 * s, 0.58 * s, 4), accentMat);
        pincerOuter.rotation.x = Math.PI * 0.5;
        pincerOuter.rotation.z = side * 0.25;
        pincerOuter.position.set(side * 0.22 * s, 0, 0.62 * s);
        const pincerInner = new THREE.Mesh(new THREE.ConeGeometry(0.1 * s, 0.42 * s, 4), eyeMat);
        pincerInner.rotation.x = Math.PI * 0.5;
        pincerInner.rotation.z = -side * 0.35;
        pincerInner.position.set(side * 0.04 * s, -0.04 * s, 0.58 * s);
        clawGrp.add(armSeg, pincerOuter, pincerInner);
      }

      // 8 Jointed Scuttling Spider Legs (4 per side)
      leftLeg.position.set(-0.4 * s, 0.48 * s, -0.12 * s);
      rightLeg.position.set(0.4 * s, 0.48 * s, -0.12 * s);
      for (const { legGrp, side } of [
        { legGrp: leftLeg, side: -1 },
        { legGrp: rightLeg, side: 1 },
      ]) {
        for (let k = 0; k < 4; k++) {
          const zOff = (k - 1.5) * 0.26 * s;
          const femur = new THREE.Mesh(new THREE.BoxGeometry(0.52 * s, 0.11 * s, 0.11 * s), accentMat);
          femur.position.set(side * 0.22 * s, 0.12 * s, zOff);
          femur.rotation.z = side * 0.48;
          const tibia = new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 0.62 * s, 4), bodyMat);
          tibia.position.set(side * 0.52 * s, -0.2 * s, zOff);
          tibia.rotation.z = Math.PI + side * 0.18;
          legGrp.add(femur, tibia);
        }
      }
      rootGroup.add(leftLeg, rightLeg, leftArm, rightArm);
    } else if (def.modelType === 'wraith') {
      // =====================================================
      // 5. PERMAFROST WRAITH: Crowned Spectral Ice-Reaper Lich
      // =====================================================
      const outerShroud = new THREE.Mesh(new THREE.ConeGeometry(0.62 * s, 1.48 * s, 6), bodyMat);
      outerShroud.position.set(0, 1.08 * s, 0);
      outerShroud.rotation.x = Math.PI;
      // Exposed Spectral Ice Ribcage + Spinning Soul-Crystal!
      for (let r = 0; r < 3; r++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry((0.36 - r * 0.04) * s, 0.035 * s, 5, 12, Math.PI * 1.3), boneMat);
        rib.position.set(0, (1.48 - r * 0.16) * s, 0.08 * s);
        rib.rotation.x = Math.PI / 2;
        rib.rotation.z = -Math.PI * 0.15;
        rootGroup.add(rib);
      }
      const soulHeart = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 * s, 0), eyeMat);
      soulHeart.position.set(0, 1.35 * s, 0.14 * s);
      extraAnimObj = soulHeart;
      rootGroup.add(outerShroud, soulHeart);

      // Trailing Spectral Ice Ribbons
      const ribbonGrp = new THREE.Group();
      ribbonGrp.position.set(0, 1.4 * s, -0.25 * s);
      for (const side of [-1, 1]) {
        const tailRibbon = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 1.1 * s, 4), accentMat);
        tailRibbon.position.set(side * 0.26 * s, -0.55 * s, -0.15 * s);
        tailRibbon.rotation.x = Math.PI - 0.3;
        ribbonGrp.add(tailRibbon);
      }
      secondaryAnimObj = ribbonGrp;
      rootGroup.add(ribbonGrp);

      // Hooded Skull + 3-Spire Glacial Crown
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.56 * s, 0.56 * s, 0.56 * s), darkMat);
      hood.position.set(0, 1.94 * s, 0.06 * s);
      for (let sp = -1; sp <= 1; sp++) {
        const crownSpike = new THREE.Mesh(new THREE.ConeGeometry(0.1 * s, (sp === 0 ? 0.56 : 0.4) * s, 4), accentMat);
        crownSpike.position.set(sp * 0.2 * s, 0.45 * s, 0);
        crownSpike.rotation.z = -sp * 0.28;
        hood.add(crownSpike);
      }
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.15 * s, 0.09 * s, 0.08 * s), eyeMat);
        eye.position.set(side * 0.14 * s, 0.02 * s, 0.28 * s);
        hood.add(eye);
      }
      rootGroup.add(hood);

      // Left Claw + Full 3D Frost-Reaper Great-Scythe in Right Hand!
      leftArm.position.set(-0.62 * s, 1.62 * s, 0.1 * s);
      const lClaw = new THREE.Mesh(new THREE.ConeGeometry(0.14 * s, 0.72 * s, 4), accentMat);
      lClaw.rotation.x = Math.PI * 0.72;
      lClaw.position.set(0, -0.28 * s, 0.22 * s);
      leftArm.add(lClaw);

      rightArm.position.set(0.62 * s, 1.62 * s, 0.1 * s);
      const rClaw = new THREE.Mesh(new THREE.ConeGeometry(0.14 * s, 0.58 * s, 4), bodyMat);
      rClaw.rotation.x = Math.PI * 0.65;
      rClaw.position.set(0, -0.22 * s, 0.18 * s);
      const scythePole = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.07 * s, 1.75 * s), darkMat);
      scythePole.position.set(0, -0.35 * s, 0.55 * s);
      scythePole.rotation.x = 0.35;
      const scytheCrescent = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 0.92 * s, 4), accentMat);
      scytheCrescent.position.set(-0.32 * s, -0.62 * s, 1.25 * s);
      scytheCrescent.rotation.z = Math.PI * 0.52;
      rightArm.add(rClaw, scythePole, scytheCrescent);

      rootGroup.add(leftLeg, rightLeg, leftArm, rightArm);
    } else if (def.modelType === 'sentinel') {
      // =====================================================
      // 6. CELESTIAL STAR-SENTINEL: Seraphic Ophanim Construct
      // =====================================================
      const diamondCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.46 * s, 0), bodyMat);
      diamondCore.scale.set(0.9, 1.45, 0.9);
      diamondCore.position.set(0, 1.42 * s, 0);
      const eyeIris = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 * s, 0), eyeMat);
      eyeIris.position.set(0, 1.42 * s, 0.36 * s);
      const crownStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.18 * s, 0), accentMat);
      crownStar.position.set(0, 2.25 * s, 0);
      rootGroup.add(diamondCore, eyeIris, crownStar);

      // Counter-Rotating Golden Gyroscope Rings
      const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(0.82 * s, 0.055 * s, 6, 24), accentMat);
      ringOuter.position.set(0, 1.42 * s, 0);
      const ringInner = new THREE.Mesh(new THREE.TorusGeometry(0.62 * s, 0.045 * s, 6, 20), eyeMat);
      ringInner.position.set(0, 1.42 * s, 0);
      extraAnimObj = ringOuter;
      secondaryAnimObj = ringInner;
      rootGroup.add(ringOuter, ringInner);

      // 4 Articulated Hovering Starlight Wing-Blades (2 per side)
      leftArm.position.set(-0.88 * s, 1.45 * s, 0);
      rightArm.position.set(0.88 * s, 1.45 * s, 0);
      for (const { grp, side } of [
        { grp: leftArm, side: -1 },
        { grp: rightArm, side: 1 },
      ]) {
        const upperWing = new THREE.Mesh(new THREE.BoxGeometry(0.75 * s, 0.16 * s, 0.08 * s), accentMat);
        upperWing.position.set(side * 0.25 * s, 0.32 * s, -0.1 * s);
        upperWing.rotation.z = side * 0.38;
        const lowerWing = new THREE.Mesh(new THREE.BoxGeometry(0.65 * s, 0.14 * s, 0.08 * s), eyeMat);
        lowerWing.position.set(side * 0.22 * s, -0.28 * s, -0.1 * s);
        lowerWing.rotation.z = -side * 0.32;
        grp.add(upperWing, lowerWing);
      }
      rootGroup.add(leftLeg, rightLeg, leftArm, rightArm);
    } else if (def.modelType === 'brute') {
      // =====================================================
      // 7. PYROCLAST MAGMA BRUTE: 4-Horned Volcanic Demon Juggernaut
      // =====================================================
      const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.82 * s, 0.34 * s, 0.56 * s), darkMat);
      pelvis.position.set(0, 0.78 * s, 0);
      const magmaChest = new THREE.Mesh(new THREE.BoxGeometry(1.12 * s, 0.98 * s, 0.68 * s), bodyMat);
      magmaChest.position.set(0, 1.38 * s, 0.05 * s);
      magmaChest.rotation.x = 0.12;
      // Glowing Molten Cracks across Chest + Spinning Magma Furnace Core
      const furnaceCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.28 * s, 0), eyeMat);
      furnaceCore.position.set(0, 1.42 * s, 0.36 * s);
      extraAnimObj = furnaceCore;
      // Twin Volcanic Back Vents
      for (const side of [-1, 1]) {
        const vent = new THREE.Mesh(new THREE.ConeGeometry(0.22 * s, 0.65 * s, 5), bodyMat);
        vent.position.set(side * 0.34 * s, 1.88 * s, -0.34 * s);
        vent.rotation.x = -0.45;
        const ventRim = new THREE.Mesh(new THREE.TorusGeometry(0.12 * s, 0.04 * s, 5, 10), eyeMat);
        ventRim.position.set(side * 0.34 * s, 2.12 * s, -0.46 * s);
        ventRim.rotation.x = Math.PI / 2 - 0.45;
        rootGroup.add(vent, ventRim);
      }
      rootGroup.add(pelvis, magmaChest, furnaceCore);

      // Demon Bull Skull + 4 Curved Molten Horns + Glowing Furnace Jaw
      const demonHead = new THREE.Mesh(new THREE.BoxGeometry(0.62 * s, 0.56 * s, 0.62 * s), bodyMat);
      demonHead.position.set(0, 2.08 * s, 0.18 * s);
      const jawGrate = new THREE.Mesh(new THREE.BoxGeometry(0.48 * s, 0.16 * s, 0.14 * s), accentMat);
      jawGrate.position.set(0, -0.18 * s, 0.3 * s);
      demonHead.add(jawGrate);
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.1 * s, 0.08 * s), eyeMat);
        eye.position.set(side * 0.16 * s, 0.06 * s, 0.32 * s);
        eye.rotation.z = -side * 0.2;
        const upperHorn = new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, 0.62 * s, 4), accentMat);
        upperHorn.position.set(side * 0.42 * s, 0.34 * s, 0.05 * s);
        upperHorn.rotation.z = -side * 0.55;
        upperHorn.rotation.x = 0.35;
        const lowerHorn = new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 0.38 * s, 4), eyeMat);
        lowerHorn.position.set(side * 0.36 * s, 0.02 * s, 0.22 * s);
        lowerHorn.rotation.x = 0.85;
        demonHead.add(eye, upperHorn, lowerHorn);
      }
      rootGroup.add(demonHead);

      // Armored Obsidian Hoof-Legs
      leftLeg.position.set(-0.32 * s, 0.7 * s, 0);
      rightLeg.position.set(0.32 * s, 0.7 * s, 0);
      for (const leg of [leftLeg, rightLeg]) {
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 0.68 * s, 0.36 * s), bodyMat);
        thigh.position.y = -0.34 * s;
        const greave = new THREE.Mesh(new THREE.BoxGeometry(0.38 * s, 0.24 * s, 0.42 * s), accentMat);
        greave.position.set(0, -0.58 * s, 0.04 * s);
        leg.add(thigh, greave);
      }

      // Spiked Pauldrons + Molten Shield (Left) & Two-Headed Solar Warhammer (Right)!
      leftArm.position.set(-0.76 * s, 1.72 * s, 0.06 * s);
      rightArm.position.set(0.76 * s, 1.72 * s, 0.06 * s);
      [leftArm, rightArm].forEach((arm, idx) => {
        const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.44 * s, 0.34 * s, 0.44 * s), darkMat);
        const pSpike = new THREE.Mesh(new THREE.ConeGeometry(0.11 * s, 0.38 * s, 4), accentMat);
        pSpike.position.set(idx === 0 ? -0.15 * s : 0.15 * s, 0.3 * s, 0);
        pSpike.rotation.z = idx === 0 ? 0.4 : -0.4;
        const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 0.82 * s, 0.34 * s), bodyMat);
        forearm.position.y = -0.4 * s;
        arm.add(pauldron, pSpike, forearm);

        if (idx === 0) {
          // Spiked Volcanic Buckler Shield
          const shield = new THREE.Mesh(new THREE.OctahedronGeometry(0.42 * s, 0), darkMat);
          shield.scale.set(0.35, 1.15, 1.15);
          shield.position.set(-0.22 * s, -0.55 * s, 0.2 * s);
          const bossGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 * s, 0), eyeMat);
          bossGem.position.set(-0.32 * s, -0.55 * s, 0.2 * s);
          arm.add(shield, bossGem);
        } else {
          // Colossal Two-Headed Solar Warhammer
          const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.1 * s, 1.25 * s), darkMat);
          shaft.position.set(0, -0.72 * s, 0.45 * s);
          const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.56 * s, 0.36 * s, 0.38 * s), accentMat);
          hammerHead.position.set(0, -0.72 * s, 0.96 * s);
          arm.add(shaft, hammerHead);
        }
      });
      rootGroup.add(leftLeg, rightLeg, leftArm, rightArm);
    } else {
      // =====================================================
      // 8. ABYSSAL VOID REAVER: Four-Armed Shadow-Rift Assassin
      // =====================================================
      const waist = new THREE.Mesh(new THREE.ConeGeometry(0.34 * s, 0.55 * s, 5), darkMat);
      waist.position.set(0, 0.88 * s, 0);
      waist.rotation.x = Math.PI;
      const sleekTorso = new THREE.Mesh(new THREE.BoxGeometry(0.72 * s, 0.82 * s, 0.44 * s), bodyMat);
      sleekTorso.position.set(0, 1.42 * s, 0);
      const voidRib = new THREE.Mesh(new THREE.OctahedronGeometry(0.26 * s, 0), accentMat);
      voidRib.position.set(0, 1.46 * s, 0.22 * s);
      // Spinning Dimensional Rift Halo behind shoulders!
      const riftHalo = new THREE.Mesh(new THREE.TorusGeometry(0.68 * s, 0.045 * s, 6, 18), accentMat);
      riftHalo.position.set(0, 1.65 * s, -0.28 * s);
      extraAnimObj = riftHalo;
      rootGroup.add(waist, sleekTorso, voidRib, riftHalo);

      // Angular Void-Knight Helm + Glowing V-Visor + Swept-Back Rift Horns
      const helm = new THREE.Mesh(new THREE.OctahedronGeometry(0.38 * s, 0), bodyMat);
      helm.scale.set(0.95, 1.1, 1.05);
      helm.position.set(0, 2.06 * s, 0.04 * s);
      for (const side of [-1, 1]) {
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 0.07 * s, 0.08 * s), eyeMat);
        visor.position.set(side * 0.13 * s, 0.04 * s, 0.3 * s);
        visor.rotation.z = -side * 0.32;
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09 * s, 0.68 * s, 4), accentMat);
        horn.position.set(side * 0.28 * s, 0.34 * s, -0.18 * s);
        horn.rotation.x = -0.65;
        horn.rotation.z = -side * 0.35;
        helm.add(visor, horn);
      }
      rootGroup.add(helm);

      // Sleek Bladed Greaves
      leftLeg.position.set(-0.22 * s, 0.72 * s, 0);
      rightLeg.position.set(0.22 * s, 0.72 * s, 0);
      for (const leg of [leftLeg, rightLeg]) {
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.72 * s, 0.24 * s), bodyMat);
        thigh.position.y = -0.36 * s;
        const kneeFin = new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 0.28 * s, 4), accentMat);
        kneeFin.position.set(0, -0.32 * s, 0.16 * s);
        kneeFin.rotation.x = 0.5;
        leg.add(thigh, kneeFin);
      }

      // FOUR Articulated Arms wielding Quadruple Glowing Plasma-Violet Katanas!
      leftArm.position.set(-0.52 * s, 1.72 * s, 0);
      rightArm.position.set(0.52 * s, 1.72 * s, 0);
      for (const { grp, side } of [
        { grp: leftArm, side: -1 },
        { grp: rightArm, side: 1 },
      ]) {
        // Upper Arm + Katana 1
        const pauldron = new THREE.Mesh(new THREE.ConeGeometry(0.24 * s, 0.45 * s, 4), accentMat);
        pauldron.rotation.z = -side * 0.65;
        pauldron.position.set(side * 0.1 * s, 0.08 * s, 0);
        const upperLimb = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 0.68 * s, 0.18 * s), bodyMat);
        upperLimb.position.set(side * 0.06 * s, -0.32 * s, 0.05 * s);
        const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.1 * s, 1.05 * s), eyeMat);
        blade1.position.set(side * 0.06 * s, -0.62 * s, 0.52 * s);

        // Lower Secondary Arm + Katana 2!
        const lowerLimb = new THREE.Mesh(new THREE.BoxGeometry(0.15 * s, 0.58 * s, 0.15 * s), darkMat);
        lowerLimb.position.set(side * 0.24 * s, -0.45 * s, -0.05 * s);
        lowerLimb.rotation.z = -side * 0.35;
        const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.09 * s, 0.92 * s), accentMat);
        blade2.position.set(side * 0.36 * s, -0.72 * s, 0.42 * s);

        grp.add(pauldron, upperLimb, blade1, lowerLimb, blade2);
      }
      rootGroup.add(leftLeg, rightLeg, leftArm, rightArm);
    }

    // Floating 3D Health Bar above monster
    const hpGroup = new THREE.Group();
    hpGroup.position.set(0, 2.65 * s, 0);
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

    return { rootGroup, leftLeg, rightLeg, leftArm, rightArm, extraAnimObj, secondaryAnimObj, hpBarFill };
  }

  private buildBossModel(def: BossDef): {
    rootGroup: THREE.Group;
    haloRing1: THREE.Object3D | null;
    haloRing2: THREE.Object3D | null;
    leftArm: THREE.Object3D;
    rightArm: THREE.Object3D;
    leftLeg: THREE.Object3D;
    rightLeg: THREE.Object3D;
    shieldMesh: THREE.Mesh | null;
    primaryBodyMat: THREE.MeshLambertMaterial;
    headWeakpointMesh: THREE.Mesh;
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

    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    let haloRing1: THREE.Object3D | null = null;
    let haloRing2: THREE.Object3D | null = null;
    let shieldMesh: THREE.Mesh | null = null;
    const headWeakpointMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55 * s, 0),
      new THREE.MeshBasicMaterial({ color: '#fde047' })
    );
    headWeakpointMesh.visible = false;

    if (def.modelType === 'frost_boss') {
      // =====================================================
      // CRYONAX: WINGED GLACIAL SKY-DRAGON
      // =====================================================
      const torso = new THREE.Mesh(new THREE.BoxGeometry(1.15 * s, 0.85 * s, 2.35 * s), bodyMat);
      torso.position.set(0, 1.15 * s, 0);
      const belly = new THREE.Mesh(new THREE.BoxGeometry(0.88 * s, 0.25 * s, 2.1 * s), accentMat);
      belly.position.set(0, 0.72 * s, 0.05 * s);
      rootGroup.add(torso, belly);

      // Dorsal Ice Spines along back & tail
      for (let i = 0; i < 6; i++) {
        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.14 * s, 0.55 * s, 4), glowMat);
        spine.position.set(0, 1.72 * s - i * 0.05 * s, 0.85 * s - i * 0.42 * s);
        spine.rotation.x = -0.35;
        rootGroup.add(spine);
      }

      // Dragon Neck + Horned Dragon Skull + Glowing Ice Jaws
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.62 * s, 0.65 * s, 1.05 * s), bodyMat);
      neck.position.set(0, 1.55 * s, 1.35 * s);
      neck.rotation.x = -0.35;
      const skull = new THREE.Mesh(new THREE.BoxGeometry(0.76 * s, 0.58 * s, 1.05 * s), bodyMat);
      skull.position.set(0, 1.88 * s, 2.08 * s);
      const lowerJaw = new THREE.Mesh(new THREE.BoxGeometry(0.58 * s, 0.2 * s, 0.88 * s), accentMat);
      lowerJaw.position.set(0, 1.52 * s, 2.08 * s);
      lowerJaw.rotation.x = 0.22;
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.15 * s, 0.95 * s, 4), glowMat);
        horn.position.set(side * 0.34 * s, 2.25 * s, 1.75 * s);
        horn.rotation.x = -0.75;
        horn.rotation.z = -side * 0.28;
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.14 * s, 0.14 * s), glowMat);
        eye.position.set(side * 0.39 * s, 1.96 * s, 2.25 * s);
        rootGroup.add(horn, eye);
      }
      rootGroup.add(neck, skull, lowerJaw);

      // Segmented Spiked Dragon Tail
      for (let t = 0; t < 4; t++) {
        const segScale = 1 - t * 0.18;
        const tailSeg = new THREE.Mesh(
          new THREE.BoxGeometry(0.58 * s * segScale, 0.48 * s * segScale, 0.85 * s),
          t % 2 === 0 ? bodyMat : accentMat
        );
        tailSeg.position.set(0, (1.05 - t * 0.08) * s, (-1.45 - t * 0.75) * s);
        rootGroup.add(tailSeg);
      }

      // Massive Articulated Crystal Dragon Wings (leftArm & rightArm)
      leftArm.position.set(-0.55 * s, 1.48 * s, 0.35 * s);
      rightArm.position.set(0.55 * s, 1.48 * s, 0.35 * s);
      const wingMembraneMat = new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
      });
      for (const { wingGrp, side } of [
        { wingGrp: leftArm, side: -1 },
        { wingGrp: rightArm, side: 1 },
      ]) {
        const bone1 = new THREE.Mesh(new THREE.BoxGeometry(1.75 * s, 0.16 * s, 0.18 * s), accentMat);
        bone1.position.set(side * 0.88 * s, 0.18 * s, 0.15 * s);
        bone1.rotation.z = side * 0.18;
        const bone2 = new THREE.Mesh(new THREE.BoxGeometry(1.55 * s, 0.13 * s, 0.14 * s), glowMat);
        bone2.position.set(side * 2.35 * s, 0.25 * s, -0.1 * s);
        bone2.rotation.z = -side * 0.12;
        const membrane = new THREE.Mesh(new THREE.BoxGeometry(2.95 * s, 0.05 * s, 1.55 * s), wingMembraneMat);
        membrane.position.set(side * 1.62 * s, 0.12 * s, -0.52 * s);
        wingGrp.add(bone1, bone2, membrane);
      }

      // 4 Clawed Dragon Talons
      leftLeg.position.set(-0.52 * s, 0.75 * s, -0.65 * s);
      rightLeg.position.set(0.52 * s, 0.75 * s, -0.65 * s);
      for (const leg of [leftLeg, rightLeg]) {
        const claw = new THREE.Mesh(new THREE.BoxGeometry(0.32 * s, 0.75 * s, 0.36 * s), bodyMat);
        claw.position.y = -0.35 * s;
        leg.add(claw);
      }
      rootGroup.add(leftArm, rightArm, leftLeg, rightLeg);
    } else if (def.modelType === 'molten_boss') {
      // =====================================================
      // IGNIS REX: ARMORED MAGMA CENTIPEDE HEAD (Segment 0)
      // =====================================================
      const carapace = new THREE.Mesh(new THREE.BoxGeometry(1.45 * s, 0.92 * s, 1.55 * s), bodyMat);
      carapace.position.set(0, 0.85 * s, 0);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(1.05 * s, 0.35 * s, 1.25 * s), accentMat);
      ridge.position.set(0, 1.38 * s, -0.05 * s);
      headWeakpointMesh.position.set(0, 1.65 * s, 0);
      rootGroup.add(carapace, ridge, headWeakpointMesh);

      // Glowing Centipede Eyes & Snapping Obsidian Mandibles
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.18 * s, 0.18 * s), glowMat);
        eye.position.set(side * 0.52 * s, 1.02 * s, 0.72 * s);
        const antenna = new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 0.95 * s, 4), accentMat);
        antenna.position.set(side * 0.36 * s, 1.35 * s, 0.95 * s);
        antenna.rotation.x = 0.85;
        antenna.rotation.z = -side * 0.35;
        rootGroup.add(eye, antenna);
      }

      leftArm.position.set(-0.55 * s, 0.65 * s, 0.78 * s);
      rightArm.position.set(0.55 * s, 0.65 * s, 0.78 * s);
      const pincerL = new THREE.Mesh(new THREE.ConeGeometry(0.22 * s, 1.15 * s, 4), glowMat);
      pincerL.rotation.x = Math.PI * 0.5;
      pincerL.rotation.z = -0.35;
      pincerL.position.set(0.15 * s, 0, 0.48 * s);
      const pincerR = new THREE.Mesh(new THREE.ConeGeometry(0.22 * s, 1.15 * s, 4), glowMat);
      pincerR.rotation.x = Math.PI * 0.5;
      pincerR.rotation.z = 0.35;
      pincerR.position.set(-0.15 * s, 0, 0.48 * s);
      leftArm.add(pincerL);
      rightArm.add(pincerR);

      // Head Leg Pairs
      leftLeg.position.set(-0.72 * s, 0.55 * s, 0);
      rightLeg.position.set(0.72 * s, 0.55 * s, 0);
      const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.65 * s, 0.16 * s, 0.2 * s), accentMat);
      lLeg.position.set(-0.28 * s, -0.18 * s, 0);
      lLeg.rotation.z = 0.45;
      const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.65 * s, 0.16 * s, 0.2 * s), accentMat);
      rLeg.position.set(0.28 * s, -0.18 * s, 0);
      rLeg.rotation.z = -0.45;
      leftLeg.add(lLeg);
      rightLeg.add(rLeg);

      rootGroup.add(leftArm, rightArm, leftLeg, rightLeg);
    } else if (def.modelType === 'treant_boss') {
      // =====================================================
      // SYLVAN BEHEMOTH: GNARLED CANOPY TREANT COLOSSUS
      // =====================================================
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.38 * s, 1.75 * s, 1.15 * s), bodyMat);
      trunk.position.y = 1.45 * s;
      const sapHeart = new THREE.Mesh(new THREE.OctahedronGeometry(0.46 * s, 0), glowMat);
      sapHeart.position.set(0, 1.55 * s, 0.58 * s);

      // Massive Lush Leafy Forest Canopy Crown
      const canopyMain = new THREE.Mesh(new THREE.DodecahedronGeometry(1.25 * s, 0), accentMat);
      canopyMain.position.set(0, 3.05 * s, -0.1 * s);
      const canopyL = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85 * s, 0), accentMat);
      canopyL.position.set(-0.95 * s, 2.75 * s, 0.1 * s);
      const canopyR = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85 * s, 0), accentMat);
      canopyR.position.set(0.95 * s, 2.75 * s, 0.1 * s);
      const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.68 * s, 0.16 * s, 0.1 * s), glowMat);
      eyes.position.set(0, 2.18 * s, 0.59 * s);
      rootGroup.add(trunk, sapHeart, canopyMain, canopyL, canopyR, eyes);

      // Bark Bulwark Shield Sphere (visible while Living Heart-Roots are alive!)
      shieldMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(2.15 * s, 1),
        new THREE.MeshBasicMaterial({
          color: '#4ade80',
          wireframe: true,
          transparent: true,
          opacity: 0.45,
        })
      );
      shieldMesh.position.y = 1.75 * s;
      rootGroup.add(shieldMesh);

      // Asymmetrical Wooden Branch-Claw Arms
      leftArm.position.set(-1.05 * s, 2.15 * s, 0);
      rightArm.position.set(1.05 * s, 2.15 * s, 0);
      for (const arm of [leftArm, rightArm]) {
        const log = new THREE.Mesh(new THREE.BoxGeometry(0.48 * s, 1.55 * s, 0.48 * s), bodyMat);
        log.position.y = -0.68 * s;
        const vine = new THREE.Mesh(new THREE.BoxGeometry(0.54 * s, 0.35 * s, 0.54 * s), accentMat);
        vine.position.y = -1.15 * s;
        arm.add(log, vine);
      }

      // Rooted Trunk Legs
      leftLeg.position.set(-0.48 * s, 0.8 * s, 0);
      rightLeg.position.set(0.48 * s, 0.8 * s, 0);
      for (const leg of [leftLeg, rightLeg]) {
        const root = new THREE.Mesh(new THREE.BoxGeometry(0.55 * s, 0.85 * s, 0.68 * s), bodyMat);
        root.position.y = -0.4 * s;
        leg.add(root);
      }
      rootGroup.add(leftArm, rightArm, leftLeg, rightLeg);
    } else if (def.modelType === 'void_boss') {
      // =====================================================
      // MALAKOR: LEVITATING SHADOW-CLONE VOID ARCHON
      // =====================================================
      const robeSpire = new THREE.Mesh(new THREE.ConeGeometry(0.95 * s, 2.25 * s, 6), bodyMat);
      robeSpire.position.y = 1.35 * s;
      robeSpire.rotation.x = Math.PI;
      const mantle = new THREE.Mesh(new THREE.BoxGeometry(1.65 * s, 0.42 * s, 0.72 * s), accentMat);
      mantle.position.y = 2.32 * s;
      const hood = new THREE.Mesh(new THREE.OctahedronGeometry(0.58 * s, 0), darkMat);
      hood.position.y = 2.85 * s;
      const cyclopsEye = new THREE.Mesh(new THREE.OctahedronGeometry(0.24 * s, 0), glowMat);
      cyclopsEye.position.set(0, 2.85 * s, 0.42 * s);
      rootGroup.add(robeSpire, mantle, hood, cyclopsEye);

      // 4 Telekinetic Floating Void-Blades hovering around Malakor
      leftArm.position.set(-1.15 * s, 2.05 * s, 0.2 * s);
      rightArm.position.set(1.15 * s, 2.05 * s, 0.2 * s);
      for (const { grp, side } of [
        { grp: leftArm, side: -1 },
        { grp: rightArm, side: 1 },
      ]) {
        for (let bIdx = 0; bIdx < 2; bIdx++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 1.35 * s, 0.24 * s), bIdx === 0 ? accentMat : glowMat);
          blade.position.set(side * bIdx * 0.38 * s, (bIdx - 0.5) * 0.45 * s, 0.2 * s);
          blade.rotation.z = side * 0.25;
          grp.add(blade);
        }
      }
      haloRing1 = new THREE.Mesh(new THREE.TorusGeometry(1.45 * s, 0.07 * s, 8, 24), accentMat);
      haloRing1.position.set(0, 2.1 * s, -0.25 * s);
      rootGroup.add(leftArm, rightArm, leftLeg, rightLeg, haloRing1);
    } else {
      // =====================================================
      // AETHELGARD: SIX-WINGED CELESTIAL SERAPH CONSTRUCT
      // =====================================================
      const obeliskBody = new THREE.Mesh(new THREE.OctahedronGeometry(1.05 * s, 0), bodyMat);
      obeliskBody.scale.set(0.95, 1.85, 0.75);
      obeliskBody.position.y = 1.85 * s;
      const starCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.52 * s, 0), glowMat);
      starCore.position.set(0, 1.95 * s, 0.52 * s);
      const seraphHead = new THREE.Mesh(new THREE.OctahedronGeometry(0.55 * s, 0), accentMat);
      seraphHead.position.y = 3.25 * s;
      const crownHalo = new THREE.Mesh(new THREE.TorusGeometry(0.68 * s, 0.08 * s, 6, 20), glowMat);
      crownHalo.position.set(0, 3.55 * s, 0);
      crownHalo.rotation.x = Math.PI / 2;
      rootGroup.add(obeliskBody, starCore, seraphHead, crownHalo);

      // 6 Huge Articulated Golden-Cyan Seraph Wings
      for (let w = 0; w < 3; w++) {
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(
            new THREE.BoxGeometry(1.95 * s, 0.26 * s, 0.09 * s),
            w % 2 === 0 ? accentMat : glowMat
          );
          wing.position.set(side * 1.38 * s, (2.65 - w * 0.48) * s, -0.35 * s);
          wing.rotation.z = side * (0.42 - w * 0.28);
          wing.rotation.y = -side * 0.22;
          rootGroup.add(wing);
        }
      }

      // Twin Interlocking Celestial Gyroscope Rings
      haloRing1 = new THREE.Mesh(new THREE.TorusGeometry(1.65 * s, 0.08 * s, 8, 28), accentMat);
      haloRing1.position.set(0, 2.05 * s, -0.2 * s);
      haloRing2 = new THREE.Mesh(new THREE.TorusGeometry(2.05 * s, 0.07 * s, 8, 28), glowMat);
      haloRing2.position.set(0, 2.05 * s, -0.2 * s);
      rootGroup.add(haloRing1, haloRing2);

      // Starlight Aegis Barrier Sphere (visible while Orbiting Shield Pylons are alive!)
      shieldMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(2.35 * s, 1),
        new THREE.MeshBasicMaterial({
          color: '#fde047',
          wireframe: true,
          transparent: true,
          opacity: 0.48,
        })
      );
      shieldMesh.position.y = 2.0 * s;
      rootGroup.add(shieldMesh, leftArm, rightArm, leftLeg, rightLeg);
    }

    return {
      rootGroup,
      haloRing1,
      haloRing2,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      shieldMesh,
      primaryBodyMat: bodyMat,
      headWeakpointMesh,
    };
  }

  private buildCentipedeSegmentMesh(
    def: BossDef,
    isInitialTail: boolean
  ): {
    group: THREE.Group;
    armorMat: THREE.MeshLambertMaterial;
    weakpointMesh: THREE.Mesh;
    leftLegs: THREE.Object3D;
    rightLegs: THREE.Object3D;
  } {
    const group = new THREE.Group();
    const s = def.scale;

    const armorMat = new THREE.MeshLambertMaterial({
      color: isInitialTail ? '#ea580c' : '#290f02',
      emissive: isInitialTail ? '#f97316' : '#451a03',
      emissiveIntensity: isInitialTail ? 0.55 : 0.15,
    });
    const spineMat = new THREE.MeshLambertMaterial({
      color: def.accentColor,
      emissive: def.accentColor,
      emissiveIntensity: 0.4,
    });
    const weakMat = new THREE.MeshBasicMaterial({ color: '#fde047' });

    const shell = new THREE.Mesh(new THREE.BoxGeometry(1.26 * s, 0.78 * s, 1.18 * s), armorMat);
    shell.position.y = 0.72 * s;
    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.2 * s, 0.55 * s, 4), spineMat);
    spine.position.y = 1.32 * s;
    const weakpointMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.52 * s, 0), weakMat);
    weakpointMesh.position.y = 1.48 * s;
    weakpointMesh.visible = isInitialTail;
    group.add(shell, spine, weakpointMesh);

    const leftLegs = new THREE.Group();
    leftLegs.position.set(-0.62 * s, 0.5 * s, 0);
    const lClaw = new THREE.Mesh(new THREE.BoxGeometry(0.62 * s, 0.14 * s, 0.18 * s), spineMat);
    lClaw.position.set(-0.26 * s, -0.16 * s, 0);
    lClaw.rotation.z = 0.45;
    leftLegs.add(lClaw);

    const rightLegs = new THREE.Group();
    rightLegs.position.set(0.62 * s, 0.5 * s, 0);
    const rClaw = new THREE.Mesh(new THREE.BoxGeometry(0.62 * s, 0.14 * s, 0.18 * s), spineMat);
    rClaw.position.set(0.26 * s, -0.16 * s, 0);
    rClaw.rotation.z = -0.45;
    rightLegs.add(rClaw);

    group.add(leftLegs, rightLegs);

    return { group, armorMat, weakpointMesh, leftLegs, rightLegs };
  }
}
