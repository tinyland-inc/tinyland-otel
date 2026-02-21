/**
 * Tests for configuration injection and defaults
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
	configureOtel,
	getOtelConfig,
	getLogger,
	resetOtelConfig,
} from '../src/config.js';
import type { OtelConfig, OtelLogger } from '../src/types.js';

describe('Configuration', () => {
	beforeEach(() => {
		resetOtelConfig();
	});

	describe('configureOtel', () => {
		it('should accept and store config values', () => {
			const config: OtelConfig = {
				serviceName: 'test-service',
				serviceVersion: '1.2.3',
				deploymentEnv: 'test',
				otlpEndpoint: 'http://tempo:4318',
				tempoUrl: 'http://tempo:3200',
				samplingRatio: 0.5,
			};

			configureOtel({ config });

			const stored = getOtelConfig();
			expect(stored.serviceName).toBe('test-service');
			expect(stored.serviceVersion).toBe('1.2.3');
			expect(stored.deploymentEnv).toBe('test');
			expect(stored.otlpEndpoint).toBe('http://tempo:4318');
			expect(stored.tempoUrl).toBe('http://tempo:3200');
			expect(stored.samplingRatio).toBe(0.5);
		});

		it('should merge config values incrementally', () => {
			configureOtel({ config: { serviceName: 'svc-a' } });
			configureOtel({ config: { serviceVersion: '2.0.0' } });

			const stored = getOtelConfig();
			expect(stored.serviceName).toBe('svc-a');
			expect(stored.serviceVersion).toBe('2.0.0');
		});

		it('should accept a custom logger', () => {
			const customLogger: OtelLogger = {
				info: () => {},
				warn: () => {},
				error: () => {},
				debug: () => {},
			};

			configureOtel({ logger: customLogger });

			const logger = getLogger();
			expect(logger).toBe(customLogger);
		});

		it('should accept both config and logger at once', () => {
			const customLogger: OtelLogger = {
				info: () => {},
				warn: () => {},
				error: () => {},
				debug: () => {},
			};

			configureOtel({
				config: { serviceName: 'combined' },
				logger: customLogger,
			});

			expect(getOtelConfig().serviceName).toBe('combined');
			expect(getLogger()).toBe(customLogger);
		});
	});

	describe('getOtelConfig', () => {
		it('should return empty config by default', () => {
			const config = getOtelConfig();
			expect(config).toEqual({});
		});

		it('should return configured values', () => {
			configureOtel({
				config: {
					serviceName: 'my-app',
					isContainer: true,
				},
			});

			const config = getOtelConfig();
			expect(config.serviceName).toBe('my-app');
			expect(config.isContainer).toBe(true);
		});
	});

	describe('getLogger', () => {
		it('should return default console logger when no logger configured', () => {
			const logger = getLogger();
			expect(logger).toBeDefined();
			expect(typeof logger.info).toBe('function');
			expect(typeof logger.warn).toBe('function');
			expect(typeof logger.error).toBe('function');
			expect(typeof logger.debug).toBe('function');
		});

		it('should not throw when calling default logger methods', () => {
			const logger = getLogger();
			expect(() => logger.info('test')).not.toThrow();
			expect(() => logger.warn('test', { key: 'value' })).not.toThrow();
			expect(() => logger.error('test')).not.toThrow();
			expect(() => logger.debug('test')).not.toThrow();
		});
	});

	describe('resetOtelConfig', () => {
		it('should clear all config to defaults', () => {
			configureOtel({
				config: {
					serviceName: 'to-be-reset',
					serviceVersion: '9.9.9',
				},
			});

			resetOtelConfig();

			const config = getOtelConfig();
			expect(config).toEqual({});
		});

		it('should reset logger to default', () => {
			const customLogger: OtelLogger = {
				info: () => {},
				warn: () => {},
				error: () => {},
				debug: () => {},
			};

			configureOtel({ logger: customLogger });
			expect(getLogger()).toBe(customLogger);

			resetOtelConfig();
			expect(getLogger()).not.toBe(customLogger);
		});
	});

	describe('Config edge cases', () => {
		it('should handle undefined config gracefully', () => {
			configureOtel({});
			expect(getOtelConfig()).toEqual({});
		});

		it('should handle partial config', () => {
			configureOtel({ config: { serviceName: 'partial' } });
			const config = getOtelConfig();
			expect(config.serviceName).toBe('partial');
			expect(config.serviceVersion).toBeUndefined();
			expect(config.otlpEndpoint).toBeUndefined();
		});

		it('should support container detection config', () => {
			configureOtel({ config: { isContainer: false } });
			expect(getOtelConfig().isContainer).toBe(false);

			configureOtel({ config: { isContainer: true } });
			expect(getOtelConfig().isContainer).toBe(true);
		});

		it('should support ignore patterns config', () => {
			const patterns = ['/health', '/readyz', '/_next/'];
			configureOtel({ config: { ignoreIncomingRequestPatterns: patterns } });
			expect(getOtelConfig().ignoreIncomingRequestPatterns).toEqual(patterns);
		});

		it('should support pyroscope config', () => {
			configureOtel({
				config: {
					pyroscopeUrl: 'http://pyroscope:4040',
					pyroscopeEnabled: false,
				},
			});

			const config = getOtelConfig();
			expect(config.pyroscopeUrl).toBe('http://pyroscope:4040');
			expect(config.pyroscopeEnabled).toBe(false);
		});

		it('should support custom log directory', () => {
			configureOtel({ config: { logDir: '/custom/logs' } });
			expect(getOtelConfig().logDir).toBe('/custom/logs');
		});
	});
});
