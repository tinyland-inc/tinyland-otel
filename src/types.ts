/**
 * Type definitions for @tinyland-inc/tinyland-otel
 *
 * @module types
 */

// ============================================================================
// Logger interface (injected by host application)
// ============================================================================

/**
 * Logger interface that the host application must provide.
 * Compatible with most structured logging libraries (pino, winston, etc.)
 */
export interface OtelLogger {
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
	debug(message: string, data?: Record<string, unknown>): void;
}

// ============================================================================
// OTel configuration
// ============================================================================

/**
 * Configuration for the OpenTelemetry instrumentation package.
 * All SvelteKit-specific values ($env, $lib) are replaced by explicit config.
 */
export interface OtelConfig {
	/** Service name for OTel resource attributes (default: 'sveltekit-server') */
	serviceName?: string;
	/** Service version for OTel resource attributes (default: '1.0.0') */
	serviceVersion?: string;
	/** Deployment environment: 'development' | 'production' | 'test' (default: 'development') */
	deploymentEnv?: string;

	/** OTLP endpoint base URL (default: auto-detected from environment) */
	otlpEndpoint?: string;
	/** Trace sampling ratio 0.0-1.0 (default: 1.0 dev, 0.1 prod) */
	samplingRatio?: number;

	/** Whether running inside a container (default: auto-detected) */
	isContainer?: boolean;

	/** Tempo query URL (default: auto-detected) */
	tempoUrl?: string;

	/** Pyroscope server URL (default: auto-detected) */
	pyroscopeUrl?: string;
	/** Enable Pyroscope profiling (default: true in non-test env) */
	pyroscopeEnabled?: boolean;

	/** File logger log directory (default: auto-detected) */
	logDir?: string;

	/** HTTP instrumentation: URL patterns to ignore */
	ignoreIncomingRequestPatterns?: string[];
}

// ============================================================================
// File logger types
// ============================================================================

/**
 * Log levels matching standard severity
 */
export type FileLogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log context
 */
export type LogContext = Record<string, unknown>;

/**
 * Base log entry structure
 */
export interface BaseLogEntry {
	level: FileLogLevel;
	message: string;
	timestamp: number;
	[key: string]: unknown;
}

// ============================================================================
// Tempo types
// ============================================================================

/**
 * Tempo search query parameters
 */
export interface TempoSearchQuery {
	/** Unix timestamp in seconds */
	start?: number;
	/** Unix timestamp in seconds */
	end?: number;
	/** Tag filters (e.g., { "fingerprint.id": "abc123" }) */
	tags?: Record<string, string>;
	/** Max results (default 200, max 200 per Tempo config) */
	limit?: number;
	/** Spans per span set (deprecated, use limit) */
	spss?: number;
}

/**
 * Tempo search response (simplified)
 */
export interface TempoSearchResponse {
	traces: Array<{
		traceID: string;
		rootServiceName: string;
		rootTraceName: string;
		startTimeUnixNano: string;
		durationMs: number;
		spanSet?: {
			spans: Array<{
				spanID: string;
				startTimeUnixNano: string;
				durationNanos: string;
				attributes: Array<{
					key: string;
					value: { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean };
				}>;
			}>;
			matched: number;
		};
	}>;
	metrics: {
		totalBlocks?: number;
		completedJobs?: number;
		totalJobs?: number;
		totalBlockBytes?: string;
	};
}

/**
 * Full OTLP trace response from /api/traces/{traceID}
 */
export interface OTLPTraceResponse {
	batches: Array<{
		scopeSpans: Array<{
			spans: Array<{
				spanId: string;
				traceId: string;
				name: string;
				startTimeUnixNano: string;
				endTimeUnixNano: string;
				attributes: Array<{
					key: string;
					value: {
						stringValue?: string;
						intValue?: string | number;
						doubleValue?: number;
						boolValue?: boolean;
					};
				}>;
			}>;
		}>;
	}>;
}

// ============================================================================
// Observability config types
// ============================================================================

export interface GrafanaConfig {
	url: string;
	apiKey: string;
	timeout: number;
}

export interface LokiConfig {
	url: string;
	timeout: number;
}

export interface PrometheusConfig {
	url: string;
	timeout: number;
}

export interface TempoEndpointConfig {
	url: string;
	otlpEndpoint: string;
	timeout: number;
}

/**
 * Observability stack configuration
 */
export interface ObservabilityStackConfig {
	grafana: GrafanaConfig;
	loki: LokiConfig;
	prometheus: PrometheusConfig;
	tempo: TempoEndpointConfig;
}

/**
 * Health check result for observability services
 */
export interface ObservabilityHealth {
	loki: boolean;
	tempo: boolean;
	grafana: boolean;
	prometheus: boolean;
}
