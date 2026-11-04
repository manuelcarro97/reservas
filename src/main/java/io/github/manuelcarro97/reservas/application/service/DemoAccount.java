package io.github.manuelcarro97.reservas.application.service;

import org.springframework.stereotype.Component;

/**
 * Qué cuenta es la demo (la de los reclutadores): no puede borrarse ni vincular Telegram. El uid lo fija el seeder de
 * la demo al crear la cuenta; hasta entonces no hay ninguna.
 */
@Component
public class DemoAccount {

	/** Slug del único plano que la cuenta demo puede publicar; el seeder lo recrea cada noche. */
	public static final String PLAN_SLUG = "demo";

	private volatile String uid;

	public boolean isDemo(String ownerUid) {
		return ownerUid != null && ownerUid.equals(uid);
	}

	public void setUid(String uid) {
		this.uid = uid;
	}

}
