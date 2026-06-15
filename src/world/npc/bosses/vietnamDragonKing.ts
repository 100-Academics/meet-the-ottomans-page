import { Boss } from "./boss";
import { Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color } from "playcanvas";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type DragonAttackType = "waterBeam" | "dash" | "thunder";

interface WaterBeamState {
    endTimeSeconds: number;
    hasHit: boolean;
    beamRoot?: Entity | null;
}

interface DashState {
    endTimeSeconds: number;
    direction: Vec3;
    hasHit: boolean;
}

interface ThunderState {
    endTimeSeconds: number;
    nextStrikeAtSeconds: number;
    strikesFired: number;
}

export class VietnamDragonKing extends Boss {
    // Water beam with knockback
    private readonly waterBeamDamage = 16;
    private readonly waterBeamCooldownSeconds = 5.0;
    private readonly waterBeamRange = 30;
    private readonly waterBeamDurationSeconds = 1.2;
    private readonly waterBeamHitRadius = 3.5;
    private nextWaterBeamAtSeconds = 0;

    // Dash attack
    private readonly dashSpeed = PLAYER_MOVE_SPEED * 2.8;
    private readonly dashDurationSeconds = 0.45;
    private readonly dashDamage = 12;
    private readonly dashCooldownSeconds = 4.5;
    private readonly dashRangeMin = 5;
    private readonly dashRangeMax = 22;
    private readonly dashHitRadius = 3.0;
    private nextDashAtSeconds = 0;

    // Thunder
    private readonly thunderDamage = 14;
    private readonly thunderCount = 3;
    private readonly thunderIntervalSeconds = 0.35;
    private readonly thunderCooldownSeconds = 7.0;
    private readonly thunderRange = 28;
    private readonly thunderHitRadius = 3.0;
    private nextThunderAtSeconds = 0;

    // Runtime state
    private attackLockUntilSeconds = 0;
    private lastAttackType: DragonAttackType | null = null;
    private lastAttackAtSeconds = -Infinity;
    private waterBeamState: WaterBeamState | null = null;
    private dashState: DashState | null = null;
    private thunderState: ThunderState | null = null;
    private onPlayerAttack?: (attacker: npc, damage: number) => void;

    // VFX materials
    private readonly waterMaterial = this.createEffectMaterial(
        new Color(0.1, 0.4, 0.9), new Color(0.2, 0.6, 1), 4.0, 0.8
    );
    private readonly thunderMaterial = this.createEffectMaterial(
        new Color(0.9, 0.9, 1), new Color(1, 1, 1), 6.0, 0.95
    );
    private readonly thunderRingMaterial = this.createEffectMaterial(
        new Color(0.5, 0.5, 1), new Color(0.7, 0.7, 1), 3.5, 0.6
    );

    private readonly activeEffects = new Set<Entity>();

