













export interface OtelLogger {
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
	debug(message: string, data?: Record<string, unknown>): void;
}









export interface OtelConfig {
	
	serviceName?: string;
	
	serviceVersion?: string;
	
	deploymentEnv?: string;

	
	otlpEndpoint?: string;
	
	samplingRatio?: number;

	
	isContainer?: boolean;

	
	tempoUrl?: string;

	
	pyroscopeUrl?: string;
	
	pyroscopeEnabled?: boolean;

	
	logDir?: string;

	
	ignoreIncomingRequestPatterns?: string[];
}








export type FileLogLevel = 'debug' | 'info' | 'warn' | 'error';




export type LogContext = Record<string, unknown>;




export interface BaseLogEntry {
	level: FileLogLevel;
	message: string;
	timestamp: number;
	[key: string]: unknown;
}








export interface TempoSearchQuery {
	
	start?: number;
	
	end?: number;
	
	tags?: Record<string, string>;
	
	limit?: number;
	
	spss?: number;
}




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




export interface ObservabilityStackConfig {
	grafana: GrafanaConfig;
	loki: LokiConfig;
	prometheus: PrometheusConfig;
	tempo: TempoEndpointConfig;
}




export interface ObservabilityHealth {
	loki: boolean;
	tempo: boolean;
	grafana: boolean;
	prometheus: boolean;
}









export interface TempoFingerprintRecord {
	
	traceID: string;
	spanID: string;
	timestamp: string; 
	duration: number; 

	
	fingerprintId: string; 
	fingerprintHash?: string; 
	eventType: string; 

	
	sessionId?: string; 
	userId?: string; 
	userHandle?: string; 
	userRole?: string; 

	
	geoCountry?: string; 
	geoCity?: string; 
	geoLatitude?: number; 
	geoLongitude?: number; 
	geoSource?: string; 

	
	vpnDetected?: boolean; 
	vpnProvider?: string; 
	vpnConfidence?: string; 
	vpnMethod?: string; 

	
	deviceType?: string; 

	
	browserName?: string; 
	browserVersion?: string; 
	browserMajorVersion?: string; 
	osName?: string; 
	osVersion?: string; 
	engineName?: string; 
	engineVersion?: string; 

	
	navigationPathname?: string; 
	navigationHostname?: string; 
	navigationCurrentUrl?: string; 
	navigationReferrer?: string; 
	navigationReferrerHostname?: string; 
	navigationIsExternalReferral?: boolean; 

	
	riskScore?: number; 
	riskTier?: string; 
	riskFactors?: string[]; 

	
	ipHash?: string; 
	ipType?: 'private' | 'public' | 'unknown'; 

	
	consentTimestamp?: string; 
	consentVersion?: string; 
	consentCategoriesEssential?: boolean | string;
	consentCategoriesPreferences?: boolean | string;
	consentCategoriesFunctional?: boolean | string;
	consentCategoriesTracking?: boolean | string;
	consentCategoriesPerformance?: boolean | string;
	consentPreciseLocation?: boolean | string;
	consentAgeVerified?: boolean | string;
	consentOptionalHandle?: string;

	
	preferencesTheme?: string; 
	preferencesDarkMode?: string; 
}








export interface GeoLocation {
	country: string;
	countryCode?: string;
	city: string | null;
	latitude: number | null;
	longitude: number | null;
	timezone?: string | null;
	source: 'parent-span' | 'child-span';
}




export interface TempoTrace {
	traceID: string;
	rootServiceName?: string;
	rootTraceName?: string;
	startTimeUnixNano?: string;
	durationMs?: number;
	spanSet?: {
		spans: TempoSpan[];
		matched: number;
	};
}




export interface TempoSpan {
	spanID: string;
	name?: string;
	startTimeUnixNano: string;
	durationNanos: string;
	attributes: SpanAttribute[];
}




export interface SpanAttribute {
	key: string;
	value: {
		stringValue?: string;
		intValue?: string | number;
		doubleValue?: number;
		boolValue?: boolean;
	};
}
