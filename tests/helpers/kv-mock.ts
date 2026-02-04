/**
 * In-memory mock for Cloudflare Workers KVNamespace.
 *
 * Only needed when running tests outside the cloudflare pool
 * (the pool provides real KV automatically via miniflare).
 */
export function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; metadata: unknown }>();

  return {
    get: (async (key: string, optionsOrType?: unknown) => {
      const entry = store.get(key);
      if (!entry) return null;

      const type =
        typeof optionsOrType === "string"
          ? optionsOrType
          : (optionsOrType as { type?: string })?.type ?? "text";

      switch (type) {
        case "json":
          return JSON.parse(entry.value);
        case "arrayBuffer":
          return new TextEncoder().encode(entry.value).buffer;
        case "stream":
          return new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(entry.value));
              controller.close();
            },
          });
        default:
          return entry.value;
      }
    }) as KVNamespace["get"],

    put: (async (
      key: string,
      value: string,
      options?: { expirationTtl?: number; metadata?: unknown },
    ) => {
      store.set(key, {
        value: typeof value === "string" ? value : JSON.stringify(value),
        metadata: options?.metadata ?? null,
      });
    }) as KVNamespace["put"],

    delete: (async (key: string) => {
      store.delete(key);
    }) as KVNamespace["delete"],

    list: (async (options?: { prefix?: string; limit?: number; cursor?: string }) => {
      const prefix = options?.prefix ?? "";
      const limit = options?.limit ?? 1000;
      const keys: { name: string; metadata: unknown }[] = [];

      for (const [key, entry] of store) {
        if (key.startsWith(prefix)) {
          keys.push({ name: key, metadata: entry.metadata });
          if (keys.length >= limit) break;
        }
      }

      return {
        keys,
        list_complete: keys.length < limit,
        cursor: "",
        cacheStatus: null,
      };
    }) as KVNamespace["list"],

    getWithMetadata: (async (key: string, optionsOrType?: unknown) => {
      const entry = store.get(key);
      if (!entry) return { value: null, metadata: null, cacheStatus: null };

      const type =
        typeof optionsOrType === "string"
          ? optionsOrType
          : (optionsOrType as { type?: string })?.type ?? "text";

      let value: unknown;
      switch (type) {
        case "json":
          value = JSON.parse(entry.value);
          break;
        default:
          value = entry.value;
      }

      return { value, metadata: entry.metadata, cacheStatus: null };
    }) as KVNamespace["getWithMetadata"],
  };
}
