/**
 * @tinyland-inc/tinyland-otel
 *
 * OpenTelemetry instrumentation layer for the Tinyland.dev platform.
 * Provides tracer factory, span helpers, TraceQL query builder,
 * RED metrics generators, observability stack config, and file-based logging.
 *
 * Usage:
 * ```typescript
 * import { configureOtel, initializeServerTracing, getServerTracer, createSpan } from '@tinyland-inc/tinyland-otel';
 *
 * // Initialize once at startup
 * configureOtel({
 *   config: {
 *     serviceName: 'my-service',
 *     serviceVersion: '1.0.0',
 *     otlpEndpoint: 'http://tempo:4318',
 *   },
 *   logger: myStructuredLogger,
 * });
 *
 * // Start the SDK
 * initializeServerTracing();
 *
 * // Create spans
 * const tracer = getServerTracer();
 * await createSpan('my-operation', async (span) => {
 *   span.setAttribute('key', 'value');
 *   return doWork();
 * });
 * ```
 *
 * @module @tinyland-inc/tinyland-otel
 */

// Configuration
export { configureOtel, getOtelConfig, getLogger, resetOtelConfig } from './config.js';

// Types
export type {
	OtelConfig,
	OtelLogger,
	FileLogLevel,
	LogContext,
	BaseLogEntry,
	TempoSearchQuery,
	TempoSearchResponse,
	OTLPTraceResponse,
	GrafanaConfig,
	LokiConfig,
	PrometheusConfig,
	TempoEndpointConfig,
	ObservabilityStackConfig,
	ObservabilityHealth,
} from './types.js';

// OTel Node SDK initialization
export {
	initializeServerTracing,
	shutdownServerTracing,
	getNodeSDK,
	isTracingInitialized,
	getTracer,
	stopPyroscope,
} from './otel-node.js';

// Tracer factory
export {
	DEFAULT_TRACER_SCOPE,
	DEFAULT_TRACER_VERSION,
	getTracerScope,
	getTracerVersion,
	getServerTracer,
	getGlobalTracer,
} from './tracers.js';

// Instrumentation helpers
export {
	getTracer as getInstrumentationTracer,
	initializeTracing,
	createSpan,
	createSyncSpan,
	getActiveSpan,
	withContext,
	trace,
	context,
	SpanStatusCode,
	SpanKind,
} from './instrumentation.js';
export type { Span, Tracer } from './instrumentation.js';

// RED Metrics (PromQL query builders)
export type { RedMetricsConfig, SloThresholds } from './span-metrics.js';
export {
	DEFAULT_SLO,
	buildRateQuery,
	buildErrorRateQuery,
	buildLatencyQuery,
	buildAvgLatencyQuery,
	buildAvailabilityQuery,
	buildErrorBudgetQuery,
	buildErrorRateAlert,
	buildLatencyAlert,
	buildRedMetricsQueries,
	buildSloAlerts,
	formatPercentile,
	formatErrorRate,
	formatLatency,
	violatesSlo,
} from './span-metrics.js';

// TraceQL query builder
export type {
	TraceQLOperator,
	RiskTier,
	A11ySeverity,
	TRPCType,
	DeviceType as TraceQLDeviceType,
	GeoIPMethod,
	VPNConfidence,
	FingerprintEventType,
} from './traceql.js';
export { TraceQL } from './traceql.js';

// TraceQL templates
export type { TemplateVariable, TraceQLTemplate } from './traceql-templates.js';
export {
	TRACEQL_TEMPLATES,
	TEMPLATE_CATEGORIES,
	renderTemplate,
	getTemplatesByCategory,
	getTemplateById,
	getTemplateCatalog,
	validateTemplateVariables,
} from './traceql-templates.js';

// File-based logger
export {
	writeLog,
	fileLogger,
	logPageView,
	logA11yViolation,
	logMetrics,
	logThemeState,
	logHeartbeat,
	logDiscordAccess,
} from './fileLogger.js';

// Observability stack config
export {
	buildObservabilityConfig,
	getObservabilityConfig,
	checkObservabilityHealth,
} from './observability-config.js';
