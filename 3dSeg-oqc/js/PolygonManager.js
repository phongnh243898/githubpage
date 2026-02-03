// PolygonManager.js
// Auth: NgoHongPhong
// Version: 3.4.03022026 - Optimized with PolygonIO

import * as THREE from 'three';
import { Polygon } from './Polygon.js';
import { PolygonRenderer } from './PolygonRenderer.js';
import { PolygonIO } from './PolygonIO.js';

export class PolygonManager {
	constructor(container, renderer, camera, polygonGroup) {
		this.container = container;
		this.renderer = renderer;
		this.camera = camera;
		this.polygonGroup = polygonGroup;

		this.auto_id = 0;
		this.polygons = [];
		this.activePolygon = null;
		this.state = 'idle'; // idle, create, edit

		this.config = {
			sizeVertex: 0.5,
			thicknessLine: 3,
			thresholdVertex: 5,
			thresholdEdge: 5,
		}

		this.polygonPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
		this.raycaster = new THREE.Raycaster();
		this.pointer = new THREE.Vector2();
		this.mouseWorldPos = new THREE.Vector3();

		this.polygonRenderer = new PolygonRenderer(renderer, polygonGroup, this.config);

		this._isDragging = false;
		this._dragVertexIdx = -1;

		this._initEvent();
	}

	_initEvent() {
		this.container.tabIndex = 0;
		this.container.style.outline = 'none';
		this.container.addEventListener('mousemove', (e) => this._onMouseMove(e));
		this.container.addEventListener('mousedown', (e) => this._onMouseDown(e));
		this.container.addEventListener('mouseup', () => { 
			this._isDragging = false; 
			this._dragVertexIdx = -1; 
		});
		this.container.addEventListener('contextmenu', (e) => e.preventDefault());

		window.addEventListener('keydown', (e) => {
			if (document.activeElement !== this.container) return;
			if (this.activePolygon && !this.activePolygon.isClose && e.key === 'Escape') {
				this.closePolygon();
			}
		});
	}

	_updatePointer(e) {
		const rect = this.container.getBoundingClientRect();
		this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
		this.raycaster.setFromCamera(this.pointer, this.camera);
		this.raycaster.ray.intersectPlane(this.polygonPlane, this.mouseWorldPos);
	}

	_onMouseMove(e) {
		this._updatePointer(e);
		if (this._isDragging && this._dragVertexIdx >= 0) {
			this.moveVertex(this._dragVertexIdx, this.mouseWorldPos);
			return;
		}

		const intersect = this._getIntersection();
		if (this.state === 'idle') {
			this.container.style.cursor = intersect ? 'pointer' : 'default';
		} else if (this.state === 'create') {
			this.container.style.cursor = 'crosshair';
			this.polygonRenderer.updatePreEdge(this.activePolygon, this.mouseWorldPos);
		} else if (this.state === 'edit') {
			this.container.style.cursor = intersect ? (intersect.type === 'vertex' ? 'grab' : 'copy') : 'default';
		}
	}

	_onMouseDown(e) {
		this._updatePointer(e);
		const intersect = this._getIntersection();

		if ((this.state === 'idle' || this.state === 'edit') && intersect) {
			if (!this.activePolygon || this.activePolygon.id !== intersect.polygon.id) {
				this.activePolygon = intersect.polygon;
				this.state = 'edit';
				this.update3d();
				return;
			}
			if (this.state === 'edit') {
				if (intersect.type === 'vertex') {
					if (e.button === 0) { this._isDragging = true; this._dragVertexIdx = intersect.localIndex; }
					else if (e.button === 2) this.removeVertex(intersect.localIndex);
				} else if (intersect.type === 'edge' && e.button === 0) {
					this.insertVertex(intersect.localIndex, this.mouseWorldPos);
				}
			}
			return;
		}

		if (this.state === 'create' && e.button === 0) this.addVertex(this.mouseWorldPos);
	}

	_getIntersection() {
		this.raycaster.params.Points = { threshold: this.config.thresholdVertex };
		this.raycaster.params.Line2 = { threshold: this.config.thresholdEdge };

		const list = this.activePolygon ? [this.activePolygon, ...this.polygons.filter(p => p !== this.activePolygon)] : this.polygons;

		for (const poly of list) {
			for (let i = 0; i < poly.vertexIndices.length; i++) {
				if (this.raycaster.intersectObject(this.polygonRenderer.vertexPool[poly.vertexIndices[i]]).length > 0)
					return { type: 'vertex', localIndex: i, polygon: poly };
			}
			for (let i = 0; i < poly.edgeIndices.length; i++) {
				if (this.raycaster.intersectObject(this.polygonRenderer.edgePool[poly.edgeIndices[i]]).length > 0)
					return { type: 'edge', localIndex: i, polygon: poly };
			}
		}
		return null;
	}

