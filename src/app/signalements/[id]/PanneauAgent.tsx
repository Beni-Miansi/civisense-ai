'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alerte, classeBoutonPrincipal, classeChamp } from '@/components/formulaire';
import { Icone } from '@/components/Icone';
import type { Statut } from '@/lib/domaine';
import { messageErreur } from '@/lib/format';
import { ErreurPhoto, compresserPhoto, extensionPhoto } from '@/lib/photo';
import { creerClientNavigateur } from '@/lib/supabase/client';

type PositionPhoto = { lat: number; lng: number; precision: number };
type Mode = null | 'resolution' | 'difficulte';

const idFichier = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function messageAction(erreur: { message?: string; code?: string }) {
  if (erreur.code === 'P0001' || erreur.code === '42501') return erreur.message ?? 'Action refusée.';
  return messageErreur(erreur, 'L\'action n\'a pas pu être enregistrée. Réessayez.');
}

// Actions de l'agent affecté. La base vérifie qu'il s'agit bien de son intervention,
// la transition autorisée et la présence de la preuve (photo « après » + actions).
export function PanneauAgent({ signalementId, statut }: { signalementId: string; statut: Statut }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [prisLe, setPrisLe] = useState<string | null>(null);
  const [position, setPosition] = useState<PositionPhoto | null>(null);
  const [etatGps, setEtatGps] = useState<string | null>(null);
  const [actions, setActions] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu); }, [apercu]);

  const supabase = creerClientNavigateur();

  async function demarrer() {
    setErreur(null);
    setEnCours(true);
    const { error } = await supabase.from('signalements').update({ statut: 'en_cours' }).eq('id', signalementId);
    setEnCours(false);
    if (error) return setErreur(messageAction(error));
    setSucces('Intervention démarrée. Le citoyen est informé.');
    router.refresh();
  }

  // Position au moment de la photo : preuve de présence sur place (sans bloquer si le GPS est indisponible).
  function localiserPhoto() {
    setPosition(null);
    if (!window.isSecureContext || !('geolocation' in navigator)) {
      setEtatGps('Position GPS indisponible ici (connexion non sécurisée) : la photo sera envoyée sans position.');
      return;
    }
    setEtatGps('Recherche de la position…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({ lat: coords.latitude, lng: coords.longitude, precision: Math.round(coords.accuracy) });
        setEtatGps(`Position enregistrée (± ${Math.round(coords.accuracy)} m).`);
      },
      () => setEtatGps('Position GPS indisponible : la photo sera envoyée sans position (le responsable en sera informé).'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function choisirPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    setErreur(null);
    try {
      const compressee = await compresserPhoto(fichier);
      setPhoto(compressee);
      setApercu(URL.createObjectURL(compressee));
      setPrisLe(new Date(fichier.lastModified || Date.now()).toISOString());
      localiserPhoto();
    } catch (err) {
      setErreur(err instanceof ErreurPhoto ? err.message : 'Impossible de préparer cette photo.');
    }
  }

  async function marquerResolu(e: React.FormEvent) {
    e.preventDefault();
    if (!photo) return setErreur('La photo « après » est obligatoire : elle prouve que le problème est réglé.');
    if (actions.trim().length < 5) return setErreur('Décrivez les actions réalisées (5 caractères minimum).');
    setErreur(null);
    setEnCours(true);

    const chemin = `${signalementId}/apres/${idFichier()}.${extensionPhoto(photo)}`;
    const envoi = await supabase.storage.from('photos').upload(chemin, photo, { contentType: photo.type });
    if (envoi.error) {
      setEnCours(false);
      return setErreur(messageErreur(envoi.error, 'La photo n\'a pas pu être envoyée. Réessayez.'));
    }
    const etapes = [
      () => supabase.from('pieces_jointes').insert({
        signalement_id: signalementId, type: 'apres', chemin, pris_le: prisLe,
        latitude: position?.lat ?? null, longitude: position?.lng ?? null, precision_m: position?.precision ?? null,
      }),
      () => supabase.from('interventions')
        .update({ actions_realisees: actions.trim(), date_fin: new Date().toISOString() })
        .eq('signalement_id', signalementId).eq('active', true),
      () => supabase.from('signalements').update({ statut: 'resolu' }).eq('id', signalementId),
    ];
    for (const etape of etapes) {
      const { error } = await etape();
      if (error) {
        setEnCours(false);
        return setErreur(messageAction(error));
      }
    }
    setEnCours(false);
    setMode(null);
    setSucces('Intervention marquée comme résolue. Le responsable va vérifier la preuve.');
    router.refresh();
  }

  async function signalerDifficulte(e: React.FormEvent) {
    e.preventDefault();
    if (motif.trim().length < 3) return setErreur('Précisez le motif de la difficulté.');
    setErreur(null);
    setEnCours(true);
    const { error } = await supabase.rpc('signaler_difficulte', { p_signalement: signalementId, p_motif: motif.trim() });
    setEnCours(false);
    if (error) return setErreur(messageAction(error));
    setMode(null);
    setMotif('');
    setSucces('Difficulté transmise au responsable.');
    router.refresh();
  }

  if (statut === 'resolu' || statut === 'cloture') {
    return <Alerte type="succes">Intervention terminée{statut === 'cloture' ? ' et clôturée par le responsable' : ' : en attente de clôture par le responsable'}.</Alerte>;
  }

  return (
    <div className="space-y-3">
      {succes && <Alerte type="succes">{succes}</Alerte>}
      {erreur && <Alerte>{erreur}</Alerte>}

      {mode === null && (
        <div className="grid gap-2 sm:grid-cols-2">
          {statut === 'affecte' && (
            <button type="button" disabled={enCours} onClick={demarrer} className={classeBoutonPrincipal}>
              {enCours ? 'Démarrage…' : 'Démarrer l\'intervention'}
            </button>
          )}
          {statut === 'en_cours' && (
            <button type="button" onClick={() => { setMode('resolution'); setSucces(null); }} className={classeBoutonPrincipal}>
              Marquer résolu
            </button>
          )}
          <button
            type="button" onClick={() => { setMode('difficulte'); setSucces(null); }}
            className="w-full rounded-xl bg-white px-5 py-3 font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            Signaler une difficulté
          </button>
        </div>
      )}

      {mode === 'resolution' && (
        <form onSubmit={marquerResolu} className="space-y-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <div className="space-y-2">
            <p className="text-sm font-semibold">Photo « après » (obligatoire)</p>
            {apercu ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={apercu} alt="Photo après intervention" className="size-24 rounded-xl object-cover ring-1 ring-slate-200" />
                <label className="cursor-pointer text-sm font-semibold text-marque-700 underline">
                  Reprendre la photo
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={choisirPhoto} />
                </label>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-6 font-semibold text-slate-700 hover:border-marque-500">
                <Icone nom="photo" />
                Prendre la photo sur place
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={choisirPhoto} />
              </label>
            )}
            {etatGps && <p className="text-sm text-slate-600">{etatGps}</p>}
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">Actions réalisées</span>
            <textarea
              rows={3} value={actions} onChange={(e) => setActions(e.target.value)} className={classeChamp}
              placeholder="Ex. : curage du caniveau sur 30 m, évacuation de 4 sacs de déchets"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="submit" disabled={enCours} className={classeBoutonPrincipal}>
              {enCours ? 'Envoi de la preuve…' : 'Confirmer la résolution'}
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-xl px-5 py-3 font-semibold text-slate-600 hover:bg-slate-100">
              Annuler
            </button>
          </div>
        </form>
      )}

      {mode === 'difficulte' && (
        <form onSubmit={signalerDifficulte} className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">Motif (matériel manquant, accès impossible, demande de réaffectation…)</span>
            <textarea rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} className={classeChamp} />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="submit" disabled={enCours} className={classeBoutonPrincipal}>
              {enCours ? 'Envoi…' : 'Prévenir le responsable'}
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-xl px-5 py-3 font-semibold text-slate-600 hover:bg-slate-100">
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
