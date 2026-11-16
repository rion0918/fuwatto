import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

const mockGetSettings = jest.fn(() => ({ theme: 'mint', auto_delete_enabled: 1 }));
const mockGetCount = jest.fn((_sql: string, _params: SQLInputValue[]) => ({ count: 0 }));
const mockInitialize = jest.fn(async () => {});
const mockGetAll = jest.fn((_sql: string, _params: SQLInputValue[]) => [] as unknown[]);
const mockOpen = jest.fn((..._args: unknown[]) => ({
  getAllSync: mockGetAll,
  getFirstSync: (sql: string, params: SQLInputValue[]) =>
    sql.includes('COUNT(*)') ? mockGetCount(sql, params) : mockGetSettings(),
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: (...args: unknown[]) => mockOpen(...args) }));
jest.mock('../db/client', () => ({
  initializeDatabase: () => mockInitialize(),
  POP_REMINDER_DATABASE_NAME: 'pop_reminder.db',
  getPopReminderDatabaseDirectory: () => 'file:///app/SQLite',
}));
const { getWidgetSnapshot } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./widgetReminderSnapshot') as typeof import('./widgetReminderSnapshot');

test('widget uses the application database directory with a dedicated initialized connection', async () => {
  const result = await getWidgetSnapshot();
  expect(mockInitialize).toHaveBeenCalled();
  expect(mockOpen).toHaveBeenCalledWith(
    'pop_reminder.db',
    { useNewConnection: true },
    'file:///app/SQLite',
  );
  expect(result).toEqual({ reminders: [], pastReminderCount: 0, theme: 'mint' });
});

test('database read failure is not treated as a successful empty snapshot', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockGetAll.mockImplementationOnce(() => {
    throw new Error('busy');
  });
  await expect(getWidgetSnapshot()).rejects.toThrow('busy');
  warning.mockRestore();
});

test('a settings read failure does not hide retained expired reminders using fallback settings', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockGetSettings.mockImplementationOnce(() => {
    throw new Error('settings busy');
  });
  await expect(getWidgetSnapshot()).rejects.toThrow('settings busy');
  warning.mockRestore();
});

test.each([0, 1])(
  'today all-day reminders cannot crowd the next timed reminder out of the snapshot (auto-delete %i)',
  async (autoDeleteEnabled) => {
    const database = new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE reminders (
      id TEXT, title TEXT, all_day INTEGER, target_at TEXT,
      target_notify_at TEXT, expires_at TEXT, status TEXT
    )`);
    const insert = database.prepare('INSERT INTO reminders VALUES (?, ?, ?, ?, ?, ?, ?)');
    const start = new Date(2030, 4, 12).toISOString();
    const end = new Date(2030, 4, 13).toISOString();
    for (let index = 0; index < 25; index += 1) {
      insert.run(`all-day-${index}`, `終日${index}`, 1, start, start, end, 'active');
    }
    const timed = new Date(2030, 4, 12, 14).toISOString();
    insert.run('timed', '歯医者', 0, timed, timed, timed, 'active');
    const expired = new Date(2030, 4, 11).toISOString();
    insert.run('expired', '期限済み', 1, expired, expired, start, 'expired');
    insert.run('unprocessed-expired', '期限処理前', 1, expired, expired, start, 'active');
    insert.run(
      'tomorrow',
      '明日の終日',
      1,
      end,
      end,
      new Date(2030, 4, 14).toISOString(),
      'active',
    );
    mockGetSettings.mockReturnValue({ theme: 'mint', auto_delete_enabled: autoDeleteEnabled });
    mockGetAll.mockImplementation((sql, params) => database.prepare(sql).all(...params));
    mockGetCount.mockImplementation(
      (sql, params) => database.prepare(sql).get(...params) as { count: number },
    );
    try {
      const snapshot = await getWidgetSnapshot(new Date(2030, 4, 12, 10));
      expect(
        snapshot.reminders.filter((reminder) => reminder.allDay && !reminder.isExpired),
      ).toHaveLength(26);
      expect(snapshot.reminders.find((reminder) => reminder.id === 'timed')).toMatchObject({
        title: '歯医者',
        allDay: false,
        isExpired: false,
      });
      expect(snapshot.reminders.some((reminder) => reminder.id === 'tomorrow')).toBe(true);
      expect(snapshot.pastReminderCount).toBe(2);
      expect(snapshot.reminders.filter((reminder) => reminder.isExpired)).toHaveLength(0);
    } finally {
      database.close();
      mockGetAll.mockReset().mockReturnValue([]);
      mockGetCount.mockReset().mockReturnValue({ count: 0 });
      mockGetSettings.mockReturnValue({ theme: 'mint', auto_delete_enabled: 1 });
    }
  },
);

test('the past count includes every retained row rather than the 20-row widget display limit', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE reminders (id TEXT, title TEXT, all_day INTEGER, target_at TEXT,
    target_notify_at TEXT, expires_at TEXT, status TEXT)`);
  for (let i = 0; i < 37; i += 1) {
    database
      .prepare('INSERT INTO reminders VALUES (?, ?, 0, ?, ?, ?, ?)')
      .run(
        `past-${i}`,
        `残した予定${i}`,
        '2000-01-01',
        '2000-01-01',
        '2000-01-01',
        i % 2 ? 'active' : 'expired',
      );
  }
  mockGetSettings.mockReturnValue({ theme: 'mint', auto_delete_enabled: 0 });
  mockGetAll.mockImplementation((sql, params) => database.prepare(sql).all(...params));
  mockGetCount.mockImplementation(
    (sql, params) => database.prepare(sql).get(...params) as { count: number },
  );
  try {
    const snapshot = await getWidgetSnapshot(new Date('2030-05-12T10:00:00.000Z'));
    expect(snapshot.reminders).toEqual([]);
    expect(snapshot.pastReminderCount).toBe(37);
  } finally {
    database.close();
    mockGetAll.mockReset().mockReturnValue([]);
    mockGetCount.mockReset().mockReturnValue({ count: 0 });
    mockGetSettings.mockReturnValue({ theme: 'mint', auto_delete_enabled: 1 });
  }
});
