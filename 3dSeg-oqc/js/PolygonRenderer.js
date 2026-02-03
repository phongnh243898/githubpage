// PolygonRenderer.js
// Auth: NgoHongPhong
// Version: 3.4.03022026

import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

export class PolygonRenderer {
	constructor(renderer, polygonGroup, config) {
		this.renderer = renderer;
		this.polygonGroup = polygonGroup;
		this.config = config;

		this.vertexPool = this._createVertexPool(1000);
		this.edgePool = this._createEdgePool(1000);
		this.preEdge = this._createPreEdge();

		this.vertexUsage = new Array(1000).fill(false);
		this.edgeUsage = new Array(1000).fill(false);
	}

	_createVertexPool(count) {
		const pool = [];
		const geometry = new THREE.SphereGeometry(1, 8, 8);
		for (let i = 0; i < count; i++) {
			const material = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false });
			const mesh = new THREE.Mesh(geometry, material);
			mesh.visible = false;
			mesh.scale.setScalar(this.config.sizeVertex);
			mesh.renderOrder = 999;
			this.polygonGroup.add(mesh);
			pool.push(mesh);
		}
		return pool;
	}

	_createEdgePool(count) {
		const pool = [];
		for (let i = 0; i < count; i++) {
			const geometry = new LineGeometry();
			geometry.setPositions([0, 0, 0, 0, 0, 0]);
			const material = new LineMaterial({
				color: 0xff0000,
				linewidth: this.config.thicknessLine,
				resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
				depthTest: false
			});
			const line = new Line2(geometry, material);
			line.visible = false;
			line.renderOrder = 998;
			this.polygonGroup.add(line);
			pool.push(line);
		}
		return pool;
	}

	_createPreEdge() {
		const geometry = new LineGeometry();
		geometry.setPositions([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
		const material = new LineMaterial({
			color: 0x00ff00,
			linewidth: 2,
			dashed: true,
			dashSize: 0.5,
			gapSize: 0.3,
			resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
			depthTest: false
		});
		const line = new Line2(geometry, material);
		line.visible = false;
		line.renderOrder = 1000;
		this.polygonGroup.add(line);
		return line;
	}

	allocateVertex() {
		const idx = this.vertexUsage.indexOf(false);
		if (idx === -1) return -1;
		this.vertexUsage[idx] = true;
		return idx;
	}

	freeVertex(idx) {
		if (idx >= 0 && idx < this.vertexUsage.length) {
			this.vertexUsage[idx] = false;
			this.vertexPool[idx].visible = false;
		}
	}

	allocateEdge() {
		const idx = this.edgeUsage.indexOf(false);
		if (idx === -1) return -1;
		this.edgeUsage[idx] = true;
		return idx;
	}

	freeEdge(idx) {
		if (idx >= 0 && idx < this.edgeUsage.length) {
			this.edgeUsage[idx] = false;
			this.edgePool[idx].visible = false;
		}
	}

	hideAll() {
		this.vertexPool.forEach(v => v.visible = false);
		this.edgePool.forEach(e => e.visible = false);
		this.preEdge.visible = false;
	}

	updatePolygonVisual(polygon, isActive, state) {
		const showVertex = isActive && (state === 'create' || state === 'edit');
		const canvasSize = new THREE.Vector2();
		this.renderer.getSize(canvasSize);

		polygon.vertexIndices.forEach((vIdx, i) => {
			const vertex = this.vertexPool[vIdx];
			vertex.position.copy(polygon.positions[i]);
			vertex.material.color.setHex(polygon.color);
			vertex.visible = showVertex;
		});

		polygon.edgeIndices.forEach((eIdx, i) => {
			const edge = this.edgePool[eIdx];
			const p1 = polygon.positions[i];
			const p2 = polygon.positions[(i + 1) % polygon.positions.length];

			// Cập nhật vị trí
			edge.geometry.setPositions([p1.x, p1.y, p1.z, p2.x, p2.y, p2.z]);
			
			// Quan trọng: Phải tính toán lại vùng va chạm cho Raycaster
			edge.geometry.computeBoundingBox();
			edge.geometry.computeBoundingSphere();

			edge.computeLineDistances();
			edge.material.color.setHex(polygon.color);
			edge.material.resolution.copy(canvasSize);
			edge.material.linewidth = this.config.thicknessLine;
			edge.visible = true;
		});
	}

	updatePreEdge(activePolygon, mouse) {
		if (!activePolygon || activePolygon.positions.length === 0) {
			this.preEdge.visible = false;
			return;
		}
		const last = activePolygon.positions[activePolygon.positions.length - 1];
		const first = activePolygon.positions[0];
		
		let pts = [last.x, last.y, last.z, mouse.x, mouse.y, mouse.z];
		if (activePolygon.positions.length >= 2) {
			pts.push(mouse.x, mouse.y, mouse.z, first.x, first.y, first.z);
		} else {
			pts.push(mouse.x, mouse.y, mouse.z, mouse.x, mouse.y, mouse.z);
		}

		this.preEdge.geometry.setPositions(pts);
		this.preEdge.computeLineDistances();
		this.preEdge.material.resolution.set(window.innerWidth, window.innerHeight);
		this.preEdge.visible = true;
	}

	updateConfig(config) {
		this.config = { ...this.config, ...config };
		this.vertexPool.forEach(v => v.scale.setScalar(this.config.sizeVertex));
	}
}