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
	Asset,
	AssetListLoader,
	TEXTURETYPE_RGBP,
	Texture,
	StandardMaterial,
	MeshInstance,
	FILLMODE_FILL_WINDOW,
	RESOLUTION_AUTO,
	KEY_1,
	KEY_2,
	Mesh,
	SphereGeometry,
	CULLFACE_FRONT,
} from "playcanvas";

import { unloadAll } from '../../util/unloadall';
import { loadModel } from '../../util/loadModel';
import { createBattleHUD, removeBattleHUD, updateBattleHUD } from '../../util/battleHUD';
import { isDeathScreenVisible } from './deathScreen';

// @ts-expect-error - PlayCanvas ESM scripts don't have type declarations
import { Grid } from 'playcanvas/scripts/esm/grid.mjs';
import { Player } from '../../player/player';
import type { Battle } from "../Battle";
import { bindNpcCombatLoop, spawnSceneNpcs } from "../npc/sceneNpcSystem";
import { Boss } from "../npc/bosses/boss";
import { DEFAULT_BATTLE_NPC_SPAWN_OPTIONS, DEFAULT_WINGED_HUSSAR_BOSS_SPAWN_OPTIONS, VIENNA_BOSS_SPAWN_POINT, VIENNA_NPC_SPAWN_POINTS } from "../npc/sceneNpcPresets";
import { npc } from "../npc/npc";
import { triggerVictory } from "../../App";
import { getHighestGroundHitY, getRenderableBounds, createStarfieldTexture } from "../../util/battleSceneHelpers";

const groundModelPath = '/world/battlefields/Vienna.glb';



async function spawnBoss(app: AppBase, rigidbodySystem: any, npcs: npc[], groundYFallback: number): Promise<void> { // spawn the Winged Hussar boss and wire UI
	if (isBossSpawned || isBossSpawning) return;
	isBossSpawning = true;

	try {
const bossSpawnOptions = {
      ...DEFAULT_WINGED_HUSSAR_BOSS_SPAWN_OPTIONS,
      groundYFallback,
      groundProbeHeight: 500,
      groundProbeDepth: 500
    };
		const spawned = await spawnSceneNpcs(app, rigidbodySystem, VIENNA_BOSS_SPAWN_POINT, bossSpawnOptions);
		for (const s of spawned) {
			npcs.push(s);
			if (s instanceof Boss) {
				s.drawHealthBar();
				Boss.setActiveBoss(s);
			}
		}
		isBossSpawned = true;
	} catch (err) {
		console.error('Failed to spawn boss:', err);
	} finally {
		isBossSpawning = false;
	}
}

var isBossSpawned = false; // Track whether the boss has been spawned yet
var isBossSpawning = false; // Track whether a boss spawn attempt is in progress

function resetViennaBattleState(): void {
	isBossSpawned = false;
	isBossSpawning = false;
}

