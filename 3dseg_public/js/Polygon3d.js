import * as THREE from 'three';

export class Polygon3d {
    constructor(id, style = {}) {
        this.id = id;
        this.points = [];
        this.active = false;
        this.style = {
            color: style.color ?? 0xff0000,
            vertexSize: style.vertexSize ?? 5,
            thickness: style.thickness ?? 2
        };

        this.visuals = {
            container: new THREE.Group(),

            mainLine: new THREE.Line(
                new THREE.BufferGeometry(),
                new THREE.LineBasicMaterial({
                    color: this.style.color,
                    linewidth: this.style.thickness,
                    depthTest: false,
                    depthWrite: false,
                    transparent: true
                })
            ),

            vertices: new THREE.Points(
                new THREE.BufferGeometry(),
                new THREE.PointsMaterial({
                    color: this.style.color,
                    size: this.style.vertexSize,
                    sizeAttenuation: true,
                    depthTest: false,
                    depthWrite: false,
                    transparent: true
                })
            ),
                
            previewLine: new THREE.Line(
                new THREE.BufferGeometry(),
                new THREE.LineDashedMaterial({
                    color: this.style.color,
                    dashSize: 1,
                    gapSize: 0.5,
                    depthTest: false,
                    depthWrite: false,
                    transparent: true
                })
            )
        };

        this.visuals.container.add(
            this.visuals.mainLine,
            this.visuals.vertices,
            this.visuals.previewLine
        );

        this.visuals.container.renderOrder = 1000;
        this.visuals.mainLine.renderOrder = 1000;
        this.visuals.vertices.renderOrder = 1000;
        this.visuals.previewLine.renderOrder = 1000;
    }

    render(cursorPoint = null, isCreating = false) {
        if (this.points.length === 0) return;

        const pts = this.points;
        const linePts = [...pts];

        if (!isCreating && pts.length >= 3) {
            linePts.push(pts[0]);
        }
        this.visuals.mainLine.geometry.setFromPoints(linePts);

        this.visuals.vertices.geometry.setFromPoints(pts);
        this.visuals.vertices.visible = this.active;

        if (isCreating && cursorPoint && pts.length > 0) {
            const previewPts = [pts[pts.length - 1], cursorPoint, pts[0]];
            this.visuals.previewLine.geometry.setFromPoints(previewPts);
            this.visuals.previewLine.computeLineDistances();
            this.visuals.previewLine.visible = true;
        } else {
            this.visuals.previewLine.visible = false;
        }
    }

    updateStyle(newStyle) {
        Object.assign(this.style, newStyle);
        this.visuals.mainLine.material.color.setHex(this.style.color);
        this.visuals.vertices.material.color.setHex(this.style.color);
        this.visuals.previewLine.material.color.setHex(this.style.color);
        if ('vertexSize' in newStyle) {
            this.visuals.vertices.material.size = this.style.vertexSize;
        }
        if ('thickness' in newStyle && 'linewidth' in this.visuals.mainLine.material) {
            this.visuals.mainLine.material.linewidth = this.style.thickness;
        }
    }
}