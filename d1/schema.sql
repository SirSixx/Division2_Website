/* SHD FIELD TOOLKIT — CLOUDFLARE D1 SCHEMA (SQLite). Paste into: Storage & Databases → D1 → shd-toolkit → Console → Execute. Safe to re-run (everything is IF NOT EXISTS). One statement per line, and only block comments, because the console joins lines together. */

/* datasets: one row per dataset, the whole dataset as one JSON blob. Public: gear, gear-logo-map, talents, weapon-classes. Admin only (published = 0): ref-gearsets, ref-brandsets, ref-named. */
CREATE TABLE IF NOT EXISTS datasets (key TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), schema_version INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_by TEXT);

/* builds: one row per build; data is the build object exactly as the Builds page renders it. */
CREATE TABLE IF NOT EXISTS builds (id TEXT PRIMARY KEY, category TEXT NOT NULL CHECK (category IN ('dps', 'skill', 'tank', 'support')), status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')), sort_order INTEGER NOT NULL DEFAULT 100, data TEXT NOT NULL CHECK (json_valid(data)), version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_by TEXT);
CREATE INDEX IF NOT EXISTS builds_public ON builds (status, sort_order, id);

/* content_history: every previous version of every row above. For builds, extra holds status / category / sort_order at that version. */
CREATE TABLE IF NOT EXISTS content_history (id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, row_key TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, extra TEXT, changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), changed_by TEXT);
CREATE INDEX IF NOT EXISTS content_history_lookup ON content_history (table_name, row_key, version DESC);

/* History triggers: the API bumps version on every save; these copy the OLD row into content_history first, and also on delete, so every change can be undone. */
CREATE TRIGGER IF NOT EXISTS datasets_history_update BEFORE UPDATE ON datasets FOR EACH ROW WHEN NEW.version <> OLD.version BEGIN INSERT INTO content_history (table_name, row_key, version, data, changed_by) VALUES ('datasets', OLD.key, OLD.version, OLD.data, OLD.updated_by); END;
CREATE TRIGGER IF NOT EXISTS datasets_history_delete BEFORE DELETE ON datasets FOR EACH ROW BEGIN INSERT INTO content_history (table_name, row_key, version, data, changed_by) VALUES ('datasets', OLD.key, OLD.version, OLD.data, OLD.updated_by); END;
CREATE TRIGGER IF NOT EXISTS builds_history_update BEFORE UPDATE ON builds FOR EACH ROW WHEN NEW.version <> OLD.version BEGIN INSERT INTO content_history (table_name, row_key, version, data, extra, changed_by) VALUES ('builds', OLD.id, OLD.version, OLD.data, json_object('status', OLD.status, 'category', OLD.category, 'sort_order', OLD.sort_order), OLD.updated_by); END;
CREATE TRIGGER IF NOT EXISTS builds_history_delete BEFORE DELETE ON builds FOR EACH ROW BEGIN INSERT INTO content_history (table_name, row_key, version, data, extra, changed_by) VALUES ('builds', OLD.id, OLD.version, OLD.data, json_object('status', OLD.status, 'category', OLD.category, 'sort_order', OLD.sort_order), OLD.updated_by); END;

/* Check: should list 9 objects — 2 indexes, 3 tables, 4 triggers. */
SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name;
