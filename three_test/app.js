import * as THREE from 'three';
import { PCDLoader } from 'three/addons/loaders/PCDLoader.js';
import { CustomControls } from './CustomControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

let sharedTarget = new THREE.Vector3(0, 0, 0);
let pcdObject = null;
const frustumSize = 15;

// Tạo 4 camera
const cameras = {
    persp: null,
    top: null,
    front: null,
    left: null
};

// Camera Perspective
const mainContainer = document.getElementById('view-main');
const mainRenderer = new THREE.WebGLRenderer({ antialias: true });
mainRenderer.setSize(mainContainer.clientWidth, mainContainer.clientHeight);
mainContainer.appendChild(mainRenderer.domElement);

cameras.persp = new THREE.PerspectiveCamera(75, mainContainer.clientWidth / mainContainer.clientHeight, 0.1, 1000);
cameras.persp.position.set(10, 10, 10);
cameras.persp.lookAt(sharedTarget);

const mainControls = new CustomControls(mainContainer, cameras.persp, sharedTarget);

// Camera Orthographic - Top
const topContainer = document.getElementById('view-top');
const topRenderer = new THREE.WebGLRenderer({ antialias: true });
topRenderer.setSize(topContainer.clientWidth, topContainer.clientHeight);
topContainer.appendChild(topRenderer.domElement);

const aspect = topContainer.clientWidth / topContainer.clientHeight;
cameras.top = new THREE.OrthographicCamera(-frustumSize * aspect, frustumSize * aspect, frustumSize, -frustumSize, 0.1, 1000);
cameras.top.position.set(0, 50, 0);
cameras.top.up.set(0, 0, -1);
cameras.top.lookAt(0, 0, 0);
cameras.top.userData.zoomLevel = frustumSize;

const topControls = new CustomControls(topContainer, cameras.top, sharedTarget);

// Camera Orthographic - Front
const frontContainer = document.getElementById('view-front');
const frontRenderer = new THREE.WebGLRenderer({ antialias: true });
frontRenderer.setSize(frontContainer.clientWidth, frontContainer.clientHeight);
frontContainer.appendChild(frontRenderer.domElement);

cameras.front = new THREE.OrthographicCamera(-frustumSize * aspect, frustumSize * aspect, frustumSize, -frustumSize, 0.1, 1000);
cameras.front.position.set(0, 0, 50);
cameras.front.lookAt(0, 0, 0);
cameras.front.userData.zoomLevel = frustumSize;

const frontControls = new CustomControls(frontContainer, cameras.front, sharedTarget);

// Camera Orthographic - Left
const leftContainer = document.getElementById('view-left');
const leftRenderer = new THREE.WebGLRenderer({ antialias: true });
leftRenderer.setSize(leftContainer.clientWidth, leftContainer.clientHeight);
leftContainer.appendChild(leftRenderer.domElement);

cameras.left = new THREE.OrthographicCamera(-frustumSize * aspect, frustumSize * aspect, frustumSize, -frustumSize, 0.1, 1000);
cameras.left.position.set(-50, 0, 0);
cameras.left.lookAt(0, 0, 0);
cameras.left.userData.zoomLevel = frustumSize;

const leftControls = new CustomControls(leftContainer, cameras.left, sharedTarget);

// Lưu trữ thông tin các view
const views = {
    main: { container: mainContainer, renderer: mainRenderer, camera: cameras.persp, controls: mainControls, name: 'PERSPECTIVE' },
    top: { container: topContainer, renderer: topRenderer, camera: cameras.top, controls: topControls, name: 'TOP (Y+)' },
    front: { container: frontContainer, renderer: frontRenderer, camera: cameras.front, controls: frontControls, name: 'FRONT (Z+)' },
    left: { container: leftContainer, renderer: leftRenderer, camera: cameras.left, controls: leftControls, name: 'LEFT (X-)' }
};

let currentMainView = 'persp';

// Hàm chuyển đổi camera
function switchToMain(viewName) {
    if (viewName === currentMainView) return;
    
    // Lưu camera hiện tại
    const oldMain = views.main;
    const newMain = views[viewName];
    
    // Hoán đổi camera và renderer
    const tempCamera = oldMain.camera;
    const tempRenderer = oldMain.renderer;
    const tempControls = oldMain.controls;
    const tempName = oldMain.name;
    
    // Xóa renderer cũ
    oldMain.container.innerHTML = '';
    newMain.container.innerHTML = '';
    
    // Gán renderer mới
    oldMain.container.appendChild(newMain.renderer.domElement);
    newMain.container.appendChild(tempRenderer.domElement);
    
    // Cập nhật kích thước
    newMain.renderer.setSize(newMain.container.clientWidth, newMain.container.clientHeight);
    tempRenderer.setSize(oldMain.container.clientWidth, oldMain.container.clientHeight);
    
    // Hoán đổi thông tin
    oldMain.camera = newMain.camera;
    oldMain.renderer = newMain.renderer;
    oldMain.controls = newMain.controls;
    oldMain.name = newMain.name;
    
    newMain.camera = tempCamera;
    newMain.renderer = tempRenderer;
    newMain.controls = tempControls;
    newMain.name = tempName;
    
    // Cập nhật controls container
    oldMain.controls.container = oldMain.container;
    newMain.controls.container = newMain.container;
    
    // Cập nhật label
    document.getElementById('main-label').textContent = oldMain.name;
    newMain.container.parentElement.querySelector('.label').textContent = newMain.name;
    
    // Cập nhật camera aspect
    if (tempCamera.isPerspectiveCamera) {
        tempCamera.aspect = newMain.container.clientWidth / newMain.container.clientHeight;
    }
    if (oldMain.camera.isPerspectiveCamera) {
        oldMain.camera.aspect = oldMain.container.clientWidth / oldMain.container.clientHeight;
    }
    
    tempCamera.updateProjectionMatrix();
    oldMain.camera.updateProjectionMatrix();
    
    currentMainView = viewName;
}

// Gắn sự kiện cho các nút chuyển đổi
document.querySelectorAll('.switch-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const viewName = btn.getAttribute('data-view');
        switchToMain(viewName);
    });
});

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
        pcdObject.material.size = 0.05;
        scene.add(pcdObject);
    };
    reader.readAsArrayBuffer(file);
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    Object.values(views).forEach(v => {
        v.renderer.render(scene, v.camera);
    });
}
animate();

// Resize handler
window.addEventListener('resize', () => {
    Object.values(views).forEach(v => {
        const w = v.container.clientWidth;
        const h = v.container.clientHeight;
        v.renderer.setSize(w, h);
        
        if (v.camera.isPerspectiveCamera) {
            v.camera.aspect = w / h;
        } else {
            const aspect = w / h;
            const zoom = v.camera.userData.zoomLevel;
            v.camera.left = -zoom * aspect;
            v.camera.right = zoom * aspect;
            v.camera.top = zoom;
            v.camera.bottom = -zoom;
        }
        v.camera.updateProjectionMatrix();
    });
});
