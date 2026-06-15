import { Boss } from "./boss";
import { Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color } from "playcanvas";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type MosesAttackType = "plague" | "partingWave" | "staffStrike" | "mannaHail";

interface PlagueState {
    endTimeSeconds: number;
    hasSpread: boolean;
    cloud?: Entity | null;
}

interface PartingWaveState {
    endTimeSeconds: number;
    hasCrashed: boolean;
    wallLeft?: Entity | null;
    wallRight?: Entity | null;
}

interface StaffStrikeState {
    endTimeSeconds: number;
    direction: Vec3;
    hasHit: boolean;
    trail?: Entity | null;
}

interface MannaHailState {
    endTimeSeconds: number;
    nextImpactAtSeconds: number;
    impactsSpawned: number;
}

export class Moses extends Boss {
    private readonly plagueDamage = 12;
    private readonly plagueCooldownSeconds = 8.0;
    private readonly plagueRange = 18;
    private readonly plagueDurationSeconds = 2.2;
    private nextPlagueAtSeconds = 0;

    private readonly partingWaveDamage = 22;
    private readonly partingWaveCooldownSeconds = 7.0;
    private readonly partingWaveRange = 30;
    private readonly partingWaveHitRadius = 5.0;
    private nextPartingWaveAtSeconds = 0;

    private readonly staffStrikeDamage = 16;
    private readonly staffStrikeSpeed = PLAYER_MOVE_SPEED * 2.4;
    private readonly staffStrikeDurationSeconds = 0.5;
    private readonly staffStrikeRecoverSeconds = 0.35;
    private readonly staffStrikeCooldownSeconds = 4.5;
    private readonly staffStrikeRangeMin = 5;
    private readonly staffStrikeRangeMax = 28;
    private readonly staffStrikeHitRadius = 3.0;
    private nextStaffStrikeAtSeconds = 0;

    private readonly mannaDamage = 8;
    private readonly mannaCount = 5;
    private readonly mannaIntervalSeconds = 0.3;
    private readonly mannaCooldownSeconds = 6.0;
    private readonly mannaRange = 25;
    private readonly mannaHitRadius = 3.5;
    private nextMannaAtSeconds = 0;

    private attackLockUntilSeconds = 0;
    private lastAttackType: MosesAttackType | null = null;
    private lastAttackAtSeconds = -Infinity;
    private plagueState: PlagueState | null = null;
    private partingWaveState: PartingWaveState | null = null;
    private staffStrikeState: StaffStrikeState | null = null;
    private mannaHailState: MannaHailState | null = null;
    private onPlayerAttack?: (attacker: npc, damage: number) => void;

    private readonly plagueMaterial = this.createEffectMaterial(
        new Color(0.3, 0.7, 0.2), new Color(0.4, 0.9, 0.25), 2.5, 0.6
    );
    private readonly waterMaterial = this.createEffectMaterial(
        new Color(0.15, 0.4, 0.85), new Color(0.25, 0.55, 1.0), 3.5, 0.8
    );
    private readonly staffTrailMaterial = this.createEffectMaterial(
        new Color(0.9, 0.75, 0.3), new Color(1, 0.85, 0.4), 3.0, 0.75
    );
    private readonly mannaMaterial = this.createEffectMaterial(
        new Color(1, 0.95, 0.5), new Color(1, 0.98, 0.7), 4.0, 0.85
    );
    private readonly activeEffects = new Set<Entity>();

