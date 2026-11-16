/**
 * Keyed element reuse for the vector renderers. Each draw item owns a slot
 * keyed by node id; a slot is rebuilt only when its structural signature
 * changes, otherwise its attributes are updated in place. Slots are kept in
 * paint order and removed when their node disappears.
 */
export interface Slot {
  readonly root: Element;
  readonly signature: string;
  /** Extra cleanup (e.g. removing `<defs>` entries) when the slot is dropped. */
  dispose?(): void;
}

/**
 * Where slots go, when they are not simply appended to the parent in order
 * (e.g. into blurred layer containers). `signature` names an item's place;
 * `place` puts every slot in paint order when any key or place changed.
 */
export interface Placement<S, T> {
  signature(item: T): string;
  place(entries: readonly { readonly slot: S; readonly item: T }[]): void;
}

export class Slots<S extends Slot> {
  readonly #parent: Element;
  readonly #slots = new Map<string, S>();
  #order: string[] = [];

  constructor(parent: Element) {
    this.#parent = parent;
  }

  /**
   * Runs one frame. `items` are in paint order. `build` creates a slot when
   * none exists or its signature changed; `update` refreshes it.
   */
  sync<T>(
    items: readonly T[],
    keyOf: (item: T) => string,
    signatureOf: (item: T) => string,
    build: (item: T, key: string) => S,
    update: (slot: S, item: T) => void,
    placement?: Placement<S, T>,
  ): void {
    const order: string[] = [];
    const entries: { slot: S; item: T }[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const key = keyOf(item);
      const signature = signatureOf(item);
      let slot = this.#slots.get(key);
      if (!slot || slot.signature !== signature) {
        if (slot) drop(slot);
        slot = build(item, key);
        this.#slots.set(key, slot);
        this.#order = []; // force a reorder pass
      }
      update(slot, item);
      order.push(placement ? `${key}@${placement.signature(item)}` : key);
      entries.push({ slot, item });
      seen.add(key);
    }
    for (const [key, slot] of this.#slots) {
      if (!seen.has(key)) {
        drop(slot);
        this.#slots.delete(key);
      }
    }
    if (order.length !== this.#order.length || order.some((key, i) => key !== this.#order[i])) {
      if (placement) placement.place(entries);
      else for (const { slot } of entries) this.#parent.append(slot.root);
      this.#order = order;
    }
  }

  clear(): void {
    for (const slot of this.#slots.values()) drop(slot);
    this.#slots.clear();
    this.#order = [];
  }
}

function drop(slot: Slot): void {
  slot.root.remove();
  slot.dispose?.();
}
