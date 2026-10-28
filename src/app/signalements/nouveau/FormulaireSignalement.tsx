'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SelecteurPosition } from '@/components/carte';
import { Alerte, Champ, classeBoutonPrincipal, classeChamp } from '@/components/formulaire';
import { Icone } from '@/components/Icone';
import { IconeCategorie } from '@/components/IconeCategorie';
import { classerParMotsCles, type Suggestion } from '@/lib/classification';
import { CATEGORIES, ORDRE_CATEGORIES, type Categorie, type Position } from '@/lib/domaine';
import { messageErreur } from '@/lib/format';
import { ErreurPhoto, compresserPhoto, extensionPhoto } from '@/lib/photo';
import { creerClientNavigateur } from '@/lib/supabase/client';
import { DoublonsPossibles, type Doublon } from './DoublonsPossibles';

type Erreurs = Partial<Record<'categorie' | 'titre' | 'description' | 'position' | 'photo', string>>;

const MESSAGES_GPS: Record<number, string> = {
  1: 'Accès à votre position refusé. Autorisez la localisation dans votre navigateur, ou touchez la carte.',
  2: 'Position introuvable pour le moment. Touchez la carte pour placer le point.',
  3: 'La recherche de position a pris trop de temps. Réessayez ou touchez la carte.',
};

