/**
 * Tempo RED Metrics Service
 *
 * Queries Tempo's metrics_generator for Rate/Error/Duration metrics.
 * Tempo automatically derives Prometheus-compatible metrics from traces.
 *
 * **Architecture**:
 * - Tempo ingests traces with spans
 * - metrics_generator component generates RED metrics from span data
 * - Metrics exposed via Prometheus endpoint at :3200/prometheus/api/v1/query
 *
 * **Metrics Available** (from metrics_generator):
 * - traces_spanmetrics_calls_total - Total span count (for Rate)
 * - traces_spanmetrics_duration_bucket - Histogram of span durations (for Duration percentiles)
 * - traces_spanmetrics_size_total - Total span size in bytes
 *
 * @module tempo-red-metrics
 */

import { getLogger } from '../config.js';
import { getObservabilityConfig } from '../observability-config.js';

/**
 * RED metrics for a specific span/service
 */
export interface REDMetrics {
	/** Current request rate (requests per second) */
	rate: number;
	/** Historical rate data */
	rateTimeseries: Array<{ timestamp: number; value: number }>;

	/** Percentage of requests that errored (0-100) */
	errorRate: number;
	/** Absolute error count */
	errorCount: number;
	/** Total request count */
	totalCount: number;
	/** Historical error rate */
	errorsTimeseries: Array<{ timestamp: number; value: number }>;

	/** Median latency (milliseconds) */
	p50: number;
	/** 95th percentile latency (milliseconds) */
	p95: number;
	/** 99th percentile latency (milliseconds) */
	p99: number;
	/** Historical latency data */
	durationTimeseries: Array<{ timestamp: number; p50: number; p95: number; p99: number }>;
}

/**
 * Prometheus query result (simplified)
 */
interface PrometheusQueryResult {
	status: string;
	data: {
		resultType: string;
		result: Array<{
			metric: Record<string, string>;
			value?: [number, string];
			values?: Array<[number, string]>;
		}>;
	};
}

/**
 * Options for configuring the TempoREDMetricsService
 */
export interface TempoREDMetricsServiceOptions {
	/** Tempo base URL (default: auto-detected from observability config) */
	tempoUrl?: string;
}

/**
 * Service for querying Tempo's metrics_generator RED metrics
 */
export class TempoREDMetricsService {
	private tempoUrl: string;
	private prometheusUrl: string;

	constructor(options: TempoREDMetricsServiceOptions = {}) {
		const obsConfig = getObservabilityConfig();
		this.tempoUrl = options.tempoUrl ?? obsConfig.tempoUrl ?? 'http://stonewall-tempo:3200';
		this.prometheusUrl = `${this.tempoUrl}/prometheus`;
	}

	/**
	 * Get RED metrics for fingerprint enrichment spans
	 *
	 * @param timeRange - Time range string (e.g., "1h", "24h", "7d")
	 * @returns RED metrics (rate, error rate, duration percentiles)
	 */
	async getFingerprintREDMetrics(timeRange: string = '1h'): Promise<REDMetrics> {
		return this.getREDMetrics('fingerprint.enrichment', timeRange);
	}

