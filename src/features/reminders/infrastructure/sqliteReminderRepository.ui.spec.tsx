import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockDirectory = mkdtempSync(join(tmpdir(), 'reminder-departures-'));
const mockDatabasePath = join(mockDirectory, 'reminders.db');
let mockDatabase = new DatabaseSync(mockDatabasePath);
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

// Run the real Drizzle repository and startup schema against SQLite, without native bindings.
const { initializeDatabase } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../../db/client') as typeof import('../../../db/client');
const { sqliteReminderRepository: repository } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./sqliteReminderRepository') as typeof import('./sqliteReminderRepository');

const now = new Date('2030-05-12T10:00:00.000Z');
function insert(id: string, status = 'active', targetAt = '2030-05-12T09:00:00.000Z') {
  mockDatabase
    .prepare(
      `INSERT INTO reminders
    (id, title, all_day, target_at, previous_notify_at, target_notify_at, expires_at, status, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, `予定 ${id}`, targetAt, targetAt, targetAt, targetAt, status, targetAt, targetAt);
}

beforeAll(async () => initializeDatabase());
beforeEach(() => {
  mockDatabase.exec('DELETE FROM reminders;');
  mockDatabase.exec('DELETE FROM reminder_departures;');
});
afterAll(() => {
  mockDatabase.close();
  rmSync(mockDirectory, { recursive: true });
});

test('cleanup content survives a new SQLite connection until those IDs are acknowledged', async () => {
  insert('first');
  insert('second');
  await repository.deleteExpiredWithNotice(['first', 'second'], now);
  expect(mockDatabase.prepare('SELECT id FROM reminders').all()).toEqual([]);
  mockDatabase.close();
  mockDatabase = new DatabaseSync(mockDatabasePath);
  expect((await repository.listDepartureNotices()).map((item) => item.title).sort()).toEqual([
    '予定 first',
    '予定 second',
  ]);
  await repository.acknowledgeDepartureNotices(['first']);
  expect((await repository.listDepartureNotices()).map((item) => item.id)).toEqual(['second']);
});

test('a delete failure rolls back the notice so the UI does not report a false departure', async () => {
  insert('kept');
  mockDatabase.exec(`CREATE TRIGGER reject_expiration BEFORE DELETE ON reminders
    BEGIN SELECT RAISE(ABORT, 'delete failed'); END;`);
  try {
    await expect(repository.deleteExpiredWithNotice(['kept'], now)).rejects.toThrow();
    expect(await repository.getById('kept')).not.toBeNull();
    expect(await repository.listDepartureNotices()).toEqual([]);
  } finally {
    mockDatabase.exec('DROP TRIGGER reject_expiration;');
  }
});

test('repeated cleanup and acknowledgement never consume newer departures or rescheduled plans', async () => {
  insert('first');
  insert('future', 'active', '2030-05-13T09:00:00.000Z');
  await repository.deleteExpiredWithNotice(['first', 'future'], now);
  await repository.deleteExpiredWithNotice(['first'], now);
  insert('new');
  await repository.deleteExpiredWithNotice(['new'], now);
  await repository.acknowledgeDepartureNotices(['first']);
  expect((await repository.listDepartureNotices()).map((item) => item.id)).toEqual(['new']);
  expect(await repository.getById('future')).not.toBeNull();
});

test('manual deletion stays outside the automatic departure notice', async () => {
  insert('manual');
  await repository.deleteById('manual');
  expect(await repository.listDepartureNotices()).toEqual([]);
});

test('startup adds the notice table to an existing database without losing reminders', async () => {
  insert('existing');
  mockDatabase.exec('DROP TABLE reminder_departures; PRAGMA user_version = 8;');
  await initializeDatabase({ ...mockConnection });
  expect(await repository.getById('existing')).not.toBeNull();
  expect(await repository.listDepartureNotices()).toEqual([]);
});

test('expiration skips a reminder rescheduled after the expired scan', async () => {
  insert('moved');
  expect((await repository.listExpired(now)).map((item) => item.id)).toContain('moved');
  mockDatabase
    .prepare('UPDATE reminders SET expires_at = ? WHERE id = ?')
    .run('2030-05-13T09:00:00.000Z', 'moved');
  await repository.markExpired('moved', now);
  expect((await repository.getById('moved'))?.status).toBe('active');
});
