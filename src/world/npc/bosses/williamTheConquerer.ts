import { Boss } from "./boss";
import { AppBase, Entity, Vec3, StandardMaterial, BLEND_ADDITIVE, CULLFACE_NONE, Color } from "playcanvas";
import type { npc } from "../npc";
import { PLAYER_MOVE_SPEED } from "../../../player/playerMovementConfig";

type WilliamAttackType = "charge" | "shieldBash" | "shockwave";

interface ChargeState {
  endTimeSeconds: number;
  direction: Vec3;
  hasHit: boolean;
  trail?: Entity | null;
}

interface ShieldBashState {
  impactTimeSeconds: number;
  endTimeSeconds: number;
  hasHit: boolean;
}

interface ShockwavePoundState {
  impactTimeSeconds: number;
  endTimeSeconds: number;
  hasHit: boolean;
}

interface ShockwaveWaveState {
  root: Entity;
  origin: Vec3;
  direction: Vec3;
  arcHalfAngleRad: number;
  segments: Entity[];
  haloSegments: Entity[];
  startTimeSeconds: number;
  durationSeconds: number;
  maxRadius: number;
  lastRadius: number;
  hasHit: boolean;
}

export class WilliamTheConquerer extends Boss {
 // Charge attack: a cavalry-style rush forward.
 private readonly chargeSpeed = PLAYER_MOVE_SPEED * 2.6;
 private readonly chargeDurationSeconds = 0.6;
 private readonly chargeRecoverSeconds = 0.4;
 private readonly chargeCooldownSeconds = 3.5;
 private readonly chargeRangeMin = 8;
 private readonly chargeRangeMax = 35;
 private readonly chargeHitRadius = 3.6;
 private readonly chargeDamage = 28;
 private nextChargeAtSeconds = 0;

 private readonly shieldBashRange = 5;
  private readonly shieldBashDamage = 14;
  private readonly shieldBashWindupSeconds = 0.6;
  private readonly shieldBashRecoverSeconds = 0.5;
  private readonly shieldBashCooldownSeconds = 3.5;
  private readonly shieldBashRadius = 5.5;
  private nextShieldBashAtSeconds = 0;

  private readonly shockwaveRange = 8;
  private readonly shockwaveRadius = 9;
  private readonly shockwaveDamage = 22;
  private readonly shockwaveWindupSeconds = 0.7;
  private readonly shockwaveRecoverSeconds = 0.5;
  private readonly shockwaveCooldownSeconds = 8.0;
  private readonly shockwaveWaveSpeed = 44;
  private readonly shockwaveWaveThickness = 2.8;
  private readonly shockwaveWaveHeight = 0.3;
  private readonly shockwaveWaveJumpClearance = 1.3;
  private readonly shockwaveWaveMinDuration = 1.6;
  private readonly shockwaveWaveMaxDuration = 5.5;
  private readonly shockwaveDefaultWaveRadius = 180;
  private readonly shockwaveWaveArcDegrees = 300;
  private readonly shockwaveWaveSegments = 42;
  private readonly shockwaveWaveSegmentScale = 1.1;
  private readonly shockwaveKnockbackSpeed = 42;
  private readonly shockwaveKnockbackDurationSeconds = 1.2;
  private nextShockwaveAtSeconds = 0;

  private attackLockUntilSeconds = 0;
  private lastAttackType: WilliamAttackType | null = null;
  private lastAttackAtSeconds = -Infinity;
  private chargeState: ChargeState | null = null;
  private shieldBashState: ShieldBashState | null = null;
  private shockwavePoundState: ShockwavePoundState | null = null;
  private waveState: ShockwaveWaveState | null = null;
  private onPlayerAttack?: (attacker: npc, damage: number) => void;

