import * as THREE from 'three';
import { BLOCKS, ITEMS } from '../data/itemsAndBlocks';
import { BlockDef, BlockId } from '../types';

export const TILE_SIZE = 16;
export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 8;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function shadeColor(hex: string, delta: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${clampByte(r + delta)}, ${clampByte(g + delta)}, ${clampByte(b + delta)})`;
}

export class TextureAtlasManager {
  public texture: THREE.CanvasTexture;
  private iconCache: Map<string, string> = new Map();

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_COLS * TILE_SIZE;
    canvas.height = ATLAS_ROWS * TILE_SIZE;
    const ctx = canvas.getContext('2d')!;

    // Render all blocks (each BlockId gets 3 tiles: top, side, bottom)
    Object.values(BLOCKS).forEach((block) => {
      if (block.id === BlockId.Air) return;
      this.drawBlockTile(ctx, block, 'top', this.getTileIndex(block.id, 'top'));
      this.drawBlockTile(ctx, block, 'side', this.getTileIndex(block.id, 'side'));
      this.drawBlockTile(ctx, block, 'bottom', this.getTileIndex(block.id, 'bottom'));
    });

    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;
  }

  public getTileIndex(blockId: BlockId, face: 'top' | 'side' | 'bottom'): number {
    const offset = face === 'top' ? 0 : face === 'side' ? 1 : 2;
    return blockId * 3 + offset;
  }

  public getTileUVs(blockId: BlockId, face: 'top' | 'side' | 'bottom'): [number, number, number, number] {
    const idx = this.getTileIndex(blockId, face);
    const col = idx % ATLAS_COLS;
    const row = Math.floor(idx / ATLAS_COLS);
    // Small inset to prevent texture bleeding
    const pad = 0.0015;
    const u0 = col / ATLAS_COLS + pad;
    const u1 = (col + 1) / ATLAS_COLS - pad;
    const v1 = 1 - row / ATLAS_ROWS - pad;
    const v0 = 1 - (row + 1) / ATLAS_ROWS + pad;
    return [u0, v0, u1, v1];
  }

  private drawBlockTile(
    ctx: CanvasRenderingContext2D,
    block: BlockDef,
    face: 'top' | 'side' | 'bottom',
    tileIdx: number
  ): void {
    const col = tileIdx % ATLAS_COLS;
    const row = Math.floor(tileIdx / ATLAS_COLS);
    const ox = col * TILE_SIZE;
    const oy = row * TILE_SIZE;

    const baseHex = face === 'top' ? block.colorTop : face === 'side' ? block.colorSide : block.colorBottom;
    const accentHex = block.accentColor || baseHex;

    // Deterministic pseudo-random per pixel
    let seed = block.id * 997 + (face === 'top' ? 1 : face === 'side' ? 2 : 3) * 131;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        let pixelColor = shadeColor(baseHex, (rand() - 0.5) * 22);

        if (block.pattern === 'grass' && face === 'side') {
          const grassDepth = 3 + Math.floor(rand() * 3);
          if (y < grassDepth) {
            pixelColor = shadeColor(block.colorTop, (rand() - 0.5) * 24);
          }
        } else if (block.pattern === 'log') {
          if (face === 'side') {
            const stripe = x % 4 === 0 ? -18 : (rand() - 0.5) * 16;
            pixelColor = shadeColor(baseHex, stripe);
          } else {
            const dx = x - 7.5;
            const dy = y - 7.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 6.5) pixelColor = block.colorSide;
            else if (Math.floor(dist) % 2 === 0) pixelColor = shadeColor(baseHex, -16);
          }
        } else if (block.pattern === 'brick') {
          const mortarY = y % 4 === 0;
          const mortarX = (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0;
          if (mortarY || mortarX) {
            pixelColor = shadeColor(accentHex, -25);
          }
        } else if (block.pattern === 'ore') {
          // Draw ore nuggets on stone base
          const isOreSpot =
            ((x >= 3 && x <= 5 && y >= 3 && y <= 5) ||
              (x >= 10 && x <= 12 && y >= 4 && y <= 6) ||
              (x >= 5 && x <= 8 && y >= 10 && y <= 12) ||
              (x >= 11 && x <= 13 && y >= 11 && y <= 13)) &&
            rand() > 0.2;
          if (isOreSpot) {
            pixelColor = shadeColor(accentHex, (rand() - 0.3) * 35);
          }
        } else if (block.pattern === 'crystal') {
          if (x === 0 || y === 0 || x === 15 || y === 15 || x + y === 15) {
            pixelColor = accentHex;
          }
        } else if (block.pattern === 'station') {
          if (face === 'top') {
            if (x === 0 || y === 0 || x === 15 || y === 15 || (x % 4 === 0 && y % 4 === 0)) {
              pixelColor = accentHex;
            }
          } else if (face === 'side') {
            if (y < 3) pixelColor = block.colorTop;
            else if (x >= 4 && x <= 11 && y >= 6 && y <= 13) {
              pixelColor = shadeColor(accentHex, (rand() - 0.4) * 30);
            }
          }
        } else if (block.pattern === 'magma') {
          const wave = Math.sin(x * 0.6 + y * 0.5);
          if (wave > 0.35) {
            pixelColor = accentHex;
          }
        }

        // Subtle pixel border for crisp voxel feel
        if (x === 0 || y === 0) {
          ctx.fillStyle = pixelColor;
        }
        ctx.fillStyle = pixelColor;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  public getItemIconDataUrl(itemId: string): string {
    const cached = this.iconCache.get(itemId);
    if (cached) return cached;

    const item = ITEMS[itemId];
    if (!item) return '';

    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext('2d')!;

    const p = item.primaryColor;
    const s = item.secondaryColor;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    switch (item.iconShape) {
      case 'block': {
        // Isometric 3D cube icon
        ctx.fillStyle = p;
        ctx.beginPath();
        ctx.moveTo(24, 6);
        ctx.lineTo(40, 15);
        ctx.lineTo(24, 24);
        ctx.lineTo(8, 15);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = shadeColor(s, -10);
        ctx.beginPath();
        ctx.moveTo(8, 15);
        ctx.lineTo(24, 24);
        ctx.lineTo(24, 42);
        ctx.lineTo(8, 33);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = shadeColor(s, -35);
        ctx.beginPath();
        ctx.moveTo(24, 24);
        ctx.lineTo(40, 15);
        ctx.lineTo(40, 33);
        ctx.lineTo(24, 42);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'pickaxe': {
        // Diagonal handle
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(10, 38);
        ctx.lineTo(34, 14);
        ctx.stroke();
        // Curved pick head
        ctx.strokeStyle = p;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(28, 20, 12, -Math.PI * 0.85, -Math.PI * 0.05);
        ctx.stroke();
        ctx.strokeStyle = s;
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }

      case 'axe': {
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(10, 38);
        ctx.lineTo(35, 13);
        ctx.stroke();

        ctx.fillStyle = p;
        ctx.beginPath();
        ctx.moveTo(28, 12);
        ctx.lineTo(40, 18);
        ctx.lineTo(34, 28);
        ctx.lineTo(22, 20);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'sword':
      case 'greatsword':
      case 'katana': {
        const wide = item.iconShape === 'greatsword' ? 7 : 4.5;
        // Blade
        ctx.strokeStyle = p;
        ctx.lineWidth = wide;
        ctx.beginPath();
        ctx.moveTo(14, 34);
        ctx.lineTo(39, 9);
        ctx.stroke();
        // Core highlight
        ctx.strokeStyle = s;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(16, 32);
        ctx.lineTo(38, 10);
        ctx.stroke();
        // Crossguard
        ctx.strokeStyle = s;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(11, 27);
        ctx.lineTo(21, 37);
        ctx.stroke();
        // Hilt
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(8, 40);
        ctx.lineTo(15, 33);
        ctx.stroke();
        break;
      }

      case 'scythe': {
        if (item.id === 'leviathan_trident') {
          // 3-Pronged Abyssal Sea-Trident Slot Icon!
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(9, 39);
          ctx.lineTo(31, 17);
          ctx.stroke();

          // Trident cross-crown
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(22, 14);
          ctx.quadraticCurveTo(28, 20, 34, 26);
          ctx.stroke();

          // 3 Barbed Turquoise Prongs
          ctx.strokeStyle = '#2dd4bf';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(30, 18);
          ctx.lineTo(41, 7);
          ctx.moveTo(24, 15);
          ctx.lineTo(34, 5);
          ctx.moveTo(33, 24);
          ctx.lineTo(43, 14);
          ctx.stroke();
          break;
        }

        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(10, 40);
        ctx.lineTo(34, 12);
        ctx.stroke();

        ctx.fillStyle = p;
        ctx.beginPath();
        ctx.moveTo(32, 10);
        ctx.quadraticCurveTo(14, 6, 8, 22);
        ctx.quadraticCurveTo(20, 16, 34, 16);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'hammer': {
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(10, 38);
        ctx.lineTo(32, 16);
        ctx.stroke();

        ctx.save();
        ctx.translate(31, 17);
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = p;
        ctx.fillRect(-11, -7, 22, 14);
        ctx.strokeStyle = s;
        ctx.lineWidth = 2;
        ctx.strokeRect(-11, -7, 22, 14);
        ctx.restore();
        break;
      }

      case 'bow': {
        ctx.strokeStyle = p;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(18, 24, 16, -Math.PI * 0.42, Math.PI * 0.42);
        ctx.stroke();

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(22, 9);
        ctx.lineTo(22, 39);
        ctx.stroke();

        ctx.strokeStyle = s;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(14, 24);
        ctx.lineTo(38, 24);
        ctx.stroke();
        break;
      }

      case 'staff': {
        ctx.strokeStyle = s;
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(10, 38);
        ctx.lineTo(34, 14);
        ctx.stroke();

        ctx.fillStyle = p;
        ctx.beginPath();
        ctx.arc(35, 13, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }

      case 'repeater':
      case 'cannon':
      case 'rifle': {
        ctx.fillStyle = p;
        ctx.beginPath();
        ctx.roundRect(8, 18, 32, 11, 3);
        ctx.fill();
        ctx.fillStyle = s;
        ctx.fillRect(14, 15, 22, 4);
        ctx.fillStyle = '#475569';
        ctx.fillRect(10, 28, 8, 10);
        break;
      }

      case 'armor': {
        // Chestplate silhouette
        ctx.fillStyle = p;
        ctx.beginPath();
        ctx.moveTo(12, 10);
        ctx.lineTo(20, 10);
        ctx.lineTo(24, 15);
        ctx.lineTo(28, 10);
        ctx.lineTo(36, 10);
        ctx.lineTo(40, 20);
        ctx.lineTo(34, 24);
        ctx.lineTo(34, 39);
        ctx.lineTo(14, 39);
        ctx.lineTo(14, 24);
        ctx.lineTo(8, 20);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = s;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        break;
      }

      case 'ingot': {
        ctx.fillStyle = p;
        ctx.beginPath();
        ctx.moveTo(14, 18);
        ctx.lineTo(36, 14);
        ctx.lineTo(40, 26);
        ctx.lineTo(10, 32);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = s;
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }

      case 'ore':
      case 'crystal': {
        ctx.fillStyle = p;
        ctx.beginPath();
        ctx.moveTo(24, 7);
        ctx.lineTo(38, 18);
        ctx.lineTo(33, 38);
        ctx.lineTo(15, 38);
        ctx.lineTo(10, 18);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = s;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        break;
      }

      case 'essence':
      case 'core': {
        if (item.id === 'sovereign_crown_shard') {
          // IMPERIAL CROWN OF AETHELGARD: Amethyst Velvet Cap + 5 Golden Spires + Seafoam Leviathan Gem!
          ctx.fillStyle = '#7e22ce';
          ctx.beginPath();
          ctx.arc(24, 28, 13, Math.PI, 0);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.moveTo(8, 35);
          ctx.lineTo(6, 17);
          ctx.lineTo(15, 25);
          ctx.lineTo(19, 13);
          ctx.lineTo(24, 23);
          ctx.lineTo(29, 13);
          ctx.lineTo(33, 25);
          ctx.lineTo(42, 17);
          ctx.lineTo(40, 35);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#ca8a04';
          ctx.lineWidth = 1.6;
          ctx.stroke();

          // Jeweled Royal Band & Center Teal Leviathan Gem
          ctx.fillStyle = '#eab308';
          ctx.fillRect(8, 33, 32, 6);
          ctx.strokeStyle = '#fef08a';
          ctx.strokeRect(8, 33, 32, 6);
          ctx.fillStyle = '#2dd4bf';
          ctx.beginPath();
          ctx.arc(24, 30, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#e879f9';
          ctx.fillRect(13, 34.5, 3, 3);
          ctx.fillRect(32, 34.5, 3, 3);
          // Floating Sovereign Star
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(24, 7, 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        const grad = ctx.createRadialGradient(24, 24, 3, 24, 24, 16);
        grad.addColorStop(0, s);
        grad.addColorStop(1, p);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(24, 24, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }

      case 'potion': {
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(20, 8, 8, 7);
        ctx.fillStyle = p;
        ctx.beginPath();
        ctx.arc(24, 28, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = s;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        break;
      }

      case 'totem': {
        if (item.id === 'tempest_totem') {
          // UNIQUE TEMPEST TOTEM SLOT ICON: Carved Storm-Thunderbird Totem Pole + Wings + Lightning Crest!
          // 1. Outstretched Multi-Tier Thunderbird Totem Wings
          ctx.fillStyle = '#0369a1';
          ctx.beginPath();
          ctx.moveTo(24, 18);
          ctx.lineTo(3, 13);
          ctx.lineTo(6, 22);
          ctx.lineTo(4, 27);
          ctx.lineTo(17, 29);
          ctx.lineTo(31, 29);
          ctx.lineTo(44, 27);
          ctx.lineTo(42, 22);
          ctx.lineTo(45, 13);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Wing feather notches
          ctx.strokeStyle = '#7dd3fc';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(7, 17);
          ctx.lineTo(15, 21);
          ctx.moveTo(8, 23);
          ctx.lineTo(16, 25);
          ctx.moveTo(41, 17);
          ctx.lineTo(33, 21);
          ctx.moveTo(40, 23);
          ctx.lineTo(32, 25);
          ctx.stroke();

          // 2. Carved Slate-Wood Totem Pole Trunk & Pedestal Base
          ctx.fillStyle = '#334155';
          ctx.fillRect(14, 40, 20, 5);
          ctx.fillStyle = '#475569';
          ctx.fillRect(16, 14, 16, 27);
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.6;
          ctx.strokeRect(16, 14, 16, 27);

          // Lower Totem Belly Rune Bands
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(17, 32, 14, 3);
          ctx.fillStyle = '#c084fc';
          ctx.fillRect(19, 36, 10, 3);

          // 3. Carved Storm-Spirit Totem Face (Brow, Glowing Cyan Eyes, Beak & Grimace)
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(15, 16, 18, 3); // Heavy totem brow ridge
          ctx.fillStyle = '#7dd3fc';
          ctx.fillRect(18, 20, 4, 3); // Left glowing storm eye
          ctx.fillRect(26, 20, 4, 3); // Right glowing storm eye
          // Carved Thunderbird Beak
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.moveTo(24, 21);
          ctx.lineTo(20, 27);
          ctx.lineTo(24, 30);
          ctx.lineTo(28, 27);
          ctx.closePath();
          ctx.fill();

          // 4. Storm Cloud Crown & Golden Lightning Bolt Crest + Raindrops
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(19, 11, 5, 0, Math.PI * 2);
          ctx.arc(25, 9, 6, 0, Math.PI * 2);
          ctx.arc(30, 11, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Lightning bolt striking from totem crown
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.moveTo(26, 2);
          ctx.lineTo(20, 10);
          ctx.lineTo(24, 10);
          ctx.lineTo(21, 16);
          ctx.lineTo(29, 8);
          ctx.lineTo(25, 8);
          ctx.closePath();
          ctx.fill();

          // Cyan raindrops beside wings
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(8, 6, 2, 4);
          ctx.fillRect(38, 6, 2, 4);
          ctx.fillRect(11, 33, 2, 4);
          ctx.fillRect(35, 33, 2, 4);
          break;
        }

        if (item.id === 'sundial_totem') {
          // SUNDIAL TOTEM: Split Day/Night Chronos Totem + Radiant Sun/Crescent Sundial Ring!
          // Left Golden Solar Wing & Right Lunar Silver-Blue Wing
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.moveTo(24, 21);
          ctx.lineTo(4, 17);
          ctx.lineTo(7, 27);
          ctx.lineTo(24, 27);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.moveTo(24, 21);
          ctx.lineTo(44, 17);
          ctx.lineTo(41, 27);
          ctx.lineTo(24, 27);
          ctx.closePath();
          ctx.fill();

          // Carved Cedar Totem Trunk (split warm/cool halves) & Pedestal
          ctx.fillStyle = '#78350f';
          ctx.fillRect(13, 40, 22, 5);
          ctx.fillStyle = '#b45309';
          ctx.fillRect(16, 18, 8, 23);
          ctx.fillStyle = '#1e3a8a';
          ctx.fillRect(24, 18, 8, 23);
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 1.4;
          ctx.strokeRect(16, 18, 16, 23);

          // Split Sun/Moon Totem Face
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(18, 22, 4, 3);
          ctx.fillStyle = '#bae6fd';
          ctx.fillRect(26, 22, 4, 3);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(19, 31, 10, 3);

          // Large Sundial Compass Ring + Sun Rays on Top
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(24, 10, 6.5, 0, Math.PI * 2);
          ctx.stroke();
          // Gnomon pointer needle
          ctx.beginPath();
          ctx.moveTo(24, 10);
          ctx.lineTo(28, 5);
          ctx.stroke();
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(24, 10, 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        if (item.id === 'totem_aethelgard') {
          // ASTRAL ZENITH CROWN: Regal 5-Spire Starsteel Royal Crown (NOT a wooden totem!)
          // Celestial Halo Ring hovering above crown
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(24, 8, 11, 3, 0, 0, Math.PI * 2);
          ctx.stroke();

          // 5 Pointed Golden Starsteel Crown Spires
          const crownGrad = ctx.createLinearGradient(8, 14, 40, 38);
          crownGrad.addColorStop(0, '#fef08a');
          crownGrad.addColorStop(0.5, '#facc15');
          crownGrad.addColorStop(1, '#d97706');
          ctx.fillStyle = crownGrad;
          ctx.beginPath();
          ctx.moveTo(7, 37);
          ctx.lineTo(5, 19);
          ctx.lineTo(13, 27);
          ctx.lineTo(17, 15);
          ctx.lineTo(21, 25);
          ctx.lineTo(24, 11);
          ctx.lineTo(27, 25);
          ctx.lineTo(31, 15);
          ctx.lineTo(35, 27);
          ctx.lineTo(43, 19);
          ctx.lineTo(41, 37);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#fef9c3';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Royal Circlet Base Rim
          ctx.fillStyle = '#b45309';
          ctx.fillRect(7, 34, 34, 6);
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(7, 34, 34, 6);

          // Glowing Star-Sapphire Jewels on Spire Tips & Center Diamond
          ctx.fillStyle = '#38bdf8';
          for (const [jx, jy] of [
            [5, 18],
            [17, 14],
            [24, 10],
            [31, 14],
            [43, 18],
          ]) {
            ctx.beginPath();
            ctx.arc(jx, jy, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
          // Center Starlight Jewel
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.moveTo(24, 25);
          ctx.lineTo(28, 30);
          ctx.lineTo(24, 35);
          ctx.lineTo(20, 30);
          ctx.closePath();
          ctx.fill();
          break;
        }

        if (item.id === 'totem_sylvan_behemoth') {
          // VERDANT EFFIGY (Boss I): Gnarled Living Treant Effigy with Roots & Leafy Canopy Antlers!
          // Lush Leafy Canopy Crown + Branch Antlers
          ctx.fillStyle = '#16a34a';
          ctx.beginPath();
          ctx.arc(16, 13, 6.5, 0, Math.PI * 2);
          ctx.arc(24, 10, 7.5, 0, Math.PI * 2);
          ctx.arc(32, 13, 6.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#4ade80';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Gnarled Ironwood Trunk & Splayed Roots at Base
          ctx.fillStyle = '#5c3a21';
          ctx.beginPath();
          ctx.moveTo(17, 16);
          ctx.lineTo(31, 16);
          ctx.lineTo(33, 36);
          ctx.lineTo(39, 43);
          ctx.lineTo(28, 42);
          ctx.lineTo(24, 38);
          ctx.lineTo(20, 42);
          ctx.lineTo(9, 43);
          ctx.lineTo(15, 36);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#3f2e1e';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Glowing Amber Treant Eyes & Emerald Heart-Seed
          ctx.fillStyle = '#facc15';
          ctx.fillRect(19, 21, 4, 3);
          ctx.fillRect(25, 21, 4, 3);
          ctx.fillStyle = '#4ade80';
          ctx.beginPath();
          ctx.moveTo(24, 27);
          ctx.lineTo(28, 32);
          ctx.lineTo(24, 37);
          ctx.lineTo(20, 32);
          ctx.closePath();
          ctx.fill();
          break;
        }

        if (item.id === 'totem_cryonax') {
          // PERMAFROST IDOL (Boss II): Sculpted Glacial Dragon-Skull Idol with Crystal Wings & Horns!
          // Swept-Back Ice Dragon Wings
          ctx.fillStyle = '#0284c7';
          ctx.beginPath();
          ctx.moveTo(24, 24);
          ctx.lineTo(4, 12);
          ctx.lineTo(9, 28);
          ctx.lineTo(24, 32);
          ctx.lineTo(39, 28);
          ctx.lineTo(44, 12);
          ctx.closePath();
          ctx.fill();

          //Swept Glacial Dragon Horns
          ctx.fillStyle = '#e0f2fe';
          ctx.beginPath();
          ctx.moveTo(18, 17);
          ctx.lineTo(10, 5);
          ctx.lineTo(22, 15);
          ctx.moveTo(30, 17);
          ctx.lineTo(38, 5);
          ctx.lineTo(26, 15);
          ctx.fill();

          // Crystalline Dragon Skull & Snout
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.moveTo(15, 16);
          ctx.lineTo(33, 16);
          ctx.lineTo(30, 36);
          ctx.lineTo(24, 42);
          ctx.lineTo(18, 36);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#f0f9ff';
          ctx.lineWidth = 1.6;
          ctx.stroke();

          // Glowing Dragon Eyes & Frost Fangs
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(18, 22, 4, 3);
          ctx.fillRect(26, 22, 4, 3);
          ctx.fillRect(20, 35, 2, 4);
          ctx.fillRect(26, 35, 2, 4);
          break;
        }

        if (item.id === 'totem_ignis_rex') {
          // CINDER SIGIL (Boss III): Volcanic Obsidian Centipede Medallion + Pincers + Molten Core!
          // Curved Molten Centipede Mandibles at Top & Sides
          ctx.strokeStyle = '#fb923c';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(24, 13, 9, Math.PI * 0.9, Math.PI * 0.1, false);
          ctx.stroke();

          // Octagonal Obsidian Sigil Tablet
          ctx.fillStyle = '#290f02';
          ctx.beginPath();
          ctx.moveTo(17, 12);
          ctx.lineTo(31, 12);
          ctx.lineTo(40, 21);
          ctx.lineTo(40, 33);
          ctx.lineTo(31, 42);
          ctx.lineTo(17, 42);
          ctx.lineTo(8, 33);
          ctx.lineTo(8, 21);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 2.2;
          ctx.stroke();

          // Centipede Segmented Lava Spine & Blazing Solar Core
          for (let seg = 0; seg < 3; seg++) {
            ctx.fillStyle = seg === 1 ? '#fef08a' : '#ea580c';
            ctx.fillRect(16, 18 + seg * 7, 16, 5);
            // Tiny centipede legs on sides
            ctx.strokeStyle = '#fde047';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(10, 20 + seg * 7);
            ctx.lineTo(15, 20 + seg * 7);
            ctx.moveTo(33, 20 + seg * 7);
            ctx.lineTo(38, 20 + seg * 7);
            ctx.stroke();
          }
          break;
        }

        if (item.id === 'totem_malakor') {
          // VOID RESONATOR (Boss IV): Abyssal Tuning-Fork Prongs + Levitating Singularity Eye!
          // Obsidian Handle & Base
          ctx.fillStyle = '#1e1b4b';
          ctx.fillRect(21, 31, 6, 12);
          ctx.fillRect(16, 40, 16, 4);

          // Twin Curved Violet Tuning-Fork Prongs
          ctx.strokeStyle = '#a855f7';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(13, 8);
          ctx.quadraticCurveTo(10, 31, 24, 31);
          ctx.quadraticCurveTo(38, 31, 35, 8);
          ctx.stroke();
          ctx.strokeStyle = '#f3e8ff';
          ctx.lineWidth = 1.4;
          ctx.stroke();

          // Orbiting Rift Ring + Levitating Singularity Eye
          ctx.strokeStyle = '#e879f9';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.ellipse(24, 18, 12, 4, -0.35, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#fae8ff';
          ctx.beginPath();
          ctx.arc(24, 18, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#581c87';
          ctx.fillRect(23, 14, 2, 8); // Slit void pupil
          break;
        }

        // Fallback Carved Totem Idol
        ctx.fillStyle = p;
        ctx.fillRect(16, 12, 16, 30);
        ctx.strokeStyle = s;
        ctx.strokeRect(16, 12, 16, 30);
        break;
      }

      case 'mount': {
        if (item.mountModelType === 'bee') {
          // Tier 1: Striped Bramble Honey-Hornet Mount Icon
          ctx.fillStyle = 'rgba(224, 242, 254, 0.88)';
          ctx.beginPath();
          ctx.ellipse(20, 13, 9, 5, -0.45, 0, Math.PI * 2);
          ctx.ellipse(29, 14, 8, 4.5, 0.45, 0, Math.PI * 2);
          ctx.fill();
          // Striped bee body + stinger
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.ellipse(24, 27, 14, 9, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#451a03';
          ctx.fillRect(17, 19, 4, 16);
          ctx.fillRect(25, 19, 4, 16);
          ctx.beginPath();
          ctx.moveTo(10, 27);
          ctx.lineTo(3, 27);
          ctx.lineTo(10, 30);
          ctx.fill();
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(33, 24, 3, 3);
          break;
        }

        if (item.mountModelType === 'ufo') {
          // Tier 5: Aetherium Rift-Saucer UFO Icon (Cosmic Car Key style!)
          // Tractor beam glow underneath
          ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
          ctx.beginPath();
          ctx.moveTo(16, 30);
          ctx.lineTo(32, 30);
          ctx.lineTo(38, 43);
          ctx.lineTo(10, 43);
          ctx.closePath();
          ctx.fill();

          // Glowing glass dome cockpit
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(24, 22, 10, Math.PI, 0);
          ctx.fill();
          ctx.strokeStyle = '#e0f2fe';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Metallic Aetherium Saucer Rim + Lights
          ctx.fillStyle = '#9333ea';
          ctx.beginPath();
          ctx.ellipse(24, 25, 19, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#f0abfc';
          ctx.lineWidth = 1.8;
          ctx.stroke();

          ctx.fillStyle = '#fde047';
          for (const lx of [11, 19, 29, 37]) {
            ctx.beginPath();
            ctx.arc(lx, 25, 2, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }

        // Winged Mounts: Owl (T2), Frost Sky-Drake (T3), Solar Phoenix (T4), Starsteel Leviathan (T6)
        ctx.fillStyle = p;
        ctx.beginPath();
        ctx.moveTo(24, 24);
        ctx.lineTo(4, 10);
        ctx.lineTo(7, 25);
        ctx.lineTo(14, 31);
        ctx.lineTo(24, 41);
        ctx.lineTo(34, 31);
        ctx.lineTo(41, 25);
        ctx.lineTo(44, 10);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = s;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Mount Head & Glowing Saddle Core
        ctx.fillStyle = s;
        ctx.beginPath();
        ctx.arc(24, 15, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(21, 14, 2, 2);
        ctx.fillRect(25, 14, 2, 2);
        if (item.mountModelType === 'star_drake') {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(24, 24, 16, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
    }

    ctx.restore();
    const url = canvas.toDataURL();
    this.iconCache.set(itemId, url);
    return url;
  }
}
