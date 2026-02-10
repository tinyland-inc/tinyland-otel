/**
 * Tests for TraceQL template rendering and validation
 */
import { describe, it, expect } from 'vitest';
import {
	TRACEQL_TEMPLATES,
	TEMPLATE_CATEGORIES,
	renderTemplate,
	getTemplatesByCategory,
	getTemplateById,
	getTemplateCatalog,
	validateTemplateVariables,
} from '../src/traceql-templates.js';

describe('TraceQL Templates', () => {
	describe('TRACEQL_TEMPLATES', () => {
		it('should have templates defined', () => {
			expect(TRACEQL_TEMPLATES.length).toBeGreaterThan(0);
		});

		it('should have unique IDs', () => {
			const ids = TRACEQL_TEMPLATES.map(t => t.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(ids.length);
		});

		it('should have valid categories', () => {
			for (const template of TRACEQL_TEMPLATES) {
				expect(TEMPLATE_CATEGORIES).toContain(template.category);
			}
		});

		it('should have non-empty queries', () => {
			for (const template of TRACEQL_TEMPLATES) {
				expect(template.query.length).toBeGreaterThan(0);
			}
		});
	});

	describe('getTemplatesByCategory', () => {
		it('should return security templates', () => {
			const templates = getTemplatesByCategory('security');
			expect(templates.length).toBeGreaterThan(0);
			templates.forEach(t => expect(t.category).toBe('security'));
		});

		it('should return performance templates', () => {
			const templates = getTemplatesByCategory('performance');
			expect(templates.length).toBeGreaterThan(0);
			templates.forEach(t => expect(t.category).toBe('performance'));
		});

		it('should return a11y templates', () => {
			const templates = getTemplatesByCategory('a11y');
			expect(templates.length).toBeGreaterThan(0);
			templates.forEach(t => expect(t.category).toBe('a11y'));
		});

		it('should return debugging templates', () => {
			const templates = getTemplatesByCategory('debugging');
			expect(templates.length).toBeGreaterThan(0);
		});
	});

	describe('getTemplateById', () => {
		it('should find existing template', () => {
			const template = getTemplateById('security.high_risk_sessions');
			expect(template).toBeDefined();
			expect(template?.name).toBe('High-Risk Sessions');
		});

		it('should return undefined for non-existent template', () => {
			expect(getTemplateById('nonexistent.template')).toBeUndefined();
		});
	});

	describe('getTemplateCatalog', () => {
		it('should return all categories', () => {
			const catalog = getTemplateCatalog();
			for (const category of TEMPLATE_CATEGORIES) {
				expect(catalog[category]).toBeDefined();
				expect(Array.isArray(catalog[category])).toBe(true);
			}
		});
	});

	describe('renderTemplate', () => {
		it('should render template without variables', () => {
			const template = getTemplateById('security.high_risk_sessions')!;
			const query = renderTemplate(template, {});
			expect(query).toBe(template.query);
		});

		it('should substitute template variables', () => {
			const template = getTemplateById('debugging.trace_by_fingerprint')!;
			const query = renderTemplate(template, { fingerprintId: 'fp_test123' });
			expect(query).toContain('fp_test123');
			expect(query).not.toContain('{{fingerprintId}}');
		});

		it('should throw for missing required variables', () => {
			const template = getTemplateById('debugging.trace_by_fingerprint')!;
			expect(() => renderTemplate(template, {})).toThrow(
				'Missing required variable "fingerprintId"'
			);
		});

		it('should apply default values for optional variables', () => {
			const template = getTemplateById('performance.slow_trpc_mutations')!;
			const query = renderTemplate(template, { thresholdMs: 2000 });
			expect(query).toContain('2000');
		});
	});

	describe('validateTemplateVariables', () => {
		it('should return no errors for valid variables', () => {
			const template = getTemplateById('debugging.trace_by_fingerprint')!;
			const errors = validateTemplateVariables(template, {
				fingerprintId: 'fp_abc123',
			});
			expect(errors).toHaveLength(0);
		});

		it('should detect missing required variables', () => {
			const template = getTemplateById('debugging.trace_by_fingerprint')!;
			const errors = validateTemplateVariables(template, {});
			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0]).toContain('Missing required variable');
		});

		it('should detect invalid number types', () => {
			const template = getTemplateById('performance.slow_trpc_mutations')!;
			const errors = validateTemplateVariables(template, {
				thresholdMs: 'not-a-number',
			});
			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0]).toContain('must be of type number');
		});

		it('should detect invalid duration format', () => {
			const template = getTemplateById('security.failed_auth_attempts')!;
			const errors = validateTemplateVariables(template, {
				timeRange: 'invalid',
			});
			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0]).toContain('valid duration');
		});

		it('should accept valid duration format', () => {
			const template = getTemplateById('security.failed_auth_attempts')!;
			const errors = validateTemplateVariables(template, {
				timeRange: '5m',
				minAttempts: 3,
			});
			expect(errors).toHaveLength(0);
		});
	});
});
