export class ActiveInputs<T> {
  private readonly active = new Map<string, T>();

  hold(key: string, value: T): T | undefined {
    const previous = this.active.get(key);
    this.active.set(key, value);
    return previous;
  }

  release(key: string): T | undefined {
    const value = this.active.get(key);
    this.active.delete(key);
    return value;
  }

  drain(): T[] {
    const values = Array.from(this.active.values());
    this.active.clear();
    return values;
  }
}
