/**
 * Tests for QueryPerformanceService
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryPerformanceService } from '../src/services/query-performance.js';
import { resetOtelConfig } from '../src/config.js';

// Mock fs module
vi.mock('node:fs', () => ({
	writeFileSync: vi.fn(),
	readFileSync: vi.fn(),
	existsSync: vi.fn(() => false),
}));

function createExecution(
	query: string,
	executionTimeMs: number,
	success: boolean = true,
	resultCount: number = 10
) {
	return {
		queryHash: QueryPerformanceService.hashQuery(query),
		query,
		executionTimeMs,
		resultCount,
		startTime: new Date(),
		endTime: new Date(Date.now() + executionTimeMs),
		success,
		errorMessage: success ? undefined : 'Query failed',
	};
}

describe('QueryPerformanceService', () => {
	let service: QueryPerformanceService;

	beforeEach(() => {
		resetOtelConfig();
		service = new QueryPerformanceService({ loadOnCreate: false });
	});

	describe('constructor', () => {
		it('should create with default options', () => {
			const svc = new QueryPerformanceService({ loadOnCreate: false });
			expect(svc).toBeDefined();
		});

		it('should accept custom max executions', () => {
			const svc = new QueryPerformanceService({
				maxExecutions: 100,
				loadOnCreate: false,
			});
			expect(svc).toBeDefined();
		});

		it('should accept custom metrics file path', () => {
			const svc = new QueryPerformanceService({
				metricsFilePath: '/tmp/test-metrics.json',
				loadOnCreate: false,
			});
			expect(svc).toBeDefined();
		});
	});

	describe('recordQueryExecution', () => {
		it('should record execution', () => {
			const exec = createExecution('{ span.http.status_code >= 500 }', 200);
			service.recordQueryExecution(exec);

			const executions = service.getExecutions();
			expect(executions).toHaveLength(1);
			expect(executions[0].query).toBe('{ span.http.status_code >= 500 }');
		});

		it('should maintain rolling window', () => {
			const svc = new QueryPerformanceService({
				maxExecutions: 3,
				loadOnCreate: false,
			});

			for (let i = 0; i < 5; i++) {
				svc.recordQueryExecution(createExecution(`query_${i}`, 100));
			}

			const executions = svc.getExecutions();
			expect(executions).toHaveLength(3);
			// Oldest entries should be evicted
			expect(executions[0].query).toBe('query_2');
			expect(executions[2].query).toBe('query_4');
		});
	});

	describe('getMetrics', () => {
		it('should return empty metrics for no executions', () => {
			const metrics = service.getMetrics();

			expect(metrics.totalQueries).toBe(0);
			expect(metrics.successRate).toBe(0);
			expect(metrics.p50LatencyMs).toBe(0);
			expect(metrics.p95LatencyMs).toBe(0);
			expect(metrics.p99LatencyMs).toBe(0);
			expect(metrics.avgResultCount).toBe(0);
			expect(metrics.slowQueryCount).toBe(0);
		});

		it('should calculate success rate correctly', () => {
			service.recordQueryExecution(createExecution('q1', 100, true));
			service.recordQueryExecution(createExecution('q2', 200, true));
			service.recordQueryExecution(createExecution('q3', 300, false));
			service.recordQueryExecution(createExecution('q4', 150, true));

			const metrics = service.getMetrics();
			expect(metrics.totalQueries).toBe(4);
			expect(metrics.successRate).toBe(75);
		});

		it('should calculate latency percentiles', () => {
			// Add 100 executions with known latencies
			for (let i = 1; i <= 100; i++) {
				service.recordQueryExecution(createExecution(`q_${i}`, i * 10));
			}

			const metrics = service.getMetrics();
			// p50 should be around 500ms (50th value)
			expect(metrics.p50LatencyMs).toBeGreaterThan(400);
			expect(metrics.p50LatencyMs).toBeLessThan(600);

			// p95 should be around 950ms
			expect(metrics.p95LatencyMs).toBeGreaterThan(900);
			expect(metrics.p95LatencyMs).toBeLessThan(1000);

			// p99 should be around 990ms
			expect(metrics.p99LatencyMs).toBeGreaterThan(950);
			expect(metrics.p99LatencyMs).toBeLessThan(1010);
		});

		it('should count slow queries', () => {
			service.recordQueryExecution(createExecution('q1', 500));
			service.recordQueryExecution(createExecution('q2', 1500)); // slow
			service.recordQueryExecution(createExecution('q3', 2000)); // slow
			service.recordQueryExecution(createExecution('q4', 100));

			const metrics = service.getMetrics();
			expect(metrics.slowQueryCount).toBe(2);
		});

		it('should calculate average result count', () => {
			service.recordQueryExecution(createExecution('q1', 100, true, 10));
			service.recordQueryExecution(createExecution('q2', 100, true, 20));
			service.recordQueryExecution(createExecution('q3', 100, true, 30));

			const metrics = service.getMetrics();
			expect(metrics.avgResultCount).toBe(20);
		});

		it('should filter by time range', () => {
			const now = new Date();
			const oneHourAgo = new Date(now.getTime() - 3600000);
			const twoHoursAgo = new Date(now.getTime() - 7200000);

			service.recordQueryExecution({
				...createExecution('old', 100),
				startTime: twoHoursAgo,
				endTime: twoHoursAgo,
			});
			service.recordQueryExecution({
				...createExecution('recent', 200),
				startTime: now,
				endTime: now,
			});

			const metrics = service.getMetrics({
				start: oneHourAgo,
				end: new Date(now.getTime() + 1000),
			});
			expect(metrics.totalQueries).toBe(1);
		});
	});

	describe('getSlowQueries', () => {
		it('should return empty for no slow queries', () => {
			service.recordQueryExecution(createExecution('q1', 100));
			service.recordQueryExecution(createExecution('q2', 200));

			const slowQueries = service.getSlowQueries();
			expect(slowQueries).toHaveLength(0);
		});

		it('should identify slow queries', () => {
			service.recordQueryExecution(createExecution('fast', 100));
			service.recordQueryExecution(createExecution('slow', 1500));
			service.recordQueryExecution(createExecution('slower', 2000));

			const slowQueries = service.getSlowQueries();
			expect(slowQueries).toHaveLength(2);
			// Sorted by avg execution time descending
			expect(slowQueries[0].query).toBe('slower');
			expect(slowQueries[1].query).toBe('slow');
		});

		it('should aggregate duplicate slow queries', () => {
			const query = '{ span.http.status_code >= 500 }';
			service.recordQueryExecution(createExecution(query, 1500));
			service.recordQueryExecution(createExecution(query, 2000));
			service.recordQueryExecution(createExecution(query, 2500));

			const slowQueries = service.getSlowQueries();
			expect(slowQueries).toHaveLength(1);
			expect(slowQueries[0].executionCount).toBe(3);
			expect(slowQueries[0].avgExecutionTimeMs).toBe(2000);
		});

		it('should respect custom threshold', () => {
			service.recordQueryExecution(createExecution('q1', 200));
			service.recordQueryExecution(createExecution('q2', 600));

			const slowQueries = service.getSlowQueries(500);
			expect(slowQueries).toHaveLength(1);
			expect(slowQueries[0].query).toBe('q2');
		});
	});

	describe('getSummary', () => {
		it('should return complete summary', () => {
			service.recordQueryExecution(createExecution('q1', 100));
			service.recordQueryExecution(createExecution('q1', 150));
			service.recordQueryExecution(createExecution('q2', 1500));

			const summary = service.getSummary();
			expect(summary.metrics).toBeDefined();
			expect(summary.slowQueries).toBeDefined();
			expect(summary.topQueries).toBeDefined();
		});

		it('should rank top queries by frequency', () => {
			for (let i = 0; i < 5; i++) service.recordQueryExecution(createExecution('frequent', 100));
			for (let i = 0; i < 2; i++) service.recordQueryExecution(createExecution('occasional', 100));
			service.recordQueryExecution(createExecution('rare', 100));

			const summary = service.getSummary();
			expect(summary.topQueries[0].query).toBe('frequent');
			expect(summary.topQueries[0].count).toBe(5);
			expect(summary.topQueries[1].query).toBe('occasional');
			expect(summary.topQueries[1].count).toBe(2);
		});
	});

	describe('calculatePercentile', () => {
		it('should return 0 for empty array', () => {
			expect(service.calculatePercentile([], 50)).toBe(0);
		});

		it('should return single value for single-element array', () => {
			expect(service.calculatePercentile([42], 50)).toBe(42);
			expect(service.calculatePercentile([42], 95)).toBe(42);
		});

		it('should interpolate between values', () => {
			const values = [10, 20, 30, 40, 50];
			const p50 = service.calculatePercentile(values, 50);
			expect(p50).toBe(30); // Middle value
		});

		it('should handle edge percentiles', () => {
			const values = [10, 20, 30, 40, 50];
			expect(service.calculatePercentile(values, 0)).toBe(10); // First value
			expect(service.calculatePercentile(values, 100)).toBe(50); // Last value
		});
	});

	describe('hashQuery', () => {
		it('should produce consistent hashes', () => {
			const hash1 = QueryPerformanceService.hashQuery('{ span.http.status_code >= 500 }');
			const hash2 = QueryPerformanceService.hashQuery('{ span.http.status_code >= 500 }');
			expect(hash1).toBe(hash2);
		});

		it('should produce different hashes for different queries', () => {
			const hash1 = QueryPerformanceService.hashQuery('{ span.http.status_code >= 500 }');
			const hash2 = QueryPerformanceService.hashQuery('{ span.http.status_code >= 400 }');
			expect(hash1).not.toBe(hash2);
		});

		it('should return hex string', () => {
			const hash = QueryPerformanceService.hashQuery('test');
			expect(hash).toMatch(/^[0-9a-f]{32}$/);
		});
	});

	describe('createQueryPerformanceService', () => {
		it('should be importable', async () => {
			const { createQueryPerformanceService } = await import(
				'../src/services/query-performance.js'
			);
			const svc = createQueryPerformanceService({ loadOnCreate: false });
			expect(svc).toBeInstanceOf(QueryPerformanceService);
		});
	});
});
