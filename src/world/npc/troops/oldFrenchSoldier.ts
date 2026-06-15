import { AppBase, Entity } from "playcanvas";
import { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type DamageCallback = (damage: number) => void;

export class OldFrenchSoldier extends npc {
    private readonly meleeRange = 2.3;
    private readonly meleeDamage = 18;
    private readonly meleeCooldownSeconds = 5;
    private readonly meleeWindupSeconds = 0.5;

    private readonly rangedRange = 28;
    private readonly rangedDamage = 10;
    private readonly rangedCooldownSeconds = 1.4;
    private readonly rangedProjectileSpeed = 65;

    private lastRangedAttackTime = -Infinity;
    private meleeWindupPending = false;

    constructor(id: number, modelEntity: Entity = new Entity("old french soldier")) {
        super(id, "foe", 100, modelEntity);
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 0.85;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.7;
        this.aiConfig.detectionRange = 200;
    }

    protected override getCombatProfile() {
        return {
            attackDamage: this.meleeDamage,
            attackRange: this.meleeRange,
            attackCooldown: this.meleeCooldownSeconds,
            detectionRange: this.aiConfig.detectionRange
        };
    }

    public override updateCombatAI(
        deltaTime: number,
        currentTimeSeconds: number,
        allNpcs: npc[],
        onNpcAttack?: (attacker: npc, target: npc, damage: number) => void,
        playerEntity?: Entity | null,
        onPlayerAttack?: (attacker: npc, damage: number) => void
    ): void {
        if (!this.isAlive()) {
            return;
        }

        const profile = this.getCombatProfile();
        const targetInfo = this.resolveTarget(allNpcs, profile.detectionRange, playerEntity, onNpcAttack, onPlayerAttack);
        
        if (targetInfo) {
            const { entity: targetEntity, targetNpc, onHit } = targetInfo;
            const distance = this.getDistanceToEntity(targetEntity);

            const wrappedMeleeAttack = (_attacker: npc) => {
                this.scheduleMeleeHit(targetEntity, targetNpc, onHit, profile.attackDamage);
            };

            super.updateAI(deltaTime, targetEntity, currentTimeSeconds, wrappedMeleeAttack, profile);

            if (distance <= this.rangedRange && distance > profile.attackRange) {
                this.tryRangedAttack(targetEntity, targetNpc, onHit, currentTimeSeconds);
            }
        } else if (playerEntity) {
            super.updateAI(deltaTime, playerEntity, currentTimeSeconds, (attacker) => {
                onPlayerAttack?.(attacker, profile.attackDamage);
            }, profile);
        } else {
            super.updateAI(deltaTime, null, currentTimeSeconds, undefined, profile);
        }
    }

    private resolveTarget(
        allNpcs: npc[],
        detectionRange: number,
        playerEntity?: Entity | null,
        onNpcAttack?: (attacker: npc, target: npc, damage: number) => void,
        onPlayerAttack?: (attacker: npc, damage: number) => void
    ): { entity: Entity; targetNpc?: npc; onHit?: DamageCallback } | null {
        if (this.getTeam() === "foe" && playerEntity) {
            const playerDistance = this.getDistanceToEntity(playerEntity);
            if (playerDistance <= detectionRange) {
                return {
                    entity: playerEntity,
                    onHit: (damage) => {
                        onPlayerAttack?.(this, damage);
                    }
                };
            }
        }

        const hostileNpcTarget = this.findNearestHostileNpc(allNpcs, detectionRange);
        if (hostileNpcTarget) {
            return {
                entity: hostileNpcTarget.getEntity(),
                targetNpc: hostileNpcTarget,
                onHit: (damage) => {
                    onNpcAttack?.(this, hostileNpcTarget, damage);
                }
            };
        }

        if (this.getTeam() === "foe" && playerEntity) {
            return {
                entity: playerEntity,
                onHit: (damage) => {
                    onPlayerAttack?.(this, damage);
                }
            };
        }

        return null;
    }

    private scheduleMeleeHit(
        targetEntity: Entity,
        targetNpc: npc | undefined,
        onHit: DamageCallback | undefined,
        damage: number
    ): void {
        if (this.meleeWindupPending) {
            return;
        }

        this.meleeWindupPending = true;
        window.setTimeout(() => {
            this.meleeWindupPending = false;
            if (!this.isAlive() || !onHit) {
                return;
            }

            if (targetNpc && !targetNpc.isAlive()) {
                return;
            }

            if (!targetEntity.parent) {
                return;
            }

            const distance = this.getDistanceToEntity(targetEntity);
            if (distance <= this.meleeRange + 0.4) {
                onHit(damage);
            }
        }, this.meleeWindupSeconds * 1000);
    }

    private tryRangedAttack(
        targetEntity: Entity,
        targetNpc: npc | undefined,
        onHit: DamageCallback | undefined,
        currentTimeSeconds: number
    ): void {
        if ((currentTimeSeconds - this.lastRangedAttackTime) < this.rangedCooldownSeconds) {
            return;
        }

        this.lastRangedAttackTime = currentTimeSeconds;
        this.fireProjectileAt(targetEntity, targetNpc, this.rangedDamage, this.rangedProjectileSpeed, onHit);
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

    private fireProjectileAt(
        targetEntity: Entity,
        targetNpc: npc | undefined,
        damage: number,
        speed: number,
        onHit?: DamageCallback
    ): void {
        const sceneApp = this.resolveSceneApp(targetEntity);
        if (!sceneApp?.root) {
            return;
        }

        const origin = this.getEntity().getPosition().clone();
        const targetPos = targetEntity.getPosition().clone();

        const dir = targetPos.clone().sub(origin);
        const distance = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
        if (distance <= 0.001) {
            return;
        }
        dir.normalize();

        const projectile = new Entity("old french bullet");
        projectile.setPosition(origin);
        projectile.lookAt(origin.clone().add(dir));

        const tracer = new Entity("old french bullet tracer");
        tracer.addComponent("render", { type: "box" } as any);
        tracer.setLocalScale(0.06, 0.06, 0.6);
        projectile.addChild(tracer);
        sceneApp.root.addChild(projectile);

        let travelled = 0;
        const maxRange = Math.max(8, this.rangedRange + 8);
        const tickMs = 16;

        const cleanup = () => {
            try { projectile.destroy(); } catch (e) {}
        };

        const interval = window.setInterval(() => {
            const dt = tickMs / 1000;
            travelled += speed * dt;
            const newPos = origin.clone().add(dir.clone().mulScalar(travelled));
            projectile.setPosition(newPos);

            if (targetEntity.parent) {
                const currentTargetPos = targetEntity.getPosition();
                const dx = currentTargetPos.x - newPos.x;
                const dy = currentTargetPos.y - newPos.y;
                const dz = currentTargetPos.z - newPos.z;
                const distToTarget = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
                const hitRadius = targetNpc
                    ? Math.max(1.0, targetNpc.getHitboxRadius())
                    : Math.max(1.2, (targetEntity.collision?.radius as number) ?? 1.2);

                if (distToTarget <= hitRadius) {
                    if (onHit) {
                        onHit(damage);
                    }
                    window.clearInterval(interval);
                    cleanup();
                    return;
                }
            }

            if (travelled >= maxRange || !projectile.parent) {
                window.clearInterval(interval);
                cleanup();
            }
        }, tickMs);

        const maxLife = Math.max(2, maxRange / speed + 0.5);
        window.setTimeout(() => {
            window.clearInterval(interval);
            cleanup();
        }, maxLife * 1000);
    }

}