import { Boss } from "./boss";
import { Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color } from "playcanvas";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type CainAttackType = "cleave" | "jumpShockwave" | "shadowDash";
type AbelAttackType = "shield" | "lightningStrike" | "aerialPosition";
type CainAbelAttackType = CainAttackType | AbelAttackType;

interface CleaveState {
    endTimeSeconds: number;
    hasHit: boolean;
}

interface JumpShockwaveState {
    phase: "jumping" | "shockwave" | "shadowDash";
    jumpEndTimeSeconds: number;
    shockwaveEndTimeSeconds: number;
    shadowDashEndTimeSeconds: number;
    shadowDir: Vec3;
    hasJumpHit: boolean;
    hasDashHit: boolean;
}

interface ShieldState {
    endTimeSeconds: number;
}

interface LightningStrikeState {
    endTimeSeconds: number;
    hasStruck: boolean;
}

interface AerialPositionState {
    endTimeSeconds: number;
    hasRepositioned: boolean;
}

export class CainAndAbel extends Boss {
    // Cain: cleave weapon
    private readonly cleaveDamage = 20;
    private readonly cleaveRange = 4.5;
    private readonly cleaveCooldownSeconds = 3.5;
    private nextCleaveAtSeconds = 0;

    // Cain: jump + shockwave + shadow dash blind
    private readonly jumpDamage = 16;
    private readonly jumpShockwaveRadius = 8;
    private readonly shadowDashSpeed = PLAYER_MOVE_SPEED * 3.0;
    private readonly shadowDashDurationSeconds = 0.4;
    private readonly shadowDashDamage = 10;
    private readonly shadowDashHitRadius = 3.0;
    private readonly jumpCooldownSeconds = 8.0;
    private nextJumpAtSeconds = 0;

    // Abel: shield
    private readonly shieldCooldownSeconds = 6.0;
    private readonly shieldDurationSeconds = 1.5;
    private nextShieldAtSeconds = 0;

    // Abel: lightning strike
    private readonly lightningDamage = 18;
    private readonly lightningRange = 25;
    private readonly lightningHitRadius = 3.5;
    private readonly lightningCooldownSeconds = 5.0;
    private nextLightningAtSeconds = 0;

    // Abel: aerial position (reposition + quick attack)
    private readonly aerialDamage = 8;
    private readonly aerialCooldownSeconds = 4.0;
    private readonly aerialRange = 20;
    private nextAerialAtSeconds = 0;

    // Runtime state
    private attackLockUntilSeconds = 0;
    private lastAttackType: CainAbelAttackType | null = null;
    private lastAttackAtSeconds = -Infinity;
    private cleaveState: CleaveState | null = null;
    private jumpShockwaveState: JumpShockwaveState | null = null;
    private shieldState: ShieldState | null = null;
    private lightningState: LightningStrikeState | null = null;
    private aerialState: AerialPositionState | null = null;
    private onPlayerAttack?: (attacker: npc, damage: number) => void;

    // VFX materials
    private readonly cleaveMaterial = this.createEffectMaterial(
        new Color(0.6, 0.1, 0.1), new Color(0.8, 0.2, 0.2), 3.5, 0.8
    );
    private readonly shadowMaterial = this.createEffectMaterial(
        new Color(0.15, 0.05, 0.2), new Color(0.3, 0.1, 0.4), 4.0, 0.85
    );
    private readonly shockwaveMaterial = this.createEffectMaterial(
        new Color(0.5, 0.2, 0.1), new Color(0.7, 0.3, 0.15), 3.0, 0.7
    );
    private readonly shieldMaterial = this.createEffectMaterial(
        new Color(0.9, 0.9, 1), new Color(1, 1, 1), 3.0, 0.6
    );
    private readonly lightningMaterial = this.createEffectMaterial(
        new Color(0.7, 0.8, 1), new Color(0.9, 0.95, 1), 6.0, 0.95
    );
    private readonly lightningRingMaterial = this.createEffectMaterial(
        new Color(0.4, 0.5, 1), new Color(0.6, 0.7, 1), 3.0, 0.5
    );

    private readonly activeEffects = new Set<Entity>();

