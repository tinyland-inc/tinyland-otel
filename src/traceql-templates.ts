











export interface TemplateVariable {
	name: string;
	type: 'string' | 'number' | 'duration';
	default?: string | number;
	description: string;
	required?: boolean;
	label?: string;
	placeholder?: string;
}




export interface TraceQLTemplate {
	id: string;
	name: string;
	description: string;
	category: 'security' | 'performance' | 'a11y' | 'trpc' | 'debugging';
	query: string;
	variables?: TemplateVariable[];
	examples?: Array<{
		description: string;
		variables?: Record<string, unknown>;
		expectedResults?: string;
	}>;
}




export const TRACEQL_TEMPLATES: TraceQLTemplate[] = [
	
	{
		id: 'security.high_risk_sessions',
		name: 'High-Risk Sessions',
		description: 'Find sessions flagged as high-risk by fingerprint scoring',
		category: 'security',
		query: '{ name="fingerprint.risk_scoring" && span.risk.tier="high" } | select(span.fingerprint.id, span.risk.score, span.risk.factors, span.session.id)',
	},
	{
		id: 'security.vpn_detected_sessions',
		name: 'VPN-Detected Sessions',
		description: 'Find sessions where VPN usage was detected',
		category: 'security',
		query: '{ name="fingerprint.enrichment" && span.vpn.detected=true } | select(span.fingerprint.id, span.vpn.provider, span.asn.organization, span.geo.city)',
	},
	{
		id: 'security.session_hijacking_attempts',
		name: 'Session Hijacking Attempts',
		description: 'Detect potential session hijacking via fingerprint changes mid-session',
		category: 'security',
		query: '{ name="fingerprint.validation" && span.validation.fingerprint_changed=true } | select(span.session.id, span.fingerprint.old_id, span.fingerprint.new_id, span.risk.tier)',
		variables: [{
			name: 'minRiskScore',
			type: 'number',
			default: 50,
			description: 'Minimum risk score to include (0-100)',
			required: false
		}],
	},
	{
		id: 'security.impossible_travel',
		name: 'Impossible Travel Detection',
		description: 'Find sessions with geographically impossible location changes',
		category: 'security',
		query: '{ name="fingerprint.enrichment" && span.geo.impossible_travel=true } | select(span.fingerprint.id, span.geo.city, span.geo.previous_city, span.geo.distance_km, span.geo.time_delta_minutes)',
	},
	{
		id: 'security.failed_auth_attempts',
		name: 'Failed Authentication Attempts',
		description: 'Track failed login attempts with fingerprint and location context',
		category: 'security',
		query: '{ name="auth.login" && span.auth.success=false } | select(span.fingerprint.id, span.auth.handle, span.geo.city, span.geo.country, span.timestamp) | count() by span.fingerprint.id',
		variables: [{
			name: 'timeRange',
			type: 'duration',
			default: '1h',
			description: 'Time window to analyze',
			required: false
		}, {
			name: 'minAttempts',
			type: 'number',
			default: 3,
			description: 'Minimum failed attempts to flag',
			required: false
		}],
	},

	
	{
		id: 'performance.slow_trpc_mutations',
		name: 'Slow tRPC Mutations',
		description: 'Find tRPC mutations exceeding duration threshold',
		category: 'performance',
		query: '{ name=~"trpc.mutation.*" && duration > {{thresholdMs}}ms } | select(span.trpc.procedure, duration, span.trpc.input_size, span.db.query_count)',
		variables: [{
			name: 'thresholdMs',
			type: 'number',
			default: 1000,
			description: 'Minimum duration in milliseconds',
			required: true
		}],
	},
	{
		id: 'performance.high_latency_traces',
		name: 'High-Latency Traces (P95)',
		description: 'Get p95 latency for all trace operations',
		category: 'performance',
		query: '{ name=~"trpc.*" } | select(span.trpc.procedure, duration) | quantile(duration, 0.95) by span.trpc.procedure',
		variables: [{
			name: 'percentile',
			type: 'number',
			default: 0.95,
			description: 'Latency percentile (0.0-1.0)',
			required: false
		}],
	},
	{
		id: 'performance.error_rate_by_procedure',
		name: 'Error Rate by Procedure',
		description: 'Calculate error rate for each tRPC procedure',
		category: 'performance',
		query: '{ name=~"trpc.*" } | select(span.trpc.procedure, span.status.code) | count() by span.trpc.procedure, span.status.code',
		variables: [{
			name: 'timeWindow',
			type: 'duration',
			default: '1h',
			description: 'Time range to analyze',
			required: false
		}],
	},

	
	{
		id: 'a11y.critical_wcag_violations',
		name: 'Critical WCAG Violations',
		description: 'Find accessibility scans with critical WCAG violations',
		category: 'a11y',
		query: '{ name="a11y.scan" && span.a11y.violations.critical > 0 } | select(span.a11y.page, span.a11y.violations.critical, span.a11y.violations.details)',
		variables: [{
			name: 'minViolations',
			type: 'number',
			default: 1,
			description: 'Minimum critical violations to report',
			required: false
		}],
	},
	{
		id: 'a11y.screen_reader_usage',
		name: 'Screen Reader Usage',
		description: 'Track sessions using screen readers',
		category: 'a11y',
		query: '{ name="fingerprint.enrichment" && span.a11y.screen_reader=true } | select(span.fingerprint.id, span.a11y.screen_reader_type, span.a11y.browser, span.session.duration)',
	},
	{
		id: 'a11y.reduced_motion_preference',
		name: 'Reduced Motion Preference',
		description: 'Find users with prefers-reduced-motion enabled',
		category: 'a11y',
		query: '{ name="fingerprint.enrichment" && span.a11y.prefers_reduced_motion=true } | select(span.fingerprint.id, span.a11y.animation_disabled, span.theme.current)',
	},

	
	{
		id: 'trpc.procedure_call_distribution',
		name: 'Procedure Call Distribution',
		description: 'Show call frequency distribution across tRPC procedures',
		category: 'trpc',
		query: '{ name=~"trpc.*" } | select(span.trpc.procedure, span.trpc.type) | count() by span.trpc.procedure | sort() desc',
		variables: [{
			name: 'topN',
			type: 'number',
			default: 10,
			description: 'Number of top procedures to return',
			required: false
		}],
	},
	{
		id: 'trpc.error_tracking_by_procedure',
		name: 'Error Tracking by Procedure',
		description: 'Track error types and frequencies for each tRPC procedure',
		category: 'trpc',
		query: '{ name=~"trpc.*" && span.status.code!="OK" } | select(span.trpc.procedure, span.error.type, span.error.message, span.fingerprint.id)',
		variables: [{
			name: 'errorType',
			type: 'string',
			default: '*',
			description: 'Filter by error type',
			required: false
		}],
	},

	
	{
		id: 'debugging.trace_by_fingerprint',
		name: 'Trace by Fingerprint ID',
		description: 'Find all traces for a specific fingerprint ID',
		category: 'debugging',
		query: '{ span.fingerprint.id="{{fingerprintId}}" } | select(name, duration, span.status.code, span.trpc.procedure, span.geo.city)',
		variables: [{
			name: 'fingerprintId',
			type: 'string',
			description: 'The fingerprint ID to search for',
			required: true
		}],
	},
	{
		id: 'debugging.trace_by_session',
		name: 'Trace by Session ID',
		description: 'Find all traces for a specific session ID',
		category: 'debugging',
		query: '{ span.session.id="{{sessionId}}" } | select(name, duration, span.fingerprint.id, span.trpc.procedure, span.timestamp) | sort() by span.timestamp',
		variables: [{
			name: 'sessionId',
			type: 'string',
			description: 'The session ID to search for',
			required: true
		}],
	},
	{
		id: 'debugging.trace_by_error_message',
		name: 'Trace by Error Message',
		description: 'Find traces containing specific error message substring',
		category: 'debugging',
		query: '{ span.error.message=~"{{errorPattern}}" } | select(name, span.error.message, span.error.stack, span.fingerprint.id, span.trpc.procedure)',
		variables: [{
			name: 'errorPattern',
			type: 'string',
			description: 'Error message substring or regex pattern',
			required: true
		}],
	},
	{
		id: 'debugging.trace_cascade',
		name: 'Trace Cascade Analysis',
		description: 'Show parent-child trace relationships for debugging async flows',
		category: 'debugging',
		query: '{ span.parent_id="{{parentTraceId}}" } | select(name, span.trace_id, span.parent_id, duration, span.status.code) | sort() by span.timestamp',
		variables: [{
			name: 'parentTraceId',
			type: 'string',
			description: 'Parent trace ID to analyze children',
			required: true
		}],
	}
];




