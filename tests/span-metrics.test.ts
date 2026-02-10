/**
 * Tests for RED metrics PromQL query builders
 */
import { describe, it, expect } from 'vitest';
import {
	buildRateQuery,
	buildErrorRateQuery,
	buildLatencyQuery,
	buildAvgLatencyQuery,
	buildRedMetricsQueries,
	buildSloAlerts,
	formatPercentile,
	formatErrorRate,
	formatLatency,
	violatesSlo,
	DEFAULT_SLO,
} from '../src/span-metrics.js';
import type { RedMetricsConfig } from '../src/span-metrics.js';

const baseConfig: RedMetricsConfig = {
	serviceName: 'sveltekit-server',
	interval: '5m',
};

describe('RED Metrics Query Builders', () => {
	describe('buildRateQuery', () => {
		it('should build basic rate query', () => {
			const query = buildRateQuery(baseConfig);
			expect(query).toContain('tempo_spanmetrics_calls_total');
			expect(query).toContain('service_name="sveltekit-server"');
			expect(query).toContain('[5m]');
		});

		it('should include HTTP method filter', () => {
			const query = buildRateQuery({ ...baseConfig, httpMethod: 'GET' });
			expect(query).toContain('http_method="GET"');
		});

		it('should include HTTP route filter', () => {
			const query = buildRateQuery({ ...baseConfig, httpRoute: '/api/auth' });
			expect(query).toContain('http_route="/api/auth"');
		});

		it('should include environment filter', () => {
			const query = buildRateQuery({ ...baseConfig, environment: 'production' });
			expect(query).toContain('deployment_environment="production"');
		});
	});

	describe('buildErrorRateQuery', () => {
		it('should build error rate ratio query', () => {
			const query = buildErrorRateQuery(baseConfig);
			expect(query).toContain('span_status_code="ERROR"');
			expect(query).toContain('service_name="sveltekit-server"');
		});
	});

	describe('buildLatencyQuery', () => {
		it('should build P95 latency query', () => {
			const query = buildLatencyQuery(baseConfig, 0.95);
			expect(query).toContain('histogram_quantile');
			expect(query).toContain('0.95');
			expect(query).toContain('tempo_spanmetrics_duration_milliseconds_bucket');
		});

		it('should build P99 latency query', () => {
			const query = buildLatencyQuery(baseConfig, 0.99);
			expect(query).toContain('0.99');
		});
	});

	describe('buildAvgLatencyQuery', () => {
		it('should build average latency query', () => {
			const query = buildAvgLatencyQuery(baseConfig);
			expect(query).toContain('tempo_spanmetrics_duration_milliseconds_sum');
			expect(query).toContain('tempo_spanmetrics_duration_milliseconds_count');
		});
	});

	describe('buildRedMetricsQueries', () => {
		it('should return all RED metric queries', () => {
			const queries = buildRedMetricsQueries(baseConfig);

			expect(queries.rate).toBeDefined();
			expect(queries.errorRate).toBeDefined();
			expect(queries.p50).toBeDefined();
			expect(queries.p95).toBeDefined();
			expect(queries.p99).toBeDefined();
			expect(queries.avgLatency).toBeDefined();
			expect(queries.availability).toBeDefined();
			expect(queries.uptime).toBeDefined();
			expect(queries.errorCount).toBeDefined();
		});

		it('should include breakdown queries', () => {
			const queries = buildRedMetricsQueries(baseConfig);
			expect(queries.rateByMethod).toContain('by (http_method)');
			expect(queries.rateByRoute).toContain('by (http_route)');
		});
	});

	describe('buildSloAlerts', () => {
		it('should build alert rules for default SLO', () => {
			const alerts = buildSloAlerts(baseConfig);

			expect(alerts.errorRateHigh).toBeDefined();
			expect(alerts.errorRateCritical).toBeDefined();
			expect(alerts.p95LatencyHigh).toBeDefined();
			expect(alerts.p99LatencyHigh).toBeDefined();
			expect(alerts.availabilityLow).toBeDefined();
			expect(alerts.errorBudgetConsuming).toBeDefined();
			expect(alerts.errorBudgetExhausted).toBeDefined();
		});

		it('should use custom SLO thresholds', () => {
			const customSlo = {
				availability: 0.99,
				p95LatencyMs: 200,
				p99LatencyMs: 500,
				maxErrorRate: 0.01,
			};

			const alerts = buildSloAlerts(baseConfig, customSlo);
			expect(alerts.errorRateHigh).toContain('0.01');
			expect(alerts.p95LatencyHigh).toContain('200');
		});
	});
});

describe('Formatting Helpers', () => {
	describe('formatPercentile', () => {
		it('should format standard percentiles', () => {
			expect(formatPercentile(0.5)).toBe('P50');
			expect(formatPercentile(0.95)).toBe('P95');
			expect(formatPercentile(0.99)).toBe('P99');
			expect(formatPercentile(0.999)).toBe('P999');
		});

		it('should format non-standard percentiles', () => {
			expect(formatPercentile(0.9)).toBe('P90.0');
		});
	});

	describe('formatErrorRate', () => {
		it('should format as percentage', () => {
			expect(formatErrorRate(0.001)).toBe('0.10%');
			expect(formatErrorRate(0.05)).toBe('5.00%');
			expect(formatErrorRate(1.0)).toBe('100.00%');
		});
	});

	describe('formatLatency', () => {
		it('should format sub-millisecond values', () => {
			expect(formatLatency(0.5)).toContain('us');
		});

		it('should format millisecond values', () => {
			expect(formatLatency(150)).toContain('ms');
		});

		it('should format second values', () => {
			expect(formatLatency(2500)).toContain('s');
		});
	});

	describe('violatesSlo', () => {
		it('should detect error rate violations', () => {
			expect(violatesSlo('errorRate', 0.002)).toBe(true);
			expect(violatesSlo('errorRate', 0.0001)).toBe(false);
		});

		it('should detect P95 latency violations', () => {
			expect(violatesSlo('p95', 600)).toBe(true);
			expect(violatesSlo('p95', 400)).toBe(false);
		});

		it('should detect P99 latency violations', () => {
			expect(violatesSlo('p99', 1200)).toBe(true);
			expect(violatesSlo('p99', 800)).toBe(false);
		});

		it('should detect availability violations', () => {
			expect(violatesSlo('availability', 0.998)).toBe(true);
			expect(violatesSlo('availability', 0.9999)).toBe(false);
		});

		it('should use custom SLO thresholds', () => {
			const customSlo = { ...DEFAULT_SLO, maxErrorRate: 0.05 };
			expect(violatesSlo('errorRate', 0.04, customSlo)).toBe(false);
			expect(violatesSlo('errorRate', 0.06, customSlo)).toBe(true);
		});
	});
});
