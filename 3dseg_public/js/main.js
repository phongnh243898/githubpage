(function () {
  const ID = 'page-loading-overlay';

  function ensureOverlay() {
    let overlay = document.getElementById(ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = ID;
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: 0,
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
        color: '#fff',
        zIndex: 9999,
        fontFamily: 'sans-serif',
        fontSize: '14px'
      });
      overlay.textContent = 'Loading...';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  window.pageLoading = function (state) {
    const overlay = ensureOverlay();
    overlay.style.display = state === 'on' ? 'flex' : 'none';
  };
})();