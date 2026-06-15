import { AppBase, BLEND_ADDITIVE, CULLFACE_NONE, Color, Entity, StandardMaterial, Vec3 } from "playcanvas";
import { Boss } from "./boss";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type NapoleonAttackType = "imperialCannonade" | "cavalryCharge" | "imperialDecree";

// ── Imperial Cannonade ──
interface ImperialCannonadeState {
  startTimeSeconds: number;
  impactTimeSeconds: number;
  endTimeSeconds: number;
  direction: Vec3;
  hasHit: boolean;
  charge?: Entity | null;
}

// ── Cavalry Charge ──
interface CavalryChargeState {
  endTimeSeconds: number;
  direction: Vec3;
  hasHit: boolean;
  trail?: Entity | null;
}

interface CavalryTrailPatch {
  entity: Entity;
  spawnTimeSeconds: number;
  hasDamaged: boolean;
}

// ── Imperial Decree ──
interface DecreeDrop {
  strikeTimeSeconds: number;
  telegraphTimeSeconds: number;
  position?: Vec3;
  hasStruck: boolean;
  telegraphSpawned: boolean;
}

interface ImperialDecreeState {
  drops: DecreeDrop[];
  endTimeSeconds: number;
}

export class Napoleon extends Boss {
  // ── Imperial Cannonade parameters ──
  private readonly cannonadeRange = 120;
  private readonly cannonadeOvershoot = 40;
  private readonly cannonadeDamage = 22;
  private readonly cannonadeHitRadius = 4.2;
  private readonly cannonadeWindupSeconds = 0.8;
  private readonly cannonadeRecoverSeconds = 0.5;
  private readonly cannonadeCooldownSeconds = 6.0;
  private readonly cannonadeBeamRadius = 0.75;
  private readonly cannonadeBeamDurationMs = 280;
  private readonly cannonadeChargeOffset = 2.1;
  private readonly cannonadeChargeHeight = 3.4;
  private readonly cannonadeChargeBaseScale = 0.7;
  private readonly cannonadeChargeScaleBoost = 0.6;

  // ── Cavalry Charge parameters ──
  private readonly cavalrySpeed = PLAYER_MOVE_SPEED * 2.5;
  private readonly cavalryDurationSeconds = 0.55;
  private readonly cavalryRecoverSeconds = 0.35;
  private readonly cavalryCooldownSeconds = 4.5;
  private readonly cavalryRangeMin = 6;
  private readonly cavalryRangeMax = 28;
  private readonly cavalryHitRadius = 3.2;
  private readonly cavalryDamage = 16;
  private readonly cavalryTrailLength = 4.8;
  private readonly cavalryTrailWidth = 0.7;
  private readonly cavalryTrailHeight = 0.32;
  private readonly cavalryPatchIntervalSeconds = 0.08;
  private readonly cavalryPatchDamage = 8;
  private readonly cavalryPatchHitRadius = 2.0;
  private readonly cavalryPatchDurationSeconds = 4.0;
  private readonly cavalryPatchDamageIntervalSeconds = 0.5;
  private readonly cavalryPatchScale = 1.8;

  // ── Imperial Decree parameters ──
  private readonly decreeRange = 160;
  private readonly decreeDamage = 18;
  private readonly decreeCooldownSeconds = 8.0;
  private readonly decreeWindupSeconds = 0.7;
  private readonly decreeStrikeSpacingSeconds = 0.6;
  private readonly decreeStrikeCount = 4;
  private readonly decreeStrikeRadius = 4.4;
  private readonly decreeBoltHeight = 18;
  private readonly decreeBoltRadius = 0.55;
  private readonly decreeBoltDurationMs = 320;
  private readonly decreeScatterRadius = 4.0;
  private readonly decreeRecoverSeconds = 0.4;

  // ── Runtime state ──
  private attackLockUntilSeconds = 0;
  private nextCannonadeAtSeconds = 0;
  private nextCavalryAtSeconds = 0;
  private nextDecreeAtSeconds = 0;
  private lastAttackType: NapoleonAttackType | null = null;
  private lastAttackAtSeconds = -Infinity;
  private cannonadeState: ImperialCannonadeState | null = null;
  private cavalryState: CavalryChargeState | null = null;
  private decreeState: ImperialDecreeState | null = null;

