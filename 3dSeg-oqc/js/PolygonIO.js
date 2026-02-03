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