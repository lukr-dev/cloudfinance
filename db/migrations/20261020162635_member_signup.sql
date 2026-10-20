-- void:allow-destructive
-- Replace the single-user index with atomic invitation and membership enforcement.
DROP INDEX user_single_account;
--> statement-breakpoint
INSERT INTO members(user_id,role,invited_by,joined_at)
SELECT id,'admin',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM "user";
--> statement-breakpoint
-- Invited users use the invitation UUID as their user ID so insertion can consume it atomically.
CREATE TRIGGER user_membership AFTER INSERT ON "user" BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM members) AND NOT EXISTS(
    SELECT 1 FROM invitations WHERE id=NEW.id AND used_at IS NULL AND revoked_at IS NULL
      AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (email IS NULL OR lower(email)=lower(NEW.email))
  ) THEN RAISE(ABORT,'INVITE_INVALID') END;
  INSERT INTO members(user_id,role,invited_by,joined_at)
    SELECT NEW.id,CASE WHEN EXISTS(SELECT 1 FROM members) THEN 'member' ELSE 'admin' END,
      (SELECT created_by FROM invitations WHERE id=NEW.id),strftime('%Y-%m-%dT%H:%M:%fZ','now');
  UPDATE invitations SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),used_by=NEW.id WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER shares_insert AFTER INSERT ON transaction_shares BEGIN
  UPDATE transactions SET shared_out_minor=(SELECT coalesce(sum(amount_minor),0) FROM transaction_shares WHERE owner_user_id=NEW.owner_user_id AND transaction_id=NEW.transaction_id AND status='active')
    WHERE user_id=NEW.owner_user_id AND id=NEW.transaction_id AND split_method IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER shares_update AFTER UPDATE ON transaction_shares BEGIN
  UPDATE transactions SET shared_out_minor=(SELECT coalesce(sum(amount_minor),0) FROM transaction_shares WHERE owner_user_id=NEW.owner_user_id AND transaction_id=NEW.transaction_id AND status='active')
    WHERE user_id=NEW.owner_user_id AND id=NEW.transaction_id AND split_method IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER shares_delete AFTER DELETE ON transaction_shares BEGIN
  UPDATE transactions SET shared_out_minor=(SELECT coalesce(sum(amount_minor),0) FROM transaction_shares WHERE owner_user_id=OLD.owner_user_id AND transaction_id=OLD.transaction_id AND status='active')
    WHERE user_id=OLD.owner_user_id AND id=OLD.transaction_id AND split_method IS NOT NULL;
END;
--> statement-breakpoint