	/**
	 * Get RED metrics for any span name
	 *
	 * @param spanName - Span name to query (e.g., "http.request", "fingerprint.enrichment")
	 * @param timeRange - Time range string (e.g., "1h", "24h", "7d")
	 * @returns RED metrics
	 */
	async getREDMetrics(spanName: string, timeRange: string = '1h'): Promise<REDMetrics> {
		const logger = getLogger();

		try {
			logger.info('Querying Tempo RED metrics', { spanName, timeRange });

			const { start, end, step } = this.parseTimeRange(timeRange);

			const [rate, errorRate, p50, p95, p99] = await Promise.all([
				this.queryRate(spanName, start, end, step),
				this.queryErrorRate(spanName, start, end, step),
				this.queryDurationPercentile(spanName, 0.5, start, end, step),
				this.queryDurationPercentile(spanName, 0.95, start, end, step),
				this.queryDurationPercentile(spanName, 0.99, start, end, step),
			]);

			logger.info('Tempo RED metrics query successful', {
				spanName,
				rate: rate.current,
				errorRate: errorRate.current,
				p50: p50.current,
				p95: p95.current,
				p99: p99.current,
			});

			return {
				rate: rate.current,
				rateTimeseries: rate.timeseries,
				errorRate: errorRate.current,
				errorCount: errorRate.errorCount,
				totalCount: errorRate.totalCount,
				errorsTimeseries: errorRate.timeseries,
				p50: p50.current,
				p95: p95.current,
				p99: p99.current,
				durationTimeseries: this.combineDurationTimeseries(
					p50.timeseries,
					p95.timeseries,
					p99.timeseries
				),
			};
		} catch (error) {
			logger.error('Tempo RED metrics query failed', {
				spanName,
				timeRange,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Query request rate (requests per second)
	 */
	private async queryRate(
		spanName: string,
		start: number,
		end: number,
		step: string
	): Promise<{ current: number; timeseries: Array<{ timestamp: number; value: number }> }> {
		const query = `rate(traces_spanmetrics_calls_total{span_name="${spanName}"}[5m])`;
		const result = await this.queryPrometheus(query, start, end, step);

		const timeseries = this.extractTimeseries(result);
		const current = timeseries.length > 0 ? timeseries[timeseries.length - 1].value : 0;

		return { current, timeseries };
	}

	/**
	 * Query error rate (percentage of failed requests)
	 */
	private async queryErrorRate(
		spanName: string,
		start: number,
		end: number,
		step: string
	): Promise<{
		current: number;
		errorCount: number;
		totalCount: number;
		timeseries: Array<{ timestamp: number; value: number }>;
	}> {
		const errorQuery = `rate(traces_spanmetrics_calls_total{span_name="${spanName}",status_code="STATUS_CODE_ERROR"}[5m])`;
		const totalQuery = `rate(traces_spanmetrics_calls_total{span_name="${spanName}"}[5m])`;

		const [errorResult, totalResult] = await Promise.all([
			this.queryPrometheus(errorQuery, start, end, step),
			this.queryPrometheus(totalQuery, start, end, step),
		]);

		const errorTimeseries = this.extractTimeseries(errorResult);
		const totalTimeseries = this.extractTimeseries(totalResult);

		const timeseries: Array<{ timestamp: number; value: number }> = [];
		for (let i = 0; i < Math.min(errorTimeseries.length, totalTimeseries.length); i++) {
			const errorRateVal =
				totalTimeseries[i].value > 0
					? (errorTimeseries[i].value / totalTimeseries[i].value) * 100
					: 0;
			timeseries.push({
				timestamp: errorTimeseries[i].timestamp,
				value: errorRateVal,
			});
		}

		const currentErrorRate = timeseries.length > 0 ? timeseries[timeseries.length - 1].value : 0;
		const currentErrorCount =
			errorTimeseries.length > 0 ? errorTimeseries[errorTimeseries.length - 1].value : 0;
		const currentTotalCount =
			totalTimeseries.length > 0 ? totalTimeseries[totalTimeseries.length - 1].value : 0;

		return {
			current: currentErrorRate,
			errorCount: currentErrorCount,
			totalCount: currentTotalCount,
			timeseries,
		};
	}

	/**
	 * Query duration percentile (p50, p95, p99)
	 */
	private async queryDurationPercentile(
		spanName: string,
		percentile: number,
		start: number,
		end: number,
		step: string
	): Promise<{ current: number; timeseries: Array<{ timestamp: number; value: number }> }> {
		const query = `histogram_quantile(${percentile}, rate(traces_spanmetrics_duration_bucket{span_name="${spanName}"}[5m])) * 1000`;
		const result = await this.queryPrometheus(query, start, end, step);

		const timeseries = this.extractTimeseries(result);
		const current = timeseries.length > 0 ? timeseries[timeseries.length - 1].value : 0;

		return { current, timeseries };
	}

	/**
	 * Query Prometheus (Tempo's metrics_generator endpoint)
	 */
	async queryPrometheus(
		query: string,
		start: number,
		end: number,
		step: string
	): Promise<PrometheusQueryResult> {
		const logger = getLogger();

		const params = new URLSearchParams({
			query,
			start: start.toString(),
			end: end.toString(),
			step,
		});

		const url = `${this.prometheusUrl}/api/v1/query_range?${params.toString()}`;
		logger.debug('Prometheus query', { url, query });

		const response = await fetch(url, {
			headers: { 'Content-Type': 'application/json' },
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(
				`Prometheus query failed: ${response.status} ${response.statusText} - ${text}`
			);
		}

		return (await response.json()) as PrometheusQueryResult;
	}

	/**
	 * Extract timeseries from Prometheus result
	 */
	extractTimeseries(
		result: PrometheusQueryResult
	): Array<{ timestamp: number; value: number }> {
		const timeseries: Array<{ timestamp: number; value: number }> = [];

		if (!result.data?.result || result.data.result.length === 0) {
			return timeseries;
		}

		const series = result.data.result[0];

		if (series.values) {
			for (const [timestamp, value] of series.values) {
				timeseries.push({
					timestamp: timestamp * 1000,
					value: parseFloat(value),
				});
			}
		} else if (series.value) {
			const [timestamp, value] = series.value;
			timeseries.push({
				timestamp: timestamp * 1000,
				value: parseFloat(value),
			});
		}

		return timeseries;
	}

	/**
	 * Combine p50/p95/p99 timeseries into single structure
	 */
	private combineDurationTimeseries(
		p50: Array<{ timestamp: number; value: number }>,
		p95: Array<{ timestamp: number; value: number }>,
		p99: Array<{ timestamp: number; value: number }>
	): Array<{ timestamp: number; p50: number; p95: number; p99: number }> {
		const combined: Array<{ timestamp: number; p50: number; p95: number; p99: number }> = [];

		for (let i = 0; i < Math.min(p50.length, p95.length, p99.length); i++) {
			combined.push({
				timestamp: p50[i].timestamp,
				p50: p50[i].value,
				p95: p95[i].value,
				p99: p99[i].value,
			});
		}

		return combined;
	}

	/**
	 * Parse time range string to start/end/step
	 */
	parseTimeRange(timeRange: string): { start: number; end: number; step: string } {
		const end = Math.floor(Date.now() / 1000);
		let start = end;
		let step = '15s';

		const match = timeRange.match(/^(\d+)([smhdw])$/);
		if (!match) {
			throw new Error(`Invalid time range format: ${timeRange}`);
		}

		const value = parseInt(match[1]);
		const unit = match[2];

		const multipliers: Record<string, number> = {
			s: 1,
			m: 60,
			h: 3600,
			d: 86400,
			w: 604800,
		};

		const seconds = value * multipliers[unit];
		start = end - seconds;

		if (seconds <= 3600) {
			step = '15s';
		} else if (seconds <= 86400) {
			step = '1m';
		} else if (seconds <= 604800) {
			step = '5m';
		} else {
			step = '15m';
		}

		return { start, end, step };
	}
}

/**
 * Create a new TempoREDMetricsService instance.
 *
 * @param options - Service configuration options
 * @returns Configured TempoREDMetricsService instance
 */
export function createTempoREDMetricsService(
	options: TempoREDMetricsServiceOptions = {}
): TempoREDMetricsService {
	return new TempoREDMetricsService(options);
}
