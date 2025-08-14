import initSqlJs, { Database } from 'sql.js';

let db: Database | null = null;

export interface LocalizationEntry {
  id: string;
  key: string;
  en: string;
  es: string;
  fr: string;
  de: string;
  ja: string;
  zh: string;
  created_at?: string;
  updated_at?: string;
}

export interface Session {
  id: string;
  name: string;
  created_at?: string;
}

export interface ComponentRecord {
  id: string;
  session_id: string;
  name: string;
  code: string;
  created_at?: string;
  updated_at?: string;
}

export interface ComponentVersion {
  id: string;
  component_id: string;
  code: string;
  created_at?: string;
}

export interface TranslationChangeLog {
  id: string;
  type: 'created' | 'updated' | 'reused' | 'conflict' | 'ignored_empty' | 'truncated';
  key?: string;
  proposed_key?: string;
  resolved_key?: string;
  old_en?: string;
  new_en?: string;
  created_at?: string;
}

// Simple database class for CRUD operations
export class LocalizationDB {
  private static instance: LocalizationDB;
  
  static getInstance(): LocalizationDB {
    if (!LocalizationDB.instance) {
      LocalizationDB.instance = new LocalizationDB();
    }
    return LocalizationDB.instance;
  }

  async init(): Promise<void> {
    if (db) return;
    await initializeDatabase();
  }

  async getAll(): Promise<LocalizationEntry[]> {
    await this.init();
    return getAllLocalizations();
  }

  async update(id: string, field: string, value: string): Promise<void> {
    await this.init();
    return updateLocalization(id, field, value);
  }

  async create(entry: Omit<LocalizationEntry, 'created_at' | 'updated_at'>): Promise<void> {
    await this.init();
    return createLocalization(entry);
  }

  async delete(id: string): Promise<void> {
    await this.init();
    return deleteLocalization(id);
  }

  async getTranslations(locale: string): Promise<Record<string, string>> {
    await this.init();
    return getTranslations(locale);
  }

  async getByKey(key: string): Promise<LocalizationEntry | null> {
    await this.init();
    return getLocalizationByKey(key);
  }

  async getByEnglish(en: string): Promise<LocalizationEntry | null> {
    await this.init();
    return getLocalizationByEnglish(en);
  }

  async upsertTranslations(entries: Record<string, string>): Promise<{ updated: number; created: number; reused: Record<string, string>; keysNeedingRetranslation: string[] }>{
    await this.init();
    return upsertTranslations(entries);
  }

  async getChangeLog(limit: number = 50): Promise<TranslationChangeLog[]> {
    await this.init();
    return getTranslationChangeLog(limit);
  }

  async clearChangeLog(): Promise<void> {
    await this.init();
    return clearTranslationChangeLog();
  }
}

