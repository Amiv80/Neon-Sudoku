/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  RotateCcw, 
  Pencil, 
  Eraser, 
  Plus, 
  Trophy, 
  AlertCircle, 
  Clock, 
  ChevronDown,
  Undo2,
  CheckCircle2,
  Lightbulb
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

type Difficulty = 'Easy' | 'Medium' | 'Hard';

interface Cell {
  value: number | null;
  initial: boolean;
  notes: number[];
  error: boolean;
  hinted: boolean;
  isHintTarget: boolean;
  errorExplanation?: string;
  errorHighlightType?: 'row' | 'col' | 'box' | 'cell-only';
}

interface ErrorDetail {
  row: number;
  col: number;
  explanation: string;
  type: 'row' | 'col' | 'box' | 'solution';
}

interface Hint {
  row: number;
  col: number;
  value: number;
  explanation: string;
  type: 'Naked Single' | 'Hidden Single' | 'Locked Candidate';
}

type CandidatesMap = Set<number>[][];

const getCandidatesMap = (grid: (number | null)[][]): CandidatesMap => {
  const map: CandidatesMap = Array(9).fill(null).map(() => Array(9).fill(null).map(() => new Set()));
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === null) {
        const candidates = getCandidates(grid, r, c);
        candidates.forEach(n => map[r][c].add(n));
      }
    }
  }
  return map;
};

type Grid = Cell[][];

interface GameState {
  grid: Grid;
  difficulty: Difficulty;
  mistakes: number;
  time: number;
  isGameOver: boolean;
  isWon: boolean;
  selectedCell: [number, number] | null;
  notesMode: boolean;
}

// --- Sudoku Logic ---

const BLANK_GRID = (): Grid => 
  Array(9).fill(null).map(() => 
    Array(9).fill(null).map(() => ({
      value: null,
      initial: false,
      notes: [],
      error: false,
      hinted: false,
      isHintTarget: false
    }))
  );

const isValid = (grid: number[][], row: number, col: number, num: number): boolean => {
  for (let i = 0; i < 9; i++) {
    if (grid[row][i] === num) return false;
    if (grid[i][col] === num) return false;
    const r = 3 * Math.floor(row / 3) + Math.floor(i / 3);
    const c = 3 * Math.floor(col / 3) + i % 3;
    if (grid[r][c] === num) return false;
  }
  return true;
};

const solveSudoku = (grid: number[][]): boolean => {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] === 0) {
        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
        for (const num of nums) {
          if (isValid(grid, row, col, num)) {
            grid[row][col] = num;
            if (solveSudoku(grid)) return true;
            grid[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
};

const countSolutions = (grid: number[][], limit: number = 2): number => {
  let count = 0;
  const solve = () => {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (grid[row][col] === 0) {
          for (let num = 1; num <= 9; num++) {
            if (isValid(grid, row, col, num)) {
              grid[row][col] = num;
              solve();
              grid[row][col] = 0;
              if (count >= limit) return;
            }
          }
          return;
        }
      }
    }
    count++;
  };
  solve();
  return count;
};

// --- Human-Style Solver Logic ---

const getCandidates = (grid: (number | null)[][], row: number, col: number): number[] => {
  if (grid[row][col] !== null) return [];
  const candidates = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (let i = 0; i < 9; i++) {
    candidates.delete(grid[row][i]!);
    candidates.delete(grid[i][col]!);
    const r = 3 * Math.floor(row / 3) + Math.floor(i / 3);
    const c = 3 * Math.floor(col / 3) + i % 3;
    candidates.delete(grid[r][c]!);
  }
  return Array.from(candidates);
};

const findNakedSingle = (grid: (number | null)[][]): Hint | null => {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === null) {
        const candidates = getCandidates(grid, r, c);
        if (candidates.length === 1) {
          return {
            row: r,
            col: c,
            value: candidates[0],
            type: 'Naked Single',
            explanation: `This cell has only one possible value (${candidates[0]}) because all other numbers conflict with its row, column, or box.`
          };
        }
      }
    }
  }
  return null;
};

