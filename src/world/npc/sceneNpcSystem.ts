import { AppBase, Color, Entity, LAYERID_IMMEDIATE, OutlineRenderer, Vec3 } from "playcanvas";
import { loadModel, type LoadModelOptions, type Model } from "../../util/loadModel";
import { npc } from "./npc";
import { Mongol } from "./troops/mongol";
import { Mamluk } from "./troops/Mamluk";
import { Templar } from "./troops/templars";
import { FrenchSoldier } from "./troops/frenchSoldier";
import { OldFrenchSoldier } from "./troops/oldFrenchSoldier";
import { AmericanRevolutionist } from "./troops/americanRevolutionist";
import { UnionSoldier } from "./troops/unionSoldier";
import { RussianSoldier } from "./troops/russianSoldier";
import { ItalianSoldier } from "./troops/italianSoldier";
import { HuntingRifleDude } from "./troops/huntingRifleDude";
import { PolishHussar } from "./troops/polishHussar";
import { KoreanSoldier } from "./troops/koreanSoldier";
import { Boss } from "./bosses/boss";
import { GenghisKhan } from "./bosses/genghisKhan";
import { KingGeser } from "./bosses/kingGeser";
import { Christ } from "./bosses/jesus";
import { JoanOfArc } from "./bosses/joanOfArc";
import { WilliamTheConquerer } from "./bosses/williamTheConquerer";
import { GeorgeWashington } from "./bosses/georgeWashington";
import { Baybars } from "./bosses/baybars";
import { Caesar } from "./bosses/caesar";
import { Napoleon } from "./bosses/napoleon";
import { UncleSam } from "./bosses/uncleSam";
import { VietnamDragonKing } from "./bosses/vietnamDragonKing";
import { CainAndAbel } from "./bosses/cainAndAbel";
import { KingGeorgeIII } from "./bosses/kingGeorgeIII";
import { Lenin } from "./bosses/lenin";
import { Stalin } from "./bosses/stalin";
import { TowerBoss } from "./bosses/towerBoss";
import { BinLadin } from "./bosses/binLaden";
import { AirLadin } from "./bosses/airLaden";
import { WingedHussarBoss } from "./bosses/wingedHussarBoss";
import { NineTailedFox } from "./bosses/nineTailedFox";
import { isDeathScreenVisible } from "../scenes/deathScreen";
import { DevConsole } from "../../util/devConsole";

export type NpcSceneTeam = "friend" | "foe";

const DEFAULT_FALLBACK_NPC_MODEL = "test/armored_king.glb";

interface RigidbodyRaycastHit {
    entity?: Entity | null;
    point?: Vec3;
    hitFraction?: number;
}

interface RigidbodyRaycastSystem {
    raycastAll?: (start: Vec3, end: Vec3) => RigidbodyRaycastHit[] | undefined;
    raycastFirst?: (start: Vec3, end: Vec3) => RigidbodyRaycastHit | null;
}

export interface NpcSpawnPoint {
  id: number;
  team: NpcSceneTeam;
  x: number;
  z: number;
  maxHealth?: number;
  type?: string;
  rotation?: Vec3;
  yaw?: number;
  detectionRange?: number;
}

export interface NpcSpawnOverrides {
    modelPath?: string;
    modelRotation?: Vec3;
    modelScale?: Vec3;
    modelHeightOffset?: number;
    facingYawOffsetDegrees?: number;
    hitboxRadius?: number;
    groundYFallback?: number;
    detectionRange?: number;
}

export interface NpcSceneSpawnOptions extends NpcSpawnOverrides {
 typeModelPaths?: Record<string, string>;
 typeSpawnOverrides?: Record<string, NpcSpawnOverrides>;
 groundProbeHeight?: number;
 groundProbeDepth?: number;
 /** If provided, foe NPCs that would spawn within this horizontal distance of the player are skipped. */
 playerSafeRadius?: number;
 /** Called for each spawn point to check the player's current position. Required when playerSafeRadius is set. */
 getPlayerPosition?: () => Vec3;
}

export interface NpcCombatLoopOptions {
    updateKey?: string;
    onNpcAttack?: (attacker: npc, target: npc, damage: number) => void;
    onPlayerAttack?: (attacker: npc, damage: number) => void;
    getPlayerHealth?: () => { current: number; max: number } | undefined;
    rigidbodySystem?: RigidbodyRaycastSystem;
    groundCollisionEnabled?: boolean;
    groundTag?: string;
    groundProbeHeight?: number;
    groundProbeDepth?: number;
    defaultGroundClearance?: number;
    obstacleCollisionEnabled?: boolean;
    obstacleProbeHeight?: number;
    obstacleProbePadding?: number;
    obstacleMinMove?: number;
    obstacleIgnoreTags?: string[];
    disableMongolHordeSpawn?: boolean;
    battleStatus?: {
        getCameraEntity?: () => Entity | null | undefined;
        initialTotal?: number;
        outlineThreshold?: number;
        outlineColor?: Color;
        alwaysOutline?: boolean;
        outlineTargets?: "foe" | "all";
        onRemainingCountChange?: (remaining: number, total: number) => void;
    };
}