  private readonly chargeTrailMaterial = this.createEffectMaterial(
    new Color(0.85, 0.7, 0.3),
    new Color(1, 0.85, 0.4),
    3.8,
    0.8
  );
  private readonly shieldBashMaterial = this.createEffectMaterial(
    new Color(0.9, 0.78, 0.35),
    new Color(1, 0.9, 0.5),
    4.0,
    0.75
  );
  private readonly shockwaveMaterial = this.createEffectMaterial(
    new Color(0.95, 0.82, 0.4),
    new Color(1, 0.9, 0.5),
    4.5,
    0.9
  );
  private readonly groundWaveMaterial = this.createEffectMaterial(
    new Color(1, 0.88, 0.45),
    new Color(1, 0.95, 0.6),
    5.0,
    0.8
  );
  private readonly groundTelegraphMaterial = this.createEffectMaterial(
    new Color(1, 0.92, 0.5),
    new Color(1, 0.98, 0.65),
    5.8,
    0.95
  );

  private readonly activeEffects = new Set<Entity>();

  constructor(id: number, maxHealth: number, entity: Entity = new Entity("William the Conqueror")) {
    super(id, maxHealth, entity, "William the Conqueror");

    this.aiConfig.chaseMoveSpeed = PLAYER_MOVE_SPEED * 1.15;
    this.aiConfig.idleMoveSpeed = PLAYER_MOVE_SPEED * 0.6;

    this.setIntroTaunt(
      "Ic eom Willelm, se þe þine forðfære bringeþ!",
      "I am William, he who conquered your land!"
    );
    this.setIntroNameTranslation(
      "Willelm se Gemanna",
      "William the Conqueror"
    );

    this.setTauntSet({
      highHealth: [
        "You stand before a king. Kneel.",
        "I have conquered greater foes than you.",
        "England is mine. Its power is my hand."
      ],
      bossLowPlayerHigh: [
        "A conqueror does not yield!",
        "I crossed the Channel once. I will cross again.",
        "You think me beaten? Think harder."
      ],
      playerLowBossHigh: [
        "Yield now and I may show mercy.",
        "Your resistance ends here.",
        "Every kingdom falls before me eventually."
      ],
      bothLow: [
        "Only one of us walks off this field.",
        "We are both wounded. Let us finish this.",
        "A conqueror fights to the last breath."
      ],
      death: [
        "I expected more from a warrior so grand.",
        "What more did you expect, challenging the man who conquered England by the hand of God."
      ],
      bossDeath: [
        "So falls the Conqueror",
        "The Norman sun sets."
      ]
    });
  }

  public override updateCombatAI(
    deltaTime: number,
    currentTimeSeconds: number,
    allNpcs: npc[],
    onNpcAttack?: (attacker: npc, target: npc, damage: number) => void,
    playerEntity?: Entity | null,
    onPlayerAttack?: (attacker: npc, damage: number) => void
  ): void {
    this.onPlayerAttack = onPlayerAttack;
    super.updateCombatAI(deltaTime, currentTimeSeconds, allNpcs, onNpcAttack, playerEntity, onPlayerAttack);
  }

  public override updateAI(
    deltaTime: number,
    targetEntity: Entity | null,
    currentTimeSeconds: number,
    onAttack?: (attacker: npc) => void,
    profileOverride?: { attackDamage: number; attackRange: number; attackCooldown: number; detectionRange: number; }
  ): void {
    if (!this.isAlive()) {
      return;
    }
    const clampedDeltaTime = Math.max(0, Math.min(deltaTime, 0.05));

    if (!targetEntity) {
      super.updateAI(clampedDeltaTime, targetEntity, currentTimeSeconds, onAttack, profileOverride);
      return;
    }

    if (this.waveState) {
      this.updateGroundWave(targetEntity, currentTimeSeconds);
    }

    if (this.chargeState) {
      this.updateCharge(clampedDeltaTime, targetEntity, currentTimeSeconds, onAttack);
      return;
    }

    if (this.shieldBashState) {
      this.updateShieldBash(clampedDeltaTime, targetEntity, currentTimeSeconds, onAttack);
      return;
    }

    if (this.shockwavePoundState) {
      this.updateShockwave(clampedDeltaTime, targetEntity, currentTimeSeconds, onAttack);
      return;
    }

    if (currentTimeSeconds < this.attackLockUntilSeconds) {
      this.faceTarget(targetEntity, clampedDeltaTime);
      return;
    }

    const distance = this.getFlatDistanceTo(targetEntity);
    const chosenAttack = this.pickNextAttack(distance, currentTimeSeconds);

    if (chosenAttack === "charge") {
      this.startCharge(targetEntity, currentTimeSeconds);
      return;
    }
    if (chosenAttack === "shieldBash") {
      this.startShieldBash(currentTimeSeconds);
      return;
    }
    if (chosenAttack === "shockwave") {
      this.startShockwave(currentTimeSeconds);
      return;
    }

    // No attack chosen: chase the target on foot
    const myPos = this.getEntity().getPosition();
    const targetPos = targetEntity.getPosition();
    this.moveToward(
      targetPos.x - myPos.x,
      targetPos.z - myPos.z,
      this.aiConfig.chaseMoveSpeed,
      clampedDeltaTime
    );
  }

