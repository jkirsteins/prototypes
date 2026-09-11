/**
 * A binary min-heap of cell indices keyed by a float, on typed arrays so
 * a flood over millions of cells pays no per-node allocation. Capacity
 * is fixed at construction: a flood pushes each cell at most once.
 */
export class MinHeap {
  private readonly idx: Int32Array;
  private readonly key: Float64Array;
  size = 0;

  constructor(capacity: number) {
    this.idx = new Int32Array(capacity);
    this.key = new Float64Array(capacity);
  }

  push(i: number, k: number): void {
    const idx = this.idx;
    const key = this.key;
    let c = this.size++;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (key[p] <= k) break;
      idx[c] = idx[p];
      key[c] = key[p];
      c = p;
    }
    idx[c] = i;
    key[c] = k;
  }

  pop(): number {
    const idx = this.idx;
    const key = this.key;
    const top = idx[0];
    const n = --this.size;
    if (n > 0) {
      const i = idx[n];
      const k = key[n];
      let c = 0;
      for (;;) {
        let l = 2 * c + 1;
        if (l >= n) break;
        const r = l + 1;
        if (r < n && key[r] < key[l]) l = r;
        if (key[l] >= k) break;
        idx[c] = idx[l];
        key[c] = key[l];
        c = l;
      }
      idx[c] = i;
      key[c] = k;
    }
    return top;
  }
}
