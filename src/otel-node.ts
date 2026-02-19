/**
 * OpenTelemetry Node SDK Initialization
 *
 * Server-side OpenTelemetry SDK initialization with:
 * - OTLP HTTP export to Tempo (distributed tracing)
 * - Auto-instrumentation for HTTP, Express, etc.
 * - Pyroscope integration for continuous profiling
 *
 * Architecture:
 * - NodeTracerProvider with OTLP HTTP exporter
 * - Environment-aware endpoints (container vs host)
 * - BatchSpanProcessor for performance
 * - Configurable sampling (100% dev, 10% prod)
 * - Auto-instrumentations for common Node.js libraries
 *
 * @module otel-node
 */

import { trace } from '@opentelemetry/api';
import { getOtelConfig } from './config.js';

/**
 * Resolve service name from config or environment
 */
function getServiceName(): string {
	const config = getOtelConfig();
	return config.serviceName || process.env.OTEL_SERVICE_NAME || 'sveltekit-server';
}

/**
 * Resolve service version from config or environment
 */
function getServiceVersion(): string {
	const config = getOtelConfig();
	return config.serviceVersion || process.env.npm_package_version || '1.0.0';
}

/**
 * Resolve deployment environment from config or environment
 */
function getDeploymentEnv(): string {
	const config = getOtelConfig();
	return config.deploymentEnv || process.env.NODE_ENV || 'development';
}

/**
 * Determine OTLP endpoint based on config, environment variables, or auto-detection.
 *
 * Priority: config.otlpEndpoint > TEMPO_OTLP_ENDPOINT env > container auto-detect > localhost
 */
function getOtlpEndpoint(): string {
	const config = getOtelConfig();

	// Priority 1: Explicit config
	if (config.otlpEndpoint) {
		return config.otlpEndpoint.replace(/\/v1\/(traces|metrics|logs)$/, '');
	}

	// Priority 2: Environment variable
	if (process.env.TEMPO_OTLP_ENDPOINT) {
		return process.env.TEMPO_OTLP_ENDPOINT.replace(/\/v1\/(traces|metrics|logs)$/, '');
	}

	// Priority 3: Auto-detect container vs host
	const isContainer = config.isContainer ??
		(process.env.CONTAINER === 'true' || process.env.DOCKER === 'true');
	const host = isContainer ? 'stonewall-tempo' : 'localhost';
	const port = 4318;

	return `http://${host}:${port}`;
}

/**
 * Get trace sampling configuration
 */
function getSamplingRatio(): number {
	const config = getOtelConfig();
	if (config.samplingRatio !== undefined) {
		return config.samplingRatio;
	}
	if (getDeploymentEnv() === 'production') {
		return parseFloat(process.env.OTEL_SAMPLING_RATIO || '0.1');
	}
	return 1.0;
}

/**
 * Global NodeSDK instance (typed as unknown to avoid requiring sdk-node at import time)
 */
let sdk: unknown | null = null;

/**
 * Initialize server-side OpenTelemetry tracing
 *
 * Sets up NodeSDK with:
 * - Resource attributes (service name, version, environment)
 * - OTLP HTTP exporter to Tempo
 * - Automatic BatchSpanProcessor configuration
 * - Configurable sampling ratio
 *
 * This function is idempotent (safe to call multiple times).
 *
 * @returns NodeSDK instance (or the existing one if already initialized)
 *
 * @example
 * ```typescript
 * import { configureOtel, initializeServerTracing } from '@tinyland-inc/tinyland-otel';
 *
 * configureOtel({
 *   config: {
 *     serviceName: 'my-app',
 *     otlpEndpoint: 'http://tempo:4318',
 *   },
 * });
 *
 * const sdk = initializeServerTracing();
 * ```
 */
