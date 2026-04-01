/**
 * ADAPTIVE MAZE RUNNER — Backend Server
 * 
 * Serves the static frontend and provides the /api/get-maze endpoint.
 * Uses recursive backtracking for maze generation and BFS for optimal path.
 * No external dependencies — pure Node.js.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// ============================================================
// MIME type lookup
// ============================================================
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
};

// ============================================================
// Maze Generation — Recursive Backtracker (DFS)
// ============================================================
function generateMaze(size) {
    // Initialize grid — every cell has all 4 walls
    const grid = Array.from({ length: size }, (_, y) =>
        Array.from({ length: size }, (_, x) => ({
            x, y,
            walls: { top: true, right: true, bottom: true, left: true },
            visited: false,
        }))
    );

    const stack = [];
    const start = grid[0][0];
    start.visited = true;
    stack.push(start);

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const neighbors = getUnvisitedNeighbors(current, grid, size);

        if (neighbors.length === 0) {
            stack.pop();
        } else {
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            removeWall(current, next);
            next.visited = true;
            stack.push(next);
        }
    }

    // Strip the 'visited' flag before sending to client
    return grid.map(row => row.map(cell => ({
        x: cell.x,
        y: cell.y,
        walls: cell.walls,
    })));
}

function getUnvisitedNeighbors(cell, grid, size) {
    const { x, y } = cell;
    const neighbors = [];
    if (y > 0 && !grid[y - 1][x].visited) neighbors.push(grid[y - 1][x]);
    if (x < size - 1 && !grid[y][x + 1].visited) neighbors.push(grid[y][x + 1]);
    if (y < size - 1 && !grid[y + 1][x].visited) neighbors.push(grid[y + 1][x]);
    if (x > 0 && !grid[y][x - 1].visited) neighbors.push(grid[y][x - 1]);
    return neighbors;
}

function removeWall(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 1) { a.walls.right = false; b.walls.left = false; }
    if (dx === -1) { a.walls.left = false; b.walls.right = false; }
    if (dy === 1) { a.walls.bottom = false; b.walls.top = false; }
    if (dy === -1) { a.walls.top = false; b.walls.bottom = false; }
}

// ============================================================
// BFS — Find optimal path length
// ============================================================
function findOptimalPath(maze, size) {
    const queue = [{ x: 0, y: 0, dist: 0 }];
    const visited = new Set(['0,0']);

    while (queue.length > 0) {
        const { x, y, dist } = queue.shift();
        if (x === size - 1 && y === size - 1) return dist;

        const cell = maze[y][x];
        const moves = [];
        if (!cell.walls.top) moves.push({ x, y: y - 1 });
        if (!cell.walls.right) moves.push({ x: x + 1, y });
        if (!cell.walls.bottom) moves.push({ x, y: y + 1 });
        if (!cell.walls.left) moves.push({ x: x - 1, y });

        for (const m of moves) {
            const key = `${m.x},${m.y}`;
            if (!visited.has(key)) {
                visited.add(key);
                queue.push({ x: m.x, y: m.y, dist: dist + 1 });
            }
        }
    }
    return -1; // should never happen with a valid maze
}

// ============================================================
// Adaptive Difficulty Engine
// ============================================================
function evaluatePerformance(moves, optimalMoves, time, backtracks, gridSize) {
    if (!optimalMoves || optimalMoves === 0) return 2; // neutral for first game

    const moveRatio = moves / optimalMoves;
    let score = 0;

    // Move efficiency (0-3 scale)
    if (moveRatio <= 1.2) score += 3;       // near-optimal
    else if (moveRatio <= 1.6) score += 2;  // good
    else if (moveRatio <= 2.5) score += 1;  // average
    // else 0 — struggled

    // Speed bonus
    const expectedTime = gridSize * 2.5; // rough seconds estimate
    if (time < expectedTime) score += 1;

    // Backtrack penalty
    if (backtracks > moves * 0.4) score -= 1;

    return Math.max(0, Math.min(4, score));
}

function getNextGridSize(currentSize, performance) {
    if (performance >= 3) return Math.min(30, currentSize + 2); // scale up
    if (performance >= 2) return Math.min(30, currentSize + 1); // nudge up
    if (performance >= 1) return currentSize;                   // hold steady
    return Math.max(6, currentSize - 1);                        // ease down
}

function getDifficulty(gridSize) {
    if (gridSize <= 10) return 'EASY';
    if (gridSize <= 18) return 'MEDIUM';
    return 'HARD';
}

// ============================================================
// HTTP Server
// ============================================================
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // --- API: Generate maze ---
    if (pathname === '/api/get-maze') {
        const query = parsedUrl.query;
        const prevMoves = parseInt(query.moves) || 0;
        const prevOptimal = parseInt(query.optimalMoves) || 0;
        const prevTime = parseInt(query.time) || 0;
        const prevBacktracks = parseInt(query.backtracks) || 0;
        const requestedSize = parseInt(query.gridSize) || 8;

        const performance = evaluatePerformance(prevMoves, prevOptimal, prevTime, prevBacktracks, requestedSize);
        const nextSize = (prevMoves === 0) ? requestedSize : getNextGridSize(requestedSize, performance);

        const maze = generateMaze(nextSize);
        const optimalMoves = findOptimalPath(maze, nextSize);
        const averageMoves = Math.round(optimalMoves * 1.8); // rough average estimate

        const payload = JSON.stringify({
            maze,
            gridSize: nextSize,
            optimalMoves,
            averageMoves,
            difficulty: getDifficulty(nextSize),
            performance,
        });

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        });
        res.end(payload);
        return;
    }

    // --- Static file serving ---
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(FRONTEND_DIR, filePath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(FRONTEND_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`\n  🟢  Adaptive Maze Runner is live!`);
    console.log(`  👉  http://localhost:${PORT}\n`);
});
