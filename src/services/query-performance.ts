/**
 * Query Performance Monitoring Service
 *
 * Tracks TraceQL query execution metrics, identifies slow queries,
 * and provides performance insights for optimization.
 *
 * Features:
 * - In-memory storage with file persistence
 * - Rolling window (configurable, default last 1000 executions)
 * - Percentile calculations (p50, p95, p99)
 * - Slow query detection
 * - Query deduplication via MD5 hashing
 *
 * @module query-performance
 */

import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { getLogger } from '../config.js';

/**
 * Default slow query threshold in milliseconds
 */
const DEFAULT_SLOW_THRESHOLD_MS = 1000;

/**
 * Individual query execution record
 */
export interface QueryExecution {
	/** MD5 hash of query text for deduplication */
	queryHash: string;
	/** Original TraceQL query string */
	query: string;
	/** Execution time in milliseconds */
	executionTimeMs: number;
	/** Number of results returned */
	resultCount: number;
	/** Query start timestamp */
	startTime: Date;
	/** Query end timestamp */
	endTime: Date;
	/** Whether query succeeded */
	success: boolean;
	/** Error message if failed */
	errorMessage?: string;
}

/**
 * Aggregated performance metrics
 */
export interface QueryMetrics {
	/** Total number of queries executed */
	totalQueries: number;
	/** Success rate as percentage (0-100) */
	successRate: number;
	/** 50th percentile latency (median) */
	p50LatencyMs: number;
	/** 95th percentile latency */
	p95LatencyMs: number;
	/** 99th percentile latency */
	p99LatencyMs: number;
	/** Average number of results per query */
	avgResultCount: number;
	/** Count of queries exceeding slow threshold */
	slowQueryCount: number;
}

/**
 * Slow query aggregation
 */
export interface SlowQuery {
	/** Query text */
	query: string;
	/** Average execution time across all runs */
	avgExecutionTimeMs: number;
	/** Number of times this query was executed */
	executionCount: number;
	/** Last execution timestamp */
	lastExecutedAt: Date;
}

/**
 * Complete performance summary
 */
export interface PerformanceSummary {
	/** Aggregated metrics */
	metrics: QueryMetrics;
	/** Slow queries sorted by avg execution time */
	slowQueries: SlowQuery[];
	/** Most frequently executed queries */
	topQueries: Array<{ query: string; count: number }>;
}

/**
 * Serializable query execution for file storage
 */
interface SerializedQueryExecution extends Omit<QueryExecution, 'startTime' | 'endTime'> {
	startTime: string;
	endTime: string;
}

/**
 * Options for configuring the QueryPerformanceService
 */
export interface QueryPerformanceServiceOptions {
	/** Maximum number of query executions to keep in memory (default: 1000) */
	maxExecutions?: number;
	/** File path for persisting metrics (default: 'content/traceql/query-metrics.json') */
	metricsFilePath?: string;
	/** Whether to load persisted metrics on creation (default: true) */
	loadOnCreate?: boolean;
}

/**
 * Query Performance Monitoring Service
 *
 * Tracks TraceQL query performance with configurable rolling window,
 * file persistence, and percentile calculations.
 *
 * @example
 * ```typescript
 * const service = new QueryPerformanceService({ maxExecutions: 500 });
 * service.recordQueryExecution({
 *   queryHash: QueryPerformanceService.hashQuery('{ span.http.status_code >= 500 }'),
 *   query: '{ span.http.status_code >= 500 }',
 *   executionTimeMs: 1250,
 *   resultCount: 42,
 *   startTime: new Date(),
 *   endTime: new Date(),
 *   success: true
 * });
 *
 * const metrics = service.getMetrics();
 * ```
 */
export class QueryPerformanceService {
	private executions: QueryExecution[] = [];
	private readonly maxExecutions: number;
	private readonly metricsFilePath: string;

	constructor(options: QueryPerformanceServiceOptions = {}) {
		this.maxExecutions = options.maxExecutions ?? 1000;
		this.metricsFilePath = options.metricsFilePath ?? 'content/traceql/query-metrics.json';

		if (options.loadOnCreate !== false) {
			this.loadMetrics();
		}
	}

	/**
	 * Record a query execution
	 *
	 * @param execution - Query execution metadata
	 */
	recordQueryExecution(execution: QueryExecution): void {
		const logger = getLogger();
		this.executions.push(execution);

		// Maintain rolling window
		if (this.executions.length > this.maxExecutions) {
			this.executions.shift();
		}

		logger.debug('Query execution recorded', {
			queryHash: execution.queryHash,
			executionTimeMs: execution.executionTimeMs.toString(),
			resultCount: execution.resultCount.toString(),
			success: execution.success.toString(),
		});
	}

	/**
	 * Get all recorded executions (for testing/inspection)
	 */
	getExecutions(): ReadonlyArray<QueryExecution> {
		return this.executions;
	}