  private lastCavalryPatchTimeSeconds = 0;
  private readonly activeCavalryPatches: CavalryTrailPatch[] = [];

  private onPlayerAttack?: (attacker: npc, damage: number) => void;

  // ── VFX Materials ──
  private readonly cannonadeChargeMaterial = this.createEffectMaterial(
    new Color(1, 0.55, 0.1),
    new Color(1, 0.65, 0.2),
    4.5, 0.9
  );
  private readonly cannonadeBeamMaterial = this.createEffectMaterial(
    new Color(1, 0.6, 0.15),
    new Color(1, 0.7, 0.25),
    6.5, 0.9
  );
  private readonly cavalryTrailMaterial = this.createEffectMaterial(
    new Color(1, 0.5, 0.1),
    new Color(1, 0.6, 0.15),
    4.0, 0.85
  );
  private readonly cavalryPatchMaterial = this.createEffectMaterial(
    new Color(0.7, 0.05, 0.05),
    new Color(0.9, 0.1, 0.1),
    5.0, 0.8
  );
  private readonly cavalryPatchHaloMaterial = this.createEffectMaterial(
    new Color(1, 0.6, 0.2),
    new Color(1, 0.7, 0.3),
    3.5, 0.6
  );
  private readonly decreeTelegraphMaterial = this.createEffectMaterial(
    new Color(0.15, 0.15, 1),
    new Color(0.25, 0.25, 1),
    4.4, 0.6
  );
  private readonly decreeBoltMaterial = this.createEffectMaterial(
    new Color(0.3, 0.3, 1),
    new Color(0.5, 0.5, 1),
    8.0, 0.95
  );
  private readonly decreeImpactMaterial = this.createEffectMaterial(
    new Color(0.2, 0.2, 0.9),
    new Color(0.35, 0.35, 1),
    6.5, 0.85
  );

  private readonly activeEffects = new Set<Entity>();

