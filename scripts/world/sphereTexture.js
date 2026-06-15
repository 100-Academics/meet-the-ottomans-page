import { Texture } from 'playcanvas';

function hasRenderableMesh(entity) {
  return !!(entity && entity.render && entity.render.meshInstances && entity.render.meshInstances.length > 0);
}

function isTextureResource(value) {
  return value instanceof Texture;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load texture image: ${url}`));
    image.src = url;
  });
}

function centerCropToAspect(source, targetAspect = 2) {
  const sourceAspect = source.width / source.height;

  if (!Number.isFinite(sourceAspect) || Math.abs(sourceAspect - targetAspect) < 0.001) {
    return source;
  }

  const canvas = document.createElement('canvas');
  let sx = 0;
  let sy = 0;
  let sw = source.width;
  let sh = source.height;

  if (sourceAspect > targetAspect) {
    sw = Math.round(source.height * targetAspect);
    sx = Math.round((source.width - sw) / 2);
  } else {
    sh = Math.round(source.width / targetAspect);
    sy = Math.round((source.height - sh) / 2);
  }

  canvas.width = sw;
  canvas.height = sh;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return source;
  }

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

/**
 * Wrap a texture over a sphere by assigning it to each meshInstance material's diffuseMap.
 * The sphere must already have UVs (PlayCanvas sphere primitives do by default).
 */
/**
 * Apply a color texture to every material on the sphere.
 * Accepts a PlayCanvas Texture, an HTMLImageElement, or a URL string.
 */
export async function applySphereTexture(entity, textureInput, graphicsDevice) {
  if (!hasRenderableMesh(entity)) {
    console.warn("Target entity must have an active 'render' component with at least one mesh instance.");
    return null;
  }

  let texture = null;

  if (isTextureResource(textureInput)) {
    texture = textureInput;
  } else {
    const imageSource = typeof textureInput === 'string' ? await loadImage(textureInput) : textureInput;
    if (!imageSource || !imageSource.width || !imageSource.height) {
      console.warn('Texture input must be a valid image source or texture resource.');
      return null;
    }

    if (!graphicsDevice) {
      console.warn('A GraphicsDevice is required to create a texture from an image or URL.');
      return null;
    }

    const centeredSource = centerCropToAspect(imageSource, 2);
    texture = new Texture(graphicsDevice, { mipmaps: true, name: 'sphere-diffuse-map' });
    texture.setSource(centeredSource);
  }

  entity.render.meshInstances.forEach((meshInstance) => {
    const material = meshInstance.material;
    if (!material) return;

    if (material.diffuseMap && material.diffuseMap !== texture) {
      material.diffuseMap.destroy();
    }
    material.useLighting = false;
    material.diffuseMap = texture;
    material.emissiveMap = texture;
    material.emissive.set(1, 1, 1);
    material.emissiveIntensity = 1;
    material.diffuse.set(1, 1, 1);
    material.update();
  });

  return texture;
}

