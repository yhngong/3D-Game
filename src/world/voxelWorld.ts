import * as THREE from 'three';
import { BLOCKS } from '../data/itemsAndBlocks';
import { TextureAtlasManager } from '../graphics/textureAtlas';
import { BiomeType, BlockId } from '../types';
import { SeededNoise } from './noise';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 48;
export const SEA_LEVEL = 14;

export interface RaycastHit {
  blockId: BlockId;
  voxel: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
}

interface ChunkData {
  cx: number;
  cz: number;
  voxels: Uint8Array;
  solidMesh: THREE.Mesh | null;
  transMesh: THREE.Mesh | null;
  dirty: boolean;
}

const FACES = [
  {
    dir: [0, 1, 0],
    faceType: 'top' as const,
    shade: 1.0,
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    dir: [0, -1, 0],
    faceType: 'bottom' as const,
    shade: 0.55,
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    dir: [0, 0, 1],
    faceType: 'side' as const,
    shade: 0.86,
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    dir: [0, 0, -1],
    faceType: 'side' as const,
    shade: 0.82,
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
  {
    dir: [1, 0, 0],
    faceType: 'side' as const,
    shade: 0.74,
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
  },
  {
    dir: [-1, 0, 0],
    faceType: 'side' as const,
    shade: 0.72,
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
];

export class VoxelWorld {
  public scene: THREE.Scene;
  public atlas: TextureAtlasManager;
  public noise: SeededNoise;
  public seed: number;

  private chunks: Map<string, ChunkData> = new Map();
  private modifiedBlocks: Map<string, BlockId> = new Map();
  private solidMaterial: THREE.MeshLambertMaterial;
  private transMaterial: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, atlas: TextureAtlasManager, seed = 2026) {
    this.scene = scene;
    this.atlas = atlas;
    this.seed = seed;
    this.noise = new SeededNoise(seed);

    this.solidMaterial = new THREE.MeshLambertMaterial({
      map: this.atlas.texture,
      vertexColors: true,
    });

    this.transMaterial = new THREE.MeshLambertMaterial({
      map: this.atlas.texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });

    this.loadModifiedBlocks();
  }

  private chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private blockKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  public getBiomeAt(x: number, z: number): BiomeType {
    const distFromOrigin = Math.hypot(x, z);
    if (distFromOrigin < 22) {
      return 'verdant_groves';
    }
    const temp = this.noise.fbm2D(x * 0.009 + 100, z * 0.009 + 100, 2);
    const weird = this.noise.fbm2D(x * 0.009 - 200, z * 0.009 - 200, 2);

    if (temp > 0.14 && weird > 0.05) return 'scorched_wastes';
    if (temp < -0.12 && weird > -0.1) return 'permafrost_peaks';
    if (weird < -0.14) return 'astral_rifts';
    return 'verdant_groves';
  }

  public getBiomeDisplayName(biome: BiomeType): string {
    switch (biome) {
      case 'verdant_groves':
        return 'Verdant Groves (Tier I–II)';
      case 'permafrost_peaks':
        return 'Permafrost Peaks (Tier III)';
      case 'scorched_wastes':
        return 'Scorched Magma Wastes (Tier IV)';
      case 'astral_rifts':
        return 'Astral Void Rifts (Tier V–VI)';
    }
  }

  public getSurfaceHeight(x: number, z: number): number {
    const biome = this.getBiomeAt(x, z);
    const n1 = this.noise.fbm2D(x * 0.022, z * 0.022, 3);
    const n2 = this.noise.noise2D(x * 0.06, z * 0.06);
    let base = 17 + n1 * 11 + n2 * 3;
    if (biome === 'permafrost_peaks') {
      base += 4 + Math.max(0, n1 * 7);
    } else if (biome === 'astral_rifts') {
      base += 2 + Math.sin(x * 0.08) * 2;
    }
    return Math.max(6, Math.min(WORLD_HEIGHT - 10, Math.floor(base)));
  }

  private generateChunk(cx: number, cz: number): ChunkData {
    const voxels = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    const setLocal = (lx: number, y: number, lz: number, id: BlockId) => {
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
      voxels[y * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx] = id;
    };
    const getLocal = (lx: number, y: number, lz: number): BlockId => {
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return BlockId.Air;
      return voxels[y * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx] as BlockId;
    };

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const biome = this.getBiomeAt(wx, wz);
        const surfY = this.getSurfaceHeight(wx, wz);

        for (let y = 0; y < WORLD_HEIGHT; y++) {
          if (y === 0) {
            setLocal(lx, y, lz, BlockId.Bedrock);
            continue;
          }

          if (y > surfY) {
            if (y <= SEA_LEVEL) {
              setLocal(
                lx,
                y,
                lz,
                biome === 'scorched_wastes' && y === SEA_LEVEL ? BlockId.MagmaBlock : BlockId.Water
              );
            }
            continue;
          }

          if (y === surfY) {
            if (surfY <= SEA_LEVEL + 1 && biome === 'verdant_groves') {
              setLocal(lx, y, lz, BlockId.Sand);
            } else if (biome === 'verdant_groves') {
              setLocal(lx, y, lz, BlockId.Grass);
            } else if (biome === 'permafrost_peaks') {
              setLocal(lx, y, lz, BlockId.SnowBlock);
            } else if (biome === 'scorched_wastes') {
              setLocal(lx, y, lz, this.noise.hash3(wx, y, wz) < 0.14 ? BlockId.MagmaBlock : BlockId.VolcanicRock);
            } else {
              setLocal(lx, y, lz, BlockId.Voidstone);
            }
            continue;
          }

          if (y >= surfY - 2) {
            if (biome === 'verdant_groves') setLocal(lx, y, lz, BlockId.Dirt);
            else if (biome === 'permafrost_peaks') setLocal(lx, y, lz, BlockId.PermafrostRock);
            else if (biome === 'scorched_wastes') setLocal(lx, y, lz, BlockId.VolcanicRock);
            else setLocal(lx, y, lz, BlockId.Voidstone);
            continue;
          }

          // Underground rock + ore generation
          const h = this.noise.hash3(wx, y, wz);
          // Shallow caves
          const caveNoise =
            this.noise.noise2D(wx * 0.08 + y * 0.11, wz * 0.08 - y * 0.09) +
            this.noise.noise2D(wx * 0.04, y * 0.12);
          if (y > 4 && y < surfY - 3 && caveNoise > 0.56) {
            setLocal(lx, y, lz, BlockId.Air);
            continue;
          }

          let block = BlockId.Stone;
          if (biome === 'permafrost_peaks' && y > 8) block = BlockId.PermafrostRock;
          if (biome === 'scorched_wastes' && y > 6) block = BlockId.VolcanicRock;
          if (biome === 'astral_rifts' && y > 6) block = BlockId.Voidstone;

          // Rich Ore Veins across depths & biomes so progression is always smooth and rewarding
          if (h < 0.048) {
            block = BlockId.CopperOre;
          } else if (h < 0.092) {
            block = BlockId.TinOre;
          } else if (h < 0.125 && (y < 16 || biome === 'permafrost_peaks')) {
            block = BlockId.MythrilOre;
          } else if (h < 0.148 && (y < 14 || biome === 'permafrost_peaks')) {
            block = BlockId.CryoCrystal;
          } else if (h < 0.172 && (y < 13 || biome === 'scorched_wastes')) {
            block = BlockId.PyroclastOre;
          } else if (h < 0.188 && (y < 12 || biome === 'scorched_wastes')) {
            block = BlockId.Obsidian;
          } else if (h < 0.208 && (y < 11 || biome === 'astral_rifts')) {
            block = BlockId.AetheriumOre;
          } else if (h < 0.222 && (y < 9 || biome === 'astral_rifts')) {
            block = BlockId.CelestialOre;
          }

          setLocal(lx, y, lz, block);
        }

        // Surface features (Trees, Crystal Spires, Ore Outcrops, Pillars)
        if (surfY > SEA_LEVEL + 1 && lx >= 2 && lx <= CHUNK_SIZE - 3 && lz >= 2 && lz <= CHUNK_SIZE - 3) {
          const distSpawn = Math.hypot(wx, wz);
          const featureHash = this.noise.hash3(wx, 99, wz);

          if (distSpawn > 6) {
            if (biome === 'verdant_groves' && featureHash < 0.025) {
              // Oak Tree with Sylvan Leaves
              const trunkH = 4 + Math.floor(this.noise.hash3(wx, 101, wz) * 2);
              for (let ty = 1; ty <= trunkH; ty++) {
                setLocal(lx, surfY + ty, lz, BlockId.OakLog);
              }
              for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                  for (let dy = trunkH - 1; dy <= trunkH + 1; dy++) {
                    if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === trunkH + 1) continue;
                    if (dx === 0 && dz === 0 && dy <= trunkH) continue;
                    setLocal(lx + dx, surfY + dy, lz + dz, BlockId.OakLeaves);
                  }
                }
              }
            } else if (biome === 'verdant_groves' && featureHash > 0.986) {
              // Surface Copper/Tin boulder outcrop for easy Tier 1->2 start!
              setLocal(lx, surfY + 1, lz, BlockId.CopperOre);
              setLocal(lx + 1, surfY + 1, lz, BlockId.TinOre);
              setLocal(lx, surfY + 2, lz, BlockId.MossyStone);
            } else if (biome === 'permafrost_peaks' && featureHash < 0.022) {
              // Glowing Cryo & Mythril Spire
              for (let ty = 1; ty <= 4; ty++) {
                setLocal(lx, surfY + ty, lz, ty === 4 ? BlockId.CryoCrystal : BlockId.MythrilOre);
              }
              setLocal(lx + 1, surfY + 1, lz, BlockId.CryoCrystal);
              setLocal(lx - 1, surfY + 1, lz, BlockId.CryoCrystal);
            } else if (biome === 'scorched_wastes' && featureHash < 0.022) {
              // Pyroclast Obsidian Pillar
              for (let ty = 1; ty <= 4; ty++) {
                setLocal(lx, surfY + ty, lz, ty >= 3 ? BlockId.PyroclastOre : BlockId.Obsidian);
              }
              setLocal(lx + 1, surfY + 1, lz, BlockId.MagmaBlock);
            } else if (biome === 'astral_rifts' && featureHash < 0.024) {
              // Astral Monolith with Aetherium & Celestial Ore
              for (let ty = 1; ty <= 5; ty++) {
                setLocal(
                  lx,
                  surfY + ty,
                  lz,
                  ty === 5 ? BlockId.CelestialOre : ty >= 3 ? BlockId.AetheriumOre : BlockId.AstralBrick
                );
              }
            }
          }
        }
      }
    }

    // Spawn Sanctuary Platform & Starter Shrine near (4, z, 4) in chunk (0, 0)
    if (cx === 0 && cz === 0) {
      const sy = this.getSurfaceHeight(6, 6);
      for (let x = 4; x <= 8; x++) {
        for (let z = 4; z <= 8; z++) {
          setLocal(x, sy, z, BlockId.MossyStone);
          for (let cy = sy + 1; cy < sy + 6; cy++) {
            setLocal(x, cy, z, BlockId.Air);
          }
        }
      }
      // Corner pillars with torches
      setLocal(4, sy + 1, 4, BlockId.OakLog);
      setLocal(4, sy + 2, 4, BlockId.Torch);
      setLocal(8, sy + 1, 4, BlockId.OakLog);
      setLocal(8, sy + 2, 4, BlockId.Torch);
      setLocal(4, sy + 1, 8, BlockId.OakLog);
      setLocal(4, sy + 2, 8, BlockId.Torch);
      setLocal(8, sy + 1, 8, BlockId.OakLog);
      setLocal(8, sy + 2, 8, BlockId.Torch);
      // Center Artisan Workbench + Starter Ore Node
      setLocal(6, sy + 1, 6, BlockId.Workbench);
      setLocal(5, sy + 1, 6, BlockId.CopperOre);
      setLocal(7, sy + 1, 6, BlockId.TinOre);
    }

    // Apply any user-modified blocks in this chunk
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const mod = this.modifiedBlocks.get(this.blockKey(wx, y, wz));
          if (mod !== undefined) {
            setLocal(lx, y, lz, mod);
          }
        }
      }
    }

    // Avoid unused warning for getLocal
    void getLocal;

    const chunk: ChunkData = {
      cx,
      cz,
      voxels,
      solidMesh: null,
      transMesh: null,
      dirty: true,
    };
    this.chunks.set(this.chunkKey(cx, cz), chunk);
    return chunk;
  }

  public getBlock(wx: number, wy: number, wz: number): BlockId {
    const x = Math.floor(wx);
    const y = Math.floor(wy);
    const z = Math.floor(wz);
    if (y < 0 || y >= WORLD_HEIGHT) return BlockId.Air;

    const mod = this.modifiedBlocks.get(this.blockKey(x, y, z));
    if (mod !== undefined) return mod;

    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    let chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) {
      chunk = this.generateChunk(cx, cz);
    }
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.voxels[y * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx] as BlockId;
  }

  public setBlock(wx: number, wy: number, wz: number, id: BlockId): void {
    const x = Math.floor(wx);
    const y = Math.floor(wy);
    const z = Math.floor(wz);
    if (y <= 0 || y >= WORLD_HEIGHT) return;

    this.modifiedBlocks.set(this.blockKey(x, y, z), id);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    let chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) {
      chunk = this.generateChunk(cx, cz);
    }
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.voxels[y * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx] = id;
    chunk.dirty = true;

    // Mark neighbor chunks dirty if on boundary
    if (lx === 0) this.markChunkDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markChunkDirty(cx + 1, cz);
    if (lz === 0) this.markChunkDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markChunkDirty(cx, cz + 1);

    this.saveModifiedBlocks();
  }

  private markChunkDirty(cx: number, cz: number): void {
    const c = this.chunks.get(this.chunkKey(cx, cz));
    if (c) c.dirty = true;
  }

  public updateChunksAroundPlayer(px: number, pz: number, radiusChunks = 3): void {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);

    const activeKeys = new Set<string>();
    let rebuiltCount = 0;

    for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = this.chunkKey(cx, cz);
        activeKeys.add(key);

        let chunk = this.chunks.get(key);
        if (!chunk) {
          chunk = this.generateChunk(cx, cz);
        }
        if (chunk.dirty && rebuiltCount < 4) {
          this.rebuildChunkMesh(chunk);
          rebuiltCount++;
        }
      }
    }

    // Hide distant chunk meshes
    for (const [key, chunk] of this.chunks.entries()) {
      const visible = activeKeys.has(key);
      if (chunk.solidMesh) chunk.solidMesh.visible = visible;
      if (chunk.transMesh) chunk.transMesh.visible = visible;
    }
  }

  private rebuildChunkMesh(chunk: ChunkData): void {
    chunk.dirty = false;

    if (chunk.solidMesh) {
      this.scene.remove(chunk.solidMesh);
      chunk.solidMesh.geometry.dispose();
      chunk.solidMesh = null;
    }
    if (chunk.transMesh) {
      this.scene.remove(chunk.transMesh);
      chunk.transMesh.geometry.dispose();
      chunk.transMesh = null;
    }

    const solidPos: number[] = [];
    const solidNorm: number[] = [];
    const solidUv: number[] = [];
    const solidCol: number[] = [];
    const solidIdx: number[] = [];

    const transPos: number[] = [];
    const transNorm: number[] = [];
    const transUv: number[] = [];
    const transCol: number[] = [];
    const transIdx: number[] = [];

    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const blockId = chunk.voxels[y * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx] as BlockId;
          if (blockId === BlockId.Air) continue;

          const blockDef = BLOCKS[blockId];
          const isTrans = !!blockDef.transparent;
          const wx = baseX + lx;
          const wz = baseZ + lz;

          for (const face of FACES) {
            const nx = wx + face.dir[0];
            const ny = y + face.dir[1];
            const nz = wz + face.dir[2];

            const neighborId = this.getBlock(nx, ny, nz);
            const neighborDef = BLOCKS[neighborId];

            if (isTrans) {
              // Transparent blocks only draw faces against Air
              if (neighborId !== BlockId.Air) continue;
            } else {
              // Solid blocks draw faces if neighbor is Air or Transparent
              if (neighborId !== BlockId.Air && !neighborDef.transparent) continue;
            }

            const posArr = isTrans ? transPos : solidPos;
            const normArr = isTrans ? transNorm : solidNorm;
            const uvArr = isTrans ? transUv : solidUv;
            const colArr = isTrans ? transCol : solidCol;
            const idxArr = isTrans ? transIdx : solidIdx;

            const vertOffset = posArr.length / 3;
            const [u0, v0, u1, v1] = this.atlas.getTileUVs(blockId, face.faceType);
            const shade = blockDef.emissive ? 1.0 : face.shade;

            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c];
              posArr.push(wx + corner[0], y + corner[1], wz + corner[2]);
              normArr.push(face.dir[0], face.dir[1], face.dir[2]);
              colArr.push(shade, shade, shade);
            }

            uvArr.push(u0, v0, u1, v0, u1, v1, u0, v1);
            idxArr.push(
              vertOffset,
              vertOffset + 1,
              vertOffset + 2,
              vertOffset,
              vertOffset + 2,
              vertOffset + 3
            );
          }
        }
      }
    }

    if (solidPos.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(solidPos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(solidNorm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(solidUv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(solidCol, 3));
      geo.setIndex(solidIdx);
      chunk.solidMesh = new THREE.Mesh(geo, this.solidMaterial);
      this.scene.add(chunk.solidMesh);
    }

    if (transPos.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(transPos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(transNorm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(transUv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(transCol, 3));
      geo.setIndex(transIdx);
      chunk.transMesh = new THREE.Mesh(geo, this.transMaterial);
      this.scene.add(chunk.transMesh);
    }
  }

  public raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 6.0): RaycastHit | null {
    const dir = direction.clone().normalize();
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;

    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

    let tMaxX = dir.x > 0 ? (x + 1 - origin.x) * tDeltaX : (origin.x - x) * tDeltaX;
    let tMaxY = dir.y > 0 ? (y + 1 - origin.y) * tDeltaY : (origin.y - y) * tDeltaY;
    let tMaxZ = dir.z > 0 ? (z + 1 - origin.z) * tDeltaZ : (origin.z - z) * tDeltaZ;

    let dist = 0;
    const normal = new THREE.Vector3(0, 0, 0);

    while (dist <= maxDistance) {
      const blockId = this.getBlock(x, y, z);
      if (blockId !== BlockId.Air && !BLOCKS[blockId].liquid) {
        return {
          blockId,
          voxel: new THREE.Vector3(x, y, z),
          normal,
          distance: dist,
        };
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          dist = tMaxX;
          tMaxX += tDeltaX;
          normal.set(-stepX, 0, 0);
        } else {
          z += stepZ;
          dist = tMaxZ;
          tMaxZ += tDeltaZ;
          normal.set(0, 0, -stepZ);
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY;
          dist = tMaxY;
          tMaxY += tDeltaY;
          normal.set(0, -stepY, 0);
        } else {
          z += stepZ;
          dist = tMaxZ;
          tMaxZ += tDeltaZ;
          normal.set(0, 0, -stepZ);
        }
      }
    }

    return null;
  }

  private saveModifiedBlocks(): void {
    try {
      const entries: [string, number][] = [];
      for (const [k, v] of this.modifiedBlocks.entries()) {
        entries.push([k, v]);
      }
      localStorage.setItem('aethelgard_world_mods', JSON.stringify(entries.slice(-3000)));
    } catch {
      // ignore storage quota errors
    }
  }

  private loadModifiedBlocks(): void {
    try {
      const raw = localStorage.getItem('aethelgard_world_mods');
      if (!raw) return;
      const entries = JSON.parse(raw) as [string, BlockId][];
      for (const [k, v] of entries) {
        this.modifiedBlocks.set(k, v);
      }
    } catch {
      // ignore corrupt storage
    }
  }

  public resetWorldMods(newSeed?: number): void {
    if (newSeed !== undefined) {
      this.seed = newSeed;
      this.noise = new SeededNoise(this.seed);
    }
    this.modifiedBlocks.clear();
    localStorage.removeItem('aethelgard_world_mods');
    for (const chunk of this.chunks.values()) {
      if (chunk.solidMesh) {
        this.scene.remove(chunk.solidMesh);
        chunk.solidMesh.geometry.dispose();
      }
      if (chunk.transMesh) {
        this.scene.remove(chunk.transMesh);
        chunk.transMesh.geometry.dispose();
      }
    }
    this.chunks.clear();
  }
}
