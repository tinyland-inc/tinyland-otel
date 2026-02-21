/**
 * Tests for saved queries persistence
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { resetOtelConfig } from '../src/config.js';

// Mock fs module before importing the module under test
const mockWriteFileSync = vi.fn();
const mockReadFileSync = vi.fn() as Mock;
const mockExistsSync = vi.fn() as Mock;
const mockMkdirSync = vi.fn();

vi.mock('node:fs', () => ({
	writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
	readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
	existsSync: (...args: unknown[]) => mockExistsSync(...args),
	mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}));

import {
	loadSavedQueries,
	saveQuery,
	deleteQuery,
	trackQueryUsage,
	getQueriesByCategory,
	getQueriesByUser,
	updateQuery,
} from '../src/persistence/saved-queries.js';
import type { SavedQuery } from '../src/persistence/saved-queries.js';

const TEST_OPTIONS = {
	storageDir: '/tmp/test-queries',
	filename: 'test-saved-queries.json',
};

function createMockSavedQuery(overrides: Partial<SavedQuery> = {}): SavedQuery {
	return {
		id: `query_${Date.now()}_abc123`,
		name: 'Test Query',
		description: 'A test query',
		query: '{ span.http.status_code >= 500 }',
		category: 'performance',
		createdBy: 'user-001',
		createdAt: new Date('2025-01-01'),
		useCount: 0,
		tags: ['http', 'errors'],
		...overrides,
	};
}

describe('Saved Queries Persistence', () => {
	beforeEach(() => {
		resetOtelConfig();
		mockWriteFileSync.mockReset();
		mockReadFileSync.mockReset();
		mockExistsSync.mockReset();
		mockMkdirSync.mockReset();
	});

	describe('loadSavedQueries', () => {
		it('should return empty array when file does not exist', () => {
			// First call: dir check, second call: file check
			mockExistsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
			// After creating the file, read it
			mockReadFileSync.mockReturnValueOnce('[]');
			// The ensureStorage creates the file, then we re-enter and read
			mockExistsSync.mockReturnValueOnce(true).mockReturnValueOnce(true);
			mockReadFileSync.mockReturnValueOnce('[]');

			const queries = loadSavedQueries(TEST_OPTIONS);
			expect(queries).toEqual([]);
		});

		it('should load and parse existing queries', () => {
			const mockQueries = [
				createMockSavedQuery({
					id: 'q1',
					createdAt: new Date('2025-01-01'),
				}),
			];

			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify(mockQueries));

			const queries = loadSavedQueries(TEST_OPTIONS);
			expect(queries).toHaveLength(1);
			expect(queries[0].id).toBe('q1');
			expect(queries[0].createdAt).toBeInstanceOf(Date);
		});

		it('should return empty array on parse error', () => {
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue('not valid json{{{');

			const queries = loadSavedQueries(TEST_OPTIONS);
			expect(queries).toEqual([]);
		});

		it('should create directory if it does not exist', () => {
			mockExistsSync
				.mockReturnValueOnce(false) // dir does not exist
				.mockReturnValueOnce(false); // file does not exist
			mockReadFileSync.mockReturnValue('[]');
			// After ensureStorage, re-check succeeds
			mockExistsSync.mockReturnValue(true);

			loadSavedQueries(TEST_OPTIONS);
			expect(mockMkdirSync).toHaveBeenCalled();
		});
	});

	describe('saveQuery', () => {
		it('should save a new query with generated ID', () => {
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue('[]');

			const saved = saveQuery(
				{
					name: 'New Query',
					description: 'Test',
					query: '{ name = "test" }',
					category: 'custom',
					createdBy: 'user-001',
					tags: ['test'],
				},
				TEST_OPTIONS
			);

			expect(saved.id).toMatch(/^query_/);
			expect(saved.name).toBe('New Query');
			expect(saved.useCount).toBe(0);
			expect(saved.createdAt).toBeInstanceOf(Date);
			expect(mockWriteFileSync).toHaveBeenCalled();
		});

		it('should append to existing queries', () => {
			const existing = [createMockSavedQuery({ id: 'existing-1' })];
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify(existing));

			saveQuery(
				{
					name: 'Second Query',
					description: 'Another test',
					query: '{ name = "test2" }',
					category: 'security',
					createdBy: 'user-002',
					tags: [],
				},
				TEST_OPTIONS
			);

			// Verify the written data contains both queries
			const writtenData = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
			expect(writtenData).toHaveLength(2);
		});

		it('should throw on write failure', () => {
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue('[]');
			mockWriteFileSync.mockImplementation(() => {
				throw new Error('Permission denied');
			});

			expect(() =>
				saveQuery(
					{
						name: 'Fail Query',
						description: 'Should fail',
						query: '{ }',
						category: 'custom',
						createdBy: 'user-001',
						tags: [],
					},
					TEST_OPTIONS
				)
			).toThrow('Failed to save query');
		});
	});

	describe('deleteQuery', () => {
		it('should delete existing query and return true', () => {
			const existing = [
				createMockSavedQuery({ id: 'to-delete' }),
				createMockSavedQuery({ id: 'to-keep' }),
			];
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify(existing));

			const result = deleteQuery('to-delete', TEST_OPTIONS);

			expect(result).toBe(true);
			const writtenData = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
			expect(writtenData).toHaveLength(1);
			expect(writtenData[0].id).toBe('to-keep');
		});

		it('should return false for non-existent query', () => {
			const existing = [createMockSavedQuery({ id: 'existing' })];
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify(existing));

			const result = deleteQuery('nonexistent', TEST_OPTIONS);
			expect(result).toBe(false);
		});

		it('should throw on write failure', () => {
			const existing = [createMockSavedQuery({ id: 'to-delete' })];
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify(existing));
			mockWriteFileSync.mockImplementation(() => {
				throw new Error('Disk full');
			});

			expect(() => deleteQuery('to-delete', TEST_OPTIONS)).toThrow('Failed to delete query');
		});
	});

	describe('trackQueryUsage', () => {
		it('should increment use count', () => {
			const existing = [createMockSavedQuery({ id: 'tracked', useCount: 5 })];
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify(existing));

			trackQueryUsage('tracked', TEST_OPTIONS);

			const writtenData = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
			expect(writtenData[0].useCount).toBe(6);
			expect(writtenData[0].lastUsed).toBeDefined();
		});

		it('should not throw for non-existent query', () => {
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue('[]');

			expect(() => trackQueryUsage('nonexistent', TEST_OPTIONS)).not.toThrow();
		});

		it('should not throw on write failure', () => {
			const existing = [createMockSavedQuery({ id: 'tracked' })];
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify(existing));
			mockWriteFileSync.mockImplementation(() => {
				throw new Error('Write failure');
			});

			// trackQueryUsage is non-critical - should not throw
			expect(() => trackQueryUsage('tracked', TEST_OPTIONS)).not.toThrow();
		});
	});

	describe('getQueriesByCategory', () => {
		it('should filter queries by category', () => {
			const existing = [
				createMockSavedQuery({ id: 'q1', category: 'security' }),
				createMockSavedQuery({ id: 'q2', category: 'performance' }),
				createMockSavedQuery({ id: 'q3', category: 'security' }),
			];
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify(existing));

			const securityQueries = getQueriesByCategory('security', TEST_OPTIONS);
			expect(securityQueries).toHaveLength(2);
			expect(securityQueries.every((q) => q.category === 'security')).toBe(true);
		});

		it('should return empty for no matches', () => {
			const existing = [createMockSavedQuery({ category: 'performance' })];
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify(existing));

			const queries = getQueriesByCategory('a11y', TEST_OPTIONS);
			expect(queries).toHaveLength(0);
		});
	});

	describe('getQueriesByUser', () => {
		it('should filter queries by user ID', () => {
			const existing = [
				createMockSavedQuery({ id: 'q1', createdBy: 'user-001' }),
				createMockSavedQuery({ id: 'q2', createdBy: 'user-002' }),
				createMockSavedQuery({ id: 'q3', createdBy: 'user-001' }),
			];
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify(existing));

			const userQueries = getQueriesByUser('user-001', TEST_OPTIONS);
			expect(userQueries).toHaveLength(2);
		});
	});

	describe('updateQuery', () => {
		it('should update existing query', () => {
			const existing = [
				createMockSavedQuery({ id: 'to-update', name: 'Old Name' }),
			];
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify(existing));

			const updated = updateQuery(
				'to-update',
				{ name: 'New Name', description: 'Updated description' },
				TEST_OPTIONS
			);

			expect(updated).not.toBeNull();
			expect(updated!.name).toBe('New Name');
			expect(updated!.description).toBe('Updated description');
			expect(mockWriteFileSync).toHaveBeenCalled();
		});

		it('should return null for non-existent query', () => {
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue('[]');

			const result = updateQuery('nonexistent', { name: 'Updated' }, TEST_OPTIONS);
			expect(result).toBeNull();
		});

		it('should throw on write failure', () => {
			const existing = [createMockSavedQuery({ id: 'to-update' })];
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify(existing));
			mockWriteFileSync.mockImplementation(() => {
				throw new Error('Write error');
			});

			expect(() =>
				updateQuery('to-update', { name: 'Updated' }, TEST_OPTIONS)
			).toThrow('Failed to update query');
		});
	});
});
