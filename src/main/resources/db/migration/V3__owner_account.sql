-- Cuenta del dueño (uid de Firebase): el chat de Telegram al que se le avisa y el enlace de vinculación pendiente.
-- El enlace es de un solo uso y caduca; link_token UNIQUE permite buscar la cuenta por él (los NULL no chocan).
CREATE TABLE owner_account
(
    uid                   VARCHAR(128) PRIMARY KEY,
    telegram_chat_id      BIGINT,
    link_token            VARCHAR(64) UNIQUE,
    link_token_expires_at TIMESTAMPTZ
);
