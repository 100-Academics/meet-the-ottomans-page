import {
  AppBase,
  Entity,
  Vec3,
  Texture,
} from "playcanvas";

/**
 * Checks if an entity or any of its ancestors in the hierarchy has a specific tag.
 * @param entity - The entity to check (can be null)
 * @param tag - The tag to search for
 * @returns true if the tag is found in the entity or any ancestor, false otherwise
 */
export function hasTagInHierarchy(entity: Entity | null, tag: string): boolean {
  let current: Entity | null = entity;
  while (current) {
    if (current.tags?.has(tag)) return true;
    current = (current.parent as Entity | null) ?? null;
  }
  return false;
}

/**
 * Options for getHighestGroundHitY to support both simple and advanced use cases
 */
export interface GroundHitOptions {
  /** Optional terrain bounds to optimize raycast range */
  terrainBounds?: { minY: number; maxY: number };
}

/**
 * Raycasts from above to find the highest ground hit at a given X,Z position.
 * Searches for entities with the specified ground tag in their hierarchy.
 * 
 * @param app - The PlayCanvas application instance
 * @param x - X coordinate to raycast at
 * @param z - Z coordinate to raycast at
 * @param groundTag - The tag to filter ground entities (e.g., "ground")
 * @param options - Optional configuration (terrain bounds, etc.)
 * @returns The Y coordinate of the highest valid ground hit, or undefined if no hit
 */
export function getHighestGroundHitY(
  app: AppBase,
  x: number,
  z: number,
  groundTag: string,
  options?: GroundHitOptions,
): number | undefined {
  const rigidbodySystem = (app.systems as any).rigidbody as any;
  if (!rigidbodySystem || typeof rigidbodySystem.raycastFirst !== "function")
    return undefined;

  // Use terrain bounds to determine the ray range, falling back to ±300
  const terrainBounds = options?.terrainBounds;
  const rayRange = terrainBounds ? (terrainBounds.maxY - terrainBounds.minY) : 600;
  const rayCenter = terrainBounds ? (terrainBounds.maxY + terrainBounds.minY) * 0.5 : 0;
  const start = new Vec3(x, rayCenter + rayRange * 0.5, z);
  const end = new Vec3(x, rayCenter - rayRange * 0.5, z);

  if (typeof rigidbodySystem.raycastAll === "function") {
    const hits = rigidbodySystem.raycastAll(start, end);
    if (hits && hits.length > 0) {
      let bestFraction = Number.POSITIVE_INFINITY;
      let bestFractionY: number | undefined;
      let highestY: number | undefined;
      for (const hit of hits) {
        if (!hit?.point) continue;
        if (!Number.isFinite(hit.point.y)) continue;
        const hitEntity = hit.entity ?? null;
        if (!hasTagInHierarchy(hitEntity, groundTag)) continue;
        const hitFraction = hit.hitFraction;
        if (
          typeof hitFraction === "number" &&
          Number.isFinite(hitFraction) &&
          hitFraction < bestFraction
        ) {
          bestFraction = hitFraction;
          bestFractionY = hit.point.y;
        }
        if (highestY === undefined || hit.point.y > highestY)
          highestY = hit.point.y;
      }
      if (bestFractionY !== undefined) return bestFractionY;
      if (highestY !== undefined) return highestY;
    }
  }

  const firstHit = rigidbodySystem.raycastFirst(start, end);
  if (!firstHit?.point) return undefined;
  const firstEntity = firstHit.entity ?? null;
  if (!hasTagInHierarchy(firstEntity, groundTag)) return undefined;
  return Number.isFinite(firstHit.point.y) ? firstHit.point.y : undefined;
}

/**
 * AABB bounds result from getRenderableBounds
 */
export interface RenderableBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

/**
 * Calculates the axis-aligned bounding box (AABB) that encompasses all renderable
 * mesh instances in an entity hierarchy.
 * 
 * @param entity - The root entity to calculate bounds for
 * @returns Bounding box with min/max X, Y, Z coordinates, or undefined if no renderables found
 */
