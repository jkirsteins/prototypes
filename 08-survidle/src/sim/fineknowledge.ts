/**
 * What ground a lineage knows, two bits a patch. The fine lattice holds
 * tens of millions of patches, so a property per walked patch would
 * outweigh everything else in the save and make every sweep of knowledge a
 * walk over a hash map. Knowledge lives instead in the same 96 by 96
 * chunks the world is generated in, one Uint8Array each, allocated only
 * where somebody has been. Region discovery stays a separate broad fact;
 * this is the ground itself.
 *
 * Naming: `knowledge.ts` is the water a survivor has read. This module is
 * the fine lattice's own knowledge and keeps its own name.
 */
import { FINE_CHUNK } from "../world/cells";
import { type PatchId, WORLD_FINE_H, WORLD_FINE_W } from "../world/spatial";

/** 0 unknown, 1 the journal's, 2 seen this life, 3 walked this life. */
export type KnowledgeLevel = "unknown" | "inherited" | "seen" | "visited";

export interface KnowledgeChunks {
  /** Touched chunks only, by chunk index; each array packs four patches per byte. */
  chunks: Map<number, Uint8Array>;
}

export interface KnowledgeCounts {
  inherited: number;
  seen: number;
  visited: number;
  /** Every patch above unknown: what routing may cross. */
  known: number;
}

const LEVELS: readonly KnowledgeLevel[] = ["unknown", "inherited", "seen", "visited"];
const CHUNKS_W = Math.ceil(WORLD_FINE_W / FINE_CHUNK);
const PATCHES = WORLD_FINE_W * WORLD_FINE_H;
const BYTES_PER_CHUNK = (FINE_CHUNK * FINE_CHUNK) / 4;

export function newKnowledge(): KnowledgeChunks {
  return { chunks: new Map() };
}

function inWorld(patch: PatchId): boolean {
  return Number.isInteger(patch) && patch >= 0 && patch < PATCHES;
}

/** Which chunk a patch sits in, and where inside that chunk's packed bytes. */
function slotOf(patch: PatchId): { key: number; byte: number; shift: number } {
  const x = patch % WORLD_FINE_W;
  const y = (patch - x) / WORLD_FINE_W;
  const key = Math.floor(y / FINE_CHUNK) * CHUNKS_W + Math.floor(x / FINE_CHUNK);
  const i = (y % FINE_CHUNK) * FINE_CHUNK + (x % FINE_CHUNK);
  return { key, byte: i >> 2, shift: (i & 3) * 2 };
}

function levelBits(knowledge: KnowledgeChunks, patch: PatchId): number {
  if (!inWorld(patch)) return 0;
  const { key, byte, shift } = slotOf(patch);
  const chunk = knowledge.chunks.get(key);
  return chunk ? (chunk[byte] >> shift) & 3 : 0;
}

export function knowledgeAt(knowledge: KnowledgeChunks, patch: PatchId): KnowledgeLevel {
  return LEVELS[levelBits(knowledge, patch)];
}

function writeBits(knowledge: KnowledgeChunks, patch: PatchId, bits: number): boolean {
  const { key, byte, shift } = slotOf(patch);
  let chunk = knowledge.chunks.get(key);
  if (!chunk) {
    // Unknown is all-zero, so a chunk nobody has been in is never allocated.
    if (bits === 0) return false;
    chunk = new Uint8Array(BYTES_PER_CHUNK);
    knowledge.chunks.set(key, chunk);
  }
  if (((chunk[byte] >> shift) & 3) === bits) return false;
  chunk[byte] = (chunk[byte] & ~(3 << shift)) | (bits << shift);
  return true;
}

/** Sets a patch's level outright, in either direction. Returns whether anything changed. */
export function setKnowledge(knowledge: KnowledgeChunks, patch: PatchId, level: KnowledgeLevel): boolean {
  if (!inWorld(patch)) return false;
  return writeBits(knowledge, patch, LEVELS.indexOf(level));
}

/** Knowing a patch better never unknows it: a raise only. Returns whether anything changed. */
function raise(knowledge: KnowledgeChunks, patch: PatchId, bits: number): boolean {
  if (!inWorld(patch) || levelBits(knowledge, patch) >= bits) return false;
  return writeBits(knowledge, patch, bits);
}

