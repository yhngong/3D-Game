import * as THREE from 'three';
import { sound } from './audio/soundEngine';
import { BLOCKS, ITEMS } from './data/itemsAndBlocks';
import { EntityManager } from './entities/monstersAndBosses';
import { PlayerController } from './entities/player';
import { TextureAtlasManager } from './graphics/textureAtlas';
import './style.css';
import { BlockId } from './types';
import { HudAndMenuManager } from './ui/hudAndMenus';
import { VoxelWorld } from './world/voxelWorld';

class AethelgardGame {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;

  private atlas!: TextureAtlasManager;
  private world!: VoxelWorld;
  private player!: PlayerController;
  private entities!: EntityManager;
  private ui!: HudAndMenuManager;

  private sunLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;
  private playerLight!: THREE.PointLight;
  private starField!: THREE.Points;
  private sunMesh!: THREE.Mesh;
  private moonMesh!: THREE.Mesh;

  private targetBoxWire!: THREE.LineSegments;
  private crackOverlayMesh!: THREE.Mesh;

  private isLeftMouseDown = false;
  private miningVoxelKey = '';
  private miningProgress = 0;
  private hitSoundCooldown = 0;
  private timeOfDay = 0.22; // 0..0.5 = Day, 0.5..1.0 = Night
  private wasNightTime = false;

  constructor() {
    this.initScene();
    this.initModules();
    this.initInputListeners();
    this.animate();
  }

  private initScene(): void {
    const container = document.getElementById('game-canvas-wrap')!;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#38bdf8');
    this.scene.fog = new THREE.FogExp2('#38bdf8', 0.015);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 140);
    this.scene.add(this.camera);

    this.ambientLight = new THREE.AmbientLight('#ffffff', 0.65);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight('#fffbeb', 1.15);
    this.sunLight.position.set(40, 80, 30);
    this.scene.add(this.sunLight);

    this.playerLight = new THREE.PointLight('#fef08a', 0.85, 16);
    this.scene.add(this.playerLight);

