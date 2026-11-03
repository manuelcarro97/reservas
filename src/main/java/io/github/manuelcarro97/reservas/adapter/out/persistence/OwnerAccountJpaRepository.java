package io.github.manuelcarro97.reservas.adapter.out.persistence;

import java.time.Instant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

/**
 * Las escrituras son sentencias SQL únicas y no un {@code save()}: gastar el enlace tiene que ser atómico (leer y luego
 * escribir dejaría usarlo dos veces a la vez) y crear la cuenta si falta no debe pisar lo que ya tiene.
 */
interface OwnerAccountJpaRepository extends JpaRepository<OwnerAccountEntity, String> {

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query(nativeQuery = true, value = """
			INSERT INTO owner_account (uid, link_token, link_token_expires_at)
			VALUES (:uid, :token, :expiresAt)
			ON CONFLICT (uid) DO UPDATE
			SET link_token = EXCLUDED.link_token, link_token_expires_at = EXCLUDED.link_token_expires_at
			""")
	int saveLinkToken(String uid, String token, Instant expiresAt);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query(nativeQuery = true, value = """
			UPDATE owner_account
			SET telegram_chat_id = :chatId, link_token = NULL, link_token_expires_at = NULL
			WHERE link_token = :token AND link_token_expires_at > :now
			""")
	int consumeLinkToken(String token, long chatId, Instant now);

	@Query(nativeQuery = true, value = """
			SELECT EXISTS (
				SELECT 1 FROM owner_account WHERE link_token IS NOT NULL AND link_token_expires_at > :now
			)
			""")
	boolean hasPendingLink(Instant now);

	@Query(nativeQuery = true, value = """
			SELECT EXISTS (
				SELECT 1 FROM owner_account
				WHERE uid = :uid AND link_token IS NOT NULL AND link_token_expires_at > :now
			)
			""")
	boolean hasPendingLinkOf(String uid, Instant now);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query(nativeQuery = true, value = """
			UPDATE owner_account
			SET telegram_chat_id = NULL, link_token = NULL, link_token_expires_at = NULL
			WHERE uid = :uid
			""")
	int unlink(String uid);

	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query(nativeQuery = true, value = "DELETE FROM owner_account WHERE uid = :uid")
	int deleteAccount(String uid);

}
