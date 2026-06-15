import { AppBase, Entity, Color, Vec3 } from 'playcanvas';
import { FirstPersonCamera } from './FirstPersonCamera';
import { changeScene } from '../App';
import { hideDeathScreen, showDeathScreen } from '../world/scenes/deathScreen';
import { npc } from '../world/npc/npc';
import { Weapon } from './weapon/weapon';
import { Gun } from './weapon/gun';
import { Sword } from './weapon/sword';
import { Bow } from './weapon/bow';
import { Boss } from '../world/npc/bosses/boss';


export class Player{
 private cameraEntity: Entity;
 private cameraController: FirstPersonCamera | undefined;
 private app: AppBase;
 private maxHealth = 100;
 private health = this.maxHealth;
 private team = 'friend'; // Player is always on the 'friend' team
 private readonly swordWeapon = new Sword(4, 25);
 private readonly gunWeapon = new Gun(50, 1000, 12);
 private readonly bowWeapon = new Bow(50, 1000, 20, 250);
 private readonly oldGunWeapon = new Gun(15, 60, 12, "Gun"); // Weaker gun for early time periods
 private equippedWeapon: Weapon = this.swordWeapon;
 private deathQuizTimePeriod = -1;
 private restartBattle: (() => void) | undefined;
 private gracePeriodEnd = 0; // Timestamp (ms) until which player is invulnerable after reviving

    constructor(app: AppBase, initialPosition: Vec3 = new Vec3(0, 8, 8)) {
    this.app = app;

    // Register this player with the dev console (via globalThis to avoid circular import)
    (globalThis as any).__devConsolePlayer = this;

    // Create the camera entity
        this.cameraEntity = new Entity('camera');
        this.cameraEntity.addComponent('camera', {
            clearColor: new Color(0.14117647, 0.14117647, 0.14117647),  // Dark gray background
            fov: 90  // 90-degree field of view
        });
        this.cameraEntity.setPosition(initialPosition);
        this.cameraEntity.lookAt(Vec3.ZERO);

        // Add first-person camera controls (WASD movement, mouse look, gravity)
        this.cameraEntity.addComponent('script');
        this.cameraController = this.cameraEntity.script?.create(FirstPersonCamera) as FirstPersonCamera | undefined;
        if (this.cameraController) {
            this.cameraController.groundTag = 'ground';  // The camera will use raycasts to detect ground collision
        }

        // Add to app root so it renders
        this.app.root.addChild(this.cameraEntity);
    }

    public getCameraEntity(): Entity {
        return this.cameraEntity;
    }

    public getCameraController(): FirstPersonCamera | undefined {
        return this.cameraController;
    }

    public setPosition(position: Vec3): void {
        this.cameraEntity.setPosition(position);
    }

    public getPosition(): Vec3 {
        return this.cameraEntity.getPosition();
    }

    public getHealth(): number {
        return this.health;
    }

    public getTeam(): string {
        return this.team;
    }

    public setDeathQuizContext(timePeriod: number, restartBattle?: () => void): void {
        this.deathQuizTimePeriod = timePeriod;
        this.restartBattle = restartBattle;
    }

    public takeDamage(damage: number): void {
    if (!this.isAlive()) {
    return;
    }

    // Dev console god mode — skip all damage
    // Reads from globalThis to avoid circular dependency with DevConsole.
    // DevConsole.god command keeps this in sync.
    if ((globalThis as any).__devConsoleGodMode) {
    return;
    }

    // Grace period: ignore damage for 3 seconds after reviving
    if (Date.now() < this.gracePeriodEnd) {
    return;
    }

    this.health -= damage;
    if(!this.isAlive()) {
    this.health = 0; // prevent negative health
    }
    this.die(this.isAlive()); // checks for death
    }

    public revive(position?: Vec3): void {
    this.health = this.maxHealth;
    this.gracePeriodEnd = Date.now() + 3000; // 3-second grace period
    if (position) {
    this.setPosition(position);
    }
    hideDeathScreen();
    }

    private die(isAlive: boolean): void {
        if (!isAlive) {
            console.log("You have failed to bring glory to the Ottoman Empire. Game Over.");
            const canvas = this.app.graphicsDevice.canvas as HTMLCanvasElement | undefined;
            const bossTaunt = Boss.getActivePlayerDeathTaunt();
            showDeathScreen({
                app: this.app,
                timePeriod: this.deathQuizTimePeriod,
                onRestart: this.restartBattle,
                onMainMenu: canvas ? () => void changeScene(canvas, this.app, 0) : undefined,
                message: bossTaunt ?? 'You have failed to bring glory to the Ottoman Empire. Game Over.'
            });
        }
    }

    public isAlive(): boolean {
        return this.health > 0;
    }

    private getDamageAmount(): number {
        return this.equippedWeapon.getDamage();
    }

    public getAttackRange(): number {
        return this.equippedWeapon.getRange();
    }

    public getEquippedWeaponName(): string {
        return this.equippedWeapon.getName();
    }

    public getDebugState(): {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        forward: { x: number; y: number; z: number };
        velocity: { x: number; y: number; z: number };
        groundHeight: number;
        playerHeight: number;
        health: number;
        maxHealth: number;
        weapon: string;
    } {
        const cameraController = this.cameraController;
        const position = this.cameraEntity.getPosition();
        const rotation = this.cameraEntity.getLocalEulerAngles();
        const forward = this.cameraEntity.forward;

        return {
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
            forward: { x: forward.x, y: forward.y, z: forward.z },
            velocity: cameraController
                ? { x: cameraController.velocity.x, y: cameraController.velocity.y, z: cameraController.velocity.z }
                : { x: 0, y: 0, z: 0 },
            groundHeight: cameraController?.groundHeight ?? position.y - 2,
            playerHeight: cameraController?.playerHeight ?? 2,
            health: this.health,
            maxHealth: this.maxHealth,
            weapon: this.getEquippedWeaponName(),
        };
    }

    public equipWeapon(slot: 1 | 2 | 3 | 4): void {
        if (slot === 1) {
            this.equippedWeapon = this.swordWeapon;
        } else if (slot === 2) {
            this.equippedWeapon = this.gunWeapon;
        } else if (slot === 3) {
            this.equippedWeapon = this.bowWeapon;
        } else if (slot === 4) {
            this.equippedWeapon = this.oldGunWeapon;
        }
        console.log(`Equipped ${this.equippedWeapon.getName()}`);
    }

    public reloadEquippedWeapon(amount: number = 12): void {
        void amount;
    }

    public attack(target?: npc | null): void {
        if (this.equippedWeapon instanceof Bow) {
            this.equippedWeapon.shoot(this.app, this.cameraEntity.getPosition(), this.cameraEntity.forward, target ?? null);
            return;
        }

        let canDealDamage = true;

        if (this.equippedWeapon instanceof Gun) {
            canDealDamage = this.equippedWeapon.shoot(this.app, this.cameraEntity.getPosition(), this.cameraEntity.forward);
        }

        if (!target || !canDealDamage) {
            return;
        }

        if (target.getTeam() !== 'foe') {
            console.log('Attempted to deal damage to a friendly NPC. No damage applied.');
            return;
        }

        target.takeDamage(this.getDamageAmount());
    }

    public dealDamage(npc: npc): void {
        if (npc.getTeam() === 'foe') {
            npc.takeDamage(this.getDamageAmount());
        }
        else {
            console.log("Attempted to deal damage to a friendly NPC. No damage applied.");
        }
    }
}