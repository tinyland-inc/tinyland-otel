








import { trace } from '@opentelemetry/api';
import { getOtelConfig } from './config.js';




export const DEFAULT_TRACER_SCOPE = 'sveltekit-server';




export const DEFAULT_TRACER_VERSION = '1.0.0';




export function getTracerScope(): string {
	const config = getOtelConfig();
	return config.serviceName || DEFAULT_TRACER_SCOPE;
}




export function getTracerVersion(): string {
	const config = getOtelConfig();
	return config.serviceVersion || DEFAULT_TRACER_VERSION;
}


















export function getServerTracer(name?: string) {
	return trace.getTracer(name || getTracerScope(), getTracerVersion());
}






export function getGlobalTracer() {
	return getServerTracer();
}
