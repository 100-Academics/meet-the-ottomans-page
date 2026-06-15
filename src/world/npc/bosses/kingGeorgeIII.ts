import { Boss } from "./boss";
import { Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color } from "playcanvas";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type KingGeorgeAttackType = "imperialVolley" | "colonialStrike" | "royalDash";

interface ImperialVolleyState {
    endTimeSeconds: number;
    hasFired: boolean;
}

interface ColonialStrikeState {
    endTimeSeconds: number;
    phase: "summoning" | "attacking";
    hasSummoned: boolean;
    redcoat?: Entity | null;
    targetPos: Vec3;
}

interface RoyalDashState {
    endTimeSeconds: number;
    direction: Vec3;
    hasHit: boolean;
}

export class KingGeorgeIII extends Boss {
    // Imperial Volley - cannon barrage
    private readonly volleyDamage = 25;
    private readonly volleyCooldownSeconds = 5.0;
    private readonly volleyRange = 55;
    private readonly volleyCount = 8;
    private nextVolleyAtSeconds = 0;

    // Colonial Strike - redcoat summon
    private readonly strikeDamage = 30;
    private readonly strikeCooldownSeconds = 7.0;
    private readonly strikeRange = 50;
    private readonly strikeHitRadius = 4.0;
    private nextStrikeAtSeconds = 0;

    // Royal Dash
    private readonly dashSpeed = PLAYER_MOVE_SPEED * 4.0;
    private readonly dashDurationSeconds = 0.5;
    private readonly dashDamage = 35;
    private readonly dashCooldownSeconds = 3.5;
    private readonly dashRangeMin = 10;
    private readonly dashRangeMax = 30;
    private readonly dashHitRadius = 5.0;
    private nextDashAtSeconds = 0;

    // Runtime state
    private attackLockUntilSeconds = 0;
    private lastAttackType: KingGeorgeAttackType | null = null;
    private lastAttackAtSeconds = -Infinity;
    private volleyState: ImperialVolleyState | null = null;
    private strikeState: ColonialStrikeState | null = null;
    private dashState: RoyalDashState | null = null;
    private onPlayerAttack?: (attacker: npc, damage: number) => void;

    // VFX materials
    private readonly volleyMaterial = this.createEffectMaterial(
        new Color(0.9, 0.3, 0.2), new Color(1, 0.4, 0.3), 3.0, 0.8
    );
    private readonly strikeMaterial = this.createEffectMaterial(
        new Color(0.8, 0.1, 0.1), new Color(1, 0.2, 0.2), 4.5, 0.9
    );
    private readonly dashTrailMaterial = this.createEffectMaterial(
        new Color(0.9, 0.6, 0.1), new Color(1, 0.75, 0.2), 4.0, 0.85
    );
    private readonly explosionMaterial = this.createEffectMaterial(
        new Color(1, 0.5, 0.1), new Color(1, 0.6, 0.2), 5.0, 0.9
    );
    private readonly summonRingMaterial = this.createEffectMaterial(
        new Color(0.7, 0.2, 0.2), new Color(0.9, 0.3, 0.3), 3.0, 0.6
    );
    private readonly burstMaterial = this.createEffectMaterial(
        new Color(1, 0.4, 0.2), new Color(1, 0.55, 0.3), 4.5, 0.8
    );

    private readonly activeEffects = new Set<Entity>();

