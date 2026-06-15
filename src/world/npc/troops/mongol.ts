import { AppBase, Entity, Vec3 } from "playcanvas";
import { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

export class Mongol extends npc {
    protected circleRadius: number = 5;
    // Ranged attack settings (Mongols shoot while circling)
    protected rangedAttackRange: number = 30;
    protected rangedAttackDamage: number = 5;
    protected rangedAttackCooldown: number = 1.0; // seconds
    private guaranteedRangedHits: boolean = false;
    private static lastGroupShotTime: number = -Infinity;
    private static lastShotSelectionTick: number = -Infinity;
    private static selectedShooterId: number | null = null;
    private static lastShooterId: number | null = null;
    // Shared direction for all Mongols so they circle uniformly (1 = ccw, -1 = cw).
    protected static circleDirection: number = Math.random() > 0.5 ? 1 : -1;
    // Shared group angle (degrees) that advances once per frame so the whole group rotates together.
    protected static groupAngleDeg: number = 0;
    protected static circleAngularSpeedDeg: number = 30; // degrees per second
    protected static lastAngleUpdateTick: number = -Infinity;
    public static hasRetreatedOnce: boolean = false;
    public static retreatActive: boolean = false;
    public static retreatPoint: Vec3 | null = null;
    public static hordeSpawned: boolean = false;

    // Mongol horde taunts - disabled to avoid unused variable
    // private static taunts: string[] = ["this is a test", "I will of man you"];

    constructor(id: number, modelEntity: Entity = new Entity("mongol"), ) {
        super(id, 'foe', 100, modelEntity);
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 0.85;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.75;
    }

    public setRangedAttackDamage(damage: number): void {
        if (Number.isFinite(damage) && damage > 0) {
            this.rangedAttackDamage = damage;
        }
    }

    public setGuaranteedRangedHits(enabled: boolean): void {
        this.guaranteedRangedHits = enabled;
    }

    public static resetBattleState(): void {
        Mongol.lastGroupShotTime = -Infinity;
        Mongol.lastShotSelectionTick = -Infinity;
        Mongol.selectedShooterId = null;
        Mongol.lastShooterId = null;
        Mongol.circleDirection = Math.random() > 0.5 ? 1 : -1;
        Mongol.groupAngleDeg = 0;
        Mongol.lastAngleUpdateTick = -Infinity;
        Mongol.hasRetreatedOnce = false;
        Mongol.retreatActive = false;
        Mongol.retreatPoint = null;
        Mongol.hordeSpawned = false;
    }

    

    override updateCombatAI(deltaTime: number, currentTimeSeconds: number, allNpcs: npc[], onNpcAttack?: (attacker: npc, target: npc, damage: number) => void, playerEntity?: Entity | null, onPlayerAttack?: (attacker: npc, damage: number) => void): void {
        // Default to base behaviour unless we have a live player target.
        if (playerEntity && this.isAlive()) {
            const playerPos = playerEntity.getPosition();
            const myPos = this.getEntity().getPosition();

            // Gather living Mongol instances and determine this NPC's slot.
            const mongolInstances = allNpcs.filter(n => n instanceof Mongol && n.isAlive()) as Mongol[];
            if (mongolInstances.length > 0) {
                mongolInstances.sort((a, b) => a.getId() - b.getId());
            }
            const len = mongolInstances.length;
            var totalHealth = 0;

            for (let i = 0; i < len; i++) {
                totalHealth += mongolInstances[i].getHealth();
            }
            const averageHealth = len > 0 ? totalHealth / len : 0;

            if (Mongol.retreatActive && Mongol.retreatPoint) {
                let toSlotX = Mongol.retreatPoint.x - myPos.x;
                let toSlotZ = Mongol.retreatPoint.z - myPos.z;
                
                let distToRetreat = Math.sqrt(toSlotX * toSlotX + toSlotZ * toSlotZ);
                if (distToRetreat < 5) {
                    Mongol.retreatActive = false;
                    return;
                } else {
                    // Keep moving toward retreat point
                    this.moveToward(toSlotX, toSlotZ, this.aiConfig.chaseMoveSpeed * 1.5, deltaTime);
                    return;
                }
            }

            if (this.initFalseRetreat(playerPos, playerEntity, myPos, averageHealth)) {
                return;
            }

            const count = Math.max(1, mongolInstances.length);
            let index = mongolInstances.findIndex(m => m === this);
            if (index < 0) {
                index = 0;
            }

            // Update shared group angle once per frame (scene passes same currentTimeSeconds to all NPCs).
            if (Mongol.lastAngleUpdateTick !== currentTimeSeconds) {
                Mongol.groupAngleDeg = (Mongol.groupAngleDeg + (Mongol.circleAngularSpeedDeg * deltaTime * Mongol.circleDirection)) % 360;
                Mongol.lastAngleUpdateTick = currentTimeSeconds;
            }

            // Determine radius that maintains minimum arc spacing per Mongol.
            const minArcSpacing = Math.max(1.6, this.getHitboxRadius() * 1.8);
            const requiredRadius = (count * minArcSpacing) / (2 * Math.PI);

            // Allow the player's camera controller to define a preferred minimum circle radius
            const playerController = (playerEntity as any)?.script?.FirstPersonCamera ?? (playerEntity as any)?.script?.firstPersonCamera;
            const playerPreferredMin = (playerController && Number.isFinite(playerController.preferredNpcCircleRadius)) ? playerController.preferredNpcCircleRadius : undefined;
            const baseMinFromPlayer = playerPreferredMin ?? Math.max(this.circleRadius, (playerController?.playerHeight ?? 2) * 1.2);
            // Increase radius proportional to player movement speed so faster players get a wider circle.
            const speedFactor = (playerController?.moveSpeed ?? 0) * 0.25;
            const radius = Math.max(baseMinFromPlayer + speedFactor, requiredRadius);

            // Assigned angular slot for this Mongol (degrees), offset by group rotation.
            const separationDegrees = 360 / count;
            const assignedAngleDeg = (index * separationDegrees) + Mongol.groupAngleDeg;
            const assignedAngleRad = assignedAngleDeg * (Math.PI / 180);

            // Desired world-space point on the rotating circle around player.
            const desiredX = playerPos.x + (radius * Math.cos(assignedAngleRad));
            const desiredZ = playerPos.z + (radius * Math.sin(assignedAngleRad));

            // Move toward the moving slot point.
            let toSlotX = desiredX - myPos.x;
            let toSlotZ = desiredZ - myPos.z;
            const mongolMoveSpeed = this.aiConfig.chaseMoveSpeed;
            const distanceToSlot = Math.sqrt((toSlotX * toSlotX) + (toSlotZ * toSlotZ));
            const orbitArrivalRadius = Math.max(0.85, this.getHitboxRadius() * 0.7);
            if (distanceToSlot > orbitArrivalRadius) {
                const orbitMoveSpeed = Math.min(mongolMoveSpeed, distanceToSlot * 4);
                this.moveToward(toSlotX, toSlotZ, orbitMoveSpeed, deltaTime);
            }

            // Select one Mongol to fire each cooldown window (randomized each time).
            const nowSeconds = currentTimeSeconds;
            const dx = playerPos.x - myPos.x;
            const dy = playerPos.y - myPos.y;
            const dz = playerPos.z - myPos.z;
            const distance3 = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
            const inRange = distance3 <= this.rangedAttackRange;

            if ((nowSeconds - Mongol.lastGroupShotTime) >= this.rangedAttackCooldown) {
                if (Mongol.lastShotSelectionTick !== nowSeconds) {
                    const candidates: Mongol[] = [];
                    for (const mongol of mongolInstances) {
                        const mPos = mongol.getEntity().getPosition();
                        const mdx = playerPos.x - mPos.x;
                        const mdy = playerPos.y - mPos.y;
                        const mdz = playerPos.z - mPos.z;
                        const mDist = Math.sqrt((mdx * mdx) + (mdy * mdy) + (mdz * mdz));
                        if (mDist <= mongol.rangedAttackRange) {
                            candidates.push(mongol);
                        }
                    }

                    let pool = candidates;
                    if (pool.length > 1 && Mongol.lastShooterId !== null) {
                        const filtered = pool.filter(m => m.getId() !== Mongol.lastShooterId);
                        if (filtered.length > 0) {
                            pool = filtered;
                        }
                    }

                    if (pool.length > 0) {
                        const pick = pool[Math.floor(Math.random() * pool.length)];
                        Mongol.selectedShooterId = pick.getId();
                    } else {
                        Mongol.selectedShooterId = null;
                    }

                    Mongol.lastShotSelectionTick = nowSeconds;
                }

                if (Mongol.selectedShooterId === this.getId() && inRange) {
                    Mongol.lastGroupShotTime = nowSeconds;
                    Mongol.lastShooterId = this.getId();
                    Mongol.selectedShooterId = null;
                    // Fire a projectile toward the player. Optionally apply damage immediately for guaranteed hits.
                    if (this.guaranteedRangedHits && onPlayerAttack) {
                        onPlayerAttack(this, this.rangedAttackDamage);
                        this.fireProjectileAt(playerEntity, this.rangedAttackDamage, 25);
                    } else {
                        this.fireProjectileAt(playerEntity, this.rangedAttackDamage, 25, onPlayerAttack);
                    }
                }
            }

            return;
        }

        // Fallback to default NPC behaviour when no player present or NPC dead.
        super.updateCombatAI(deltaTime, currentTimeSeconds, allNpcs, onNpcAttack, playerEntity, onPlayerAttack);
    }

    getPointOnCircle(radius: number, angleDegrees: number): Vec3 {
        const angleRadians = angleDegrees * (Math.PI / 180);
        const x = radius * Math.cos(angleRadians);
        const z = radius * Math.sin(angleRadians);
        return new Vec3(x, 0, z);
    }

    private resolveSceneApp(targetEntity?: Entity): AppBase | undefined {
        const selfEntity = this.getEntity() as any;
        const selfApp = (selfEntity?.app ?? selfEntity?._app) as AppBase | undefined;
        if (selfApp?.root) return selfApp;
        const targetAny = targetEntity as any;
        const targetApp = (targetAny?.app ?? targetAny?._app) as AppBase | undefined;
        if (targetApp?.root) return targetApp;
        const globalApp = (globalThis as any)?.app as AppBase | undefined;
        if (globalApp?.root) return globalApp;
        return undefined;
    }

    // Spawn a simple kinematic projectile that travels toward `targetEntity` and notifies via `onPlayerAttack` when it hits.
    protected fireProjectileAt(targetEntity: Entity, damage: number, speed: number = 25, onPlayerAttack?: (attacker: npc, damage: number) => void): void {
        const sceneApp = this.resolveSceneApp(targetEntity);
        if (!sceneApp?.root) {
            return;
        }

        const origin = this.getEntity().getPosition().clone();
        const targetPos = targetEntity.getPosition().clone();

        const dir = targetPos.clone().sub(origin);
        const distance = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
        if (distance <= 0.001) return;
        dir.normalize();

        const projectile = new Entity('mongol arrow');
        projectile.setPosition(origin);
        projectile.lookAt(origin.clone().add(dir));

        const tracer = new Entity('mongol arrow tracer');
        tracer.addComponent('render', { type: 'cylinder' } as any);
        tracer.setLocalScale(0.04, 0.04, 0.9);
        projectile.addChild(tracer);
        sceneApp.root.addChild(projectile);

        let travelled = 0;
        const maxLife = Math.max(3, distance / speed + 1);
        const tickMs = 16;

        const interval = window.setInterval(() => {
            const dt = tickMs / 1000;
            const move = speed * dt;
            travelled += move;
            const newPos = origin.clone().add(dir.clone().mulScalar(travelled));
            projectile.setPosition(newPos);

            // Recalculate target position (player may move)
            const currentTargetPos = targetEntity.getPosition();
            const dx = currentTargetPos.x - newPos.x;
            const dy = currentTargetPos.y - newPos.y;
            const dz = currentTargetPos.z - newPos.z;
            const distToTarget = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));

            // Simple hit test: if projectile is within hit radius, notify and destroy.
            const hitRadius = Math.max(1.5, (targetEntity.collision?.radius as number) ?? 1.5);
            if (distToTarget <= hitRadius) {
                if (onPlayerAttack) {
                    onPlayerAttack(this, damage);
                }
                projectile.destroy();
                window.clearInterval(interval);
                return;
            }

            // Lifespan check
            if (travelled >= (distance + 4) || (projectile && !projectile.parent)) {
                // remove after exceeding range or if parentless
                try { projectile.destroy(); } catch (e) {}
                window.clearInterval(interval);
                return;
            }
        }, tickMs);

        // Ensure projectile cleanup after maxLife seconds
        window.setTimeout(() => {
            try { projectile.destroy(); } catch (e) {}
            window.clearInterval(interval);
        }, maxLife * 1000);
    }

    // Melee attack option — creates a visible slow arcing weapon strike toward target.
    // Note: this method is intentionally not called anywhere by default.
    protected performMeleeArcAttack(targetEntity: Entity, damage: number, durationSeconds: number = 0.9, arcHeight: number = 2.0, onHit?: (attacker: npc, target: Entity, damage: number) => void): void {
        const sceneApp = this.resolveSceneApp(targetEntity);
        if (!sceneApp?.root) return;

        const origin = this.getEntity().getPosition().clone();
        const targetStart = targetEntity.getPosition().clone();
        const dir = targetStart.clone().sub(origin);
        const flatDist = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
        if (flatDist <= 0.001) return;
        dir.normalize();

        const arcEntity = new Entity('mongol melee arc');
        arcEntity.setPosition(origin);

        const visual = new Entity('melee visual');
        visual.addComponent('render', { type: 'sphere' } as any);
        visual.setLocalScale(0.5, 0.5, 0.5);
        arcEntity.addChild(visual);
        sceneApp.root.addChild(arcEntity);

        const startTime = Date.now();
        const tickMs = 16;
        const interval = window.setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const t = Math.min(1, elapsed / durationSeconds);

            // Horizontal interpolation
            const horiz = new Vec3().lerp(origin, targetStart, t);
            // Vertical arc (slow): sin curve for smooth rise/fall
            const y = origin.y + (Math.sin(Math.PI * t) * arcHeight);
            arcEntity.setPosition(horiz.x, y, horiz.z);

            if (t >= 1) {
                // On hit callback (optional)
                if (onHit) onHit(this, targetEntity, damage);
                try { arcEntity.destroy(); } catch (e) {}
                window.clearInterval(interval);
            }
        }, tickMs);
    }

    protected initFalseRetreat(playerPos: Vec3, playerEntity: Entity, myPos: Vec3, averageHealth: number): boolean {
        if (Mongol.hasRetreatedOnce || averageHealth >= 50) {
            return false;
        }

        Mongol.hasRetreatedOnce = true;
        Mongol.retreatActive = true;

        const retreatDist = 85;
        const playerForward = new Vec3(playerEntity.forward.x, 0, playerEntity.forward.z);
        if (playerForward.lengthSq() > 0.0001) {
            playerForward.normalize();
        } else {
            playerForward.set(myPos.x - playerPos.x, 0, myPos.z - playerPos.z);
            if (playerForward.lengthSq() > 0.0001) {
                playerForward.normalize();
            } else {
                playerForward.set(0, 0, 1);
            }
        }

        Mongol.retreatPoint = new Vec3(
            playerPos.x - (playerForward.x * retreatDist),
            myPos.y,
            playerPos.z - (playerForward.z * retreatDist)
        );

        return true;
    }
}