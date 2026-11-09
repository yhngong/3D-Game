import * as THREE from 'three';
import { sound } from '../audio/soundEngine';
import { BLOCKS, BOSSES, ITEMS, TIER_NAMES } from '../data/itemsAndBlocks';
import { PROGRESSION_GUIDE, RECIPES } from '../data/recipes';
import { EntityManager } from '../entities/monstersAndBosses';
import { PlayerController } from '../entities/player';
import { TextureAtlasManager } from '../graphics/textureAtlas';
import { BlockId, ProgressionTier } from '../types';

export class HudAndMenuManager {
  public player: PlayerController;
  public entities: EntityManager;
  public atlas: TextureAtlasManager;

  public isMenuOpen = false;
  public isWorldCreationOpen = false;
  public activeTab: 'craft' | 'codex' | 'help' = 'craft';
  public selectedCraftTier: ProgressionTier | 0 = 0;
  public selectedCraftCategory = 'all';
  private pendingWorldCheats = false;

  private hpFillEl!: HTMLElement;
  private hpTextEl!: HTMLElement;
  private manaFillEl!: HTMLElement;
  private manaTextEl!: HTMLElement;
  private armorBadgeEl!: HTMLElement;
  private dashBadgeEl!: HTMLElement;
  private daylightBadgeEl!: HTMLElement;

  private bossBarContainer!: HTMLElement;
  private bossNameEl!: HTMLElement;
  private bossPhaseEl!: HTMLElement;
  private bossHpFillEl!: HTMLElement;
  private bossHpTextEl!: HTMLElement;

  private trackerTierEl!: HTMLElement;
  private trackerBiomeEl!: HTMLElement;
  private trackerStepsEl!: HTMLElement;

  private targetBlockEl!: HTMLElement;
  private breakProgressWrap!: HTMLElement;
  private breakProgressFill!: HTMLElement;

  private hotbarContainer!: HTMLElement;
  private itemTooltipEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private floatingLayer!: HTMLElement;

  private modalOverlay!: HTMLElement;
  private modalContent!: HTMLElement;
  private worldCreateOverlay!: HTMLElement;

  constructor(player: PlayerController, entities: EntityManager, atlas: TextureAtlasManager) {
    this.player = player;
    this.entities = entities;
    this.atlas = atlas;

    this.buildDomStructure();
    this.openWorldCreationScreen();

    this.entities.onDamageNumber = (pos, amount, color, isCrit) => {
      this.spawnFloatingDamage(pos, amount, color, isCrit);
    };
    this.entities.onBannerNotification = (title, subtitle, color) => {
      this.showBanner(title, subtitle, color);
    };
  }

