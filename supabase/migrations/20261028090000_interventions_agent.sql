-- =============================================================================
-- CiviSense AI — Étape 6 : vue agent et preuve de résolution
--   * photo « après » horodatée et géolocalisée (distance au signalement calculée en base)
--   * passage à « resolu » impossible sans photo « après » ni actions réalisées
--   * signaler_difficulte() : agent affecté → note interne + notification des responsables
--   * contester_resolution() : auteur → réouverture + notification des responsables
--   * l'auteur d'un signalement peut lire l'intervention (actions réalisées)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Métadonnées de la preuve photo
-- -----------------------------------------------------------------------------

alter table public.pieces_jointes
  add column pris_le     timestamptz,                                         -- date de la photo (fichier)
  add column latitude    double precision check (latitude between -90 and 90),
  add column longitude   double precision check (longitude between -180 and 180),
  add column precision_m integer check (precision_m >= 0),
  add column distance_m  integer;                                             -- calculée, jamais fournie

create function public.pieces_jointes_avant_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.auteur_id  := auth.uid();
    new.created_at := now();
  end if;
  if new.pris_le > now() + interval '5 minutes' then
    new.pris_le := now();
  end if;

  new.distance_m := null;
  if new.latitude is not null and new.longitude is not null then
    select round(public.distance_m(s.latitude, s.longitude, new.latitude, new.longitude))::integer
      into new.distance_m
      from public.signalements s where s.id = new.signalement_id;
  end if;
  return new;
end;
$$;

create trigger pieces_jointes_avant_insert
  before insert on public.pieces_jointes
  for each row execute function public.pieces_jointes_avant_insert();


