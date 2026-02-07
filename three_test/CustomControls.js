import * as THREE from 'three';

export class CustomControls {
    constructor(container, camera, target) {
        this.container = container;
        this.camera = camera;
        this.target = target ? target.clone() : new THREE.Vector3(0, 0, 0);
        
        this.config = {
            rotateSpeed: 0.005,
            panSpeed: 1.0,
            zoomSpeed: 0.1
        };

        this.mouseState = { dragging: false, button: null, lastX: 0, lastY: 0 };
        
        // Khởi tạo userData.zoomLevel cho orthographic camera
        if (!this.camera.isPerspectiveCamera) {
            this.camera.userData.zoomLevel = 15;
        }
        
        this.initEvents();
    }

    normalizeMatrix() {
        this.camera.updateMatrixWorld(true);
        const m = this.camera.matrixWorld;
        const e = m.elements;
        const x = new THREE.Vector3(e[0], e[1], e[2]).normalize();
        const y = new THREE.Vector3(e[4], e[5], e[6]);
        y.sub(x.clone().multiplyScalar(y.dot(x))).normalize();
        
        e[0] = x.x; e[1] = x.y; e[2] = x.z;
        e[4] = y.x; e[5] = y.y; e[6] = y.z;
        this.camera.matrix.copy(m);
        this.camera.matrix.decompose(this.camera.position, this.camera.quaternion, this.camera.scale);
    }

    rotateOrbit(dx, dy) {
        const offset = this.camera.position.clone().sub(this.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        
        spherical.theta -= dx * this.config.rotateSpeed;
        spherical.phi -= dy * this.config.rotateSpeed;
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
        
        offset.setFromSpherical(spherical);
        this.camera.position.copy(this.target).add(offset);
        this.camera.lookAt(this.target);
        this.normalizeMatrix();
    }

    pan(dx, dy) {
        const rect = this.container.getBoundingClientRect();
        const worldX = (dx / rect.width) * this.camera.userData.zoomLevel * 2;
        const worldY = (dy / rect.height) * this.camera.userData.zoomLevel * 2;

        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);

        const move = right.multiplyScalar(-worldX).add(up.multiplyScalar(worldY));
        this.camera.position.add(move);
        this.target.add(move);
    }

    zoom(delta) {
        if (this.camera.isPerspectiveCamera) {
            const dir = this.camera.position.clone().sub(this.target).normalize();
            this.camera.position.add(dir.multiplyScalar(delta * this.config.zoomSpeed * 10));
        } else {
            this.camera.userData.zoomLevel += delta * this.config.zoomSpeed * 5;
            this.camera.userData.zoomLevel = Math.max(0.1, this.camera.userData.zoomLevel);
            this.updateOrthoProjection();
        }
    }

    updateOrthoProjection() {
        if (!this.camera.isPerspectiveCamera) {
            const aspect = this.container.clientWidth / this.container.clientHeight;
            const zoom = this.camera.userData.zoomLevel;
            this.camera.left = -zoom * aspect;
            this.camera.right = zoom * aspect;
            this.camera.top = zoom;
            this.camera.bottom = -zoom;
            this.camera.updateProjectionMatrix();
        }
    }

    initEvents() {
        this.container.addEventListener('mousedown', e => {
            this.mouseState.dragging = true;
            this.mouseState.button = e.button;
            this.mouseState.lastX = e.clientX;
            this.mouseState.lastY = e.clientY;
        });

        window.addEventListener('mousemove', e => {
            if (!this.mouseState.dragging) return;
            const dx = e.clientX - this.mouseState.lastX;
            const dy = e.clientY - this.mouseState.lastY;
            this.mouseState.lastX = e.clientX;
            this.mouseState.lastY = e.clientY;

            if (this.camera.isPerspectiveCamera) {
                this.rotateOrbit(dx, dy);
            } else {
                this.pan(dx, dy);
            }
        });

        window.addEventListener('mouseup', () => {
            this.mouseState.dragging = false;
        });

        this.container.addEventListener('wheel', e => {
            e.preventDefault();
            this.zoom(Math.sign(e.deltaY));
        }, { passive: false });

        this.container.addEventListener('contextmenu', e => e.preventDefault());
    }
}