  private buildDomStructure(): void {
    const hud = document.getElementById('hud-root')!;
    hud.innerHTML = `
      <!-- Crosshair & Block Mining Bar -->
      <div class="crosshair-wrap">
        <div class="crosshair-plus"></div>
        <div id="target-block-label" class="target-block-label"></div>
        <div id="break-progress-wrap" class="break-progress-wrap" style="display:none;">
          <div id="break-progress-fill" class="break-progress-fill"></div>
        </div>
      </div>

      <!-- Top-Left Player Status -->
      <div class="hud-panel player-stats-panel">
        <div class="game-brand">AETHELGARD <span class="brand-sub">3D VOXEL REALMS</span></div>
        <div class="stat-bar-row">
          <span class="stat-label">HP</span>
          <div class="stat-bar-track">
            <div id="hp-fill" class="stat-bar-fill hp-fill"></div>
            <span id="hp-text" class="stat-bar-text">120 / 120</span>
          </div>
        </div>
        <div class="stat-bar-row">
          <span class="stat-label">MP</span>
          <div class="stat-bar-track">
            <div id="mana-fill" class="stat-bar-fill mana-fill"></div>
            <span id="mana-text" class="stat-bar-text">100 / 100</span>
          </div>
        </div>
        <div class="badges-row">
          <span id="armor-badge" class="hud-badge">DEF: 12%</span>
          <span id="dash-badge" class="hud-badge dash-ready">[Q] Dash Ready</span>
          <span id="daylight-badge" class="hud-badge">☀️ Day (Safe)</span>
        </div>
      </div>

      <!-- Top-Center Boss Health Bar -->
      <div id="boss-bar-container" class="boss-bar-container" style="display:none;">
        <div class="boss-bar-header">
          <span id="boss-name" class="boss-name">SYLVAN BEHEMOTH</span>
          <span id="boss-phase" class="boss-phase">Phase I</span>
        </div>
        <div class="boss-bar-track">
          <div id="boss-hp-fill" class="boss-bar-fill"></div>
          <span id="boss-hp-text" class="boss-bar-text">750 / 750</span>
        </div>
      </div>

      <!-- Top-Right Progression & Biome Tracker -->
      <div class="hud-panel progression-panel">
        <div id="tracker-tier" class="tracker-tier">Tier I: Timber & Flint</div>
        <div id="tracker-biome" class="tracker-biome">Biome: Verdant Groves</div>
        <ul id="tracker-steps" class="tracker-steps"></ul>
        <div class="tracker-keys">
          <span><kbd>E</kbd> Forge & Bag</span>
          <span><kbd>P</kbd> Boss Codex</span>
          <span id="key-hint-daylight" style="display:none;"><kbd>T</kbd> Day/Night</span>
          <span><kbd>RMB</kbd> Ability / Place</span>
        </div>
      </div>

      <!-- Center Announcement Banner -->
      <div id="hud-banner" class="hud-banner" style="display:none;"></div>

      <!-- Floating Damage Numbers Layer -->
      <div id="floating-layer" class="floating-layer"></div>

      <!-- Bottom Selected Item Info & 9-Slot Hotbar -->
      <div class="bottom-hud-wrap">
        <div id="item-tooltip" class="item-tooltip"></div>
        <div id="hotbar-container" class="hotbar-container"></div>
      </div>

      <!-- Fullscreen Modal Menu (Crafting, Inventory, Progression & Boss Codex) -->
      <div id="modal-overlay" class="modal-overlay" style="display:none;">
        <div class="modal-window">
          <div class="modal-header">
            <div class="modal-tabs">
              <button id="tab-btn-craft" class="modal-tab active">Astral Forge & Inventory [E]</button>
              <button id="tab-btn-codex" class="modal-tab">6-Tier Progression & Boss Codex [P]</button>
              <button id="tab-btn-help" class="modal-tab">Controls & World Settings</button>
            </div>
            <button id="modal-close-btn" class="modal-close-btn">Resume Game [ESC]</button>
          </div>
          <div id="modal-content" class="modal-content"></div>
        </div>
      </div>

      <!-- World Creation / Title Screen Overlay -->
      <div id="world-create-overlay" class="modal-overlay" style="display:none;"></div>
    `;

    this.hpFillEl = document.getElementById('hp-fill')!;
    this.hpTextEl = document.getElementById('hp-text')!;
    this.manaFillEl = document.getElementById('mana-fill')!;
    this.manaTextEl = document.getElementById('mana-text')!;
    this.armorBadgeEl = document.getElementById('armor-badge')!;
    this.dashBadgeEl = document.getElementById('dash-badge')!;
    this.daylightBadgeEl = document.getElementById('daylight-badge')!;

    this.bossBarContainer = document.getElementById('boss-bar-container')!;
    this.bossNameEl = document.getElementById('boss-name')!;
    this.bossPhaseEl = document.getElementById('boss-phase')!;
    this.bossHpFillEl = document.getElementById('boss-hp-fill')!;
    this.bossHpTextEl = document.getElementById('boss-hp-text')!;

    this.trackerTierEl = document.getElementById('tracker-tier')!;
    this.trackerBiomeEl = document.getElementById('tracker-biome')!;
    this.trackerStepsEl = document.getElementById('tracker-steps')!;

    this.targetBlockEl = document.getElementById('target-block-label')!;
    this.breakProgressWrap = document.getElementById('break-progress-wrap')!;
    this.breakProgressFill = document.getElementById('break-progress-fill')!;

    this.hotbarContainer = document.getElementById('hotbar-container')!;
    this.itemTooltipEl = document.getElementById('item-tooltip')!;
    this.bannerEl = document.getElementById('hud-banner')!;
    this.floatingLayer = document.getElementById('floating-layer')!;

    this.modalOverlay = document.getElementById('modal-overlay')!;
    this.modalContent = document.getElementById('modal-content')!;
    this.worldCreateOverlay = document.getElementById('world-create-overlay')!;

    document.getElementById('tab-btn-craft')!.addEventListener('click', () => {
      this.switchTab('craft');
    });
    document.getElementById('tab-btn-codex')!.addEventListener('click', () => {
      this.switchTab('codex');
    });
    document.getElementById('tab-btn-help')!.addEventListener('click', () => {
      this.switchTab('help');
    });
    document.getElementById('modal-close-btn')!.addEventListener('click', () => {
      this.toggleMenu(false);
    });

    this.renderHotbar();
  }

  public openWorldCreationScreen(): void {
    this.isWorldCreationOpen = true;
    this.isMenuOpen = true;
    this.modalOverlay.style.display = 'none';
    this.worldCreateOverlay.style.display = 'flex';
    document.exitPointerLock?.();
    this.pendingWorldCheats = false;
    this.renderWorldCreationScreen();
  }

