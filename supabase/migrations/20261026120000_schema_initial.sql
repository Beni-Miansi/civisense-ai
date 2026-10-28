-- =============================================================================
-- CiviSense AI — Schéma initial
-- Enums, tables, contraintes métier, triggers (historique, profils, transitions),
-- règles RLS par rôle et bucket Storage « photos ».
--
-- Conventions :
--   * auth.uid() IS NULL  => appel serveur (clé secrète, éditeur SQL, seed) :
--     les contrôles de rôle sont ignorés, les contraintes CHECK restent actives.
--   * Les mises à jour internes (compteur de soutiens) posent le paramètre de
--     transaction civisense.maj_interne = 'on' pour passer les gardes.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------

create type public.role_utilisateur as enum ('citoyen', 'agent', 'responsable', 'admin');

create type public.categorie_signalement as enum ('dechets', 'voirie', 'assainissement', 'eclairage', 'autre');

create type public.statut_signalement as enum (
  'nouveau', 'a_verifier', 'valide', 'affecte', 'en_cours', 'resolu', 'cloture',
  'rejete', 'doublon'
);

create type public.niveau_priorite as enum ('basse', 'moyenne', 'haute');

create type public.type_piece_jointe as enum ('avant', 'apres');

create type public.action_historique as enum ('creation', 'statut', 'affectation', 'commentaire', 'priorite');


-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

create table public.communes (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null unique,
  pays        text,
  centre_lat  double precision not null,
  centre_lng  double precision not null,
  perimetre   jsonb,                       -- GeoJSON facultatif
  created_at  timestamptz not null default now()
);

-- Zone = cercle (centre + rayon). Une zone à risque (inondable, école, marché)
-- donne +2 au score de priorité.
create table public.zones (
  id               uuid primary key default gen_random_uuid(),
  commune_id       uuid not null references public.communes (id) on delete cascade,
  nom              text not null,
  est_zone_risque  boolean not null default false,
  type_risque      text check (type_risque in ('inondable', 'ecole', 'marche')),
  centre_lat       double precision not null,
  centre_lng       double precision not null,
  rayon_m          integer not null default 300 check (rayon_m > 0),
  created_at       timestamptz not null default now(),
  unique (commune_id, nom),
  constraint zone_risque_typee check (not est_zone_risque or type_risque is not null)
);

