const logger = require('./logger').createServiceLogger('METRICS');

class PerformanceMetrics {
  constructor() { this.entries = []; this.limit = 100; }

  record(name, durationMs, metadata = {}) {
    const entry = { name, durationMs: Math.max(0, Math.round(durationMs || 0)), timestamp: new Date().toISOString(), ...metadata };
    this.entries.push(entry);
    if (this.entries.length > this.limit) this.entries.shift();
    logger.info(`Latency: ${name}`, entry);
    return entry;
  }

  getSnapshot() {
    const summary = {};
    for (const entry of this.entries) {
      const stat = summary[entry.name] || { count: 0, totalMs: 0, minMs: Infinity, maxMs: 0 };
      stat.count += 1; stat.totalMs += entry.durationMs; stat.minMs = Math.min(stat.minMs, entry.durationMs); stat.maxMs = Math.max(stat.maxMs, entry.durationMs);
      summary[entry.name] = stat;
    }
    for (const stat of Object.values(summary)) stat.averageMs = Math.round(stat.totalMs / stat.count);
    return { entries: [...this.entries], summary };
  }
}

module.exports = new PerformanceMetrics();
