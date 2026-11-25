import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockDirectory = mkdtempSync(join(tmpdir(), 'store-review-state-'));
const mockDatabasePath = join(mockDirectory, 'store-review.db');
const mockDatabase = new DatabaseSync(mockDatabasePath);
const mockConnection = {
  databasePath: mockDatabasePath,
  execAsync: async (sql: string) => mockDatabase.exec(sql),
  getFirstAsync: async <T,>(sql: string) => (mockDatabase.prepare(sql).get() ?? null) as T | null,
  getAllAsync: async <T,>(sql: string) => mockDatabase.prepare(sql).all() as T[],
  prepareSync: (sql: string) => ({
    executeSync: (params: SQLInputValue[]) => {
      const statement = mockDatabase.prepare(sql);
      const result = statement.columns().length ? null : statement.run(...params);
      return {
        changes: result?.changes ?? 0,
        lastInsertRowId: result?.lastInsertRowid ?? 0,
        getAllSync: () => statement.all(...params),
        getFirstSync: () => statement.get(...params),
      };
    },
    executeForRawResultSync: (params: SQLInputValue[]) => {
      const statement = mockDatabase.prepare(sql);
      statement.setReturnArrays(true);
      return { getAllSync: () => statement.all(...params) };
    },
  }),
};

jest.mock('expo-sqlite', () => ({ openDatabaseSync: () => mockConnection }));
jest.mock('expo-file-system', () => ({ Paths: { document: { uri: 'file:///app/' } } }));

const { initializeDatabase } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../../db/client') as typeof import('../../../db/client');
const { sqliteStoreReviewStateRepository: repository } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./sqliteStoreReviewStateRepository') as typeof import('./sqliteStoreReviewStateRepository');

beforeAll(async () => initializeDatabase());
beforeEach(() => {
  mockDatabase.exec('DELETE FROM store_review_state;');
});
afterAll(() => {
  mockDatabase.close();
  rmSync(mockDirectory, { recursive: true, force: true });
});

describe('sqliteStoreReviewStateRepository', () => {
  it('initializes firstSeenAt once and persists prompt updates', async () => {
    const first = await repository.getOrCreate('2026-11-17T00:00:00.000Z');
    expect(first).toEqual({
      id: 'default',
      firstSeenAt: '2026-11-17T00:00:00.000Z',
      successCount: 0,
      promptCount: 0,
      lastPromptAt: null,
    });

    const second = await repository.getOrCreate('2026-11-19T00:00:00.000Z');
    expect(second.firstSeenAt).toBe('2026-11-17T00:00:00.000Z');

    await repository.save({
      ...second,
      successCount: 3,
      promptCount: 1,
      lastPromptAt: '2026-11-19T00:00:00.000Z',
    });

    const reloaded = await repository.getOrCreate('2026-11-20T00:00:00.000Z');
    expect(reloaded).toEqual({
      id: 'default',
      firstSeenAt: '2026-11-17T00:00:00.000Z',
      successCount: 3,
      promptCount: 1,
      lastPromptAt: '2026-11-19T00:00:00.000Z',
    });
  });
});
