// Polygon.js
// Auth: NgoHongPhong
// Version: 3.4.03022026

export class Polygon {
	constructor(id) {
		this.id = id;
		this.positions = [];
		this.color = 0xff0000;
		this.isClose = false;

		this.vertexIndices = [];
		this.edgeIndices = [];
	}

	setAttribute(attr = {}) {
		if (attr.color !== undefined) {
			this.color = attr.color;
		}
	}
}