  constructor(id: number, maxHealth: number, entity: Entity = new Entity("Napoleon")) {
    super(id, maxHealth, entity, "Napoleon Bonaparte");
    this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.15;
    this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.6;

    this.setIntroTaunt("Vive la France!", "Long live France!");
    this.setIntroNameTranslation("Napoléon Bonaparte", "Napoleon Bonaparte");
    this.setTauntSet({
      highHealth: [
        "You face the Emperor of the French.",
        "My Grande Armée has conquered nations.",
        "Impossible is a word found only in the dictionary of fools."
      ],
      bossLowPlayerHigh: [
        "A hundred days shall be enough to turn the tide!",
        "Waterloo was but a setback!",
        "The eagle of France does not perish!"
      ],
      playerLowBossHigh: [
        "Surrender, and I shall be magnanimous.",
        "Your resistance is futile.",
        "Every soldier carries a marshal's baton—except you."
      ],
      bothLow: [
        "From the heights of Austerlitz to the depths…",
        "France demands one more victory!"
      ],
      death: [
        "France… army… Joséphine…",
        "I die on the field of honor."
      ],
      bossDeath: [
        "The eagle… falls.",
        "My empire… crumbles."
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

    this.updateCavalryPatches(targetEntity, currentTimeSeconds, onAttack);

    if (this.decreeState) {
    	this.updateImperialDecree(targetEntity, currentTimeSeconds, onAttack);
    	if (targetEntity) {
    		const myPos = this.getEntity().getPosition();
    		const targetPos = targetEntity.getPosition();
    		this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
    	}
    	return;
    }

    if (!targetEntity) { super.updateAI(dt, targetEntity, currentTimeSeconds, onAttack, profileOverride); return; }

    if (this.cannonadeState) { this.updateImperialCannonade(dt, targetEntity, currentTimeSeconds, onAttack);
 {
 	const myPos = this.getEntity().getPosition();
 	const targetPos = targetEntity.getPosition();
 	this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);
 }
 return; }
 if (this.cavalryState) { this.updateCavalryCharge(dt, targetEntity, currentTimeSeconds, onAttack); return; }

    if (currentTimeSeconds < this.attackLockUntilSeconds) { this.faceTarget(targetEntity, dt); return; }

    const distance = this.getFlatDistanceTo(targetEntity);
    const chosen = this.pickNextAttack(distance, currentTimeSeconds);
    if (chosen === "imperialCannonade") { this.startImperialCannonade(targetEntity, currentTimeSeconds); return; }
    if (chosen === "cavalryCharge") { this.startCavalryCharge(targetEntity, currentTimeSeconds); return; }
    if (chosen === "imperialDecree") { this.startImperialDecree(targetEntity, currentTimeSeconds); return; }

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
      attackDamage: this.cannonadeDamage,
      attackRange: Math.max(this.cannonadeRange, this.decreeRange),
      attackCooldown: Math.min(this.cannonadeCooldownSeconds, this.cavalryCooldownSeconds, this.decreeCooldownSeconds),
      detectionRange: Number.MAX_VALUE
    };
  }

  // ── Attack selection ──
  private pickNextAttack(distance: number, now: number): NapoleonAttackType | null {
    const choices: Array<{ type: NapoleonAttackType; score: number }> = [];

    const cannonadeReady = now >= this.nextCannonadeAtSeconds && distance <= this.cannonadeRange;
    if (cannonadeReady) {
      const weight = distance < 10 ? 1.15 : 0.95;
      choices.push({ type: "imperialCannonade", score: weight });
    }

    const cavalryReady = now >= this.nextCavalryAtSeconds
      && distance >= this.cavalryRangeMin
      && distance <= this.cavalryRangeMax;
    if (cavalryReady) {
      const weight = distance > 16 ? 1.15 : 0.7;
      choices.push({ type: "cavalryCharge", score: weight });
    }

    const decreeReady = now >= this.nextDecreeAtSeconds && distance <= this.decreeRange;
    if (decreeReady) {
      const weight = distance > 14 ? 1.1 : 0.85;
      choices.push({ type: "imperialDecree", score: weight });
    }

    if (choices.length === 0) return null;

    if (this.lastAttackType && (now - this.lastAttackAtSeconds) < 1.8) {
      for (const c of choices) {
        if (c.type === this.lastAttackType) c.score *= 0.55;
      }
    }

    let best = choices[0];
    for (let i = 1; i < choices.length; i++) { if (choices[i].score > best.score) best = choices[i]; }
    const tied = choices.filter(c => Math.abs(c.score - best.score) < 0.05);
    if (tied.length > 1) return tied[Math.floor(Math.random() * tied.length)].type;
    return best.type;
  }

  // ═══════════════════════════════════════════════════════════════════
  // IMPERIAL CANNONADE — Fire a devastating cannon beam toward the player.
  // ═══════════════════════════════════════════════════════════════════

  private startImperialCannonade(targetEntity: Entity, nowSeconds: number): void {
    const myPos = this.getEntity().getPosition();
    const targetPos = targetEntity.getPosition();
    const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
    if (dir.lengthSq() <= 0.0001) return;
    dir.normalize();

    this.lastAttackType = "imperialCannonade";
    this.lastAttackAtSeconds = nowSeconds;

    this.cannonadeState = {
      startTimeSeconds: nowSeconds,
      impactTimeSeconds: nowSeconds + this.cannonadeWindupSeconds,
      endTimeSeconds: nowSeconds + this.cannonadeWindupSeconds + this.cannonadeRecoverSeconds,
      direction: dir,
      hasHit: false,
      charge: this.createCannonadeCharge()
    };
    this.attackLockUntilSeconds = this.cannonadeState.endTimeSeconds;
  }

  private updateImperialCannonade(
  	dt: number, targetEntity: Entity, nowSeconds: number, onAttack?: (attacker: npc) => void
  ): void {
  	const state = this.cannonadeState;
  	if (!state) return;

  	const myPos = this.getEntity().getPosition();
  	const targetPos = targetEntity.getPosition();
  	this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, dt);

    if (state.charge) {
      const progress = Math.min(1, Math.max(0, (nowSeconds - state.startTimeSeconds) / this.cannonadeWindupSeconds));
      this.updateCannonadeCharge(state.charge, progress);
    }

    if (!state.hasHit && nowSeconds >= state.impactTimeSeconds) {
      state.hasHit = true;
      if (state.charge) { this.destroyEffect(state.charge); state.charge = null; }
      this.fireCannonadeBeam(targetEntity, state.direction, onAttack);
    }

    if (nowSeconds >= state.endTimeSeconds) {
      if (state.charge) this.destroyEffect(state.charge);
      this.cannonadeState = null;
      this.nextCannonadeAtSeconds = nowSeconds + this.cannonadeCooldownSeconds;
    }
  }

