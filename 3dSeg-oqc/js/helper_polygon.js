import * as THREE from 'three';

// Luôn chỉ sửa color tại đây khi cần thêm category mới!
const DEFAULT_CATEGORY_LIST = [
    { id: 207733, name: 'undrivable',   color: 0xff0000 },
    { id: 207734, name: 'things',       color: 0xffff00 },
    { id: 207735, name: 'construction', color: 0x800080 },
    { id: 207736, name: 'uneven',       color: 0xffffff }
];

export class PolygonManager {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.polygons = [];
        this.current = null;
        this.isDrawing = false;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Line = { threshold: 1 };
        this.raycaster.params.Points = { threshold: 3 };
        this.selected = null;
        this.categoryList = [...DEFAULT_CATEGORY_LIST];
        this.flatten = false;
        this.draggedHandle = null;
        this.draggedPoly = null;
        
        // Preview edges (nét đứt): 2 đoạn
        this.previewLine1 = null; // điểm cuối → chuột
        this.previewLine2 = null; // chuột → điểm đầu
        
        // Hover state
        this.hoveredHandle = null;
        this.hoveredEdge = null;
        
        // *** TIỀN CẤP PHÁT geometry pool để tránh lag
        this.geometryPool = [];
        this.materialPool = [];
        this.maxPoolSize = 50;
    }

    // *** Geometry pooling để tránh cấp phát liên tục
    getGeometry(points) {
        let geo = this.geometryPool.pop();
        if (geo) {
            geo.setFromPoints(points);
            geo.attributes.position.needsUpdate = true;
        } else {
            geo = new THREE.BufferGeometry().setFromPoints(points);
        }
        return geo;
    }

    releaseGeometry(geo) {
        if (!geo) return;
        if (this.geometryPool.length < this.maxPoolSize) {
            this.geometryPool.push(geo);
        } else {
            geo.dispose();
        }
    }

    getMaterial(params) {
        const mat = this.materialPool.find(m => 
            m.color.getHex() === params.color.getHex() &&
            m.linewidth === params.linewidth &&
            m.type === params.type
        );
        if (mat) {
            this.materialPool.splice(this.materialPool.indexOf(mat), 1);
            return mat;
        }
        if (params.type === 'dashed') {
            return new THREE.LineDashedMaterial({
                color: params.color,
                linewidth: params.linewidth,
                dashSize: params.dashSize || 0.2,
                gapSize: params.gapSize || 0.1,
                depthTest: true,
                depthWrite: false,
                transparent: true,
                opacity: params.opacity || 0.7
            });
        }
        return new THREE.LineBasicMaterial({
            color: params.color,
            linewidth: params.linewidth,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1.0,
            polygonOffsetUnits: -1.0,
            transparent: true
        });
    }

    releaseMaterial(mat) {
        if (!mat) return;
        if (this.materialPool.length < this.maxPoolSize) {
            this.materialPool.push(mat);
        } else {
            mat.dispose();
        }
    }

    // --- Category handling ---

    setCategories(list = []) {
        if (Array.isArray(list) && list.length) {
            this.categoryList = list.map(c => ({
                id: c.id,
                name: c.name,
                color: (DEFAULT_CATEGORY_LIST.find(d => d.id === c.id)?.color) ?? DEFAULT_CATEGORY_LIST[0].color
            }));
            this.polygons.forEach(p => this.updateHandleStyles(p));
        }
    }
    get defaultCategoryName() { return this.categoryList[0]?.name ?? DEFAULT_CATEGORY_LIST[0].name; }
    get categories() { return this.categoryList; }

    // --- Category color ---
    getCategoryColor(catName) {
        if (!catName) return DEFAULT_CATEGORY_LIST[0].color;
        const found = this.categoryList.find(c => c.name === catName);
        return found ? found.color : DEFAULT_CATEGORY_LIST[0].color;
    }

    // --- Drawing ---

    setFlatten(flag) {
        this.flatten = !!flag;
        this.polygons.forEach(p => {
            this.updateHandleStyles(p);
            this.redraw(p, p.closed);
        });
    }

    start() {
        this.isDrawing = true;
        const catName = this.defaultCategoryName;
        const poly = { points: [], handles: [], line: null, closed: false, categoryName: catName };
        this.polygons.push(poly);
        this.current = poly;
        this.select(poly);
    }

    addPoint(event, camera) {
        if (!this.isDrawing || event.button !== 0 || !this.current) return;
        
        const pos = this.getMousePos(event, camera);
        if (!pos) return;

        // Chỉ thêm điểm mới
        this.current.points.push(pos);
        this.createHandle(this.current, pos);
        this.redraw(this.current, false);
    }

    // Finish polygon (gọi khi nhấn ESC)
    finish() {
        if (!this.current || this.current.points.length < 3) {
            console.warn('Cần ít nhất 3 điểm để tạo polygon');
            return;
        }
        this.current.closed = true;
        this.redraw(this.current, true);
        this.removePreviewLines();
        this.isDrawing = false;
        this.updateHandleVisibility();
    }

    // Cancel drawing
    cancel() {
        if (!this.current) return;
        this.current.handles.forEach(h => {
            if (h.geometry) h.geometry.dispose();
            if (h.material) h.material.dispose();
            this.scene.remove(h);
        });
        if (this.current.line) {
            this.releaseGeometry(this.current.line.geometry);
            this.releaseMaterial(this.current.line.material);
            this.scene.remove(this.current.line);
        }
        const idx = this.polygons.indexOf(this.current);
        if (idx !== -1) this.polygons.splice(idx, 1);
        this.current = null;
        this.isDrawing = false;
        this.removePreviewLines();
    }

    // *** Update preview lines - 2 đoạn (điểm cuối → chuột → điểm đầu)
    updatePreview(event, camera) {
        if (!this.isDrawing || !this.current || this.current.points.length === 0) {
            this.removePreviewLines();
            return;
        }

        const pos = this.getMousePos(event, camera);
        if (!pos) {
            this.removePreviewLines();
            return;
        }

        const catName = this.current.categoryName || this.defaultCategoryName;
        const color = new THREE.Color(this.getCategoryColor(catName));

        // Đoạn 1: điểm cuối → chuột
        const lastPoint = this.current.points[this.current.points.length - 1];
        const pts1 = this.flatten
            ? [new THREE.Vector3(lastPoint.x, lastPoint.y, 0), new THREE.Vector3(pos.x, pos.y, 0)]
            : [lastPoint, pos];

        if (this.previewLine1) {
            this.releaseGeometry(this.previewLine1.geometry);
            this.releaseMaterial(this.previewLine1.material);
            this.scene.remove(this.previewLine1);
        }

        const geo1 = this.getGeometry(pts1);
        const mat1 = this.getMaterial({
            color,
            linewidth: 2,
            type: 'dashed',
            dashSize: 0.2,
            gapSize: 0.1,
            opacity: 0.7
        });
        this.previewLine1 = new THREE.Line(geo1, mat1);
        this.previewLine1.computeLineDistances();
        this.previewLine1.renderOrder = 2002;
        this.scene.add(this.previewLine1);

        // *** Đoạn 2: chuột → điểm đầu (chỉ vẽ khi có >= 2 điểm)
        if (this.current.points.length >= 2) {
            const firstPoint = this.current.points[0];
            const pts2 = this.flatten
                ? [new THREE.Vector3(pos.x, pos.y, 0), new THREE.Vector3(firstPoint.x, firstPoint.y, 0)]
                : [pos, firstPoint];

            if (this.previewLine2) {
                this.releaseGeometry(this.previewLine2.geometry);
                this.releaseMaterial(this.previewLine2.material);
                this.scene.remove(this.previewLine2);
            }

            const geo2 = this.getGeometry(pts2);
            const mat2 = this.getMaterial({
                color,
                linewidth: 2,
                type: 'dashed',
                dashSize: 0.2,
                gapSize: 0.1,
                opacity: 0.7
            });
            this.previewLine2 = new THREE.Line(geo2, mat2);
            this.previewLine2.computeLineDistances();
            this.previewLine2.renderOrder = 2002;
            this.scene.add(this.previewLine2);
        } else {
            // Nếu chỉ có 1 điểm thì xóa line2
            if (this.previewLine2) {
                this.releaseGeometry(this.previewLine2.geometry);
                this.releaseMaterial(this.previewLine2.material);
                this.scene.remove(this.previewLine2);
                this.previewLine2 = null;
            }
        }
    }

    removePreviewLines() {
        if (this.previewLine1) {
            this.releaseGeometry(this.previewLine1.geometry);
            this.releaseMaterial(this.previewLine1.material);
            this.scene.remove(this.previewLine1);
            this.previewLine1 = null;
        }
        if (this.previewLine2) {
            this.releaseGeometry(this.previewLine2.geometry);
            this.releaseMaterial(this.previewLine2.material);
            this.scene.remove(this.previewLine2);
            this.previewLine2 = null;
        }
    }

    createHandle(poly, pos) {
        const catName = poly.categoryName || this.defaultCategoryName;
        const geo = new THREE.SphereGeometry(0.12, 16, 12);
        const mat = new THREE.MeshBasicMaterial({
            color: this.getCategoryColor(catName),
            depthTest: true,
            depthWrite: false,
            transparent: true,
            polygonOffset: true,
            polygonOffsetFactor: -1.5,
            polygonOffsetUnits: -1.5
        });
        const handle = new THREE.Mesh(geo, mat);
        handle.position.set(pos.x, pos.y, this.flatten ? 0.1 : (pos.z ?? 0.1));
        handle.renderOrder = 2000;
        this.scene.add(handle);
        poly.handles.push(handle);
        this.updateHandleVisibility();
    }

    updateHandleStyles(poly) {
        const catName = poly.categoryName || this.defaultCategoryName;
        const color = this.getCategoryColor(catName);
        poly.handles.forEach((h, idx) => {
            if (h.material?.color) h.material.color.set(color);
            const p = poly.points[idx];
            if (p) h.position.set(p.x, p.y, this.flatten ? 0.1 : (p.z ?? 0.1));
        });
    }

    updateHandleVisibility() {
        this.polygons.forEach(p => {
            const visible = (this.isDrawing && p === this.current) || p === this.selected;
            p.handles.forEach(h => h.visible = visible);
        });
    }

    getMousePos(event, camera) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        this.raycaster.setFromCamera(mouse, camera);
        const target = new THREE.Vector3();
        return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), target) ? target : null;
    }

    getAllHandles() { return this.polygons.flatMap(p => p.handles); }
    getAllLines() { return this.polygons.map(p => p.line).filter(Boolean); }

    // Hover detection với cursor change
    updateHover(event, camera) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        this.raycaster.setFromCamera(mouse, camera);

        // Reset hover state
        this.hoveredHandle = null;
        this.hoveredEdge = null;

        // Chỉ kiểm tra khi có polygon đang được chọn
        if (!this.selected) {
            this.renderer.domElement.style.cursor = 'default';
            return null;
        }

        // 1. Ưu tiên kiểm tra handle (điểm) trước - threshold 0.3
        const handleHits = this.raycaster.intersectObjects(this.selected.handles, false);
        if (handleHits.length > 0) {
            this.hoveredHandle = handleHits[0].object;
            this.renderer.domElement.style.cursor = 'move';
            return { type: 'handle', object: this.hoveredHandle };
        }

        // 2. Kiểm tra edge (cạnh) - threshold 0.15
        if (this.selected.line && this.selected.closed) {
            const lineHits = this.raycaster.intersectObject(this.selected.line, false);
            if (lineHits.length > 0) {
                this.hoveredEdge = lineHits[0];
                this.renderer.domElement.style.cursor = 'crosshair';
                return { type: 'edge', hit: this.hoveredEdge };
            }
        }

        // 3. Không hover gì
        this.renderer.domElement.style.cursor = 'default';
        return null;
    }

    handlePointerDown(event, camera, { allowSelect = true, allowDrag = true, allowAddPoint = true } = {}) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        this.raycaster.setFromCamera(mouse, camera);

        // 1. Ưu tiên handle (drag điểm)
        const handleHits = this.raycaster.intersectObjects(this.getAllHandles(), false);
        if (handleHits.length) {
            const handle = handleHits[0].object;
            const poly = this.polygons.find(p => p.handles.includes(handle));
            if (poly) {
                const wasSelected = this.selected === poly;
                if (!wasSelected && allowSelect) this.select(poly);
                if (wasSelected && allowDrag) {
                    this.draggedHandle = handle;
                    this.draggedPoly = poly;
                    return { action: 'drag-start' };
                }
                if (wasSelected || allowSelect) return { action: 'selected' };
            }
        }

        // 2. Kiểm tra edge (thêm điểm)
        if (this.selected && this.selected.closed && allowAddPoint) {
            const lineHits = this.raycaster.intersectObject(this.selected.line, false);
            if (lineHits.length > 0) {
                this.addPointOnEdge(lineHits[0]);
                return { action: 'point-added' };
            }
        }

        // 3. Kiểm tra line (select polygon)
        const lineHits = this.raycaster.intersectObjects(this.getAllLines(), false);
        if (lineHits.length) {
            const line = lineHits[0].object;
            const poly = this.polygons.find(p => p.line === line);
            if (poly) {
                const wasSelected = this.selected === poly;
                if (!wasSelected && allowSelect) this.select(poly);
                if (wasSelected || allowSelect) return { action: 'selected' };
            }
        }
        return null;
    }

    // Thêm điểm vào giữa cạnh
    addPointOnEdge(hit) {
        if (!this.selected || !this.selected.closed) return;

        const point = hit.point;
        const poly = this.selected;

        // Tìm cạnh gần nhất
        let minDist = Infinity;
        let insertIdx = -1;

        for (let i = 0; i < poly.points.length; i++) {
            const p1 = poly.points[i];
            const p2 = poly.points[(i + 1) % poly.points.length];

            const line = new THREE.Line3(p1, p2);
            const closestPoint = new THREE.Vector3();
            line.closestPointToPoint(point, true, closestPoint);
            const dist = point.distanceTo(closestPoint);

            if (dist < minDist) {
                minDist = dist;
                insertIdx = i + 1;
            }
        }

        if (insertIdx !== -1) {
            const newPoint = point.clone();
            if (this.flatten) newPoint.z = 0;

            // Chèn điểm mới
            poly.points.splice(insertIdx, 0, newPoint);

            // Tạo handle mới
            const catName = poly.categoryName || this.defaultCategoryName;
            const geo = new THREE.SphereGeometry(0.12, 16, 12);
            const mat = new THREE.MeshBasicMaterial({
                color: this.getCategoryColor(catName),
                depthTest: true,
                depthWrite: false,
                transparent: true,
                polygonOffset: true,
                polygonOffsetFactor: -1.5,
                polygonOffsetUnits: -1.5
            });
            const handle = new THREE.Mesh(geo, mat);
            handle.position.set(newPoint.x, newPoint.y, this.flatten ? 0.1 : (newPoint.z ?? 0.1));
            handle.renderOrder = 2000;
            this.scene.add(handle);

            poly.handles.splice(insertIdx, 0, handle);

            // Redraw
            this.redraw(poly, poly.closed);
        }
    }

    onDrag(event, camera) {
        if (!this.draggedHandle || !this.draggedPoly) return;
        const pos = this.getMousePos(event, camera);
        if (pos) {
            this.draggedHandle.position.set(pos.x, pos.y, this.flatten ? 0.1 : (pos.z ?? 0.1));
            const index = this.draggedPoly.handles.indexOf(this.draggedHandle);
            this.draggedPoly.points[index].copy(pos);
            this.redraw(this.draggedPoly, this.draggedPoly.closed);
        }
    }

    onDragEnd() { this.draggedHandle = null; this.draggedPoly = null; }

    // *** THÊM: Xóa điểm khi click chuột phải
    handleRightClick(event, camera) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        this.raycaster.setFromCamera(mouse, camera);

        // Kiểm tra click vào handle
        const handleHits = this.raycaster.intersectObjects(this.getAllHandles(), false);
        if (handleHits.length > 0) {
            const handle = handleHits[0].object;
            const poly = this.polygons.find(p => p.handles.includes(handle));
            
            if (poly) {
                const index = poly.handles.indexOf(handle);
                
                // Không cho xóa nếu polygon có ít hơn 4 điểm (sau khi xóa còn < 3)
                if (poly.points.length <= 3) {
                    console.warn('Không thể xóa điểm! Polygon cần ít nhất 3 điểm.');
                    return { action: 'delete-failed', reason: 'min-points' };
                }
                
                // Xóa điểm và handle
                poly.points.splice(index, 1);
                
                // Dispose và remove handle
                if (handle.geometry) handle.geometry.dispose();
                if (handle.material) handle.material.dispose();
                this.scene.remove(handle);
                poly.handles.splice(index, 1);
                
                // Redraw polygon
                this.redraw(poly, poly.closed);
                
                return { action: 'point-deleted', poly, index };
            }
        }
        
        return null;
    }

    // *** Dùng pooling để tránh cấp phát liên tục
    redraw(poly, closed = false) {
        this.updateHandleStyles(poly);
        
        // Release old resources
        if (poly.line) {
            this.releaseGeometry(poly.line.geometry);
            this.releaseMaterial(poly.line.material);
            this.scene.remove(poly.line);
            poly.line = null;
        }
        
        if (poly.points.length < 2) return;

        const pts = this.flatten
            ? poly.points.map(p => new THREE.Vector3(p.x, p.y, 0))
            : poly.points;

        const geo = this.getGeometry(pts);

        const catName = poly.categoryName || this.defaultCategoryName;
        const color = new THREE.Color(this.getCategoryColor(catName));
        const isSelected = this.selected === poly;
        const mat = this.getMaterial({
            color,
            linewidth: isSelected ? 10 : 5,
            type: 'basic'
        });
        poly.line = closed ? new THREE.LineLoop(geo, mat) : new THREE.Line(geo, mat);
        poly.line.renderOrder = isSelected ? 2001 : 1999;
        this.scene.add(poly.line);
    }

    select(poly) {
        this.selected = poly;
        this.polygons.forEach(p => this.redraw(p, p.closed));
        this.updateHandleVisibility();
    }

    cycleCategory(direction = 1) {
        if (!this.selected) return;
        const currentIdx = this.categoryList.findIndex(c => c.name === this.selected.categoryName);
        let nextIdx = 0;
        if (currentIdx !== -1) {
            nextIdx = (currentIdx + direction + this.categoryList.length) % this.categoryList.length;
        }
        this.selected.categoryName = this.categoryList[nextIdx].name;
        this.updateHandleStyles(this.selected);
        this.redraw(this.selected, this.selected.closed);
    }

    // Xóa polygon đang được chọn
    deleteSelected() {
        if (!this.selected) return;
        
        // Remove handles
        this.selected.handles.forEach(h => {
            if (h.geometry) h.geometry.dispose();
            if (h.material) h.material.dispose();
            this.scene.remove(h);
        });
        
        // Remove line
        if (this.selected.line) {
            this.releaseGeometry(this.selected.line.geometry);
            this.releaseMaterial(this.selected.line.material);
            this.scene.remove(this.selected.line);
        }
        
        // Remove from array
        const idx = this.polygons.indexOf(this.selected);
        if (idx !== -1) this.polygons.splice(idx, 1);
        
        this.selected = null;
    }

    clearAll() {
        this.polygons.forEach(p => {
            p.handles.forEach(h => {
                if (h.geometry) h.geometry.dispose();
                if (h.material) h.material.dispose();
                this.scene.remove(h);
            });
            if (p.line) {
                this.releaseGeometry(p.line.geometry);
                this.releaseMaterial(p.line.material);
                this.scene.remove(p.line);
            }
        });
        this.removePreviewLines();
        this.polygons = [];
        this.current = null;
        this.isDrawing = false;
        this.selected = null;
    }

    // --- Load & Export ---

    loadFromAnnotations(annotations = [], categories = []) {
        this.clearAll();

        const idToName = {};
        categories.forEach(c => { idToName[c.id] = c.name; });
        DEFAULT_CATEGORY_LIST.forEach(c => { if (!idToName[c.id]) idToName[c.id] = c.name; });

        annotations.forEach(a => {
            if (!a || a.shape !== 'polygon' || !Array.isArray(a.location)) return;
            const catName = idToName[a.category_id] || this.defaultCategoryName;
            const pts = a.location
                .map(pt => new THREE.Vector3(pt.x, pt.y, pt.z ?? 0))
                .filter(v => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));
            if (pts.length < 3) return;
            const poly = {
                points: [],
                handles: [],
                line: null,
                closed: true,
                categoryName: catName
            };
            this.polygons.push(poly);
            pts.forEach(p => {
                const clone = p.clone();
                poly.points.push(clone);
                this.createHandle(poly, clone);
            });
            this.redraw(poly, true);
        });
        this.select(this.polygons[0] || null);
        this.updateHandleVisibility();
    }

    getAnnotations() {
        const closedPolys = this.polygons.filter(p => p.closed && p.points.length >= 3);
        return {
            annotations: closedPolys.map((p, idx) => {
                const found = DEFAULT_CATEGORY_LIST.find(c => c.name === p.categoryName);
                return {
                    id: idx + 1,
                    type: '3D',
                    category_id: found ? found.id : DEFAULT_CATEGORY_LIST[0].id,
                    shape: 'polygon',
                    location: p.points.map(pt => ({
                        x: pt.x,
                        y: pt.y,
                        z: pt.z ?? 0
                    }))
                };
            }),
            categories: this.categoryList.map(c => ({ id: c.id, name: c.name }))
        };
    }
}
