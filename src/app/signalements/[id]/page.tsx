import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { BadgeDoublon } from '@/components/BadgeDoublon';
import { BadgeStatut } from '@/components/BadgeStatut';
import { CarteSignalements } from '@/components/carte';
import { ExplicationPriorite, type DetailPriorite } from '@/components/ExplicationPriorite';
import { Alerte } from '@/components/formulaire';
import { Icone } from '@/components/Icone';
import { IconeCategorie, LibelleCategorie } from '@/components/IconeCategorie';
import { SqueletteBloc } from '@/components/Squelette';
import { exigerUtilisateur } from '@/lib/auth';
import { LIBELLES_ROLE, STATUTS, estGestionnaire, type Categorie, type Role, type Statut } from '@/lib/domaine';
import { NIVEAUX, type Niveau } from '@/lib/filtres';
import { date, dateHeure } from '@/lib/format';
import { creerClientServeur } from '@/lib/supabase/server';
import { ConfirmationCitoyen } from './ConfirmationCitoyen';
import { FormulaireCommentaire } from './FormulaireCommentaire';
import { PanneauAgent } from './PanneauAgent';
import { PanneauGestion, type Agent, type Candidat } from './PanneauGestion';
import { ValidationPriorite } from './ValidationPriorite';

export const metadata: Metadata = { title: 'Signalement' };

type Auteur = { nom_complet: string; role: Role } | null;
type Evenement = {
  id: number; action: 'creation' | 'statut' | 'affectation' | 'commentaire' | 'priorite';
  ancienne_valeur: string | null; nouvelle_valeur: string | null;
  details: { justification?: string } | null; created_at: string; auteur: Auteur;
};
type Commentaire = { id: string; contenu: string; interne: boolean; created_at: string; auteur: Auteur };
type Signalement = {
  id: string; auteur_id: string; titre: string; description: string; categorie: Categorie; statut: Statut;
  adresse: string | null; latitude: number; longitude: number; justification: string | null; doublon_de: string | null;
  created_at: string; nb_soutiens: number; zone: { nom: string } | null;
  score_priorite: number | null; priorite_suggeree: Niveau | null; priorite_validee: Niveau | null;
  detail_score: DetailPriorite;
  resolution_confirmee: boolean | null;
};
type Intervention = {
  agent_id: string; date_affectation: string; actions_realisees: string | null;
  difficulte: string | null; difficulte_le: string | null; agent: { nom_complet: string } | null;
};
type Piece = {
  id: string; type: 'avant' | 'apres'; chemin: string; pris_le: string | null; latitude: number | null;
  distance_m: number | null; precision_m: number | null; created_at: string;
};

const DISTANCE_MAX_PREUVE = 100;   // au-delà : avertissement au responsable (sans blocage)

// Horodatage et position de la photo « après » (preuve de présence sur place).
function MetaPreuve({ p }: { p: Piece }) {
  const loin = p.distance_m !== null && p.distance_m > DISTANCE_MAX_PREUVE;
  return (
    <div className="space-y-1 text-xs">
      <p className="text-slate-600">Photo du {dateHeure(p.pris_le ?? p.created_at)} · envoyée le {dateHeure(p.created_at)}</p>
      {p.distance_m === null ? (
        <p className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-800">⚠ Position GPS non transmise</p>
      ) : loin ? (
        <p className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-800">
          ⚠ Prise à {p.distance_m} m du signalement (plus de {DISTANCE_MAX_PREUVE} m)
        </p>
      ) : (
        <p className="font-medium text-emerald-700">✓ Prise à {p.distance_m} m du signalement{p.precision_m !== null && ` (± ${p.precision_m} m)`}</p>
      )}
    </div>
  );
}

const libelleStatut = (valeur: string | null) => (valeur && valeur in STATUTS ? STATUTS[valeur as Statut].libelle : valeur);