export function getRenderableBounds(
  entity: Entity,
): RenderableBounds | undefined {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;

  const visit = (node: Entity) => {
    const meshInstances = node.render?.meshInstances;
    if (meshInstances && meshInstances.length > 0) {
      for (const meshInstance of meshInstances) {
        const aabb = meshInstance.aabb;
        if (!aabb) continue;
        const min = aabb.getMin();
        const max = aabb.getMax();
        if (
          !Number.isFinite(min.x) ||
          !Number.isFinite(min.y) ||
          !Number.isFinite(min.z) ||
          !Number.isFinite(max.x) ||
          !Number.isFinite(max.y) ||
          !Number.isFinite(max.z)
        )
          continue;
        minX = Math.min(minX, min.x);
        maxX = Math.max(maxX, max.x);
        minZ = Math.min(minZ, min.z);
        maxZ = Math.max(maxZ, max.z);
        minY = Math.min(minY, min.y);
        maxY = Math.max(maxY, max.y);
        found = true;
      }
    }
    for (const child of node.children) visit(child as Entity);
  };

  visit(entity);
  if (!found) return undefined;
  return { minX, maxX, minZ, maxZ, minY, maxY };
}

/**
 * Configuration for starfield texture generation
 */
export interface StarfieldOptions {
  /** Texture width in pixels (default: 1024) */
  width?: number;
  /** Texture height in pixels (default: 512) */
  height?: number;
  /** Optional name prefix for the texture (default: "starfield") */
  namePrefix?: string;
}

/**
 * Procedurally generates a starfield texture with gradient background, nebulae,
 * and randomized stars using 2D canvas rendering.
 * 
 * @param device - The PlayCanvas graphics device
 * @param options - Optional configuration (dimensions, name prefix)
 * @returns A PlayCanvas Texture with the generated starfield
 */
export function createStarfieldTexture(
  device: AppBase["graphicsDevice"],
  options?: StarfieldOptions,
): Texture {
  const width = options?.width ?? 1024;
  const height = options?.height ?? 512;
  const namePrefix = options?.namePrefix ?? "starfield";

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new Texture(device!, {
      mipmaps: true,
      name: `${namePrefix}-fallback`,
    });
  }

  // Base gradient background
  const baseGradient = ctx.createLinearGradient(0, 0, width, height);
  baseGradient.addColorStop(0, "#000000");
  baseGradient.addColorStop(0.5, "#04040b");
  baseGradient.addColorStop(1, "#000000");
  ctx.fillStyle = baseGradient;
  ctx.fillRect(0, 0, width, height);

  // Nebulae
  const nebulae = [
    {
      x: width * 0.2,
      y: height * 0.3,
      r: width * 0.18,
      color: "rgba(70, 120, 255, 0.16)",
    },
    {
      x: width * 0.7,
      y: height * 0.22,
      r: width * 0.14,
      color: "rgba(160, 110, 255, 0.12)",
    },
    {
      x: width * 0.75,
      y: height * 0.7,
      r: width * 0.22,
      color: "rgba(60, 190, 255, 0.14)",
    },
  ];
  nebulae.forEach((nebula) => {
    const glow = ctx.createRadialGradient(
      nebula.x,
      nebula.y,
      0,
      nebula.x,
      nebula.y,
      nebula.r,
    );
    glow.addColorStop(0, nebula.color);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(nebula.x, nebula.y, nebula.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Stars (1200 regular stars)
  const starCount = 1200;
  for (let i = 0; i < starCount; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() < 0.9 ? 1 : 2;
    const alpha = 0.45 + Math.random() * 0.55;
    const tint = Math.random();
    const r = Math.floor(190 + tint * 60);
    const g = Math.floor(200 + tint * 45);
    const b = Math.floor(230 + tint * 25);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fillRect(x, y, size, size);
  }

  // Bright glow stars (70)
  for (let i = 0; i < 70; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 6);
    glow.addColorStop(0, "rgba(230, 245, 255, 0.85)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new Texture(device!, {
    mipmaps: true,
    name: `${namePrefix}-starfield`,
  });
  texture.setSource(canvas);
  return texture;
}