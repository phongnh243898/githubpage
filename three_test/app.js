import * as THREE from 'three';
import { PCDLoader } from 'three/addons/loaders/PCDLoader.js';
import CustomControls from './CustomControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

let sharedTarget = new THREE.Vector3(0, 0, 0);
let pcdObject = null;
const frustumSize = 15;

// --- Helper tạo View Orthographic ---
function createOrthoView(id, pos, lookDir, upDir = new THREE.Vector3(0, 1, 0)) {
    const container = document.getElementById(id);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const aspect = container.clientWidth / container.clientHeight;
    const cam = new THREE.OrthographicCamera(-frustumSize * aspect, frustumSize * aspect, frustumSize, -frustumSize, 0.1, 1000);
    cam.position.copy(pos);
    cam.up.copy(upDir);

    const controls = new CustomControls(cam);
    controls.setDirection(lookDir);

    return { container, renderer, cam, controls };
}

// 1. Perspective View
const pContainer = document.getElementById('view-persp');
const pRenderer = new THREE.WebGLRenderer({ antialias: true });
pRenderer.setSize(pContainer.clientWidth, pContainer.clientHeight);
pContainer.appendChild(pRenderer.domElement);
const pCam = new THREE.PerspectiveCamera(75, pContainer.clientWidth / pContainer.clientHeight, 0.1, 1000);
pCam.position.set(10, 10, 10);
const pControls = new CustomControls(pCam);
pControls.setDirection(sharedTarget.clone().sub(pCam.position));

// 2. Ortho Views
const vTop = createOrthoView('view-top', new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1));
const vFront = createOrthoView('view-front', new THREE.Vector3(0, 0, 50), new THREE.Vector3(0, 0, -1));
const vLeft = createOrthoView('view-left', new THREE.Vector3(-50, 0, 0), new THREE.Vector3(1, 0, 0));

const allViews = [
    { name: 'persp', container: pContainer, renderer: pRenderer, cam: pCam, controls: pControls, isOrtho: false },
    { name: 'top', ...vTop, isOrtho: true },
    { name: 'front', ...vFront, isOrtho: true },
    { name: 'left', ...vLeft, isOrtho: true }
];

function syncAll() {
    // Đồng bộ vị trí các camera Ortho theo sharedTarget nhưng giữ khoảng cách xa (50)
    vTop.cam.position.set(sharedTarget.x, 50, sharedTarget.z);
    vFront.cam.position.set(sharedTarget.x, sharedTarget.y, 50);
    vLeft.cam.position.set(-50, sharedTarget.y, sharedTarget.z);
    
    allViews.forEach(v => v.controls.update());
}

const setupEvents = (view) => {
    const { container, controls, cam, isOrtho } = view;

    container.addEventListener('mousemove', (e) => {
        if (document.activeElement !== container) return;
        const sens = 0.005;

        if (e.buttons === 1) { // Left Click
            if (!isOrtho) {
                const distance = cam.position.distanceTo(sharedTarget);
                if (e.shiftKey) controls.rotLocal(0, 0, -e.movementX * sens);
                else controls.rotLocal(-e.movementY * sens, -e.movementX * sens, 0);
                
                const forward = controls.Direction();
                cam.position.copy(sharedTarget.clone().sub(forward.multiplyScalar(distance)));
                controls.normalizeAxes();
            } else {
                // Pan cho Ortho
                const zoomFactor = (cam.top - cam.bottom) / (cam.zoom * container.clientHeight);
                const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0);
                const up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
                const delta = right.multiplyScalar(-e.movementX * zoomFactor).add(up.multiplyScalar(e.movementY * zoomFactor));
                sharedTarget.add(delta);
                pCam.position.add(delta);
            }
            syncAll();
        }

        if (e.buttons === 2) { // Right Click: Pan chung
            const moveSpeed = isOrtho ? 0.02 : 0.03;
            const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0);
            const up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
            const delta = right.multiplyScalar(-e.movementX * moveSpeed).add(up.multiplyScalar(e.movementY * moveSpeed));
            sharedTarget.add(delta);
            pCam.position.add(delta);
            syncAll();
        }
    });

    container.addEventListener('wheel', (e) => {
        if (document.activeElement !== container) return;
        if (!isOrtho) {
            cam.fov = THREE.MathUtils.clamp(cam.fov + e.deltaY * 0.05, 5, 120);
        } else {
            cam.zoom = THREE.MathUtils.clamp(cam.zoom - e.deltaY * 0.001, 0.1, 50);
        }
        cam.updateProjectionMatrix();
    }, { passive: true });

    container.addEventListener('contextmenu', e => e.preventDefault());
};

allViews.forEach(setupEvents);

// Upload PCD
document.getElementById('pcd-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const loader = new PCDLoader();
        const points = loader.parse(event.target.result);
        if (pcdObject) scene.remove(pcdObject);
        pcdObject = points;
        pcdObject.material.size = 0.05; // Chỉnh kích thước điểm cho dễ nhìn
        scene.add(pcdObject);
    };
    reader.readAsArrayBuffer(file);
});

function animate() {
    requestAnimationFrame(animate);
    allViews.forEach(v => v.renderer.render(scene, v.cam));
}
animate();

window.addEventListener('resize', () => {
    allViews.forEach(v => {
        const w = v.container.clientWidth;
        const h = v.container.clientHeight;
        v.renderer.setSize(w, h);
        if (!v.isOrtho) {
            v.cam.aspect = w / h;
        } else {
            const aspect = w / h;
            v.cam.left = -frustumSize * aspect;
            v.cam.right = frustumSize * aspect;
        }
        v.cam.updateProjectionMatrix();
    });
});