export const TEMPLATE_CATEGORIES = ['security', 'performance', 'a11y', 'trpc', 'debugging'] as const;




export function renderTemplate(
	template: TraceQLTemplate,
	variables: Record<string, unknown>
): string {
	let query = template.query;

	const requiredVars = template.variables?.filter(v => v.required !== false) || [];
	for (const varDef of requiredVars) {
		if (!(varDef.name in variables)) {
			throw new Error(
				`Missing required variable "${varDef.name}" for template "${template.id}"`
			);
		}
	}

	const allVariables = { ...variables };
	for (const varDef of template.variables || []) {
		if (!(varDef.name in allVariables) && varDef.default !== undefined) {
			allVariables[varDef.name] = varDef.default;
		}
	}

	for (const [key, value] of Object.entries(allVariables)) {
		const placeholder = `{{${key}}}`;
		const replacementValue = formatVariableValue(value, template.variables?.find(v => v.name === key)?.type);
		query = query.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), replacementValue);
	}

	return query;
}

function formatVariableValue(value: unknown, type?: TemplateVariable['type']): string {
	if (type === 'string') {
		return String(value).replace(/"/g, '\\"');
	}
	if (type === 'duration') {
		return String(value);
	}
	if (type === 'number') {
		return String(Number(value));
	}
	return String(value);
}




export function getTemplatesByCategory(
	category: TraceQLTemplate['category']
): TraceQLTemplate[] {
	return TRACEQL_TEMPLATES.filter(t => t.category === category);
}




export function getTemplateById(id: string): TraceQLTemplate | undefined {
	return TRACEQL_TEMPLATES.find(t => t.id === id);
}




export function getTemplateCatalog(): Record<TraceQLTemplate['category'], string[]> {
	return TEMPLATE_CATEGORIES.reduce((catalog, category) => {
		catalog[category] = getTemplatesByCategory(category).map(t => t.id);
		return catalog;
	}, {} as Record<TraceQLTemplate['category'], string[]>);
}




export function validateTemplateVariables(
	template: TraceQLTemplate,
	variables: Record<string, unknown>
): string[] {
	const errors: string[] = [];

	for (const varDef of template.variables || []) {
		const value = variables[varDef.name];

		if (varDef.required !== false && value === undefined) {
			errors.push(`Missing required variable "${varDef.name}"`);
			continue;
		}

		if (value === undefined) continue;

		if (varDef.type === 'number' && typeof value !== 'number' && isNaN(Number(value))) {
			errors.push(`Variable "${varDef.name}" must be of type number`);
		}
		if (varDef.type === 'string' && typeof value !== 'string') {
			errors.push(`Variable "${varDef.name}" must be of type string`);
		}
		if (varDef.type === 'duration' && !/^\d+[smhd]$/.test(String(value))) {
			errors.push(`Variable "${varDef.name}" must be a valid duration (e.g., 1h, 5m, 30s)`);
		}
	}

	return errors;
}
