import { Boss } from "./boss";
import { Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color } from "playcanvas";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type WashingtonAttackType = "libertyStrike" | "monumentRise" | "continentalCharge" | "valleyForge" | "cannonBarrage";

interface LibertyStrikeState {
    endTimeSeconds: number;
    phase: "windup" | "strike" | "recovery";
    hasHit: boolean;
}

interface MonumentRiseState {
    endTimeSeconds: number;
    nextBlockAtSeconds: number;
    blocksSpawned: number;
    blockPositions: Vec3[];
}

interface ContinentalChargeState {
    endTimeSeconds: number;
    direction: Vec3;
    hasHit: boolean;
}

interface ValleyForgeState {
    endTimeSeconds: number;
    nextBlastAtSeconds: number;
    blastsSpawned: number;
}

interface CannonBarrageState {
    endTimeSeconds: number;
    nextCannonAtSeconds: number;
    cannonsFired: number;
}

export class GeorgeWashington extends Boss {
    private readonly libertyStrikeDamage = 45;
    private readonly libertyStrikeCooldownSeconds = 6.0;
    private readonly libertyStrikeRange = 40;
    private readonly libertyStrikeHitRadius = 12.0;
    private nextLibertyStrikeAtSeconds = 0;

    private readonly monumentBlockCount = 25;
    private readonly buildIntervalSeconds = 0.07;
    private readonly monumentCooldownSeconds = 8.0;
    private readonly monumentRange = 60;
    private readonly monumentDamage = 35;
    private readonly monumentHitRadius = 10.0;
    private nextMonumentAtSeconds = 0;

    private readonly chargeSpeed = PLAYER_MOVE_SPEED * 3.2;
    private readonly chargeDurationSeconds = 0.8;
    private readonly chargeCooldownSeconds = 7.0;
    private readonly chargeRange = 50;
    private readonly chargeDamage = 30;
    private readonly chargeHitRadius = 6.0;
    private nextChargeAtSeconds = 0;

    private readonly valleyForgeDamage = 40;
    private readonly valleyForgeBlastCount = 8;
    private readonly valleyForgeIntervalSeconds = 0.35;
    private readonly valleyForgeCooldownSeconds = 10.0;
    private readonly valleyForgeRange = 55;
    private readonly valleyForgeHitRadius = 8.0;
    private nextValleyForgeAtSeconds = 0;

    private readonly cannonDamage = 50;
    private readonly cannonCount = 6;
    private readonly cannonIntervalSeconds = 0.4;
    private readonly cannonCooldownSeconds = 9.0;
    private readonly cannonRange = 80;
    private readonly cannonHitRadius = 9.0;
    private nextCannonAtSeconds = 0;

    private attackLockUntilSeconds = 0;
    private lastAttackType: WashingtonAttackType | null = null;
    private lastAttackAtSeconds = -Infinity;
    private libertyStrikeState: LibertyStrikeState | null = null;
    private monumentState: MonumentRiseState | null = null;
    private chargeState: ContinentalChargeState | null = null;
    private valleyForgeState: ValleyForgeState | null = null;
    private cannonBarrageState: CannonBarrageState | null = null;
    private onPlayerAttack?: (attacker: npc, damage: number) => void;

    private readonly libertyMaterial = this.createEffectMaterial(
        new Color(0.2, 0.5, 1.0), new Color(0.3, 0.6, 1.0), 5.0, 0.9
    );
    private readonly monumentMaterial = this.createEffectMaterial(
        new Color(0.9, 0.88, 0.85), new Color(1, 1, 0.98), 2.5, 0.9
    );
    private readonly chargeMaterial = this.createEffectMaterial(
        new Color(1.0, 0.3, 0.1), new Color(1.0, 0.5, 0.2), 4.5, 0.85
    );
    private readonly valleyForgeMaterial = this.createEffectMaterial(
        new Color(0.6, 0.7, 0.9), new Color(0.7, 0.8, 1.0), 3.5, 0.7
    );
    private readonly snowMaterial = this.createEffectMaterial(
        new Color(0.95, 0.95, 1.0), new Color(1, 1, 1), 2.0, 0.6
    );
    private readonly cannonMaterial = this.createEffectMaterial(
        new Color(0.4, 0.35, 0.3), new Color(0.5, 0.45, 0.4), 2.0, 0.9
    );
    private readonly cannonExplosionMaterial = this.createEffectMaterial(
        new Color(1.0, 0.6, 0.2), new Color(1.0, 0.8, 0.3), 5.0, 0.8
    );