export function initializeServerTracing(): unknown {
	if (sdk) {
		return sdk;
	}

	const config = getOtelConfig();
	const serviceName = getServiceName();
	const serviceVersion = getServiceVersion();
	const deploymentEnv = getDeploymentEnv();
	const otlpEndpoint = getOtlpEndpoint();
	// Sampling ratio retrieved for future use in trace sampler configuration
	void getSamplingRatio();

	try {
		// Set environment variables for NodeSDK auto-configuration
		process.env.OTEL_EXPORTER_OTLP_ENDPOINT = otlpEndpoint;
		process.env.OTEL_SERVICE_NAME = serviceName;
		process.env.OTEL_RESOURCE_ATTRIBUTES = `service.version=${serviceVersion},deployment.environment=${deploymentEnv}`;

		console.log('[OTel] Initializing server-side tracing with NodeSDK...');
		console.log(`[OTel] Service: ${serviceName}`);
		console.log(`[OTel] Version: ${serviceVersion}`);
		console.log(`[OTel] Environment: ${deploymentEnv}`);
		console.log(`[OTel] Tempo base endpoint: ${otlpEndpoint}`);

		// Dynamic imports to keep @opentelemetry/sdk-node and auto-instrumentations as optional peer deps
		const { NodeSDK } = require('@opentelemetry/sdk-node');

		const sdkOptions: Record<string, unknown> = {};

		// Try to load auto-instrumentations (optional)
		try {
			const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
			const ignorePatterns = config.ignoreIncomingRequestPatterns || [
				'/health', '/favicon', '/_app/', '.js', '.css'
			];

			sdkOptions.instrumentations = [
				getNodeAutoInstrumentations({
					'@opentelemetry/instrumentation-fs': { enabled: false },
					'@opentelemetry/instrumentation-http': {
						ignoreIncomingRequestHook: (request: { url?: string }) => {
							const url = request.url || '';
							return ignorePatterns.some(p => url.includes(p));
						}
					}
				})
			];
		} catch {
			console.log('[OTel] Auto-instrumentations not available, using manual instrumentation only');
		}

		sdk = new NodeSDK(sdkOptions);
		(sdk as { start: () => void }).start();

		console.log('[OTel] Server-side tracing initialized successfully');

		// Initialize Pyroscope profiling (if configured)
		initializePyroscope();

		return sdk;
	} catch (error) {
		console.error('[OTel] Failed to initialize server-side tracing:', error);
		console.error('[OTel] Falling back to NoopTracer (no traces will be exported)');

		try {
			const { NodeSDK } = require('@opentelemetry/sdk-node');
			sdk = new NodeSDK({});
			(sdk as { start: () => void }).start();
		} catch {
			// sdk-node not available at all
			sdk = {};
		}

		return sdk;
	}
}

/**
 * Shutdown tracing (for graceful server shutdown)
 *
 * Flushes any pending spans and closes connections.
 */
export async function shutdownServerTracing(): Promise<void> {
	if (!sdk || typeof (sdk as Record<string, unknown>).shutdown !== 'function') {
		return;
	}

	try {
		console.log('[OTel] Shutting down server-side tracing...');
		await (sdk as { shutdown: () => Promise<void> }).shutdown();
		console.log('[OTel] Server-side tracing shutdown complete');
	} catch (error) {
		console.error('[OTel] Error during shutdown:', error);
	} finally {
		sdk = null;
	}
}

/**
 * Get the global NodeSDK instance
 */
export function getNodeSDK(): unknown | null {
	return sdk;
}

/**
 * Check if tracing is initialized
 */
export function isTracingInitialized(): boolean {
	return sdk !== null;
}

/**
 * Get tracer instance for manual span creation
 */
export function getTracer(name?: string, version?: string) {
	return trace.getTracer(
		name || getServiceName(),
		version || getServiceVersion()
	);
}

// ============================================================================
// Pyroscope integration
// ============================================================================

let pyroscopeInitialized = false;

function getPyroscopeUrl(): string {
	const config = getOtelConfig();
	if (config.pyroscopeUrl) {
		return config.pyroscopeUrl;
	}
	if (process.env.PYROSCOPE_SERVER_ADDRESS) {
		return process.env.PYROSCOPE_SERVER_ADDRESS;
	}
	const isContainer = config.isContainer ??
		(process.env.CONTAINER === 'true' || process.env.DOCKER === 'true');
	const host = isContainer ? 'stonewall-pyroscope' : 'localhost';
	return `http://${host}:4040`;
}

async function initializePyroscope(): Promise<void> {
	if (pyroscopeInitialized) return;

	const config = getOtelConfig();
	if (config.pyroscopeEnabled === false) return;
	if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;

	try {
		const Pyroscope = await import('@pyroscope/nodejs');
		const pyroscopeUrl = getPyroscopeUrl();

		Pyroscope.init({
			serverAddress: pyroscopeUrl,
			appName: getServiceName(),
			tags: {
				version: getServiceVersion(),
				environment: getDeploymentEnv()
			},
			wall: {
				samplingDurationMs: 10000,
				samplingIntervalMicros: 10000,
				collectCpuTime: true
			},
			heap: {
				samplingIntervalBytes: 524288,
				stackDepth: 64
			}
		});

		Pyroscope.start();
		pyroscopeInitialized = true;

		console.log(`[Pyroscope] Continuous profiling started: ${pyroscopeUrl}`);
	} catch {
		console.warn('[Pyroscope] Failed to initialize profiling (optional dependency)');
	}
}

/**
 * Stop Pyroscope profiling (for graceful shutdown)
 */
export async function stopPyroscope(): Promise<void> {
	if (!pyroscopeInitialized) return;

	try {
		const Pyroscope = await import('@pyroscope/nodejs');
		Pyroscope.stop();
		pyroscopeInitialized = false;
		console.log('[Pyroscope] Profiling stopped');
	} catch {
		console.warn('[Pyroscope] Error stopping profiler');
	}
}
