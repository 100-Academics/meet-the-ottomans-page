import { Entity, Vec3 } from "playcanvas";

type NpcTeam = "friend" | "foe";
type NpcState = "idle" | "chase" | "attack" | "dead";

interface NpcAiConfig {
    idleMoveSpeed: number;
    chaseMoveSpeed: number;
    detectionRange: number;
    attackRange: number;
    attackCooldown: number;
    wanderRadius: number;
    wanderInterval: number;
}

interface NpcCombatProfile {
    attackDamage: number;
    attackRange: number;
    attackCooldown: number;
    detectionRange: number;
}

export class npc {
    private id: number;
    private team: NpcTeam;
    private maxHealth: number;
    private health: number;
    private entity: Entity;

    private aiState: NpcState = "idle";
    private lastAttackTime = -Infinity;
    private wanderDirection = new Vec3(1, 0, 0);
    private wanderTimeRemaining = 0;
    private facingYawOffsetDegrees = 0;
    private readonly basePitchDegrees: number;
    private readonly baseRollDegrees: number;
    private spawnCenter = new Vec3(0, 0, 0);
    private hitboxRadius = 1.1;

    protected aiConfig: NpcAiConfig = {
        idleMoveSpeed: 0.8,
        chaseMoveSpeed: 10,
        detectionRange: 14,
        attackRange: 2,
        attackCooldown: 1,
        wanderRadius: 8,
        wanderInterval: 2.5
    };

    constructor(id: number, team: NpcTeam, maxHealth: number, entity: Entity = new Entity("npc")) {
        this.validateTeam(team);
        this.entity = entity;
        this.id = id;
        this.team = team;
        this.maxHealth = maxHealth;
        this.health = maxHealth;

        const initialRotation = this.entity.getLocalEulerAngles();
        this.basePitchDegrees = initialRotation.x;
        this.baseRollDegrees = initialRotation.z;

        this.spawnCenter.copy(this.entity.getPosition());
    }

    public getId(): number {
        return this.id;
    }

    public getTeam(): NpcTeam {
        return this.team;
    }

    public getHealth(): number {
        return this.health;
    }

    public getMaxHealth(): number {
        return this.maxHealth;
    }

    public getEntity(): Entity {
        return this.entity;
    }

    public isAlive(): boolean {
        return this.aiState !== "dead" && this.health > 0;
    }

    public getAiState(): NpcState {
        return this.aiState;
    }

    public setFacingYawOffsetDegrees(offsetDegrees: number): void {
        this.facingYawOffsetDegrees = offsetDegrees;
    }

    public setHitboxRadius(radius: number): void {
        if (Number.isFinite(radius) && radius > 0) {
            this.hitboxRadius = radius;
        }
    }

    public setDetectionRange(range: number): void {
        if (Number.isFinite(range) && range > 0) {
            this.aiConfig.detectionRange = range;
        }
    }

    public getHitboxRadius(): number {
        return this.hitboxRadius;
    }

    public getAttackDamage(): number {
        return this.getCombatProfile().attackDamage;
    }

    public updateCombatAI(
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
        const hostileNpcTarget = this.findNearestHostileNpc(allNpcs, profile.detectionRange);

        if (this.team === "foe" && playerEntity) {
            const playerDistance = this.getDistanceToEntity(playerEntity);
            const playerInRange = playerDistance <= profile.detectionRange;

            if (playerInRange) {
                this.updateAI(deltaTime, playerEntity, currentTimeSeconds, () => {
                    if (onPlayerAttack) {
                        onPlayerAttack(this, profile.attackDamage);
                    }
                }, profile);
                return;
            }
        }

        if (hostileNpcTarget) {
            this.updateAI(deltaTime, hostileNpcTarget.getEntity(), currentTimeSeconds, () => {
                if (onNpcAttack) {
                    onNpcAttack(this, hostileNpcTarget, profile.attackDamage);
                }
            }, profile);
            return;
        }

        if (this.team === "foe" && playerEntity) {
            this.updateAI(deltaTime, playerEntity, currentTimeSeconds, () => {
                if (onPlayerAttack) {
                    onPlayerAttack(this, profile.attackDamage);
                }
            }, profile);
            return;
        }

        this.updateAI(deltaTime, null, currentTimeSeconds, undefined, profile);
    }