export async function initializeDatabase(): Promise<void> {
  if (db) return; // Already initialized

  try {
    // Initialize SQL.js
    const SQL = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`
    });

    // Try to load existing database from localStorage
    const savedDb = lsGet('localizations_db');
    if (savedDb) {
      try {
        const uint8Array = new Uint8Array(savedDb.split(',').map(Number));
        db = new SQL.Database(uint8Array);
        console.log('Loaded existing database from localStorage');
        ensureAdditionalTables();
      } catch (e) {
        console.warn('Saved database appears corrupt. Recreating a fresh database.', e);
        // Clear corrupted localStorage and create fresh DB with initial data
        try { lsSet('localizations_db', ''); } catch {}
        db = new SQL.Database();
        
        // Create the localization table
        db.run(`
          CREATE TABLE localizations (
            id TEXT PRIMARY KEY,
            key TEXT UNIQUE NOT NULL,
            en TEXT DEFAULT '',
            es TEXT DEFAULT '',
            fr TEXT DEFAULT '',
            de TEXT DEFAULT '',
            ja TEXT DEFAULT '',
            zh TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          )
        `);

        // Create sessions/components/component_versions tables
        createNonLocalizationTables();

        // Insert initial data
        await seedInitialData();
        console.log('Recreated database with initial data after corruption');
      }
    } else {
      // Create new database
      db = new SQL.Database();
      
      // Create the localization table
      db.run(`
        CREATE TABLE localizations (
          id TEXT PRIMARY KEY,
          key TEXT UNIQUE NOT NULL,
          en TEXT DEFAULT '',
          es TEXT DEFAULT '',
          fr TEXT DEFAULT '',
          de TEXT DEFAULT '',
          ja TEXT DEFAULT '',
          zh TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // Create sessions/components/component_versions tables
      createNonLocalizationTables();

      // Insert initial data
      await seedInitialData();
      console.log('Created new database with initial data');
    }

    // Save database to localStorage
    saveDatabaseToLocalStorage();
    // Mark DB initialized to prevent accidental re-seed loops
    try { lsSet('localizations_db_initialized', 'true'); } catch {}

    // Integrity check and auto-backfill empty translations
    try {
      const allEntries = await getAllLocalizations();
      let emptyCount = 0;
      const supportedLocales = ['es', 'fr', 'de', 'ja', 'zh'];
      
      // Count empty cells
      for (const entry of allEntries) {
        for (const locale of supportedLocales) {
          let val = '';
          if (locale === 'es') val = entry.es || '';
          else if (locale === 'fr') val = entry.fr || '';
          else if (locale === 'de') val = entry.de || '';
          else if (locale === 'ja') val = entry.ja || '';
          else if (locale === 'zh') val = entry.zh || '';
          
          if (!val || String(val).trim() === '') {
            emptyCount++;
          }
        }
      }
      
      if (emptyCount > 0) {
        console.log(`Database integrity check: Found ${emptyCount} empty translation cells across ${allEntries.length} entries`);
        console.log('Auto-backfilling missing translations...');
        
        // Backfill missing translations for each locale
        for (const locale of supportedLocales) {
          const current = await getTranslations(locale);
          const missing: Record<string, string> = {};
          
          for (const entry of allEntries) {
            const hasVal = (current[entry.key] || '').toString().trim();
            const enVal = (entry.en || '').toString().trim();
            if (!hasVal && enVal) {
              missing[entry.key] = enVal;
            }
          }
          
          const keys = Object.keys(missing);
          if (keys.length === 0) continue;
          
          console.log(`Backfilling ${keys.length} missing ${locale} translations`);
          
          try {
            const res = await fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ locale, entries: missing })
            });
            
            if (res.ok) {
              const json = await res.json();
              const translated = (json?.translations || {}) as Record<string, string>;
              
              for (const [key, value] of Object.entries(translated)) {
                const rec = allEntries.find(e => e.key === key);
                if (rec) {
                  await updateLocalization(rec.id, locale, String(value || ''));
                }
              }
              console.log(`Successfully backfilled ${Object.keys(translated).length} ${locale} translations`);
            }
          } catch (e) {
            console.warn(`Failed to backfill ${locale} translations:`, e);
          }
        }
        
        // Dispatch update after backfill
        try {
          if (typeof window !== 'undefined') {
            window.postMessage({ type: 'LOCALIZATIONS_UPDATED', timestamp: Date.now() }, '*');
          }
        } catch {}
        
        console.log('Translation backfill completed');
      }
    } catch (e) {
      console.warn('Database integrity check/backfill failed:', e);
    }
    
  } catch (error) {
    console.error('Failed to initialize SQLite database:', error);
    throw error;
  }
}

function ensureAdditionalTables(): void {
  if (!db) return;
  createNonLocalizationTables();
  // initialize meta table and schema_version if missing
  try {
    const res = db.exec('SELECT value FROM meta WHERE key = ? LIMIT 1', ['schema_version']);
    const has = res.length > 0 && res[0].values.length > 0;
    if (!has) {
      db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', ['schema_version', '1']);
    }
  } catch {
    // ignore; meta table might not exist yet until createNonLocalizationTables runs on new DB
  }
}

