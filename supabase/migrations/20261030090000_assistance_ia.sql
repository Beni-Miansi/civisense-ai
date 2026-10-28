-- =============================================================================
-- CiviSense AI — Assistance IA : mesurer ce que fait l'IA (cahier des charges §4)
--   * classification : suggestions retenues / corrigées par les citoyens (§4.1, §4.5)
--   * doublons       : suggérés, confirmés, soutiens « Moi aussi » (§4.2)
--   * priorité       : suggestions confirmées / modifiées par un responsable (§4.3, §4.5)
--   * récurrences    : zones × catégories qui reviennent sur 30 jours (§4.4)
-- Sous RLS de l'appelant (security invoker) : réservé de fait aux gestionnaires.
-- =============================================================================

create function public.statistiques_ia()
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
begin
  if not public.est_gestionnaire() then
    raise exception 'Réservé aux responsables' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'classification', (
      select jsonb_build_object(
        'total',     count(*),
        'retenues',  count(*) filter (where s.categorie = s.categorie_suggeree),
        'corrections', coalesce((
          select jsonb_agg(jsonb_build_object('suggeree', c.categorie_suggeree, 'retenue', c.categorie, 'nb', c.nb)
                           order by c.nb desc)
          from (
            select categorie_suggeree, categorie, count(*) as nb
            from public.signalements
            where categorie_suggeree is not null and categorie <> categorie_suggeree
            group by 1, 2
          ) c
        ), '[]'::jsonb)
      )
      from public.signalements s
      where s.categorie_suggeree is not null
    ),
    'doublons', jsonb_build_object(
      'suggeres',  (select count(*) from public.signalements_gestion g where g.doublon_possible),
      'confirmes', (select count(*) from public.signalements where statut = 'doublon'),
      'soutiens',  (select coalesce(sum(nb_soutiens), 0) from public.signalements),
      'soutenus',  (select count(*) from public.signalements where nb_soutiens > 0)
    ),
    'priorite', (
      select jsonb_build_object(
        'validees',  count(*),
        'confirmees', count(*) filter (where h.nouvelle_valeur = h.details ->> 'priorite_suggeree'),
        'a_valider', (select count(*) from public.signalements
                      where priorite_validee is null and statut in ('nouveau', 'a_verifier', 'valide'))
      )
      from public.historique h
      where h.action = 'priorite'
    ),
    'recurrences', coalesce((
      select jsonb_agg(jsonb_build_object(
               'zone', r.zone, 'zone_id', r.zone_id, 'categorie', r.categorie, 'nb', r.nb, 'ouverts', r.ouverts, 'dernier', r.dernier)
             order by r.nb desc, r.ouverts desc)
      from (
        select coalesce(z.nom, 'Hors zone') as zone, z.id as zone_id, s.categorie, count(*) as nb,
               count(*) filter (where s.statut not in ('resolu', 'cloture')) as ouverts,
               max(s.created_at) as dernier
        from public.signalements s
        left join public.zones z on z.id = s.zone_id
        where s.created_at > now() - interval '30 days'
          and s.statut not in ('rejete', 'doublon')
        group by 1, 2, 3
        having count(*) >= 3
        order by 4 desc
        limit 5
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.statistiques_ia() from public, anon;
grant execute on function public.statistiques_ia() to authenticated;
