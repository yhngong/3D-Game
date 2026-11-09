# How `funnyblockgame` Is Built: Complete Architecture & Engineering Guide

**`funnyblockgame`** is a 3D Voxel Action-RPG built entirely from scratch in **TypeScript**, **Three.js**, and **Vite**—with **zero external image assets or audio files**. Every block texture, 3D weapon model, monster/boss rig, particle effect, and sound effect is procedurally generated in code at runtime.

---

## 1. High-Level Architecture

The game is organized into modular subsystems inside `src/`:

| File | Responsibility |
| :--- | :--- |
| `src/main.ts` | Bootstraps the Three.js `WebGLRenderer`, runs the `requestAnimationFrame` game loop, manages the **Daylight Cycle** (5m Day / 1m Night), raycasts block mining/placement, and coordinates inputs. |
| `src/types.ts` | Defines TypeScript types for `BlockId`, `ProgressionTier` (1–6), `ItemDef`, `RecipeDef`, `MonsterDef`, `BossDef`, `SkillDef`, and `AchievementDef`. |
| `src/data/itemsAndBlocks.ts` | Central database of **33 voxel blocks**, **50+ weapons/tools/armors/trinkets/consumables**, **6 monsters**, **5 multi-phase bosses**, **5 RPG skills**, and **9 achievements**. |
| `src/data/recipes.ts` | Defines all crafting recipes across Tiers 1–6 for the Forge menu. |
| `src/world/voxelWorld.ts` | Manages 16×64×16 voxel chunks, terrain generation, hidden-face culling mesh builder, DDA voxel raycasting, and `localStorage` block modifications. |
| `src/world/noise.ts` | Deterministic seeded 2D/3D Simplex/Perlin-style noise (`SeededNoise`) for procedural terrain heightmaps, biomes, and underground ore veins. |
| `src/world/proceduralTextures.ts` | Generates crisp 16×16 pixel-art textures onto an HTML5 `<canvas>` texture atlas for blocks and renders 2D icons for every item in the HUD/Forge. |
| `src/entities/player.ts` | Handles first-person & third-person cameras, WASD + Jump/Double-Jump/Glide + Dash (`[Q]`), swept AABB block collisions, inventory/trash disposal, RPG leveling, and 3D held weapon models. |
| `src/entities/monstersAndBosses.ts` | Builds articulated 3D meshes for monsters and bosses, runs night spawning & dawn dissolution, executes multi-phase boss attack patterns, and simulates projectiles/particles. |
| `src/ui/hudAndMenus.ts` | Renders the DOM/Canvas overlay: HP/Mana/XP bars, live 2D Minimap radar, Day/Night countdown timer, Boss health bar, Searchable Forge (`[E]`), Skill Tree (`[K]`), Codex (`[P]`), and Item Trash & Disposal (`[X]`). |
| `src/audio/soundEngine.ts` | Synthesizes sword swings, bow shots, explosions, block mining, level-up fanfares, and boss roars in real time using the browser's `AudioContext`. |

---

## 2. How the 3D Voxel World Works

### A. Chunk Storage (`16 × 64 × 16` Voxels)
Instead of creating a separate Three.js `Mesh` for every single cube (which would crash the GPU after a few thousand blocks), `VoxelWorld` divides the world into **chunks** of size `16 × 64 × 16` (`16,384` blocks per chunk) stored as a flat `Uint8Array`.

### B. Procedural Biome & Ore Generation
When a chunk is generated in `VoxelWorld.generateChunk`:
1. **Biome Selection**: `getBiomeAt(wx, wz)` samples low-frequency 2D noise and distance from the origin `(0, 0)` to pick one of 5 biomes:
   - **Sylvan Glade** (Tier 1–2): Lush grass, oak trees, copper & tin near the spawn sanctuary.
   - **Crystal Frostpeaks** (Tier 3): Snow, ice, frostpine trees, and Frostcrystal/Mythril veins.
   - **Volcanic Caldera** (Tier 4): Basalt, glowing magma rivers, obsidian, and Ignis/Pyroclast ores.
   - **Void Badlands** (Tier 5): Shadowstone, void tendrils, and Eclipsium/Void Essences.
   - **Astral Highlands** (Tier 6): Starstone spires and Starsteel/Celestial ores.
2. **Spawn Sanctuary & Boss Altars**: Near `(6, 9)`, the generator builds a flat stone sanctuary with an **Ancient Forge** and **Sanctuary Pedestal**. Across the biomes, it stamps glowing **Boss Altars** (`Sylvan`, `Cryo`, `Magma`, `Void`, `Astral`) so you can also summon bosses by striking their altars.

### C. Hidden-Face Culling & Chunk Meshing
In `VoxelWorld.rebuildChunkMesh`:
- For every non-air block `(lx, ly, lz)`, the mesher checks its **6 neighbors** (`+X, -X, +Y, -Y, +Z, -Z`).
- A face is only added to the vertex buffer if the neighboring voxel is **transparent** (air, water, glass, leaves, or torches).
- This eliminates ~90% of unseen interior faces and packs an entire chunk into just two buffer geometries (one opaque mesh and one translucent water/glass mesh), keeping frame rates at a locked 60 FPS.

### D. Fast Voxel Raycasting
When you mine or place blocks, `VoxelWorld.raycast` steps along your camera's look vector in `0.05`-unit increments up to your tool's reach (`5.2` blocks), identifying both the hit voxel `(vx, vy, vz)` and the exact face normal `(nx, ny, nz)` so new blocks snap cleanly onto the face you clicked.