function createNonLocalizationTables(): void {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS components (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT,
      code TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS component_versions (
      id TEXT PRIMARY KEY,
      component_id TEXT NOT NULL,
      code TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS translation_changes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      key TEXT,
      proposed_key TEXT,
      resolved_key TEXT,
      old_en TEXT,
      new_en TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  saveDatabaseToLocalStorage();
}

async function seedInitialData(): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  const initialData = [
    {
      id: '1',
      key: 'welcome.title',
      en: 'Welcome to our app',
      es: 'Bienvenido a nuestra aplicación',
      fr: 'Bienvenue dans notre application',
      de: 'Willkommen in unserer App',
      ja: '私たちのアプリへようこそ',
      zh: '欢迎使用我们的应用'
    },
    {
      id: '2',
      key: 'button.submit',
      en: 'Submit',
      es: 'Enviar',
      fr: 'Soumettre',
      de: 'Absenden',
      ja: '送信',
      zh: '提交'
    },
    {
      id: '3',
      key: 'error.validation',
      en: 'Please check your input',
      es: 'Por favor verifica tu entrada',
      fr: 'Veuillez vérifier votre saisie',
      de: 'Bitte überprüfen Sie Ihre Eingabe',
      ja: '入力内容を確認してください',
      zh: '请检查您的输入'
    },
    {
      id: '4',
      key: 'navigation.home',
      en: 'Home',
      es: 'Inicio',
      fr: 'Accueil',
      de: 'Startseite',
      ja: 'ホーム',
      zh: '首页'
    },
    {
      id: '5',
      key: 'form.email',
      en: 'Email Address',
      es: 'Dirección de correo',
      fr: 'Adresse e-mail',
      de: 'E-Mail-Adresse',
      ja: 'メールアドレス',
      zh: '电子邮件地址'
    }
  ];

  for (const entry of initialData) {
    db.run(`
      INSERT INTO localizations (id, key, en, es, fr, de, ja, zh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [entry.id, entry.key, entry.en, entry.es, entry.fr, entry.de, entry.ja, entry.zh]);
  }
}

function saveDatabaseToLocalStorage(): void {
  if (!db) return;
  
  try {
    const data = db.export();
    const array = Array.from(data);
    lsSet('localizations_db', array.toString());
    // Notify any listeners that localizations data has changed
    try {
      if (typeof window !== 'undefined') {
        window.postMessage({ type: 'LOCALIZATIONS_UPDATED', timestamp: Date.now() }, '*');
      }
    } catch {}
  } catch (error) {
    console.error('Failed to save database to localStorage:', error);
  }
}

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function getAllLocalizations(): Promise<LocalizationEntry[]> {
  if (!db) {
    await initializeDatabase();
  }
  
  const result = db!.exec('SELECT * FROM localizations ORDER BY key');
  if (result.length === 0) return [];
  
  return result[0].values.map(row => ({
    id: row[0] as string,
    key: row[1] as string,
    en: row[2] as string,
    es: row[3] as string,
    fr: row[4] as string,
    de: row[5] as string,
    ja: row[6] as string,
    zh: row[7] as string,
    created_at: row[8] as string,
    updated_at: row[9] as string
  }));
}

export async function updateLocalization(id: string, field: string, value: string): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }

  // Validate field to prevent SQL injection
  const validFields = ['key', 'en', 'es', 'fr', 'de', 'ja', 'zh'];
  if (!validFields.includes(field)) {
    throw new Error(`Invalid field: ${field}`);
  }

  db!.run(`
    UPDATE localizations 
    SET ${field} = ?, updated_at = datetime('now')
    WHERE id = ?
  `, [value, id]);
  
  saveDatabaseToLocalStorage();
}

export async function createLocalization(entry: Omit<LocalizationEntry, 'created_at' | 'updated_at'>): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }

  db!.run(`
    INSERT INTO localizations (id, key, en, es, fr, de, ja, zh)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [entry.id, entry.key, entry.en, entry.es, entry.fr, entry.de, entry.ja, entry.zh]);
  
  saveDatabaseToLocalStorage();
}

export async function deleteLocalization(id: string): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }

  db!.run('DELETE FROM localizations WHERE id = ?', [id]);
  saveDatabaseToLocalStorage();
}

