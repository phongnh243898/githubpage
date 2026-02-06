import * as THREE from 'three';

export default class CustomControls {
    constructor(camera) {
        this.camera = camera;
        this.camera.matrixAutoUpdate = false;
    }

    getPosition() {
        return new THREE.Vector3().setFromMatrixPosition(this.camera.matrix);
    }

    Direction() {
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.extractRotation(this.camera.matrix);
        return new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix).normalize();
    }

    setPosition(pos) {
        this.camera.position.copy(pos);
        this.update();
    }

    setDirection(normal) {
        const pos = this.getPosition();
        const targetPoint = new THREE.Vector3().addVectors(pos, normal);
        const m1 = new THREE.Matrix4();
        m1.lookAt(pos, targetPoint, this.camera.up);
        this.camera.quaternion.setFromRotationMatrix(m1);
        this.update();
    }

    setQuaternion(quat) {
        this.camera.quaternion.copy(quat);
        this.update();
    }

    update() {
        this.camera.updateMatrix();
        this.camera.matrixWorld.copy(this.camera.matrix);
    }

    rotLocal(alpha, phi, theta) {
        const euler = new THREE.Euler(alpha, phi, theta, 'XYZ');
        const quat = new THREE.Quaternion().setFromEuler(euler);
        this.camera.quaternion.multiply(quat);
        this.update();
    }

    rotWorld(alpha, phi, theta, target) {
        const pos = this.getPosition();
        const offset = pos.clone().sub(target);
        const euler = new THREE.Euler(alpha, phi, theta, 'YXZ');
        const quat = new THREE.Quaternion().setFromEuler(euler);

        offset.applyQuaternion(quat);
        this.camera.position.copy(target).add(offset);

        const m1 = new THREE.Matrix4();
        m1.lookAt(this.camera.position, target, this.camera.up);
        this.camera.quaternion.setFromRotationMatrix(m1);

        this.update();
    }

    normalizeAxes() {
        const m = this.camera.matrix;
        let x = new THREE.Vector3().setFromMatrixColumn(m, 0);
        let y = new THREE.Vector3().setFromMatrixColumn(m, 1);
        let z = new THREE.Vector3().setFromMatrixColumn(m, 2);

        z.normalize();
        x.crossVectors(y, z).normalize();
        y.crossVectors(z, x).normalize();

        const newMatrix = new THREE.Matrix4().makeBasis(x, y, z);
        this.camera.quaternion.setFromRotationMatrix(newMatrix);
        this.camera.up.copy(y);
        this.update();
    }
}