    public takeDamage(damage: number): boolean {
        this.health = Math.max(0, this.health - damage);
        console.log(`NPC ${this.id} took ${damage} damage, health now ${this.health}`);
        if (this.kill()) {
            return true;
        }
        return false;
    }

    public kill(): boolean {
        if (this.health <= 0 && this.aiState !== "dead") {
            this.aiState = "dead";
            this.entity.destroy();
            return true;
        }
        return false;
    }

    public updateAI(
        deltaTime: number,
        targetEntity: Entity | null,
        currentTimeSeconds: number,
        onAttack?: (attacker: npc) => void,
        profileOverride?: NpcCombatProfile
    ): void {
        if (!this.isAlive()) {
            return;
        }

        const profile = profileOverride ?? this.getCombatProfile();

        // Clamp frame time so occasional frame spikes do not cause giant movement jumps.
        const clampedDeltaTime = Math.max(0, Math.min(deltaTime, 0.05));

        // No target in range yet: keep moving with lightweight wandering behavior.
        if (!targetEntity) {
            this.updateWander(clampedDeltaTime);
            this.aiState = "idle";
            return;
        }

        const myPos = this.entity.getPosition();
        const targetPos = targetEntity.getPosition();
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z;
        const distance = Math.sqrt((dx * dx) + (dz * dz));

        // AI state machine: idle (too far), chase (close enough to detect), attack (within attack range).
        if (distance > profile.detectionRange) {
            this.aiState = "idle";
            this.updateWander(clampedDeltaTime);
            return;
        }

        if (distance > profile.attackRange) {
            this.aiState = "chase";
            this.moveToward(dx, dz, this.aiConfig.chaseMoveSpeed, clampedDeltaTime);
            return;
        }

        this.aiState = "attack";
        if ((currentTimeSeconds - this.lastAttackTime) >= profile.attackCooldown) {
            this.lastAttackTime = currentTimeSeconds;
            if (onAttack) {
                onAttack(this);
            }
        }
    }

    private validateTeam(team: string): void {
        if (team !== "friend" && team !== "foe") {
            throw new Error("Team must be either 'friend' or 'foe'");
        }
    }

    private updateWander(deltaTime: number): void {
        this.wanderTimeRemaining -= deltaTime;

        // Pick a new random horizontal direction every few seconds.
        if (this.wanderTimeRemaining <= 0) {
            const angle = Math.random() * Math.PI * 2;
            this.wanderDirection.set(Math.cos(angle), 0, Math.sin(angle));
            this.wanderTimeRemaining = this.aiConfig.wanderInterval;
        }

        const myPos = this.entity.getPosition();
        const dx = myPos.x - this.spawnCenter.x;
        const dz = myPos.z - this.spawnCenter.z;
        const distanceFromOrigin = Math.sqrt((dx * dx) + (dz * dz));

        // Keep wandering around spawn area instead of drifting forever.
        if (distanceFromOrigin > this.aiConfig.wanderRadius) {
            this.wanderDirection.set(this.spawnCenter.x - myPos.x, 0, this.spawnCenter.z - myPos.z).normalize();
        }

        this.moveToward(this.wanderDirection.x, this.wanderDirection.z, this.aiConfig.idleMoveSpeed, deltaTime);
    }

