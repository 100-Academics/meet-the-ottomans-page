/**
 * Shared helpers for battle-scene spawning.
 * Prevents entities from spawning in the air when Ammo.js collision
 * raycasting fails (e.g., physics not yet registered).
 */

import { Vec3 } from "playcanvas";

/**
 * Wait until Ammo.js has registered at least one collision body tagged with `groundTag`.
 * We poll for up to 100 frames (~2 seconds). Only resolves when a ground-tagged entity
 * is actually hit — not just any collider.
 */
/**
 * Result of waitForAmmoReady — includes the Y coordinate of the first
 * ground-tagged hit, useful as a direct ground-level reference.
 */
export interface AmmoReadyResult {
    /** Frame number when the first ground hit was found (0 = raycastFirst unavailable) */
    frame: number;
    /** Name of the hit entity (null if timed out) */
    entityName: string | null;
    /** Y coordinate of the hit point (undefined if timed out or no hit) */
    hitY: number | undefined;
}

export function waitForAmmoReady(
    app: any,
    groundTag: string,
): Promise<AmmoReadyResult> {
    return new Promise((resolve) => {
        const rigidbodySystem = (app.systems?.rigidbody as {
            raycastFirst?: (start: Vec3, end: Vec3) => { entity?: any; point?: any } | null;
        }) as any;

        if (!rigidbodySystem || typeof rigidbodySystem.raycastFirst !== "function") {
            console.warn("[Spawn] waitForAmmoReady: no raycastFirst available");
            resolve({ frame: 0, entityName: null, hitY: undefined });
            return;
        }

        let attempts = 0;
        const maxAttempts = 100; // ~2 seconds at 50fps

        // Sweep from very high to very low — terrain can span thousands of units.
        const start = new Vec3(0, 5000, 0);
        const end = new Vec3(0, -5000, 0);

        function tryHit(): void {
            if (attempts++ >= maxAttempts) {
                console.warn("[Spawn] waitForAmmoReady timed out after", attempts, "frames — no ground hit found");
                resolve({ frame: attempts, entityName: null, hitY: undefined });
                return;
            }

            const hit = rigidbodySystem.raycastFirst(start, end);

            // Only resolve if we actually hit a ground-tagged entity.
            // Don't accept hits on non-ground colliders (e.g., mesh-trimesh
            // collider meshes that don't have the tag in their hierarchy).
            if (hit?.entity && hasTagInHierarchy(hit.entity, groundTag)) {
                console.log("[Spawn] waitForAmmoReady succeeded on frame", attempts, "hit:", hit.entity.name ?? hit.entity.id, "at Y=", hit.point?.y);
                resolve({ frame: attempts, entityName: hit.entity.name ?? null, hitY: hit.point?.y });
                return;
            }

            // Log early frames for debugging
            if (attempts % 20 === 0) {
                console.log("[Spawn] waitForAmmoReady frame", attempts, "no ground hit yet");
            }

            requestAnimationFrame(tryHit);
        }

        tryHit();
    });
}

function hasTagInHierarchy(entity: any, tag: string): boolean {
    let current: any = entity;
    while (current) {
        if (current.tags?.has(tag)) return true;
        current = current.parent ?? null;
    }
    return false;
}

/**
 * Estimate a reasonable ground Y when the raycast returns nothing.
 * Uses the terrain's upper quarter (75 % of the way up from minY) rather
 * than `bounds.maxY` which can be a mountain peak far above playable ground.
 */
export function estimateSurfaceYFromBounds(
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number },
): number {
    const range = bounds.maxY - bounds.minY;
    return bounds.minY + range * 0.75;
}

/**
 * Compute the spawn position for the player when raycasting succeeds or fails.
 * Returns `{ x, y, z, surfaceY }` ready to be passed to `player.setPosition()`.
 */
export function computePlayerSpawnPosition(
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number } | undefined,
    seededGroundY: number | undefined,
    spawnSurfaceOffset: number,
): { position: Vec3; surfaceY: number; spawnResolved: boolean } {
    if (bounds) {
        const spawnX = (bounds.minX + bounds.maxX) * 0.5;
        const spawnZ = (bounds.minZ + bounds.maxZ) * 0.5;
        const surfaceY = seededGroundY !== undefined ? seededGroundY : estimateSurfaceYFromBounds(bounds);
        return {
            position: new Vec3(spawnX, surfaceY + spawnSurfaceOffset, spawnZ),
            surfaceY,
            spawnResolved: true,
        };
    }

    return { position: new Vec3(0, 8, 8), surfaceY: 0, spawnResolved: false };
}
