import {
  AppBase,
  Entity,
  Color,
  Vec3,
  Mouse,
  Keyboard,
  TouchDevice,
  createGraphicsDevice,
  AppOptions,
  RenderComponentSystem,
  CameraComponentSystem,
  ScriptComponentSystem,
  LightComponentSystem,
  CollisionComponentSystem,
  RigidBodyComponentSystem,
  TextureHandler,
  ContainerHandler,
  StandardMaterial,
  MeshInstance,
  FILLMODE_FILL_WINDOW,
  RESOLUTION_AUTO,
  Mesh,
  BoxGeometry,
  SphereGeometry,
  CULLFACE_FRONT,
  KEY_1,
  KEY_2,
  Texture,
} from "playcanvas";

import { unloadAll } from "../../util/unloadall";
import { createBattleHUD, removeBattleHUD, updateBattleHUD } from "../../util/battleHUD";
import { isDeathScreenVisible } from "./deathScreen";
import { Player } from "../../player/player";
import type { Battle } from "../Battle";
import { bindNpcCombatLoop, spawnSceneNpcs } from "../npc/sceneNpcSystem";
import { Boss } from "../npc/bosses/boss";
import {
  AIR_LADIN_BOSS_SPAWN_OVERRIDES,
  TOWER_BOSS_SPAWN_OVERRIDES,
  NORTHWOOD_HIGH_AIR_LADIN_SPAWN_POINT,
  NORTHWOOD_HIGH_TOWER_SPAWN_POINT,
} from "../npc/sceneNpcPresets";
import { triggerVictory } from "../../App";

/**
 * Battle of Northwood High School.
 * Phase 1: Air Ladin.
 * Phase 2: Tower.
 *
 * The arena uses custom white-floor terrain, so that piece stays separate from the rest of the scene flow.
 */

function createStarfieldTexture(
  device: AppBase["graphicsDevice"],
  width = 1024,
  height = 512,
): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new Texture(device!, {
      mipmaps: true,
      name: "northwood-starfield-fallback",
    });
  }

  const baseGradient = ctx.createLinearGradient(0, 0, width, height);
  baseGradient.addColorStop(0, "#1a1a1e");
  baseGradient.addColorStop(0.5, "#222228");
  baseGradient.addColorStop(1, "#1a1a1e");
  ctx.fillStyle = baseGradient;
  ctx.fillRect(0, 0, width, height);

  const starCount = 600;
  for (let index = 0; index < starCount; index += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() < 0.9 ? 1 : 2;
    const alpha = 0.3 + Math.random() * 0.5;
    ctx.fillStyle = `rgba(${180 + Math.floor(Math.random() * 40)}, ${180 + Math.floor(Math.random() * 40)}, ${190 + Math.floor(Math.random() * 30)}, ${alpha})`;
    ctx.fillRect(x, y, size, size);
  }

  const texture = new Texture(device!, {
    mipmaps: true,
    name: "northwood-starfield",
  });
  texture.setSource(canvas);
  return texture;
}

function createWhiteFloor(
  app: AppBase,
  position: Vec3,
  scale: Vec3,
  color?: Color,
): Entity {
  const floor = new Entity("white-floor");

  const material = new StandardMaterial();
  const floorColor = color ?? new Color(0.4, 0.4, 0.45);
  material.diffuse.set(floorColor.r, floorColor.g, floorColor.b);
  material.useLighting = true;
  material.update();

  const mesh = Mesh.fromGeometry(app.graphicsDevice, new BoxGeometry({
    halfExtents: new Vec3(scale.x / 2, 0.05, scale.z / 2),
  }));
  floor.addComponent("render", {
    meshInstances: [new MeshInstance(mesh, material)],
  });

  floor.addComponent("collision", {
    type: "box",
    halfExtents: new Vec3(scale.x / 2, 0.05, scale.z / 2),
  });
  floor.addComponent("rigidbody", {
    type: "static",
  });
  floor.tags.add("ground");

  floor.setPosition(position);
  return floor;
}

function wireBossSpawn(spawned: any[], npcs: any[]): void {
  for (const npc of spawned) {
    npcs.push(npc);
    if (npc instanceof Boss) {
      Boss.setActiveBoss(npc);
      npc.drawHealthBar();
    }
  }
}

