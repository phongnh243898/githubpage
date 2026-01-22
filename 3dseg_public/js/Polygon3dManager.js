import * as THREE from 'three';
import { Polygon3d } from './Polygon3d.js';

/**
 * Quản lý polygon 3D trên mặt phẳng OXY (raycast)
 */
export class Polygon3dManager {
    /**
     * @param {Object} options
     * @param {THREE.Scene} options.scene
     * @param {THREE.Camera} options.camera
     * @param {THREE.WebGLRenderer} options.renderer
     * @param {THREE.Mesh} options.planeMesh - mặt phẳng OXY để raycast
     * @param {number[]} [options.colorOptions]
     * @param {Object} [options.config]
     *   - vertexHover: bán kính bắt đỉnh trong không gian 3D (mặc định 3.0)
     *   - edgeHover: bán kính bắt cạnh trong không gian 3D (mặc định 1.2)
     *   - vertexHoverPx: bán kính bắt đỉnh trên màn hình (pixel) cho thao tác undo bằng chuột phải (mặc định 10)
     *   - vertexSize: kích thước vertex (mặc định 12)
     *   - thickness: độ dày edge (mặc định 2)
     */
    constructor(options) {
        this.scene = options.scene;
        this.camera = options.camera;
        this.renderer = options.renderer;
        this.planeMesh = options.planeMesh;
        this.colorOptions = options.colorOptions || [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0xffffff];

        const cfg = options.config || {};
        this.vertexHover = cfg.vertexHover ?? 1.0;
        this.edgeHover   = cfg.edgeHover   ?? 1.0;
        this.vertexHoverPx = cfg.vertexHoverPx ?? 1.0;
        this.vertexSize  = cfg.vertexSize  ?? 5;
        this.thickness   = cfg.thickness   ?? 2;

        this.polygons = [];
        this.selectedPolygon = null;
        this.mode = 'IDLE';
        this.isDragging = false;
        this.dragIndex = -1;
        this.history = [];
        this.maxHistory = 50;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.setupEvents();
    }

    // --- History (Undo) ---
    serializeState() {
        return {
            polygons: this.polygons.map(p => ({
                id: p.id,
                points: p.points.map(v => [v.x, v.y, v.z]),
                color: p.style.color,
                active: p.active
            })),
            selectedId: this.selectedPolygon ? this.selectedPolygon.id : null,
            mode: this.mode
        };
    }

    saveHistory() {
        const snapshot = this.serializeState();
        this.history.push(snapshot);
        if (this.history.length > this.maxHistory) this.history.shift();
    }

    restoreState(state) {
        this.polygons.forEach(p => this.scene.remove(p.visuals.container));
        this.polygons = [];
        this.selectedPolygon = null;

        state.polygons.forEach(sp => {
            const poly = new Polygon3d(sp.id, {
                color: sp.color,
                vertexSize: this.vertexSize,
                thickness: this.thickness
            });
            poly.points = sp.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
            poly.active = sp.active;
            this._configureFrustum(poly);
            this.scene.add(poly.visuals.container);
            this.polygons.push(poly);
        });

        if (state.selectedId) {
            this.selectedPolygon = this.polygons.find(p => p.id === state.selectedId) || null;
        }
        this.mode = 'IDLE';
        this.updateUIIdle();
        this.renderAll();
    }

    undo() {
        if (this.history.length === 0) return;
        const last = this.history.pop();
        this.restoreState(last);
    }

    // --- UI helpers ---
    updateUIIdle() {
        const modeEl = document.getElementById('mode-text');
        const hintEl = document.getElementById('hint');
        if (modeEl) modeEl.innerHTML = `Chế độ: <span class="active-mode">IDLE</span>`;
        if (hintEl) hintEl.innerText = "Nhấn E để bắt đầu vẽ";
    }

    setMode(m) {
        // không tự động save nếu chỉ chuyển mode; chỉ save khi có thay đổi hình học
        this.exitCurrentOperation(false);
        this.mode = m;
        const modeEl = document.getElementById('mode-text');
        const hintEl = document.getElementById('hint');
        if (modeEl) modeEl.innerHTML = `Chế độ: <span class="active-mode">${m}</span>`;
        if (m === 'CREATE') {
            this.saveHistory(); // lưu trạng thái trước khi tạo polygon mới
            this.polygons.forEach(p => p.active = false);
            const poly = new Polygon3d(Date.now(), {
                color: this.colorOptions[0],
                vertexSize: this.vertexSize,
                thickness: this.thickness
            });
            this._configureFrustum(poly);
            poly.active = true;
            this.polygons.push(poly);
            this.selectedPolygon = poly;
            this.scene.add(poly.visuals.container);
            if (hintEl) hintEl.innerText = "Click trái để thêm điểm. Chuột phải vào điểm cuối để undo điểm cuối. Esc để đóng.";
        } else {
            if (hintEl) hintEl.innerText = "Click vào cạnh/điểm của Polygon để chọn (Active).";
        }
    }

