import { AppBase, Entity } from "playcanvas";
import { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type DamageCallback = (damage: number) => void;

// Korean soldier — bolt-action rifleman. Chases the player from range and
// fires tracer projectiles in the mid-range band, then falls back to melee
// when the player closes distance.
//
// AI template is intentionally kept in lock-step with RussianSoldier /
// HuntingRifleDude so all three share the same chase/melee plumbing proven
// to work elsewhere in the game. Per-NPC tuning (damage numbers, cooldowns,
// projectile speed) lives in the private fields below.
export class KoreanSoldier extends npc {
    // Melee burst when the player gets inside the rifle min range.
    private readonly meleeRange = 2.3;
    private readonly meleeDamage = 15;
    private readonly meleeCooldownSeconds = 1.6;
    private readonly meleeWindupSeconds = 0.5;

    // Mid-range rifle shots — damage scales up at closer range in
    // tryRangedAttack via hit-radius checks.
    private readonly rangedRange = 28;
    private readonly rangedDamage = 7;
    private readonly rangedCooldownSeconds = 1.5;
    private readonly rangedProjectileSpeed = 60;
    // First-shot stagger spreads the opening volley over a few seconds so
    // a full squad clustered near spawn doesn't delete the player in one frame.
    private readonly firstShotStaggerSeconds = 4.0;

    private lastRangedAttackTime = -Infinity;
    private meleeWindupPending = false;

    constructor(id: number, modelEntity: Entity = new Entity("korean soldier")) {
        super(id, "foe", 100, modelEntity);
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 0.85;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.7;
        // Engage the player at typical battlefield distances; the per-NPC
        // override registered by spawnSceneNpcs narrows or widens this.
        this.setDetectionRange(Number.MAX_VALUE);
        // Per-NPC randomized first-shot delay so the opening volley is spread
        // across roughly firstShotStaggerSeconds instead of landing in one tick.
        this.lastRangedAttackTime = (Date.now() / 1000)
            - this.rangedCooldownSeconds
            + (Math.random() * this.firstShotStaggerSeconds);
    }

    // Use the aiConfig-driven detection range rather than the hardcoded 14 from
    // the base npc.getCombatProfile(). Every ranged troop in this folder does
    // this same swap.
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
        if (!targetInfo) {
            super.updateAI(deltaTime, null, currentTimeSeconds, undefined, profile);
            return;
        }

        const { entity: targetEntity, targetNpc, onHit } = targetInfo;
        const distance = this.getDistanceToEntity(targetEntity);

        // Wrap the base class's melee hit so the windup delay fires before
        // committing damage — same trick RussianSoldier uses.
        const wrappedMeleeAttack = (_attacker: npc) => {
            this.scheduleMeleeHit(targetEntity, targetNpc, onHit, profile.attackDamage);
        };

        // super.updateAI handles chase + attack-range melee transitions.
        // THIS is the call that actually moves the entity (moveToward inside
        // npc.updateAI). Keep it on the happy path so soldiers always move.
        super.updateAI(deltaTime, targetEntity, currentTimeSeconds, wrappedMeleeAttack, profile);

        // Layer the rifle shot on top of chase/melee. Base class won't fire
        // because the target sits outside the melee band, so the projectile
        // trigger lives here.
        if (distance <= this.rangedRange && distance > profile.attackRange) {
            this.tryRangedAttack(targetEntity, targetNpc, onHit, currentTimeSeconds);
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

        const projectile = new Entity("korean soldier bullet");
        projectile.setPosition(origin);
        projectile.lookAt(origin.clone().add(dir));

        const tracer = new Entity("korean soldier bullet tracer");
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
