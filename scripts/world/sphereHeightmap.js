// helper script to displace sphere vertices from a grayscale heightmap.

function resolveImageSource(heightMapSource) {
    if (!heightMapSource) return null;

    if (typeof heightMapSource.getSource === 'function') {
        const textureSource = heightMapSource.getSource();
        if (textureSource) return textureSource;
    }

    return heightMapSource;
}

function sampleHeight01(imageData, width, u, v) {
    const clampedU = Math.min(1, Math.max(0, u));
    const clampedV = Math.min(1, Math.max(0, v));
    // Fixed: Standard texture lookup matches texture space scaling
    const x = Math.min(width - 1, Math.max(0, Math.floor(clampedU * (width - 1))));
    const y = Math.min(imageData.height - 1, Math.max(0, Math.floor((1 - clampedV) * (imageData.height - 1))));
    const idx = (y * width + x) * 4;

    const r = imageData.data[idx];
    const g = imageData.data[idx + 1];
    const b = imageData.data[idx + 2];

    return (r + g + b) / (255 * 3);
}

export function applySphereHeightmap(entity, heightMapSource, displacementAmount = 0.2) {
    if (!entity || !entity.render || !entity.render.meshInstances || entity.render.meshInstances.length === 0) {
        console.warn("Target entity must have an active 'render' component with at least one mesh instance.");
        return;
    }

    const source = resolveImageSource(heightMapSource);
    if (!source) {
        console.warn('Heightmap source is missing or invalid.');
        return;
    }

    const canvas = document.createElement('canvas');
    const width = source.width || source.videoWidth;
    const height = source.height || source.videoHeight;

    if (!width || !height) {
        console.warn('Heightmap image has invalid dimensions.');
        return;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.warn('Could not create canvas context for heightmap sampling.');
        return;
    }

    ctx.drawImage(source, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);

    entity.render.meshInstances.forEach((meshInstance) => {
        const mesh = meshInstance.mesh;
        if (!mesh) return;

        const positions = [];
        const normals = [];
        const uvs = [];
        const colors = [];

        mesh.getPositions(positions);
        mesh.getNormals(normals);
        mesh.getUvs(0, uvs);

        if (!positions.length || !normals.length || !uvs.length) return;

        const vertexCount = positions.length / 3;

        for (let i = 0; i < vertexCount; i++) {
            const baseIndex = i * 3;
            const uvIndex = i * 2;
            const colorIndex = i * 4; // Fixed: Color layout uses 4 steps (RGBA)

            const u = uvs[uvIndex];
            const v = uvs[uvIndex + 1];

            const height01 = sampleHeight01(imageData, width, u, v);
            const displacement = height01 * displacementAmount;

            // Push vertices outward along their pre-existing face normals
            positions[baseIndex]     += normals[baseIndex]     * displacement;
            positions[baseIndex + 1] += normals[baseIndex + 1] * displacement;
            positions[baseIndex + 2] += normals[baseIndex + 2] * displacement;

            // Fixed: Assigned to correct sequential array positions
            colors[colorIndex + 0] = height01;
            colors[colorIndex + 1] = height01;
            colors[colorIndex + 2] = height01;
            colors[colorIndex + 3] = 1.0;
        }

        mesh.setPositions(positions);
        // Note: Normals are left as original to maintain shading structure. 
        // Re-calculating complex organic spherical normals requires face-normal averaging.
        mesh.setColors(colors);
        mesh.update();

        if (meshInstance.material) {
            meshInstance.material.vertexColors = true;
            meshInstance.material.update();
        }
    });
}
