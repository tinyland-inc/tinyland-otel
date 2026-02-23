

















import { trace } from '@opentelemetry/api';
import { getOtelConfig } from './config.js';




function getServiceName(): string {
	const config = getOtelConfig();
	return config.serviceName || process.env.OTEL_SERVICE_NAME || 'sveltekit-server';
}




function getServiceVersion(): string {
	const config = getOtelConfig();
	return config.serviceVersion || process.env.npm_package_version || '1.0.0';
}




function getDeploymentEnv(): string {
	const config = getOtelConfig();
	return config.deploymentEnv || process.env.NODE_ENV || 'development';
}






function getOtlpEndpoint(): string {
	const config = getOtelConfig();

	
	if (config.otlpEndpoint) {
		return config.otlpEndpoint.replace(/\/v1\/(traces|metrics|logs)$/, '');
	}

	
	if (process.env.TEMPO_OTLP_ENDPOINT) {
		return process.env.TEMPO_OTLP_ENDPOINT.replace(/\/v1\/(traces|metrics|logs)$/, '');
	}

	
	const isContainer = config.isContainer ??
		(process.env.CONTAINER === 'true' || process.env.DOCKER === 'true');
	const host = isContainer ? 'stonewall-tempo' : 'localhost';
	const port = 4318;

	return `http://${host}:${port}`;
}




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




let sdk: unknown | null = null;




























export function initializeServerTracing(): unknown {
	if (sdk) {
		return sdk;
	}

	const config = getOtelConfig();
	const serviceName = getServiceName();
	const serviceVersion = getServiceVersion();
	const deploymentEnv = getDeploymentEnv();
	const otlpEndpoint = getOtlpEndpoint();
	
	void getSamplingRatio();

	try {
		
		process.env.OTEL_EXPORTER_OTLP_ENDPOINT = otlpEndpoint;
		process.env.OTEL_SERVICE_NAME = serviceName;
		process.env.OTEL_RESOURCE_ATTRIBUTES = `service.version=${serviceVersion},deployment.environment=${deploymentEnv}`;

		console.log('[OTel] Initializing server-side tracing with NodeSDK...');
		console.log(`[OTel] Service: ${serviceName}`);
		console.log(`[OTel] Version: ${serviceVersion}`);
		console.log(`[OTel] Environment: ${deploymentEnv}`);
		console.log(`[OTel] Tempo base endpoint: ${otlpEndpoint}`);

		
		const { NodeSDK } = require('@opentelemetry/sdk-node');

		const sdkOptions: Record<string, unknown> = {};

		
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
			
			sdk = {};
		}

		return sdk;
	}
}






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




export function getNodeSDK(): unknown | null {
	return sdk;
}




export function isTracingInitialized(): boolean {
	return sdk !== null;
}




export function getTracer(name?: string, version?: string) {
	return trace.getTracer(
		name || getServiceName(),
		version || getServiceVersion()
	);
}





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