function decrire(e: Evenement): string {
  switch (e.action) {
    case 'creation': return 'Signalement envoyé';
    case 'statut': return `Statut : ${libelleStatut(e.ancienne_valeur)} → ${libelleStatut(e.nouvelle_valeur)}`;
    case 'affectation':
      return e.ancienne_valeur ? `Réaffecté à ${e.nouvelle_valeur} (au lieu de ${e.ancienne_valeur})` : `Affecté à ${e.nouvelle_valeur}`;
    case 'commentaire': return 'Commentaire ajouté';
    case 'priorite': {
      const libelle = (v: string | null) => (v && v in NIVEAUX ? NIVEAUX[v as Niveau].libelle : v);
      return e.ancienne_valeur && e.ancienne_valeur !== e.nouvelle_valeur
        ? `Priorité validée : ${libelle(e.nouvelle_valeur)} (au lieu de ${libelle(e.ancienne_valeur)})`
        : `Priorité validée : ${libelle(e.nouvelle_valeur)}`;
    }
  }
}

// Nom affiché : les autres citoyens restent anonymes (la RLS ne renvoie pas leur profil).
const nomAuteur = (a: Auteur) => (a ? `${a.nom_complet} · ${LIBELLES_ROLE[a.role]}` : 'Citoyen');

const RETOUR: Record<Role, { href: string; libelle: string }> = {
  citoyen: { href: '/signalements', libelle: 'Mes signalements' },
  agent: { href: '/interventions', libelle: 'Mes interventions' },
  responsable: { href: '/tableau-de-bord', libelle: 'Tableau de bord' },
  admin: { href: '/tableau-de-bord', libelle: 'Tableau de bord' },
};

