/**
 * File-based Logger for Observability
 *
 * Writes structured JSON logs to files for Alloy collection.
 * Non-blocking, handles errors gracefully.
 *
 * Why files instead of direct Loki client:
 * - Reliable: No network failures blocking requests
 * - Simple: Standard Node.js file operations
 * - Performant: Async writes, no HTTP overhead
 * - Debuggable: Can tail files directly
 * - Platform-agnostic: Works on all platforms (unlike journal on macOS)
 *
 * @module fileLogger
 */

import { appendFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { BaseLogEntry, FileLogLevel } from './types.js';
import { getOtelConfig } from './config.js';

/**
 * Resolve the log directory from config or environment
 */
function getLogDir(): string {
	const config = getOtelConfig();
	if (config.logDir) return config.logDir;
	return process.env.NODE_ENV === 'production'
		? '/app/logs'
		: join(process.cwd(), 'logs');
}

let logDirInitialized = false;

function ensureLogDir(): void {
	if (logDirInitialized) return;
	try {
		const logDir = getLogDir();
		if (!existsSync(logDir)) {
			mkdirSync(logDir, { recursive: true });
		}
		logDirInitialized = true;
	} catch (error) {
		console.error('[FileLogger] Failed to create log directory:', error);
	}
}

/**
 * Write a structured log entry to file
 * Non-blocking, catches and logs errors to console as fallback
 */
export async function writeLog(entry: BaseLogEntry): Promise<void> {
	ensureLogDir();
	try {
		const enhancedEntry = {
			...entry,
			timestamp_iso: new Date(entry.timestamp).toISOString()
		};

		const logLine = JSON.stringify(enhancedEntry) + '\n';
		const logFile = join(getLogDir(), 'observability.log');
		await appendFile(logFile, logLine, 'utf8');
	} catch (error) {
		console.error('[FileLogger] Write failed, falling back to console:', error);
		if (process.env.NODE_ENV === 'development') console.log(JSON.stringify(entry));
	}
}

/**
 * Convenience methods for different log levels
 */
export const fileLogger = {
	debug: (message: string, data?: Record<string, unknown>) =>
		writeLog({ level: 'debug' as FileLogLevel, message, timestamp: Date.now(), ...data }),

	info: (message: string, data?: Record<string, unknown>) =>
		writeLog({ level: 'info' as FileLogLevel, message, timestamp: Date.now(), ...data }),

	warn: (message: string, data?: Record<string, unknown>) =>
		writeLog({ level: 'warn' as FileLogLevel, message, timestamp: Date.now(), ...data }),

	error: (message: string, data?: Record<string, unknown>) =>
		writeLog({ level: 'error' as FileLogLevel, message, timestamp: Date.now(), ...data }),

	write: writeLog
};

/**
 * Analytics page view logging helper
 */
export async function logPageView(data: {
	path: string;
	sessionId?: string;
	userId?: string;
	clientIp: string;
	referrer?: string;
	userAgent?: string;
	deviceType?: string;
}): Promise<void> {
	await writeLog({
		level: 'info',
		message: 'Page view',
		timestamp: Date.now(),
		component: 'analytics',
		event_type: 'page_view',
		path: data.path,
		session_id: data.sessionId,
		user_id: data.userId,
		client_ip: data.clientIp,
		referrer: data.referrer,
		user_agent: data.userAgent,
		device_type: data.deviceType,
		timestamp_iso: new Date().toISOString()
	});
}

/**
 * A11y-specific logging helper
 */
export async function logA11yViolation(url: string, violation: {
	impact?: string;
	id?: string;
	tags?: string[];
	description?: string;
	nodes?: unknown[];
}): Promise<void> {
	await writeLog({
		level: 'warn',
		message: 'A11y violation detected',
		timestamp: Date.now(),
		job: 'stonewall-observability',
		component: 'a11y-monitor',
		event_type: 'violations_detected',
		url,
		severity: violation.impact,
		violation_id: violation.id,
		violation_impact: violation.impact,
		violation_tags: violation.tags?.join(', '),
		violation_description: violation.description,
		node_count: violation.nodes?.length || 0
	});
}

/**
 * Metrics logging helper
 */
export async function logMetrics(sessionId: string, metrics: unknown): Promise<void> {
	await writeLog({
		level: 'info',
		message: 'Client metrics collected',
		timestamp: Date.now(),
		sessionId,
		metrics
	});
}

/**
 * Theme state logging helper
 */
export async function logThemeState(sessionId: string, state: unknown): Promise<void> {
	await writeLog({
		level: 'debug',
		message: 'Theme state change',
		timestamp: Date.now(),
		sessionId,
		themeState: state
	});
}

/**
 * Heartbeat logging helper
 */
export async function logHeartbeat(sessionId: string, activeTab: boolean): Promise<void> {
	await writeLog({
		level: 'debug',
		message: 'Client heartbeat',
		timestamp: Date.now(),
		sessionId,
		activeTab
	});
}

/**
 * Discord access logging helper
 */
export async function logDiscordAccess(data: {
	clientIp: string;
	passed: boolean;
	userAgent?: string;
	deviceType?: string;
	browserInfo?: unknown;
	locationData?: unknown;
}): Promise<void> {
	await writeLog({
		level: 'info',
		message: 'Discord verification attempt',
		timestamp: Date.now(),
		component: 'discord-verification',
		event_type: data.passed ? 'verification_success' : 'verification_failed',
		client_ip: data.clientIp,
		user_agent: data.userAgent,
		device_type: data.deviceType,
		browser_info: data.browserInfo,
		location_data: data.locationData,
		passed: data.passed,
		timestamp_iso: new Date().toISOString()
	});
}
