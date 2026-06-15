import { Entity, Vec3, type BoundingBox } from "playcanvas";

const GENERATED_MESH_COLLIDER_TAG = "__generated-mesh-collider";

export interface ApplyCollisionOptions {
  rigidbodyType?: "static" | "dynamic" | "kinematic";
  mass?: number;
  convexHull?: boolean;
  includeDescendants?: boolean;
}

function getAmmoRuntimeName(): string {
  const runtime = (globalThis as { __ammoRuntime?: unknown }).__ammoRuntime;
  return typeof runtime === "string" ? runtime : "";
}

function isAmmojs3Runtime(): boolean {
  return getAmmoRuntimeName().startsWith("ammojs3");
}

interface MeshColliderSource {
  mesh: unknown;
  node?: unknown;
}

function getMeshColliderSources(entity: Entity): MeshColliderSource[] {
  const render = entity.render as
    | {
        meshes?: unknown[];
        meshInstances?: Array<{ mesh?: unknown; node?: unknown }>;
      }
    | undefined;

  if (!render) {
    return [];
  }

  if (Array.isArray(render.meshInstances) && render.meshInstances.length > 0) {
    return render.meshInstances
      .filter((meshInstance): meshInstance is { mesh: unknown; node?: unknown } => meshInstance.mesh !== undefined && meshInstance.mesh !== null)
      .map((meshInstance) => ({ mesh: meshInstance.mesh, node: meshInstance.node }));
  }

  if (Array.isArray(render.meshes) && render.meshes.length > 0) {
    return render.meshes
      .filter((mesh): mesh is unknown => mesh !== undefined && mesh !== null)
      .map((mesh) => ({ mesh, node: entity }));
  }

  return [];
}

function collectRenderableEntities(entity: Entity, includeDescendants: boolean, out: Entity[] = []): Entity[] {
  if (getMeshColliderSources(entity).length > 0) {
    out.push(entity);
  }

  if (!includeDescendants) {
    return out;
  }

  for (const child of entity.children) {
    collectRenderableEntities(child as Entity, true, out);
  }

  return out;
}

function getCombinedWorldBounds(entity: Entity, includeDescendants: boolean): BoundingBox | null {
  let bounds: BoundingBox | null = null;

  const visit = (node: Entity) => {
    const meshInstances = node.render?.meshInstances;
    if (meshInstances && meshInstances.length > 0) {
      for (const meshInstance of meshInstances) {
        const aabb = meshInstance.aabb;
        if (!aabb) {
          continue;
        }

        if (!bounds) {
          bounds = aabb.clone();
        } else {
          bounds.add(aabb);
        }
      }
    }

    if (!includeDescendants) {
      return;
    }

    for (const child of node.children) {
      visit(child as Entity);
    }
  };

  visit(entity);
  return bounds;
}

function clearGeneratedMeshColliders(entity: Entity): void {
  const generated = entity.findByTag(GENERATED_MESH_COLLIDER_TAG) as Entity[];
  for (const colliderEntity of generated) {
    colliderEntity.destroy();
  }
}

function ensureRigidbody(entity: Entity, options: ApplyCollisionOptions): void {
  const rigidbodyType = options.rigidbodyType ?? "static";

  if (!entity.rigidbody) {
    const rigidbodyData: {
      type: "static" | "dynamic" | "kinematic";
      mass?: number;
    } = { type: rigidbodyType };

    if (rigidbodyType === "dynamic") {
      rigidbodyData.mass = options.mass ?? 10;
    }

    entity.addComponent("rigidbody", rigidbodyData);
    return;
  }

  if (entity.rigidbody.type !== rigidbodyType) {
    entity.rigidbody.type = rigidbodyType;
  }

  if (rigidbodyType === "dynamic" && typeof options.mass === "number") {
    entity.rigidbody.mass = options.mass;
  }
}

function applyPrimitiveFallbackCollision(entity: Entity, includeDescendants: boolean): number {
  const combinedBounds = getCombinedWorldBounds(entity, includeDescendants);
  if (!combinedBounds) {
    return 0;
  }

  const localCenter = entity
    .getWorldTransform()
    .clone()
    .invert()
    .transformPoint(combinedBounds.center.clone());

  const halfExtents = combinedBounds.halfExtents.clone();
  halfExtents.x = Math.max(halfExtents.x, 0.05);
  halfExtents.y = Math.max(halfExtents.y, 0.05);
  halfExtents.z = Math.max(halfExtents.z, 0.05);

  const radius = Math.max(halfExtents.x, halfExtents.z);
  const height = Math.max(halfExtents.y * 2, 0.1);
  const linearOffset = new Vec3(localCenter.x, localCenter.y, localCenter.z);

  if (!entity.collision) {
    entity.addComponent("collision", {
      type: "cylinder",
      radius,
      height,
      axis: 1,
      linearOffset
    });
  } else {
    entity.collision.type = "cylinder";
    entity.collision.radius = radius;
    entity.collision.height = height;
    entity.collision.axis = 1;
    entity.collision.linearOffset = linearOffset;
  }

  return 1;
}

