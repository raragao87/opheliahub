const MAX_ERRORS = 20;
const recentErrors: Array<{ timestamp: string; message: string; stack?: string }> = [];

export function initErrorCapture() {
  if (typeof window === "undefined") return;

  const originalError = console.error;
  console.error = (...args) => {
    recentErrors.push({
      timestamp: new Date().toISOString(),
      message: args
        .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
        .join(" "),
    });
    if (recentErrors.length > MAX_ERRORS) recentErrors.shift();
    originalError.apply(console, args);
  };

  window.addEventListener("error", (event) => {
    recentErrors.push({
      timestamp: new Date().toISOString(),
      message: event.message,
      stack: event.error?.stack,
    });
    if (recentErrors.length > MAX_ERRORS) recentErrors.shift();
  });

  window.addEventListener("unhandledrejection", (event) => {
    recentErrors.push({
      timestamp: new Date().toISOString(),
      message: String(event.reason),
      stack: event.reason?.stack,
    });
    if (recentErrors.length > MAX_ERRORS) recentErrors.shift();
  });
}

export function getRecentErrors(): string {
  return JSON.stringify(recentErrors, null, 2);
}

export function clearRecentErrors() {
  recentErrors.length = 0;
}
