CREATE TABLE comments (
 id TEXT PRIMARY KEY,
 article TEXT NOT NULL,
 name TEXT NOT NULL,
 body TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at INTEGER NOT NULL,
 moderated_at INTEGER,
 nonce TEXT NOT NULL UNIQUE
);
CREATE INDEX comments_article_status ON comments(article,status,created_at);
CREATE INDEX comments_queue ON comments(status,created_at);
CREATE TABLE limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