    constructor(id: number, maxHealth: number, entity: Entity = new Entity("Cain & Abel")) {
        super(id, maxHealth, entity, "Cain & Abel");
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.2;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.65;

        this.setIntroTaunt("Am I my brother's keeper?", "Am I my brother's keeper?");
        this.setIntroNameTranslation("קין והבל", "Cain & Abel");
        this.setTauntSet({
            highHealth: [
                "The firstborn and the favored son.",
                "Cain strikes. Abel shields.",
                "Two brothers, one fate."
            ],
            bossLowPlayerHigh: [
                "The mark of Cain burns bright!",
                "Abel's light shall not be extinguished!",
                "Brotherly bonds forged in battle!"
            ],
            playerLowBossHigh: [
                "Cain's wrath is upon you.",
                "Abel's judgment is swift.",
                "The first murder echoes through time."
            ],
            bothLow: [
                "Two souls, one last stand!",
                "The curse and the blessing, united!"
            ],
            death: [
                "The blood… cries from the ground…",
                "Brother… forgive me."
            ],
            bossDeath: [
                "The first conflict… ends.",
                "Two brothers… fall as one."
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

        if (this.cleaveState) { this.updateCleave(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.jumpShockwaveState) { this.updateJumpShockwave(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.shieldState) { this.updateShield(dt, targetEntity, currentTimeSeconds); return; }
        if (this.lightningState) { this.updateLightning(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.aerialState) { this.updateAerial(dt, targetEntity, currentTimeSeconds, onAttack); return; }

        if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

        const distance = this.getFlatDistanceTo(targetEntity);
        const chosen = this.pickNextAttack(distance, currentTimeSeconds);
        if (chosen === "cleave") { this.startCleave(currentTimeSeconds); return; }
        if (chosen === "jumpShockwave") { this.startJumpShockwave(targetEntity, currentTimeSeconds); return; }
        if (chosen === "shield") { this.startShield(currentTimeSeconds); return; }
        if (chosen === "lightningStrike") { this.startLightning(targetEntity, currentTimeSeconds); return; }
        if (chosen === "aerialPosition") { this.startAerial(currentTimeSeconds); return; }

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
        return { ...base, attackDamage: this.cleaveDamage, attackRange: this.cleaveRange, attackCooldown: this.cleaveCooldownSeconds, detectionRange: Number.MAX_VALUE };
    }

    // ── Attack selection ──
    private pickNextAttack(distance: number, now: number): CainAbelAttackType | null {
        const choices: Array<{ type: CainAbelAttackType; score: number }> = [];
        // Cain attacks
        if (now >= this.nextCleaveAtSeconds && distance <= this.cleaveRange) {
            choices.push({ type: "cleave", score: 1.3 });
        }
        if (now >= this.nextJumpAtSeconds && distance >= 4 && distance <= 22) {
            choices.push({ type: "jumpShockwave", score: 1.2 });
        }
        // Abel attacks
        if (now >= this.nextShieldAtSeconds) {
            choices.push({ type: "shield", score: 0.8 });
        }
        if (now >= this.nextLightningAtSeconds && distance <= this.lightningRange) {
            choices.push({ type: "lightningStrike", score: 1.1 + (distance / Math.max(0.001, this.lightningRange)) });
        }
        if (now >= this.nextAerialAtSeconds && distance <= this.aerialRange) {
            choices.push({ type: "aerialPosition", score: 0.9 });
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

    // ── Cain: Cleave ──
    private startCleave(now: number): void {
        this.lastAttackType = "cleave"; this.lastAttackAtSeconds = now;
        this.cleaveState = { endTimeSeconds: now + 0.6, hasHit: false };
        this.attackLockUntilSeconds = this.cleaveState.endTimeSeconds;
    }

    private updateCleave(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.cleaveState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
        if (!state.hasHit && now >= state.endTimeSeconds - 0.15) {
            state.hasHit = true;
            // Cleave arc VFX
            const myPos = this.getEntity().getPosition();
            const arc = new Entity("cain-cleave-arc");
            arc.addComponent("render", { type: "torus", material: this.cleaveMaterial });
            arc.setLocalScale(this.cleaveRange, this.cleaveRange * 0.2, this.cleaveRange);
            arc.setPosition(myPos.x, myPos.y + 0.5, myPos.z);
            this.getEntity().parent?.addChild(arc) ?? this.getEntity().addChild(arc);
            this.activeEffects.add(arc);
            const startMs = Date.now(); const durationMs = 350;
            const tick = () => {
                const elapsed = Date.now() - startMs;
                if (elapsed >= durationMs) { this.destroyEffect(arc); return; }
                const mat = arc.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                if (mat) { mat.opacity = 0.8 * (1 - elapsed / durationMs); mat.update(); }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);

            if (this.getFlatDistanceTo(target) <= this.cleaveRange) {
                this.applyDamage(this.cleaveDamage, onAttack);
            }
        }
        if (now >= state.endTimeSeconds) { this.cleaveState = null; this.nextCleaveAtSeconds = now + this.cleaveCooldownSeconds; }
    }

    // ── Cain: Jump + Shockwave + Shadow dash ──
    private startJumpShockwave(target: Entity, now: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) return; dir.normalize();
        this.lastAttackType = "jumpShockwave"; this.lastAttackAtSeconds = now;
        this.jumpShockwaveState = {
            phase: "jumping",
            jumpEndTimeSeconds: now + 0.5,
            shockwaveEndTimeSeconds: now + 0.5 + 0.4,
            shadowDashEndTimeSeconds: now + 0.5 + 0.4 + this.shadowDashDurationSeconds,
            shadowDir: dir,
            hasJumpHit: false,
            hasDashHit: false
        };
        this.attackLockUntilSeconds = this.jumpShockwaveState.shadowDashEndTimeSeconds + 0.3;
    }

    private updateJumpShockwave(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.jumpShockwaveState; if (!state) return;

        if (state.phase === "jumping") {
        	{
        		const myPos = this.getEntity().getPosition();
        		const targetPos = target.getPosition();
        		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
        	}
            if (now >= state.jumpEndTimeSeconds) {
                state.phase = "shockwave";
                // Shockwave ring
                const myPos = this.getEntity().getPosition();
                this.spawnRingEffect(myPos, this.jumpShockwaveRadius, 500, this.shockwaveMaterial, "cain-shockwave", 0.8);
                if (!state.hasJumpHit && this.getFlatDistanceTo(target) <= this.jumpShockwaveRadius) {
                    state.hasJumpHit = true;
                    this.applyDamage(this.jumpDamage, onAttack);
                }
            }
        } else if (state.phase === "shockwave") {
            if (now >= state.shockwaveEndTimeSeconds) {
                state.phase = "shadowDash";
            }
        } else if (state.phase === "shadowDash") {
            this.moveToward(state.shadowDir.x, state.shadowDir.z, this.shadowDashSpeed, dt);
            // Shadow trail VFX
            const myPos = this.getEntity().getPosition();
            const trail = new Entity("cain-shadow-trail");
            trail.addComponent("render", { type: "sphere", material: this.shadowMaterial });
            trail.setLocalScale(1.5, 1.5, 1.5);
            trail.setPosition(myPos.x, myPos.y + 0.5, myPos.z);
            this.getEntity().parent?.addChild(trail) ?? this.getEntity().addChild(trail);
            this.activeEffects.add(trail);
            const startMs = Date.now(); const durationMs = 300;
            const tick = () => {
                const elapsed = Date.now() - startMs;
                if (elapsed >= durationMs) { this.destroyEffect(trail); return; }
                const mat = trail.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                if (mat) { mat.opacity = 0.7 * (1 - elapsed / durationMs); mat.update(); }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);

            if (!state.hasDashHit && this.getFlatDistanceTo(target) <= this.shadowDashHitRadius) {
                state.hasDashHit = true;
                this.applyDamage(this.shadowDashDamage, onAttack);
            }

            if (now >= state.shadowDashEndTimeSeconds) {
                this.jumpShockwaveState = null;
                this.nextJumpAtSeconds = now + this.jumpCooldownSeconds;
            }
        }
    }

    // ── Abel: Shield ──
    private startShield(now: number): void {
        this.lastAttackType = "shield"; this.lastAttackAtSeconds = now;
        const myPos = this.getEntity().getPosition();
        const shield = new Entity("abel-shield");
        shield.addComponent("render", { type: "sphere", material: this.shieldMaterial });
        shield.setLocalScale(5, 5, 5);
        shield.setPosition(myPos.x, myPos.y + 1, myPos.z);
        this.getEntity().addChild(shield);
        this.activeEffects.add(shield);
        this.shieldState = { endTimeSeconds: now + this.shieldDurationSeconds };
        this.attackLockUntilSeconds = now + 0.5;
    }

    private updateShield(dt: number, target: Entity, now: number): void {
    	const state = this.shieldState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
        if (now >= state.endTimeSeconds) {
            this.shieldState = null;
            this.nextShieldAtSeconds = now + this.shieldCooldownSeconds;
        }
    }

    // ── Abel: Lightning strike ──
    private startLightning(target: Entity, now: number): void {
        this.lastAttackType = "lightningStrike"; this.lastAttackAtSeconds = now;
        const targetPos = target.getPosition();
        // Telegraph ring
        this.spawnRingEffect(targetPos, this.lightningHitRadius, 400, this.lightningRingMaterial, "abel-lightning-ring", 0.6);
        this.lightningState = { endTimeSeconds: now + 0.6, hasStruck: false };
        this.attackLockUntilSeconds = this.lightningState.endTimeSeconds;
    }

    private updateLightning(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.lightningState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
        if (!state.hasStruck && now >= state.endTimeSeconds - 0.1) {
            state.hasStruck = true;
            const targetPos = target.getPosition();
            // Lightning bolt VFX
            const bolt = new Entity("abel-lightning-bolt");
            bolt.addComponent("render", { type: "cylinder", material: this.lightningMaterial });
            bolt.setLocalScale(0.5, 20, 0.5);
            bolt.setPosition(targetPos.x, targetPos.y + 10, targetPos.z);
            this.getEntity().parent?.addChild(bolt) ?? this.getEntity().addChild(bolt);
            this.activeEffects.add(bolt);
            const startMs = Date.now(); const durationMs = 350;
            const tick = () => {
                const elapsed = Date.now() - startMs;
                if (elapsed >= durationMs) { this.destroyEffect(bolt); return; }
                const mat = bolt.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                if (mat) { mat.opacity = 0.95 * (1 - elapsed / durationMs); mat.update(); }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);

            if (this.getFlatDistanceTo(target) <= this.lightningHitRadius) {
                this.applyDamage(this.lightningDamage, onAttack);
            }
        }
        if (now >= state.endTimeSeconds) { this.lightningState = null; this.nextLightningAtSeconds = now + this.lightningCooldownSeconds; }
    }

    // ── Abel: Aerial position ──
    private startAerial(now: number): void {
        this.lastAttackType = "aerialPosition"; this.lastAttackAtSeconds = now;
        this.aerialState = { endTimeSeconds: now + 0.8, hasRepositioned: false };
        this.attackLockUntilSeconds = this.aerialState.endTimeSeconds;
    }

    private updateAerial(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.aerialState; if (!state) return;
        if (!state.hasRepositioned) {
            state.hasRepositioned = true;
            // Quick reposition to side of target
            const myPos = this.getEntity().getPosition();
            const targetPos = target.getPosition();
            const side = Math.random() > 0.5 ? 1 : -1;
            const offset = new Vec3((targetPos.z - myPos.z) * side * 0.8, 0, -(targetPos.x - myPos.x) * side * 0.8);
            const newPos = new Vec3(targetPos.x + offset.x, myPos.y, targetPos.z + offset.z);
            this.getEntity().setPosition(newPos.x, newPos.y, newPos.z);
            this.applyDamage(this.aerialDamage, onAttack);
            }
            {
            	const myPos = this.getEntity().getPosition();
            	const targetPos = target.getPosition();
            	this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
            }
        if (now >= state.endTimeSeconds) { this.aerialState = null; this.nextAerialAtSeconds = now + this.aerialCooldownSeconds; }
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
        this.activeEffects.clear(); this.cleaveState = null; this.jumpShockwaveState = null;
        this.shieldState = null; this.lightningState = null; this.aerialState = null;
    }
}
