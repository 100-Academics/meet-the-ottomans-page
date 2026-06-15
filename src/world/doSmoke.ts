import {
  AppBase,
  BLEND_PREMULTIPLIED,
  Color,
  CULLFACE_NONE,
  Mesh,
  SphereGeometry,
  Entity,
  MeshInstance,
  StandardMaterial,
  Vec3,
} from "playcanvas";

type SmokeBlob = {
  shell: Entity;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  wobblePhase: number;
};

type SmokePuff = {
  pivot: Entity;
  material: StandardMaterial;
  blobs: SmokeBlob[];
  baseOffsetY: number;
  riseSpeed: number;
  driftX: number;
  driftZ: number;
  maxRise: number;
  baseScale: number;
  wobblePhase: number;
  age: number;
  lifetime: number;
};

const MAX_PUFFS = 30;
const MATERIAL_BUCKET_SIZE = 0.03;
const materialPool = new Map<string, StandardMaterial>();

function getSharedMaterial(shade: number, opacity: number): StandardMaterial {
  const s = Math.round(shade / MATERIAL_BUCKET_SIZE) * MATERIAL_BUCKET_SIZE;
  const o = Math.round(opacity / MATERIAL_BUCKET_SIZE) * MATERIAL_BUCKET_SIZE;
  const key = `${s.toFixed(3)},${o.toFixed(3)}`;
  let material = materialPool.get(key);
  if (material) return material;
  material = new StandardMaterial();
  material.useLighting = false;
  material.diffuse = new Color(s, s, s);
  material.emissive = new Color(s, s, s);
  material.opacity = o;
  material.blendType = BLEND_PREMULTIPLIED;
  material.depthWrite = false;
  material.cull = CULLFACE_NONE;
  material.update();
  materialPool.set(key, material);
  return material;
}

const _tempPos = new Vec3();

export class Smoke {
  private position: Vec3;
  private radius: Vec3;
  private app: AppBase;
  private emitAccumulator = 0;
  private cameraEntity: Entity | null = null;
  private cameraFound = false;

  constructor(position: Vec3, radius: Vec3 | number, app: AppBase) {
    this.position = position;
    this.radius = typeof radius === 'number' ? new Vec3(radius, radius, radius) : radius;
    this.app = app;

    void this.createSmoke();
  }