    protected moveToward(dirX: number, dirZ: number, speed: number, deltaTime: number): void {
        const magnitude = Math.sqrt((dirX * dirX) + (dirZ * dirZ));
        if (magnitude <= 0.0001) {
            return;
        }

        // Normalize direction so movement speed stays constant regardless of vector length.
        const nx = dirX / magnitude;
        const nz = dirZ / magnitude;
        const currentPos = this.entity.getPosition();
        const nextPos = new Vec3(
            currentPos.x + (nx * speed * deltaTime),
            currentPos.y,
            currentPos.z + (nz * speed * deltaTime)
        );
        this.entity.setPosition(nextPos);

        // Keep imported model pitch/roll while steering yaw toward travel direction.
        const yawDegrees = (Math.atan2(nx, nz) * 180 / Math.PI) + this.facingYawOffsetDegrees;
        this.entity.setLocalEulerAngles(this.basePitchDegrees, yawDegrees, this.baseRollDegrees);
    }

    protected getCombatProfile(): NpcCombatProfile {
        if (this.team === "friend") {
            return {
                attackDamage: 8,
                attackRange: 2.2,
                attackCooldown: 0.8,
                detectionRange: 16
            };
        }

        return {
            attackDamage: 12,
            attackRange: 2,
            attackCooldown: 1.1,
            detectionRange: 14
        };
    }

    protected findNearestHostileNpc(allNpcs: npc[], maxRange: number): npc | null {
        const myPos = this.entity.getPosition();
        let bestTarget: npc | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const candidate of allNpcs) {
            if (candidate === this || !candidate.isAlive()) {
                continue;
            }

            if (candidate.getTeam() === this.team) {
                continue;
            }

            const candidatePos = candidate.getEntity().getPosition();
            const dx = candidatePos.x - myPos.x;
            const dz = candidatePos.z - myPos.z;
            const distance = Math.sqrt((dx * dx) + (dz * dz));

            if (distance > maxRange) {
                continue;
            }

            if (distance < bestDistance) {
                bestDistance = distance;
                bestTarget = candidate;
            }
        }

        return bestTarget;
    }

    protected getDistanceToEntity(otherEntity: Entity): number {
        const myPos = this.entity.getPosition();
        const otherPos = otherEntity.getPosition();
        const dx = otherPos.x - myPos.x;
        const dz = otherPos.z - myPos.z;
        return Math.sqrt((dx * dx) + (dz * dz));
    }

    protected getEntityFacing(entity: Entity): Vec3 {
        var facingDir = entity.forward;
        console.log(`Entity ${entity.name} facing direction: (${facingDir.x.toFixed(2)}, ${facingDir.y.toFixed(2)}, ${facingDir.z.toFixed(2)})`);
        return new Vec3(facingDir.x, facingDir.y, facingDir.z);
    }

    public static resolveHitboxCollisions(allNpcs: npc[]): void {
        for (let i = 0; i < allNpcs.length; i++) {
            const a = allNpcs[i];
            if (!a.isAlive()) {
                continue;
            }

            for (let j = i + 1; j < allNpcs.length; j++) {
                const b = allNpcs[j];
                if (!b.isAlive()) {
                    continue;
                }

                const aPos = a.getEntity().getPosition();
                const bPos = b.getEntity().getPosition();
                const dx = bPos.x - aPos.x;
                const dz = bPos.z - aPos.z;
                const distance = Math.sqrt((dx * dx) + (dz * dz));
                const minDistance = a.hitboxRadius + b.hitboxRadius;

                if (distance >= minDistance) {
                    continue;
                }

                const overlap = minDistance - distance;
                const nx = distance > 0.0001 ? dx / distance : 1;
                const nz = distance > 0.0001 ? dz / distance : 0;
                const push = overlap * 0.5;

                const correctedA = new Vec3(aPos.x - (nx * push), aPos.y, aPos.z - (nz * push));
                const correctedB = new Vec3(bPos.x + (nx * push), bPos.y, bPos.z + (nz * push));
                a.getEntity().setPosition(correctedA);
                b.getEntity().setPosition(correctedB);
            }
        }
    }
}