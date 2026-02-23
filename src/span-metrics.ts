




















export interface RedMetricsConfig {
	
	serviceName: string;
	
	interval?: string;
	
	httpMethod?: string;
	
	httpRoute?: string;
	
	environment?: string;
}




export interface SloThresholds {
	
	availability: number;
	
	p95LatencyMs: number;
	
	p99LatencyMs: number;
	
	maxErrorRate: number;
}




export const DEFAULT_SLO: SloThresholds = {
	availability: 0.999,
	p95LatencyMs: 500,
	p99LatencyMs: 1000,
	maxErrorRate: 0.001
};




export function buildRateQuery(config: RedMetricsConfig): string {
	const { serviceName, interval = '5m', httpMethod, httpRoute, environment } = config;

	const labels: string[] = [`service_name="${serviceName}"`];
	if (httpMethod) labels.push(`http_method="${httpMethod}"`);
	if (httpRoute) labels.push(`http_route="${httpRoute}"`);
	if (environment) labels.push(`deployment_environment="${environment}"`);

	return `rate(tempo_spanmetrics_calls_total{${labels.join(',')}}[${interval}])`;
}




export function buildErrorRateQuery(config: RedMetricsConfig): string {
	const { serviceName, interval = '5m', httpMethod, httpRoute, environment } = config;

	const labels: string[] = [`service_name="${serviceName}"`];
	if (httpMethod) labels.push(`http_method="${httpMethod}"`);
	if (httpRoute) labels.push(`http_route="${httpRoute}"`);
	if (environment) labels.push(`deployment_environment="${environment}"`);

	const baseLabels = labels.join(',');
	const errorLabels = [...labels, 'span_status_code="ERROR"'].join(',');

	return `(
		rate(tempo_spanmetrics_calls_total{${errorLabels}}[${interval}])
		/
		rate(tempo_spanmetrics_calls_total{${baseLabels}}[${interval}])
	)`;
}




export function buildLatencyQuery(config: RedMetricsConfig, percentile: number): string {
	const { serviceName, interval = '5m', httpMethod, httpRoute, environment } = config;

	const labels: string[] = [`service_name="${serviceName}"`];
	if (httpMethod) labels.push(`http_method="${httpMethod}"`);
	if (httpRoute) labels.push(`http_route="${httpRoute}"`);
	if (environment) labels.push(`deployment_environment="${environment}"`);

	const baseLabels = labels.join(',');

	return `histogram_quantile(
		${percentile},
		rate(tempo_spanmetrics_duration_milliseconds_bucket{${baseLabels}}[${interval}])
	)`;
}




export function buildAvgLatencyQuery(config: RedMetricsConfig): string {
	const { serviceName, interval = '5m', httpMethod, httpRoute, environment } = config;

	const labels: string[] = [`service_name="${serviceName}"`];
	if (httpMethod) labels.push(`http_method="${httpMethod}"`);
	if (httpRoute) labels.push(`http_route="${httpRoute}"`);
	if (environment) labels.push(`deployment_environment="${environment}"`);

	const baseLabels = labels.join(',');

	return `(
		rate(tempo_spanmetrics_duration_milliseconds_sum{${baseLabels}}[${interval}])
		/
		rate(tempo_spanmetrics_duration_milliseconds_count{${baseLabels}}[${interval}])
	)`;
}




export function buildAvailabilityQuery(config: RedMetricsConfig): string {
	const errorRateQuery = buildErrorRateQuery(config);
	return `1 - (${errorRateQuery})`;
}




export function buildErrorBudgetQuery(config: RedMetricsConfig, slo: SloThresholds): string {
	const errorRateQuery = buildErrorRateQuery(config);
	const errorBudget = 1 - slo.availability;
	return `(${errorRateQuery}) / ${errorBudget}`;
}




