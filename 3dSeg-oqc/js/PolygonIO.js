// PolygonIO.js
// Auth: NgoHongPhong
// Version: 3.4.03022026

import * as THREE from 'three';
import { Polygon } from './Polygon.js';

export const polygon_map_file = [
    {"name": "undriver", "color": "0xff0000"},
    {"name": "things", "color": "0xffff00"},
    {"name": "construction", "color": "0x800080"},
    {"name": "uneven", "color": "0xffffff"}
];

export class PolygonIO {
    // Tính toán bounding box và grid dimensions từ pcdMesh
    static calculateGridParams(pcdMesh, resolution = 0.1, padding = 10) {
        if (!pcdMesh || !pcdMesh.geometry) {
            console.error("Invalid pcdMesh");
            return null;
        }

        const positions = pcdMesh.geometry.attributes.position;
        if (!positions) {
            console.error("No position attribute in geometry");
            return null;
        }

        // Tìm min/max của x, y
        let min_x = Infinity, max_x = -Infinity;
        let min_y = Infinity, max_y = -Infinity;

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            
            if (x < min_x) min_x = x;
            if (x > max_x) max_x = x;
            if (y < min_y) min_y = y;
            if (y > max_y) max_y = y;
        }

        // Thêm padding
        const x_range = [min_x - padding, max_x + padding];
        const y_range = [min_y - padding, max_y + padding];

        // Tính width và height
        const width = (x_range[1] - x_range[0]) / resolution;
        const height = (y_range[1] - y_range[0]) / resolution;

        return {
            min_x,
            max_x,
            min_y,
            max_y,
            x_range,
            y_range,
            width: Math.ceil(width),
            height: Math.ceil(height),
            resolution,
            padding
        };
    }

    // Chuyển JSON thành danh sách các Object Polygon
    static parse(data, allocateVertexCallback) {
        if (!data || !data.annotations) return [];

        return data.annotations.map(ann => {
            const poly = new Polygon(ann.id);
            poly.name = ann.category;
            
            const config = polygon_map_file.find(m => m.name === ann.category);
            poly.color = config ? parseInt(config.color) : 0x00ff00;

            ann.location.forEach(loc => {
                poly.positions.push(new THREE.Vector3(loc.x, loc.y, loc.z || 0));
                // Gọi callback để Manager cấp phát Index từ Pool
                const vIdx = allocateVertexCallback();
                if (vIdx !== -1) poly.vertexIndices.push(vIdx);
            });

            poly.isClose = true;
            return poly;
        });
    }

    // Chuyển danh sách Polygon hiện tại thành file JSON để tải về
    static stringify(polygons) {
        return JSON.stringify({
            annotations: polygons.map(p => ({
                id: p.id,
                category: p.name || "undriver",
                location: p.positions.map(pos => ({ x: pos.x, y: pos.y, z: pos.z }))
            }))
        }, null, 2);
    }

    static download(content, filename) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}