const findHiddenSingle = (grid: (number | null)[][]): Hint | null => {
  // Check rows
  for (let r = 0; r < 9; r++) {
    for (let num = 1; num <= 9; num++) {
      const possibleCols = [];
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] === null && getCandidates(grid, r, c).includes(num)) {
          possibleCols.push(c);
        }
      }
      if (possibleCols.length === 1) {
        return {
          row: r,
          col: possibleCols[0],
          value: num,
          type: 'Hidden Single',
          explanation: `In this row, the number ${num} can only fit in this specific cell.`
        };
      }
    }
  }
  // Check columns
  for (let c = 0; c < 9; c++) {
    for (let num = 1; num <= 9; num++) {
      const possibleRows = [];
      for (let r = 0; r < 9; r++) {
        if (grid[r][c] === null && getCandidates(grid, r, c).includes(num)) {
          possibleRows.push(r);
        }
      }
      if (possibleRows.length === 1) {
        return {
          row: possibleRows[0],
          col: c,
          value: num,
          type: 'Hidden Single',
          explanation: `In this column, the number ${num} can only fit in this specific cell.`
        };
      }
    }
  }
  // Check boxes
  for (let b = 0; b < 9; b++) {
    const startR = 3 * Math.floor(b / 3);
    const startC = 3 * (b % 3);
    for (let num = 1; num <= 9; num++) {
      const possibleCells = [];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const r = startR + i;
          const c = startC + j;
          if (grid[r][c] === null && getCandidates(grid, r, c).includes(num)) {
            possibleCells.push([r, c]);
          }
        }
      }
      if (possibleCells.length === 1) {
        return {
          row: possibleCells[0][0],
          col: possibleCells[0][1],
          value: num,
          type: 'Hidden Single',
          explanation: `In this 3x3 box, the number ${num} can only fit in this specific cell.`
        };
      }
    }
  }
  return null;
};

const findLockedCandidate = (grid: (number | null)[][]): Hint | null => {
  const map = getCandidatesMap(grid);
  
  // Pointing Pairs/Triples in Boxes
  for (let b = 0; b < 9; b++) {
    const startR = 3 * Math.floor(b / 3);
    const startC = 3 * (b % 3);
    
    for (let num = 1; num <= 9; num++) {
      const rows = new Set<number>();
      const cols = new Set<number>();
      const cells = [];
      
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const r = startR + i;
          const c = startC + j;
          if (grid[r][c] === null && map[r][c].has(num)) {
            rows.add(r);
            cols.add(c);
            cells.push([r, c]);
          }
        }
      }
      
      if (cells.length >= 2 && cells.length <= 3) {
        if (rows.size === 1) {
          const r = Array.from(rows)[0];
          // Check if this number can be eliminated elsewhere in the row
          for (let c = 0; c < 9; c++) {
            if (Math.floor(c / 3) !== b % 3 && grid[r][c] === null && map[r][c].has(num)) {
              return {
                row: r,
                col: c,
                value: num,
                type: 'Locked Candidate',
                explanation: `In box ${b + 1}, the number ${num} must be in row ${r + 1}. This means it cannot be anywhere else in that row.`
              };
            }
          }
        }
        if (cols.size === 1) {
          const c = Array.from(cols)[0];
          // Check if this number can be eliminated elsewhere in the column
          for (let r = 0; r < 9; r++) {
            if (Math.floor(r / 3) !== Math.floor(b / 3) && grid[r][c] === null && map[r][c].has(num)) {
              return {
                row: r,
                col: c,
                value: num,
                type: 'Locked Candidate',
                explanation: `In box ${b + 1}, the number ${num} must be in column ${c + 1}. This means it cannot be anywhere else in that column.`
              };
            }
          }
        }
      }
    }
  }
  return null;
};