export function buildErrorRateAlert(
	config: RedMetricsConfig,
	threshold: number,
	_duration: string = '5m'
): string {
	const errorRateQuery = buildErrorRateQuery(config);
	return `(${errorRateQuery}) > ${threshold}`;
}




export function buildLatencyAlert(
	config: RedMetricsConfig,
	percentile: number,
	thresholdMs: number,
	_duration: string = '5m'
): string {
	const latencyQuery = buildLatencyQuery(config, percentile);
	return `(${latencyQuery}) > ${thresholdMs}`;
}




export function buildRedMetricsQueries(config: RedMetricsConfig) {
	return {
		rate: buildRateQuery(config),
		rateByMethod: buildRateQuery({ ...config, httpMethod: undefined }) + ' by (http_method)',
		rateByRoute: buildRateQuery({ ...config, httpRoute: undefined }) + ' by (http_route)',
		errorRate: buildErrorRateQuery(config),
		errorRateByMethod:
			buildErrorRateQuery({ ...config, httpMethod: undefined }) + ' by (http_method)',
		errorRateByRoute:
			buildErrorRateQuery({ ...config, httpRoute: undefined }) + ' by (http_route)',
		errorCount: `rate(tempo_spanmetrics_calls_total{service_name="${config.serviceName}",span_status_code="ERROR"}[${config.interval || '5m'}])`,
		avgLatency: buildAvgLatencyQuery(config),
		p50: buildLatencyQuery(config, 0.5),
		p95: buildLatencyQuery(config, 0.95),
		p99: buildLatencyQuery(config, 0.99),
		p999: buildLatencyQuery(config, 0.999),
		availability: buildAvailabilityQuery(config),
		uptime: `avg_over_time((${buildAvailabilityQuery(config)})[24h])`
	};
}




export function buildSloAlerts(config: RedMetricsConfig, slo: SloThresholds = DEFAULT_SLO) {
	return {
		errorRateHigh: buildErrorRateAlert(config, slo.maxErrorRate, '5m'),
		errorRateCritical: buildErrorRateAlert(config, slo.maxErrorRate * 2, '1m'),
		p95LatencyHigh: buildLatencyAlert(config, 0.95, slo.p95LatencyMs, '5m'),
		p99LatencyHigh: buildLatencyAlert(config, 0.99, slo.p99LatencyMs, '5m'),
		p99LatencyCritical: buildLatencyAlert(config, 0.99, slo.p99LatencyMs * 2, '1m'),
		availabilityLow: `(${buildAvailabilityQuery(config)}) < ${slo.availability}`,
		errorBudgetConsuming: `(${buildErrorBudgetQuery(config, slo)}) > 0.5`,
		errorBudgetExhausted: `(${buildErrorBudgetQuery(config, slo)}) > 1.0`
	};
}




export function formatPercentile(percentile: number): string {
	if (percentile === 0.5) return 'P50';
	if (percentile === 0.95) return 'P95';
	if (percentile === 0.99) return 'P99';
	if (percentile === 0.999) return 'P999';
	return `P${(percentile * 100).toFixed(1)}`;
}




export function formatErrorRate(errorRate: number): string {
	return `${(errorRate * 100).toFixed(2)}%`;
}




export function formatLatency(latencyMs: number): string {
	if (latencyMs < 1) {
		return `${(latencyMs * 1000).toFixed(2)}us`;
	}
	if (latencyMs < 1000) {
		return `${latencyMs.toFixed(2)}ms`;
	}
	return `${(latencyMs / 1000).toFixed(2)}s`;
}




export function violatesSlo(
	metricType: 'errorRate' | 'p95' | 'p99' | 'availability',
	value: number,
	slo: SloThresholds = DEFAULT_SLO
): boolean {
	switch (metricType) {
		case 'errorRate':
			return value > slo.maxErrorRate;
		case 'p95':
			return value > slo.p95LatencyMs;
		case 'p99':
			return value > slo.p99LatencyMs;
		case 'availability':
			return value < slo.availability;
		default:
			return false;
	}
}
