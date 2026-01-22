import * as THREE from 'three';
import { PCDLoader } from 'three/addons/loaders/PCDLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { updatePCDShader } from './helper_shader_pcd.js';
import { Polygon3d } from './Polygon3d.js';
import { Polygon3dManager } from './Polygon3dManager.js';

const CATEGORY_LIST = [
  { id: 205340, name: 'undrivable', color: '#ff0000' },
  { id: 205341, name: 'things',      color: '#ffff00' },
  { id: 205342, name: 'construction',color: '#800080' },
  { id: 205343, name: 'uneven',      color: '#ffffff' },
];

const render3d = document.getElementById('render3d');
if (!render3d) throw new Error('#render3d not found');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(0xa0a0a0, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
render3d.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const persCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10000);
persCam.position.set(15, 15, 15);
const orthoCam = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.01, 10000);
orthoCam.up.set(0, 1, 0);
orthoCam.position.set(0, 0, 100);

const axes = new THREE.AxesHelper(5);
axes.renderOrder = 1500;
axes.traverse(obj => {
  if (obj.material) { obj.material.depthTest = false; obj.material.depthWrite = false; }
});
scene.add(axes);

const planeGeom = new THREE.PlaneGeometry(10000, 10000);
const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
const planeMesh = new THREE.Mesh(planeGeom, planeMat);
scene.add(planeMesh);

let camera = persCam;
let controls = new OrbitControls(camera, renderer.domElement);
let points = null;
let isRendering = false;
let activeRegion = 'render3d';
let currentPcdName = null;

const polyMgr = new Polygon3dManager({
  scene,
  camera,
  renderer,
  planeMesh,
  colorOptions: CATEGORY_LIST.map(c => new THREE.Color(c.color).getHex()),
  config: { vertexSize: 5, thickness: 2, vertexHover: 0.1, edgeHover: 0.1, vertexHoverPx: 0.1, }
});

const basename = (p = '') => p.split(/[\\/]/).pop() || '';
const isPcdNameMatch = (jsonName, loadedName) =>
  jsonName && loadedName && basename(jsonName).toLowerCase() === basename(loadedName).toLowerCase();

function setActiveRegion(region) {
  activeRegion = region;
  if (region === 'render3d') startRender(); else stopRender();
}

function resizeRenderer() {
  const { clientWidth, clientHeight } = render3d;
  renderer.setSize(clientWidth, clientHeight);
  if (camera.isPerspectiveCamera) {
    camera.aspect = clientWidth / clientHeight;
  } else {
    const aspect = clientWidth / clientHeight;
    const viewSize = 20;
    camera.left = -viewSize * aspect;
    camera.right = viewSize * aspect;
    camera.top = viewSize;
    camera.bottom = -viewSize;
  }
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resizeRenderer);

function setupControls(is2D) {
  const target = controls.target ? controls.target.clone() : new THREE.Vector3();
  const lastZoom = camera.zoom;
  controls.dispose();

  if (is2D) {
    camera = orthoCam;
    orthoCam.position.copy(target).add(new THREE.Vector3(0, 0, 100));
    orthoCam.lookAt(target);
    orthoCam.zoom = lastZoom;
    orthoCam.updateProjectionMatrix();

    controls = new MapControls(camera, renderer.domElement);
    controls.enableRotate = false;
    controls.screenSpacePanning = true;
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.target.copy(target);
  } else {
    camera = persCam;
    const dir = persCam.position.clone().sub(target).normalize().multiplyScalar(15);
    persCam.position.copy(target.clone().add(dir));
    persCam.lookAt(target);
    persCam.updateProjectionMatrix();

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
  }
  controls.update();
  resizeRenderer();
  polyMgr.camera = camera; // sync camera for raycasting
}

document.getElementById('colorMode')?.addEventListener('change', e => {
  const show = (e.target.value === 'height' || e.target.value === 'distance') ? 'block' : 'none';
  document.getElementById('gradOpts').style.display = show;
});
document.getElementById('fType')?.addEventListener('change', e => {
  document.getElementById('filterOpts').style.display = (e.target.value === 'none') ? 'none' : 'block';
});

