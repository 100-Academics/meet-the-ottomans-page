import { AppBase, Entity, Vec3 } from 'playcanvas';
import { npc } from '../../world/npc/npc';

export class Weapon {

    private name: string;
    private damage: number;
    private range: number;

    constructor(name: string,
                damage: number,
                range: number) {
        this.name = name;
        this.damage = damage;
        this.range = range;
    }

    public getName(): string {
        return this.name;
    }

    public getDamage(): number {
        return this.damage;
    }

    public getRange(): number {
        return this.range;
    }

    private static isEntityOrDescendantOf(entity: Entity | null, root: Entity): boolean {
        let current: Entity | null = entity;
        while (current) {
            if (current === root) {
                return true;
            }
            current = (current.parent as Entity | null) ?? null;
        }
        return false;
    }

    // Raycast helper moved into Weapon so hit-checking is owned by weapons.
    public static getClickedNpcInRange(app: AppBase, cameraEntity: Entity | undefined | null, screenX: number, screenY: number, npcs: npc[], maxRange: number): npc | null {
        if (!Number.isFinite(maxRange) || maxRange <= 0) {
            return null;
        }

        const camera = cameraEntity?.camera;
        if (!camera) {
            return null;
        }

        const rigidbodySystem = (app.systems as {
            rigidbody?: {
                raycastFirst?: (start: Vec3, end: Vec3) => { entity?: Entity | null; point?: Vec3 } | null;
            };
        }).rigidbody;

        if (!rigidbodySystem || typeof rigidbodySystem.raycastFirst !== 'function') {
            return null;
        }

        const rayStart = camera.screenToWorld(screenX, screenY, camera.nearClip);
        const rayEnd = camera.screenToWorld(screenX, screenY, camera.farClip);
        const rayDirection = rayEnd.clone().sub(rayStart);
        const rayLength = rayDirection.length();
        if (rayLength <= 0.0001) {
            return null;
        }
        rayDirection.mulScalar(1 / rayLength);

        const hit = rigidbodySystem.raycastFirst(rayStart, rayEnd);

        if (hit?.entity) {
            const clickedNpc = npcs.find((currentNpc) => Weapon.isEntityOrDescendantOf(hit.entity ?? null, currentNpc.getEntity()));
            if (clickedNpc) {
                const distance = hit.point
                    ? cameraEntity.getPosition().distance(hit.point)
                    : cameraEntity.getPosition().distance(hit.entity.getPosition());

                if (distance <= maxRange) {
                    return clickedNpc;
                }
            }
        }

        // Fallback selection for NPC models that are visible but not picked by rigidbody raycasts.
        let bestNpc: npc | null = null;
        let bestRayDistance = Number.POSITIVE_INFINITY;

        for (const currentNpc of npcs) {
            if (!currentNpc.isAlive()) {
                continue;
            }

            const npcPosition = currentNpc.getEntity().getPosition();
            const toNpc = npcPosition.clone().sub(rayStart);
            const projectedDistance = toNpc.dot(rayDirection);
            if (!Number.isFinite(projectedDistance) || projectedDistance < 0 || projectedDistance > maxRange) {
                continue;
            }

            const closestPoint = rayStart.clone().add(rayDirection.clone().mulScalar(projectedDistance));
            const distanceFromRay = npcPosition.distance(closestPoint);
            const hitTolerance = Math.max(1.0, currentNpc.getHitboxRadius() * 1.6);
            if (distanceFromRay > hitTolerance) {
                continue;
            }

            if (projectedDistance < bestRayDistance) {
                bestRayDistance = projectedDistance;
                bestNpc = currentNpc;
            }
        }

        return bestNpc;
    }

}