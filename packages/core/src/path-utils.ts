import path from "node:path";

export function toPosix(input: string): string {
  return input.split(path.sep).join("/");
}

export function rel(root: string, absolute: string): string {
  return toPosix(path.relative(root, absolute));
}

export function normalizePosix(input: string): string {
  return toPosix(path.normalize(input));
}

export function ensureDotRelative(input: string): string {
  if (input.startsWith(".")) {
    return input;
  }
  return `./${input}`;
}