    private readonly activeEffects = new Set<Entity>();

    constructor(id: number, maxHealth: number, entity: Entity = new Entity("George Washington")) {
        super(id, maxHealth, entity, "George Washington");
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.5;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.9;

    this.setIntroTaunt("For liberty and union!", "For liberty and union!");
    this.setIntroNameTranslation("George Washington", "George Washington");
    this.setIntroSkipTranslation(true);
    this.setTauntSet({
            highHealth: [
                "You face the father of a nation!",
                "Liberty shall not fall to the likes of you!",
                "The Continental Army stands with me!",
                "By Providence, we shall prevail!"
            ],
            bossLowPlayerHigh: [
                "A nation born in fire does not extinguish so easily!",
                "I have endured worse winters at Valley Forge!",
                "You underestimate the resolve of a revolutionary!",
                "Freedom's cause cannot be defeated!"
            ],
            playerLowBossHigh: [
                "Surrender now, and I may show mercy!",
                "Your cause is lost!",
                "The tide of battle has turned!",
                "Lay down your arms!"
            ],
            bothLow: [
                "Only one of us walks away from this field!",
                "To the very last breath!",
                "History will remember this day!"
            ],
            death: [
                "I regret I have but one life to give…",
                "The fight goes on without me…",
                "Tell them I died for liberty…"
            ],
            bossDeath: [
                "Freedom… endures…",
                "My nation… will carry on…",
                "The Republic… lives on…"
            ]
        });
    }

    public override updateCombatAI(
        deltaTime: number, currentTimeSeconds: number, allNpcs: npc[],
        onNpcAttack?: (attacker: npc, target: npc, damage: number) => void,
        playerEntity?: Entity | null,
        onPlayerAttack?: (attacker: npc, damage: number) => void
    ): void {
        this.onPlayerAttack = onPlayerAttack;
        super.updateCombatAI(deltaTime, currentTimeSeconds, allNpcs, onNpcAttack, playerEntity, onPlayerAttack);
    }

