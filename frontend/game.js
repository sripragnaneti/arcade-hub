const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Theme Logic ---
const themeBtn = document.getElementById('theme-toggle');
if (localStorage.getItem('arcade-theme') === 'light') {
    document.body.classList.add('light-mode');
    themeBtn.textContent = '☀️';
}
themeBtn.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-mode');
    themeBtn.textContent = isLight ? '☀️' : '🌙';
    localStorage.setItem('arcade-theme', isLight ? 'light' : 'dark');
    if (gameState.active) draw();
    if (slState.active) drawSL();
    if (sudokuState.active) renderSudoku();
});

const hudMoves = document.getElementById('moves-display');
const hudTime = document.getElementById('time-display');
const hudLevel = document.getElementById('level-display');
const botStatus = document.getElementById('bot-status');
const botDistance = document.getElementById('bot-distance');

const modeSelection = document.getElementById('mode-selection');
const startScreen = document.getElementById('start-screen');
const overlay = document.getElementById('overlay');
const mainGameContainer = document.getElementById('game-container');

// --- Snakes & Ladders UI ---
const slSetup = document.getElementById('sl-setup');
const slGameContainer = document.getElementById('sl-game-container');
const slCanvas = document.getElementById('slCanvas');
const slCtx = slCanvas.getContext('2d');
const slStatus = document.getElementById('sl-status-msg');
const slPPos = document.getElementById('p-pos');
const slBPos = document.getElementById('b-pos');
const diceBox = document.getElementById('dice-display');

// --- Helpers ---
function getThemeColor(varName) {
    return getComputedStyle(document.body).getPropertyValue(varName).trim();
}

// --- Game State ---
let gameState = {
    mode: 'SINGLE',
    gridSize: 8,
    difficulty: 'EASY',
    moves: 0,
    startTime: null,
    timerInterval: null,
    botInterval: null,
    player: { x: 0, y: 0 },
    bot: { x: 0, y: 0, path: [], currentIndex: 0 },
    maze: [],
    backtrackCount: 0,
    optimalMoves: 0,
    averageMoves: 0,
    cellSize: 0,
    active: false,
    historySet: new Set()
};

let slState = {
    playerPos: 1,
    botPos: 1,
    playerColor: '#a2ff00',
    botColor: '#ff00f2',
    board: {},
    active: false,
    isBotTurn: false,
    gridSize: 10,
    cellSize: 0,
    isMoving: false
};

let sudokuState = {
    board: [],
    solution: [],
    selectedCell: null,
    mistakes: 0,
    difficulty: 'EASY',
    active: false
};

// --- Sudoku UI ---
const sudokuGameContainer = document.getElementById('sudoku-game-container');
const sudokuBoard = document.getElementById('sudoku-board');
const sudokuSetup = document.getElementById('sudoku-setup');

// ==========================================
// MAZE RUNNER LOGIC
// ==========================================