function ensureCompoundParentCollision(entity: Entity): void {
  if (!entity.collision) {
    entity.addComponent("collision", { type: "compound" });
    return;
  }

  if (entity.collision.type !== "compound") {
    entity.collision.type = "compound";
  }
}

function addSingleMeshCollider(parent: Entity, source: MeshColliderSource, convexHull: boolean): boolean {
  const colliderEntity = new Entity(`${parent.name || "mesh"}-mesh-collider`);
  colliderEntity.tags.add(GENERATED_MESH_COLLIDER_TAG);
  parent.addChild(colliderEntity);

  try {
    const sourceNode = source.node as
      | {
          getPosition?: () => Vec3;
          getEulerAngles?: () => Vec3;
        }
      | undefined;

    const sourcePosition = sourceNode?.getPosition?.();
    if (sourcePosition) {
      colliderEntity.setPosition(sourcePosition);
    }

    const sourceEulerAngles = sourceNode?.getEulerAngles?.();
    if (sourceEulerAngles) {
      colliderEntity.setEulerAngles(sourceEulerAngles);
    }

    colliderEntity.addComponent("collision", {
      type: "mesh",
      render: { meshes: [source.mesh] },
      convexHull
    });
    return true;
  } catch (error) {
    colliderEntity.destroy();
    console.warn(
      `Failed to create ${convexHull ? "convex-hull" : "triangle-mesh"} collider for "${parent.name}"`,
      error
    );
    return false;
  }
}

export function applyMeshCollision(entity: Entity, options: ApplyCollisionOptions = {}): number {
  const includeDescendants = options.includeDescendants ?? true;
  const renderEntities = collectRenderableEntities(entity, includeDescendants);

  if (renderEntities.length === 0) {
    console.warn(`Skipped collision setup: "${entity.name}" has no render meshes`);
    return 0;
  }

  clearGeneratedMeshColliders(entity);
  ensureRigidbody(entity, options);

  const rigidbodyType = options.rigidbodyType ?? "static";
  console.log(`[Collision] Setting up "${entity.name}" — type: ${rigidbodyType}, includeDescendants: ${includeDescendants}, ammoRuntime: ${getAmmoRuntimeName() || "unknown"}`);

  if (!isAmmojs3Runtime()) {
    console.warn(
      `ammojs3 runtime is not active (runtime="${getAmmoRuntimeName() || "unknown"}"), attempting mesh collision for "${entity.name}" with best-effort fallback`
    );
  }

  ensureCompoundParentCollision(entity);

  const useConvexHull = options.convexHull ?? rigidbodyType !== "static";
  const meshCollisionMethod = useConvexHull ? "mesh-convex-hull" : "mesh-trimesh";
  console.log(`[Collision] "${entity.name}" collision method candidate: ${meshCollisionMethod}`);

  let created = 0;
  for (const renderEntity of renderEntities) {
    const meshSources = getMeshColliderSources(renderEntity);
    if (meshSources.length === 0) {
      continue;
    }

    for (const meshSource of meshSources) {
      if (!addSingleMeshCollider(renderEntity, meshSource, useConvexHull)) {
        continue;
      }

      created++;
      const pos = renderEntity.getPosition();
      console.log(`[Collision] Created ${useConvexHull ? "convex-hull" : "trimesh"} collider on "${renderEntity.name}" at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
    }
  }

  if (created === 0) {
    console.warn(`[Collision] "${entity.name}" collision method in use: primitive-cylinder (mesh creation failed)`);
    return applyPrimitiveFallbackCollision(entity, includeDescendants);
  }

  console.log(`[Collision] "${entity.name}" collision method in use: ${meshCollisionMethod}`);
  console.log(`[Collision] "${entity.name}" complete — ${created} collider(s), rigidbody: ${entity.rigidbody?.type}, collision: ${entity.collision?.type}`);
  return created;
}