export async function siegeOfViennaScene(
	canvas: HTMLCanvasElement,
	app: AppBase,
	_onClick: (battle: Battle) => void,
	_sceneNum: number,
	spawnPoint?: [number, number, number]
) {
	resetViennaBattleState();
	// Clean up any previous scene assets and input listeners
	unloadAll(app);
	app.mouse?.off();
	app.keyboard?.off();

	if (!canvas) {
		throw new Error('Canvas not found');
	}

	// Hide the page overlay (UI text/info pills) while we're in the 3D scene
	const overlay = document.querySelector('.overlay') as HTMLElement | null;
	const hiddenMap = new Map<HTMLElement, string | null>();
	if (overlay) {
		// Save the original display style of each overlay element so we can restore it later
		const children = Array.from(overlay.children) as HTMLElement[];
		for (const child of children) {
			hiddenMap.set(child, child.style.display || null);
			child.style.display = 'none';
		}
	}

	// Hide the hover label that appears when you mouse over battlefields on the default globe
	const hoverLabel = document.getElementById('battle-hover-label');
	if (hoverLabel) {
		hoverLabel.style.display = 'none';
	}

	// Initialize the graphics device and app if this is the first time
	if (!app.graphicsDevice) {
		const device = await createGraphicsDevice(canvas);
		const createOptions = new AppOptions();
		createOptions.graphicsDevice = device;
		// Set up input handling (mouse, keyboard, touch)
		createOptions.mouse = new Mouse(document.body);
		createOptions.keyboard = new Keyboard(window);
		createOptions.touch = new TouchDevice(document.body);
		// Enable the component systems needed for rendering, physics, scripts, etc.
		createOptions.componentSystems = [
			RenderComponentSystem,
			CameraComponentSystem,
			ScriptComponentSystem,
			LightComponentSystem,
			CollisionComponentSystem,
			RigidBodyComponentSystem
		];
		// Set up asset handlers for textures and container models
		createOptions.resourceHandlers = [TextureHandler, ContainerHandler];

		// Initialize the app with all these settings
		app.init(createOptions);

		// Make sure we have keyboard input available
		if (!app.keyboard) {
				app.keyboard = new Keyboard(window);
		}

		// Configure the canvas to fill the window and auto-scale
		app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
		app.setCanvasResolution(RESOLUTION_AUTO);

		// Handle window resizing by updating the canvas
		const resize = () => app.resizeCanvas();
		window.addEventListener('resize', resize);
    
		// When the app is destroyed, clean up the resize listener and restore overlay
		app.once('destroy', () => {
			window.removeEventListener('resize', resize);
			// Restore overlay display values to what they were before
			for (const [el, prev] of hiddenMap.entries()) {
				if (prev === null) el.style.removeProperty('display');
				else el.style.display = prev;
			}
		});

		// Start the main game loop
		app.start();
	}

	// Ensure keyboard input is available
	if (!app.keyboard) {
		app.keyboard = new Keyboard(window);
	}

	// Load or find the environment map texture used for reflections and lighting
	const envAtlasAsset = app.assets.find('battle-env-atlas') ?? new Asset(
		'battle-env-atlas',
		'texture',
		{ url: '/environment-map.png' },
		{
			type: TEXTURETYPE_RGBP,  // RGBP = RGB + Parallax (for cubemap)
			mipmaps: false
		}
	);

	// Add the environment atlas to the asset registry if it's not already there
	if (!app.assets.find('battle-env-atlas')) {
		app.assets.add(envAtlasAsset);
	}

	// Wait for the environment map to load before proceeding
	await new Promise<void>((resolve) => {
		if (envAtlasAsset.loaded) {
			resolve();
			return;
		}
		new AssetListLoader([envAtlasAsset], app.assets).load(() => resolve());
	});

	// Apply the loaded environment map to the scene for reflections
	app.scene.envAtlas = envAtlasAsset.resource as Texture;

	// Create the player with camera and first-person controls
	const playerSpawn = new Vec3(...(spawnPoint ?? [0, 8, 8]));
	const player = new Player(app, playerSpawn);
	let respawnPosition = playerSpawn.clone();
	let respawnGroundY = 0;
	player.setDeathQuizContext(3, () => {
		player.revive(respawnPosition);
		if (cameraController) {
			cameraController.groundHeight = respawnGroundY;
		}
		createBattleHUD();
		updateBattleHUD(player);
	});
	const cameraController = player.getCameraController();
	const cameraEntity = player.getCameraEntity();
	if (cameraEntity.camera) {
		cameraEntity.camera.clearColor = new Color(0, 0, 0);
	}

	const starMaterial = new StandardMaterial();
	starMaterial.useLighting = false;
	starMaterial.emissive.set(1, 1, 1);
	starMaterial.emissiveMap = createStarfieldTexture(app.graphicsDevice);
	starMaterial.cull = CULLFACE_FRONT;
	starMaterial.update();

	const starDome = new Entity('legnica-star-dome');
	const starMesh = Mesh.fromGeometry(app.graphicsDevice, new SphereGeometry({
		radius: 220,
		latitudeBands: 64,
		longitudeBands: 64
	}));
	starDome.addComponent('render', {
		meshInstances: [new MeshInstance(starMesh, starMaterial)]
	});
	starDome.setPosition(cameraEntity.getPosition());
	app.root.addChild(starDome);
	app.on('update', () => {
		starDome.setPosition(cameraEntity.getPosition());
	});

	// Load and set up the battlefield ground model
	try {

		const ground = await loadModel(groundModelPath, app, {
			rigidbodyType: 'static',  // Ground doesn't move, it's static
			includeDescendants: true, // Load child entities too
			position: new Vec3(0, 0, 0),
			rotation: new Vec3(0, 0, 0),
			scale: new Vec3(1, 1, 1)
		});
    
		// Name the ground and tag it so we can find it later with raycasts
		ground.modelEntity.name = 'ground';
		ground.modelEntity.tags.add('ground');

		// Debug logging to verify the collision system is working
		const groundRb = ground.modelEntity.rigidbody;
		const groundCol = ground.modelEntity.collision;
		const childColliders = (ground.modelEntity.children as Entity[]).filter(
			(c) => c.collision
		);
		console.log('[Ground] loaded', {
			path: groundModelPath,
			name: ground.modelName,
			hasRigidbody: !!groundRb,
			rigidbodyType: groundRb?.type,
			hasCollision: !!groundCol,
			collisionType: groundCol?.type,
			childColliderCount: childColliders.length,
			childColliderTypes: childColliders.map((c) => c.collision?.type),
			ammoRuntime: (globalThis as any).__ammoRuntime
		});

// Warn if collision wasn't set up properly (raycasting won't work then)
  if (!groundRb && !groundCol && childColliders.length === 0) {
    console.error('[Ground] NO collision/rigidbody detected — raycasting will fail!');
  }

  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  // Try to spawn the player on top of the ground
		let spawnResolved = false;
		const spawnSurfaceOffset = (cameraController?.playerHeight ?? 2) + 0.05;  // Slightly above ground
		const bounds = getRenderableBounds(ground.modelEntity);
    
		// If we got the bounds, spawn at the center of the ground surface
  if (bounds) {
      cameraController?.setMovementBounds(bounds, 2.5);
      const spawnX = (bounds.minX + bounds.maxX) * 0.5;
      const spawnZ = (bounds.minZ + bounds.maxZ) * 0.5;
const seededGroundY = getHighestGroundHitY(app, spawnX, spawnZ, 'ground');
    if (seededGroundY !== undefined) {
      const surfaceY = seededGroundY;
      const spawnY = surfaceY + spawnSurfaceOffset;
      player.setPosition(new Vec3(spawnX, spawnY, spawnZ));
      respawnPosition = player.getPosition().clone();
      respawnGroundY = surfaceY;

      if (cameraController) {
        cameraController.groundHeight = surfaceY;
      }
      spawnResolved = true;
      console.log(
        `[Spawn] camera placed on terrain surface at (${spawnX.toFixed(2)}, ${spawnY.toFixed(2)}, ${spawnZ.toFixed(2)}), surfaceY ${surfaceY.toFixed(2)}, seededRayY ${seededGroundY.toFixed(2)}`
      );
    }
		}

		// If center spawn didn't work, search nearby positions for a valid ground hit
		if (!spawnResolved) {
			const spawnCandidates: Vec3[] = [];
const spawnSearchRadius = 48;
  const spawnSearchStep = 8;
			// Create a grid of candidate positions around the center
			for (let x = -spawnSearchRadius; x <= spawnSearchRadius; x += spawnSearchStep) {
				for (let z = -spawnSearchRadius; z <= spawnSearchRadius; z += spawnSearchStep) {
					spawnCandidates.push(new Vec3(x, 0, z));
				}
			}

			let bestSpawnCandidate: Vec3 | undefined;
			let bestSpawnGroundY: number | undefined;

			// Find the candidate position with the highest ground surface
			for (const candidate of spawnCandidates) {
				const hitY = getHighestGroundHitY(app, candidate.x, candidate.z, 'ground');
				if (hitY === undefined) {
					continue;
				}

				// Keep track of the highest valid ground position we found
				if (bestSpawnGroundY === undefined || hitY > bestSpawnGroundY) {
					bestSpawnGroundY = hitY;
					bestSpawnCandidate = candidate;
				}
			}

			// If we found a valid spawn position, use it
			if (bestSpawnCandidate && bestSpawnGroundY !== undefined) {
				const spawnY = bestSpawnGroundY + spawnSurfaceOffset;
				player.setPosition(new Vec3(bestSpawnCandidate.x, spawnY, bestSpawnCandidate.z));
				respawnPosition = player.getPosition().clone();
				respawnGroundY = bestSpawnGroundY;
				if (cameraController) {
					cameraController.groundHeight = bestSpawnGroundY;
				}
				spawnResolved = true;
				console.log(
					`[Spawn] camera placed at (${bestSpawnCandidate.x.toFixed(2)}, ${spawnY.toFixed(2)}, ${bestSpawnCandidate.z.toFixed(2)}) from ground Y ${bestSpawnGroundY.toFixed(2)}`
				);
			}
		}

		// If nothing worked, just log a warning and keep the default position
		if (!spawnResolved) {
			console.warn('[Spawn] No valid ground-tagged spawn hit found; keeping default camera position');
		}

	} catch (error) {
		console.error('[Ground] model load failed', error);
	}


	// Set up physics collision logging to debug collisions
	const rigidbodySystem = (app.systems as any).rigidbody;
	if (rigidbodySystem && typeof rigidbodySystem.on === 'function') {
		// Listen for collision contacts and log them
		rigidbodySystem.on('contact', (contactResult: any) => {
			const posA = contactResult?.entityA?.getPosition?.();
			const posB = contactResult?.entityB?.getPosition?.();
			const nameA = contactResult?.entityA?.name ?? '?';
			const nameB = contactResult?.entityB?.name ?? '?';
			const contactPos = posA ?? posB;
			console.log(`[Collision Contact] "${nameA}" <-> "${nameB}" at (${contactPos?.x?.toFixed(2) ?? '?'}, ${contactPos?.y?.toFixed(2) ?? '?'}, ${contactPos?.z?.toFixed(2) ?? '?'})`);
		});
	} else {
		console.warn('[Collision] rigidbody system not available — contact logging disabled');
	}


	// Set up basic scene lighting
	// Ambient light provides a baseline light level everywhere
	app.scene.ambientLight = new Color(0.2, 0.2, 0.2);

	// Create a directional light (like the sun) to cast shadows
	if (app.systems.light) {
		const light = new Entity('directional-light');
		light.addComponent('light', {
			type: 'directional',
			color: new Color(1, 1, 1),  // White light
			intensity: 1,
			castShadows: true  // This light casts shadows for realism
		});
		light.setLocalEulerAngles(45, 30, 0);  // Light coming from above and at an angle
		app.root.addChild(light);
	}

const npcSpawnOptions = {
    ...DEFAULT_BATTLE_NPC_SPAWN_OPTIONS,
    groundYFallback: respawnGroundY,
    groundProbeHeight: 500,
    groundProbeDepth: 500
  };
	const npcs = await spawnSceneNpcs(app, rigidbodySystem, VIENNA_NPC_SPAWN_POINTS, npcSpawnOptions);

	// Create battle HUD to display weapon and health
	createBattleHUD();
	updateBattleHUD(player);

	app.keyboard?.on('keydown', (event: { key: number | null }) => {
		if (isDeathScreenVisible()) {
			return;
		}

		if (event.key === KEY_1) {
			player.equipWeapon(1);
			updateBattleHUD(player);
		} else if (event.key === KEY_2) {
			player.equipWeapon(4);
			updateBattleHUD(player);
		}
	});

	app.mouse?.on('mousedown', (event: { x: number; y: number; button: number }) => {
		if (isDeathScreenVisible()) {
			return;
		}

		if (event.button !== 0) {
			return;
		}

		const isGunEquipped = (player.getEquippedWeaponName() === 'Gun' || player.getEquippedWeaponName() === 'Bow');
		const targetX = isGunEquipped ? app.graphicsDevice.width * 0.5 : event.x;
		const targetY = isGunEquipped ? app.graphicsDevice.height * 0.5 : event.y;
		const hitNpc = cameraController?.getClickedNpcInRange(targetX, targetY, npcs, player.getAttackRange());
		player.attack(hitNpc ?? null);
		updateBattleHUD(player);
		if (hitNpc) {
			console.log(`Hit NPC`);
			try {
				if ((hitNpc as any) instanceof Boss) {
					(hitNpc as unknown as Boss).updateHealthBar();
				}
			} catch (e) {
				// ignore
			}
		}
	});

  bindNpcCombatLoop(app, npcs, () => player.getCameraEntity(), {
  updateKey: '__viennaNpcUpdate',
  groundProbeHeight: 500,
  groundProbeDepth: 500,
  obstacleCollisionEnabled: true,
  getPlayerHealth: () => ({ current: player.getHealth(), max: player.getDebugState().maxHealth }),
		battleStatus: {
			getCameraEntity: () => player.getCameraEntity(),
			initialTotal: VIENNA_NPC_SPAWN_POINTS.length + VIENNA_BOSS_SPAWN_POINT.length,
			onRemainingCountChange: (remaining) => updateBattleHUD(player, remaining)
		},
		onNpcAttack: (attacker, target, damage) => {
			target.takeDamage(damage);
			try {
				if ((target as any) instanceof Boss) {
					(target as unknown as Boss).updateHealthBar();
				}
			} catch (e) {
				// ignore
			}
			console.log(`NPC ${attacker.getId()} (${attacker.getTeam()}) hit NPC ${target.getId()} for ${damage}.`);
		},
		onPlayerAttack: (attacker, damage) => {
			player.takeDamage(damage);
			updateBattleHUD(player);
			console.log(`Player hit by NPC ${attacker.getId()} for ${damage}, health now ${player.getHealth()}`);
		}
	});

	let victoryHandled = false;
	const victoryCheck = () => {
		if (isDeathScreenVisible()) {
			return;
		}

		if (victoryHandled) {
			return;
		}

		const remainingFoes = npcs.filter((currentNpc) => currentNpc.getTeam() === 'foe' && currentNpc.isAlive());
		if (remainingFoes.length === 0 && isBossSpawned) {
			victoryHandled = true;
			removeBattleHUD();
			triggerVictory('Siege of Vienna', canvas, app);
		}
		else if (remainingFoes.length === 0 && !isBossSpawned) {
			// spawn the boss asynchronously
			spawnBoss(app, rigidbodySystem, npcs, respawnGroundY).catch((err) => console.error(err));
		}
	};

	app.on('update', victoryCheck);
}

