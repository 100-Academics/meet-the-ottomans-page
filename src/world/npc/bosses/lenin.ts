import { Boss } from "./boss";
import { Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color } from "playcanvas";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type LeninAttackType = "hammerAndSickle" | "summonWinter" | "summonRedSoldiers";

interface HammerAndSickleState {
    endTimeSeconds: number;
    phase: "hammer" | "sickle";
    hasHammerHit: boolean;
    hasSickleHit: boolean;
}

interface SummonWinterState {
    endTimeSeconds: number;
    hasApplied: boolean;
}

interface SummonRedSoldiersState {
    endTimeSeconds: number;
    hasSpawned: boolean;
}

export class Lenin extends Boss {
    // Hammer & sickle throw
    private readonly hammerDamage = 15;
    private readonly sickleDamage = 12;
    private readonly hammerSickleCooldownSeconds = 4.0;
    private readonly hammerSickleRange = 20;
    private readonly hammerHitRadius = 3.0;
    private readonly sickleHitRadius = 2.5;
    private nextHammerSickleAtSeconds = 0;

    // Summon winter (player slower, boss faster)
    private readonly winterDurationSeconds = 5.0;
    private readonly winterCooldownSeconds = 10.0;
    private readonly winterRange = 30;
    private readonly winterBossSpeedMultiplier = 1.4;
    private nextWinterAtSeconds = 0;
    private winterActive = false;
    private winterEndTimeSeconds = 0;

    // Summon red soldiers
    private readonly redSoldierDamage = 8;
    private readonly redSoldierCooldownSeconds = 8.0;
    private readonly redSoldierRange = 25;
    private readonly redSoldierCount = 3;
    private nextRedSoldiersAtSeconds = 0;

    // Runtime state
    private attackLockUntilSeconds = 0;
    private lastAttackType: LeninAttackType | null = null;
    private lastAttackAtSeconds = -Infinity;
    private hammerSickleState: HammerAndSickleState | null = null;
    private winterState: SummonWinterState | null = null;
    private redSoldiersState: SummonRedSoldiersState | null = null;
    private onPlayerAttack?: (attacker: npc, damage: number) => void;

    // VFX materials
    private readonly hammerMaterial = this.createEffectMaterial(
        new Color(0.7, 0.3, 0.1), new Color(0.9, 0.4, 0.15), 3.5, 0.85
    );
    private readonly sickleMaterial = this.createEffectMaterial(
        new Color(0.8, 0.15, 0.1), new Color(1, 0.25, 0.15), 4.0, 0.9
    );
    private readonly winterMaterial = this.createEffectMaterial(
        new Color(0.7, 0.85, 1), new Color(0.85, 0.95, 1), 3.0, 0.5
    );
    private readonly redSoldierMaterial = this.createEffectMaterial(
        new Color(0.8, 0.1, 0.1), new Color(1, 0.2, 0.2), 3.0, 0.8
    );
    private readonly winterRingMaterial = this.createEffectMaterial(
        new Color(0.5, 0.7, 1), new Color(0.7, 0.85, 1), 2.5, 0.4
    );

    private readonly activeEffects = new Set<Entity>();

