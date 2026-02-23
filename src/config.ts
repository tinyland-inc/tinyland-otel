























import type { OtelConfig, OtelLogger } from './types.js';





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





let _config: OtelConfig = {};
let _logger: OtelLogger = consoleLogger;









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





export function getOtelConfig(): OtelConfig {
	return _config;
}





export function getLogger(): OtelLogger {
	return _logger;
}





export function resetOtelConfig(): void {
	_config = {};
	_logger = consoleLogger;
}





export function resolveConfigValue(
	configValue: string | undefined,
	envVar: string | undefined,
	defaultValue: string
): string {
	return configValue ?? envVar ?? defaultValue;
}
