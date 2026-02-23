















import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { getLogger } from '../config.js';




const DEFAULT_SLOW_THRESHOLD_MS = 1000;




export interface QueryExecution {
	
	queryHash: string;
	
	query: string;
	
	executionTimeMs: number;
	
	resultCount: number;
	
	startTime: Date;
	
	endTime: Date;
	
	success: boolean;
	
	errorMessage?: string;
}




export interface QueryMetrics {
	
	totalQueries: number;
	
	successRate: number;
	
	p50LatencyMs: number;
	
	p95LatencyMs: number;
	
	p99LatencyMs: number;
	
	avgResultCount: number;
	
	slowQueryCount: number;
}




export interface SlowQuery {
	
	query: string;
	
	avgExecutionTimeMs: number;
	
	executionCount: number;
	
	lastExecutedAt: Date;
}




export interface PerformanceSummary {
	
	metrics: QueryMetrics;
	
	slowQueries: SlowQuery[];
	
	topQueries: Array<{ query: string; count: number }>;
}




interface SerializedQueryExecution extends Omit<QueryExecution, 'startTime' | 'endTime'> {
	startTime: string;
	endTime: string;
}




export interface QueryPerformanceServiceOptions {
	
	maxExecutions?: number;
	
	metricsFilePath?: string;
	
	loadOnCreate?: boolean;
}























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

	




	recordQueryExecution(execution: QueryExecution): void {
		const logger = getLogger();
		this.executions.push(execution);

		
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

	


	getExecutions(): ReadonlyArray<QueryExecution> {
		return this.executions;
	}

	





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

	






	calculatePercentile(sortedValues: number[], percentile: number): number {
		if (sortedValues.length === 0) return 0;
		if (sortedValues.length === 1) return sortedValues[0];

		const index = (percentile / 100) * (sortedValues.length - 1);
		const lower = Math.floor(index);
		const upper = Math.ceil(index);
		const weight = index - lower;

		return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
	}

	





	static hashQuery(query: string): string {
		return createHash('md5').update(query).digest('hex');
	}
}







export function createQueryPerformanceService(
	options: QueryPerformanceServiceOptions = {}
): QueryPerformanceService {
	return new QueryPerformanceService(options);
}
