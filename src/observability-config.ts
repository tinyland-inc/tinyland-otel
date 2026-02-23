









import type {
	ObservabilityStackConfig,
	ObservabilityHealth,
	GrafanaConfig,
	LokiConfig,
	PrometheusConfig,
	TempoEndpointConfig
} from './types.js';





export function buildObservabilityConfig(overrides?: Partial<ObservabilityStackConfig>): ObservabilityStackConfig {
	const isDev = process.env.NODE_ENV === 'development';

	const config: ObservabilityStackConfig = {
		grafana: {
			url: process.env.GRAFANA_URL || (isDev ? 'http://stonewall-grafana:3000' : 'http://localhost:3000'),
			apiKey: process.env.GRAFANA_API_KEY || '',
			timeout: 10000,
			...overrides?.grafana,
		},
		loki: {
			url: process.env.LOKI_URL || (isDev ? 'http://stonewall-loki:3100' : 'http://localhost:3100'),
			timeout: 5000,
			...overrides?.loki,
		},
		prometheus: {
			url: process.env.PROMETHEUS_URL || (isDev ? 'http://stonewall-prometheus:9090' : 'http://localhost:9090'),
			timeout: 5000,
			...overrides?.prometheus,
		},
		tempo: {
			url: process.env.TEMPO_URL || (isDev ? 'http://stonewall-tempo:3200' : 'http://localhost:3200'),
			otlpEndpoint: process.env.TEMPO_OTLP_ENDPOINT || (isDev ? 'http://stonewall-tempo:4318' : 'http://localhost:4318'),
			timeout: 10000,
			...overrides?.tempo,
		},
	};

	return config;
}





export function getObservabilityConfig(overrides?: Partial<ObservabilityStackConfig>) {
	const config = buildObservabilityConfig(overrides);
	return {
		grafanaUrl: config.grafana.url,
		lokiUrl: config.loki.url,
		prometheusUrl: config.prometheus.url,
		tempoUrl: config.tempo.url,
		auth: {
			grafana: config.grafana.apiKey ? { token: config.grafana.apiKey } : undefined,
			loki: process.env.LOKI_USERNAME && process.env.LOKI_PASSWORD ? {
				username: process.env.LOKI_USERNAME,
				password: process.env.LOKI_PASSWORD
			} : undefined,
			prometheus: process.env.PROMETHEUS_USERNAME && process.env.PROMETHEUS_PASSWORD ? {
				username: process.env.PROMETHEUS_USERNAME,
				password: process.env.PROMETHEUS_PASSWORD
			} : undefined
		}
	};
}




export async function checkObservabilityHealth(
	overrides?: Partial<ObservabilityStackConfig>
): Promise<ObservabilityHealth> {
	const config = buildObservabilityConfig(overrides);

	const results: ObservabilityHealth = {
		loki: false,
		tempo: false,
		grafana: false,
		prometheus: false
	};

	await Promise.allSettled([
		fetch(`${config.loki.url}/ready`, { signal: AbortSignal.timeout(config.loki.timeout) })
			.then(res => { results.loki = res.ok; })
			.catch(() => { results.loki = false; }),

		fetch(`${config.tempo.url}/ready`, { signal: AbortSignal.timeout(config.tempo.timeout) })
			.then(res => { results.tempo = res.ok; })
			.catch(() => { results.tempo = false; }),

		fetch(`${config.grafana.url}/api/health`, { signal: AbortSignal.timeout(config.grafana.timeout) })
			.then(res => { results.grafana = res.ok; })
			.catch(() => { results.grafana = false; }),

		fetch(`${config.prometheus.url}/-/ready`, { signal: AbortSignal.timeout(config.prometheus.timeout) })
			.then(res => { results.prometheus = res.ok; })
			.catch(() => { results.prometheus = false; })
	]);

	return results;
}

export type { GrafanaConfig, LokiConfig, PrometheusConfig, TempoEndpointConfig };
