import { toCents, fromCents } from "@/lib/money";

/**
 * Evaluate a math expression typed into a money input.
 * - Delta mode: if input starts with +, -, *, / -> apply operator to currentCents
 * - Absolute expression: evaluate simple math (100+50+25 -> 175)
 * - Plain number: just parse it (750 -> 750.00)
 * - Returns result in cents.
 */
export function evaluateExpression(input: string, currentCents: number): number {
  const trimmed = input.trim();
  if (trimmed === "") return 0;

  // Delta mode: first character is an operator
  const firstChar = trimmed[0];
  if (firstChar === "+" || firstChar === "-" || firstChar === "*" || firstChar === "/") {
    const rest = trimmed.slice(1).trim();
    const operand = parseFloat(rest);
    if (isNaN(operand)) return 0;

    const current = fromCents(currentCents);
    let result: number;

    switch (firstChar) {
      case "+":
        result = current + operand;
        break;
      case "-":
        result = current - operand;
        break;
      case "*":
        result = current * operand;
        break;
      case "/":
        if (operand === 0) return currentCents;
        result = current / operand;
        break;
      default:
        return 0;
    }

    return toCents(result);
  }

  // Try to evaluate as a math expression with operator precedence
  const exprResult = parseExpression(trimmed);
  if (exprResult !== null) {
    return toCents(exprResult);
  }

  // Try plain number
  const plain = parseFloat(trimmed);
  if (!isNaN(plain)) {
    return toCents(plain);
  }

  return 0;
}

/**
 * Parse and evaluate a math expression string with correct operator precedence.
 * Supports +, -, *, / on decimal numbers.
 * Returns null if the expression is invalid.
 *
 * Grammar:
 *   expression = term (('+' | '-') term)*
 *   term       = factor (('*' | '/') factor)*
 *   factor     = number
 */
function parseExpression(input: string): number | null {
  // Tokenize: split into numbers and operators
  const maybeTokens = tokenize(input);
  if (maybeTokens === null || maybeTokens.length === 0) return null;
  const tokens: string[] = maybeTokens;

  let pos = 0;

  function peekToken(): string | undefined {
    return tokens[pos];
  }

  function consumeToken(): string {
    return tokens[pos++];
  }

  function parseFactor(): number | null {
    const token = consumeToken();
    if (token === undefined) return null;
    const num = parseFloat(token);
    if (isNaN(num)) return null;
    return num;
  }

  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;

    while (peekToken() === "*" || peekToken() === "/") {
      const op = consumeToken();
      const right = parseFactor();
      if (right === null) return null;

      if (op === "*") {
        left = left * right;
      } else {
        if (right === 0) return null;
        left = left / right;
      }
    }

    return left;
  }

  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;

    while (peekToken() === "+" || peekToken() === "-") {
      const op = consumeToken();
      const right = parseTerm();
      if (right === null) return null;

      if (op === "+") {
        left = left + right;
      } else {
        left = left - right;
      }
    }

    return left;
  }

  const result = parseExpr();

  // If there are remaining tokens, the expression was malformed
  if (pos !== tokens.length) return null;

  return result;
}

/**
 * Tokenize a math expression into numbers and operator characters.
 * Returns null if the input contains invalid characters.
 */
function tokenize(input: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;
  const str = input.replace(/\s/g, "");

  while (i < str.length) {
    const ch = str[i];

    if (ch === "+" || ch === "*" || ch === "/") {
      tokens.push(ch);
      i++;
    } else if (ch === "-") {
      // Minus can be a negative sign if at start or after an operator
      if (tokens.length === 0 || /^[+\-*/]$/.test(tokens[tokens.length - 1])) {
        // Negative number
        let num = "-";
        i++;
        if (i >= str.length || (!/\d/.test(str[i]) && str[i] !== ".")) return null;
        while (i < str.length && (/\d/.test(str[i]) || str[i] === ".")) {
          num += str[i];
          i++;
        }
        tokens.push(num);
      } else {
        tokens.push("-");
        i++;
      }
    } else if (/\d/.test(ch) || ch === ".") {
      let num = "";
      while (i < str.length && (/\d/.test(str[i]) || str[i] === ".")) {
        num += str[i];
        i++;
      }
      tokens.push(num);
    } else {
      // Invalid character
      return null;
    }
  }

  return tokens;
}
