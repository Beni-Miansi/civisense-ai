-- =============================================================================
-- CiviSense AI — Étape 7 : priorité explicable, doublons, validation de priorité
--   * calculer_priorite()      : grille de CLAUDE.md + soutiens, détail en JSON (critère, points, explication)
--   * recalcul automatique     : à la création, à chaque modification (soutien, statut…), voisins inclus
--   * recalculer_priorites()   : recalcul global (ancienneté), planifié toutes les heures si pg_cron est disponible
--   * valider_priorite()       : validation / modification par un responsable, motif obligatoire, tracée
--   * doublons_possibles()     : même catégorie, < 50 m, < 72 h, statut non clos + similarité de texte (pg_trgm)
--   * signalements_gestion     : + doublon_possible, detail_score
-- Distances : formule de haversine (public.distance_m) — PostGIS n'apporte rien à l'échelle d'un quartier.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;


-- -----------------------------------------------------------------------------
-- 1. Calcul de la priorité explicable
--    Gravité 1–3 · zone à risque +2 · ≥ 3 similaires à < 100 m +2 · > 72 h sans prise en charge +1
--    · ≥ 3 soutiens « Moi aussi » +1. Score ≥ 6 → haute · 4–5 → moyenne · ≤ 3 → basse.
--    SECURITY DEFINER : le décompte des voisins porte sur tous les signalements (pas seulement
--    ceux visibles par l'appelant) ; seuls des agrégats sont renvoyés.
-- -----------------------------------------------------------------------------

create function public.calculer_priorite(
  p_id uuid,
  p_categorie public.categorie_signalement,
  p_zone uuid,
  p_lat double precision,
  p_lng double precision,
  p_statut public.statut_signalement,
  p_cree_le timestamptz,
  p_nb_soutiens integer
)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_libelle    text;
  v_gravite    integer;
  v_raison     text;
  v_zone       public.zones;
  v_voisins    integer;
  v_heures     numeric := extract(epoch from now() - p_cree_le) / 3600;
  v_non_traite boolean;
  v_criteres   jsonb := '[]'::jsonb;
  v_points     integer;
  v_total      integer := 0;
begin
  -- Gravité de la catégorie
  select g.libelle, g.points, g.raison into v_libelle, v_gravite, v_raison
  from (values
    ('assainissement'::public.categorie_signalement, 'Assainissement', 3, 'risque sanitaire et d''inondation'),
    ('dechets',     'Déchets',   2, 'nuisances et risque sanitaire'),
    ('voirie',      'Voirie',    2, 'risque d''accident'),
    ('eclairage',   'Éclairage', 1, 'gêne surtout la nuit'),
    ('autre',       'Autre',     1, 'gravité par défaut')
  ) as g (categorie, libelle, points, raison)
  where g.categorie = p_categorie;
  v_total := v_gravite;
  v_criteres := v_criteres || jsonb_build_object(
    'code', 'gravite', 'critere', 'Gravité de la catégorie', 'points', v_gravite, 'max', 3,
    'explication', format('%s : %s.', v_libelle, v_raison));

  -- Zone à risque
  select * into v_zone from public.zones z where z.id = p_zone;
  v_points := case when v_zone.est_zone_risque then 2 else 0 end;
  v_total := v_total + v_points;
  v_criteres := v_criteres || jsonb_build_object(
    'code', 'zone_risque', 'critere', 'Zone à risque', 'points', v_points, 'max', 2,
    'explication', case
      when v_zone.id is null then 'Hors des zones référencées.'
      when v_zone.est_zone_risque then format('%s est classée %s.', v_zone.nom, case v_zone.type_risque
        when 'inondable' then 'zone inondable' when 'ecole' then 'abords d''école' when 'marche' then 'zone de marché'
        else 'zone à risque' end)
      else format('%s : pas de risque particulier.', v_zone.nom)
    end);

  -- Signalements similaires (même catégorie, < 100 m, hors rejetés et doublons, toutes dates)
  select count(*) into v_voisins
  from public.signalements o
  where o.id is distinct from p_id
    and o.categorie = p_categorie
    and o.statut not in ('rejete', 'doublon')
    and o.latitude  between p_lat - 0.001 and p_lat + 0.001          -- pré-filtre (~110 m)
    and o.longitude between p_lng - 0.0011 and p_lng + 0.0011
    and public.distance_m(p_lat, p_lng, o.latitude, o.longitude) < 100;
  v_points := case when v_voisins >= 3 then 2 else 0 end;
  v_total := v_total + v_points;
  v_criteres := v_criteres || jsonb_build_object(
    'code', 'similaires', 'critere', 'Signalements similaires à moins de 100 m', 'points', v_points, 'max', 2,
    'explication', case v_voisins
      when 0 then format('Aucun autre signalement %s à moins de 100 m (seuil : 3).', v_libelle)
      when 1 then format('1 autre signalement %s à moins de 100 m (seuil : 3).', v_libelle)
      else format('%s autres signalements %s à moins de 100 m%s.', v_voisins, v_libelle,
                  case when v_voisins >= 3 then ' : problème récurrent' else ' (seuil : 3)' end)
    end);

  -- Ancienneté sans prise en charge
  v_non_traite := p_statut in ('nouveau', 'a_verifier', 'valide', 'affecte') and v_heures > 72;
  v_points := case when v_non_traite then 1 else 0 end;
  v_total := v_total + v_points;
  v_criteres := v_criteres || jsonb_build_object(
    'code', 'anciennete', 'critere', 'Non traité depuis plus de 72 h', 'points', v_points, 'max', 1,
    'explication', case
      when v_non_traite then format('Signalé il y a %s jours, intervention pas encore démarrée.', floor(v_heures / 24))
      when p_statut in ('en_cours', 'resolu', 'cloture') then 'Pris en charge.'
      when p_statut in ('rejete', 'doublon') then 'Signalement écarté.'
      else format('Signalé il y a %s h (seuil : 72 h).', floor(v_heures))
    end);

  -- Soutiens « Moi aussi »
  v_points := case when p_nb_soutiens >= 3 then 1 else 0 end;
  v_total := v_total + v_points;
  v_criteres := v_criteres || jsonb_build_object(
    'code', 'soutiens', 'critere', 'Soutiens « Moi aussi »', 'points', v_points, 'max', 1,
    'explication', case p_nb_soutiens
      when 0 then 'Aucun soutien (seuil : 3).'
      when 1 then '1 citoyen confirme le problème (seuil : 3).'
      else format('%s citoyens confirment le problème%s.', p_nb_soutiens, case when p_nb_soutiens >= 3 then '' else ' (seuil : 3)' end)
    end);

  return jsonb_build_object(
    'version', 2,
    'total', v_total,
    'max', 9,
    'niveau', case when v_total >= 6 then 'haute' when v_total >= 4 then 'moyenne' else 'basse' end,
    'criteres', v_criteres,
    'calcule_le', now()
  );
end;
$$;

revoke execute on function public.calculer_priorite(uuid, public.categorie_signalement, uuid, double precision,
  double precision, public.statut_signalement, timestamptz, integer) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. Recalcul automatique
--    BEFORE INSERT/UPDATE : score de la ligne (nommé pour passer après les gardes
--    signalements_avant_* et signalements_preuve_resolution, ordre alphabétique).
--    AFTER : les voisins de même catégorie sont recalculés (décompte « similaires »).
-- -----------------------------------------------------------------------------

create function public.signalements_priorite()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_detail jsonb;
begin
  -- La validation humaine passe par valider_priorite() (motif obligatoire, tracé).
  if tg_op = 'UPDATE' and new.priorite_validee is distinct from old.priorite_validee
     and auth.uid() is not null
     and coalesce(current_setting('civisense.motif_priorite', true), '') = '' then
    raise exception 'Un motif est obligatoire pour valider ou modifier la priorité' using errcode = 'P0001';
  end if;

  v_detail := public.calculer_priorite(new.id, new.categorie, new.zone_id, new.latitude, new.longitude,
                                       new.statut, new.created_at, new.nb_soutiens);
  new.score_priorite    := (v_detail ->> 'total')::smallint;
  new.priorite_suggeree := (v_detail ->> 'niveau')::public.niveau_priorite;
  new.detail_score      := v_detail;
  return new;
end;
$$;

create trigger signalements_priorite
  before insert or update on public.signalements
  for each row execute function public.signalements_priorite();

-- Recalcule les signalements voisins (même catégorie, < 100 m) d'une position donnée.
create function public.recalculer_voisins(p_id uuid, p_categorie public.categorie_signalement,
                                          p_lat double precision, p_lng double precision)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_prec text := coalesce(current_setting('civisense.maj_interne', true), '');
begin
  perform set_config('civisense.maj_interne', 'on', true);
  update public.signalements o
     set updated_at = o.updated_at                       -- le trigger BEFORE recalcule le score
   where o.id <> p_id
     and o.categorie = p_categorie
     and o.latitude  between p_lat - 0.001 and p_lat + 0.001
     and o.longitude between p_lng - 0.0011 and p_lng + 0.0011
     and public.distance_m(p_lat, p_lng, o.latitude, o.longitude) < 100;
  perform set_config('civisense.maj_interne', v_prec, true);
end;
$$;

revoke execute on function public.recalculer_voisins(uuid, public.categorie_signalement, double precision, double precision)
  from public, anon, authenticated;

create function public.signalements_priorite_voisins()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.recalculer_voisins(new.id, new.categorie, new.latitude, new.longitude);
  if tg_op = 'UPDATE' and (old.categorie is distinct from new.categorie
                           or old.latitude is distinct from new.latitude
                           or old.longitude is distinct from new.longitude) then
    perform public.recalculer_voisins(old.id, old.categorie, old.latitude, old.longitude);
  end if;
  return null;
end;
$$;

create trigger signalements_priorite_voisins_insert
  after insert on public.signalements
  for each row execute function public.signalements_priorite_voisins();

-- Seuls ces changements modifient le décompte « similaires » des voisins (rejet / doublon les retirent).
create trigger signalements_priorite_voisins_update
  after update on public.signalements
  for each row
  when (old.categorie is distinct from new.categorie
        or old.latitude is distinct from new.latitude
        or old.longitude is distinct from new.longitude
        or (old.statut in ('rejete', 'doublon')) is distinct from (new.statut in ('rejete', 'doublon')))
  execute function public.signalements_priorite_voisins();

-- Recalcul global (critère d'ancienneté). Ne réécrit que les lignes dont le détail change.
-- Appelable par les gestionnaires et par le service (seed, tâche planifiée).
create function public.recalculer_priorites()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nb   integer;
  v_prec text := coalesce(current_setting('civisense.maj_interne', true), '');
begin
  if auth.uid() is not null and not public.est_gestionnaire() then
    raise exception 'Réservé aux responsables' using errcode = '42501';
  end if;
  perform set_config('civisense.maj_interne', 'on', true);
  update public.signalements s
     set updated_at = s.updated_at
   where (s.detail_score - 'calcule_le') is distinct from (
           public.calculer_priorite(s.id, s.categorie, s.zone_id, s.latitude, s.longitude,
                                    s.statut, s.created_at, s.nb_soutiens) - 'calcule_le');
  get diagnostics v_nb = row_count;
  perform set_config('civisense.maj_interne', v_prec, true);
  return v_nb;
end;
$$;

revoke execute on function public.recalculer_priorites() from public, anon;
grant execute on function public.recalculer_priorites() to authenticated, service_role;

-- Tâche horaire si pg_cron est disponible (sinon : recalcul à l'ouverture du tableau de bord).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('civisense-recalcul-priorites', '7 * * * *', 'select public.recalculer_priorites()');
exception when others then
  raise notice 'pg_cron indisponible (%), recalcul planifié ignoré', sqlerrm;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. Validation humaine de la priorité (motif obligatoire, tracé dans l'historique)
-- -----------------------------------------------------------------------------

create function public.valider_priorite(p_signalement uuid, p_niveau public.niveau_priorite, p_motif text)
returns void
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_s public.signalements;
begin
  if not public.est_gestionnaire() then
    raise exception 'Seul un responsable peut valider la priorité' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_motif, ''))) < 3 then
    raise exception 'Indiquez le motif de votre décision' using errcode = 'P0001';
  end if;
  select * into v_s from public.signalements where id = p_signalement;
  if not found then
    raise exception 'Signalement introuvable' using errcode = 'P0001';
  end if;
  if v_s.statut in ('cloture', 'rejete', 'doublon') then
    raise exception 'Signalement clos : la priorité ne peut plus être modifiée' using errcode = 'P0001';
  end if;
  if v_s.priorite_validee = p_niveau then
    raise exception 'La priorité est déjà validée à ce niveau' using errcode = 'P0001';
  end if;

  perform set_config('civisense.motif_priorite', trim(p_motif), true);
  update public.signalements set priorite_validee = p_niveau where id = p_signalement;
  perform set_config('civisense.motif_priorite', '', true);
end;
$$;

revoke execute on function public.valider_priorite(uuid, public.niveau_priorite, text) from public, anon;
grant execute on function public.valider_priorite(uuid, public.niveau_priorite, text) to authenticated;

-- Journalisation : le motif de la décision rejoint l'historique (reste du corps inchangé).
create or replace function public.signalements_journaliser()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.historique (signalement_id, auteur_id, action, nouvelle_valeur, created_at)
    values (new.id, coalesce(auth.uid(), new.auteur_id), 'creation', new.statut::text, new.created_at);
    return new;
  end if;

  if new.statut is distinct from old.statut then
    insert into public.historique (signalement_id, auteur_id, action, ancienne_valeur, nouvelle_valeur, details)
    values (
      new.id, auth.uid(), 'statut', old.statut::text, new.statut::text,
      case when new.statut in ('rejete', 'doublon')
           then jsonb_build_object('justification', new.justification, 'doublon_de', new.doublon_de)
      end
    );
  end if;

  if new.priorite_validee is distinct from old.priorite_validee then
    insert into public.historique (signalement_id, auteur_id, action, ancienne_valeur, nouvelle_valeur, details, interne)
    values (
      new.id, auth.uid(), 'priorite',
      coalesce(old.priorite_validee, old.priorite_suggeree)::text, new.priorite_validee::text,
      jsonb_build_object(
        'priorite_suggeree', new.priorite_suggeree,
        'score', new.score_priorite,
        'justification', nullif(current_setting('civisense.motif_priorite', true), '')
      ),
      true
    );
  end if;
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. Doublons : jamais supprimés, seulement suggérés
--    Règle : même catégorie, < 50 m, < 72 h d'écart, statut non clos (ni résolu, clôturé, rejeté, doublon).
-- -----------------------------------------------------------------------------

-- Avant création (formulaire citoyen) : SECURITY DEFINER car le citoyen ne voit pas les signalements
-- des autres ; on ne renvoie ni position exacte, ni auteur, ni description.
create function public.doublons_possibles(
  p_categorie public.categorie_signalement,
  p_latitude double precision,
  p_longitude double precision,
  p_texte text default ''
)
returns table (
  id uuid, titre text, statut public.statut_signalement, created_at timestamptz,
  distance_m integer, similarite real, nb_soutiens integer, deja_soutenu boolean, est_auteur boolean
)
language sql stable security definer
set search_path = ''
as $$
  select o.id, o.titre, o.statut, o.created_at,
         round(public.distance_m(p_latitude, p_longitude, o.latitude, o.longitude))::integer,
         round(extensions.similarity(lower(o.titre || ' ' || o.description), lower(coalesce(p_texte, '')))::numeric, 2)::real,
         o.nb_soutiens,
         exists (select 1 from public.soutiens so where so.signalement_id = o.id and so.citoyen_id = auth.uid()),
         o.auteur_id = auth.uid()
  from public.signalements o
  where public.role_courant() is not null
    and o.categorie = p_categorie
    and o.statut not in ('resolu', 'cloture', 'rejete', 'doublon')
    and o.created_at > now() - interval '72 hours'
    and o.latitude  between p_latitude - 0.0005 and p_latitude + 0.0005
    and o.longitude between p_longitude - 0.0006 and p_longitude + 0.0006
    and public.distance_m(p_latitude, p_longitude, o.latitude, o.longitude) < 50
  order by 5, 6 desc
  limit 5;
$$;

revoke execute on function public.doublons_possibles(public.categorie_signalement, double precision, double precision, text)
  from public, anon;
grant execute on function public.doublons_possibles(public.categorie_signalement, double precision, double precision, text)
  to authenticated;

-- Côté responsable : origines possibles d'un doublon (même catégorie, < 300 m), celles qui
-- respectent la règle sont marquées « suggere » et listées en premier.
drop function public.candidats_doublon(uuid);
create function public.candidats_doublon(p_signalement uuid)
returns table (
  id uuid, titre text, statut public.statut_signalement, created_at timestamptz,
  distance_m integer, similarite real, suggere boolean
)
language sql stable security invoker
set search_path = ''
as $$
  select o.id, o.titre, o.statut, o.created_at, d.distance_m,
         round(extensions.similarity(lower(o.titre || ' ' || o.description), lower(s.titre || ' ' || s.description))::numeric, 2)::real,
         d.distance_m < 50
           and abs(extract(epoch from o.created_at - s.created_at)) < 72 * 3600
           and o.statut not in ('resolu', 'cloture')
  from public.signalements s
  join public.signalements o
    on o.id <> s.id and o.categorie = s.categorie and o.statut not in ('rejete', 'doublon')
  cross join lateral (
    select round(public.distance_m(s.latitude, s.longitude, o.latitude, o.longitude))::integer as distance_m
  ) d
  where s.id = p_signalement
    and d.distance_m <= 300
  order by 7 desc, d.distance_m, o.created_at
  limit 10;
$$;

revoke execute on function public.candidats_doublon(uuid) from public, anon;
grant execute on function public.candidats_doublon(uuid) to authenticated;

-- Vue de gestion : + badge « Doublon possible » et détail du score (colonnes ajoutées en fin de vue).
create or replace view public.signalements_gestion with (security_invoker = true) as
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
  s.cloture_le,
  s.statut in ('nouveau', 'a_verifier', 'valide') and exists (
    select 1 from public.signalements o
    where o.id <> s.id
      and o.categorie = s.categorie
      and o.statut not in ('resolu', 'cloture', 'rejete', 'doublon')
      and abs(extract(epoch from o.created_at - s.created_at)) < 72 * 3600
      and public.distance_m(s.latitude, s.longitude, o.latitude, o.longitude) < 50
  ) as doublon_possible,
  s.detail_score
from public.signalements s
left join public.zones z on z.id = s.zone_id;


-- -----------------------------------------------------------------------------
-- 5. Mise à niveau des scores existants (détail version 2, soutiens pris en compte)
-- -----------------------------------------------------------------------------

-- Exécuté hors session utilisateur (auth.uid() nul) : les gardes ne s'appliquent pas.
update public.signalements set updated_at = updated_at;