	/**
	 * Calculate aggregated metrics
	 *
	 * @param timeRange - Optional time range filter
	 * @returns Aggregated performance metrics
	 */
	getMetrics(timeRange?: { start: Date; end: Date }): QueryMetrics {
		let executions = this.executions;

		if (timeRange) {
			executions = executions.filter(
				(e) => e.startTime >= timeRange.start && e.startTime <= timeRange.end
			);
		}

		if (executions.length === 0) {
			return {
				totalQueries: 0,
				successRate: 0,
				p50LatencyMs: 0,
				p95LatencyMs: 0,
				p99LatencyMs: 0,
				avgResultCount: 0,
				slowQueryCount: 0,
			};
		}

		const successfulQueries = executions.filter((e) => e.success).length;
		const successRate = (successfulQueries / executions.length) * 100;

		const latencies = executions.map((e) => e.executionTimeMs).sort((a, b) => a - b);
		const p50LatencyMs = this.calculatePercentile(latencies, 50);
		const p95LatencyMs = this.calculatePercentile(latencies, 95);
		const p99LatencyMs = this.calculatePercentile(latencies, 99);

		const totalResults = executions.reduce((sum, e) => sum + e.resultCount, 0);
		const avgResultCount = totalResults / executions.length;

		const slowQueryCount = executions.filter(
			(e) => e.executionTimeMs > DEFAULT_SLOW_THRESHOLD_MS
		).length;

		return {
			totalQueries: executions.length,
			successRate,
			p50LatencyMs,
			p95LatencyMs,
			p99LatencyMs,
			avgResultCount,
			slowQueryCount,
		};
	}

	/**
	 * Get slow queries
	 *
	 * @param threshold - Execution time threshold in ms (default: 1000ms)
	 * @returns Array of slow queries sorted by avg execution time
	 */
	getSlowQueries(threshold: number = DEFAULT_SLOW_THRESHOLD_MS): SlowQuery[] {
		const queryGroups = new Map<string, QueryExecution[]>();

		for (const execution of this.executions) {
			if (execution.executionTimeMs >= threshold) {
				const existing = queryGroups.get(execution.queryHash) || [];
				existing.push(execution);
				queryGroups.set(execution.queryHash, existing);
			}
		}

		const slowQueries: SlowQuery[] = [];

		for (const [_hash, executions] of queryGroups.entries()) {
			const totalTime = executions.reduce((sum, e) => sum + e.executionTimeMs, 0);
			const avgExecutionTimeMs = totalTime / executions.length;

			const latest = executions.reduce((a, b) => (a.endTime > b.endTime ? a : b));

			slowQueries.push({
				query: executions[0].query,
				avgExecutionTimeMs,
				executionCount: executions.length,
				lastExecutedAt: latest.endTime,
			});
		}

		return slowQueries.sort((a, b) => b.avgExecutionTimeMs - a.avgExecutionTimeMs);
	}

	/**
	 * Get complete performance summary
	 *
	 * @returns Performance summary with metrics, slow queries, and top queries
	 */
	getSummary(): PerformanceSummary {
		const metrics = this.getMetrics();
		const slowQueries = this.getSlowQueries();

		const queryCounts = new Map<string, { query: string; count: number }>();

		for (const execution of this.executions) {
			const existing = queryCounts.get(execution.queryHash);
			if (existing) {
				existing.count++;
			} else {
				queryCounts.set(execution.queryHash, {
					query: execution.query,
					count: 1,
				});
			}
		}

		const topQueries = Array.from(queryCounts.values())
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		return {
			metrics,
			slowQueries,
			topQueries,
		};
	}

	/**
	 * Export metrics to file
	 *
	 * Saves current executions to disk for persistence across restarts.
	 */
	exportMetrics(): void {
		const logger = getLogger();

		try {
			const serialized: SerializedQueryExecution[] = this.executions.map((e) => ({
				...e,
				startTime: e.startTime.toISOString(),
				endTime: e.endTime.toISOString(),
			}));

			writeFileSync(this.metricsFilePath, JSON.stringify(serialized, null, 2), 'utf-8');

			logger.info('Query metrics exported', {
				path: this.metricsFilePath,
				executionCount: this.executions.length.toString(),
			});
		} catch (error) {
			logger.error('Failed to export query metrics', {
				path: this.metricsFilePath,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Load metrics from file
	 *
	 * Restores persisted executions from disk on startup.
	 * Silently continues if file does not exist.
	 */
	loadMetrics(): void {
		const logger = getLogger();

		try {
			if (!existsSync(this.metricsFilePath)) {
				logger.debug('No existing metrics file found', { path: this.metricsFilePath });
				return;
			}

			const data = readFileSync(this.metricsFilePath, 'utf-8');
			const serialized: SerializedQueryExecution[] = JSON.parse(data);

			this.executions = serialized.map((e) => ({
				...e,
				startTime: new Date(e.startTime),
				endTime: new Date(e.endTime),
			}));

			logger.info('Query metrics loaded', {
				path: this.metricsFilePath,
				executionCount: this.executions.length.toString(),
			});
		} catch (error) {
			logger.error('Failed to load query metrics', {
				path: this.metricsFilePath,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Calculate percentile from sorted array using linear interpolation.
	 *
	 * @param sortedValues - Array of values sorted ascending
	 * @param percentile - Percentile to calculate (0-100)
	 * @returns Percentile value
	 */
	calculatePercentile(sortedValues: number[], percentile: number): number {
		if (sortedValues.length === 0) return 0;
		if (sortedValues.length === 1) return sortedValues[0];

		const index = (percentile / 100) * (sortedValues.length - 1);
		const lower = Math.floor(index);
		const upper = Math.ceil(index);
		const weight = index - lower;

		return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
	}

	/**
	 * Generate MD5 hash for query deduplication
	 *
	 * @param query - TraceQL query string
	 * @returns MD5 hash (hex)
	 */
	static hashQuery(query: string): string {
		return createHash('md5').update(query).digest('hex');
	}
}

/**
 * Create a new QueryPerformanceService instance.
 *
 * @param options - Service configuration options
 * @returns Configured QueryPerformanceService instance
 */
export function createQueryPerformanceService(
	options: QueryPerformanceServiceOptions = {}
): QueryPerformanceService {
	return new QueryPerformanceService(options);
}