function draw() {
    const size = gameState.gridSize;
    const cw = gameState.cellSize;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.beginPath();
    ctx.strokeStyle = getThemeColor('--canvas-line');
    ctx.lineWidth = 2;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const cell = gameState.maze[y][x];
            const px = x * cw; const py = y * cw;
            if (cell.walls.top) { ctx.moveTo(px, py); ctx.lineTo(px + cw, py); }
            if (cell.walls.right) { ctx.moveTo(px + cw, py); ctx.lineTo(px + cw, py + cw); }
            if (cell.walls.bottom) { ctx.moveTo(px, py + cw); ctx.lineTo(px + cw, py + cw); }
            if (cell.walls.left) { ctx.moveTo(px, py); ctx.lineTo(px, py + cw); }
        }
    }
    ctx.stroke();

    if (gameState.active) {
        if (gameState.mode === 'BOT') {
            ctx.fillStyle = getThemeColor('--bot-color');
            ctx.beginPath();
            ctx.arc(gameState.bot.x * cw + cw/2, gameState.bot.y * cw + cw/2, cw * 0.25, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = getThemeColor('--exit-color');
        ctx.fillRect((size - 1) * cw + cw * 0.2, (size - 1) * cw + cw * 0.2, cw * 0.6, cw * 0.6);

        ctx.fillStyle = getThemeColor('--player');
        ctx.beginPath();
        ctx.arc(gameState.player.x * cw + cw / 2, gameState.player.y * cw + cw / 2, cw * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
}

async function initGame(manualSize = null) {
    mainGameContainer.style.display = 'flex';
    slGameContainer.style.display = 'none';
    sudokuGameContainer.style.display = 'none';
    overlay.classList.remove('active');
    startScreen.classList.remove('active');
    modeSelection.classList.remove('active');
    
    clearInterval(gameState.timerInterval);
    clearInterval(gameState.botInterval);

    const targetSize = manualSize || gameState.gridSize;
    const params = new URLSearchParams({ gridSize: targetSize });

    try {
        const response = await fetch(`/api/get-maze?${params}`);
        const data = await response.json();
        gameState.maze = data.maze;
        gameState.gridSize = data.gridSize;
        gameState.optimalMoves = data.optimalMoves;
        gameState.difficulty = data.difficulty;
        gameState.player = { x: 0, y: 0 };
        gameState.moves = 0;
        gameState.startTime = null;

        if (gameState.mode === 'BOT') {
            gameState.bot = { x: 0, y: 0, currentIndex: 0, path: await calculateBotPath() };
            botStatus.style.display = 'flex';
        } else {
            botStatus.style.display = 'none';
        }

        const maxDim = Math.min(window.innerWidth * 0.8, window.innerHeight * 0.6, 600);
        canvas.width = maxDim;
        canvas.height = maxDim;
        gameState.cellSize = canvas.width / gameState.gridSize;
        gameState.active = true;
        draw();
    } catch (e) { 
        console.error(e);
        alert("NEURAL LINK FAILURE: Could not connect to the maze generation engine. Please check your system connection (server).");
        modeSelection.classList.add('active'); // Return to menu
    }
}

async function calculateBotPath() {
    const size = gameState.gridSize;
    const queue = [[{ x: 0, y: 0 }]];
    const visited = new Set(['0,0']);
    while (queue.length > 0) {
        const path = queue.shift();
        const cell = path[path.length - 1];
        if (cell.x === size - 1 && cell.y === size - 1) return path;
        const currentCell = gameState.maze[cell.y][cell.x];
        const neighbors = [];
        if (!currentCell.walls.top) neighbors.push({ x: cell.x, y: cell.y - 1 });
        if (!currentCell.walls.right) neighbors.push({ x: cell.x + 1, y: cell.y });
        if (!currentCell.walls.bottom) neighbors.push({ x: cell.x, y: cell.y + 1 });
        if (!currentCell.walls.left) neighbors.push({ x: cell.x - 1, y: cell.y });
        for (let n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (!visited.has(key)) { visited.add(key); queue.push([...path, n]); }
        }
    }
}

function movePlayer(dx, dy) {
    if (!gameState.active) return;
    const { x, y } = gameState.player;
    const currentCell = gameState.maze[y][x];
    const nx = x + dx; const ny = y + dy;
    if (nx < 0 || nx >= gameState.gridSize || ny < 0 || ny >= gameState.gridSize) return;
    if (dx === 1 && currentCell.walls.right) return;
    if (dx === -1 && currentCell.walls.left) return;
    if (dy === 1 && currentCell.walls.bottom) return;
    if (dy === -1 && currentCell.walls.top) return;

    if (gameState.moves === 0) {
        gameState.startTime = Date.now();
        gameState.timerInterval = setInterval(() => {
            const el = Math.floor((Date.now() - gameState.startTime) / 1000);
            hudTime.textContent = `${Math.floor(el/60).toString().padStart(2,'0')}:${(el%60).toString().padStart(2,'0')}`;
        }, 1000);
        if (gameState.mode === 'BOT') startBot();
    }
    gameState.player.x = nx; gameState.player.y = ny;
    gameState.moves++; hudMoves.textContent = gameState.moves;
    draw();
    if (nx === gameState.gridSize - 1 && ny === gameState.gridSize - 1) finishLevel(false);
}

function startBot() {
    const speed = gameState.difficulty === 'EASY' ? 800 : 500;
    gameState.botInterval = setInterval(() => {
        if (!gameState.active) return;
        gameState.bot.currentIndex++;
        const next = gameState.bot.path[gameState.bot.currentIndex];
        if (next) {
            gameState.bot.x = next.x; gameState.bot.y = next.y;
            draw();
            if (next.x === gameState.gridSize - 1 && next.y === gameState.gridSize - 1) finishLevel(true);
        }
    }, speed);
}

function finishLevel(botWon) {
    gameState.active = false;
    clearInterval(gameState.timerInterval);
    clearInterval(gameState.botInterval);
    overlay.classList.add('active');
    document.getElementById('overlay-title').textContent = botWon ? "DEFEAT" : "VICTORY";
    document.getElementById('stats-summary').innerHTML = `<p style="font-size:1.5rem">${botWon ? 'Bot reached the exit first!' : 'You reached the exit!'}</p>`;
}

// ==========================================
// SNAKES & LADDERS LOGIC
// ==========================================

function initSLGame() {
    mainGameContainer.style.display = 'none';
    slGameContainer.style.display = 'flex';
    sudokuGameContainer.style.display = 'none';
    slState.playerPos = 1;
    slState.botPos = 1;
    slState.active = true;
    slState.isMoving = false;
    slState.isBotTurn = false;
    slState.board = generateSLBoard();
    const size = Math.min(window.innerWidth * 0.9, window.innerHeight * 0.7, 500);
    slCanvas.width = size; slCanvas.height = size;
    slState.cellSize = size / 10;
    drawSL();
    updateSLHud();
}

function generateSLBoard() {
    const b = {};
    for(let i=0; i<12; i++) {
        let s = Math.floor(Math.random()*90)+5;
        let e = Math.floor(Math.random()*90)+5;
        if (s !== e && !b[s]) b[s] = e;
    }
    return b;
}

function drawSL() {
    slCtx.clearRect(0,0,slCanvas.width,slCanvas.height);
    const cs = slState.cellSize;
    const lineCol = getThemeColor('--canvas-line');
    for(let i=1; i<=100; i++) {
        const {x, y} = getSLCoords(i);
        slCtx.strokeStyle = lineCol;
        slCtx.strokeRect(x*cs, y*cs, cs, cs);
        slCtx.fillStyle = getThemeColor('--text-dim');
        slCtx.font = 'bold 10px Outfit';
        slCtx.textAlign = 'left';
        slCtx.fillText(i, x*cs + 5, y*cs + 15);
        if (slState.board[i]) {
            const isLadder = slState.board[i] > i;
            slCtx.fillStyle = isLadder ? 'rgba(162,255,0,0.1)' : 'rgba(255,60,0,0.1)';
            slCtx.fillRect(x*cs, y*cs, cs, cs);
            const target = getSLCoords(slState.board[i]);
            slCtx.beginPath();
            slCtx.strokeStyle = isLadder ? getThemeColor('--accent') : getThemeColor('--exit-color');
            slCtx.lineWidth = 2;
            slCtx.setLineDash([5, 5]);
            slCtx.moveTo(x*cs + cs/2, y*cs + cs/2);
            slCtx.lineTo(target.x*cs + cs/2, target.y*cs + cs/2);
            slCtx.stroke();
            slCtx.setLineDash([]);
        }
    }
    const pc = getSLCoords(slState.playerPos);
    drawFigure(pc.x, pc.y, getThemeColor('--player'), true);
    const bc = getSLCoords(slState.botPos);
    drawFigure(bc.x, bc.y, getThemeColor('--bot-color'), false);
}

function getSLCoords(pos) {
    let r = Math.floor((pos-1)/10);
    let c = (pos-1)%10;
    if (r%2 !== 0) c = 9-c;
    return { x: c, y: 9-r };
}

function drawFigure(x, y, color, isPlayer) {
    const cs = slState.cellSize;
    slCtx.beginPath();
    slCtx.arc(x*cs + cs/2 + (isPlayer?-5:5), y*cs + cs/2, cs*0.2, 0, Math.PI*2);
    slCtx.fillStyle = color; slCtx.fill();
    slCtx.strokeStyle = getThemeColor('--surface'); slCtx.lineWidth = 2; slCtx.stroke();
}

function updateSLHud() {
    slPPos.textContent = slState.playerPos;
    slBPos.textContent = slState.botPos;
}

// Visual Step-by-Step Movement
async function moveFigureSmoothly(type, steps) {
    slState.isMoving = true;
    for (let i = 0; i < steps; i++) {
        let key = type === 'player' ? 'playerPos' : 'botPos';
        if (slState[key] < 100) {
            slState[key]++;
            drawSL();
            updateSLHud();
            await new Promise(r => setTimeout(r, 200));
        }
    }

    // Check for Snake/Ladder after move
    let key = type === 'player' ? 'playerPos' : 'botPos';
    let currentPos = slState[key];
    if (slState.board[currentPos]) {
        slStatus.textContent = slState.board[currentPos] > currentPos ? "BOOST!" : "DROP!";
        await new Promise(r => setTimeout(r, 400));
        slState[key] = slState.board[currentPos];
        drawSL();
        updateSLHud();
    }
    
    slState.isMoving = false;
    
    if (slState[key] === 100) {
        slState.active = false;
        alert(type === 'player' ? "YOU WIN!" : "BOT WINS!");
    }
}

async function handleSLTurn(type) {
    if (!slState.active || slState.isMoving) return;
    
    // Safety: don't allow player action during bot turn or rolling
    if (type === 'player' && slState.isBotTurn) return;

    const rollBtn = document.getElementById('roll-btn');
    if (type === 'bot') rollBtn.style.opacity = '0.3';

    const dice = Math.floor(Math.random()*6)+1;
    diceBox.textContent = "...";
    diceBox.classList.add('rolling');
    
    await new Promise(r => setTimeout(r, 600));
    diceBox.classList.remove('rolling');
    diceBox.textContent = dice;
    slStatus.textContent = type === 'bot' ? "BOT ROLLING..." : "YOU ROLLED!";

    await moveFigureSmoothly(type, dice);

    if (type === 'player' && slState.active) {
        slState.isBotTurn = true;
        // Bot turn delay - after player finishes moving
        setTimeout(() => handleSLTurn('bot'), 600);
    } else if (type === 'bot') {
        slState.isBotTurn = false;
        rollBtn.style.opacity = '1';
    }
}

// ==========================================
// EVENT LISTENERS
// ==========================================

document.getElementById('single-mode-btn').addEventListener('click', () => { gameState.mode = 'SINGLE'; modeSelection.classList.remove('active'); startScreen.classList.add('active'); });
document.getElementById('bot-mode-btn').addEventListener('click', () => { gameState.mode = 'BOT'; modeSelection.classList.remove('active'); startScreen.classList.add('active'); });
document.getElementById('start-btn').addEventListener('click', () => initGame(parseInt(document.getElementById('start-grid-size').value)));
document.getElementById('next-btn').addEventListener('click', () => initGame());

document.getElementById('sl-mode-btn').addEventListener('click', () => { modeSelection.classList.remove('active'); slSetup.classList.add('active'); });
document.querySelectorAll('.avatar-opt').forEach(opt => {
    opt.addEventListener('click', () => {
        document.querySelectorAll('.avatar-opt').forEach(a => a.classList.remove('selected'));
        opt.classList.add('selected');
        slState.playerColor = opt.dataset.color;
    });
});
document.getElementById('sl-start-game-btn').addEventListener('click', () => { slSetup.classList.remove('active'); initSLGame(); });
document.getElementById('sl-new-btn').addEventListener('click', () => { if (!slState.isMoving) initSLGame(); });
document.getElementById('roll-btn').addEventListener('click', () => { if (slState.active && !slState.isBotTurn && !slState.isMoving) handleSLTurn('player'); });

document.getElementById('quit-btn').addEventListener('click', () => { location.reload(); });
document.getElementById('sl-quit-btn').addEventListener('click', () => { location.reload(); });

// ==========================================
// SUDOKU LOGIC
// ==========================================

function initSudoku() {
    mainGameContainer.style.display = 'none';
    slGameContainer.style.display = 'none';
    sudokuGameContainer.style.display = 'flex';
    sudokuState.mistakes = 0;
    sudokuState.active = true;
    document.getElementById('sudoku-mistakes').textContent = `0/3`;
    document.getElementById('sudoku-diff-display').textContent = sudokuState.difficulty;
    
    generateSudoku();
    renderSudoku();
    checkSudokuNumbers();
}

function checkSudokuNumbers() {
    const counts = {};
    for (let i = 1; i <= 9; i++) counts[i] = 0;
    sudokuState.board.forEach(v => { if (v !== 0) counts[v]++; });

    document.querySelectorAll('.num-btn').forEach(btn => {
        const n = parseInt(btn.dataset.num);
        if (counts[n] >= 9) {
            btn.classList.add('deactivated');
            btn.style.opacity = '0.2';
            btn.style.pointerEvents = 'none';
        } else {
            btn.classList.remove('deactivated');
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'all';
        }
    });
}

function generateSudoku() {
    const board = Array(81).fill(0);
    solveSudoku(board); // fill complete board
    sudokuState.solution = [...board];
    
    // New balanced clue counts
    const totalTarget = sudokuState.difficulty === 'EASY' ? 48 : (sudokuState.difficulty === 'MEDIUM' ? 43 : 38);
    
    // Distribute clues evenly across all nine 3x3 blocks
    const baseCluesPerBlock = Math.floor(totalTarget / 9);
    let extraClues = totalTarget % 9;
    
    // Create list of block clue targets
    const blockClueTargets = Array(9).fill(baseCluesPerBlock);
    for(let i=0; i<extraClues; i++) blockClueTargets[i]++;
    // Shuffle targets to randomize which blocks get the extra clues
    for (let i = blockClueTargets.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [blockClueTargets[i], blockClueTargets[j]] = [blockClueTargets[j], blockClueTargets[i]];
    }

    // Clear board and apply removals per block
    const finalBoard = [...sudokuState.solution];
    for (let b = 0; b < 9; b++) {
        const rBlock = Math.floor(b / 3);
        const cBlock = b % 3;
        const blockIndices = [];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                blockIndices.push((rBlock * 3 + i) * 9 + (cBlock * 3 + j));
            }
        }
        // Shuffle block indices
        for (let i = blockIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [blockIndices[i], blockIndices[j]] = [blockIndices[j], blockIndices[i]];
        }
        // Keep only 'target' clues in this block
        const target = blockClueTargets[b];
        for (let i = target; i < 9; i++) {
            finalBoard[blockIndices[i]] = 0;
        }
    }

    // Final Validation: Ensure no row or column is empty or full (though very unlikely now)
    for (let i = 0; i < 9; i++) {
        let rSum = 0, cSum = 0;
        for (let j = 0; j < 9; j++) {
            if (finalBoard[i * 9 + j] !== 0) rSum++;
            if (finalBoard[j * 9 + i] !== 0) cSum++;
        }
        // Ensure no empty rows/cols and no full rows/cols
        if (rSum === 0) finalBoard[i * 9 + Math.floor(Math.random() * 9)] = sudokuState.solution[i * 9 + Math.floor(Math.random() * 9)];
        if (cSum === 0) finalBoard[Math.floor(Math.random() * 9) * 9 + i] = sudokuState.solution[Math.floor(Math.random() * 9) * 9 + i];
        if (rSum === 9) finalBoard[i * 9 + Math.floor(Math.random() * 9)] = 0;
        if (cSum === 9) finalBoard[Math.floor(Math.random() * 9) * 9 + i] = 0;
    }
    
    sudokuState.board = finalBoard;
}

function solveSudoku(board) {
    for (let i = 0; i < 81; i++) {
        if (board[i] === 0) {
            for (let val = 1; val <= 9; val++) {
                if (isValidSudoku(board, i, val)) {
                    board[i] = val;
                    if (solveSudoku(board)) return true;
                    board[i] = 0;
                }
            }
            return false;
        }
    }
    return true;
}

function isValidSudoku(board, idx, val) {
    let r = Math.floor(idx/9), c = idx%9;
    for (let i=0; i<9; i++) {
        if (board[r*9+i] === val || board[i*9+c] === val) return false;
    }
    let br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
    for (let i=0; i<3; i++) {
        for (let j=0; j<3; j++) {
            if (board[(br+i)*9+(bc+j)] === val) return false;
        }
    }
    return true;
}

function renderSudoku() {
    sudokuBoard.innerHTML = '';
    sudokuState.board.forEach((val, i) => {
        const cell = document.createElement('div');
        cell.className = 'sudoku-cell' + (val !== 0 ? ' fixed' : '');
        cell.textContent = val !== 0 ? val : '';
        cell.addEventListener('click', () => {
            // Remove previous selections and highlights
            document.querySelectorAll('.sudoku-cell').forEach(c => {
                c.classList.remove('selected');
                c.classList.remove('highlight-num');
            });

            if (val !== 0) {
                // Highlight all instances of this number
                document.querySelectorAll('.sudoku-cell').forEach(c => {
                    if (c.textContent === val.toString()) {
                        c.classList.add('highlight-num');
                    }
                });
                return;
            }
            
            cell.classList.add('selected');
            sudokuState.selectedCell = i;
        });
        sudokuBoard.appendChild(cell);
    });
}

function handleSudokuInput(num) {
    if (sudokuState.selectedCell === null || !sudokuState.active) return;
    const idx = sudokuState.selectedCell;
    const cells = document.querySelectorAll('.sudoku-cell');
    
    if (sudokuState.solution[idx] === num) {
        sudokuState.board[idx] = num;
        cells[idx].textContent = num;
        cells[idx].classList.remove('selected');
        sudokuState.selectedCell = null;
        checkSudokuNumbers();
        if (!sudokuState.board.includes(0)) alert("NEURAL GRID CLEARED!");
    } else {
        sudokuState.mistakes++;
        document.getElementById('sudoku-mistakes').textContent = `${sudokuState.mistakes}/3`;
        cells[idx].classList.add('error');
        setTimeout(() => cells[idx].classList.remove('error'), 500);
        if (sudokuState.mistakes >= 3) {
            alert("LOGIC FAILURE - SUDOKU ABORTED");
            location.reload();
        }
    }
}

document.getElementById('sudoku-start-btn').addEventListener('click', () => { modeSelection.classList.remove('active'); sudokuSetup.classList.add('active'); });
document.querySelectorAll('#sudoku-setup .avatar-opt').forEach(opt => {
    opt.addEventListener('click', () => {
        document.querySelectorAll('#sudoku-setup .avatar-opt').forEach(a => a.classList.remove('selected'));
        opt.classList.add('selected');
        sudokuState.difficulty = opt.dataset.diff;
    });
});
document.getElementById('sudoku-begin-btn').addEventListener('click', () => { sudokuSetup.classList.remove('active'); initSudoku(); });
document.querySelectorAll('#sudoku-new-easy, #sudoku-new-medium, #sudoku-new-hard').forEach(btn => {
    btn.addEventListener('click', () => {
        sudokuState.difficulty = btn.dataset.diff;
        initSudoku();
    });
});
document.querySelectorAll('.setup-abort-btn').forEach(btn => btn.addEventListener('click', () => location.reload()));
document.getElementById('sudoku-quit-btn').addEventListener('click', () => location.reload());
document.querySelectorAll('.num-btn').forEach(btn => btn.addEventListener('click', () => handleSudokuInput(parseInt(btn.dataset.num))));

window.addEventListener('keydown', (e) => {
    if (gameState.active) {
        if (e.key === 'ArrowUp' || e.key === 'w') movePlayer(0, -1);
        if (e.key === 'ArrowDown' || e.key === 's') movePlayer(0, 1);
        if (e.key === 'ArrowLeft' || e.key === 'a') movePlayer(-1, 0);
        if (e.key === 'ArrowRight' || e.key === 'd') movePlayer(1, 0);
    }
    
    if (sudokuState.active) {
        if (e.key >= '1' && e.key <= '9') {
            handleSudokuInput(parseInt(e.key));
        }
    }
});