    finalizeSelectedPolygon(saveIfChanged = false) {
        if (!this.selectedPolygon) return;
        const pts = this.selectedPolygon.points;
        const hasPoints = pts.length > 0;
        if (saveIfChanged && hasPoints) this.saveHistory();

        if (pts.length < 3) {
            this.scene.remove(this.selectedPolygon.visuals.container);
            this.polygons = this.polygons.filter(p => p !== this.selectedPolygon);
        }
        this.selectedPolygon.active = false;
        this.selectedPolygon.render();
        this.selectedPolygon = null;
    }

    exitCurrentOperation(shouldSave = false) {
        // chỉ lưu nếu đang có polygon chưa finalize và được yêu cầu save
        this.finalizeSelectedPolygon(shouldSave);
        this.polygons.forEach(p => p.active = false);
        this.mode = 'IDLE';
        this.updateUIIdle();
        this.renderAll();
    }

    // --- Events ---
    setupEvents() {
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'e') this.setMode('CREATE');
            if (e.key.toLowerCase() === 'p') this.setMode('SELECT');
            if (e.key === 'Escape') this.exitCurrentOperation(true);
            if (e.key === 'Delete') this.deleteActive();
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.cycleColor();
            }
            if (e.key === 'z' && e.ctrlKey) { e.preventDefault(); this.undo(); }
        });

        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mouseup', () => { this.isDragging = false; this.dragIndex = -1; });
        window.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // --- Mouse helpers ---
    updateMouseFromEvent(e) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    handleMouseMove(e) {
        this.updateMouseFromEvent(e);
        const point = this.getIntersectPoint();
        if (!point) return;

        if (this.mode === 'CREATE' && this.selectedPolygon) {
            this.selectedPolygon.render(point, true);
        } else if (this.mode === 'SELECT') {
            if (this.isDragging && this.selectedPolygon) {
                this.selectedPolygon.points[this.dragIndex].copy(point);
                this.selectedPolygon.render();
            } else {
                this.updateCursorFeedback(point);
            }
        }
    }

    handleMouseDown(e) {
        this.updateMouseFromEvent(e);
        const point = this.getIntersectPoint();
        if (!point) return;

        if (this.mode === 'CREATE') {
            // Chuột phải vào vertex cuối -> undo vertex cuối (dựa trên screen-space để tránh nhầm)
            if (e.button === 2 && this.selectedPolygon && this.selectedPolygon.points.length > 0) {
                const last = this.selectedPolygon.points[this.selectedPolygon.points.length - 1];
                if (this.isCursorNearPoint(e, last)) {
                    this.saveHistory();
                    this.selectedPolygon.points.pop();
                    this.selectedPolygon.render(point, true);
                }
                return;
            }
            // Chuột trái thêm điểm
            if (e.button === 0 && this.selectedPolygon) {
                this.saveHistory();
                this.selectedPolygon.points.push(point.clone());
                this.selectedPolygon.render(point, true);
            }
        }
        else if (this.mode === 'SELECT') {
            const target = this.findNearest(point);

            if (target.polygon) {
                // Click đầu: chỉ kích hoạt polygon đó, không lưu lịch sử
                if (this.selectedPolygon !== target.polygon) {
                    this.polygons.forEach(p => p.active = false);
                    this.selectedPolygon = target.polygon;
                    this.selectedPolygon.active = true;
                    this.polygons.forEach(p => p.render());
                    return;
                }

                // Đã active: cho phép sửa (lưu trước khi đổi)
                if (this.selectedPolygon.active) {
                    if (e.button === 0) {
                        this.saveHistory();
                        if (target.vIdx !== -1) {
                            this.isDragging = true;
                            this.dragIndex = target.vIdx;
                        } else if (target.eIdx !== -1) {
                            // insert vertex vào edge
                            this.selectedPolygon.points.splice(target.eIdx + 1, 0, point.clone());
                        }
                    } else if (e.button === 2 && target.vIdx !== -1) {
                        this.saveHistory();
                        this.selectedPolygon.points.splice(target.vIdx, 1);
                        if (this.selectedPolygon.points.length < 3) this.exitCurrentOperation(false);
                    }
                }
            }
            this.renderAll();
        }
    }

    // --- Cursor feedback ---
    updateCursorFeedback(point) {
        const target = this.findNearest(point);
        if (target.polygon && target.polygon.active) {
            if (target.vIdx !== -1) document.body.style.cursor = 'grab';
            else if (target.eIdx !== -1) document.body.style.cursor = 'crosshair';
            else document.body.style.cursor = 'pointer';
        } else if (target.polygon) {
            document.body.style.cursor = 'pointer';
        } else {
            document.body.style.cursor = 'default';
        }
    }

    // --- Hit tests (ưu tiên vertex) ---
    findNearest(point) {
        // 1) Ưu tiên vertex
        let bestVertex = { polygon: null, vIdx: -1, dist: Infinity };
        for (const poly of this.polygons) {
            poly.points.forEach((p, i) => {
                const d = p.distanceTo(point);
                if (d < this.vertexHover && d < bestVertex.dist) {
                    bestVertex = { polygon: poly, vIdx: i, dist: d };
                }
            });
        }
        if (bestVertex.polygon) {
            return { polygon: bestVertex.polygon, vIdx: bestVertex.vIdx, eIdx: -1, dist: bestVertex.dist };
        }

        // 2) Không có vertex trong ngưỡng -> xét edge
        let bestEdge = { polygon: null, eIdx: -1, dist: Infinity };
        for (const poly of this.polygons) {
            for (let i = 0; i < poly.points.length; i++) {
                const p1 = poly.points[i];
                const p2 = poly.points[(i + 1) % poly.points.length];
                const d = this.distToSegment(point, p1, p2);
                if (d < this.edgeHover && d < bestEdge.dist) {
                    bestEdge = { polygon: poly, eIdx: i, dist: d };
                }
            }
        }
        if (bestEdge.polygon) {
            return { polygon: bestEdge.polygon, vIdx: -1, eIdx: bestEdge.eIdx, dist: bestEdge.dist };
        }

        // 3) Không bắt được gì
        return { polygon: null, vIdx: -1, eIdx: -1, dist: Infinity };
    }

    getIntersectPoint() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.planeMesh);
        return intersects.length > 0 ? intersects[0].point : null;
    }

    distToSegment(p, a, b) {
        const v = new THREE.Vector3().subVectors(b, a);
        const w = new THREE.Vector3().subVectors(p, a);
        const c1 = w.dot(v);
        if (c1 <= 0) return p.distanceTo(a);
        const c2 = v.dot(v);
        if (c2 <= c1) return p.distanceTo(b);
        return p.distanceTo(new THREE.Vector3().addVectors(a, v.multiplyScalar(c1 / c2)));
    }

    // --- Screen-space proximity for right-click undo ---
    isCursorNearPoint(e, point) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const projected = point.clone().project(this.camera);
        const sx = (projected.x * 0.5 + 0.5) * rect.width + rect.left;
        const sy = (-projected.y * 0.5 + 0.5) * rect.height + rect.top;
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        return Math.hypot(dx, dy) <= this.vertexHoverPx;
    }

    // --- Actions ---
    cycleColor() {
        if (!this.selectedPolygon) return;
        this.saveHistory();
        const currIndex = this.colorOptions.indexOf(this.selectedPolygon.style.color);
        const nextColor = this.colorOptions[(currIndex + 1) % this.colorOptions.length];
        this.selectedPolygon.updateStyle({
            color: nextColor,
            vertexSize: this.vertexSize,
            thickness: this.thickness
        });
        this.renderAll();
    }

    deleteActive() {
        if (this.selectedPolygon) {
            this.saveHistory();
            this.scene.remove(this.selectedPolygon.visuals.container);
            this.polygons = this.polygons.filter(p => p !== this.selectedPolygon);
            this.selectedPolygon = null;
        }
    }

    renderAll() { this.polygons.forEach(p => p.render()); }

    // --- Utils ---
    _configureFrustum(poly) {
        poly.visuals.container.frustumCulled = false;
        poly.visuals.mainLine.frustumCulled = false;
        poly.visuals.vertices.frustumCulled = false;
        poly.visuals.previewLine.frustumCulled = false;
    }
} 