const SCENE_CLEANUP_HANDLERS_KEY = "__sceneCleanupHandlers";

function registerSceneCleanup(app: AppBase, cleanup: () => void): void {
    const keyedApp = app as AppBase & Record<string, unknown>;
    const handlers = (keyedApp[SCENE_CLEANUP_HANDLERS_KEY] as Array<() => void> | undefined) ?? [];
    handlers.push(cleanup);
    keyedApp[SCENE_CLEANUP_HANDLERS_KEY] = handlers;
}

function hasTagInHierarchy(entity: Entity | null, tag: string): boolean {
    let current: Entity | null = entity;
    while (current) {
        if (current.tags?.has(tag)) {
            return true;
        }
        current = (current.parent as Entity | null) ?? null;
    }
    return false;
}

function applyDetectionRangeOverride(npcInstance: npc, detectionRangeOverride: number | undefined): void {
    if (detectionRangeOverride !== undefined && detectionRangeOverride === -1) {
        npcInstance.setDetectionRange(Number.MAX_VALUE);
    } else if (detectionRangeOverride !== undefined && Number.isFinite(detectionRangeOverride) && detectionRangeOverride > 0) {
        npcInstance.setDetectionRange(detectionRangeOverride);
    }
}

function getGroundYAt(
  rigidbodySystem: RigidbodyRaycastSystem | undefined,
  x: number,
  y: number,
  z: number,
  groundTag: string,
  probeHeight: number,
  probeDepth: number
): number | undefined {
  if (!rigidbodySystem || typeof rigidbodySystem.raycastFirst !== "function") {
    return undefined;
  }

  const absoluteTop = Math.max(probeHeight, 500);
  const absoluteBottom = Math.min(-probeDepth, -500);
  const rayStart = new Vec3(x, absoluteTop, z);
  const rayEnd = new Vec3(x, absoluteBottom, z);
    console.log(`[GroundProbe] ray Y=${rayStart.y.toFixed(1)}→${rayEnd.y.toFixed(1)}, origin=(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);

    if (typeof rigidbodySystem.raycastAll === "function") {
        const hits = rigidbodySystem.raycastAll(rayStart, rayEnd);
        if (hits && hits.length > 0) {
            let bestFraction = Number.POSITIVE_INFINITY;
            let bestY: number | undefined;

            for (const hit of hits) {
                if (!hit?.point || !Number.isFinite(hit.point.y)) {
                    continue;
                }

                if (!hasTagInHierarchy(hit.entity ?? null, groundTag)) {
                    continue;
                }

                const hitFraction = hit.hitFraction;
                if (typeof hitFraction === "number" && Number.isFinite(hitFraction) && hitFraction < bestFraction) {
                    bestFraction = hitFraction;
                    bestY = hit.point.y;
                }
            }

            if (bestY !== undefined) {
                return bestY;
            }
        }
    }

    const firstHit = rigidbodySystem.raycastFirst(rayStart, rayEnd);
    if (!firstHit?.point || !Number.isFinite(firstHit.point.y)) {
        return undefined;
    }

    if (!hasTagInHierarchy(firstHit.entity ?? null, groundTag)) {
        return undefined;
    }

    return firstHit.point.y;
}

function getSpawnY(
    rigidbodySystem: RigidbodyRaycastSystem | undefined,
    x: number,
    y: number,
    z: number,
    groundTag: string,
    probeHeight: number,
    probeDepth: number,
    defaultGroundClearance: number,
    fallbackGroundY?: number
): number {
    const groundY = getGroundYAt(rigidbodySystem, x, y, z, groundTag, probeHeight, probeDepth);
    if (groundY === undefined) {
        if (typeof fallbackGroundY === "number" && Number.isFinite(fallbackGroundY)) {
            return fallbackGroundY + defaultGroundClearance;
        }
        // Avoid spawning at an arbitrary Y=0 when we have no ground data.
        // Use a small positive offset so entities don't clip into the terrain below.
        return defaultGroundClearance;
    }

    return groundY + defaultGroundClearance;
}

function getEntityMinY(entity: Entity): number | undefined {
    if (typeof (entity as { syncHierarchy?: () => void }).syncHierarchy === "function") {
        (entity as { syncHierarchy: () => void }).syncHierarchy();
    }

    let minY = Number.POSITIVE_INFINITY;
    let found = false;

    const visit = (node: Entity) => {
        // Force the render component's bounding box to reflect the current transform/scale.
        // Without this, meshInstance.aabb may hold stale bounds from before a scale change,
        // which causes post-load alignment to miscalculate for scaled boss models.
        const renderComp = node.render as { syncBoundingBox?: () => void } | undefined;
        if (typeof renderComp?.syncBoundingBox === "function") {
            renderComp.syncBoundingBox();
        }

        const meshInstances = node.render?.meshInstances ?? (node as { model?: { meshInstances?: any[] } }).model?.meshInstances;
        if (meshInstances && meshInstances.length > 0) {
            for (const meshInstance of meshInstances) {
                const aabb = meshInstance.aabb;
                if (!aabb) {
                    continue;
                }

                const min = aabb.getMin();
                if (!Number.isFinite(min.y)) {
                    continue;
                }

                minY = Math.min(minY, min.y);
                found = true;
            }
        }

        for (const child of node.children) {
            visit(child as Entity);
        }
    };

    visit(entity);

    if (!found) {
        return undefined;
    }

    return minY;
}

async function loadNpcModelWithFallback(
    app: AppBase,
    primaryPath: string,
    options: LoadModelOptions
): Promise<Model> {
    try {
        return await loadModel(primaryPath, app, options);
    } catch (error) {
        console.warn(`[NPC] Failed to load model "${primaryPath}". Falling back to "${DEFAULT_FALLBACK_NPC_MODEL}".`, error);
    }

    if (primaryPath !== DEFAULT_FALLBACK_NPC_MODEL) {
        try {
            return await loadModel(DEFAULT_FALLBACK_NPC_MODEL, app, options);
        } catch (fallbackError) {
            console.error(`[NPC] Fallback model "${DEFAULT_FALLBACK_NPC_MODEL}" failed to load.`, fallbackError);
            throw fallbackError;
        }
    }

    throw new Error(`Failed to load NPC model: ${primaryPath}`);
}

export async function spawnSceneNpcs(
    app: AppBase,
    rigidbodySystem: RigidbodyRaycastSystem | undefined,
    spawnPoints: NpcSpawnPoint[],
    options: NpcSceneSpawnOptions = {}
): Promise<npc[]> {
    const fallbackModelPath = options.modelPath ?? "test/armored_king.glb";
    const fallbackModelRotation = options.modelRotation ?? new Vec3(-90, 0, 0);
    const fallbackModelScale = options.modelScale ?? new Vec3(2, 2, 2);
    const fallbackModelHeightOffset = options.modelHeightOffset ?? 2;
    const fallbackFacingYawOffsetDegrees = options.facingYawOffsetDegrees ?? 180;
    const fallbackHitboxRadius = options.hitboxRadius ?? 1.2;
    const fallbackGroundY = options.groundYFallback;
    const typeModelPaths = options.typeModelPaths ?? {};
    const typeSpawnOverrides = options.typeSpawnOverrides ?? {};
    const groundTag = "ground";
    const groundProbeHeight = options.groundProbeHeight ?? 300;
    const groundProbeDepth = options.groundProbeDepth ?? 300;
    const defaultGroundClearance = 0.1;

    const playerSafeRadius = options.playerSafeRadius ?? 6;
    const getPlayerPosition = options.getPlayerPosition
    ?? (() => (globalThis as any).__devConsolePlayer?.getPosition?.() as Vec3 | undefined);

    const npcs: npc[] = [];

    for (const spawn of spawnPoints) {
    try {
    // Skip foe spawns that would land on top of the player.
    if (playerSafeRadius > 0 && spawn.team === "foe") {
    const playerPos = getPlayerPosition();
    if (playerPos) {
    const pdx = spawn.x - playerPos.x;
    const pdz = spawn.z - playerPos.z;
    const playerDist = Math.sqrt((pdx * pdx) + (pdz * pdz));
    if (playerDist < playerSafeRadius) {
    console.log(`[NPC] Skipping spawn ID=${spawn.id} at (${spawn.x}, ${spawn.z}) — too close to player (${playerDist.toFixed(1)} < ${playerSafeRadius})`);
    continue;
    }
    }
    }
            const spawnOverrides = spawn.type ? typeSpawnOverrides[spawn.type] : undefined;
            const modelPath = spawnOverrides?.modelPath
                ?? (spawn.type ? typeModelPaths[spawn.type] : undefined)
                ?? fallbackModelPath;
        const modelRotation = spawn.rotation ?? spawnOverrides?.modelRotation ?? fallbackModelRotation;
        const modelScale = spawnOverrides?.modelScale ?? fallbackModelScale;
            // Scale the height offset by the model's Y-scale to account for stretched geometry.
            // When a model is scaled up, its feet move further below the origin proportionally.
            const scaleY = modelScale.y ?? 1;
            const modelHeightOffset = (spawnOverrides?.modelHeightOffset ?? fallbackModelHeightOffset) * Math.max(1, scaleY);
            const facingYawOffsetDegrees = spawnOverrides?.facingYawOffsetDegrees ?? fallbackFacingYawOffsetDegrees;
            const hitboxRadius = spawnOverrides?.hitboxRadius ?? fallbackHitboxRadius;
            const groundYFallback = spawnOverrides?.groundYFallback ?? fallbackGroundY;
            const detectionRangeOverride: number | undefined = spawnOverrides?.detectionRange;
            const npcSpawnY = getSpawnY(
                rigidbodySystem,
                spawn.x,
                0,
                spawn.z,
                groundTag,
                groundProbeHeight,
                groundProbeDepth,
                defaultGroundClearance,
                groundYFallback
            );
            console.log(`[NPC] spawnY=${npcSpawnY.toFixed(2)} (groundProbeH=${groundProbeHeight}, depth=${groundProbeDepth}), fallback=${groundYFallback?.toFixed(2) ?? "n/a"}`);
            
            const loadOptions: LoadModelOptions = {
            rigidbodyType: "kinematic",
            includeDescendants: true,
            position: new Vec3(spawn.x, npcSpawnY + modelHeightOffset, spawn.z),
            rotation: modelRotation,
            scale: modelScale
            };
            if (spawn.type === "AirLadin") {
                loadOptions.autoCollision = false;
            }
            const npcModel = await loadNpcModelWithFallback(app, modelPath, loadOptions);
        npcModel.modelEntity.tags.add("npc");
        if (spawn.yaw !== undefined && Number.isFinite(spawn.yaw)) {
          const currentEuler = npcModel.modelEntity.getLocalEulerAngles();
          npcModel.modelEntity.setLocalEulerAngles(currentEuler.x, currentEuler.y + spawn.yaw, currentEuler.z);
        }
        const modelMinY = getEntityMinY(npcModel.modelEntity);
        console.log(`[NPC] modelMinY=${modelMinY?.toFixed(2) ?? "n/a"}, targetMinY=${(npcSpawnY + defaultGroundClearance).toFixed(2)}, scaleY=${scaleY}`);
        // AirLadin is airborne: keep his `modelHeightOffset` (set in the presets) instead of forcing his feet to the ground.
        const isFlyingNpc = spawn.type === "AirLadin";
        if (modelMinY !== undefined && !isFlyingNpc) {
        const targetMinY = npcSpawnY + defaultGroundClearance;
        const deltaY = targetMinY - modelMinY;
        if (Math.abs(deltaY) > 0.001) {
        const currentPos = npcModel.modelEntity.getPosition();
        npcModel.modelEntity.setPosition(currentPos.x, currentPos.y + deltaY, currentPos.z);
        }
        }
            if (spawn.type === "mongol") {
                console.log(`Spawning Mongol NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
                const mongol = new Mongol(spawn.id, npcModel.modelEntity);
                mongol.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
                mongol.setHitboxRadius(hitboxRadius);
                applyDetectionRangeOverride(mongol, detectionRangeOverride);
                npcs.push(mongol);
    } else if (spawn.type === "templar") {
      console.log(`Spawning Templar NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const templar = new Templar(spawn.id, npcModel.modelEntity);
      templar.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      templar.setHitboxRadius(hitboxRadius);
      applyDetectionRangeOverride(templar, detectionRangeOverride);
      npcs.push(templar);
    } else if (spawn.type === "mamlukIthink") {
      console.log(`Spawning Mamluk NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const mamluk = new Mamluk(spawn.id, npcModel.modelEntity);
      mamluk.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      mamluk.setHitboxRadius(hitboxRadius);
      applyDetectionRangeOverride(mamluk, detectionRangeOverride);
      npcs.push(mamluk);
    } else if (spawn.type === "french") {
      console.log(`Spawning French NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const frenchSoldier = new FrenchSoldier(spawn.id, npcModel.modelEntity);
      frenchSoldier.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      frenchSoldier.setHitboxRadius(hitboxRadius);
      applyDetectionRangeOverride(frenchSoldier, detectionRangeOverride);
      npcs.push(frenchSoldier);
	} else if (spawn.type === "modernFrenchSoldier") {
      console.log(`Spawning Modern French Soldier NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const frenchSoldier = new FrenchSoldier(spawn.id, npcModel.modelEntity);
      frenchSoldier.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      frenchSoldier.setHitboxRadius(hitboxRadius);
      applyDetectionRangeOverride(frenchSoldier, detectionRangeOverride);
      npcs.push(frenchSoldier);
	} else if (spawn.type === "frenchSoldierOld") {
      console.log(`Spawning Old French Soldier NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const oldFrenchSoldier = new OldFrenchSoldier(spawn.id, npcModel.modelEntity);
      oldFrenchSoldier.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      oldFrenchSoldier.setHitboxRadius(hitboxRadius);
      applyDetectionRangeOverride(oldFrenchSoldier, detectionRangeOverride);
      npcs.push(oldFrenchSoldier);
	} else if (spawn.type === "americanRevolutionist") {
		console.log(`Spawning American Revolutionist NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
		const rev = new AmericanRevolutionist(spawn.id, npcModel.modelEntity);
		rev.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
		rev.setHitboxRadius(hitboxRadius);
		applyDetectionRangeOverride(rev, detectionRangeOverride);
		npcs.push(rev);
    } else if (spawn.type === "unionSoldier") {
        console.log(`Spawning Union Soldier NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
        const unionSoldier = new UnionSoldier(spawn.id, npcModel.modelEntity);
        unionSoldier.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
        unionSoldier.setHitboxRadius(hitboxRadius);
        applyDetectionRangeOverride(unionSoldier, detectionRangeOverride);
        npcs.push(unionSoldier);
    } else if (spawn.type === "koreansldier") {
        console.log(`Spawning Korean Soldier NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
        const koreanSoldier = new KoreanSoldier(spawn.id, npcModel.modelEntity);
        koreanSoldier.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
        koreanSoldier.setHitboxRadius(hitboxRadius);
        applyDetectionRangeOverride(koreanSoldier, detectionRangeOverride);
        npcs.push(koreanSoldier);
    } else if (spawn.type === "vietnameseSoldier") {
        console.log(`Spawning Vietnamese Soldier NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
        const vietnameseSoldier = new KoreanSoldier(spawn.id, npcModel.modelEntity);
        vietnameseSoldier.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
        vietnameseSoldier.setHitboxRadius(hitboxRadius);
        applyDetectionRangeOverride(vietnameseSoldier, detectionRangeOverride);
        npcs.push(vietnameseSoldier);
    } else if (spawn.type === "russianSoldier") {
        console.log(`Spawning Russian Soldier NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
        const russianSoldier = new RussianSoldier(spawn.id, npcModel.modelEntity);
        russianSoldier.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
        russianSoldier.setHitboxRadius(hitboxRadius);
        applyDetectionRangeOverride(russianSoldier, detectionRangeOverride);
        npcs.push(russianSoldier);
	} else if (spawn.type === "italian") {
        console.log(`Spawning Italian Soldier NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
        const italian = new ItalianSoldier(spawn.id, npcModel.modelEntity);
        italian.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
        italian.setHitboxRadius(hitboxRadius);
        applyDetectionRangeOverride(italian, detectionRangeOverride);
        npcs.push(italian);
	} else if (spawn.type === "huntingrifledude") {
        console.log(`Spawning Hunting Rifle Dude NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
        const hunter = new HuntingRifleDude(spawn.id, npcModel.modelEntity);
        hunter.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
        hunter.setHitboxRadius(hitboxRadius);
        applyDetectionRangeOverride(hunter, detectionRangeOverride);
        npcs.push(hunter);
	} else if (spawn.type === "polishHussar") {
		console.log(`Spawning Polish Hussar NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
		const hussar = new PolishHussar(spawn.id, npcModel.modelEntity);
		hussar.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
		hussar.setHitboxRadius(hitboxRadius);
		applyDetectionRangeOverride(hussar, detectionRangeOverride);
		npcs.push(hussar);
	} else if (spawn.type === "genghisKhan") {
      console.log(`Spawning Genghis Khan Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new GenghisKhan(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "kingGeser") {
      console.log(`Spawning King Geser Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new KingGeser(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "christ") {
      console.log(`Spawning Christ Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new Christ(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "joanofarc") {
      console.log(`Spawning Joan of Arc Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new JoanOfArc(spawn.id, spawn.maxHealth ?? 260, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "williamTheConquerer") {
      console.log(`Spawning William the Conquerer Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new WilliamTheConquerer(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "georgeWashington") {
      console.log(`Spawning George Washington Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new GeorgeWashington(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "baybars") {
      console.log(`Spawning Baybars Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new Baybars(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "caesar") {
      console.log(`Spawning Caesar Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new Caesar(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "napoleon") {
      console.log(`Spawning Napoleon Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new Napoleon(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "uncleSam") {
      console.log(`Spawning Uncle Sam Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new UncleSam(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "wingedHussarBoss") {
      console.log(`Spawning Winged Hussar Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new WingedHussarBoss(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "vietnamDragonKing") {
      console.log(`Spawning Vietnam Dragon King Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new VietnamDragonKing(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "cainAndAbel") {
      console.log(`Spawning Cain & Abel Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new CainAndAbel(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "kingGeorgeIII") {
      console.log(`Spawning King George III Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new KingGeorgeIII(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "kinGerorge") {
      console.log(`Spawning Kin Gerorge Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new KingGeorgeIII(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "lenin") {
      console.log(`Spawning Lenin Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new Lenin(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "stalin") {
      console.log(`Spawning Stalin Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new Stalin(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
    } else if (spawn.type === "towerBoss") {
      console.log(`Spawning Tower Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
      const boss = new TowerBoss(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
      boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
      boss.setHitboxRadius(hitboxRadius);
      boss.drawHealthBar();
      Boss.setActiveBoss(boss);
      npcs.push(boss);
} else if (spawn.type === "binLadin") {
			console.log(`Spawning Bin Ladin Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
			const boss = new BinLadin(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
			boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
			boss.setHitboxRadius(hitboxRadius);
			boss.drawHealthBar();
			Boss.setActiveBoss(boss);
			npcs.push(boss);
    } else if (spawn.type === "AirLadin") {
			console.log(`Spawning Air Ladin Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
			const boss = new AirLadin(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
			boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
			boss.setHitboxRadius(hitboxRadius);
			boss.drawHealthBar();
			Boss.setActiveBoss(boss);
			npcs.push(boss);
    } else if (spawn.type === "nineTailedFox") {
            console.log(`Spawning Nine Tailed Fox Boss NPC with ID ${spawn.id} at (${spawn.x}, ${spawn.z})`);
            const boss = new NineTailedFox(spawn.id, spawn.maxHealth ?? 500, npcModel.modelEntity);
            boss.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
            boss.setHitboxRadius(hitboxRadius);
            boss.drawHealthBar();
            Boss.setActiveBoss(boss);
            npcs.push(boss);
    }else {
                const spawnedNpc = new npc(spawn.id, spawn.team, spawn.maxHealth ?? 100, npcModel.modelEntity);
                spawnedNpc.setFacingYawOffsetDegrees(facingYawOffsetDegrees);
                spawnedNpc.setHitboxRadius(hitboxRadius);
                applyDetectionRangeOverride(spawnedNpc, detectionRangeOverride);
                npcs.push(spawnedNpc);
            }
        } catch (error) {
            console.error(`[NPC] Failed to spawn NPC ${spawn.id} at (${spawn.x}, ${spawn.z})`, error);
        }
    }

    return npcs;
}

export function bindNpcCombatLoop(
 app: AppBase,
 npcs: npc[],
 getPlayerEntity: () => Entity,
 options: NpcCombatLoopOptions = {}
): () => void {
 // Register NPC list with dev console so commands like killall/heal work
 DevConsole.setNpcs(npcs);

 const updateKey = options.updateKey ?? "__sceneNpcUpdate";
    const keyedApp = app as AppBase & Record<string, unknown>;

    const existingHandler = keyedApp[updateKey];
    if (typeof existingHandler === "function") {
        app.off("update", existingHandler as (deltaTime: number) => void);
    }

    const rigidbodySystem = options.rigidbodySystem ?? (app.systems as { rigidbody?: RigidbodyRaycastSystem }).rigidbody;
    const groundCollisionEnabled = options.groundCollisionEnabled ?? true;
    const groundTag = options.groundTag ?? "ground";
    const groundProbeHeight = options.groundProbeHeight ?? 300;
    const groundProbeDepth = options.groundProbeDepth ?? 300;
    const defaultGroundClearance = options.defaultGroundClearance ?? 0.1;
    const obstacleCollisionEnabled = options.obstacleCollisionEnabled ?? false;
    const obstacleProbeHeight = options.obstacleProbeHeight ?? 1.2;
    const obstacleProbePadding = options.obstacleProbePadding ?? 0.35;
    const obstacleMinMove = options.obstacleMinMove ?? 0.05;
    const obstacleIgnoreTags = options.obstacleIgnoreTags ?? [];
    const npcGroundOffsets = new Map<npc, number>();
    const npcLastValidPositions = new Map<npc, Vec3>();
    const npcPreviousPositions = new Map<npc, Vec3>();
    const battleStatus = options.battleStatus;
    const outlineLayer = battleStatus
        ? (app.scene.layers.getLayerById(LAYERID_IMMEDIATE) ?? app.scene.layers.getLayerByName("Immediate"))
        : null;
    const outlineRenderer = battleStatus && outlineLayer ? new OutlineRenderer(app, outlineLayer) : null;
    const defaultOutlineColor = battleStatus?.outlineColor ?? new Color(0.94, 0.84, 0.24);
    const initialTotal = Math.max(0, battleStatus?.initialTotal ?? npcs.filter((currentNpc) => currentNpc.getTeam() === "foe").length);
    const outlineThreshold = battleStatus?.outlineThreshold ?? 0.25;
    const alwaysOutline = battleStatus?.alwaysOutline ?? false;
    const outlineTargets = battleStatus?.outlineTargets ?? "foe";
    let outlinedNpcIds = new Set<number>();

    const syncBattleStatus = (cameraEntity: Entity | null | undefined) => {
        const remainingFoes = npcs.filter((currentNpc) => currentNpc.getTeam() === "foe" && currentNpc.isAlive());
        battleStatus?.onRemainingCountChange?.(remainingFoes.length, initialTotal);

        if (!outlineRenderer || initialTotal <= 0) {
            return;
        }

        const outlineCandidates = outlineTargets === "all"
            ? npcs.filter((currentNpc) => currentNpc.isAlive())
            : remainingFoes;
        const shouldOutline = alwaysOutline
            ? outlineCandidates.length > 0
            : (remainingFoes.length > 0 && (remainingFoes.length / initialTotal) < outlineThreshold);
        if (!shouldOutline) {
            if (outlinedNpcIds.size > 0) {
                outlineRenderer.removeAllEntities();
                outlinedNpcIds = new Set<number>();
            }
            return;
        }

        const nextOutlinedIds = new Set(outlineCandidates.map((currentNpc) => currentNpc.getId()));
        let changed = nextOutlinedIds.size !== outlinedNpcIds.size;
        if (!changed) {
            for (const id of nextOutlinedIds) {
                if (!outlinedNpcIds.has(id)) {
                    changed = true;
                    break;
                }
            }
        }

        if (changed) {
            outlineRenderer.removeAllEntities();
            outlinedNpcIds = new Set<number>();
            for (const currentNpc of outlineCandidates) {
                outlineRenderer.addEntity(currentNpc.getEntity(), defaultOutlineColor, true);
                outlinedNpcIds.add(currentNpc.getId());
            }
        }

        if (cameraEntity?.camera && outlineLayer) {
            outlineRenderer.frameUpdate(cameraEntity, outlineLayer, false);
        }
    };

    if (battleStatus) {
        syncBattleStatus(battleStatus.getCameraEntity?.() ?? undefined);
    }

    if (groundCollisionEnabled && rigidbodySystem) {
        for (const currentNpc of npcs) {
            const position = currentNpc.getEntity().getPosition();
            const groundY = getGroundYAt(rigidbodySystem, position.x, position.y, position.z, groundTag, groundProbeHeight, groundProbeDepth);
            if (groundY === undefined) {
                npcGroundOffsets.set(currentNpc, defaultGroundClearance);
                npcLastValidPositions.set(currentNpc, position.clone());
                continue;
            }

            npcGroundOffsets.set(currentNpc, Math.max(defaultGroundClearance, position.y - groundY));
            npcLastValidPositions.set(currentNpc, new Vec3(position.x, groundY + (npcGroundOffsets.get(currentNpc) ?? defaultGroundClearance), position.z));
        }
    }

    const shouldIgnoreObstacleHit = (entity: Entity | null | undefined): boolean => {
        if (!entity || obstacleIgnoreTags.length === 0) {
            return false;
        }

        for (const tag of obstacleIgnoreTags) {
            if (hasTagInHierarchy(entity, tag)) {
                return true;
            }
        }

        return false;
    };

    const updateHandler = (deltaTime: number) => {
        if (isDeathScreenVisible()) {
            return;
        }

        const nowSeconds = Date.now() / 1000;
        const playerEntity = getPlayerEntity();
        const playerHealth = options.getPlayerHealth?.();

        npcPreviousPositions.clear();
        for (const currentNpc of npcs) {
            if (!currentNpc.isAlive()) {
                continue;
            }
            npcPreviousPositions.set(currentNpc, currentNpc.getEntity().getPosition().clone());
        }

        syncBattleStatus(battleStatus?.getCameraEntity?.() ?? playerEntity);

        for (const currentNpc of npcs) {
            if (currentNpc instanceof Boss && playerHealth) {
                currentNpc.setCombatContext(playerHealth.current, playerHealth.max);
            }
            currentNpc.updateCombatAI(
                deltaTime,
                nowSeconds,
                npcs,
                options.onNpcAttack,
                playerEntity,
                options.onPlayerAttack
            );
        }

        npc.resolveHitboxCollisions(npcs);

        if (obstacleCollisionEnabled && rigidbodySystem && typeof rigidbodySystem.raycastFirst === "function") {
            for (const currentNpc of npcs) {
                if (!currentNpc.isAlive()) {
                    continue;
                }

                const prevPosition = npcPreviousPositions.get(currentNpc);
                if (!prevPosition) {
                    continue;
                }

                const currentPosition = currentNpc.getEntity().getPosition();
                const dx = currentPosition.x - prevPosition.x;
                const dz = currentPosition.z - prevPosition.z;
                const moveDist = Math.sqrt((dx * dx) + (dz * dz));
                if (moveDist < obstacleMinMove) {
                    continue;
                }

                const selfPadding = Math.max(0.05, currentNpc.getHitboxRadius());
                const groundOffset = npcGroundOffsets.get(currentNpc);
                const probeBaseY = typeof groundOffset === "number"
                    ? currentPosition.y - groundOffset
                    : currentPosition.y;
                const probeY = probeBaseY + obstacleProbeHeight;
                const start = new Vec3(
                    prevPosition.x,
                    probeY,
                    prevPosition.z
                );
                const end = new Vec3(
                    currentPosition.x,
                    probeY,
                    currentPosition.z
                );

                // Prefer raycastAll so we can skip self hits while still catching nearby obstacles.
                let blockingHit: RigidbodyRaycastHit | undefined;
                if (typeof rigidbodySystem.raycastAll === "function") {
                    const hits = rigidbodySystem.raycastAll(start, end);
                    if (hits && hits.length > 0) {
                        let bestFraction = Number.POSITIVE_INFINITY;
                        let bestDist = Number.POSITIVE_INFINITY;
                        for (const hit of hits) {
                            if (!hit?.entity || !hit.point) {
                                continue;
                            }
                            if (hasTagInHierarchy(hit.entity ?? null, "npc")) {
                                continue;
                            }
                            if (shouldIgnoreObstacleHit(hit.entity ?? null)) {
                                continue;
                            }

                            const hitFraction = hit.hitFraction;
                            if (typeof hitFraction === "number" && Number.isFinite(hitFraction)) {
                                if (hitFraction < bestFraction) {
                                    bestFraction = hitFraction;
                                    blockingHit = hit;
                                }
                                continue;
                            }

                            const hx = hit.point.x - start.x;
                            const hz = hit.point.z - start.z;
                            const hitDist = Math.sqrt((hx * hx) + (hz * hz));
                            if (hitDist < bestDist) {
                                bestDist = hitDist;
                                blockingHit = hit;
                            }
                        }
                    }
                }

                if (!blockingHit) {
                    const hit = rigidbodySystem.raycastFirst(start, end);
                    if (hit?.entity && hit.point && !hasTagInHierarchy(hit.entity ?? null, "npc") && !shouldIgnoreObstacleHit(hit.entity ?? null)) {
                        blockingHit = hit;
                    }
                }

                if (!blockingHit?.point) {
                    continue;
                }

                const hx = blockingHit.point.x - start.x;
                const hz = blockingHit.point.z - start.z;
                const hitDist = Math.sqrt((hx * hx) + (hz * hz));
                const blockDist = moveDist + selfPadding + obstacleProbePadding;
                if (hitDist <= blockDist) {
                    currentNpc.getEntity().setPosition(prevPosition);
                }
            }
        }

        if (!options.disableMongolHordeSpawn && Mongol.hasRetreatedOnce && !Mongol.hordeSpawned && Mongol.retreatPoint) {
        Mongol.hordeSpawned = true;
        const playerEntity = getPlayerEntity();
        const playerPos = playerEntity?.getPosition?.();
        const hordeSafeRadius = 8; // Don't spawn horde members within this distance of the player
        const newPoints: NpcSpawnPoint[] = [];
        for (let i = 0; i < 6; i++) {
        let spawnX = Mongol.retreatPoint.x + (Math.random() * 12 - 6);
        let spawnZ = Mongol.retreatPoint.z + (Math.random() * 12 - 6);
        // Push spawn away from the player if too close.
        if (playerPos) {
        const pdx = spawnX - playerPos.x;
        const pdz = spawnZ - playerPos.z;
        const pDist = Math.sqrt((pdx * pdx) + (pdz * pdz));
        if (pDist < hordeSafeRadius) {
        const angle = Math.atan2(pdz, pdx);
        spawnX = playerPos.x + Math.cos(angle) * hordeSafeRadius;
        spawnZ = playerPos.z + Math.sin(angle) * hordeSafeRadius;
        }
        }
        newPoints.push({
        id: 200 + i + Math.floor(Math.random() * 1000),
        team: "foe",
        x: spawnX,
        z: spawnZ,
        type: "mongol",
        maxHealth: 250 // Stronger horde
        });
        }
            console.log("Spawning stronger Mongol horde for false retreat!");
            // Reuse the same spawn options as the initial wave so the horde uses the correct model and rotation.
            const hordeSpawnOptions: NpcSceneSpawnOptions = {
                typeModelPaths: { mongol: "models/npc/MongolHorseman.glb" },
                typeSpawnOverrides: { 
                    mongol: { 
                        modelRotation: new Vec3(0, 0, 0),
                        facingYawOffsetDegrees: 0
                    }
                }
            };
            spawnSceneNpcs(app, rigidbodySystem, newPoints, hordeSpawnOptions).then(newNpcs => {
                for (const newNpc of newNpcs) {
                    if (groundCollisionEnabled && rigidbodySystem) {
                        const position = newNpc.getEntity().getPosition();
                        const groundY = getGroundYAt(rigidbodySystem, position.x, position.y, position.z, groundTag, groundProbeHeight, groundProbeDepth);
                        npcGroundOffsets.set(newNpc, groundY !== undefined ? Math.max(defaultGroundClearance, position.y - groundY) : defaultGroundClearance);
                    }
                    npcs.push(newNpc);
                }
            }).catch(err => {
                console.error("Failed to spawn Mongol horde:", err);
            });
        }

        if (groundCollisionEnabled && rigidbodySystem) {
            for (const currentNpc of npcs) {
                if (!currentNpc.isAlive()) {
                    continue;
                }

                const position = currentNpc.getEntity().getPosition();
                const groundY = getGroundYAt(rigidbodySystem, position.x, position.y, position.z, groundTag, groundProbeHeight, groundProbeDepth);
                if (groundY === undefined) {
                    const fallbackPosition = npcLastValidPositions.get(currentNpc);
                    if (fallbackPosition) {
                        currentNpc.getEntity().setPosition(fallbackPosition);
                    }
                    continue;
                }

                if (!npcGroundOffsets.has(currentNpc)) {
                    npcGroundOffsets.set(
                        currentNpc,
                        Math.max(defaultGroundClearance, position.y - groundY)
                    );
                }

                const groundOffset = npcGroundOffsets.get(currentNpc) ?? defaultGroundClearance;
                const groundedPosition = new Vec3(position.x, groundY + groundOffset, position.z);
                currentNpc.getEntity().setPosition(groundedPosition);
                npcLastValidPositions.set(currentNpc, groundedPosition.clone());
            }
        }
    };

    keyedApp[updateKey] = updateHandler;
    app.on("update", updateHandler);

    const cleanup = () => {
        app.off("update", updateHandler);
        if (keyedApp[updateKey] === updateHandler) {
            delete keyedApp[updateKey];
        }

        if (outlineRenderer) {
            outlineRenderer.destroy();
        }
    };

    registerSceneCleanup(app, cleanup);

    return () => {
        cleanup();
    };
}