import { ScriptType, Vec3, math, Mouse, KEY_W, KEY_A, KEY_S, KEY_D, KEY_SPACE, KEY_SHIFT, type Entity } from 'playcanvas';
import {
    PLAYER_DASH_DURATION,
    PLAYER_DASH_RECHARGE_TIME,
    PLAYER_DASH_SPEED,
    PLAYER_GRAVITY,
    PLAYER_JUMP_POWER,
    PLAYER_MAX_STEP_HEIGHT,
    PLAYER_MAX_AIR_JUMPS,
    PLAYER_MAX_DASHES,
    PLAYER_MOVE_SPEED,
    PLAYER_WALLRUN_COOLDOWN,
    PLAYER_WALLRUN_CAMERA_OFFSET,
    PLAYER_WALLRUN_CAMERA_ROLL_DEG,
    PLAYER_WALLRUN_CAMERA_ROLL_SPEED,
    PLAYER_WALLRUN_DETECT_DISTANCE,
    PLAYER_WALLRUN_GRAVITY_SCALE,
    PLAYER_WALLRUN_JUMP_PUSH,
    PLAYER_WALLRUN_JUMP_UP,
    PLAYER_WALLRUN_MAX_WALL_ANGLE_DEG,
    PLAYER_WALLRUN_MAX_TIME,
    PLAYER_WALLRUN_MIN_HEIGHT,
    PLAYER_WALLRUN_MIN_WALL_ANGLE_DEG,
    PLAYER_WALLRUN_NO_GRAVITY_TIME,
    PLAYER_WALLRUN_SPEED,
    PLAYER_WALLRUN_STICK_FORCE,
    PLAYER_SLIDE_DURATION,
    PLAYER_SLIDE_CAMERA_DROP,
    PLAYER_SLIDE_CAMERA_LERP_SPEED,
    PLAYER_SLIDE_CAMERA_PULLBACK,
    PLAYER_SLIDE_FRICTION,
    PLAYER_SLIDE_SPEED,
} from './playerMovementConfig';
import { npc } from '../world/npc/npc';
import { Weapon } from './weapon/weapon';

export class FirstPersonCamera extends ScriptType {
    public eulers = new Vec3();
    public touchSensitivity = 1 / 2;
    public lookSpeed = 1 / 5;
    
    public readonly moveSpeed = PLAYER_MOVE_SPEED;
    public readonly maxStepHeight = PLAYER_MAX_STEP_HEIGHT;
    public readonly gravity = PLAYER_GRAVITY;
    public readonly jumpPower = PLAYER_JUMP_POWER;
    public readonly maxAirJumps = PLAYER_MAX_AIR_JUMPS;
    public readonly maxDashes = PLAYER_MAX_DASHES;
    public readonly dashSpeed = PLAYER_DASH_SPEED;
    public readonly dashDuration = PLAYER_DASH_DURATION;
    public readonly dashRechargeTime = PLAYER_DASH_RECHARGE_TIME;
    public readonly wallRunSpeed = PLAYER_WALLRUN_SPEED;
    public readonly wallRunGravityScale = PLAYER_WALLRUN_GRAVITY_SCALE;
    public readonly wallRunMaxTime = PLAYER_WALLRUN_MAX_TIME;
    public readonly wallRunCooldown = PLAYER_WALLRUN_COOLDOWN;
    public readonly wallRunMinHeight = PLAYER_WALLRUN_MIN_HEIGHT;
    public readonly wallRunDetectDistance = PLAYER_WALLRUN_DETECT_DISTANCE;
    public readonly wallRunStickForce = PLAYER_WALLRUN_STICK_FORCE;
    public readonly wallRunJumpUp = PLAYER_WALLRUN_JUMP_UP;
    public readonly wallRunJumpPush = PLAYER_WALLRUN_JUMP_PUSH;
    public readonly wallRunMinWallAngleDeg = PLAYER_WALLRUN_MIN_WALL_ANGLE_DEG;
    public readonly wallRunMaxWallAngleDeg = PLAYER_WALLRUN_MAX_WALL_ANGLE_DEG;
    public readonly wallRunNoGravityTime = PLAYER_WALLRUN_NO_GRAVITY_TIME;
    public readonly wallRunCameraRollDeg = PLAYER_WALLRUN_CAMERA_ROLL_DEG;
    public readonly wallRunCameraRollSpeed = PLAYER_WALLRUN_CAMERA_ROLL_SPEED;
    public readonly wallRunCameraOffset = PLAYER_WALLRUN_CAMERA_OFFSET;
    public readonly slideSpeed = PLAYER_SLIDE_SPEED;
    public readonly slideDuration = PLAYER_SLIDE_DURATION;
    public readonly slideFriction = PLAYER_SLIDE_FRICTION;
    public readonly slideCameraDrop = PLAYER_SLIDE_CAMERA_DROP;
    public readonly slideCameraPullback = PLAYER_SLIDE_CAMERA_PULLBACK;
    public readonly slideCameraLerpSpeed = PLAYER_SLIDE_CAMERA_LERP_SPEED;
    public velocity = new Vec3();
    public playerHeight = 2;
    public groundHeight = 0;
    /** Dev console fly mode — when true, gravity and ground collision are disabled, Space/Shift move vertically */
    public devFlyMode = false;
    public groundTag = 'ground';
    public groundedEpsilon = 0.05;
    public groundRayHeight = 400;
    public groundRayDepth = 800;
    public groundSampleRadius = 0.25;
    public collisionProbePadding = 0.3;
    public collisionTag = 'model-obstacle';
    public maxLookDelta = 40;
    public mouseSpikeThreshold = 250;
    public movementBoundsMinX = Number.NEGATIVE_INFINITY;
    public movementBoundsMaxX = Number.POSITIVE_INFINITY;
    public movementBoundsMinZ = Number.NEGATIVE_INFINITY;
    public movementBoundsMaxZ = Number.POSITIVE_INFINITY;
    public movementLocked = false;
    
