import * as THREE from 'three';

/* ================= DEFAULT CATEGORIES ================= */
const DEFAULT_CATEGORY_LIST = [
    { id: 207733, name: 'undrivable',   color: 0xff0000 },
    { id: 207734, name: 'things',       color: 0xffff00 },
    { id: 207735, name: 'construction', color: 0x800080 },
    { id: 207736, name: 'uneven',        color: 0xffffff }
];

export class PolygonManager {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;

        this.polygons = [];
        this.current = null;
        this.selected = null;
        this.isDrawing = false;
        this.flatten = false;

        this.categoryList = [...DEFAULT_CATEGORY_LIST];
        this.categoryNameToId = {};

        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Line = { threshold: 0.15 };

        this.buildCategoryNameToId();
    }

    /* ================= CATEGORY ================= */
    buildCategoryNameToId() {
        this.categoryNameToId = {};
        this.categoryList.forEach(c => {
            this.categoryNameToId[c.name] = c.id;
        });
    }

    setCategories(cocoCategories = []) {
        if (!Array.isArray(cocoCategories) || !cocoCategories.length) return;

        this.categoryList = cocoCategories.map(c => {
            const def = DEFAULT_CATEGORY_LIST.find(d => d.name === c.name);
            return {
                id: c.id,
                name: c.name,
                color: def?.color ?? 0xff0000
            };
        });

        this.buildCategoryNameToId();
        this.polygons.forEach(p => this.updateHandleStyles(p));
    }

    getCategoryColorByName(name) {
        const found = this.categoryList.find(c => c.name === name);
        return found ? found.color : 0xff0000;
    }

    getDefaultCategoryName() {
        return this.categoryList[0]?.name ?? 'undrivable';
    }

    /* ================= DRAW ================= */
    start() {
        const poly = {
            points: [],
            handles: [],
            line: null,
            closed: false,
            categoryName: this.getDefaultCategoryName()
        };
        this.polygons.push(poly);
        this.current = poly;
        this.isDrawing = true;
        this.select(poly);
    }

    finish() {
        if (!this.current) return;
        this.current.closed = true;
        this.redraw(this.current, true);
        this.current = null;
        this.isDrawing = false;
        this.updateHandleVisibility();
    }

    addPoint(event, camera) {
        if (!this.isDrawing || event.button !== 0 || !this.current) return;
        const pos = this.getMousePos(event, camera);
        if (!pos) return;
        this.current.points.push(pos.clone());
        this.createHandle(this.current, pos);
        this.redraw(this.current, false);
    }

    /* ================= HANDLE ================= */
    createHandle(poly, pos) {
        const geo = new THREE.SphereGeometry(0.12, 16, 12);
        const mat = new THREE.MeshBasicMaterial({
            color: this.getCategoryColorByName(poly.categoryName),
            depthTest: false,
            depthWrite: false,
            transparent: true
        });
        const h = new THREE.Mesh(geo, mat);
        h.position.set(pos.x, pos.y, this.flatten ? 0.1 : (pos.z ?? 0.1));
        h.renderOrder = 2000;
        this.scene.add(h);
        poly.handles.push(h);
        this.updateHandleVisibility();
    }

    updateHandleStyles(poly) {
        const color = this.getCategoryColorByName(poly.categoryName);
        poly.handles.forEach((h, i) => {
            h.material.color.set(color);
            const p = poly.points[i];
            if (p) h.position.set(p.x, p.y, this.flatten ? 0.1 : (p.z ?? 0.1));
        });
    }

    updateHandleVisibility() {
        this.polygons.forEach(p => {
            const visible = p === this.selected || p === this.current;
            p.handles.forEach(h => h.visible = visible);
        });
    }

    /* ================= RENDER ================= */
    redraw(poly, closed = false) {
        this.updateHandleStyles(poly);
        if (poly.line) this.scene.remove(poly.line);
        if (poly.points.length < 2) return;

        const pts = this.flatten
            ? poly.points.map(p => new THREE.Vector3(p.x, p.y, 0))
            : poly.points;

        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
            color: this.getCategoryColorByName(poly.categoryName),
            linewidth: this.selected === poly ? 10 : 5,
            depthTest: false,
            depthWrite: false,
            transparent: true
        });

        poly.line = closed
            ? new THREE.LineLoop(geo, mat)
            : new THREE.Line(geo, mat);

        poly.line.renderOrder = this.selected === poly ? 2001 : 1999;
        this.scene.add(poly.line);
    }

    /* ================= SELECT ================= */
    select(poly) {
        this.selected = poly;
        this.polygons.forEach(p => this.redraw(p, p.closed));
        this.updateHandleVisibility();
    }

    cycleCategory(dir = 1) {
        if (!this.selected) return;
        const idx = this.categoryList.findIndex(
            c => c.name === this.selected.categoryName
        );
        const next =
            (idx + dir + this.categoryList.length) %
            this.categoryList.length;

        this.selected.categoryName = this.categoryList[next].name;
        this.redraw(this.selected, this.selected.closed);
    }

    /* ================= LOAD COCO ================= */
    loadFromCoco(coco) {
        this.clearAll();
        this.setCategories(coco.categories);

        coco.annotations.forEach(a => {
            if (!Array.isArray(a.segmentation?.[0])) return;

            const cat = coco.categories.find(c => c.id === a.category_id);
            const name = cat?.name ?? this.getDefaultCategoryName();

            const poly = {
                points: [],
                handles: [],
                line: null,
                closed: true,
                categoryName: name
            };

            const seg = a.segmentation[0];
            for (let i = 0; i < seg.length; i += 2) {
                const p = new THREE.Vector3(seg[i], seg[i + 1], 0);
                poly.points.push(p);
                this.createHandle(poly, p);
            }

            this.polygons.push(poly);
            this.redraw(poly, true);
        });

        this.select(this.polygons[0] ?? null);
    }

    /* ================= EXPORT COCO ================= */
    exportCoco(image) {
        return {
            images: [image],
            annotations: this.polygons
                .filter(p => p.closed && p.points.length >= 3)
                .map((p, i) => ({
                    id: i + 1,
                    image_id: image.id,

                    // 🔥 NAME → ID (ĐÚNG YÊU CẦU)
                    category_id: this.categoryNameToId[p.categoryName],

                    segmentation: [
                        p.points.flatMap(pt => [pt.x, pt.y])
                    ],
                    iscrowd: 0
                })),
            categories: this.categoryList.map(c => ({
                id: c.id,
                name: c.name
            }))
        };
    }

    /* ================= UTILS ================= */
    getMousePos(event, camera) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        this.raycaster.setFromCamera(mouse, camera);
        const out = new THREE.Vector3();
        return this.raycaster.ray.intersectPlane(
            new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
            out
        ) ? out : null;
    }

    clearAll() {
        this.polygons.forEach(p => {
            p.handles.forEach(h => this.scene.remove(h));
            if (p.line) this.scene.remove(p.line);
        });
        this.polygons = [];
        this.current = null;
        this.selected = null;
        this.isDrawing = false;
    }
}