const analyzeDifficulty = (puzzle: number[][]): Difficulty => {
  let grid = puzzle.map(row => row.map(val => val === 0 ? null : val));
  let solvedCount = 0;
  const totalToSolve = grid.flat().filter(v => v === null).length;
  
  let changed = true;
  let usedLocked = false;

  while (changed) {
    changed = false;
    const naked = findNakedSingle(grid);
    if (naked) {
      grid[naked.row][naked.col] = naked.value;
      solvedCount++;
      changed = true;
      continue;
    }
    const hidden = findHiddenSingle(grid);
    if (hidden) {
      grid[hidden.row][hidden.col] = hidden.value;
      solvedCount++;
      changed = true;
      continue;
    }
    const locked = findLockedCandidate(grid);
    if (locked) {
      // In a real solver we'd eliminate candidates, here we just mark that we needed it
      usedLocked = true;
      // To keep the "solve" going for difficulty check, we might need a more complex candidate-based solver
      // but for this classification, if we need Locked Candidates, it's at least Medium/Hard.
      // Let's just break for now and classify.
      break; 
    }
  }

  if (solvedCount === totalToSolve && !usedLocked) return 'Easy';
  if (usedLocked || solvedCount > totalToSolve * 0.3) return 'Medium';
  return 'Hard';
};

const generatePuzzle = (targetDifficulty: Difficulty): { puzzle: number[][], solution: number[][] } => {
  let puzzle: number[][];
  let solution: number[][];
  let currentDifficulty: Difficulty;

  do {
    solution = Array(9).fill(null).map(() => Array(9).fill(0));
    solveSudoku(solution);
    puzzle = solution.map(row => [...row]);
    
    // Initial removal based on rough counts to speed up
    const cellsToRemove = targetDifficulty === 'Easy' ? 35 : targetDifficulty === 'Medium' ? 45 : 55;
    let removed = 0;
    while (removed < cellsToRemove) {
      const r = Math.floor(Math.random() * 9);
      const c = Math.floor(Math.random() * 9);
      if (puzzle[r][c] !== 0) {
        const backup = puzzle[r][c];
        puzzle[r][c] = 0;
        if (countSolutions(puzzle.map(row => [...row])) !== 1) {
          puzzle[r][c] = backup;
        } else {
          removed++;
        }
      }
    }
    currentDifficulty = analyzeDifficulty(puzzle);
  } while (currentDifficulty !== targetDifficulty);

  return { puzzle, solution };
};

// --- Components ---

const MAX_HINTS = 5;

