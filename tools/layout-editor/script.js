document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    const state = {
        zones: [],
        selectedZoneId: null,
        nextId: 1,
        // Board Panning/Zooming
        pan: { x: 0, y: 0 },
        zoom: 1,
        isPanning: false,
        startPan: { x: 0, y: 0 },
        // Zone Dragging
        dragZone: null,
        isDragging: false,
        startDrag: { x: 0, y: 0 },
        startPos: { x: 0, y: 0 },
        // Zone Resizing
        resizeHandle: null,
        isResizing: false,
        startRect: null
    };

    // --- DOM Elements ---
    const boardContainer = document.querySelector('.board-container');
    const boardWrapper = document.querySelector('.board-wrapper');
    const board = document.getElementById('board');
    
    // Properties Panel
    const propertiesForm = document.getElementById('properties-form');
    const noSelectionMsg = document.getElementById('no-selection-msg');
    
    const inputName = document.getElementById('zone-name');
    const inputW = document.getElementById('zone-w');
    const inputH = document.getElementById('zone-h');
    const inputX = document.getElementById('zone-x');
    const inputY = document.getElementById('zone-y');
    const colorBtns = document.querySelectorAll('.color-btn');
    const btnDelete = document.getElementById('btn-delete-zone');

    // Default zone size
    const DEFAULT_WIDTH = 200;
    const DEFAULT_HEIGHT = 150;

    // --- Center Board Initially ---
    const centerBoard = () => {
        const cw = boardContainer.clientWidth;
        const ch = boardContainer.clientHeight;
        const bw = 2000;
        const bh = 1500;
        
        state.pan.x = (cw - bw) / 2;
        state.pan.y = (ch - bh) / 2;
        updateBoardTransform();
    };
    
    setTimeout(centerBoard, 10);
    window.addEventListener('resize', centerBoard);

    function updateBoardTransform() {
        boardWrapper.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
        boardContainer.style.backgroundPosition = `${state.pan.x}px ${state.pan.y}px`;
        boardContainer.style.backgroundSize = `${40 * state.zoom}px ${40 * state.zoom}px`;
    }

    // --- Board Panning & Zooming ---
    boardContainer.addEventListener('mousedown', (e) => {
        if (e.target === boardContainer || e.target === boardWrapper || e.target === board) {
            state.isPanning = true;
            state.startPan = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
            deselectAll();
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (state.isPanning) {
            state.pan.x = e.clientX - state.startPan.x;
            state.pan.y = e.clientY - state.startPan.y;
            updateBoardTransform();
            return;
        }

        if (state.isDragging && state.dragZone) {
            const dx = (e.clientX - state.startDrag.x) / state.zoom;
            const dy = (e.clientY - state.startDrag.y) / state.zoom;
            
            // Snap to grid (10px)
            const newX = Math.round((state.startPos.x + dx) / 10) * 10;
            const newY = Math.round((state.startPos.y + dy) / 10) * 10;
            
            state.dragZone.x = Math.max(0, Math.min(2000 - state.dragZone.w, newX));
            state.dragZone.y = Math.max(0, Math.min(1500 - state.dragZone.h, newY));
            
            renderZone(state.dragZone);
            updatePropertiesPanel();
            return;
        }

        if (state.isResizing && state.dragZone && state.resizeHandle) {
            const dx = (e.clientX - state.startDrag.x) / state.zoom;
            const dy = (e.clientY - state.startDrag.y) / state.zoom;
            
            let { x, y, w, h } = state.startRect;
            
            if (state.resizeHandle.includes('e')) w += dx;
            if (state.resizeHandle.includes('s')) h += dy;
            if (state.resizeHandle.includes('w')) {
                w -= dx;
                x += dx;
            }
            if (state.resizeHandle.includes('n')) {
                h -= dy;
                y += dy;
            }
            
            // Constraints & Snap to grid
            w = Math.max(50, Math.round(w / 10) * 10);
            h = Math.max(50, Math.round(h / 10) * 10);
            
            if (state.resizeHandle.includes('w')) x = state.startRect.x + state.startRect.w - w;
            if (state.resizeHandle.includes('n')) y = state.startRect.y + state.startRect.h - h;
            
            state.dragZone.x = Math.max(0, x);
            state.dragZone.y = Math.max(0, y);
            state.dragZone.w = w;
            state.dragZone.h = h;
            
            renderZone(state.dragZone);
            updatePropertiesPanel();
        }
    });

    window.addEventListener('mouseup', () => {
        state.isPanning = false;
        state.isDragging = false;
        state.isResizing = false;
        state.dragZone = null;
        state.resizeHandle = null;
    });

    boardContainer.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(0.2, Math.min(3, state.zoom * zoomDelta));
            
            // Zoom towards mouse
            const rect = boardContainer.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            state.pan.x = mouseX - (mouseX - state.pan.x) * (newZoom / state.zoom);
            state.pan.y = mouseY - (mouseY - state.pan.y) * (newZoom / state.zoom);
            
            state.zoom = newZoom;
            updateBoardTransform();
        }
    }, { passive: false });

    // --- Zone Management ---
    function addZone(name, color) {
        // Find center of current view
        const cw = boardContainer.clientWidth;
        const ch = boardContainer.clientHeight;
        const centerX = (cw / 2 - state.pan.x) / state.zoom;
        const centerY = (ch / 2 - state.pan.y) / state.zoom;

        const zone = {
            id: `zone-${state.nextId++}`,
            name: name,
            color: color,
            x: Math.round((centerX - DEFAULT_WIDTH/2) / 10) * 10,
            y: Math.round((centerY - DEFAULT_HEIGHT/2) / 10) * 10,
            w: DEFAULT_WIDTH,
            h: DEFAULT_HEIGHT,
            zIndex: state.zones.length + 1
        };
        
        state.zones.push(zone);
        createZoneElement(zone);
        selectZone(zone.id);
    }

    function createZoneElement(zone) {
        const el = document.createElement('div');
        el.className = 'zone';
        el.id = zone.id;
        
        const label = document.createElement('div');
        label.className = 'zone-label';
        label.textContent = zone.name;
        el.appendChild(label);
        
        // Add resize handles
        ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${dir}`;
            handle.dataset.dir = dir;
            el.appendChild(handle);
        });

        // Event listeners
        el.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            selectZone(zone.id);
            
            if (e.target.classList.contains('resize-handle')) {
                state.isResizing = true;
                state.resizeHandle = e.target.dataset.dir;
                state.startRect = { x: zone.x, y: zone.y, w: zone.w, h: zone.h };
            } else {
                state.isDragging = true;
                state.startPos = { x: zone.x, y: zone.y };
                // Bring to front
                zone.zIndex = Math.max(...state.zones.map(z => z.zIndex), 0) + 1;
                el.style.zIndex = zone.zIndex;
            }
            
            state.dragZone = zone;
            state.startDrag = { x: e.clientX, y: e.clientY };
        });

        board.appendChild(el);
        renderZone(zone);
    }

    function renderZone(zone) {
        const el = document.getElementById(zone.id);
        if (!el) return;
        
        el.style.transform = `translate(${zone.x}px, ${zone.y}px)`;
        el.style.width = `${zone.w}px`;
        el.style.height = `${zone.h}px`;
        el.style.background = zone.color;
        
        // Match border color to background (slightly opaque)
        const borderColor = zone.color.replace('0.2)', '1)').replace('rgba', 'rgb');
        el.style.borderColor = borderColor;
        
        el.querySelector('.zone-label').textContent = zone.name;
        el.style.zIndex = zone.zIndex;
    }

    function getSelectedZone() {
        return state.zones.find(z => z.id === state.selectedZoneId);
    }

    function selectZone(id) {
        deselectAll();
        state.selectedZoneId = id;
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('selected');
        }
        updatePropertiesPanel();
    }

    function deselectAll() {
        state.selectedZoneId = null;
        document.querySelectorAll('.zone').forEach(el => el.classList.remove('selected'));
        updatePropertiesPanel();
    }

    function deleteSelectedZone() {
        if (!state.selectedZoneId) return;
        
        const index = state.zones.findIndex(z => z.id === state.selectedZoneId);
        if (index !== -1) {
            state.zones.splice(index, 1);
            const el = document.getElementById(state.selectedZoneId);
            if (el) el.remove();
            deselectAll();
        }
    }

    // --- Properties Panel Logic ---
    function updatePropertiesPanel() {
        const zone = getSelectedZone();
        
        if (zone) {
            noSelectionMsg.classList.add('hidden');
            propertiesForm.classList.remove('hidden');
            
            inputName.value = zone.name;
            inputW.value = zone.w;
            inputH.value = zone.h;
            inputX.value = zone.x;
            inputY.value = zone.y;
            
            colorBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.color === zone.color);
            });
        } else {
            noSelectionMsg.classList.remove('hidden');
            propertiesForm.classList.add('hidden');
        }
    }

    // Property Event Listeners
    inputName.addEventListener('input', (e) => {
        const zone = getSelectedZone();
        if (zone) {
            zone.name = e.target.value;
            renderZone(zone);
        }
    });

    [inputW, inputH, inputX, inputY].forEach(input => {
        input.addEventListener('change', () => {
            const zone = getSelectedZone();
            if (zone) {
                zone.w = Math.max(50, parseInt(inputW.value) || 50);
                zone.h = Math.max(50, parseInt(inputH.value) || 50);
                zone.x = Math.max(0, parseInt(inputX.value) || 0);
                zone.y = Math.max(0, parseInt(inputY.value) || 0);
                renderZone(zone);
            }
        });
    });

    colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const zone = getSelectedZone();
            if (zone) {
                zone.color = btn.dataset.color;
                renderZone(zone);
                updatePropertiesPanel();
            }
        });
    });

    btnDelete.addEventListener('click', deleteSelectedZone);

    // --- UI Buttons ---
    document.querySelectorAll('.btn-add').forEach(btn => {
        btn.addEventListener('click', () => {
            addZone(btn.dataset.type, btn.dataset.color);
        });
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        if(confirm("Are you sure you want to clear the entire layout?")) {
            state.zones = [];
            board.innerHTML = '';
            deselectAll();
        }
    });

    // --- Export / Import ---
    document.getElementById('btn-export').addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.zones, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "compile_board_layout.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    document.getElementById('btn-import').addEventListener('click', () => {
        document.getElementById('file-import').click();
    });

    document.getElementById('file-import').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedZones = JSON.parse(event.target.result);
                if (Array.isArray(importedZones)) {
                    // Clear current
                    state.zones = [];
                    board.innerHTML = '';
                    
                    importedZones.forEach(z => {
                        state.zones.push(z);
                        createZoneElement(z);
                        // update nextId
                        const idNum = parseInt(z.id.split('-')[1]);
                        if (idNum >= state.nextId) {
                            state.nextId = idNum + 1;
                        }
                    });
                    deselectAll();
                    centerBoard();
                } else {
                    alert("Invalid JSON format.");
                }
            } catch (err) {
                alert("Error parsing JSON file.");
                console.error(err);
            }
        };
        reader.readAsText(file);
        // Reset input
        e.target.value = '';
    });
    
    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Don't delete if editing an input
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            deleteSelectedZone();
        }
    });
});