// Bloc réservé aux responsables / admins : auteur, priorité expliquée, intervention, actions.
async function BlocGestion({ s, i, preuve }: { s: Signalement; i: Intervention | null; preuve: Piece | null }) {
  const supabase = await creerClientServeur();
  const besoinAgents = ['valide', 'affecte', 'en_cours'].includes(s.statut);
  const besoinCandidats = ['nouveau', 'a_verifier', 'valide'].includes(s.statut);
  const [auteur, agents, candidats, origine] = await Promise.all([
    supabase.from('profils').select('nom_complet').eq('id', s.auteur_id).maybeSingle(),
    besoinAgents ? supabase.rpc('charge_agents') : Promise.resolve({ data: [] as Agent[] }),
    besoinCandidats
      ? supabase.rpc('candidats_doublon', { p_signalement: s.id })
      : Promise.resolve({ data: [] as Candidat[] }),
    s.doublon_de ? supabase.from('signalements').select('id, titre').eq('id', s.doublon_de).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const enIntervention = s.statut === 'affecte' || s.statut === 'en_cours';
  const listeCandidats = (candidats.data as Candidat[] | null) ?? [];
  const doublonsSuggeres = listeCandidats.filter((c) => c.suggere);
  const prioriteModifiable = !['cloture', 'rejete', 'doublon'].includes(s.statut);

  return (
    <section className="space-y-4 rounded-xl bg-white p-4 ring-1 ring-marque-100">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Gestion</h2>
        <span className="text-xs text-slate-500">Réservé aux responsables</span>
      </div>

      {doublonsSuggeres.length > 0 && (
        <div className="space-y-1.5 rounded-lg bg-violet-50 p-3 text-sm text-violet-900 ring-1 ring-violet-200">
          <p className="font-semibold">
            <BadgeDoublon /> {doublonsSuggeres.length} signalement{doublonsSuggeres.length > 1 ? 's' : ''} similaire{doublonsSuggeres.length > 1 ? 's' : ''} (même catégorie, moins de 50 m, moins de 72 h d&apos;écart)
          </p>
          <ul className="space-y-0.5">
            {doublonsSuggeres.map((c) => (
              <li key={c.id}>
                <Link href={`/signalements/${c.id}`} className="font-medium underline">{c.titre}</Link>
                <span className="text-violet-700"> · {c.distance_m} m · texte similaire à {Math.round(c.similarite * 100)} %</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-violet-700">Suggestion uniquement : rien n&apos;est fusionné ni supprimé sans votre décision (« Marquer doublon de… »).</p>
        </div>
      )}

      {enIntervention && i?.difficulte && (
        <Alerte>
          Difficulté signalée par {i.agent?.nom_complet ?? 'l\'agent'}
          {i.difficulte_le && ` le ${dateHeure(i.difficulte_le)}`} : {i.difficulte}. Envisagez une réaffectation.
        </Alerte>
      )}
      {s.statut === 'resolu' && (
        <Alerte type={preuve && preuve.distance_m !== null && preuve.distance_m <= DISTANCE_MAX_PREUVE ? 'info' : 'erreur'}>
          {!preuve
            ? 'Aucune photo « après » : vérifiez avant de clôturer.'
            : preuve.distance_m === null
              ? 'Preuve sans position GPS : vérifiez la photo avant de clôturer.'
              : preuve.distance_m > DISTANCE_MAX_PREUVE
                ? `Attention : la photo « après » a été prise à ${preuve.distance_m} m du signalement.`
                : `Preuve cohérente : photo prise à ${preuve.distance_m} m du signalement. Comparez avant / après ci-dessous.`}
          {s.resolution_confirmee === true && ' Le citoyen a confirmé la résolution.'}
        </Alerte>
      )}

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Signalé par</dt>
          <dd className="font-medium">{auteur.data?.nom_complet ?? '—'}{s.nb_soutiens > 0 && ` · ${s.nb_soutiens} « Moi aussi »`}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Intervention</dt>
          <dd className="font-medium">
            {i ? `${i.agent?.nom_complet ?? 'Agent'} · depuis le ${date(i.date_affectation)}` : 'Aucun agent affecté'}
          </dd>
          {i?.actions_realisees && <dd className="text-slate-600">{i.actions_realisees}</dd>}
        </div>
        {origine.data && (
          <div className="sm:col-span-2">
            <dt className="text-slate-500">Doublon de</dt>
            <dd><Link href={`/signalements/${origine.data.id}`} className="font-medium text-marque-700 underline">{origine.data.titre}</Link></dd>
          </div>
        )}
      </dl>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Priorité</h3>
        <ExplicationPriorite detail={s.detail_score} suggeree={s.priorite_suggeree} validee={s.priorite_validee} />
        {prioriteModifiable && (
          <ValidationPriorite signalementId={s.id} suggeree={s.priorite_suggeree} validee={s.priorite_validee} />
        )}
      </div>

      <PanneauGestion
        signalementId={s.id}
        statut={s.statut}
        agents={(agents.data as Agent[] | null) ?? []}
        candidats={listeCandidats}
        agentActuelId={i?.agent_id ?? null}
      />
    </section>
  );
}

async function Detail({ params, searchParams }: Pick<PageProps<'/signalements/[id]'>, 'params' | 'searchParams'>) {
  const utilisateur = await exigerUtilisateur();
  const { id } = await params;
  const { cree, photo } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const gestion = estGestionnaire(utilisateur.role);

  const supabase = await creerClientServeur();
  const [signalement, pieces, historique, commentaires, intervention] = await Promise.all([
    supabase
      .from('signalements')
      .select('id, auteur_id, titre, description, categorie, statut, adresse, latitude, longitude, justification, doublon_de, created_at, nb_soutiens, score_priorite, priorite_suggeree, priorite_validee, detail_score, resolution_confirmee, zone:zones(nom)')
      .eq('id', id)
      .returns<Signalement[]>()
      .maybeSingle(),
    supabase
      .from('pieces_jointes')
      .select('id, type, chemin, pris_le, latitude, distance_m, precision_m, created_at')
      .eq('signalement_id', id)
      .order('created_at')
      .returns<Piece[]>(),
    supabase
      .from('historique')
      .select('id, action, ancienne_valeur, nouvelle_valeur, details, created_at, auteur:profils(nom_complet, role)')
      .eq('signalement_id', id)
      .neq('action', 'commentaire')
      .order('created_at', { ascending: false })
      .returns<Evenement[]>(),
    supabase
      .from('commentaires')
      .select('id, contenu, interne, created_at, auteur:profils(nom_complet, role)')
      .eq('signalement_id', id)
      .order('created_at')
      .returns<Commentaire[]>(),
    // Intervention active : lisible par l'agent affecté, l'auteur du signalement et les gestionnaires (RLS).
    supabase
      .from('interventions')
      .select('agent_id, date_affectation, actions_realisees, difficulte, difficulte_le, agent:profils!interventions_agent_id_fkey(nom_complet)')
      .eq('signalement_id', id)
      .eq('active', true)
      .returns<Intervention[]>()
      .maybeSingle(),
  ]);

  const s = signalement.data;
  if (!s) notFound();   // inexistant ou non visible pour ce rôle (RLS)
  const i = intervention.data;
  const estAgentAffecte = utilisateur.role === 'agent' && i?.agent_id === utilisateur.id;
  const voitPreuve = gestion || estAgentAffecte;

  // Photos privées : URL signées valables une heure. « Avant » puis « après », côte à côte.
  const photos = [...(pieces.data ?? [])].sort((a, b) => (a.type === b.type ? 0 : a.type === 'avant' ? -1 : 1));
  const { data: urls } = photos.length
    ? await supabase.storage.from('photos').createSignedUrls(photos.map((p) => p.chemin), 3600)
    : { data: [] };
  const photosAffichees = photos
    .map((p, n) => ({ ...p, url: urls?.[n]?.signedUrl }))
    .filter((p): p is typeof p & { url: string } => Boolean(p.url));
  const preuve = photos.filter((p) => p.type === 'apres').at(-1) ?? null;
  const retour = RETOUR[utilisateur.role];

  return (
    <article className="space-y-6">
      <Link href={retour.href} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <Icone nom="retour" taille={18} /> {retour.libelle}
      </Link>
      {cree && <Alerte type="succes">Signalement envoyé. Vous suivrez ici chaque étape de son traitement.</Alerte>}
      {photo === 'echec' && (
        <Alerte>Le signalement est bien enregistré, mais la photo n&apos;a pas pu être envoyée (connexion instable).</Alerte>
      )}

      <header className="space-y-3">
        <div className="flex items-start gap-3">
          <IconeCategorie categorie={s.categorie} taille={44} />
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="text-xl leading-snug font-bold tracking-tight sm:text-2xl">{s.titre}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <LibelleCategorie categorie={s.categorie} />
              <span className="text-sm text-slate-500">Signalé le {date(s.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <BadgeStatut statut={s.statut} />
          <p className="text-sm text-slate-700">{STATUTS[s.statut].aide}</p>
        </div>
        {s.justification && (s.statut === 'rejete' || s.statut === 'doublon') && (
          <Alerte type="info">Motif : {s.justification}</Alerte>
        )}
      </header>

      {photosAffichees.length > 0 && (
        <section className="grid grid-cols-2 gap-3">
          {photosAffichees.map((p) => (
            <figure key={p.id} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.type === 'avant' ? 'Photo du problème' : 'Photo après intervention'}
                className="aspect-[4/3] w-full rounded-xl object-cover ring-1 ring-slate-200" />
              <figcaption className="text-xs font-semibold text-slate-500 uppercase">
                {p.type === 'avant' ? 'Avant · signalement' : 'Après intervention'}
              </figcaption>
              {voitPreuve && p.type === 'apres' && <MetaPreuve p={p} />}
            </figure>
          ))}
        </section>
      )}

      {/* Citoyen : résultat de l'intervention et retour sur la résolution. */}
      {utilisateur.id === s.auteur_id && (s.statut === 'resolu' || s.statut === 'cloture') && (
        <>
          {i?.actions_realisees && (
            <Alerte type="succes">Travaux réalisés : {i.actions_realisees}</Alerte>
          )}
          {s.statut === 'resolu' && s.resolution_confirmee === null && <ConfirmationCitoyen signalementId={s.id} />}
          {s.resolution_confirmee === true && (
            <p className="text-sm text-slate-600">Vous avez confirmé que le problème est réglé. Merci&nbsp;!</p>
          )}
        </>
      )}

      {gestion && (
        <Suspense fallback={<SqueletteBloc hauteur="h-48" />}>
          <BlocGestion s={s} i={i} preuve={preuve} />
        </Suspense>
      )}

      {estAgentAffecte && (
        <section className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-marque-100">
          <h2 className="font-semibold">Mon intervention</h2>
          <p className="text-sm text-slate-600">Affectée le {date(i.date_affectation)}</p>
          <ExplicationPriorite detail={s.detail_score} suggeree={s.priorite_suggeree} validee={s.priorite_validee} compact />
          {i.difficulte && (
            <Alerte type="info">Difficulté signalée{i.difficulte_le && ` le ${dateHeure(i.difficulte_le)}`} : {i.difficulte}</Alerte>
          )}
          <PanneauAgent signalementId={s.id} statut={s.statut} />
        </section>
      )}

      {s.description && <p className="whitespace-pre-line text-slate-800">{s.description}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">Localisation</h2>
        <p className="text-sm text-slate-600">
          {[s.adresse, s.zone?.nom].filter(Boolean).join(' · ') || 'Position indiquée sur la carte'}
        </p>
        <CarteSignalements
          hauteur="h-56"
          zoom={16}
          ajuster={false}
          points={[{
            id: s.id, lat: s.latitude, lng: s.longitude, titre: s.titre, categorie: s.categorie,
            statut: s.statut, lien: null, approximatif: false,
          }]}
        />
        {utilisateur.role !== 'citoyen' && (
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-marque-600 px-4 py-3 text-sm font-semibold text-white hover:bg-marque-700"
            >
              <Icone nom="carte" taille={18} /> Itinéraire
            </a>
            <a
              href={`https://www.openstreetmap.org/directions?to=${s.latitude}%2C${s.longitude}#map=17/${s.latitude}/${s.longitude}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Ouvrir dans OSM
            </a>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Suivi</h2>
        <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
          {(historique.data ?? []).map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute top-1.5 -left-[23px] size-3 rounded-full bg-marque-600 ring-4 ring-slate-50" />
              <p className="text-sm font-medium text-slate-900">{decrire(e)}</p>
              {e.details?.justification && <p className="text-sm text-slate-600">{e.details.justification}</p>}
              <p className="text-xs text-slate-500">
                {dateHeure(e.created_at)}{e.auteur && e.action !== 'creation' && ` · ${nomAuteur(e.auteur)}`}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Commentaires</h2>
        {(commentaires.data ?? []).length === 0 && <p className="text-sm text-slate-500">Aucun commentaire pour l&apos;instant.</p>}
        <ul className="space-y-2">
          {(commentaires.data ?? []).map((c) => (
            <li key={c.id} className={`rounded-xl p-3 ring-1 ${c.interne ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-slate-200'}`}>
              <p className="text-xs text-slate-500">
                {nomAuteur(c.auteur)} · {dateHeure(c.created_at)}{c.interne && ' · note interne'}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{c.contenu}</p>
            </li>
          ))}
        </ul>
        <FormulaireCommentaire
          signalementId={s.id}
          utilisateurId={utilisateur.id}
          noteInternePossible={utilisateur.role !== 'citoyen'}
        />
      </section>
    </article>
  );
}

export default function PageSignalement({ params, searchParams }: PageProps<'/signalements/[id]'>) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<SqueletteBloc hauteur="h-[70vh]" />}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
