export class VideoManager {
    constructor(root = document.body) {
        this.root = root;
        this.view = null;
        this.video = null;
        this.scale = 1;
        this.offset = { x: 0, y: 0 };
        this.isPanning = false;
        this.isResizing = false;
        this.startPan = { x: 0, y: 0, ox: 0, oy: 0 };
        this.startSize = { w: 400, h: 300, x: 0, y: 0 };
        this.focusCb = () => {};
    }

    onFocus(cb) { this.focusCb = cb || (() => {}); }

    loadVideo(file, onLoaded) {
        if (!this.view) this.createView();
        const url = URL.createObjectURL(file);
        this.video.src = url;
        this.video.onloadeddata = () => {
            this.video.play().catch(() => {});
            if (onLoaded) onLoaded();
            this.focusCb();
        };
    }

    createView() {
        this.view = document.createElement('div');
        this.view.id = 'videoView';

        this.video = document.createElement('video');
        this.video.controls = true;
        this.video.style.transformOrigin = 'center center';
        this.video.autoplay = false;
        this.view.appendChild(this.video);

        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        this.view.appendChild(handle);

        this.root.appendChild(this.view);
        this.attachEvents(handle);
    }

    attachEvents(handle) {
        this.view.addEventListener('click', (e) => { e.stopPropagation(); this.focusCb(); });
        this.view.addEventListener('contextmenu', e => e.preventDefault());

        this.view.addEventListener('wheel', e => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.1 : -0.1;
            this.scale = Math.min(5, Math.max(0.05, this.scale + delta));
            this.applyTransform();
            this.focusCb();
        }, { passive: false });

        this.view.addEventListener('mousedown', e => {
            this.focusCb();
            if (e.target === handle) {
                this.isResizing = true;
                this.startSize = { w: this.view.offsetWidth, h: this.view.offsetHeight, x: e.clientX, y: e.clientY };
            } else if (e.button === 2) {
                this.isPanning = true;
                this.startPan = { x: e.clientX, y: e.clientY, ox: this.offset.x, oy: this.offset.y };
            }
        });

        window.addEventListener('mousemove', e => {
            if (this.isResizing) {
                const dx = e.clientX - this.startSize.x;
                const dy = e.clientY - this.startSize.y;
                const w = Math.max(200, this.startSize.w + dx);
                const h = Math.max(150, this.startSize.h + dy);
                this.view.style.width = w + 'px';
                this.view.style.height = h + 'px';
            }
            if (this.isPanning) {
                const dx = e.clientX - this.startPan.x;
                const dy = e.clientY - this.startPan.y;
                this.offset.x = this.startPan.ox + dx;
                this.offset.y = this.startPan.oy + dy;
                this.applyTransform();
            }
        });

        window.addEventListener('mouseup', () => {
            this.isPanning = false;
            this.isResizing = false;
        });
    }

    applyTransform() {
        if (!this.video) return;
        this.video.style.transform = `translate(${this.offset.x}px, ${this.offset.y}px) scale(${this.scale})`;
    }
}