    // Celestial Starfield in the sky
    const starPositions: number[] = [];
    for (let i = 0; i < 450; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.48;
      const r = 110;
      starPositions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi) + 15,
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.starField = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: '#fde047', size: 0.8, transparent: true, opacity: 0.7 })
    );
    this.scene.add(this.starField);

    // 3D Orbiting Sun & Moon Meshes for the Daylight Cycle
    this.sunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(9, 9, 9),
      new THREE.MeshBasicMaterial({ color: '#fef08a' })
    );
    this.scene.add(this.sunMesh);

    this.moonMesh = new THREE.Mesh(
      new THREE.BoxGeometry(7, 7, 7),
      new THREE.MeshBasicMaterial({ color: '#e0f2fe' })
    );
    this.scene.add(this.moonMesh);

    // Target Voxel Wireframe Box
    const boxGeo = new THREE.BoxGeometry(1.006, 1.006, 1.006);
    const edges = new THREE.EdgesGeometry(boxGeo);
    this.targetBoxWire = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: '#0f172a' })
    );
    this.targetBoxWire.visible = false;
    this.scene.add(this.targetBoxWire);

    // Block Mining Crack Box
    this.crackOverlayMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.01, 1.01, 1.01),
      new THREE.MeshBasicMaterial({
        color: '#facc15',
        wireframe: true,
        transparent: true,
        opacity: 0.6,
      })
    );
    this.crackOverlayMesh.visible = false;
    this.scene.add(this.crackOverlayMesh);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private initModules(): void {
    this.atlas = new TextureAtlasManager();
    this.world = new VoxelWorld(this.scene, this.atlas, 2026);
    this.player = new PlayerController(this.camera, this.world);
    this.entities = new EntityManager(this.scene, this.world, this.player);
    this.ui = new HudAndMenuManager(this.player, this.entities, this.atlas);

    // Pre-build initial chunks around spawn
    for (let i = 0; i < 12; i++) {
      this.world.updateChunksAroundPlayer(this.player.position.x, this.player.position.z, 3);
    }
  }

  private initInputListeners(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('click', () => {
      if (!this.ui.isMenuOpen && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (this.ui.isMenuOpen || document.pointerLockElement !== canvas) return;
      const sensitivity = 0.0022;
      this.player.yaw -= e.movementX * sensitivity;
      this.player.pitch = Math.max(
        -Math.PI * 0.48,
        Math.min(Math.PI * 0.48, this.player.pitch - e.movementY * sensitivity)
      );
    });

    window.addEventListener('mousedown', (e) => {
      if (this.ui.isMenuOpen) return;
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
        return;
      }

      if (e.button === 0) {
        this.isLeftMouseDown = true;
        this.handlePrimaryActionPress();
      } else if (e.button === 2) {
        this.handleSecondaryAction();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isLeftMouseDown = false;
        this.miningProgress = 0;
        this.crackOverlayMesh.visible = false;
      }
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('wheel', (e) => {
      if (this.ui.isMenuOpen) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      this.player.selectedHotbarIndex = (this.player.selectedHotbarIndex + dir + 9) % 9;
      this.ui.renderHotbar();
    });

    window.addEventListener('keydown', (e) => {
      this.player.keys[e.code] = true;

      if (e.code === 'KeyE') {
        e.preventDefault();
        this.ui.toggleMenu(undefined, 'craft');
        return;
      }
      if (e.code === 'KeyK') {
        e.preventDefault();
        this.ui.toggleMenu(undefined, 'skills');
        return;
      }
      if (e.code === 'KeyP') {
        e.preventDefault();
        this.ui.toggleMenu(undefined, 'codex');
        return;
      }
      if (e.code === 'Escape' && this.ui.isMenuOpen) {
        this.ui.toggleMenu(false);
        return;
      }

      if (this.ui.isMenuOpen) return;

      if (e.code === 'Space') {
        this.player.handleJumpKeyPress();
      }
      if (e.code === 'KeyQ') {
        this.player.triggerDash();
      }
      if (e.code === 'KeyX') {
        // Dispose of 1 item (or entire stack if holding Shift) from currently selected hotbar slot
        const disposed = this.player.disposeHeldItem(e.shiftKey);
        if (disposed) {
          this.ui.renderHotbar();
          const frontPos = this.player.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          this.entities.spawnParticles(frontPos, '#c084fc', 16, 4.5);
          this.ui.showBanner(
            '🗑️ ITEM DISPOSED',
            `Salvaged ${disposed.count}x ${disposed.itemName} into +${disposed.xpGained} Hero XP!`,
            '#c084fc'
          );
        }
      }
      if (e.code === 'KeyB') {
        if (this.player.recallToSanctuary()) {
          this.entities.spawnParticles(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), '#38bdf8', 28, 6);
          this.ui.showBanner('✨ SANCTUARY RECALL', 'Teleported back to the Spawn Sanctuary & restored vitality!', '#38bdf8');
        }
      }
      if (e.code === 'KeyV') {
        const is3rd = this.player.toggleCameraView();
        this.ui.showBanner(
          is3rd ? '🎥 3RD-PERSON HERO CAMERA' : '🎥 1ST-PERSON CAMERA',
          'Press [V] anytime to switch camera perspectives.',
          '#38bdf8'
        );
      }
      if (e.code === 'KeyT') {
        if (this.player.cheatsEnabled) {
          // Toggle between Midday (0.22) and Midnight (0.72) when cheats are active
          const isNight = Math.sin(this.timeOfDay * Math.PI * 2) < 0;
          this.timeOfDay = isNight ? 0.22 : 0.72;
        } else {
          this.ui.showBanner(
            '🔒 CHEATS DISABLED',
            'Changing the time of day [T] requires Allow Cheats: ON.',
            '#f87171'
          );
        }
      }

      // Hotbar keys 1..9
      if (e.code.startsWith('Digit')) {
        const num = parseInt(e.code.replace('Digit', ''), 10);
        if (num >= 1 && num <= 9) {
          this.player.selectedHotbarIndex = num - 1;
          this.ui.renderHotbar();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.player.keys[e.code] = false;
    });
  }

  private getBestPickaxeInfo(): { tier: number; speed: number } {
    const held = this.player.getSelectedItemDef();
    if (held && held.toolType === 'pickaxe') {
      return { tier: held.toolTier || 1, speed: held.miningSpeed || 1.2 };
    }
    // Also check inventory for best owned pickaxe so players can mine seamlessly
    let bestTier = 0;
    let bestSpeed = 1.0;
    for (const slot of this.player.inventory) {
      if (!slot) continue;
      const def = ITEMS[slot.itemId];
      if (def && def.toolType === 'pickaxe' && (def.toolTier || 0) > bestTier) {
        bestTier = def.toolTier || 1;
        bestSpeed = (def.miningSpeed || 1.2) * 0.85;
      }
    }
    return { tier: bestTier, speed: bestSpeed };
  }

  private handlePrimaryActionPress(): void {
    const item = this.player.getSelectedItemDef();
    this.player.triggerSwing();

    if (item && item.summonsBossId) {
      if (this.entities.summonBoss(item.summonsBossId)) {
        this.player.removeItem(item.id, 1);
        this.ui.renderHotbar();
      }
      return;
    }

    if (item && item.category === 'consumable') {
      this.consumeSelectedPotion(item);
      return;
    }

    if (item && item.category === 'ranged') {
      this.entities.performWeaponAbility(item);
      return;
    }

    // Melee swing check against monsters & bosses
    if (this.player.attackCooldownTimer <= 0) {
      const atkSpd = item?.attackSpeed || 1.8;
      this.player.attackCooldownTimer = 1 / atkSpd;
      if (item && (item.category === 'melee' || item.category === 'tool')) {
        this.entities.performPlayerMeleeAttack(item);
      } else {
        this.entities.performPlayerMeleeAttack(ITEMS['flint_pickaxe']);
      }
    }
  }

  private handleSecondaryAction(): void {
    const item = this.player.getSelectedItemDef();
    if (!item) return;

    if (item.summonsBossId) {
      if (this.entities.summonBoss(item.summonsBossId)) {
        this.player.removeItem(item.id, 1);
        this.ui.renderHotbar();
      }
      return;
    }

    if (item.category === 'consumable') {
      this.consumeSelectedPotion(item);
      return;
    }

    if (item.ability) {
      this.entities.performWeaponAbility(item);
      return;
    }

    if (item.category === 'block' && item.blockId) {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const eyeOrigin = new THREE.Vector3(
        this.player.position.x,
        this.player.position.y + this.player.eyeHeight,
        this.player.position.z
      );
      const hit = this.world.raycast(eyeOrigin, dir, 6.0);
      if (hit) {
        const placePos = hit.voxel.clone().add(hit.normal);
        // Ensure new block does not intersect player AABB
        this.world.setBlock(placePos.x, placePos.y, placePos.z, item.blockId);
        if (this.player.checkCollision(this.player.position.x, this.player.position.y, this.player.position.z)) {
          this.world.setBlock(placePos.x, placePos.y, placePos.z, BlockId.Air);
        } else {
          sound.playBlockPlace();
          this.player.triggerSwing();
          this.player.removeItem(item.id, 1);
          this.ui.renderHotbar();
        }
      }
    }
  }

  private consumeSelectedPotion(item: typeof ITEMS[string]): void {
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + (item.healHp || 50));
    this.player.mana = Math.min(this.player.maxMana, this.player.mana + (item.healMana || 40));
    sound.playPickup();
    this.player.removeItem(item.id, 1);
    this.ui.renderHotbar();
  }

  private updateMiningAndTargeting(dt: number): { targetBlockId: BlockId | null; progress: number } {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const held = this.player.getSelectedItemDef();
    const reach = held?.reach || 5.2;
    const eyeOrigin = new THREE.Vector3(
      this.player.position.x,
      this.player.position.y + this.player.eyeHeight,
      this.player.position.z
    );
    const hit = this.world.raycast(eyeOrigin, dir, reach);

    if (!hit) {
      this.targetBoxWire.visible = false;
      this.crackOverlayMesh.visible = false;
      this.miningProgress = 0;
      return { targetBlockId: null, progress: 0 };
    }

    this.targetBoxWire.visible = true;
    this.targetBoxWire.position.set(hit.voxel.x + 0.5, hit.voxel.y + 0.5, hit.voxel.z + 0.5);

    const blockDef = BLOCKS[hit.blockId];

    if (this.isLeftMouseDown && blockDef.hardness < 900) {
      // Also allow continuous ranged firing or melee swinging if holding down LMB
      if (held && held.category === 'ranged') {
        this.entities.performWeaponAbility(held);
      } else if (held && held.category === 'melee' && this.player.attackCooldownTimer <= 0) {
        this.player.triggerSwing();
        this.player.attackCooldownTimer = 1 / (held.attackSpeed || 1.8);
        this.entities.performPlayerMeleeAttack(held);
      }

      const key = `${hit.voxel.x},${hit.voxel.y},${hit.voxel.z}`;
      if (key !== this.miningVoxelKey) {
        this.miningVoxelKey = key;
        this.miningProgress = 0;
      }

      const pickInfo = this.getBestPickaxeInfo();
      let speedMult = 1.0;

      if (blockDef.preferredTool === 'pickaxe') {
        if (pickInfo.tier >= blockDef.minToolTier) {
          speedMult = pickInfo.speed;
        } else {
          speedMult = 0.2; // Too low tier pickaxe
        }
      } else if (blockDef.preferredTool === 'axe') {
        speedMult = held?.toolType === 'axe' ? held.miningSpeed || 1.6 : 1.1;
      }

      speedMult *= this.player.getMiningSpeedMultiplier();
      this.miningProgress += (dt * speedMult) / Math.max(0.15, blockDef.hardness);
      this.player.triggerSwing();

      this.hitSoundCooldown -= dt;
      if (this.hitSoundCooldown <= 0) {
        this.hitSoundCooldown = 0.22;
        sound.playBlockHit(0.9 + this.miningProgress * 0.4);
      }

      this.crackOverlayMesh.visible = true;
      this.crackOverlayMesh.position.copy(this.targetBoxWire.position);

      if (this.miningProgress >= 1.0) {
        // Break block!
        this.world.setBlock(hit.voxel.x, hit.voxel.y, hit.voxel.z, BlockId.Air);
        sound.playBlockBreak();
        this.entities.spawnParticles(
          this.targetBoxWire.position.clone(),
          blockDef.accentColor || blockDef.colorTop,
          14,
          4
        );

        this.player.blocksMinedCount++;
        this.player.gainXp((blockDef.minToolTier + 1) * 8);
        if (this.player.blocksMinedCount >= 10) {
          this.player.unlockAchievement('first_harvest');
        }

        if (blockDef.dropItem && pickInfo.tier >= blockDef.minToolTier) {
          this.player.addItem(blockDef.dropItem, blockDef.dropCount);
          this.ui.renderHotbar();
        }
        this.miningProgress = 0;
        this.crackOverlayMesh.visible = false;
      }
    } else {
      this.miningProgress = 0;
      this.crackOverlayMesh.visible = false;
    }

    return { targetBlockId: hit.blockId, progress: this.miningProgress };
  }

  private updateAtmosphere(dt: number): boolean {
    // Full Day-Night cycle every ~140 seconds (70s Day, 70s Night)
    this.timeOfDay = (this.timeOfDay + dt * 0.007) % 1.0;
    const sunAngle = this.timeOfDay * Math.PI * 2;
    const sunHeight = Math.sin(sunAngle);
    const sunHoriz = Math.cos(sunAngle);
    const isNightTime = sunHeight < 0;

    if (isNightTime !== this.wasNightTime) {
      this.wasNightTime = isNightTime;
      if (isNightTime) {
        this.ui.showBanner(
          '🌙 NIGHT FALLS',
          'Hostile Monsters are now spawning in the darkness!',
          '#c084fc'
        );
      } else {
        this.entities.despawnAllMonsters();
        this.ui.showBanner(
          '☀️ DAWN BREAKS',
          'Sunlight returns — all monsters have vanished!',
          '#fde047'
        );
      }
    }

    // Position orbiting 3D Sun and Moon around player
    const orbitRadius = 95;
    this.sunMesh.position.set(
      this.player.position.x + sunHoriz * orbitRadius,
      sunHeight * orbitRadius,
      this.player.position.z - 25
    );
    this.moonMesh.position.set(
      this.player.position.x - sunHoriz * orbitRadius,
      -sunHeight * orbitRadius,
      this.player.position.z - 25
    );
    this.sunLight.position.copy(this.sunMesh.position);

    // Adjust sunlight & ambient intensity for Day vs Night
    const dayFactor = Math.max(0, sunHeight);
    this.sunLight.intensity = 0.2 + dayFactor * 1.05;
    this.ambientLight.intensity = 0.28 + dayFactor * 0.45;
    (this.starField.material as THREE.PointsMaterial).opacity = isNightTime
      ? Math.min(0.9, -sunHeight * 1.2)
      : 0.08;

    this.playerLight.position.copy(this.player.camera.position);
    this.starField.position.set(this.player.position.x, 0, this.player.position.z);

    // Biome & Day/Night dynamic sky tinting
    const biome = this.world.getBiomeAt(this.player.position.x, this.player.position.z);
    let skyColor = new THREE.Color('#38bdf8');
    if (this.entities.activeBoss) {
      skyColor = new THREE.Color(this.entities.activeBoss.def.bodyColor).lerp(
        new THREE.Color('#0f172a'),
        0.5
      );
    } else if (biome === 'scorched_wastes') {
      skyColor = new THREE.Color('#7c2d12');
    } else if (biome === 'astral_rifts') {
      skyColor = new THREE.Color('#1e1b4b');
    } else if (biome === 'permafrost_peaks') {
      skyColor = new THREE.Color('#7dd3fc');
    }

    // Sunset/Dawn warm glow near horizon
    if (Math.abs(sunHeight) < 0.22 && !this.entities.activeBoss) {
      skyColor.lerp(new THREE.Color('#f97316'), 0.45);
    }

    if (isNightTime && !this.entities.activeBoss) {
      skyColor.lerp(new THREE.Color('#060913'), Math.min(0.88, -sunHeight * 1.15));
    }

    (this.scene.background as THREE.Color).lerp(skyColor, Math.min(1, dt * 2.5));
    (this.scene.fog as THREE.FogExp2).color.copy(this.scene.background as THREE.Color);
    return isNightTime;
  }

  private animate(): void {
    let lastTime = performance.now();

    const loop = (now: number) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (!this.ui.isMenuOpen) {
        this.player.update(dt);
        this.world.updateChunksAroundPlayer(this.player.position.x, this.player.position.z, 3);
        const isNightTime = this.updateAtmosphere(dt);
        this.entities.update(dt, isNightTime);
        const miningState = this.updateMiningAndTargeting(dt);
        this.ui.updateHud(miningState.targetBlockId, miningState.progress, isNightTime, this.timeOfDay);
      }

      this.renderer.render(this.scene, this.camera);
    };

    requestAnimationFrame(loop);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new AethelgardGame();
});
