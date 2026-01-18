// File: video3d.js
// Author: NgoPhong98

class VideoManager {
  constructor(domElement, config = {}) {
    const {
      startSize = { width: 400, height: 200 },
      minScale = 0.1,
      maxScale = 10,
      seekStep = 1
    } = config;

    this.domContainer = domElement;
    this.videoSrc = null;
    this.domVideo = null;
    this.content = null;
    this.handles = {};
    this._objectUrl = null;
    this._spaceLock = false;

    this.state = {
      scale: 1,
      offset: { x: 0, y: 0 },
      startPan: { x: 0, y: 0, ox: 0, oy: 0 },
      isPanning: false,
      isResizing: false,
      resizeDir: null,
      startSize: { ...startSize }
    };

    this.config = { startSize, minScale, maxScale, seekStep };
    this._generatorDom();
    this.attachEvents();
  }

  loadVideo(fileOrUrl, onLoaded) {
    if (!fileOrUrl) return;
    if (this._objectUrl) {
      URL.revokeObjectURL(this._objectUrl);
      this._objectUrl = null;
    }
    if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
      this._objectUrl = URL.createObjectURL(fileOrUrl);
      this.domVideo.src = this._objectUrl;
      this.domVideo.load();
    } else if (typeof fileOrUrl === "string") {
      this.domVideo.src = fileOrUrl;
      this.domVideo.load();
    }
    if (typeof onLoaded === "function") {
      this.domVideo.onloadeddata = () => onLoaded(this.domVideo);
    }
  }

  _generatorDom() {
    const { width, height } = this.config.startSize;
    const wrap = this.domContainer;
    wrap.style.position = "relative";
    wrap.style.userSelect = "none";
    wrap.style.overflow = "hidden";
    wrap.style.width = `${width}px`;
    wrap.style.height = `${height}px`;
    wrap.tabIndex = 0;

    this.content = document.createElement("div");
    this.content.style.position = "absolute";
    this.content.style.top = "0";
    this.content.style.left = "0";
    this.content.style.width = "100%";
    this.content.style.height = "100%";
    this.content.style.transformOrigin = "0 0";

    this.domVideo = document.createElement("video");
    this.domVideo.controls = true;
    this.domVideo.style.width = "100%";
    this.domVideo.style.height = "100%";
    this.domVideo.style.display = "block";

    this.content.appendChild(this.domVideo);
    wrap.appendChild(this.content);

    const dirs = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
    dirs.forEach((d) => {
      const h = document.createElement("div");
      h.dataset.dir = d;
      h.style.position = "absolute";
      h.style.width = d.includes("n") || d.includes("s") ? "100%" : "10px";
      h.style.height = d.includes("e") || d.includes("w") ? "100%" : "10px";
      h.style.background = "transparent";
      h.style.cursor = `${d}-resize`;
      h.style.zIndex = 5;
      if (d.includes("n")) h.style.top = "-4px";
      if (d.includes("s")) h.style.bottom = "-4px";
      if (d.includes("e")) h.style.right = "-4px";
      if (d.includes("w")) h.style.left = "-4px";
      if (["ne", "nw", "se", "sw"].includes(d)) {
        h.style.width = "10px";
        h.style.height = "10px";
      }
      wrap.appendChild(h);
      this.handles[d] = h;
    });
  }

  attachEvents() {
    // Focus để nhận phím
    this.domContainer.addEventListener("pointerdown", () => {
      if (document.activeElement !== this.domContainer) this.domContainer.focus();
    });

    // Pause khi cửa sổ/tab mất focus (không pause khi click video/controls)
    this._onWindowBlur = () => {
      if (!this.domVideo.paused) this.domVideo.pause();
    };
    window.addEventListener("blur", this._onWindowBlur);

    // Resize
    Object.values(this.handles).forEach((h) => {
      h.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.state.isResizing = true;
        this.state.resizeDir = h.dataset.dir;
        this.state.startSize = {
          width: this.domContainer.offsetWidth,
          height: this.domContainer.offsetHeight,
          x: e.clientX,
          y: e.clientY
        };
        document.addEventListener("pointermove", this._onResizeMove);
        document.addEventListener("pointerup", this._onResizeUp, { once: true });
      });
    });

    // Pan (chuột phải)
    this.domContainer.addEventListener("pointerdown", (e) => {
      if (e.button !== 2) return;
      e.preventDefault();
      this.state.isPanning = true;
      this.state.startPan = {
        x: e.clientX,
        y: e.clientY,
        ox: this.state.offset.x,
        oy: this.state.offset.y
      };
      document.addEventListener("pointermove", this._onPanMove);
      document.addEventListener("pointerup", this._onPanUp, { once: true });
    });
    this.domContainer.addEventListener("contextmenu", (e) => e.preventDefault());

    // Zoom (wheel)
    this.domContainer.addEventListener("wheel", (e) => {
      e.preventDefault();
      const prev = this.state.scale;
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      const next = Math.min(this.config.maxScale, Math.max(this.config.minScale, prev + delta));
      if (next === prev) return;
      const rect = this.content.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const k = next / prev;
      this.state.offset.x = cx - (cx - this.state.offset.x) * k;
      this.state.offset.y = cy - (cy - this.state.offset.y) * k;
      this.state.scale = next;
      this._applyTransform();
    }, { passive: false });

    // Keyboard
    this.domContainer.addEventListener("keydown", this._onKeyDown, true);
    this.domContainer.addEventListener("keyup", this._onKeyUp, true);
    window.addEventListener("keydown", this._onKeyDown, true);
    window.addEventListener("keyup", this._onKeyUp, true);
  }

  _onKeyDown = (e) => {
    if (e.code === "Space") {
      if (this._spaceLock) return;
      this._spaceLock = true;
      e.preventDefault();
      e.stopPropagation();
      this.domVideo.paused ? this.domVideo.play() : this.domVideo.pause();
    } else if (e.code === "ArrowRight" || e.code === "PageDown") {
      e.preventDefault();
      e.stopPropagation();
      this.domVideo.currentTime = Math.min(this.domVideo.duration || Infinity, this.domVideo.currentTime + this.config.seekStep);
    } else if (e.code === "ArrowLeft" || e.code === "PageUp") {
      e.preventDefault();
      e.stopPropagation();
      this.domVideo.currentTime = Math.max(0, this.domVideo.currentTime - this.config.seekStep);
    }
  };

  _onKeyUp = (e) => {
    if (e.code === "Space") {
      this._spaceLock = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  _onResizeMove = (e) => {
    if (!this.state.isResizing) return;
    const { width, height, x, y } = this.state.startSize;
    let newW = width;
    let newH = height;
    const dir = this.state.resizeDir;
    const dx = e.clientX - x;
    const dy = e.clientY - y;

    if (dir.includes("e")) newW = width + dx;
    if (dir.includes("w")) newW = width - dx;
    if (dir.includes("s")) newH = height + dy;
    if (dir.includes("n")) newH = height - dy;

    this.domContainer.style.width = `${Math.max(50, newW)}px`;
    this.domContainer.style.height = `${Math.max(50, newH)}px`;
  };

  _onResizeUp = () => {
    this.state.isResizing = false;
    this.state.resizeDir = null;
    document.removeEventListener("pointermove", this._onResizeMove);
  };

  _onPanMove = (e) => {
    if (!this.state.isPanning) return;
    const dx = e.clientX - this.state.startPan.x;
    const dy = e.clientY - this.state.startPan.y;
    this.state.offset.x = this.state.startPan.ox + dx;
    this.state.offset.y = this.state.startPan.oy + dy;
    this._applyTransform();
  };

  _onPanUp = () => {
    this.state.isPanning = false;
    document.removeEventListener("pointermove", this._onPanMove);
  };

  _applyTransform() {
    const { scale, offset } = this.state;
    this.content.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`;
  }

  destroy() {
    if (this._objectUrl) {
      URL.revokeObjectURL(this._objectUrl);
      this._objectUrl = null;
    }
    window.removeEventListener("blur", this._onWindowBlur);
    this.domContainer.removeEventListener("keydown", this._onKeyDown, true);
    this.domContainer.removeEventListener("keyup", this._onKeyUp, true);
    window.removeEventListener("keydown", this._onKeyDown, true);
    window.removeEventListener("keyup", this._onKeyUp, true);
  }
}

const container = document.querySelector("#view-video3d");
const input = document.querySelector("#load-video3d");
const vm = new VideoManager(container);
input.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  pageLoading("on");
  if (f) vm.loadVideo(f);
  pageLoading("off");
  console.log("Video is loaded.");
});