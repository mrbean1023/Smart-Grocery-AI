import { Injectable, Logger } from '@nestjs/common';
import { Counter, Histogram, register } from 'prom-client';

/**
 * Lightweight facade over prom-client. Metrics are created lazily on first
 * use, names are sanitized and prefixed with `sg_`, and all errors are
 * swallowed (metrics must never break a request path).
 *
 * Other modules call exactly:
 *   metrics.increment('recipe_scans_total', { source: 'IMAGE_OCR' })
 *   metrics.observeHistogram('ocr_duration_seconds', 1.42, { provider: 'vision' })
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly counters = new Map<string, Counter<string>>();
  private readonly histograms = new Map<string, Histogram<string>>();

  increment(name: string, labels?: Record<string, string | number>): void {
    try {
      const metricName = this.sanitizeName(name);
      const labelValues = this.normalizeLabels(labels);
      const counter = this.getCounter(metricName, Object.keys(labelValues));
      counter.inc(labelValues, 1);
    } catch (error) {
      this.logger.warn(`Failed to increment metric "${name}": ${this.describe(error)}`);
    }
  }

  observeHistogram(name: string, value: number, labels?: Record<string, string | number>): void {
    try {
      const metricName = this.sanitizeName(name);
      const labelValues = this.normalizeLabels(labels);
      const histogram = this.getHistogram(metricName, Object.keys(labelValues));
      histogram.observe(labelValues, value);
    } catch (error) {
      this.logger.warn(`Failed to observe metric "${name}": ${this.describe(error)}`);
    }
  }

  private getCounter(name: string, labelNames: string[]): Counter<string> {
    const existing = this.counters.get(name);
    if (existing) return existing;

    const registered = register.getSingleMetric(name);
    const counter =
      (registered as Counter<string> | undefined) ??
      new Counter({
        name,
        help: `${name} (auto-registered counter)`,
        labelNames,
        registers: [register],
      });
    this.counters.set(name, counter);
    return counter;
  }

  private getHistogram(name: string, labelNames: string[]): Histogram<string> {
    const existing = this.histograms.get(name);
    if (existing) return existing;

    const registered = register.getSingleMetric(name);
    const histogram =
      (registered as Histogram<string> | undefined) ??
      new Histogram({
        name,
        help: `${name} (auto-registered histogram)`,
        labelNames,
        registers: [register],
      });
    this.histograms.set(name, histogram);
    return histogram;
  }

  private sanitizeName(name: string): string {
    const cleaned = name.replace(/[^a-zA-Z0-9_:]/g, '_').replace(/^[^a-zA-Z_:]+/, '_');
    return cleaned.startsWith('sg_') ? cleaned : `sg_${cleaned}`;
  }

  private normalizeLabels(labels?: Record<string, string | number>): Record<string, string> {
    if (!labels) return {};
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(labels)) {
      normalized[key.replace(/[^a-zA-Z0-9_]/g, '_')] = String(value);
    }
    return normalized;
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