  public createSmoke(): Entity {
    const smokeRoot = new Entity('smoke-root');
    smokeRoot.setPosition(this.position);
    this.app.root.addChild(smokeRoot);

    const smokeMesh = Mesh.fromGeometry(this.app.graphicsDevice!, new SphereGeometry({
      radius: 1,
      latitudeBands: 4,
      longitudeBands: 4
    }));

    const smokePuffs: SmokePuff[] = [];

    const spawnPuff = () => {
      const rx = this.radius.x;
      const ry = this.radius.y;
      const rz = this.radius.z;
      const puffIndex = smokePuffs.length + Math.floor(Math.random() * 1000);
      const pivot = new Entity(`smoke-puff-pivot-${puffIndex}`);
      const shade = 0.34 + (Math.random() * 0.18);
      const opacity = 0.10 + (Math.random() * 0.10);
      const material = getSharedMaterial(shade, opacity);

      const startRadius = rx * (1.6 + Math.random() * 1.1);
      const angle = Math.random() * Math.PI * 2;
      const baseOffsetX = Math.cos(angle) * startRadius;
      const baseOffsetY = Math.random() * ry * 0.2;
      const baseOffsetZ = Math.sin(angle) * startRadius;
      const horiz = Math.max(rx, rz);
      const baseScale = horiz * (0.5 + Math.random() * 0.45);
      const blobs: SmokeBlob[] = [];
      const blobCount = 5 + Math.floor(Math.random() * 4);

      pivot.setLocalPosition(baseOffsetX, baseOffsetY, baseOffsetZ);

      for (let blobIndex = 0; blobIndex < blobCount; blobIndex += 1) {
        const shell = new Entity(`smoke-puff-${puffIndex}-blob-${blobIndex}`);
        const meshInstance = new MeshInstance(smokeMesh, material);
        const layerT = blobCount <= 1 ? 0 : blobIndex / (blobCount - 1);
        const horizontalOffset = horiz * (0.25 + (Math.random() * 0.5));
        const offsetY = ry * (0.05 + (layerT * 1.45));
        const angleOffset = Math.random() * Math.PI * 2;
        const offsetX = Math.cos(angleOffset) * horizontalOffset;
        const offsetZ = Math.sin(angleOffset) * horizontalOffset;
        const sizeX = baseScale * (1.4 + Math.random() * 0.9);
        const sizeY = baseScale * (1.0 + Math.random() * 1.0);
        const sizeZ = baseScale * (1.4 + Math.random() * 0.9);

        shell.addComponent('render', {
          meshInstances: [meshInstance]
        });
        shell.setLocalPosition(offsetX, offsetY, offsetZ);
        shell.setLocalScale(sizeX, sizeY, sizeZ);
        pivot.addChild(shell);
        blobs.push({
          shell,
          offsetX,
          offsetY,
          offsetZ,
          sizeX,
          sizeY,
          sizeZ,
          wobblePhase: (Math.random() * Math.PI * 2) + (blobIndex * 0.7)
        });
      }

      smokeRoot.addChild(pivot);

      smokePuffs.push({
        pivot,
        material,
        blobs,
        baseOffsetY,
        riseSpeed: 1.3 + Math.random() * 1.2,
        driftX: (Math.random() - 0.5) * 0.06,
        driftZ: (Math.random() - 0.5) * 0.06,
        maxRise: ry * (24 + Math.random() * 16),
        baseScale,
        wobblePhase: Math.random() * Math.PI * 2,
        age: 0,
        lifetime: 30 + Math.random() * 5
      });
    };

    const initialBurst = 4;
    for (let burstIndex = 0; burstIndex < initialBurst; burstIndex += 1) {
      spawnPuff();
    }

    const updateSmoke = (deltaTime: number) => {
      const dt = Math.max(0, Math.min(deltaTime, 0.05));

      if (!this.cameraFound) {
        const cam = this.app.root.findByName('camera');
        if (cam) {
          this.cameraEntity = cam as Entity;
          this.cameraFound = true;
        }
      }
      const cameraPosition = this.cameraEntity?.getPosition();

      const rx = this.radius.x;
      const ry = this.radius.y;
      const rz = this.radius.z;
      const horiz = Math.max(rx, rz);

      this.emitAccumulator += dt;
      const spawnInterval = 0.28;
      while (this.emitAccumulator >= spawnInterval) {
        this.emitAccumulator -= spawnInterval;
        if (smokePuffs.length < MAX_PUFFS) {
          spawnPuff();
        }
      }

      const now = performance.now();
      const t1 = now * 0.0011;
      const t12 = now * 0.0012;
      const t15 = now * 0.0015;
      const t18 = now * 0.0018;
      const ryBobScale = ry * 0.06;
      const horizWobbleScale = horiz * 0.05;

      for (let puffIndex = smokePuffs.length - 1; puffIndex >= 0; puffIndex -= 1) {
        const puff = smokePuffs[puffIndex];
        puff.age += dt;

        _tempPos.copy(puff.pivot.getLocalPosition());
        const curY = _tempPos.y;
        const lifeProgress = Math.min(1, Math.max(0, (curY - puff.baseOffsetY) / puff.maxRise));
        const ageProgress = Math.min(1, puff.age / puff.lifetime);
        const nextY = curY + ((puff.riseSpeed + (lifeProgress * 2.2)) * dt);
        const nextX = _tempPos.x + (puff.driftX * dt);
        const nextZ = _tempPos.z + (puff.driftZ * dt);

        if (puff.age >= puff.lifetime || (nextY - puff.baseOffsetY) > puff.maxRise) {
          puff.pivot.destroy();
          smokePuffs.splice(puffIndex, 1);
          continue;
        }

        puff.pivot.setLocalPosition(nextX, nextY, nextZ);

        if (cameraPosition) {
          puff.pivot.lookAt(cameraPosition);
        }

        const pulse = 0.92 + (Math.sin(t15 + puff.wobblePhase) * 0.07);
        const puffScale = puff.baseScale * (1.1 + (lifeProgress * 1.45)) * (1 - (ageProgress * 0.12)) * pulse;
        const stretch = 1 + (lifeProgress * 0.8);

        for (let blobIndex = 0; blobIndex < puff.blobs.length; blobIndex += 1) {
          const blob = puff.blobs[blobIndex];
          const blobPulse = 0.92 + (Math.sin(t1 + blob.wobblePhase) * 0.08);
          const bob = Math.sin(t18 + blob.wobblePhase) * ryBobScale;
          const wobbleX = Math.sin(t12 + blob.wobblePhase) * horizWobbleScale;
          const wobbleZ = Math.cos(t1 + blob.wobblePhase) * horizWobbleScale;

          blob.shell.setLocalPosition(blob.offsetX + wobbleX, blob.offsetY + bob, blob.offsetZ + wobbleZ);
          blob.shell.setLocalScale(
            blob.sizeX * puffScale * blobPulse,
            blob.sizeY * puffScale * stretch * blobPulse,
            blob.sizeZ * puffScale * blobPulse
          );
        }
      }
    };

    this.app.on('update', updateSmoke);

    return smokeRoot;
  }
}