	// ========== TÍCH HỢP VỚI POLYGONIO ==========

	importData(data) {
		// Gọi hàm parse từ file IO của bạn
		// Truyền vào callback allocateVertex để lấy index từ Pool của Manager
		const importedPolygons = PolygonIO.parse(data, () => this.polygonRenderer.allocateVertex());

		importedPolygons.forEach(poly => {
			this._rebuildEdges(poly);
			this.polygons.push(poly);
			// Cập nhật auto_id để tránh trùng lặp
			if (poly.id >= this.auto_id) this.auto_id = poly.id + 1;
		});

		this.update3d();
	}

	exportData(filename) {
		// Gọi hàm từ file IO của bạn
		const content = PolygonIO.stringify(this.polygons);
		PolygonIO.download(content, filename);
	}

	// ========== LOGIC NGHIỆP VỤ GỐC ==========

	startPolygon() {
		const poly = new Polygon(this.auto_id++);
		this.polygons.push(poly);
		this.activePolygon = poly;
		this.state = 'create';
		this.update3d();
	}

	closePolygon() {
		if (!this.activePolygon || this.activePolygon.positions.length < 3) {
			this.deletePolygon();
			return;
		}
		const eIdx = this.polygonRenderer.allocateEdge();
		if (eIdx !== -1) this.activePolygon.edgeIndices.push(eIdx);
		this.activePolygon.isClose = true;
		this.state = 'edit';
		this.update3d();
	}

	deletePolygon() {
		if (!this.activePolygon) return;
		this.activePolygon.vertexIndices.forEach(v => this.polygonRenderer.freeVertex(v));
		this.activePolygon.edgeIndices.forEach(e => this.polygonRenderer.freeEdge(e));
		this.polygons = this.polygons.filter(p => p !== this.activePolygon);
		this.activePolygon = null;
		this.state = 'idle';
		this.update3d();
	}

	addVertex(pos) {
		const vIdx = this.polygonRenderer.allocateVertex();
		if (vIdx === -1) return;
		this.activePolygon.positions.push(pos.clone());
		this.activePolygon.vertexIndices.push(vIdx);
		if (this.activePolygon.positions.length >= 2) {
			const eIdx = this.polygonRenderer.allocateEdge();
			if (eIdx !== -1) this.activePolygon.edgeIndices.push(eIdx);
		}
		this.update3d();
	}

	removeVertex(idx) {
		if (this.activePolygon.positions.length <= 3) return;
		this.polygonRenderer.freeVertex(this.activePolygon.vertexIndices[idx]);
		this.activePolygon.positions.splice(idx, 1);
		this.activePolygon.vertexIndices.splice(idx, 1);
		this._rebuildEdges(this.activePolygon);
		this.update3d();
	}

	moveVertex(idx, pos) {
		this.activePolygon.positions[idx].copy(pos);
		this.update3d();
	}

	insertVertex(edgeIdx, pos) {
		const vIdx = this.polygonRenderer.allocateVertex();
		this.activePolygon.positions.splice(edgeIdx + 1, 0, pos.clone());
		this.activePolygon.vertexIndices.splice(edgeIdx + 1, 0, vIdx);
		this._rebuildEdges(this.activePolygon);
		this.update3d();
	}

	_rebuildEdges(poly) {
		poly.edgeIndices.forEach(e => this.polygonRenderer.freeEdge(e));
		poly.edgeIndices = [];
		const count = poly.isClose ? poly.positions.length : poly.positions.length - 1;
		for (let i = 0; i < count; i++) {
			const eIdx = this.polygonRenderer.allocateEdge();
			if (eIdx !== -1) poly.edgeIndices.push(eIdx);
		}
	}

	setAttributes(attr) { 
		if (this.activePolygon) { 
			this.activePolygon.setAttribute(attr); 
			this.update3d(); 
		} 
	}

	setConfig(conf) { 
		this.config = { ...this.config, ...conf }; 
		this.polygonRenderer.updateConfig(this.config); 
		this.update3d(); 
	}

	update3d() {
		this.polygonRenderer.hideAll();
		this.polygons.forEach(p => this.polygonRenderer.updatePolygonVisual(p, p === this.activePolygon, this.state));
	}
}