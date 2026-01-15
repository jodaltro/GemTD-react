import { GridCell } from '../types';
import { CellType, GRID_SIZE } from '../constants';

type Point = { x: number; y: number };

// Manhattan distance heuristic
const heuristic = (a: Point, b: Point): number => {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
};

const getNeighbors = (x: number, y: number): Point[] => {
  const neighbors: Point[] = [];
  if (x > 0) neighbors.push({ x: x - 1, y });
  if (x < GRID_SIZE - 1) neighbors.push({ x: x + 1, y });
  if (y > 0) neighbors.push({ x, y: y - 1 });
  if (y < GRID_SIZE - 1) neighbors.push({ x, y: y + 1 });
  return neighbors;
};

const isWalkable = (cell: GridCell | undefined): boolean => {
  if (!cell) return false;
  // In GemTD, only EMPTY cells are walkable. Rocks and Towers block.
  return cell.type === CellType.EMPTY;
};

// Phase 1: Grid & Pathfinder
// Generates a Flow Field (Vector map) using BFS for ground units
// We keep BFS for the FlowField as it efficiently maps *all* cells to the target
export const generateFlowField = (
  grid: GridCell[],
  target: Point
): Record<string, { x: number; y: number } | null> => {
  const flowField: Record<string, { x: number; y: number } | null> = {};
  const distanceMap: Record<string, number> = {};
  
  grid.forEach(cell => {
    distanceMap[cell.id] = Infinity;
    flowField[cell.id] = null;
  });

  const targetId = `${target.x}-${target.y}`;
  distanceMap[targetId] = 0;

  const queue: GridCell[] = [];
  const targetCell = grid.find(c => c.x === target.x && c.y === target.y);
  if (targetCell) queue.push(targetCell);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDist = distanceMap[current.id];

    const neighbors = getNeighbors(current.x, current.y);
    for (const n of neighbors) {
      const neighborCell = grid.find(c => c.x === n.x && c.y === n.y);
      if (neighborCell && isWalkable(neighborCell) && distanceMap[neighborCell.id] === Infinity) {
        distanceMap[neighborCell.id] = currentDist + 1;
        queue.push(neighborCell);
      }
    }
  }

  grid.forEach(cell => {
    if (!isWalkable(cell)) return;
    if (cell.x === target.x && cell.y === target.y) return;

    const neighbors = getNeighbors(cell.x, cell.y);
    let bestNeighbor: Point | null = null;
    let minDist = distanceMap[cell.id];

    for (const n of neighbors) {
      const nId = `${n.x}-${n.y}`;
      if (distanceMap[nId] < minDist) {
        minDist = distanceMap[nId];
        bestNeighbor = n;
      }
    }

    if (bestNeighbor) {
      flowField[cell.id] = {
        x: bestNeighbor.x - cell.x,
        y: bestNeighbor.y - cell.y
      };
    }
  });

  return flowField;
};

// Phase 1: Validator
// Uses A* to check if a valid path exists. Faster than BFS for single path check.
export const isPathPossible = (grid: GridCell[], start: Point, end: Point): boolean => {
  const openSet: string[] = [`${start.x}-${start.y}`];
  const cameFrom: Record<string, string> = {};
  
  const gScore: Record<string, number> = {};
  const fScore: Record<string, number> = {};

  grid.forEach(c => {
    gScore[c.id] = Infinity;
    fScore[c.id] = Infinity;
  });

  const startId = `${start.x}-${start.y}`;
  const endId = `${end.x}-${end.y}`;
  
  gScore[startId] = 0;
  fScore[startId] = heuristic(start, end);

  while (openSet.length > 0) {
    // Find node with lowest fScore
    let currentId = openSet[0];
    let lowestF = fScore[currentId];
    let currentIndex = 0;

    for(let i=1; i<openSet.length; i++) {
        if(fScore[openSet[i]] < lowestF) {
            lowestF = fScore[openSet[i]];
            currentId = openSet[i];
            currentIndex = i;
        }
    }

    if (currentId === endId) return true; // Path found

    openSet.splice(currentIndex, 1);

    const [cx, cy] = currentId.split('-').map(Number);
    const neighbors = getNeighbors(cx, cy);

    for (const n of neighbors) {
        const nId = `${n.x}-${n.y}`;
        const neighborCell = grid.find(c => c.id === nId);
        
        if (!neighborCell || !isWalkable(neighborCell)) continue;

        const tentativeG = gScore[currentId] + 1;

        if (tentativeG < gScore[nId]) {
            cameFrom[nId] = currentId;
            gScore[nId] = tentativeG;
            fScore[nId] = gScore[nId] + heuristic(n, end);
            
            if (!openSet.includes(nId)) {
                openSet.push(nId);
            }
        }
    }
  }

  return false;
};
