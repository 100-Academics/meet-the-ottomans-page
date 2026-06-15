import { AppBase, Entity, Vec3 } from "playcanvas";
import { loadModel, type Model } from "../util/loadModel";
import {
    getHighestGroundHitY,
    type RenderableBounds,
} from "../util/battleSceneHelpers";

// ── Global counter ──
//
// Module-level so it survives scene changes. Bumped every time the player
// collects any Secret anywhere in the world.
//
// Read it from anywhere with `getSecretsFound()`. Reset with `resetSecretsFound()`.
let secretsFound = 0;

// Total number of secrets hidden across the whole game. Tracked here (not at
// each call site) so the popup denominator stays consistent no matter which
// battle the player is in.
export const TOTAL_SECRETS_AVAILABLE = 21;

// ── Secrets counter popup ──
//
// A small fixed-position DOM badge showing "secrets found... X/21". Mounted
// lazily on first show (so the DOM is empty until there's something to tell
// the player about) and fades in/out with a CSS opacity transition.
const POPUP_ID = 'secrets-counter-popup';
const POPUP_VISIBLE_CLASS = 'visible';
// How long the popup stays at full opacity before it starts fading out.
const POPUP_VISIBLE_MS = 1500;

function ensureSecretsPopup(): HTMLElement | null {
    if (typeof document === 'undefined' || !document.body) return null;

    let el = document.getElementById(POPUP_ID);
    if (el) return el;

    el = document.createElement('div');
    el.id = POPUP_ID;
    el.setAttribute('aria-live', 'polite');
    el.textContent = `secrets found... ${secretsFound}/${TOTAL_SECRETS_AVAILABLE}`;
    document.body.appendChild(el);
    return el;
}

function hideSecretsPopup(): void {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(POPUP_ID);
    if (el) el.classList.remove(POPUP_VISIBLE_CLASS);
}

// Visible-while-id timer: lets a rapid second pickup reset the timer instead
// of leaving the popup half-faded when the next secret is grabbed.
let popupHideTimer: ReturnType<typeof setTimeout> | null = null;

// Show the popup with the latest count, then schedule a fade-out. If called
// while the popup is already visible, the existing fade-out is cancelled so
// the badge stays bright through the second reveal.
export function showSecretsPopup(durationMs: number = POPUP_VISIBLE_MS): void {
    const el = ensureSecretsPopup();
    if (!el) return;
    el.textContent = `secrets found... ${secretsFound}/${TOTAL_SECRETS_AVAILABLE}`;
    el.classList.add(POPUP_VISIBLE_CLASS);

    if (popupHideTimer !== null) {
        clearTimeout(popupHideTimer);
    }
    popupHideTimer = setTimeout(() => {
        hideSecretsPopup();
        popupHideTimer = null;
    }, durationMs);
}

export function getSecretsFound(): number {
    return secretsFound;
}

export function setSecretsFound(count: number): void {
    secretsFound = count;
}

export function resetSecretsFound(): void {
    secretsFound = 0;
    if (popupHideTimer !== null) {
        clearTimeout(popupHideTimer);
        popupHideTimer = null;
    }
    // Counter back to zero → nothing to brag about, so hide the popup rather
    // than flashing "0/21" at the player.
    hideSecretsPopup();
}

// ── SecretOptions ──
//
// Pass these when constructing a Secret. The model is loaded from
// src/assets/<modelPath> by the loader in util/loadModel.
export interface SecretOptions {
    app: AppBase;
    cameraEntity: Entity;
    modelPath: string;
    position: Vec3;
    scale?: Vec3;
    rotation?: Vec3;
    // Forgiving click radius around the secret's center (world units).
    hitboxRadius?: number;
    // Player must be within this distance to collect on click.
    maxClickRange?: number;
}

// ── Secret ──
//
// A clickable collectible. Place a static 3D model in the scene; when the player
// left-clicks it (or near it, within the hitbox radius), it disappears and the
// global counter ticks up.
//
// Usage:
//
//     const secret = new Secret({
//         app,
//         cameraEntity: player.getCameraEntity(),
//         modelPath: "models/secret/coin.glb",
//         position: new Vec3(3, 1, -5),
//         scale: new Vec3(0.5, 0.5, 0.5)
//     });
//     await secret.spawn();
//
// That's it — listeners auto-clean when the scene unloads, and `getSecretsFound()`
// updates the moment the player clicks. Call `dispose()` if you want to remove
// a secret early without it being collected.
export class Secret {
    private readonly app: AppBase;
    private readonly cameraEntity: Entity;
    private readonly modelPath: string;
    private readonly position: Vec3;
    private readonly scale: Vec3 | undefined;
    private readonly rotation: Vec3 | undefined;
    private readonly hitboxRadius: number;
    private readonly maxClickRange: number;

    private model: Model | null = null;
    private collected = false;
    private onMouseDown: ((event: { x: number; y: number; button: number }) => void) | null = null;

    constructor(options: SecretOptions) {
        this.app = options.app;
        this.cameraEntity = options.cameraEntity;
        this.modelPath = options.modelPath;
        this.position = options.position.clone();
        this.scale = options.scale?.clone();
        this.rotation = options.rotation?.clone();
        this.hitboxRadius = options.hitboxRadius ?? 1.5;
        this.maxClickRange = options.maxClickRange ?? 12;
    }