    constructor(id: number, maxHealth: number, entity: Entity = new Entity("Vietnam Dragon King")) {
        super(id, maxHealth, entity, "Vietnam Dragon King");
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.3;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.7;

        this.setIntroTaunt("Rồng thiêng tỉnh giấc!", "The sacred dragon awakens!");
        this.setIntroNameTranslation("Lạc Long Quân", "Dragon Lord of Lạc");
        this.setTauntSet({
            highHealth: [
                "The waters of the Mekong answer to me.",
                "You dare challenge the Dragon King?",
                "The storm obeys my command."
            ],
            bossLowPlayerHigh: [
                "The dragon's fury is unleashed!",
                "The rivers rise against you!",
                "I am the lord of storms and tides!"
            ],
            playerLowBossHigh: [
                "Bow before the Dragon King.",
                "The sea swallows all who oppose me.",
                "Your strength is but a ripple."
            ],
            bothLow: [
                "The dragon fights with its last breath!",
                "Storm and sea, answer my call!"
            ],
            death: [
                "The waters… recede…",
                "The dragon returns to the deep."
            ],
            bossDeath: [
                "The storm… fades.",
                "The river… flows on without me."
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

        if (this.waterBeamState) { this.updateWaterBeam(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.dashState) { this.updateDash(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.thunderState) { this.updateThunder(dt, targetEntity, currentTimeSeconds, onAttack); return; }

        if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

        const distance = this.getFlatDistanceTo(targetEntity);
        const chosen = this.pickNextAttack(distance, currentTimeSeconds);
        if (chosen === "waterBeam") { this.startWaterBeam(targetEntity, currentTimeSeconds); return; }
        if (chosen === "dash") { this.startDash(targetEntity, currentTimeSeconds); return; }
        if (chosen === "thunder") { this.startThunder(currentTimeSeconds); return; }

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
        return { ...base, attackDamage: this.waterBeamDamage, attackRange: this.waterBeamRange, attackCooldown: this.waterBeamCooldownSeconds, detectionRange: Number.MAX_VALUE };
    }

    // ── Attack selection ──
    private pickNextAttack(distance: number, now: number): DragonAttackType | null {
        const choices: Array<{ type: DragonAttackType; score: number }> = [];
        if (now >= this.nextWaterBeamAtSeconds && distance <= this.waterBeamRange) {
            choices.push({ type: "waterBeam", score: 1.2 + (distance / Math.max(0.001, this.waterBeamRange)) });
        }
        if (now >= this.nextDashAtSeconds && distance >= this.dashRangeMin && distance <= this.dashRangeMax) {
            choices.push({ type: "dash", score: 1.1 });
        }
        if (now >= this.nextThunderAtSeconds && distance <= this.thunderRange) {
            const closeness = 1 - Math.min(1, distance / Math.max(0.001, this.thunderRange));
            choices.push({ type: "thunder", score: 1.0 + closeness });
        }
        if (choices.length === 0) return null;
        if (this.lastAttackType && (now - this.lastAttackAtSeconds) < 1.8) {
            for (const c of choices) { if (c.type === this.lastAttackType) c.score *= 0.55; }
        }
        let best = choices[0];
        for (let i = 1; i < choices.length; i++) { if (choices[i].score > best.score) best = choices[i]; }
        const tied = choices.filter(c => Math.abs(c.score - best.score) < 0.05);
        if (tied.length > 1) return tied[Math.floor(Math.random() * tied.length)].type;
        return best.type;
    }

    // ── Water beam ──
    private startWaterBeam(target: Entity, now: number): void {
        this.lastAttackType = "waterBeam"; this.lastAttackAtSeconds = now;
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();

        const beamRoot = new Entity("dragon-water-beam");
        beamRoot.setPosition(myPos.x, myPos.y + 1, myPos.z);
        this.getEntity().addChild(beamRoot);
        this.activeEffects.add(beamRoot);

        // Create beam cylinder
        const beam = new Entity("dragon-water-beam-cyl");
        beam.addComponent("render", { type: "cylinder", material: this.waterMaterial });
        beam.setLocalScale(this.waterBeamHitRadius * 2, 0.5, this.waterBeamHitRadius * 2);
        const yaw = Math.atan2(dir.x, dir.z) * 180 / Math.PI;
        beam.setLocalEulerAngles(0, yaw, 90);
        beam.setPosition(dir.x * 5, 0, dir.z * 5);
        beamRoot.addChild(beam);
        this.activeEffects.add(beam);

        this.waterBeamState = { endTimeSeconds: now + this.waterBeamDurationSeconds, hasHit: false, beamRoot };
        this.attackLockUntilSeconds = this.waterBeamState.endTimeSeconds + 0.3;
    }

    private updateWaterBeam(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.waterBeamState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}

        // Extend beam over time
        if (state.beamRoot) {
            const beam = state.beamRoot.children[0];
            if (beam) {
                const progress = Math.min(1, (now - (state.endTimeSeconds - this.waterBeamDurationSeconds)) / (this.waterBeamDurationSeconds * 0.5));
                beam.setLocalScale(this.waterBeamHitRadius * 2, 0.5 + progress * 15, this.waterBeamHitRadius * 2);
            }
        }

        if (!state.hasHit && this.getFlatDistanceTo(target) <= this.waterBeamRange) {
            state.hasHit = true;
            this.applyDamage(this.waterBeamDamage, onAttack);
        }

        if (now >= state.endTimeSeconds) {
            this.destroyEffect(state.beamRoot);
            this.waterBeamState = null;
            this.nextWaterBeamAtSeconds = now + this.waterBeamCooldownSeconds;
        }
    }

    // ── Dash attack ──
    private startDash(target: Entity, now: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) return; dir.normalize();
        this.lastAttackType = "dash"; this.lastAttackAtSeconds = now;
        this.dashState = { endTimeSeconds: now + this.dashDurationSeconds, direction: dir, hasHit: false };
        this.attackLockUntilSeconds = this.dashState.endTimeSeconds + 0.3;
    }

    private updateDash(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.dashState; if (!state) return;
        this.moveToward(state.direction.x, state.direction.z, this.dashSpeed, dt);

        if (!state.hasHit && this.getFlatDistanceTo(target) <= this.dashHitRadius) {
            state.hasHit = true;
            this.applyDamage(this.dashDamage, onAttack);
        }

        if (now >= state.endTimeSeconds) {
            this.dashState = null;
            this.nextDashAtSeconds = now + this.dashCooldownSeconds;
        }
    }

    // ── Thunder ──
    private startThunder(now: number): void {
        this.lastAttackType = "thunder"; this.lastAttackAtSeconds = now;
        this.thunderState = { endTimeSeconds: now + this.thunderCount * this.thunderIntervalSeconds + 0.3, nextStrikeAtSeconds: now, strikesFired: 0 };
        this.attackLockUntilSeconds = this.thunderState.endTimeSeconds;
    }

    private updateThunder(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.thunderState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}

        if (state.strikesFired < this.thunderCount && now >= state.nextStrikeAtSeconds) {
            state.strikesFired++; state.nextStrikeAtSeconds = now + this.thunderIntervalSeconds;
            const targetPos = target.getPosition();
            const offsetX = (Math.random() - 0.5) * 4;
            const offsetZ = (Math.random() - 0.5) * 4;
            const strikePos = new Vec3(targetPos.x + offsetX, targetPos.y, targetPos.z + offsetZ);

            // Telegraph ring
            this.spawnRingEffect(strikePos, this.thunderHitRadius, 300, this.thunderRingMaterial, "dragon-thunder-ring", 0.7);

            // Lightning bolt VFX
            const bolt = new Entity("dragon-thunder-bolt");
            bolt.addComponent("render", { type: "cylinder", material: this.thunderMaterial });
            bolt.setLocalScale(0.4, 15, 0.4);
            bolt.setPosition(strikePos.x, strikePos.y + 8, strikePos.z);
            this.getEntity().parent?.addChild(bolt) ?? this.getEntity().addChild(bolt);
            this.activeEffects.add(bolt);
            const startMs = Date.now(); const durationMs = 400;
            const tick = () => {
                const elapsed = Date.now() - startMs;
                if (elapsed >= durationMs) { this.destroyEffect(bolt); return; }
                const mat = bolt.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                if (mat) { mat.opacity = 0.95 * (1 - elapsed / durationMs); mat.update(); }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);

            // Check hit
            const dx = targetPos.x - strikePos.x;
            const dz = targetPos.z - strikePos.z;
            if (Math.sqrt(dx * dx + dz * dz) <= this.thunderHitRadius) {
                this.applyDamage(this.thunderDamage, onAttack);
            }
        }

        if (now >= state.endTimeSeconds) {
            this.thunderState = null;
            this.nextThunderAtSeconds = now + this.thunderCooldownSeconds;
        }
    }

    // ── Helpers ──
    private faceTarget(target: Entity, dt: number): void {
        const myPos = this.getEntity().getPosition(); const targetPos = target.getPosition();
        this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, 0, dt);
    }

    private getFlatDistanceTo(target: Entity): number {
        const myPos = this.getEntity().getPosition(); const targetPos = target.getPosition();
        const dx = targetPos.x - myPos.x; const dz = targetPos.z - myPos.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    private applyDamage(damage: number, onAttack?: (attacker: npc) => void): void {
        if (this.onPlayerAttack) this.onPlayerAttack(this, damage);
        if (onAttack) onAttack(this);
    }

    private createEffectMaterial(emissiveColor: Color, diffuseColor: Color, emissiveIntensity: number, opacity: number): StandardMaterial {
        const mat = new StandardMaterial();
        mat.emissive = emissiveColor; mat.emissiveIntensity = emissiveIntensity;
        mat.diffuse = diffuseColor; mat.opacity = opacity;
        mat.blendType = BLEND_ADDITIVE; mat.cull = CULLFACE_NONE; mat.depthWrite = false;
        mat.update(); return mat;
    }

    private spawnRingEffect(origin: Vec3, radius: number, durationMs: number, material: StandardMaterial, name: string, opacity: number): void {
        const ring = new Entity(name);
        ring.addComponent("render", { type: "torus", material });
        ring.setPosition(origin.x, origin.y + 0.1, origin.z);
        ring.setLocalScale(radius, radius * 0.15, radius);
        this.getEntity().parent?.addChild(ring) ?? this.getEntity().addChild(ring);
        this.activeEffects.add(ring);
        const startMs = Date.now();
        const tick = () => {
            const elapsed = Date.now() - startMs;
            if (elapsed >= durationMs) { this.destroyEffect(ring); return; }
            const mat = ring.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
            if (mat) { mat.opacity = opacity * (1 - elapsed / durationMs); mat.update(); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    private destroyEffect(entity: Entity | null | undefined): void {
        if (!entity) return; this.activeEffects.delete(entity);
        if (entity.parent) entity.parent.removeChild(entity); entity.destroy();
    }

    private cleanupEffects(): void {
        for (const effect of this.activeEffects) { try { if (effect.parent) effect.parent.removeChild(effect); effect.destroy(); } catch { /* */ } }
        this.activeEffects.clear(); this.waterBeamState = null; this.dashState = null; this.thunderState = null;
    }
}