    private keys: Record<string, boolean> = {};
    private airJumpsRemaining = PLAYER_MAX_AIR_JUMPS;
    private dashCharges = PLAYER_MAX_DASHES;
    private dashRechargeTimer = 0;
    private dashTimeRemaining = 0;
    private dashDirection = new Vec3();
    private wasJumpHeld = false;
    private wasDashHeld = false;
    private ignoreNextMouseMove = false;

    private wallRunActive = false;
    private wallRunTimeRemaining = 0;
    private wallRunCooldownTimer = 0;
    private wallRunNormal = new Vec3();
    private wallRunElapsed = 0;

    private slideActive = false;
    private slideDirection = new Vec3();
    private slideSpeedCurrent = 0;
    private slideTimeRemaining = 0;
    private slideCameraBlend = 0;
    private basePosition = new Vec3();
    private basePositionReady = false;
    
    private coyoteTimer = 0;
    public readonly coyoteTimeDuration = 0.15;

    private isFiniteNumber(value: unknown): value is number {
        return typeof value === 'number' && Number.isFinite(value);
    }

    public setMovementBounds(
        bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null | undefined,
        padding = 0
    ): void {
        if (!bounds) {
            this.movementBoundsMinX = Number.NEGATIVE_INFINITY;
            this.movementBoundsMaxX = Number.POSITIVE_INFINITY;
            this.movementBoundsMinZ = Number.NEGATIVE_INFINITY;
            this.movementBoundsMaxZ = Number.POSITIVE_INFINITY;
            return;
        }

        const minX = bounds.minX + padding;
        const maxX = bounds.maxX - padding;
        const minZ = bounds.minZ + padding;
        const maxZ = bounds.maxZ - padding;

        this.movementBoundsMinX = minX <= maxX ? minX : (bounds.minX + bounds.maxX) * 0.5;
        this.movementBoundsMaxX = minX <= maxX ? maxX : (bounds.minX + bounds.maxX) * 0.5;
        this.movementBoundsMinZ = minZ <= maxZ ? minZ : (bounds.minZ + bounds.maxZ) * 0.5;
        this.movementBoundsMaxZ = minZ <= maxZ ? maxZ : (bounds.minZ + bounds.maxZ) * 0.5;
    }

    public setMovementLocked(locked: boolean): void {
        this.movementLocked = locked;
        if (locked) {
            this.velocity.set(0, 0, 0);
            this.dashTimeRemaining = 0;
            this.slideActive = false;
            this.wallRunActive = false;
            this.slideCameraBlend = 0;
        }
    }

    private clampToMovementBounds(position: Vec3): void {
        if (this.isFiniteNumber(this.movementBoundsMinX) && this.isFiniteNumber(this.movementBoundsMaxX)) {
            position.x = math.clamp(position.x, this.movementBoundsMinX, this.movementBoundsMaxX);
        }

        if (this.isFiniteNumber(this.movementBoundsMinZ) && this.isFiniteNumber(this.movementBoundsMaxZ)) {
            position.z = math.clamp(position.z, this.movementBoundsMinZ, this.movementBoundsMaxZ);
        }
    }

    private tryMoveHorizontally(position: Vec3, direction: Vec3, speed: number, dt: number, currentGroundHeight?: number): void {
        const movement = direction.clone().mulScalar(speed * dt);
        const proposedPos = position.clone().add(movement);
        if (!this.hasGroundSupport(proposedPos)) {
            return;
        }
        if (this.isFiniteNumber(currentGroundHeight) && !this.canStepTo(currentGroundHeight, proposedPos)) {
            return;
        }
        if (!this.isBlocked(position, proposedPos)) {
            position.copy(proposedPos);
        }
    }

 private tryMoveDash(
 position: Vec3,
 direction: Vec3,
 speed: number,
 dt: number,
 currentGroundHeight: number | undefined,
 onGround: boolean
 ): void {
 const movement = direction.clone().mulScalar(speed * dt);
 const distance = movement.length();
 if (distance <= 0.0001) {
 return;
 }

 const maxDashStep = Math.max(0.75, this.groundSampleRadius * 4);
 const steps = Math.max(1, Math.ceil(distance / maxDashStep));
 const stepVector = movement.clone().mulScalar(1 / steps);
 const allowGroundSnap = onGround && direction.y <= 0.01;
 let stepGroundHeight = this.isFiniteNumber(currentGroundHeight)
 ? currentGroundHeight
 : undefined;

 for (let step = 0; step < steps; step += 1) {
 const currentStepGroundHeight = stepGroundHeight;
 const proposedPos = position.clone().add(stepVector);

 if (onGround && this.isFiniteNumber(stepGroundHeight)) {
 const nextGroundHeight = this.getStepGroundHeight(stepGroundHeight, proposedPos);
 if (!this.isFiniteNumber(nextGroundHeight)) {
 return;
 }
 stepGroundHeight = nextGroundHeight;
 if (allowGroundSnap) {
 proposedPos.y = stepGroundHeight + this.playerHeight;
 }
 } else if (onGround && !this.hasGroundSupport(proposedPos)) {
 return;
 }

 if (!onGround) {
 const terrainHeight = this.sampleGroundHeight(proposedPos, Number.POSITIVE_INFINITY, this.groundHeight);
 if (this.isFiniteNumber(terrainHeight) && terrainHeight + this.playerHeight > proposedPos.y + 0.05) {
 return;
 }
 if (this.isDashBlockedByTerrain(proposedPos)) {
 return;
 }
 if (this.isFiniteNumber(stepGroundHeight)) {
 const nextTerrainHeight = this.sampleGroundHeight(proposedPos, stepGroundHeight + this.maxStepHeight + this.groundedEpsilon, stepGroundHeight);
 if (this.isFiniteNumber(nextTerrainHeight)) {
 stepGroundHeight = nextTerrainHeight;
 } else if (!this.hasGroundSupport(proposedPos)) {
 return;
 }
 } else if (!this.hasGroundSupport(proposedPos)) {
 return;
 }
 }

 const currentCheck = position.clone();
 if (allowGroundSnap && this.isFiniteNumber(currentStepGroundHeight)) {
 currentCheck.y = currentStepGroundHeight + this.playerHeight;
 }
 const horizontalCheck = new Vec3(proposedPos.x, currentCheck.y, proposedPos.z);
 let blocked = this.isBlocked(currentCheck, horizontalCheck);
 if (!blocked && Math.abs(proposedPos.y - currentCheck.y) > 0.001) {
 const elevatedCurrent = currentCheck.clone();
 elevatedCurrent.y = proposedPos.y;
 const elevatedNext = proposedPos.clone();
 elevatedNext.y = proposedPos.y;
 blocked = this.isBlocked(elevatedCurrent, elevatedNext);
 }

 if (blocked) {
 return;
 }

 position.copy(proposedPos);
 }
 }