  public override kill(): boolean {
    const didKill = super.kill();
    if (didKill) {
      this.cleanupEffects();
    }
    return didKill;
  }

  protected override getCombatProfile() {
    const base = super.getCombatProfile();
    return {
      ...base,
      attackDamage: this.chargeDamage,
      attackRange: Math.max(this.chargeRangeMax, this.shieldBashRange, this.shockwaveRange),
      attackCooldown: Math.min(this.chargeCooldownSeconds, this.shieldBashCooldownSeconds, this.shockwaveCooldownSeconds),
      detectionRange: Number.MAX_VALUE
    };
  }

  // ── Attack selection ──

  private pickNextAttack(distance: number, nowSeconds: number): WilliamAttackType | null {
    const choices: Array<{ type: WilliamAttackType; score: number }> = [];

    const canCharge = nowSeconds >= this.nextChargeAtSeconds
      && distance >= this.chargeRangeMin
      && distance <= this.chargeRangeMax;
    if (canCharge) {
      const mid = (this.chargeRangeMin + this.chargeRangeMax) * 0.5;
      const halfSpan = Math.max(0.001, (this.chargeRangeMax - this.chargeRangeMin) * 0.5);
      const centered = 1 - Math.min(1, Math.abs(distance - mid) / halfSpan);
      choices.push({ type: "charge", score: 1.1 + centered });
    }

    const canBash = nowSeconds >= this.nextShieldBashAtSeconds
      && distance <= this.shieldBashRange;
    if (canBash) {
      const closeness = 1 - Math.min(1, distance / Math.max(0.001, this.shieldBashRange));
      choices.push({ type: "shieldBash", score: 1.0 + closeness });
    }

    const canShockwave = nowSeconds >= this.nextShockwaveAtSeconds
      && distance <= this.shockwaveRange;
    if (canShockwave) {
      const closeness = 1 - Math.min(1, distance / Math.max(0.001, this.shockwaveRange));
      choices.push({ type: "shockwave", score: 1.35 + closeness });
    }

    if (choices.length === 0) {
      return null;
    }

    const recentWindowSeconds = 1.8;
    if (this.lastAttackType && (nowSeconds - this.lastAttackAtSeconds) < recentWindowSeconds) {
      for (const choice of choices) {
        if (choice.type === this.lastAttackType) {
          choice.score *= 0.55;
        }
      }
    }

    let best = choices[0];
    for (let i = 1; i < choices.length; i += 1) {
      if (choices[i].score > best.score) {
        best = choices[i];
      }
    }
    const tied = choices.filter((c) => Math.abs(c.score - best.score) < 0.05);
    if (tied.length > 1) {
      return tied[Math.floor(Math.random() * tied.length)].type;
    }
    return best.type;
  }

  // ── Charge attack ──

