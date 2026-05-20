export function createRealtimeHub() {
  const clients = new Set();

  return {
    add(client) {
      clients.add(client);
    },
    remove(client) {
      clients.delete(client);
    },
    broadcast(event) {
      const payload = `event: update\ndata: ${JSON.stringify(event)}\n\n`;
      for (const client of clients) {
        if (!client.tenantIds.includes(event.tenantId)) continue;
        client.res.write(payload);
      }
    },
    count() {
      return clients.size;
    }
  };
}
