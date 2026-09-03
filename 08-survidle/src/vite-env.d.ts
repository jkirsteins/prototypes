/// <reference types="vite/client" />

declare module "node:fs" {
  export function readFileSync(path: string | Buffer | number, encoding?: BufferEncoding): string;
  export function readFileSync(path: string | Buffer | number, encoding: BufferEncoding): string;
  export function readFileSync(path: string | Buffer | number): Buffer;
}

declare module "node:path" {
  export function dirname(p: string): string;
  export function join(...paths: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
