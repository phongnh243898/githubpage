function getRepeatLogic(valueName, mode) {
    switch (mode) {
        case 'repeat': return `fract(${valueName})`;
        case 'mirror': return `abs(mod(${valueName}, 2.0) - 1.0)`;
        default: return `clamp(${valueName}, 0.0, 1.0)`;
    }
}

export function buildDefaultColor() { return `gl_FragColor = vec4(vColor, 1.0);`; }

export function buildBWColor() {
    return `
        float gray = dot(vColor.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(vec3(gray), 1.0);
    `;
}

export function buildHeightColor(minValue, maxValue, startColor, endColor, repeatCount, mode, posVar = 'vOriginal') {
    const factor = `((${posVar}.z - ${minValue.toFixed(4)}) / (${maxValue.toFixed(4)} - ${minValue.toFixed(4)}) * ${repeatCount.toFixed(4)})`;
    return `
        float h = ${getRepeatLogic(factor, mode)};
        vec3 colH = mix(vec3(${startColor.r.toFixed(4)}, ${startColor.g.toFixed(4)}, ${startColor.b.toFixed(4)}), 
                        vec3(${endColor.r.toFixed(4)}, ${endColor.g.toFixed(4)}, ${endColor.b.toFixed(4)}), h);
        gl_FragColor = vec4(colH, 1.0);
    `;
}

export function buildDistanceColor(minValue, maxValue, startColor, endColor, repeatCount, mode, posVar = 'vOriginal') {
    const factor = `((length(${posVar}.xy) - ${minValue.toFixed(4)}) / (${maxValue.toFixed(4)} - ${minValue.toFixed(4)}) * ${repeatCount.toFixed(4)})`;
    return `
        float d = ${getRepeatLogic(factor, mode)};
        vec3 colD = mix(vec3(${startColor.r.toFixed(4)}, ${startColor.g.toFixed(4)}, ${startColor.b.toFixed(4)}), 
                        vec3(${endColor.r.toFixed(4)}, ${endColor.g.toFixed(4)}, ${endColor.b.toFixed(4)}), d);
        gl_FragColor = vec4(colD, 1.0);
    `;
}

export function updatePCDShader(THREE, pcdMesh, state) {
    if (!pcdMesh) return;
    if (pcdMesh.material) pcdMesh.material.dispose();

    const vertexShader = `
        precision highp float;
        varying vec3 vColor;
        varying vec3 vPosition;   // flattened if projectOXY
        varying vec3 vOriginal;   // original 3D position
        uniform float uSize; 
        void main() {
            vColor = color;
            vOriginal = position;
            vec3 pos = position;
            if (${state.projectOXY}) pos.z = 0.0;
            vPosition = pos;
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = uSize;
        }
    `;

    let filterLogic = '';
    if (state.filterType === 'height') {
        filterLogic = `
            if (vOriginal.z < ${state.fMin.toFixed(4)} || vOriginal.z > ${state.fMax.toFixed(4)}) discard;
        `;
    } else if (state.filterType === 'distance') {
        filterLogic = `
            float r = length(vOriginal.xy);
            if (r < ${state.fMin.toFixed(4)} || r > ${state.fMax.toFixed(4)}) discard;
        `;
    }

    let colorLogic = buildDefaultColor();
    if (state.colorMode === 'bw') colorLogic = buildBWColor();
    if (state.colorMode === 'height') colorLogic = buildHeightColor(state.hZMin, state.hZMax, state.hStart, state.hEnd, state.hRepeat, state.hMode);
    if (state.colorMode === 'distance') colorLogic = buildDistanceColor(state.dMin, state.dMax, state.dStart, state.dEnd, state.dRepeat, state.dMode);

    pcdMesh.material = new THREE.ShaderMaterial({
        uniforms: { uSize: { value: state.pointSize } },
        vertexShader,
        fragmentShader: `
            precision highp float;
            varying vec3 vColor; 
            varying vec3 vPosition; 
            varying vec3 vOriginal; 
            void main() { ${filterLogic} ${colorLogic} }
        `,
        vertexColors: true,
        depthTest: true,
        depthWrite: true,
        transparent: false
    });
}
