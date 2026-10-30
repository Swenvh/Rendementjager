-- 002: script revisions and the audit log are append-only.
CREATE TRIGGER script_revisions_no_update BEFORE UPDATE ON script_revisions
BEGIN SELECT RAISE(ABORT, 'script_revisions are immutable; insert a new version'); END;
CREATE TRIGGER script_revisions_no_delete BEFORE DELETE ON script_revisions
BEGIN SELECT RAISE(ABORT, 'script_revisions are immutable'); END;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