export async function getTranslations(locale: string): Promise<Record<string, string>> {
  if (!db) {
    await initializeDatabase();
  }

  // Validate locale to prevent SQL injection
  const validLocales = ['en', 'es', 'fr', 'de', 'ja', 'zh'];
  if (!validLocales.includes(locale)) {
    throw new Error(`Invalid locale: ${locale}`);
  }

  const result = db!.exec(`SELECT key, ${locale} as translation FROM localizations`);
  if (result.length === 0) return {};
  
  return result[0].values.reduce((acc, row) => {
    acc[row[0] as string] = row[1] as string || '';
    return acc;
  }, {} as Record<string, string>);
}

async function getLocalizationByKey(key: string): Promise<LocalizationEntry | null> {
  if (!db) {
    await initializeDatabase();
  }
  const result = db!.exec('SELECT * FROM localizations WHERE key = ?', [key]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const row = result[0].values[0];
  return {
    id: row[0] as string,
    key: row[1] as string,
    en: row[2] as string,
    es: row[3] as string,
    fr: row[4] as string,
    de: row[5] as string,
    ja: row[6] as string,
    zh: row[7] as string,
    created_at: row[8] as string,
    updated_at: row[9] as string,
  };
}

async function getLocalizationByEnglish(en: string): Promise<LocalizationEntry | null> {
  if (!db) {
    await initializeDatabase();
  }
  const result = db!.exec('SELECT * FROM localizations WHERE en = ? LIMIT 1', [en]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const row = result[0].values[0];
  return {
    id: row[0] as string,
    key: row[1] as string,
    en: row[2] as string,
    es: row[3] as string,
    fr: row[4] as string,
    de: row[5] as string,
    ja: row[6] as string,
    zh: row[7] as string,
    created_at: row[8] as string,
    updated_at: row[9] as string,
  };
}

async function upsertTranslations(entries: Record<string, string>): Promise<{ updated: number; created: number; reused: Record<string, string>; keysNeedingRetranslation: string[] }>{
  if (!db) {
    await initializeDatabase();
  }
  let updated = 0;
  let created = 0;
  const reused: Record<string, string> = {};
  const keysNeedingRetranslation: string[] = [];
  
  for (const [proposedKey, enValue] of Object.entries(entries)) {
    const enRaw = (enValue ?? '').toString();
    const enTrimmed = enRaw.trim();
    let enProcessed = enTrimmed;
    if (enProcessed.length > 1000) {
      enProcessed = enProcessed.slice(0, 1000);
      logTranslationChange({ type: 'truncated', proposed_key: proposedKey, new_en: enProcessed });
    }

    const byKey = await getLocalizationByKey(proposedKey);
    if (byKey) {
      // Update en value if different
      const oldEn = (byKey.en || '').trim();
      const newEn = (enProcessed || '').trim();
      if (oldEn !== newEn) {
        db!.run(`UPDATE localizations SET en = ?, updated_at = datetime('now') WHERE id = ?`, [enProcessed || '', byKey.id]);
        updated += 1;
        logTranslationChange({ type: 'updated', key: proposedKey, old_en: oldEn, new_en: newEn });
        
        // Check if this change is significant enough to require retranslation
        const significantChange = (
          // Different length by more than 20%
          Math.abs(oldEn.length - newEn.length) > oldEn.length * 0.2 ||
          // Contains completely different words (more than 50% different)
          getWordOverlap(oldEn, newEn) < 0.5 ||
          // Empty to non-empty or vice versa
          (!oldEn && newEn) || (oldEn && !newEn)
        );
        
        if (significantChange) {
          keysNeedingRetranslation.push(proposedKey);
          console.log(`[Database] Key "${proposedKey}" marked for retranslation due to significant change: "${oldEn}" -> "${newEn}"`);
        }
      } else {
        // Reuse existing translation
        reused[proposedKey] = oldEn;
      }
      continue;
    }

    // No record by key: always create a new record for the provided key
    if (!enProcessed) {
      logTranslationChange({ type: 'ignored_empty', proposed_key: proposedKey });
      continue;
    }

    const id = generateId();
    db!.run(
      `INSERT INTO localizations (id, key, en, es, fr, de, ja, zh) VALUES (?, ?, ?, '', '', '', '', '')`,
      [id, proposedKey, enProcessed || '']
    );
    created += 1;
    keysNeedingRetranslation.push(proposedKey); // New keys need translation
    logTranslationChange({ type: 'created', key: proposedKey, new_en: enProcessed || '' });
  }
  saveDatabaseToLocalStorage();
  return { updated, created, reused, keysNeedingRetranslation };
}

// Helper function to calculate word overlap between two strings
function getWordOverlap(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const words1 = str1.toLowerCase().match(/\w+/g) || [];
  const words2 = str2.toLowerCase().match(/\w+/g) || [];
  
  if (words1.length === 0 && words2.length === 0) return 1;
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

function logTranslationChange(change: { type: TranslationChangeLog['type']; key?: string; proposed_key?: string; resolved_key?: string; old_en?: string; new_en?: string }): void {
  if (!db) return;
  const id = generateId();
  db.run(
    `INSERT INTO translation_changes (id, type, key, proposed_key, resolved_key, old_en, new_en) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, change.type, change.key || null, change.proposed_key || null, change.resolved_key || null, change.old_en || null, change.new_en || null]
  );
}

async function getTranslationChangeLog(limit: number = 50): Promise<TranslationChangeLog[]> {
  if (!db) {
    await initializeDatabase();
  }
  const result = db!.exec(`SELECT id, type, key, proposed_key, resolved_key, old_en, new_en, created_at FROM translation_changes ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(500, limit))}`);
  if (result.length === 0) return [];
  return result[0].values.map(row => ({
    id: row[0] as string,
    type: row[1] as TranslationChangeLog['type'],
    key: (row[2] as string) || undefined,
    proposed_key: (row[3] as string) || undefined,
    resolved_key: (row[4] as string) || undefined,
    old_en: (row[5] as string) || undefined,
    new_en: (row[6] as string) || undefined,
    created_at: row[7] as string,
  }));
}

async function clearTranslationChangeLog(): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }
  db!.run('DELETE FROM translation_changes');
  saveDatabaseToLocalStorage();
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
} 

// Safe localStorage helpers
function canUseLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function lsGet(key: string): string | null {
  if (!canUseLocalStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore quota or access errors
  }
}

export class SessionManager {
  private static instance: SessionManager;

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  async init(): Promise<void> {
    await initializeDatabase();
  }

  async createSession(name: string): Promise<Session> {
    await this.init();
    const id = generateId();
    db!.run('INSERT INTO sessions (id, name) VALUES (?, ?)', [id, name]);
    saveDatabaseToLocalStorage();
    this.setActiveSession(id);
    return { id, name, created_at: nowIso() };
  }

  getActiveSessionId(): string | null {
    try {
      return lsGet('active_session_id');
    } catch {
      return null;
    }
  }

  setActiveSession(id: string): void {
    try {
      lsSet('active_session_id', id);
    } catch {}
  }

  async getOrCreateActiveSession(): Promise<Session> {
    await this.init();
    const sessionId = this.getActiveSessionId();
    if (sessionId) {
      const sessions = this.listSessionsSync();
      const existing = sessions.find(s => s.id === sessionId);
      if (existing) return existing;
    }
    const defaultName = `Session ${new Date().toLocaleString()}`;
    return this.createSession(defaultName);
  }

  async listSessions(): Promise<Session[]> {
    await this.init();
    return this.listSessionsSync();
  }

  private listSessionsSync(): Session[] {
    if (!db) return [];
    const result = db.exec('SELECT id, name, created_at FROM sessions ORDER BY created_at DESC');
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
      id: row[0] as string,
      name: row[1] as string,
      created_at: row[2] as string
    }));
  }
}

export class ComponentManager {
  private static instance: ComponentManager;

  static getInstance(): ComponentManager {
    if (!ComponentManager.instance) {
      ComponentManager.instance = new ComponentManager();
    }
    return ComponentManager.instance;
  }

  async init(): Promise<void> {
    await initializeDatabase();
  }

  async saveComponent(input: { id?: string; sessionId: string; name: string; code: string }): Promise<ComponentRecord> {
    await this.init();
    const { id, sessionId, name, code } = input;
    if (id) {
      db!.run(
        `UPDATE components SET name = ?, code = ?, updated_at = datetime('now') WHERE id = ?`,
        [name, code, id]
      );
      this.saveComponentVersionSync(id, code);
      saveDatabaseToLocalStorage();
      const existing = this.getComponentSync(id);
      if (existing) return existing;
      return { id, session_id: sessionId, name, code, updated_at: nowIso(), created_at: nowIso() };
    } else {
      const newId = generateId();
      db!.run(
        `INSERT INTO components (id, session_id, name, code) VALUES (?, ?, ?, ?)`,
        [newId, sessionId, name, code]
      );
      this.saveComponentVersionSync(newId, code);
      saveDatabaseToLocalStorage();
      const created = this.getComponentSync(newId);
      if (created) return created;
      return { id: newId, session_id: sessionId, name, code, created_at: nowIso(), updated_at: nowIso() };
    }
  }

  async listComponents(sessionId: string): Promise<ComponentRecord[]> {
    await this.init();
    return this.listComponentsSync(sessionId);
  }

  private listComponentsSync(sessionId: string): ComponentRecord[] {
    if (!db) return [];
    const result = db.exec('SELECT id, session_id, name, code, created_at, updated_at FROM components ORDER BY updated_at DESC');
    if (result.length === 0) return [];
    let all = result[0].values.map(row => ({
      id: row[0] as string,
      session_id: row[1] as string,
      name: row[2] as string,
      code: row[3] as string,
      created_at: row[4] as string,
      updated_at: row[5] as string
    }));
    // Collapse groups of identical code into a single entry to avoid "repeated" appearance
    // while keeping the most recent timestamp/name.
    const seenCode = new Set<string>();
    all = all.filter(item => {
      if (seenCode.has(item.code)) return false;
      seenCode.add(item.code);
      return true;
    });
    // If a wildcard sessionId is passed ('*'), return all components across sessions
    if (sessionId === '*') return all;
    // Otherwise filter by requested session
    return all.filter(c => c.session_id === sessionId);
  }

  async getComponent(id: string): Promise<ComponentRecord | null> {
    await this.init();
    return this.getComponentSync(id);
  }

  private getComponentSync(id: string): ComponentRecord | null {
    if (!db) return null;
    const result = db.exec('SELECT id, session_id, name, code, created_at, updated_at FROM components');
    if (result.length === 0) return null;
    for (const row of result[0].values) {
      if ((row[0] as string) === id) {
        return {
          id: row[0] as string,
          session_id: row[1] as string,
          name: row[2] as string,
          code: row[3] as string,
          created_at: row[4] as string,
          updated_at: row[5] as string
        };
      }
    }
    return null;
  }

  async saveComponentVersion(componentId: string, code: string): Promise<ComponentVersion> {
    await this.init();
    const v = this.saveComponentVersionSync(componentId, code);
    saveDatabaseToLocalStorage();
    return v;
  }

  private saveComponentVersionSync(componentId: string, code: string): ComponentVersion {
    const id = generateId();
    db!.run(
      `INSERT INTO component_versions (id, component_id, code) VALUES (?, ?, ?)`,
      [id, componentId, code]
    );
    return { id, component_id: componentId, code, created_at: nowIso() };
  }

  async listComponentVersions(componentId: string): Promise<ComponentVersion[]> {
    await this.init();
    if (!db) return [];
    const result = db.exec('SELECT id, component_id, code, created_at FROM component_versions ORDER BY created_at ASC');
    if (result.length === 0) return [];
    return result[0].values
      .map(row => ({
        id: row[0] as string,
        component_id: row[1] as string,
        code: row[2] as string,
        created_at: row[3] as string
      }))
      .filter(v => v.component_id === componentId);
  }
}