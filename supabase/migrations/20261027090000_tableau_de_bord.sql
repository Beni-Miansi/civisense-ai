-- =============================================================================
-- CiviSense AI — Étape 5 : tableau de bord, affectation, notifications in-app
--   * notifications (créées par trigger à partir de l'historique)
--   * vue signalements_gestion (priorité effective, zone) sous RLS
--   * fonctions statistiques_tableau_de_bord, charge_agents, candidats_doublon
-- Les transitions de statut restent contrôlées par les triggers de la migration initiale.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Notifications in-app
-- -----------------------------------------------------------------------------

create table public.notifications (
  id               uuid primary key default gen_random_uuid(),
  destinataire_id  uuid not null references public.profils (id) on delete cascade,
  signalement_id   uuid references public.signalements (id) on delete cascade,
  titre            text not null,           -- titre du signalement concerné
  message          text not null,
  lue              boolean not null default false,
  created_at       timestamptz not null default now()
);

create index notifications_destinataire_idx on public.notifications (destinataire_id, lue, created_at desc);

-- Chaque ligne d'historique peut produire une notification :
--   statut      → auteur du signalement (+ agent en cas de réouverture)
--   affectation → agent affecté
--   commentaire public → auteur du signalement
-- Jamais de notification pour l'auteur de l'action elle-même.
create function public.notifier_depuis_historique()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_auteur  uuid;
  v_titre   text;
  v_acteur  uuid := coalesce(auth.uid(), new.auteur_id);
  v_agent   uuid;
  v_message text;
begin
  select s.auteur_id, s.titre into v_auteur, v_titre
    from public.signalements s where s.id = new.signalement_id;
  if not found then
    return null;
  end if;

  if new.action = 'statut' then
    v_message := case new.nouvelle_valeur
      when 'a_verifier' then 'Votre signalement est en cours de vérification par la mairie.'
      when 'valide'     then 'Votre signalement a été validé par la mairie.'
      when 'affecte'    then 'Une équipe a été chargée de l''intervention.'
      when 'en_cours'   then case when new.ancienne_valeur = 'resolu'
                                  then 'Le signalement a été rouvert : l''intervention reprend.'
                                  else 'L''équipe intervient sur place.' end
      when 'resolu'     then 'L''intervention est terminée. Le problème est-il bien réglé ?'
      when 'cloture'    then 'Votre signalement est clôturé. Merci pour votre contribution.'
      when 'rejete'     then 'Votre signalement n''a pas été retenu. Motif : '
                             || coalesce(new.details ->> 'justification', 'non précisé') || '.'
      when 'doublon'    then 'Ce problème était déjà signalé : son suivi se poursuit sur le signalement d''origine.'
    end;
    if v_message is not null and v_auteur is distinct from v_acteur then
      insert into public.notifications (destinataire_id, signalement_id, titre, message, created_at)
      values (v_auteur, new.signalement_id, v_titre, v_message, new.created_at);
    end if;

    if new.ancienne_valeur = 'resolu' and new.nouvelle_valeur = 'en_cours' then
      select i.agent_id into v_agent
        from public.interventions i where i.signalement_id = new.signalement_id and i.active;
      if v_agent is not null and v_agent is distinct from v_acteur then
        insert into public.notifications (destinataire_id, signalement_id, titre, message, created_at)
        values (v_agent, new.signalement_id, v_titre, 'Intervention rouverte par le responsable : à reprendre.', new.created_at);
      end if;
    end if;

  elsif new.action = 'affectation' then
    v_agent := (new.details ->> 'agent_id')::uuid;
    if v_agent is not null and v_agent is distinct from v_acteur then
      insert into public.notifications (destinataire_id, signalement_id, titre, message, created_at)
      values (v_agent, new.signalement_id, v_titre, 'Nouvelle intervention à réaliser.', new.created_at);
    end if;

  elsif new.action = 'commentaire' and not new.interne then
    if v_auteur is distinct from new.auteur_id then
      insert into public.notifications (destinataire_id, signalement_id, titre, message, created_at)
      values (v_auteur, new.signalement_id, v_titre, 'Nouveau commentaire sur votre signalement.', new.created_at);
    end if;
  end if;

  return null;
end;
$$;

create trigger historique_notifier
  after insert on public.historique
  for each row execute function public.notifier_depuis_historique();

alter table public.notifications enable row level security;

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (lue) on public.notifications to authenticated;   -- seule la colonne « lue » est modifiable

create policy "notifications : lecture des siennes" on public.notifications
  for select to authenticated using (destinataire_id = (select auth.uid()));
create policy "notifications : marquer comme lues" on public.notifications
  for update to authenticated
  using (destinataire_id = (select auth.uid()))
  with check (destinataire_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- 2. Vue de gestion : priorité effective (validée, sinon suggérée) et zone.
--    security_invoker : la RLS de signalements s'applique à l'appelant.
-- -----------------------------------------------------------------------------

create view public.signalements_gestion with (security_invoker = true) as
select
  s.id,
  s.titre,
  s.categorie,
  s.statut,
  s.zone_id,
  z.nom as zone_nom,
  s.adresse,
  s.latitude,
  s.longitude,
  s.nb_soutiens,
  s.score_priorite,
  s.priorite_suggeree,
  s.priorite_validee,
  coalesce(s.priorite_validee, s.priorite_suggeree) as priorite,
  case coalesce(s.priorite_validee, s.priorite_suggeree)
    when 'haute' then 3 when 'moyenne' then 2 when 'basse' then 1 else 0
  end as rang_priorite,
  s.created_at,
  s.resolu_le,
  s.cloture_le
from public.signalements s
left join public.zones z on z.id = s.zone_id;

revoke all on public.signalements_gestion from anon, authenticated;
grant select on public.signalements_gestion to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Indicateurs du tableau de bord (calculés en SQL, sous RLS de l'appelant)
--    Délai de résolution = resolu_le - created_at, médiane en heures.
-- -----------------------------------------------------------------------------

create function public.statistiques_tableau_de_bord()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with s as (
    select statut, categorie, zone_id, created_at, resolu_le from public.signalements
  ),
  actifs as (
    select * from s where statut not in ('rejete', 'doublon')
  )
  select jsonb_build_object(
    'total',       (select count(*) from s),
    'en_attente',  (select count(*) from s where statut in ('nouveau', 'a_verifier')),
    'a_affecter',  (select count(*) from s where statut = 'valide'),
    'en_cours',    (select count(*) from s where statut in ('affecte', 'en_cours')),
    'resolus',     (select count(*) from s where statut in ('resolu', 'cloture')),
    'rejetes',     (select count(*) from s where statut in ('rejete', 'doublon')),
    'delai_median_heures', (
      select round((percentile_cont(0.5) within group (
               order by extract(epoch from resolu_le - created_at) / 3600))::numeric, 1)
      from s where resolu_le is not null
    ),
    'par_categorie', (
      select coalesce(jsonb_agg(jsonb_build_object('categorie', categorie, 'nb', nb) order by nb desc, categorie), '[]'::jsonb)
      from (select categorie, count(*) as nb from actifs group by categorie) c
    ),
    'par_zone', (
      select coalesce(jsonb_agg(jsonb_build_object('zone', zone, 'nb', nb) order by nb desc, zone), '[]'::jsonb)
      from (
        select coalesce(z.nom, 'Hors zone') as zone, count(*) as nb
        from actifs a left join public.zones z on z.id = a.zone_id
        group by 1
      ) zz
    )
  );
$$;

-- Agents actifs et nombre d'interventions en cours (affecte + en_cours), les moins chargés d'abord.
create function public.charge_agents()
returns table (id uuid, nom_complet text, nb_en_cours bigint)
language sql stable security invoker
set search_path = ''
as $$
  select p.id, p.nom_complet, count(s.id) as nb_en_cours
  from public.profils p
  left join public.interventions i on i.agent_id = p.id and i.active
  left join public.signalements s on s.id = i.signalement_id and s.statut in ('affecte', 'en_cours')
  where p.role = 'agent' and p.actif
  group by p.id, p.nom_complet
  order by nb_en_cours, p.nom_complet;
$$;

-- Signalements d'origine possibles pour marquer un doublon : même catégorie, à moins de 300 m.
-- (La suggestion automatique < 50 m / < 72 h viendra à l'étape 7.)
create function public.candidats_doublon(p_signalement uuid)
returns table (id uuid, titre text, statut public.statut_signalement, created_at timestamptz, distance_m integer)
language sql stable security invoker
set search_path = ''
as $$
  select o.id, o.titre, o.statut, o.created_at,
         round(public.distance_m(s.latitude, s.longitude, o.latitude, o.longitude))::integer as distance_m
  from public.signalements s
  join public.signalements o
    on o.id <> s.id and o.categorie = s.categorie and o.statut not in ('rejete', 'doublon')
  where s.id = p_signalement
    and public.distance_m(s.latitude, s.longitude, o.latitude, o.longitude) <= 300
  order by distance_m, o.created_at
  limit 10;
$$;

revoke execute on function public.statistiques_tableau_de_bord() from public, anon;
revoke execute on function public.charge_agents() from public, anon;
revoke execute on function public.candidats_doublon(uuid) from public, anon;
grant execute on function public.statistiques_tableau_de_bord() to authenticated;
grant execute on function public.charge_agents() to authenticated;
grant execute on function public.candidats_doublon(uuid) to authenticated;