    constructor(id: number, maxHealth: number, entity: Entity = new Entity("Moses")) {
        super(id, maxHealth, entity, "Moses");
        this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.05;
        this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.55;

        this.setIntroTaunt("אָנֹכִי הָאֱלֹהִים אֲשֶׁר הוֹצֵאתִיךָ מֵאֶרֶץ מִצְרַיִם", "I am the Lord thy God who brought thee out of the land of Egypt.");
        this.setIntroNameTranslation("מֹשֶׁה רַבֵּנוּ", "Moses our Teacher");
        this.setTauntSet({
            highHealth: [
                "The Lord fights for me.",
                "You face the servant of the Most High.",
                "Pharaoh could not stand against us—neither shall you."
            ],
            bossLowPlayerHigh: [
                "The Lord is my strength!",
                "Even the sea obeys His command!",
                "I have endured the desert forty years—I will endure you."
            ],
            playerLowBossHigh: [
                "Let my people go.",
                "The plagues shall humble you.",
                "Kneel, for the ground itself trembles at His word."
            ],
            bothLow: [
                "The Lord decides who leaves this field.",
                "One more miracle remains."
            ],
            death: [
                "The Lord… is my shepherd.",
                "I have seen the promised land… from afar."
            ],
            bossDeath: [
                "I go unto the mountain… alone.",
                "The Law endures… though I fall."
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

        if (this.plagueState) { this.updatePlague(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.partingWaveState) { this.updatePartingWave(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.staffStrikeState) { this.updateStaffStrike(dt, targetEntity, currentTimeSeconds, onAttack); return; }
        if (this.mannaHailState) { this.updateMannaHail(dt, targetEntity, currentTimeSeconds, onAttack); return; }

        if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

        const distance = this.getFlatDistanceTo(targetEntity);
        const chosen = this.pickNextAttack(distance, currentTimeSeconds);
        if (chosen === "plague") { this.startPlague(currentTimeSeconds); return; }
        if (chosen === "partingWave") { this.startPartingWave(targetEntity, currentTimeSeconds); return; }
        if (chosen === "staffStrike") { this.startStaffStrike(targetEntity, currentTimeSeconds); return; }
        if (chosen === "mannaHail") { this.startMannaHail(currentTimeSeconds); return; }

        // No attack chosen: chase the target on foot
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
        return {
            ...base,
            attackDamage: this.partingWaveDamage,
            attackRange: this.partingWaveRange,
            attackCooldown: Math.min(this.plagueCooldownSeconds, this.partingWaveCooldownSeconds, this.staffStrikeCooldownSeconds, this.mannaCooldownSeconds),
            detectionRange: Number.MAX_VALUE
        };
    }

    private pickNextAttack(distance: number, now: number): MosesAttackType | null {
        const choices: Array<{ type: MosesAttackType; score: number }> = [];
        if (now >= this.nextPlagueAtSeconds && distance <= this.plagueRange) {
            const closeness = 1 - Math.min(1, distance / Math.max(0.001, this.plagueRange));
            choices.push({ type: "plague", score: 0.9 + closeness });
        }
        if (now >= this.nextPartingWaveAtSeconds && distance <= this.partingWaveRange) {
            choices.push({ type: "partingWave", score: 1.2 + (distance / Math.max(0.001, this.partingWaveRange)) });
        }
        if (now >= this.nextStaffStrikeAtSeconds && distance >= this.staffStrikeRangeMin && distance <= this.staffStrikeRangeMax) {
            const mid = (this.staffStrikeRangeMin + this.staffStrikeRangeMax) * 0.5;
            const halfSpan = Math.max(0.001, (this.staffStrikeRangeMax - this.staffStrikeRangeMin) * 0.5);
            choices.push({ type: "staffStrike", score: 1.1 + (1 - Math.min(1, Math.abs(distance - mid) / halfSpan)) });
        }
        if (now >= this.nextMannaAtSeconds && distance <= this.mannaRange) {
            choices.push({ type: "mannaHail", score: 1.0 });
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

    private startPlague(now: number): void {
        this.lastAttackType = "plague"; this.lastAttackAtSeconds = now;
        const cloud = this.createPlagueCloud();
        this.plagueState = { endTimeSeconds: now + this.plagueDurationSeconds, hasSpread: false, cloud };
        this.attackLockUntilSeconds = this.plagueState.endTimeSeconds + 0.3;
    }

    private updatePlague(_dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.plagueState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, _dt);
    	}
        if (state.cloud) {
            const pos = this.getEntity().getPosition();
            state.cloud.setPosition(pos.x, pos.y + 2, pos.z);
        }
        if (!state.hasSpread && this.getFlatDistanceTo(target) <= this.plagueRange) {
            state.hasSpread = true;
            this.applyDamage(this.plagueDamage, onAttack);
            this.spawnRingEffect(this.getEntity().getPosition(), this.plagueRange, this.plagueDurationSeconds * 1000, this.plagueMaterial, "moses-plague-ring", 0.35);
        }
        if (now >= state.endTimeSeconds) {
            this.destroyEffect(state.cloud);
            this.plagueState = null;
            this.nextPlagueAtSeconds = now + this.plagueCooldownSeconds;
        }
    }

    private createPlagueCloud(): Entity | null {
        const cloud = new Entity("moses-plague-cloud");
        cloud.addComponent("render", { type: "sphere", material: this.plagueMaterial });
        cloud.setLocalScale(5, 2.5, 5);
        const myPos = this.getEntity().getPosition();
        cloud.setPosition(myPos.x, myPos.y + 2, myPos.z);
        this.getEntity().parent?.addChild(cloud) ?? this.getEntity().addChild(cloud);
        this.activeEffects.add(cloud);
        return cloud;
    }

    private startPartingWave(targetEntity: Entity, now: number): void {
        this.lastAttackType = "partingWave"; this.lastAttackAtSeconds = now;
        const myPos = this.getEntity().getPosition();
        const targetPos = targetEntity.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) return;
        dir.normalize();
        const wallLeft = this.createWaterWall(myPos, dir, -1);
        const wallRight = this.createWaterWall(myPos, dir, 1);
        this.partingWaveState = {
            endTimeSeconds: now + 1.2,
            hasCrashed: false,
            wallLeft,
            wallRight
        };
        this.attackLockUntilSeconds = this.partingWaveState.endTimeSeconds + 0.4;
    }

    private updatePartingWave(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.partingWaveState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
        if (!state.hasCrashed && now >= state.endTimeSeconds - 0.2) {
            state.hasCrashed = true;
            if (this.getFlatDistanceTo(target) <= this.partingWaveHitRadius) {
                this.applyDamage(this.partingWaveDamage, onAttack);
            }
            this.spawnRingEffect(this.getEntity().getPosition(), this.partingWaveHitRadius * 1.5, 600, this.waterMaterial, "moses-wave-crash", 0.5);
        }
        if (now >= state.endTimeSeconds) {
            this.destroyEffect(state.wallLeft);
            this.destroyEffect(state.wallRight);
            this.partingWaveState = null;
            this.nextPartingWaveAtSeconds = now + this.partingWaveCooldownSeconds;
        }
    }

    private createWaterWall(origin: Vec3, direction: Vec3, side: number): Entity | null {
        const wall = new Entity("moses-water-wall");
        wall.addComponent("render", { type: "box", material: this.waterMaterial });
        wall.setLocalScale(1.5, 6, 4);
        const lateral = new Vec3(-direction.z * side * 4, 0, direction.x * side * 4);
        const forward = direction.clone().mulScalar(3);
        wall.setPosition(
            origin.x + lateral.x + forward.x,
            origin.y + 3,
            origin.z + lateral.z + forward.z
        );
        this.getEntity().parent?.addChild(wall) ?? this.getEntity().addChild(wall);
        this.activeEffects.add(wall);
        const startMs = Date.now();
        const maxMs = 1200;
        const tick = () => {
            const elapsed = Date.now() - startMs;
            if (elapsed >= maxMs || !wall.parent) { this.destroyEffect(wall); return; }
            const t = elapsed / maxMs;
            const riseAndFall = Math.sin(t * Math.PI) * 3;
            wall.setLocalScale(1.5, 6 + riseAndFall, 4);
            const mat = wall.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
            if (mat) { mat.opacity = 0.8 * (1 - t); mat.update(); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        return wall;
    }

    private startStaffStrike(target: Entity, now: number): void {
        const myPos = this.getEntity().getPosition();
        const targetPos = target.getPosition();
        const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
        if (dir.lengthSq() <= 0.0001) return;
        dir.normalize();
        this.lastAttackType = "staffStrike"; this.lastAttackAtSeconds = now;
        this.staffStrikeState = {
            endTimeSeconds: now + this.staffStrikeDurationSeconds,
            direction: dir,
            hasHit: false,
            trail: this.createStaffTrail()
        };
        this.attackLockUntilSeconds = this.staffStrikeState.endTimeSeconds + this.staffStrikeRecoverSeconds;
    }

    private updateStaffStrike(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
        const state = this.staffStrikeState; if (!state) return;
        this.moveToward(state.direction.x, state.direction.z, this.staffStrikeSpeed, dt);
        if (state.trail) {
            const pos = this.getEntity().getPosition();
            state.trail.setPosition(pos.x, pos.y - 0.5, pos.z);
        }
        if (!state.hasHit && this.getFlatDistanceTo(target) <= this.staffStrikeHitRadius) {
            state.hasHit = true;
            this.applyDamage(this.staffStrikeDamage, onAttack);
        }
        if (now >= state.endTimeSeconds) {
            this.destroyEffect(state.trail);
            this.staffStrikeState = null;
            this.nextStaffStrikeAtSeconds = now + this.staffStrikeCooldownSeconds;
        }
    }

    private createStaffTrail(): Entity | null {
        const trail = new Entity("moses-staff-trail");
        trail.addComponent("render", { type: "box", material: this.staffTrailMaterial });
        trail.setLocalScale(0.5, 0.3, 2.5);
        this.getEntity().addChild(trail);
        this.activeEffects.add(trail);
        return trail;
    }

    private startMannaHail(now: number): void {
        this.lastAttackType = "mannaHail"; this.lastAttackAtSeconds = now;
        this.mannaHailState = {
            endTimeSeconds: now + this.mannaCount * this.mannaIntervalSeconds + 0.5,
            nextImpactAtSeconds: now,
            impactsSpawned: 0
        };
        this.attackLockUntilSeconds = this.mannaHailState.endTimeSeconds;
    }

    private updateMannaHail(dt: number, target: Entity, now: number, onAttack?: (attacker: npc) => void): void {
    	const state = this.mannaHailState; if (!state) return;
    	{
    		const myPos = this.getEntity().getPosition();
    		const targetPos = target.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
        if (state.impactsSpawned < this.mannaCount && now >= state.nextImpactAtSeconds) {
            state.impactsSpawned++;
            state.nextImpactAtSeconds = now + this.mannaIntervalSeconds;
            const targetPos = target.getPosition();
            const offsetX = (Math.random() - 0.5) * 6;
            const offsetZ = (Math.random() - 0.5) * 6;
            const impactPos = new Vec3(targetPos.x + offsetX, targetPos.y + 20, targetPos.z + offsetZ);
            this.spawnMannaImpact(impactPos, target);
            if (this.getFlatDistanceTo(target) <= this.mannaHitRadius) {
                this.applyDamage(this.mannaDamage, onAttack);
            }
        }
        if (now >= state.endTimeSeconds) {
            this.mannaHailState = null;
            this.nextMannaAtSeconds = now + this.mannaCooldownSeconds;
        }
    }

    private spawnMannaImpact(impactPos: Vec3, target: Entity): void {
        const disc = new Entity("moses-manna");
        disc.addComponent("render", { type: "sphere", material: this.mannaMaterial });
        disc.setLocalScale(1.2, 1.2, 1.2);
        disc.setPosition(impactPos.x, impactPos.y, impactPos.z);
        this.getEntity().parent?.addChild(disc) ?? this.getEntity().addChild(disc);
        this.activeEffects.add(disc);
        const targetPos = target.getPosition().clone();
        const startMs = Date.now();
        const fallMs = 800;
        const holdMs = 400;
        const totalMs = fallMs + holdMs;
        const tick = () => {
            const elapsed = Date.now() - startMs;
            if (elapsed >= totalMs || !disc.parent) { this.destroyEffect(disc); return; }
            if (elapsed < fallMs) {
                const t = elapsed / fallMs;
                disc.setPosition(impactPos.x, impactPos.y - (20 * t), impactPos.z);
                const scale = 1.2 + t * 0.8;
                disc.setLocalScale(scale, scale, scale);
            } else {
                disc.setPosition(impactPos.x, targetPos.y + 0.2, impactPos.z);
                const mat = disc.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
                if (mat) {
                    mat.opacity = 0.85 * (1 - (elapsed - fallMs) / holdMs);
                    mat.update();
                }
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

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
        this.plagueState = null;
        this.partingWaveState = null;
        this.staffStrikeState = null;
        this.mannaHailState = null;
    }
}