    // Load the .glb model into the scene and start listening for clicks.
    // Defaults match loadModel.ts so undecorated models still appear at a
    // usable size and orientation.
    public async spawn(): Promise<void> {
        if (this.model) return;

        this.model = await loadModel(this.modelPath, this.app, {
            position: this.position,
            scale: this.scale,
            rotation: this.rotation,
            // We hit-test via ray-distance, so collision geometry is not needed.
            // Skip rigidbody/collision setup to save physics cost.
            autoCollision: false
        });

        this.attachClickListener();
    }

    public isCollected(): boolean {
        return this.collected;
    }

    // Manually tear down a secret without counting it (e.g. scene editor
    // removed it). Idempotent — safe to call more than once.
    public dispose(): void {
        this.detachClickListener();
        if (this.model?.modelEntity) {
            this.model.modelEntity.destroy();
        }
        this.model = null;
    }

    private attachClickListener(): void {
        this.onMouseDown = (event) => {
            if (this.collected) return;
            // Only respond to primary (left) clicks.
            if (event.button !== 0) return;
            if (this.isPointerHit(event.x, event.y)) {
                this.collect();
            }
        };
        this.app.mouse?.on('mousedown', this.onMouseDown);
    }

    private detachClickListener(): void {
        if (this.onMouseDown) {
            this.app.mouse?.off('mousedown', this.onMouseDown);
            this.onMouseDown = null;
        }
    }

    // Cast a ray from the camera through the clicked screen pixel. The secret
    // is "hit" if it sits within hitboxRadius of the ray AND the player is
    // within maxClickRange of the secret. No collision geometry required,
    // which mirrors how `Weapon.getClickedNpcInRange` falls back when physics
    // raycasts miss visible models.
    private isPointerHit(screenX: number, screenY: number): boolean {
        const camera = this.cameraEntity.camera;
        if (!camera) return false;

        const rayStart = camera.screenToWorld(screenX, screenY, camera.nearClip);
        const rayEnd = camera.screenToWorld(screenX, screenY, camera.farClip);
        const rayDir = rayEnd.clone().sub(rayStart);
        const rayLength = rayDir.length();
        if (rayLength <= 0.0001) return false;
        rayDir.mulScalar(1 / rayLength);

        const cameraPos = this.cameraEntity.getPosition();
        const toSecret = this.position.clone().sub(cameraPos);

        // Reject anything behind the camera or past the max click range.
        const projectedDistance = toSecret.dot(rayDir);
        if (projectedDistance < 0 || projectedDistance > this.maxClickRange) return false;

        // Closest point on the ray to the secret; if that's within hitboxRadius,
        // the click visually landed on it.
        const closestPointOnRay = cameraPos.clone().add(rayDir.clone().mulScalar(projectedDistance));
        const distanceFromRay = this.position.distance(closestPointOnRay);
        return distanceFromRay <= this.hitboxRadius;
    }

    private collect(): void {
        if (this.collected) return;
        this.collected = true;
        secretsFound++;
        showSecretsPopup();
        console.log(
            `[Secret] collected at (${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}, ${this.position.z.toFixed(2)}) — total: ${secretsFound}`
        );
        this.dispose();
    }
}

// ── spawnSecret ──
//
// One-call helper that creates a Secret, spawns it, and returns it. Use this
// when you just want a quick collectible without manually wiring the class.
export async function spawnSecret(options: SecretOptions): Promise<Secret> {
    const secret = new Secret(options);
    await secret.spawn();
    return secret;
}

// ── pickSecretPosition ──
//
// Picks a random ground-snapped Vec3 inside the map's renderable bounds so the
// secret doesn't show up in the same spot every battle. The secret model
// sits half a unit above the surface, which is just enough clearance to avoid
// Z-fighting with the terrain mesh while still looking like it's "on" the ground.
//
//   - `bounds`: AABB returned by `getRenderableBounds(ground.modelEntity)`. When
//     `undefined` (ground failed to load), we fall back to a position near the
//     player's spawn.
//   - `fallbackY`: Y value used if the raycast at the random (x, z) misses.
//     Pass `respawnGroundY` — that way the secret at least lands somewhere on
//     the player's known surface.
const SECRET_GROUND_OFFSET = 0.5;
// Inset from the map edges so the secret doesn't clip into a wall, ledge, or
// fall into a hole just outside the AABB. Maps are usually much larger than
// this so the inset is invisible to the player, but it keeps the secret safely
// inside the playable area.
const SECRET_BOUND_MARGIN = 3;

export function pickSecretPosition(
    app: AppBase,
    bounds: RenderableBounds | undefined,
    fallbackY: number,
): Vec3 {
    if (!bounds) {
        // No bounds at all (ground model failed to load) — drop the secret at
        // the player's spawn with our standard offset rather than at a
        // hardcoded origin.
        return new Vec3(0, fallbackY + SECRET_GROUND_OFFSET, 0);
    }

    // Clamp the insets so impossibly small maps (or a bounds regression) can
    // still produce a valid X/Z range instead of `min > max`.
    const minX = bounds.minX + SECRET_BOUND_MARGIN;
    const maxX = bounds.maxX - SECRET_BOUND_MARGIN;
    const minZ = bounds.minZ + SECRET_BOUND_MARGIN;
    const maxZ = bounds.maxZ - SECRET_BOUND_MARGIN;
    const x = minX + Math.random() * Math.max(0, maxX - minX);
    const z = minZ + Math.random() * Math.max(0, maxZ - minZ);

    const groundY = getHighestGroundHitY(app, x, z, "ground") ?? fallbackY;
    return new Vec3(x, groundY + SECRET_GROUND_OFFSET, z);
}