-- -----------------------------------------------------------------------------
-- 2. Preuve obligatoire pour passer à « resolu » (via l'application)
--    Photo « après » postérieure au dernier démarrage + actions réalisées renseignées.
-- -----------------------------------------------------------------------------

create function public.signalements_preuve_resolution()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_depart timestamptz;
begin
  if auth.uid() is null or new.statut <> 'resolu' or old.statut = 'resolu' then
    return new;
  end if;

  select max(h.created_at) into v_depart
    from public.historique h
   where h.signalement_id = new.id and h.action = 'statut' and h.nouvelle_valeur = 'en_cours';

  if not exists (
    select 1 from public.pieces_jointes pj
     where pj.signalement_id = new.id and pj.type = 'apres'
       and pj.created_at >= coalesce(v_depart, '-infinity'::timestamptz)
  ) then
    raise exception 'Preuve de résolution manquante : ajoutez une photo « après » de l''intervention.';
  end if;

  if not exists (
    select 1 from public.interventions i
     where i.signalement_id = new.id and i.active
       and char_length(trim(coalesce(i.actions_realisees, ''))) >= 5
  ) then
    raise exception 'Décrivez les actions réalisées avant de marquer le signalement comme résolu.';
  end if;
  return new;
end;
$$;

create trigger signalements_preuve_resolution
  before update on public.signalements
  for each row execute function public.signalements_preuve_resolution();


-- -----------------------------------------------------------------------------
-- 3. Difficulté signalée par l'agent
-- -----------------------------------------------------------------------------

alter table public.interventions
  add column difficulte    text,
  add column difficulte_le timestamptz;

-- La garde des interventions accepte désormais les mises à jour internes (fonctions ci-dessous).
create or replace function public.interventions_avant_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('civisense.maj_interne', true), '') <> 'on'
     and not public.est_gestionnaire() then
    if (to_jsonb(new) - array['actions_realisees', 'date_fin'])
       is distinct from (to_jsonb(old) - array['actions_realisees', 'date_fin']) then
      raise exception 'Un agent ne peut modifier que les actions réalisées et la date de fin'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create function public.signaler_difficulte(p_signalement uuid, p_motif text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_titre text;
  v_motif text := trim(coalesce(p_motif, ''));
begin
  if public.role_courant() is distinct from 'agent' or not public.est_agent_de(p_signalement) then
    raise exception 'Seul l''agent affecté peut signaler une difficulté sur cette intervention.' using errcode = '42501';
  end if;
  if char_length(v_motif) < 3 then
    raise exception 'Précisez le motif de la difficulté.';
  end if;

  select s.titre into v_titre
    from public.signalements s where s.id = p_signalement and s.statut in ('affecte', 'en_cours');
  if not found then
    raise exception 'Cette intervention n''est plus en cours.';
  end if;

  perform set_config('civisense.maj_interne', 'on', true);
  update public.interventions
     set difficulte = v_motif, difficulte_le = now()
   where signalement_id = p_signalement and active;
  perform set_config('civisense.maj_interne', '', true);

  -- Note interne (journalisée dans l'historique par trigger), puis notification des responsables.
  insert into public.commentaires (signalement_id, auteur_id, contenu, interne)
  values (p_signalement, auth.uid(), 'Difficulté signalée / demande de réaffectation : ' || v_motif, true);

  insert into public.notifications (destinataire_id, signalement_id, titre, message)
  select p.id, p_signalement, v_titre, 'Difficulté signalée par l''agent : ' || v_motif
    from public.profils p where p.role = 'responsable' and p.actif;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. Contestation de la résolution par l'auteur (« Pas résolu »)
-- -----------------------------------------------------------------------------

create function public.contester_resolution(p_signalement uuid, p_motif text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_auteur uuid;
  v_statut public.statut_signalement;
  v_titre  text;
  v_motif  text := trim(coalesce(p_motif, ''));
begin
  select s.auteur_id, s.statut, s.titre into v_auteur, v_statut, v_titre
    from public.signalements s where s.id = p_signalement;
  if not found or v_auteur is distinct from auth.uid() then
    raise exception 'Seul l''auteur du signalement peut contester sa résolution.' using errcode = '42501';
  end if;
  if v_statut <> 'resolu' then
    raise exception 'La résolution ne peut plus être contestée (statut actuel : %).', v_statut;
  end if;
  if char_length(v_motif) < 3 then
    raise exception 'Expliquez en quelques mots ce qui n''est pas résolu.';
  end if;

  -- Réouverture : seule transition autorisée au citoyen, et uniquement par cette fonction.
  -- L'historique l'attribue au citoyen ; l'agent est notifié par le trigger de l'historique.
  perform set_config('civisense.maj_interne', 'on', true);
  update public.signalements set statut = 'en_cours' where id = p_signalement;
  perform set_config('civisense.maj_interne', '', true);

  insert into public.commentaires (signalement_id, auteur_id, contenu)
  values (p_signalement, auth.uid(), 'Problème non résolu : ' || v_motif);

  insert into public.notifications (destinataire_id, signalement_id, titre, message)
  select p.id, p_signalement, v_titre, 'Le citoyen indique que le problème n''est pas résolu : ' || v_motif
    from public.profils p where p.role = 'responsable' and p.actif;
end;
$$;

revoke execute on function public.signaler_difficulte(uuid, text) from public, anon;
revoke execute on function public.contester_resolution(uuid, text) from public, anon;
grant execute on function public.signaler_difficulte(uuid, text) to authenticated;
grant execute on function public.contester_resolution(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. L'auteur voit l'intervention de son signalement (actions réalisées)
-- -----------------------------------------------------------------------------

create policy "interventions : lecture par l'auteur du signalement" on public.interventions
  for select to authenticated
  using (exists (
    select 1 from public.signalements s
    where s.id = signalement_id and s.auteur_id = (select auth.uid())
  ));


-- -----------------------------------------------------------------------------
-- 6. Notifications : les responsables sont prévenus quand une intervention est terminée
-- -----------------------------------------------------------------------------

create or replace function public.notifier_depuis_historique()
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
        values (v_agent, new.signalement_id, v_titre, 'Intervention rouverte : à reprendre.', new.created_at);
      end if;
    end if;

    if new.nouvelle_valeur = 'resolu' then
      insert into public.notifications (destinataire_id, signalement_id, titre, message, created_at)
      select p.id, new.signalement_id, v_titre, 'Intervention terminée : preuve à vérifier avant clôture.', new.created_at
        from public.profils p
       where p.role = 'responsable' and p.actif and p.id is distinct from v_acteur;
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