    constructor(id: number, maxHealth: number, entity: Entity = new Entity("Lenin")) {
        super(id, maxHealth, entity, "Lenin");
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.15;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.6;

        this.setIntroTaunt("Пролетарии всех стран, соединяйтесь!", "Workers of the world, unite!");
        this.setIntroNameTranslation("Владимир Ильич Ленин", "Vladimir Ilyich Lenin");
        this.setTauntSet({
            highHealth: [
                "The revolution comes for you.",
                "History is on our side.",
                "The proletariat will prevail."
            ],
            bossLowPlayerHigh: [
                "The winter of revolution freezes your advance!",
                "The red tide rises!",
                "You cannot stop the march of history!"
            ],
            playerLowBossHigh: [
                "Your bourgeois resistance is futile.",
                "The state will wither away… but not today.",
                "Capital falls."
            ],
            bothLow: [
                "The revolution demands sacrifice!",
                "For the motherland!"
            ],
            death: [
                "The revolution… continues without me…",
                "I have fulfilled my historical role."
            ],
            bossDeath: [
                "The vanguard… falls.",
                "The party… will endure."
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

        // Update winter state
        if (this.winterActive && currentTimeSeconds >= this.winterEndTimeSeconds) {
            this.winterActive = false;
            this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.15;
        }

        if (!targetEntity) { super.updateAI(dt, targetEntity, currentTimeSeconds, onAttack, profileOverride); return; }

        if (this.hammerSickleState) { this.updateHammerSickle(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.winterState) { this.updateWinter(dt, targetEntity, currentTimeSeconds); return; }
        if (this.redSoldiersState) { this.updateRedSoldiers(dt, targetEntity, currentTimeSeconds, onAttack); return; }

        if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

        const distance = this.getFlatDistanceTo(targetEntity);
        const chosen = this.pickNextAttack(distance, currentTimeSeconds);
        if (chosen === "hammerAndSickle") { this.startHammerSickle(targetEntity, currentTimeSeconds); return; }
        if (chosen === "summonWinter") { this.startWinter(currentTimeSeconds); return; }
        if (chosen === "summonRedSoldiers") { this.startRedSoldiers(targetEntity, currentTimeSeconds); return; }

        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const speed = this.winterActive ? this.aiConfig.chaseMoveSpeed : PLAYER_MOVE_SPEED * 1.15;
        this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, speed, dt);
    }

    public override kill(): boolean {
        const didKill = super.kill();
        if (didKill) this.cleanupEffects();
        return didKill;
    }

    protected override getCombatProfile() {
        const base = super.getCombatProfile();
        return { ...base, attackDamage: this.hammerDamage, attackRange: this.hammerSickleRange, attackCooldown: this.hammerSickleCooldownSeconds, detectionRange: Number.MAX_VALUE };
    }

    // ── Attack selection ──
    private pickNextAttack(distance: number, now: number): LeninAttackType | null {
        const choices: Array<{ type: LeninAttackType; score: number }> = [];
        if (now >= this.nextHammerSickleAtSeconds && distance <= this.hammerSickleRange) {
            choices.push({ type: "hammerAndSickle", score: 1.2 });
        }
        if (now >= this.nextWinterAtSeconds && distance <= this.winterRange && !this.winterActive) {
            choices.push({ type: "summonWinter", score: 1.4 });
        }
        if (now >= this.nextRedSoldiersAtSeconds && distance <= this.redSoldierRange) {
            choices.push({ type: "summonRedSoldiers", score: 1.0 });
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

    // ── Hammer & sickle ──
    private startHammerSickle(_target: Entity, now: number): void {
        this.lastAttackType = "hammerAndSickle"; this.lastAttackAtSeconds = now;
        this.hammerSickleState = { endTimeSeconds: now + 1.2, phase: "hammer", hasHammerHit: false, hasSickleHit: false };
        this.attackLockUntilSeconds = this.hammerSickleState.endTimeSeconds;
    }

    private updateHammerSickle(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.hammerSickleState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();

        if (state.phase === "hammer" && !state.hasHammerHit) {
            state.hasHammerHit = true;
            // Hammer projectile VFX
            const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z).normalize();
            const hammer = new Entity("lenin-hammer");
            hammer.addComponent("render", { type: "box", material: this.hammerMaterial });
            hammer.setLocalScale(1.5, 1.5, 3.0);
            hammer.setPosition(myPos.x + dir.x * 3, myPos.y + 1.2, myPos.z + dir.z * 3);
            const yaw = Math.atan2(dir.x, dir.z) * 180 / Math.PI;
            hammer.setLocalEulerAngles(0, yaw, 0);
            this.getEntity().parent?.addChild(hammer) ?? this.getEntity().addChild(hammer);
            this.activeEffects.add(hammer);

            // Animate hammer forward
            const startPos = hammer.getPosition().clone();
            const endPos = new Vec3(myPos.x + dir.x * 15, myPos.y + 1.2, myPos.z + dir.z * 15);
            const startMs = Date.now(); const durationMs = 500;
            const tick = () => {
                const elapsed = Date.now() - startMs;
                const t = Math.min(1, elapsed / durationMs);
                hammer.setPosition(
                    startPos.x + (endPos.x - startPos.x) * t,
                    startPos.y,
                    startPos.z + (endPos.z - startPos.z) * t
                );
                if (elapsed >= durationMs) { this.destroyEffect(hammer); return; }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);

            if (this.getFlatDistanceTo(target) <= this.hammerHitRadius) {
                this.applyDamage(this.hammerDamage, onAttack);
            }

            // Switch to sickle phase after delay
            setTimeout(() => { if (this.hammerSickleState === state) state.phase = "sickle"; }, 400);
        }

        if (state.phase === "sickle" && !state.hasSickleHit) {
            state.hasSickleHit = true;
            // Sickle arc VFX
            const sickle = new Entity("lenin-sickle");
            sickle.addComponent("render", { type: "torus", material: this.sickleMaterial });
            sickle.setLocalScale(3, 3 * 0.3, 3);
            sickle.setPosition(myPos.x, myPos.y + 1, myPos.z);
            this.getEntity().addChild(sickle);
            this.activeEffects.add(sickle);
            const startMs = Date.now(); const durationMs = 400;
            const tick = () => {
                const elapsed = Date.now() - startMs;
                if (elapsed >= durationMs) { this.destroyEffect(sickle); return; }
                const mat = sickle.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                if (mat) { mat.opacity = 0.9 * (1 - elapsed / durationMs); mat.update(); }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);

            if (this.getFlatDistanceTo(target) <= this.sickleHitRadius) {
                this.applyDamage(this.sickleDamage, onAttack);
            }
        }

        if (now >= state.endTimeSeconds) {
            this.hammerSickleState = null;
            this.nextHammerSickleAtSeconds = now + this.hammerSickleCooldownSeconds;
        }
    }

    // ── Summon winter ──
    private startWinter(now: number): void {
        this.lastAttackType = "summonWinter"; this.lastAttackAtSeconds = now;
        this.winterState = { endTimeSeconds: now + 1.0, hasApplied: false };
        this.attackLockUntilSeconds = now + 0.5;
    }

    private updateWinter(dt: number, target: Entity, now: number): void {
    	const state = this.winterState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
        if (!state.hasApplied) {
            state.hasApplied = true;
            this.winterActive = true;
            this.winterEndTimeSeconds = now + this.winterDurationSeconds;
            this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.15 * this.winterBossSpeedMultiplier;

            // Winter VFX - expanding frost ring
            const myPos = this.getEntity().getPosition();
            this.spawnRingEffect(myPos, 15, 800, this.winterRingMaterial, "lenin-winter-ring", 0.5);

            // Snow particles around boss
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const snowflake = new Entity("lenin-snowflake");
                snowflake.addComponent("render", { type: "sphere", material: this.winterMaterial });
                snowflake.setLocalScale(0.8, 0.8, 0.8);
                snowflake.setPosition(
                    myPos.x + Math.cos(angle) * 3,
                    myPos.y + 2 + Math.random() * 2,
                    myPos.z + Math.sin(angle) * 3
                );
                this.getEntity().addChild(snowflake);
                this.activeEffects.add(snowflake);
                const startMs = Date.now(); const durationMs = 3000;
                const tick = () => {
                    const elapsed = Date.now() - startMs;
                    if (elapsed >= durationMs) { this.destroyEffect(snowflake); return; }
                    snowflake.setPosition(
                        myPos.x + Math.cos(angle + elapsed * 0.001) * 3,
                        myPos.y + 2 + Math.sin(elapsed * 0.002) * 1.5,
                        myPos.z + Math.sin(angle + elapsed * 0.001) * 3
                    );
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }
        }
        if (now >= state.endTimeSeconds) { this.winterState = null; this.nextWinterAtSeconds = now + this.winterCooldownSeconds; }
    }

    // ── Summon red soldiers ──
    private startRedSoldiers(_target: Entity, now: number): void {
        this.lastAttackType = "summonRedSoldiers"; this.lastAttackAtSeconds = now;
        this.redSoldiersState = { endTimeSeconds: now + 0.8, hasSpawned: false };
        this.attackLockUntilSeconds = this.redSoldiersState.endTimeSeconds;
    }

    private updateRedSoldiers(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.redSoldiersState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
        if (!state.hasSpawned) {
            state.hasSpawned = true;
            const myPos = this.getEntity().getPosition();

            for (let i = 0; i < this.redSoldierCount; i++) {
                const angle = (i / this.redSoldierCount) * Math.PI * 2 + Math.random() * 0.5;
                const dist = 4 + Math.random() * 3;
                const soldierPos = new Vec3(
                    myPos.x + Math.cos(angle) * dist,
                    myPos.y,
                    myPos.z + Math.sin(angle) * dist
                );

                const soldier = new Entity("lenin-red-soldier");
                soldier.addComponent("render", { type: "capsule", material: this.redSoldierMaterial });
                soldier.setLocalScale(0.8, 2.0, 0.8);
                soldier.setPosition(soldierPos.x, soldierPos.y + 1, soldierPos.z);
                this.getEntity().parent?.addChild(soldier) ?? this.getEntity().addChild(soldier);
                this.activeEffects.add(soldier);

                // Animate soldier toward target
                const startMs = Date.now(); const durationMs = 1200;
                const tick = () => {
                    const elapsed = Date.now() - startMs;
                    const t = Math.min(1, elapsed / durationMs);
                    const currentTargetPos = target.getPosition();
                    soldier.setPosition(
                        soldierPos.x + (currentTargetPos.x - soldierPos.x) * t,
                        soldierPos.y + 1,
                        soldierPos.z + (currentTargetPos.z - soldierPos.z) * t
                    );
                    if (elapsed >= durationMs) {
                        // Check hit at end
                        const sPos = soldier.getPosition();
                        const dx = currentTargetPos.x - sPos.x;
                        const dz = currentTargetPos.z - sPos.z;
                        if (Math.sqrt(dx * dx + dz * dz) <= 3) {
                            this.applyDamage(this.redSoldierDamage, onAttack);
                        }
                        this.destroyEffect(soldier);
                        return;
                    }
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }
        }
        if (now >= state.endTimeSeconds) { this.redSoldiersState = null; this.nextRedSoldiersAtSeconds = now + this.redSoldierCooldownSeconds; }
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
        this.activeEffects.clear(); this.hammerSickleState = null; this.winterState = null; this.redSoldiersState = null;
        this.winterActive = false; this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.15;
    }
}