---

## 3. Procedural Pixel-Art Textures & 3D Models

### A. Canvas Texture Atlas
`ProceduralTextureManager` dynamically creates a `<canvas>` atlas where each block gets a `16×16` pixel tile painted with deterministic pixel noise, crystal facets, wood grain, or glowing lava veins. It sets `THREE.NearestFilter` (`magFilter` and `minFilter`) so every block has crisp, retro voxel pixel-art edges without blur.

### B. Articulated 3D Held Weapons, Monsters & Bosses
- **First-Person & Third-Person Weapons** (`PlayerController.buildHeldWeaponMesh`): Constructs multi-part 3D models out of Three.js primitives (`BoxGeometry`, `OctahedronGeometry`, `ConeGeometry`, `TorusGeometry`). Blades, scythes, pickaxes, and bows are oriented forward along `-Z` so swinging (`LMB`) cleaves forward across the crosshair.
- **Monsters & Bosses** (`EntityManager.createMonsterMesh` & `createBossMesh`): Builds hierarchical `THREE.Group` rigs with articulated limbs (`leftLeg`, `rightLeg`, `leftArm`, `rightArm`), glowing eye visors, horns, wings, and rotating boss halo rings (`TorusGeometry`) that animate with sine-wave walk cycles and attack swings.

---

## 4. Physics, Movement & Combat Engine

### A. Swept AABB Collision (Player Jump vs. Monster Auto-Jump)
- **Player Collision** (`PlayerController.moveWithCollision`): Resolves velocity along the **X**, **Z**, and **Y** axes independently against the player's bounding box (`0.65m` wide × `1.72m` tall). Horizontal collisions zero out velocity without auto-stepping, requiring you to press `Space` to jump over blocks.
- **Monster & Boss Auto-Jump** (`EntityManager.moveEntityWithAutoJump`): When a monster or grounded boss collides horizontally with a 1-block ledge while `onGround` is true, it automatically triggers an upward jump impulse (`velocity.y = 8.4`) so enemies never get stuck on terrain steps.

### B. Dash (`[Q]`) & Particle Trail
Pressing `[Q]` triggers `PlayerController.triggerDash`, launching you along your movement direction at `28+` speed, granting `0.34s` of invulnerability (`hurtInvulnTimer`), lowering air drag during `dashActiveTimer` so the launch carries you far across arenas, and emitting an expanding shockwave ring plus a 3-color particle trail (`#38bdf8`, `#c084fc`, `#fde047`).

### C. Daylight Cycle & Night Monster Spawning
In `AethelgardGame.updateDaylightCycle`:
- **Asymmetric Timer**: Day lasts **5 minutes (`300s`)** and Night lasts **1 minute (`60s`)**, with a live HUD countdown showing exact time until Nightfall or Dawn.
- **Night-Only Monsters**: `EntityManager.update` only spawns wild monsters when `isNight` is `true`. The moment Dawn breaks, all active wild monsters dissolve in a burst of golden sunlight particles.

---

## 5. Multi-Phase Boss AI & Progression Balance

All 5 bosses in `BOSSES` scale with the 6-tier weapon/armor progression:

| Tier | Boss | HP | Base DMG | Phases | Signature Mechanics |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **Tier 2** | **Sylvan Behemoth** | `1,150` | `34` | 2 Phases | `spore_barrage`, `root_slam` shockwave, `summon_stalkers` |
| **Tier 3** | **Cryonax, Frost Wyrm** | `2,800` | `56` | 3 Phases | `icicle_fan`, `frost_nova`, `blizzard_spiral`, `summon_crawlers` |
| **Tier 4** | **Ignis Rex, Magma Titan** | `6,400` | `92` | 3 Phases | `magma_volley` (7 explosive bolts), `lava_shockwave` + 10-fireball ring, `meteor_rain`, `summon_magma_brutes` |
| **Tier 5** | **Malakor, Void Harbinger** | `11,800` | `132` | 3 Phases | Homing `void_lance_barrage`, `gravity_crush` pull-in + 12-orb nova, `rift_teleport` ambush, `singularity_burst` |
| **Tier 6** | **Aethelgard, Astral Sovereign** | `22,500` | `178` | 4 Phases | Homing 9-bolt explosive `starlight_lance`, `cosmic_nova`, 9-bolt `meteor_rain`, 18-orb `supernova_cataclysm`, `summon_sentinels` |

To keep combat skill-based all the way through Tier 6:
- **Defense Cap (`60%`)**: Total damage reduction from armor + trinkets is capped at `60%` in `PlayerController.takeDamage`.
- **Tactical Potion Cooldown (`4.5s`)**: Drinking a healing salve/elixir triggers a `4.5s` cooldown (`potionCooldownTimer`) so players must dodge telegraphed boss attacks rather than spam-clicking potions.

---

## 6. Build Pipeline & GitHub Pages Deployment

1. **Local Development**:
   ```bash
   npm install
   npm run dev
   ```
   Vite serves `index.html` and hot-reloads TypeScript modules instantly.
2. **Production Build**:
   ```bash
   npm run build
   ```
   Runs `tsc` (strict TypeScript typecheck) followed by `vite build`, bundling everything into static assets in `dist/` with `base: './'` (`vite.config.ts`).
3. **Automated GitHub Pages Deployment**:
   Every push to `main` triggers `.github/workflows/deploy.yml`, which builds `dist/` on Ubuntu with Node 20 and deploys it live to `https://yhngong.github.io/3D-Game/`.