    public override updateAI(
        deltaTime: number, targetEntity: Entity | null, currentTimeSeconds: number,
        onAttack?: (attacker: npc) => void,
        profileOverride?: { attackDamage: number; attackRange: number; attackCooldown: number; detectionRange: number; }
    ): void {
        if (!this.isAlive()) return;
        const dt = Math.max(0, Math.min(deltaTime, 0.05));

        if (!targetEntity) { super.updateAI(dt, targetEntity, currentTimeSeconds, onAttack, profileOverride); return; }

        if (this.libertyStrikeState) { this.updateLibertyStrike(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.monumentState) { this.updateMonumentRise(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.chargeState) { this.updateContinentalCharge(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.valleyForgeState) { this.updateValleyForge(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.cannonBarrageState) { this.updateCannonBarrage(dt, targetEntity, currentTimeSeconds, onAttack); return; }

        if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

        const distance = this.getFlatDistanceTo(targetEntity);
        const chosen = this.pickNextAttack(distance, currentTimeSeconds);
        if (chosen === "libertyStrike") { this.startLibertyStrike(targetEntity, currentTimeSeconds); return; }
        if (chosen === "monumentRise") { this.startMonumentRise(targetEntity, currentTimeSeconds); return; }
        if (chosen === "continentalCharge") { this.startContinentalCharge(targetEntity, currentTimeSeconds); return; }
        if (chosen === "valleyForge") { this.startValleyForge(targetEntity, currentTimeSeconds); return; }
        if (chosen === "cannonBarrage") { this.startCannonBarrage(targetEntity, currentTimeSeconds); return; }

        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    }

    public override kill(): boolean {
        const didKill = super.kill();
        if (didKill) this.cleanupEffects();
        return didKill;
    }

    protected override getCombatProfile() {
        const base = super.getCombatProfile();
        return { ...base, attackDamage: this.libertyStrikeDamage, attackRange: this.monumentRange, attackCooldown: 4.0, detectionRange: Number.MAX_VALUE };
    }

    private pickNextAttack(distance: number, now: number): WashingtonAttackType | null {
        const choices: Array<{ type: WashingtonAttackType; score: number }> = [];

        if (now >= this.nextLibertyStrikeAtSeconds && distance <= this.libertyStrikeRange) {
            choices.push({ type: "libertyStrike", score: 1.8 });
        }
        if (now >= this.nextMonumentAtSeconds && distance <= this.monumentRange) {
            choices.push({ type: "monumentRise", score: 1.5 });
        }
        if (now >= this.nextChargeAtSeconds && distance <= this.chargeRange) {
            choices.push({ type: "continentalCharge", score: 1.4 });
        }
        if (now >= this.nextValleyForgeAtSeconds && distance <= this.valleyForgeRange) {
            choices.push({ type: "valleyForge", score: 1.6 });
        }
        if (now >= this.nextCannonAtSeconds && distance <= this.cannonRange) {
            choices.push({ type: "cannonBarrage", score: 2.0 });
        }

        if (choices.length === 0) return null;

        if (this.lastAttackType && (now - this.lastAttackAtSeconds) < 2.5) {
            for (const c of choices) { if (c.type === this.lastAttackType) c.score *= 0.25; }
        }

        let best = choices[0];
        for (let i = 1; i < choices.length; i++) { if (choices[i].score > best.score) best = choices[i]; }
        const tied = choices.filter(c => Math.abs(c.score - best.score) < 0.05);
        if (tied.length > 1) return tied[Math.floor(Math.random() * tied.length)].type;
        return best.type;
    }

    // ── Liberty Strike ──
    private startLibertyStrike(target: Entity, now: number): void {
        this.lastAttackType = "libertyStrike";
        this.lastAttackAtSeconds = now;
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();

        this.libertyStrikeState = {
            endTimeSeconds: now + 1.8,
            phase: "windup",
            hasHit: false
        };
        this.attackLockUntilSeconds = this.libertyStrikeState.endTimeSeconds;
        this.spawnLibertyStrikeVFX(dir);
    }

    private updateLibertyStrike(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.libertyStrikeState;
        if (!state) return;

        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed * 0.3, dt);

        if (state.phase === "windup" && now >= state.endTimeSeconds - 1.0) {
            state.phase = "strike";
            this.spawnLibertyBeam(target);
        }

        if (state.phase === "strike" && !state.hasHit) {
            state.hasHit = true;
            const dx = targetPos.x - myPos.x;
            const dz = targetPos.z - myPos.z;
            if (Math.sqrt(dx * dx + dz * dz) <= this.libertyStrikeHitRadius) {
                this.applyDamage(this.libertyStrikeDamage, onAttack);
            }
        }

        if (now >= state.endTimeSeconds) {
            this.libertyStrikeState = null;
            this.nextLibertyStrikeAtSeconds = now + this.libertyStrikeCooldownSeconds;
        }
    }

    private spawnLibertyStrikeVFX(direction: Vec3): void {
        const myPos = this.getEntity().getPosition();
        const strikeVFX = new Entity("washington-liberty-strike-vfx");
        strikeVFX.addComponent("render", { type: "cylinder", material: this.libertyMaterial });
        strikeVFX.setLocalScale(0.5, 1, 0.5);
        strikeVFX.setPosition(myPos.x + direction.x * 2, myPos.y + 2, myPos.z + direction.z * 2);
        strikeVFX.setLocalEulerAngles(0, Math.atan2(direction.x, direction.z) * 180 / Math.PI, 0);
        this.getEntity().parent?.addChild(strikeVFX) ?? this.getEntity().addChild(strikeVFX);
        this.activeEffects.add(strikeVFX);

        const startMs = Date.now();
        const durationMs = 800;
        const tick = () => {
            const elapsed = Date.now() - startMs;
            if (elapsed >= durationMs || !strikeVFX.parent) { this.destroyEffect(strikeVFX); return; }
            const t = elapsed / durationMs;
            const scale = 0.5 + t * 2.0;
            strikeVFX.setLocalScale(scale, 1, scale);
            const mat = strikeVFX.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
            if (mat) { mat.opacity = 0.9 * (1 - t * 0.5); mat.update(); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    private spawnLibertyBeam(target: Entity): void {
        const targetPos = target.getPosition();
        const beam = new Entity("washington-liberty-beam");
        beam.addComponent("render", { type: "cylinder", material: this.libertyMaterial });
        beam.setLocalScale(2.0, 15, 2.0);
        beam.setPosition(targetPos.x, targetPos.y + 7.5, targetPos.z);
        this.getEntity().parent?.addChild(beam) ?? this.getEntity().addChild(beam);
        this.activeEffects.add(beam);

        const startMs = Date.now();
        const durationMs = 1000;
        const tick = () => {
            const elapsed = Date.now() - startMs;
            if (elapsed >= durationMs || !beam.parent) { this.destroyEffect(beam); return; }
            const t = elapsed / durationMs;
            const mat = beam.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
            if (mat) { mat.opacity = 0.9 * (1 - t); mat.update(); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // ── Monument Rise (like Pavia's buildFromGround) ──
    private startMonumentRise(target: Entity, now: number): void {
        this.lastAttackType = "monumentRise";
        this.lastAttackAtSeconds = now;
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) return;
        dir.normalize();

        const blockPositions: Vec3[] = [];
        for (let i = 0; i < this.monumentBlockCount; i++) {
            const forwardDist = i * 2.8 + 3;
            const lateralOffset = (i % 2 === 0 ? 1 : -1) * (3.5 + i * 0.15);
            blockPositions.push(new Vec3(
                myPos.x + dir.x * forwardDist + (-dir.z) * lateralOffset,
                myPos.y,
                myPos.z + dir.z * forwardDist + dir.x * lateralOffset
            ));
        }

        this.monumentState = {
            endTimeSeconds: now + this.monumentBlockCount * this.buildIntervalSeconds + 1.2,
            nextBlockAtSeconds: now,
            blocksSpawned: 0,
            blockPositions
        };
        this.attackLockUntilSeconds = this.monumentState.endTimeSeconds;
    }

    private updateMonumentRise(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.monumentState;
        if (!state) return;

        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed * 0.4, dt);

        if (state.blocksSpawned < this.monumentBlockCount && now >= state.nextBlockAtSeconds) {
            const pos = state.blockPositions[state.blocksSpawned];
            state.blocksSpawned++;
            state.nextBlockAtSeconds = now + this.buildIntervalSeconds;

            const monument = new Entity("washington-monument-column");
            monument.addComponent("render", { type: "box", material: this.monumentMaterial });
            monument.setLocalScale(2.5, 0.1, 2.5);
            monument.setPosition(pos.x, pos.y, pos.z);
            this.getEntity().parent?.addChild(monument) ?? this.getEntity().addChild(monument);
            this.activeEffects.add(monument);

            const startMs = Date.now();
            const riseMs = 60;
            const holdMs = 150;
            const totalMs = riseMs + holdMs;

            const tick = () => {
                const elapsed = Date.now() - startMs;
                if (elapsed >= totalMs || !monument.parent) { this.destroyEffect(monument); return; }
                if (elapsed < riseMs) {
                    const t = elapsed / riseMs;
                    monument.setLocalScale(2.5, 12.0 * t, 2.5);
                    monument.setPosition(pos.x, pos.y + 6.0 * t, pos.z);
                }
                const mat = monument.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                if (mat && elapsed > riseMs) {
                    mat.opacity = 0.9 * (1 - (elapsed - riseMs) / holdMs);
                    mat.update();
                }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);

            const targetPos = target.getPosition();
            const dx = targetPos.x - pos.x;
            const dz = targetPos.z - pos.z;
            if (Math.sqrt(dx * dx + dz * dz) <= this.monumentHitRadius) {
                this.applyDamage(this.monumentDamage, onAttack);
            }
        }

        if (now >= state.endTimeSeconds) {
            this.monumentState = null;
            this.nextMonumentAtSeconds = now + this.monumentCooldownSeconds;
        }
    }

    // ── Continental Charge ──
    private startContinentalCharge(target: Entity, now: number): void {
        this.lastAttackType = "continentalCharge";
        this.lastAttackAtSeconds = now;
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();

        this.chargeState = {
            endTimeSeconds: now + this.chargeDurationSeconds,
            direction: dir,
            hasHit: false
        };
        this.attackLockUntilSeconds = this.chargeState.endTimeSeconds + 0.3;
        this.spawnChargeVFX();
    }

    private updateContinentalCharge(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.chargeState;
        if (!state) return;

        this.moveToward(state.direction.x, state.direction.z, this.chargeSpeed, dt);

        if (!state.hasHit && this.getFlatDistanceTo(target) <= this.chargeHitRadius) {
            state.hasHit = true;
            this.applyDamage(this.chargeDamage, onAttack);
        }

        if (now >= state.endTimeSeconds) {
            this.chargeState = null;
            this.nextChargeAtSeconds = now + this.chargeCooldownSeconds;
        }
    }

    private spawnChargeVFX(): void {
        const bossPos = this.getEntity().getPosition();
        const chargeVFX = new Entity("washington-charge-vfx");
        chargeVFX.addComponent("render", { type: "sphere", material: this.chargeMaterial });
        chargeVFX.setLocalScale(2.0, 2.0, 2.0);
        chargeVFX.setPosition(bossPos);
        this.getEntity().parent?.addChild(chargeVFX) ?? this.getEntity().addChild(chargeVFX);
        this.activeEffects.add(chargeVFX);

        const startMs = Date.now();
        const durationMs = 800;
        const tick = () => {
            const elapsed = Date.now() - startMs;
            if (elapsed >= durationMs || !chargeVFX.parent) { this.destroyEffect(chargeVFX); return; }
            const t = elapsed / durationMs;
            const scale = 2.0 + t * 2.0;
            chargeVFX.setLocalScale(scale, scale * 0.4, scale);
            const mat = chargeVFX.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
            if (mat) { mat.opacity = 0.85 * (1 - t); mat.update(); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // ── Valley Forge Winter ──
    private startValleyForge(_target: Entity, now: number): void {
        this.lastAttackType = "valleyForge";
        this.lastAttackAtSeconds = now;

        this.valleyForgeState = {
            endTimeSeconds: now + this.valleyForgeBlastCount * this.valleyForgeIntervalSeconds + 0.8,
            nextBlastAtSeconds: now,
            blastsSpawned: 0
        };
        this.attackLockUntilSeconds = this.valleyForgeState.endTimeSeconds;
    }

    private updateValleyForge(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.valleyForgeState;
        if (!state) return;

        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed * 0.5, dt);

        if (state.blastsSpawned < this.valleyForgeBlastCount && now >= state.nextBlastAtSeconds) {
            state.blastsSpawned++;
            state.nextBlastAtSeconds = now + this.valleyForgeIntervalSeconds;

            const angle = (state.blastsSpawned / this.valleyForgeBlastCount) * Math.PI * 2;
            const radius = 12 + Math.random() * 8;
            const blastPos = new Vec3(
                myPos.x + Math.cos(angle) * radius,
                myPos.y,
                myPos.z + Math.sin(angle) * radius
            );

            const blast = new Entity("washington-valley-forge-blast");
            blast.addComponent("render", { type: "sphere", material: this.valleyForgeMaterial });
            blast.setLocalScale(0.5, 0.5, 0.5);
            blast.setPosition(blastPos.x, blastPos.y + 2, blastPos.z);
            this.getEntity().parent?.addChild(blast) ?? this.getEntity().addChild(blast);
            this.activeEffects.add(blast);

            const snowflakeCount = 15;
            for (let i = 0; i < snowflakeCount; i++) {
                const snowflake = new Entity("washington-snowflake-" + i);
                snowflake.addComponent("render", { type: "sphere", material: this.snowMaterial });
                snowflake.setLocalScale(0.3, 0.3, 0.3);
                const offset = new Vec3(
                    (Math.random() - 0.5) * 6,
                    Math.random() * 8,
                    (Math.random() - 0.5) * 6
                );
                snowflake.setPosition(blastPos.x + offset.x, blastPos.y + offset.y, blastPos.z + offset.z);
                this.getEntity().parent?.addChild(snowflake) ?? this.getEntity().addChild(snowflake);
                this.activeEffects.add(snowflake);

                const snowStartMs = Date.now();
                const snowTick = () => {
                    const snowElapsed = Date.now() - snowStartMs;
                    if (snowElapsed >= 1200 || !snowflake.parent) { this.destroyEffect(snowflake); return; }
                    const t = snowElapsed / 1200;
                    snowflake.setPosition(
                        blastPos.x + offset.x * (1 - t),
                        blastPos.y + offset.y * (1 - t) - t * 4,
                        blastPos.z + offset.z * (1 - t)
                    );
                    const mat = snowflake.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                    if (mat) { mat.opacity = 0.6 * (1 - t); mat.update(); }
                    requestAnimationFrame(snowTick);
                };
                requestAnimationFrame(snowTick);
            }

            const startMs = Date.now();
            const durationMs = 1500;
            const tick = () => {
                const elapsed = Date.now() - startMs;
                if (elapsed >= durationMs || !blast.parent) { this.destroyEffect(blast); return; }
                const t = elapsed / durationMs;
                const scale = 0.5 + t * 3.0;
                blast.setLocalScale(scale, scale * 0.3, scale);
                const mat = blast.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                if (mat) { mat.opacity = 0.7 * (1 - t); mat.update(); }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);

            const dx = targetPos.x - blastPos.x;
            const dz = targetPos.z - blastPos.z;
            if (Math.sqrt(dx * dx + dz * dz) <= this.valleyForgeHitRadius) {
                this.applyDamage(this.valleyForgeDamage, onAttack);
            }
        }

        if (now >= state.endTimeSeconds) {
            this.valleyForgeState = null;
            this.nextValleyForgeAtSeconds = now + this.valleyForgeCooldownSeconds;
        }
    }

    // ── Cannon Barrage (Long Range Projectile Attack) ──
    private startCannonBarrage(_target: Entity, now: number): void {
        this.lastAttackType = "cannonBarrage";
        this.lastAttackAtSeconds = now;

        this.cannonBarrageState = {
            endTimeSeconds: now + this.cannonCount * this.cannonIntervalSeconds + 1.0,
            nextCannonAtSeconds: now,
            cannonsFired: 0
        };
        this.attackLockUntilSeconds = this.cannonBarrageState.endTimeSeconds;
    }

    private updateCannonBarrage(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.cannonBarrageState;
        if (!state) return;

        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed * 0.3, dt);

        if (state.cannonsFired < this.cannonCount && now >= state.nextCannonAtSeconds) {
            state.cannonsFired++;
            state.nextCannonAtSeconds = now + this.cannonIntervalSeconds;

            const spreadAngle = (state.cannonsFired - 1) / (this.cannonCount - 1) * Math.PI - Math.PI / 2;
            const aimDir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();
            const rotatedDir = new Vec3(
                aimDir.x * Math.cos(spreadAngle) - aimDir.z * Math.sin(spreadAngle),
                0,
                aimDir.x * Math.sin(spreadAngle) + aimDir.z * Math.cos(spreadAngle)
            );

            const cannonball = new Entity("washington-cannonball");
            cannonball.addComponent("render", { type: "sphere", material: this.cannonMaterial });
            cannonball.setLocalScale(1.5, 1.5, 1.5);
            const startPos = new Vec3(myPos.x, myPos.y + 2, myPos.z);
            cannonball.setPosition(startPos.x, startPos.y, startPos.z);
            this.getEntity().parent?.addChild(cannonball) ?? this.getEntity().addChild(cannonball);
            this.activeEffects.add(cannonball);

            const targetGroundPos = new Vec3(
                myPos.x + rotatedDir.x * this.cannonRange,
                myPos.y,
                myPos.z + rotatedDir.z * this.cannonRange
            );
            const startMs = Date.now();
            const durationMs = 1200;
            const tick = () => {
                const elapsed = Date.now() - startMs;
                if (elapsed >= durationMs || !cannonball.parent) {
                    this.spawnCannonExplosion(cannonball.getPosition(), onAttack);
                    this.destroyEffect(cannonball);
                    return;
                }
                const t = elapsed / durationMs;
                const arcHeight = 8 * Math.sin(t * Math.PI);
                cannonball.setPosition(
                    startPos.x + (targetGroundPos.x - startPos.x) * t,
                    startPos.y + arcHeight,
                    startPos.z + (targetGroundPos.z - startPos.z) * t
                );
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);

            const dx = targetPos.x - targetGroundPos.x;
            const dz = targetPos.z - targetGroundPos.z;
            if (Math.sqrt(dx * dx + dz * dz) <= this.cannonHitRadius) {
                this.applyDamage(this.cannonDamage, onAttack);
            }
        }

        if (now >= state.endTimeSeconds) {
            this.cannonBarrageState = null;
            this.nextCannonAtSeconds = now + this.cannonCooldownSeconds;
        }
    }

    private spawnCannonExplosion(pos: Vec3, _onAttack?: (attacker: npc) => void): void {
        const explosion = new Entity("washington-cannon-explosion");
        explosion.addComponent("render", { type: "sphere", material: this.cannonExplosionMaterial });
        explosion.setLocalScale(0.5, 0.5, 0.5);
        explosion.setPosition(pos.x, pos.y + 2, pos.z);
        this.getEntity().parent?.addChild(explosion) ?? this.getEntity().addChild(explosion);
        this.activeEffects.add(explosion);

        const startMs = Date.now();
        const durationMs = 600;
        const tick = () => {
            const elapsed = Date.now() - startMs;
            if (elapsed >= durationMs || !explosion.parent) { this.destroyEffect(explosion); return; }
            const t = elapsed / durationMs;
            const scale = 0.5 + t * 6.0;
            explosion.setLocalScale(scale, scale * 0.4, scale);
            const mat = explosion.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
            if (mat) { mat.opacity = 0.8 * (1 - t); mat.update(); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // ── Helpers ──
    private faceTarget(target: Entity, dt: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, 0, dt);
    }

    private getFlatDistanceTo(target: Entity): number {
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const dx = targetPos.x - myPos.x;
        const dz = targetPos.z - myPos.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    private applyDamage(damage: number, onAttack?: (attacker: npc) => void): void {
        if (this.onPlayerAttack) this.onPlayerAttack(this, damage);
        if (onAttack) onAttack(this);
    }

    private createEffectMaterial(emissiveColor: Color, diffuseColor: Color, emissiveIntensity: number, opacity: number): StandardMaterial {
        const mat = new StandardMaterial();
        mat.emissive = emissiveColor;
        mat.emissiveIntensity = emissiveIntensity;
        mat.diffuse = diffuseColor;
        mat.opacity = opacity;
        mat.blendType = BLEND_ADDITIVE;
        mat.cull = CULLFACE_NONE;
        mat.depthWrite = false;
        mat.update();
        return mat;
    }

    private destroyEffect(entity: Entity | null | undefined): void {
        if (!entity) return;
        this.activeEffects.delete(entity);
        if (entity.parent) entity.parent.removeChild(entity);
        entity.destroy();
    }

    private cleanupEffects(): void {
        for (const effect of this.activeEffects) {
            try { if (effect.parent) effect.parent.removeChild(effect); effect.destroy(); } catch { /* */ }
        }
        this.activeEffects.clear();
        this.libertyStrikeState = null;
        this.monumentState = null;
        this.chargeState = null;
        this.valleyForgeState = null;
        this.cannonBarrageState = null;
    }
}