export async function battleOfNorthwoodHighScene(
  canvas: HTMLCanvasElement,
  app: AppBase,
  _onClick: (battle: Battle) => void,
  _sceneNum: number,
  spawnPoint?: [number, number, number],
) {
  unloadAll(app);
  app.mouse?.off();
  app.keyboard?.off();

  if (!canvas) {
    throw new Error("Canvas not found");
  }

  const overlay = document.querySelector(".overlay") as HTMLElement | null;
  const hiddenMap = new Map<HTMLElement, string | null>();
  if (overlay) {
    for (const child of Array.from(overlay.children) as HTMLElement[]) {
      hiddenMap.set(child, child.style.display || null);
      child.style.display = "none";
    }
  }

  const hoverLabel = document.getElementById("battle-hover-label");
  if (hoverLabel) {
    hoverLabel.style.display = "none";
  }

  if (!app.graphicsDevice) {
    const device = await createGraphicsDevice(canvas);
    const createOptions = new AppOptions();
    createOptions.graphicsDevice = device;
    createOptions.mouse = new Mouse(document.body);
    createOptions.keyboard = new Keyboard(window);
    createOptions.touch = new TouchDevice(document.body);
    createOptions.componentSystems = [
      RenderComponentSystem,
      CameraComponentSystem,
      ScriptComponentSystem,
      LightComponentSystem,
      CollisionComponentSystem,
      RigidBodyComponentSystem,
    ];
    createOptions.resourceHandlers = [TextureHandler, ContainerHandler];
    app.init(createOptions);

    if (!app.keyboard) {
      app.keyboard = new Keyboard(window);
    }

    app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
    app.setCanvasResolution(RESOLUTION_AUTO);

    const resize = () => app.resizeCanvas();
    window.addEventListener("resize", resize);
    app.once("destroy", () => {
      window.removeEventListener("resize", resize);
      for (const [element, previousDisplay] of hiddenMap.entries()) {
        if (previousDisplay === null) {
          element.style.removeProperty("display");
        } else {
          element.style.display = previousDisplay;
        }
      }
    });

    app.start();
  }

  const playerSpawn = new Vec3(...(spawnPoint ?? [0, 8, 8]));
  const player = new Player(app, playerSpawn);
  let respawnPosition = playerSpawn.clone();
  let respawnGroundY = 0;
  let whiteFloor: Entity | null = null;
  let floorCollision: any = null;

  const cameraController = player.getCameraController();
  const cameraEntity = player.getCameraEntity();
  if (cameraEntity.camera) {
    cameraEntity.camera.clearColor = new Color(0.05, 0.05, 0.06);
  }

  player.setDeathQuizContext(7, () => {
    player.revive(respawnPosition);
    if (cameraController) {
      cameraController.groundHeight = respawnGroundY;
    }
    createBattleHUD();
    player.equipWeapon(2);
    updateBattleHUD(player);
  });

  const starMaterial = new StandardMaterial();
  starMaterial.useLighting = false;
  starMaterial.emissive.set(1, 1, 1);
  starMaterial.emissiveMap = createStarfieldTexture(app.graphicsDevice);
  starMaterial.cull = CULLFACE_FRONT;
  starMaterial.update();

  const starDome = new Entity("northwood-star-dome");
  const starMesh = Mesh.fromGeometry(app.graphicsDevice, new SphereGeometry({
    radius: 500,
    latitudeBands: 64,
    longitudeBands: 64,
  }));
  starDome.addComponent("render", {
    meshInstances: [new MeshInstance(starMesh, starMaterial)],
  });
  starDome.setPosition(cameraEntity.getPosition());
  app.root.addChild(starDome);
  app.on("update", () => {
    starDome.setPosition(cameraEntity.getPosition());
  });

  const PHASE1_FLOOR_SIZE = 400;
  const PHASE2_FLOOR_SIZE = 800;

  try {
    whiteFloor = createWhiteFloor(
      app,
      new Vec3(0, 0, 0),
      new Vec3(PHASE1_FLOOR_SIZE, 1, PHASE1_FLOOR_SIZE),
      new Color(0.4, 0.4, 0.45),
    );
    app.root.addChild(whiteFloor);
    floorCollision = whiteFloor.collision;

    const groundY = 0.15;
    const spawnY = groundY + (cameraController?.playerHeight ?? 2) + 0.05;
    player.setPosition(new Vec3(0, spawnY, PHASE1_FLOOR_SIZE * 0.4));
    respawnPosition = player.getPosition().clone();
    respawnGroundY = groundY;
    if (cameraController) {
      cameraController.groundHeight = groundY;
    }
  } catch (error) {
    console.error("[NorthwoodHigh] Floor creation failed", error);
  }

  const npcs: any[] = [];
  let phase: "airLadin" | "tower" = "airLadin";
  let airLadinSpawned = false;
  let towerSpawned = false;
  let towerSpawnInProgress = false;

  async function spawnPhase1(): Promise<void> {
    if (airLadinSpawned) {
      return;
    }
    airLadinSpawned = true;

    const spawnOptions = {
      ...AIR_LADIN_BOSS_SPAWN_OVERRIDES,
      groundYFallback: respawnGroundY,
    };

    try {
      const spawned = await spawnSceneNpcs(
        app,
        (app.systems as any).rigidbody,
        NORTHWOOD_HIGH_AIR_LADIN_SPAWN_POINT,
        spawnOptions,
      );
      wireBossSpawn(spawned, npcs);
    } catch (error) {
      console.error("[NorthwoodHigh] Failed to spawn Air Ladin:", error);
    }
  }

  async function spawnTowerBoss(): Promise<void> {
    if (towerSpawned || towerSpawnInProgress) {
      return;
    }

    towerSpawnInProgress = true;
    towerSpawned = true;
    phase = "tower";

    const spawnOptions = {
      ...TOWER_BOSS_SPAWN_OVERRIDES,
      groundYFallback: respawnGroundY,
    };

    try {
      const spawned = await spawnSceneNpcs(
        app,
        (app.systems as any).rigidbody,
        NORTHWOOD_HIGH_TOWER_SPAWN_POINT,
        spawnOptions,
      );
      wireBossSpawn(spawned, npcs);

      if (whiteFloor) {
        const scaleRatio = PHASE2_FLOOR_SIZE / PHASE1_FLOOR_SIZE;
        whiteFloor.setLocalScale(scaleRatio, 1, scaleRatio);
        if (floorCollision) {
          floorCollision.halfExtents = new Vec3(PHASE2_FLOOR_SIZE / 2, 0.05, PHASE2_FLOOR_SIZE / 2);
        }
      }
    } catch (error) {
      console.error("[NorthwoodHigh] Failed to spawn Tower:", error);
    } finally {
      towerSpawnInProgress = false;
    }
  }

  await spawnPhase1();

  createBattleHUD();
  player.equipWeapon(2);
  updateBattleHUD(player);

  app.keyboard?.on("keydown", (event: { key: number | null }) => {
    if (isDeathScreenVisible()) {
      return;
    }
    if (event.key === KEY_1) {
      player.equipWeapon(1);
      updateBattleHUD(player);
    } else if (event.key === KEY_2) {
      player.equipWeapon(2);
      updateBattleHUD(player);
    }
  });

  app.mouse?.on("mousedown", (event: { x: number; y: number; button: number }) => {
    if (isDeathScreenVisible()) {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    const gunEquipped = player.getEquippedWeaponName() === "Gun";
    const targetX = gunEquipped ? app.graphicsDevice.width * 0.5 : event.x;
    const targetY = gunEquipped ? app.graphicsDevice.height * 0.5 : event.y;
    const hitNpc = cameraController?.getClickedNpcInRange(
      targetX,
      targetY,
      npcs,
      player.getAttackRange(),
    );

    player.attack(hitNpc ?? null);
    updateBattleHUD(player);

    if (hitNpc instanceof Boss) {
      hitNpc.updateHealthBar();
    }
  });

  bindNpcCombatLoop(app, npcs, () => player.getCameraEntity(), {
    updateKey: "__northwoodHighNpcUpdate",
    getPlayerHealth: () => ({
      current: player.getHealth(),
      max: player.getDebugState().maxHealth,
    }),
    battleStatus: {
      getCameraEntity: () => player.getCameraEntity(),
      initialTotal: 2,
      onRemainingCountChange: (remaining) => updateBattleHUD(player, remaining),
    },
    onNpcAttack: (_attacker, target, damage) => {
      target.takeDamage(damage);
      if (target instanceof Boss) {
        target.updateHealthBar();
      }
    },
    onPlayerAttack: (_attacker, damage) => {
      player.takeDamage(damage);
      updateBattleHUD(player);
    },
  });

  let victoryHandled = false;
  app.on("update", () => {
    if (isDeathScreenVisible() || victoryHandled) {
      return;
    }

    const remainingFoes = npcs.filter((currentNpc: any) => currentNpc.getTeam() === "foe" && currentNpc.isAlive());

    if (phase === "airLadin" && !towerSpawned) {
      const airLadinAlive = npcs.some((currentNpc: any) =>
        currentNpc.getTeam() === "foe" &&
        currentNpc.isAlive() &&
        currentNpc instanceof Boss &&
        currentNpc.getTitle() === "Air Ladin",
      );

      if (!airLadinAlive) {
        void spawnTowerBoss();
      }
    }

    if (remainingFoes.length === 0 && towerSpawned && !towerSpawnInProgress) {
      victoryHandled = true;
      removeBattleHUD();
      triggerVictory("Northwood High School", canvas, app);
    }
  });

  app.scene.ambientLight = new Color(0.15, 0.15, 0.15);
  if (app.systems.light) {
    const light = new Entity("directional-light");
    light.addComponent("light", {
      type: "directional",
      color: new Color(0.9, 0.9, 0.92),
      intensity: 1,
      castShadows: true,
    });
    light.setLocalEulerAngles(45, 30, 0);
    app.root.addChild(light);
  }
}