  private startCharge(targetEntity: Entity, nowSeconds: number): void {
    const myPos = this.getEntity().getPosition();
    const targetPos = targetEntity.getPosition();
    const dir = new Vec3(targetPos.x - myPos.x, 0, targetPos.z - myPos.z);
    if (dir.lengthSq() <= 0.0001) {
      return;
    }
    dir.normalize();

    this.lastAttackType = "charge";
    this.lastAttackAtSeconds = nowSeconds;
    this.chargeState = {
      endTimeSeconds: nowSeconds + this.chargeDurationSeconds,
      direction: dir,
      hasHit: false,
      trail: this.createChargeTrail()
    };
    this.attackLockUntilSeconds = this.chargeState.endTimeSeconds + this.chargeRecoverSeconds;
  }

  private updateCharge(
    deltaTime: number,
    targetEntity: Entity,
    nowSeconds: number,
    onAttack?: (attacker: npc) => void
  ): void {
    const state = this.chargeState;
    if (!state) {
      return;
    }
    this.moveToward(state.direction.x, state.direction.z, this.chargeSpeed, deltaTime);

    if (state.trail) {
      this.updateChargeTrail(state.trail, state.direction);
    }

    if (!state.hasHit && this.getFlatDistanceTo(targetEntity) <= this.chargeHitRadius) {
      state.hasHit = true;
      this.applyDamage(this.chargeDamage, onAttack);
    }

    if (nowSeconds >= state.endTimeSeconds) {
      this.destroyEffect(state.trail);
      this.chargeState = null;
      this.nextChargeAtSeconds = nowSeconds + this.chargeCooldownSeconds;
    }
  }

  private createChargeTrail(): Entity | null {
    const trail = new Entity("william-charge-trail");
    trail.addComponent("render", {
      type: "box",
      material: this.chargeTrailMaterial
    });
    trail.setLocalScale(0.6, 0.3, 2.5);
    this.getEntity().addChild(trail);
    this.activeEffects.add(trail);
    return trail;
  }

  private updateChargeTrail(trail: Entity, _direction: Vec3): void {
    const pos = this.getEntity().getPosition();
    trail.setPosition(pos.x, pos.y - 0.5, pos.z);
  }

  // ── Shield bash attack ──

  private startShieldBash(nowSeconds: number): void {
    this.lastAttackType = "shieldBash";
    this.lastAttackAtSeconds = nowSeconds;
    const impactTimeSeconds = nowSeconds + this.shieldBashWindupSeconds;
    this.shieldBashState = {
      impactTimeSeconds,
      endTimeSeconds: impactTimeSeconds + this.shieldBashRecoverSeconds,
      hasHit: false
    };
    this.attackLockUntilSeconds = this.shieldBashState.endTimeSeconds;

    this.spawnRingEffect(
      this.getEntity().getPosition(),
      this.shieldBashRadius,
      this.shieldBashWindupSeconds * 1000,
      this.shieldBashMaterial,
      "william shield bash telegraph",
      0.2
    );
  }

  private updateShieldBash(
    deltaTime: number,
    targetEntity: Entity,
    nowSeconds: number,
    onAttack?: (attacker: npc) => void
  ): void {
    const state = this.shieldBashState;
    if (!state) {
      return;
    }
    {
    	const myPos = this.getEntity().getPosition();
    	const targetPos = targetEntity.getPosition();
    	this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, deltaTime);
    }

    if (!state.hasHit && nowSeconds >= state.impactTimeSeconds) {
    	state.hasHit = true;
    	if (this.getFlatDistanceTo(targetEntity) <= this.shieldBashRadius) {
        this.applyDamage(this.shieldBashDamage, onAttack);
      }
      this.spawnRingEffect(
        this.getEntity().getPosition(),
        this.shieldBashRadius * 1.3,
        400,
        this.shieldBashMaterial,
        "william shield bash shockwave",
        0.25
      );
    }