export default function App() {
  const [grid, setGrid] = useState<Grid>(BLANK_GRID());
  const [solution, setSolution] = useState<number[][]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('Easy');
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [currentHint, setCurrentHint] = useState<Hint | null>(null);
  const [validationErrors, setValidationErrors] = useState<ErrorDetail[]>([]);
  const [completedDigits, setCompletedDigits] = useState<Set<number>>(new Set());
  const [time, setTime] = useState(0);
  const [isWon, setIsWon] = useState(false);
  const [history, setHistory] = useState<Grid[]>([]);
  const [showDifficultyMenu, setShowDifficultyMenu] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startNewGame = useCallback((diff: Difficulty = difficulty) => {
    const { puzzle, solution: sol } = generatePuzzle(diff);
    const newGrid = puzzle.map((row, r) => 
      row.map((val, c) => ({
        value: val === 0 ? null : val,
        initial: val !== 0,
        notes: [],
        error: false,
        hinted: false,
        isHintTarget: false
      }))
    );
    setGrid(newGrid);
    setSolution(sol);
    setDifficulty(diff);
    setMistakes(0);
    setHintsUsed(0);
    setCurrentHint(null);
    setValidationErrors([]);
    setCompletedDigits(new Set());
    setTime(0);
    setIsWon(false);
    setSelectedCell(null);
    setHistory([]);
    setShowDifficultyMenu(false);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTime(prev => prev + 1);
    }, 1000);
  }, [difficulty]);

  useEffect(() => {
    startNewGame('Easy');
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const checkConflicts = (currentGrid: Grid): Grid => {
    const newGrid = currentGrid.map(row => row.map(cell => ({ ...cell, error: false })));
    
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = newGrid[r][c].value;
        if (!val) continue;

        // Row & Col
        for (let i = 0; i < 9; i++) {
          if (i !== c && newGrid[r][i].value === val) newGrid[r][c].error = true;
          if (i !== r && newGrid[i][c].value === val) newGrid[r][c].error = true;
        }

        // Box
        const startR = 3 * Math.floor(r / 3);
        const startC = 3 * Math.floor(c / 3);
        for (let i = startR; i < startR + 3; i++) {
          for (let j = startC; j < startC + 3; j++) {
            if ((i !== r || j !== c) && newGrid[i][j].value === val) {
              newGrid[r][c].error = true;
            }
          }
        }
      }
    }
    return newGrid;
  };

  const checkCompletedDigits = useCallback((currentGrid: Grid) => {
    const counts = new Array(10).fill(0);
    const correctCounts = new Array(10).fill(0);

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = currentGrid[r][c].value;
        if (val !== null) {
          counts[val]++;
          if (val === solution[r][c]) {
            correctCounts[val]++;
          }
        }
      }
    }

    const completed = new Set<number>();
    for (let i = 1; i <= 9; i++) {
      if (counts[i] === 9 && correctCounts[i] === 9) {
        completed.add(i);
      }
    }
    setCompletedDigits(completed);
  }, [solution]);

  useEffect(() => {
    if (solution.length > 0) {
      checkCompletedDigits(grid);
    }
  }, [grid, solution, checkCompletedDigits]);

  const handleCellClick = (r: number, c: number) => {
    if (isWon) return;
    setSelectedCell([r, c]);
    // Clear validation error highlight for this cell if it exists
    if (validationErrors.length > 0) {
      setGrid(prev => prev.map((row, ri) => row.map((cell, ci) => ({
        ...cell,
        errorExplanation: ri === r && ci === c ? undefined : cell.errorExplanation,
        errorHighlightType: ri === r && ci === c ? undefined : cell.errorHighlightType
      }))));
    }
  };

  const updateCell = (num: number | null) => {
    if (!selectedCell || isWon) return;
    const [r, c] = selectedCell;
    const cell = grid[r][c];
    if (cell.initial) return;

    if (num !== null && completedDigits.has(num)) return;

    // Clear current hint if the selected cell was the hint target
    if (currentHint && r === currentHint.row && c === currentHint.col) {
      setCurrentHint(null);
    }

    // Clear validation errors on edit
    setValidationErrors([]);

    // Save history
    setHistory(prev => [JSON.parse(JSON.stringify(grid)), ...prev].slice(0, 10));

    const newGrid = JSON.parse(JSON.stringify(grid)) as Grid;
    // Clear hint target flags
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        newGrid[row][col].isHintTarget = false;
      }
    }
    
    if (notesMode && num !== null) {
      const notes = newGrid[r][c].notes;
      if (notes.includes(num)) {
        newGrid[r][c].notes = notes.filter(n => n !== num);
      } else {
        newGrid[r][c].notes = [...notes, num].sort();
      }
      setGrid(newGrid);
    } else {
      // Direct value update
      const isCorrect = num === null || num === solution[r][c];
      
      if (num !== null && !isCorrect && num !== cell.value) {
        setMistakes(prev => prev + 1);
      }

      newGrid[r][c].value = num;
      newGrid[r][c].notes = [];
      
      // If correct, clear notes in same row, col, box
      if (num !== null && isCorrect) {
        for (let i = 0; i < 9; i++) {
          newGrid[r][i].notes = newGrid[r][i].notes.filter(n => n !== num);
          newGrid[i][c].notes = newGrid[i][c].notes.filter(n => n !== num);
        }
        const startR = 3 * Math.floor(r / 3);
        const startC = 3 * Math.floor(c / 3);
        for (let i = startR; i < startR + 3; i++) {
          for (let j = startC; j < startC + 3; j++) {
            newGrid[i][j].notes = newGrid[i][j].notes.filter(n => n !== num);
          }
        }
      }

      setGrid(checkConflicts(newGrid));
    }
  };

  const giveHint = () => {
    if (hintsUsed >= MAX_HINTS || isWon) return;

    const currentValues = grid.map(row => row.map(cell => cell.value));
    const hint = findNakedSingle(currentValues) || findHiddenSingle(currentValues) || findLockedCandidate(currentValues);

    if (hint) {
      setCurrentHint(hint);
      setHintsUsed(prev => prev + 1);
      
      const newGrid = grid.map((row, r) => row.map((cell, c) => ({
        ...cell,
        isHintTarget: r === hint.row && c === hint.col
      })));
      setGrid(newGrid);
      setSelectedCell([hint.row, hint.col]);
    }
  };

  const undo = () => {
    if (history.length === 0 || isWon) return;
    const previous = history[0];
    setGrid(previous);
    setHistory(prev => prev.slice(1));
    checkCompletedDigits(previous);
  };

  const checkSolution = () => {
    const errors: ErrorDetail[] = [];
    let complete = true;
    let correct = true;

    const newGrid = grid.map((row, r) => row.map((cell, c) => {
      const val = cell.value;
      if (val === null) {
        complete = false;
        return { ...cell, error: false, errorExplanation: undefined, errorHighlightType: undefined };
      }

      // 1. Check Row Conflict
      for (let i = 0; i < 9; i++) {
        if (i !== c && grid[r][i].value === val) {
          const err: ErrorDetail = { row: r, col: c, type: 'row', explanation: `The number ${val} appears more than once in this row.` };
          errors.push(err);
          return { ...cell, error: true, errorExplanation: err.explanation, errorHighlightType: 'row' as const };
        }
      }

      // 2. Check Col Conflict
      for (let i = 0; i < 9; i++) {
        if (i !== r && grid[i][c].value === val) {
          const err: ErrorDetail = { row: r, col: c, type: 'col', explanation: `The number ${val} appears more than once in this column.` };
          errors.push(err);
          return { ...cell, error: true, errorExplanation: err.explanation, errorHighlightType: 'col' as const };
        }
      }

      // 3. Check Box Conflict
      const startR = 3 * Math.floor(r / 3);
      const startC = 3 * Math.floor(c / 3);
      for (let i = startR; i < startR + 3; i++) {
        for (let j = startC; j < startC + 3; j++) {
          if ((i !== r || j !== c) && grid[i][j].value === val) {
            const err: ErrorDetail = { row: r, col: c, type: 'box', explanation: `The number ${val} already exists in this 3x3 box.` };
            errors.push(err);
            return { ...cell, error: true, errorExplanation: err.explanation, errorHighlightType: 'box' as const };
          }
        }
      }

      // 4. Check Solution Contradiction
      if (val !== solution[r][c]) {
        correct = false;
        const err: ErrorDetail = { row: r, col: c, type: 'solution', explanation: `This value cannot be part of the final solution for this cell.` };
        errors.push(err);
        return { ...cell, error: true, errorExplanation: err.explanation, errorHighlightType: 'cell-only' as const };
      }

      return { ...cell, error: false, errorExplanation: undefined, errorHighlightType: undefined };
    }));

    setGrid(newGrid);
    setValidationErrors(errors);

    if (complete && correct) {
      setIsWon(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isWon) return;
      if (e.key >= '1' && e.key <= '9') {
        const num = parseInt(e.key);
        if (!completedDigits.has(num)) {
          updateCell(num);
        }
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        updateCell(null);
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        undo();
      } else if (e.key === 'n') {
        setNotesMode(prev => !prev);
      } else if (e.key.startsWith('Arrow')) {
        if (!selectedCell) {
          setSelectedCell([0, 0]);
          return;
        }
        let [r, c] = selectedCell;
        if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
        if (e.key === 'ArrowDown') r = Math.min(8, r + 1);
        if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
        if (e.key === 'ArrowRight') c = Math.min(8, c + 1);
        setSelectedCell([r, c]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, notesMode, grid, isWon]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-cyan-500/30 flex flex-col items-center p-4 sm:p-8">
      {/* Header */}
      <header className="w-full max-w-xl flex justify-between items-center mb-8">
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
            NEON SUDOKU
          </h1>
          <div className="flex items-center gap-4 mt-1 text-xs font-mono uppercase tracking-widest text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {formatTime(time)}
            </span>
            <span className="flex items-center gap-1 text-rose-400">
              <AlertCircle className="w-3 h-3" /> {mistakes}
            </span>
            <span className={`flex items-center gap-1 transition-colors ${hintsUsed >= MAX_HINTS ? 'text-slate-700' : 'text-amber-400'}`}>
              <Lightbulb className="w-3 h-3" /> {MAX_HINTS - hintsUsed}
            </span>
          </div>
        </div>

        <div className="relative">
          <button 
            onClick={() => setShowDifficultyMenu(!showDifficultyMenu)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg hover:border-cyan-500/50 transition-colors text-sm font-medium"
          >
            {difficulty} <ChevronDown className="w-4 h-4" />
          </button>
          
          <AnimatePresence>
            {showDifficultyMenu && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-0 mt-2 w-32 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden"
              >
                {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => startNewGame(d)}
                    className="w-full px-4 py-3 text-left text-sm hover:bg-slate-800 transition-colors border-b border-slate-800 last:border-0"
                  >
                    {d}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="w-full max-w-xl flex flex-col gap-8">
        {/* Grid */}
        <div className="relative aspect-square w-full bg-slate-900 rounded-xl border-2 border-slate-800 p-1 shadow-2xl overflow-hidden">
          <div className="grid grid-cols-9 grid-rows-9 h-full w-full gap-px bg-slate-800">
            {grid.map((row, r) => row.map((cell, c) => {
              const isSelected = selectedCell?.[0] === r && selectedCell?.[1] === c;
              const isSameValue = selectedCell && cell.value !== null && grid[selectedCell[0]][selectedCell[1]].value === cell.value;
              const isSameGroup = selectedCell && (selectedCell[0] === r || selectedCell[1] === c || (Math.floor(selectedCell[0]/3) === Math.floor(r/3) && Math.floor(selectedCell[1]/3) === Math.floor(c/3)));
              
              const selectedError = selectedCell && grid[selectedCell[0]][selectedCell[1]].errorExplanation ? grid[selectedCell[0]][selectedCell[1]] : null;
              const isErrorHighlight = selectedError && (
                (selectedError.errorHighlightType === 'row' && selectedCell![0] === r) ||
                (selectedError.errorHighlightType === 'col' && selectedCell![1] === c) ||
                (selectedError.errorHighlightType === 'box' && Math.floor(selectedCell![0]/3) === Math.floor(r/3) && Math.floor(selectedCell![1]/3) === Math.floor(c/3))
              );

              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => handleCellClick(r, c)}
                  className={`
                    relative flex items-center justify-center cursor-pointer transition-all duration-150
                    ${r % 3 === 0 && r !== 0 ? 'border-t-2 border-slate-700' : ''}
                    ${c % 3 === 0 && c !== 0 ? 'border-l-2 border-slate-700' : ''}
                    ${isSelected ? 'bg-cyan-500/20 ring-2 ring-inset ring-cyan-400 z-10' : 
                      isErrorHighlight ? 'bg-rose-500/10' :
                      isSameValue ? 'bg-cyan-500/10' :
                      isSameGroup ? 'bg-slate-800/50' : 'bg-slate-950'}
                  `}
                >
                  {cell.value ? (
                    <span className={`
                      text-2xl sm:text-3xl font-medium select-none
                      ${cell.initial ? 'text-slate-200' : cell.hinted ? 'text-amber-400' : 'text-cyan-400'}
                      ${cell.error ? 'text-rose-500' : ''}
                      ${cell.isHintTarget ? 'animate-pulse text-amber-500' : ''}
                      ${cell.errorHighlightType === 'cell-only' ? 'text-rose-400 underline decoration-dotted underline-offset-4' : ''}
                    `}>
                      {cell.value}
                    </span>
                  ) : (
                    <div className={`grid grid-cols-3 grid-rows-3 w-full h-full p-0.5 sm:p-1 ${cell.isHintTarget ? 'animate-pulse bg-amber-500/20' : ''}`}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                        <div key={n} className="flex items-center justify-center text-[8px] sm:text-[10px] text-slate-500 leading-none">
                          {cell.notes.includes(n) ? n : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }))}
          </div>

          {/* Win Overlay */}
          <AnimatePresence>
            {isWon && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 text-center p-8"
              >
                <motion.div 
                  initial={{ y: 20 }}
                  animate={{ y: 0 }}
                  className="bg-slate-900 border border-cyan-500/30 rounded-3xl p-8 shadow-2xl"
                >
                  <Trophy className="w-16 h-16 text-cyan-400 mb-4 mx-auto" />
                  <h2 className="text-3xl font-bold text-white mb-2">Victory!</h2>
                  <p className="text-slate-400 mb-6">You solved the {difficulty} puzzle in {formatTime(time)} with {mistakes} mistakes.</p>
                  <button 
                    onClick={() => startNewGame()}
                    className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl transition-all"
                  >
                    Play Again
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-6">
          {/* Action Buttons */}
          <div className="grid grid-cols-5 gap-2">
            <button 
              onClick={undo}
              className="flex flex-col items-center justify-center gap-1 p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50"
              disabled={history.length === 0}
            >
              <Undo2 className="w-5 h-5" />
              <span className="text-[9px] uppercase font-bold tracking-tighter">Undo</span>
            </button>
            <button 
              onClick={() => {
                updateCell(null);
                setCurrentHint(null);
              }}
              className="flex flex-col items-center justify-center gap-1 p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-all"
            >
              <Eraser className="w-5 h-5" />
              <span className="text-[9px] uppercase font-bold tracking-tighter">Erase</span>
            </button>
            <button 
              onClick={() => setNotesMode(!notesMode)}
              className={`
                flex flex-col items-center justify-center gap-1 p-2 border rounded-xl transition-all
                ${notesMode ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800'}
              `}
            >
              <Pencil className="w-5 h-5" />
              <span className="text-[9px] uppercase font-bold tracking-tighter">Notes {notesMode ? 'On' : 'Off'}</span>
            </button>
            <button 
              onClick={giveHint}
              disabled={hintsUsed >= MAX_HINTS || !!currentHint}
              className="flex flex-col items-center justify-center gap-1 p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-30"
            >
              <Lightbulb className={`w-5 h-5 ${currentHint ? 'text-amber-200' : 'text-amber-400'}`} />
              <span className="text-[9px] uppercase font-bold tracking-tighter">Hint</span>
            </button>
            <button 
              onClick={checkSolution}
              className="flex flex-col items-center justify-center gap-1 p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-all"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-[9px] uppercase font-bold tracking-tighter">Check</span>
            </button>
          </div>

          {/* Hint Panel */}
          <AnimatePresence>
            {currentHint && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <Lightbulb className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
                      {currentHint.type} Hint
                    </h4>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      {currentHint.explanation}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
            
            {selectedCell && grid[selectedCell[0]][selectedCell[1]].errorExplanation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-rose-400 text-xs font-bold uppercase tracking-wider mb-1">
                      Mistake Analysis
                    </h4>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      {grid[selectedCell[0]][selectedCell[1]].errorExplanation}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {validationErrors.length > 0 && (!selectedCell || !grid[selectedCell[0]][selectedCell[1]].errorExplanation) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 text-center"
              >
                <p className="text-rose-400 text-xs font-bold uppercase tracking-widest">
                  {validationErrors.length} mistake{validationErrors.length > 1 ? 's' : ''} found. Select a cell to see details.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Number Pad */}
          <div className="grid grid-cols-9 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => {
              const isCompleted = completedDigits.has(n);
              return (
                <button
                  key={n}
                  onClick={() => !isCompleted && updateCell(n)}
                  disabled={isCompleted}
                  className={`
                    relative aspect-square flex items-center justify-center text-xl sm:text-2xl font-bold border rounded-xl transition-all active:scale-95
                    ${isCompleted 
                      ? 'bg-slate-950 border-slate-900 text-slate-800 cursor-not-allowed opacity-50' 
                      : 'bg-slate-900 border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800'}
                  `}
                >
                  {n}
                  {isCompleted && (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 bg-cyan-500 rounded-full p-0.5 shadow-lg shadow-cyan-500/50"
                    >
                      <CheckCircle2 className="w-2.5 h-2.5 text-slate-950" />
                    </motion.div>
                  )}
                </button>
              );
            })}
          </div>

          <button 
            onClick={() => startNewGame()}
            className="w-full py-4 bg-slate-900 border border-slate-800 rounded-2xl font-bold uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> New Game
          </button>
        </div>
      </main>

      <footer className="mt-12 text-slate-600 text-[10px] uppercase tracking-widest text-center">
        Use keyboard 1-9 to fill, N for notes, Backspace to erase, Ctrl+Z to undo
      </footer>
    </div>
  );
}
