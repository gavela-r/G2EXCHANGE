-- Sólo mediante capital-dev.cjs, tras verificar esquema y duplicados.
-- Los identificadores existentes y las claves foráneas por id no cambian.
CREATE TABLE IF NOT EXISTS capital_instrument_alias (
 id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
 instrumento_id int NOT NULL, market_id int NOT NULL,
 provider varchar(40) NOT NULL, external_identifier varchar(150) NOT NULL,
 share_class varchar(80) NOT NULL, identity_evidence_id bigint unsigned NOT NULL,
 created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_cap_alias(provider,external_identifier,market_id,share_class),
 KEY ix_cap_alias_inst(instrumento_id),
 FOREIGN KEY(instrumento_id) REFERENCES instrumento(id),
 FOREIGN KEY(market_id) REFERENCES mercado(id),
 FOREIGN KEY(identity_evidence_id) REFERENCES capital_identity_evidence(id)
) ENGINE=InnoDB;
-- El runner ejecuta cada ALTER sólo si el índice tiene el estado esperado.
ALTER TABLE instrumento ADD UNIQUE KEY uq_instrument_market_ticker(mercado_id,ticker);
ALTER TABLE instrumento ADD KEY ix_instrument_ticker_lookup(ticker);
ALTER TABLE instrumento DROP INDEX ticker;