// Identifiant de fichier : crypto.randomUUID() n'existe pas hors https (test sur téléphone en réseau local).
const idFichier = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function FormulaireSignalement({ utilisateurId }: { utilisateurId: string }) {
  const router = useRouter();
  const [categorie, setCategorie] = useState<Categorie | null>(null);
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [adresse, setAdresse] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [recentrage, setRecentrage] = useState(0);
  const [gps, setGps] = useState<{ etat: 'repos' | 'recherche' } | { etat: 'erreur'; message: string } | { etat: 'ok'; precision: number }>({ etat: 'repos' });
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [preparationPhoto, setPreparationPhoto] = useState(false);
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [analyse, setAnalyse] = useState(false);
  const [doublons, setDoublons] = useState<Doublon[]>([]);
  const [verifie, setVerifie] = useState<string | null>(null);   // catégorie + position déjà vérifiées
  const [soutienEnCours, setSoutienEnCours] = useState<string | null>(null);
  const [soutenu, setSoutenu] = useState<string | null>(null);

  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu); }, [apercu]);

  // Suggestion de catégorie pendant la saisie (IA côté serveur, sinon mots-clés). Le citoyen garde le choix.
  useEffect(() => {
    const texte = `${titre}\n${description}`.trim();
    const controleur = new AbortController();
    const minuteur = setTimeout(async () => {
      if (texte.length < 8) return setSuggestion(null);
      setAnalyse(true);
      const delai = setTimeout(() => controleur.abort(), 5000);
      try {
        const reponse = await fetch('/api/classification', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texte }), signal: controleur.signal,
        });
        if (!reponse.ok) throw new Error(String(reponse.status));
        setSuggestion(((await reponse.json()) as { suggestion: Suggestion | null }).suggestion);
      } catch {
        // Hors ligne ou serveur indisponible : même repli par mots-clés, dans le navigateur.
        setSuggestion(classerParMotsCles(texte));
      } finally {
        clearTimeout(delai);
        setAnalyse(false);
      }
    }, 900);
    return () => { clearTimeout(minuteur); controleur.abort(); };
  }, [titre, description]);

  function localiser() {
    if (!window.isSecureContext) {
      setGps({ etat: 'erreur', message: 'La position GPS demande une connexion sécurisée (https). Touchez la carte pour placer le point.' });
      return;
    }
    if (!('geolocation' in navigator)) {
      setGps({ etat: 'erreur', message: 'La géolocalisation n\'est pas disponible sur cet appareil. Touchez la carte.' });
      return;
    }
    setGps({ etat: 'recherche' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({ lat: coords.latitude, lng: coords.longitude });
        setRecentrage((n) => n + 1);
        setGps({ etat: 'ok', precision: Math.round(coords.accuracy) });
        setErreurs((e) => ({ ...e, position: undefined }));
      },
      (erreur) => setGps({ etat: 'erreur', message: MESSAGES_GPS[erreur.code] ?? MESSAGES_GPS[2] }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  function choisirSurCarte(p: Position) {
    setPosition(p);
    setGps({ etat: 'repos' });
    setErreurs((e) => ({ ...e, position: undefined }));
  }

  async function choisirPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    setErreurs((er) => ({ ...er, photo: undefined }));
    setPreparationPhoto(true);
    try {
      const compressee = await compresserPhoto(fichier);
      setPhoto(compressee);
      setApercu(URL.createObjectURL(compressee));
    } catch (erreur) {
      setErreurs((er) => ({
        ...er,
        photo: erreur instanceof ErreurPhoto ? erreur.message : 'Impossible de préparer cette photo.',
      }));
    } finally {
      setPreparationPhoto(false);
    }
  }

  function retirerPhoto() {
    setPhoto(null);
    setApercu(null);
  }

  function valider(): Erreurs {
    const e: Erreurs = {};
    if (!categorie) e.categorie = 'Choisissez une catégorie.';
    if (titre.trim().length < 3) e.titre = 'Donnez un titre d\'au moins 3 caractères.';
    if (titre.trim().length > 120) e.titre = 'Le titre ne doit pas dépasser 120 caractères.';
    if (description.length > 2000) e.description = 'La description ne doit pas dépasser 2000 caractères.';
    if (!position) e.position = 'Indiquez la position : bouton « Ma position » ou touchez la carte.';
    return e;
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setErreurGenerale(null);
    const nouvellesErreurs = valider();
    setErreurs(nouvellesErreurs);
    if (Object.keys(nouvellesErreurs).length) {
      setErreurGenerale('Le formulaire contient des erreurs : corrigez les champs signalés en rouge.');
      return;
    }

    setEnvoi(true);
    const supabase = creerClientNavigateur();

    // Doublons possibles (même catégorie, < 50 m, < 72 h) : proposés une fois par catégorie + position.
    const signature = `${categorie}|${position!.lat}|${position!.lng}`;
    if (verifie !== signature) {
      setVerifie(signature);
      const { data: proches } = await supabase.rpc('doublons_possibles', {
        p_categorie: categorie, p_latitude: position!.lat, p_longitude: position!.lng,
        p_texte: `${titre} ${description}`.trim(),
      });
      if (proches?.length) {
        setDoublons(proches as Doublon[]);
        setEnvoi(false);
        return;
      }
    }
    setDoublons([]);

    // Le statut initial « nouveau » est imposé par la base (trigger), comme l'auteur.
    const { data, error } = await supabase
      .from('signalements')
      .insert({
        auteur_id: utilisateurId,
        categorie,
        categorie_suggeree: suggestion?.categorie ?? null,
        titre: titre.trim(),
        description: description.trim(),
        adresse: adresse.trim() || null,
        latitude: position!.lat,
        longitude: position!.lng,
      })
      .select('id')
      .single();

    if (error || !data) {
      setErreurGenerale(messageErreur(error, 'L\'enregistrement a échoué. Réessayez : votre saisie est conservée.'));
      setEnvoi(false);
      return;
    }

    let photoEnvoyee = true;
    if (photo) {
      const chemin = `${data.id}/avant/${idFichier()}.${extensionPhoto(photo)}`;
      const envoiPhoto = await supabase.storage.from('photos').upload(chemin, photo, { contentType: photo.type });
      const piece = envoiPhoto.error
        ? envoiPhoto
        : await supabase.from('pieces_jointes').insert({
            signalement_id: data.id, type: 'avant', chemin, auteur_id: utilisateurId,
          });
      photoEnvoyee = !piece.error;
    }

    router.push(`/signalements/${data.id}?cree=1${photoEnvoyee ? '' : '&photo=echec'}`);
    router.refresh();
  }

  async function soutenir(d: Doublon) {
    setErreurGenerale(null);
    setSoutienEnCours(d.id);
    const { error } = await creerClientNavigateur()
      .from('soutiens').insert({ signalement_id: d.id, citoyen_id: utilisateurId });
    setSoutienEnCours(null);
    if (error && error.code !== '23505') {   // 23505 : déjà soutenu
      return setErreurGenerale(messageErreur(error, 'Votre soutien n\'a pas pu être enregistré. Réessayez.'));
    }
    setSoutenu(d.titre);
  }

  if (soutenu) {
    return (
      <div className="space-y-4">
        <Alerte type="succes">
          Merci ! Votre soutien « Moi aussi » a été ajouté à « {soutenu} ». Plus un problème est soutenu, plus il remonte dans les priorités.
        </Alerte>
        <div className="flex flex-wrap gap-2">
          <Link href="/carte" className="rounded-xl bg-marque-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-marque-700">Voir la carte</Link>
          <Link href="/signalements" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">Mes signalements</Link>
        </div>
      </div>
    );
  }

  const confiance = suggestion ? Math.round(suggestion.confiance * 100) : 0;

  return (
    <form onSubmit={envoyer} noValidate className="space-y-6">
      {erreurGenerale && <Alerte>{erreurGenerale}</Alerte>}


      <Champ id="titre" libelle="Titre" erreur={erreurs.titre} aide="En quelques mots : « Caniveau bouché devant l'école »">
        <input
          id="titre" value={titre} maxLength={120} className={classeChamp}
          aria-invalid={Boolean(erreurs.titre)} aria-describedby={erreurs.titre ? 'titre-erreur' : undefined}
          onChange={(e) => setTitre(e.target.value)}
        />
      </Champ>

      <Champ id="description" libelle="Description (facultative)" erreur={erreurs.description}>
        <textarea
          id="description" value={description} rows={4} maxLength={2000} className={classeChamp}
          placeholder="Depuis quand ? Quel danger ? Qui est gêné ?"
          aria-invalid={Boolean(erreurs.description)}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Champ>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-800">Catégorie</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {ORDRE_CATEGORIES.map((c) => (
            <label
              key={c}
              className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl bg-white p-3 text-center ring-1 transition has-focus-visible:ring-2 ${
                categorie === c ? 'ring-2 ring-marque-600 bg-marque-50' : 'ring-slate-300 hover:ring-slate-400'
              }`}
            >
              <input
                type="radio" name="categorie" value={c} checked={categorie === c} className="sr-only"
                onChange={() => { setCategorie(c); setErreurs((er) => ({ ...er, categorie: undefined })); }}
              />
              <IconeCategorie categorie={c} taille={32} />
              <span className="text-sm font-semibold">{CATEGORIES[c].libelle}</span>
              <span className="text-xs leading-tight text-slate-500">{CATEGORIES[c].exemple}</span>
            </label>
          ))}
        </div>
        {suggestion ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-marque-50 px-3 py-2.5 text-sm ring-1 ring-marque-200">
            <span>Catégorie suggérée : <strong>{CATEGORIES[suggestion.categorie].libelle}</strong></span>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300">
              {suggestion.source === 'ia' ? '✨ IA' : 'Mots-clés'} · confiance {confiance} %
            </span>
            {categorie === suggestion.categorie ? (
              <span className="text-xs font-semibold text-emerald-700">✓ retenue</span>
            ) : (
              <button
                type="button" className="text-sm font-semibold text-marque-700 underline"
                onClick={() => { setCategorie(suggestion.categorie); setErreurs((er) => ({ ...er, categorie: undefined })); }}
              >
                Choisir cette catégorie
              </button>
            )}
            <p className="w-full text-xs text-slate-600">
              {suggestion.justification} Simple suggestion : c&apos;est vous qui choisissez.
            </p>
          </div>
        ) : analyse ? (
          <p className="text-sm text-slate-500">Analyse du texte pour suggérer une catégorie…</p>
        ) : (
          <p className="text-sm text-slate-500">Décrivez le problème : une catégorie vous sera suggérée.</p>
        )}
        {erreurs.categorie && <p className="text-sm text-red-700">{erreurs.categorie}</p>}
      </fieldset>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-800">Photo (facultative)</p>
        {apercu ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={apercu} alt="Aperçu de la photo" className="size-24 rounded-xl object-cover ring-1 ring-slate-200" />
            <div className="space-y-1 text-sm">
              <p className="text-slate-600">Photo prête ({Math.round((photo?.size ?? 0) / 1024)} Ko)</p>
              <button type="button" onClick={retirerPhoto} className="font-semibold text-red-700 underline">
                Retirer la photo
              </button>
            </div>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-5 font-semibold text-slate-700 hover:border-marque-500 has-focus-visible:border-marque-600">
            <Icone nom="photo" />
            {preparationPhoto ? 'Préparation de la photo…' : 'Prendre ou choisir une photo'}
            <input
              type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
              onChange={choisirPhoto} disabled={preparationPhoto}
            />
          </label>
        )}
        {erreurs.photo ? (
          <p className="text-sm text-red-700">{erreurs.photo}</p>
        ) : (
          <p className="text-sm text-slate-500">JPG, PNG ou WEBP. La photo est allégée avant l&apos;envoi.</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-800">Position</p>
          <button
            type="button" onClick={localiser} disabled={gps.etat === 'recherche'}
            className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-marque-700 ring-1 ring-marque-600 hover:bg-marque-50 disabled:opacity-60"
          >
            <Icone nom="cible" taille={18} />
            {gps.etat === 'recherche' ? 'Recherche…' : 'Ma position'}
          </button>
        </div>
        <SelecteurPosition position={position} onChange={choisirSurCarte} recentrage={recentrage} />
        {gps.etat === 'erreur' && <p className="text-sm text-red-700">{gps.message}</p>}
        {erreurs.position ? (
          <p className="text-sm text-red-700">{erreurs.position}</p>
        ) : position ? (
          <p className="text-sm text-slate-600">
            Point placé{gps.etat === 'ok' && ` (précision GPS ± ${gps.precision} m)`}. Vous pouvez le déplacer en le faisant glisser.
          </p>
        ) : (
          <p className="text-sm text-slate-500">Touchez la carte à l&apos;endroit du problème, ou utilisez « Ma position ».</p>
        )}
        <Champ id="adresse" libelle="Repère ou adresse (facultatif)">
          <input
            id="adresse" value={adresse} maxLength={200} className={classeChamp}
            placeholder="Ex. : devant la pharmacie, rue 11"
            onChange={(e) => setAdresse(e.target.value)}
          />
        </Champ>
      </div>

      {doublons.length > 0 ? (
        <DoublonsPossibles doublons={doublons} soutienEnCours={soutienEnCours} onSoutenir={soutenir} />
      ) : (
        <button type="submit" disabled={envoi || preparationPhoto} className={classeBoutonPrincipal}>
          {envoi ? 'Envoi en cours…' : 'Envoyer le signalement'}
        </button>
      )}
    </form>
  );
}
