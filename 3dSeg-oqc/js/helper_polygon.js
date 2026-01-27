import * as THREE from 'three';

// Luôn chỉ sửa color tại đây khi cần thêm category mới!
const DEFAULT_CATEGORY_LIST = [
    { id: 205340, name: 'undrivable',   color: 0xff0000 },
    { id: 205341, name: 'things',       color: 0xffff00 },
    { id: 205342, name: 'construction', color: 0x800080 },
    { id: 205343, name: 'uneven',       color: 0xffffff }
];

export class PolygonManager {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.polygons = [];
        this.current = null;
        this.isDrawing = false;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Line = { threshold: 0.15 };
        this.selected = null;
        this.categoryList = [...DEFAULT_CATEGORY_LIST];
        this.flatten = false;
        this.draggedHandle = null;
        this.draggedPoly = null;
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
        // KHỞI TẠO LUÔN LUÔN CÓ categoryName!
        const catName = this.defaultCategoryName;
        const poly = { points: [], handles: [], line: null, closed: false, categoryName: catName };
        this.polygons.push(poly);
        this.current = poly;
        this.select(poly);
    }

    addPoint(event, camera) {
        if (!this.isDrawing || event.button !== 0 || !this.current) return;
        const pos = this.getMousePos(event, camera);
        if (pos) {
            this.current.points.push(pos);
            this.createHandle(this.current, pos);
            this.redraw(this.current, false);
        }
    }

    createHandle(poly, pos) {
        // LUÔN DÙNG ĐÚNG TÊN CHO MÀU!
        const catName = poly.categoryName || this.defaultCategoryName;
        const geo = new THREE.SphereGeometry(0.12, 16, 12);
        const mat = new THREE.MeshBasicMaterial({
            color: this.getCategoryColor(catName),
            depthTest: false,
            depthWrite: false,
            transparent: true
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

    handlePointerDown(event, camera, { allowSelect = true, allowDrag = true } = {}) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        this.raycaster.setFromCamera(mouse, camera);

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

    redraw(poly, closed = false) {
        this.updateHandleStyles(poly);
        if (poly.line) this.scene.remove(poly.line);
        if (poly.points.length < 2) return;

        const pts = this.flatten
            ? poly.points.map(p => new THREE.Vector3(p.x, p.y, 0))
            : poly.points;

        // <<< TH��M DÒNG NÀY!!! (bị thiếu ở bản trước)
        const geo = new THREE.BufferGeometry().setFromPoints(pts);

        const catName = poly.categoryName || this.defaultCategoryName;
        const color = this.getCategoryColor(catName);
        const isSelected = this.selected === poly;
        const mat = new THREE.LineBasicMaterial({
            color,
            linewidth: isSelected ? 10 : 5,
            depthTest: false,
            depthWrite: false,
            transparent: true
        });
        poly.line = closed ? new THREE.LineLoop(geo, mat) : new THREE.Line(geo, mat);
        poly.line.renderOrder = isSelected ? 2001 : 1999;
        this.scene.add(poly.line);
    }

    cycleCategory(direction = 1) {
        if (!this.selected) return;
        // Chỉ xử lý trên name!
        const currentIdx = this.categoryList.findIndex(c => c.name === this.selected.categoryName);
        let nextIdx = 0;
        if (currentIdx !== -1) {
            nextIdx = (currentIdx + direction + this.categoryList.length) % this.categoryList.length;
        }
        this.selected.categoryName = this.categoryList[nextIdx].name;
        this.updateHandleStyles(this.selected);
        this.redraw(this.selected, this.selected.closed);
    }

    clearAll() {
        this.polygons.forEach(p => {
            p.handles.forEach(h => this.scene.remove(h));
            if (p.line) this.scene.remove(p.line);
        });
        this.polygons = [];
        this.current = null;
        this.isDrawing = false;
        this.selected = null;
    }

    // --- Load & Export ---

    /**
     * Load annotation chuẩn COCO, mapping id → name, mỗi polygon luôn có categoryName
     * @param {Array} annotations
     * @param {Array} categories
     */
    loadFromAnnotations(annotations = [], categories = []) {
        this.clearAll();

        // Tạo map từ id sang name, ưu tiên dữ liệu truyền vào, fallback theo mặc định
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
                categoryName: catName // chỉ lưu tên
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

    /**
     * Export ra annotation chuẩn COCO, mapping name → id từ DEFAULT_CATEGORY_LIST
     */
    getAnnotations() {
        const closedPolys = this.polygons.filter(p => p.closed && p.points.length >= 3);
        return {
            annotations: closedPolys.map((p, idx) => {
                // map name sang id từ DEFAULT_CATEGORY_LIST
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