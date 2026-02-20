/**
 * Centralized tracer factory for server-side OpenTelemetry instrumentation.
 *
 * IMPORTANT: All server-side code MUST use this factory to ensure consistent
 * tracer scope naming. This prevents trace fragmentation in observability tools.
 *
 * @module tracers
 */

import { trace } from '@opentelemetry/api';
import { getOtelConfig } from './config.js';

/**
 * Default tracer scope for all server-side instrumentation.
 */
export const DEFAULT_TRACER_SCOPE = 'sveltekit-server';

/**
 * Default version for tracer instrumentation.
 */
export const DEFAULT_TRACER_VERSION = '1.0.0';

/**
 * Get the standard tracer scope name from config or default.
 */
export function getTracerScope(): string {
	const config = getOtelConfig();
	return config.serviceName || DEFAULT_TRACER_SCOPE;
}

/**
 * Get the tracer version from config or default.
 */
export function getTracerVersion(): string {
	const config = getOtelConfig();
	return config.serviceVersion || DEFAULT_TRACER_VERSION;
}

/**
 * Get the unified server-side tracer.
 *
 * This function ensures all server-side spans use the same tracer scope,
 * preventing fragmentation in distributed tracing tools like Tempo/Grafana.
 *
 * @param name - Optional custom name for the tracer (rarely needed)
 * @returns OpenTelemetry Tracer instance
 *
 * @example
 * ```typescript
 * import { getServerTracer } from '@tummycrypt/tinyland-otel';
 *
 * const tracer = getServerTracer();
 * const span = tracer.startSpan('http.request');
 * ```
 */
export function getServerTracer(name?: string) {
	return trace.getTracer(name || getTracerScope(), getTracerVersion());
}

/**
 * Get the global tracer instance (legacy compatibility).
 *
 * @deprecated Use getServerTracer() instead for better clarity.
 */
export function getGlobalTracer() {
	return getServerTracer();
}
