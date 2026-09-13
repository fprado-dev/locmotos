-- Um locatário em no máximo uma locação ativa por vez.
--
-- A tela já supunha isso antes de o banco garantir: o painel diz "Locação
-- atual" no singular, a lista mostra uma placa por pessoa, e a leitura pega a
-- primeira que vier. Sem este índice, uma segunda locação aberta por um POST
-- fabricado não seria recusada — ela deixaria a leitura escolhendo em silêncio
-- qual das duas mostrar.
--
-- É a regra que o desenho de Frota e Locatários descreve, e não um número
-- inventado: se o dono da locadora disser que quer alugar duas motos para a
-- mesma pessoa, some este índice e a leitura passa a listar.
create unique index rentals_active_renter_key
  on public.rentals (renter_id)
  where ended_on is null;
