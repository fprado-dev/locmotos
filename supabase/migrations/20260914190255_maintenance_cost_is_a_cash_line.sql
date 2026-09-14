-- O custo da manutenção passa a ser linha do caixa, e não uma segunda
-- digitação. Não há tabela espelho nem coluna de ligação: a despesa É a
-- manutenção, lida de lá. Corrigir o custo corrige o extrato; apagar a ordem
-- de serviço tira a linha. Duas verdades nunca chegam a existir.
--
-- `kind` ganha um terceiro valor. Quem soma continua olhando só se é
-- 'payment' — o resto é saída —, e quem desenha a tela usa o terceiro valor
-- para levar de volta à ficha da moto em vez de oferecer "apagar" numa linha
-- que não mora em `expenses`.
create or replace view public.cash_entries
with (security_invoker = on) as
 SELECT 'payment'::text AS kind,
    p.id,
    p.tenant_id,
    p.received_on AS happened_on,
    c.amount,
    'rent'::text AS category,
    NULL::text AS description,
    c.cycle_start,
    c.cycle_end,
    v.id AS vehicle_id,
    v.plate,
    r.id AS renter_id,
    r.name AS renter_name,
    p.created_by_name
   FROM payments p
     JOIN charges c ON c.id = p.charge_id
     JOIN rentals l ON l.id = c.rental_id
     JOIN vehicles v ON v.id = l.vehicle_id
     JOIN renters r ON r.id = l.renter_id
  WHERE p.reversed_at IS NULL
UNION ALL
 SELECT 'expense'::text AS kind,
    e.id,
    e.tenant_id,
    e.spent_on AS happened_on,
    e.amount,
    e.category,
    e.description,
    NULL::date AS cycle_start,
    NULL::date AS cycle_end,
    e.vehicle_id,
    v.plate,
    NULL::uuid AS renter_id,
    NULL::text AS renter_name,
    e.created_by_name
   FROM expenses e
     LEFT JOIN vehicles v ON v.id = e.vehicle_id
UNION ALL
 -- O dia do dinheiro é o da saída da oficina — é quando o serviço terminou e
 -- a nota fecha. Enquanto a moto está lá, o custo já digitado conta no dia da
 -- entrada: adiantamento de oficina é dinheiro que saiu, e escondê-lo até a
 -- moto voltar faria o caixa do mês mentir.
 SELECT 'maintenance'::text AS kind,
    m.id,
    m.tenant_id,
    COALESCE(m.left_on, m.entered_on) AS happened_on,
    m.cost AS amount,
    'maintenance'::text AS category,
    m.description,
    NULL::date AS cycle_start,
    NULL::date AS cycle_end,
    m.vehicle_id,
    v.plate,
    NULL::uuid AS renter_id,
    NULL::text AS renter_name,
    m.created_by_name
   FROM maintenances m
     JOIN vehicles v ON v.id = m.vehicle_id
  WHERE m.cost IS NOT NULL;
