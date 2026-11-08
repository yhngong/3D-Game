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
        // Boss summoning relic star-sigil
        ctx.fillStyle = p;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          const r = i % 2 === 0 ? 18 : 9;
          const x = 24 + Math.cos(angle) * r;
          const y = 24 + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = s;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        break;
      }
    }

    ctx.restore();
    const url = canvas.toDataURL();
    this.iconCache.set(itemId, url);
    return url;
  }
}