  private renderWorldCreationScreen(): void {
    const hasSave = this.player.hasSavedWorld;
    const randomDefaultSeed = Math.floor(1000 + Math.random() * 900000);

    this.worldCreateOverlay.innerHTML = `
      <div class="world-create-card">
        <div class="world-create-title">AETHELGARD: REALMS OF THE ASTRAL FORGE</div>
        <div class="world-create-sub">3D Voxel Sandbox Action-RPG • 6 Custom Tiers • 5 Multi-Phase Bosses</div>

        ${
          hasSave
            ? `
          <div class="saved-world-box">
            <div>
              <div class="saved-world-name">Saved World: ${this.player.worldName}</div>
              <div class="saved-world-meta">
                Tier ${this.player.unlockedTier} • Seed: ${this.player.world.seed} • Cheats: 
                <strong style="color:${this.player.cheatsEnabled ? '#4ade80' : '#f87171'}">
                  ${this.player.cheatsEnabled ? 'ENABLED' : 'DISABLED (Survival)'}
                </strong>
              </div>
            </div>
            <button id="continue-world-btn" class="world-primary-btn">Continue Saved World</button>
          </div>
          <div class="world-divider"><span>OR CREATE A NEW WORLD</span></div>
        `
            : ''
        }

        <div class="world-form">
          <div class="world-field">
            <label>World Name</label>
            <input id="new-world-name" type="text" value="New Aethelgard Realm" maxlength="32" class="world-input" />
          </div>
          <div class="world-field">
            <label>World Seed</label>
            <div style="display:flex; gap:8px;">
              <input id="new-world-seed" type="number" value="${randomDefaultSeed}" class="world-input" />
              <button id="rand-seed-btn" type="button" class="codex-btn kit-btn">Randomize</button>
            </div>
          </div>
          <div class="world-field">
            <label>Allow Cheats (Grant Items & Instant Boss Summons)</label>
            <button id="toggle-world-cheats-btn" type="button" class="cheats-toggle-btn ${
              this.pendingWorldCheats ? 'on' : 'off'
            }">
              Allow Cheats: ${this.pendingWorldCheats ? 'ON (Creative / Item Grant Unlocked)' : 'OFF (Legitimate Survival Progression)'}
            </button>
            <div class="cheats-hint">
              ${
                this.pendingWorldCheats
                  ? '⚡ You will be able to grant yourself any Item, Tier Gear Kit, or summon Bosses directly from the Codex [P].'
                  : '🔒 You cannot grant yourself items. All weapons, armor, and Boss Relics must be mined and forged legitimately!'
              }
            </div>
          </div>

          <button id="create-world-submit-btn" type="button" class="world-create-submit-btn">
            Create New World & Play
          </button>
        </div>
      </div>
    `;

    const continueBtn = document.getElementById('continue-world-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        this.isWorldCreationOpen = false;
        this.isMenuOpen = false;
        this.worldCreateOverlay.style.display = 'none';
        const canvas = document.querySelector('canvas');
        canvas?.requestPointerLock?.();
      });
    }

    document.getElementById('rand-seed-btn')!.addEventListener('click', () => {
      const seedInput = document.getElementById('new-world-seed') as HTMLInputElement;
      seedInput.value = String(Math.floor(1000 + Math.random() * 900000));
    });

    const cheatBtn = document.getElementById('toggle-world-cheats-btn')!;
    cheatBtn.addEventListener('click', () => {
      const nameVal = (document.getElementById('new-world-name') as HTMLInputElement).value;
      const seedVal = (document.getElementById('new-world-seed') as HTMLInputElement).value;
      this.pendingWorldCheats = !this.pendingWorldCheats;
      this.renderWorldCreationScreen();
      (document.getElementById('new-world-name') as HTMLInputElement).value = nameVal;
      (document.getElementById('new-world-seed') as HTMLInputElement).value = seedVal;
    });

    document.getElementById('create-world-submit-btn')!.addEventListener('click', () => {
      const nameVal = (document.getElementById('new-world-name') as HTMLInputElement).value || 'New Aethelgard Realm';
      const seedVal = Number((document.getElementById('new-world-seed') as HTMLInputElement).value) || 2026;

      this.player.createNewWorld(nameVal, seedVal, this.pendingWorldCheats);
      for (let i = 0; i < 12; i++) {
        this.player.world.updateChunksAroundPlayer(this.player.position.x, this.player.position.z, 3);
      }
      this.renderHotbar();

      this.isWorldCreationOpen = false;
      this.isMenuOpen = false;
      this.worldCreateOverlay.style.display = 'none';
      const canvas = document.querySelector('canvas');
      canvas?.requestPointerLock?.();

      this.showBanner(
        `WELCOME TO ${this.player.worldName.toUpperCase()}`,
        this.player.cheatsEnabled
          ? 'Cheats Enabled — Open Codex [P] anytime to grant items or gear!'
          : 'Survival Mode (Cheats OFF) — Mine ores & forge gear at [E]!',
        this.player.cheatsEnabled ? '#4ade80' : '#38bdf8'
      );
    });
  }

  public toggleMenu(forceState?: boolean, tab?: 'craft' | 'codex' | 'help'): void {
    if (this.isWorldCreationOpen) return;
    this.isMenuOpen = forceState !== undefined ? forceState : !this.isMenuOpen;
    if (tab) this.activeTab = tab;

    if (this.isMenuOpen) {
      document.exitPointerLock?.();
      this.modalOverlay.style.display = 'flex';
      this.switchTab(this.activeTab);
    } else {
      this.modalOverlay.style.display = 'none';
      const canvas = document.querySelector('canvas');
      canvas?.requestPointerLock?.();
    }
  }

  public switchTab(tab: 'craft' | 'codex' | 'help'): void {
    this.activeTab = tab;
    document.getElementById('tab-btn-craft')!.classList.toggle('active', tab === 'craft');
    document.getElementById('tab-btn-codex')!.classList.toggle('active', tab === 'codex');
    document.getElementById('tab-btn-help')!.classList.toggle('active', tab === 'help');
    this.renderModalContent();
  }

  public updateHud(
    targetBlockId: BlockId | null,
    breakProgress: number,
    isNightTime = false,
    timeOfDay = 0.25
  ): void {
    // Player HP / MP / Armor / Dash / Daylight Cycle
    const hpPct = Math.max(0, Math.min(100, (this.player.hp / this.player.maxHp) * 100));
    this.hpFillEl.style.width = `${hpPct}%`;
    this.hpTextEl.textContent = `${Math.ceil(this.player.hp)} / ${this.player.maxHp}`;

    const mpPct = Math.max(0, Math.min(100, (this.player.mana / this.player.maxMana) * 100));
    this.manaFillEl.style.width = `${mpPct}%`;
    this.manaTextEl.textContent = `${Math.floor(this.player.mana)} / ${this.player.maxMana}`;

    const armorDef = this.player.equippedArmorId ? ITEMS[this.player.equippedArmorId] : null;
    this.armorBadgeEl.textContent = `DEF: ${this.player.defense}% (${armorDef ? armorDef.name : 'Unarmored'})`;

    if (this.player.dashCooldownTimer <= 0) {
      this.dashBadgeEl.textContent = '[Q] Shadow Dash: READY';
      this.dashBadgeEl.className = 'hud-badge dash-ready';
    } else {
      this.dashBadgeEl.textContent = `[Q] Dash: ${this.player.dashCooldownTimer.toFixed(1)}s`;
      this.dashBadgeEl.className = 'hud-badge';
    }

    // Format 24-hour clock from timeOfDay (0 = 6:00 AM, 0.25 = 12:00 PM, 0.5 = 6:00 PM, 0.75 = 12:00 AM)
    const totalHours = Math.floor(((timeOfDay * 24 + 6) % 24));
    const displayHour = totalHours % 12 === 0 ? 12 : totalHours % 12;
    const amPm = totalHours >= 12 ? 'PM' : 'AM';
    if (isNightTime) {
      this.daylightBadgeEl.textContent = `🌙 Night (${displayHour}:00 ${amPm}) — Monsters Spawning!`;
      this.daylightBadgeEl.style.borderColor = '#c084fc';
      this.daylightBadgeEl.style.color = '#e9d5ff';
    } else {
      this.daylightBadgeEl.textContent = `☀️ Day (${displayHour}:00 ${amPm}) — Safe`;
      this.daylightBadgeEl.style.borderColor = '#fde047';
      this.daylightBadgeEl.style.color = '#fef08a';
    }

    // Target Block & Mining Progress
    if (targetBlockId !== null && targetBlockId !== BlockId.Air) {
      const bDef = BLOCKS[targetBlockId];
      const tierInfo = bDef.minToolTier > 0 ? ` (Req. Tier ${bDef.minToolTier} Pick)` : '';
      this.targetBlockEl.textContent = `${bDef.name}${tierInfo}`;
    } else {
      this.targetBlockEl.textContent = '';
    }

    if (breakProgress > 0) {
      this.breakProgressWrap.style.display = 'block';
      this.breakProgressFill.style.width = `${Math.min(100, breakProgress * 100)}%`;
    } else {
      this.breakProgressWrap.style.display = 'none';
    }

    // Active Boss Bar
    const boss = this.entities.activeBoss;
    if (boss) {
      this.bossBarContainer.style.display = 'block';
      this.bossNameEl.textContent = `${boss.def.name.toUpperCase()} — ${boss.def.title}`;
      this.bossPhaseEl.textContent = boss.def.phases[boss.phaseIndex]?.name || 'Phase I';
      const bPct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
      this.bossHpFillEl.style.width = `${bPct}%`;
      this.bossHpFillEl.style.background = `linear-gradient(90deg, ${boss.def.accentColor}, ${boss.def.glowColor})`;
      this.bossHpTextEl.textContent = `${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp}`;
    } else {
      this.bossBarContainer.style.display = 'none';
    }

    // Progression & Biome Tracker
    const tierMeta = TIER_NAMES[this.player.unlockedTier];
    this.trackerTierEl.textContent = tierMeta.name;
    this.trackerTierEl.style.color = tierMeta.color;

    const biome = this.player.world.getBiomeAt(this.player.position.x, this.player.position.z);
    this.trackerBiomeEl.textContent = `Biome: ${this.player.world.getBiomeDisplayName(biome)} | Pos: ${Math.floor(
      this.player.position.x
    )}, ${Math.floor(this.player.position.y)}, ${Math.floor(this.player.position.z)}`;

    const guide = PROGRESSION_GUIDE[this.player.unlockedTier];
    this.trackerStepsEl.innerHTML = guide.steps.map((s) => `<li>${s}</li>`).join('');

    const dayHintEl = document.getElementById('key-hint-daylight');
    if (dayHintEl) {
      dayHintEl.style.display = this.player.cheatsEnabled ? 'inline' : 'none';
    }
  }

  public renderHotbar(): void {
    let html = '';
    for (let i = 0; i < 9; i++) {
      const slot = this.player.inventory[i];
      const isSelected = i === this.player.selectedHotbarIndex;
      const itemDef = slot ? ITEMS[slot.itemId] : null;
      const iconUrl = slot ? this.atlas.getItemIconDataUrl(slot.itemId) : '';
      const tierColor = itemDef ? TIER_NAMES[itemDef.tier].color : '#475569';

      html += `
        <div class="hotbar-slot ${isSelected ? 'selected' : ''}" data-slot="${i}" style="border-color: ${
        isSelected ? tierColor : 'rgba(148,163,184,0.28)'
      }">
          <span class="slot-key">${i + 1}</span>
          ${
            slot && itemDef
              ? `<img src="${iconUrl}" alt="${itemDef.name}" class="slot-icon" />
                 ${slot.count > 1 ? `<span class="slot-count">${slot.count}</span>` : ''}`
              : ''
          }
        </div>
      `;
    }
    this.hotbarContainer.innerHTML = html;

    this.hotbarContainer.querySelectorAll('.hotbar-slot').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number((el as HTMLElement).dataset.slot);
        this.player.selectedHotbarIndex = idx;
        this.renderHotbar();
      });
    });

    // Update Selected Item Tooltip
    const sel = this.player.getSelectedItemDef();
    if (sel) {
      const tierColor = TIER_NAMES[sel.tier].color;
      const stats: string[] = [];
      if (sel.damage) stats.push(`⚔️ ${sel.damage} DMG`);
      if (sel.toolTier) stats.push(`⛏️ Mining Tier ${sel.toolTier} (${sel.miningSpeed}x)`);
      if (sel.healHp) stats.push(`💚 +${sel.healHp} HP / +${sel.healMana} MP`);
      const abilityInfo = sel.ability ? `<div class="tooltip-ability">✨ ${sel.ability.description}</div>` : '';

      this.itemTooltipEl.innerHTML = `
        <div class="tooltip-header">
          <span class="tooltip-name" style="color:${tierColor}">${sel.name}</span>
          <span class="tooltip-stats">${stats.join(' • ')}</span>
        </div>
        ${abilityInfo}
      `;
    } else {
      this.itemTooltipEl.innerHTML = `<div class="tooltip-header"><span class="tooltip-name">Empty Hand</span></div>`;
    }
  }

  private renderModalContent(): void {
    if (this.activeTab === 'craft') {
      this.renderCraftingAndInventoryTab();
    } else if (this.activeTab === 'codex') {
      this.renderCodexTab();
    } else {
      this.renderHelpTab();
    }
  }

  private renderCraftingAndInventoryTab(): void {
    const filteredRecipes = RECIPES.filter((r) => {
      if (this.selectedCraftTier !== 0 && r.tier !== this.selectedCraftTier) return false;
      if (this.selectedCraftCategory !== 'all' && r.category !== this.selectedCraftCategory) return false;
      return true;
    });

    const recipesHtml = filteredRecipes
      .map((r) => {
        const resItem = ITEMS[r.resultItemId];
        const canMake = this.player.canCraft(r);
        const iconUrl = this.atlas.getItemIconDataUrl(r.resultItemId);
        const tierMeta = TIER_NAMES[r.tier];

        const ingsHtml = r.ingredients
          .map((ing) => {
            const have = this.player.getItemCount(ing.itemId);
            const ingDef = ITEMS[ing.itemId];
            const ok = have >= ing.count;
            return `<span class="ing-pill ${ok ? 'ing-ok' : 'ing-missing'}">${ingDef.name}: ${have}/${ing.count}</span>`;
          })
          .join('');

        return `
          <div class="recipe-card ${canMake ? 'craftable' : ''}">
            <div class="recipe-card-left">
              <img src="${iconUrl}" class="recipe-icon" alt="${resItem.name}" />
              <div>
                <div class="recipe-title" style="color:${tierMeta.color}">
                  ${resItem.name} ${r.resultCount > 1 ? `x${r.resultCount}` : ''}
                  <span class="recipe-tier-badge">Tier ${r.tier}</span>
                </div>
                <div class="recipe-desc">${resItem.description}</div>
                <div class="recipe-ings">${ingsHtml}</div>
              </div>
            </div>
            <button class="craft-btn ${canMake ? 'ready' : 'disabled'}" data-recipe-id="${r.id}">
              ${canMake ? 'Forge / Craft' : 'Need Materials'}
            </button>
          </div>
        `;
      })
      .join('');

    // Inventory Grid (Hotbar 0..8 + Backpack 9..35)
    let invGridHtml = '';
    for (let i = 0; i < 36; i++) {
      const slot = this.player.inventory[i];
      const itemDef = slot ? ITEMS[slot.itemId] : null;
      const iconUrl = slot ? this.atlas.getItemIconDataUrl(slot.itemId) : '';
      const isHotbar = i < 9;
      invGridHtml += `
        <div class="inv-cell ${isHotbar ? 'inv-hotbar-cell' : ''}" data-inv-index="${i}" title="${
        itemDef ? `${itemDef.name}: ${itemDef.description}` : 'Empty Slot'
      }">
          ${isHotbar ? `<span class="inv-cell-num">${i + 1}</span>` : ''}
          ${
            slot && itemDef
              ? `<img src="${iconUrl}" class="inv-cell-icon" />
                 <span class="inv-cell-count">${slot.count}</span>`
              : ''
          }
        </div>
      `;
    }

    const armorDef = this.player.equippedArmorId ? ITEMS[this.player.equippedArmorId] : null;
    const armorIcon = this.player.equippedArmorId ? this.atlas.getItemIconDataUrl(this.player.equippedArmorId) : '';

    this.modalContent.innerHTML = `
      <div class="craft-layout">
        <!-- Left: Crafting & Smelting Recipes -->
        <div class="craft-column">
          <div class="filter-bar">
            <select id="craft-tier-filter" class="modal-select">
              <option value="0" ${this.selectedCraftTier === 0 ? 'selected' : ''}>All 6 Tiers</option>
              <option value="1" ${this.selectedCraftTier === 1 ? 'selected' : ''}>Tier I: Timber & Flint</option>
              <option value="2" ${this.selectedCraftTier === 2 ? 'selected' : ''}>Tier II: Verdant Bronze</option>
              <option value="3" ${this.selectedCraftTier === 3 ? 'selected' : ''}>Tier III: Frostforged Mythril</option>
              <option value="4" ${this.selectedCraftTier === 4 ? 'selected' : ''}>Tier IV: Solar Pyroclast</option>
              <option value="5" ${this.selectedCraftTier === 5 ? 'selected' : ''}>Tier V: Void Aetherium</option>
              <option value="6" ${this.selectedCraftTier === 6 ? 'selected' : ''}>Tier VI: Celestial Starsteel</option>
            </select>
            <select id="craft-cat-filter" class="modal-select">
              <option value="all" ${this.selectedCraftCategory === 'all' ? 'selected' : ''}>All Categories</option>
              <option value="melee" ${this.selectedCraftCategory === 'melee' ? 'selected' : ''}>Melee Weapons</option>
              <option value="ranged" ${this.selectedCraftCategory === 'ranged' ? 'selected' : ''}>Ranged & Magic</option>
              <option value="tool" ${this.selectedCraftCategory === 'tool' ? 'selected' : ''}>Pickaxes & Axes</option>
              <option value="armor" ${this.selectedCraftCategory === 'armor' ? 'selected' : ''}>Armor Sets</option>
              <option value="boss_relic" ${this.selectedCraftCategory === 'boss_relic' ? 'selected' : ''}>Boss Summon Relics</option>
              <option value="material" ${this.selectedCraftCategory === 'material' ? 'selected' : ''}>Ingots & Materials</option>
              <option value="block" ${this.selectedCraftCategory === 'block' ? 'selected' : ''}>Blocks & Forges</option>
            </select>
          </div>
          <div class="recipe-list">${recipesHtml}</div>
        </div>

        <!-- Right: Equipped Armor & 36-Slot Inventory -->
        <div class="inventory-column">
          <div class="equipped-armor-box">
            ${armorIcon ? `<img src="${armorIcon}" class="armor-box-icon" />` : ''}
            <div>
              <div class="armor-box-title">Equipped Armor: ${armorDef ? armorDef.name : 'None'}</div>
              <div class="armor-box-bonus">${armorDef?.setBonusText || 'Craft an Armor Set to gain Defense, Max HP & Double-Jump/Flight!'}</div>
            </div>
          </div>
          <div class="inv-help-note">Click any item in your Backpack to swap it with your active Hotbar slot (#${
            this.player.selectedHotbarIndex + 1
          }), or click an Armor Set to equip it!</div>
          <div class="inv-grid">${invGridHtml}</div>
        </div>
      </div>
    `;

    document.getElementById('craft-tier-filter')!.addEventListener('change', (e) => {
      this.selectedCraftTier = Number((e.target as HTMLSelectElement).value) as ProgressionTier | 0;
      this.renderCraftingAndInventoryTab();
    });
    document.getElementById('craft-cat-filter')!.addEventListener('change', (e) => {
      this.selectedCraftCategory = (e.target as HTMLSelectElement).value;
      this.renderCraftingAndInventoryTab();
    });

    this.modalContent.querySelectorAll('.craft-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const recipeId = (btn as HTMLElement).dataset.recipeId!;
        const recipe = RECIPES.find((r) => r.id === recipeId);
        if (recipe && this.player.craftRecipe(recipe)) {
          this.renderHotbar();
          this.renderCraftingAndInventoryTab();
        }
      });
    });

    this.modalContent.querySelectorAll('.inv-cell').forEach((cell) => {
      cell.addEventListener('click', () => {
        const idx = Number((cell as HTMLElement).dataset.invIndex);
        const slot = this.player.inventory[idx];
        if (slot) {
          const def = ITEMS[slot.itemId];
          if (def.category === 'armor') {
            const prevArmor = this.player.equippedArmorId;
            this.player.equippedArmorId = def.id;
            this.player.inventory[idx] = prevArmor ? { itemId: prevArmor, count: 1 } : null;
            this.player.recalculateStats();
            sound.playPickup();
            this.renderHotbar();
            this.renderCraftingAndInventoryTab();
            return;
          }
        }
        // Swap clicked slot with currently selected hotbar slot
        const activeIdx = this.player.selectedHotbarIndex;
        if (idx !== activeIdx) {
          const tmp = this.player.inventory[activeIdx];
          this.player.inventory[activeIdx] = this.player.inventory[idx];
          this.player.inventory[idx] = tmp;
          this.player.savePlayerState();
          this.renderHotbar();
          this.renderCraftingAndInventoryTab();
        }
      });
    });
  }

  private renderCodexTab(): void {
    const tiers: ProgressionTier[] = [1, 2, 3, 4, 5, 6];
    const cheatsOn = this.player.cheatsEnabled;

    const itemOptionsHtml = Object.values(ITEMS)
      .map((item) => `<option value="${item.id}">[Tier ${item.tier}] ${item.name}</option>`)
      .join('');

    const cardsHtml = tiers
      .map((t) => {
        const meta = TIER_NAMES[t];
        const guide = PROGRESSION_GUIDE[t];
        const boss = BOSSES[guide.bossId];
        const defeated = boss && this.player.defeatedBosses.has(boss.id);

        return `
          <div class="codex-card" style="border-left: 4px solid ${meta.color}">
            <div class="codex-card-header">
              <div>
                <div class="codex-tier-title" style="color:${meta.color}">${meta.name}</div>
                <div class="codex-tier-sub">${meta.subtitle}</div>
              </div>
              <div class="codex-actions">
                ${
                  cheatsOn
                    ? `
                      <button class="codex-btn kit-btn" data-kit-tier="${t}">Grant Tier ${t} Gear Kit</button>
                      ${
                        boss
                          ? `<button class="codex-btn summon-btn" data-summon-boss="${boss.id}">Summon ${boss.name}</button>`
                          : ''
                      }
                    `
                    : `<span class="cheats-locked-pill">🔒 Cheats Disabled</span>`
                }
              </div>
            </div>
            <p class="codex-summary">${guide.summary}</p>
            ${
              boss
                ? `<div class="codex-boss-box">
                    <strong>Boss: ${boss.name}, ${boss.title} (${boss.maxHp} HP)</strong>
                    ${defeated ? `<span class="boss-defeated-tag">✓ VANQUISHED</span>` : ''}
                    <div class="codex-boss-lore">${boss.lore}</div>
                  </div>`
                : ''
            }
          </div>
        `;
      })
      .join('');

    this.modalContent.innerHTML = `
      <div class="codex-wrap">
        <div class="codex-intro">
          <h3>Aethelgard Custom 6-Tier Progression (No Netherite • No Ender Dragon)</h3>
          ${
            cheatsOn
              ? `
                <div class="cheat-spawner-bar">
                  <span>⚡ <strong>Cheats Enabled (${this.player.worldName}):</strong> Grant yourself any item or Tier Kit:</span>
                  <div style="display:flex; gap:8px; align-items:center;">
                    <select id="cheat-item-select" class="modal-select">${itemOptionsHtml}</select>
                    <input id="cheat-item-count" type="number" value="1" min="1" max="99" class="world-input" style="width:70px; padding:6px;" />
                    <button id="grant-single-item-btn" class="codex-btn kit-btn">Grant Item</button>
                  </div>
                </div>
              `
              : `
                <div class="cheat-locked-banner">
                  🔒 <strong>Cheats are DISABLED in "${this.player.worldName}".</strong> Item granting is locked. To grant yourself items, click <em>Controls & World Settings → Create New World</em> and set <strong>Allow Cheats: ON</strong>.
                </div>
              `
          }
        </div>
        <div class="codex-grid">${cardsHtml}</div>
      </div>
    `;

    if (cheatsOn) {
      const grantSingleBtn = document.getElementById('grant-single-item-btn');
      if (grantSingleBtn) {
        grantSingleBtn.addEventListener('click', () => {
          const itemId = (document.getElementById('cheat-item-select') as HTMLSelectElement).value;
          const count = Math.max(
            1,
            Math.min(99, Number((document.getElementById('cheat-item-count') as HTMLInputElement).value) || 1)
          );
          if (this.player.grantCheatItem(itemId, count)) {
            this.renderHotbar();
            const def = ITEMS[itemId];
            this.showBanner('ITEM GRANTED!', `Added ${count}x ${def.name} to your inventory.`, TIER_NAMES[def.tier].color);
          }
        });
      }

      this.modalContent.querySelectorAll('.kit-btn[data-kit-tier]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tier = Number((btn as HTMLElement).dataset.kitTier) as ProgressionTier;
          if (this.player.grantTierSandboxKit(tier)) {
            this.renderHotbar();
            this.showBanner(
              `TIER ${tier} GEAR GRANTED!`,
              `${TIER_NAMES[tier].name} weapons & armor equipped.`,
              TIER_NAMES[tier].color
            );
          }
        });
      });

      this.modalContent.querySelectorAll('.summon-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const bossId = (btn as HTMLElement).dataset.summonBoss!;
          this.toggleMenu(false);
          this.entities.summonBoss(bossId);
        });
      });
    }
  }

  private renderHelpTab(): void {
    this.modalContent.innerHTML = `
      <div class="help-wrap">
        <h3>Current World: ${this.player.worldName} (Seed: ${this.player.world.seed} • Cheats: ${
      this.player.cheatsEnabled ? 'ON' : 'OFF'
    })</h3>
        <div class="help-grid">
          <div class="help-item"><kbd>W A S D</kbd> Move / Strafe</div>
          <div class="help-item"><kbd>Space</kbd> Jump / Double-Jump / Hold to Glide (Tier V–VI Armor)</div>
          <div class="help-item"><kbd>Shift</kbd> Sprint</div>
          <div class="help-item"><kbd>Q</kbd> Directional Shadow Dash</div>
          <div class="help-item"><kbd>Left Click (Hold)</kbd> Mine Voxel Block / Swing Melee / Fire Ranged Weapon</div>
          <div class="help-item"><kbd>Right Click</kbd> Trigger Weapon Special Ability / Place Selected Block / Use Potion or Boss Relic</div>
          <div class="help-item"><kbd>1 – 9</kbd> or <kbd>Scroll</kbd> Select Hotbar Slot</div>
          <div class="help-item"><kbd>E</kbd> Open Astral Forge & Inventory</div>
          <div class="help-item"><kbd>P</kbd> Open 6-Tier Progression & Boss Codex</div>
        </div>
        <div style="margin-top:20px; display:flex; gap:12px;">
          <button id="open-new-world-modal-btn" class="codex-btn summon-btn">Create New World (Configure Seed & Cheats)</button>
          <button id="toggle-mute-btn" class="codex-btn kit-btn">${
            sound.muted ? 'Unmute Sound Effects' : 'Mute Sound Effects'
          }</button>
        </div>
      </div>
    `;

    document.getElementById('open-new-world-modal-btn')!.addEventListener('click', () => {
      this.openWorldCreationScreen();
    });

    document.getElementById('toggle-mute-btn')!.addEventListener('click', (e) => {
      sound.muted = !sound.muted;
      (e.target as HTMLElement).textContent = sound.muted ? 'Unmute Sound Effects' : 'Mute Sound Effects';
    });
  }

  public showBanner(title: string, subtitle: string, color: string): void {
    this.bannerEl.style.display = 'block';
    this.bannerEl.style.borderColor = color;
    this.bannerEl.innerHTML = `
      <div class="banner-title" style="color:${color}">${title}</div>
      <div class="banner-sub">${subtitle}</div>
    `;
    setTimeout(() => {
      this.bannerEl.style.display = 'none';
    }, 4500);
  }

  private spawnFloatingDamage(worldPos: THREE.Vector3, amount: number, color: string, isCrit?: boolean): void {
    const projected = worldPos.clone().project(this.player.camera);
    if (projected.z > 1) return;

    const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;

    const el = document.createElement('div');
    el.className = `floating-dmg ${isCrit ? 'crit' : ''}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    el.textContent = `${isCrit ? '💥 ' : ''}${amount}`;
    this.floatingLayer.appendChild(el);

    setTimeout(() => {
      el.remove();
    }, 850);
  }
}
