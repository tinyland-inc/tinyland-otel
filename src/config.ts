/**
 * Global configuration for @tummycrypt/tinyland-otel
 *
 * Provides a singleton configuration store that replaces
 * SvelteKit's $env/dynamic/private and $lib/server imports.
 *
 * Usage:
 * ```typescript
 * import { configureOtel } from '@tummycrypt/tinyland-otel';
 *
 * configureOtel({
 *   config: {
 *     serviceName: 'my-service',
 *     serviceVersion: '1.0.0',
 *     tempoUrl: 'http://tempo:3200',
 *     otlpEndpoint: 'http://tempo:4318',
 *   },
 *   logger: myStructuredLogger,
 * });
 * ```
 *
 * @module config
 */

import type { OtelConfig, OtelLogger } from './types.js';

// ============================================================================
// Default console logger (fallback when no logger is configured)
// ============================================================================

const consoleLogger: OtelLogger = {
	info(message: string, data?: Record<string, unknown>) {
		console.log(`[otel:info] ${message}`, data ?? '');
	},
	warn(message: string, data?: Record<string, unknown>) {
		console.warn(`[otel:warn] ${message}`, data ?? '');
	},
	error(message: string, data?: Record<string, unknown>) {
		console.error(`[otel:error] ${message}`, data ?? '');
	},
	debug(message: string, data?: Record<string, unknown>) {
		if (process.env.NODE_ENV === 'development') {
			console.debug(`[otel:debug] ${message}`, data ?? '');
		}
	},
};

// ============================================================================
// Global state
// ============================================================================

let _config: OtelConfig = {};
let _logger: OtelLogger = consoleLogger;

// ============================================================================
// Public API
// ============================================================================

/**
 * Configure the OTel package with endpoints and a logger.
 * Call this once during application startup before using any tracing functions.
 */
export function configureOtel(options: {
	config?: OtelConfig;
	logger?: OtelLogger;
}): void {
	if (options.config) {
		_config = { ..._config, ...options.config };
	}
	if (options.logger) {
		_logger = options.logger;
	}
}

/**
 * Get the current OTel configuration.
 * @internal Used by OTel modules to read injected config.
 */
export function getOtelConfig(): OtelConfig {
	return _config;
}

/**
 * Get the current logger instance.
 * @internal Used by OTel modules for structured logging.
 */
export function getLogger(): OtelLogger {
	return _logger;
}

/**
 * Reset configuration to defaults (for testing).
 * @internal
 */
export function resetOtelConfig(): void {
	_config = {};
	_logger = consoleLogger;
}

/**
 * Resolve a config value with fallback to environment variable and default.
 * @internal
 */
export function resolveConfigValue(
	configValue: string | undefined,
	envVar: string | undefined,
	defaultValue: string
): string {
	return configValue ?? envVar ?? defaultValue;
}