create table public.profils (
  id           uuid primary key references auth.users (id) on delete cascade,
  nom_complet  text not null default '',
  telephone    text,
  role         public.role_utilisateur not null default 'citoyen',
  commune_id   uuid references public.communes (id) on delete set null,
  actif        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.signalements (
  id                       uuid primary key default gen_random_uuid(),
  auteur_id                uuid not null references public.profils (id) on delete cascade,
  commune_id               uuid references public.communes (id) on delete set null,
  zone_id                  uuid references public.zones (id) on delete set null,
  titre                    text not null check (char_length(trim(titre)) between 3 and 120),
  description              text not null default '' check (char_length(description) <= 2000),
  categorie                public.categorie_signalement not null,
  categorie_suggeree       public.categorie_signalement,          -- suggestion IA, pour mesurer les erreurs
  latitude                 double precision not null check (latitude between -90 and 90),
  longitude                double precision not null check (longitude between -180 and 180),
  adresse                  text,
  statut                   public.statut_signalement not null default 'nouveau',
  justification            text,                                  -- obligatoire pour rejete / doublon
  doublon_de               uuid references public.signalements (id),
  -- Priorité explicable : score + détail des critères, puis validation humaine
  score_priorite           smallint,
  priorite_suggeree        public.niveau_priorite,
  detail_score             jsonb,
  priorite_validee         public.niveau_priorite,
  priorite_validee_par     uuid references public.profils (id) on delete set null,
  priorite_validee_le      timestamptz,
  nb_soutiens              integer not null default 0 check (nb_soutiens >= 0),
  resolution_confirmee     boolean,                               -- réponse du citoyen après résolution
  resolution_confirmee_le  timestamptz,
  resolu_le                timestamptz,
  cloture_le               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint justification_obligatoire check (
    statut not in ('rejete', 'doublon') or char_length(trim(coalesce(justification, ''))) > 0
  ),
  constraint doublon_reference check (
    statut <> 'doublon' or (doublon_de is not null and doublon_de <> id)
  )
);

-- Photos : le fichier est dans le bucket « photos » sous {signalement_id}/{avant|apres}/{fichier}
create table public.pieces_jointes (
  id              uuid primary key default gen_random_uuid(),
  signalement_id  uuid not null references public.signalements (id) on delete cascade,
  type            public.type_piece_jointe not null,
  chemin          text not null unique,
  auteur_id       uuid references public.profils (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Une seule intervention active par signalement ; une réaffectation désactive la précédente.
create table public.interventions (
  id                 uuid primary key default gen_random_uuid(),
  signalement_id     uuid not null references public.signalements (id) on delete cascade,
  agent_id           uuid not null references public.profils (id),
  affecte_par        uuid references public.profils (id) on delete set null,
  date_affectation   timestamptz not null default now(),
  active             boolean not null default true,
  actions_realisees  text,
  date_fin           timestamptz,
  created_at         timestamptz not null default now()
);

create table public.commentaires (
  id              uuid primary key default gen_random_uuid(),
  signalement_id  uuid not null references public.signalements (id) on delete cascade,
  auteur_id       uuid not null references public.profils (id) on delete cascade,
  contenu         text not null check (char_length(trim(contenu)) between 1 and 2000),
  interne         boolean not null default false,   -- visible seulement par le personnel municipal
  created_at      timestamptz not null default now()
);

-- Écrite uniquement par les triggers (aucune policy d'écriture pour les utilisateurs).
create table public.historique (
  id               bigint generated always as identity primary key,
  signalement_id   uuid not null references public.signalements (id) on delete cascade,
  auteur_id        uuid references public.profils (id) on delete set null,
  action           public.action_historique not null,
  ancienne_valeur  text,
  nouvelle_valeur  text,
  details          jsonb,
  interne          boolean not null default false,
  created_at       timestamptz not null default now()
);

-- « Moi aussi »
create table public.soutiens (
  signalement_id  uuid not null references public.signalements (id) on delete cascade,
  citoyen_id      uuid not null references public.profils (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (signalement_id, citoyen_id)
);


-- -----------------------------------------------------------------------------
-- 3. Index
-- -----------------------------------------------------------------------------

create index signalements_statut_idx     on public.signalements (statut);
create index signalements_categorie_idx  on public.signalements (categorie);
create index signalements_zone_idx       on public.signalements (zone_id);
create index signalements_auteur_idx     on public.signalements (auteur_id);
create index signalements_created_idx    on public.signalements (created_at desc);
create index signalements_position_idx   on public.signalements (latitude, longitude);
create unique index interventions_une_active_idx on public.interventions (signalement_id) where active;
create index interventions_agent_idx     on public.interventions (agent_id) where active;
create index pieces_jointes_sig_idx      on public.pieces_jointes (signalement_id);
create index commentaires_sig_idx        on public.commentaires (signalement_id, created_at);
create index historique_sig_idx          on public.historique (signalement_id, created_at);
create index soutiens_citoyen_idx        on public.soutiens (citoyen_id);


-- -----------------------------------------------------------------------------
-- 4. Fonctions utilitaires
-- -----------------------------------------------------------------------------

-- Distance en mètres (haversine) : suffisant à l'échelle d'un quartier, sans PostGIS.
create function public.distance_m(lat1 double precision, lng1 double precision,
                                  lat2 double precision, lng2 double precision)
returns double precision
language sql immutable parallel safe
set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Rôle de l'utilisateur connecté (NULL si non connecté ou compte désactivé).
-- SECURITY DEFINER : évite la récursion RLS quand les policies de profils l'appellent.
create function public.role_courant()
returns public.role_utilisateur
language sql stable security definer
set search_path = ''
as $$
  select role from public.profils where id = (select auth.uid()) and actif;
$$;

create function public.est_gestionnaire()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(public.role_courant() in ('responsable', 'admin'), false);
$$;

-- Vrai si l'utilisateur connecté est l'agent de l'intervention active du signalement.
create function public.est_agent_de(p_signalement uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.interventions i
    where i.signalement_id = p_signalement
      and i.active
      and i.agent_id = (select auth.uid())
  );
$$;

-- Zone contenant le point ; les zones à risque passent en premier (elles sont
-- souvent incluses dans un quartier plus large).
create function public.zone_du_point(p_lat double precision, p_lng double precision)
returns uuid
language sql stable
set search_path = ''
as $$
  select z.id
  from public.zones z
  where public.distance_m(p_lat, p_lng, z.centre_lat, z.centre_lng) <= z.rayon_m
  order by z.est_zone_risque desc, public.distance_m(p_lat, p_lng, z.centre_lat, z.centre_lng)
  limit 1;
$$;

-- Transitions de statut autorisées par rôle.
create function public.transition_autorisee(p_de public.statut_signalement,
                                            p_vers public.statut_signalement,
                                            p_role public.role_utilisateur,
                                            p_est_agent boolean)
returns boolean
language sql immutable
set search_path = ''
as $$
  select case
    when p_role in ('responsable', 'admin') then
      (p_de::text || '>' || p_vers::text) = any (array[
        'nouveau>a_verifier', 'nouveau>rejete', 'nouveau>doublon',
        'a_verifier>valide', 'a_verifier>rejete', 'a_verifier>doublon',
        'valide>affecte', 'valide>rejete', 'valide>doublon',
        'affecte>en_cours',
        'en_cours>resolu', 'en_cours>affecte',          -- réaffectation
        'resolu>cloture', 'resolu>en_cours',            -- clôture ou réouverture
        'rejete>a_verifier', 'doublon>a_verifier'       -- correction d'une erreur
      ])
    when p_role = 'agent' and p_est_agent then
      (p_de::text || '>' || p_vers::text) = any (array['affecte>en_cours', 'en_cours>resolu'])
    else false
  end;
$$;


-- -----------------------------------------------------------------------------
-- 5. Triggers
-- -----------------------------------------------------------------------------

-- 5.1 Profil créé à l'inscription, toujours avec le rôle citoyen
--     (le rôle n'est jamais lu depuis les métadonnées envoyées par le client).
create function public.creer_profil_utilisateur()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profils (id, nom_complet, telephone)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nom_complet'), ''), split_part(new.email, '@', 1), ''),
    nullif(trim(new.raw_user_meta_data ->> 'telephone'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.creer_profil_utilisateur();

-- Comptes créés avant cette migration : profil citoyen.
insert into public.profils (id, nom_complet)
select u.id, coalesce(nullif(trim(u.raw_user_meta_data ->> 'nom_complet'), ''), split_part(u.email, '@', 1), '')
from auth.users u
on conflict (id) do nothing;

-- 5.2 Profils : seul l'admin change rôle, statut du compte et commune.
create function public.profils_avant_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and public.role_courant() is distinct from 'admin' then
    if new.id <> old.id
       or new.role is distinct from old.role
       or new.actif is distinct from old.actif
       or new.commune_id is distinct from old.commune_id then
      raise exception 'Seul un administrateur peut modifier le rôle, la commune ou l''état du compte'
        using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profils_avant_update
  before update on public.profils
  for each row execute function public.profils_avant_update();

-- 5.3 Signalements — création : on ne garde que les champs saisis par l'auteur.
create function public.signalements_avant_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.auteur_id               := auth.uid();
    new.statut                  := 'nouveau';
    new.zone_id                 := null;
    new.justification           := null;
    new.doublon_de              := null;
    new.score_priorite          := null;
    new.priorite_suggeree       := null;
    new.detail_score            := null;
    new.priorite_validee        := null;
    new.priorite_validee_par    := null;
    new.priorite_validee_le     := null;
    new.nb_soutiens             := 0;
    new.resolution_confirmee    := null;
    new.resolution_confirmee_le := null;
    new.resolu_le               := null;
    new.cloture_le              := null;
    new.created_at              := now();
    new.updated_at              := now();
  end if;

  new.zone_id := coalesce(new.zone_id, public.zone_du_point(new.latitude, new.longitude));
  if new.zone_id is not null then
    select z.commune_id into new.commune_id from public.zones z where z.id = new.zone_id;
  end if;
  return new;
end;
$$;

create trigger signalements_avant_insert
  before insert on public.signalements
  for each row execute function public.signalements_avant_insert();

-- 5.4 Signalements — modification : transitions par rôle + colonnes modifiables par rôle.
--   citoyen (auteur) : titre/description/catégorie/position tant que « nouveau » ;
--                      confirmation de résolution une fois « resolu » ou « cloture ».
--   agent affecté    : statut uniquement (affecte → en_cours → resolu).
--   responsable/admin: tout, dans le respect des transitions.
create function public.signalements_avant_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_role        public.role_utilisateur;
  v_est_agent   boolean;
  v_modifiables text[] := array['updated_at'];
begin
  if v_uid is not null and coalesce(current_setting('civisense.maj_interne', true), '') <> 'on' then
    v_role := public.role_courant();
    if v_role is null then
      raise exception 'Profil introuvable ou désactivé' using errcode = '42501';
    end if;
    v_est_agent := public.est_agent_de(old.id);

    if new.statut is distinct from old.statut then
      if not public.transition_autorisee(old.statut, new.statut, v_role, v_est_agent) then
        raise exception 'Transition % → % non autorisée pour le rôle %', old.statut, new.statut, v_role
          using errcode = '42501';
      end if;
      if new.statut = 'affecte' and not exists (
        select 1 from public.interventions i where i.signalement_id = old.id and i.active
      ) then
        raise exception 'Affectez d''abord un agent (table interventions)';
      end if;
    end if;

    if v_role not in ('responsable', 'admin') then
      if old.auteur_id = v_uid then
        if old.statut = 'nouveau' then
          v_modifiables := v_modifiables
            || array['titre', 'description', 'categorie', 'categorie_suggeree', 'latitude', 'longitude', 'adresse'];
        end if;
        if old.statut in ('resolu', 'cloture') then
          v_modifiables := v_modifiables || array['resolution_confirmee'];
        end if;
      end if;
      if v_role = 'agent' and v_est_agent then
        v_modifiables := v_modifiables || array['statut'];
      end if;
      if (to_jsonb(new) - v_modifiables) is distinct from (to_jsonb(old) - v_modifiables) then
        raise exception 'Modification non autorisée pour le rôle %', v_role using errcode = '42501';
      end if;
    end if;
  end if;

  -- Champs dérivés
  if new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude then
    new.zone_id := public.zone_du_point(new.latitude, new.longitude);
    if new.zone_id is not null then
      select z.commune_id into new.commune_id from public.zones z where z.id = new.zone_id;
    end if;
  end if;

  if new.priorite_validee is distinct from old.priorite_validee and v_uid is not null then
    new.priorite_validee_par := v_uid;
    new.priorite_validee_le  := now();
  end if;

  if new.statut is distinct from old.statut then
    if new.statut = 'resolu' and new.resolu_le is not distinct from old.resolu_le then
      new.resolu_le := now();
    end if;
    if new.statut = 'cloture' and new.cloture_le is not distinct from old.cloture_le then
      new.cloture_le := now();
    end if;
    if old.statut = 'resolu' and new.statut = 'en_cours' then      -- réouverture
      new.resolu_le := null;
      new.resolution_confirmee := null;
      new.resolution_confirmee_le := null;
    end if;
  end if;

  if new.resolution_confirmee is distinct from old.resolution_confirmee and new.resolution_confirmee is not null then
    new.resolution_confirmee_le := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger signalements_avant_update
  before update on public.signalements
  for each row execute function public.signalements_avant_update();

-- 5.5 Historique : création, changement de statut, validation de priorité.
create function public.signalements_journaliser()
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
      jsonb_build_object('priorite_suggeree', new.priorite_suggeree, 'score', new.score_priorite),
      true
    );
  end if;
  return new;
end;
$$;

create trigger signalements_journaliser
  after insert or update on public.signalements
  for each row execute function public.signalements_journaliser();

-- 5.6 Interventions — affectation : agent actif, signalement validé, ancienne intervention désactivée.
create function public.interventions_avant_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_statut public.statut_signalement;
begin
  if auth.uid() is not null then
    if not exists (select 1 from public.profils p where p.id = new.agent_id and p.role = 'agent' and p.actif) then
      raise exception 'La personne affectée doit être un agent actif';
    end if;

    select s.statut into v_statut from public.signalements s where s.id = new.signalement_id;
    if v_statut not in ('valide', 'affecte', 'en_cours') then
      raise exception 'Le signalement doit être validé avant affectation (statut actuel : %)', v_statut;
    end if;

    new.affecte_par      := auth.uid();
    new.date_affectation := now();
    new.active           := true;
  end if;

  if new.active then
    update public.interventions
       set active = false, date_fin = coalesce(date_fin, now())
     where signalement_id = new.signalement_id and active;
  end if;
  return new;
end;
$$;

create trigger interventions_avant_insert
  before insert on public.interventions
  for each row execute function public.interventions_avant_insert();

create function public.interventions_apres_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ancien  text;
  v_nouveau text;
begin
  select p.nom_complet into v_nouveau from public.profils p where p.id = new.agent_id;
  select p.nom_complet into v_ancien
    from public.interventions i join public.profils p on p.id = i.agent_id
   where i.signalement_id = new.signalement_id and i.id <> new.id
   order by i.date_affectation desc
   limit 1;

  insert into public.historique (signalement_id, auteur_id, action, ancienne_valeur, nouvelle_valeur, details, created_at)
  values (
    new.signalement_id, new.affecte_par, 'affectation', v_ancien, v_nouveau,
    jsonb_build_object('agent_id', new.agent_id, 'intervention_id', new.id),
    new.date_affectation
  );

  -- Via l'application, l'affectation fait passer le signalement à « affecte ».
  if auth.uid() is not null then
    update public.signalements set statut = 'affecte'
     where id = new.signalement_id and statut <> 'affecte';
  end if;
  return new;
end;
$$;

create trigger interventions_apres_insert
  after insert on public.interventions
  for each row execute function public.interventions_apres_insert();

-- L'agent ne peut renseigner que les actions réalisées et la date de fin.
create function public.interventions_avant_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.est_gestionnaire() then
    if (to_jsonb(new) - array['actions_realisees', 'date_fin'])
       is distinct from (to_jsonb(old) - array['actions_realisees', 'date_fin']) then
      raise exception 'Un agent ne peut modifier que les actions réalisées et la date de fin'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger interventions_avant_update
  before update on public.interventions
  for each row execute function public.interventions_avant_update();

-- 5.7 Commentaires : auteur forcé, pas de commentaire interne pour un citoyen, journalisation.
create function public.commentaires_avant_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.auteur_id  := auth.uid();
    new.created_at := now();
    if public.role_courant() = 'citoyen' then
      new.interne := false;
    end if;
  end if;
  return new;
end;
$$;

create trigger commentaires_avant_insert
  before insert on public.commentaires
  for each row execute function public.commentaires_avant_insert();

create function public.commentaires_journaliser()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.historique (signalement_id, auteur_id, action, nouvelle_valeur, details, interne, created_at)
  values (
    new.signalement_id, new.auteur_id, 'commentaire', left(new.contenu, 280),
    jsonb_build_object('commentaire_id', new.id), new.interne, new.created_at
  );
  return new;
end;
$$;

create trigger commentaires_journaliser
  after insert on public.commentaires
  for each row execute function public.commentaires_journaliser();

-- 5.8 Soutiens « Moi aussi » : contrôles + compteur nb_soutiens.
create function public.soutiens_avant_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_auteur uuid;
  v_statut public.statut_signalement;
begin
  select s.auteur_id, s.statut into v_auteur, v_statut
    from public.signalements s where s.id = new.signalement_id;
  if not found then
    raise exception 'Signalement introuvable';
  end if;
  if v_auteur = new.citoyen_id then
    raise exception 'Vous ne pouvez pas soutenir votre propre signalement';
  end if;
  if v_statut in ('resolu', 'cloture', 'rejete', 'doublon') then
    raise exception 'Ce signalement n''accepte plus de soutiens (statut : %)', v_statut;
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger soutiens_avant_insert
  before insert on public.soutiens
  for each row execute function public.soutiens_avant_insert();

create function public.soutiens_compter()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if tg_op = 'DELETE' then
    v_id := old.signalement_id;
  else
    v_id := new.signalement_id;
  end if;

  perform set_config('civisense.maj_interne', 'on', true);
  update public.signalements
     set nb_soutiens = (select count(*) from public.soutiens so where so.signalement_id = v_id)
   where id = v_id;
  perform set_config('civisense.maj_interne', '', true);
  return null;
end;
$$;

create trigger soutiens_compter
  after insert or delete on public.soutiens
  for each row execute function public.soutiens_compter();


-- -----------------------------------------------------------------------------
-- 6. Carte publique : position arrondie (~100 m), sans auteur ni description.
--    Vue exécutée avec les droits de son propriétaire (contourne la RLS
--    volontairement) : seules les colonnes listées ici sont exposées.
-- -----------------------------------------------------------------------------

create view public.signalements_publics as
select
  s.id,
  s.titre,
  s.categorie,
  s.statut,
  coalesce(s.priorite_validee, s.priorite_suggeree) as priorite,
  s.nb_soutiens,
  round(s.latitude::numeric, 3)::double precision  as latitude,
  round(s.longitude::numeric, 3)::double precision as longitude,
  s.zone_id,
  s.commune_id,
  s.created_at,
  s.resolu_le
from public.signalements s
where s.statut not in ('rejete', 'doublon');


-- -----------------------------------------------------------------------------
-- 7. Droits et Row Level Security
-- -----------------------------------------------------------------------------

alter table public.communes        enable row level security;
alter table public.zones           enable row level security;
alter table public.profils         enable row level security;
alter table public.signalements    enable row level security;
alter table public.pieces_jointes  enable row level security;
alter table public.interventions   enable row level security;
alter table public.commentaires    enable row level security;
alter table public.historique      enable row level security;
alter table public.soutiens        enable row level security;

-- On repart de zéro sur les droits (TRUNCATE n'est pas couvert par la RLS).
revoke all on public.communes, public.zones, public.profils, public.signalements, public.pieces_jointes,
              public.interventions, public.commentaires, public.historique, public.soutiens,
              public.signalements_publics
  from anon, authenticated;

grant select on public.communes, public.zones, public.signalements_publics to anon, authenticated;
grant insert, update, delete on public.communes, public.zones to authenticated;
grant select, insert, update, delete on public.profils, public.signalements, public.pieces_jointes,
                                        public.interventions, public.commentaires, public.soutiens
  to authenticated;
grant select on public.historique to authenticated;

-- Communes et zones : lecture publique, écriture admin.
create policy "communes : lecture publique" on public.communes
  for select to anon, authenticated using (true);
create policy "communes : gestion admin" on public.communes
  for all to authenticated
  using (public.role_courant() = 'admin') with check (public.role_courant() = 'admin');

create policy "zones : lecture publique" on public.zones
  for select to anon, authenticated using (true);
create policy "zones : gestion admin" on public.zones
  for all to authenticated
  using (public.role_courant() = 'admin') with check (public.role_courant() = 'admin');

-- Profils : soi-même, le personnel municipal (noms affichés dans le suivi), tout pour les gestionnaires.
create policy "profils : lecture" on public.profils
  for select to authenticated
  using (id = (select auth.uid()) or role <> 'citoyen' or public.est_gestionnaire());
create policy "profils : modification" on public.profils
  for update to authenticated
  using (id = (select auth.uid()) or public.role_courant() = 'admin')
  with check (id = (select auth.uid()) or public.role_courant() = 'admin');

-- Signalements : citoyen = les siens ; agent = ceux de ses interventions actives ; gestionnaires = tout.
create policy "signalements : lecture" on public.signalements
  for select to authenticated
  using (auteur_id = (select auth.uid()) or public.est_gestionnaire() or public.est_agent_de(id));
create policy "signalements : création" on public.signalements
  for insert to authenticated
  with check (auteur_id = (select auth.uid()) and public.role_courant() is not null);
create policy "signalements : modification" on public.signalements
  for update to authenticated
  using (auteur_id = (select auth.uid()) or public.est_gestionnaire() or public.est_agent_de(id))
  with check (auteur_id = (select auth.uid()) or public.est_gestionnaire() or public.est_agent_de(id));
create policy "signalements : suppression admin" on public.signalements
  for delete to authenticated using (public.role_courant() = 'admin');

-- Pièces jointes : visibles si le signalement l'est ; « avant » par l'auteur, « après » par l'agent.
create policy "pieces_jointes : lecture" on public.pieces_jointes
  for select to authenticated
  using (exists (select 1 from public.signalements s where s.id = signalement_id));
create policy "pieces_jointes : ajout" on public.pieces_jointes
  for insert to authenticated
  with check (
    auteur_id = (select auth.uid())
    and (
      public.est_gestionnaire()
      or (type = 'avant' and exists (
            select 1 from public.signalements s
            where s.id = signalement_id and s.auteur_id = (select auth.uid())))
      or (type = 'apres' and public.est_agent_de(signalement_id))
    )
  );
create policy "pieces_jointes : suppression" on public.pieces_jointes
  for delete to authenticated using (public.est_gestionnaire());

-- Interventions : l'agent voit et complète les siennes ; les gestionnaires affectent.
create policy "interventions : lecture" on public.interventions
  for select to authenticated
  using (agent_id = (select auth.uid()) or public.est_gestionnaire());
create policy "interventions : affectation" on public.interventions
  for insert to authenticated with check (public.est_gestionnaire());
create policy "interventions : mise à jour" on public.interventions
  for update to authenticated
  using ((agent_id = (select auth.uid()) and active) or public.est_gestionnaire())
  with check (agent_id = (select auth.uid()) or public.est_gestionnaire());

-- Commentaires : sur un signalement visible ; les internes sont réservés au personnel.
create policy "commentaires : lecture" on public.commentaires
  for select to authenticated
  using (
    exists (select 1 from public.signalements s where s.id = signalement_id)
    and (not interne or public.role_courant() <> 'citoyen')
  );
create policy "commentaires : ajout" on public.commentaires
  for insert to authenticated
  with check (
    auteur_id = (select auth.uid())
    and exists (select 1 from public.signalements s where s.id = signalement_id)
  );

-- Historique : lecture seule, mêmes règles de visibilité.
create policy "historique : lecture" on public.historique
  for select to authenticated
  using (
    exists (select 1 from public.signalements s where s.id = signalement_id)
    and (not interne or public.role_courant() <> 'citoyen')
  );

-- Soutiens : chacun gère les siens.
create policy "soutiens : lecture" on public.soutiens
  for select to authenticated
  using (citoyen_id = (select auth.uid()) or public.est_gestionnaire());
create policy "soutiens : ajout" on public.soutiens
  for insert to authenticated with check (citoyen_id = (select auth.uid()));
create policy "soutiens : retrait" on public.soutiens
  for delete to authenticated using (citoyen_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- 8. Storage : bucket privé « photos » (jpg/png/webp, 5 Mo max)
--    Chemin : {signalement_id}/{avant|apres}/{fichier}. Lecture via URL signée.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "photos : lecture si signalement visible" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and exists (select 1 from public.signalements s where s.id::text = (storage.foldername(name))[1])
  );

create policy "photos : avant par l'auteur, après par l'agent" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and exists (
      select 1 from public.signalements s
      where s.id::text = (storage.foldername(name))[1]
        and (
          public.est_gestionnaire()
          or ((storage.foldername(name))[2] = 'avant' and s.auteur_id = (select auth.uid()))
          or ((storage.foldername(name))[2] = 'apres' and public.est_agent_de(s.id))
        )
    )
  );

create policy "photos : suppression par les gestionnaires" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.est_gestionnaire());