    initialize() {
        this.eulers.x = this.entity.getLocalEulerAngles().x;
        this.eulers.y = this.entity.getLocalEulerAngles().y;
        this.groundHeight = this.entity.getPosition().y - this.playerHeight;
        this.airJumpsRemaining = this.maxAirJumps;
        this.dashCharges = this.maxDashes;
        this.dashRechargeTimer = 0;
        this.dashTimeRemaining = 0;
        this.wallRunActive = false;
        this.wallRunTimeRemaining = 0;
        this.wallRunCooldownTimer = 0;
        this.wallRunNormal.set(0, 0, 0);
        this.wallRunElapsed = 0;
        this.slideActive = false;
        this.slideDirection.set(0, 0, 0);
        this.slideSpeedCurrent = 0;
        this.slideTimeRemaining = 0;
        this.slideCameraBlend = 0;
        this.eulers.z = 0;
        const startPos = this.entity.getPosition();
        this.basePosition.copy(startPos);
        this.basePositionReady = true;

        const app = this.app;
        
        // Mouse lock
        if (app.mouse) {
            // Remove old listeners first to prevent duplicates
            app.mouse.off('mousedown');
            app.mouse.off('mousemove');
            
            app.mouse.on('mousedown', () => {
                app.mouse?.enablePointerLock();
                this.ignoreNextMouseMove = true;
                window.focus(); // Ensure window gets keyboard focus when clicking
            });
            
            app.mouse.on('mousemove', this.onMouseMove);
        }

        // Foolproof Keyboard Tracking for iframe / dev environments
        window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    }

    private onMouseMove = (e: { dx: number; dy: number }) => {
        if (!Mouse.isPointerLocked()) {
            return;
        }

        if (this.ignoreNextMouseMove) {
            this.ignoreNextMouseMove = false;
            return;
        }

        const rawDx = e.dx;
        const rawDy = e.dy;
        if (!Number.isFinite(rawDx) || !Number.isFinite(rawDy)) {
            return;
        }

        // Ignore rare pointer-lock spikes that would instantly snap the camera.
        if (Math.abs(rawDx) > this.mouseSpikeThreshold || Math.abs(rawDy) > this.mouseSpikeThreshold) {
            return;
        }

        const safeDx = math.clamp(rawDx, -this.maxLookDelta, this.maxLookDelta);
        const safeDy = math.clamp(rawDy, -this.maxLookDelta, this.maxLookDelta);

        this.eulers.x -= safeDy * this.lookSpeed;
        this.eulers.y -= safeDx * this.lookSpeed;
        this.eulers.x = math.clamp(this.eulers.x, -90, 90);
    }

    private getEntityWorldAabb(entity: Entity): {
        minX: number;
        minY: number;
        minZ: number;
        maxX: number;
        maxY: number;
        maxZ: number;
    } | null {
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let minZ = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let maxZ = Number.NEGATIVE_INFINITY;
        let found = false;

        const visit = (node: Entity) => {
            const meshInstances = node.render?.meshInstances;
            if (meshInstances && meshInstances.length > 0) {
                for (const meshInstance of meshInstances) {
                    const aabb = meshInstance.aabb;
                    if (!aabb) {
                        continue;
                    }
                    const min = aabb.getMin();
                    const max = aabb.getMax();
                    minX = Math.min(minX, min.x);
                    minY = Math.min(minY, min.y);
                    minZ = Math.min(minZ, min.z);
                    maxX = Math.max(maxX, max.x);
                    maxY = Math.max(maxY, max.y);
                    maxZ = Math.max(maxZ, max.z);
                    found = true;
                }
            }

            for (const child of node.children) {
                visit(child as Entity);
            }
        };

        visit(entity);

        if (!found) {
            return null;
        }

        return { minX, minY, minZ, maxX, maxY, maxZ };
    }