  private createCannonadeCharge(): Entity | null {
    const sceneApp = this.resolveSceneApp();
    if (!sceneApp?.root) return null;

    const chargeRoot = new Entity("napoleon-cannonade-charge");
    const orb = new Entity("napoleon-cannonade-charge-orb");
    orb.addComponent("render", { type: "sphere" } as any);
    orb.setLocalScale(this.cannonadeChargeBaseScale, this.cannonadeChargeBaseScale, this.cannonadeChargeBaseScale);
    if (orb.render?.meshInstances?.length) {
      orb.render.meshInstances[0].material = this.cannonadeChargeMaterial;
    }
    chargeRoot.addChild(orb);
    sceneApp.root.addChild(chargeRoot);
    this.registerEffect(chargeRoot);
    return chargeRoot;
  }

  private updateCannonadeCharge(charge: Entity, progress: number): void {
    const bossPos = this.getEntity().getPosition();
    const forward = this.getEntity().forward.clone();
    forward.y = 0;
    if (forward.lengthSq() <= 0.001) forward.set(0, 0, 1);
    else forward.normalize();
    const offset = forward.mulScalar(this.cannonadeChargeOffset);
    charge.setPosition(
      bossPos.x + offset.x,
      bossPos.y + this.cannonadeChargeHeight,
      bossPos.z + offset.z
    );
    const pulse = 0.85 + Math.sin(performance.now() * 0.02) * 0.15;
    const scale = this.cannonadeChargeBaseScale + progress * this.cannonadeChargeScaleBoost;
    charge.setLocalScale(scale * pulse, scale * pulse, scale * pulse);
  }

  private fireCannonadeBeam(targetEntity: Entity, _direction: Vec3, onAttack?: (attacker: npc) => void): void {
    const origin = this.getEntity().getPosition().clone();
    const targetPos = targetEntity.getPosition().clone();
    const dir = new Vec3(targetPos.x - origin.x, 0, targetPos.z - origin.z);
    if (dir.lengthSq() <= 0.0001) return;
    dir.normalize();
    const rayEnd = origin.clone().add(dir.clone().mulScalar(this.cannonadeRange + this.cannonadeOvershoot));

    this.spawnCannonadeBeamVisual(origin, rayEnd);

    if (this.isHitByRayFlat(targetEntity, origin, rayEnd, this.cannonadeHitRadius)) {
      this.applyDamage(this.cannonadeDamage, onAttack);
    }
  }