function applyShader() {
  if (!points) return;
  const is2D = document.getElementById('oxy').checked;
  setupControls(is2D);
  const fType = document.getElementById('fType').value;
  updatePCDShader(THREE, points, {
    pointSize: parseFloat(document.getElementById('size').value),
    colorMode: document.getElementById('colorMode').value,
    hZMin: parseFloat(document.getElementById('min').value), hZMax: parseFloat(document.getElementById('max').value),
    hStart: new THREE.Color(document.getElementById('c1').value), hEnd: new THREE.Color(document.getElementById('c2').value),
    hRepeat: parseFloat(document.getElementById('rep').value), hMode: document.getElementById('mode').value,
    dMin: parseFloat(document.getElementById('min').value), dMax: parseFloat(document.getElementById('max').value),
    dStart: new THREE.Color(document.getElementById('c1').value), dEnd: new THREE.Color(document.getElementById('c2').value),
    dRepeat: parseFloat(document.getElementById('rep').value), dMode: document.getElementById('mode').value,
    filterType: fType,
    fMin: parseFloat(document.getElementById('fMin').value),
    fMax: parseFloat(document.getElementById('fMax').value),
    projectOXY: is2D
  });
}

function pickImageIdForJson(data) {
  const images = Array.isArray(data.images) ? data.images : [];
  const pcdImages = images.filter(img => typeof img.file_name === 'string' && img.file_name.toLowerCase().endsWith('.pcd'));
  if (!pcdImages.length) return null;
  if (currentPcdName) {
    const match = pcdImages.find(img => isPcdNameMatch(img.file_name, currentPcdName));
    if (match) return match.id;
  }
  return pcdImages[0].id;
}

function loadJsonPolygons(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

      // If file matches serializeState format
      if (data.polygons && Array.isArray(data.polygons)) {
        polyMgr.restoreState(data);
        return;
      }

      // Otherwise try annotations format
      const imageId = pickImageIdForJson(data);
      const anns = Array.isArray(data.annotations) ? data.annotations : [];
      const filtered = imageId == null
        ? anns.filter(a => a.shape === 'polygon' && a.type === '3D')
        : anns.filter(a => a.image_id === imageId && a.shape === 'polygon' && a.type === '3D');

      // Reset current polygons
      polyMgr.polygons.forEach(p => polyMgr.scene.remove(p.visuals.container));
      polyMgr.polygons = [];
      polyMgr.selectedPolygon = null;

      filtered.forEach((ann, idx) => {
        const poly = new Polygon3d(ann.id || idx, {
          color: CATEGORY_LIST[idx % CATEGORY_LIST.length].color
        });
        const pts = Array.isArray(ann.points) ? ann.points : ann.segmentation;
        if (Array.isArray(pts)) {
          poly.points = pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
        }
        poly.active = false;
        poly.render();
        scene.add(poly.visuals.container);
        polyMgr.polygons.push(poly);
      });
      polyMgr.renderAll();
    } catch (err) {
      console.error('Invalid JSON', err);
    }
  };
  reader.readAsText(file);
}

document.getElementById('pcdFile')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'json') {
    loadJsonPolygons(file);
    return;
  }
  if (ext === 'pcd') {
    currentPcdName = basename(file.name);
    new PCDLoader().load(URL.createObjectURL(file), p => {
      if (points) scene.remove(points);
      points = p;
      scene.add(points);
      applyShader();
    });
  }
});

document.getElementById('apply')?.addEventListener('click', applyShader);

document.getElementById('export')?.addEventListener('click', () => {
  const data = polyMgr.serializeState ? polyMgr.serializeState() : { polygons: [] };
  data.categories = CATEGORY_LIST.map(c => ({ id: c.id, name: c.name }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'polygons.json';
  a.click();
  URL.revokeObjectURL(url);
});

const sidebar = document.getElementById('sidebarRight');
document.getElementById('settingBtn')?.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  requestAnimationFrame(resizeRenderer);
});

render3d.addEventListener('click', () => setActiveRegion('render3d'));
document.getElementById('view-video3d')?.addEventListener('pointerdown', () => setActiveRegion('video'));

function animate() {
  if (!isRendering) return;
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
function startRender() {
  if (isRendering) return;
  isRendering = true;
  animate();
}
function stopRender() { isRendering = false; }

resizeRenderer();
startRender();