 private isBlocked(currentPos: Vec3, nextPos: Vec3): boolean {
 const rigidbodySystem = (this.app.systems as any).rigidbody;
 const moveDelta = nextPos.clone().sub(currentPos);
 const moveDistance = moveDelta.length();
 if (rigidbodySystem && typeof rigidbodySystem.raycastFirst === 'function' && moveDistance > 0.0001) {
 const rayStart = currentPos.clone();
 rayStart.y -= this.playerHeight * 0.5;
 const rayEnd = nextPos.clone();
 rayEnd.y = rayStart.y;
 const hit = rigidbodySystem.raycastFirst(rayStart, rayEnd) as
 | { entity?: Entity | null; point?: Vec3; normal?: Vec3 }
 | null;

 if (hit?.point && hit?.entity) {
 const toHit = hit.point.clone().sub(rayStart);
 if (toHit.length() <= moveDistance + this.collisionProbePadding) {
 if (hit.normal && this.isFiniteNumber(hit.normal.x) && this.isFiniteNumber(hit.normal.y) && this.isFiniteNumber(hit.normal.z)) {
 const normal = new Vec3(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
 if (normal.y < 0.6) {
 return true;
 }
 } else {
 return true;
 }
 }
 }
 }

        const obstacles = this.app.root.findByTag(this.collisionTag) as Entity[];
        if (!obstacles || obstacles.length === 0) {
            return false;
        }

        const playerRadius = this.collisionProbePadding;
        const playerMinY = nextPos.y - this.playerHeight;
        const playerMaxY = nextPos.y + 0.2;

        for (const obstacle of obstacles) {
            if (obstacle === this.entity) {
                continue;
            }

            const aabb = this.getEntityWorldAabb(obstacle);
            if (!aabb) {
                continue;
            }

            const xOverlap = nextPos.x + playerRadius > aabb.minX && nextPos.x - playerRadius < aabb.maxX;
            const zOverlap = nextPos.z + playerRadius > aabb.minZ && nextPos.z - playerRadius < aabb.maxZ;
            const yOverlap = playerMaxY > aabb.minY && playerMinY < aabb.maxY;

            if (xOverlap && zOverlap && yOverlap) {
                return true;
            }
        }

 return false;
 }

 private isDashBlockedByTerrain(nextPos: Vec3): boolean {
 const rigidbodySystem = (this.app.systems as any).rigidbody;
 if (!rigidbodySystem || typeof rigidbodySystem.raycastFirst !== 'function') {
 return false;
 }
 const downRayStart = nextPos.clone();
 downRayStart.y = nextPos.y + this.playerHeight;
 const downRayEnd = nextPos.clone();
 downRayEnd.y = nextPos.y - this.playerHeight * 0.5;
 const downHit = rigidbodySystem.raycastFirst(downRayStart, downRayEnd) as
 | { entity?: Entity | null; point?: Vec3; normal?: Vec3 }
 | null;
 if (!downHit?.point || !downHit?.entity) {
 return false;
 }
 if (downHit.point.y > nextPos.y - this.playerHeight + 0.1) {
 if (downHit.normal && this.isFiniteNumber(downHit.normal.x) && this.isFiniteNumber(downHit.normal.y) && this.isFiniteNumber(downHit.normal.z)) {
 const dNormal = new Vec3(downHit.normal.x, downHit.normal.y, downHit.normal.z).normalize();
 if (dNormal.y >= 0.3) {
 return true;
 }
 } else {
 return true;
 }
 }
 return false;
 }

 // Raycast from click position and return the hit NPC if it is within maxRange.
    public getClickedNpcInRange(screenX: number, screenY: number, npcs: npc[], maxRange: number): npc | null {
        return Weapon.getClickedNpcInRange(this.app, this.entity, screenX, screenY, npcs, maxRange);
    }

    private hasTagInHierarchy(entity: Entity | null, tag: string): boolean {
        let current: Entity | null = entity;
        while (current) {
            if (current.tags?.has(tag)) {
                return true;
            }
            current = (current.parent as Entity | null) ?? null;
        }
        return false;
    }

    private isGroundRaycastHit(entity: Entity | null): boolean {
        if (!this.groundTag) {
            return true;
        }

        if (!entity) {
            return false;
        }

        return this.hasTagInHierarchy(entity, this.groundTag);
    }

    private getGroundRayHitY(
        rigidbodySystem: {
            raycastAll?: (start: Vec3, end: Vec3) => Array<{ entity?: Entity | null; point?: Vec3; hitFraction?: number }> | undefined;
            raycastFirst: (start: Vec3, end: Vec3) => { entity?: Entity | null; point?: Vec3 } | null;
        },
        start: Vec3,
        end: Vec3,
        maxAllowedY: number
    ): number | undefined {
        const maxY = this.isFiniteNumber(maxAllowedY) ? maxAllowedY : Number.POSITIVE_INFINITY;
        const hits = typeof rigidbodySystem.raycastAll === 'function'
            ? rigidbodySystem.raycastAll(start, end)
            : undefined;

        if (hits && hits.length > 0) {
            let bestFraction = Number.POSITIVE_INFINITY;
            let bestFractionHitY: number | undefined;
            let highestGroundHitY: number | undefined;
            for (const hit of hits) {
                if (!hit?.point) {
                    continue;
                }
                const hitY = hit.point.y;
                if (!this.isFiniteNumber(hitY)) {
                    continue;
                }

                if (hitY > maxY + this.groundedEpsilon) {
                    continue;
                }

                const hitEntity = hit.entity ?? null;
                if (!this.isGroundRaycastHit(hitEntity)) {
                    continue;
                }

                const hitFraction = hit.hitFraction;
                if (this.isFiniteNumber(hitFraction) && hitFraction < bestFraction) {
                    bestFraction = hitFraction;
                    bestFractionHitY = hitY;
                }

                if (highestGroundHitY === undefined || hitY > highestGroundHitY) {
                    highestGroundHitY = hitY;
                }
            }

            if (bestFractionHitY !== undefined) {
                return bestFractionHitY;
            }

            if (highestGroundHitY !== undefined) {
                return highestGroundHitY;
            }
        }

        const firstHit = rigidbodySystem.raycastFirst(start, end);
        if (!firstHit?.point) {
            return undefined;
        }

        const firstHitEntity = firstHit.entity ?? null;
        if (!this.isGroundRaycastHit(firstHitEntity)) {
            return undefined;
        }

        const firstHitY = firstHit.point.y;
        if (!this.isFiniteNumber(firstHitY)) {
            return undefined;
        }

        if (firstHitY > maxY + this.groundedEpsilon) {
            return undefined;
        }

        return firstHitY;
    }

    private sampleGroundHeight(position: Vec3, maxAllowedY: number, referenceY?: number): number | undefined {
        const rigidbodySystem = (this.app.systems as any).rigidbody;
        if (!rigidbodySystem || typeof rigidbodySystem.raycastFirst !== 'function') {
            return undefined;
        }

        const safeGroundHeight = this.isFiniteNumber(this.groundHeight)
            ? this.groundHeight
            : (position.y - this.playerHeight);
        const rayStartY = Math.max(position.y + this.groundRayHeight, safeGroundHeight + this.groundRayHeight, 500);
        const rayEndY = Math.min(position.y - this.groundRayDepth, safeGroundHeight - this.groundRayDepth, -500);
        if (!this.isFiniteNumber(rayStartY) || !this.isFiniteNumber(rayEndY)) {
            return undefined;
        }

        const maxGroundY = this.isFiniteNumber(maxAllowedY) ? maxAllowedY : Number.POSITIVE_INFINITY;
        const centerStart = new Vec3(position.x, rayStartY, position.z);
        const centerEnd = new Vec3(position.x, rayEndY, position.z);
        const centerHitY = this.getGroundRayHitY(rigidbodySystem, centerStart, centerEnd, maxGroundY);
        if (this.isFiniteNumber(centerHitY)) {
            return centerHitY;
        }

        const sampleRadius = this.groundSampleRadius;
        const sampleOffsets = [
            new Vec3(sampleRadius, 0, 0),
            new Vec3(-sampleRadius, 0, 0),
            new Vec3(0, 0, sampleRadius),
            new Vec3(0, 0, -sampleRadius),
        ];

        let bestHitY: number | undefined;
        let bestDelta = Number.POSITIVE_INFINITY;

        for (const offset of sampleOffsets) {
            const sampleX = position.x + offset.x;
            const sampleZ = position.z + offset.z;
            const start = new Vec3(sampleX, rayStartY, sampleZ);
            const end = new Vec3(sampleX, rayEndY, sampleZ);
            const hitY = this.getGroundRayHitY(rigidbodySystem, start, end, maxGroundY);
            if (!this.isFiniteNumber(hitY)) {
                continue;
            }

            if (referenceY === undefined) {
                if (bestHitY === undefined || hitY > bestHitY) {
                    bestHitY = hitY;
                }
                continue;
            }

            const delta = Math.abs(hitY - referenceY);
            if (delta < bestDelta) {
                bestDelta = delta;
                bestHitY = hitY;
            }
        }

        return bestHitY;
    }

    private getStepGroundHeight(currentGroundHeight: number, nextPos: Vec3): number | undefined {
        const maxAllowedY = this.maxStepHeight <= 0
            ? Number.POSITIVE_INFINITY
            : currentGroundHeight + this.maxStepHeight + this.groundedEpsilon;
        return this.sampleGroundHeight(nextPos, maxAllowedY, currentGroundHeight);
    }

    private canStepTo(currentGroundHeight: number, nextPos: Vec3): boolean {
        if (this.maxStepHeight <= 0) {
            return true;
        }

        const nextGroundHeight = this.getStepGroundHeight(currentGroundHeight, nextPos);
        return this.isFiniteNumber(nextGroundHeight);
    }

    private hasGroundSupport(position: Vec3): boolean {
        return this.isFiniteNumber(this.sampleGroundHeight(position, Number.POSITIVE_INFINITY, this.groundHeight));
    }

    private getGroundHeightAt(position: Vec3): number {
        if (!this.isFiniteNumber(this.groundHeight)) {
            this.groundHeight = position.y - this.playerHeight;
        }
        const maxGroundY = position.y - this.playerHeight
            + Math.max(this.groundedEpsilon, 0.05)
            + Math.max(this.maxStepHeight, 0);
        const sampledGroundHeight = this.sampleGroundHeight(position, maxGroundY, this.groundHeight);
        if (this.isFiniteNumber(sampledGroundHeight)) {
            this.groundHeight = sampledGroundHeight;
        }

        return this.groundHeight;
    }

    private estimateWallNormal(entity: Entity, position: Vec3, fallbackDirection: Vec3): Vec3 {
        const aabb = this.getEntityWorldAabb(entity);
        if (aabb) {
            const closestX = math.clamp(position.x, aabb.minX, aabb.maxX);
            const closestZ = math.clamp(position.z, aabb.minZ, aabb.maxZ);
            const closest = new Vec3(closestX, position.y, closestZ);
            const normal = position.clone().sub(closest);
            normal.y = 0;
            if (normal.lengthSq() > 0.0001) {
                return normal.normalize();
            }
        }

        const fallback = fallbackDirection.clone().mulScalar(-1);
        fallback.y = 0;
        if (fallback.lengthSq() > 0.0001) {
            return fallback.normalize();
        }

        return new Vec3(0, 0, 0);
    }

    private getWallHit(position: Vec3, direction: Vec3): { normal: Vec3; point?: Vec3 } | null {
        const rigidbodySystem = (this.app.systems as any).rigidbody;
        if (!rigidbodySystem || typeof rigidbodySystem.raycastFirst !== 'function') {
            return null;
        }

        const start = position.clone();
        const end = position.clone().add(direction.clone().mulScalar(this.wallRunDetectDistance));
        const hit = rigidbodySystem.raycastFirst(start, end) as { entity?: Entity | null; point?: Vec3; normal?: Vec3 } | null;
        if (!hit?.entity) {
            return null;
        }

        let normal: Vec3 | null = null;
        if (hit.normal && this.isFiniteNumber(hit.normal.x) && this.isFiniteNumber(hit.normal.y) && this.isFiniteNumber(hit.normal.z)) {
            normal = new Vec3(hit.normal.x, hit.normal.y, hit.normal.z);
        } else {
            normal = this.estimateWallNormal(hit.entity, position, direction);
        }

        if (!normal || normal.lengthSq() === 0) {
            return null;
        }

        normal.normalize();
        const up = new Vec3(0, 1, 0);
        const angleDeg = Math.acos(math.clamp(normal.dot(up), -1, 1)) * (180 / Math.PI);
        if (angleDeg < this.wallRunMinWallAngleDeg || angleDeg > this.wallRunMaxWallAngleDeg) {
            return null;
        }

        return { normal, point: hit.point };
    }

    private stopWallRun(): void {
        if (!this.wallRunActive) {
            return;
        }
        this.wallRunActive = false;
        this.wallRunTimeRemaining = 0;
        this.wallRunCooldownTimer = this.wallRunCooldown;
        this.wallRunElapsed = 0;
    }

    private startSlide(direction: Vec3): void {
        if (direction.lengthSq() <= 0.0001) {
            return;
        }

        this.slideDirection.copy(direction).normalize();
        this.slideActive = true;
        this.slideSpeedCurrent = this.slideSpeed;
        this.slideTimeRemaining = this.slideDuration;
    }

    private stopSlide(): void {
        this.slideActive = false;
        this.slideSpeedCurrent = 0;
        this.slideTimeRemaining = 0;
        this.slideDirection.set(0, 0, 0);
    }

    update(dt: number) {
        const app = this.app;
        const forward = this.entity.forward;
        const right = this.entity.right;
        
        // Remove y component to walk on plane
        const walkForward = new Vec3(forward.x, 0, forward.z).normalize();
        const walkRight = new Vec3(right.x, 0, right.z).normalize();

        const moveDir = new Vec3();

        // Native DOM keys + PlayCanvas fallback
        const movementAllowed = !this.movementLocked;
        const isW = movementAllowed && (this.keys['KeyW'] || app.keyboard?.isPressed(KEY_W));
        const isS = movementAllowed && (this.keys['KeyS'] || app.keyboard?.isPressed(KEY_S));
        const isA = movementAllowed && (this.keys['KeyA'] || app.keyboard?.isPressed(KEY_A));
        const isD = movementAllowed && (this.keys['KeyD'] || app.keyboard?.isPressed(KEY_D));
        const isSpace = movementAllowed && (this.keys['Space'] || app.keyboard?.isPressed(KEY_SPACE));
        const isShift = movementAllowed && (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || app.keyboard?.isPressed(KEY_SHIFT));
        const isSlideHeld = movementAllowed && this.keys['KeyC'];
        const jumpPressed = !!isSpace && !this.wasJumpHeld;
        const dashPressed = !!isShift && !this.wasDashHeld;

        if (isW) moveDir.add(walkForward);
        if (isS) moveDir.sub(walkForward);
        if (isA) moveDir.sub(walkRight);
        if (isD) moveDir.add(walkRight);
        const hasMoveInput = moveDir.lengthSq() > 0;
        if (hasMoveInput) {
            moveDir.normalize();
        }
        
        const entityPos = this.entity.getPosition();
        if (this.movementLocked) {
        this.velocity.set(0, 0, 0);
        this.basePosition.copy(entityPos);
        this.basePositionReady = true;
        this.entity.setLocalEulerAngles(this.eulers.x, this.eulers.y, this.eulers.z);
        return;
        }

        // ---- Dev Console Fly Mode ----
        // When active, disable gravity/ground-collision and move freely in 3D.
        if (this.devFlyMode) {
        this.stopWallRun();
        this.stopSlide();
        const flyPos = entityPos.clone();
        if (hasMoveInput) {
        flyPos.add(moveDir.clone().mulScalar(this.moveSpeed * dt));
        }
        // Space = ascend, Shift = descend
        if (isSpace) flyPos.y += this.moveSpeed * dt;
        if (isShift) flyPos.y -= this.moveSpeed * dt;
        this.velocity.set(0, 0, 0);
        this.clampToMovementBounds(flyPos);
        this.entity.setLocalEulerAngles(this.eulers.x, this.eulers.y, this.eulers.z);
        this.entity.setPosition(flyPos);
        this.basePosition.copy(flyPos);
        this.basePositionReady = true;
        this.wasJumpHeld = !!isSpace;
        this.wasDashHeld = !!isShift;
        return;
        }
        const lastCommittedPos = entityPos.clone();
        if (!this.basePositionReady) {
            this.basePosition.copy(entityPos);
            this.basePositionReady = true;
        }
        if (!this.slideActive && !this.wallRunActive && this.slideCameraBlend < 0.001) {
            this.basePosition.copy(entityPos);
        }
        const pos = this.basePosition.clone();
        this.clampToMovementBounds(pos);

        const currentGroundHeight = this.getGroundHeightAt(pos);
        if (!this.isFiniteNumber(currentGroundHeight)) {
            this.groundHeight = pos.y - this.playerHeight;
        }
        const safeGroundHeight = this.isFiniteNumber(this.groundHeight) ? this.groundHeight : (pos.y - this.playerHeight);
        
        // Use a more generous grounded check to handle going down slopes
        // If we're moving down and hit gravity, this.velocity.y will be negative.
        const isFalling = this.velocity.y < 0;
        const slopeGrace = isFalling ? 1.0 : this.groundedEpsilon; 
        let onGround = pos.y <= safeGroundHeight + this.playerHeight + slopeGrace;

        if (onGround) {
            this.airJumpsRemaining = this.maxAirJumps;
            this.coyoteTimer = this.coyoteTimeDuration;
            // Only zero horizontal/downward velocity when truly hitting the ground plane, 
            // not when just within the slope grace distance, to let gravity work properly downhill
        } else {
            this.coyoteTimer -= dt;
        }

        if (this.wallRunCooldownTimer > 0) {
            this.wallRunCooldownTimer = Math.max(0, this.wallRunCooldownTimer - dt);
        }

        const wallProbeOrigin = pos.clone();
        wallProbeOrigin.y = pos.y - this.playerHeight * 0.5;
        const rightWallHit = this.getWallHit(wallProbeOrigin, walkRight);
        const leftWallHit = this.getWallHit(wallProbeOrigin, walkRight.clone().mulScalar(-1));
        const wallHit = rightWallHit ?? leftWallHit;

        const wallRunHeight = pos.y - (safeGroundHeight + this.playerHeight);
        const hasForwardIntent = hasMoveInput && moveDir.dot(walkForward) > 0.2;
        const canStartWallRun = !onGround
            && hasForwardIntent
            && wallRunHeight > this.wallRunMinHeight
            && this.wallRunCooldownTimer <= 0
            && wallHit !== null;

        if (!this.wallRunActive && canStartWallRun) {
            this.wallRunActive = true;
            this.wallRunTimeRemaining = this.wallRunMaxTime;
            this.wallRunNormal.copy(wallHit!.normal);
            this.velocity.y = Math.max(this.velocity.y, 0);
            this.wallRunElapsed = 0;
        }

        if (this.wallRunActive) {
            if (wallHit) {
                this.wallRunNormal.copy(wallHit.normal);
            }
            this.wallRunElapsed += dt;
            this.wallRunTimeRemaining = Math.max(0, this.wallRunTimeRemaining - dt);
            if (!wallHit || !hasForwardIntent || onGround || this.wallRunTimeRemaining === 0) {
                this.stopWallRun();
            }
        }

        if (this.wallRunActive) {
            onGround = false;
        }

        if (!onGround || this.wallRunActive) {
            this.stopSlide();
        } else if (isSlideHeld) {
            if (!this.slideActive && hasMoveInput) {
                this.startSlide(moveDir);
            }
        } else if (this.slideActive) {
            this.stopSlide();
        }

        if (jumpPressed) {
            if (this.wallRunActive) {
                this.stopWallRun();
                // Wall-jump should still allow a follow-up air jump.
                this.airJumpsRemaining = this.maxAirJumps;
                this.velocity.y = this.wallRunJumpUp;
                this.velocity.add(this.wallRunNormal.clone().mulScalar(this.wallRunJumpPush));
            } else {
                // First check for ground or coyote time jump
                if (onGround || this.coyoteTimer > 0) {
                    // If we are getting pulled down by gravity, snap our base Y to the ground before jumping 
                    // so we don't jump "from slightly above ground" feeling weak
                    if (pos.y < safeGroundHeight + this.playerHeight + slopeGrace && isFalling) {
                       pos.y = safeGroundHeight + this.playerHeight;
                    }
                    this.velocity.y = this.jumpPower;
                    this.coyoteTimer = 0; // consume coyote time
                } else if (this.airJumpsRemaining > 0) {
                    this.velocity.y = this.jumpPower;
                    this.airJumpsRemaining -= 1;
                }
            }
        }

        if (dashPressed && this.dashCharges > 0) {
            if (this.wallRunActive) {
                const wallForward = walkForward.clone().sub(this.wallRunNormal.clone().mulScalar(walkForward.dot(this.wallRunNormal)));
                if (wallForward.lengthSq() > 0.0001) {
                    wallForward.normalize();
                }
                this.dashDirection.copy(wallForward);
            } else if (hasMoveInput) {
                this.dashDirection.copy(moveDir);
            } else {
                this.dashDirection.set(forward.x, 0, forward.z);
                if (this.dashDirection.lengthSq() > 0) {
                    this.dashDirection.normalize();
                }
            }

            // Add upward component if Space is held (not while wallrunning)
            if (!this.wallRunActive && isSpace) {
                this.dashDirection.y = 1;
                this.dashDirection.normalize();
            }

            if (this.dashDirection.lengthSq() > 0) {
                this.dashCharges -= 1;
                this.dashTimeRemaining = this.dashDuration;
                this.dashRechargeTimer = 0;
            }
        }

        if (this.dashCharges < this.maxDashes) {
            this.dashRechargeTimer += dt;
            while (this.dashCharges < this.maxDashes && this.dashRechargeTimer >= this.dashRechargeTime) {
                this.dashCharges += 1;
                this.dashRechargeTimer -= this.dashRechargeTime;
            }
            if (this.dashCharges === this.maxDashes) {
                this.dashRechargeTimer = 0;
            }
        }

        if (this.wallRunActive) {
            if (this.dashTimeRemaining > 0 && this.dashDirection.lengthSq() > 0) {
                this.tryMoveDash(pos, this.dashDirection, this.dashSpeed, dt, safeGroundHeight, false);
                this.dashTimeRemaining = Math.max(0, this.dashTimeRemaining - dt);
            } else {
                const baseDir = walkForward;
                const wallForward = baseDir.clone().sub(this.wallRunNormal.clone().mulScalar(baseDir.dot(this.wallRunNormal)));
                if (wallForward.lengthSq() > 0.0001) {
                    wallForward.normalize();
                    this.tryMoveHorizontally(pos, wallForward, this.wallRunSpeed, dt);
                }
            }

            if (wallHit?.point) {
                const desiredWallDistance = this.collisionProbePadding + 0.15;
                const toWall = pos.clone().sub(wallHit.point);
                const currentDistance = toWall.dot(this.wallRunNormal);
                if (this.isFiniteNumber(currentDistance)) {
                    const correction = currentDistance - desiredWallDistance;
                    pos.add(this.wallRunNormal.clone().mulScalar(-correction));
                }
            } else if (this.wallRunStickForce > 0) {
                pos.add(this.wallRunNormal.clone().mulScalar(-this.wallRunStickForce * dt));
            }

            if (this.wallRunElapsed < this.wallRunNoGravityTime) {
                this.velocity.y = 0;
            } else if (this.velocity.y > 0) {
                this.velocity.y = 0;
            }

            const wallRunGravityScale = this.wallRunElapsed < this.wallRunNoGravityTime
                ? 0
                : this.wallRunGravityScale;
            this.velocity.y -= this.gravity * wallRunGravityScale * dt;
            pos.y += this.velocity.y * dt;

            if (pos.y < safeGroundHeight + this.playerHeight) {
                pos.y = safeGroundHeight + this.playerHeight;
                this.velocity.y = 0;
                this.stopWallRun();
            }
        } else {
            if (this.dashTimeRemaining > 0 && this.dashDirection.lengthSq() > 0) {
                this.tryMoveDash(pos, this.dashDirection, this.dashSpeed, dt, safeGroundHeight, onGround);
                this.dashTimeRemaining = Math.max(0, this.dashTimeRemaining - dt);
            } else if (this.slideActive && this.slideDirection.lengthSq() > 0) {
                this.tryMoveHorizontally(
                    pos,
                    this.slideDirection,
                    this.slideSpeedCurrent,
                    dt,
                    onGround ? safeGroundHeight : undefined
                );
                this.slideTimeRemaining = Math.max(0, this.slideTimeRemaining - dt);
                this.slideSpeedCurrent = Math.max(this.moveSpeed, this.slideSpeedCurrent - (this.slideFriction * this.slideSpeed * dt));
                if (this.slideTimeRemaining === 0 || !isSlideHeld) {
                    this.stopSlide();
                }
            } else if (hasMoveInput) {
                this.tryMoveHorizontally(pos, moveDir, this.moveSpeed, dt, onGround ? safeGroundHeight : undefined);
            }

            // Apply Gravity
            this.velocity.y -= this.gravity * dt;
            pos.y += this.velocity.y * dt;

            // Ground collision
            if (pos.y < safeGroundHeight + this.playerHeight) {
                pos.y = safeGroundHeight + this.playerHeight;
                this.velocity.y = 0;
            }
        }

        this.wasJumpHeld = !!isSpace;
        this.wasDashHeld = !!isShift;
        this.basePosition.copy(pos);

        const wallSide = this.wallRunNormal.dot(walkRight);
        const wallRollTarget = this.wallRunActive
            ? math.clamp(-Math.sign(wallSide) || 0, -1, 1) * this.wallRunCameraRollDeg
            : 0;
        const rollBlend = math.clamp(dt * this.wallRunCameraRollSpeed, 0, 1);
        this.eulers.z = math.lerp(this.eulers.z, wallRollTarget, rollBlend);

        const finalPos = pos.clone();
        if (this.wallRunActive) {
            finalPos.add(this.wallRunNormal.clone().mulScalar(this.wallRunCameraOffset));
        }

        // Scale camera effect by current slide speed so it is strongest at slide start.
        const slideSpeedFactor = this.slideActive && this.slideSpeed > 0
            ? math.clamp(this.slideSpeedCurrent / this.slideSpeed, 0, 1)
            : 0;
        const slideCameraTarget = this.slideActive ? slideSpeedFactor : 0;
        // Smooth camera transitions in/out of slide posture.
        const slideLerpAlpha = math.clamp(dt * this.slideCameraLerpSpeed, 0, 1);
        this.slideCameraBlend = math.lerp(this.slideCameraBlend, slideCameraTarget, slideLerpAlpha);

        if (this.slideCameraBlend > 0.001) {
            const cameraForward = new Vec3(forward.x, 0, forward.z);
            if (cameraForward.lengthSq() > 0.0001) {
                cameraForward.normalize();
                // Pull camera back along facing direction to emphasize momentum.
                finalPos.add(cameraForward.mulScalar(-this.slideCameraPullback * this.slideCameraBlend));
            }
            // Lower camera to make the crouched slide stance visually obvious.
            finalPos.y -= this.slideCameraDrop * this.slideCameraBlend;
        }

        this.clampToMovementBounds(finalPos);

 if (!this.hasGroundSupport(finalPos)) {
 finalPos.x = lastCommittedPos.x;
 finalPos.z = lastCommittedPos.z;

 const fallbackGroundHeight = this.sampleGroundHeight(lastCommittedPos, Number.POSITIVE_INFINITY, this.groundHeight);
 if (this.isFiniteNumber(fallbackGroundHeight)) {
 this.groundHeight = fallbackGroundHeight;
 finalPos.y = Math.max(finalPos.y, fallbackGroundHeight + this.playerHeight);
 }
 } else {
 const finalGroundHeight = this.sampleGroundHeight(finalPos, Number.POSITIVE_INFINITY, this.groundHeight);
 if (this.isFiniteNumber(finalGroundHeight) && finalGroundHeight + this.playerHeight > finalPos.y + 0.1) {
 finalPos.x = lastCommittedPos.x;
 finalPos.z = lastCommittedPos.z;
 finalPos.y = Math.max(finalPos.y, finalGroundHeight + this.playerHeight);
 }
 }

        this.entity.setLocalEulerAngles(this.eulers.x, this.eulers.y, this.eulers.z);
        this.entity.setPosition(finalPos);
    }
}