  private spawnCannonadeBeamVisual(origin: Vec3, end: Vec3): void {
    const sceneApp = this.resolveSceneApp();
    if (!sceneApp?.root) return;

    const direction = end.clone().sub(origin);
    const length = direction.length();
    if (length <= 0.5) return;

    const beamRoot = new Entity("napoleon-cannonade-beam");
    const beam = new Entity("napoleon-cannonade-beam-mesh");
    beam.addComponent("render", { type: "cylinder" } as any);
    beam.setLocalScale(this.cannonadeBeamRadius, length, this.cannonadeBeamRadius);
    beam.setLocalPosition(0, length * 0.5, 0);
    if (beam.render?.meshInstances?.length) {
      beam.render.meshInstances[0].material = this.cannonadeBeamMaterial;
    }
    beamRoot.addChild(beam);
    beamRoot.setPosition(origin.x, origin.y, origin.z);

    const quat = this.directionToQuaternionFromUp(direction);
    beamRoot.setLocalRotation(quat.x, quat.y, quat.z, quat.w);

    sceneApp.root.addChild(beamRoot);
    this.registerEffect(beamRoot);

    const start = performance.now();
    const animate = () => {
      if (!this.isAlive() || !beamRoot.parent || !this.activeEffects.has(beamRoot)) {
        this.destroyEffect(beamRoot); return;
      }
      const t = Math.min(1, (performance.now() - start) / this.cannonadeBeamDurationMs);
      const eased = t * t * (3 - 2 * t);
      const currentLength = Math.max(0.2, length * eased);
      beam.setLocalScale(this.cannonadeBeamRadius, currentLength, this.cannonadeBeamRadius);
      beam.setLocalPosition(0, currentLength * 0.5, 0);
      if (t >= 1) { this.destroyEffect(beamRoot); return; }
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  // ═══════════════════════════════════════════════════════════════════
  // CAVALRY CHARGE — Dash that leaves a trail of imperial fire patches.
  // ═══════════════════════════════════════════════════════════════════

  private startCavalryCharge(targetEntity: Entity, nowSeconds: number): void {
    const myPos = this.getEntity().getPosition();
    const targetPos = targetEntity.getPosition();
    const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
    if (dir.lengthSq() <= 0.0001) return;
    dir.normalize();

    this.lastAttackType = "cavalryCharge";
    this.lastAttackAtSeconds = nowSeconds;
    this.lastCavalryPatchTimeSeconds = nowSeconds;

    this.cavalryState = {
      endTimeSeconds: nowSeconds + this.cavalryDurationSeconds,
      direction: dir,
      hasHit: false,
      trail: this.createCavalryTrail()
    };
    this.attackLockUntilSeconds = this.cavalryState.endTimeSeconds + this.cavalryRecoverSeconds;
  }

  private updateCavalryCharge(
    dt: number, targetEntity: Entity, nowSeconds: number, onAttack?: (attacker: npc) => void
  ): void {
    const state = this.cavalryState;
    if (!state) return;

    this.moveToward(state.direction.x, state.direction.z, this.cavalrySpeed, dt);

    if (state.trail) this.updateCavalryTrailVisual(state.trail, state.direction);

    if (nowSeconds - this.lastCavalryPatchTimeSeconds >= this.cavalryPatchIntervalSeconds) {
      this.lastCavalryPatchTimeSeconds = nowSeconds;
      this.spawnCavalryPatch();
    }

    if (!state.hasHit && this.getFlatDistanceTo(targetEntity) <= this.cavalryHitRadius) {
      state.hasHit = true;
      this.applyDamage(this.cavalryDamage, onAttack);
    }

    if (nowSeconds >= state.endTimeSeconds) {
      this.destroyEffect(state.trail);
      this.cavalryState = null;
      this.nextCavalryAtSeconds = nowSeconds + this.cavalryCooldownSeconds;
    }
  }

  private createCavalryTrail(): Entity | null {
    const sceneApp = this.resolveSceneApp();
    if (!sceneApp?.root) return null;

    const trail = new Entity("napoleon-cavalry-trail");
    trail.addComponent("render", { type: "box" } as any);
    trail.setLocalScale(this.cavalryTrailWidth, this.cavalryTrailHeight, this.cavalryTrailLength);
    if (trail.render?.meshInstances?.length) {
      trail.render.meshInstances[0].material = this.cavalryTrailMaterial;
    }
    sceneApp.root.addChild(trail);
    this.registerEffect(trail);
    return trail;
  }

  private updateCavalryTrailVisual(trail: Entity, direction: Vec3): void {
    const bossPos = this.getEntity().getPosition();
    const flatDir = new Vec3(direction.x, 0, direction.z);
    if (flatDir.lengthSq() <= 0.0001) return;
    flatDir.normalize();
    const offset = flatDir.clone().mulScalar(this.cavalryTrailLength * 0.5);
    const trailPos = bossPos.clone().sub(offset);
    const yawDegrees = Math.atan2(flatDir.x, flatDir.z) * (180 / Math.PI);
    trail.setPosition(trailPos);
    trail.setLocalEulerAngles(0, yawDegrees, 0);
    trail.setLocalScale(this.cavalryTrailWidth, this.cavalryTrailHeight, this.cavalryTrailLength);
  }

  private spawnCavalryPatch(): void {
    const sceneApp = this.resolveSceneApp();
    if (!sceneApp?.root) return;
    const bossPos = this.getEntity().getPosition();

    const patchRoot = new Entity("napoleon-cavalry-patch");
    const patch = new Entity("napoleon-cavalry-patch-mesh");
    patch.addComponent("render", { type: "cylinder" } as any);
    patch.setLocalScale(this.cavalryPatchScale, 0.15, this.cavalryPatchScale);
    patch.setLocalPosition(0, 0.08, 0);
    if (patch.render?.meshInstances?.length) {
      patch.render.meshInstances[0].material = this.cavalryPatchMaterial;
    }
    patchRoot.addChild(patch);

    const halo = new Entity("napoleon-cavalry-patch-halo");
    halo.addComponent("render", { type: "torus" } as any);
    halo.setLocalScale(this.cavalryPatchScale * 1.2, this.cavalryPatchScale * 0.12, this.cavalryPatchScale * 1.2);
    halo.setLocalPosition(0, 0.05, 0);
    if (halo.render?.meshInstances?.length) {
      halo.render.meshInstances[0].material = this.cavalryPatchHaloMaterial;
    }
    patchRoot.addChild(halo);

    patchRoot.setPosition(bossPos.x, bossPos.y, bossPos.z);
    sceneApp.root.addChild(patchRoot);
    this.registerEffect(patchRoot);

    this.activeCavalryPatches.push({
      entity: patchRoot,
      spawnTimeSeconds: Date.now() / 1000,
      hasDamaged: false
    });
  }

  private updateCavalryPatches(
    targetEntity: Entity | null, nowSeconds: number, onAttack?: (attacker: npc) => void
  ): void {
    for (let i = this.activeCavalryPatches.length - 1; i >= 0; i--) {
      const patch = this.activeCavalryPatches[i];
      const age = nowSeconds - patch.spawnTimeSeconds;

      if (age >= this.cavalryPatchDurationSeconds) {
        this.destroyEffect(patch.entity);
        this.activeCavalryPatches.splice(i, 1);
        continue;
      }

      const t = age / this.cavalryPatchDurationSeconds;
      const fadeOpacity = 1 - t;
      const mesh = patch.entity.children?.[0] as Entity | undefined;
      if ((mesh as any)?.render?.meshInstances?.length) {
        const mat = (mesh as any).render.meshInstances[0].material as StandardMaterial;
        if (mat) { mat.opacity = 0.8 * fadeOpacity; mat.update(); }
      }
      const haloMesh = patch.entity.children?.[1] as Entity | undefined;
      if ((haloMesh as any)?.render?.meshInstances?.length) {
        const haloMat = (haloMesh as any).render.meshInstances[0].material as StandardMaterial;
        if (haloMat) { haloMat.opacity = 0.6 * fadeOpacity; haloMat.update(); }
      }

      if (targetEntity) {
        const patchPos = patch.entity.getPosition();
        const playerPos = targetEntity.getPosition();
        const dx = playerPos.x - patchPos.x;
        const dz = playerPos.z - patchPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= this.cavalryPatchHitRadius) {
          const damageInterval = this.cavalryPatchDamageIntervalSeconds;
          if (!patch.hasDamaged || (age >= damageInterval && age % damageInterval < 0.1)) {
            patch.hasDamaged = true;
            this.applyDamage(this.cavalryPatchDamage, onAttack);
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // IMPERIAL DECREE — Rains imperial justice from above at the player.
  // ═══════════════════════════════════════════════════════════════════

  private startImperialDecree(targetEntity: Entity, nowSeconds: number): void {
    const drops: DecreeDrop[] = [];
    const firstStrikeAt = nowSeconds + this.decreeWindupSeconds;
    for (let i = 0; i < this.decreeStrikeCount; i++) {
      const strikeTimeSeconds = firstStrikeAt + i * this.decreeStrikeSpacingSeconds;
      drops.push({
        strikeTimeSeconds,
        telegraphTimeSeconds: strikeTimeSeconds - this.decreeWindupSeconds,
        hasStruck: false,
        telegraphSpawned: false
      });
    }
    const endTimeSeconds = drops[drops.length - 1].strikeTimeSeconds + this.decreeRecoverSeconds;

    this.decreeState = { drops, endTimeSeconds };
    this.attackLockUntilSeconds = endTimeSeconds;
    this.lastAttackType = "imperialDecree";
    this.lastAttackAtSeconds = nowSeconds;
    this.faceTarget(targetEntity, 0);
  }

  private updateImperialDecree(
    targetEntity: Entity | null, nowSeconds: number, onAttack?: (attacker: npc) => void
  ): void {
    const state = this.decreeState;
    if (!state) return;

    for (const drop of state.drops) {
      if (!drop.telegraphSpawned && nowSeconds >= drop.telegraphTimeSeconds) {
        drop.telegraphSpawned = true;
        if (targetEntity) drop.position = this.getDecreeStrikePosition(targetEntity);
        const pos = drop.position ?? this.getEntity().getPosition().clone();
        this.spawnRingEffect(
          pos, this.decreeStrikeRadius, this.decreeWindupSeconds * 1000,
          this.decreeTelegraphMaterial, "napoleon decree telegraph", 0.18
        );
      }

      if (!drop.hasStruck && nowSeconds >= drop.strikeTimeSeconds) {
        drop.hasStruck = true;
        if (!drop.position && targetEntity) drop.position = this.getDecreeStrikePosition(targetEntity);
        const pos = drop.position ?? this.getEntity().getPosition().clone();
        this.spawnDecreeBolt(pos);
        this.spawnRingEffect(
          pos, this.decreeStrikeRadius * 1.2, 220,
          this.decreeImpactMaterial, "napoleon decree impact", 0.22
        );
        if (targetEntity && this.getFlatDistanceToPosition(targetEntity, pos) <= this.decreeStrikeRadius) {
          this.applyDamage(this.decreeDamage, onAttack);
        }
      }
    }

    if (nowSeconds >= state.endTimeSeconds) {
      this.decreeState = null;
      this.nextDecreeAtSeconds = nowSeconds + this.decreeCooldownSeconds;
    }
  }

  private getDecreeStrikePosition(targetEntity: Entity): Vec3 {
    const base = targetEntity.getPosition().clone();
    const controller = (targetEntity as any)?.script?.FirstPersonCamera
      ?? (targetEntity as any)?.script?.firstPersonCamera;
    const playerHeight = Number.isFinite(controller?.playerHeight) ? controller.playerHeight : 2;
    const groundHeight = Number.isFinite(controller?.groundHeight)
      ? controller.groundHeight : base.y - playerHeight;

    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * this.decreeScatterRadius;
    base.x += Math.cos(angle) * radius;
    base.z += Math.sin(angle) * radius;
    base.y = groundHeight + 0.05;
    return base;
  }

  private spawnDecreeBolt(position: Vec3): void {
    const sceneApp = this.resolveSceneApp();
    if (!sceneApp?.root) return;

    const boltRoot = new Entity("napoleon-decree-bolt");
    const bolt = new Entity("napoleon-decree-bolt-mesh");
    bolt.addComponent("render", { type: "cylinder" } as any);
    bolt.setLocalScale(this.decreeBoltRadius, this.decreeBoltHeight, this.decreeBoltRadius);
    bolt.setLocalPosition(0, this.decreeBoltHeight * 0.5, 0);
    if (bolt.render?.meshInstances?.length) {
      bolt.render.meshInstances[0].material = this.decreeBoltMaterial;
    }
    boltRoot.addChild(bolt);
    boltRoot.setPosition(position.x, position.y, position.z);
    sceneApp.root.addChild(boltRoot);
    this.registerEffect(boltRoot);

    const start = performance.now();
    const animate = () => {
      if (!this.isAlive() || !boltRoot.parent || !this.activeEffects.has(boltRoot)) {
        this.destroyEffect(boltRoot); return;
      }
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / this.decreeBoltDurationMs);
      const flicker = 0.7 + Math.sin(elapsed * 0.08) * 0.3;
      const scale = Math.max(0.2, this.decreeBoltRadius * flicker);
      bolt.setLocalScale(scale, this.decreeBoltHeight, scale);
      if (t >= 1) { this.destroyEffect(boltRoot); return; }
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  // ═══════════════════════════════════════════════════════════════════
  // VFX helpers
  // ═══════════════════════════════════════════════════════════════════

  private createEffectMaterial(
    diffuse: Color, emissive: Color, emissiveIntensity: number, opacity: number
  ): StandardMaterial {
    const material = new StandardMaterial();
    material.useLighting = false;
    material.diffuse = diffuse;
    material.emissive = emissive;
    material.emissiveIntensity = emissiveIntensity;
    material.opacity = opacity;
    material.blendType = BLEND_ADDITIVE;
    material.depthWrite = false;
    material.cull = CULLFACE_NONE;
    material.update();
    return material;
  }

  private spawnRingEffect(
    origin: Vec3, maxRadius: number, durationMs: number,
    material: StandardMaterial, label: string, height: number
  ): void {
    const sceneApp = this.resolveSceneApp();
    if (!sceneApp?.root) return;

    const ringRoot = new Entity(label);
    const ring = new Entity(`${label} mesh`);
    ring.addComponent("render", { type: "cylinder" } as any);
    ring.setLocalScale(0.1, height, 0.1);
    if (ring.render?.meshInstances?.length) {
      ring.render.meshInstances[0].material = material;
    }
    ringRoot.addChild(ring);
    ringRoot.setPosition(origin.x, origin.y + 0.05, origin.z);
    sceneApp.root.addChild(ringRoot);
    this.registerEffect(ringRoot);

    const start = performance.now();
    const animate = () => {
      if (!this.isAlive() || !ringRoot.parent || !this.activeEffects.has(ringRoot)) {
        this.destroyEffect(ringRoot); return;
      }
      const t = Math.min(1, (performance.now() - start) / durationMs);
      const radius = Math.max(0.2, maxRadius * t);
      ring.setLocalScale(radius, height, radius);
      if (t >= 1) { this.destroyEffect(ringRoot); return; }
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private registerEffect(effect: Entity): void {
    this.activeEffects.add(effect);
  }

  private destroyEffect(effect?: Entity | null): void {
    if (!effect) return;
    this.activeEffects.delete(effect);
    try { effect.destroy(); } catch { /* */ }
  }

  private cleanupEffects(): void {
    for (const effect of this.activeEffects) {
      try { effect.destroy(); } catch { /* */ }
    }
    this.activeEffects.clear();
    this.cannonadeState = null;
    this.cavalryState = null;
    this.decreeState = null;
    for (const patch of this.activeCavalryPatches) {
      try { patch.entity.destroy(); } catch { /* */ }
    }
    this.activeCavalryPatches.length = 0;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Utility methods
  // ═══════════════════════════════════════════════════════════════════

  private faceTarget(targetEntity: Entity, dt: number): void {
    const myPos = this.getEntity().getPosition();
    const targetPos = targetEntity.getPosition();
    this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, 0, dt);
  }

  private getFlatDistanceTo(targetEntity: Entity): number {
    const myPos = this.getEntity().getPosition();
    const targetPos = targetEntity.getPosition();
    const dx = targetPos.x - myPos.x;
    const dz = targetPos.z - myPos.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private getFlatDistanceToPosition(targetEntity: Entity, position: Vec3): number {
    const targetPos = targetEntity.getPosition();
    const dx = targetPos.x - position.x;
    const dz = targetPos.z - position.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private applyDamage(damage: number, onAttack?: (attacker: npc) => void): void {
    if (this.onPlayerAttack) { this.onPlayerAttack(this, damage); return; }
    if (onAttack) onAttack(this);
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

  private isHitByRayFlat(
    targetEntity: Entity, origin: Vec3, rayEnd: Vec3, hitRadius: number
  ): boolean {
    const targetPos = targetEntity.getPosition();
    const rayDir = rayEnd.clone().sub(origin);
    rayDir.y = 0;
    const rayLenSq = rayDir.x * rayDir.x + rayDir.z * rayDir.z;
    if (rayLenSq <= 0.001) return false;
    const dx = targetPos.x - origin.x;
    const dz = targetPos.z - origin.z;
    const t = (dx * rayDir.x + dz * rayDir.z) / rayLenSq;
    if (t < 0 || t > 1) return false;
    const closestX = origin.x + rayDir.x * t;
    const closestZ = origin.z + rayDir.z * t;
    const flatDist = Math.sqrt((targetPos.x - closestX) ** 2 + (targetPos.z - closestZ) ** 2);
    return flatDist <= hitRadius;
  }

  private directionToQuaternionFromUp(dir: Vec3): { x: number; y: number; z: number; w: number } {
    const up = dir.clone().normalize();
    const forwardSeed = Math.abs(up.y) > 0.99 ? new Vec3(1, 0, 0) : new Vec3(0, 0, 1);
    const right = new Vec3();
    forwardSeed.clone().cross(up, right).normalize();
    const forward = new Vec3();
    up.clone().cross(right, forward).normalize();
    return this.matrixToQuat(right, up, forward);
  }

  private matrixToQuat(
    right: Vec3, up: Vec3, forward: Vec3
  ): { x: number; y: number; z: number; w: number } {
    const m00 = right.x, m01 = up.x, m02 = forward.x;
    const m10 = right.y, m11 = up.y, m12 = forward.y;
    const m20 = right.z, m21 = up.z, m22 = forward.z;
    const trace = m00 + m11 + m22;
    let w, x, y, z;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s;
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) * s;
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) * s; z = 0.25 * s;
    }
    return { x, y, z, w };
  }
}
