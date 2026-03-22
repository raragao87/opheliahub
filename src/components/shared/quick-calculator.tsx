"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Calculator, X, GripHorizontal, Maximize2, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// Safe math evaluator — no eval()
function safeEvaluate(expr: string): number | null {
  try {
    // Normalize: replace × with *, ÷ with /, ^ with **
    let normalized = expr
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/\^/g, "**")
      .replace(/,/g, ".")
      .replace(/\s+/g, "");

    // Only allow digits, operators, parentheses, dots
    if (!/^[\d+\-*/().%**]+$/.test(normalized)) return null;
    if (!normalized) return null;

    // Use Function constructor (safer than eval, no scope access)
    const fn = new Function(`"use strict"; return (${normalized});`);
    const result = fn();

    if (typeof result !== "number" || !isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

function formatResult(num: number): string {
  // Avoid floating point display issues
  const rounded = Math.round(num * 1e10) / 1e10;
  if (Number.isInteger(rounded)) return rounded.toLocaleString();
  // Up to 6 decimal places
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

// ── Inline Calculator (appears as a bar below the trigger) ──

function InlineCalculator({ onClose }: { onClose: () => void }) {
  const [expression, setExpression] = useState("");
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const result = expression ? safeEvaluate(expression) : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && result !== null) {
      setHistory((prev) => [
        { expr: expression, result: formatResult(result) },
        ...prev.slice(0, 9),
      ]);
      setExpression(formatResult(result));
      // Select all so next input replaces
      setTimeout(() => inputRef.current?.select(), 0);
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="absolute right-0 top-full mt-1.5 z-50 w-80 rounded-lg glass shadow-ambient overflow-hidden">
      {/* Input row */}
      <div className="flex items-center border-b">
        <div className="px-3 text-muted-foreground">
          <Calculator className="h-3.5 w-3.5" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. 2500 * 1.23 + 500"
          className="flex-1 py-2.5 pr-2 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
          autoComplete="off"
          spellCheck={false}
        />
        {result !== null && (
          <div className="px-3 py-2 text-sm font-semibold text-green-600 dark:text-green-400 tabular-nums whitespace-nowrap">
            = {formatResult(result)}
          </div>
        )}
        {expression && result === null && (
          <div className="px-3 py-2 text-xs text-muted-foreground/50">
            ...
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="max-h-[180px] overflow-y-auto">
          {history.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setExpression(item.result);
                inputRef.current?.focus();
              }}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            >
              <span className="text-muted-foreground truncate mr-2">{item.expr}</span>
              <span className="font-medium tabular-nums shrink-0">= {item.result}</span>
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="border-t px-3 py-1.5 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          Enter to save · Esc to close · supports + - * / ^ ( )
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-0.5"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── Floating Calculator (draggable, with button grid) ──

const BUTTONS = [
  ["C", "(", ")", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "-"],
  ["1", "2", "3", "+"],
  ["0", ".", "^", "="],
];

function FloatingCalculator({ onClose }: { onClose: () => void }) {
  const [expression, setExpression] = useState("");
  const [display, setDisplay] = useState("0");
  const [hasResult, setHasResult] = useState(false);

  // Drag state
  const [position, setPosition] = useState({ x: window.innerWidth - 300, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 240, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 360, e.clientY - dragOffset.current.y)),
      });
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const handleButton = (btn: string) => {
    if (btn === "C") {
      setExpression("");
      setDisplay("0");
      setHasResult(false);
      return;
    }

    if (btn === "=") {
      const result = safeEvaluate(expression);
      if (result !== null) {
        setDisplay(formatResult(result));
        setExpression(formatResult(result).replace(/,/g, ""));
        setHasResult(true);
      } else {
        setDisplay("Error");
      }
      return;
    }

    // Map display symbols to math operators
    const mathMap: Record<string, string> = { "÷": "/", "×": "*" };
    const mathChar = mathMap[btn] ?? btn;

    let newExpr: string;
    if (hasResult && /[\d.]/.test(btn)) {
      // Start fresh after a result if typing a number
      newExpr = mathChar;
      setHasResult(false);
    } else {
      newExpr = (hasResult ? expression : expression) + mathChar;
      setHasResult(false);
    }

    setExpression(newExpr);

    // Show display-friendly version
    const displayExpr = newExpr
      .replace(/\//g, "÷")
      .replace(/\*/g, "×");
    setDisplay(displayExpr);
  };

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Enter") {
        handleButton("=");
        return;
      }
      if (e.key === "Backspace") {
        setExpression((prev) => {
          const next = prev.slice(0, -1);
          setDisplay(next || "0");
          return next;
        });
        setHasResult(false);
        return;
      }
      if (/^[\d+\-*/().^]$/.test(e.key)) {
        handleButton(e.key === "*" ? "×" : e.key === "/" ? "÷" : e.key);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return (
    <div
      className="fixed z-[100] w-[220px] rounded-xl glass shadow-ambient overflow-hidden select-none"
      style={{ left: position.x, top: position.y }}
    >
      {/* Title bar — draggable */}
      <div
        className={cn(
          "flex items-center justify-between px-2.5 py-1.5 border-b bg-muted/30",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <GripHorizontal className="h-3 w-3" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Calculator</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Display */}
      <div className="px-3 py-3 text-right border-b bg-muted/10">
        <div className="text-[10px] text-muted-foreground truncate h-3.5">
          {expression && !hasResult ? expression
            .replace(/\//g, "÷")
            .replace(/\*/g, "×") : "\u00A0"}
        </div>
        <div className="text-xl font-semibold tabular-nums truncate leading-tight mt-0.5">
          {display}
        </div>
      </div>

      {/* Button grid */}
      <div className="p-1.5 grid grid-cols-4 gap-1">
        {BUTTONS.flat().map((btn, i) => {
          const isOp = ["÷", "×", "-", "+", "^"].includes(btn);
          const isEq = btn === "=";
          const isClear = btn === "C";
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleButton(btn)}
              className={cn(
                "h-9 rounded-lg text-sm font-medium transition-colors active:scale-95",
                isEq
                  ? "bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-500"
                  : isOp
                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-500/30"
                    : isClear
                      ? "bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-500/25"
                      : "bg-muted/50 hover:bg-muted text-foreground"
              )}
            >
              {btn}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Export — Toggle between modes ──

export function QuickCalculator() {
  const [mode, setMode] = useState<"closed" | "inline" | "floating">("closed");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close inline on click outside
  useEffect(() => {
    if (mode !== "inline") return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMode("closed");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mode]);

  return (
    <>
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => {
            if (mode === "closed") setMode("inline");
            else if (mode === "inline") setMode("floating");
            else setMode("closed");
          }}
          className={cn(
            "flex items-center justify-center h-8 w-8 rounded-md transition-colors",
            mode !== "closed"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
          title={
            mode === "closed" ? "Quick calculator"
            : mode === "inline" ? "Switch to floating calculator"
            : "Close calculator"
          }
        >
          <Calculator className="h-4 w-4" />
        </button>

        {mode === "inline" && (
          <InlineCalculator onClose={() => setMode("closed")} />
        )}
      </div>

      {mode === "floating" && (
        <FloatingCalculator onClose={() => setMode("closed")} />
      )}
    </>
  );
}