    if (nowSeconds >= state.endTimeSeconds) {
      this.shieldBashState = null;
      this.nextShieldBashAtSeconds = nowSeconds + this.shieldBashCooldownSeconds;
    }
  }

  // ── Shockwave (ground pound) attack ──

  private startShockwave(nowSeconds: number): void {
    this.lastAttackType = "shockwave";
    this.lastAttackAtSeconds = nowSeconds;
    const impactTimeSeconds = nowSeconds + this.shockwaveWindupSeconds;
    this.shockwavePoundState = {
      impactTimeSeconds,
      endTimeSeconds: impactTimeSeconds + this.shockwaveRecoverSeconds,
      hasHit: false
    };

    this.spawnExpandingRing(
      this.getEntity().getPosition(),
      this.shockwaveRadius,
      this.shockwaveWindupSeconds * 1000,
      this.groundTelegraphMaterial,
      "william shockwave telegraph",
      0.26
    );
    this.spawnExpandingRing(
      this.getEntity().getPosition(),
      this.shockwaveRadius * 1.2,
      this.shockwaveWindupSeconds * 1000,
      this.groundTelegraphMaterial,
      "william shockwave telegraph outer",
      0.1
    );

    this.attackLockUntilSeconds = this.shockwavePoundState.endTimeSeconds;
  }

  private updateShockwave(
    deltaTime: number,
    targetEntity: Entity,
    nowSeconds: number,
    _onAttack?: (attacker: npc) => void
  ): void {
    const state = this.shockwavePoundState;
    if (!state) {
      return;
    }

    {
    	const myPos = this.getEntity().getPosition();
    	const targetPos = targetEntity.getPosition();
    	this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, this.aiConfig.chaseMoveSpeed, deltaTime);
    }

    if (!state.hasHit && nowSeconds >= state.impactTimeSeconds) {
    	state.hasHit = true;
    	this.startGroundWave(targetEntity, nowSeconds);

      this.spawnExpandingRing(
        this.getEntity().getPosition(),
        this.shockwaveRadius * 1.5,
        550,
        this.shockwaveMaterial,
        "william shockwave impact",
        0.3
      );
      this.spawnExpandingRing(
        this.getEntity().getPosition(),
        this.shockwaveRadius * 0.9,
        380,
        this.shockwaveMaterial,
        "william shockwave impact inner",
        0.2
      );
    }

    if (nowSeconds >= state.endTimeSeconds) {
      this.shockwavePoundState = null;
      this.nextShockwaveAtSeconds = nowSeconds + this.shockwaveCooldownSeconds;
    }
  }

  // ── Ground wave ──

  private startGroundWave(targetEntity: Entity, nowSeconds: number): void {
    const origin = this.getEntity().getPosition().clone();
    const direction = targetEntity.getPosition().clone().sub(origin);
    direction.y = 0;
    if (direction.lengthSq() <= 0.001) {
      const fallback = this.getEntity().forward.clone();
      fallback.y = 0;
      direction.copy(fallback.lengthSq() > 0.001 ? fallback : new Vec3(0, 0, 1));
    }
    direction.normalize();

    const maxRadius = this.getGroundWaveMaxRadius(origin, targetEntity);
    const durationSeconds = this.getGroundWaveDuration(maxRadius);
    const wave = this.createGroundWaveEffect(origin, this.shockwaveWaveSegments);
    if (!wave) {
      return;
    }

    const arcHalfAngleRad = (this.shockwaveWaveArcDegrees * 0.5) * (Math.PI / 180);

    this.waveState = {
      root: wave.root,
      origin,
      direction,
      arcHalfAngleRad,
      segments: wave.segments,
      haloSegments: wave.haloSegments,
      startTimeSeconds: nowSeconds,
      durationSeconds,
      maxRadius,
      lastRadius: 0,
      hasHit: false
    };

    this.attackLockUntilSeconds = Math.max(this.attackLockUntilSeconds, nowSeconds + durationSeconds);
  }

  private updateGroundWave(targetEntity: Entity, nowSeconds: number): void {
    const state = this.waveState;
    if (!state) {
      return;
    }

    const elapsed = nowSeconds - state.startTimeSeconds;
    const t = Math.min(1, Math.max(0, elapsed / state.durationSeconds));
    const currentRadius = state.maxRadius * t;

    this.updateGroundWaveVisual(state, currentRadius);
    this.checkGroundWaveHit(state, targetEntity, currentRadius);
    state.lastRadius = currentRadius;

    if (t >= 1) {
      this.destroyEffect(state.root);
      this.waveState = null;
    }
  }

  private updateGroundWaveVisual(state: ShockwaveWaveState, radius: number): void {
    if (!state.root?.parent) {
      return;
    }

 // ── Utility methods ──
 const yawDegrees = Math.atan2(state.direction.x, state.direction.z) * (180 / Math.PI);
 state.root.setLocalEulerAngles(0, yawDegrees, 0);

    const segmentCount = state.segments.length;
    if (segmentCount === 0) {
      return;
    }

    const halfAngle = state.arcHalfAngleRad;
    const baseScale = Math.max(0.35, this.shockwaveWaveSegmentScale);
    const haloRadius = radius + (this.shockwaveWaveThickness * 0.6);

    for (let i = 0; i < segmentCount; i += 1) {
      const t = segmentCount === 1 ? 0.5 : i / (segmentCount - 1);
      const angle = -halfAngle + (t * halfAngle * 2);
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;

      const segment = state.segments[i];
      segment.setLocalPosition(x, this.shockwaveWaveHeight * 0.5, z);
      segment.setLocalScale(baseScale, baseScale, baseScale);

      const haloSegment = state.haloSegments[i];
      if (haloSegment) {
        const hx = Math.sin(angle) * haloRadius;
        const hz = Math.cos(angle) * haloRadius;
        const haloScale = Math.max(0.25, baseScale * 0.7);
        haloSegment.setLocalPosition(hx, this.shockwaveWaveHeight * 0.35, hz);
        haloSegment.setLocalScale(haloScale, haloScale, haloScale);
      }
    }
  }

  private checkGroundWaveHit(state: ShockwaveWaveState, targetEntity: Entity, radius: number): void {
    if (state.hasHit) {
      return;
    }

    const playerPos = targetEntity.getPosition();
    const dx = playerPos.x - state.origin.x;
    const dz = playerPos.z - state.origin.z;
    const distance = Math.sqrt((dx * dx) + (dz * dz));
    if (distance <= 0.001) {
      return;
    }

    const toPlayer = new Vec3(dx, 0, dz).normalize();
    const dot = Math.max(-1, Math.min(1, state.direction.dot(toPlayer)));
    const angle = Math.acos(dot);
    if (angle > state.arcHalfAngleRad) {
      return;
    }

    const band = this.shockwaveWaveThickness;
    const minR = Math.max(0, Math.min(state.lastRadius, radius) - band);
    const maxR = Math.max(state.lastRadius, radius) + band;

    if (distance < minR || distance > maxR) {
      return;
    }

    const heightAboveGround = this.getPlayerHeightAboveGround(targetEntity);
    if (heightAboveGround <= this.shockwaveWaveJumpClearance) {
      this.applyDamage(this.shockwaveDamage);
      this.applyKnockback(targetEntity, state.origin);
      state.hasHit = true;
    }
  }

  private applyKnockback(targetEntity: Entity, origin: Vec3): void {
    const playerPos = targetEntity.getPosition();
    const pushDir = new Vec3(playerPos.x - origin.x, 0, playerPos.z - origin.z);
    if (pushDir.lengthSq() <= 0.001) {
      return;
    }
    pushDir.normalize();

    const controller = (targetEntity as any)?.script?.FirstPersonCamera
      ?? (targetEntity as any)?.script?.firstPersonCamera;

    if (controller?.velocity) {
      controller.velocity.x = pushDir.x * this.shockwaveKnockbackSpeed;
      controller.velocity.y = Math.max(controller.velocity.y, this.shockwaveKnockbackSpeed * 0.35);
      controller.velocity.z = pushDir.z * this.shockwaveKnockbackSpeed;
    }

    if (controller) {
    const controllerAny = controller as any;
    if (typeof controllerAny.setMovementLocked === "function") {
    controllerAny.setMovementLocked(true);
    } else {
    controllerAny.movementLocked = true;
    }

    const knockbackToken = { active: true };
    const durationMs = this.shockwaveKnockbackDurationSeconds * 1000;
    window.setTimeout(() => {
    if (!knockbackToken.active) return;
    if (typeof controllerAny.setMovementLocked === "function") {
    controllerAny.setMovementLocked(false);
    } else {
    controllerAny.movementLocked = false;
    }
    }, durationMs);
    }
    }

    private getPlayerHeightAboveGround(targetEntity: Entity): number {
    const controller = (targetEntity as any)?.script?.FirstPersonCamera
      ?? (targetEntity as any)?.script?.firstPersonCamera;
    const playerHeight = Number.isFinite(controller?.playerHeight) ? controller.playerHeight : 2;
    const groundHeight = Number.isFinite(controller?.groundHeight)
      ? controller.groundHeight
      : (targetEntity.getPosition().y - playerHeight);
    return targetEntity.getPosition().y - (groundHeight + playerHeight);
  }

  private getGroundWaveDuration(maxRadius: number): number {
    const duration = maxRadius / Math.max(1, this.shockwaveWaveSpeed);
    return Math.min(this.shockwaveWaveMaxDuration, Math.max(this.shockwaveWaveMinDuration, duration));
  }

  private getGroundWaveMaxRadius(origin: Vec3, targetEntity: Entity): number {
    const controller = (targetEntity as any)?.script?.FirstPersonCamera
      ?? (targetEntity as any)?.script?.firstPersonCamera;
    const minX = controller?.movementBoundsMinX;
    const maxX = controller?.movementBoundsMaxX;
    const minZ = controller?.movementBoundsMinZ;
    const maxZ = controller?.movementBoundsMaxZ;
    const boundsFinite = Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ);

    if (!boundsFinite) {
      return Math.max(this.shockwaveRadius * 2, this.shockwaveDefaultWaveRadius);
    }

    const corners = [
      new Vec3(minX, origin.y, minZ),
      new Vec3(minX, origin.y, maxZ),
      new Vec3(maxX, origin.y, minZ),
      new Vec3(maxX, origin.y, maxZ)
    ];

    let maxDistance = 0;
    for (const corner of corners) {
      const cdx = corner.x - origin.x;
      const cdz = corner.z - origin.z;
      const dist = Math.sqrt((cdx * cdx) + (cdz * cdz));
      if (dist > maxDistance) {
        maxDistance = dist;
      }
    }

    return Math.max(this.shockwaveRadius * 2, maxDistance + 2);
  }

  private createGroundWaveEffect(origin: Vec3, segmentCount: number): { root: Entity; segments: Entity[]; haloSegments: Entity[] } | null {
    const sceneApp = this.resolveSceneApp();
    if (!sceneApp?.root) {
      return null;
    }

    const waveRoot = new Entity("william ground wave");
    const segments: Entity[] = [];
    const haloSegments: Entity[] = [];
    const count = Math.max(6, segmentCount);

    for (let i = 0; i < count; i += 1) {
      const segment = new Entity(`william wave segment ${i}`);
      segment.addComponent("render", { type: "sphere" } as any);
      segment.setLocalScale(this.shockwaveWaveSegmentScale, this.shockwaveWaveSegmentScale, this.shockwaveWaveSegmentScale);
      if (segment.render?.meshInstances?.length) {
        segment.render.meshInstances[0].material = this.groundWaveMaterial;
      }
      waveRoot.addChild(segment);
      segments.push(segment);

      const haloSegment = new Entity(`william wave halo ${i}`);
      haloSegment.addComponent("render", { type: "sphere" } as any);
      const haloScale = Math.max(0.35, this.shockwaveWaveSegmentScale * 0.7);
      haloSegment.setLocalScale(haloScale, haloScale, haloScale);
      if (haloSegment.render?.meshInstances?.length) {
        haloSegment.render.meshInstances[0].material = this.shockwaveMaterial;
      }
      waveRoot.addChild(haloSegment);
      haloSegments.push(haloSegment);
    }

    waveRoot.setPosition(origin.x, origin.y + 0.08, origin.z);
    sceneApp.root.addChild(waveRoot);
    this.registerEffect(waveRoot);
    return { root: waveRoot, segments, haloSegments };
  }

  // ── VFX helpers ──

  private createEffectMaterial(
    emissiveColor: Color,
    diffuseColor: Color,
    emissiveIntensity: number,
    opacity: number
  ): StandardMaterial {
    const mat = new StandardMaterial();
    mat.useLighting = false;
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

  private spawnRingEffect(
    origin: Vec3,
    radius: number,
    durationMs: number,
    material: StandardMaterial,
    name: string,
    opacity: number
  ): void {
    const ring = new Entity(name);
    ring.addComponent("render", {
      type: "torus",
      material
    });
    ring.setPosition(origin.x, origin.y + 0.1, origin.z);
    ring.setLocalScale(radius, radius * 0.15, radius);
    this.getEntity().parent?.addChild(ring) ?? this.getEntity().addChild(ring);
    this.activeEffects.add(ring);

    const startMs = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startMs;
      if (elapsed >= durationMs) {
        this.destroyEffect(ring);
        return;
      }
      const t = elapsed / durationMs;
      const mat = ring.render?.meshInstances?.[0]?.material as StandardMaterial | undefined;
      if (mat) {
        mat.opacity = opacity * (1 - t);
        mat.update();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private spawnExpandingRing(
    origin: Vec3,
    maxRadius: number,
    durationMs: number,
    material: StandardMaterial,
    label: string,
    height: number
  ): void {
    const sceneApp = this.resolveSceneApp();
    if (!sceneApp?.root) {
      return;
    }

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
        this.destroyEffect(ringRoot);
        return;
      }

      const t = Math.min(1, (performance.now() - start) / durationMs);
      const radius = Math.max(0.2, maxRadius * t);
      ring.setLocalScale(radius, height, radius);

      if (t >= 1) {
        this.destroyEffect(ringRoot);
        return;
      }

      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

  private destroyEffect(entity: Entity | null | undefined): void {
    if (!entity) {
      return;
    }
    this.activeEffects.delete(entity);
    if (entity.parent) {
      entity.parent.removeChild(entity);
    }
    entity.destroy();
  }

  private cleanupEffects(): void {
    for (const effect of this.activeEffects) {
      try {
        if (effect.parent) {
          effect.parent.removeChild(effect);
        }
        effect.destroy();
      } catch {
        // Swallow — scene teardown may have already destroyed the entity.
      }
    }
    this.activeEffects.clear();
    this.chargeState = null;
    this.shieldBashState = null;
    this.shockwavePoundState = null;
    this.waveState = null;
  }

  private registerEffect(effect: Entity): void {
    this.activeEffects.add(effect);
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

  // ── Utility methods ──

  private faceTarget(targetEntity: Entity, deltaTime: number): void {
    const myPos = this.getEntity().getPosition();
    const targetPos = targetEntity.getPosition();
    this.moveToward(targetPos.x - myPos.x, targetPos.z - myPos.z, 0, deltaTime);
  }

  private getFlatDistanceTo(targetEntity: Entity): number {
    const myPos = this.getEntity().getPosition();
    const targetPos = targetEntity.getPosition();
    const dx = targetPos.x - myPos.x;
    const dz = targetPos.z - myPos.z;
    return Math.sqrt((dx * dx) + (dz * dz));
  }

  private applyDamage(damage: number, onAttack?: (attacker: npc) => void): void {
    if (this.onPlayerAttack) {
      this.onPlayerAttack(this, damage);
      return;
    }
    if (onAttack) {
      onAttack(this);
    }
  }
}