    constructor(id: number, maxHealth: number, entity: Entity = new Entity("King George III")) {
        super(id, maxHealth, entity, "King George III");
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.4;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.9;

        this.setIntroTaunt("The Empire strikes back!", "The Empire strikes back!");
        this.setIntroNameTranslation("Rex Georgius III", "King George III");
        this.setIntroSkipTranslation(true);
        this.setTauntSet({
                highHealth: [
                    "The British Empire cannot be stopped!",
                    "Your rebellion will be crushed!",
                    "For King and Empire!",
                    "The colonies will pay for this!"
                ],
                bossLowPlayerHigh: [
                    "The Empire endures!",
                    "You cannot defeat the Crown!",
                    "The redcoats will prevail!",
                    "King George does not yield!"
                ],
                playerLowBossHigh: [
                    "Surrender to the Empire!",
                    "Your defeat is inevitable!",
                    "The Crown demands your surrender!",
                    "Bow before British might!"
                ],
                bothLow: [
                    "For the glory of the Empire!",
                    "Only one ruler remains!",
                    "The Empire will triumph!"
                ],
                death: [
                    "The Empire... falls...",
                    "I was... a great king...",
                    "The colonies... are lost..."
                ],
                bossDeath: [
                    "The Crown... passes...",
                    "God save... the next King...",
                    "The Empire... crumbles..."
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

        if (this.volleyState) { this.updateVolley(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.strikeState) { this.updateStrike(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.dashState) { this.updateDash(dt, targetEntity, currentTimeSeconds, onAttack); return; }

        if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

        const distance = this.getFlatDistanceTo(targetEntity);
        const chosen = this.pickNextAttack(distance, currentTimeSeconds);
        if (chosen === "imperialVolley") { this.startVolley(targetEntity, currentTimeSeconds); return; }
        if (chosen === "colonialStrike") { this.startStrike(targetEntity, currentTimeSeconds); return; }
        if (chosen === "royalDash") { this.startDash(targetEntity, currentTimeSeconds); return; }

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
        return { ...base, attackDamage: this.strikeDamage, attackRange: this.strikeRange, attackCooldown: this.strikeCooldownSeconds, detectionRange: Number.MAX_VALUE };
    }

    // ── Attack selection ──
    private pickNextAttack(distance: number, now: number): KingGeorgeAttackType | null {
        const choices: Array<{ type: KingGeorgeAttackType; score: number }> = [];
        if (now >= this.nextVolleyAtSeconds && distance <= this.volleyRange) {
            choices.push({ type: "imperialVolley", score: 1.1 });
        }
        if (now >= this.nextStrikeAtSeconds && distance <= this.strikeRange) {
            choices.push({ type: "colonialStrike", score: 1.2 + (distance / Math.max(0.001, this.strikeRange)) });
        }
        if (now >= this.nextDashAtSeconds && distance >= this.dashRangeMin && distance <= this.dashRangeMax) {
            choices.push({ type: "royalDash", score: 1.3 });
        }
        if (choices.length === 0) return null;
        if (this.lastAttackType && (now - this.lastAttackAtSeconds) < 2.0) {
            for (const c of choices) { if (c.type === this.lastAttackType) c.score *= 0.55; }
        }
        let best = choices[0];
        for (let i = 1; i < choices.length; i++) { if (choices[i].score > best.score) best = choices[i]; }
        const tied = choices.filter(c => Math.abs(c.score - best.score) < 0.05);
        if (tied.length > 1) return tied[Math.floor(Math.random() * tied.length)].type;
        return best.type;
    }

    // ── Imperial Volley ──
    private startVolley(_target: Entity, now: number): void {
        this.lastAttackType = "imperialVolley"; this.lastAttackAtSeconds = now;
        this.volleyState = { endTimeSeconds: now + 1.2, hasFired: false };
        this.attackLockUntilSeconds = this.volleyState.endTimeSeconds;
    }

    private updateVolley(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.volleyState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
        if (!state.hasFired) {
            state.hasFired = true;
            const myPos = this.getEntity().getPosition();

            for (let i = 0; i < this.volleyCount; i++) {
                const angle = (i / this.volleyCount) * Math.PI * 2;
                const spreadRadius = 8 + Math.random() * 6;
                const cannonPos = new Vec3(
                    myPos.x + Math.cos(angle) * spreadRadius,
                    myPos.y,
                    myPos.z + Math.sin(angle) * spreadRadius
                );

                const cannonball = new Entity("kinggeorge-cannonball");
                cannonball.addComponent("render", { type: "sphere", material: this.volleyMaterial });
                cannonball.setLocalScale(1.5, 1.5, 1.5);
                cannonball.setPosition(cannonPos.x, cannonPos.y + 8, cannonPos.z);
                this.getEntity().parent?.addChild(cannonball) ?? this.getEntity().addChild(cannonball);
                this.activeEffects.add(cannonball);

                // Telegraph ring
                this.spawnRingEffect(cannonPos, 2.5, 400, this.summonRingMaterial, "kinggeorge-volley-ring", 0.6);

                const startPos = cannonball.getPosition().clone();
                const targetGroundPos = new Vec3(cannonPos.x, cannonPos.y + 0.5, cannonPos.z);
                
                const startMs = Date.now(); const durationMs = 800;
                const tick = () => {
                    const elapsed = Date.now() - startMs;
                    if (elapsed >= durationMs) {
                        // Impact explosion
                        this.spawnRingEffect(targetGroundPos, 4, 500, this.explosionMaterial, "kinggeorge-volley-explosion", 0.9);
                        this.destroyEffect(cannonball);
                        return;
                    }
                    const t = elapsed / durationMs;
                    cannonball.setPosition(
                        startPos.x + (targetGroundPos.x - startPos.x) * t,
                        startPos.y * (1 - t) + Math.sin(t * Math.PI) * 10,
                        startPos.z + (targetGroundPos.z - startPos.z) * t
                    );
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }

            // Check if player is in volley zone
            if (this.getFlatDistanceTo(target) <= this.volleyRange) {
                this.applyDamage(this.volleyDamage, onAttack);
            }
        }
        if (now >= state.endTimeSeconds) { this.volleyState = null; this.nextVolleyAtSeconds = now + this.volleyCooldownSeconds; }
    }

    // ── Colonial Strike ──
    private startStrike(target: Entity, now: number): void {
        this.lastAttackType = "colonialStrike"; this.lastAttackAtSeconds = now;
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const redcoat = new Entity("kinggeorge-redcoat");
        redcoat.addComponent("render", { type: "capsule", material: this.strikeMaterial });
        redcoat.setLocalScale(2.0, 4.0, 2.0);
        redcoat.setPosition(myPos.x, myPos.y + 2, myPos.z);
        this.getEntity().parent?.addChild(redcoat) ?? this.getEntity().addChild(redcoat);
        this.activeEffects.add(redcoat);

        this.strikeState = {
            endTimeSeconds: now + 2.0,
            phase: "summoning",
            hasSummoned: false,
            redcoat,
            targetPos: targetPos.clone()
        };
        this.attackLockUntilSeconds = this.strikeState.endTimeSeconds;
    }

    private updateStrike(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.strikeState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
    	const myPos = this.getEntity().getPosition();
        const elapsed = state.endTimeSeconds - now;
        const totalDuration = 2.0;
        const progress = 1 - (elapsed / totalDuration);

        if (state.redcoat) {
            if (progress < 0.4) {
                // Summoning phase
                state.phase = "summoning";
                const t = progress / 0.4;
                state.redcoat.setPosition(
                    myPos.x + (state.targetPos.x - myPos.x) * t * 0.3,
                    myPos.y + 2 + Math.sin(t * Math.PI) * 3,
                    myPos.z + (state.targetPos.z - myPos.z) * t * 0.3
                );
                state.redcoat.setLocalEulerAngles(0, progress * 360, 0);
            } else {
                // Attacking phase
                state.phase = "attacking";
                const t = (progress - 0.4) / 0.6;
                state.redcoat.setPosition(
                    state.targetPos.x + (myPos.x - state.targetPos.x) * t * 0.5,
                    myPos.y + 2 + Math.sin(t * Math.PI) * 2,
                    state.targetPos.z + (myPos.z - state.targetPos.z) * t * 0.5
                );
                state.redcoat.setLocalEulerAngles(0, progress * 360, 0);

                if (!state.hasSummoned) {
                    state.hasSummoned = true;
                    const redcoatPos = state.redcoat.getPosition();
                    const targetPos = target.getPosition();
                    const dx = targetPos.x - redcoatPos.x;
                    const dz = targetPos.z - redcoatPos.z;
                    if (Math.sqrt(dx * dx + dz * dz) <= this.strikeHitRadius) {
                        this.applyDamage(this.strikeDamage, onAttack);
                        this.spawnRingEffect(redcoatPos, 5, 400, this.burstMaterial, "kinggeorge-strike-burst", 0.8);
                    }
                }
            }
        }

        if (now >= state.endTimeSeconds) {
            this.destroyEffect(state.redcoat);
            this.strikeState = null;
            this.nextStrikeAtSeconds = now + this.strikeCooldownSeconds;
        }
    }

    // ── Royal Dash ──
    private startDash(target: Entity, now: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) return; dir.normalize();
        this.lastAttackType = "royalDash"; this.lastAttackAtSeconds = now;
        this.dashState = { 
            endTimeSeconds: now + this.dashDurationSeconds, 
            direction: dir, 
            hasHit: false
        };
        this.attackLockUntilSeconds = this.dashState.endTimeSeconds + 0.5;
        
        // Royal burst telegraph at start position
        this.spawnRingEffect(myPos, 3.0, 350, this.burstMaterial, "kinggeorge-royal-burst", 0.9);
    }

    private updateDash(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.dashState; if (!state) return;
        this.moveToward(state.direction.x, state.direction.z, this.dashSpeed, dt);

        // Royal trail VFX
        const myPos = this.getEntity().getPosition();
        const trailCrystal = new Entity("kinggeorge-royal-trail");
        trailCrystal.addComponent("render", { type: "box", material: this.dashTrailMaterial });
        trailCrystal.setLocalScale(1.0, 0.4, 1.0);
        trailCrystal.setPosition(myPos.x, myPos.y + 0.2, myPos.z);
        trailCrystal.setLocalEulerAngles(0, Math.random() * 360, 0);
        this.getEntity().parent?.addChild(trailCrystal) ?? this.getEntity().addChild(trailCrystal);
        this.activeEffects.add(trailCrystal);
        
        const startMs = Date.now(); const durationMs = 700;
        const tick = () => {
            const elapsed = Date.now() - startMs;
            if (elapsed >= durationMs) { this.destroyEffect(trailCrystal); return; }
            const mat = trailCrystal.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
            if (mat) { mat.opacity = 0.85 * (1 - elapsed / durationMs); mat.update(); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);

        if (!state.hasHit && this.getFlatDistanceTo(target) <= this.dashHitRadius) {
            state.hasHit = true;
            this.applyDamage(this.dashDamage, onAttack);
            this.spawnRingEffect(myPos, 6, 500, this.explosionMaterial, "kinggeorge-dash-impact", 0.95);
        }

        if (now >= state.endTimeSeconds) {
            this.dashState = null;
            this.nextDashAtSeconds = now + this.dashCooldownSeconds;
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
        this.activeEffects.clear(); this.volleyState = null; this.strikeState = null; this.dashState = null;
    }
}