/** Read from a distance: enough to route across, not the same as having stood there. */
export function markSeen(knowledge: KnowledgeChunks, patch: PatchId): boolean {
  return raise(knowledge, patch, 2);
}

/** The patch under foot. */
export function markVisited(knowledge: KnowledgeChunks, patch: PatchId): boolean {
  return raise(knowledge, patch, 3);
}

/** The journal: what a dead survivor knew, the heir has read rather than walked. */
export function inheritKnowledge(knowledge: KnowledgeChunks): void {
  for (const chunk of knowledge.chunks.values()) {
    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i];
      if (byte === 0) continue;
      let dimmed = 0;
      for (let shift = 0; shift < 8; shift += 2) if ((byte >> shift) & 3) dimmed |= 1 << shift;
      chunk[i] = dimmed;
    }
  }
}

/** Walks the touched chunks, never the world. */
export function knowledgeCounts(knowledge: KnowledgeChunks): KnowledgeCounts {
  const counts: KnowledgeCounts = { inherited: 0, seen: 0, visited: 0, known: 0 };
  for (const chunk of knowledge.chunks.values()) {
    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i];
      if (byte === 0) continue;
      for (let shift = 0; shift < 8; shift += 2) {
        const bits = (byte >> shift) & 3;
        if (bits === 0) continue;
        counts.known++;
        if (bits === 1) counts.inherited++;
        else if (bits === 2) counts.seen++;
        else counts.visited++;
      }
    }
  }
  return counts;
}

/** Every patch above unknown. Touched chunks only; the caller pays for what it asks for. */
export function knownPatches(knowledge: KnowledgeChunks): PatchId[] {
  const out: PatchId[] = [];
  for (const [key, chunk] of knowledge.chunks) {
    const x0 = (key % CHUNKS_W) * FINE_CHUNK;
    const y0 = Math.floor(key / CHUNKS_W) * FINE_CHUNK;
    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i];
      if (byte === 0) continue;
      for (let shift = 0; shift < 8; shift += 2) {
        if (((byte >> shift) & 3) === 0) continue;
        const index = i * 4 + shift / 2;
        const x = x0 + (index % FINE_CHUNK);
        const y = y0 + Math.floor(index / FINE_CHUNK);
        if (x < WORLD_FINE_W && y < WORLD_FINE_H) out.push(y * WORLD_FINE_W + x);
      }
    }
  }
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX = new Map<string, number>([...B64].map((c, i) => [c, i]));

function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
      + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=")
      + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return out;
}

/**
 * Throws on anything outside the alphabet. A character read as zero would
 * decode a damaged save into ground the survivor never saw, which is
 * indistinguishable from knowledge once it is in the chunks; a throw reaches
 * deserialize, which refuses the save.
 */
function fromBase64(text: string): Uint8Array {
  const body = text.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((body.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let at = 0;
  for (const c of body) {
    const digit = B64_INDEX.get(c);
    if (digit === undefined) throw new RangeError(`knowledge is not base64: ${c}`);
    acc = (acc << 6) | digit;
    bits += 6;
    if (bits < 8) continue;
    bits -= 8;
    out[at++] = (acc >> bits) & 255;
  }
  return out;
}

/**
 * A save-shaped string: `chunk:base64` per touched chunk, comma separated.
 * Trailing zero bytes are dropped because a chunk is nearly always known in
 * a band rather than whole, and decode pads them back.
 */
export function encodeKnowledge(knowledge: KnowledgeChunks): string {
  const parts: string[] = [];
  for (const [key, chunk] of knowledge.chunks) {
    let end = chunk.length;
    while (end > 0 && chunk[end - 1] === 0) end--;
    if (end === 0) continue;
    parts.push(`${key}:${toBase64(chunk.subarray(0, end))}`);
  }
  return parts.join(",");
}

export function decodeKnowledge(text: string): KnowledgeChunks {
  const knowledge = newKnowledge();
  if (!text) return knowledge;
  for (const part of text.split(",")) {
    const at = part.indexOf(":");
    if (at < 0) continue;
    const key = Number(part.slice(0, at));
    if (!Number.isInteger(key)) continue;
    const bytes = fromBase64(part.slice(at + 1));
    const chunk = new Uint8Array(BYTES_PER_CHUNK);
    chunk.set(bytes.subarray(0, BYTES_PER_CHUNK));
    knowledge.chunks.set(key, chunk);
  }
  return knowledge;
}
