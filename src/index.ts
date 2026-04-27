



































export { configureOtel, getOtelConfig, getLogger, resetOtelConfig } from './config.js';


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
	TempoFingerprintRecord,
	GeoLocation,
	TempoTrace,
	TempoSpan,
	SpanAttribute,
} from './types.js';


export {
	initializeServerTracing,
	shutdownServerTracing,
	getNodeSDK,
	isTracingInitialized,
	getTracer,
	stopPyroscope,
} from './otel-node.js';


export {
	DEFAULT_TRACER_SCOPE,
	DEFAULT_TRACER_VERSION,
	getTracerScope,
	getTracerVersion,
	getServerTracer,
	getGlobalTracer,
} from './tracers.js';


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

export type {
	TraceQLSpan,
	TraceQLSpanSet,
	TraceQLTrace,
	TraceQLResult,
	BatchQueryItemResult,
	BatchQueryResult,
} from './traceql-query.js';
export {
	queryTraceQL,
	queryTracesByFingerprint,
	queryTracesBySession,
	queryTracesByStatusCode,
	queryTraceQLBatch,
} from './traceql-query.js';


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


export {
	buildObservabilityConfig,
	getObservabilityConfig,
	checkObservabilityHealth,
} from './observability-config.js';


export type { TempoQueryServiceOptions } from './services/tempo-query.js';
export { TempoQueryService, createTempoQueryService } from './services/tempo-query.js';

export type { REDMetrics, TempoREDMetricsServiceOptions } from './services/tempo-red-metrics.js';
export {
	TempoREDMetricsService,
	createTempoREDMetricsService,
} from './services/tempo-red-metrics.js';

export type {
	QueryExecution,
	QueryMetrics,
	SlowQuery,
	PerformanceSummary,
	QueryPerformanceServiceOptions,
} from './services/query-performance.js';
export {
	QueryPerformanceService,
	createQueryPerformanceService,
} from './services/query-performance.js';


export type { SavedQuery, SavedQueriesOptions } from './persistence/saved-queries.js';
export {
	loadSavedQueries,
	saveQuery,
	deleteQuery,
	trackQueryUsage,
	getQueriesByCategory,
	getQueriesByUser,
	updateQuery,
} from './persistence/saved-queries.js';
